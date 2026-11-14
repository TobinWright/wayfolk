// The admin's Admin panel (the user, 2026-10-29: "build an admin panel for
// the admin menu"), from the admin menu: find a player and see their
// account, mute or unmute them, and (admins only) give them gold or change
// their role; the open chat reports; a line said to everyone, an event
// started. Editors and up may open it (the admin menu's own rule); gold and
// roles are for admins. Server: managers/admin. For support, see the end.

export const ADMIN_FOUND_MOST = 20;          // players a search shows at most
export const ADMIN_REPORTS_MOST = 30;        // open reports shown at most
export const ADMIN_GOLD_MOST = 1000000;      // gold given (or taken) at once at most
export const ADMIN_SAY_LONGEST = 200;        // an announcement's characters at most

// a player in a search: id, name, role, signed in (1) or not, last seen (ms)
export interface AdminRow { i: number; n: string; r: number; o: number; a: number; }

// a player's account, picked
export interface AdminPlayer {
    i: number;
    n: string;
    t: string;              // account type: guest, email, google
    e: string;              // email (admins only: "" for others)
    r: number;              // role (Role)
    c: number;              // created (ms)
    a: number;              // last seen (ms)
    o: number;              // 1 signed in, 2 away (heroes working), 0 neither
    p: number;              // Supporter until (ms)
    m: number;              // muted until (ms)
    g: number;              // gold
    h: number;              // heroes
    k: string;              // guild tag ("" none)
    rp: number;             // open reports of them
    b: number;              // banned until (ms; 0 not banned, BAN_FOREVER for good)
    bw: string;             // why they're banned ("" none given)
}

//#region bans (the user, 2026-10-30: "account-level bans"). Banned, an
// account can't sign in, by any way (a remembered browser or a dropped
// connection's session too), till its ban ends; banned while signed in it's
// closed (ACCOUNT_BANNED) and its heroes stop working. Staff can't be banned.

export const ADMIN_BAN_DAYS = [1, 7, 30, 0];    // a ban's length in days (0: for good)
export const BAN_FOREVER = 253402300799000;     // (banned_until for good: the last moment of 9999)
export const BAN_REASON_LONGEST = 100;
export const ACCOUNT_BANNED = 4005;             // (the close code: they've just been banned)

// what a banned player's told as they try to sign in
export function banText(until: number, why: string) {
    const when = until >= BAN_FOREVER ? "This account is banned"
        : `This account is banned until ${new Date(until).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "UTC" })} (UTC)`;
    return `${when}${why ? `: ${why}` : ""}. If you think it's a mistake, contact us (the Terms page has how).`;
}

//#endregion

// an open chat report
export interface AdminReport {
    i: number;              // its number
    a: number;              // when (ms)
    w: number;              // why (REPORT_REASONS)
    l: string;              // the line
    x: string;              // the lines before it, and it
    by: string;             // who reported it
    of: string;             // who said it
    oi: number;             // (their id)
}

export const ROLE_NAMES = ["Player", "Moderator", "Editor", "Admin"];

//#region support: a player's stash, market history and purchases, and
// putting things right (the user, 2026-10-29: "looking up a player, their
// purchases and their market history, and granting or restoring items or
// gold ... the same goes for cosmetic packs"). Seeing purchases and giving
// anything are for admins; editors may see the stash and market history.

export const ADMIN_ITEMS_MOST = 100000;      // of a thing given (or taken) at once at most
export const ADMIN_MARKET_MOST = 60;         // market history entries sent at most
export const ADMIN_LOG_MOST = 30;            // staff log entries sent at most
export const ADMIN_SUPPORTER_DAYS = [7, 30]; // Supporter time given at once, in days

// a player's stash: their gold and [item id, amount]
export interface AdminStash { i: number; g: number; l: [number, number][]; }

// what a listing came to (MarketManager's State, saved: never renumber)
export const LISTING_STATES = ["on the market", "sold out", "cancelled", "ran out, not back yet", "ran out, back"];

// something of a player's on the market, newest first
export interface AdminTrade {
    k: number;              // 0 listed, 1 sold (they were the seller), 2 bought
    a: number;              // when (ms)
    m: number;              // item
    n: number;              // amount (listed: at first; left in `l`)
    g: number;              // listed: gold each; sold, bought: gold in all
    w?: string;             // sold to, bought from
    s?: number;             // listed: LISTING_STATES
    l?: number;             // listed: left
    p?: number;             // sold: 1 paid to them, 0 waiting for them to sign in
    id?: number;            // listed: its number
}

// a player's purchases: Supporter, their Stripe subscription, the cosmetic packs
export interface AdminPurchases {
    i: number;
    u: number;              // Supporter until (ms)
    c: string;              // Stripe customer ("" none)
    s: { i: string; t: string; r: number; u: number; a: number } | null;   // subscription: id, status, renews, paid until, last changed
    k: [number, string, number][];      // every pack: id, name, got (ms; 0 not owned)
}

// something staff did to a player (the staff log)
export interface AdminNote { a: number; by: string; w: string; }

//#endregion
