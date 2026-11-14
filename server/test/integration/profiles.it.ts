import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { C2S, S2C } from "../../../shared/Routes";
import { PROFILE_GAP_MS } from "../../../shared/Profile";
import { Bot, until, World } from "./harness";

// Profiles (shared/Profile.ts) against a real server: anyone's found by name,
// with stats and heroes and nothing private; yours written and made private;
// private, only friends and staff see more than the name, nor does anyone
// they've blocked.

let world: World;
before(async () => { world = await World.start(); });
after(async () => { await world?.stop(); });

// a and b friends (a asked, b said yes)
async function befriend(a: Bot, b: Bot) {
    a.send(C2S.FRIEND_ASK, { n: b.name });
    await until(async () => (await world.query("SELECT COUNT(*) n FROM friend_ask WHERE from_id = ? AND to_id = ?", [a.id, b.id]))[0].n == 1, "the ask saved");
    b.send(C2S.FRIEND_ANSWER, { i: a.id, y: 1 });
    await until(async () => (await world.query("SELECT COUNT(*) n FROM friend WHERE (a_id = ? AND b_id = ?) OR (a_id = ? AND b_id = ?)", [a.id, b.id, b.id, a.id]))[0].n == 1, "friends");
}

function profile(bot: Bot, name: string) {
    return bot.ask(C2S.PLAYER_PROFILE, { n: name }, S2C.PLAYER_PROFILE, S2C.PLAYER_PROFILE_REFUSED);
}

function set(bot: Bot, a: string, v: number) {
    return bot.ask(C2S.PLAYER_PROFILE_SET, { a, v }, S2C.PLAYER_PROFILE, S2C.PLAYER_PROFILE_REFUSED);
}

test("profiles: seen with stats and nothing private; written, made private, seen by friends and staff only", async () => {
    const owner = await world.guest(), stranger = await world.guest(), friend = await world.guest(), admin = await world.admin();

    const missing = await profile(stranger, "Nobody By This Name");
    assert.equal(missing.r, S2C.PLAYER_PROFILE_REFUSED);

    const open = (await profile(stranger, owner.name)).p;
    assert.equal(open.n, owner.name);
    assert.equal(open.x, undefined, "not hidden");
    assert.equal(open.m, undefined, "not theirs");
    assert.equal(typeof open.s?.l, "number", "stats");
    assert.ok(Array.isArray(open.e), "heroes");
    for (const h of open.e) assert.equal(h.length, 7, "a hero: id, name, job, looks, level, best skill, its level");
    assert.equal(new Date(open.c).getDate(), 15, "the month started, no closer");
    assert.equal(open.o, undefined, "not whether they're about");

    const written = await set(owner, "  I   fish\nall day  ", 1);
    assert.equal(written.r, S2C.PLAYER_PROFILE, written.w);
    assert.equal(written.p.m, 1);
    assert.equal(written.p.a, "I fish all day", "tidied");
    assert.equal(written.p.v, 1);
    const tooSoon = await set(owner, "Again", 1);
    assert.equal(tooSoon.r, S2C.PLAYER_PROFILE_REFUSED, "too soon");

    const hidden = (await profile(stranger, owner.name)).p;
    assert.equal(hidden.x, 1, "private: hidden");
    assert.equal(hidden.a, undefined);
    assert.equal(hidden.s, undefined);
    assert.equal(hidden.e, undefined);

    await befriend(owner, friend);
    assert.equal((await profile(friend, owner.name)).p.a, "I fish all day", "a friend sees it");
    assert.equal((await profile(admin, owner.name)).p.a, "I fish all day", "staff see it");

    // public again, but they've blocked someone: hidden from them
    await new Promise((resolve) => setTimeout(resolve, PROFILE_GAP_MS));
    assert.equal((await set(owner, "I fish all day", 0)).r, S2C.PLAYER_PROFILE);
    assert.equal((await profile(stranger, owner.name)).p.a, "I fish all day", "public");
    owner.send(C2S.FRIEND_BLOCK, { i: stranger.id });
    await until(async () => (await world.query("SELECT COUNT(*) n FROM player_block WHERE player_id = ? AND blocked_id = ?", [owner.id, stranger.id]))[0].n == 1, "blocked");
    assert.equal((await profile(stranger, owner.name)).p.x, 1, "hidden from someone blocked");
});
