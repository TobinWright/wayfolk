import { RowDataPacket } from "mysql2";
import { monitorEventLoopDelay } from "perf_hooks";
import { IBS } from "../../app";
import { S2C } from "../../constants/Routes";
import {
    Analytics, ANALYTICS_DAYS, AWAY_GAPS, BOUNCE_S, bucketOf, COHORT_WEEKS, GONE_AFTER_DAYS, ONLINE_SAMPLE_MS, ONLINE_SAMPLES,
    PLAYTIMES, SESSION_COUNTS, SESSION_LENGTHS, WINDOW_MARK,
} from "../../../../shared/Analytics";
import { STEPS } from "../../../../shared/Guide";
import { HeroData, JOBS, SKILL_NAMES } from "../../../../shared/Heroes";
import { HeroState, itemName, TASK_NAMES, TaskKind } from "../../../../shared/Tasks";
import { Player } from "../player/Player";
import { Tracker } from "./Tracker";
import { Log } from "../../utils/Log";

type Row = RowDataPacket & { [key: string]: any };

const DAY = 24 * 60 * 60 * 1000;
const TOP = 8;
const ASK_GAP = 2000;          // (one snapshot an editor every so often: they're a dozen queries)

// The admin's Analytics (shared/Analytics.ts): a snapshot of the game made
// when an editor asks (C2S.ANALYTICS_GET), from the database and what's in
// memory - those loaded are fresher than their rows. It also counts who's
// signed in every ONLINE_SAMPLE_MS, the last day of it, and the peak; what
// players do as they play is recorded by `track` (Tracker).
export class AnalyticsManager {

    public track = new Tracker();

    private started = Date.now();
    private day: number[] = new Array(ONLINE_SAMPLES).fill(-1);
    private peak = 0;
    private peakAt = Date.now();
    private asked = new Map<number, number>();
    private lag = monitorEventLoopDelay({ resolution: 20 });

    constructor() {
        setInterval(() => this.sample(), ONLINE_SAMPLE_MS);
        setTimeout(() => this.sample(), 60 * 1000);
        this.lag.enable();
    }

    public async init() {
        await this.track.init();
    }

    private sample() {
        this.day.shift();
        this.day.push(this.onlineNow());
    }

    private onlineNow() {
        const n = IBS.players?.online().length ?? 0;
        if (n > this.peak) {
            this.peak = n;
            this.peakAt = Date.now();
        }
        return n;
    }

    // C2S.ANALYTICS_GET (staff: counted in what's recorded as they play)
    public async send(player: Player, staff: boolean) {
        if (!player.canEdit()) return;
        const now = Date.now();
        if (now - (this.asked.get(player.id) ?? 0) < ASK_GAP) return;
        this.asked.set(player.id, now);
        try {
            player.send({ r: S2C.ANALYTICS, a: await this.build(staff) });
        } catch (error) {
            Log.error("Analytics error", error);
            player.send({ r: S2C.ANALYTICS_REFUSED, w: "Couldn't make the analytics" });
        }
    }

    private async query(sql: string, values: any[] = []): Promise<Row[]> {
        const conn = await IBS.db.getConnection();
        try {
            const [rows] = await conn.query<Row[]>(sql, values);
            return rows;
        } finally {
            conn.release();
        }
    }

    private async one(sql: string, values: any[] = []): Promise<Row> {
        return (await this.query(sql, values))[0] ?? ({} as Row);
    }

    public async build(staff = false): Promise<Analytics> {
        await this.track.freshen();
        const now = Date.now();
        const mem = process.memoryUsage();
        const since = await this.recordedSince();
        const [players, heroes, economy, social, time, cohorts, features, churn, feedback] = await Promise.all([
            this.players(now), this.heroes(), this.economy(now), this.social(now),
            this.time(now, since, staff), this.cohorts(now, since, staff), this.features(now, staff), this.churn(now, since, staff), this.feedback(now)]);
        const lag = Math.round(this.lag.percentile(99) / 1e6);
        this.lag.reset();
        return {
            at: now,
            staff,
            server: {
                up: now - this.started,
                heap: Math.round(mem.heapUsed / 1024 / 1024),
                lag,
                online: this.onlineNow(),
                loaded: IBS.players.all().length,
                peak: this.peak,
                peakAt: this.peakAt,
                day: [...this.day],
            },
            players, heroes, economy, social, time, cohorts, features, churn, feedback,
        };
    }

