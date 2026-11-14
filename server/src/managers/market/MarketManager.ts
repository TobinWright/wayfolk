import { PoolConnection, RowDataPacket } from "mysql2/promise";
import {
    DAY_MS, DayRow, HISTORY_DAYS, isItem, itemMatches, itemOrder, LISTING_MS, listingProblem, listingsMost, ListingRow, orderMatches, orderProblem,
    OrderRow, ordersMost, PriceHistory, SaleRow, SHOWN_MOST, sortOf, SORTS,
} from "../../../../shared/Market";
import { itemName } from "../../../../shared/Tasks";
import { IBS } from "../../app";
import { S2C } from "../../constants/Routes";
import { Player } from "../player/Player";
import { GUEST_SAVE } from "../database/PlayerRecord";
import { Log } from "../../utils/Log";

// The market (shared/Market.ts): listings at a price each, bought outright,
// some or all; and buy orders, their gold set aside, sold to. Listings and
// orders on are kept in memory (loaded on starting); every change is checked
// and made in memory first - so two at once can't both have the last one -
// then saved with the stashes it touched in one transaction. A seller who
// isn't loaded is paid as they next load (a sale saved unpaid), and what's
// left of a listing that ran out goes back the same way; a buyer who isn't
// is given what was sold to their order as they load (the order's `owed`),
// and the gold of one that ran out. Price history is worked out from the
// sales (each thing's kept a minute, or till it next sells).

interface Listing {
    id: number;
    seller: number;         // player id
    item: number;
    amount: number;         // left
    price: number;          // gold each
    ends: number;           // ms
}

interface Order {
    id: number;
    buyer: number;          // player id
    item: number;
    amount: number;         // still wanted (its gold set aside)
    price: number;          // gold each
    ends: number;           // ms
}

// (market_listing.state and market_order.state, saved: never renumber. An order's SOLD: all it wanted bought)
enum State { ON, SOLD, CANCELLED, EXPIRED, RETURNED }

// who bought it, once their account's deleted (a seller's still paid for it: the sale stays)
const FORMER = "'a former player'";

export class MarketManager {

    public static CHECK_MS = 5000;          // how often ended listings and orders are looked for
    public static SALES_SHOWN = 20;         // your last sales, in the Selling tab
    public static HISTORY_MS = 60000;       // a thing's price history kept this long (or till it next sells)

    private listings = new Map<number, Listing>();
    private orders = new Map<number, Order>();
    private names = new Map<number, string>();         // seller's or buyer's player id: their name
    private prices = new Map<number, { at: number, d: DayRow[], l: number }>();    // item: its history, as worked out
    private checkTime = 0;

    public async init() {
        const conn = await IBS.db.getConnection();
        try {
            await conn.query(`CREATE TABLE IF NOT EXISTS market_listing (
                id INT AUTO_INCREMENT PRIMARY KEY,
                seller_id INT NOT NULL,
                item INT NOT NULL,
                amount INT NOT NULL,
                price INT NOT NULL,
                listed BIGINT NOT NULL,
                ends BIGINT NOT NULL,
                state TINYINT NOT NULL DEFAULT 0,
                INDEX (state),
                INDEX (seller_id, state))`);
            await conn.query(`CREATE TABLE IF NOT EXISTS market_sale (
                id INT AUTO_INCREMENT PRIMARY KEY,
                listing_id INT NOT NULL,
                order_id INT NOT NULL DEFAULT 0,
                seller_id INT NOT NULL,
                buyer_id INT NOT NULL,
                item INT NOT NULL,
                amount INT NOT NULL,
                gold BIGINT NOT NULL,
                at BIGINT NOT NULL,
                paid TINYINT NOT NULL DEFAULT 0,
                INDEX (seller_id, paid),
                INDEX (seller_id, at),
                INDEX item_at (item, at))`);
            // (a sale to a buy order: the order's id, its listing_id 0; looked up by thing for its price history)
            await this.alter(conn, "ALTER TABLE market_sale ADD COLUMN order_id INT NOT NULL DEFAULT 0 AFTER listing_id");
            await this.alter(conn, "ALTER TABLE market_sale ADD INDEX item_at (item, at)");
            await conn.query(`CREATE TABLE IF NOT EXISTS market_order (
                id INT AUTO_INCREMENT PRIMARY KEY,
                buyer_id INT NOT NULL,
                item INT NOT NULL,
                amount INT NOT NULL,
                price INT NOT NULL,
                placed BIGINT NOT NULL,
                ends BIGINT NOT NULL,
                state TINYINT NOT NULL DEFAULT 0,
                owed INT NOT NULL DEFAULT 0,
                INDEX (state),
                INDEX (buyer_id, state))`);
            const [rows] = await conn.query<RowDataPacket[]>(
                "SELECT l.*, p.display_name FROM market_listing l JOIN player p ON p.id = l.seller_id WHERE l.state = ?", [State.ON]);
            for (const r of rows) {
                this.listings.set(r.id, { id: r.id, seller: r.seller_id, item: r.item, amount: r.amount, price: r.price, ends: Number(r.ends) });
                this.names.set(r.seller_id, r.display_name);
            }
            const [orders] = await conn.query<RowDataPacket[]>(
                "SELECT o.*, p.display_name FROM market_order o JOIN player p ON p.id = o.buyer_id WHERE o.state = ?", [State.ON]);
            for (const r of orders) {
                this.orders.set(r.id, { id: r.id, buyer: r.buyer_id, item: r.item, amount: r.amount, price: r.price, ends: Number(r.ends) });
                this.names.set(r.buyer_id, r.display_name);
            }
            Log.info(`Market Listings: ${this.listings.size}, Orders: ${this.orders.size}`);
        } finally {
            conn.release();
        }
    }

