import { isItem } from "./Market";

// Trading between two players (the user, 2026-10-29: "a trading system - look
// to Lithalia for the rules"). Lithalia's rules, with asking by name in place
// of standing near each other: one asks another who's signed in (Trade in the
// chat's menu by a name, or in Friends); they have REQUEST_MS to accept. Then
// each puts in up to OFFER_MOST different things from their stash and some
// gold, presses Ready, and once both are ready both Confirm - then it goes
// through. Any change to either offer clears both Readys (and Confirms).
// Nothing leaves a stash until it goes through, when the server checks it all
// again (each still has what they offered) and swaps both at once. Signing
// out, or either calling it off, ends it. Nobody's in two trades, or two
// asks, at once. The server is managers/trade/TradeManager.ts.

export const REQUEST_MS = 15000;    // to answer an ask
export const ASK_GAP_MS = 3000;     // between asks of yours
export const OFFER_MOST = 6;        // different things in an offer
export const GOLD_MOST = 1000000000;

// one side's offer: gold, and things from the stash [item id, how many]
export interface Offer {
    g: number;
    i: [number, number][];
}

export function emptyOffer(): Offer {
    return { g: 0, i: [] };
}

// the trade as one side sees it (S2C.TRADE): n their name, p their player id,
// o [your offer, theirs], rd [you ready, them], cf [you confirmed, them]
export interface TradeView {
    n: string;
    p: number;
    o: [Offer, Offer];
    rd: [number, number];
    cf: [number, number];
}

// an ask between two (S2C.TRADE_ASKED): f 1 if it's yours, n the other's name, e when it runs out (ms)
export interface TradeAsk {
    f: number;
    n: string;
    e: number;
}

// an offer as sent, made safe against what they have: null if it isn't one they could make
export function checkOffer(raw: any, have: (id: number) => number, gold: number): Offer {
    if (!raw || typeof raw != "object") return null;
    const g = raw.g ?? 0;
    if (!Number.isInteger(g) || g < 0 || g > Math.min(gold, GOLD_MOST)) return null;
    if (!Array.isArray(raw.i) || raw.i.length > OFFER_MOST) return null;
    const out: [number, number][] = [];
    for (const e of raw.i) {
        if (!Array.isArray(e) || !isItem(e[0]) || !Number.isInteger(e[1]) || e[1] < 1) return null;
        if (out.some((o) => o[0] == e[0])) return null;
        if (e[1] > have(e[0])) return null;
        out.push([e[0], e[1]]);
    }
    return { g, i: out };
}

// whether an offer has nothing in it
export function isEmpty(o: Offer) {
    return !o.g && !o.i.length;
}
