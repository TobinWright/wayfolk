import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { C2S, S2C } from "../../../shared/Routes";
import { BjPhase, Game } from "../../../shared/Games";
import { until, World } from "./harness";

// Stopping the server as a deploy does (Engine.shutdown) and starting it
// again: everyone saved, nothing lost or doubled - gold only in memory, a
// listing on the market, and the antes of a blackjack round it stopped in.

let world: World;
before(async () => { world = await World.start(); });
after(async () => { await world?.stop(); });

test("a restart keeps everyone's gold and things, the market, and gives back a round's antes once", async () => {
    // (the seller and buyer saved: a guest can't use the market)
    let rich = await world.guest(), seller = await world.player(), a = await world.guest(), b = await world.guest();
    await world.give(rich, { gold: 777, items: [[3, 9]] });         // (in memory only till a save)
    await world.give(seller, { items: [[1, 6]] });
    await world.give(a, { gold: 60 });
    await world.give(b, { gold: 60 });
    const listed = await seller.ask(C2S.MARKET_SELL, { i: 1, n: 6, p: 15 }, S2C.MARKET_DONE, S2C.MARKET_REFUSED);
    assert.equal(listed.r, S2C.MARKET_DONE);
    const [listing] = await world.query("SELECT id FROM market_listing WHERE seller_id = ?", [seller.id]);

    // a and b at a table, dealt in (their antes paid), then the server stops mid-round
    const rooms = await a.ask(C2S.GAME_ROOMS, { g: Game.BLACKJACK }, S2C.GAME_ROOMS);
    const room = rooms.l.sort((x: any, y: any) => x.a - y.a)[0];
    for (const [seat, bot] of [a, b].entries()) {
        await bot.ask(C2S.GAME_WATCH, { g: Game.BLACKJACK, i: room.i }, S2C.GAME_ROOM);
        bot.send(C2S.GAME_SIT, { s: seat });
    }
    await a.next(S2C.GAME_ROOM, (m) => m.o.r == BjPhase.PLAY, 20000);
    await until(() => a.gold == 60 - room.a && b.gold == 60 - room.a, "the antes paid");

    const from = world.logs.length;
    assert.equal(await world.stopServer(), 0, "stopped cleanly");
    assert.ok(world.logged(/Shutdown: saved/, from).length, "said it saved");
    for (const bot of [rich, seller, a, b]) {
        await until(() => bot.closed !== null, "closed");
        assert.equal(bot.closed, 4002, "told the server's restarting");
    }
    const saved = await world.stash(rich.id);
    assert.equal(saved.gold, 777);
    assert.equal(saved.items.get(3), 9);

    await world.startServer();
    assert.ok(world.logged(/antes given back/, from).length, "the stopped round's antes given back");
    rich = await world.again(rich);
    a = await world.again(a);
    b = await world.again(b);
    assert.equal(rich.gold, 777);
    assert.equal(rich.items.get(3), 9);
    assert.equal(a.gold, 60, "a's ante back");
    assert.equal(b.gold, 60, "b's ante back");

    // the listing's still on, and sells once
    const buyer = await world.player();
    await world.give(buyer, { gold: 200 });
    const bought = await buyer.ask(C2S.MARKET_BUY, { l: listing.id, n: 6, p: 15 }, S2C.MARKET_DONE, S2C.MARKET_REFUSED);
    assert.equal(bought.r, S2C.MARKET_DONE, bought.w);

    // and again: nothing given back twice
    await world.stopServer();
    await world.startServer();
    a = await world.again(a);
    assert.equal(a.gold, 60, "not given back twice");
    seller = await world.again(seller);
    assert.equal(seller.gold, 90, "the seller paid once");
    assert.equal(seller.items.get(1) ?? 0, 0);
});
