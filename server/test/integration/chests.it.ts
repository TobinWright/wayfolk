import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { C2S, S2C } from "../../../shared/Routes";
import { CHEST_FIRST_MS, ChestTier } from "../../../shared/Chests";
import { TaskKind } from "../../../shared/Tasks";
import { kindOf, WorldPlace } from "../../../shared/Places";
import { sleep, until, World } from "./harness";
import { readFileSync } from "fs";
import * as path from "path";

// the map's places (world.json), as the server reads them
const PLACES: WorldPlace[] = JSON.parse(readFileSync(path.join(__dirname, "..", "..", "..", "..", "..", "client", "dist", "assets", "json", "world.json"), "utf8")).places;
const COPPER = 1;

// loot chests (shared/Chests.ts, ChestManager): the first soon after the first job, a silver
// one; opened once, into the stash; not again

let world: World;
before(async () => { world = await World.start(); });
after(async () => { await world?.stop(); });

test("the first job given: a silver chest soon after, opened into the stash, once", async () => {
    const bot = await world.guest();
    const hired = await bot.ask(C2S.HERO_HIRE, { i: 0 }, S2C.HERO_HIRED, S2C.HERO_REFUSED);
    assert.equal(hired.r, S2C.HERO_HIRED);
    const chest = bot.next(S2C.PLAYER_CHEST, (m) => m.i > 0, CHEST_FIRST_MS + 5000);
    const mine = PLACES.find((p) => kindOf(p) == "mine");
    bot.send(C2S.HERO_TODO, { h: hired.h[0], q: [{ k: TaskKind.GATHER, p: mine.i, m: COPPER, n: 5 }], b: null });
    const up = await chest;
    assert.equal(up.t, ChestTier.SILVER);
    assert.ok(up.e > 0);


    const gold = bot.gold;
    const stash = bot.next(S2C.HERO_STASH);
    const opened = await bot.ask(C2S.PLAYER_CHEST_OPEN, { i: up.i }, S2C.PLAYER_CHEST_OPENED, S2C.PLAYER_CHEST);
    assert.equal(opened.r, S2C.PLAYER_CHEST_OPENED);
    await stash;
    const loot = opened.l;
    assert.equal(loot.t, ChestTier.SILVER);
    assert.ok(loot.g >= 20 && loot.g <= 40);
    assert.equal(bot.gold, gold + loot.g, "the gold in hand");
    for (const [id, n] of loot.m) assert.ok((bot.items.get(id) ?? 0) >= n, `the stash has ${n} of ${id}`);

    const again = await bot.ask(C2S.PLAYER_CHEST_OPEN, { i: up.i }, S2C.PLAYER_CHEST_OPENED, S2C.PLAYER_CHEST);
    assert.equal(again.r, S2C.PLAYER_CHEST, "not twice");
    assert.equal(again.i, 0);

    // then today's daily chest: day 1, wooden, its streak saved
    const daily = await bot.next(S2C.PLAYER_CHEST, (m) => m.i > 0, 8000);
    assert.equal(daily.d, 1);
    assert.equal(daily.t, ChestTier.WOODEN);
    const got = await bot.ask(C2S.PLAYER_CHEST_OPEN, { i: daily.i }, S2C.PLAYER_CHEST_OPENED, S2C.PLAYER_CHEST);
    assert.equal(got.r, S2C.PLAYER_CHEST_OPENED);
    assert.equal(got.l.d, 1);
    await sleep(300);
    const [row] = await world.query("SELECT daily_day, daily_streak FROM player WHERE id = ?", [bot.id]);
    assert.equal(row.daily_streak, 1);
    assert.equal(row.daily_day, Math.floor(Date.now() / 86400000));

    // signed in again the same day: no daily chest
    const back = await world.again(bot);
    await assert.rejects(back.next(S2C.PLAYER_CHEST, (m) => m.d > 0, 6000), "none again today");
});

test("an achievement's kept once, and comes back as they sign in", async () => {
    const bot = await world.guest();
    const done = await bot.ask(C2S.PLAYER_ACHIEVE, { a: "chest" }, S2C.PLAYER_ACHIEVED);
    assert.equal(done.a, "chest");
    bot.send(C2S.PLAYER_ACHIEVE, { a: "chest" });
    bot.send(C2S.PLAYER_ACHIEVE, { a: "not-one" });
    await sleep(500);
    assert.equal(bot.all(S2C.PLAYER_ACHIEVED).length, 1, "once, and only real ones");
    const back = await world.again(bot);
    await until(() => back.all(S2C.PLAYER_ACHIEVEMENTS).length > 0, "achievements with signing in");
    const list: [string, number][] = back.all(S2C.PLAYER_ACHIEVEMENTS)[0].l;
    assert.deepEqual(list.map(([a]) => a), ["chest"]);
});

test("a chest that isn't up can't be opened", async () => {
    const bot = await world.guest();
    const m = await bot.ask(C2S.PLAYER_CHEST_OPEN, { i: 12345 }, S2C.PLAYER_CHEST_OPENED, S2C.PLAYER_CHEST);
    assert.equal(m.r, S2C.PLAYER_CHEST);
    assert.equal(m.i, 0);
});
