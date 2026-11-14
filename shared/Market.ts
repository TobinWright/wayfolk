import { materialOf } from "./Locations";
import { baseItem, itemName, qualityOf, recipeOf, RECIPES, TOOL_SKILL } from "./Tasks";

// The market (the user, 2026-10-28: "an auction house for players"): a player
// lists things from their stash at a price each, and anyone else buys some or
// all of them at that price (buyout only, no bids). No fees (the user's pick).
// A listing lasts 48 hours, then what's left goes back to the seller's stash.
// Up to 10 listings at once, 20 for a Supporter (a Premium perk). Opened from
// the main menu, anywhere. Buy orders and price history below. The rules
// both sides use; the server is managers/market/MarketManager.ts.

export const LISTING_MS = 48 * 60 * 60 * 1000;
export const LISTINGS_MOST = 10;
export const LISTINGS_PREMIUM = 20;
export function listingsMost(premium: boolean) {
    return premium ? LISTINGS_PREMIUM : LISTINGS_MOST;
}

export const PRICE_MOST = 10000000;         // gold each
export const TOTAL_MOST = 1000000000;       // gold a listing (amount x price)
export const SHOWN_MOST = 200;              // listings sent for one look

// A listing, as sent: [id, item id, amount left, price each, seller's player id, seller's name, ends (ms)]
export type ListingRow = [number, number, number, number, number, string, number];

// A sale of yours, as sent: [item id, amount, gold, buyer's name, when (ms)]
export type SaleRow = [number, number, number, string, number];

// what's wrong with listing `amount` at `price` each ("" nothing)
export function listingProblem(amount: number, price: number, have: number) {
    if (!Number.isInteger(amount) || amount < 1) return "List at least one";
    if (amount > have) return "You don't have that many";
    return priceProblem(amount, price);
}

function priceProblem(amount: number, price: number) {
    if (!Number.isInteger(price) || price < 1) return "Set a price";
    if (price > PRICE_MOST) return `At most ${PRICE_MOST.toLocaleString("en-US")}g each`;
    if (amount * price > TOTAL_MOST) return "That's too much gold at once";
    return "";
}

//#region buy orders (the user, 2026-10-30)

// A player wants some of a thing at up to a price each; the gold for all of
// it is set aside as it's posted. Posted, it first buys what's listed at
// that price or less (cheapest first, at their prices: the rest of what was
// set aside stays in their stash); what's still wanted waits on the market.
// Someone listing it at the order's price or less sells to the order first
// (the highest first, at its price), or anyone can sell to one from the
// Wanted tab. What's bought comes at once, or as they next load. Like a
// listing it lasts LISTING_MS, then the gold for what's still wanted comes
// back; up to 10 at once, 20 for a Supporter. No fees.
export const ORDERS_MOST = 10;
export const ORDERS_PREMIUM = 20;
export function ordersMost(premium: boolean) {
    return premium ? ORDERS_PREMIUM : ORDERS_MOST;
}

// An order, as sent: [id, item id, amount still wanted, price each, buyer's player id, buyer's name, ends (ms)]
export type OrderRow = [number, number, number, number, number, string, number];

// what's wrong with wanting `amount` at up to `price` each, with `gold` ("" nothing)
export function orderProblem(amount: number, price: number, gold: number) {
    if (!Number.isInteger(amount) || amount < 1) return "Want at least one";
    const why = priceProblem(amount, price);
    if (why) return why;
    if (amount * price > gold) return "Not enough gold to set aside";
    return "";
}

// what an order could buy now of listings at its price or less, and what
// a listing could sell now to orders at its price or more: the best first
export function orderMatches<T extends { price: number, ends: number }>(offers: T[], price: number, buying: boolean) {
    return offers.filter((o) => buying ? o.price <= price : o.price >= price)
        .sort((a, b) => (buying ? a.price - b.price : b.price - a.price) || a.ends - b.ends);
}

//#endregion

//#region price history (the user, 2026-10-30)

// What a thing has sold for (listings bought and orders filled): each of
// the last HISTORY_DAYS days anything sold, and the last sale; with what's
// on the market for it now
export const HISTORY_DAYS = 14;
export const DAY_MS = 24 * 60 * 60 * 1000;

// a day: [its start (ms, UTC), how many sold, gold altogether, the lowest each, the highest each]
export type DayRow = [number, number, number, number, number];

// i: the item; d: its days, oldest first; l: the last sale's gold each (0: never sold);
// c: the cheapest listing now (0: none); w: the best order now (0: none), x: how many it wants
export interface PriceHistory { i: number; d: DayRow[]; l: number; c: number; w: number; x: number; }

// over the days: how many sold, their average gold each (0: none), the lowest and highest each
export function historySummary(days: DayRow[]) {
    let n = 0, gold = 0, low = Infinity, high = 0;
    for (const [, sold, g, lo, hi] of days) { n += sold; gold += g; low = Math.min(low, lo); high = Math.max(high, hi); }
    return { n, average: n ? Math.round(gold / n) : 0, low: n ? low : 0, high };
}

//#endregion

//#region sorts of things (the inventory's tabs)

export type Sort = "gathered" | "worked" | "gear" | "tools";
export const SORTS: { sort: Sort, name: string, icon: string }[] = [
    { sort: "gathered", name: "Gathered", icon: "gather" },
    { sort: "worked", name: "Worked", icon: "material" },
    { sort: "gear", name: "Gear", icon: "shield" },
    { sort: "tools", name: "Tools", icon: "tool" },
];

export function sortOf(id: number): Sort {
    if (materialOf(id)) return "gathered";
    const r = recipeOf(id);
    if (!r || r.type == "material") return "worked";
    return TOOL_SKILL[r.type] != null ? "tools" : "gear";
}

// things in order: gathered as MATERIALS lists them, made as RECIPES does
const RECIPE_ORDER = new Map(RECIPES.map((r, i) => [r.id, i]));
export function itemOrder(id: number) {
    // (a thing of some quality just after its Normal one, the best last)
    return materialOf(id) ? id : 100000 + (RECIPE_ORDER.get(baseItem(id)) ?? baseItem(id)) + qualityOf(id) / 10;
}

// a thing that can be listed (one the game knows)
export function isItem(id: number) {
    return Number.isInteger(id) && (!!materialOf(id) || !!recipeOf(id));
}

// does a thing's name have all the words searched for in it (ignoring case)
export function itemMatches(id: number, search: string) {
    const name = itemName(id).toLowerCase();
    return search.toLowerCase().split(/\s+/).filter((w) => w).every((w) => name.includes(w));
}

//#endregion
