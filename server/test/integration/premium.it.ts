import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import * as http from "http";
import Stripe from "stripe";
import { C2S, S2C } from "../../../shared/Routes";
import { Bot, PORT, PRICE, until, WEBHOOK_SECRET, World } from "./harness";

// Premium against a real server and database: Stripe's webhooks (signed as
// Stripe signs them) setting premium_until, each event handled once, a
// dispute cancelling the subscription, and deleting an account deleting its
// Stripe customer - with a stand-in for Stripe's API (harness FakeStripe).

const stripe = new Stripe("sk_test_integration");

let world: World;
before(async () => { world = await World.start(); });
after(async () => { await world?.stop(); });

let events = 0;

// a webhook as Stripe sends it: the status code back
function post(body: string, signature: string) {
    return new Promise<number>((resolve, reject) => {
        const req = http.request({ host: "127.0.0.1", port: PORT, path: "/stripe/webhook", method: "POST", headers: { "Stripe-Signature": signature, "Content-Type": "application/json" } },
            (res) => { res.resume(); resolve(res.statusCode); });
        req.on("error", reject);
        req.end(body);
    });
}

async function webhook(type: string, object: object, id = `evt_test_${events++}`) {
    const payload = JSON.stringify({ id, object: "event", type, data: { object } });
    return post(payload, stripe.webhooks.generateTestHeaderString({ payload, secret: WEBHOOK_SECRET }));
}

function subscription(customer: string, status: string, periodEnd: number, more: object = {}, price = PRICE) {
    return {
        id: `sub_${customer}`, object: "subscription", customer, status, cancel_at_period_end: false, cancel_at: null as number,
        items: { data: [{ price: { id: price }, current_period_end: Math.floor(periodEnd / 1000) }] }, ...more,
    };
}

// a player with a Stripe customer (as the first checkout makes)
async function customer(bot: Bot) {
    const id = `cus_${bot.id}`;
    await world.query("INSERT INTO player_stripe_customer (player_id, stripe_customer_id) VALUES (?, ?)", [bot.id, id]);
    return id;
}

async function premiumUntil(id: number) {
    const [r] = await world.query("SELECT premium_until FROM player WHERE id = ?", [id]);
    return r.premium_until ? new Date(r.premium_until).getTime() : 0;
}

test("the store's price comes from Stripe; guests can't subscribe", async () => {
    const guest = await world.guest();
    await until(() => guest.all(S2C.PREMIUM_STORE).length > 0, "the store");
    let store = guest.all(S2C.PREMIUM_STORE).pop();
    if (!store.on) store = await guest.next(S2C.PREMIUM_STORE);     // (the price read as it started)
    assert.equal(store.on, 1);
    assert.equal(store.p, "$4.99/mo");
    const m = await guest.ask(C2S.PREMIUM_BUY, {}, S2C.PREMIUM_REFUSED, S2C.PREMIUM_CHECKOUT);
    assert.equal(m.r, S2C.PREMIUM_REFUSED);
    assert.match(m.w, /guest/i);
});

test("a webhook not signed by Stripe is refused (400)", async () => {
    const payload = JSON.stringify({ id: "evt_forged", type: "customer.subscription.created", data: { object: {} } });
    assert.equal(await post(payload, stripe.webhooks.generateTestHeaderString({ payload, secret: "whsec_someone_else" })), 400);
    assert.equal(await post(payload, "t=1,v1=nonsense"), 400);
    assert.equal((await world.query("SELECT COUNT(*) n FROM stripe_event WHERE event_id = 'evt_forged'"))[0].n, 0);
});

test("subscribed, cancelled at the period's end, then ended: premium_until follows", async () => {
    const bot = await world.guest(), cus = await customer(bot);
    const end = Date.now() + 30 * 86400000;

    const told = bot.next(S2C.PREMIUM_STORE, (m) => m.u > Date.now());
    assert.equal(await webhook("customer.subscription.created", subscription(cus, "active", end)), 200);
    const store = await told;
    assert.equal(store.s, 1, "renews");
    assert.ok(Math.abs(await premiumUntil(bot.id) - end) < 2000, "premium till the period's end");

    const cancelled = bot.next(S2C.PREMIUM_STORE, (m) => m.s == 0);
    assert.equal(await webhook("customer.subscription.updated", subscription(cus, "active", end, { cancel_at_period_end: true })), 200);
    await cancelled;
    assert.ok(Math.abs(await premiumUntil(bot.id) - end) < 2000, "still premium till then");
    const [sub] = await world.query("SELECT renews FROM player_subscription WHERE player_id = ?", [bot.id]);
    assert.equal(sub.renews, 0);

    const ended = bot.next(S2C.PREMIUM_STORE, (m) => m.u <= Date.now());
    assert.equal(await webhook("customer.subscription.deleted", subscription(cus, "canceled", end)), 200);
    await ended;
    assert.ok(await premiumUntil(bot.id) <= Date.now() + 1000, "premium over");
});

test("an event sent twice is handled once; another price's subscription is ignored", async () => {
    const bot = await world.guest(), cus = await customer(bot);
    const end = Date.now() + 10 * 86400000;
    assert.equal(await webhook("customer.subscription.created", subscription(cus, "active", end), "evt_twice"), 200);
    const first = await premiumUntil(bot.id);
    assert.ok(first > Date.now());

    await world.query("UPDATE player SET premium_until = '2000-01-01' WHERE id = ?", [bot.id]);
    assert.equal(await webhook("customer.subscription.created", subscription(cus, "active", end), "evt_twice"), 200);
    assert.ok(await premiumUntil(bot.id) < Date.now(), "the repeat changed nothing");

    const other = await world.guest(), cus2 = await customer(other);
    assert.equal(await webhook("customer.subscription.created", subscription(cus2, "active", end, {}, "price_something_else")), 200);
    assert.ok(await premiumUntil(other.id) < Date.now());
});

test("a payment disputed cancels the customer's subscription", async () => {
    const bot = await world.guest(), cus = await customer(bot);
    world.stripe.subscriptions.push({ id: `sub_${cus}`, customer: cus, status: "active" });
    world.stripe.charges.set("ch_disputed", cus);
    assert.equal(await webhook("charge.dispute.created", { id: "dp_1", object: "dispute", charge: "ch_disputed", reason: "fraudulent" }), 200);
    assert.ok(world.stripe.calls.includes(`DELETE /v1/subscriptions/sub_${cus}`), "cancelled at Stripe");
});

test("deleting an account deletes its Stripe customer first", async () => {
    const bot = await world.guest(), cus = await customer(bot);
    const m = await bot.ask(C2S.PLAYER_DELETE, { c: "DELETE" }, S2C.PLAYER_DELETED, S2C.PLAYER_DELETE_REFUSED);
    assert.equal(m.r, S2C.PLAYER_DELETED, m.w);
    assert.ok(world.stripe.calls.includes(`DELETE /v1/customers/${cus}`));
    assert.equal((await world.query("SELECT COUNT(*) n FROM player_stripe_customer WHERE player_id = ?", [bot.id]))[0].n, 0);
});
