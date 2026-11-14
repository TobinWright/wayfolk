import { PoolConnection } from "mysql2/promise";
import { ASK_GAP_MS, checkOffer, emptyOffer, isEmpty, Offer, REQUEST_MS, TradeAsk, TradeView } from "../../../../shared/Trade";
import { itemName } from "../../../../shared/Tasks";
import { IBS } from "../../app";
import { S2C } from "../../constants/Routes";
import { Player } from "../player/Player";
import { GUEST_SAVE } from "../database/PlayerRecord";
import { Log } from "../../utils/Log";

// Trades between two players (shared/Trade.ts, Lithalia's rules). Asks and
// trades are kept in memory only: nothing leaves a stash until a trade goes
// through, so a restart or someone signing out loses nothing. Going through,
// it's all checked again and both stashes changed in memory at once, then
// saved together with a row in `trade` (what each gave) in one transaction.

interface Ask {
    from: Player;
    to: Player;
    ends: number;
    heard: boolean;         // (false: they've blocked the one asking, so they're never shown it)
}

interface Trade {
    sides: [Player, Player];
    offers: [Offer, Offer];
    ready: [boolean, boolean];
    confirmed: [boolean, boolean];
    going: boolean;         // (going through: saving)
}

export class TradeManager {

    private asks = new Set<Ask>();
    private trades = new Map<number, Trade>();          // (player id: their trade)
    private lastAsked = new Map<number, number>();

    public async init() {
        const conn = await IBS.db.getConnection();
        try {
            await conn.query(`CREATE TABLE IF NOT EXISTS trade (
                id INT AUTO_INCREMENT PRIMARY KEY,
                a_id INT NOT NULL,
                b_id INT NOT NULL,
                a_gold BIGINT NOT NULL,
                a_items TEXT NOT NULL,
                b_gold BIGINT NOT NULL,
                b_items TEXT NOT NULL,
                at BIGINT NOT NULL,
                INDEX (a_id),
                INDEX (b_id))`);
        } finally {
            conn.release();
        }
    }

    // asks not answered in time run out
    public update(deltaTime: number) {
        const now = Date.now();
        for (const a of Array.from(this.asks))
            if (a.ends <= now) this.endAsk(a, `${a.to.record.displayName} didn't answer`, "You didn't answer in time");
    }

    //#region asking

    private refuse(player: Player, why: string) {
        player.send({ r: S2C.TRADE_REFUSED, w: why });
    }

    private askOf(player: Player) {
        for (const a of this.asks) if (a.from == player || a.to == player) return a;
        return null;
    }

    private busy(player: Player) {
        return this.trades.has(player.id) || !!this.askOf(player);
    }

    // asking someone signed in to trade (by their player id)
    public ask(player: Player, id: any) {
        if (!Number.isInteger(id)) return;
        if (id == player.id) return this.refuse(player, "That's you");
        if (player.record.isGuest()) return this.refuse(player, GUEST_SAVE);
        const now = Date.now();
        if (now - (this.lastAsked.get(player.id) ?? 0) < ASK_GAP_MS) return this.refuse(player, "Wait a moment before asking again");
        if (this.trades.has(player.id)) return this.refuse(player, "You're trading already");
        if (this.askOf(player)) return this.refuse(player, "You're in the middle of an ask already");
        const them = IBS.players.getById(id);
        if (!them || !them.online) return this.refuse(player, "They're not signed in");
        const name = them.record.displayName;
        if (them.record.isGuest()) return this.refuse(player, `${name} is a guest - they can trade once they save their account`);
        if (player.social?.blocks.has(id)) return this.refuse(player, `You've blocked ${name}`);
        if (this.busy(them)) return this.refuse(player, `${name} is busy - try again in a moment`);
        this.lastAsked.set(player.id, now);

        // (one who's blocked you is asked as far as you can tell; they never see it, and it runs out)
        const a: Ask = { from: player, to: them, ends: now + REQUEST_MS, heard: !them.social?.blocks.has(player.id) };
        this.asks.add(a);
        player.send({ r: S2C.TRADE_ASKED, a: { f: 1, n: name, e: a.ends } as TradeAsk });
        if (a.heard) them.send({ r: S2C.TRADE_ASKED, a: { f: 0, n: player.record.displayName, e: a.ends } as TradeAsk });
    }

    // an ask to you, answered
    public answer(player: Player, yes: any) {
        const a = this.askOf(player);
        if (!a || a.to != player || !a.heard) return;
        if (!yes) return this.endAsk(a, `${player.record.displayName} said no`, "");
        this.asks.delete(a);
        a.from.send({ r: S2C.TRADE_ASK_END, w: "" });
        player.send({ r: S2C.TRADE_ASK_END, w: "" });
        this.open(a.from, a.to);
    }

    // an ask of yours taken back, or a trade called off
    public cancel(player: Player) {
        const t = this.trades.get(player.id);
        if (t) return this.end(t, `${player.record.displayName} called off the trade`);
        const a = this.askOf(player);
        if (a?.from == player) this.endAsk(a, "", `${player.record.displayName} took it back`);
    }

    // (each told why: the one who asked, the one asked)
    private endAsk(a: Ask, toFrom: string, toTo: string) {
        if (!this.asks.delete(a)) return;
        a.from.send({ r: S2C.TRADE_ASK_END, w: toFrom });
        if (a.heard) a.to.send({ r: S2C.TRADE_ASK_END, w: toTo });
    }

    //#endregion

    //#region trading

