import { PoolConnection, RowDataPacket } from "mysql2/promise";
import { IBS } from "../../app";
import { S2C } from "../../constants/Routes";
import { Player } from "../player/Player";
import { Log } from "../../utils/Log";
const bcrypt = require("bcrypt");

// Your data (IBS.account; the privacy policy, client/dist/legal/privacy.html):
// a copy of everything kept about you (exportData, Settings' Download my
// data), and your account erased (remove, Settings' Delete account), as
// GDPR and CCPA ask.
//
// Deleting: the password again for an email account, and "DELETE" typed for
// any. Stripe's customer goes first (so nothing's charged again; if Stripe
// can't be reached nothing's deleted). Then out of everything that holds
// players in memory, so nothing's saved for them after (their guild handed
// on, their listings off the market, out of events, tables and the chat),
// the connection closed with nothing saved, and every row of theirs deleted
// in one transaction (ERASE). What others still need stays without them:
// what they bought on the market (the seller's sale), guild invites they
// sent, and letters they sent that still hold things (from nobody). Their friends get their lists again and the leaderboards are built
// again without them.

// every row of a player's: [table, the columns that name them] (a new table
// that names a player goes here, and in EXPORT)
const ERASE: [string, string[]][] = [
    ["admin_log", ["player_id"]],
    ["adventurer", ["player_id"]],
    ["chat_report", ["reporter_id", "reported_id"]],
    ["email_confirm", ["player_id"]],
    ["event_share", ["player_id"]],
    ["friend", ["a_id", "b_id"]],
    ["friend_ask", ["from_id", "to_id"]],
    ["game_ante", ["player_id"]],
    ["game_stat", ["player_id"]],
    ["guild_invite", ["player_id"]],
    ["guild_member", ["player_id"]],
    ["guild_pay", ["player_id"]],
    ["hero", ["player_id"]],
    ["hero_board", ["player_id"]],
    ["hero_party", ["player_id"]],
    ["feature_use", ["player_id"]],
    ["feedback", ["player_id"]],
    ["inventory", ["player_id"]],
    ["mail", ["from_id", "to_id"]],
    ["market_listing", ["seller_id"]],
    ["market_order", ["buyer_id"]],
    ["market_sale", ["seller_id"]],
    ["party_invites", ["player_id"]],
    ["password_reset", ["player_id"]],
    ["play_session", ["player_id"]],
    ["player_away", ["player_id"]],
    ["player_block", ["player_id", "blocked_id"]],
    ["player_cosmetic_pack", ["player_id"]],
    ["player_email_verified", ["player_id"]],
    ["player_google", ["player_id"]],
    ["player_profile", ["player_id"]],
    ["player_remember", ["player_id"]],
    ["player_session", ["player_id"]],
    ["player_stripe_customer", ["player_id"]],
    ["player_subscription", ["player_id"]],
    ["season_reward", ["player_id"]],
    ["season_score", ["player_id"]],
    ["trade", ["a_id", "b_id"]],
    ["whisper", ["from_id", "to_id"]],
    ["player", ["id"]],
];

