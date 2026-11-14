import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { C2S, S2C } from "../../../shared/Routes";
import { Bot, Refused, sleep, until, World } from "./harness";

// Accounts against a real server and database: guests, email accounts,
// confirm and reset links (read from the log: no SMTP in the tests), a guest
// saving their account, signing in twice, and Download my data / Delete
// account erasing every row of theirs.

const PASSWORD = "correct horse 42";

let world: World;
before(async () => { world = await World.start(); });
after(async () => { await world?.stop(); });

let emails = 0;
const newEmail = () => `tester${Date.now() % 100000}${emails++}@example.com`;

// the token in the last link of a kind emailed since `from` (the log, as the mail isn't set up)
async function linkToken(kind: "confirm" | "reset", from: number) {
    const pattern = new RegExp(`[?&]${kind}=([^&\\s]+)`);
    await until(() => world.logged(pattern, from).length > 0, `a ${kind} link`);
    const lines = world.logged(pattern, from);
    return decodeURIComponent(pattern.exec(lines[lines.length - 1])[1]);
}

async function refusal(bot: Bot, fields: object) {
    try {
        await bot.signIn(fields);
    } catch (e) {
        if (e instanceof Refused) return e.why;
        throw e;
    }
    assert.fail("signed in when it shouldn't have");
}

test("a guest signs in again with their login, not with a wrong password, and with their tab's session", async () => {
    const guest = await world.guest();
    assert.ok(guest.login && guest.password);
    assert.equal(guest.signedIn.player.type, "guest");
    const session = guest.signedIn.st;
    assert.ok(session, "a session for the tab");

    const again = await world.again(guest);
    assert.equal(again.id, guest.id);

    await again.close();
    const wrong = await world.connect();
    assert.equal(await refusal(wrong, { t: "guest", l: guest.login, p: guest.password + "x" }), "guest");
    const tab = await world.connect();
    assert.equal((await tab.signIn({ t: "session", tok: session })).player.id, guest.id);
});

test("signing in on a second connection closes the first (4001)", async () => {
    const first = await world.guest();
    const second = await world.connect();
    await second.signIn({ t: "guest", l: first.login, p: first.password });
    await until(() => first.closed !== null, "the first to close");
    assert.equal(first.closed, 4001);
    assert.equal(second.closed, null);
});

test("an email account: signed up, confirmed by its link, signed in, remembered", async () => {
    const email = newEmail(), from = world.logs.length;
    const bot = await world.connect();
    await bot.signIn({ t: "email", l: email, p: PASSWORD }, C2S.TITLE_SIGN_UP);
    assert.equal(bot.signedIn.player.type, "email");
    assert.equal(bot.signedIn.player.confirmed, false);

    const token = await linkToken("confirm", from);
    const link = await world.connect();
    const confirmed = await link.ask(C2S.TITLE_CONFIRM_EMAIL, { tok: token }, S2C.TITLE_EMAIL_CONFIRMED, S2C.TITLE_REFUSED);
    assert.equal(confirmed.r, S2C.TITLE_EMAIL_CONFIRMED);
    assert.equal(confirmed.e, email);
    const used = await link.ask(C2S.TITLE_CONFIRM_EMAIL, { tok: token }, S2C.TITLE_EMAIL_CONFIRMED, S2C.TITLE_REFUSED);
    assert.equal(used.r, S2C.TITLE_REFUSED, "a link works once");

    await bot.close();
    const wrong = await world.connect();
    assert.equal(await refusal(wrong, { t: "email", l: email, p: "not the password" }), "credentials");
    const right = await world.connect();
    const m = await right.signIn({ t: "email", l: email.toUpperCase(), p: PASSWORD, rm: 1 });
    assert.equal(m.player.id, bot.id);
    assert.equal(m.player.confirmed, true);
    assert.ok(m.rt, "remembered");

    await right.close();
    const later = await world.connect();
    assert.equal((await later.signIn({ t: "token", tok: m.rt })).player.id, bot.id);
});

test("an email that has an account can't sign up again; a short password is refused", async () => {
    const email = newEmail();
    const bot = await world.connect();
    await bot.signIn({ t: "email", l: email, p: PASSWORD }, C2S.TITLE_SIGN_UP);
    await bot.close();
    const twice = await world.connect();
    await assert.rejects(twice.signIn({ t: "email", l: email, p: PASSWORD }, C2S.TITLE_SIGN_UP), Refused);
    const short = await world.connect();
    await assert.rejects(short.signIn({ t: "email", l: newEmail(), p: "short" }, C2S.TITLE_SIGN_UP), Refused);
});

