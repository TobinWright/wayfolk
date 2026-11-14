// Friends (the user, 2026-10-28; DESIGN.md "Friends"): asked and accepted,
// both ways; up to FAVOURITES_MOST of them favourites, whose heroes show on
// your map. Whispers go between friends only, and wait for one signed out.
// Blocking someone ends being friends and any asks between you, and stops
// their asks, whispers and lines in the chat reaching you. The numbers here
// are Claude's proposal, open to change.

export const FRIENDS_MOST = 100;
export const FAVOURITES_MOST = 5;
export const FAVOURITES_PREMIUM = 10;   // a Supporter's (the user, 2026-10-28, a Premium perk); one lapsing keeps theirs, making no more till under 5

export function favouritesMost(premium: boolean) {
    return premium ? FAVOURITES_PREMIUM : FAVOURITES_MOST;
}
export const ASKS_MOST = 20;            // asks of yours waiting at once
export const ASK_DAYS = 30;             // an ask not answered by then is gone
export const ASK_GAP_MS = 3000;         // the least time between one player's asks
export const WHISPER_KEPT = 50;         // whispers kept between two players (the oldest go)
export const BLOCKS_MOST = 200;

export enum Presence { OFFLINE, AWAY, ONLINE }      // AWAY: signed out, their heroes still working

// a friend as sent: i their player id, n their name, p Presence, s last seen
// (ms), u when their heroes stop working (AWAY), f your favourite (1),
// a what each of their heroes is doing (not OFFLINE)
export interface FriendInfo { i: number; n: string; p: Presence; s: number; u?: number; f?: number; a?: string[]; }

// someone asking, asked, or blocked: i their player id, n their name, a when (ms)
export interface Someone { i: number; n: string; a?: number; }

// the whole list as sent: f friends, i asks in, o asks out, b blocked
export interface FriendList { f: FriendInfo[]; i: Someone[]; o: Someone[]; b: Someone[]; }

// a whisper as sent: i its id, w who it's with (their id), n their name,
// m 1 you said it, t what, a when (ms), u 1 not seen yet
export interface Whisper { i: number; w: number; n: string; m: number; t: string; a: number; u?: number; }
