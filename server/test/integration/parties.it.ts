import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { C2S, S2C } from "../../../shared/Routes";
import { Invites, MateIs, PartyView } from "../../../shared/Parties";
import { Skill } from "../../../shared/Heroes";
import { danger, materialOf } from "../../../shared/Locations";
import { doingText, gatherLevel, gatherSkill, TaskKind } from "../../../shared/Tasks";
import { isTown, kindOf, WorldPlace } from "../../../shared/Places";
import { findPath, makeGraph } from "../../../shared/Travel";
import { Bot, until, World } from "./harness";
import { readFileSync } from "fs";
import * as path from "path";

// the map's places (world.json), as the server reads them
const PLACES: WorldPlace[] = JSON.parse(readFileSync(path.join(__dirname, "..", "..", "..", "..", "..", "client", "dist", "assets", "json", "world.json"), "utf8")).places;

// Formed parties (shared/Parties.ts), played through a real server: a player
// makes one of their own heroes, it works its own list as one (each paid for
// every unit, their own lists waiting), it's saved and carried on across a
// restart, and a hero's out of it again on their own list; another player's
// hero comes in only by an ask their player allows and says yes to, and is
// back on their own list when they're sent off.

let world: World;
before(async () => { world = await World.start(); });
after(async () => { await world?.stop(); });

// the last of their parties they were told of (none: undefined)
const parties = (bot: Bot): PartyView[] => bot.all(S2C.PARTY_LIST).pop()?.l ?? [];
const heroState = (bot: Bot, id: number) => bot.all(S2C.HERO_STATE).filter((m) => m.h == id).pop()?.s;

// a guest with a hero (the first's free): the hero's id and where they stand
async function withHero(bot?: Bot) {
    bot ??= await world.guest();
    const hired = await bot.ask(C2S.HERO_HIRE, { i: 0 }, S2C.HERO_HIRED, S2C.HERO_REFUSED);
    assert.equal(hired.r, S2C.HERO_HIRED, "hired");
    return { bot, hero: hired.h[0] as number, name: hired.h[1].n as string, at: hired.h[2].p as number, town: hired.h[1].o ?? 0 };
}

// a second hero for them from the same town as the first (the board refreshed till one is)
async function sameTown(bot: Bot, town: number) {
    await world.give(bot, { gold: 100000 });
    let board = await bot.ask(C2S.HERO_BOARD, {}, S2C.HERO_BOARD);
    for (let k = 0; k < 8; k++) {
        const i = board.o.findIndex((o: any) => o && (o.d.o ?? 0) == town);
        if (i >= 0) {
            const hired = await bot.ask(C2S.HERO_HIRE, { i }, S2C.HERO_HIRED, S2C.HERO_REFUSED);
            assert.equal(hired.r, S2C.HERO_HIRED, "hired a second");
            return hired.h[0] as number;
        }
        board = await bot.ask(C2S.HERO_REROLL, {}, S2C.HERO_BOARD, S2C.HERO_REFUSED);
        assert.equal(board.r, S2C.HERO_BOARD, "refreshed the board");
    }
    throw new Error("no hero from the same town on the board");
}

