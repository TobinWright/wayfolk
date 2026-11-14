import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { C2S, S2C } from "../../../shared/Routes";
import { Bot, sleep, until, World } from "./harness";

// Buy orders and price history against a real server and database: the gold
// set aside and the things sold to an order moved exactly once, to buyers
// signed in or away. Each test its own thing, so one's orders don't meet another's listings.

let world: World;
before(async () => { world = await World.start(); });
after(async () => { await world?.stop(); });

async function sell(bot: Bot, item: number, n: number, price: number) {
    const m = await bot.ask(C2S.MARKET_SELL, { i: item, n, p: price }, S2C.MARKET_DONE, S2C.MARKET_REFUSED);
    assert.equal(m.r, S2C.MARKET_DONE, m.w);
    return m.w as string;
}

async function order(bot: Bot, item: number, n: number, price: number) {
    const m = await bot.ask(C2S.MARKET_ORDER, { i: item, n, p: price }, S2C.MARKET_DONE, S2C.MARKET_REFUSED);
    assert.equal(m.r, S2C.MARKET_DONE, m.w);
    const [o] = await world.query("SELECT id FROM market_order WHERE buyer_id = ? ORDER BY id DESC LIMIT 1", [bot.id]);
    return o?.id as number;
}

function fill(bot: Bot, id: number, n: number, price: number) {
    return bot.ask(C2S.MARKET_FILL, { o: id, n, p: price }, S2C.MARKET_DONE, S2C.MARKET_REFUSED);
}

test("an order buys what's listed at its price or less, cheapest first, and waits for the rest with its gold set aside", async () => {
    const LOG = 16;
    const seller = await world.player(), buyer = await world.player();
    await world.give(seller, { items: [[LOG, 10]] });
    await world.give(buyer, { gold: 1000 });
    await sell(seller, LOG, 3, 10);
    await sell(seller, LOG, 2, 6);
    await sell(seller, LOG, 5, 20);

    const id = await order(buyer, LOG, 8, 12);
    const b = await world.stash(buyer.id), s = await world.stash(seller.id);
    assert.equal(b.items.get(LOG), 5, "the 2 at 6g and the 3 at 10g");
    assert.equal(b.gold, 1000 - 42 - 36, "42g spent, 36g set aside for 3 more at 12g");
    assert.equal(s.gold, 42);
    const [o] = await world.query("SELECT amount, price, state FROM market_order WHERE id = ?", [id]);
    assert.deepEqual([o.amount, o.price, o.state], [3, 12, 0]);
    const [dear] = await world.query("SELECT amount FROM market_listing WHERE seller_id = ? AND price = 20", [seller.id]);
    assert.equal(dear.amount, 5, "dearer than the order: untouched");
    await until(() => buyer.gold == 922, "the buyer told their gold");
});

test("a listing sells to orders paying that or more first, at their prices, and lists the rest", async () => {
    const LOG = 17;
    const seller = await world.player(), high = await world.player(), low = await world.player();
    await world.give(seller, { items: [[LOG, 10]] });
    await world.give(high, { gold: 500 });
    await world.give(low, { gold: 500 });
    await order(high, LOG, 4, 15);
    await order(low, LOG, 4, 9);

    const got = high.next(S2C.MARKET_GOT);
    await sell(seller, LOG, 6, 12);
    assert.equal((await got).n, 4, "the buyer told");
    const s = await world.stash(seller.id), h = await world.stash(high.id), l = await world.stash(low.id);
    assert.equal(s.gold, 60, "4 at the order's 15g");
    assert.equal(h.items.get(LOG), 4);
    assert.equal(h.gold, 440, "what was set aside paid it");
    assert.equal(l.items.get(LOG) ?? 0, 0, "9g's less than 12g: not sold to");
    const [listing] = await world.query("SELECT amount, price FROM market_listing WHERE seller_id = ?", [seller.id]);
    assert.deepEqual([listing.amount, listing.price], [2, 12]);
    const [o] = await world.query("SELECT amount, state FROM market_order WHERE buyer_id = ?", [high.id]);
    assert.deepEqual([o.amount, o.state], [0, 1], "all it wanted: done");
    await until(() => high.items.get(LOG) == 4, "the buyer's stash sent");
});

test("selling to an order from Wanted; refused at a changed price, your own, more than wanted or had", async () => {
    const LOG = 18;
    const seller = await world.player(), buyer = await world.player();
    await world.give(seller, { items: [[LOG, 5]] });
    await world.give(buyer, { gold: 300 });
    const id = await order(buyer, LOG, 6, 20);

    const wanted = await seller.ask(C2S.MARKET_WANTED, { t: "", q: "maple" }, S2C.MARKET_WANTED);
    assert.ok(wanted.l.some((r: any) => r[0] == id && r[2] == 6 && r[3] == 20), "on the Wanted list");
    assert.equal((await fill(seller, id, 1, 19)).r, S2C.MARKET_REFUSED, "the price changed");
    assert.equal((await fill(buyer, id, 1, 20)).r, S2C.MARKET_REFUSED, "your own");
    assert.equal((await fill(seller, id, 7, 20)).r, S2C.MARKET_REFUSED, "more than's wanted");
    assert.equal((await fill(seller, id, 6, 20)).r, S2C.MARKET_REFUSED, "more than they have");

    const m = await fill(seller, id, 5, 20);
    assert.equal(m.r, S2C.MARKET_DONE, m.w);
    const s = await world.stash(seller.id), b = await world.stash(buyer.id);
    assert.equal(s.gold, 100);
    assert.equal(s.items.get(LOG) ?? 0, 0);
    assert.equal(b.items.get(LOG), 5);
    assert.equal(b.gold, 180, "120g set aside, 100g of it paid out");

    // taken down: the gold for the 1 still wanted back, once
    const down = await buyer.ask(C2S.MARKET_UNORDER, { o: id }, S2C.MARKET_DONE, S2C.MARKET_REFUSED);
    assert.equal(down.r, S2C.MARKET_DONE, down.w);
    assert.equal((await world.stash(buyer.id)).gold, 200);
    assert.equal((await buyer.ask(C2S.MARKET_UNORDER, { o: id }, S2C.MARKET_DONE, S2C.MARKET_REFUSED)).r, S2C.MARKET_REFUSED, "not twice");
    assert.equal((await fill(seller, id, 1, 20)).r, S2C.MARKET_REFUSED, "gone once taken down");
});