    private async feedback(now: number): Promise<Analytics["feedback"]> {
        const { l, n } = await IBS.feedback.open();
        const week = await this.one("SELECT COUNT(*) AS n FROM feedback WHERE at > ?", [new Date(now - 7 * DAY)]);
        return { open: n, week: Number(week.n ?? 0), recent: l };
    }

    // when sessions were first recorded (ms; 0: none yet)
    private async recordedSince() {
        const r = await this.one("SELECT MIN(started_at) AS m FROM play_session");
        return r.m ? new Date(r.m).getTime() : 0;
    }

    //#region === Play time ===

    // (staff left out unless asked for: `p` is the player)
    private who(staff: boolean) {
        return staff ? "" : "AND p.role = 0";
    }

    private async time(now: number, since: number, staff: boolean): Promise<Analytics["time"]> {
        const today = new Date(now);
        const ago = (days: number) => new Date(now - days * DAY);
        const n = (v: any) => Number(v ?? 0);
        const who = this.who(staff);
        const from = "play_session s JOIN player p ON p.id = s.player_id";

        // a day each (0: today), by when they signed in
        const dau = new Array(ANALYTICS_DAYS).fill(0), played = new Array(ANALYTICS_DAYS).fill(0), busy = new Array(ANALYTICS_DAYS).fill(0);
        for (const r of await this.query(`SELECT DATEDIFF(?, s.started_at) AS d, COUNT(DISTINCT s.player_id) AS n,
                SUM(TIMESTAMPDIFF(SECOND, s.started_at, s.ended_at)) AS t, SUM(s.busy_s) AS b
                FROM ${from} WHERE s.started_at > ? ${who} GROUP BY d`, [today, ago(ANALYTICS_DAYS + 1)])) {
            if (r.d < 0 || r.d >= ANALYTICS_DAYS) continue;
            const k = ANALYTICS_DAYS - 1 - r.d;
            dau[k] = n(r.n);
            played[k] = Math.round(n(r.t) / 360) / 10;
            busy[k] = Math.round(n(r.b) / 360) / 10;
        }
        const reach = await this.one(`SELECT COUNT(DISTINCT IF(s.ended_at > ?, s.player_id, NULL)) AS w, COUNT(DISTINCT s.player_id) AS m
            FROM ${from} WHERE s.ended_at > ? ${who}`, [ago(7), ago(30)]);

        // the last 7 days' sessions, one by one
        const rows = await this.query(`SELECT s.player_id, s.started_at, TIMESTAMPDIFF(SECOND, s.started_at, s.ended_at) AS dur,
                s.busy_s, s.idle_s, s.away_s, s.stalled_s
            FROM ${from} WHERE s.ended_at > ? ${who} LIMIT 200000`, [ago(7)]);
        const lengths = new Array(SESSION_LENGTHS.length).fill(0), gaps = new Array(AWAY_GAPS.length).fill(0);
        const byHour = new Array(24).fill(0);
        const durs: number[] = [], aways: number[] = [];
        const playerDays = new Map<string, number>();
        let busySum = 0, idleSum = 0, awaySum = 0, stalledSum = 0, stalledReturns = 0;
        for (const r of rows) {
            const dur = Math.max(0, n(r.dur)), start = new Date(r.started_at).getTime();
            durs.push(dur);
            lengths[bucketOf(dur, SESSION_LENGTHS)]++;
            busySum += n(r.busy_s);
            idleSum += n(r.idle_s);
            const day = `${r.player_id}|${Math.floor(start / DAY)}`;
            playerDays.set(day, (playerDays.get(day) ?? 0) + dur);
            if (r.away_s != null) {
                const away = n(r.away_s);
                aways.push(away);
                gaps[bucketOf(away, AWAY_GAPS)]++;
                awaySum += away;
                stalledSum += n(r.stalled_s);
                if (n(r.stalled_s) > 0) stalledReturns++;
            }
            // its minutes, hour by hour (UTC)
            for (let t = start, end = start + dur * 1000; t < end;) {
                const next = Math.min(end, (Math.floor(t / 3600000) + 1) * 3600000);
                byHour[new Date(t).getUTCHours()] += (next - t) / 60000;
                t = next;
            }
        }
        const sessionCount = await this.one(`SELECT COUNT(*) AS n FROM ${from} WHERE s.started_at > ? ${who}`, [ago(7)]);

        // the last 30 days: devices, where new players came from, and first sessions
        const devices = await this.query(`SELECT IF(s.device = '', 'unknown', s.device) AS d, COUNT(DISTINCT s.player_id) AS n
            FROM ${from} WHERE s.ended_at > ? ${who} GROUP BY d ORDER BY n DESC`, [ago(30)]);
        const sources = await this.query(`SELECT IF(s.source = '', 'unknown', s.source) AS src, COUNT(*) AS n
            FROM ${from} WHERE s.first = 1 AND s.started_at > ? ${who} GROUP BY src ORDER BY n DESC LIMIT 12`, [ago(30)]);
        const firsts = await this.query(`SELECT s.started_at, TIMESTAMPDIFF(SECOND, s.started_at, s.ended_at) AS dur,
                (SELECT COUNT(*) FROM play_session t WHERE t.player_id = s.player_id) AS n
            FROM ${from} WHERE s.first = 1 AND s.started_at > ? ${who}`, [ago(30)]);
        const settled = firsts.filter((r) => new Date(r.started_at).getTime() < now - DAY);   // (a day for a second)

        const dayTotals = Array.from(playerDays.values());
        return {
            since,
            dau, played, busy,
            today: dau[ANALYTICS_DAYS - 1], wau: n(reach.w), mau: n(reach.m),
            sessions7: n(sessionCount.n),
            meanSession: mean(durs), medianSession: median(durs),
            lengths,
            busyShare: busySum + idleSum ? busySum / (busySum + idleSum) : 0,
            dailyMinutes: Math.round(mean(dayTotals) / 60),
            perDay: playerDays.size ? Math.round(rows.length / playerDays.size * 10) / 10 : 0,
            returns: aways.length,
            gaps,
            meanGap: mean(aways), medianGap: median(aways),
            stalledShare: awaySum ? stalledSum / awaySum : 0,
            stalledReturns,
            byHour: byHour.map((m) => Math.round(m)),
            devices: devices.map((r) => [r.d, n(r.n)]),
            sources: sources.map((r) => [r.src, n(r.n)]),
            firsts: firsts.length,
            medianFirst: median(firsts.map((r) => Math.max(0, n(r.dur)))),
            secondShare: settled.length ? settled.filter((r) => n(r.n) > 1).length / settled.length : 0,
        };
    }

