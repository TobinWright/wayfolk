import { ResultSetHeader } from "mysql2";
import { IBS } from "../../app";
import { Role } from "../../constants/Constants";
import { IPlayer } from "../../types/IPlayer";

// what a guest is told trying to pass things to other players (isGuest)
export const GUEST_SAVE = "Save your account first (Settings) - guests can't trade";

export class PlayerRecord {

    // database
    public id: number;
    public createdAt: number;
    public activeAt: number;
    public premiumUntil: number;
    public accountType: string;
    public role: Role;
    public login: string;
    public password: string;
    public displayName: string;
    public nameColor = 0;           // a Supporter's name colour (shared/Chat NAME_COLORS)
    public mutedUntil = 0;          // muted in the chat till then (ms; ChatManager)
    public guide: number = null;    // the first steps done (a bit a step, shared/Guide.ts; null: from before the guide)
    public guideAt: number[] = [];  // (and when each was, ms by Step; none: not done, or from before it was kept)
    public email: string = null;    // an email or Google account's address (filled as they sign in: AuthConnection)
    public emailConfirmed = false;  // (proven theirs: a confirm or reset link, or Google)

    // subscribed now (premium_until still to come)
    public isPremium() {
        return new Date(this.premiumUntil).getTime() > Date.now();
    }

    // a guest account not yet saved with an email or Google: can't pass anything
    // to other players (trade, the market, things in mail), so throwaway guests
    // can't feed a main account
    public isGuest() {
        return this.accountType == "guest";
    }

    // what goes with their lines (ChatLine.p, RoomLine.p): 1 + their name colour, a Supporter; else nothing
    public chatMark() {
        return this.isPremium() ? 1 + this.nameColor : undefined;
    }

    // muted in the chat till `until` (ms; 0: not)
    public static async SetMuted(playerId: number, until: number) {
        const conn = await IBS.db.getConnection();
        try {
            await conn.query("UPDATE player SET chat_muted_until = ? WHERE id = ?", [until, playerId]);
        } finally {
            conn.release();
        }
    }

    public static async SetNameColor(playerId: number, color: number) {
        const conn = await IBS.db.getConnection();
        await conn.query("UPDATE player SET name_color = ? WHERE id = ?", [color, playerId]);
        conn.release();
    }

    // their display name, if no one else has it (by the collation: ignoring case); whether it was
    public static async Rename(playerId: number, name: string) {
        const conn = await IBS.db.getConnection();
        try {
            const [result] = await conn.query<ResultSetHeader>(
                "UPDATE player SET display_name = ? WHERE id = ? AND NOT EXISTS (SELECT 1 FROM (SELECT id FROM player WHERE display_name = ? AND id != ?) taken)",
                [name, playerId, name, playerId]
            );
            return result.affectedRows > 0;
        } finally {
            conn.release();
        }
    }

    // (only ever sent to the player themselves: it has their email)
    public getJSON() {
        return {
            id: this.id,
            type: this.accountType,
            role: this.role,
            name: this.displayName,
            premium: this.premiumUntil,
            email: this.email,
            confirmed: this.emailConfirmed
        };
    }

    // a guest's account becoming an email ('email', login the email, a
    // password hash) or Google ('google', login the sub, no password) account,
    // the same row keeping everything; whether it was (still a guest)
    public static async UpgradeGuest(playerId: number, accountType: string, login: string, password: string) {
        const conn = await IBS.db.getConnection();
        try {
            const [result] = await conn.query<ResultSetHeader>(
                "UPDATE player SET account_type = ?, login = ?, password = ? WHERE id = ? AND account_type = 'guest'",
                [accountType, login, password, playerId]
            );
            return result.affectedRows > 0;
        } finally {
            conn.release();
        }
    }

    // someone's login or display name already (a new guest's are both new)
    public static async NameTaken(name: string) {
        const conn = await IBS.db.getConnection();
        try {
            const [records] = await conn.query<IPlayer[]>("SELECT id FROM player WHERE login = ? OR display_name = ? LIMIT 1", [name, name]);
            return records.length > 0;
        } finally {
            conn.release();
        }
    }

    public static async Insert(accountType: string, login: string, password: string, displayName: string): Promise<number> {
        const now = new Date();
        const conn = await IBS.db.getConnection();
        const [result] = await conn.query<ResultSetHeader>(
            "INSERT INTO player (created_at, active_at, premium_until, account_type, role, login, password, display_name, guide) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)",
            [now, now, new Date(0), accountType, 0, login, password, displayName]
        );
        conn.release();
        return result.insertId;
    }

    // seen at `at` (ms): signed in then, or signing out
    public static async Touch(playerIds: number[], at: number) {
        if (!playerIds.length) return;
        const conn = await IBS.db.getConnection();
        await conn.query("UPDATE player SET active_at = ? WHERE id IN (?)", [new Date(at), playerIds]);
        conn.release();
    }

    // the ids of those seen since `at` (ms)
    // (not those banned: their heroes don't work away)
    public static async ActiveSince(at: number): Promise<number[]> {
        const conn = await IBS.db.getConnection();
        const [records] = await conn.query<IPlayer[]>("SELECT id FROM player WHERE active_at > ? AND banned_until <= ?", [new Date(at), Date.now()]);
        conn.release();
        return records.map((r) => r.id);
    }

    public static async Load(playerId: number): Promise<PlayerRecord> {
        const conn = await IBS.db.getConnection();
        const [records] = await conn.query<IPlayer[]>("SELECT * FROM player WHERE id = ?", [playerId]);
        conn.release();

        const record = new PlayerRecord();
        record.id = records[0].id;
        record.createdAt = records[0].created_at;
        record.activeAt = records[0].active_at;
        record.premiumUntil = records[0].premium_until;
        record.accountType = records[0].account_type;
        record.role = records[0].role;
        record.login = records[0].login;
        record.displayName = records[0].display_name;
        record.nameColor = records[0].name_color ?? 0;
        record.mutedUntil = Number(records[0].chat_muted_until ?? 0);
        record.guide = records[0].guide ?? null;
        try {
            const at = records[0].guide_at;
            record.guideAt = (typeof at == "string" ? JSON.parse(at) : at) ?? [];
        } catch (e) { }
        return record;
    }

}