test("a party of your own heroes works its list as one, saved across a restart, and they're out again", async () => {
    let { bot: a, hero: h1, at, town } = await withHero();
    const h2 = await sameTown(a, town);

    // made: both in it, with it (they stand where it is)
    a.send(C2S.PARTY_MAKE, { h: [h1, h2], n: "  The   Wayfarers " });
    await until(() => parties(a).length == 1 && parties(a)[0].m.every((m) => m[5] == MateIs.WITH), "the party, both with it");
    const p = parties(a)[0];
    assert.equal(p.n, "The Wayfarers", "its name, tidied");
    assert.equal(p.y, 1, "theirs to set");
    assert.deepEqual(p.m.map((m) => m[0]), [h1, h2]);

    // its list: a shift's work where they are; both on it, their own lists waiting
    a.send(C2S.PARTY_TODO, { i: p.i, q: [{ k: TaskKind.WORK, p: at, n: 1 }], b: null });
    await a.next(S2C.PARTY_STATE, (m) => m.i == p.i && m.s.w?.k == TaskKind.WORK);
    await until(() => [h1, h2].every((h) => heroState(a, h)?.w?.k == TaskKind.WORK && heroState(a, h)?.g == p.i), "both heroes at its work");
    assert.deepEqual(heroState(a, h1).q, [], "their own list, untouched");

    // the shift done while the server was down (its state saved a while back): each paid, each told
    await world.signOut(a);
    await world.stopServer();
    const [row] = await world.query("SELECT state FROM hero_party WHERE id = ?", [p.i]);
    const s = JSON.parse(row.state);
    assert.equal(s.w?.k, TaskKind.WORK, "saved at its work");
    s.t -= 30 * 60000;
    await world.query("UPDATE hero_party SET state = ? WHERE id = ?", [JSON.stringify(s), p.i]);
    const before = (await world.stash(a.id)).gold;
    await world.startServer();
    a = await world.again(a);
    await until(async () => {
        const [r] = await world.query("SELECT state FROM hero_party WHERE id = ?", [p.i]);
        return JSON.parse(r.state).w?.k == TaskKind.REST;
    }, "the shift done, the party resting", 20000);
    // (each paid for the shift: twice a shift's least between them)
    await until(() => a.gold >= before + 2 * 5, "both paid");
    const journals = await world.query("SELECT id, journal FROM hero WHERE id IN (?)", [[h1, h2]]);
    for (const j of journals) assert.match(j.journal, /Worked 1 shift/, `hero ${j.id} told in their journal`);
    assert.equal(parties(a)[0]?.i, p.i, "still in it, signed in again");

    // one out: on their own; then disbanded, the other too
    a.send(C2S.PARTY_LEAVE, { h: h2 });
    await until(() => parties(a)[0]?.m.length == 1, "one left in it");
    await until(() => heroState(a, h2) && heroState(a, h2).g == null, "out of it");
    a.send(C2S.PARTY_DISBAND, { i: p.i });
    await until(() => parties(a).length == 0, "disbanded");
    await until(() => heroState(a, h1) && heroState(a, h1).g == null, "the last out of it too");
    assert.equal((await world.query("SELECT id FROM hero_party WHERE id = ?", [p.i])).length, 0, "its row gone");
});