    //#endregion

    //#region === Retention ===

    // a cohort a 7 days back from now (the newest last), of those who started
    // since sessions were recorded; weeks[k]: how many played k weeks after starting
    private async cohorts(now: number, since: number, staff: boolean): Promise<Analytics["cohorts"]> {
        if (!since) return [];
        const WEEK = 7 * DAY;
        const from = Math.max(since, now - COHORT_WEEKS * WEEK);
        const who = this.who(staff);
        const cohorts: Analytics["cohorts"] = [];
        for (let c = COHORT_WEEKS - 1; c >= 0; c--) {
            const start = now - (c + 1) * WEEK;
            if (start + WEEK <= from) continue;
            cohorts.push({ start: Math.max(start, from), size: 0, weeks: new Array(c + 1).fill(0) });
        }
        const cohortOf = (created: number) => cohorts.length - 1 - Math.floor((now - created) / WEEK);
        for (const r of await this.query(`SELECT p.created_at FROM player p WHERE p.created_at >= ? ${who}`, [new Date(from)])) {
            const c = cohorts[cohortOf(new Date(r.created_at).getTime())];
            if (c) c.size++;
        }
        for (const r of await this.query(`SELECT p.created_at, FLOOR(TIMESTAMPDIFF(SECOND, p.created_at, s.started_at) / 604800) AS w
                FROM player p JOIN play_session s ON s.player_id = p.id WHERE p.created_at >= ? ${who} GROUP BY p.id, w`, [new Date(from)])) {
            const c = cohorts[cohortOf(new Date(r.created_at).getTime())];
            const w = Number(r.w);
            if (c && w >= 0 && w < c.weeks.length) c.weeks[w]++;
        }
        return cohorts;
    }

