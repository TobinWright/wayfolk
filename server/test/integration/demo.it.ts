import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { C2S, S2C } from "../../../shared/Routes";
import { Sight, SightKind } from "../../../shared/Sights";
import { TaskKind } from "../../../shared/Tasks";
import { findPath, makeGraph, TravelNode } from "../../../shared/Travel";
import { Bot, sleep, World } from "./harness";
import { readFileSync } from "fs";
import * as path from "path";

const PLACES = new Set<number>(JSON.parse(readFileSync(path.join(__dirname, "..", "..", "..", "..", "..", "client", "dist", "assets", "json", "world.json"), "utf8")).places.map((p: any) => p.i));

let world: World;
before(async () => { world = await World.start(); });
after(async () => { await world?.stop(); });

async function withHero() {
    const bot = await world.guest();
    const hired = await bot.ask(C2S.HERO_HIRE, { i: 0 }, S2C.HERO_HIRED, S2C.HERO_REFUSED);
    assert.equal(hired.r, S2C.HERO_HIRED, "hired");
    return { bot, hero: hired.h[0] as number, at: hired.h[2].p as number };
}

const told = (bot: Bot) => bot.all(S2C.ADMIN_DEMO_PARTIES).map((m) => m.u.flat().map((row: any) => row[0] as number));

test("demo mode: only staff are told every party, working or not, till they stop watching", async () => {
    const working = await withHero(), resting = await withHero();
    working.bot.send(C2S.HERO_TODO, { h: working.hero, q: [{ k: TaskKind.WORK, p: working.at, n: 50 }], b: null });

    // (a player asking gets nothing)
    resting.bot.send(C2S.ADMIN_DEMO, { o: 1 });
    await sleep(2500);
    assert.deepEqual(told(resting.bot), [], "not staff: nothing");

    const admin = await world.admin();
    admin.send(C2S.ADMIN_DEMO, { o: 1 });
    const first = await admin.next(S2C.ADMIN_DEMO_PARTIES, () => true, 5000);
    const ids = first.u.flat().map((row: any) => row[0]);
    assert.ok(ids.includes(working.hero), "the one at work");
    assert.ok(ids.includes(resting.hero), "the one with nothing to do");

    // (no change, nothing more; then told when one changes)
    const before = admin.all(S2C.ADMIN_DEMO_PARTIES).length;
    await sleep(2500);
    assert.equal(admin.all(S2C.ADMIN_DEMO_PARTIES).length, before, "nothing changed, nothing sent");
    resting.bot.send(C2S.HERO_TODO, { h: resting.hero, q: [{ k: TaskKind.WORK, p: resting.at, n: 50 }], b: null });
    const change = await admin.next(S2C.ADMIN_DEMO_PARTIES, (m) => m.u.flat().some((row: any) => row[0] == resting.hero && row[2].w?.k == TaskKind.WORK), 5000);
    assert.equal(change.u.flat().some((row: any) => row[0] == working.hero), false, "the one that didn't change isn't sent again");

    // (one gone is said to be: here, blocking them)
    const leaving = await withHero();
    await admin.next(S2C.ADMIN_DEMO_PARTIES, (m) => m.u.flat().some((row: any) => row[0] == leaving.hero), 5000);
    leaving.bot.send(C2S.FRIEND_BLOCK, { i: admin.id });
    const gone = await admin.next(S2C.ADMIN_DEMO_PARTIES, (m) => m.g.includes(leaving.hero), 5000);
    assert.deepEqual(gone.u, [], "nothing else with it");

    // (watching again: all of them again)
    admin.send(C2S.ADMIN_DEMO, { o: 0 });
    await sleep(200);
    admin.send(C2S.ADMIN_DEMO, { o: 1 });
    const again = await admin.next(S2C.ADMIN_DEMO_PARTIES, (m) => m.u.flat().some((row: any) => row[0] == working.hero), 5000);
    assert.ok(again.u.flat().some((row: any) => row[0] == resting.hero), "all of them");

    admin.send(C2S.ADMIN_DEMO, { o: 0 });
    await sleep(200);
    const stopped = admin.all(S2C.ADMIN_DEMO_PARTIES).length;
    working.bot.send(C2S.HERO_TODO, { h: working.hero, q: [], b: null });
    await sleep(2500);
    assert.equal(admin.all(S2C.ADMIN_DEMO_PARTIES).length, stopped, "stopped: told no more");
});

test("demo mode: those who've blocked staff are left out", async () => {
    const them = await withHero(), admin = await world.admin();
    them.bot.send(C2S.FRIEND_BLOCK, { i: admin.id });
    await sleep(300);
    admin.send(C2S.ADMIN_DEMO, { o: 1 });
    const parties = await admin.next(S2C.ADMIN_DEMO_PARTIES, () => true, 5000);
    assert.ok(!parties.u.flat().some((row: any) => row[0] == them.hero), "not told of them");
    admin.send(C2S.ADMIN_DEMO, { o: 0 });
});

test("demo mode: a fight someone else has is sent to staff, once", async () => {
    let { bot, hero, at } = await withHero();
    const nodes: TravelNode[] = bot.signedIn.nodes, graph = makeGraph(nodes);
    let way: number[] = null;
    for (const n of nodes) {
        if (!PLACES.has(n.i) || n.i == at) continue;
        const path = findPath(graph, at, n.i);
        if (path && (!way || path.length < way.length)) way = path;
    }
    assert.ok(way?.length, "somewhere to go");
    const stop = graph.get(way[0]), now = Date.now();
    const beast: Sight = { i: 0, k: SightKind.BEAST, v: 0, n: "Ashwing", s: now, e: now + 3600000, a: [stop.x, stop.y, stop.x, stop.y] };
    const r = await world.query<any>("INSERT INTO world_sight (data, ends) VALUES ('{}', ?)", [beast.e]);
    beast.i = r.insertId;
    await world.query("UPDATE world_sight SET data = ? WHERE id = ?", [JSON.stringify({ s: beast, b: [], m: [] }), beast.i]);
    await world.stopServer();
    await world.startServer();
    bot = await world.again(bot);
    const admin = await world.admin();

    admin.send(C2S.ADMIN_DEMO, { o: 1 });
    await admin.next(S2C.ADMIN_DEMO_PARTIES, () => true, 5000);
    bot.send(C2S.HERO_TODO, { h: hero, q: [{ k: TaskKind.TRAVEL, p: way[way.length - 1] }], b: null });
    const fight = await admin.next(S2C.ADMIN_DEMO_FIGHT, (m) => m.h == hero, 120000);
    assert.equal(fight.f.f.find((x: any) => x.s == 1).n, "Ashwing the Dragon");
    await sleep(1000);
    assert.equal(admin.all(S2C.ADMIN_DEMO_FIGHT).filter((m) => m.h == hero).length, 1, "the once");
    assert.equal(bot.all(S2C.ADMIN_DEMO_FIGHT).length, 0, "not to the player");
    assert.equal(bot.all(S2C.HERO_FIGHT).filter((m) => m.h == hero).length, 1, "their own still comes as it did");
});
