import { ResultSetHeader, RowDataPacket } from "mysql2";
import {
    cleanFeedback, FEEDBACK_DAY_MOST, FEEDBACK_GAP_MS, FEEDBACK_KINDS, FEEDBACK_SHORTEST, FEEDBACK_SHOWN, FeedbackRow,
} from "../../../../shared/Feedback";
import { IBS } from "../../app";
import { Role } from "../../constants/Constants";
import { S2C } from "../../constants/Routes";
import { Player } from "../player/Player";
import { Log } from "../../utils/Log";

type Row = RowDataPacket & { [key: string]: any };

const DEVICES = new Set(["desktop", "tablet", "phone"]);

// Feedback (shared/Feedback.ts): a player's kept (one a FEEDBACK_GAP_MS, at
// most FEEDBACK_DAY_MOST a day), staff signed in told in their chat; staff
// read the open ones (the admin panel's Feedback tab, the phone page) and
// mark them dealt with.
export class FeedbackManager {

    private last = new Map<number, number>();       // (player id: when they last sent one)

    public async init() {
        await this.query(`CREATE TABLE IF NOT EXISTS feedback (
            id INT AUTO_INCREMENT PRIMARY KEY,
            player_id INT NOT NULL,
            at DATETIME NOT NULL,
            kind TINYINT NOT NULL,
            text TEXT NOT NULL,
            version VARCHAR(40) NOT NULL DEFAULT '',
            device VARCHAR(8) NOT NULL DEFAULT '',
            done TINYINT NOT NULL DEFAULT 0,
            INDEX (done, id),
            INDEX (player_id))`);
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

    // C2S.FEEDBACK_SEND
    public async send(player: Player, kind: any, words: any, version: any, device: any) {
        const refuse = (why: string) => player.send({ r: S2C.FEEDBACK_REFUSED, w: why });
        const text = cleanFeedback(words);
        if (!Number.isInteger(kind) || !FEEDBACK_KINDS[kind]) return refuse("Pick what it's about");
        if (text.length < FEEDBACK_SHORTEST) return refuse("Write a little more first");
        const now = Date.now();
        if (now - (this.last.get(player.id) ?? 0) < FEEDBACK_GAP_MS) return refuse("Thanks! Wait a minute before sending more");
        this.last.set(player.id, now);
        const [today] = await this.query("SELECT COUNT(*) AS n FROM feedback WHERE player_id = ? AND at > ?", [player.id, new Date(now - 24 * 60 * 60 * 1000)]) as Row[];
        if (Number(today.n) >= FEEDBACK_DAY_MOST) return refuse("That's plenty for today - thank you! Send more tomorrow");
        const v = typeof version == "string" ? version.slice(0, 40) : "";
        const d = DEVICES.has(device) ? device : "";
        const done = await this.query("INSERT INTO feedback (player_id, at, kind, text, version, device) VALUES (?, ?, ?, ?, ?, ?)",
            [player.id, new Date(now), kind, text, v, d]) as ResultSetHeader;
        player.send({ r: S2C.FEEDBACK_SENT });
        Log.info(`Feedback #${done.insertId} from ${player.record.displayName} (${player.id}): ${FEEDBACK_KINDS[kind]}`);
        for (const staff of IBS.players.online())
            if (staff.record.role >= Role.MODERATOR && staff != player)
                IBS.chat.note(staff, `New feedback (${FEEDBACK_KINDS[kind]}) from ${player.record.displayName}: the admin panel's Feedback tab`);
    }

    // the open ones, newest first, and how many there are
    public async open(): Promise<{ l: FeedbackRow[]; n: number }> {
        const rows = await this.query(`SELECT f.id, f.at, f.kind, f.text, f.version, f.device, f.player_id, p.display_name
            FROM feedback f JOIN player p ON p.id = f.player_id WHERE f.done = 0 ORDER BY f.id DESC LIMIT ?`, [FEEDBACK_SHOWN]) as Row[];
        const [count] = await this.query("SELECT COUNT(*) AS n FROM feedback WHERE done = 0") as Row[];
        return {
            l: rows.map((r) => ({ i: r.id, k: r.kind, t: r.text, by: r.display_name, bi: r.player_id, a: new Date(r.at).getTime(), v: r.version, d: r.device })),
            n: Number(count?.n ?? 0),
        };
    }

    // C2S.ADMIN_FEEDBACK (AdminHandler: staff)
    public async list(player: Player) {
        player.send({ r: S2C.ADMIN_FEEDBACK, ...(await this.open()) });
    }

    // C2S.ADMIN_FEEDBACK_DONE
    public async done(player: Player, id: any) {
        if (!Number.isInteger(id)) return;
        const done = await this.query("UPDATE feedback SET done = 1 WHERE id = ? AND done = 0", [id]) as ResultSetHeader;
        if (done.affectedRows) {
            player.send({ r: S2C.ADMIN_DONE, w: `Feedback #${id} dealt with` });
            Log.info(`Admin: ${player.record.displayName} (${player.id}): feedback #${id} dealt with`);
        }
        await this.list(player);
    }

}
