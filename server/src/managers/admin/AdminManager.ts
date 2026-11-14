import { ResultSetHeader, RowDataPacket } from "mysql2";
import {
    ADMIN_FOUND_MOST, ADMIN_GOLD_MOST, ADMIN_ITEMS_MOST, ADMIN_LOG_MOST, ADMIN_MARKET_MOST, ADMIN_REPORTS_MOST, ADMIN_SAY_LONGEST,
    ADMIN_BAN_DAYS, ADMIN_SUPPORTER_DAYS, AdminNote, BAN_FOREVER, BAN_REASON_LONGEST, AdminPlayer, AdminPurchases, AdminReport, AdminRow, AdminStash, AdminTrade, ROLE_NAMES,
} from "../../../../shared/Admin";
import { minutesText, MUTE_MOST_MIN } from "../../../../shared/Chat";
import { EVENT_KINDS } from "../../../../shared/Events";
import { KIND_NAMES } from "../../../../shared/Sights";
import { isItem } from "../../../../shared/Market";
import { itemName } from "../../../../shared/Tasks";
import { IBS } from "../../app";
import { Role } from "../../constants/Constants";
import { S2C } from "../../constants/Routes";
import { Player } from "../player/Player";
import { Log } from "../../utils/Log";

// The admin panel (shared/Admin.ts): what editors and admins do to players
// and the server from it. Everything done is logged with who did it, and
// what's done to a player kept in admin_log too (their Log in the panel), so
// support can see what's been given already before giving it again.

const DAY_MS = 24 * 60 * 60 * 1000;

export class AdminManager {

