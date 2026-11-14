// Player profiles (the user, 2026-11-02: "add a player profile component. it
// can be opened from other characters status screens or from the chat
// window", "players should be able to make their profiles private", "dont
// show any private information. mostly stats and fun things"). A player's
// name, crown, guild and title, a few lines they write about themselves, how
// they've done (their heroes' levels, events, the card tables, titles, their
// best leaderboard places), and their heroes. Nothing private: not whether
// they're about, where their heroes are or what they're doing, nor their
// gold. Opened by clicking a name in the chat (its menu's Profile), whose
// hero it is on someone else's hero's status, or your own from the other
// menu. Private, only their friends (and staff) see more than the name; nor
// does anyone who's blocked them. The numbers here are Claude's proposal,
// open to change.

export const ABOUT_LONGEST = 200;       // characters
export const PROFILE_GAP_MS = 1000;     // the least time between one player's changes to theirs (the client waits it out)
export const PLACES_SHOWN = 3;          // their best leaderboard places

// a hero on a profile: id, name, Job, looks,
// total level (every skill's), their best skill (Skill) and its level
export type ProfileHero = [number, string, number, number[], number, number, number];

// how they've done: l their heroes' levels all told, e events taken part
// in, q event points, h blackjack hands played, b the biggest pot won there,
// t season titles earned, r their best places on the leaderboards, best first
// (ProfileRank)
export interface ProfileStats { l: number; e: number; q: number; h: number; b: number; t: number; r: ProfileRank[]; }

// a place on a leaderboard: the board, their rank, how many are on it, and on a board of heroes the hero
export type ProfileRank = [number, number, number, string?];

// a profile as sent (S2C.PLAYER_PROFILE): i their player id, n their name,
// p 1 + their NAME_COLORS (a Supporter: a crown by their name, in it), g
// their guild ("[TAG] Name"), h the title they show; m 1 yours; v 1 private;
// x 1 hidden from you (private, or they've blocked you: nothing more sent).
// Shown: a what they wrote, c the month they started (ms), s how they've done, e their heroes
export interface ProfileView {
    i: number; n: string; p?: number; g?: string; h?: string; m?: number; v?: number; x?: number;
    a?: string; c?: number; s?: ProfileStats; e?: ProfileHero[];
}

// what someone wrote about themselves, as kept: one line, nothing unprintable, cut to ABOUT_LONGEST
export function cleanAbout(text: any) {
    if (typeof text != "string") return "";
    return text.replace(/\s+/g, " ").replace(/[\x00-\x1f\x7f]/g, "").trim().slice(0, ABOUT_LONGEST);
}