    // a column or index added to a table made before it was (there already: nothing)
    private async alter(conn: PoolConnection, sql: string) {
        try {
            await conn.query(sql);
        } catch (e) {
            if ((e as any).errno != 1060 && (e as any).errno != 1061) throw e;
        }
    }

    public update(deltaTime: number) {
        if ((this.checkTime += deltaTime) < MarketManager.CHECK_MS) return;
        this.checkTime = 0;
        const now = Date.now();
        for (const l of Array.from(this.listings.values()))
            if (l.ends <= now) this.expire(l).catch(Log.catch("Market: couldn't expire a listing", { listing: l.id }));
        for (const o of Array.from(this.orders.values()))
            if (o.ends <= now) this.expireOrder(o).catch(Log.catch("Market: couldn't expire an order", { order: o.id }));
    }

    public renamed(player: Player) {
        if (this.names.has(player.id)) this.names.set(player.id, player.record.displayName);
    }

    // An account being deleted (AccountManager): its listings and orders off
    // the market (what's in them, and the gold set aside, goes with the
    // account). Its rows go with the rest of it; sales to it stay, the seller paid as ever.
    public forget(player: Player) {
        for (const l of Array.from(this.listings.values())) if (l.seller == player.id) this.listings.delete(l.id);
        for (const o of Array.from(this.orders.values())) if (o.buyer == player.id) this.orders.delete(o.id);
        this.names.delete(player.id);
    }

    //#region looking

    private row(l: Listing): ListingRow {
        return [l.id, l.item, l.amount, l.price, l.seller, this.names.get(l.seller) ?? "Someone", l.ends];
    }

    private orderRow(o: Order): OrderRow {
        return [o.id, o.item, o.amount, o.price, o.buyer, this.names.get(o.buyer) ?? "Someone", o.ends];
    }

    // of a sort ("" all) whose thing's name has the words searched for
    private matching<T extends { item: number }>(all: Iterable<T>, sort: any, search: any) {
        const s = SORTS.some((x) => x.sort == sort) ? sort : "";
        const q = typeof search == "string" ? search.slice(0, 40) : "";
        return Array.from(all).filter((x) => (!s || sortOf(x.item) == s) && (!q || itemMatches(x.item, q)));
    }

    // listings: by thing, then cheapest first
    public list(player: Player, sort: any, search: any) {
        const found = this.matching(this.listings.values(), sort, search)
            .sort((a, b) => itemOrder(a.item) - itemOrder(b.item) || a.price - b.price || a.ends - b.ends);
        player.send({ r: S2C.MARKET_LIST, l: found.slice(0, SHOWN_MOST).map((l) => this.row(l)), n: found.length });
    }

    // buy orders: by thing, then the most paid first
    public wanted(player: Player, sort: any, search: any) {
        const found = this.matching(this.orders.values(), sort, search)
            .sort((a, b) => itemOrder(a.item) - itemOrder(b.item) || b.price - a.price || a.ends - b.ends);
        player.send({ r: S2C.MARKET_WANTED, l: found.slice(0, SHOWN_MOST).map((o) => this.orderRow(o)), n: found.length });
    }