    public async init() {
        const conn = await IBS.db.getConnection();
        try {
            await conn.query(`CREATE TABLE IF NOT EXISTS admin_log (
                id INT AUTO_INCREMENT PRIMARY KEY,
                at DATETIME NOT NULL,
                staff_id INT NOT NULL,
                player_id INT NOT NULL,
                what VARCHAR(255) NOT NULL,
                INDEX (player_id))`);
            for (const column of ["banned_until BIGINT NOT NULL DEFAULT 0", "ban_reason VARCHAR(255) NOT NULL DEFAULT ''"]) {
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

    private refuse(player: Player, why: string) {
        player.send({ r: S2C.ADMIN_REFUSED, w: why });
    }

    // `about`: the player it was done to (kept in their log)
    private done(player: Player, what: string, about?: number) {
        player.send({ r: S2C.ADMIN_DONE, w: what });
        Log.info(`Admin: ${player.record.displayName} (${player.id}): ${what}`);
        if (about) this.write("INSERT INTO admin_log (at, staff_id, player_id, what) VALUES (NOW(), ?, ?, ?)", [player.id, about, what.slice(0, 255)])
            .catch(Log.catch("Admin: couldn't keep it in the log", { playerId: about }));
    }

    private admin(player: Player, what: string) {
        if (player.record.role >= Role.ADMIN) return true;
        this.refuse(player, `Only admins can ${what}`);
        return false;
    }

    //#region players

    // by name (any part of it) or "#id"; nothing: those signed in
    public async find(player: Player, q: any) {
        const query = typeof q == "string" ? q.trim().slice(0, 40) : "";
        let rows: RowDataPacket[];
        if (!query) {
            const online = IBS.players.online().slice(0, ADMIN_FOUND_MOST).map((p) => p.id);
            rows = online.length ? await this.query("SELECT id, display_name, role, active_at FROM player WHERE id IN (?)", [online]) : [];
        } else if (/^#\d+$/.test(query)) {
            rows = await this.query("SELECT id, display_name, role, active_at FROM player WHERE id = ?", [Number(query.slice(1))]);
        } else {
            const like = "%" + query.replace(/[\\%_]/g, (c) => "\\" + c) + "%";
            rows = await this.query(
                "SELECT id, display_name, role, active_at FROM player WHERE display_name LIKE ? ORDER BY display_name = ? DESC, active_at DESC LIMIT ?",
                [like, query, ADMIN_FOUND_MOST]);
        }
        const l: AdminRow[] = rows.map((r) => ({
            i: r.id, n: r.display_name, r: r.role, o: IBS.players.getById(r.id)?.online ? 1 : 0, a: ms(r.active_at),
        }));
        l.sort((a, b) => b.o - a.o || b.a - a.a);
        player.send({ r: S2C.ADMIN_FOUND, l, q: query });
    }

    public async show(player: Player, id: any) {
        if (!Number.isInteger(id)) return;
        const p = await this.account(player, id);
        if (!p) return this.refuse(player, "No such player");
        player.send({ r: S2C.ADMIN_PLAYER, p });
    }

    private async account(viewer: Player, id: number): Promise<AdminPlayer> {
        const [r] = await this.query(
            `SELECT p.id, p.display_name, p.account_type, p.login, p.role, p.created_at, p.active_at, p.premium_until, p.chat_muted_until,
                p.banned_until, p.ban_reason, i.gold, (SELECT COUNT(*) FROM hero h WHERE h.player_id = p.id) heroes,
                (SELECT COUNT(*) FROM chat_report c WHERE c.reported_id = p.id AND c.done = 0) reports,
                (SELECT g.email FROM player_google g WHERE g.player_id = p.id LIMIT 1) google_email
             FROM player p LEFT JOIN inventory i ON i.player_id = p.id WHERE p.id = ?`, [id]);
        if (!r) return null;
        const loaded = IBS.players.getById(id);
        return {
            i: r.id, n: loaded?.record.displayName ?? r.display_name, t: r.account_type,
            e: viewer.record.role < Role.ADMIN ? "" : r.account_type == "email" ? r.login : r.account_type == "google" ? (r.google_email ?? "") : "",
            r: loaded?.record.role ?? r.role, c: ms(r.created_at), a: loaded?.online ? Date.now() : ms(r.active_at),
            o: loaded ? (loaded.online ? 1 : 2) : 0,
            p: ms(loaded?.record.premiumUntil ?? r.premium_until), m: loaded?.record.mutedUntil ?? Number(r.chat_muted_until ?? 0),
            g: loaded?.inventory.gold ?? Number(r.gold ?? 0), h: loaded?.heroes.length ?? Number(r.heroes),
            k: IBS.guilds.tagOf(id) ?? "", rp: Number(r.reports),
            b: Number(r.banned_until) > Date.now() ? Number(r.banned_until) : 0, bw: r.ban_reason ?? "",
        };
    }

    // Banned for `days` (0: for good; -1: unbanned), with why; not staff, nor
    // themselves. Banned while loaded (signed in, or their heroes working
    // away), they're closed and their heroes stop: let go, saved, at the next
    // turn of the away loop (HeroTasks).
    public async ban(player: Player, id: any, days: any, why: any) {
        if (!Number.isInteger(id) || !(days == -1 || ADMIN_BAN_DAYS.includes(days))) return;
        if (id == player.id) return this.refuse(player, "You can't ban yourself");
        const them = await this.account(player, id);
        if (!them) return this.refuse(player, "No such player");
        if (them.r >= Role.MODERATOR) return this.refuse(player, "Staff can't be banned");
        if (days == -1 && !them.b) return this.refuse(player, `${them.n} isn't banned`);
        const reason = days == -1 ? "" : typeof why == "string" ? why.replace(/\s+/g, " ").replace(/[\x00-\x1f\x7f]/g, "").trim().slice(0, BAN_REASON_LONGEST) : "";
        const until = days == -1 ? 0 : days == 0 ? BAN_FOREVER : Date.now() + days * DAY_MS;
        await this.write("UPDATE player SET banned_until = ?, ban_reason = ? WHERE id = ?", [until, reason, id]);
        const loaded = IBS.players.getById(id);
        if (until && loaded) {
            loaded.closeForBan();
            loaded.awayUntil = Date.now();
        }
        const length = days == 0 ? "for good" : `for ${days} day${days == 1 ? "" : "s"}`;
        this.done(player, until ? `${them.n} banned ${length}${reason ? ` (${reason})` : ""}` : `${them.n} unbanned`, id);
        await this.show(player, id);
    }

    // muted in the chat for `minutes` (0: unmuted); not staff
    public async mute(player: Player, id: any, minutes: any) {
        if (!Number.isInteger(id) || typeof minutes != "number" || !(minutes >= 0)) return;
        const them = await this.account(player, id);
        if (!them) return this.refuse(player, "No such player");
        if (them.r >= Role.MODERATOR) return this.refuse(player, "Staff can't be muted");
        const ms = Math.min(minutes, MUTE_MOST_MIN) * 60000;
        await IBS.chat.mute(id, ms ? Date.now() + ms : 0, ms ? "by a moderator" : "");
        this.done(player, ms ? `${them.n} muted for ${minutesText(ms)}` : `${them.n} unmuted`, id);
        await this.show(player, id);
    }

    // admins: gold given (or taken, not below none) - in memory if they're loaded, else saved straight
    public async gold(player: Player, id: any, gold: any): Promise<void> {
        if (player.record.role < Role.ADMIN) return this.refuse(player, "Only admins can give gold");
        if (!Number.isInteger(id) || !Number.isInteger(gold) || !gold || Math.abs(gold) > ADMIN_GOLD_MOST) return this.refuse(player, `Between 1 and ${ADMIN_GOLD_MOST.toLocaleString("en-US")} gold`);
        let them = IBS.players.getById(id), had: number;
        if (them) {
            had = them.inventory.gold;
            them.inventory.adjustGold(Math.max(gold, -had));
            them.stashChanged = true;
        } else {
            await IBS.players.settled(id);
            them = IBS.players.getById(id);     // (they may have signed in meanwhile)
            if (them) return this.gold(player, id, gold);
            const [r] = await this.query("SELECT gold FROM inventory WHERE player_id = ?", [id]);
            if (!r) return this.refuse(player, "No such player");
            had = Number(r.gold);
            await this.query("UPDATE inventory SET gold = GREATEST(0, gold + ?) WHERE player_id = ?", [gold, id]);
        }
        const moved = Math.max(gold, -had), name = (await this.account(player, id))?.n ?? `#${id}`;
        this.done(player, moved >= 0 ? `Gave ${name} ${moved.toLocaleString("en-US")} gold` : `Took ${(-moved).toLocaleString("en-US")} gold from ${name}`, id);
        await this.show(player, id);
    }

    // admins: someone else's role
    public async role(player: Player, id: any, role: any) {
        if (player.record.role < Role.ADMIN) return this.refuse(player, "Only admins can change roles");
        if (!Number.isInteger(id) || !Number.isInteger(role) || !ROLE_NAMES[role]) return;
        if (id == player.id) return this.refuse(player, "You can't change your own role");
        const [result] = await this.write("UPDATE player SET role = ? WHERE id = ?", [role, id]);
        if (!result.affectedRows) return this.refuse(player, "No such player");
        const them = IBS.players.getById(id);
        if (them) them.record.role = role;
        const name = (await this.account(player, id))?.n ?? `#${id}`;
        this.done(player, `${name} is ${/^[AEIOU]/.test(ROLE_NAMES[role]) ? "an" : "a"} ${ROLE_NAMES[role]} now${them?.online ? " (their menu changes as they next sign in)" : ""}`, id);
        await this.show(player, id);
    }

    private async nameOf(id: number): Promise<string> {
        const loaded = IBS.players.getById(id);
        if (loaded) return loaded.record.displayName;
        const [r] = await this.query("SELECT display_name FROM player WHERE id = ?", [id]);
        return r?.display_name ?? null;
    }

    //#endregion

    //#region support: the stash, market history, purchases, and the log

    // their gold and things, as they are now (in memory if they're loaded)
    public async stash(player: Player, id: any) {
        if (!Number.isInteger(id)) return;
        const them = IBS.players.getById(id);
        let s: AdminStash;
        if (them) s = { i: id, g: them.inventory.gold, l: Array.from(them.inventory.items.values(), (it): [number, number] => [it.id, it.amount]) };
        else {
            const [r] = await this.query("SELECT gold, items FROM inventory WHERE player_id = ?", [id]);
            if (!r) return this.refuse(player, "No such player");
            s = { i: id, g: Number(r.gold), l: parseItems(r.items) };
        }
        s.l = s.l.filter(([, n]) => n > 0);
        player.send({ r: S2C.ADMIN_STASH, s });
    }

    // admins: some of a thing given (or taken, not below none) - in memory if
    // they're loaded, else saved straight
    public async item(player: Player, id: any, item: any, n: any): Promise<void> {
        if (!this.admin(player, "give things") || !Number.isInteger(id)) return;
        if (!isItem(item)) return this.refuse(player, "There's no such thing");
        if (!Number.isInteger(n) || !n || Math.abs(n) > ADMIN_ITEMS_MOST) return this.refuse(player, `Between 1 and ${num(ADMIN_ITEMS_MOST)} at once`);
        let moved: number;
        const them = IBS.players.getById(id);
        if (them) {
            moved = Math.max(n, -(them.inventory.items.get(item)?.amount ?? 0));
            if (moved) {
                them.inventory.adjustItem(item, moved);
                them.stashChanged = true;
            }
        } else {
            await IBS.players.settled(id);
            if (IBS.players.getById(id)) return this.item(player, id, item, n);     // (they signed in meanwhile)
            const conn = await IBS.db.getConnection();
            try {
                await conn.beginTransaction();
                const [rows] = await conn.query<RowDataPacket[]>("SELECT items FROM inventory WHERE player_id = ? FOR UPDATE", [id]);
                if (!rows.length) {
                    await conn.rollback();
                    return this.refuse(player, "No such player");
                }
                const items = parseItems(rows[0].items), row = items.find(([m]) => m == item);
                moved = Math.max(n, -(row?.[1] ?? 0));
                if (row) row[1] += moved;
                else if (moved > 0) items.push([item, moved]);
                await conn.query("UPDATE inventory SET items = ? WHERE player_id = ?", [JSON.stringify(items.filter(([, k]) => k > 0)), id]);
                await conn.commit();
            } catch (e) {
                await conn.rollback().catch(() => { });
                throw e;
            } finally {
                conn.release();
            }
        }
        if (!moved) return this.refuse(player, `They have no ${itemName(item)}`);
        const name = (await this.nameOf(id)) ?? `#${id}`;
        this.done(player, moved > 0 ? `Gave ${name} ${num(moved)} ${itemName(item)}` : `Took ${num(-moved)} ${itemName(item)} from ${name}`, id);
        await this.stash(player, id);
    }

    // what they've listed, sold and bought, newest first
    public async market(player: Player, id: any) {
        if (!Number.isInteger(id)) return;
        const most = ADMIN_MARKET_MOST;
        const listed = await this.query(
            `SELECT l.id, l.item, l.amount, l.price, l.listed, l.state, (SELECT COALESCE(SUM(s.amount), 0) FROM market_sale s WHERE s.listing_id = l.id) sold
             FROM market_listing l WHERE l.seller_id = ? ORDER BY l.id DESC LIMIT ?`, [id, most]);
        const sold = await this.query(
            `SELECT s.item, s.amount, s.gold, s.at, s.paid, COALESCE(p.display_name, ${FORMER}) who FROM market_sale s
             LEFT JOIN player p ON p.id = s.buyer_id WHERE s.seller_id = ? ORDER BY s.at DESC LIMIT ?`, [id, most]);
        const bought = await this.query(
            `SELECT s.item, s.amount, s.gold, s.at, COALESCE(p.display_name, ${FORMER}) who FROM market_sale s
             LEFT JOIN player p ON p.id = s.seller_id WHERE s.buyer_id = ? ORDER BY s.at DESC LIMIT ?`, [id, most]);
        const l: AdminTrade[] = [
            ...listed.map((r): AdminTrade => ({ k: 0, a: Number(r.listed), m: r.item, n: r.amount + Number(r.sold), g: r.price, s: r.state, l: r.amount, id: r.id })),
            ...sold.map((r): AdminTrade => ({ k: 1, a: Number(r.at), m: r.item, n: r.amount, g: Number(r.gold), w: r.who, p: r.paid })),
            ...bought.map((r): AdminTrade => ({ k: 2, a: Number(r.at), m: r.item, n: r.amount, g: Number(r.gold), w: r.who })),
        ].sort((a, b) => b.a - a.a).slice(0, most);
        player.send({ r: S2C.ADMIN_MARKET, i: id, l });
    }

    // admins: Supporter, their Stripe subscription, and the cosmetic packs
    public async purchases(player: Player, id: any) {
        if (!Number.isInteger(id) || !this.admin(player, "see purchases")) return;
        const [r] = await this.query(
            `SELECT p.premium_until, c.stripe_customer_id, s.subscription_id, s.status, s.renews, s.until, s.updated_at FROM player p
             LEFT JOIN player_stripe_customer c ON c.player_id = p.id LEFT JOIN player_subscription s ON s.player_id = p.id WHERE p.id = ?`, [id]);
        if (!r) return this.refuse(player, "No such player");
        const owned = new Map((await this.query("SELECT pack_id, got_at FROM player_cosmetic_pack WHERE player_id = ?", [id]))
            .map((o): [number, number] => [o.pack_id, ms(o.got_at)]));
        const packs = IBS.cosmetics.catalog.p;
        const k = packs.map((pk): [number, string, number] => [pk.i, pk.n, owned.get(pk.i) ?? 0]);
        for (const [i, at] of owned) if (!packs.some((pk) => pk.i == i)) k.push([i, `Pack #${i}`, at]);
        const loaded = IBS.players.getById(id);
        const p: AdminPurchases = {
            i: id, u: ms(loaded?.record.premiumUntil ?? r.premium_until), c: r.stripe_customer_id ?? "",
            s: r.subscription_id ? { i: r.subscription_id, t: r.status, r: r.renews, u: ms(r.until), a: ms(r.updated_at) } : null, k,
        };
        player.send({ r: S2C.ADMIN_PURCHASES, p });
    }

    // admins: a cosmetic pack given (v 1) or taken (v 0)
    public async pack(player: Player, id: any, k: any, v: any) {
        if (!this.admin(player, "give packs") || !Number.isInteger(id) || !Number.isInteger(k)) return;
        const name = await this.nameOf(id);
        if (!name) return this.refuse(player, "No such player");
        const pack = IBS.cosmetics.catalog.p.find((p) => p.i == k);
        if (v && !pack) return this.refuse(player, "There's no such pack");
        const [result] = v
            ? await this.write("INSERT IGNORE INTO player_cosmetic_pack (player_id, pack_id, got_at) VALUES (?, ?, NOW())", [id, k])
            : await this.write("DELETE FROM player_cosmetic_pack WHERE player_id = ? AND pack_id = ?", [id, k]);
        if (!result.affectedRows) return this.refuse(player, v ? "They have it already" : "They don't have it");
        const them = IBS.players.getById(id);
        if (them) {
            them.packs = them.packs.filter((x) => x != k);
            if (v) them.packs.push(k);
            if (them.online) IBS.cosmetics.send(them);
        }
        const packName = pack?.n ?? `#${k}`;
        this.done(player, v ? `Gave ${name} the ${packName} pack` : `Took the ${packName} pack from ${name}`, id);
        await this.purchases(player, id);
    }

    // admins: days of Supporter given, on top of what they have. (A change to
    // a Stripe subscription they have sets it again from what Stripe says.)
    public async supporter(player: Player, id: any, d: any) {
        if (!this.admin(player, "give Supporter time") || !Number.isInteger(id) || !ADMIN_SUPPORTER_DAYS.includes(d)) return;
        const [r] = await this.query("SELECT display_name, premium_until FROM player WHERE id = ?", [id]);
        if (!r) return this.refuse(player, "No such player");
        const them = IBS.players.getById(id);
        const until = Math.max(Date.now(), ms(them ? them.record.premiumUntil : r.premium_until)) + d * DAY_MS;
        await this.write("UPDATE player SET premium_until = FROM_UNIXTIME(?) WHERE id = ?", [Math.floor(until / 1000), id]);
        if (them) {
            them.record.premiumUntil = until;
            if (them.online) IBS.billing.sendStore(them).catch(Log.catch("Admin: couldn't send the store", { playerId: id }));
        }
        const day = new Date(until).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
        this.done(player, `Gave ${them?.record.displayName ?? r.display_name} ${d} days of Supporter (till ${day})`, id);
        await this.purchases(player, id);
    }

    // what staff have done to them, newest first
    public async log(player: Player, id: any) {
        if (!Number.isInteger(id)) return;
        const rows = await this.query(
            `SELECT l.at, l.what, COALESCE(p.display_name, 'a former staff member') who FROM admin_log l LEFT JOIN player p ON p.id = l.staff_id
             WHERE l.player_id = ? ORDER BY l.id DESC LIMIT ?`, [id, ADMIN_LOG_MOST]);
        const l: AdminNote[] = rows.map((r) => ({ a: ms(r.at), by: r.who, w: r.what }));
        player.send({ r: S2C.ADMIN_LOG, i: id, l });
    }

    //#endregion

    //#region reports

    public async reports(player: Player) {
        const rows = await this.query(
            `SELECT r.id, r.at, r.reason, r.line, r.context, r.reported_id, a.display_name reporter, b.display_name reported FROM chat_report r
             JOIN player a ON a.id = r.reporter_id JOIN player b ON b.id = r.reported_id
             WHERE r.done = 0 ORDER BY r.id DESC LIMIT ?`, [ADMIN_REPORTS_MOST]);
        const [count] = await this.query("SELECT COUNT(*) n FROM chat_report WHERE done = 0");
        const l: AdminReport[] = rows.map((r) => ({
            i: r.id, a: ms(r.at), w: r.reason, l: r.line, x: r.context, by: r.reporter, of: r.reported, oi: r.reported_id,
        }));
        player.send({ r: S2C.ADMIN_REPORTS, l, n: Number(count?.n ?? 0) });
    }

    public async reportDone(player: Player, id: any) {
        if (!Number.isInteger(id)) return;
        const [result] = await this.write("UPDATE chat_report SET done = 1 WHERE id = ? AND done = 0", [id]);
        if (result.affectedRows) this.done(player, `Report #${id} dealt with`);
        await this.reports(player);
    }

    //#endregion

    //#region the server

    public say(player: Player, t: any) {
        const text = typeof t == "string" ? t.replace(/\s+/g, " ").replace(/[\x00-\x1f\x7f]/g, "").trim().slice(0, ADMIN_SAY_LONGEST) : "";
        if (!text) return;
        IBS.chat.announce(text);
        this.done(player, `Announced: "${text}"`);
    }

    public async event(player: Player, k: any, sight?: any) {
        // (something to turn up on the map for a while: shared/Sights.ts)
        if (sight) {
            if (!Number.isInteger(k) || (k != -1 && !KIND_NAMES[k])) return;
            const s = await IBS.sights.start(k == -1 ? undefined : k);
            if (!s) return this.refuse(player, "There's nowhere free for that now");
            return this.done(player, `Started ${KIND_NAMES[s.k]}: ${s.n}`);
        }
        if (!Number.isInteger(k) || (k != -1 && !EVENT_KINDS[k])) return;
        const e = await IBS.events.start(k == -1 ? undefined : k);
        if (!e) return this.refuse(player, "There's nowhere free for that event now");
        this.done(player, `Started ${e.n}`);
    }

    //#endregion

    private async query(sql: string, values: any[] = []) {
        const conn = await IBS.db.getConnection();
        try {
            const [rows] = await conn.query<RowDataPacket[]>(sql, values);
            return rows;
        } finally {
            conn.release();
        }
    }

    private async write(sql: string, values: any[] = []) {
        const conn = await IBS.db.getConnection();
        try {
            return await conn.query<ResultSetHeader>(sql, values);
        } finally {
            conn.release();
        }
    }

}

// a DATETIME (a Date) or ms, as ms
function ms(v: any) {
    return v instanceof Date ? v.getTime() : Number(v) || new Date(v).getTime() || 0;
}

// a stash's things as saved ([[item id, amount]], JSON)
function parseItems(v: any): [number, number][] {
    const items = typeof v == "string" ? JSON.parse(v || "[]") : v ?? [];
    return items.map((it: number[]): [number, number] => [Number(it[0]), Number(it[1])]);
}

function num(n: number) {
    return Math.round(n).toLocaleString("en-US");
}

// someone on the market whose account's gone
const FORMER = "'a former player'";
