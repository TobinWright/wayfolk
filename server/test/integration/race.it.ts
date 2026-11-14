import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { C2S, S2C } from "../../../shared/Routes";
import { BJ_SEAT_GAP_MS, Game, RACE_SLIMES, RacePhase } from "../../../shared/Games";
import { sleep, until, World } from "./harness";

// Slime racing's gold: a bet's stake held while its race is on, taken back
// by leaving while betting's open, and the winner's backers paid its odds,
// as saved.

let world: World;
before(async () => { world = await World.start(); });
after(async () => { await world?.stop(); });

test("a slime race: stakes held, a bet taken back by leaving, and the winner's backers paid its odds", async () => {
    const a = await world.guest(), b = await world.guest();
    await world.give(a, { gold: 100 });
    await world.give(b, { gold: 100 });
    const tracks = await a.ask(C2S.GAME_ROOMS, { g: Game.SLIME_RACE }, S2C.GAME_ROOMS);
    const track = tracks.l.sort((x: any, y: any) => x.a - y.a)[0], stake: number = track.a;
    assert.equal(track.s, 0);

    // in, and betting opens on a race
    await a.ask(C2S.GAME_WATCH, { g: Game.SLIME_RACE, i: track.i }, S2C.GAME_ROOM);
    await b.ask(C2S.GAME_WATCH, { g: Game.SLIME_RACE, i: track.i }, S2C.GAME_ROOM);
    const open = (await a.next(S2C.GAME_ROOM, (m) => m.o.r == RacePhase.BETTING)).o;
    assert.equal(open.l.length, RACE_SLIMES);

    // a bets and switches (paid once); b bets, then leaves, and gets it back
    a.send(C2S.GAME_BET, { s: 0 });
    await a.next(S2C.GAME_GOLD, (m) => m.g == 100 - stake);
    await sleep(BJ_SEAT_GAP_MS + 100);      // (bets that far apart at least)
    a.send(C2S.GAME_BET, { s: 1 });
    await a.next(S2C.GAME_ROOM, (m) => m.o.b.some(([n, s]: [string, number]) => n == a.name && s == 1));
    b.send(C2S.GAME_BET, { s: 2 });
    await b.next(S2C.GAME_GOLD, (m) => m.g == 100 - stake);
    await until(async () => (await world.query("SELECT COUNT(*) n FROM game_bet"))[0].n == 2, "both stakes held");
    b.send(C2S.GAME_LEAVE);
    await b.next(S2C.GAME_GOLD, (m) => m.g == 100);
    await until(async () => (await world.query("SELECT COUNT(*) n FROM game_bet"))[0].n == 1, "b's stake given back");

    // the race, and its result
    const done = (await a.next(S2C.GAME_ROOM, (m) => m.o.r == RacePhase.DONE, 60000)).o;
    assert.equal(done.o.length, RACE_SLIMES);
    assert.deepEqual([...done.o].sort(), [...Array(RACE_SLIMES).keys()]);
    for (let i = 1; i < RACE_SLIMES; i++) assert.ok(done.f[done.o[i - 1]] < done.f[done.o[i]], "each place's time after the last's");
    const winsBy = done.o[0], pays = Math.floor(stake * done.l[1].o / 10);
    assert.ok(done.f[winsBy] == Math.min(...done.f), "the winner's time the best");
    await until(async () => (await world.query("SELECT COUNT(*) n FROM game_bet"))[0].n == 0, "the stakes settled");
    const [saved] = await world.query("SELECT gold FROM inventory WHERE player_id = ?", [a.id]);
    assert.equal(saved.gold, winsBy == 1 ? 100 - stake + pays : 100 - stake);
    assert.deepEqual(done.p, winsBy == 1 ? [[a.name, pays]] : []);
    const [stats] = await world.query("SELECT races, best, net FROM race_stat WHERE player_id = ?", [a.id]);
    assert.equal(stats.races, 1);
    assert.equal(Number(stats.net), winsBy == 1 ? pays - stake : -stake);
    a.send(C2S.GAME_LEAVE);
});

test("betting without the stake, or once the race is on, is refused", async () => {
    const poor = await world.guest();
    const tracks = await poor.ask(C2S.GAME_ROOMS, { g: Game.SLIME_RACE }, S2C.GAME_ROOMS);
    const track = tracks.l.sort((x: any, y: any) => y.a - x.a)[0];
    await poor.ask(C2S.GAME_WATCH, { g: Game.SLIME_RACE, i: track.i }, S2C.GAME_ROOM);
    await poor.next(S2C.GAME_ROOM, (m) => m.o.r == RacePhase.BETTING);
    assert.match((await poor.ask(C2S.GAME_BET, { s: 0 }, S2C.GAME_REFUSED)).w, /stake/);
    await poor.next(S2C.GAME_ROOM, (m) => m.o.r == RacePhase.RUNNING, 40000);
    assert.match((await poor.ask(C2S.GAME_BET, { s: 0 }, S2C.GAME_REFUSED)).w, /closed/);
    poor.send(C2S.GAME_LEAVE);
});
