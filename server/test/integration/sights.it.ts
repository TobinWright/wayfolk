import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { C2S, S2C } from "../../../shared/Routes";
import { EventKind, WorldEvent } from "../../../shared/Events";
import { Sight, SightKind } from "../../../shared/Sights";
import { TaskKind } from "../../../shared/Tasks";
import { findPath, makeGraph, TravelNode } from "../../../shared/Travel";
import { Bot, World } from "./harness";
import { readFileSync } from "fs";
import * as path from "path";

// the map's places (world.json), as the server reads them
const PLACES = new Set<number>(JSON.parse(readFileSync(path.join(__dirname, "..", "..", "..", "..", "..", "client", "dist", "assets", "json", "world.json"), "utf8")).places.map((p: any) => p.i));

// What turns up on the map for a while (shared/Sights.ts) and bosses on the
// march (shared/Events.ts MARCH), played through a real server: a merchant
// sells only to a player with a hero in its town, and no more than its most;
// a beast on the road fights a hero who stops near it; an opening can be
// explored; a march can be joined wherever it's got to.

let world: World;
before(async () => { world = await World.start(); });
after(async () => { await world?.stop(); });

// a guest with a hero (the first's free), and where that hero stands
async function withHero() {
    const bot = await world.guest();
    const hired = await bot.ask(C2S.HERO_HIRE, { i: 0 }, S2C.HERO_HIRED, S2C.HERO_REFUSED);
    assert.equal(hired.r, S2C.HERO_HIRED, "hired");
    const [id, , state] = hired.h;
    return { bot, hero: id as number, at: state.p as number };
}

// sights put straight in the database, loaded by a restart; the players signed in again
async function withSights(sights: Sight[], bots: Bot[]) {
    for (const s of sights) {
        const r = await world.query<any>("INSERT INTO world_sight (data, ends) VALUES ('{}', ?)", [s.e]);
        s.i = r.insertId;
        await world.query("UPDATE world_sight SET data = ? WHERE id = ?", [JSON.stringify({ s, b: [], m: [] }), s.i]);
    }
    await world.stopServer();
    await world.startServer();
    return Promise.all(bots.map((b) => world.again(b)));
}

test("a merchant sells only to a player with a hero in its town, no more than its most each", async () => {
    let { bot: a, at } = await withHero();
    let b = await world.guest();
    const now = Date.now();
    const merchant: Sight = { i: 0, k: SightKind.MERCHANT, v: 0, n: "Old Tobias", s: now, e: now + 3600000, p: at, l: [[33, 100, 2]] };
    [a, b] = await withSights([merchant], [a, b]);
    await world.give(a, { gold: 1000 });
    await world.give(b, { gold: 1000 });
    const gold = a.all(S2C.HERO_STASH).pop().g;      // (the first steps' rewards in it too)
    const signedIn = a.signedIn.sights as Sight[];
    assert.ok(signedIn.some((s) => s.n == "Old Tobias"), "sent as they sign in");

    const refused = await b.ask(C2S.EVENT_BUY, { i: merchant.i, k: 0, n: 1 }, S2C.EVENT_BOUGHT, S2C.EVENT_REFUSED);
    assert.equal(refused.r, S2C.EVENT_REFUSED, "no hero there: refused");
    assert.match(refused.w, /Send a hero/);

    const bought = await a.ask(C2S.EVENT_BUY, { i: merchant.i, k: 0, n: 1 }, S2C.EVENT_BOUGHT, S2C.EVENT_REFUSED);
    assert.equal(bought.r, S2C.EVENT_BOUGHT, bought.w);
    const tooMany = await a.ask(C2S.EVENT_BUY, { i: merchant.i, k: 0, n: 2 }, S2C.EVENT_BOUGHT, S2C.EVENT_REFUSED);
    assert.equal(tooMany.r, S2C.EVENT_REFUSED, "past its most");
    const last = await a.ask(C2S.EVENT_BUY, { i: merchant.i, k: 0, n: 1 }, S2C.EVENT_BOUGHT, S2C.EVENT_REFUSED);
    assert.equal(last.r, S2C.EVENT_BOUGHT);
    const list = await a.next(S2C.EVENT_SIGHTS, (m) => m.l.some((s: any) => s.i == merchant.i && s.b?.[0] == 2));
    assert.ok(list, "told what they've bought");

    // saved as they sign out: 200g less, two Starmetal
    await world.signOut(a);
    await world.stopServer();
    await world.startServer();
    const stash = await world.stash(a.id);
    assert.equal(stash.gold, gold - 200);
    assert.equal(stash.items.get(33), 2);
});