    private open(a: Player, b: Player) {
        if (this.trades.has(a.id) || this.trades.has(b.id)) return;
        if (!a.online || !b.online) return;
        const t: Trade = { sides: [a, b], offers: [emptyOffer(), emptyOffer()], ready: [false, false], confirmed: [false, false], going: false };
        this.trades.set(a.id, t);
        this.trades.set(b.id, t);
        Log.info(`Trade: ${a.record.displayName} and ${b.record.displayName} opened a trade`);
        this.show(t);
    }

    // your whole offer, replacing what it was (both Readys cleared)
    public offer(player: Player, g: any, i: any) {
        const t = this.trades.get(player.id);
        if (!t || t.going) return;
        const inv = player.inventory;
        const o = checkOffer({ g, i }, (id) => inv.items.get(id)?.amount ?? 0, inv.gold);
        if (!o) { this.refuse(player, "You can't offer that"); return this.show(t); }
        t.offers[t.sides.indexOf(player)] = o;
        t.ready = [false, false];
        t.confirmed = [false, false];
        this.show(t);
    }

    public ready(player: Player, on: any) {
        const t = this.trades.get(player.id);
        if (!t || t.going) return;
        t.ready[t.sides.indexOf(player)] = on === 1;
        t.confirmed = [false, false];
        this.show(t);
    }

    // only once both are ready; when both have, it goes through
    public confirm(player: Player) {
        const t = this.trades.get(player.id);
        if (!t || t.going || !t.ready[0] || !t.ready[1]) return;
        const me = t.sides.indexOf(player);
        if (isEmpty(t.offers[0]) && isEmpty(t.offers[1])) return this.refuse(player, "Neither of you has offered anything");
        t.confirmed[me] = true;
        if (t.confirmed[1 - me]) return this.complete(t).catch(Log.catch("Trade: couldn't go through"));
        this.show(t);
    }

    // signing out (or their account going): their ask or trade ends
    public leave(player: Player) {
        const t = this.trades.get(player.id);
        if (t) this.end(t, `${player.record.displayName} had to go - the trade's off`);
        const a = this.askOf(player);
        if (a) this.endAsk(a, `${a.to.record.displayName} can't trade right now`, `${a.from.record.displayName} had to go`);
    }

    // Both confirmed: each still has all they offered (else both are told and
    // must be ready again), then swapped at once and saved
    private async complete(t: Trade) {
        for (const side of [0, 1]) {
            const p = t.sides[side], inv = p.inventory, o = t.offers[side];
            const short = o.g > inv.gold || o.i.some(([id, n]) => (inv.items.get(id)?.amount ?? 0) < n);
            if (short) return this.problem(t, `${p.record.displayName} no longer has everything they offered`);
        }

        // (all in memory before anything's awaited, from the offers as they were)
        t.going = true;
        const [a, b] = t.sides, [oa, ob] = t.offers;
        const move = (from: Player, to: Player, o: Offer) => {
            from.inventory.adjustGold(-o.g);
            to.inventory.adjustGold(o.g);
            for (const [id, n] of o.i) {
                from.inventory.adjustItem(id, -n);
                to.inventory.adjustItem(id, n);
            }
        };
        move(a, b, oa);
        move(b, a, ob);
        try {
            await this.saving(async (conn) => {
                await conn.query("INSERT INTO trade (a_id, b_id, a_gold, a_items, b_gold, b_items, at) VALUES (?, ?, ?, ?, ?, ?, ?)",
                    [a.id, b.id, oa.g, JSON.stringify(oa.i), ob.g, JSON.stringify(ob.i), Date.now()]);
                await this.saveStash(conn, a);
                await this.saveStash(conn, b);
            });
        } catch (e) {
            Log.error("Trade: couldn't save a trade", e, { a: a.id, b: b.id });     // (kept as it is in memory: the stashes are saved again with the heroes)
            a.stashDirty = true;
            b.stashDirty = true;
        }
        const said = (o: Offer) => [...o.i.map(([id, n]) => `${n} ${itemName(id)}`), ...(o.g ? [`${o.g}g`] : [])].join(", ") || "nothing";
        Log.info(`Trade: ${a.record.displayName} gave ${said(oa)}; ${b.record.displayName} gave ${said(ob)}`);
        for (const p of t.sides) IBS.heroes.tasks.sendStash(p);
        this.end(t, "", true);
    }

    // it can't go through as it is: both are told why, and must be ready again
    private problem(t: Trade, why: string) {
        t.ready = [false, false];
        t.confirmed = [false, false];
        for (const p of t.sides) this.refuse(p, why);
        this.show(t);
    }

    private end(t: Trade, why: string, done = false) {
        for (const p of t.sides) {
            if (this.trades.get(p.id) != t) continue;
            this.trades.delete(p.id);
            p.send({ r: S2C.TRADE_END, w: why, d: done ? 1 : 0 });
        }
    }

    // each side sees it from theirs
    private show(t: Trade) {
        t.sides.forEach((p, me) => {
            const them = 1 - me, other = t.sides[them];
            const v: TradeView = {
                n: other.record.displayName,
                p: other.id,
                o: [t.offers[me], t.offers[them]],
                rd: [t.ready[me] ? 1 : 0, t.ready[them] ? 1 : 0],
                cf: [t.confirmed[me] ? 1 : 0, t.confirmed[them] ? 1 : 0],
            };
            p.send({ r: S2C.TRADE, t: v });
        });
    }

    //#endregion

    //#region bits

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

    //#endregion

}