// What's in a copy: a section, and its query (each ? the player's id).
// Never password or token hashes. Others' names where it's about them
// (friends, whispers, who bought from you), but not who reported you.
const EXPORT: [string, string][] = [
    ["account", `SELECT id, created_at, active_at, account_type, IF(account_type = 'email', login, NULL) email, display_name,
        name_color, premium_until, chat_muted_until, title, achievements, daily_day, daily_streak FROM player WHERE id = ?`],
    ["profile", "SELECT about, private, updated_at FROM player_profile WHERE player_id = ?"],
    ["google_sign_in", "SELECT email, created_at FROM player_google WHERE player_id = ?"],
    ["emails_confirmed", "SELECT email, verified_at FROM player_email_verified WHERE player_id = ?"],
    ["signed_in_devices", "SELECT created_at, expires_at FROM player_remember WHERE player_id = ?"],
    ["subscription", "SELECT status, renews, until, updated_at FROM player_subscription WHERE player_id = ?"],
    ["stripe_customer", "SELECT stripe_customer_id FROM player_stripe_customer WHERE player_id = ?"],
    ["inventory", "SELECT gold, items FROM inventory WHERE player_id = ?"],
    ["heroes", "SELECT id, created_at, data, state, journal FROM hero WHERE player_id = ?"],
    ["hiring_board", "SELECT board, period, offers FROM hero_board WHERE player_id = ?"],
    ["parties_made", "SELECT id, name, members, state, asks FROM hero_party WHERE player_id = ?"],
    ["party_asks_allowed", "SELECT invites FROM party_invites WHERE player_id = ?"],
    ["adventurers", "SELECT id, active_until, race, sex, name, talents, skills FROM adventurer WHERE player_id = ?"],
    ["while_away", "SELECT snap FROM player_away WHERE player_id = ?"],
    ["cosmetic_packs", "SELECT pack_id, got_at FROM player_cosmetic_pack WHERE player_id = ?"],
    ["staff_actions", "SELECT at, what FROM admin_log WHERE player_id = ?"],
    ["play_sessions", "SELECT started_at, ended_at, busy_s playing_seconds, idle_s idle_seconds, away_s away_seconds_before, device, source FROM play_session WHERE player_id = ? ORDER BY id"],
    ["features_used", "SELECT day, feature, uses FROM feature_use WHERE player_id = ? ORDER BY day, feature"],
    ["feedback_sent", "SELECT at, kind, text, version, device FROM feedback WHERE player_id = ? ORDER BY id"],
    ["friends", `SELECT p.display_name friend, f.since, IF(f.a_id = ?, f.a_fav, f.b_fav) favourite FROM friend f
        JOIN player p ON p.id = IF(f.a_id = ?, f.b_id, f.a_id) WHERE f.a_id = ? OR f.b_id = ?`],
    ["friend_requests_sent", "SELECT p.display_name \`to\`, a.at FROM friend_ask a JOIN player p ON p.id = a.to_id WHERE a.from_id = ?"],
    ["friend_requests_received", "SELECT p.display_name \`from\`, a.at FROM friend_ask a JOIN player p ON p.id = a.from_id WHERE a.to_id = ?"],
    ["blocked", "SELECT p.display_name player, b.at FROM player_block b JOIN player p ON p.id = b.blocked_id WHERE b.player_id = ?"],
    ["whispers", `SELECT IF(w.from_id = ?, 'sent', 'received') direction, p.display_name \`with\`, w.at, w.text FROM whisper w
        JOIN player p ON p.id = IF(w.from_id = ?, w.to_id, w.from_id) WHERE w.from_id = ? OR w.to_id = ? ORDER BY w.at`],
    ["guild", `SELECT g.name, g.tag, m.grade \`rank\`, m.joined_at FROM guild_member m JOIN guild g ON g.id = m.guild_id WHERE m.player_id = ?`],
    ["guild_invites", "SELECT g.name guild, i.at FROM guild_invite i JOIN guild g ON g.id = i.guild_id WHERE i.player_id = ?"],
    ["market_listings", "SELECT id, item, amount, price, listed, ends, state FROM market_listing WHERE seller_id = ?"],
    ["market_orders", "SELECT id, item, amount, price, placed, ends, state, owed FROM market_order WHERE buyer_id = ?"],
    ["market_sold", "SELECT item, amount, gold, at, paid FROM market_sale WHERE seller_id = ?"],
    ["market_bought", "SELECT item, amount, gold, at FROM market_sale WHERE buyer_id = ?"],
    ["trades", `SELECT t.at, p.display_name traded_with, IF(t.a_id = ?, t.a_gold, t.b_gold) gave_gold, IF(t.a_id = ?, t.a_items, t.b_items) gave_items,
        IF(t.a_id = ?, t.b_gold, t.a_gold) got_gold, IF(t.a_id = ?, t.b_items, t.a_items) got_items FROM trade t
        LEFT JOIN player p ON p.id = IF(t.a_id = ?, t.b_id, t.a_id) WHERE t.a_id = ? OR t.b_id = ? ORDER BY t.at`],
    ["mail_received", `SELECT m.sent, COALESCE(p.display_name, 'a former player') \`from\`, m.note, m.gold, m.items, m.taken, m.returned sent_back FROM mail m
        LEFT JOIN player p ON p.id = m.from_id WHERE m.to_id = ? ORDER BY m.sent`],
    ["mail_sent", `SELECT m.sent, p.display_name \`to\`, m.note, m.gold, m.items, m.taken FROM mail m
        JOIN player p ON p.id = m.to_id WHERE m.from_id = ? ORDER BY m.sent`],
    ["event_contributions","SELECT event_id, points, gold, item, paid FROM event_share WHERE player_id = ?"],
    ["card_tables", "SELECT hands, best, net FROM game_stat WHERE player_id = ?"],
    ["season_points", "SELECT season, points FROM season_score WHERE player_id = ?"],
    ["season_rewards", "SELECT season, kind, value FROM season_reward WHERE player_id = ?"],
    ["guild_gold_owed", "SELECT gold, why FROM guild_pay WHERE player_id = ?"],
    ["reports_you_made", "SELECT at, channel, reason, line, done FROM chat_report WHERE reporter_id = ?"],
    ["reports_about_you", "SELECT at, channel, reason, line, done FROM chat_report WHERE reported_id = ?"],
];