    //#endregion

    //#region === Features ===

    private async features(now: number, staff: boolean): Promise<Analytics["features"]> {
        const week = new Date(now - 6 * DAY);       // (today and the 6 before)
        const who = this.who(staff);
        const rows = await this.query(`SELECT f.feature, SUM(f.uses) AS u, COUNT(DISTINCT f.player_id) AS n
            FROM feature_use f JOIN player p ON p.id = f.player_id WHERE f.day >= DATE(?) ${who}
            GROUP BY f.feature ORDER BY n DESC, u DESC`, [week]);
        const players = await this.one(`SELECT COUNT(DISTINCT f.player_id) AS n FROM feature_use f JOIN player p ON p.id = f.player_id
            WHERE f.day >= DATE(?) ${who}`, [week]);
        const windows: [string, number, number][] = [], actions: [string, number, number][] = [];
        for (const r of rows) {
            const feature = String(r.feature), row: [string, number, number] = [feature, Number(r.u), Number(r.n)];
            if (feature.startsWith(WINDOW_MARK)) windows.push([feature.slice(WINDOW_MARK.length), row[1], row[2]]);
            else actions.push(row);
        }
        return { players7: Number(players.n ?? 0), windows, actions };
    }

    //#endregion

    //#region === Churn ===

    // of those who started since sessions were recorded: who's gone, and how
    // far they got before going
    private async churn(now: number, since: number, staff: boolean): Promise<Analytics["churn"]> {
        const out: Analytics["churn"] = {
            old: 0, gone: 0, bounced: 0, started: 0,
            playtime: new Array(PLAYTIMES.length).fill(0), playtimeKept: new Array(PLAYTIMES.length).fill(0),
            sessions: new Array(SESSION_COUNTS.length).fill(0), stoppedAt: new Array(STEPS.length + 1).fill(0),
            heroes: [], firstGone: 0, firstKept: 0,
        };
        if (!since) return out;
        const gone = now - GONE_AFTER_DAYS * DAY;
        const online = new Set(IBS.players.online().map((p) => p.id));
        const rows = await this.query(`SELECT p.id, p.created_at, p.active_at, p.guide,
                COUNT(s.id) AS n, COALESCE(SUM(TIMESTAMPDIFF(SECOND, s.started_at, s.ended_at)), 0) AS t,
                (SELECT TIMESTAMPDIFF(SECOND, f.started_at, f.ended_at) FROM play_session f WHERE f.player_id = p.id ORDER BY f.id LIMIT 1) AS first,
                (SELECT COUNT(*) FROM hero h WHERE h.player_id = p.id) AS heroes
            FROM player p LEFT JOIN play_session s ON s.player_id = p.id
            WHERE p.created_at >= ? ${this.who(staff)} GROUP BY p.id`, [new Date(since)]);
        const firstGone: number[] = [], firstKept: number[] = [];
        for (const r of rows) {
            const t = Number(r.t), on = online.has(r.id);
            out.started++;
            if (t < BOUNCE_S && !on) out.bounced++;
            if (new Date(r.created_at).getTime() > gone) continue;
            out.old++;
            if (on || new Date(r.active_at).getTime() > gone) {
                out.playtimeKept[bucketOf(t, PLAYTIMES)]++;
                if (r.first != null) firstKept.push(Number(r.first));
                continue;
            }
            out.gone++;
            out.playtime[bucketOf(t, PLAYTIMES)]++;
            out.sessions[bucketOf(Number(r.n), SESSION_COUNTS)]++;
            const k = STEPS.findIndex((step) => !((r.guide ?? 0) & (1 << step.s)));
            out.stoppedAt[k < 0 ? STEPS.length : k]++;
            const heroes = Number(r.heroes);
            while (out.heroes.length <= heroes) out.heroes.push(0);
            out.heroes[heroes]++;
            if (r.first != null) firstGone.push(Number(r.first));
        }
        out.firstGone = median(firstGone);
        out.firstKept = median(firstKept);
        return out;
    }

