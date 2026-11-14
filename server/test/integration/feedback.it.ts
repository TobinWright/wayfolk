import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { C2S, S2C } from "../../../shared/Routes";
import { World } from "./harness";

// Feedback (shared/Feedback.ts), played through a real server: sent, kept
// tidied, staff told; too short or too soon refused; staff read the open ones
// and mark them dealt with; players can't read them.

let world: World;
before(async () => { world = await World.start(); });
after(async () => { await world?.stop(); });

test("feedback: sent and kept, refused when bad or too soon, read and dealt with by staff", async () => {
    const admin = await world.admin();
    const bot = await world.guest();

    const short = await bot.ask(C2S.FEEDBACK_SEND, { k: 0, t: "hi" }, S2C.FEEDBACK_SENT, S2C.FEEDBACK_REFUSED);
    assert.equal(short.r, S2C.FEEDBACK_REFUSED, "too short");
    const noKind = await bot.ask(C2S.FEEDBACK_SEND, { k: 7, t: "The market is great" }, S2C.FEEDBACK_SENT, S2C.FEEDBACK_REFUSED);
    assert.equal(noKind.r, S2C.FEEDBACK_REFUSED, "no such kind");

    const told = admin.next(S2C.CHAT_NOTE, (m) => /New feedback/.test(m.t));
    const sent = await bot.ask(C2S.FEEDBACK_SEND, { k: 0, t: "  My hero   got stuck\r\n\n\n\nat the bridge\x07", v: "v9.9.9", d: "phone" }, S2C.FEEDBACK_SENT, S2C.FEEDBACK_REFUSED);
    assert.equal(sent.r, S2C.FEEDBACK_SENT, sent.w);
    await told;
    const [row] = await world.query("SELECT * FROM feedback WHERE player_id = ?", [bot.id]);
    assert.equal(row.text, "My hero got stuck\n\nat the bridge", "tidied");
    assert.equal(row.version, "v9.9.9");
    assert.equal(row.device, "phone");

    const again = await bot.ask(C2S.FEEDBACK_SEND, { k: 1, t: "One more idea please" }, S2C.FEEDBACK_SENT, S2C.FEEDBACK_REFUSED);
    assert.equal(again.r, S2C.FEEDBACK_REFUSED, "a minute between");

    // players can't read it; staff can, and mark it dealt with
    bot.send(C2S.ADMIN_FEEDBACK, {});
    const list = await admin.ask(C2S.ADMIN_FEEDBACK, {}, S2C.ADMIN_FEEDBACK);
    const mine = list.l.find((f: any) => f.i == row.id);
    assert.ok(mine, "on the list");
    assert.equal(mine.by, bot.name);
    assert.equal(bot.all(S2C.ADMIN_FEEDBACK).length, 0, "not for players");
    const after = await admin.ask(C2S.ADMIN_FEEDBACK_DONE, { i: row.id }, S2C.ADMIN_FEEDBACK);
    assert.ok(!after.l.some((f: any) => f.i == row.id), "dealt with: off the list");
    assert.equal((await world.query("SELECT done FROM feedback WHERE id = ?", [row.id]))[0].done, 1);
});
