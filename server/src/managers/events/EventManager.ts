import { ResultSetHeader, RowDataPacket } from "mysql2";
import { PoolConnection } from "mysql2/promise";
import { IBS } from "../../app";
import { builtBy, growsTown, TownRow, townLevel, townRate, townStage, WIN_POINTS } from "../../../../shared/Towns";
import { S2C } from "../../constants/Routes";
import {
    bestSkill, BOON_MS, endedAt, PastEvent, PAST_MOST, BOSS_HIT, BOSSES, bossHealth, boutPoints, eventDef, eventFits, eventGoal, EventKind, eventName, eventRate, eventSkills,
    eventStage, eventStages, EVENT_KINDS, EVENTS_MOST, EventView, GAP_LEAST_MS, GAP_MOST_MS, isLive, rareFinds, rewardGold, TOP, UNIT_MS, WorldEvent,
    BANE_MS, baneText, eventTitle, isBossEvent, marchAt, MARCH_MILES, MARCH_STOPS, marchTarget,
} from "../../../../shared/Events";
import { distancesFrom, findPath, SEA_TERRAIN } from "../../../../shared/Travel";
import { isTown, placeName } from "../../../../shared/Places";
import { BEATEN_XP, ENEMIES, fight, Fighter, heroFighter, hurtAfter } from "../../../../shared/Fights";
import { danger, deepestLevel } from "../../../../shared/Locations";
import { kindOf, WorldPlace } from "../../../../shared/Places";
import { TaskKind, unitXp } from "../../../../shared/Tasks";
import { SKILL_NAMES } from "../../../../shared/Heroes";
import { Deed } from "../../../../shared/Seasons";
import { Hero } from "../hero/HeroManager";
import { Player } from "../player/Player";
import { Log } from "../../utils/Log";

// Dynamic events (shared/Events.ts): up to EVENTS_MOST on at once, a new one
// starting GAP_LEAST_MS-GAP_MOST_MS after the last at a place picked at random
// (none where one's on or its boon is). Heroes join one by an Event task
// (HeroTasks), each unit of work adding to it (work). Met in time, it's won:
// everyone who gave is paid (pay: at once if they're loaded, else as they
// next load, payOwed) and its place has its boon for BOON_MS; out of time,
// it's over. The events (`world_event`) and who gave what (`event_share`)
// are kept in memory and saved every SAVE_MS; what's changed goes to
// everyone signed in every SEND_MS. Starting and ending are said in the
// General chat. The events window's log of those over (EVENT_PAST) is read
// from what's saved, kept PAST_MS and again as one ends.

export class EventManager {

    public static SAVE_MS = 10000;
    public static SEND_MS = 3000;
    public static PAST_MS = 60000;

    public towns = new Map<number, { p: number; b: Map<string, number> }>();    // (place id: how it's grown, shared/Towns.ts)
    public events = new Map<number, WorldEvent>();         // on, and won with their boon in effect
    private shares = new Map<number, Map<number, number>>();   // event id: player id: points
    private names = new Map<number, string>();             // player id: name (the top givers)
    private supporterUntil = new Map<number, number>();     // player id: premium until (ms; the top givers' Supporter tag)
    private heroCounts = new Map<number, number>();        // event id: heroes working on it now (counted each send)
    private dirty = new Set<WorldEvent>();                 // (to save)
    private sharesDirty = new Set<string>();               // ("event:player", to save)
    private changed = false;                               // (to send)
    private nextAt = 0;
    private saveTime = 0;
    private sendTime = 0;
    private past: PastEvent[] = null;                      // (the log, kept)
    private pastAt = 0;
    private pastAge = 0;                                   // (one more each time it goes stale: one being read as it does isn't kept)
    private pastReading: Promise<PastEvent[]> = null;

