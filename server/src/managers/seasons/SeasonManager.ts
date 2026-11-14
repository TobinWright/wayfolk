import { RowDataPacket } from "mysql2";
import { IBS } from "../../app";
import { S2C } from "../../constants/Routes";
import { SEASON_SCENES } from "../../../../shared/Scenes";
import {
    Deed, DEED_POINTS, guildTitle, Season, SEASON_GUILDS, SEASON_TAKE_PART, SEASON_TITLED, seasonAt, seasonName, SeasonState,
    seasonTitle, seasonOf,
} from "../../../../shared/Seasons";
import { Player } from "../player/Player";
import { Log } from "../../utils/Log";

// Seasons (shared/Seasons.ts). What heroes do comes in here as deeds (did):
// points on the season's board for their player, and on to their guild's
// weekly goals (GuildManager.did). This season's points are kept in memory
// (`season_score`, saved every SAVE_MS) and the board's built from them.
// As a season ends (looked for every TICK_MS, and on starting for any the
// server was down through) it's finished: its top players get a title, all
// with SEASON_TAKE_PART points its kind's backdrop, the top guilds' members a
// guild title (`season_reward`; `season_done` so it's done once), said in
// General. What a player's earned is loaded as they sign in (Player.season).

type Row = RowDataPacket & { [key: string]: any };

export enum RewardKind { TITLE, BACKDROP }

export class SeasonManager {

    public static SAVE_MS = 10000;
    public static TICK_MS = 60000;

    private season: Season;
    private points = new Map<number, number>();     // (player id: this season's points)
    private dirty = new Set<number>();
    private sendSoon = new Set<number>();            // (players to send their state to, signed in)
    private champions: [number, string[]] = null;    // the last season over and its top 3 (their monuments)

    public async init() {
        await this.query(`CREATE TABLE IF NOT EXISTS season_score (
            season INT NOT NULL,
            player_id INT NOT NULL,
            points DOUBLE NOT NULL DEFAULT 0,
            PRIMARY KEY (season, player_id),
            INDEX (player_id))`);
        await this.query(`CREATE TABLE IF NOT EXISTS season_reward (
            player_id INT NOT NULL,
            kind TINYINT NOT NULL,
            season INT NOT NULL,
            value VARCHAR(64) NOT NULL,
            PRIMARY KEY (player_id, kind, season))`);
        await this.query(`CREATE TABLE IF NOT EXISTS season_done (
            season INT NOT NULL PRIMARY KEY,
            at DATETIME NOT NULL)`);
        try {
            await this.query("ALTER TABLE player ADD COLUMN title VARCHAR(64) NULL");
        } catch (e) {
            if ((e as any).errno != 1060) throw e;     // (already there)
        }

        this.season = seasonAt(Date.now());
        // (any season gone by that wasn't finished: the server was down as it ended)
        for (const r of await this.query(
            "SELECT DISTINCT s.season FROM season_score s LEFT JOIN season_done d ON d.season = s.season WHERE d.season IS NULL AND s.season < ? ORDER BY s.season",
            [this.season.n]))
            await this.finish(r.season);
        await this.loadChampions();
        for (const r of await this.query("SELECT player_id, points FROM season_score WHERE season = ?", [this.season.n]))
            this.points.set(r.player_id, Number(r.points));
        setInterval(() => this.save().catch(Log.catch("Couldn't save the season's points")), SeasonManager.SAVE_MS);
        setInterval(() => this.tick().catch(Log.catch("Couldn't turn the season")), SeasonManager.TICK_MS);
        Log.info(`Season: ${seasonName(this.season.n)}, ${this.points.size} on its board`);
    }

    private async query(sql: string, args: any[] = []): Promise<Row[]> {
        const conn = await IBS.db.getConnection();
        try {
            const [result] = await conn.query(sql, args);
            return result as Row[];
        } finally {
            conn.release();
        }
    }

    //#region deeds

    // something a hero of theirs did, `n` times (or points, at an event)
    public did(player: Player, deed: Deed, n = 1) {
        if (!player || !(n > 0)) return;
        if (seasonAt(Date.now()).n == this.season.n) {
            this.points.set(player.id, (this.points.get(player.id) ?? 0) + n * DEED_POINTS[deed]);
            this.dirty.add(player.id);
            if (player.online) this.sendSoon.add(player.id);
        }
        IBS.guilds.did(player, deed, n);
    }

    // this season's points, by player
    public scores(): [number, number][] {
        return Array.from(this.points);
    }

    public async save() {
        if (!this.dirty.size) return;
        const rows = Array.from(this.dirty, (id) => [this.season.n, id, this.points.get(id) ?? 0]);
        this.dirty.clear();
        await this.query("INSERT INTO season_score (season, player_id, points) VALUES ? ON DUPLICATE KEY UPDATE points = VALUES(points)", [rows]);
    }

    // the last season over's champions, first to third, by their names now
    private async loadChampions() {
        const last = (await this.query("SELECT MAX(season) n FROM season_done"))[0]?.n;
        if (last == null) { this.champions = null; return; }
        const rows = await this.query(
            "SELECT p.display_name FROM season_score s JOIN player p ON p.id = s.player_id WHERE s.season = ? AND s.points > 0 ORDER BY s.points DESC, s.player_id LIMIT 3",
            [last]);
        this.champions = [Number(last), rows.map((r) => r.display_name)];
    }

    //#endregion

    //#region turning

