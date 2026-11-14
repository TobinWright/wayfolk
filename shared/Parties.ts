import { EXTENDED, HeroData } from "./Heroes";
import { HeroState, TaskKind } from "./Tasks";

// Parties, of two sorts. Those that come of themselves (the user, 2026-10-28:
// "players may join or leave parties at the drop of a hat... if a character's
// goal changes, they are no longer compatible with the group"; at the place,
// at most 4): never joined or left by hand, nor saved, it's whoever's at the
// same place doing the same thing right now - the same kind of task with the
// same material, recipe or event - worked out again every moment by the
// server (HeroParties), anyone's heroes together. One whose task changes, who
// sets off, or who's recovering from a fight is out of it at once.
// Travelling, they go alone. A party works the deepest level its power
// together reaches and its members fight beside each other; each keeps their
// own progress, loot and hurt.
//
// And formed ones (the user, 2026-11-03: "players should be able to build
// parties and invite characters to their party. the party itself would have
// a todo list and party members would play their roles while accomplishing
// that task"): made by a player of their own heroes, others' coming in by an
// ask (anyone's, as each player allows: Invites) their player, signed in, says
// yes to within PARTY_ASK_MS or it's off (the user, 2026-11-03: "asking to join
// a party shouldn't be async, players should get a 20 second message and if
// they dont accept, its canceled"), and can pull them out of at any time. It has its own to-do list and backup
// task, of every kind of task, set by the player who made it; a hero's own
// list waits while they're in it and carries on after. Those in it are
// together once they're where it is: one asked in, or loaded again after it
// moved on, goes there first (joining), and it sets off nowhere new while
// one's on the way. Together they go as one, at the slowest one's pace; work
// side by side, each their own of every unit, at their pace together, a unit
// counted once (10 gathered is 10 each), one who can't sitting it out; go
// down a dungeon and fight on the road as one, each hurt by it; and wait on
// any of them hurt, beaten or held up, resting meanwhile. Saved (server
// FormedParties); at most PARTY_MOST in it, asked or in. Never one that comes
// of itself as well. Private (as it's made) its room is left empty; public
// (the user, 2026-11-03: "the party leader should be able to choose if empty
// spots should be filled by random heroes or left empty"; "the default should
// be private and members should be dropped if its changed to private"), heroes
// alone at the same thing where it is fill it as helpers (anyone's): fighting
// beside it and counted in how deep it goes, as a party that comes of itself,
// but on their own lists and keeping their own health, gone as their task
// changes or it sets off - all of them at once if it's made private again.
// The numbers are Claude's proposal, open to change.

export const PARTY_MOST = 4;

// Leadership (the user, 2026-11-03, from a player's feedback: "a leadership
// skill could help offer bonuses to the group work speed"; "maybe only the
// group leader gets the leadership xp"): an extended skill only a formed
// party's leader (the first in it who's with it) learns and trains, by units
// of work done with at least one other working beside them. Everyone at it
// works x leadWork of the leader's level. Its numbers are Claude's proposal.
export const LEADERSHIP = EXTENDED.indexOf("Leadership");
export const LEAD_FIRST = 0.02, LEAD_A_LEVEL = 0.002;      // +2% at level 1, 0.2% more a level (+13.8% at 60)
export const LEAD_XP_SHARE = 0.3;                          // of the XP a unit's worth, for each other working beside them
export function leadWork(level: number) {
    return level > 0 ? 1 + LEAD_FIRST + LEAD_A_LEVEL * (level - 1) : 1;
}

// what they're doing where, as a party's alike (null: not in one - on the
// way, recovering, doing nothing, or in a formed one)
export function partyKey(s: HeroState) {
    const w = s.w;
    if (!w || s.r.length || s.o || w.k == TaskKind.TRAVEL || s.g != null) return null;
    return `${s.p}:${w.k}:${w.m ?? ""}`;
}

// one in a party, as their owners' windows show them: [hero id, name, looks, their player's name, job]
export type PartyMember = [number, string, number[], string, number];

// featured parties (server HeroFeatured): how many on the map at a time, and
// about how long each is (half that to twice)
export const FEATURED_MOST = 7;
export const FEATURED_MS = 10 * 60 * 1000;

// one in a featured party: [hero id, their data but what they've learned, state, their player's name]
export type FeaturedHero = [number, Omit<HeroData, "v">, HeroState, string];

//#region formed parties

// who may ask your heroes into their party: anyone, your friends and guildmates, or nobody
export enum Invites { ANYONE, FRIENDS, NOBODY }
export const INVITES_NAMES = ["Anyone", "Friends and guild", "Nobody"];

// how one in a formed party is: with it, on the way to it, or not about (their player's not loaded)
export enum MateIs { WITH, JOINING, AWAY }

// one in a formed party, as sent: [hero id, name, looks, their player's name, job, MateIs, 1 yours]
export type Mate = [number, string, number[], string, number, MateIs, number];

// a formed party, as sent to those with a hero in it: i its id, n its name, o
// its player's name, y 1 it's yours (you set its list, ask and send off), m
// who's in it, s its state (where it is, its list and what's under way, as a
// hero's: HeroState p to e, q, b and t), k who's been asked (yours only:
// [player id, their name, hero id, the hero's name, when it runs out (ms)]), f 1 public (its room
// filled by helpers), x its helpers now ([hero id, name, their player's name, job]),
// w the power of those with it and its helpers (how deep it goes: deepestAt),
// d the % its leader's Leadership adds to its work and dn who leads (none: not two with it)
export interface PartyView { i: number; n: string; o: string; y?: 1; m: Mate[]; s: HeroState; w: number; d?: number; dn?: string; k?: [number, string, number, string, number][]; f?: 1; x?: [number, string, string, number][]; }

// how long an ask has to be answered
export const PARTY_ASK_MS = 20 * 1000;

// an ask to you: i the party, n its name, o its player's name, m who's in it,
// h the hero of yours asked, e when it runs out (ms)
export interface PartyAsk { i: number; n: string; o: string; m: Mate[]; h: number; e: number; }

// how many parties a player can have made, and a name's most letters
export const PARTIES_MOST = 8;
export const PARTY_NAME_MOST = 24;

// a party's name as given (trimmed, cut to fit; none: "")
export function partyName(n: any) {
    return typeof n == "string" ? n.replace(/\s+/g, " ").trim().slice(0, PARTY_NAME_MOST) : "";
}

//#endregion