test("another player's hero comes in only as they allow and say yes, and is back on their own list when sent off", async () => {
    const { bot: a, hero: ha } = await withHero();
    const { bot: b, hero: hb, name: bName, at: bAt } = await withHero();

    // b's hero has a list of their own, waiting while they're in
    b.send(C2S.HERO_TODO, { h: hb, q: [{ k: TaskKind.WORK, p: bAt, n: 3 }], b: null });
    await until(() => heroState(b, hb)?.w?.k == TaskKind.WORK, "b's hero at their own work");

    a.send(C2S.PARTY_MAKE, { h: [ha] });
    await until(() => parties(a).length == 1, "a's party");
    const id = parties(a)[0].i;
    const ask = (n = bName) => a.ask(C2S.PARTY_ASK, { i: id, n }, S2C.PARTY_DONE, S2C.PARTY_REFUSED);
    const wait = () => new Promise((r) => setTimeout(r, 2100));     // (asks a moment apart)

    assert.match((await ask("Nobody By This Name")).w, /No character's called/);
    await wait();
    for (const v of [Invites.NOBODY, Invites.FRIENDS]) {
        b.send(C2S.PARTY_INVITES, { v });
        await until(() => b.all(S2C.PARTY_LIST).pop()?.v == v, "b's setting saved");
        const refused = await ask();
        assert.equal(refused.r, S2C.PARTY_REFUSED, `refused (${Invites[v]})`);
        assert.match(refused.w, /isn't taking party asks/);
        await wait();
    }
    b.send(C2S.PARTY_INVITES, { v: Invites.ANYONE });
    await until(() => b.all(S2C.PARTY_LIST).pop()?.v == Invites.ANYONE, "b allows anyone");
    const asked = await ask();
    assert.equal(asked.r, S2C.PARTY_DONE, "asked");
    await until(() => (b.all(S2C.PARTY_LIST).pop()?.a ?? []).some((x: any) => x.i == id), "b told of the ask");
    assert.equal(b.all(S2C.PARTY_LIST).pop().a.find((x: any) => x.i == id).h, hb, "for that hero");

    // yes: b's hero in, their own list waiting; a sees them (on the way, or with it)
    b.send(C2S.PARTY_ANSWER, { i: id, h: hb });
    await until(() => parties(a)[0]?.m.some((m) => m[0] == hb && m[5] != MateIs.AWAY), "b's hero in a's party");
    await until(() => heroState(b, hb)?.g == id, "b's hero in it");
    assert.equal(heroState(b, hb).q[0]?.k, TaskKind.WORK, "their own list waiting");
    assert.equal(parties(b)[0]?.y, undefined, "not b's to set");
    const refused = await b.ask(C2S.PARTY_TODO, { i: id, q: [], b: null }, S2C.PARTY_REFUSED);
    assert.match(refused.w, /not a party of yours/);

    // sent off: back on their own list
    a.send(C2S.PARTY_KICK, { i: id, h: hb });
    await until(() => heroState(b, hb)?.g == null && heroState(b, hb)?.w?.k == TaskKind.WORK, "b's hero back at their own work");
    await until(() => parties(b).length == 0, "b's no longer told of it");
    assert.equal(parties(a)[0].m.length, 1);
});

test("an ask is live: said no to, not answered in 20 seconds or its player gone it's off, and only to one signed in", async () => {
    const { bot: a, hero: ha } = await withHero();
    const { bot: b, name: bName } = await withHero();
    a.send(C2S.PARTY_MAKE, { h: [ha] });
    await until(() => parties(a).length == 1, "a's party");
    const id = parties(a)[0].i;
    const ask = () => a.ask(C2S.PARTY_ASK, { i: id, n: bName }, S2C.PARTY_DONE, S2C.PARTY_REFUSED);
    const asks = () => b.all(S2C.PARTY_LIST).pop()?.a ?? [];
    const told = (said: RegExp) => a.all(S2C.PARTY_REFUSED).some((m) => said.test(m.w));
    const wait = () => new Promise((r) => setTimeout(r, 2100));     // (asks a moment apart)

    // said no to: off at once, a told
    assert.equal((await ask()).r, S2C.PARTY_DONE, "asked");
    await until(() => asks().some((x: any) => x.i == id), "b told of the ask");
    b.send(C2S.PARTY_ANSWER, { i: id, h: 0 });
    await until(() => asks().length == 0 && told(/said no/), "said no");
    await until(() => (parties(a)[0].k ?? []).length == 0, "gone from a's party");
    await wait();

    // not answered: off after its time, both told
    const from = Date.now();
    assert.equal((await ask()).r, S2C.PARTY_DONE, "asked again");
    await until(() => asks().some((x: any) => x.i == id && x.e > Date.now()), "b told of the ask, with its time");
    assert.equal(parties(a)[0].k.length, 1, "a sees who's asked");
    await until(() => asks().length == 0, "the ask gone for b", 25000);
    assert.ok(Date.now() - from >= 19000, "not before its time");
    await until(() => told(/didn't answer/) && (parties(a)[0].k ?? []).length == 0, "a told it's off");

    // their player gone: off, and no asking one who's not signed in
    assert.equal((await ask()).r, S2C.PARTY_DONE, "asked a third time");
    await until(() => asks().length == 1, "b told of the ask");
    const before = a.all(S2C.PARTY_REFUSED).length;
    await world.signOut(b);
    await until(() => a.all(S2C.PARTY_REFUSED).length > before, "a told it's off");
    await wait();
    assert.match((await ask()).w, /isn't signed in/);
});

test("a party goes as one: the same way, there together", async () => {
    let { bot: a, hero: h1, at, town } = await withHero();
    const h2 = await sameTown(a, town);
    // (another town there's a road to)
    const graph = makeGraph(a.signedIn.nodes);
    const to = PLACES.find((p) => isTown(p) && p.i != at && findPath(graph, at, p.i))?.i;
    assert.ok(to != null, "a town to go to");

    a.send(C2S.PARTY_MAKE, { h: [h1, h2] });
    await until(() => parties(a)[0]?.m.every((m) => m[5] == MateIs.WITH), "both with it");
    const id = parties(a)[0].i;
    a.send(C2S.PARTY_TODO, { i: id, q: [{ k: TaskKind.TRAVEL, p: to }], b: null });
    await until(() => [h1, h2].every((h) => (heroState(a, h)?.r ?? []).length > 0), "both on their way");
    assert.deepEqual(heroState(a, h1).r, heroState(a, h2).r, "the same way");

    // hours on, as if the server were down: there together, resting
    await world.signOut(a);
    await world.stopServer();
    const [row] = await world.query("SELECT state FROM hero_party WHERE id = ?", [id]);
    const s = JSON.parse(row.state);
    s.t -= 6 * 3600000;
    await world.query("UPDATE hero_party SET state = ? WHERE id = ?", [JSON.stringify(s), id]);
    await world.startServer();
    a = await world.again(a);
    await until(async () => {
        const [r] = await world.query("SELECT state FROM hero_party WHERE id = ?", [id]);
        const now = JSON.parse(r.state);
        return now.p == to && !now.r.length;
    }, "the party there", 20000);
    await until(async () => {
        const rows = await world.query("SELECT state FROM hero WHERE id IN (?)", [[h1, h2]]);
        return rows.every((r) => JSON.parse(r.state).p == to);
    }, "both heroes there, saved", 20000);
});

test("a public party's empty spots are filled by heroes alone at the same thing there, and let go when it's private again", async () => {
    const { bot: a, hero: ha, at, town } = await withHero();
    const b = await world.guest();
    await withHero(b);
    const hb = await sameTown(b, town);
    const work = { k: TaskKind.WORK, p: at, n: 3 };
    const helpers = () => (parties(a)[0]?.x ?? []).map((x) => x[0]);
    const withHb = () => b.all(S2C.HERO_PARTY).filter((m) => m.h == hb).pop()?.m.map((m: any) => m[0]) ?? [hb];

    a.send(C2S.PARTY_MAKE, { h: [ha] });
    await until(() => parties(a)[0]?.m[0][5] == MateIs.WITH, "a's party");
    const id = parties(a)[0].i;
    assert.equal(parties(a)[0].f, undefined, "private as it's made");
    a.send(C2S.PARTY_TODO, { i: id, q: [work], b: null });
    b.send(C2S.HERO_TODO, { h: hb, q: [work], b: null });
    await until(() => heroState(b, hb)?.w?.k == TaskKind.WORK && heroState(a, ha)?.w?.k == TaskKind.WORK, "both at the same work there");
    await new Promise((r) => setTimeout(r, 1500));
    assert.deepEqual(helpers(), [], "private: nobody fills it");
    assert.ok(!withHb().includes(ha), "b's hero not with it");         // (others left at the same work from other tests are fine)

    a.send(C2S.PARTY_PUBLIC, { i: id, f: 1 });
    await until(() => helpers().includes(hb), "b's hero helping");
    assert.equal(parties(a)[0].f, 1);
    await until(() => withHb().includes(ha), "b told their hero's with a's party");
    assert.equal(heroState(b, hb).g, undefined, "a helper, not in it");

    a.send(C2S.PARTY_PUBLIC, { i: id, f: 0 });
    await until(() => parties(a)[0]?.f == undefined && helpers().length == 0, "private again: let go");
    await until(() => !withHb().includes(ha), "b's hero alone again");
});

// Iron Ore, deep enough that only some heroes reach it: heroes set up for it in
// the database, signed out and the server down. The strong reach it alone, the
// rest don't; all are skilled enough to gather it. Each to stand where `at` says
const IRON = 3;
async function setUp(ids: number[], strong: number, at: (id: number) => number) {
    for (const r of await world.query("SELECT id, data, state FROM hero WHERE id IN (?)", [ids])) {
        const d = JSON.parse(r.data), s = JSON.parse(r.state);
        d.s = d.s.map(() => r.id == strong ? 60 : 10);
        d.k[Skill.FIGHTING] = r.id == strong ? 60 : 1;
        d.k[gatherSkill(IRON)] = gatherLevel(IRON);
        Object.assign(s, { p: at(r.id), r: [], l: 0, w: null, q: [], d: 0, u: 0 });
        await world.query("UPDATE hero SET data = ?, state = ? WHERE id = ?", [JSON.stringify(d), JSON.stringify(s), r.id]);
    }
}
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

test("a hero starting a gather too deep for them alone joins those already at it there", async () => {
    let { bot: a, hero: h1, town } = await withHero();
    const h2 = await sameTown(a, town), mine = PLACES.find((p) => kindOf(p) == "mine");
    await world.signOut(a);
    await world.stopServer();
    await setUp([h1, h2], h1, () => mine.i);
    await world.startServer();
    a = await world.again(a);
    const task = { k: TaskKind.GATHER, p: mine.i, m: IRON, n: 100 };

    a.send(C2S.HERO_TODO, { h: h1, q: [task], b: null });
    await until(() => heroState(a, h1)?.w?.m == IRON, "the strong one at it");
    await wait(500);
    a.send(C2S.HERO_TODO, { h: h2, q: [task], b: null });
    await until(() => heroState(a, h2)?.q?.length == 1, "the weak one told to");
    await wait(1500);
    assert.equal(heroState(a, h2).w?.m, IRON, "still at it");
    assert.equal(heroState(a, h2).x, undefined, "not given up");
});

test("a party short of one on their way waits for them, and is sent what it reaches now", async () => {
    let { bot: a, hero: h1, town } = await withHero();
    const h2 = await sameTown(a, town), graph = makeGraph(a.signedIn.nodes);
    const mines = PLACES.filter((p) => kindOf(p) == "mine");
    const towns = PLACES.filter((p) => isTown(p));
    // (the mine and the town furthest from it by road, so the one coming isn't there yet)
    const mine = mines[0], far = towns.filter((p) => findPath(graph, p.i, mine.i)).sort((x, y) => findPath(graph, y.i, mine.i).length - findPath(graph, x.i, mine.i).length)[0];
    a.send(C2S.PARTY_MAKE, { h: [h1, h2], n: "Deep" });
    await until(() => parties(a)[0]?.m.every((m) => m[5] == MateIs.WITH), "the party");
    const id = parties(a)[0].i;
    await world.signOut(a);
    await world.stopServer();
    await setUp([h1, h2], h2, (h) => h == h2 ? far.i : mine.i);
    const [row] = await world.query("SELECT state FROM hero_party WHERE id = ?", [id]);
    await world.query("UPDATE hero_party SET state = ? WHERE id = ?", [JSON.stringify({ ...JSON.parse(row.state), p: mine.i, r: [], l: 0, w: null, q: [], d: 0, u: 0 }), id]);
    await world.startServer();
    a = await world.again(a);
    await until(() => parties(a)[0]?.m.find((m) => m[0] == h2)?.[5] == MateIs.JOINING, "the strong one on their way");

    a.send(C2S.PARTY_TODO, { i: id, q: [{ k: TaskKind.GATHER, p: mine.i, m: IRON, n: 5 }], b: null });
    await a.next(S2C.PARTY_STATE, (m) => m.i == id && m.s.w?.m == IRON);
    await wait(1500);
    assert.equal(a.all(S2C.PARTY_STATE).filter((m) => m.i == id).pop().s.w?.m, IRON, "still its task, waiting");
    assert.ok(parties(a)[0].w > 0 && parties(a)[0].w < danger(materialOf(IRON).level), "what it reaches sent: only the one with it, not deep enough");
});

test("a dungeon run says what floor it goes down to", () => {
    const s: any = { w: { k: TaskKind.EXPLORE, p: 1 }, r: [], d: 0 };
    assert.equal(doingText(s, () => "the Vault"), "Exploring the Vault");
    assert.equal(doingText({ ...s, e: 3 }, () => "the Vault"), "Exploring the Vault, floor 3");
});