    public async init() {
        const conn = await IBS.db.getConnection();
        try {
            await conn.query(`CREATE TABLE IF NOT EXISTS world_event (
                id INT AUTO_INCREMENT PRIMARY KEY,
                kind INT NOT NULL,
                place INT NOT NULL,
                name VARCHAR(120) NOT NULL,
                boss INT NULL,
                started BIGINT NOT NULL,
                ends BIGINT NOT NULL,
                goal DOUBLE NOT NULL,
                done DOUBLE NOT NULL,
                state TINYINT NOT NULL,
                boon_until BIGINT NULL)`);
            // (a marching boss's way: shared/Events.ts MARCH)
            try { await conn.query("ALTER TABLE world_event ADD COLUMN route TEXT NULL"); } catch (e) { /* (there already) */ }
            await conn.query(`CREATE TABLE IF NOT EXISTS event_share (
                event_id INT NOT NULL,
                player_id INT NOT NULL,
                points DOUBLE NOT NULL,
                gold INT NOT NULL DEFAULT 0,
                item INT NOT NULL DEFAULT 0,
                paid TINYINT NOT NULL DEFAULT 0,
                PRIMARY KEY (event_id, player_id),
                INDEX (player_id, paid))`);
            await this.loadTowns(conn);
            const now = Date.now();
            const [rows] = await conn.query<RowDataPacket[]>("SELECT * FROM world_event WHERE state = 0 OR (state IN (1, 3) AND boon_until > ?)", [now]);
            for (const r of rows) {
                const e: WorldEvent = { i: r.id, k: r.kind, p: r.place, n: r.name, s: Number(r.started), e: Number(r.ends), g: r.goal, d: r.done, w: r.state };
                if (r.boss != null) e.b = r.boss;
                if (r.boon_until != null) e.u = Number(r.boon_until);
                if (r.route) { try { const way = JSON.parse(r.route); e.r = way.r; e.h = way.h; } catch (x) { /* (none) */ } }
                this.events.set(e.i, e);
            }
            if (this.events.size) {
                const [shares] = await conn.query<RowDataPacket[]>(
                    "SELECT s.event_id, s.player_id, s.points, p.display_name, p.premium_until FROM event_share s JOIN player p ON p.id = s.player_id WHERE s.event_id IN (?)",
                    [Array.from(this.events.keys())]);
                for (const s of shares) {
                    this.shareOf(s.event_id).set(s.player_id, s.points);
                    this.names.set(s.player_id, s.display_name);
                    this.supporterUntil.set(s.player_id, new Date(s.premium_until).getTime() || 0);
                }
            }
        } finally {
            conn.release();
        }
        // (after a restart, the next a minute on)
        this.nextAt = Date.now() + 60000;
        Log.info(`Events: ${this.live().length} on`);
    }

    //#region what's on

    // those on now (an id: that one, if it's on)
    public live(): WorldEvent[] {
        const now = Date.now();
        return Array.from(this.events.values()).filter((e) => isLive(e, now));
    }

    public liveOne(id: number) {
        const e = this.events.get(id);
        return e && isLive(e, Date.now()) ? e : null;
    }

    private shareOf(id: number) {
        let share = this.shares.get(id);
        if (!share) this.shares.set(id, share = new Map());
        return share;
    }

    // what goes to a player: each with their points and the top givers
    public views(player: Player): EventView[] {
        const now = Date.now();
        const giver = ([id, n]: [number, number]): [string, number, number?] => {
            const row: [string, number, number?] = [this.names.get(id) ?? "?", Math.round(n * 10) / 10];
            if ((this.supporterUntil.get(id) ?? 0) > now) row.push(1);
            return row;
        };
        return Array.from(this.events.values(), (e) => {
            const share = this.shares.get(e.i);
            const top = share ? Array.from(share).sort((a, b) => b[1] - a[1]).slice(0, TOP) : [];
            const view: EventView = { ...e, t: top.map(giver), c: this.heroCounts.get(e.i) ?? 0 };
            const mine = share?.get(player.id);
            if (mine) view.m = Math.round(mine * 10) / 10;
            return view;
        });
    }

    //#endregion

    //#region starting and ending

