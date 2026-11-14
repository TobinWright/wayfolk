import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { C2S, S2C } from "../../../shared/Routes";
import { BARRACKS_SLOTS, HERO_SLOTS } from "../../../shared/Heroes";
import { TaskKind } from "../../../shared/Tasks";
import { Bot, sleep, until, World } from "./harness";

// The barracks (shared/Heroes.ts barracksSlots), played through a real
// server: a hire with the roster full goes into it; heroes are sent there and
// called up, one for one as a swap; never the last off the roster, never past
// either's slots; one there keeps their list and stands still, and comes back
// with it; it's all there again signing in; one there can be let go.

let world: World;
before(async () => { world = await World.start(); });
after(async () => { await world?.stop(); });

const benchedOf = async (id: number) => (await world.query("SELECT benched FROM hero WHERE id = ?", [id]))[0].benched;

// (each hire's followed by the board as it is now: an offer left on it hired, else it's refreshed)
async function board(bot: Bot, ask: C2S) {
    const n = bot.all(S2C.HERO_BOARD).length;
    bot.send(ask);
    await until(() => bot.all(S2C.HERO_BOARD).length > n, "the board");
    return bot.all(S2C.HERO_BOARD).pop();
}

async function hire(bot: Bot) {
    let b = bot.all(S2C.HERO_BOARD).pop() ?? await board(bot, C2S.HERO_BOARD);
    if (!b.o.some((o: any) => o)) b = await board(bot, C2S.HERO_REROLL);
    const n = bot.all(S2C.HERO_BOARD).length;
    const hired = await bot.ask(C2S.HERO_HIRE, { i: b.o.findIndex((o: any) => o) }, S2C.HERO_HIRED, S2C.HERO_REFUSED);
    assert.equal(hired.r, S2C.HERO_HIRED, `hired (${hired.w ?? ""})`);
    await until(() => bot.all(S2C.HERO_BOARD).length > n, "the board after");
    return hired;
}

const swap = (bot: Bot, o: number, i: number) => bot.ask(C2S.HERO_SWAP, { o, i }, S2C.HERO_SWAPPED, S2C.HERO_REFUSED);

test("the barracks: hired into with the roster full, swapped one for one, kept across signing in", async () => {
    const bot = await world.guest();
    await world.give(bot, { gold: 1000000 });
    const ids: number[] = [];
    for (let k = 0; k < HERO_SLOTS; k++) {
        const hired = await hire(bot);
        assert.equal(hired.b, undefined, "onto the roster");
        ids.push(hired.h[0]);
    }
    // the roster full: the next goes in the barracks
    const extra = await hire(bot);
    assert.equal(extra.b, 1, "into the barracks");
    const benched = extra.h[0];
    assert.equal(await benchedOf(benched), 1);

    // calling them up alone: no room
    const full = await swap(bot, 0, benched);
    assert.equal(full.r, S2C.HERO_REFUSED);
    assert.equal(full.w, "Your roster is full");

    // the first with a list, sent there for them: a swap
    const [first] = ids;
    bot.send(C2S.HERO_TODO, { h: first, q: [{ k: TaskKind.REST, n: 30 }], b: null });
    await bot.next(S2C.HERO_STATE, (m) => m.h == first && m.s.q.length == 1);
    const swapped = await swap(bot, first, benched);
    assert.equal(swapped.r, S2C.HERO_SWAPPED, `swapped (${swapped.w ?? ""})`);
    assert.equal(swapped.o[0], first, "the first in the barracks");
    assert.equal(swapped.i[0], benched, "the other on the roster");
    assert.equal(swapped.o[2].q.length, 1, "their list kept");
    assert.equal(await benchedOf(first), 1);
    assert.equal(await benchedOf(benched), 0);

    // in the barracks nothing goes by for them: no state sent, the same time on it
    const t = swapped.o[2].t, told = bot.all(S2C.HERO_STATE).filter((m) => m.h == first).length;
    await sleep(1500);
    assert.equal(bot.all(S2C.HERO_STATE).filter((m) => m.h == first).length, told, "nothing sent of them");

    // never the last off the roster
    await swap(bot, ids[1], 0);
    await swap(bot, ids[2], 0);
    const last = await swap(bot, benched, 0);
    assert.equal(last.r, S2C.HERO_REFUSED);
    assert.equal(last.w, "Keep at least one hero on the roster");

    // signing in again: three in the barracks, one on the roster, as saved
    const again = await world.again(bot);
    const signedIn = again.all(S2C.TITLE_SIGNED_IN).pop();
    assert.deepEqual(signedIn.heroes.map((h: any) => h[0]), [benched]);
    assert.deepEqual(signedIn.barracks.map((h: any) => h[0]).sort(), [first, ids[1], ids[2]].sort());
    const kept = signedIn.barracks.find((h: any) => h[0] == first);
    assert.equal(kept[2].t, t, "they didn't work signed out either");
    assert.equal(kept[2].q.length, 1);

    // called up with room: on the roster, their list again, worked on from now
    const back = await swap(again, 0, first);
    assert.equal(back.r, S2C.HERO_SWAPPED);
    assert.ok(back.i[2].t >= Date.now() - 5000, "on from now");
    assert.equal(back.i[2].q.length, 1);
    assert.equal(await benchedOf(first), 0);

    // one in the barracks let go
    const gone = await again.ask(C2S.HERO_DISMISS, { h: ids[1] }, S2C.HERO_DISMISSED);
    assert.equal(gone.h, ids[1]);
    assert.equal((await world.query("SELECT COUNT(*) n FROM hero WHERE id = ?", [ids[1]]))[0].n, 0);
    await world.signOut(again);
});

test("the barracks fills: sending more refused, and hiring with both full", async () => {
    const bot = await world.guest();
    await world.give(bot, { gold: 1000000 });
    const ids: number[] = [];
    for (let k = 0; k < HERO_SLOTS + BARRACKS_SLOTS; k++) ids.push((await hire(bot)).h[0]);
    const fresh = await board(bot, C2S.HERO_REROLL);
    const refused = await bot.ask(C2S.HERO_HIRE, { i: fresh.o.findIndex((o: any) => o) }, S2C.HERO_HIRED, S2C.HERO_REFUSED);
    assert.equal(refused.r, S2C.HERO_REFUSED);
    assert.equal(refused.w, "Your roster and barracks are full");
    const more = await swap(bot, ids[0], 0);
    assert.equal(more.r, S2C.HERO_REFUSED);
    assert.equal(more.w, "The barracks is full");
    // (a swap, one for one, still)
    const one = await swap(bot, ids[0], ids[HERO_SLOTS]);
    assert.equal(one.r, S2C.HERO_SWAPPED);
    await world.signOut(bot);
});
