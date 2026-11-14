import { eventTitle, EventKind, WorldEvent } from "./Events";

// Towns growing for good (the user, 2026-11-03, from a player's feedback: "the
// town only grows when players contribute"; picked: towns stay as they are, with
// levels on top, "make sure theres lot of room for years to come"). A town
// event won there (a rebuild, an upgrade, a festival, a march stopped) gives the
// town WIN_POINTS; it never loses any. No top level: each takes one win more than
// the last (level 5: 10 wins, 10: 45, 20: 190, 50: 1,225), and every level makes
// crafting there quicker and work done there worth more XP. Points, not wins, so
// other ways of helping can come to give a share of one. The numbers are Claude's
// proposal, open to change: new stage names and what a level unlocks go on the end.

export const WIN_POINTS = 10;
export const POINTS_A_LEVEL = 10;       // going from level L to L + 1 takes L x this
export const TOWN_A_LEVEL = 0.005;      // crafting speed and XP there, a level over the first

// [the level it starts at, its name]; the last goes on for good
export const TOWN_STAGES: [number, string][] = [
    [1, "Humble"], [3, "Growing"], [5, "Busy"], [10, "Thriving"], [15, "Prosperous"], [20, "Renowned"],
    [30, "Grand"], [40, "Illustrious"], [50, "Fabled"], [75, "Legendary"], [100, "Eternal"],
];

// a town as sent and saved: [place id, points, what's been built there [what, how many times]]
export type TownRow = [number, number, [string, number][]];

// the points a town has when it reaches a level
export function townLevelPoints(level: number) {
    return POINTS_A_LEVEL * level * (level - 1) / 2;
}

export function townLevel(points: number) {
    let level = Math.max(1, Math.floor((1 + Math.sqrt(1 + 8 * Math.max(0, points) / POINTS_A_LEVEL)) / 2));
    while (townLevelPoints(level + 1) <= points) level++;       // (past any rounding either way)
    while (level > 1 && townLevelPoints(level) > points) level--;
    return level;
}

// how far into its level (0-1)
export function townPart(points: number) {
    const level = townLevel(points), from = townLevelPoints(level);
    return (points - from) / (townLevelPoints(level + 1) - from);
}

// x crafting speed and XP there
export function townRate(points: number) {
    return 1 + TOWN_A_LEVEL * (townLevel(points) - 1);
}

export function townStage(level: number) {
    let name = TOWN_STAGES[0][1];
    for (const [from, stage] of TOWN_STAGES) if (level >= from) name = stage;
    return name;
}

// whether winning a kind of event grows the town it's at (a march's: the one it was making for)
export function growsTown(kind: EventKind) {
    return kind == EventKind.REBUILD || kind == EventKind.UPGRADE || kind == EventKind.FESTIVAL || kind == EventKind.MARCH;
}

// what a won event leaves standing, in a few words (none: nothing to show, as a festival)
export function builtBy(e: Pick<WorldEvent, "k" | "n">) {
    if (e.k != EventKind.REBUILD && e.k != EventKind.UPGRADE) return "";
    return eventTitle(e as WorldEvent).replace(/^The /, "");
}
