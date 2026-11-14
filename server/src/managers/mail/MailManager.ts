import { PoolConnection, RowDataPacket } from "mysql2/promise";
import { checkEnclosed, cleanNote, INBOX_MOST, Letter, LETTER_MS, letterProblem, SEND_GAP_MS } from "../../../../shared/Mail";
import { isEmpty, Offer } from "../../../../shared/Trade";
import { itemName } from "../../../../shared/Tasks";
import { IBS } from "../../app";
import { S2C } from "../../constants/Routes";
import { Inventory } from "../inventory/Inventory";
import { Player } from "../player/Player";
import { Log } from "../../utils/Log";

// Mail (shared/Mail.ts): letters to friends and guildmates, signed in or not.
// Nothing's kept in memory: a letter is a `mail` row, what's in it out of the
// sender's stash as it's saved (one transaction) and into the reader's as
// they Take it (one transaction, the row locked, so it's taken once). Nobody
// signed out has their stash touched: things wait in the letter. Letters that
// have run out are looked for every SWEEP_MS: one with things still in it goes
// back to its sender (never to run out again), any other's thrown away.

// what a sweep does to a letter that's run out (MAIL_NEW's b)
enum Back { NONE, SENT_BACK, RAN_OUT }

export class MailManager {

    public static SWEEP_MS = 60 * 1000;
    public static SWEEP_MOST = 200;             // letters run out, a sweep
    public static SHOWN_MOST = INBOX_MOST + 50; // (with those sent back)

    private lastSent = new Map<number, number>();
    private turns = new Map<number, Promise<void>>();   // (player id: the last of their sends, takes and the like: inTurn)
    private sweepTime = 0;
    private sweeping = false;

    public async init() {
        await this.query(`CREATE TABLE IF NOT EXISTS mail (
            id INT AUTO_INCREMENT PRIMARY KEY,
            from_id INT NOT NULL,
            to_id INT NOT NULL,
            note VARCHAR(255) NOT NULL DEFAULT '',
            gold BIGINT NOT NULL DEFAULT 0,
            items TEXT NOT NULL,
            sent BIGINT NOT NULL,
            ends BIGINT NOT NULL,
            unread TINYINT NOT NULL DEFAULT 1,
            taken TINYINT NOT NULL DEFAULT 0,
            returned TINYINT NOT NULL DEFAULT 0,
            hidden TINYINT NOT NULL DEFAULT 0,
            INDEX (to_id, hidden),
            INDEX (from_id),
            INDEX (ends))`);
        this.sweepTime = MailManager.SWEEP_MS;      // (the first sweep as it starts: letters may have run out while it was down)
    }

    public update(deltaTime: number) {
        if ((this.sweepTime += deltaTime) < MailManager.SWEEP_MS || this.sweeping) return;
        this.sweepTime = 0;
        this.sweeping = true;
        this.sweep().catch(Log.catch("Mail: couldn't sweep the letters run out")).finally(() => this.sweeping = false);
    }

    //#region reading

    // your mailbox, newest first (letters from someone you'd blocked as they sent it never shown: `hidden`)
    public async list(player: Player) {
        const rows = await this.query(
            `SELECT m.*, p.display_name FROM mail m LEFT JOIN player p ON p.id = m.from_id
            WHERE m.to_id = ? AND m.hidden = 0 ORDER BY m.sent DESC, m.id DESC LIMIT ?`, [player.id, MailManager.SHOWN_MOST]);
        const letters = rows.map((r): Letter => {
            const l: Letter = { i: r.id, f: r.display_name ?? "", p: r.from_id, t: r.note, g: Number(r.gold), o: JSON.parse(r.items), a: Number(r.sent), e: Number(r.ends) };
            if (r.unread) l.u = 1;
            if (r.taken) l.k = 1;
            if (r.returned) l.b = 1;
            return l;
        });
        player.send({ r: S2C.MAIL_LIST, l: letters, u: letters.filter((l) => l.u).length });
    }

    public async read(player: Player, id: any) {
        if (!Number.isInteger(id)) return;
        await this.query("UPDATE mail SET unread = 0 WHERE id = ? AND to_id = ? AND hidden = 0", [id, player.id]);
        player.send({ r: S2C.MAIL_UNREAD, u: await this.unread(player.id) });
    }

