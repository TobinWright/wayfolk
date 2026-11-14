import { ResultSetHeader, RowDataPacket } from "mysql2";
import { IBS } from "../../app";
import { Role } from "../../constants/Constants";
import { S2C } from "../../constants/Routes";
import {
    AUTO_MUTE_MS, CHANNELS, CHAT_GAP_MS, CHAT_KEPT, CHAT_LONGEST, ChatLine, cleanChat, CONTEXT_LINES, minutesText, MOD_COMMANDS,
    MUTE_MOST_MIN, REPORT_REASONS, REPORT_WINDOW_MS, REPORTER_AGE_MS, REPORTS_AN_HOUR, REPORTS_TO_MUTE, SAME_LINE_MS,
} from "../../../../shared/Chat";
import { chatRefusal } from "../../../../shared/ChatFilter";
import { PlayerRecord } from "../database/PlayerRecord";
import { Player } from "../player/Player";
import { Log } from "../../utils/Log";

// Chat (shared/Chat.ts): a line said in a channel goes to everyone signed
// in; the last CHAT_KEPT a channel are kept (in memory, gone when the server
// restarts) and sent with signing in.
// Chat safety (shared/Chat.ts, ChatFilter.ts): lines with a slur or telling
// someone to hurt themselves refused (`refusal`, the game rooms' and whispers'
// too), the same line again too soon refused, the muted (player.chat_muted_until)
// saying nothing in the channels. Reports of a line go in `chat_report` with
// the lines before it, told to the moderators signed in; enough of them from
// established players mutes someone for a while. Moderators' commands start "/".

interface Said { t: string; a: number; }

export class ChatManager {

    private kept: ChatLine[][] = CHANNELS.map((): ChatLine[] => []);
    private next = 1;                                   // (the next line's number, ChatLine.k)
    private lastSaid = new Map<number, Said>();         // (player id: their last line and when)
    private reportsBy = new Map<number, number[]>();    // (player id: when they reported, the last hour)
    private reported = new Set<string>();               // ("reporter:line number": reported already)
    private reportsOf = new Map<number, { by: number; a: number }[]>();     // (player id: established players' reports of them, the last REPORT_WINDOW_MS)

    public async init() {
        const conn = await IBS.db.getConnection();
        try {
            await conn.query(`CREATE TABLE IF NOT EXISTS chat_report (
                id INT AUTO_INCREMENT PRIMARY KEY,
                at DATETIME NOT NULL,
                reporter_id INT NOT NULL,
                reported_id INT NOT NULL,
                channel TINYINT NOT NULL,
                reason TINYINT NOT NULL,
                line VARCHAR(255) NOT NULL,
                context TEXT NOT NULL,
                done TINYINT NOT NULL DEFAULT 0,
                INDEX (done), INDEX (reported_id))`);
            try {
                await conn.query("ALTER TABLE player ADD COLUMN chat_muted_until BIGINT NOT NULL DEFAULT 0");
            } catch (e) {
                if ((e as any).errno != 1060) throw e;     // (already there)
            }
        } finally {
            conn.release();
        }
    }

    public say(player: Player, channel: any, text: any) {
        const t = cleanChat(text);
        if (!t) return;
        if (t.startsWith("/")) return this.command(player, t).catch(Log.catch("Chat command", { playerId: player.id }));
        if (!Number.isInteger(channel) || !CHANNELS[channel]) return;
        const now = Date.now(), last = this.lastSaid.get(player.id);
        if (now - (last?.a ?? 0) < CHAT_GAP_MS) return;
        const why = this.refusal(player, t, true) || (last && last.t == t && now - last.a < SAME_LINE_MS ? "You just said that" : "");
        if (why) return this.note(player, why, true);
        this.lastSaid.set(player.id, { t, a: now });

        const line: ChatLine = { c: channel, n: player.record.displayName, t, a: now, i: player.id, k: this.next++ };
        const mark = player.record.chatMark(), tag = IBS.guilds.tagOf(player.id);
        if (mark) line.p = mark;
        if (tag) line.g = tag;
        const title = IBS.seasons.titleOf(player);
        if (title) line.h = title;
        this.keep(line);
    }

    // why `player` can't say `t` ("": they can); `muting`, where being muted stops it
    public refusal(player: Player, t: string, muting: boolean) {
        const muted = player.record.mutedUntil - Date.now();
        if (muting && muted > 0) return `You're muted in the chat for ${minutesText(muted)} more`;
        return chatRefusal(t);
    }