    // a new one: a kind of event at a place it fits that's on the roads and
    // has none on (or a boon), picked at random; its goal by how many are about
    public async start(kind?: EventKind, placeId?: number) {
        const places = IBS.heroes.tasks.places, graph = IBS.heroes.tasks.graph;
        const taken = new Set(Array.from(this.events.values(), (e) => e.p));
        const kinds = kind != null ? [kind] : this.kindsToTry();
        for (const k of kinds) {
            const fits = Array.from(places.values()).filter((p) =>
                (placeId == null || p.i == placeId) && !taken.has(p.i) && graph.get(p.i)?.e.length && !IBS.sights.isOpening(p.i) && eventFits(k, p));
            if (!fits.length) continue;
            const place = fits[Math.floor(Math.random() * fits.length)], now = Date.now();
            // (a marching boss: its way from its dungeon to a town; none found, the next kind)
            const way = k == EventKind.MARCH ? this.marchWay(fits, taken) : null;
            if (k == EventKind.MARCH && !way) continue;
            const from = way ? places.get(way.r[0]) : place;
            const { n, b } = eventName(k, from, Math.random(), way && places.get(way.r[way.r.length - 1]));
            const e: WorldEvent = { i: 0, k, p: from.i, n, s: now, e: now + eventDef(k).hours * 3600000, g: eventGoal(IBS.players.all().length), d: 0, w: 0 };
            if (b != null) e.b = b;
            if (way) { e.r = way.r; e.h = way.h; }
            const conn = await IBS.db.getConnection();
            try {
                const [result] = await conn.query<ResultSetHeader>(
                    "INSERT INTO world_event (kind, place, name, boss, started, ends, goal, done, state, route) VALUES (?, ?, ?, ?, ?, ?, ?, 0, 0, ?)",
                    [e.k, e.p, e.n, e.b ?? null, e.s, e.e, e.g, way ? JSON.stringify(way) : null]);
                e.i = result.insertId;
            } finally {
                conn.release();
            }
            this.events.set(e.i, e);
            this.changed = true;
            this.announce(e, way ? `${eventDef(k).name}: ${n}! It reaches ${placeName(places.get(marchTarget(e)))} in ${eventDef(k).hours} hours: send your heroes to meet it from their to-do list's Events tab`
                : `${eventDef(k).name}: ${n}! Send your heroes from their to-do list's Events tab (${eventDef(k).hours} hours)`);
            Log.info(`Event started: ${n} (${e.i}), goal ${e.g}`);
            return e;
        }
        return null;
    }

    // A marching boss's way: from one of the dungeons that fit to a town
    // MARCH_MILES off by land (none with an event on or a boon), halting at
    // the places on it (MARCH_STOPS at least); null if none's found
    private marchWay(dungeons: WorldPlace[], taken: Set<number>) {
        const { places, graph, tile } = IBS.heroes.tasks, px = tile || 16;
        for (let tries = 0; tries < 20; tries++) {
            const from = dungeons[Math.floor(Math.random() * dungeons.length)], dist = distancesFrom(graph, from.i);
            const towns = Array.from(places.values()).filter((p) => isTown(p) && !taken.has(p.i) && !IBS.sights.isOpening(p.i)
                && (dist.get(p.i) ?? 0) >= MARCH_MILES[0] * px && dist.get(p.i) <= MARCH_MILES[1] * px);
            if (!towns.length) continue;
            const to = towns[Math.floor(Math.random() * towns.length)], path = findPath(graph, from.i, to.i);
            if (!path || path.some((id) => graph.get(id)?.te == SEA_TERRAIN)) continue;
            const r = [from.i, ...path], h = r.map((id, k) => places.has(id) ? k : -1).filter((k) => k >= 0);
            if (h.length < MARCH_STOPS || h[0] != 0) continue;
            return { r, h };
        }
        return null;
    }

    // the kinds to try, in turn: the season's festival first now and then
    // (FESTIVAL_FIRST) if there isn't one on, else never; the rest at random
    private kindsToTry() {
        const rest = EVENT_KINDS.map((d) => d.kind).filter((k) => k != EventKind.FESTIVAL).sort(() => Math.random() - 0.5);
        const festival = Array.from(this.events.values()).some((e) => e.k == EventKind.FESTIVAL && isLive(e, Date.now()));
        return !festival && Math.random() < EventManager.FESTIVAL_FIRST ? [EventKind.FESTIVAL, ...rest] : rest;
    }
    private static FESTIVAL_FIRST = 0.35;

    //#region towns growing for good (shared/Towns.ts)

