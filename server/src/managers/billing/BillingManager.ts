import Stripe from "stripe";
import { IBS } from "../../app";
import { S2C } from "../../constants/Routes";
import { ENV } from "../../utils/Env";
import { NAME_COLORS } from "../../../../shared/Chat";
import { PlayerRecord } from "../database/PlayerRecord";
import { Player } from "../player/Player";
import { BillingRecord } from "./BillingRecord";
import { Log } from "../../utils/Log";

// a subscription counts while Stripe says it's one of these
const PAID = ["active", "trialing", "past_due"];

// a legal page's address (client/dist/legal), beside the client at PUBLIC_URL
export function legalUrl(page: string) {
    const base = (ENV.PUBLIC_URL ?? "").split(/[?#]/)[0].replace(/[^/]*\.html?$/, "");
    return base.replace(/\/?$/, "/") + "legal/" + page;
}

// Premium, the Supporter subscription (IBS.billing), through Stripe
// Checkout: the player asks to subscribe (C2S.PREMIUM_BUY), the server makes
// a Checkout Session and sends its address (S2C.PREMIUM_CHECKOUT), the
// browser goes to Stripe's page and back. Nothing is granted then - only when
// Stripe's webhook (POST .../stripe/webhook, app.ts) says it's paid: premium
// (player.premium_until, PlayerRecord.isPremium) for as long as the
// subscription is paid up. Subscribers change their card or cancel on
// Stripe's Customer Portal (C2S.PREMIUM_MANAGE). Guests can't subscribe:
// they make an account first. Ported from console8's BillingManager. Off
// until STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET are set in server/.env;
// for sale once STRIPE_PRICE_PREMIUM (a recurring Price made in the Stripe
// Dashboard, $4.99 a month) is set and readable, its label read from Stripe
// so what's shown and what's charged always agree.
export class BillingManager {

    private stripe: Stripe = null;
    private price: { id: string, label: string } = null;

    constructor() {
        BillingRecord.ensureTables().catch(Log.catch("Couldn't make the billing tables"));
        if (!ENV.STRIPE_SECRET_KEY || !ENV.STRIPE_WEBHOOK_SECRET) {
            Log.info("Billing: off (set STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET in .env)");
            return;
        }
        // (STRIPE_API_URL: the integration tests' stand-in for Stripe; never set live)
        const api = ENV.STRIPE_API_URL ? new URL(ENV.STRIPE_API_URL) : null;
        this.stripe = new Stripe(ENV.STRIPE_SECRET_KEY, api ? { host: api.hostname, port: Number(api.port), protocol: api.protocol.replace(":", "") as "http" | "https" } : undefined);
        this.loadPrice();
    }

    public get enabled() {
        return this.stripe !== null;
    }

    // the subscription's price, from Stripe ("$4.99/mo")
    private async loadPrice() {
        const id = ENV.STRIPE_PRICE_PREMIUM;
        if (!id) return Log.warn("Billing: on, but STRIPE_PRICE_PREMIUM isn't set");
        try {
            const price = await this.stripe.prices.retrieve(id);
            if (!price.recurring) throw new Error("Premium needs a recurring price");
            const money = new Intl.NumberFormat("en-US", { style: "currency", currency: price.currency.toUpperCase() }).format((price.unit_amount ?? 0) / 100);
            this.price = { id, label: money + "/" + (price.recurring.interval == "month" ? "mo" : price.recurring.interval) };
            Log.info(`Billing: on, Premium at ${this.price.label}`);
        } catch (error: any) {
            Log.error("Billing: couldn't read STRIPE_PRICE_PREMIUM", error);
        }
        for (const player of IBS.players.online()) this.sendStore(player);
    }

    // { on, p: price, u: premium until, s: renews, k: name colour }
    public async sendStore(player: Player) {
        const renews = await BillingRecord.renews(player.id).catch(() => false);
        player.send({
            r: S2C.PREMIUM_STORE, on: this.enabled && this.price ? 1 : 0, p: this.price?.label ?? "",
            u: new Date(player.record.premiumUntil).getTime() || 0, s: renews ? 1 : 0, k: player.record.nameColor,
        });
    }

    // C2S.PREMIUM_COLOR: a Supporter's name colour (kept if they lapse, for when they're back)
    public async setNameColor(player: Player, color: any) {
        if (!Number.isInteger(color) || !NAME_COLORS[color] || color == player.record.nameColor) return;
        if (!player.record.isPremium()) return this.refuse(player, "Name colours are for Supporters");
        player.record.nameColor = color;
        await PlayerRecord.SetNameColor(player.id, color);
        await this.sendStore(player);
    }

    public refuse(player: Player, why: string) {
        player.send({ r: S2C.PREMIUM_REFUSED, w: why });
    }

    // their Stripe customer, made the first time they subscribe (a
    // subscription's later events only name the customer)
    private async customerFor(player: Player) {
        const existing = await BillingRecord.customerOf(player.id);
        if (existing) return existing;
        const customer = await this.stripe.customers.create({
            name: player.record.displayName, metadata: { playerId: String(player.id) },
        });
        await BillingRecord.setCustomer(player.id, customer.id);
        return (await BillingRecord.customerOf(player.id)) ?? customer.id;
    }

    // C2S.PREMIUM_BUY: a Checkout Session, its address sent back
    public async buy(player: Player) {
        if (!this.enabled || !this.price) return this.refuse(player, "Premium isn't for sale right now");
        if (player.record.accountType == "guest") return this.refuse(player, "Save your account first (Settings) - guests can't subscribe");
        if (await BillingRecord.renews(player.id)) return this.refuse(player, "You're subscribed already");
        const base = ENV.PUBLIC_URL;
        if (!base) return this.refuse(player, "Premium isn't set up yet");

        try {
            const session = await this.stripe.checkout.sessions.create({
                mode: "subscription",
                line_items: [{ price: this.price.id, quantity: 1 }],
                customer: await this.customerFor(player),
                client_reference_id: String(player.id),
                success_url: base + "?billing=done",
                cancel_url: base + "?billing=cancel",
                // the terms and refund policy at the checkbox they tick (needs the Terms
                // URL in the Stripe Dashboard: Settings, Public details)
                consent_collection: { terms_of_service: "required" },
                custom_text: {
                    terms_of_service_acceptance: {
                        message: `I agree to the [Terms of Service](${legalUrl("terms.html")}) and [Refund Policy](${legalUrl("refunds.html")}).`,
                    },
                    submit: { message: "Renews monthly until you cancel. Cancel any time in the game: Premium, then Manage." },
                },
                // (Stripe Tax, once it's set up in the Dashboard)
                ...(ENV.STRIPE_AUTOMATIC_TAX == "1" ? { automatic_tax: { enabled: true }, customer_update: { address: "auto" as const } } : {}),
            });
            if (!session.url) return this.refuse(player, "Couldn't start checkout - try again");
            player.send({ r: S2C.PREMIUM_CHECKOUT, u: session.url });
        } catch (error: any) {
            Log.error("Checkout failed", error, { playerId: player.id });
            this.refuse(player, "Couldn't start checkout - try again");
        }
    }

    // C2S.PREMIUM_MANAGE: Stripe's Customer Portal, to change their card or
    // cancel (its address sent back like a checkout's)
    public async manage(player: Player) {
        if (!this.enabled) return this.refuse(player, "Premium isn't for sale right now");
        try {
            const customer = await BillingRecord.customerOf(player.id);
            if (!customer) return this.refuse(player, "You haven't subscribed yet");
            const portal = await this.stripe.billingPortal.sessions.create({ customer, return_url: ENV.PUBLIC_URL });
            player.send({ r: S2C.PREMIUM_CHECKOUT, u: portal.url });
        } catch (error: any) {
            Log.error("Customer portal failed", error, { playerId: player.id });
            this.refuse(player, "Couldn't open your subscription - try again");
        }
    }

    // An account being deleted (AccountManager): its Stripe customer deleted,
    // which cancels any subscription at once (no more charges) and drops the
    // name we gave Stripe. Stripe keeps the payments, as the law needs it to.
    // Throws if Stripe couldn't be reached, so the account isn't deleted
    // while it might still be charged.
    public async forget(player: Player) {
        const customer = await BillingRecord.customerOf(player.id);
        if (!customer) return;
        if (!this.enabled) throw new Error("billing is off, but they have a Stripe customer");
        try {
            await this.stripe.customers.del(customer);
        } catch (error: any) {
            if (error?.code != "resource_missing") throw error;     // (gone already)
        }
        Log.info(`Stripe customer ${customer} of player ${player.id} deleted`);
    }

    //#region === Stripe's webhook ===

    // A POST from Stripe, its body exactly as sent. Throws if it isn't
    // genuinely Stripe's or it couldn't be handled (Stripe then tries again).
    public async webhook(body: Buffer, signature: string) {
        if (!this.enabled) throw new Error("billing is off");
        const event = this.stripe.webhooks.constructEvent(body, signature, ENV.STRIPE_WEBHOOK_SECRET);
        if (await BillingRecord.handled(event.id)) return;

        switch (event.type) {
            case "customer.subscription.created":
            case "customer.subscription.updated":
            case "customer.subscription.deleted":
                await this.subscription(event.data.object as Stripe.Subscription);
                break;
            case "charge.dispute.created":
                await this.disputed(event.data.object as Stripe.Dispute);
                break;
        }
        await BillingRecord.markHandled(event.id, event.type);
    }

    // A payment disputed with the bank (a chargeback): the subscription
    // cancelled now, so it isn't charged again while it's looked into (the
    // refund policy says so). Premium ends with the subscription's
    // customer.subscription.deleted. Refunds are given by hand in the
    // Dashboard (PREMIUM.md).
    private async disputed(dispute: Stripe.Dispute) {
        const charge = typeof dispute.charge == "string" ? await this.stripe.charges.retrieve(dispute.charge) : dispute.charge;
        const customer = typeof charge.customer == "string" ? charge.customer : charge.customer?.id;
        const playerId = customer ? await BillingRecord.playerOfCustomer(customer) : null;
        Log.warn(`Stripe: a payment of player ${playerId ?? "?"} disputed (${dispute.id}, ${dispute.reason})`);
        if (!customer) return;
        const subscriptions = await this.stripe.subscriptions.list({ customer, status: "active" });
        for (const s of subscriptions.data) await this.stripe.subscriptions.cancel(s.id);
    }

    // A subscription changed (started, renewed, failed, cancelled): premium
    // until the end of what's paid for while Stripe says it's paid up, and
    // ending now once it isn't.
    private async subscription(subscription: Stripe.Subscription) {
        const customer = typeof subscription.customer == "string" ? subscription.customer : subscription.customer.id;
        const playerId = await BillingRecord.playerOfCustomer(customer);
        const item = subscription.items.data[0];
        if (!playerId || !item || item.price.id != ENV.STRIPE_PRICE_PREMIUM) return;

        const paid = PAID.includes(subscription.status);
        const end = item.current_period_end * 1000;
        const until = paid ? end : Math.min(Date.now(), end);
        const renews = paid && !subscription.cancel_at_period_end && !subscription.cancel_at;
        await BillingRecord.setSubscription(playerId, subscription.id, subscription.status, renews, until);

        const player = IBS.players.getById(playerId);
        if (!player) return;
        player.record.premiumUntil = until;
        this.sendStore(player);
    }

    //#endregion

}
