import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { C2S, S2C } from "../../../shared/Routes";
import { EventKind } from "../../../shared/Events";
import { TaskKind } from "../../../shared/Tasks";
import { townLevel, WIN_POINTS } from "../../../shared/Towns";
import { until, World } from "./harness";

// Towns growing against a real server and database: what's already been won
// counts the first time, and a town event won grows its town for good, saved.

const TOWN = 900001, OTHER = 900002;

let world: World;
before(async () => { world = await World.start(); });
after(async () => { await world?.stop(); });

const won = (kind: EventKind, place: number, name: string) => world.query(
    "INSERT INTO world_event (kind, place, name, started, ends, goal, done, state, boon_until) VALUES (?, ?, ?, 0, 1, 1, 1, 1, 2)", [kind, place, name]);

test("the first time, events already won count; a boss won doesn't; and it's only done once", async () => {
    await world.stopServer();
    await world.query("DELETE FROM town_growth");
    await won(EventKind.UPGRADE, TOWN, "Raise a new forge in Testhold");
    await won(EventKind.UPGRADE, TOWN, "Raise a new forge in Testhold");
    await won(EventKind.REBUILD, TOWN, "Rebuild the town walls of Testhold");
    await won(EventKind.BOSS, OTHER, "Somebody at Testcave");
    await world.startServer();

    const rows = await world.query<any>("SELECT place, points, built FROM town_growth WHERE place IN (?, ?)", [TOWN, OTHER]);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].place, TOWN);
    assert.equal(rows[0].points, 3 * WIN_POINTS);
    assert.deepEqual(new Map(JSON.parse(rows[0].built)), new Map([["New Forge", 2], ["Walls Rebuild", 1]]));
    assert.equal(townLevel(rows[0].points), 3);

    // (restarted, nothing's counted twice)
    await world.stopServer();
    await world.startServer();
    const [again] = await world.query<any>("SELECT points FROM town_growth WHERE place = ?", [TOWN]);
    assert.equal(again.points, 3 * WIN_POINTS);
});

test("a hero's work winning a town event grows the town for good, saved, and everyone's told", async () => {
    let bot = await world.guest();
    const hired = await bot.ask(C2S.HERO_HIRE, { i: 0 }, S2C.HERO_HIRED, S2C.HERO_REFUSED);
    assert.equal(hired.r, S2C.HERO_HIRED);
    const [hero, , state] = hired.h, place: number = state.p;
    const before = (await world.query<any>("SELECT points FROM town_growth WHERE place = ?", [place]))[0]?.points ?? 0;

    // (one with a unit's work left in it, loaded by a restart)
    await world.stopServer();
    const e = await world.query<any>("INSERT INTO world_event (kind, place, name, started, ends, goal, done, state) VALUES (?, ?, ?, ?, ?, 1, 0.5, 0)",
        [EventKind.UPGRADE, place, "Raise a grand inn in Testford", Date.now(), Date.now() + 3600000]);
    await world.startServer();
    bot = await world.again(bot);
    bot.send(C2S.HERO_TODO, { h: hero, q: [{ k: TaskKind.EVENT, p: place, m: e.insertId }], b: null });

    const told = await bot.next(S2C.TOWNS, (m) => m.l.some((t: any) => t[0] == place && t[1] == before + WIN_POINTS), 120000);
    assert.ok(told.l.find((t: any) => t[0] == place)[2].some(([what]: [string, number]) => what == "Grand Inn"));
    await until(async () => (await world.query<any>("SELECT points FROM town_growth WHERE place = ?", [place]))[0]?.points == before + WIN_POINTS, "saved");
    await until(async () => (await world.query<any>("SELECT state FROM world_event WHERE id = ?", [e.insertId]))[0].state == 1, "won, saved", 15000);
});
