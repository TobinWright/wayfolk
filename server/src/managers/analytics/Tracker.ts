import { ResultSetHeader, RowDataPacket } from "mysql2";
import { WINDOW_MARK } from "../../../../shared/Analytics";
import { IBS } from "../../app";
import { Player } from "../player/Player";
import { Log } from "../../utils/Log";

type Row = RowDataPacket & { [key: string]: any };

const BEAT_MS = 5 * 60 * 1000;          // sessions under way saved this often (a crash loses no more)
const FLUSH_MS = 60 * 1000;             // what's been used, saved this often
const FRESH_MS = 60 * 1000;             // (and both before the Analytics, if not this recently)
const FIRST_MS = 10 * 60 * 1000;        // a session this soon after the account's made is their first
const KEEP_USES_DAYS = 90;
const DEVICES = new Set(["desktop", "tablet", "phone"]);

// a session under way: since `at` they've been playing (`on`) or idle, and
// before it `busy` and `idle` ms of each
interface Live { id: Promise<number>; start: number; on: boolean; at: number; busy: number; idle: number; }

// What players do, recorded as they do it for the Analytics (the user,
// 2026-11-01: "track everything I need to make this game a success, that
// includes idling time"; shared/Analytics.ts):
//
// - A row a sign-in (play_session): when it began and ended, how much of it
//   they were playing and how much idle (the client says as it changes:
//   C2S.ANALYTICS_PRESENCE), how long they'd been away, and how much of that
//   their heroes had stopped (past HeroTasks.awayFor), their device and,
//   from the address they came by, where from. Saved as it ends and every
//   BEAT_MS meanwhile (one left open by a crash is closed as it starts).
// - Every window opened (C2S.ANALYTICS_OPENED) and every message sent (its
//   route), counted a player a day (feature_use), saved every FLUSH_MS.
export class Tracker {

    private live = new Map<number, Live>();         // (player id)
    private uses = new Map<string, number>();       // ("day|feature|player id": uses since the last save)
    private beaten = 0;                              // (when the sessions under way were last saved)

    public async init() {
        await this.query(`CREATE TABLE IF NOT EXISTS play_session (
            id BIGINT AUTO_INCREMENT PRIMARY KEY,
            player_id INT NOT NULL,
            started_at DATETIME NOT NULL,
            ended_at DATETIME NOT NULL,
            busy_s INT NOT NULL DEFAULT 0,
            idle_s INT NOT NULL DEFAULT 0,
            away_s INT NULL,
            stalled_s INT NOT NULL DEFAULT 0,
            first TINYINT NOT NULL DEFAULT 0,
            device VARCHAR(8) NOT NULL DEFAULT '',
            source VARCHAR(32) NOT NULL DEFAULT '',
            open TINYINT NOT NULL DEFAULT 1,
            INDEX (player_id, id),
            INDEX (started_at))`);
        await this.query(`CREATE TABLE IF NOT EXISTS feature_use (
            day DATE NOT NULL,
            feature VARCHAR(40) NOT NULL,
            player_id INT NOT NULL,
            uses INT NOT NULL,
            PRIMARY KEY (day, feature, player_id),
            INDEX (player_id))`);
        await this.query("UPDATE play_session SET open = 0 WHERE open = 1");     // (left by a crash: ended at their last beat)
        await this.query("DELETE FROM feature_use WHERE day < ?", [new Date(Date.now() - KEEP_USES_DAYS * 24 * 60 * 60 * 1000)]);
        setInterval(() => this.beat().catch(Log.catch("Couldn't save the sessions")), BEAT_MS);
        setInterval(() => this.flush().catch(Log.catch("Couldn't save what's used")), FLUSH_MS);
    }

    private async query(sql: string, values: any[] = []): Promise<any> {
        const conn = await IBS.db.getConnection();
        try {
            const [rows] = await conn.query(sql, values);
            return rows;
        } finally {
            conn.release();
        }
    }

    //#region === Sessions ===

    // signed in (Player.attach, before awayUntil's cleared: it's when their heroes stopped)
    public signedIn(player: Player) {
        this.end(player.id);
        const now = Date.now();
        const live: Live = { id: null, start: now, on: true, at: now, busy: 0, idle: 0 };
        live.id = this.open(player, now, player.heroes.length ? player.awayUntil : 0).catch((e) => {
            Log.error("Couldn't start a session", e, { playerId: player.id });
            return 0;
        });
        this.live.set(player.id, live);
    }