    // a line about an event (shared/Events.ts) from "Event", to everyone signed in; not
    // kept, as it isn't in the chat (the client slides it in by itself: EventNotices)
    public event(text: string, event?: number) {
        this.send({ c: 0, n: "Event", t: text.slice(0, CHAT_LONGEST * 2), a: Date.now(), e: 1, v: event });
    }

    // a line from the game in General, from `who` ("Season"), marked as the events' are
    public from(who: string, text: string) {
        this.keep({ c: 0, n: who, t: text.slice(0, CHAT_LONGEST * 2), a: Date.now(), e: 1 });
    }

    // an admin's line to everyone (the admin panel), in General from "Announcement", marked as the events' are
    public announce(text: string) {
        this.keep({ c: 0, n: "Announcement", t: text, a: Date.now(), e: 1 });
    }

    private keep(line: ChatLine) {
        const kept = this.kept[line.c];
        kept.push(line);
        if (kept.length > CHAT_KEPT) kept.shift();
        this.send(line);
    }

    private send(line: ChatLine) {
        // (not to anyone who's blocked them; those kept and sent with signing in, the client leaves out)
        for (const p of IBS.players.online()) if (!line.i || !p.social?.blocks.has(line.i)) p.send({ r: S2C.CHAT_SAID, l: line });
    }

    // every channel's kept lines, and their guild's (shared/Guilds.ts), oldest first
    public recent(player: Player) {
        return ([] as ChatLine[]).concat(...this.kept, IBS.guilds.linesOf(player.id)).sort((a, b) => a.a - b.a);
    }

    // each channel's kept lines, oldest first (no guild's): the stats page's (StatsPage)
    public channelLines() {
        return this.kept.map((lines) => lines.slice());
    }

    // An account being deleted (AccountManager): its lines out of what's
    // kept (and sent to those signing in), and what's kept of it here.
    // Reports by or of it go with the rest of the account.
    public forget(player: Player) {
        this.kept = this.kept.map((lines) => lines.filter((l) => l.i != player.id));
        this.lastSaid.delete(player.id);
        this.reportsBy.delete(player.id);
        this.reportsOf.delete(player.id);
    }

    // a number for a line said elsewhere (a guild's chat), to report it by
    public nextNumber() {
        return this.next++;
    }

    // a line in their chat for them only (`warn`: something they couldn't do)
    public note(player: Player, text: string, warn = false) {
        player.send({ r: S2C.CHAT_NOTE, t: text, w: warn ? 1 : 0 });
    }

    private moderators() {
        return IBS.players.online().filter((p) => p.record.role >= Role.MODERATOR);
    }

    //#region reports

    public async report(player: Player, k: any, w: any) {
        if (!Number.isInteger(k) || !Number.isInteger(w) || !REPORT_REASONS[w]) return;
        const kept = [...this.kept, IBS.guilds.linesOf(player.id)].find((lines) => lines.some((l) => l.k == k));
        const at = kept?.findIndex((l) => l.k == k) ?? -1, line = kept?.[at];
        if (!line) return this.note(player, "That line's too old to report now", true);
        if (!line.i || line.i == player.id) return;
        const key = `${player.id}:${k}`;
        if (this.reported.has(key)) return this.note(player, "You've reported that line already", true);
        const now = Date.now(), mine = (this.reportsBy.get(player.id) ?? []).filter((a) => now - a < 60 * 60 * 1000);
        if (mine.length >= REPORTS_AN_HOUR) return this.note(player, "You've sent a lot of reports - try again in a while", true);
        mine.push(now);
        this.reportsBy.set(player.id, mine);
        this.reported.add(key);

        const context = kept.slice(Math.max(0, at - CONTEXT_LINES), at + 1).map((l) => `${l.n}: ${l.t}`).join("\n");
        const conn = await IBS.db.getConnection();
        let id = 0;
        try {
            const [result] = await conn.query<ResultSetHeader>(
                "INSERT INTO chat_report (at, reporter_id, reported_id, channel, reason, line, context) VALUES (?, ?, ?, ?, ?, ?, ?)",
                [new Date(now), player.id, line.i, line.c, w, line.t, context]);
            id = result.insertId;
        } finally {
            conn.release();
        }
        this.note(player, `Reported ${line.n} for ${REPORT_REASONS[w].toLowerCase()}. Thanks - a moderator will look at it. Block them to stop seeing what they say`);
        for (const mod of this.moderators())
            this.note(mod, `Report #${id}: ${player.record.displayName} reported ${line.n} (${REPORT_REASONS[w]}): "${line.t}"`);

        // (only established players' reports count towards muting: a new account's can't)
        if (now - new Date(player.record.createdAt).getTime() < REPORTER_AGE_MS) return;
        const against = (this.reportsOf.get(line.i) ?? []).filter((r) => now - r.a < REPORT_WINDOW_MS && r.by != player.id);
        against.push({ by: player.id, a: now });
        this.reportsOf.set(line.i, against);
        if (against.length >= REPORTS_TO_MUTE) {
            this.reportsOf.delete(line.i);
            await this.autoMute(line.i, line.n);
        }
    }

