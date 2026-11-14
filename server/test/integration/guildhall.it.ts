import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { C2S, S2C } from "../../../shared/Routes";
import { GUILD_COST, TAKES_A_DAY } from "../../../shared/Guilds";
import { Bot, until, World } from "./harness";

// The guild hall against a real server and database: what's put in leaves one
// stash and is taken once, whole, by rank, and it holds a guild open.

const ORE = 1;

let world: World;
before(async () => { world = await World.start(); });
after(async () => { await world?.stop(); });

let tags = 0;
async function guildOf(leader: Bot, ...members: Bot[]) {
    const n = ++tags, tag = `H${String.fromCharCode(64 + n)}`;
    await world.give(leader, { gold: GUILD_COST });
    const found = await leader.ask(C2S.GUILD_FOUND, { n: `Hall Test ${String.fromCharCode(64 + n)}`, t: tag }, S2C.GUILD_DONE, S2C.GUILD_REFUSED);
    assert.equal(found.r, S2C.GUILD_DONE, found.w);
    const [{ id }] = await world.query("SELECT guild_id id FROM guild_member WHERE player_id = ?", [leader.id]);
    for (const m of members) {
        const joined = await m.ask(C2S.GUILD_JOIN, { i: id }, S2C.GUILD_DONE, S2C.GUILD_REFUSED);
        assert.equal(joined.r, S2C.GUILD_DONE, joined.w);
    }
    return id as number;
}

const put = (bot: Bot, n: number, i = ORE) => bot.ask(C2S.GUILD_PUT, { i, n }, S2C.GUILD_DONE, S2C.GUILD_REFUSED);
const take = (bot: Bot, n: number, i = ORE) => bot.ask(C2S.GUILD_TAKE, { i, n }, S2C.GUILD_DONE, S2C.GUILD_REFUSED);

async function saved(guildId: number) {
    const [r] = await world.query("SELECT items FROM guild_hall WHERE guild_id = ?", [guildId]);
    return new Map<number, number>(JSON.parse(r.items));
}

test("put in and taken out: out of one stash, into another, nothing made or lost", async () => {
    const a = await world.player(), b = await world.player();
    const id = await guildOf(a, b);
    await world.give(a, { items: [[ORE, 9]] });

    assert.equal((await put(a, 6)).r, S2C.GUILD_DONE);
    assert.equal((await world.stash(a.id)).items.get(ORE), 3);
    assert.equal((await saved(id)).get(ORE), 6);

    const got = await take(b, 4);
    assert.equal(got.r, S2C.GUILD_DONE, got.w);
    assert.equal((await world.stash(b.id)).items.get(ORE), 4);
    assert.equal((await saved(id)).get(ORE), 2);

    assert.equal((await take(b, 3)).r, S2C.GUILD_REFUSED, "only 2 left");
    assert.equal((await put(a, 4)).r, S2C.GUILD_REFUSED, "only 3 in their stash");

    const hall = await b.ask(C2S.GUILD_HALL, {}, S2C.GUILD_HALL);
    assert.deepEqual(hall.h.i, [[ORE, 2]]);
    assert.equal(hall.h.y, 4);
    assert.equal(hall.h.l[0][1], 0, "the newest line: they took");
});

test("two taking the last at once: one gets it", async () => {
    const a = await world.player(), b = await world.player();
    const id = await guildOf(a, b);
    await world.give(a, { items: [[ORE, 5]] });
    assert.equal((await put(a, 5)).r, S2C.GUILD_DONE);

    const [x, y] = await Promise.all([take(a, 5), take(b, 5)]);
    assert.deepEqual([x.r, y.r].sort(), [S2C.GUILD_DONE, S2C.GUILD_REFUSED].sort());
    const total = ((await world.stash(a.id)).items.get(ORE) ?? 0) + ((await world.stash(b.id)).items.get(ORE) ?? 0);
    assert.equal(total, 5);
    assert.equal((await saved(id)).size, 0);
});

test("a member takes only so many a day, the leader what they like", async () => {
    const a = await world.player(), b = await world.player();
    await guildOf(a, b);
    await world.give(a, { items: [[ORE, TAKES_A_DAY + 10]] });
    assert.equal((await put(a, TAKES_A_DAY + 10)).r, S2C.GUILD_DONE);

    assert.equal((await take(b, TAKES_A_DAY + 1)).r, S2C.GUILD_REFUSED);
    assert.equal((await take(b, TAKES_A_DAY)).r, S2C.GUILD_DONE);
    assert.equal((await take(b, 1)).r, S2C.GUILD_REFUSED);
    assert.equal((await take(a, 10)).r, S2C.GUILD_DONE);
});

test("those not in it can't touch it, and a guild with things in it can't be closed", async () => {
    const a = await world.player(), other = await world.player();
    const id = await guildOf(a);
    await world.give(a, { items: [[ORE, 2]] });
    assert.equal((await put(a, 2)).r, S2C.GUILD_DONE);

    other.send(C2S.GUILD_TAKE, { i: ORE, n: 1 });
    other.send(C2S.GUILD_HALL, {});
    assert.equal((await saved(id)).get(ORE), 2);

    assert.equal((await a.ask(C2S.GUILD_DISBAND, {}, S2C.GUILD_DONE, S2C.GUILD_REFUSED)).r, S2C.GUILD_REFUSED);
    assert.equal((await a.ask(C2S.GUILD_LEAVE, {}, S2C.GUILD_DONE, S2C.GUILD_REFUSED)).r, S2C.GUILD_REFUSED);
    assert.equal((await take(a, 2)).r, S2C.GUILD_DONE);
    await new Promise((resolve) => setTimeout(resolve, 2100));      // (a guild action's gap)
    const closed = await a.ask(C2S.GUILD_DISBAND, {}, S2C.GUILD_DONE, S2C.GUILD_REFUSED);
    assert.equal(closed.r, S2C.GUILD_DONE, closed.w);
    await until(async () => (await world.query("SELECT COUNT(*) n FROM guild_hall WHERE guild_id = ?", [id]))[0].n == 0, "its hall gone with it");
    assert.equal((await world.stash(a.id)).items.get(ORE), 2);
});
