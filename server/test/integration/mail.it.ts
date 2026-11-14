import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { C2S, S2C } from "../../../shared/Routes";
import { Bot, until, World } from "./harness";

// Mail against a real server and database: what's sent leaves the sender's
// stash as it's saved and is taken once, by the one it's to, signed in or not.

const ORE = 1;

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

function send(bot: Bot, to: Bot | string, fields: { t?: string, g?: number, i?: [number, number][] }) {
    return bot.ask(C2S.MAIL_SEND, { n: typeof to == "string" ? to : to.name, t: "", g: 0, i: [], ...fields }, S2C.MAIL_DONE, S2C.MAIL_REFUSED);
}

async function inbox(bot: Bot) {
    return (await bot.ask(C2S.MAIL_LIST, {}, S2C.MAIL_LIST)).l as any[];
}

test("a letter to a friend who's signed out: out of the sender's stash at once, taken once as they're back", async () => {
    const a = await world.player();
    let b = await world.player();
    await befriend(a, b);
    await world.give(a, { gold: 300, items: [[ORE, 9]] });
    await world.signOut(b);

    const m = await send(a, b.name, { t: "for the forge", g: 120, i: [[ORE, 5]] });
    assert.equal(m.r, S2C.MAIL_DONE, m.w);
    const sa = await world.stash(a.id);
    assert.equal(sa.gold, 180);
    assert.equal(sa.items.get(ORE), 4);

    b = await world.again(b);
    await until(() => b.all(S2C.MAIL_UNREAD).some((u) => u.u == 1), "told of it as they sign in");
    const [letter] = await inbox(b);
    assert.equal(letter.f, a.name);
    assert.equal(letter.t, "for the forge");
    assert.equal(letter.g, 120);
    assert.deepEqual(letter.o, [[ORE, 5]]);
    assert.equal(letter.u, 1);

    const took = await b.ask(C2S.MAIL_TAKE, { i: letter.i }, S2C.MAIL_DONE, S2C.MAIL_REFUSED);
    assert.equal(took.r, S2C.MAIL_DONE, took.w);
    const sb = await world.stash(b.id);
    assert.equal(sb.gold, 120);
    assert.equal(sb.items.get(ORE), 5);
    const again = await b.ask(C2S.MAIL_TAKE, { i: letter.i }, S2C.MAIL_DONE, S2C.MAIL_REFUSED);
    assert.equal(again.r, S2C.MAIL_REFUSED, "taken once");
    assert.equal((await world.stash(b.id)).gold, 120);

    // (now empty, it can be thrown away)
    const [now] = await inbox(b);
    assert.equal(now.k, 1);
    b.send(C2S.MAIL_DELETE, { i: letter.i });
    await until(async () => (await world.query("SELECT COUNT(*) n FROM mail WHERE id = ?", [letter.i]))[0].n == 0, "thrown away");
});

test("one signed in is told as it comes, and taking it twice at once gives it once", async () => {
    const a = await world.player(), b = await world.player();
    await befriend(a, b);
    await world.give(a, { gold: 50 });
    const told = b.next(S2C.MAIL_NEW);
    assert.equal((await send(a, b, { g: 50 })).r, S2C.MAIL_DONE);
    const n = await told;
    assert.equal(n.n, a.name);
    assert.equal(n.u, 1);

    const [letter] = await inbox(b);
    b.send(C2S.MAIL_TAKE, { i: letter.i });
    b.send(C2S.MAIL_TAKE, { i: letter.i });
    await until(async () => (await world.stash(b.id)).gold == 50, "taken");
    await until(() => b.all(S2C.MAIL_LIST).length >= 2, "the mailbox again");
    assert.equal((await world.stash(b.id)).gold, 50, "once");
});

