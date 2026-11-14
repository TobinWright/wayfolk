// Guilds (the user, 2026-10-29: "implement guilds"; DESIGN.md "Guilds"). The
// ranks, limits and prices here are Claude's proposal, open to change.
// Founded for GUILD_COST gold with a name and a short tag (both no one
// else's), a guild has up to MEMBERS_MOST players, each a Member, an Officer
// or its one Leader. Joined by an invite (from an officer or the leader),
// or straight from Find a guild if it's open to all. Its own tab in the chat,
// its tag by its members' names in the channels, and a notice along its top.
// The leader leaving hands the guild to the longest-serving officer (else
// member); the last one out closes it.

import { chatRefusal, maskSwearing } from "./ChatFilter";
import { Presence, Someone } from "./Friends";
import { Deed } from "./Seasons";

export const GUILD_COST = 500;          // gold, to found one
export const MEMBERS_MOST = 30;
export const INVITES_MOST = 20;         // a guild's invites waiting at once
export const INVITE_DAYS = 7;           // an invite not answered by then is gone
export const ACTION_GAP_MS = 2000;      // the least time between one player's founding, inviting, joining and the like
export const BROWSE_SHOWN = 50;         // guilds sent of a search
export const GUILD_KEPT = 50;           // lines of a guild's chat the server keeps, sent on signing in

export const GUILD_NAME_SHORTEST = 3;
export const GUILD_NAME_LONGEST = 24;
export const TAG_SHORTEST = 2;
export const TAG_LONGEST = 4;
export const NOTICE_LONGEST = 160;

export enum Rank { MEMBER, OFFICER, LEADER }
export const RANK_NAMES = ["Member", "Officer", "Leader"];

// a member as sent: i their player id, n their name, k Rank, p Presence,
// s last seen (ms), j when they joined (ms)
export interface GuildMember { i: number; n: string; k: Rank; p: Presence; s: number; j: number; }

// your guild as sent: i its id, n its name, t its tag, m its notice, o 1 open
// to all (else by invite), c founded (ms), l its members, v the invites it
// has out (officers and the leader only: Someone.a when), x its XP (shared: guildLevel), w this week's goals
export interface GuildView { i: number; n: string; t: string; m: string; o: number; c: number; l: GuildMember[]; v?: Someone[]; x: number; w: WeekView; }

// an invite to you: g the guild's id, n its name, t its tag, c how many it has,
// b who invited you, a when (ms)
export interface GuildInvite { g: number; n: string; t: string; c: number; b: string; a: number; }

// a guild as Find a guild lists it: i id, n name, t tag, c members, o 1 open, l its leader's name, m how many members it takes (its level's)
export interface GuildRow { i: number; n: string; t: string; c: number; o: number; l: string; m?: number; }

// all a player's guild as sent (S2C.GUILD, and with signing in, `guild`): g theirs (null: none), i the invites to them
export interface GuildState { g: GuildView | null; i: GuildInvite[]; }

//#region who may do what

export function canInvite(rank: Rank) {
    return rank >= Rank.OFFICER;
}

export function canEditNotice(rank: Rank) {
    return rank >= Rank.OFFICER;
}

// the leader any but themself; an officer a member
export function canKick(me: Rank, them: Rank) {
    return me == Rank.LEADER ? them != Rank.LEADER : me == Rank.OFFICER && them == Rank.MEMBER;
}

// promoting, demoting, handing over the lead, opening or closing it, closing it down: the leader's
export function isLeader(rank: Rank) {
    return rank == Rank.LEADER;
}

//#endregion

//#region names, tags and notices

// what someone typed, as a guild's name could be: spaces tidied
export function cleanGuildName(name: any) {
    if (typeof name != "string") return "";
    return name.replace(/\s+/g, " ").trim().slice(0, GUILD_NAME_LONGEST);
}

