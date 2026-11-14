import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { C2S, S2C } from "../../../shared/Routes";
import { BOON_MS, EventKind, PastEvent, WorldEvent } from "../../../shared/Events";
import { TaskKind } from "../../../shared/Tasks";
import { distancesFrom, makeGraph } from "../../../shared/Travel";
import { until, World } from "./harness";

// The events window's log of those over (EVENT_PAST): from what's saved,
// newest first by when each ended, each with how many gave, the top givers
// and the asker's own points.

let world: World;
before(async () => { world = await World.start(); });
after(async () => { await world?.stop(); });

test("the log of events over: newest first, the top givers, your points", async () => {
    const a = await world.guest(), b = await world.guest(), c = await world.guest();
    const now = Date.now();
    // out of time two hours ago; won an hour ago (ended as its boon started); one still on
    const lost = await world.query<any>("INSERT INTO world_event (kind, place, name, started, ends, goal, done, state) VALUES (1, 1, 'Rebuild the town walls of X', ?, ?, 100, 40, 2)",
        [now - 8 * 3600000, now - 2 * 3600000]);
    const won = await world.query<any>("INSERT INTO world_event (kind, place, name, started, ends, goal, done, state, boon_until) VALUES (1, 1, 'Rebuild the burnt granary of X', ?, ?, 50, 50, 1, ?)",
        [now - 9 * 3600000, now + 3600000, now - 3600000 + BOON_MS]);
    await world.query("INSERT INTO world_event (kind, place, name, started, ends, goal, done, state) VALUES (1, 1, 'Rebuild the fallen bridge of X', ?, ?, 50, 5, 0)",
        [now, now + 3600000]);
    for (const [bot, points, gold, item] of [[a, 30, 115, 7], [b, 15, 70, 9], [c, 5, 40, 0]] as const)
        await world.query("INSERT INTO event_share (event_id, player_id, points, gold, item, paid) VALUES (?, ?, ?, ?, ?, 1)", [won.insertId, bot.id, points, gold, item]);
    await world.query("INSERT INTO event_share (event_id, player_id, points) VALUES (?, ?, 12.5)", [lost.insertId, b.id]);

    const list: PastEvent[] = (await b.ask(C2S.EVENT_PAST, {}, S2C.EVENT_PAST)).l;
    const mine = list.filter((e) => e.i == won.insertId || e.i == lost.insertId);
    assert.deepEqual(mine.map((e) => e.i), [won.insertId, lost.insertId], "newest ended first, the one on left out");
    assert.ok(!list.some((e) => e.w == 0), "none still on");
    const [w, l] = mine;
    assert.equal(w.w, 1);
    assert.ok(Math.abs(w.x - (now - 3600000)) < 1000, "won: ended as its boon started");
    assert.equal(w.c, 3);
    assert.deepEqual(w.t.map(([name, points, , item]) => [name, points, item]), [[a.name, 30, 7], [b.name, 15, 9], [c.name, 5, 0]], "the top givers, each with their find");
    assert.equal(w.m, 15, "your points");
    assert.equal(w.y, 70, "your gold");
    assert.equal(w.f, 9, "your find");
    assert.equal(l.w, 2);
    assert.equal(l.x, now - 2 * 3600000, "out of time: as it ran out");
    assert.equal(l.m, 12.5);
    assert.equal(l.y, undefined, "out of time: nothing got");
    assert.equal(l.f, undefined);

    // someone else sees the same log with their own points
    const theirs: PastEvent[] = (await c.ask(C2S.EVENT_PAST, {}, S2C.EVENT_PAST)).l;
    assert.equal(theirs.find((e) => e.i == won.insertId).m, 5);
    assert.equal(theirs.find((e) => e.i == won.insertId).y, 40);
    assert.equal(theirs.find((e) => e.i == won.insertId).f, undefined, "no find, not in the top 3");
    assert.equal(theirs.find((e) => e.i == lost.insertId).m, undefined);
});