    // what's saved, and the first time, what's already been won there
    private async loadTowns(conn: PoolConnection) {
        await conn.query(`CREATE TABLE IF NOT EXISTS town_growth (
            place INT NOT NULL PRIMARY KEY,
            points INT NOT NULL,
            built TEXT NOT NULL)`);
        const [rows] = await conn.query<RowDataPacket[]>("SELECT place, points, built FROM town_growth");
        for (const r of rows) this.towns.set(r.place, { p: r.points, b: new Map(JSON.parse(r.built)) });
        if (rows.length) return;
        const [won] = await conn.query<RowDataPacket[]>("SELECT kind, place, name FROM world_event WHERE state = 1");
        const grown = new Set<number>();
        for (const r of won) {
            if (!growsTown(r.kind)) continue;
            this.addTo(r.place, { k: r.kind, n: r.name });
            grown.add(r.place);
        }
        for (const place of grown) await this.saveTown(place, conn);
        if (grown.size) Log.info(`Towns: ${grown.size} grown by the events already won there`);
    }

    private addTo(place: number, e: Pick<WorldEvent, "k" | "n">) {
        const town = this.towns.get(place) ?? { p: 0, b: new Map<string, number>() };
        this.towns.set(place, town);
        town.p += WIN_POINTS;
        const built = builtBy(e);
        if (built) town.b.set(built, (town.b.get(built) ?? 0) + 1);
        return town;
    }

    private async saveTown(place: number, conn?: PoolConnection) {
        const town = this.towns.get(place), sql = "INSERT INTO town_growth (place, points, built) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE points = VALUES(points), built = VALUES(built)";
        const args = [place, town.p, JSON.stringify(Array.from(town.b))];
        if (conn) { await conn.query(sql, args); return; }
        const own = await IBS.db.getConnection();
        try { await own.query(sql, args); } finally { own.release(); }
    }

    // a town event won: the town grows, said if it's gone up a level
    private async grow(e: WorldEvent) {
        if (!growsTown(e.k)) return;
        const was = townLevel(this.towns.get(e.p)?.p ?? 0), level = townLevel(this.addTo(e.p, e).p);
        const message = { r: S2C.TOWNS, l: this.townRows() };
        for (const p of IBS.players.online()) p.send(message);
        if (level > was) IBS.chat.event(`${this.nameOf(e.p)} has grown to level ${level}: it's ${townStage(level)} now! Crafting and work there are worth more for good`, e.i);
        await this.saveTown(e.p);
    }

    public townRows(): TownRow[] {
        return Array.from(this.towns, ([place, t]): TownRow => [place, t.p, Array.from(t.b)]);
    }

    // x crafting speed and XP at a place, by how it's grown
    public townRate(place: number) {
        return townRate(this.towns.get(place)?.p ?? 0);
    }

    //#endregion

