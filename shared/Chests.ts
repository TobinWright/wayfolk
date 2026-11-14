import { HeroData } from "./Heroes";
import { MATERIALS } from "./Locations";
import { gatherLevel, gatherSkill, itemName } from "./Tasks";

// Loot chests (the user, 2026-11-05: "loot chests that pop up once in a
// while"): now and then, while you're signed in with a hero, a chest turns up
// on the screen for a while; clicked, it opens, and what was in it goes into
// the stash. It doesn't wait: gone after STAYS_MS if not opened. Kept small, a
// treat and not a way to play: a little gold and some materials your heroes
// can gather already (a golden one also has one from a tier deeper).
// The server picks when and rolls what's in it (server ChestManager); the
// client only shows it (components/lootchest).

export enum ChestTier { WOODEN, SILVER, GOLDEN }
export const CHEST_NAMES = ["Wooden Chest", "Silver Chest", "Golden Chest"];

export const CHEST_EVERY_MS: [number, number] = [12 * 60000, 20 * 60000];   // between one and the next, signed in (at random in it)
export const CHEST_FIRST_MS = 20000;        // after the first job's given (the first steps): the first chest, a silver one
export const CHEST_STAYS_MS = 90000;        // up, waiting to be clicked

// how likely each tier is (adding to 1)
export const CHEST_ODDS = [0.7, 0.25, 0.05];

// by tier: gold [least, most]; stacks of materials; how many in each [least, most]
export const CHEST_GOLD: [number, number][] = [[5, 15], [20, 40], [60, 100]];
export const CHEST_STACKS = [1, 2, 3];
export const CHEST_AMOUNT: [number, number][] = [[3, 6], [4, 8], [6, 12]];
export const CHEST_DEEPER = 10;             // a golden chest's last stack: from this many skill levels past theirs

// (x: 1 a mimic's, beaten; d: a daily chest's streak day)
export interface ChestLoot { t: ChestTier; g: number; m: [number, number][]; x?: number; d?: number; }

// Mimics (the user, 2026-11-05): now and then a chest that's up isn't one.
// Clicked, it bites: it's beaten by clicking it MIMIC_HITS times in MIMIC_MS
// (no quicker than MIMIC_LEAST_MS, the server checks), and holds a golden
// chest's loot; not beaten in time, it gets away with nothing.
export const MIMIC_ODDS = 0.06;
export const MIMIC_HITS = 8;
export const MIMIC_MS = 8000;
export const MIMIC_LEAST_MS = 800;

// A daily chest (the user, 2026-11-05): the first time you sign in each day
// (UTC), a chest for coming back, better the more days in a row: wooden,
// silver from the 3rd day, golden from the 7th. It waits DAILY_STAYS_MS, and
// comes again later that day if it wasn't opened.
export const DAILY_STAYS_MS = 5 * 60000;
export const DAILY_AGAIN_MS = 60000;        // (missed: up again this long after)
export function dailyTier(streak: number): ChestTier {
    return streak >= 7 ? ChestTier.GOLDEN : streak >= 3 ? ChestTier.SILVER : ChestTier.WOODEN;
}
// the day (UTC) a time's in, as a number
export function dayOf(ms: number) {
    return Math.floor(ms / 86400000);
}
// the streak a daily chest opened on `today` makes, from the last day one was (0: never) and the streak then
export function nextStreak(today: number, last: number, streak: number) {
    return last == today ? streak : last == today - 1 ? streak + 1 : 1;
}

// Bounties (the user, 2026-11-05): now and then, while one of your heroes is
// gathering, a short goal - "Gather 12 Tin Ore in 10 minutes" - of what
// they're at, sized to what they'd gather in that time; done, a silver chest.
export const BOUNTY_EVERY_MS: [number, number] = [20 * 60000, 35 * 60000];
export const BOUNTY_MS = 10 * 60000;
export const BOUNTY_SHARE = 0.75;           // of what they'd gather in BOUNTY_MS at their pace
export const BOUNTY_LEAST = 3;
// (m: material, n: how many, d: done so far, e: ms left; w: 1 done)
export interface Bounty { m: number; n: number; d: number; e: number; w?: number; }

// a tier, from a roll (0-1)
export function chestTier(roll: number): ChestTier {
    let sum = 0;
    for (let t = 0; t < CHEST_ODDS.length; t++) if (roll < (sum += CHEST_ODDS[t])) return t;
    return ChestTier.WOODEN;
}

// the materials a player's heroes could gather now (`over`: that many skill levels past them):
// each, its gathering level within the best of their heroes' in its skill
export function chestMaterials(heroes: HeroData[], over = 0): number[] {
    return MATERIALS.filter((m) => {
        const skill = gatherSkill(m.id), best = Math.max(1, ...heroes.map((h) => h.k[skill] ?? 1));
        return gatherLevel(m.id) <= best + over;
    }).map((m) => m.id);
}

// what's in a chest of a tier, `random` a roll each time it's called (0-1)
export function rollChest(t: ChestTier, heroes: HeroData[], random: () => number = Math.random): ChestLoot {
    const between = ([a, b]: [number, number]) => a + Math.floor(random() * (b - a + 1));
    const pick = (from: number[]) => from[Math.floor(random() * from.length)];
    const g = between(CHEST_GOLD[t]), m: [number, number][] = [];
    const can = chestMaterials(heroes), deeper = chestMaterials(heroes, CHEST_DEEPER).filter((id) => !can.includes(id));
    for (let i = 0; i < CHEST_STACKS[t]; i++) {
        const last = t == ChestTier.GOLDEN && i == CHEST_STACKS[t] - 1 && deeper.length;
        const from = (last ? deeper : can).filter((id) => !m.some(([had]) => had == id));
        if (!from.length) break;
        m.push([pick(from), between(CHEST_AMOUNT[t])]);
    }
    return { t, g, m };
}

// "+12 gold, 4 Copper Ore, 6 Flax"
export function lootText(loot: ChestLoot) {
    return [`+${loot.g} gold`, ...loot.m.map(([id, n]) => `${n} ${itemName(id)}`)].join(", ");
}
