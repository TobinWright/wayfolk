import { Skill } from "./Heroes";
import { clockTime, CYCLE_MS } from "./Weather";

// Seasons and guild weeks (the user, 2026-10-30: "add guild goals, quality
// rolls and seasons"; picked: rotating world seasons, weekly guild goals with
// guild levels, cosmetic rewards). The numbers and names are Claude's
// proposal, open to change.
//
// Both go by the clock alone, as the weather does: weeks from CALENDAR_START
// (a Monday, 00:00 UTC), and a season every SEASON_WEEKS of them ("Season 1"
// on). A season has a board of its own: players score points for what their
// heroes do (DEED_POINTS), and as it ends the best get its title and everyone
// who took part its background for a hero's status.
//
// The world's seasons (2026-10-31, the user: "13 days at 10 minutes a day")
// go apart from those: Spring, Summer, Autumn, Winter, WORLD_SEASON_DAYS days
// of the world's clock each (shared/Weather.ts), turning at its midnight; the
// first, from CALENDAR_START, an Autumn. Its year (8h 40m) doesn't go
// into a real day evenly, so a season comes at a different hour each day. A
// world season makes the world a little different (its skills work quicker,
// the map's light, snow in Winter).

export const CALENDAR_START = Date.UTC(2026, 9, 26);        // Monday 26 October 2026
export const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
export const SEASON_WEEKS = 2;
export const SEASON_MS = SEASON_WEEKS * WEEK_MS;

// the week a time's in (0 from CALENDAR_START), and when it starts
export function weekOf(now: number) {
    return Math.floor((now - CALENDAR_START) / WEEK_MS);
}
export function weekStart(week: number) {
    return CALENDAR_START + week * WEEK_MS;
}

//#region what heroes do, counted (guild goals and season points)

// Ids saved (guild goals): add new ones at the end.
export enum Deed { GATHER, CRAFT, FINE, FIGHT, EXPLORE, LEVEL, EVENT, WORK }
export const DEED_NAMES = [
    "Materials gathered", "Things crafted", "Fine or better made", "Fights won",
    "Dungeon runs and places explored", "Skill levels gained", "Event points", "Shifts worked",
];
// a season's points for each
export const DEED_POINTS = [1, 2, 5, 3, 4, 10, 2, 1];

//#endregion

//#region seasons

export const WORLD_SEASON_DAYS = 13;
export const WORLD_SEASON_MS = WORLD_SEASON_DAYS * CYCLE_MS;

export enum SeasonKind { SPRING, SUMMER, AUTUMN, WINTER }

export interface SeasonDef {
    name: string;
    skills: Skill[];        // work at these goes SEASON_PACE quicker
    more: string;           // what else it does, in a few words
    light: number;          // multiplied over the map's light (0xRRGGBB)
    travel: number;         // x travel
}

export const SEASON_PACE = 1.15;

export const SEASONS: SeasonDef[] = [
    { name: "Spring", skills: [Skill.FORAGING, Skill.FISHING, Skill.ALCHEMY], more: "Herbs and fish are plentiful", light: 0xf4fff0, travel: 1 },
    { name: "Summer", skills: [Skill.MINING, Skill.HUNTING, Skill.SCOUTING], more: "Long days, dry roads: travel 5% quicker", light: 0xfffbea, travel: 1.05 },
    { name: "Autumn", skills: [Skill.WOODCUTTING, Skill.COOKING, Skill.FORAGING], more: "Harvest time", light: 0xfff0dc, travel: 1 },
    { name: "Winter", skills: [Skill.SMITHING, Skill.TAILORING, Skill.JEWELCRAFTING], more: "Snow: travel 10% slower; crafting by the fire", light: 0xe8f0ff, travel: 0.9 },
];

// the world's season at `now`: k its kind, day the day of it (1 its first),
// s and e when it starts and ends (ms)
export interface WorldSeason { k: SeasonKind; day: number; s: number; e: number; }

export function worldSeasonAt(now: number): WorldSeason {
    const t = clockTime(now), n = Math.floor((t - CALENDAR_START) / WORLD_SEASON_MS), from = CALENDAR_START + n * WORLD_SEASON_MS;
    const s = from - (t - now);
    return { k: ((n + SeasonKind.AUTUMN) % 4 + 4) % 4, day: Math.floor((t - from) / CYCLE_MS) + 1, s, e: s + WORLD_SEASON_MS };
}

// a season (its board's): n its number (0 the first), k the kind of scene
// its backdrop is (not the world's season), s and e when it starts and ends (ms)
export interface Season { n: number; k: SeasonKind; s: number; e: number; }

export function seasonOf(n: number): Season {
    const s = CALENDAR_START + n * SEASON_MS;
    return { n, k: ((n + SeasonKind.AUTUMN) % 4 + 4) % 4, s, e: s + SEASON_MS };
}

export function seasonAt(now: number): Season {
    return seasonOf(Math.floor((now - CALENDAR_START) / SEASON_MS));
}

// a season's name ("Season 1", the first)
export function seasonName(n: number) {
    return `Season ${n + 1}`;
}

// x how quick work at a skill is in a season
export function seasonPace(k: SeasonKind, skill: number) {
    return SEASONS[k]?.skills.includes(skill) ? SEASON_PACE : 1;
}

//#endregion

//#region its rewards

// As a season ends: its top SEASON_TITLED players a title, everyone with
// SEASON_TAKE_PART points or more its background (for a hero's status
// window, in place of the land they're in); the top SEASON_GUILDS guilds'
// members (by their members' points together) a guild title.
export const SEASON_TITLED = 10;
export const SEASON_TAKE_PART = 300;
export const SEASON_GUILDS = 3;
export const SEASON_TOP = 100;              // rows of the season's board sent

export function seasonTitle(n: number, rank: number) {
    const name = seasonName(n);
    return rank == 1 ? `${name} Champion` : rank <= 3 ? `${name} Hero` : `${name} Notable`;
}
export function guildTitle(n: number) {
    return `${seasonName(n)} Guild Champion`;
}

// A status background: a season's kind's scene, earned in a season (so each
// is kept apart: "Season 1"). Saved as its season's number.
export function backgroundName(n: number) {
    return `${seasonName(n)} background`;
}

//#endregion

// a player's season as sent (S2C.SEASON): n the season now, p their points
// in it, r where they stand (0: not on it yet), t their titles (earned in
// seasons gone), h the one shown by their name (its place in t; -1 none), b
// the backdrops they've earned (shared/Scenes.ts places); m the last season
// over and its champions' names, first to third (their monuments on the map:
// client/src/components/map/MapLandmarks.ts; none yet: missing)
export interface SeasonState { n: number; p: number; r: number; t: string[]; h: number; b: number[]; m?: [number, string[]]; }

export const TITLE_LONGEST = 48;