    // your listings and orders (soonest to end first) and your last sales
    public async mine(player: Player) {
        const conn = await IBS.db.getConnection();
        let sales: SaleRow[];
        try {
            const [rows] = await conn.query<RowDataPacket[]>(
                `SELECT s.item, s.amount, s.gold, COALESCE(p.display_name, ${FORMER}) display_name, s.at FROM market_sale s LEFT JOIN player p ON p.id = s.buyer_id
                WHERE s.seller_id = ? ORDER BY s.at DESC LIMIT ?`, [player.id, MarketManager.SALES_SHOWN]);
            sales = rows.map((r): SaleRow => [r.item, r.amount, Number(r.gold), r.display_name, Number(r.at)]);
        } finally {
            conn.release();
        }
        const premium = player.record.isPremium();
        player.send({
            r: S2C.MARKET_MINE, l: this.of(player).map((l) => this.row(l)), s: sales, m: listingsMost(premium),
            o: this.ordersOf(player).map((o) => this.orderRow(o)), om: ordersMost(premium),
        });
    }

    private of(player: Player) {
        return Array.from(this.listings.values()).filter((l) => l.seller == player.id).sort((a, b) => a.ends - b.ends);
    }

    private ordersOf(player: Player) {
        return Array.from(this.orders.values()).filter((o) => o.buyer == player.id).sort((a, b) => a.ends - b.ends);
    }

    // anyone else's listings of a thing, and orders for it
    private listingsFor(item: number, not = 0) {
        return Array.from(this.listings.values()).filter((l) => l.item == item && l.seller != not);
    }

    private ordersFor(item: number, not = 0) {
        return Array.from(this.orders.values()).filter((o) => o.item == item && o.buyer != not);
    }

    // what a thing's sold for, day by day, and what's on the market for it now
    public async history(player: Player, item: any) {
        if (!isItem(item)) return;
        const now = Date.now();
        let h = this.prices.get(item);
        if (!h || now - h.at >= MarketManager.HISTORY_MS) {
            const since = (Math.floor(now / DAY_MS) - HISTORY_DAYS + 1) * DAY_MS;
            const conn = await IBS.db.getConnection();
            try {
                const [days] = await conn.query<RowDataPacket[]>(
                    `SELECT FLOOR(at / ?) day, SUM(amount) n, SUM(gold) g, MIN(gold / amount) lo, MAX(gold / amount) hi
                    FROM market_sale WHERE item = ? AND at >= ? GROUP BY day ORDER BY day`, [DAY_MS, item, since]);
                const [last] = await conn.query<RowDataPacket[]>("SELECT gold, amount FROM market_sale WHERE item = ? ORDER BY at DESC, id DESC LIMIT 1", [item]);
                h = {
                    at: now, l: last.length ? Math.round(Number(last[0].gold) / last[0].amount) : 0,
                    d: days.map((r): DayRow => [Number(r.day) * DAY_MS, Number(r.n), Number(r.g), Math.round(Number(r.lo)), Math.round(Number(r.hi))]),
                };
            } finally {
                conn.release();
            }
            this.prices.set(item, h);
        }
        const listed = this.listingsFor(item), wanted = this.ordersFor(item);
        const best = Math.max(0, ...wanted.map((o) => o.price));
        const history: PriceHistory = {
            i: item, d: h.d, l: h.l, c: listed.length ? Math.min(...listed.map((l) => l.price)) : 0,
            w: best, x: wanted.filter((o) => o.price == best).reduce((n, o) => n + o.amount, 0),
        };
        player.send({ r: S2C.MARKET_HISTORY, h: history });
    }

    //#endregion

    //#region selling, buying, cancelling

    private refuse(player: Player, why: string) {
        player.send({ r: S2C.MARKET_REFUSED, w: why });
    }