    //#endregion

    //#region === Players ===

    private async players(now: number): Promise<Analytics["players"]> {
        const today = new Date(now);
        const ago = (days: number) => new Date(now - days * DAY);
        const n = (v: any) => Number(v ?? 0);

        const counts = await this.one(`SELECT COUNT(*) AS total,
                SUM(account_type = 'guest') AS guest, SUM(account_type = 'email') AS email, SUM(account_type = 'google') AS google,
                SUM(role > 0) AS staff, SUM(premium_until > ?) AS premium, SUM(chat_muted_until > ?) AS muted,
                SUM(created_at > ?) AS new1, SUM(created_at > ?) AS new7, SUM(created_at > ?) AS new30,
                SUM(active_at > ?) AS active1, SUM(active_at > ?) AS active7, SUM(active_at > ?) AS active30
            FROM player`, [today, now, ago(1), ago(7), ago(30), ago(1), ago(7), ago(30)]);
        const subs = await this.one("SELECT COUNT(*) AS n FROM player_subscription WHERE status IN ('active', 'trialing') AND until > ?", [today]);

        // a day each (0: today), by when they started and when they were last seen
        const signups = new Array(ANALYTICS_DAYS).fill(0), lastSeen = new Array(ANALYTICS_DAYS).fill(0);
        for (const r of await this.query("SELECT DATEDIFF(?, created_at) AS d, COUNT(*) AS n FROM player WHERE created_at > ? GROUP BY d", [today, ago(ANALYTICS_DAYS + 1)]))
            if (r.d >= 0 && r.d < ANALYTICS_DAYS) signups[ANALYTICS_DAYS - 1 - r.d] += n(r.n);
        for (const r of await this.query("SELECT DATEDIFF(?, active_at) AS d, COUNT(*) AS n FROM player WHERE active_at > ? GROUP BY d", [today, ago(ANALYTICS_DAYS + 1)]))
            if (r.d >= 0 && r.d < ANALYTICS_DAYS) lastSeen[ANALYTICS_DAYS - 1 - r.d] += n(r.n);

        // came back: seen a day, a week, a month after they started (of those that long ago)
        const back = await this.one(`SELECT
                SUM(created_at < ?) AS o1, SUM(created_at < ? AND active_at >= created_at + INTERVAL 1 DAY) AS b1,
                SUM(created_at < ?) AS o7, SUM(created_at < ? AND active_at >= created_at + INTERVAL 7 DAY) AS b7,
                SUM(created_at < ?) AS o30, SUM(created_at < ? AND active_at >= created_at + INTERVAL 30 DAY) AS b30
            FROM player`, [ago(1), ago(1), ago(7), ago(7), ago(30), ago(30)]);

        // the first steps (a bit a step; null: from before the guide)
        const guide = new Array(STEPS.length + 1).fill(0);
        for (const r of await this.query("SELECT guide, COUNT(*) AS n FROM player WHERE guide IS NOT NULL GROUP BY guide")) {
            guide[STEPS.length] += n(r.n);
            STEPS.forEach((step, k) => { if (r.guide & (1 << step.s)) guide[k] += n(r.n); });
        }

        return {
            total: n(counts.total), guest: n(counts.guest), email: n(counts.email), google: n(counts.google),
            staff: n(counts.staff), premium: n(counts.premium), subs: n(subs.n), muted: n(counts.muted),
            new1: n(counts.new1), new7: n(counts.new7), new30: n(counts.new30),
            active1: n(counts.active1), active7: n(counts.active7), active30: n(counts.active30),
            signups, lastSeen,
            retention: [[n(back.b1), n(back.o1)], [n(back.b7), n(back.o7)], [n(back.b30), n(back.o30)]],
            guide,
        };
    }

