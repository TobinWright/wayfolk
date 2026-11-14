import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { C2S, S2C } from "../../../shared/Routes";
import { PORT, STATS_KEY, until, World } from "./harness";

// What's recorded as they play (server analytics/Tracker), played through a
// real server: a session a sign-in, with its device, where they came from
// and the time idle; windows opened and things done counted; and the admin's
// snapshot reading it back, staff left out unless asked for.

let world: World;
before(async () => { world = await World.start(); });
after(async () => { await world?.stop(); });

test("a session a sign-in: its device, source and idle time; the next knows how long they were away", async () => {
    const bot = await world.guest();
    bot.send(C2S.ANALYTICS_HELLO, { d: "phone", s: "Reddit.com!" });
    await until(async () => (await world.query("SELECT device FROM play_session WHERE player_id = ?", [bot.id]))[0]?.device == "phone", "the device saved");
    const [first] = await world.query("SELECT * FROM play_session WHERE player_id = ?", [bot.id]);
    assert.equal(first.source, "reddit.com", "the source tidied");
    assert.equal(first.first, 1, "their first");
    assert.equal(first.away_s, null, "not away before it");

    bot.send(C2S.ANALYTICS_PRESENCE, { a: 0 });
    await new Promise((r) => setTimeout(r, 1200));
    bot.send(C2S.ANALYTICS_OPENED, { w: "INVENTORY" });
    bot.send(C2S.ANALYTICS_OPENED, { w: "not a window" });
    const again = await world.again(bot);
    await until(async () => (await world.query("SELECT COUNT(*) n FROM play_session WHERE player_id = ?", [bot.id]))[0].n == 2, "a second session");
    const [ended, second] = await world.query("SELECT * FROM play_session WHERE player_id = ? ORDER BY id", [bot.id]);
    assert.equal(ended.open, 0, "the first ended");
    assert.ok(ended.idle_s >= 1, "its idle time counted");
    assert.equal(second.first, 0);
    assert.ok(second.away_s != null && second.away_s < 60, "how long they were away");
    await world.signOut(again);

    // the admin's snapshot: the window counted (as saved before it's made), staff left out unless asked for
    const admin = await world.admin();
    const a = (await admin.ask(C2S.ANALYTICS_GET, {}, S2C.ANALYTICS, S2C.ANALYTICS_REFUSED)).a;
    assert.ok(a.time.since > 0, "sessions recorded");
    assert.equal(a.staff, false);
    assert.ok(a.features.windows.some((w: any) => w[0] == "INVENTORY"), "the window counted");
    assert.ok(!a.features.windows.some((w: any) => w[0] == "not a window"));
    assert.ok(a.time.sources.some((s: any) => s[0] == "reddit.com"), "where they came from");
    assert.ok(a.churn.started >= 1);
    assert.ok(a.cohorts.length >= 1 && a.cohorts[a.cohorts.length - 1].size >= 1, "this week's cohort");
    await new Promise((r) => setTimeout(r, 2100));      // (ASK_GAP)
    const withStaff = (await admin.ask(C2S.ANALYTICS_GET, { s: 1 }, S2C.ANALYTICS, S2C.ANALYTICS_REFUSED)).a;
    assert.equal(withStaff.staff, true);
    assert.ok(withStaff.features.actions.some((r: any) => r[0] == "ANALYTICS_GET") == false, "its own asking isn't counted");

    // not an editor: no snapshot
    const other = await world.guest();
    other.send(C2S.ANALYTICS_GET, {});
    await new Promise((r) => setTimeout(r, 500));
    assert.equal(other.all(S2C.ANALYTICS).length, 0);
});

test("the phone page: its files, its data only with the key, and locked after wrong ones", async () => {
    const base = `http://127.0.0.1:${PORT}/stats`;
    const get = (path: string, key?: string, from = "10.9.0.1") =>
        fetch(base + path, { redirect: "manual", headers: { "X-Forwarded-For": from, ...(key != null ? { Authorization: `Bearer ${key}` } : {}) } });

    assert.equal((await get("")).status, 301, "to /stats/");
    const page = await get("/");
    assert.equal(page.status, 200);
    assert.match(await page.text(), /stats\.js/);
    assert.equal((await get("/stats.js")).status, 200);
    assert.equal((await get("/stats.css")).status, 200);
    assert.equal((await get("/../.env")).status, 404, "nothing but its own files");

    assert.equal((await get("/data")).status, 401, "no key");
    const ok = await get("/data", STATS_KEY);
    assert.equal(ok.status, 200);
    const { a, labels } = await ok.json();
    assert.ok(a.players.total >= 1);
    assert.ok(labels.steps.length > 0, "the names come with it");

    for (let k = 0; k < 5; k++) assert.equal((await get("/data", "wrong", "10.9.0.2")).status, 401);
    assert.equal((await get("/data", STATS_KEY, "10.9.0.2")).status, 429, "locked out, even with the key");
    assert.equal((await get("/data", STATS_KEY, "10.9.0.3")).status, 200, "only that address");
});