    // met (won) or out of time: said, saved, and won, everyone who gave paid
    private async end(e: WorldEvent, won: boolean) {
        if (e.w) return;
        // (a marching boss not stopped: it reached its town, which has the bane for BANE_MS; stopped, the boon's there)
        const town = e.k == EventKind.MARCH ? marchTarget(e) : null, reached = !won && town != null;
        e.w = won ? 1 : reached ? 3 : 2;
        this.pastStale();
        if (town != null) e.p = town;
        if (won) { e.u = Date.now() + BOON_MS; this.grow(e).catch(Log.catch("Couldn't grow a town", { event: e.i })); }
        else if (reached) e.u = Date.now() + BANE_MS;
        else this.events.delete(e.i);
        this.dirty.add(e);
        this.changed = true;
        const share = this.shares.get(e.i) ?? new Map<number, number>(), townName = town != null ? this.nameOf(town) : "";
        this.announce(e, won ? `${e.n}: done, by ${share.size} player${share.size == 1 ? "" : "s"}! ${eventDef(e.k).boonText}${town != null ? ` in ${townName}` : ""} for a day`
            : reached ? `${eventTitle(e)} reached ${townName} and laid it waste! ${baneText(e)} there for 12 hours`
            : `${e.n}: out of time, ${Math.floor(100 * e.d / e.g)}% of the way`);
        Log.info(`Event ${won ? "won" : "over"}: ${e.n} (${e.i})`);
        if (!won) {
            // (what was given since the last save saved first, for the log)
            await this.save();
            if (!reached) this.shares.delete(e.i);
            return;
        }

        // by share: the top givers a rare find too
        const givers = Array.from(share).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]);
        const rare = rareFinds();
        const paid = givers.map(([id, n], k): [number, number, number, number] => {
            const item = k < TOP && rare.length ? rare[Math.floor(Math.random() * rare.length)].id : 0;
            return [id, n, rewardGold(n), item];
        });
        const loaded = paid.filter(([id]) => IBS.players.getById(id));
        // (the top 3 and their finds, for the podium those signed in see: names from the database, any not loaded)
        const top = await this.topNames(paid.slice(0, TOP).map(([id]) => id)).catch(() => new Map<number, string>());
        const podium = paid.slice(0, TOP).map(([id, , , item]): [string, number] => [top.get(id) ?? "Someone", item]);
        for (const [id, , gold, item] of loaded) this.pay(IBS.players.getById(id), e.n, gold, item, podium, paid.findIndex(([p]) => p == id) + 1);
        if (!paid.length) return;
        const conn = await IBS.db.getConnection();
        try {
            for (const [id, n, gold, item] of paid)
                await conn.query(`INSERT INTO event_share (event_id, player_id, points, gold, item, paid) VALUES (?, ?, ?, ?, ?, ?)
                    ON DUPLICATE KEY UPDATE points = VALUES(points), gold = VALUES(gold), item = VALUES(item), paid = VALUES(paid)`,
                    [e.i, id, n, gold, item, IBS.players.getById(id) ? 1 : 0]);
        } finally {
            conn.release();
        }
        for (const [id] of paid) this.sharesDirty.delete(`${e.i}:${id}`);
        this.pastStale();       // (the log may have been read as it ended, before what each got was saved)
    }

    // into their inventory (it's saved with their heroes), told now if they're signed in, else as they do
    private pay(player: Player, name: string, gold: number, item: number, top: [string, number][] = null, place = 0) {
        player.inventory.adjustGold(gold);
        if (item) player.inventory.adjustItem(item, 1);
        player.stashChanged = true;
        if (player.online) player.send({ r: S2C.EVENT_REWARD, n: name, g: gold, i: item, ...(top ? { t: top, k: place } : {}) });
        else player.eventRewards.push({ n: name, g: gold, i: item });
    }

    // players' display names, by id
    private async topNames(ids: number[]) {
        const out = new Map<number, string>();
        if (!ids.length) return out;
        const conn = await IBS.db.getConnection();
        try {
            const [rows] = await conn.query<RowDataPacket[]>("SELECT id, display_name FROM player WHERE id IN (?)", [ids]);
            for (const r of rows) out.set(Number(r.id), String(r.display_name));
        } finally {
            conn.release();
        }
        return out;
    }

    // as they load: anything they were owed while they weren't, kept to tell
    // them as they sign in (marked paid and saved in their stash together, so
    // a crash between can't lose it or pay it twice)
    public async payOwed(player: Player) {
        const conn = await IBS.db.getConnection();
        try {
            await conn.beginTransaction();
            const [rows] = await conn.query<RowDataPacket[]>(
                "SELECT s.event_id, s.gold, s.item, e.name FROM event_share s JOIN world_event e ON e.id = s.event_id WHERE s.player_id = ? AND s.paid = 0 AND s.gold > 0 FOR UPDATE",
                [player.id]);
            if (!rows.length) {
                await conn.rollback();
                return;
            }
            for (const r of rows) {
                player.inventory.adjustGold(r.gold);
                if (r.item) player.inventory.adjustItem(r.item, 1);
                await conn.query("UPDATE event_share SET paid = 1 WHERE event_id = ? AND player_id = ?", [r.event_id, player.id]);
            }
            const inv = player.inventory.getJSON();
            await conn.query("UPDATE inventory SET gold = ?, items = ? WHERE player_id = ?", [inv.g, JSON.stringify(inv.i), player.id]);
            await conn.commit();
            for (const r of rows) player.eventRewards.push({ n: r.name, g: r.gold, i: r.item });
        } catch (e) {
            await conn.rollback().catch(() => { });
            throw e;
        } finally {
            conn.release();
        }
    }

    // a line in the General chat, from the events, the list first (clicking
    // its box goes to the event, which has to be there to go to: EventNotices)
    private announce(e: WorldEvent, text: string) {
        this.sendChanged();
        IBS.chat.event(text, e.i);
    }

    //#endregion

    //#region the log

    // the last PAST_MOST over to a player, newest first, with their points in each
    public async sendPast(player: Player) {
        const list = await this.pastList();
        const view: PastEvent[] = list.map((e) => ({ ...e }));
        if (view.length) {
            const rows = await this.read(
                "SELECT event_id, points, gold, item FROM event_share WHERE player_id = ? AND points > 0 AND event_id IN (?)", [player.id, view.map((e) => e.i)]);
            for (const r of rows) {
                const e = view.find((v) => v.i == r.event_id);
                if (!e) continue;
                e.m = Math.round(r.points * 10) / 10;
                if (r.gold > 0) e.y = r.gold;
                if (r.item) e.f = r.item;
            }
        }
        if (player.online) player.send({ r: S2C.EVENT_PAST, l: view });
    }

    private async read(sql: string, values: any[]) {
        const conn = await IBS.db.getConnection();
        try {
            const [rows] = await conn.query<RowDataPacket[]>(sql, values);
            return rows;
        } finally {
            conn.release();
        }
    }

    private pastStale() {
        this.past = null;
        this.pastAge++;
    }

    // (one reading at a time, however many ask)
    private pastList() {
        if (this.past && Date.now() - this.pastAt < EventManager.PAST_MS) return Promise.resolve(this.past);
        return this.pastReading ??= this.readPast().finally(() => this.pastReading = null);
    }

    // what's saved (saved first): each with how many gave and the top givers
    private async readPast() {
        const age = this.pastAge;
        await this.save();
        const rows = await this.read("SELECT * FROM world_event WHERE state IN (1, 2, 3) ORDER BY id DESC LIMIT ?", [PAST_MOST]);
        const list: PastEvent[] = rows.map((r) => {
            const e: PastEvent = { i: r.id, k: r.kind, p: r.place, n: r.name, s: Number(r.started), e: Number(r.ends), g: r.goal, d: r.done, w: r.state, x: 0, c: 0, t: [] };
            if (r.boss != null) e.b = r.boss;
            if (r.boon_until != null) e.u = Number(r.boon_until);
            e.x = endedAt(e);
            return e;
        });
        if (list.length) {
            const shares = await this.read(
                `SELECT s.event_id, s.points, s.item, p.display_name, p.premium_until FROM event_share s JOIN player p ON p.id = s.player_id
                WHERE s.points > 0 AND s.event_id IN (?) ORDER BY s.event_id, s.points DESC, s.item > 0 DESC`, [list.map((e) => e.i)]);
            const byId = new Map(list.map((e) => [e.i, e]));
            const now = Date.now();
            for (const s of shares) {
                const e = byId.get(s.event_id);
                e.c++;
                if (e.t.length >= TOP) continue;
                e.t.push([s.display_name, Math.round(s.points * 10) / 10, (new Date(s.premium_until).getTime() || 0) > now ? 1 : 0, s.item || 0]);
            }
        }
        list.sort((a, b) => b.x - a.x);
        if (age == this.pastAge) {
            this.past = list;
            this.pastAt = Date.now();
        }
        return list;
    }

    //#endregion

    //#region heroes working on one

    // the skill a hero works on it with: the best of theirs it takes
    public skillFor(hero: Hero, e: WorldEvent) {
        return bestSkill(hero.d.k, eventSkills(e, IBS.heroes.tasks.places.get(e.p)));
    }

    // a unit of work (a boss's bout) at their pace
    public unitMs(hero: Hero, e: WorldEvent) {
        return UNIT_MS / eventRate(hero.d, e, IBS.heroes.tasks.places.get(e.p));
    }

    // a unit done: the XP for it and its points (a boss's: a bout fought, hurt
    // kept, beaten resting after and learning half as much)
    public work(player: Player, hero: Hero, e: WorldEvent) {
        const skill = this.skillFor(hero, e);
        let points = 1, xp = 1;
        if (isBossEvent(e)) {
            const f = this.bout(player, hero, e);
            points = f.x;
            if (f.o[0] <= 0) xp = BEATEN_XP;
        }
        IBS.heroes.learn(player, hero, skill, Math.round(unitXp(hero.d, skill, UNIT_MS) * xp));
        IBS.heroes.learnAround(player, hero, [[skill, UNIT_MS]], TaskKind.EVENT, xp);
        this.add(player, e, points);
    }

    // a bout against a boss, met at the deepest level they'd reach there alone
    // (shared/Events.ts BOSS_HIT), its health the event's (its whole and
    // what's left, at that level). The rest of their party (shared/Parties.ts:
    // others on the same event there, none recovering) fight beside them as on
    // a dungeon run: they draw its blows and heal, and keep their health; the
    // bout is the hero's, its points what their own blows took off it (the
    // others' count in their own bouts), all of it if it fell
    private bout(player: Player, hero: Hero, e: WorldEvent) {
        // (a marching boss's level: by its dungeon's kind, wherever it is now)
        const s = hero.s, place = IBS.heroes.tasks.places.get(e.r ? e.r[0] : e.p);
        const level = Math.max(1, deepestLevel(place ? kindOf(place) : "lair", [hero.d]));
        const boss = BOSSES[e.b] ?? BOSSES[0], [, at, df, sp] = ENEMIES[boss.e].m, p = danger(level);
        const foe: Fighter = {
            n: boss.name, e: boss.e, g: 1, s: 1, mx: bossHealth(e.g, level), hp: bossHealth(e.g - e.d, level),
            at: p / 2 * at * BOSS_HIT, df: p / 2 * df, sp, cr: 0.05, dg: 0.03,
        };
        const party = [hero, ...IBS.heroes.tasks.partyOf(hero).filter((h) => h != hero && !h.s.o)];
        const tasks = IBS.heroes.tasks, owner = (h: Hero) => h == hero ? player : tasks.parties.ownerOf(h);
        const f = fight(level, party.map((h) => heroFighter(h.id, h.d, h.s.h ?? 0, false, 0, tasks.potionFor(h, owner(h)))), [foe]);
        tasks.usedPotions(f, party, owner);
        const at0 = party.length, own = f.b.filter((b) => b.a == 0 && b.t == at0 && !b.h).reduce((sum, b) => sum + b.d, 0);
        f.x = Math.round(boutPoints(own, level) * 10) / 10;
        if (f.o[at0] <= 0) f.x = Math.max(f.x, e.g - e.d);      // (finished off)
        const hurt = hurtAfter(f, hero.id);
        s.h = hurt > 0 ? hurt : undefined;
        if (f.o[0] <= 0) s.o = 1;
        hero.f = f;
        for (const h of party) if (h != hero) (h.a ??= []).push(f);
        return f;
    }

    // An account being deleted (AccountManager): off every event's givers,
    // so it's neither saved nor paid again (what it gave still counts to the
    // event). Its rows go with the rest of the account.
    public forget(player: Player) {
        for (const [ev, share] of this.shares) if (share.delete(player.id)) this.sharesDirty.delete(`${ev}:${player.id}`);
        this.names.delete(player.id);
        this.supporterUntil.delete(player.id);
        this.changed = true;
        this.pastStale();
    }

    // a player's new name, on the boards they're among the givers of
    public renamed(player: Player) {
        if (!this.names.has(player.id)) return;
        this.names.set(player.id, player.record.displayName);
        this.changed = true;
        this.pastStale();
    }

    // points to it from a player; met, it's won
    private add(player: Player, e: WorldEvent, points: number) {
        if (!isLive(e, Date.now()) || points <= 0) return;
        const stage = eventStage(e);
        e.d = Math.min(e.g, e.d + points);
        // a stage done (not the last): everyone on it moves to the next
        const next = eventStage(e);
        if (next != stage && e.d < e.g) {
            const s = eventStages(e)[next];
            this.announce(e, `${e.n}: stage ${next + 1} of ${eventStages(e).length}, ${s.name.toLowerCase()} (${SKILL_NAMES[s.skill]})`);
        }
        const share = this.shareOf(e.i);
        share.set(player.id, (share.get(player.id) ?? 0) + points);
        IBS.seasons.did(player, Deed.EVENT, points);
        this.names.set(player.id, player.record.displayName);
        this.supporterUntil.set(player.id, new Date(player.record.premiumUntil).getTime() || 0);
        this.dirty.add(e);
        this.sharesDirty.add(`${e.i}:${player.id}`);
        this.changed = true;
        if (e.d >= e.g) this.end(e, true).catch(Log.catch("Couldn't end an event"));
    }

    //#endregion

    //#region time going by

    public update(deltaTime: number) {
        const now = Date.now();
        for (const e of Array.from(this.events.values())) {
            if (e.w == 0 && now >= e.e) this.end(e, false).catch(Log.catch("Couldn't end an event"));
            else if ((e.w == 1 || e.w == 3) && (e.u ?? 0) <= now) { this.events.delete(e.i); this.shares.delete(e.i); this.changed = true; }
            else if (e.w == 0 && e.r) this.march(e, now);
        }
        if (now >= this.nextAt) {
            this.nextAt = now + GAP_LEAST_MS + Math.random() * (GAP_MOST_MS - GAP_LEAST_MS);
            if (this.live().length < EVENTS_MOST && IBS.heroes.tasks.places.size) this.start().catch(Log.catch("Couldn't start an event"));
        }
        if ((this.sendTime += deltaTime) >= EventManager.SEND_MS) {
            this.sendTime = 0;
            this.sendChanged();
        }
        if ((this.saveTime += deltaTime) >= EventManager.SAVE_MS) {
            this.saveTime = 0;
            this.save().catch(Log.catch("Couldn't save the events"));
        }
    }

    private sendChanged() {
        this.countHeroes();
        if (!this.changed) return;
        this.changed = false;
        for (const p of IBS.players.online()) p.send({ r: S2C.EVENT_LIST, l: this.views(p) });
    }

    // a marching boss's place: where it's halted, or walking, the next it's
    // making for (shared/Events.ts marchAt); changed, saved and sent (heroes
    // on it go after it: HeroTasks); said as it sets off again
    private march(e: WorldEvent, now: number) {
        const at = marchAt(e, IBS.heroes.tasks.graph, now);
        if (!at || at.p == e.p) return;
        e.p = at.p;
        this.dirty.add(e);
        this.changed = true;
        if (at.p != marchTarget(e)) this.announce(e, `${eventTitle(e)} marches on towards ${this.nameOf(marchTarget(e))}, by way of ${this.nameOf(at.p)}`);
        else this.announce(e, `${eventTitle(e)} is closing in on ${this.nameOf(at.p)}! Stop it before it gets there`);
    }

    private nameOf(place: number) {
        return IBS.heroes.tasks.nameOf(place);
    }

    // the heroes loaded (signed in or working away) working on each event; changed, it's sent
    private countHeroes() {
        const counts = new Map<number, number>();
        for (const player of IBS.players.all()) for (const hero of player.heroes) {
            const w = hero.s.w;
            if (w?.k == TaskKind.EVENT && this.events.has(w.m)) counts.set(w.m, (counts.get(w.m) ?? 0) + 1);
        }
        for (const id of new Set([...counts.keys(), ...this.heroCounts.keys()]))
            if (counts.get(id) != this.heroCounts.get(id)) this.changed = true;
        this.heroCounts = counts;
    }

    // (also as the server stops: Engine.shutdown)
    public async save() {
        if (!this.dirty.size && !this.sharesDirty.size) return;
        const events = Array.from(this.dirty), shares = Array.from(this.sharesDirty);
        this.dirty.clear();
        this.sharesDirty.clear();
        const conn = await IBS.db.getConnection();
        try {
            for (const e of events)
                await conn.query("UPDATE world_event SET done = ?, state = ?, boon_until = ?, place = ? WHERE id = ?", [e.d, e.w, e.u ?? null, e.p, e.i]);
            const rows = shares.map((key) => key.split(":").map(Number)).map(([ev, id]) => [ev, id, this.shares.get(ev)?.get(id)]).filter((r) => r[2] != null);
            if (rows.length)
                await conn.query("INSERT INTO event_share (event_id, player_id, points) VALUES ? ON DUPLICATE KEY UPDATE points = VALUES(points)", [rows]);
        } finally {
            conn.release();
        }
    }

    //#endregion

}