    //#endregion

    //#region === Heroes ===

    private async heroes(): Promise<Analytics["heroes"]> {
        // everyone's from their rows, those loaded from memory
        const loaded = new Map<number, Player>();
        for (const p of IBS.players.all()) loaded.set(p.id, p);
        const all: { owner: number, d: HeroData, s: HeroState }[] = [];
        for (const p of loaded.values()) for (const h of p.heroes) all.push({ owner: p.id, d: h.d, s: h.s });
        for (const r of await this.query("SELECT player_id, data, state FROM hero")) {
            if (loaded.has(r.player_id)) continue;
            try {
                all.push({ owner: r.player_id, d: JSON.parse(r.data), s: r.state ? JSON.parse(r.state) : null });
            } catch (e) { }
        }

        const owners = new Map<number, number>();
        for (const h of all) owners.set(h.owner, (owners.get(h.owner) ?? 0) + 1);
        const playerCount = Number((await this.one("SELECT COUNT(*) AS n FROM player")).n ?? 0);
        const rosters = [Math.max(0, playerCount - owners.size)];
        for (const n of owners.values()) {
            while (rosters.length <= n) rosters.push(0);
            rosters[n]++;
        }

        const jobs = new Array(JOBS.length).fill(0);
        const skillSum = new Array(SKILL_NAMES.length).fill(0);
        const levels: number[] = [];
        const doing = new Array(TASK_NAMES.length + 1).fill(0);
        const places = new Map<number, number>();
        const ranked: [number, number, number][] = [];      // [hero's place in all, owner, total]
        let hurt = 0;
        all.forEach((h, k) => {
            if (jobs[h.d.j] != null) jobs[h.d.j]++;
            let total = 0;
            h.d.k.forEach((level, skill) => { if (skill < skillSum.length) skillSum[skill] += level; total += level; });
            const band = Math.floor(total / 10);
            while (levels.length <= band) levels.push(0);
            levels[band]++;
            ranked.push([k, h.owner, total]);
            const kind = h.s?.w?.k ?? h.s?.q?.[0]?.k;
            doing[kind == null || kind == TaskKind.REST || doing[kind] == null ? TASK_NAMES.length : kind]++;
            if ((h.s?.h ?? 0) > 0) hurt++;
            if (h.s) places.set(h.s.p, (places.get(h.s.p) ?? 0) + 1);
        });

        ranked.sort((a, b) => b[2] - a[2]);
        const top = ranked.slice(0, TOP);
        const names = await this.names(top.map((t) => t[1]));

        return {
            total: all.length,
            rosters,
            jobs,
            skills: skillSum.map((s) => all.length ? Math.round(s / all.length * 10) / 10 : 0),
            levels,
            doing,
            hurt,
            places: Array.from(places.entries()).sort((a, b) => b[1] - a[1]).slice(0, TOP).map(([id, n]) => [this.placeName(id), n]),
            top: top.map(([k, owner, total]) => [all[k].d.n, names.get(owner) ?? "?", total]),
        };
    }

    private placeName(id: number) {
        return IBS.nodes.getById(id)?.name || `Node ${id}`;
    }

    // display names, by player id (those loaded from memory)
    private async names(ids: number[]) {
        const names = new Map<number, string>();
        const want = ids.filter((id) => {
            const p = IBS.players.getById(id);
            if (p) names.set(id, p.record.displayName);
            return !p;
        });
        if (want.length) for (const r of await this.query("SELECT id, display_name FROM player WHERE id IN (?)", [want])) names.set(r.id, r.display_name);
        return names;
    }

    //#endregion

    //#region === Economy ===

