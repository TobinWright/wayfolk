import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { C2S, S2C } from "../../../shared/Routes";
import { BUSY_MS } from "../../../shared/Places";
import { seasonAt } from "../../../shared/Seasons";
import { World } from "./harness";

// What the map shows of the world (client/src/components/map/MapLandmarks.ts):
// how many heroes are at each place (EVENT_BUSY), told to everyone signed in,
// and the last season's champions (SeasonState.m) for their monuments.

let world: World;
before(async () => { world = await World.start(); });
after(async () => { await world?.stop(); });

test("how busy the places are: told as you sign in, and to everyone as it changes", async () => {
    const watcher = await world.guest();
    const first = watcher.all(S2C.EVENT_BUSY)[0] ?? await watcher.next(S2C.EVENT_BUSY);
    assert.ok(Array.isArray(first.b), "the counts, as you sign in");

    const bot = await world.guest();
    const hired = await bot.ask(C2S.HERO_HIRE, { i: 0 }, S2C.HERO_HIRED, S2C.HERO_REFUSED);
    assert.equal(hired.r, S2C.HERO_HIRED);
    const at: number = hired.h[2].p;
    const before = new Map<number, number>(first.b).get(at) ?? 0;
    // (counted again within BUSY_MS)
    const told = await watcher.next(S2C.EVENT_BUSY, (m) => (new Map<number, number>(m.b).get(at) ?? 0) > before, BUSY_MS + 5000);
    assert.ok(new Map<number, number>(told.b).get(at) >= before + 1, "the new hero counted where they stand");
    assert.ok(told.b.every(([, n]: [number, number]) => n > 0), "only places with someone there");
});

test("the last season's champions, first to third, for their monuments", async () => {
    const a = await world.guest(), b = await world.guest(), c = await world.guest(), d = await world.guest();
    const last = seasonAt(Date.now()).n - 1;
    await world.query("DELETE FROM season_done WHERE season >= ?", [last]);
    await world.query("INSERT INTO season_done (season, at) VALUES (?, NOW())", [last]);
    for (const [bot, points] of [[a, 50], [b, 900], [c, 300], [d, 10]] as const)
        await world.query("INSERT INTO season_score (season, player_id, points) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE points = VALUES(points)", [last, bot.id, points]);
    // (loaded as the server starts)
    await world.stopServer();
    await world.startServer();
    const again = await world.again(a);
    const season = again.all(S2C.SEASON).slice(-1)[0] ?? await again.next(S2C.SEASON);
    assert.deepEqual(season.s.m, [last, [b.name, c.name, a.name]], "the top 3 by points, best first");
});