test("an event's line says which it is, and the list with it has come first (clicking its box goes there)", async () => {
    const bot = await world.guest(), admin = await world.admin();
    const said = bot.next(S2C.CHAT_SAID, (m) => m.l.n == "Event" && m.l.v != null);
    const done = await admin.ask(C2S.ADMIN_EVENT, { k: EventKind.MARCH }, S2C.ADMIN_DONE, S2C.ADMIN_REFUSED);
    assert.equal(done.r, S2C.ADMIN_DONE, done.w);
    const id = (await said).l.v;
    assert.ok(bot.all(S2C.EVENT_LIST).some((m) => m.l.some((e: WorldEvent) => e.i == id)));
});

test("Events with none named: the nearest on; on the list, then the next thing; a backup task, the next event, resting while none are on", async () => {
    await world.stopServer();
    await world.query("UPDATE world_event SET state = 2 WHERE state = 0");
    await world.startServer();
    let bot = await world.guest();
    const hired = await bot.ask(C2S.HERO_HIRE, { i: 0 }, S2C.HERO_HIRED, S2C.HERO_REFUSED);
    assert.equal(hired.r, S2C.HERO_HIRED);
    const [hero, , state] = hired.h, place: number = state.p, any = { k: TaskKind.EVENT }, rest = { k: TaskKind.REST, n: 5 };
    // (as last told; since signing in, what they were up to then)
    const now = () => bot.all(S2C.HERO_STATE).filter((m) => m.h == hero).pop()?.s ?? bot.signedIn.heroes.find((r: any) => r[0] == hero)?.[2];

    // none on: on the list, passed over; a backup task, resting, kept
    bot.send(C2S.HERO_TODO, { h: hero, q: [any, rest], b: any });
    await until(() => now()?.q.length == 1 && now().q[0].k == TaskKind.REST && now().x == "No events are on right now", "passed over");
    bot.send(C2S.HERO_TODO, { h: hero, q: [], b: any });
    await until(() => now()?.w?.k == TaskKind.REST && !now().q.length, "resting");
    assert.deepEqual(now().b, any);

    // two here, a unit of work left in each, and one further off that won't be won here
    const dist = distancesFrom(makeGraph(bot.signedIn.nodes), place);
    const far = (bot.signedIn.nodes as { i: number }[]).map((n) => n.i).filter((i) => i != place && dist.has(i)).pop();
    await world.stopServer();
    const started = Date.now(), ends = started + 3600000;
    const add = (at: number, goal: number, done: number) => world.query<any>("INSERT INTO world_event (kind, place, name, started, ends, goal, done, state) VALUES (?, ?, 'Raise a grand inn in Testford', ?, ?, ?, ?, 0)",
        [EventKind.UPGRADE, at, started, ends, goal, done]);
    await add(far, 100, 0);
    const here = [(await add(place, 1, 0.5)).insertId, (await add(place, 1, 0.5)).insertId];
    await world.startServer();
    bot = await world.again(bot);

    // resting for want of one: there's one on now, and the nearest
    await until(() => here.includes(now()?.w?.m), "gone to one here", 15000);
    const first = now().w.m;

    // on the list: till it's over, then the next thing on the list
    bot.send(C2S.HERO_TODO, { h: hero, q: [any, rest], b: any });
    await until(() => now()?.w?.k == TaskKind.REST && now().w.n == rest.n && now().q.length == 1, "on to the next thing", 120000);

    // a backup task: the other here, and when that's over the one further off, and it's still their backup task
    bot.send(C2S.HERO_TODO, { h: hero, q: [], b: any });
    const second = here.find((id) => id != first);
    await until(() => now()?.w?.m == second, "the other one here", 15000);
    // (the one further off, or nearer, one the server's started itself meanwhile)
    await until(() => now()?.w?.k == TaskKind.EVENT && !here.includes(now().w.m), "on to the next event", 120000).catch((e) => { throw new Error(`${e.message}: ${JSON.stringify(now())}`); });
    assert.deepEqual(now().b, any);
    assert.deepEqual(now().q, []);
});