test("forgot password: the reset link sets a new one, once, and signs out remembered browsers", async () => {
    const email = newEmail();
    const bot = await world.connect();
    const m = await bot.signIn({ t: "email", l: email, p: PASSWORD, rm: 1 }, C2S.TITLE_SIGN_UP);
    await bot.close();
    const remembered = (await (await world.connect()).signIn({ t: "email", l: email, p: PASSWORD, rm: 1 })).rt;

    const from = world.logs.length;
    const asker = await world.connect();
    assert.equal((await asker.ask(C2S.TITLE_FORGOT_PASSWORD, { l: email }, S2C.TITLE_FORGOT_SENT)).r, S2C.TITLE_FORGOT_SENT);
    const nobody = await asker.ask(C2S.TITLE_FORGOT_PASSWORD, { l: newEmail() }, S2C.TITLE_FORGOT_SENT);
    assert.equal(nobody.r, S2C.TITLE_FORGOT_SENT, "the same answer for an email with no account");
    const token = await linkToken("reset", from);

    const reset = await world.connect();
    const NEW = "a brand new password";
    assert.equal((await reset.signIn({ t: "reset", tok: token, p: NEW })).player.id, m.player.id);
    await reset.close();

    assert.equal(await refusal(await world.connect(), { t: "reset", tok: token, p: "another one again" }), "reset");
    assert.equal(await refusal(await world.connect(), { t: "email", l: email, p: PASSWORD }), "credentials");
    assert.equal(await refusal(await world.connect(), { t: "token", tok: remembered }), "token");
    assert.equal((await (await world.connect()).signIn({ t: "email", l: email, p: NEW })).player.id, m.player.id);
});

test("a guest saves their account with an email and keeps everything", async () => {
    const guest = await world.guest();
    await world.give(guest, { gold: 321, items: [[1, 4]] });
    const email = newEmail();
    const saved = await guest.ask(C2S.PLAYER_SAVE_ACCOUNT, { t: "email", l: email, p: PASSWORD }, S2C.PLAYER_ACCOUNT_SAVED, S2C.PLAYER_SAVE_REFUSED);
    assert.equal(saved.r, S2C.PLAYER_ACCOUNT_SAVED, saved.e);
    assert.equal(saved.player.type, "email");
    await world.signOut(guest);

    assert.equal(await refusal(await world.connect(), { t: "guest", l: guest.login, p: guest.password }), "guest", "the guest login stops working");
    const back = await world.connect();
    const m = await back.signIn({ t: "email", l: email, p: PASSWORD });
    assert.equal(m.player.id, guest.id);
    assert.equal(back.gold, 321);
    assert.equal(back.items.get(1), 4);
});

test("Download my data: a copy of the account, without any password", async () => {
    const guest = await world.guest();
    await world.give(guest, { gold: 12 });
    const m = await guest.ask(C2S.PLAYER_EXPORT, {}, S2C.PLAYER_EXPORT, S2C.PLAYER_DELETE_REFUSED);
    assert.equal(m.r, S2C.PLAYER_EXPORT);
    assert.equal(m.d.account.id, guest.id);
    assert.equal(m.d.inventory[0].gold, 12);
    assert.ok(!JSON.stringify(m.d).includes("$2b$"), "no password hash in it");
    const again = await guest.ask(C2S.PLAYER_EXPORT, {}, S2C.PLAYER_EXPORT, S2C.PLAYER_DELETE_REFUSED);
    assert.equal(again.r, S2C.PLAYER_DELETE_REFUSED, "a minute between");
});

// every column that names a player, in every table (so a new table is checked
// too); those listed may keep the id of someone deleted
const KEPT = new Set(["market_sale.buyer_id", "admin_log.staff_id", "guild_invite.by_id"]);
const PLAYER_COLUMNS = ["player_id", "seller_id", "buyer_id", "a_id", "b_id", "from_id", "to_id", "reporter_id", "reported_id", "blocked_id", "staff_id", "by_id"];