export function guildNameProblem(name: string) {
    if (name.length < GUILD_NAME_SHORTEST) return `A name of ${GUILD_NAME_SHORTEST} characters at least`;
    if (name.length > GUILD_NAME_LONGEST) return `A name of ${GUILD_NAME_LONGEST} characters at most`;
    if (!/^[A-Za-z0-9 '-]+$/.test(name)) return "Only letters, digits, spaces, ' and - in a name";
    if (!/[A-Za-z]/.test(name)) return "At least one letter in the name";
    if (chatRefusal(name) || maskSwearing(name) != name) return "That name isn't allowed";     // (shared/ChatFilter.ts)
    return "";
}

// a tag, in capitals
export function cleanTag(tag: any) {
    if (typeof tag != "string") return "";
    return tag.replace(/\s+/g, "").toUpperCase().slice(0, TAG_LONGEST);
}

export function tagProblem(tag: string) {
    if (tag.length < TAG_SHORTEST || tag.length > TAG_LONGEST) return `A tag of ${TAG_SHORTEST} to ${TAG_LONGEST} letters or digits`;
    if (!/^[A-Z0-9]+$/.test(tag)) return "Only letters and digits in a tag";
    if (!/[A-Z]/.test(tag)) return "At least one letter in the tag";
    if (chatRefusal(tag) || maskSwearing(tag) != tag) return "That tag isn't allowed";
    return "";
}

export function cleanNotice(text: any) {
    if (typeof text != "string") return "";
    return text.replace(/\s+/g, " ").replace(/[\x00-\x1f\x7f]/g, "").trim().slice(0, NOTICE_LONGEST);
}

//#endregion

//#region weekly goals and guild levels (the user, 2026-10-30: "guild goals";
// picked: weekly goals filled by members' heroes doing their usual work, no
// hand-ins; finishing them gives guild XP; guild levels unlock small perks
// and pay gold. The goals, numbers and perks are Claude's proposal.)

// Every guild has the same GOALS_A_WEEK goals in a week (shared/Seasons.ts
// weekOf), picked from GOALS by the week. A goal's target is its `per` a
// member, for as many members as the guild had as its week's first deed came
// in (at least GOAL_LEAST_MEMBERS). Each one met gives the guild GOAL_XP (all
// of them, ALL_GOALS_XP more) and everyone who helped GOAL_GOLD.

export const GOALS_A_WEEK = 3;
export const GOAL_LEAST_MEMBERS = 3;
export const GOAL_XP = 100;
export const ALL_GOALS_XP = 100;
export const GOAL_GOLD = 40;

// (by Deed, shared/Seasons.ts: "Gather # materials")
export const GOALS: { deed: Deed; text: string; per: number }[] = [
    { deed: Deed.GATHER, text: "Gather # materials", per: 150 },
    { deed: Deed.CRAFT, text: "Craft # things", per: 40 },
    { deed: Deed.FINE, text: "Make # Fine or better things", per: 4 },
    { deed: Deed.FIGHT, text: "Win # fights", per: 25 },
    { deed: Deed.EXPLORE, text: "Explore # dungeon floors or places", per: 15 },
    { deed: Deed.LEVEL, text: "Gain # skill levels", per: 10 },
    { deed: Deed.EVENT, text: "Give # points to events", per: 30 },
    { deed: Deed.WORK, text: "Work # shifts", per: 20 },
];

// a week's goals (Deed ids), the same for every guild
export function weekGoals(week: number): Deed[] {
    const pool = GOALS.map((g) => g.deed), out: Deed[] = [];
    let h = (week + 0x51ed27) >>> 0;
    const next = () => {     // (a well-mixed number from the last: splitmix32)
        h = (h + 0x9e3779b9) >>> 0;
        let z = h;
        z = Math.imul(z ^ (z >>> 16), 0x21f0aaad);
        z = Math.imul(z ^ (z >>> 15), 0x735a2d97);
        return (z ^ (z >>> 15)) >>> 0;
    };
    while (out.length < GOALS_A_WEEK) out.push(pool.splice(next() % pool.length, 1)[0]);
    return out;
}

export function goalTarget(deed: Deed, members: number) {
    return (GOALS.find((g) => g.deed == deed)?.per ?? 10) * Math.max(GOAL_LEAST_MEMBERS, members);
}

export function goalText(deed: Deed, target: number) {
    return (GOALS.find((g) => g.deed == deed)?.text ?? "#").replace("#", target.toLocaleString("en-US"));
}

// Guild levels: from 1, the next GUILD_LEVEL_XP x the level more XP (200 to
// 2, 600 to 3 ... 9,000 to 10), at most GUILD_LEVEL_MOST.
export const GUILD_LEVEL_XP = 200;
export const GUILD_LEVEL_MOST = 10;

export function guildLevel(xp: number) {
    let level = 1;
    while (level < GUILD_LEVEL_MOST && xp >= levelStartXp(level + 1)) level++;
    return level;
}
// the XP a level starts at
export function levelStartXp(level: number) {
    return GUILD_LEVEL_XP * level * (level - 1) / 2;
}

// what a level gives its members: their heroes' XP and gold from work, and how
// many members it takes (each the best reached so far)
const XP_AT = [0, 0, 0.02, 0.02, 0.02, 0.05, 0.05, 0.05, 0.08, 0.08, 0.1];
const GOLD_AT = [0, 0, 0, 0, 0.05, 0.05, 0.05, 0.1, 0.1, 0.1, 0.15];
const MEMBERS_AT = [30, 30, 30, 35, 35, 35, 40, 40, 40, 45, 50];
const CRAFT_AT = [0, 0, 0, 0.05, 0.05, 0.05, 0.1, 0.1, 0.1, 0.15, 0.15];

export function guildXpMul(level: number) { return 1 + (XP_AT[level] ?? 0); }
export function guildGoldMul(level: number) { return 1 + (GOLD_AT[level] ?? 0); }
export function guildCraftMul(level: number) { return 1 + (CRAFT_AT[level] ?? 0); }
export function membersMost(level: number) { return MEMBERS_AT[level] ?? MEMBERS_MOST; }

// what reaching a level gives, in a few words (none: nothing new)
export function levelPerk(level: number) {
    const said: string[] = [];
    if (XP_AT[level] > XP_AT[level - 1]) said.push(`+${Math.round(XP_AT[level] * 100)}% XP`);
    if (GOLD_AT[level] > GOLD_AT[level - 1]) said.push(`+${Math.round(GOLD_AT[level] * 100)}% gold from work`);
    if (CRAFT_AT[level] > CRAFT_AT[level - 1]) said.push(`+${Math.round(CRAFT_AT[level] * 100)}% crafting speed`);
    if (MEMBERS_AT[level] > MEMBERS_AT[level - 1]) said.push(`${MEMBERS_AT[level]} members`);
    return said.join(", ");
}

// a week's goals as sent: k the week, e when it ends (ms), g each goal [Deed,
// target, done, yours], d which are met (a bit each, by place)
export interface WeekView { k: number; e: number; g: [Deed, number, number, number][]; d: number; }

//#endregion

//#region the guild hall (the user, 2026-11-03, from a player's feedback:
// "guild halls, which offer crafting speed, shared storage"; "start with tab").
// A tab of the Guild window for now, no place on the map. What's put in is the
// guild's: anyone in it may put things in; officers and the leader take what
// they like, a member up to TAKES_A_DAY a day, so one newcomer can't empty it.
// A guild can't be closed with anything in it. The numbers are Claude's proposal.

export const HALL_ROOM_FIRST = 20, HALL_ROOM_A_LEVEL = 5;   // different things it holds: 20 at level 1, 65 at 10
export const TAKES_A_DAY = 20;                              // things a member may take a day (UTC)
export const HALL_LOG_MOST = 30;                            // lines of who put in or took what, kept
export const HALL_AMOUNT_MOST = 1000000;                    // of any one thing

export function hallRoom(level: number) {
    return HALL_ROOM_FIRST + HALL_ROOM_A_LEVEL * (Math.max(1, level) - 1);
}

// how many more they may take today, by rank (Infinity: no limit)
export function takesLeft(rank: Rank, taken: number) {
    return rank >= Rank.OFFICER ? Infinity : Math.max(0, TAKES_A_DAY - taken);
}

export function hallDay(now: number) {
    return Math.floor(now / 86400000);
}

// one in the log, as sent: [who, 1 put in (0 took), the item, how many, when (ms)]
export type HallLine = [string, number, number, number, number];

// the hall as sent: i what's in it [item, how many], l the log, newest first, y how many they've taken today
export interface HallView { i: [number, number][]; l: HallLine[]; y: number; }

//#endregion