    // some of a thing in your stash onto the market at a price each: sold
    // first to buy orders paying that or more (the most first, at theirs),
    // the rest listed
    public async sell(player: Player, item: any, amount: any, price: any) {
        if (player.record.isGuest()) return this.refuse(player, GUEST_SAVE);
        if (!isItem(item)) return this.refuse(player, "That can't be sold");
        const inv = player.inventory;
        const why = listingProblem(amount, price, inv.items.get(item)?.amount ?? 0);
        if (why) return this.refuse(player, why);
        const orders = orderMatches(this.ordersFor(item, player.id), price, false);
        const most = listingsMost(player.record.isPremium());
        if (amount > orders.reduce((n, o) => n + o.amount, 0) && this.of(player).length >= most) return this.refuse(player, `You can have ${most} listings at once`);

        inv.adjustItem(item, -amount);
        let left = amount, gold = 0;
        for (const o of orders) {
            if (!left) break;
            const n = await this.fill(player, o, left);
            left -= n;
            gold += n * o.price;
        }
        const sold = amount - left, toOrders = sold ? `Sold ${sold} ${itemName(item)} to buy orders for ${gold.toLocaleString("en-US")}g` : "";
        if (!left) return this.done(player, toOrders);

        const now = Date.now(), l: Listing = { id: 0, seller: player.id, item, amount: left, price, ends: now + LISTING_MS };
        try {
            await this.saving(async (conn) => {
                const [result] = await conn.query<any>("INSERT INTO market_listing (seller_id, item, amount, price, listed, ends, state) VALUES (?, ?, ?, ?, ?, ?, ?)",
                    [l.seller, l.item, l.amount, l.price, now, l.ends, State.ON]);
                l.id = result.insertId;
                await this.saveStash(conn, player);
            });
        } catch (e) {
            Log.error("Market: couldn't list", e, { playerId: player.id });
            inv.adjustItem(item, left);
            IBS.heroes.tasks.sendStash(player);
            return sold ? this.done(player, `${toOrders} - couldn't list the rest`) : this.refuse(player, "Couldn't list it - try again");
        }
        this.listings.set(l.id, l);
        this.names.set(player.id, player.record.displayName);
        Log.info(`Market: ${player.record.displayName} listed ${left} ${itemName(item)} at ${price}g`);
        const listed = `Listed ${left} ${itemName(item)} at ${price.toLocaleString("en-US")}g each`;
        this.done(player, sold ? `${toOrders}; l${listed.slice(1)}` : listed);
    }

    // some or all of a listing, at the price it was seen at (refused if it's changed)
    public async buy(player: Player, id: any, amount: any, price: any) {
        if (player.record.isGuest()) return this.refuse(player, GUEST_SAVE);
        const l = this.listings.get(id);
        if (!l) return this.refuse(player, "That's gone - someone bought it first");
        if (l.seller == player.id) return this.refuse(player, "That's yours");
        if (l.price != price) return this.refuse(player, "Its price has changed");
        if (!Number.isInteger(amount) || amount < 1) return;
        if (amount > l.amount) return this.refuse(player, `Only ${l.amount} left`);
        const gold = amount * l.price;
        if (player.inventory.gold < gold) return this.refuse(player, "Not enough gold");
        await this.purchase(player, l, amount);
        this.done(player, `Bought ${amount} ${itemName(l.item)} for ${gold.toLocaleString("en-US")}g`);
    }

