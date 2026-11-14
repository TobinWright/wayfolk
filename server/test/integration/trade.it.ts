import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { C2S, S2C } from "../../../shared/Routes";
import { Bot, sleep, until, World } from "./harness";

// Trades against a real server and database: both sides swapped at once and
// saved together, or nothing moves at all.

const ORE = 1;

let world: World;
before(async () => { world = await World.start(); });
after(async () => { await world?.stop(); });

// a and b in a trade (a asked, b said yes)
async function open(a: Bot, b: Bot) {
    const asked = b.next(S2C.TRADE_ASKED);
    a.send(C2S.TRADE_ASK, { i: b.id });
    await asked;
    const views = [a.next(S2C.TRADE), b.next(S2C.TRADE)];
    b.send(C2S.TRADE_ANSWER, { y: 1 });
    await Promise.all(views);
}

// the trade as `bot` sees it next, once `check` is true of it
function view(bot: Bot, check: (t: any) => boolean = () => true) {
    return bot.next(S2C.TRADE, (m) => check(m.t)).then((m) => m.t);
}

async function bothReady(a: Bot, b: Bot) {
    const ready = view(a, (t) => t.rd[0] == 1 && t.rd[1] == 1);
    a.send(C2S.TRADE_READY, { v: 1 });
    b.send(C2S.TRADE_READY, { v: 1 });
    await ready;
}

test("a trade swaps both offers and saves them together", async () => {
    const a = await world.player(), b = await world.player();
    await world.give(a, { gold: 300 });
    await world.give(b, { items: [[ORE, 9]] });
    await open(a, b);

    a.send(C2S.TRADE_OFFER, { g: 120, i: [] });
    await view(b, (t) => t.o[1].g == 120);
    b.send(C2S.TRADE_OFFER, { g: 0, i: [[ORE, 5]] });
    await view(a, (t) => t.o[1].i.length == 1);
    await bothReady(a, b);

    const ends = [a.next(S2C.TRADE_END), b.next(S2C.TRADE_END)];
    a.send(C2S.TRADE_CONFIRM);
    b.send(C2S.TRADE_CONFIRM);
    for (const e of await Promise.all(ends)) assert.equal(e.d, 1, "it went through");

    const sa = await world.stash(a.id), sb = await world.stash(b.id);
    assert.equal(sa.gold, 180);
    assert.equal(sa.items.get(ORE), 5);
    assert.equal(sb.gold, 120);
    assert.equal(sb.items.get(ORE), 4);
    const [row] = await world.query("SELECT a_gold, b_items FROM trade WHERE a_id = ? AND b_id = ?", [a.id, b.id]);
    assert.equal(Number(row.a_gold), 120);
    assert.deepEqual(JSON.parse(row.b_items), [[ORE, 5]]);
});

test("changing an offer clears both Readys, so a confirm then does nothing", async () => {
    const a = await world.player(), b = await world.player();
    await world.give(a, { gold: 100 });
    await world.give(b, { gold: 100 });
    await open(a, b);
    a.send(C2S.TRADE_OFFER, { g: 10, i: [] });
    await view(b, (t) => t.o[1].g == 10);
    await bothReady(a, b);

    a.send(C2S.TRADE_CONFIRM);
    await view(b, (t) => t.cf[1] == 1);
    b.send(C2S.TRADE_OFFER, { g: 1, i: [] });
    const t = await view(a, (t) => t.o[1].g == 1);
    assert.deepEqual(t.rd, [0, 0]);
    assert.deepEqual(t.cf, [0, 0]);

    b.send(C2S.TRADE_CONFIRM);
    await sleep(300);
    assert.equal(a.all(S2C.TRADE_END).length + b.all(S2C.TRADE_END).length, 0, "not through without being ready again");
});