    // muted for AUTO_MUTE_MS after reports from REPORTS_TO_MUTE players (not a moderator, nor one muted already)
    private async autoMute(id: number, name: string) {
        const loaded = IBS.players.getById(id);
        const record = loaded?.record ?? await PlayerRecord.Load(id).catch((): PlayerRecord => null);
        if (!record || record.role >= Role.MODERATOR || record.mutedUntil > Date.now()) return;
        await this.mute(id, Date.now() + AUTO_MUTE_MS, "after reports from other players");
        for (const mod of this.moderators()) this.note(mod, `${name} was muted for ${minutesText(AUTO_MUTE_MS)} after ${REPORTS_TO_MUTE} reports`);
    }

    // muted till `until` (0: not), saved and told them if they're about
    public async mute(id: number, until: number, why: string) {
        await PlayerRecord.SetMuted(id, until);
        const them = IBS.players.getById(id);
        if (!them) return;
        them.record.mutedUntil = until;
        if (until > Date.now()) this.note(them, `You've been muted in the chat for ${minutesText(until - Date.now())}${why ? ` (${why})` : ""}`, true);
        else this.note(them, "You can talk in the chat again");
    }

    //#endregion

    //#region moderators' commands

    private async command(player: Player, t: string) {
        const [word, ...rest] = t.split(" ");
        if (player.record.role < Role.MODERATOR) return this.note(player, "Commands are for moderators", true);
        switch (word.toLowerCase()) {
            case "/mute": {
                const n = rest.findIndex((w) => /^\d+$/.test(w));
                const name = rest.slice(0, n < 0 ? rest.length : n).join(" "), minutes = n < 0 ? NaN : Number(rest[n]);
                if (!name || !(minutes > 0)) return this.note(player, "/mute name minutes (reason)", true);
                const why = rest.slice(n + 1).join(" ");
                const target = await this.find(name);
                if (!target) return this.note(player, `Nobody's called ${name}`, true);
                if (target.role >= Role.MODERATOR) return this.note(player, "Moderators can't be muted", true);
                const ms = Math.min(minutes, MUTE_MOST_MIN) * 60000;
                await this.mute(target.id, Date.now() + ms, why);
                return this.note(player, `${target.name} is muted for ${minutesText(ms)}`);
            }
            case "/unmute": {
                const target = await this.find(rest.join(" "));
                if (!target) return this.note(player, "/unmute name", true);
                await this.mute(target.id, 0, "");
                return this.note(player, `${target.name} can talk again`);
            }
            case "/reports": {
                const rows = await this.query(
                    `SELECT r.id, r.at, r.reason, r.line, a.display_name reporter, b.display_name reported FROM chat_report r
                     JOIN player a ON a.id = r.reporter_id JOIN player b ON b.id = r.reported_id
                     WHERE r.done = 0 ORDER BY r.id DESC LIMIT 10`);
                if (!rows.length) return this.note(player, "No open reports");
                for (const r of rows.reverse())
                    this.note(player, `#${r.id} ${r.reported} (${REPORT_REASONS[r.reason]}, by ${r.reporter}): "${r.line}"`);
                return;
            }
            case "/done": {
                const id = Number(rest[0]);
                if (!Number.isInteger(id)) return this.note(player, "/done number", true);
                const conn = await IBS.db.getConnection();
                try {
                    const [result] = await conn.query<ResultSetHeader>("UPDATE chat_report SET done = 1 WHERE id = ?", [id]);
                    return this.note(player, result.affectedRows ? `Report #${id} dealt with` : `No report #${id}`, !result.affectedRows);
                } finally {
                    conn.release();
                }
            }
        }
        this.note(player, `Commands: ${MOD_COMMANDS.join(" | ")}`);
    }

    // a player by their display name (any case)
    private async find(name: string) {
        if (!name) return null;
        const rows = await this.query("SELECT id, display_name, role FROM player WHERE display_name = ?", [name]);
        return rows.length ? { id: rows[0].id as number, name: rows[0].display_name as string, role: rows[0].role as Role } : null;
    }

    private async query(sql: string, values: any[] = []) {
        const conn = await IBS.db.getConnection();
        try {
            const [rows] = await conn.query<RowDataPacket[]>(sql, values);
            return rows;
        } finally {
            conn.release();
        }
    }

    //#endregion

}