test("an order without the gold, or past the limit, is refused with nothing moved", async () => {
    const LOG = 19;
    const buyer = await world.player();
    await world.give(buyer, { gold: 100 });
    const m = await buyer.ask(C2S.MARKET_ORDER, { i: LOG, n: 11, p: 10 }, S2C.MARKET_DONE, S2C.MARKET_REFUSED);
    assert.equal(m.r, S2C.MARKET_REFUSED, "110g with 100");
    assert.equal(buyer.gold, 100, "(the admin's gold is in memory till the next save: what they were told)");
    for (let k = 0; k < 10; k++) await order(buyer, LOG, 1, 1);
    assert.equal((await buyer.ask(C2S.MARKET_ORDER, { i: LOG, n: 1, p: 1 }, S2C.MARKET_DONE, S2C.MARKET_REFUSED)).r, S2C.MARKET_REFUSED, "ten at once");
    assert.equal((await world.stash(buyer.id)).gold, 90);
});

test("sold to while away: theirs as they sign in, once", async () => {
    const LOG = 20;
    let buyer = await world.player();
    const seller = await world.player();
    await world.give(buyer, { gold: 200 });
    await world.give(seller, { items: [[LOG, 3]] });
    const id = await order(buyer, LOG, 5, 10);
    await world.signOut(buyer);

    await sell(seller, LOG, 3, 10);
    const [o] = await world.query("SELECT amount, owed FROM market_order WHERE id = ?", [id]);
    assert.deepEqual([o.amount, o.owed], [2, 3], "kept for them");
    assert.equal((await world.stash(seller.id)).gold, 30, "the seller paid at once");

    buyer = await world.again(buyer);
    assert.equal(buyer.items.get(LOG), 3, "theirs as they load");
    await until(() => buyer.all(S2C.MARKET_GOT).length > 0, "told what came");
    assert.equal((await world.stash(buyer.id)).items.get(LOG), 3);
    await world.signOut(buyer);
    buyer = await world.again(buyer);
    assert.equal(buyer.items.get(LOG), 3, "not twice");
    assert.equal(buyer.gold, 150, "the 2 still wanted still set aside");
});

test("an order that runs out gives its gold back: at once if they're on, as they sign in if not", async () => {
    const LOG = 21;
    let away = await world.player();
    const here = await world.player();
    await world.give(away, { gold: 100 });
    await world.give(here, { gold: 100 });
    const awayId = await order(away, LOG, 4, 10);
    const hereId = await order(here, LOG, 3, 10);
    await world.signOut(away);

    // (orders are kept in memory: ended in the database, then the server restarted to load them so)
    await world.query("UPDATE market_order SET ends = ? WHERE id IN (?)", [Date.now() - 1000, [awayId, hereId]]);
    await world.stopServer();
    await world.startServer();

    const back = await world.again(here);
    await until(async () => (await world.query("SELECT state FROM market_order WHERE id = ?", [awayId]))[0].state == 3, "the away one to run out", 15000);
    await until(() => back.all(S2C.MARKET_UNFILLED).length > 0, "told it ran out", 15000);
    assert.equal((await world.stash(here.id)).gold, 100);

    away = await world.again(away);
    assert.equal(away.gold, 100, "back as they load");
    const [o] = await world.query("SELECT state FROM market_order WHERE id = ?", [awayId]);
    assert.equal(o.state, 4, "returned");
    await sleep(100);
});

test("price history: what it sold for each day, the last sale, the cheapest listed and the best order", async () => {
    const LOG = 22;
    const seller = await world.player(), buyer = await world.player(), other = await world.player();
    await world.give(seller, { items: [[LOG, 10]] });
    await world.give(buyer, { gold: 500 });
    await world.give(other, { gold: 500 });
    await sell(seller, LOG, 2, 30);
    await sell(seller, LOG, 2, 40);
    await order(buyer, LOG, 4, 40);        // (buys both, at 30 and 40)
    await sell(seller, LOG, 3, 50);
    await order(other, LOG, 2, 25);

    const m = await buyer.ask(C2S.MARKET_HISTORY, { i: LOG }, S2C.MARKET_HISTORY);
    const h = m.h;
    assert.equal(h.i, LOG);
    assert.equal(h.d.length, 1, "all today");
    const [, n, gold, lo, hi] = h.d[0];
    assert.deepEqual([n, gold, lo, hi], [4, 140, 30, 40]);
    assert.equal(h.l, 40, "the last sale");
    assert.equal(h.c, 50, "the cheapest listed");
    assert.deepEqual([h.w, h.x], [25, 2], "the best order");
});