test("an offer of more than you have is refused", async () => {
    const a = await world.player(), b = await world.player();
    await world.give(a, { gold: 50, items: [[ORE, 2]] });
    await open(a, b);
    for (const offer of [{ g: 51, i: [] }, { g: 0, i: [[ORE, 3]] }, { g: -5, i: [] }, { g: 0, i: [[ORE, 1], [ORE, 1]] }]) {
        const m = await a.ask(C2S.TRADE_OFFER, offer, S2C.TRADE_REFUSED);
        assert.equal(m.r, S2C.TRADE_REFUSED, JSON.stringify(offer));
    }
});

test("someone short of their offer at the end: refused, nothing moved, both must ready again", async () => {
    const a = await world.player(), b = await world.player();
    await world.give(a, { items: [[ORE, 5]] });
    await world.give(b, { gold: 200 });
    await open(a, b);
    a.send(C2S.TRADE_OFFER, { g: 0, i: [[ORE, 5]] });
    await view(b, (t) => t.o[1].i.length == 1);
    b.send(C2S.TRADE_OFFER, { g: 200, i: [] });
    await view(a, (t) => t.o[1].g == 200);
    await bothReady(a, b);

    // (the ore listed on the market meanwhile)
    const listed = await a.ask(C2S.MARKET_SELL, { i: ORE, n: 5, p: 10 }, S2C.MARKET_DONE, S2C.MARKET_REFUSED);
    assert.equal(listed.r, S2C.MARKET_DONE);

    // (both listened for before confirming: the trade's sent again with the refusal, maybe first)
    const refused = b.next(S2C.TRADE_REFUSED);
    const cleared = view(a, (t) => t.rd[0] == 0 && t.rd[1] == 0);
    a.send(C2S.TRADE_CONFIRM);
    b.send(C2S.TRADE_CONFIRM);
    await refused;
    const t = await cleared;
    assert.deepEqual(t.rd, [0, 0]);
    assert.equal(a.all(S2C.TRADE_END).length, 0, "still open");
    assert.equal(b.gold, 200);
    assert.equal(a.gold, 0);
});

test("signing out mid-trade ends it for the other, and nothing moves", async () => {
    const a = await world.player(), b = await world.player();
    await world.give(a, { gold: 70 });
    await world.give(b, { items: [[ORE, 3]] });
    await open(a, b);
    a.send(C2S.TRADE_OFFER, { g: 70, i: [] });
    await view(b, (t) => t.o[1].g == 70);
    b.send(C2S.TRADE_OFFER, { g: 0, i: [[ORE, 3]] });
    await view(a, (t) => t.o[1].i.length == 1);
    await bothReady(a, b);
    a.send(C2S.TRADE_CONFIRM);
    await view(b, (t) => t.cf[1] == 1);

    const ended = b.next(S2C.TRADE_END);
    await world.signOut(a);
    const e = await ended;
    assert.equal(e.d, 0);
    assert.match(e.w, /had to go/);
    b.send(C2S.TRADE_CONFIRM);
    await sleep(300);
    assert.equal(b.items.get(ORE), 3);
    assert.equal(b.gold, 0);
    const [row] = await world.query("SELECT COUNT(*) n FROM trade WHERE a_id = ? OR b_id = ?", [a.id, a.id]);
    assert.equal(row.n, 0);
    // (a was let go: saved as they had it)
    await until(async () => (await world.stash(a.id)).gold == 70, "a's gold saved as they left");
});

test("guests can't trade: asking, or being asked, is refused until they save their account", async () => {
    const guest = await world.guest(), saved = await world.player();
    const asking = await guest.ask(C2S.TRADE_ASK, { i: saved.id }, S2C.TRADE_REFUSED, S2C.TRADE_ASKED);
    assert.equal(asking.r, S2C.TRADE_REFUSED);
    assert.match(asking.w, /guest/i);
    const asked = await saved.ask(C2S.TRADE_ASK, { i: guest.id }, S2C.TRADE_REFUSED, S2C.TRADE_ASKED);
    assert.equal(asked.r, S2C.TRADE_REFUSED);
    assert.match(asked.w, /guest/i);
});
