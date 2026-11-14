import { RowDataPacket } from "mysql2";
import { IBS } from "../../app";
import { S2C } from "../../constants/Routes";
import {
    CHEST_EVERY_MS, CHEST_FIRST_MS, CHEST_STAYS_MS, chestTier, ChestTier, DAILY_AGAIN_MS, DAILY_STAYS_MS, dailyTier, dayOf,
    MIMIC_HITS, MIMIC_LEAST_MS, MIMIC_MS, MIMIC_ODDS, nextStreak, rollChest,
} from "../../../../shared/Chests";
import { ALL_STEPS, Step, stepDone } from "../../../../shared/Guide";
import { Player } from "../player/Player";
import { Log } from "../../utils/Log";

// Loot chests (shared/Chests.ts): for each player signed in with a hero, when
// the next one turns up (CHEST_EVERY_MS from the last, or from signing in),
// and the one up now if there is one, till it's opened or its time's up.
// Kept only in memory: signing out forgets it (a chest is a treat for being
// here, not something owed). Its loot is rolled as it's opened, from their
// heroes as they are then, and goes into the stash as the guide's pay does.
// Besides: a mimic now and then (bites when clicked; beaten, a golden
// chest's loot), a daily chest (the first sign-in of a day, better the
// longer the streak: player.daily_day, daily_streak), and chests given for
// something done (a bounty: give), up next in turn.

interface Up { id: number; t: ChestTier; until: number; mimic?: boolean; bit?: number; daily?: number; }
interface Chests {
    next: number; up: Up; first: boolean;
    given: ChestTier[];                     // (given, waiting their turn)
    day: number; streak: number;            // (the last day a daily chest was opened, and the streak then)
    dailyAt: number;                        // (when today's daily chest is up next: 0 none due)
}

export class ChestManager {

    public static CHECK_MS = 1000;

    private of = new Map<number, Chests>();       // (player id)
    private nextId = 1;
    private since = 0;

    public async init() {
        const conn = await IBS.db.getConnection();
        try {
            for (const column of ["daily_day INT NULL", "daily_streak INT NULL"]) {
                try {
                    await conn.query(`ALTER TABLE player ADD COLUMN ${column}`);
                } catch (e) {
                    if ((e as any).errno != 1060) throw e;     // (already there)
                }
            }
        } finally {
            conn.release();
        }
    }

    private chests(player: Player, now = Date.now()) {
        let c = this.of.get(player.id);
        if (!c) this.of.set(player.id, c = { next: now + this.between(), up: null, first: false, given: [], day: 0, streak: 0, dailyAt: 0 });
        return c;
    }

    public update(deltaTime: number) {
        if ((this.since += deltaTime) < ChestManager.CHECK_MS) return;
        this.since = 0;
        const now = Date.now(), online = new Set<number>();
        for (const player of IBS.players.online()) {
            online.add(player.id);
            if (!player.heroes.length) continue;
            const c = this.chests(player, now);
            if (c.up && now >= c.up.until) {
                IBS.analytics.track.used(player, c.up.daily ? "DAILY_MISSED" : c.up.bit ? "MIMIC_ESCAPED" : "CHEST_MISSED");
                if (c.up.daily) c.dailyAt = now + DAILY_AGAIN_MS;       // (missed: up again later today)
                else if (!c.given.length) c.next = now + this.between();
                c.up = null;
                player.send({ r: S2C.PLAYER_CHEST, i: 0 });
            }
            if (c.up) continue;
            // (a new player: not till their first job is given and its silver chest has come)
            const dailyOk = stepDone(player.record.guide ?? ALL_STEPS, Step.GATHER) && !c.first;
            if (c.dailyAt && dailyOk && now >= c.dailyAt && dayOf(now) != c.day) this.offerDaily(player, c, now);
            else if (c.given.length) this.offer(player, c, now, c.given.shift(), false);
            else if (now >= c.next) {
                const t = c.first ? ChestTier.SILVER : chestTier(Math.random());
                this.offer(player, c, now, t, !c.first && Math.random() < MIMIC_ODDS);
                c.first = false;
            }
        }
        for (const id of this.of.keys()) if (!online.has(id)) this.of.delete(id);
    }

    // signed in: their daily streak loaded (today's chest due if it's not been
    // opened today), and the one up now resent if there's one (their client's new)
    public async signIn(player: Player) {
        const c = this.chests(player);
        const conn = await IBS.db.getConnection();
        try {
            const [rows] = await conn.query<RowDataPacket[]>("SELECT daily_day, daily_streak FROM player WHERE id = ?", [player.id]);
            c.day = Number(rows[0]?.daily_day ?? 0);
            c.streak = Number(rows[0]?.daily_streak ?? 0);
        } catch (e) {
            Log.error("Couldn't load the daily streak", e, { playerId: player.id });
            c.day = dayOf(Date.now());      // (not known: none today, rather than one twice)
        } finally {
            conn.release();
        }
        if (c.day != dayOf(Date.now()) && !c.dailyAt) c.dailyAt = Date.now() + 3000;
    }