    private async tick() {
        for (const id of this.sendSoon) { const p = IBS.players.getById(id); if (p?.online) this.send(p); }
        this.sendSoon.clear();
        const now = seasonAt(Date.now());
        if (now.n == this.season.n) return;
        await this.save();
        const ended = this.season.n;
        this.season = now;
        this.points.clear();
        await this.finish(ended);
        await this.loadChampions();
        IBS.chat.from("Season", `${seasonName(now.n)} has begun: see its board in Leaderboards`);
        for (const p of IBS.players.online()) this.send(p);
    }

    // a season over: its rewards given out (once) and said
    private async finish(n: number) {
        if ((await this.query("SELECT 1 FROM season_done WHERE season = ?", [n])).length) return;
        const kind = seasonOf(n).k, scene = SEASON_SCENES[kind];
        const rows = await this.query(
            "SELECT s.player_id, s.points, p.display_name FROM season_score s JOIN player p ON p.id = s.player_id WHERE s.season = ? AND s.points > 0 ORDER BY s.points DESC, s.player_id",
            [n]);
        const rewards: [number, RewardKind, number, string][] = [];
        rows.slice(0, SEASON_TITLED).forEach((r, k) => rewards.push([r.player_id, RewardKind.TITLE, n, seasonTitle(n, k + 1)]));
        for (const r of rows) if (Number(r.points) >= SEASON_TAKE_PART) rewards.push([r.player_id, RewardKind.BACKDROP, n, `${scene}`]);

        // the top guilds by their members' points together (as they are now)
        const guilds = await this.query(
            `SELECT m.guild_id, SUM(s.points) pts FROM season_score s JOIN guild_member m ON m.player_id = s.player_id
             WHERE s.season = ? GROUP BY m.guild_id HAVING pts > 0 ORDER BY pts DESC LIMIT ?`, [n, SEASON_GUILDS]);
        const guildNames: string[] = [];
        for (const g of guilds) {
            const name = IBS.guilds.nameOf(g.guild_id);
            if (name) guildNames.push(name);
            for (const m of await this.query("SELECT player_id FROM guild_member WHERE guild_id = ?", [g.guild_id]))
                rewards.push([m.player_id, RewardKind.TITLE, -1 - n, guildTitle(n)]);     // (a guild title: its season stored as -1 - n, kept apart from their own)
        }

        const conn = await IBS.db.getConnection();
        try {
            await conn.beginTransaction();
            if (rewards.length) await conn.query("INSERT IGNORE INTO season_reward (player_id, kind, season, value) VALUES ?", [rewards]);
            await conn.query("INSERT INTO season_done (season, at) VALUES (?, ?)", [n, new Date()]);
            await conn.commit();
        } catch (e) {
            await conn.rollback().catch(() => { });
            throw e;
        } finally {
            conn.release();
        }

        const top = rows.slice(0, 3).map((r) => r.display_name).join(", ");
        IBS.chat.from("Season", `${seasonName(n)} is over!${top ? ` Its champions: ${top}.` : ""}${guildNames.length ? ` Top guilds: ${guildNames.join(", ")}.` : ""} Titles and backdrops are given out (Cosmetics, in a hero's status)`);
        Log.info(`Season ${seasonName(n)} finished: ${rewards.length} rewards`);

        // those signed in: what they've earned loaded again
        for (const p of IBS.players.online()) if (rewards.some(([id]) => id == p.id)) await this.signIn(p);
    }

    //#endregion

    //#region a player's

    // signing in: what they've earned (titles, backdrops) and the title they show
    public async signIn(player: Player) {
        const titles: string[] = [], scenes: number[] = [];
        for (const r of await this.query("SELECT kind, season, value FROM season_reward WHERE player_id = ? ORDER BY season", [player.id])) {
            if (r.kind == RewardKind.TITLE) titles.push(r.value);
            else if (r.kind == RewardKind.BACKDROP && !scenes.includes(Number(r.value))) scenes.push(Number(r.value));
        }
        const shown = (await this.query("SELECT title FROM player WHERE id = ?", [player.id]))[0]?.title ?? null;
        player.season = { titles, scenes, title: titles.includes(shown) ? shown : null };
        if (player.online) this.send(player);
    }

    public state(player: Player): SeasonState {
        const points = this.points.get(player.id) ?? 0;
        let rank = 0;
        if (points > 0) { rank = 1; for (const v of this.points.values()) if (v > points) rank++; }
        const s = player.season;
        return { n: this.season.n, p: Math.floor(points), r: rank, t: s?.titles ?? [], h: s?.title ? s.titles.indexOf(s.title) : -1, b: s?.scenes ?? [], m: this.champions ?? undefined };
    }

    public send(player: Player) {
        player.send({ r: S2C.SEASON, s: this.state(player) });
    }

    // the title shown by their name in the chat (none: null)
    public titleOf(player: Player) {
        return player.season?.title ?? null;
    }

    // the backdrops they've earned (Wardrobe Access.earned)
    public earned(player: Player) {
        return player.season?.scenes ?? [];
    }

    // one of their titles picked to show (-1: none)
    public async pickTitle(player: Player, t: any) {
        const s = player.season;
        if (!s || !Number.isInteger(t)) return;
        const title = t >= 0 ? s.titles[t] ?? null : null;
        if (t >= 0 && !title) return;
        s.title = title;
        await this.query("UPDATE player SET title = ? WHERE id = ?", [title, player.id]);
        this.send(player);
    }

    // An account being deleted (AccountManager): out of this season's board
    public forget(player: Player) {
        this.points.delete(player.id);
        this.dirty.delete(player.id);
        this.sendSoon.delete(player.id);
    }

    //#endregion

}
