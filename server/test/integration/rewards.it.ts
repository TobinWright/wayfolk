import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { C2S, S2C } from "../../../shared/Routes";
import { BjPhase, Game } from "../../../shared/Games";
import { ACTION_GAP_MS, GUILD_COST } from "../../../shared/Guilds";
import { Bot, sleep, until, World } from "./harness";

// Gold in and out of the game: card-table antes and pots, founding a guild,
// and what events and guilds owe players who were away.

let world: World;
before(async () => { world = await World.start(); });
after(async () => { await world?.stop(); });

// into the cheapest blackjack room, at a seat; each holds on their turn
async function sitDown(bots: Bot[]) {
    const rooms = await bots[0].ask(C2S.GAME_ROOMS, { g: Game.BLACKJACK }, S2C.GAME_ROOMS);
    const room = rooms.l.sort((a: any, b: any) => a.a - b.a)[0];
    for (const [seat, bot] of bots.entries()) {
        await bot.ask(C2S.GAME_WATCH, { g: Game.BLACKJACK, i: room.i }, S2C.GAME_ROOM);
        bot.ws.on("message", (data) => {
            const m = JSON.parse(String(data));
            if (m.r == S2C.GAME_ROOM && m.o.r == BjPhase.PLAY && m.o.u == seat) bot.send(C2S.GAME_HOLD);
        });
        bot.send(C2S.GAME_SIT, { s: seat });
    }
    await until(() => bots[0].all(S2C.GAME_ROOM).some((m) => m.o.s.filter((s: string) => s).length == bots.length), "everyone sat");
    return room.a as number;
}

test("a blackjack round: the antes go into the pot and it all comes out again, as saved", async () => {
    const a = await world.guest(), b = await world.guest();
    await world.give(a, { gold: 100 });
    await world.give(b, { gold: 100 });
    const ante = await sitDown([a, b]);

    const done = a.next(S2C.GAME_ROOM, (m) => m.o.r == BjPhase.DONE, 30000);
    await until(async () => (await world.query("SELECT COUNT(*) n FROM game_ante"))[0].n == 2, "the antes kept while the round's on", 15000);
    const room = (await done).o;
    const pot: number = room.p, won: number[] = room.o;
    assert.equal(pot, 2 * ante);
    const paidOut = won.reduce((s, n) => s + n, 0);
    assert.ok(paidOut == 0 || paidOut == pot || paidOut == pot - (pot % 2), `the pot (${pot}) won whole, split, or kept by the house: ${paidOut}`);

    await until(() => a.gold + b.gold == 200 - pot + paidOut, "both told their gold");
    // (saved as it's paid, not waited for)
    await until(async () => (await world.stash(a.id)).gold == a.gold && (await world.stash(b.id)).gold == b.gold, "both players' gold saved");
    await until(async () => (await world.query("SELECT COUNT(*) n FROM game_ante"))[0].n == 0, "the antes settled");
    const stats = await world.query("SELECT player_id, hands, net FROM game_stat WHERE player_id IN (?)", [[a.id, b.id]]);
    assert.equal(stats.length, 2);
    for (const s of stats) assert.equal(s.hands, 1);
    a.send(C2S.GAME_LEAVE);
    b.send(C2S.GAME_LEAVE);
});

test("sitting without the ante is refused", async () => {
    const poor = await world.guest();
    const rooms = await poor.ask(C2S.GAME_ROOMS, { g: Game.BLACKJACK }, S2C.GAME_ROOMS);
    const room = rooms.l.sort((x: any, y: any) => x.a - y.a)[0];
    await poor.ask(C2S.GAME_WATCH, { g: Game.BLACKJACK, i: room.i }, S2C.GAME_ROOM);
    const m = await poor.ask(C2S.GAME_SIT, { s: 4 }, S2C.GAME_REFUSED);
    assert.match(m.w, /ante/);
});