test("Delete account: every row of theirs gone, what others need kept, and they can't sign in", async () => {
    const email = newEmail();
    const doomed = await world.connect();
    await doomed.signIn({ t: "email", l: email, p: PASSWORD, rm: 1 }, C2S.TITLE_SIGN_UP);
    const friend = await world.player();     // (saved: a guest can't use the market)
    await world.give(doomed, { gold: 2000, items: [[1, 10]] });
    await world.give(friend, { gold: 500, items: [[2, 5]] });

    // a guild, a listing, a sale each way, a friend ask, card stats, an event share, gold owed
    assert.equal((await doomed.ask(C2S.GUILD_FOUND, { n: "Doomed Hall", t: "DOOM" }, S2C.GUILD_DONE, S2C.GUILD_REFUSED)).r, S2C.GUILD_DONE);
    assert.equal((await doomed.ask(C2S.MARKET_SELL, { i: 1, n: 5, p: 10 }, S2C.MARKET_DONE, S2C.MARKET_REFUSED)).r, S2C.MARKET_DONE);
    assert.equal((await friend.ask(C2S.MARKET_SELL, { i: 2, n: 5, p: 20 }, S2C.MARKET_DONE, S2C.MARKET_REFUSED)).r, S2C.MARKET_DONE);
    const [theirs] = await world.query("SELECT id FROM market_listing WHERE seller_id = ?", [friend.id]);
    const [mine] = await world.query("SELECT id FROM market_listing WHERE seller_id = ?", [doomed.id]);
    assert.equal((await doomed.ask(C2S.MARKET_BUY, { l: theirs.id, n: 5, p: 20 }, S2C.MARKET_DONE, S2C.MARKET_REFUSED)).r, S2C.MARKET_DONE);
    assert.equal((await friend.ask(C2S.MARKET_BUY, { l: mine.id, n: 2, p: 10 }, S2C.MARKET_DONE, S2C.MARKET_REFUSED)).r, S2C.MARKET_DONE);
    doomed.send(C2S.FRIEND_ASK, { n: friend.name });
    await until(async () => (await world.query("SELECT COUNT(*) n FROM friend_ask WHERE from_id = ?", [doomed.id]))[0].n == 1, "the friend ask saved");
    await world.query("INSERT INTO game_stat (player_id, hands, best, net) VALUES (?, 3, 10, -5)", [doomed.id]);
    await world.query("INSERT INTO event_share (event_id, player_id, points, gold, item, paid) VALUES (999999, ?, 1, 5, 0, 1)", [doomed.id]);
    await world.query("INSERT INTO guild_pay (player_id, gold, why) VALUES (?, 3, 'test')", [doomed.id]);
    // letters: one of theirs with gold in it, one of theirs only a note, one to them
    const letter = "INSERT INTO mail (from_id, to_id, note, gold, items, sent, ends) VALUES (?, ?, ?, ?, '[]', 1, ?)";
    await world.query(letter, [doomed.id, friend.id, "a gift", 25, Date.now() + 1e9]);
    await world.query(letter, [doomed.id, friend.id, "just hello", 0, Date.now() + 1e9]);
    await world.query(letter, [friend.id, doomed.id, "hello back", 5, Date.now() + 1e9]);

    const wrong = await doomed.ask(C2S.PLAYER_DELETE, { c: "DELETE", p: "not it" }, S2C.PLAYER_DELETED, S2C.PLAYER_DELETE_REFUSED);
    assert.equal(wrong.r, S2C.PLAYER_DELETE_REFUSED, "the password's needed");
    const unsure = await doomed.ask(C2S.PLAYER_DELETE, { c: "delete", p: PASSWORD }, S2C.PLAYER_DELETED, S2C.PLAYER_DELETE_REFUSED);
    assert.equal(unsure.r, S2C.PLAYER_DELETE_REFUSED, "DELETE typed");

    const gone = await doomed.ask(C2S.PLAYER_DELETE, { c: "DELETE", p: PASSWORD }, S2C.PLAYER_DELETED, S2C.PLAYER_DELETE_REFUSED);
    assert.equal(gone.r, S2C.PLAYER_DELETED, gone.w);
    await until(() => doomed.closed !== null, "the connection closed");
    assert.equal(doomed.closed, 4003);

    const columns = await world.query(
        "SELECT table_name t, column_name c FROM information_schema.columns WHERE table_schema = DATABASE() AND column_name IN (?) ORDER BY 1, 2", [PLAYER_COLUMNS]);
    assert.ok(columns.length > 20, "found the tables");
    for (const { t, c } of columns) {
        if (KEPT.has(`${t}.${c}`)) continue;
        const [r] = await world.query(`SELECT COUNT(*) n FROM \`${t}\` WHERE \`${c}\` = ?`, [doomed.id]);
        assert.equal(r.n, 0, `${t}.${c} still names the deleted player (add the table to ERASE in AccountManager)`);
    }
    assert.equal((await world.query("SELECT COUNT(*) n FROM player WHERE id = ?", [doomed.id]))[0].n, 0);
    assert.equal((await world.query("SELECT COUNT(*) n FROM guild WHERE name = 'Doomed Hall'"))[0].n, 0, "a guild of one, gone with them");

    // the friend still has what they bought, and what they sold to them stays theirs
    const [sold] = await world.query("SELECT gold FROM market_sale WHERE seller_id = ? AND buyer_id = ?", [friend.id, doomed.id]);
    assert.equal(Number(sold.gold), 100, "a sale to them stays, for the seller");
    await until(() => friend.items.get(1) == 2, "the friend keeps what they bought");
    const listed = await friend.ask(C2S.MARKET_LIST, { t: "", q: "" }, S2C.MARKET_LIST);
    assert.ok(!listed.l.some((l: any) => l[4] == doomed.id), "their listings off the market");

    // the gift they sent still waits for the friend, from nobody, its note gone and never to run out; the rest gone
    const mail = await world.query("SELECT from_id, note, gold, ends FROM mail WHERE to_id = ?", [friend.id]);
    assert.equal(mail.length, 1);
    assert.deepEqual([mail[0].from_id, mail[0].note, Number(mail[0].gold), Number(mail[0].ends)], [0, "", 25, 0]);

    assert.equal(await refusal(await world.connect(), { t: "email", l: email, p: PASSWORD }), "credentials");
    await sleep(100);
});
