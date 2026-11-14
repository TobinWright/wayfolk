import { RowDataPacket } from "mysql2";
import { IBS } from "../../app";
import { AWAY_CHOICES, awayStart, awaySummary, AwaySnap, AWAY_LEAST_MS } from "../../../../shared/Away";
import { Player } from "../player/Player";
import { Hero } from "./HeroManager";
import { Log } from "../../utils/Log";

// The away summary (shared/Away.ts): a snapshot taken as a player signs out
// (Player.away), saved with their heroes (`player_away`, so a restart keeps
// it), their fights counted into it meanwhile, and as they sign in held up
// against how things are now and sent (HERO_AWAY, AuthConnection), then forgotten.

export class HeroAway {

    public async init() {
        const conn = await IBS.db.getConnection();
        try {
            await conn.query(`CREATE TABLE IF NOT EXISTS player_away (
                player_id INT PRIMARY KEY,
                snap MEDIUMTEXT NOT NULL)`);
        } finally {
            conn.release();
        }
    }

    // signing out: how things are now
    public take(player: Player) {
        const h: AwaySnap["h"] = {};
        for (const hero of player.heroes) h[hero.id] = awayStart(hero.d);
        const inv = player.inventory;
        player.away = { at: Date.now(), g: inv.gold, i: Array.from(inv.items.values(), (it) => [it.id, it.amount] as [number, number]), h };
    }

    // loading them: the one they signed out with (none: null)
    public async load(playerId: number): Promise<AwaySnap> {
        const conn = await IBS.db.getConnection();
        try {
            const [rows] = await conn.query<RowDataPacket[]>("SELECT snap FROM player_away WHERE player_id = ?", [playerId]);
            return rows.length ? JSON.parse(rows[0].snap) : null;
        } catch (e) {
            Log.error("Couldn't read an away snapshot", e, { playerId });
            return null;
        } finally {
            conn.release();
        }
    }

    // (with their heroes, signed out)
    public async save(player: Player) {
        if (!player.away || player.online) return;
        const conn = await IBS.db.getConnection();
        try {
            await conn.query("REPLACE INTO player_away (player_id, snap) VALUES (?, ?)", [player.id, JSON.stringify(player.away)]);
        } finally {
            conn.release();
        }
    }

    // a fight a hero of someone signed out was in
    public fought(hero: Hero, won: boolean) {
        for (const player of IBS.players.all()) {
            if (player.online || !player.away) continue;
            const start = player.away.h[hero.id];
            if (!start) continue;
            if (won) start.w++;
            else start.l++;
            return;
        }
    }

    // a moment on the road a hero of theirs met signed out (as said in their journal)
    public chose(player: Player, hero: Hero, line: string) {
        const start = !player.online && player.away?.h[hero.id];
        if (!start) return;
        (start.c ??= []).push(line);
        if (start.c.length > AWAY_CHOICES) start.c.shift();
        start.cn = (start.cn ?? 0) + 1;
    }

    // signing in (their heroes worked out to now, before awayUntil's cleared):
    // what happened, if they were away long enough (null: nothing to tell)
    public summary(player: Player) {
        const snap = player.away;
        player.away = null;
        if (!snap) return null;
        this.forget(player.id).catch(Log.catch("Couldn't forget an away snapshot", { playerId: player.id }));
        const now = Date.now();
        if (now - snap.at < AWAY_LEAST_MS) return null;
        const stash = new Map(Array.from(player.inventory.items.values(), (it) => [it.id, it.amount] as [number, number]));
        return awaySummary(snap, now, player.awayUntil || now, player.inventory.gold, stash, player.heroes);
    }

    private async forget(playerId: number) {
        const conn = await IBS.db.getConnection();
        try {
            await conn.query("DELETE FROM player_away WHERE player_id = ?", [playerId]);
        } finally {
            conn.release();
        }
    }

}