test(`founding a guild costs ${GUILD_COST}g, saved with the guild; a taken name is refused`, async () => {
    const founder = await world.guest(), other = await world.guest();
    await world.give(founder, { gold: GUILD_COST - 1 });
    const short = await founder.ask(C2S.GUILD_FOUND, { n: "Testing Hall", t: "TST" }, S2C.GUILD_DONE, S2C.GUILD_REFUSED);
    assert.equal(short.r, S2C.GUILD_REFUSED);
    assert.equal(founder.gold, GUILD_COST - 1);

    await world.give(founder, { gold: 101 });
    await sleep(ACTION_GAP_MS);
    const m = await founder.ask(C2S.GUILD_FOUND, { n: "Testing Hall", t: "TST" }, S2C.GUILD_DONE, S2C.GUILD_REFUSED);
    assert.equal(m.r, S2C.GUILD_DONE, m.w);
    assert.equal((await world.stash(founder.id)).gold, 100);
    await until(() => founder.gold == 100, "told their gold");
    const [g] = await world.query("SELECT g.id FROM guild g JOIN guild_member m ON m.guild_id = g.id WHERE m.player_id = ? AND g.name = 'Testing Hall'", [founder.id]);
    assert.ok(g, "the guild and its leader saved");

    await world.give(other, { gold: GUILD_COST });
    for (const [n, t] of [["Testing Hall", "OTH"], ["testing hall", "OTH"], ["Other Hall", "TST"]]) {
        await sleep(ACTION_GAP_MS);
        const taken = await other.ask(C2S.GUILD_FOUND, { n, t }, S2C.GUILD_DONE, S2C.GUILD_REFUSED);
        assert.equal(taken.r, S2C.GUILD_REFUSED, `${n} [${t}]`);
    }
    assert.equal(other.gold, GUILD_COST, "nothing taken for a refusal");
});

test("an event's reward owed to someone away is paid as they sign in, once", async () => {
    let bot = await world.guest();
    await world.signOut(bot);
    const e = await world.query<any>("INSERT INTO world_event (kind, place, name, started, ends, goal, done, state) VALUES (0, 1, 'The Test Event', ?, ?, 10, 10, 2)", [Date.now() - 1000, Date.now()]);
    await world.query("INSERT INTO event_share (event_id, player_id, points, gold, item, paid) VALUES (?, ?, 5, 77, 1, 0)", [e.insertId, bot.id]);

    bot = await world.again(bot);
    assert.equal(bot.gold, 77);
    assert.equal(bot.items.get(1), 1, "the rare find too");
    await until(() => bot.all(S2C.EVENT_REWARD).length == 1, "told of it");
    const s = await world.stash(bot.id);
    assert.equal(s.gold, 77, "saved with being marked paid");
    assert.equal(s.items.get(1), 1);
    const [share] = await world.query("SELECT paid FROM event_share WHERE event_id = ? AND player_id = ?", [e.insertId, bot.id]);
    assert.equal(share.paid, 1);

    await world.signOut(bot);
    bot = await world.again(bot);
    assert.equal(bot.gold, 77, "not paid twice");
    assert.equal(bot.all(S2C.EVENT_REWARD).length, 0);
});

test("a guild's gold owed to someone away is paid as they sign in, once", async () => {
    let bot = await world.guest();
    await world.signOut(bot);
    await world.query("INSERT INTO guild_pay (player_id, gold, why) VALUES (?, 40, 'for a test goal'), (?, 2, 'for another')", [bot.id, bot.id]);

    bot = await world.again(bot);
    assert.equal(bot.gold, 42);
    assert.equal((await world.stash(bot.id)).gold, 42, "saved with being taken off");
    assert.equal((await world.query("SELECT COUNT(*) n FROM guild_pay WHERE player_id = ?", [bot.id]))[0].n, 0);

    await world.signOut(bot);
    bot = await world.again(bot);
    assert.equal(bot.gold, 42, "not paid twice");
});