    public resend(player: Player) {
        const up = this.of.get(player.id)?.up;
        if (up) player.send(this.offerMessage(up));
        this.sendDaily(player);
    }

    // the streak going now (one not opened yesterday or today: none) and whether today's is opened
    private sendDaily(player: Player) {
        const c = this.of.get(player.id), today = dayOf(Date.now());
        if (!c) return;
        const live = c.day == today || c.day == today - 1 ? c.streak : 0;
        player.send({ r: S2C.PLAYER_DAILY, s: live, t: c.day == today ? 1 : 0 });
    }

    // the first job given (the first steps): the first chest soon, a silver one
    public soon(player: Player) {
        const now = Date.now(), c = this.chests(player, now);
        c.first = true;
        c.next = Math.min(c.next, now + CHEST_FIRST_MS);
    }

    // a chest for something done (a bounty): up as soon as there's room
    public give(player: Player, t: ChestTier) {
        this.chests(player).given.push(t);
    }

    private offerMessage(up: Up) {
        return { r: S2C.PLAYER_CHEST, i: up.id, t: up.t, e: Math.max(0, up.until - Date.now()), ...(up.daily ? { d: up.daily } : {}) };
    }

    private offer(player: Player, c: Chests, now: number, t: ChestTier, mimic: boolean) {
        c.up = { id: this.nextId++, t, until: now + CHEST_STAYS_MS, ...(mimic ? { mimic } : {}) };
        IBS.analytics.track.used(player, mimic ? "CHEST_UP_MIMIC" : `CHEST_UP_${t}`);
        player.send(this.offerMessage(c.up));
    }

    // (shown as the tier it'll be: the streak it makes)
    private offerDaily(player: Player, c: Chests, now: number) {
        const today = dayOf(now), streak = nextStreak(today, c.day, c.streak);
        c.dailyAt = 0;
        c.up = { id: this.nextId++, t: dailyTier(streak), until: now + DAILY_STAYS_MS, daily: streak };
        IBS.analytics.track.used(player, "DAILY_UP");
        player.send(this.offerMessage(c.up));
    }

    // the one up opened: rolled, into the stash, told (a mimic bites first: b, it's beaten)
    public open(player: Player, id: any, beaten: any) {
        const c = this.of.get(player.id), up = c?.up, now = Date.now();
        if (!up || up.id !== id || now >= up.until) {
            player.send({ r: S2C.PLAYER_CHEST, i: 0 });
            return;
        }
        if (up.mimic && !up.bit) {
            up.bit = now;
            up.until = now + MIMIC_MS;
            player.send({ r: S2C.PLAYER_CHEST_MIMIC, i: up.id, n: MIMIC_HITS, e: MIMIC_MS });
            return;
        }
        if (up.mimic && (!beaten || now - up.bit < MIMIC_LEAST_MS)) return;
        c.up = null;
        if (!c.given.length) c.next = Math.max(c.next, now + this.between());
        const t = up.mimic ? ChestTier.GOLDEN : up.t;
        const loot = rollChest(t, player.heroes.map((h) => h.d));
        if (up.mimic) loot.x = 1;
        IBS.analytics.track.used(player, up.mimic ? "MIMIC_BEATEN" : up.daily ? `DAILY_STREAK_${Math.min(7, up.daily)}` : `CHEST_OPENED_${up.t}`);
        if (up.daily) {
            loot.d = up.daily;
            c.day = dayOf(now);
            c.streak = up.daily;
            this.saveDaily(player.id, c.day, c.streak).catch(Log.catch("Couldn't save the daily streak", { playerId: player.id }));
            this.sendDaily(player);
        }
        const inv = player.inventory;
        inv.adjustGold(loot.g);
        for (const [item, n] of loot.m) inv.adjustItem(item, n);
        player.stashDirty = true;
        IBS.heroes.tasks.sendStash(player);
        player.send({ r: S2C.PLAYER_CHEST_OPENED, i: up.id, l: loot });
    }

    private async saveDaily(id: number, day: number, streak: number) {
        const conn = await IBS.db.getConnection();
        try {
            await conn.query("UPDATE player SET daily_day = ?, daily_streak = ? WHERE id = ?", [day, streak, id]);
        } finally {
            conn.release();
        }
    }

    private between() {
        const [least, most] = CHEST_EVERY_MS;
        return least + Math.random() * (most - least);
    }

}