test("a beast on the road fights a hero who stops near it, once", async () => {
    let { bot, hero, at } = await withHero();
    const nodes: TravelNode[] = bot.signedIn.nodes, graph = makeGraph(nodes);
    // the nearest other place by road, and the first stop on the way there: the beast hangs over it
    const places = new Set<number>(nodes.filter((n) => PLACES.has(n.i) && n.i != at).map((n) => n.i));
    let way: number[] = null;
    for (const id of places) {
        const path = findPath(graph, at, id);
        if (path && (!way || path.length < way.length)) way = path;
    }
    assert.ok(way?.length, "somewhere to go");
    const stop = graph.get(way[0]), now = Date.now();
    const beast: Sight = { i: 0, k: SightKind.BEAST, v: 0, n: "Ashwing", s: now, e: now + 3600000, a: [stop.x, stop.y, stop.x, stop.y] };
    [bot] = await withSights([beast], [bot]);
    bot.send(C2S.HERO_TODO, { h: hero, q: [{ k: TaskKind.TRAVEL, p: way[way.length - 1] }], b: null });
    const fight = await bot.next(S2C.HERO_FIGHT, (m) => m.h == hero, 120000);
    const foe = fight.f.f.find((x: any) => x.s == 1);
    assert.equal(foe.n, "Ashwing the Dragon");
    assert.equal(foe.g, 1, "drawn big");
    // (saved as the server stops)
    await world.stopServer();
    const [saved] = await world.query<any[]>("SELECT data FROM world_sight WHERE id = ?", [beast.i]);
    assert.ok(JSON.parse(saved.data).m.includes(hero), "met: it won't fight them again");
    await world.startServer();
});

test("an opening is a dungeon while it's open: it can be explored", async () => {
    let { bot, hero, at } = await withHero();
    const nodes: TravelNode[] = bot.signedIn.nodes;
    const bend = nodes.find((n) => !PLACES.has(n.i) && n.e.length && n.te != 0 && n.i != at);
    assert.ok(bend, "a bend in the road");
    const now = Date.now();
    const o = { i: bend.i, k: 13, s: 13, x: Math.round(bend.x / 16 - 0.5), y: Math.round(bend.y / 16 - 0.5), n: "The Yawning Deep" };
    const opening: Sight = { i: 0, k: SightKind.OPENING, v: 0, n: o.n, s: now, e: now + 3600000, p: bend.i, o };
    [bot] = await withSights([opening], [bot]);
    bot.send(C2S.HERO_TODO, { h: hero, q: [{ k: TaskKind.EXPLORE, p: bend.i, n: 3 }], b: null });
    const state = await bot.next(S2C.HERO_STATE, (m) => m.h == hero && m.s.q.length > 0);
    assert.deepEqual(state.s.q[0], { k: TaskKind.EXPLORE, p: bend.i, n: 3 });
});

test("a boss on the march can be joined wherever it's got to", async () => {
    let { bot, hero } = await withHero();
    const admin = await world.admin();
    const sent = bot.next(S2C.EVENT_LIST, (m) => m.l.some((e: WorldEvent) => e.k == EventKind.MARCH));
    const done = await admin.ask(C2S.ADMIN_EVENT, { k: EventKind.MARCH }, S2C.ADMIN_DONE, S2C.ADMIN_REFUSED);
    assert.equal(done.r, S2C.ADMIN_DONE, done.w);
    const march: WorldEvent = (await sent).l.find((e: WorldEvent) => e.k == EventKind.MARCH);
    assert.ok(march.r.length > 1 && march.h.length >= 3, "its way and its halts");
    assert.equal(march.p, march.r[0], "halted at its dungeon to start");
    // (the place sent stale: it's put right)
    bot.send(C2S.HERO_TODO, { h: hero, q: [{ k: TaskKind.EVENT, p: march.r[march.r.length - 1], m: march.i }], b: null });
    const state = await bot.next(S2C.HERO_STATE, (m) => m.h == hero && m.s.q.length > 0);
    assert.deepEqual(state.s.q[0], { k: TaskKind.EVENT, p: march.p, m: march.i });
});