const EXPORT_GAP_MS = 60 * 1000;        // (a copy a minute at most: it's a lot of queries)

// Guest accounts nobody's signed in to for GUEST_KEPT_DAYS (the user, 2026-10-30:
// "a reasonable retention period"; the privacy policy, section 6) are erased as
// Delete account would: a guest signs in only from the browser that made it,
// so one unplayed this long has almost surely lost it. Not staff's, nor one
// with Supporter time left or a cosmetic pack (given by hand). Every SWEEP_MS,
// SWEEP_MOST at a time, the longest gone first. Coming back, that browser's
// told its guest isn't here any more and starts a new one (AuthConnection).
const GUEST_KEPT_DAYS = 180;
const SWEEP_MS = 60 * 60 * 1000;
const SWEEP_MOST = 50;

export class AccountManager {

    private busy = new Set<number>();               // (player ids: an export or delete under way)
    private lastExport = new Map<number, number>();

    constructor() {
        setInterval(() => this.sweepGuests().catch(Log.catch("Couldn't clear out unplayed guests")), SWEEP_MS);
    }

    private refuse(player: Player, why: string) {
        player.send({ r: S2C.PLAYER_DELETE_REFUSED, w: why });
    }

    //#region a copy

    public async exportData(player: Player) {
        if (this.busy.has(player.id)) return;
        const now = Date.now();
        if (now - (this.lastExport.get(player.id) ?? 0) < EXPORT_GAP_MS) return this.refuse(player, "Wait a minute before downloading again");
        this.lastExport.set(player.id, now);
        this.busy.add(player.id);
        try {
            await IBS.heroes.tasks.save(player);        // (as things are now)
            const data: { [section: string]: any } = {
                about: "Everything Wayfolk keeps about your account, as of exported_at. See the privacy policy: legal/privacy.html",
                exported_at: new Date(now).toISOString(),
            };
            const conn = await IBS.db.getConnection();
            try {
                for (const [section, sql] of EXPORT) {
                    const [rows] = await conn.query<RowDataPacket[]>(sql, new Array(sql.split("?").length - 1).fill(player.id));
                    data[section] = rows.map((r) => this.readable(r));
                }
            } finally {
                conn.release();
            }
            data.account = data.account[0] ?? null;
            player.send({ r: S2C.PLAYER_EXPORT, d: data });
            Log.info("Data export", { playerId: player.id });
        } catch (error) {
            Log.error("Couldn't export a player's data", error, { playerId: player.id });
            this.refuse(player, "Couldn't make your download - try again");
        } finally {
            this.busy.delete(player.id);
        }
    }