    private async economy(now: number): Promise<Analytics["economy"]> {
        // every stash: rows, those loaded from memory
        const loaded = new Map<number, Player>();
        for (const p of IBS.players.all()) if (p.inventory) loaded.set(p.id, p);
        const golds: [number, number][] = [];       // [player id, gold]
        const items = new Map<number, number>();
        const add = (id: number, n: number) => items.set(id, (items.get(id) ?? 0) + n);
        for (const p of loaded.values()) {
            golds.push([p.id, p.inventory.gold]);
            for (const item of p.inventory.items.values()) add(item.id, item.amount);
        }
        for (const r of await this.query("SELECT player_id, gold, items FROM inventory")) {
            if (loaded.has(r.player_id)) continue;
            golds.push([r.player_id, Number(r.gold)]);
            try {
                for (const [id, n] of JSON.parse(r.items) as number[][]) add(id, n);
            } catch (e) { }
        }
        golds.sort((a, b) => b[1] - a[1]);
        const gold = golds.reduce((sum, g) => sum + g[1], 0);
        const median = golds.length ? golds[Math.floor(golds.length / 2)][1] : 0;
        const rich = golds.slice(0, TOP);
        const names = await this.names(rich.map((g) => g[0]));

        const market = await this.one("SELECT COUNT(*) AS n, SUM(amount * price) AS worth FROM market_listing WHERE state = 0 AND ends > ?", [now]);
        const week = await this.one("SELECT COUNT(*) AS n, SUM(gold) AS g FROM market_sale WHERE at > ?", [now - 7 * DAY]);
        const ever = await this.one("SELECT COUNT(*) AS n, SUM(gold) AS g FROM market_sale");
        const sold = await this.query("SELECT item, SUM(amount) AS n FROM market_sale WHERE at > ? GROUP BY item ORDER BY n DESC LIMIT ?", [now - 30 * DAY, TOP]);
        const bj = await this.one("SELECT COUNT(*) AS n, SUM(hands) AS hands, SUM(net) AS net FROM game_stat");

        return {
            gold, goldMedian: median,
            rich: rich.map(([id, g]) => [names.get(id) ?? "?", g]),
            items: Array.from(items.entries()).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]).slice(0, TOP).map(([id, n]) => [itemName(id), n]),
            listings: Number(market.n ?? 0), listed: Number(market.worth ?? 0),
            sales7: Number(week.n ?? 0), gold7: Number(week.g ?? 0),
            sales: Number(ever.n ?? 0), goldAll: Number(ever.g ?? 0),
            topSold: sold.map((r) => [itemName(r.item), Number(r.n)]),
            bjPlayers: Number(bj.n ?? 0), bjHands: Number(bj.hands ?? 0), bjNet: Number(bj.net ?? 0),
        };
    }

    //#endregion

    //#region === Social ===

    private async social(now: number): Promise<Analytics["social"]> {
        const [guilds, members, friends, asks, whispers, reports, events, givers] = await Promise.all([
            this.one("SELECT COUNT(*) AS n FROM guild"),
            this.one("SELECT COUNT(*) AS n FROM guild_member"),
            this.one("SELECT COUNT(*) AS n FROM friend"),
            this.one("SELECT COUNT(*) AS n FROM friend_ask"),
            this.one("SELECT COUNT(*) AS n FROM whisper WHERE at > ?", [new Date(now - 7 * DAY)]),
            this.one("SELECT COUNT(*) AS n, SUM(done = 0) AS open FROM chat_report"),
            this.one("SELECT COUNT(*) AS n, SUM(state = 1) AS won, SUM(state = 2) AS lost, SUM(state = 0 AND ends > ?) AS live FROM world_event", [now]),
            this.one("SELECT COUNT(DISTINCT player_id) AS n FROM event_share"),
        ]);
        const n = (r: Row, k = "n") => Number(r[k] ?? 0);
        return {
            guilds: n(guilds), guildMembers: n(members),
            friendships: n(friends), asks: n(asks),
            whispers7: n(whispers),
            reportsOpen: n(reports, "open"), reports: n(reports),
            events: n(events), eventsWon: n(events, "won"), eventsLost: n(events, "lost"), eventsOn: n(events, "live"),
            eventGivers: n(givers),
        };
    }

    //#endregion

}

function mean(values: number[]) {
    return values.length ? Math.round(values.reduce((sum, v) => sum + v, 0) / values.length) : 0;
}

function median(values: number[]) {
    if (!values.length) return 0;
    const sorted = values.slice().sort((a, b) => a - b), mid = Math.floor(sorted.length / 2);
    return Math.round(sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2);
}