    private async open(player: Player, now: number, heroesUntil: number): Promise<number> {
        const [last] = await this.query("SELECT ended_at FROM play_session WHERE player_id = ? ORDER BY id DESC LIMIT 1", [player.id]) as Row[];
        let away: number = null, stalled = 0, first = 0;
        if (last) {
            const ended = new Date(last.ended_at).getTime();
            away = Math.max(0, now - ended);
            if (heroesUntil && heroesUntil < now) stalled = Math.min(away, now - Math.max(heroesUntil, ended));
        } else first = now - new Date(player.record.createdAt).getTime() < FIRST_MS ? 1 : 0;
        const at = new Date(now);
        const done = await this.query("INSERT INTO play_session (player_id, started_at, ended_at, away_s, stalled_s, first) VALUES (?, ?, ?, ?, ?, ?)",
            [player.id, at, at, away == null ? null : Math.round(away / 1000), Math.round(stalled / 1000), first]) as ResultSetHeader;
        return done.insertId;
    }

    // C2S.ANALYTICS_HELLO
    public hello(player: Player, device: any, source: any) {
        const live = this.live.get(player.id);
        if (!live) return;
        const d = DEVICES.has(device) ? device : "";
        const s = String(source ?? "").toLowerCase().replace(/[^a-z0-9.\-_]/g, "").slice(0, 32);
        live.id.then((id) => id && this.query("UPDATE play_session SET device = ?, source = ? WHERE id = ?", [d, s, id]))
            .catch(Log.catch("Couldn't save a session's device", { playerId: player.id }));
    }

    // C2S.ANALYTICS_PRESENCE: playing, or idle (the tab hidden, nothing pressed)
    public presence(player: Player, on: boolean) {
        const live = this.live.get(player.id);
        if (!live || live.on == on) return;
        this.tally(live, Date.now());
        live.on = on;
    }

    private tally(live: Live, now: number) {
        const ms = Math.max(0, now - live.at);
        if (live.on) live.busy += ms; else live.idle += ms;
        live.at = now;
    }

    // signed out (Player.detach): saved, ended
    public signedOut(player: Player) {
        this.end(player.id);
    }

    private end(playerId: number, now = Date.now()) {
        const live = this.live.get(playerId);
        if (!live) return Promise.resolve();
        this.live.delete(playerId);
        return this.save(live, now, true).catch(Log.catch("Couldn't end a session", { playerId }));
    }

    private async save(live: Live, now: number, ended: boolean) {
        this.tally(live, now);
        const id = await live.id;
        if (!id) return;
        await this.query("UPDATE play_session SET ended_at = ?, busy_s = ?, idle_s = ?, open = ? WHERE id = ?",
            [new Date(now), Math.round(live.busy / 1000), Math.round(live.idle / 1000), ended ? 0 : 1, id]);
    }

    private async beat() {
        const now = Date.now();
        this.beaten = now;
        for (const live of this.live.values()) await this.save(live, now, false);
    }

    // everything saved, the sessions under way to now - before the Analytics
    // reads them (at most every FRESH_MS: the rows of the minute before do)
    public async freshen() {
        if (Date.now() - this.beaten >= FRESH_MS) await this.beat();
        await this.flush();
    }

    //#endregion

    //#region === Features ===

    // a message they sent (NetworkManager: its route's name)
    public used(player: Player, feature: string) {
        if (feature.startsWith("ANALYTICS_")) return;
        const key = `${today()}|${feature}|${player.id}`;
        this.uses.set(key, (this.uses.get(key) ?? 0) + 1);
    }

    // C2S.ANALYTICS_OPENED
    public opened(player: Player, window: any) {
        if (typeof window != "string" || !/^[A-Z_]{1,32}$/.test(window)) return;
        this.used(player, WINDOW_MARK + window);
    }

    private async flush() {
        if (!this.uses.size) return;
        const rows = Array.from(this.uses.entries()).map(([key, n]) => [...key.split("|"), n]);
        this.uses.clear();
        for (let k = 0; k < rows.length; k += 500)
            await this.query("INSERT INTO feature_use (day, feature, player_id, uses) VALUES ? ON DUPLICATE KEY UPDATE uses = uses + VALUES(uses)", [rows.slice(k, k + 500)]);
    }

    //#endregion

    // their account's being deleted (PlayerManager.drop): nothing more saved of them
    public drop(playerId: number) {
        this.live.delete(playerId);
        for (const key of Array.from(this.uses.keys())) if (key.endsWith(`|${playerId}`)) this.uses.delete(key);
    }

    // the server's stopping (Engine.shutdown): every session ended, what's used saved
    public async shutdown() {
        const now = Date.now();
        await Promise.all(Array.from(this.live.keys()).map((id) => this.end(id, now)));
        await this.flush().catch(Log.catch("Shutdown: couldn't save what's used"));
    }

}

// the day as the database keeps it ("2026-11-01", the server's time, as mysql2 sends dates)
function today() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
