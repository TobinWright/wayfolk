import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { C2S, S2C } from "../../../shared/Routes";
import { Bot, sleep, until, World } from "./harness";

// The market against a real server and database: gold and things moved
// between players exactly once, whatever order things happen in.

const ORE = 1;          // (Copper Ore)

let world: World;
before(async () => { world = await World.start(); });
after(async () => { await world?.stop(); });

async function sell(bot: Bot, item: number, n: number, price: number) {
    const m = await bot.ask(C2S.MARKET_SELL, { i: item, n, p: price }, S2C.MARKET_DONE, S2C.MARKET_REFUSED);
    assert.equal(m.r, S2C.MARKET_DONE, m.w);
    const [l] = await world.query("SELECT id FROM market_listing WHERE seller_id = ? ORDER BY id DESC LIMIT 1", [bot.id]);
    return l.id as number;
}

function buy(bot: Bot, listing: number, n: number, price: number) {
    return bot.ask(C2S.MARKET_BUY, { l: listing, n, p: price }, S2C.MARKET_DONE, S2C.MARKET_REFUSED);
}

test("a sale moves the gold and the things, in memory and as saved", async () => {
    const seller = await world.player(), buyer = await world.player();
    await world.give(seller, { items: [[ORE, 10]] });
    await world.give(buyer, { gold: 1000 });

    const id = await sell(seller, ORE, 10, 30);
    assert.equal((await world.stash(seller.id)).items.get(ORE) ?? 0, 0, "listed: out of the seller's stash");

    const sold = seller.next(S2C.MARKET_SOLD);
    const m = await buy(buyer, id, 4, 30);
    assert.equal(m.r, S2C.MARKET_DONE, m.w);
    await sold;

    const s = await world.stash(seller.id), b = await world.stash(buyer.id);
    assert.equal(s.gold, 120);
    assert.equal(b.gold, 1000 - 120);
    assert.equal(b.items.get(ORE), 4);
    const [l] = await world.query("SELECT amount, state FROM market_listing WHERE id = ?", [id]);
    assert.equal(l.amount, 6);
    assert.equal(l.state, 0, "still on");
    await until(() => seller.gold == 120 && buyer.gold == 880, "both told their gold");
});

test("buying more than is left, at a changed price, your own, or without the gold is refused", async () => {
    const seller = await world.player(), buyer = await world.player();
    await world.give(seller, { items: [[ORE, 5]] });
    await world.give(buyer, { gold: 100 });
    const id = await sell(seller, ORE, 5, 30);

    assert.equal((await buy(buyer, id, 6, 30)).r, S2C.MARKET_REFUSED, "more than's left");
    assert.equal((await buy(buyer, id, 1, 29)).r, S2C.MARKET_REFUSED, "the price changed");
    assert.equal((await buy(seller, id, 1, 30)).r, S2C.MARKET_REFUSED, "your own");
    assert.equal((await buy(buyer, id, 4, 30)).r, S2C.MARKET_REFUSED, "120g with 100");
    // (the admin's gold is in memory till the next save: what they were told)
    assert.equal(buyer.gold, 100);
    assert.equal(seller.gold, 0);
});

test("two buying the last ones at once: one gets them, nothing doubled", async () => {
    const seller = await world.player(), a = await world.player(), b = await world.player();
    await world.give(seller, { items: [[ORE, 3]] });
    await world.give(a, { gold: 500 });
    await world.give(b, { gold: 500 });
    const id = await sell(seller, ORE, 3, 50);

    const [ma, mb] = await Promise.all([buy(a, id, 3, 50), buy(b, id, 3, 50)]);
    assert.equal([ma, mb].filter((m) => m.r == S2C.MARKET_DONE).length, 1, "exactly one buy goes through");

    const winner = ma.r == S2C.MARKET_DONE ? a : b, loser = winner == a ? b : a;
    const sw = await world.stash(winner.id), ss = await world.stash(seller.id);
    assert.equal(sw.items.get(ORE), 3);
    assert.equal(sw.gold, 350);
    assert.equal(ss.gold, 150);
    await until(() => seller.gold == 150, "the seller told");
    assert.equal(loser.gold, 500, "the other keeps theirs");
    assert.equal(loser.items.get(ORE) ?? 0, 0);
});