    // a row as it reads best: JSON columns parsed, dates as ISO text
    private readable(row: RowDataPacket) {
        const out: { [key: string]: any } = {};
        for (const [key, value] of Object.entries(row)) {
            if (value instanceof Date) out[key] = isNaN(value.getTime()) ? null : value.toISOString();
            else if (typeof value == "string" && /^[\[{]/.test(value)) {
                try { out[key] = JSON.parse(value); } catch (e) { out[key] = value; }
            } else out[key] = value;
        }
        return out;
    }

    //#endregion

    //#region deleting

    public async remove(player: Player, message: any) {
        if (this.busy.has(player.id)) return;
        if (message?.c !== "DELETE") return this.refuse(player, "Type DELETE to confirm");
        if (player.record.accountType == "email" && !(await this.passwordRight(player.id, message.p)))
            return this.refuse(player, "That password isn't right");
        if (!IBS.auth.lock(player.id)) return this.refuse(player, "Signing in somewhere else - try again in a moment");
        this.busy.add(player.id);
        try {
            await this.erase(player);
        } finally {
            this.busy.delete(player.id);
            IBS.auth.unlock(player.id);
        }
    }

    // (the hash isn't kept in memory: PlayerRecord.Load)
    private async passwordRight(playerId: number, password: any) {
        if (typeof password != "string" || !password) return false;
        const conn = await IBS.db.getConnection();
        try {
            const [rows] = await conn.query<RowDataPacket[]>("SELECT password FROM player WHERE id = ?", [playerId]);
            const hash = rows[0]?.password;
            return !!hash && await bcrypt.compare(password, hash);
        } finally {
            conn.release();
        }
    }

    // (why: for the log; whether it was erased. rebuild false: the caller
    // builds the leaderboards again once, after several)
    private async erase(player: Player, why = "deleted by its player", rebuild = true) {
        const id = player.id, name = player.record.displayName;
        try {
            await IBS.billing.forget(player);
        } catch (error: any) {
            Log.error("Couldn't delete a player's Stripe customer", error, { playerId: id });
            this.refuse(player, "Couldn't cancel your subscription just now, so nothing was deleted. Try again later.");
            return false;
        }

        // out of everything that holds them, so nothing's saved for them after
        // (and nothing more they send is acted on: NetworkManager)
        player.deleting = true;
        let tellFriends: () => Promise<void> = async () => { };
        try {
            IBS.games.forget(player);
            IBS.market.forget(player);
            IBS.trades.leave(player);
            IBS.events.forget(player);
            IBS.seasons.forget(player);
            IBS.chat.forget(player);
            await IBS.guilds.forget(player);
            await IBS.heroes.tasks.formed.forget(player);
            tellFriends = await IBS.friends.forget(player);
        } catch (error) {
            Log.error("Deleting a player: couldn't let go of everything first", error, { playerId: id });
        }
        IBS.players.drop(player);
        await IBS.db.idle(5000);        // (saves already under way finish first)

        const conn = await IBS.db.getConnection();
        try {
            await conn.beginTransaction();
            await this.eraseRows(conn, id);
            await conn.commit();
        } catch (error) {
            await conn.rollback().catch(() => { });
            Log.error("Couldn't delete a player's rows (rolled back)", error, { playerId: id });
            // (half let go: signed back in, they're loaded fresh from what's saved)
            this.refuse(player, "Couldn't delete your account - please try again");
            player.closeForDelete(Player.SERVER_RESTARTING);
            return false;
        } finally {
            conn.release();
        }

        Log.info(`Account deleted: ${name} (${id}), ${why}`);
        player.send({ r: S2C.PLAYER_DELETED });
        player.closeForDelete(Player.ACCOUNT_DELETED);
        this.lastExport.delete(id);
        await tellFriends().catch(Log.catch("Deleting a player: couldn't tell their friends", { playerId: id }));
        if (rebuild) IBS.leaderboards.rebuild().catch(Log.catch("Couldn't rebuild the leaderboards"));
        return true;
    }

    // guests unplayed for GUEST_KEPT_DAYS: loaded (nobody can sign in to one
    // meanwhile) and erased, a few at a time (above)
    private async sweepGuests() {
        if (IBS.closing) return;
        const conn = await IBS.db.getConnection();
        let ids: number[];
        try {
            const [rows] = await conn.query<RowDataPacket[]>(
                `SELECT id FROM player p WHERE account_type = 'guest' AND role = 0 AND active_at < ? AND premium_until < NOW()
                    AND NOT EXISTS (SELECT 1 FROM player_cosmetic_pack c WHERE c.player_id = p.id)
                ORDER BY active_at LIMIT ?`,
                [new Date(Date.now() - GUEST_KEPT_DAYS * 24 * 60 * 60 * 1000), SWEEP_MOST]);
            ids = rows.map((r) => r.id as number);
        } finally {
            conn.release();
        }
        let erased = 0;
        for (const id of ids) {
            if (IBS.closing) break;
            if (IBS.players.getById(id) || this.busy.has(id) || !IBS.auth.lock(id)) continue;     // (back, or signing in)
            this.busy.add(id);
            try {
                if (await this.erase(await IBS.players.load(id), `a guest unplayed for ${GUEST_KEPT_DAYS} days`, false)) erased++;
            } catch (error) {
                Log.error("Couldn't clear out an unplayed guest", error, { playerId: id });
            } finally {
                this.busy.delete(id);
                IBS.auth.unlock(id);
            }
        }
        if (erased) {
            Log.info(`Guests unplayed for ${GUEST_KEPT_DAYS} days cleared out: ${erased}`);
            IBS.leaderboards.rebuild().catch(Log.catch("Couldn't rebuild the leaderboards"));
        }
    }

    private async eraseRows(conn: PoolConnection, id: number) {
        // (letters of theirs still holding things for someone stay, from nobody, their note gone, never to run out)
        await conn.query(`UPDATE mail SET from_id = 0, note = '', ends = 0 WHERE from_id = ? AND to_id != ? AND hidden = 0 AND taken = 0
            AND (gold > 0 OR items != '[]')`, [id, id]);
        for (const [table, columns] of ERASE)
            await conn.query(`DELETE FROM ${table} WHERE ${columns.map((c) => `${c} = ?`).join(" OR ")}`, columns.map(() => id));
        // (invites they sent stay, from nobody)
        await conn.query("UPDATE guild_invite SET by_id = 0 WHERE by_id = ?", [id]);
    }

    //#endregion

}
