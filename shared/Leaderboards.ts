import { SKILL_NAMES } from "./Heroes";

// Leaderboards (DESIGN.md "Leaderboards"; the boards and numbers are
// Claude's proposal, open to change). The server works every board out again
// every REBUILD_MS from everyone's heroes, gold, event points and blackjack
// (those loaded as they are now, the rest as saved) and keeps them; asked for
// one, it sends its top BOARD_TOP and where the one asking stands on it.
// Hero boards rank heroes (a player's best one is where they stand), the rest
// rank players (shown by their best hero, for the podium).

export enum Board { LEVEL, WEALTH, EVENTS, BLACKJACK, SEASON }
export const SKILL_BOARD = 100;             // SKILL_BOARD + Skill: the heroes best at a skill

export const BOARD_TOP = 100;               // rows sent of a board
export const REBUILD_MS = 5 * 60 * 1000;

// every board, in the order they're shown
export const BOARDS: number[] = [Board.LEVEL, ...SKILL_NAMES.map((_, k) => SKILL_BOARD + k), Board.WEALTH, Board.EVENTS, Board.BLACKJACK, Board.SEASON];

export function isBoard(b: number) {
    return BOARDS.includes(b);
}

// a board of heroes (or of players)
export function isHeroBoard(b: number) {
    return b == Board.LEVEL || b >= SKILL_BOARD;
}

export function boardSkill(b: number) {
    return b >= SKILL_BOARD ? b - SKILL_BOARD : -1;
}

export function boardName(b: number) {
    if (b >= SKILL_BOARD) return SKILL_NAMES[b - SKILL_BOARD] ?? "";
    return ["Heroes", "Wealth", "Events", "Blackjack", "Season"][b] ?? "";
}

// a row: its rank (those level share one), the player, the hero (a hero
// board's own, or a player board's player's best), what it's ranked by and
// what's shown with it
export interface BoardRow {
    r: number;              // rank, from 1
    i: number;              // player id
    n: string;              // player's name
    h?: string;             // the hero's name (hero boards)
    j?: number;             // their Job (hero boards)
    l?: number[];           // the hero's looks (none: a player with no heroes)
    v: number;              // what it's ranked by: total XP (LEVEL: after total level), a skill's XP, gold, event points, blackjack's net, this season's points
    x: number;              // shown with it: total level (LEVEL: ranked by first), the skill's level, -, events taken part in, hands played
    s?: number;             // 1 a Supporter now (the EVENTS board: their tag, a Premium perk)
}

export interface BoardView {
    b: number;
    l: BoardRow[];          // the top BOARD_TOP
    m: BoardRow | null;     // the one asking (a hero board: their best hero), if they're on it
    c: number;              // how many are on it
    t: number;              // when it was worked out (ms)
}