test("only to friends and guildmates, never yourself, never empty, never more than you have", async () => {
    const a = await world.player(), stranger = await world.player(), friend = await world.player();
    await befriend(a, friend);
    await world.give(a, { gold: 600, items: [[ORE, 2]] });
    const refused = async (to: Bot | string, fields: any, why: RegExp) => {
        const m = await send(a, to, fields);
        assert.equal(m.r, S2C.MAIL_REFUSED, JSON.stringify(fields));
        assert.match(m.w, why);
    };
    await refused(stranger, { t: "hi" }, /friends and guildmates/);
    await refused(a, { t: "hi" }, /That's you/);
    await refused("nobody by this name", { t: "hi" }, /No one's called/);
    await refused(friend, {}, /Write a note/);
    await refused(friend, { g: 601 }, /can't send/);
    await refused(friend, { i: [[ORE, 3]] }, /can't send/);
    await refused(friend, { i: [[ORE, 1], [ORE, 1]] }, /can't send/);
    assert.equal((await world.query("SELECT COUNT(*) n FROM mail WHERE from_id = ?", [a.id]))[0].n, 0);

    // guildmates who aren't friends
    assert.equal((await a.ask(C2S.GUILD_FOUND, { n: "Letter Lodge", t: "MAIL" }, S2C.GUILD_DONE, S2C.GUILD_REFUSED)).r, S2C.GUILD_DONE);
    a.send(C2S.GUILD_OPEN, { o: 1 });
    const [g] = await world.query("SELECT id FROM guild WHERE name = 'Letter Lodge'");
    await until(async () => (await world.query("SELECT is_open FROM guild WHERE id = ?", [g.id]))[0].is_open == 1, "open");
    assert.equal((await stranger.ask(C2S.GUILD_JOIN, { i: g.id }, S2C.GUILD_DONE, S2C.GUILD_REFUSED)).r, S2C.GUILD_DONE);
    const m = await send(a, stranger, { t: "welcome", i: [[ORE, 1]] });
    assert.equal(m.r, S2C.MAIL_DONE, m.w);
});

test("sent back: to its sender with what's in it, theirs to take, and gone from the one who sent it back", async () => {
    const a = await world.player(), b = await world.player();
    await befriend(a, b);
    await world.give(a, { items: [[ORE, 4]] });
    assert.equal((await send(a, b, { t: "keep it", i: [[ORE, 4]] })).r, S2C.MAIL_DONE);
    const [letter] = await inbox(b);

    const told = a.next(S2C.MAIL_NEW);
    const back = await b.ask(C2S.MAIL_RETURN, { i: letter.i }, S2C.MAIL_DONE, S2C.MAIL_REFUSED);
    assert.equal(back.r, S2C.MAIL_DONE, back.w);
    assert.equal((await told).b, 1);
    assert.equal((await inbox(b)).length, 0);
    assert.equal((await b.ask(C2S.MAIL_TAKE, { i: letter.i }, S2C.MAIL_DONE, S2C.MAIL_REFUSED)).r, S2C.MAIL_REFUSED, "not theirs now");

    const [mine] = await inbox(a);
    assert.equal(mine.b, 1);
    assert.equal(mine.f, b.name);
    assert.equal(mine.e, 0, "never runs out");
    assert.equal((await a.ask(C2S.MAIL_RETURN, { i: mine.i }, S2C.MAIL_DONE, S2C.MAIL_REFUSED)).r, S2C.MAIL_REFUSED, "not back and forth");
    assert.equal((await a.ask(C2S.MAIL_TAKE, { i: mine.i }, S2C.MAIL_DONE, S2C.MAIL_REFUSED)).r, S2C.MAIL_DONE);
    assert.equal((await world.stash(a.id)).items.get(ORE), 4);
});

test("to one who's blocked you: sent as far as you can tell, never seen, and back as it runs out", async () => {
    const a = await world.player(), b = await world.player();
    await befriend(a, b);
    await world.give(a, { gold: 40 });
    // (blocking unfriends them: guildmates, so mail can still go)
    b.send(C2S.FRIEND_BLOCK, { i: a.id });
    await until(async () => (await world.query("SELECT COUNT(*) n FROM player_block WHERE player_id = ?", [b.id]))[0].n == 1, "blocked");
    await world.give(b, { gold: 500 });
    assert.equal((await b.ask(C2S.GUILD_FOUND, { n: "Quiet Hall", t: "QUIE" }, S2C.GUILD_DONE, S2C.GUILD_REFUSED)).r, S2C.GUILD_DONE);
    b.send(C2S.GUILD_OPEN, { o: 1 });
    const [g] = await world.query("SELECT id FROM guild WHERE name = 'Quiet Hall'");
    await until(async () => (await world.query("SELECT is_open FROM guild WHERE id = ?", [g.id]))[0].is_open == 1, "open");
    assert.equal((await a.ask(C2S.GUILD_JOIN, { i: g.id }, S2C.GUILD_DONE, S2C.GUILD_REFUSED)).r, S2C.GUILD_DONE);

    const m = await send(a, b, { t: "sorry", g: 40 });
    assert.equal(m.r, S2C.MAIL_DONE, m.w);
    assert.equal((await inbox(b)).length, 0, "never shown");
    assert.equal((await world.stash(a.id)).gold, 0);

    // (run out, and the server started again: it's swept as it starts)
    await world.query("UPDATE mail SET ends = 1 WHERE from_id = ?", [a.id]);
    await world.stopServer();
    await world.startServer();
    const back = await world.again(a);
    await until(async () => (await world.query("SELECT returned FROM mail WHERE to_id = ?", [a.id]))[0]?.returned == 1, "back with its sender");
    const [mine] = await inbox(back);
    assert.equal(mine.b, 1);
    assert.equal(mine.g, 40);
    assert.equal((await back.ask(C2S.MAIL_TAKE, { i: mine.i }, S2C.MAIL_DONE, S2C.MAIL_REFUSED)).r, S2C.MAIL_DONE);
    assert.equal((await world.stash(a.id)).gold, 40);
});

test("a guest can write to a friend but can't send things or gold till they save their account", async () => {
    const guest = await world.guest(), friend = await world.player();
    await befriend(guest, friend);
    await world.give(guest, { gold: 100 });
    const gold = await send(guest, friend, { g: 50 });
    assert.equal(gold.r, S2C.MAIL_REFUSED);
    assert.match(gold.w, /guest/i);
    const note = await send(guest, friend, { t: "hello" });
    assert.equal(note.r, S2C.MAIL_DONE, note.w);
    assert.equal(guest.gold, 100);
});
