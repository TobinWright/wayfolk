import { RowDataPacket } from "mysql2";
import { IBS } from "../../app";
import { S2C } from "../../constants/Routes";
import { achievementOf } from "../../../../shared/Achievements";
import { Player } from "../player/Player";
import { Log } from "../../utils/Log";

// Achievements (shared/Achievements.ts): those each player's done, kept as
// JSON on the player (player.achievements: { id: when }), loaded as they sign
// in and sent (PLAYER_ACHIEVEMENTS). The client says when one's done
// (C2S.PLAYER_ACHIEVE): only for show, so taken as said, once each. (Kept
// in memory after they sign out: small, and loaded again as they sign in.)

export class AchievementManager {

    private of = new Map<number, { [id: string]: number }>();       // (player id; signed in)

    public async init() {
        const conn = await IBS.db.getConnection();
        try {
            await conn.query("ALTER TABLE player ADD COLUMN achievements JSON NULL");
        } catch (e) {
            if ((e as any).errno != 1060) throw e;      // (already there)
        } finally {
            conn.release();
        }
    }

    public async signIn(player: Player) {
        const conn = await IBS.db.getConnection();
        let had: { [id: string]: number } = {};
        try {
            const [rows] = await conn.query<RowDataPacket[]>("SELECT achievements FROM player WHERE id = ?", [player.id]);
            const raw = rows[0]?.achievements;
            had = (typeof raw == "string" ? JSON.parse(raw) : raw) ?? {};
        } catch (e) {
            Log.error("Couldn't load achievements", e, { playerId: player.id });
        } finally {
            conn.release();
        }
        this.of.set(player.id, had);
    }

    // (after TITLE_SIGNED_IN)
    public send(player: Player) {
        player.send({ r: S2C.PLAYER_ACHIEVEMENTS, l: Object.entries(this.of.get(player.id) ?? {}) });
    }

    public achieve(player: Player, id: any) {
        const had = this.of.get(player.id);
        if (!had || typeof id != "string" || !achievementOf(id) || had[id]) return;
        const at = had[id] = Date.now();
        player.send({ r: S2C.PLAYER_ACHIEVED, a: id, t: at });
        this.save(player.id, had).catch(Log.catch("Couldn't save achievements", { playerId: player.id }));
    }

    private async save(id: number, had: { [id: string]: number }) {
        const conn = await IBS.db.getConnection();
        try {
            await conn.query("UPDATE player SET achievements = ? WHERE id = ?", [JSON.stringify(had), id]);
        } finally {
            conn.release();
        }
    }

}