    // as they sign in: how many they've not opened
    public async signedIn(player: Player) {
        const u = await this.unread(player.id);
        if (player.online) player.send({ r: S2C.MAIL_UNREAD, u, s: 1 });
    }

    private async unread(playerId: number) {
        return Number((await this.query("SELECT COUNT(*) n FROM mail WHERE to_id = ? AND hidden = 0 AND unread = 1", [playerId]))[0].n);
    }

    // a letter's come for them (b: Back): told if they're signed in
    private async tellNew(playerId: number, from: string, back: Back) {
        const them = IBS.players.getById(playerId);
        if (!them?.online) return;
        them.send({ r: S2C.MAIL_NEW, n: from, u: await this.unread(playerId), ...(back ? { b: back } : {}) });
    }

    //#endregion

    //#region sending

    private refuse(player: Player, why: string) {
        player.send({ r: S2C.MAIL_REFUSED, w: why });
    }

    // a letter to a friend or guildmate by name: a note, and things and gold
    // from your stash (out of it as it's saved)
    public send(player: Player, name: any, note: any, gold: any, items: any) {
        return this.inTurn(player, () => this.sendNow(player, name, note, gold, items));
    }

    private async sendNow(player: Player, name: any, note: any, gold: any, items: any) {
        if (typeof name != "string" || !(name = name.trim()) || name.length > 64) return this.refuse(player, "Who's it to?");
        const t = cleanNote(note), inv = player.inventory;
        const have = (id: number) => inv.items.get(id)?.amount ?? 0;
        const why = letterProblem(t, checkEnclosed(gold, items, have, inv.gold));
        if (why) return this.refuse(player, why);
        if (player.record.isGuest() && !isEmpty(checkEnclosed(gold, items, have, inv.gold)))
            return this.refuse(player, "Save your account first (Settings) - guests can send notes, not things or gold");
        const bad = t ? IBS.chat.refusal(player, t, false) : "";       // (the muted still write to friends, as they whisper)
        if (bad) return this.refuse(player, bad);
        const now = Date.now();
        if (now - (this.lastSent.get(player.id) ?? 0) < SEND_GAP_MS) return this.refuse(player, "Wait a moment before sending another");
        const found = await this.query("SELECT id, display_name FROM player WHERE display_name = ? LIMIT 2", [name]);
        if (!found.length) return this.refuse(player, `No one's called ${name}`);
        if (found.length > 1) return this.refuse(player, `More than one player's called ${name}`);
        const to: number = found[0].id, toName: string = found[0].display_name;
        if (to == player.id) return this.refuse(player, "That's you");
        if (!player.social?.friends.has(to) && !IBS.guilds.together(player.id, to)) return this.refuse(player, "Mail goes to friends and guildmates only");
        if (player.social?.blocks.has(to)) return this.refuse(player, `You've blocked ${toName}`);
        // (one who's blocked you is sent to as far as you can tell; they never see it, and it comes back as it runs out)
        const hidden = await IBS.friends.hasBlocked(to, player.id);
        if (!hidden) {
            const [{ n }] = await this.query("SELECT COUNT(*) n FROM mail WHERE to_id = ? AND hidden = 0 AND returned = 0", [to]);
            if (n >= INBOX_MOST) return this.refuse(player, `${toName}'s mailbox is full`);
        }

        // (checked again against the stash as it is now, and out of it before anything's awaited)
        const enclosed = checkEnclosed(gold, items, have, inv.gold);
        if (!enclosed) return this.refuse(player, "You don't have all of that any more");
        this.move(inv, enclosed, -1);
        try {
            await this.saving(async (conn) => {
                await conn.query("INSERT INTO mail (from_id, to_id, note, gold, items, sent, ends, hidden) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                    [player.id, to, t, enclosed.g, JSON.stringify(enclosed.i), now, now + LETTER_MS, hidden ? 1 : 0]);
                await this.saveStash(conn, player);
            });
        } catch (e) {
            Log.error("Mail: couldn't send a letter", e, { playerId: player.id });
            this.move(inv, enclosed, 1);
            IBS.heroes.tasks.sendStash(player);
            return this.refuse(player, "Couldn't send it - try again");
        }
        this.lastSent.set(player.id, now);
        const said = this.said(enclosed);
        Log.info(`Mail: ${player.record.displayName} sent ${toName} ${said}${hidden ? " (they've blocked them: hidden)" : ""}`);
        this.done(player, `Sent to ${toName}${isEmpty(enclosed) ? "" : ` with ${said}`}`);
        if (!hidden) await this.tellNew(to, player.record.displayName, Back.NONE);
    }

    //#endregion

    //#region what's in a letter

    // what's in one of yours into your stash, once (the row locked while it's taken)
    public async take(player: Player, id: any) {
        await this.locked(player, id, "Couldn't take it - try again", async (conn, r, undo) => {
            if (r.taken || !this.hasThings(r)) return "There's nothing in it to take";
            const got: Offer = { g: Number(r.gold), i: JSON.parse(r.items) };
            await conn.query("UPDATE mail SET taken = 1, unread = 0 WHERE id = ?", [r.id]);
            this.move(player.inventory, got, 1);
            undo(() => {
                this.move(player.inventory, got, -1);
                IBS.heroes.tasks.sendStash(player);
            });
            await this.saveStash(conn, player);
            return () => {
                Log.info(`Mail: ${player.record.displayName} took ${this.said(got)} (letter ${r.id})`);
                this.done(player, `Took ${this.said(got)}`);
            };
        });
    }

    // one of yours sent back to whoever sent it, with what's in it (it never runs out)
    public async sendBack(player: Player, id: any) {
        await this.locked(player, id, "Couldn't send it back - try again", async (conn, r) => {
            if (r.returned) return "It's been sent back to you already";
            if (!r.from_id) return "There's no one to send it back to";
            if (r.taken || !this.hasThings(r)) return "There's nothing in it to send back";
            await conn.query("UPDATE mail SET from_id = ?, to_id = ?, returned = 1, unread = 1, ends = 0, sent = ? WHERE id = ?",
                [player.id, r.from_id, Date.now(), r.id]);
            return async () => {
                const name = (await this.query("SELECT display_name FROM player WHERE id = ?", [r.from_id]))[0]?.display_name ?? "them";
                Log.info(`Mail: ${player.record.displayName} sent letter ${r.id} back`);
                this.done(player, `Sent back to ${name}`);
                await this.tellNew(r.from_id, player.record.displayName, Back.SENT_BACK);
            };
        });
    }

    // one of yours with nothing left in it, thrown away
    public async remove(player: Player, id: any) {
        await this.locked(player, id, "Couldn't throw it away - try again", async (conn, r) => {
            if (!r.taken && this.hasThings(r)) return "Take what's in it first";
            await conn.query("DELETE FROM mail WHERE id = ?", [r.id]);
            return () => { };
        });
    }

    // A letter of theirs, its row locked, to `work` on: what it returns is
    // why it can't be (said, nothing saved), or what to do once it's saved;
    // what it changed in memory it can say how to `undo`, done if the save
    // fails. Their mailbox goes again after either.
    private async locked(player: Player, id: any, failed: string,
        work: (conn: PoolConnection, r: RowDataPacket, undo: (f: () => void) => void) => Promise<string | (() => void | Promise<void>)>) {
        if (!Number.isInteger(id)) return;
        await this.inTurn(player, async () => {
            let after: () => void | Promise<void> = null, undo: () => void = null;
            const conn = await IBS.db.getConnection();
            try {
                await conn.beginTransaction();
                const [rows] = await conn.query<RowDataPacket[]>("SELECT * FROM mail WHERE id = ? AND to_id = ? AND hidden = 0 FOR UPDATE", [id, player.id]);
                const outcome = rows.length ? await work(conn, rows[0], (f) => undo = f) : "That letter's gone";
                if (typeof outcome == "string") {
                    await conn.rollback();
                    this.refuse(player, outcome);
                } else {
                    await conn.commit();
                    after = outcome;
                }
            } catch (e) {
                undo?.();
                await conn.rollback().catch(() => { });
                Log.error("Mail: couldn't change a letter", e, { playerId: player.id, letter: id });
                this.refuse(player, failed);
            } finally {
                conn.release();
            }
            await after?.();
            await this.list(player);
        });
    }

    // one thing at a time a player (a send, a take...): each waits for the last
    // of theirs, so two clicks at once are done one after the other, never together
    private inTurn(player: Player, work: () => Promise<void>) {
        const next = (this.turns.get(player.id) ?? Promise.resolve()).then(work, work);
        const kept = next.catch(() => { });
        this.turns.set(player.id, kept);
        kept.then(() => { if (this.turns.get(player.id) == kept) this.turns.delete(player.id); });
        return next;
    }

    private hasThings(r: RowDataPacket) {
        return Number(r.gold) > 0 || JSON.parse(r.items).length > 0;
    }

    //#endregion

    //#region run out

    // Letters past their time: one with things still in it back to its sender
    // (as theirs, never to run out), others thrown away. (Each changed only if
    // it's as it was read: one being taken meanwhile is left to the next.)
    private async sweep() {
        const now = Date.now();
        const rows = await this.query(
            `SELECT m.id, m.from_id, m.to_id, m.gold, m.items, m.taken, m.returned, p.display_name FROM mail m LEFT JOIN player p ON p.id = m.to_id
            WHERE m.ends > 0 AND m.ends <= ? LIMIT ?`, [now, MailManager.SWEEP_MOST]);
        let back = 0, gone = 0;
        for (const r of rows) {
            if (IBS.closing) return;
            if (!r.taken && !r.returned && r.from_id && this.hasThings(r)) {
                const done = await this.query<any>(
                    "UPDATE mail SET from_id = ?, to_id = ?, returned = 1, unread = 1, hidden = 0, ends = 0, sent = ? WHERE id = ? AND to_id = ? AND taken = 0 AND ends > 0",
                    [r.to_id, r.from_id, now, r.id, r.to_id]);
                if (!done.affectedRows) continue;
                back++;
                await this.tellNew(r.from_id, r.display_name ?? "", Back.RAN_OUT);
            } else {
                const done = await this.query<any>("DELETE FROM mail WHERE id = ? AND ends > 0 AND ends <= ? AND (taken = 1 OR returned = 1 OR from_id = 0 OR (gold = 0 AND items = '[]'))", [r.id, now]);
                gone += done.affectedRows;
            }
        }
        if (back || gone) Log.info(`Mail: letters run out: ${back} back to their senders, ${gone} thrown away`);
    }

    //#endregion

    //#region bits

    private async query<T = RowDataPacket[]>(sql: string, values: any[] = []): Promise<T> {
        const conn = await IBS.db.getConnection();
        try {
            const [rows] = await conn.query(sql, values);
            return rows as T;
        } finally {
            conn.release();
        }
    }

    private async saving(work: (conn: PoolConnection) => Promise<void>) {
        const conn = await IBS.db.getConnection();
        try {
            await conn.beginTransaction();
            await work(conn);
            await conn.commit();
        } catch (e) {
            await conn.rollback().catch(() => { });
            throw e;
        } finally {
            conn.release();
        }
    }

    // a player's stash as it is in memory
    private async saveStash(conn: PoolConnection, player: Player) {
        const inv = player.inventory.getJSON();
        await conn.query("UPDATE inventory SET gold = ?, items = ? WHERE player_id = ?", [inv.g, JSON.stringify(inv.i), player.id]);
    }

    // what's in a letter into a stash (1) or out of it (-1)
    private move(inv: Inventory, o: Offer, sign: 1 | -1) {
        if (o.g) inv.adjustGold(sign * o.g);
        for (const [id, n] of o.i) inv.adjustItem(id, sign * n);
    }

    private said(o: Offer) {
        return [...o.i.map(([id, n]) => `${n} ${itemName(id)}`), ...(o.g ? [`${o.g.toLocaleString("en-US")}g`] : [])].join(", ") || "nothing";
    }

    // done: said, and the stash sent
    private done(player: Player, what: string) {
        IBS.heroes.tasks.sendStash(player);
        player.send({ r: S2C.MAIL_DONE, w: what });
    }

    //#endregion

}