test("cancelling puts what's left back", async () => {
    const seller = await world.player(), buyer = await world.player();
    await world.give(seller, { items: [[ORE, 8]] });
    await world.give(buyer, { gold: 100 });
    const id = await sell(seller, ORE, 8, 10);
    assert.equal((await buy(buyer, id, 3, 10)).r, S2C.MARKET_DONE);

    const m = await seller.ask(C2S.MARKET_CANCEL, { l: id }, S2C.MARKET_DONE, S2C.MARKET_REFUSED);
    assert.equal(m.r, S2C.MARKET_DONE, m.w);
    const s = await world.stash(seller.id);
    assert.equal(s.items.get(ORE), 5);
    assert.equal(s.gold, 30);
    assert.equal((await buy(buyer, id, 1, 10)).r, S2C.MARKET_REFUSED, "gone once cancelled");
    assert.equal((await seller.ask(C2S.MARKET_CANCEL, { l: id }, S2C.MARKET_DONE, S2C.MARKET_REFUSED)).r, S2C.MARKET_REFUSED, "not twice");
});

test("a seller who's away is paid as they sign in, once", async () => {
    let seller = await world.player();
    const buyer = await world.player();
    await world.give(seller, { items: [[ORE, 4]] });
    await world.give(buyer, { gold: 400 });
    const id = await sell(seller, ORE, 4, 25);
    await world.signOut(seller);

    assert.equal((await buy(buyer, id, 4, 25)).r, S2C.MARKET_DONE);
    const [sale] = await world.query("SELECT paid FROM market_sale WHERE listing_id = ?", [id]);
    assert.equal(sale.paid, 0, "kept unpaid while they're away");
    assert.equal((await world.stash(seller.id)).gold, 0);

    seller = await world.again(seller);
    assert.equal(seller.gold, 100, "paid as they load");
    await until(() => seller.all(S2C.MARKET_SOLD).length > 0, "told what sold");
    assert.equal((await world.stash(seller.id)).gold, 100);
    const [paid] = await world.query("SELECT paid FROM market_sale WHERE listing_id = ?", [id]);
    assert.equal(paid.paid, 1);

    await world.signOut(seller);
    seller = await world.again(seller);
    assert.equal(seller.gold, 100, "not paid twice");
});

test("a listing that runs out comes back: at once if they're on, as they sign in if not", async () => {
    let away = await world.player();
    const here = await world.player();
    await world.give(away, { items: [[ORE, 6]] });
    await world.give(here, { items: [[ORE, 7]] });
    const awayId = await sell(away, ORE, 6, 10);
    const hereId = await sell(here, ORE, 7, 10);
    await world.signOut(away);

    // (listings are kept in memory: ended in the database, then the server restarted to load them so)
    await world.query("UPDATE market_listing SET ends = ? WHERE id IN (?)", [Date.now() - 1000, [awayId, hereId]]);
    await world.stopServer();
    await world.startServer();

    const back = await world.again(here);
    await until(async () => (await world.query("SELECT state FROM market_listing WHERE id = ?", [awayId]))[0].state == 3, "the away one to run out", 15000);
    await until(() => back.all(S2C.MARKET_BACK).length > 0, "told it came back", 15000);
    assert.equal((await world.stash(here.id)).items.get(ORE), 7);

    away = await world.again(away);
    assert.equal(away.items.get(ORE), 6, "back as they load");
    assert.equal((await world.stash(away.id)).items.get(ORE), 6);
    const [l] = await world.query("SELECT state FROM market_listing WHERE id = ?", [awayId]);
    assert.equal(l.state, 4, "returned");
    await sleep(100);
});

test("guests can't sell or buy on the market until they save their account", async () => {
    const guest = await world.guest(), seller = await world.player();
    await world.give(guest, { gold: 500, items: [[ORE, 5]] });
    await world.give(seller, { items: [[ORE, 5]] });
    const selling = await guest.ask(C2S.MARKET_SELL, { i: ORE, n: 2, p: 10 }, S2C.MARKET_DONE, S2C.MARKET_REFUSED);
    assert.equal(selling.r, S2C.MARKET_REFUSED);
    assert.match(selling.w, /guest/i);
    const id = await sell(seller, ORE, 2, 10);
    const buying = await buy(guest, id, 1, 10);
    assert.equal(buying.r, S2C.MARKET_REFUSED);
    assert.match(buying.w, /guest/i);
    assert.equal(guest.gold, 500, "nothing spent");
});