    // up to `want` of a listing bought, at its price (as many as there are, and
    // their gold buys); how many
    private async purchase(player: Player, l: Listing, want: number) {
        const inv = player.inventory, amount = Math.min(want, l.amount, Math.floor(inv.gold / l.price));
        if (amount < 1 || !this.listings.has(l.id)) return 0;
        const gold = amount * l.price;

        // (all in memory before anything's awaited)
        inv.adjustGold(-gold);
        inv.adjustItem(l.item, amount);
        l.amount -= amount;
        if (!l.amount) this.listings.delete(l.id);
        this.prices.delete(l.item);
        const seller = IBS.players.getById(l.seller), now = Date.now();
        if (seller) seller.inventory.adjustGold(gold);
        try {
            await this.saving(async (conn) => {
                await conn.query("UPDATE market_listing SET amount = ?, state = ? WHERE id = ?", [l.amount, l.amount ? State.ON : State.SOLD, l.id]);
                await conn.query("INSERT INTO market_sale (listing_id, seller_id, buyer_id, item, amount, gold, at, paid) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                    [l.id, l.seller, player.id, l.item, amount, gold, now, seller ? 1 : 0]);
                await this.saveStash(conn, player);
                if (seller) await this.saveStash(conn, seller);
            });
        } catch (e) {
            Log.error("Market: couldn't save a sale", e, { playerId: player.id, listing: l.id });     // (kept as it is in memory: the stashes are saved again with the heroes)
            player.stashDirty = true;
            if (seller) seller.stashDirty = true;
        }
        Log.info(`Market: ${player.record.displayName} bought ${amount} ${itemName(l.item)} for ${gold}g`);
        if (seller) this.tell(seller, { r: S2C.MARKET_SOLD, s: [[l.item, amount, gold, player.record.displayName, now]] });
        return amount;
    }

    // one of yours off the market, what's left of it back in your stash
    public async cancel(player: Player, id: any) {
        const l = this.listings.get(id);
        if (!l || l.seller != player.id) return this.refuse(player, "That's not on the market");
        this.listings.delete(l.id);
        player.inventory.adjustItem(l.item, l.amount);
        try {
            await this.saving(async (conn) => {
                await conn.query("UPDATE market_listing SET state = ? WHERE id = ?", [State.CANCELLED, l.id]);
                await this.saveStash(conn, player);
            });
        } catch (e) {
            Log.error("Market: couldn't save a cancel", e, { playerId: player.id, listing: l.id });
            player.stashDirty = true;
        }
        this.done(player, `${l.amount} ${itemName(l.item)} back in your stash`);
    }

    // out of time: what's left back to the seller now if they're loaded, else as they load
    private async expire(l: Listing) {
        this.listings.delete(l.id);
        const seller = IBS.players.getById(l.seller);
        if (seller) seller.inventory.adjustItem(l.item, l.amount);
        try {
            await this.saving(async (conn) => {
                await conn.query("UPDATE market_listing SET state = ? WHERE id = ?", [seller ? State.RETURNED : State.EXPIRED, l.id]);
                if (seller) await this.saveStash(conn, seller);
            });
        } catch (e) {
            Log.error("Market: couldn't save an expiry", e, { listing: l.id });
            if (seller) seller.stashDirty = true;
        }
        if (seller) this.tell(seller, { r: S2C.MARKET_BACK, i: l.item, n: l.amount });
    }

    //#endregion

    //#region buy orders

    // wanting some of a thing at up to a price each: what's listed at that or
    // less bought first (the cheapest first, at their prices), then the gold
    // for the rest set aside and the order put on the market
    public async order(player: Player, item: any, amount: any, price: any) {
        if (player.record.isGuest()) return this.refuse(player, GUEST_SAVE);
        if (!isItem(item)) return this.refuse(player, "That can't be bought");
        const inv = player.inventory;
        const why = orderProblem(amount, price, inv.gold);
        if (why) return this.refuse(player, why);
        const listings = orderMatches(this.listingsFor(item, player.id), price, true);
        const most = ordersMost(player.record.isPremium());
        if (amount > listings.reduce((n, l) => n + l.amount, 0) && this.ordersOf(player).length >= most) return this.refuse(player, `You can have ${most} buy orders at once`);

        let left = amount, spent = 0;
        for (const l of listings) {
            if (!left) break;
            const n = await this.purchase(player, l, left);
            left -= n;
            spent += n * l.price;
        }
        const got = amount - left, bought = got ? `Bought ${got} ${itemName(item)} for ${spent.toLocaleString("en-US")}g` : "";
        if (!left) return this.done(player, bought);

        const aside = left * price;
        if (inv.gold < aside) return got ? this.done(player, `${bought} - not enough gold left for the rest`) : this.refuse(player, "Not enough gold to set aside");
        inv.adjustGold(-aside);
        const now = Date.now(), o: Order = { id: 0, buyer: player.id, item, amount: left, price, ends: now + LISTING_MS };
        try {
            await this.saving(async (conn) => {
                const [result] = await conn.query<any>("INSERT INTO market_order (buyer_id, item, amount, price, placed, ends, state) VALUES (?, ?, ?, ?, ?, ?, ?)",
                    [o.buyer, o.item, o.amount, o.price, now, o.ends, State.ON]);
                o.id = result.insertId;
                await this.saveStash(conn, player);
            });
        } catch (e) {
            Log.error("Market: couldn't post an order", e, { playerId: player.id });
            inv.adjustGold(aside);
            IBS.heroes.tasks.sendStash(player);
            return got ? this.done(player, `${bought} - couldn't post an order for the rest`) : this.refuse(player, "Couldn't post it - try again");
        }
        this.orders.set(o.id, o);
        this.names.set(player.id, player.record.displayName);
        Log.info(`Market: ${player.record.displayName} wants ${left} ${itemName(item)} at ${price}g`);
        const wants = `Wanted: ${left} ${itemName(item)} at up to ${price.toLocaleString("en-US")}g each (${aside.toLocaleString("en-US")}g set aside)`;
        this.done(player, got ? `${bought}; w${wants.slice(1)}` : wants);
    }

    // some of your stash sold to an order, at the price it was seen at (refused if it's changed)
    public async fillOrder(player: Player, id: any, amount: any, price: any) {
        if (player.record.isGuest()) return this.refuse(player, GUEST_SAVE);
        const o = this.orders.get(id);
        if (!o) return this.refuse(player, "That's gone - someone sold to it first");
        if (o.buyer == player.id) return this.refuse(player, "That's yours");
        if (o.price != price) return this.refuse(player, "Its price has changed");
        if (!Number.isInteger(amount) || amount < 1) return;
        if (amount > o.amount) return this.refuse(player, `They only want ${o.amount}`);
        const inv = player.inventory;
        if (amount > (inv.items.get(o.item)?.amount ?? 0)) return this.refuse(player, "You don't have that many");
        inv.adjustItem(o.item, -amount);
        const n = await this.fill(player, o, amount);
        this.done(player, `Sold ${n} ${itemName(o.item)} for ${(n * o.price).toLocaleString("en-US")}g`);
    }

    // up to `want` sold to an order by a seller (the things already out of
    // their stash), at its price from the gold set aside; how many. The
    // buyer has them now if they're loaded, else as they load
    private async fill(seller: Player, o: Order, want: number) {
        const amount = Math.min(want, o.amount);
        if (amount < 1 || !this.orders.has(o.id)) return 0;
        const gold = amount * o.price;

        // (all in memory before anything's awaited)
        o.amount -= amount;
        if (!o.amount) this.orders.delete(o.id);
        this.prices.delete(o.item);
        seller.inventory.adjustGold(gold);
        const buyer = IBS.players.getById(o.buyer), now = Date.now();
        if (buyer) buyer.inventory.adjustItem(o.item, amount);
        try {
            await this.saving(async (conn) => {
                await conn.query("UPDATE market_order SET amount = ?, state = ?, owed = owed + ? WHERE id = ?", [o.amount, o.amount ? State.ON : State.SOLD, buyer ? 0 : amount, o.id]);
                await conn.query("INSERT INTO market_sale (listing_id, order_id, seller_id, buyer_id, item, amount, gold, at, paid) VALUES (0, ?, ?, ?, ?, ?, ?, ?, 1)",
                    [o.id, seller.id, o.buyer, o.item, amount, gold, now]);
                await this.saveStash(conn, seller);
                if (buyer) await this.saveStash(conn, buyer);
            });
        } catch (e) {
            Log.error("Market: couldn't save a sale to an order", e, { playerId: seller.id, order: o.id });     // (kept as it is in memory, as a sale's)
            seller.stashDirty = true;
            if (buyer) buyer.stashDirty = true;
        }
        Log.info(`Market: ${seller.record.displayName} sold ${amount} ${itemName(o.item)} to an order for ${gold}g`);
        if (buyer) this.tell(buyer, { r: S2C.MARKET_GOT, i: o.item, n: amount, g: gold, s: seller.record.displayName });
        return amount;
    }

    // one of your orders off the market, the gold for what it still wanted back
    public async unorder(player: Player, id: any) {
        const o = this.orders.get(id);
        if (!o || o.buyer != player.id) return this.refuse(player, "That's not on the market");
        this.orders.delete(o.id);
        const gold = o.amount * o.price;
        player.inventory.adjustGold(gold);
        try {
            await this.saving(async (conn) => {
                await conn.query("UPDATE market_order SET state = ? WHERE id = ?", [State.CANCELLED, o.id]);
                await this.saveStash(conn, player);
            });
        } catch (e) {
            Log.error("Market: couldn't save an order taken down", e, { playerId: player.id, order: o.id });
            player.stashDirty = true;
        }
        this.done(player, `${gold.toLocaleString("en-US")}g back in your stash`);
    }

    // out of time: the gold for what it still wanted back to the buyer now if they're loaded, else as they load
    private async expireOrder(o: Order) {
        this.orders.delete(o.id);
        const buyer = IBS.players.getById(o.buyer), gold = o.amount * o.price;
        if (buyer) buyer.inventory.adjustGold(gold);
        try {
            await this.saving(async (conn) => {
                await conn.query("UPDATE market_order SET state = ? WHERE id = ?", [buyer ? State.RETURNED : State.EXPIRED, o.id]);
                if (buyer) await this.saveStash(conn, buyer);
            });
        } catch (e) {
            Log.error("Market: couldn't save an order's expiry", e, { order: o.id });
            if (buyer) buyer.stashDirty = true;
        }
        if (buyer) this.tell(buyer, { r: S2C.MARKET_UNFILLED, i: o.item, n: o.amount, g: gold });
    }

    //#endregion

    //#region while they were away

    // as they load: gold for what sold, what's back from listings that ran
    // out while they weren't, what was sold to their orders and the gold of
    // orders that ran out; kept to tell them as they sign in
    public async payOwed(player: Player) {
        const conn = await IBS.db.getConnection();
        try {
            await conn.beginTransaction();
            const [sales] = await conn.query<RowDataPacket[]>(
                `SELECT s.id, s.item, s.amount, s.gold, COALESCE(p.display_name, ${FORMER}) display_name, s.at FROM market_sale s LEFT JOIN player p ON p.id = s.buyer_id
                WHERE s.seller_id = ? AND s.paid = 0 FOR UPDATE`, [player.id]);
            const [back] = await conn.query<RowDataPacket[]>(
                "SELECT id, item, amount FROM market_listing WHERE seller_id = ? AND state = ? FOR UPDATE", [player.id, State.EXPIRED]);
            const [orders] = await conn.query<RowDataPacket[]>(
                "SELECT id, item, amount, price, owed, state FROM market_order WHERE buyer_id = ? AND (owed > 0 OR state = ?) FOR UPDATE", [player.id, State.EXPIRED]);
            if (!sales.length && !back.length && !orders.length) {
                await conn.rollback();
                return;
            }
            const inv = player.inventory;
            for (const s of sales) inv.adjustGold(Number(s.gold));
            for (const b of back) inv.adjustItem(b.item, b.amount);
            for (const o of orders) {
                if (o.owed > 0) inv.adjustItem(o.item, o.owed);
                if (o.state == State.EXPIRED) inv.adjustGold(o.amount * o.price);
            }
            if (sales.length) await conn.query("UPDATE market_sale SET paid = 1 WHERE id IN (?)", [sales.map((s) => s.id)]);
            if (back.length) await conn.query("UPDATE market_listing SET state = ? WHERE id IN (?)", [State.RETURNED, back.map((b) => b.id)]);
            if (orders.length) await conn.query("UPDATE market_order SET owed = 0, state = IF(state = ?, ?, state) WHERE id IN (?)",
                [State.EXPIRED, State.RETURNED, orders.map((o) => o.id)]);
            await this.saveStash(conn, player);
            await conn.commit();
            if (sales.length) player.marketNotes.push({ r: S2C.MARKET_SOLD, s: sales.map((s): SaleRow => [s.item, s.amount, Number(s.gold), s.display_name, Number(s.at)]) });
            for (const b of back) player.marketNotes.push({ r: S2C.MARKET_BACK, i: b.item, n: b.amount });
            for (const o of orders) {
                if (o.owed > 0) player.marketNotes.push({ r: S2C.MARKET_GOT, i: o.item, n: o.owed, g: o.owed * o.price, s: "" });
                if (o.state == State.EXPIRED) player.marketNotes.push({ r: S2C.MARKET_UNFILLED, i: o.item, n: o.amount, g: o.amount * o.price });
            }
        } catch (e) {
            await conn.rollback().catch(() => { });
            throw e;
        } finally {
            conn.release();
        }
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

    // done: said, and the stash sent
    private done(player: Player, what: string) {
        IBS.heroes.tasks.sendStash(player);
        player.send({ r: S2C.MARKET_DONE, w: what });
    }

    // someone told now if they're signed in (their stash with it), else as they sign in
    private tell(player: Player, note: any) {
        if (player.online) {
            IBS.heroes.tasks.sendStash(player);
            player.send(note);
        } else player.marketNotes.push(note);
    }

    //#endregion

}
