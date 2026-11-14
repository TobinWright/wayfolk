import { EXTENDED, HeroData, heroStats, heroXp, isSpecialty, JOBS, levelAt, Skill, SKILL_MAX, SKILL_NAMES, specialtyXp, Stat, STAT_SHORT, traitMul, traitWork } from "./Heroes";
import { danger, materialOf } from "./Locations";
import type { Pending } from "./Choices";

// A hero's to-do list (the user, 2026-10-28): up to TODO_MOST things to do,
// carried out in order - travel somewhere, gather a material, craft
// something, work for gold, rest - and when the list runs out, their backup
// task. The server carries them out (HeroTasks), the client plans them
// (TaskPlanner). The numbers here are Claude's proposal, open to change.
// Exploring a dungeon (going down as deep as they can handle, for finds,
// gold and Fighting and Scouting XP) and adventuring (wandering from place
// to place nearby, looking about each) came with the Misc tab (the user,
// 2026-10-28: rest, earn gold, explore a nearby dungeon, adventure...).
// Earning gold and exploring are given with no place (the user, 2026-10-28):
// the server picks the nearest town or dungeon as each starts.
//
// Ids are saved (in heroes' state and inventories): never renumber a
// TaskKind or reuse an item id; add new ones at the end.

export enum TaskKind { TRAVEL, GATHER, CRAFT, WORK, EVENT, REST, EXPLORE, ADVENTURE }
export const TASK_NAMES = ["Travel", "Gather", "Craft", "Work", "Events", "Rest", "Explore", "Adventure"];

// p: the place (its id), m: the material or recipe (an event: its id,
// shared/Events.ts; no amount, kept at till it's over), n: how many (gathered,
// crafted, shifts worked, minutes rested, runs through a dungeon or places
// adventured to; 0 for ever - a backup task's); a craft put on with what it
// takes (client Plan; the user, 2026-10-28): g, its group, on the craft, and
// f, the group it's for, on each task put on first to get what it takes
export interface Task { k: TaskKind; p?: number; m?: number; n?: number; g?: number; f?: number; }

// Events with none named (the Misc tab; the user, 2026-11-03: "add Events as a task
// to misc"): the nearest on as it starts, kept at till it's over. On the list, then
// the next thing on it (none on: passed over); a backup task, the next event, resting
// while there's none. What's under way (HeroState.w) has the one picked
export function anyEvent(task: Task) {
    return task?.k == TaskKind.EVENT && task.m == null;
}

// (a Supporter's twice as long: the user, 2026-10-28, a Premium perk, "todo
// list increase from 10 to 20"; it was 25 for everyone. A list already
// longer stays till it's next changed, then it's cut to fit)
export const TODO_MOST = 10;
export const TODO_PREMIUM = 20;

export function todoMost(premium: boolean) {
    return premium ? TODO_PREMIUM : TODO_MOST;
}

// what a hero falls back on when their list runs out: their backup task, any
// task (the user, 2026-10-28), done over and over (Travel: there, then resting);
// with none, resting

// a hero's state, as saved and sent
export interface HeroState {
    p: number;              // the node they're at (or last left, on the way to r[0])
    r: number[];            // the way ahead, nodes
    l: number;              // map px along the leg to r[0]
    q: Task[];              // the list, the first under way
    b?: Task;               // their backup task (no amount; none: resting)
    w?: Task;               // what they're doing now (q[0], else the backup task)
    d: number;              // how many of it done
    u: number;              // ms into the one under way
    a?: number;             // adventuring: the place they're off to next
    x?: string;             // why the last thing was dropped
    h?: number;             // how hurt they are, 0-1 of their health gone (none: not at all; shared/Fights.ts)
    o?: number;             // resting where they are till they've healed (beaten, or too hurt to go down a dungeon): how hurt they were as it started (0-1; the bar of how far it's got)
    e?: number;             // a dungeon run under way: the level it goes down to, as deep as their party reached as it started (shared/Parties.ts)
    g?: number;             // in a formed party (shared/Parties.ts): its id; p to e then are the party's (its list), their own q and b waiting till they're out of it
    c?: Pending;            // a moment on the road waiting on your answer (shared/Choices.ts)
    y?: number;             // ms still held up by a moment's outcome before getting on with it
    v?: number;             // and how long that hold-up was all told (ms; the bar of how far it's got)
    z?: number;             // hurt and with a healer (shared/Fights.ts tendMul): x how quickly they heal
    m?: number;             // the meal they last ate (their Food slot's: MEAL_MS)
    n?: number;             // and ms of working it still has in it (none: not fed)
    t: number;              // when this was worked out to (ms)
}

export function newState(at: number): HeroState {
    return { p: at, r: [], l: 0, q: [], d: 0, u: 0, t: Date.now() };
}

// how many to a task, and what to start at
export const AMOUNTS: { [kind: number]: { least: number, most: number, first: number } } = {
    [TaskKind.GATHER]: { least: 1, most: 100, first: 10 },
    [TaskKind.CRAFT]: { least: 1, most: 100, first: 1 },
    [TaskKind.WORK]: { least: 1, most: 50, first: 5 },
    [TaskKind.REST]: { least: 1, most: 60, first: 10 },
    [TaskKind.EXPLORE]: { least: 1, most: 50, first: 5 },
    [TaskKind.ADVENTURE]: { least: 1, most: 20, first: 5 },
};

//#region how well a hero works (DESIGN.md: base x skill x stat x job)

// the stat each skill leans on
export const SKILL_STAT = [
    Stat.STR, Stat.STR, Stat.AGI, Stat.AGI, Stat.AGI,       // mining, woodcutting, foraging, fishing, hunting
    Stat.STR, Stat.INT, Stat.INT, Stat.INT, Stat.INT,       // smithing, woodworking, alchemy, cooking, tailoring
    Stat.STR, Stat.AGI,                                     // fighting, scouting
    Stat.AGI,                                               // jewelcrafting
];

// how quick they are at a skill: x1 for a new hero, x2.5 at level 50, and
// their traits' (Hard Worker, Green Thumb...); the time of day and the
// weather go on top as it's done (shared/Conditions.ts)
export function workRate(h: HeroData, skill: Skill) {
    const level = 1 + 0.03 * (h.k[skill] - 1);
    const stat = 1 + 0.02 * (wornStats(h)[SKILL_STAT[skill]] - 10);
    const job = JOBS[h.j]?.skills.includes(skill) ? 1.1 : 1;
    return level * stat * job * traitWork(h, skill);
}

// how many times slower the tasks go than first tuned, a shift, a dungeon run
// and a place adventured to paying that much more (XP's by the time, so it
// keeps up); the user, 2026-10-29: "slow things way down, its an idle game"
export const PACE = 5;

// gathering and crafting have their own times (the user, 2026-10-31: gathering
// took too long; crafting 1:30-2:00 for materials, 3-4 minutes for gear)
export const GATHER_MS = 60000;             // one of a material, at x1
// a lucky gather (the user, 2026-11-05): one in LUCKY_ODDS of a material gathered brings LUCKY_MORE more with it
export const LUCKY_ODDS = 40, LUCKY_MORE = 2;
export const MATERIAL_CRAFT_MS = 105000;    // a bar, plank, leather... made
export const GEAR_CRAFT_MS = 210000;        // a weapon, armour, a tool or jewellery made
export function craftBaseMs(recipeId: number) {
    return recipeOf(recipeId)?.type == "material" ? MATERIAL_CRAFT_MS : GEAR_CRAFT_MS;
}
export const SHIFT_MS = 120000 * PACE;      // a shift's work
export const SHIFT_GOLD = 2;        // gold a shift at the first pace, more by their best skill

// the skill a material's gathered with: fish Fishing, herbs and crops
// Foraging, the rest by the first kind of place it's found at
export function gatherSkill(materialId: number) {
    const m = materialOf(materialId), at = m?.at[0];
    if (m?.type == "fish") return Skill.FISHING;
    if (m?.type == "plant") return Skill.FORAGING;
    if (["camp", "bigtree"].includes(at)) return Skill.WOODCUTTING;
    if (at == "lair") return Skill.HUNTING;
    if (["farm", "oasis", "altar", "darktower"].includes(at)) return Skill.FORAGING;
    return Skill.MINING;
}

// (and by the tool they have for it, against the work's tier: DESIGN.md "Equipment")
export function gatherMs(h: HeroData, materialId: number) {
    const skill = gatherSkill(materialId);
    return GATHER_MS / workRate(h, skill) / toolRate(toolTier(h, skill), workTier(materialId), toolQuality(h, skill));
}

export function craftMs(h: HeroData, recipeId: number) {
    const skill = recipeOf(recipeId).skill;
    return craftBaseMs(recipeId) / workRate(h, skill) / toolRate(toolTier(h, skill), workTier(recipeId), toolQuality(h, skill));
}

// gold for a shift: 2, one more for every 10 levels of their best skill, times PACE (and their traits': Haggler, Greedy...)
export function shiftGold(h: HeroData) {
    return Math.round((SHIFT_GOLD + Math.floor((Math.max(...h.k) - 1) / 10)) * PACE * traitMul(h, "gold"));
}

// Exploring a dungeon (a DUNGEON_KINDS place): a run down to the deepest
// level they can handle there (deepestLevel) and back, quicker by Scouting;
// each brings back PACE of the materials found down to that level (if any),
// and 1-2 gold a level PACE times over (exploreGold: one lot of it).
export const EXPLORE_MS = 240000 * PACE;
export function exploreMs(h: HeroData) {
    return EXPLORE_MS / workRate(h, Skill.SCOUTING);
}
export function exploreGold(level: number, roll: number) {
    return level + Math.floor(roll * (level + 1));
}

// Adventuring: off to a place picked at random within ADVENTURE_RANGE of
// where they are, looking about it (quicker by Scouting), then the next;
// each place 1-3 gold and a 1 in 3 chance of something found there, PACE times over.
export const LOOK_MS = 120000 * PACE;
export const ADVENTURE_RANGE = 40 * 16;     // map px (40 miles)
export const ADVENTURE_FIND = 1 / 3;
export function lookMs(h: HeroData) {
    return LOOK_MS / workRate(h, Skill.SCOUTING);
}

//#endregion

//#region skill XP (Claude's proposal, 2026-10-28; the curve is in Heroes.ts)

// XP for one gathered or made: half a point a second it takes at x1 (20 a
// material, 30 a craft) whatever their speed, so the quicker they get the
// quicker they learn. 25% more at their job's skills, 50% more at their
// specialties (SPECIALTY_XP; Prodigy twice), and their traits' (Fast Learner
// 20% more, Greedy 20% less; by `night`, done at night or not: Moon-Touched,
// Sun-Blessed - none given, neither counts). `skill` is a skill id (an extended one's EXT + its place: shared/Heroes). A run through a dungeon teaches Fighting and Scouting,
// half its time's worth each (60 each); looking about a place on an
// adventure, Scouting. Work (odd jobs) and resting teach nothing.
export const XP_A_SECOND = 0.5;
export function unitXp(h: HeroData, skill: number, baseMs: number, night?: boolean) {
    let xp = XP_A_SECOND * baseMs / 1000;
    if (JOBS[h.j]?.skills.includes(skill)) xp *= 1.25;
    if (isSpecialty(h, skill)) xp *= specialtyXp(h);
    xp *= traitMul(h, "xp");
    if (night != null) xp *= traitMul(h, night ? "nightXp" : "dayXp");
    return Math.round(xp);
}

// the skills one of a task trains, each with the time at x1 it's worth
export function taskXp(task: Task): [Skill, number][] {
    switch (task?.k) {
        case TaskKind.GATHER: return [[gatherSkill(task.m), GATHER_MS]];
        case TaskKind.CRAFT: return [[recipeOf(task.m).skill, craftBaseMs(task.m)]];
        case TaskKind.EXPLORE: return [[Skill.FIGHTING, EXPLORE_MS / 2], [Skill.SCOUTING, EXPLORE_MS / 2]];
        case TaskKind.ADVENTURE: return [[Skill.SCOUTING, LOOK_MS]];
    }
    return [];
}

//#region extended skills from work (the user, 2026-10-29: "learning in the wild")

// Work at a core skill now and then teaches a related extended skill, and
// trains the related ones a hero already knows (EXT_XP_SHARE of what the
// core skill got, each). Dungeon runs and adventures lead to a few more of
// their own. By name, checked as this loads (a typo throws).
const EXT_BY_SKILL: string[][] = [
    /* Mining */        ["Stonemasonry", "Demolition", "Appraising"],
    /* Woodcutting */   ["Camping", "Survival"],
    /* Foraging */      ["Farming", "Survival", "First Aid"],
    /* Fishing */       ["Swimming", "Seamanship", "Navigation"],
    /* Hunting */       ["Tracking", "Trapping", "Taming", "Anatomy"],
    /* Smithing */      ["Engineering", "Appraising"],
    /* Woodworking */   ["Engineering", "Sculpting"],
    /* Alchemy */       ["Research", "Enchanting", "Healing Magic"],
    /* Cooking */       ["Brewing", "Bartering"],
    /* Tailoring */     ["Weaving", "Leatherworking", "Cobbling"],
    /* Fighting */      ["Boxing", "Fencing", "Disarm", "First Aid"],
    /* Scouting */      ["Cartography", "Stealth", "Detection", "Camouflage"],
    /* Jewelcrafting */ ["Appraising", "Artistry", "Enchanting"],
];
const EXT_BY_KIND: { [kind: number]: string[] } = {
    [TaskKind.EXPLORE]: ["Disarm Trap", "Escape", "Detection"],
    [TaskKind.ADVENTURE]: ["Camping", "Survival", "Navigation", "Folklore"],
};
function extIndex(name: string) {
    const e = EXTENDED.indexOf(name);
    if (e < 0) throw new Error(`No extended skill "${name}"`);
    return e;
}
const EXT_SKILL_IDS = EXT_BY_SKILL.map((names) => names.map(extIndex));
const EXT_KIND_IDS: { [kind: number]: number[] } = {};
for (const k in EXT_BY_KIND) EXT_KIND_IDS[k] = EXT_BY_KIND[k].map(extIndex);

// each known related skill gets this share of a unit's XP
export const EXT_XP_SHARE = 0.3;
// a new one picked up about once in this much related work at x1 (real time:
// a unit's chance is its time at x1 over this)
export const EXT_LEARN_MS = 4 * 60 * 60 * 1000;

// the extended skills (places in EXTENDED) a unit of work leads to, each with
// the time at x1 it's worth: `work` the core skills it trained (as taskXp)
export function extFromWork(work: [Skill, number][], kind?: TaskKind): [number, number][] {
    const got = new Map<number, number>();
    const add = (e: number, ms: number) => got.set(e, Math.max(got.get(e) ?? 0, ms));     // (led to twice: the more of the two)
    let all = 0;
    for (const [skill, ms] of work) {
        all += ms;
        for (const e of EXT_SKILL_IDS[skill] ?? []) add(e, ms);
    }
    for (const e of EXT_KIND_IDS[kind] ?? []) add(e, all);
    return Array.from(got);
}

//#endregion

// the (first) skill a task trains and its time at x1 (null: none)
export function taskSkill(task: Task): [Skill, number] {
    return taskXp(task)[0] ?? null;
}

// XP into a skill; the new level if it went up (else 0)
export function gainXp(h: HeroData, skill: Skill, xp: number) {
    const v = heroXp(h), was = h.k[skill];
    v[skill] += xp;
    h.k[skill] = Math.max(was, Math.min(SKILL_MAX, levelAt(v[skill])));
    return h.k[skill] > was ? h.k[skill] : 0;
}

//#endregion

//#region crafting: things made from materials, in a town's workshop

// what sort of thing it is (the to-do list's Craft tab sorts by it): a material
// worked up for making things from, a weapon of some kind, a piece of armour or
// jewellery, a potion, or a tool (one for each gathering and crafting skill)
export type CraftType = "material" | "sword" | "axe" | "mace" | "spear" | "dagger" | "bow" | "staff"
    | "shield" | "helm" | "body" | "gloves" | "feet" | "amulet" | "ring" | "potion" | "food"
    | "pickaxe" | "hatchet" | "sickle" | "rod" | "knife"                 // mining, woodcutting, foraging, fishing, hunting
    | "hammer" | "saw" | "mortar" | "pan" | "needle" | "loupe";          // smithing, woodworking, alchemy, cooking, tailoring, jewelcrafting
// weapons that take both hands: worn, they take the shield's slot as well
export const TWO_HANDED: CraftType[] = ["spear", "bow", "staff"];
// (stat: jewellery's)
export interface RecipeDef { id: number; name: string; type: CraftType; skill: Skill; needs: [number, number][]; stat?: Stat; }
const WORKED: RecipeDef[] = [
    { id: 101, name: "Bronze Bar", type: "material", skill: Skill.SMITHING, needs: [[1, 1], [2, 1]] },
    { id: 102, name: "Iron Bar", type: "material", skill: Skill.SMITHING, needs: [[3, 2], [4, 1]] },
    { id: 103, name: "Silver Bar", type: "material", skill: Skill.SMITHING, needs: [[5, 2], [4, 1]] },
    { id: 104, name: "Gold Bar", type: "material", skill: Skill.SMITHING, needs: [[6, 2], [4, 1]] },
    { id: 105, name: "Mithril Bar", type: "material", skill: Skill.SMITHING, needs: [[7, 2], [4, 2]] },
    { id: 106, name: "Pine Plank", type: "material", skill: Skill.WOODWORKING, needs: [[16, 2]] },
    { id: 107, name: "Oak Plank", type: "material", skill: Skill.WOODWORKING, needs: [[17, 2]] },
    { id: 108, name: "Maple Plank", type: "material", skill: Skill.WOODWORKING, needs: [[18, 2]] },
    { id: 109, name: "Stone Block", type: "material", skill: Skill.WOODWORKING, needs: [[9, 3]] },
    { id: 110, name: "Leather", type: "material", skill: Skill.TAILORING, needs: [[24, 2]] },
    { id: 111, name: "Linen", type: "material", skill: Skill.TAILORING, needs: [[45, 3]] },
    { id: 112, name: "Wool Cloth", type: "material", skill: Skill.TAILORING, needs: [[46, 3]] },
    { id: 113, name: "Silk Cloth", type: "material", skill: Skill.TAILORING, needs: [[47, 3]] },
    { id: 114, name: "Firepowder", type: "potion", skill: Skill.ALCHEMY, needs: [[29, 2], [10, 1]] },
    { id: 115, name: "Lotus Tonic", type: "potion", skill: Skill.ALCHEMY, needs: [[44, 2]] },
    { id: 116, name: "Bone Charm", type: "amulet", skill: Skill.JEWELCRAFTING, needs: [[39, 2], [37, 1]], stat: Stat.LCK },
    { id: 117, name: "Adamantite Bar", type: "material", skill: Skill.SMITHING, needs: [[8, 2], [4, 2]] },
    { id: 118, name: "Starmetal Bar", type: "material", skill: Skill.SMITHING, needs: [[33, 2], [4, 2]] },
    { id: 119, name: "Dragonsteel Bar", type: "material", skill: Skill.SMITHING, needs: [[118, 1], [27, 2], [32, 1]] },
    { id: 120, name: "Yew Plank", type: "material", skill: Skill.WOODWORKING, needs: [[19, 2]] },
    { id: 121, name: "Ironwood Plank", type: "material", skill: Skill.WOODWORKING, needs: [[20, 2]] },
    { id: 122, name: "Heartwood Plank", type: "material", skill: Skill.WOODWORKING, needs: [[22, 2]] },
    { id: 123, name: "Scaled Leather", type: "material", skill: Skill.TAILORING, needs: [[110, 1], [26, 2]] },
    { id: 124, name: "Shadowweave", type: "material", skill: Skill.TAILORING, needs: [[113, 1], [41, 2]] },
    { id: 125, name: "Dragonhide", type: "material", skill: Skill.TAILORING, needs: [[110, 1], [27, 2]] },
    // potions (the user, 2026-10-30/31; POTIONS below says what each does), and the vial the better ones go in
    { id: 126, name: "Glass Vial", type: "material", skill: Skill.ALCHEMY, needs: [[14, 2], [4, 1]] },
    { id: 127, name: "Minor Healing Potion", type: "potion", skill: Skill.ALCHEMY, needs: [[48, 2]] },
    { id: 128, name: "Healing Potion", type: "potion", skill: Skill.ALCHEMY, needs: [[50, 2]] },
    { id: 129, name: "Greater Healing Potion", type: "potion", skill: Skill.ALCHEMY, needs: [[51, 2], [126, 1]] },
    { id: 130, name: "Superior Healing Potion", type: "potion", skill: Skill.ALCHEMY, needs: [[51, 1], [23, 1], [126, 1]] },
    { id: 131, name: "Supreme Healing Potion", type: "potion", skill: Skill.ALCHEMY, needs: [[52, 2], [126, 1]] },
    { id: 132, name: "Draught of Might", type: "potion", skill: Skill.ALCHEMY, needs: [[49, 2]] },
    { id: 133, name: "Draught of Fury", type: "potion", skill: Skill.ALCHEMY, needs: [[49, 1], [40, 1], [126, 1]] },
    { id: 134, name: "Barkskin Draught", type: "potion", skill: Skill.ALCHEMY, needs: [[21, 2], [48, 1]] },
    { id: 135, name: "Frostward Elixir", type: "potion", skill: Skill.ALCHEMY, needs: [[35, 1], [21, 1], [126, 1]] },
    { id: 136, name: "Elixir of Fortune", type: "potion", skill: Skill.ALCHEMY, needs: [[43, 1], [48, 1], [126, 1]] },
    { id: 137, name: "Elixir of the Ancients", type: "potion", skill: Skill.ALCHEMY, needs: [[38, 1], [51, 1], [126, 1]] },
    { id: 138, name: "Scrap Bomb", type: "potion", skill: Skill.ALCHEMY, needs: [[36, 2], [114, 1]] },
    // meals (the user, 2026-10-31: a Food slot, eaten as they work; MEAL_MS below)
    { id: 139, name: "Bread", type: "food", skill: Skill.COOKING, needs: [[62, 2]] },
    { id: 140, name: "Grilled Sardines", type: "food", skill: Skill.COOKING, needs: [[53, 2]] },
    { id: 141, name: "Venison Stew", type: "food", skill: Skill.COOKING, needs: [[59, 1], [62, 1]] },
    { id: 142, name: "Apple Pie", type: "food", skill: Skill.COOKING, needs: [[63, 2], [62, 1]] },
    { id: 143, name: "Trout Pie", type: "food", skill: Skill.COOKING, needs: [[54, 1], [62, 1]] },
    { id: 144, name: "Golden Carp Soup", type: "food", skill: Skill.COOKING, needs: [[55, 1], [48, 1]] },
    { id: 145, name: "Boar Roast", type: "food", skill: Skill.COOKING, needs: [[60, 2]] },
    { id: 146, name: "Honey Cake", type: "food", skill: Skill.COOKING, needs: [[64, 1], [62, 1], [63, 1]] },
    { id: 147, name: "Salmon Fillet", type: "food", skill: Skill.COOKING, needs: [[56, 1], [48, 1]] },
    { id: 148, name: "Sap-Glazed Swordfish", type: "food", skill: Skill.COOKING, needs: [[57, 1], [23, 1]] },
    { id: 149, name: "Drake Roast", type: "food", skill: Skill.COOKING, needs: [[61, 1], [64, 1]] },
    { id: 150, name: "Leviathan Feast", type: "food", skill: Skill.COOKING, needs: [[58, 1], [139, 1], [23, 1]] },
];

// What a potion does in a fight (the user, 2026-10-30; the numbers are
// Claude's): carried in a hero's Potion slot, drunk from the stash. A healing
// one (heal: of their health) is drunk once a fight, when they're under
// POTION_AT of it; the rest are used as every fight starts - a draught or
// elixir lifts their attack, defence, speed (each x(1 + it)) or chance to
// strike true (crit, added), Firepowder and a Scrap Bomb are thrown at every
// enemy (fire: that many of their blows each)
export interface PotionDef { heal?: number; attack?: number; defence?: number; speed?: number; crit?: number; fire?: number; }
export const POTIONS: { [id: number]: PotionDef } = {
    114: { fire: 1.2 }, 138: { fire: 2 },
    115: { speed: 0.2 },
    127: { heal: 0.3 }, 128: { heal: 0.4 }, 129: { heal: 0.5 }, 130: { heal: 0.6 }, 131: { heal: 0.75 },
    132: { attack: 0.15 }, 133: { attack: 0.3 },
    134: { defence: 0.15 }, 135: { defence: 0.3 },
    136: { crit: 0.1 },
    137: { attack: 0.2, defence: 0.2 },
};
export const POTION_AT = 0.4;
export function potionOf(id: number): PotionDef {
    return POTIONS[baseItem(id)];
}
// what a potion does, in a few words ("Heals 40% when hurt", "+15% attack")
export function potionText(p: PotionDef) {
    const pc = (n: number) => `${Math.round(n * 100)}%`;
    if (p.heal) return `Heals ${pc(p.heal)} when hurt`;
    if (p.fire) return `Thrown at every enemy (x${p.fire} a blow)`;
    return [p.attack && `+${pc(p.attack)} attack`, p.defence && `+${pc(p.defence)} defence`,
        p.speed && `+${pc(p.speed)} speed`, p.crit && `+${pc(p.crit)} to strike true`].filter((t) => t).join(", ");
}

// A meal (the user, 2026-10-31): carried in a hero's Food slot, eaten from the
// stash as they work - one lasts MEAL_MS, then they eat the next. While fed
// they work faster and heal quicker, more by the meal's tier
export const MEAL_MS = 60 * 60000;
export function mealWork(id: number) {
    return 1 + 0.05 * itemTier(id);
}
export function mealHeal(id: number) {
    return 1 + 0.25 * itemTier(id);
}
export function mealText(id: number) {
    return `+${Math.round((mealWork(id) - 1) * 100)}% work, +${Math.round((mealHeal(id) - 1) * 100)}% healing, an hour each`;
}

// Equipment, in tiers (DESIGN.md "Equipment"; Claude's picks, 2026-10-28):
// every kind of weapon, armour, jewellery and tool is made in each tier of
// its line - bronze to dragonsteel, pine to heartwood, leather to dragonhide.
// A new tier is one more name and material on the end of each line.

// a line's tiers, tier 1 first: each one's name and what it's made of
export interface Line { names: string[]; of: number[]; }
const METAL: Line = { names: ["Bronze", "Iron", "Mithril", "Adamantite", "Starmetal", "Dragonsteel"], of: [101, 102, 105, 117, 118, 119] };
const PRECIOUS: Line = { names: ["Bronze", "Silver", "Gold", "Adamantite", "Starmetal", "Dragonsteel"], of: [101, 103, 104, 117, 118, 119] };
const WOOD: Line = { names: ["Pine", "Oak", "Maple", "Yew", "Ironwood", "Heartwood"], of: [106, 107, 108, 120, 121, 122] };
const CLOTH: Line = { names: ["Leather", "Wool", "Silk", "Scaled", "Shadowweave", "Dragonhide"], of: [110, 112, 113, 123, 124, 125] };

// a kind of thing made in every tier of its line: its name ("#" the tier's),
// how many of the line's material it takes and anything else (a grip, a handle,
// a gem: tier 0, so it doesn't change the tier), and jewellery's stat
// (set: a material more for each tier, null none - jewellery's settings)
export interface Make { type: CraftType; name: string; skill: Skill; line: Line; n: number; more?: [number, number]; stat?: Stat; set?: number[]; }
const GRIP: [number, number] = [110, 1], HAFT: [number, number] = [106, 1];
// (from Silver on, jewellery takes a setting too: Obsidian, Amethyst, Fire Opal, Deep Crystal, Void Shard)
const SETTINGS = [null, 30, 12, 31, 13, 42];
const ring = (name: string, gem: number, stat: Stat): Make => ({ type: "ring", name: `# Ring of ${name}`, skill: Skill.JEWELCRAFTING, line: PRECIOUS, n: 1, more: [gem, 1], stat, set: SETTINGS });
const amulet = (name: string, gem: number, stat: Stat): Make => ({ type: "amulet", name: `# Amulet of ${name}`, skill: Skill.JEWELCRAFTING, line: PRECIOUS, n: 2, more: [gem, 2], stat, set: SETTINGS });
const tool = (type: CraftType, name: string, more: [number, number] = HAFT): Make => ({ type, name: `# ${name}`, skill: Skill.SMITHING, line: METAL, n: 1, more });

// (ids by place: never reorder or take one out; add new ones at the end)
export const MAKES: Make[] = [
    { type: "sword", name: "# Sword", skill: Skill.SMITHING, line: METAL, n: 3, more: GRIP },
    { type: "axe", name: "# Battleaxe", skill: Skill.SMITHING, line: METAL, n: 3, more: HAFT },
    { type: "mace", name: "# Mace", skill: Skill.SMITHING, line: METAL, n: 3, more: GRIP },
    { type: "spear", name: "# Spear", skill: Skill.SMITHING, line: METAL, n: 2, more: [106, 2] },
    { type: "dagger", name: "# Dagger", skill: Skill.SMITHING, line: METAL, n: 2, more: GRIP },
    { type: "bow", name: "# Bow", skill: Skill.WOODWORKING, line: WOOD, n: 3, more: [111, 1] },
    { type: "staff", name: "# Staff", skill: Skill.WOODWORKING, line: WOOD, n: 4 },
    { type: "shield", name: "# Shield", skill: Skill.SMITHING, line: METAL, n: 3, more: GRIP },
    { type: "shield", name: "# Shield", skill: Skill.WOODWORKING, line: WOOD, n: 4 },
    { type: "helm", name: "# Helm", skill: Skill.SMITHING, line: METAL, n: 2 },
    { type: "body", name: "# Chestplate", skill: Skill.SMITHING, line: METAL, n: 5 },
    { type: "gloves", name: "# Gauntlets", skill: Skill.SMITHING, line: METAL, n: 2 },
    { type: "feet", name: "# Sabatons", skill: Skill.SMITHING, line: METAL, n: 2 },
    { type: "helm", name: "# Hood", skill: Skill.TAILORING, line: CLOTH, n: 2 },
    { type: "body", name: "# Tunic", skill: Skill.TAILORING, line: CLOTH, n: 5 },
    { type: "gloves", name: "# Gloves", skill: Skill.TAILORING, line: CLOTH, n: 2 },
    { type: "feet", name: "# Boots", skill: Skill.TAILORING, line: CLOTH, n: 2 },
    ring("Might", 25, Stat.STR), ring("Swiftness", 34, Stat.AGI), ring("Wit", 11, Stat.INT), ring("Vigour", 15, Stat.VIT), ring("Fortune", 28, Stat.LCK),
    amulet("Might", 25, Stat.STR), amulet("Swiftness", 34, Stat.AGI), amulet("Wit", 11, Stat.INT), amulet("Vigour", 15, Stat.VIT), amulet("Fortune", 28, Stat.LCK),
    tool("pickaxe", "Pickaxe"), tool("hatchet", "Hatchet"), tool("sickle", "Sickle"),
    { type: "rod", name: "# Fishing Rod", skill: Skill.WOODWORKING, line: WOOD, n: 2, more: [111, 1] },
    tool("knife", "Hunting Knife", GRIP), tool("hammer", "Hammer"), tool("saw", "Saw"),
    { type: "mortar", name: "# Mortar and Pestle", skill: Skill.WOODWORKING, line: WOOD, n: 2, more: [109, 1] },
    { type: "pan", name: "# Pan", skill: Skill.SMITHING, line: METAL, n: 2 },
    tool("needle", "Needle", null), tool("loupe", "Jeweller's Tools"),
];

// a made thing's id: MAKE_IDS on, a block of MAKE_TIERS for each kind (room for more tiers), tier 1 first
export const MAKE_IDS = 200, MAKE_TIERS = 20;

// what kind of thing an id is and its tier (null: not one of MAKES)
export function makeOf(id: number): [Make, number] {
    id = baseItem(id);
    const k = Math.floor((id - MAKE_IDS) / MAKE_TIERS), tier = (id - MAKE_IDS) % MAKE_TIERS + 1;
    const make = id >= MAKE_IDS ? MAKES[k] : null;
    return make && tier <= make.line.names.length ? [make, tier] : null;
}

export const RECIPES: RecipeDef[] = [...WORKED];
MAKES.forEach((make, k) => make.line.names.forEach((name, i) => RECIPES.push({
    id: MAKE_IDS + MAKE_TIERS * k + i, name: make.name.replace("#", name), type: make.type, skill: make.skill,
    needs: [[make.line.of[i], make.n], make.more, make.set?.[i] ? [make.set[i], 1] : null].filter((n) => n) as [number, number][], stat: make.stat,
})));
const BY_ID = new Map(RECIPES.map((r) => [r.id, r]));

// (a thing of some quality: its plain one's recipe, so its sort, tier and slot are the same)
export function recipeOf(id: number) {
    const q = qualityOf(id);
    if (!q) return BY_ID.get(id);
    const r = BY_ID.get(baseItem(id));
    return r && hasQuality(r) ? r : undefined;
}

//#region quality (the user, 2026-10-30; DESIGN.md "Quality")

// Worn things, jewellery and tools roll a quality as they're made: Normal,
// Fine, Superior or Masterwork, better odds the more the crafter's level is
// over the recipe's (and by their Luck), worth QUALITY_MUL of a Normal one's
// gear power, stat points or tool speed. Each quality is an item of its own,
// its id the Normal one's + QUALITY_STEP a quality, so a stash, the market
// and a trade count them apart with nothing else changed. Normal ones keep
// the ids they had.
export enum Quality { NORMAL, FINE, SUPERIOR, MASTERWORK }
export const QUALITY_NAMES = ["Normal", "Fine", "Superior", "Masterwork"];
export const QUALITY_MUL = [1, 1.1, 1.25, 1.5];
export const QUALITY_STEP = 10000;

export function qualityOf(id: number): Quality {
    const q = Math.floor(id / QUALITY_STEP);
    return q >= 0 && q <= Quality.MASTERWORK ? q : 0;
}
export function baseItem(id: number) {
    return id % QUALITY_STEP;
}
export function withQuality(id: number, q: Quality) {
    return baseItem(id) + q * QUALITY_STEP;
}
// whether a recipe's things roll a quality: those worn or carried (not potions and meals: used up)
export function hasQuality(r: RecipeDef) {
    return !!r && slotsFor(r.type).length > 0 && !SUPPLIES.includes(r.type);
}

// the chance of each quality over Normal [fine, superior, masterwork], by how
// many levels `over` the recipe's the crafter is and their Luck: 15/4/1% at
// its level, rising to 35/15/6% fifty levels over. Luck's share is kept to
// LUCK_MUL_MOST (Luck 40), so together they stay under 90% - a Normal one
// can still come out, and the item window never shows more than 100%
export const LUCK_MUL_MOST = 1.6;
export function qualityOdds(over: number, luck: number): number[] {
    over = Math.max(0, over);
    const l = Math.min(LUCK_MUL_MOST, Math.max(0.5, 1 + 0.02 * (luck - 10)));
    return [
        Math.min(0.35, 0.15 + 0.004 * over) * l,
        Math.min(0.15, 0.04 + 0.0022 * over) * l,
        Math.min(0.06, 0.01 + 0.001 * over) * l,
    ];
}

// the quality one made by this hero comes out (roll 0-1)
export function rollQuality(h: HeroData, recipeId: number, roll: number): Quality {
    const r = recipeOf(recipeId);
    if (!hasQuality(r)) return Quality.NORMAL;
    const [fine, sup, master] = qualityOdds(h.k[r.skill] - craftLevel(recipeId), wornStats(h)[Stat.LCK]);
    if (roll < master) return Quality.MASTERWORK;
    if (roll < master + sup) return Quality.SUPERIOR;
    if (roll < master + sup + fine) return Quality.FINE;
    return Quality.NORMAL;
}

//#endregion

// A material's tier (DESIGN.md "Equipment"): a new one every TIER_LEVELS levels
// down it's found, 0 at levels 1-2, with no end (deeper places, more tiers). A
// made thing's is its deepest material's; worn or used, it counts one more
// (made of tier 0 - bronze, pine, leather - it's tier 1).
export const TIER_LEVELS = 3;
export function workTier(id: number): number {
    const material = materialOf(id);
    if (material) return Math.floor(material.level / TIER_LEVELS);
    return Math.max(0, ...(recipeOf(id)?.needs ?? []).map(([n]) => workTier(n)));
}
export function itemTier(id: number) {
    return workTier(id) + 1;
}

// the skill level a recipe takes: 1, and TIER_SKILL more a tier (keep SKILL_MAX above the top tier's)
export const TIER_SKILL = 10;
export function craftLevel(id: number) {
    return 1 + TIER_SKILL * workTier(id);
}
// and a material's, in the skill it's gathered with (gatherSkill), the same way (the user, 2026-10-28)
export function gatherLevel(id: number) {
    return craftLevel(id);
}

// how much quicker a tool of a tier (0: none) makes work of a tier: x1.25 a
// tier, halved for every tier it's short (bare hands on tier 1 work x0.5)
// (its quality's QUALITY_MUL on what the tier adds)
export function toolRate(tool: number, work: number, q: Quality = Quality.NORMAL) {
    return (1 + 0.25 * tool * QUALITY_MUL[q]) * Math.pow(0.5, Math.max(0, work - tool));
}
export const TOOL_SKILL: { [type: string]: Skill } = {
    pickaxe: Skill.MINING, hatchet: Skill.WOODCUTTING, sickle: Skill.FORAGING, rod: Skill.FISHING, knife: Skill.HUNTING,
    hammer: Skill.SMITHING, saw: Skill.WOODWORKING, mortar: Skill.ALCHEMY, pan: Skill.COOKING, needle: Skill.TAILORING, loupe: Skill.JEWELCRAFTING,
};

// worn gear's power: its share of a full set (out of 10: a weapon 3, two-handed
// 5, body 2, shield 2, helm, hands and feet 1) of half its tier's level's danger
// (a full set +5 at tier 1, +12 at 2, +21 at 3, +30 at 4, +40 at 5, +51 at 6)
export const GEAR_WEIGHT: { [type: string]: number } = {
    sword: 3, axe: 3, mace: 3, dagger: 3, spear: 5, bow: 5, staff: 5, body: 2, shield: 2, helm: 1, gloves: 1, feet: 1,
};
export function gearPower(id: number) {
    const weight = GEAR_WEIGHT[recipeOf(id)?.type];
    return weight ? weight / 10 * danger(itemTier(id)) / 2 * QUALITY_MUL[qualityOf(id)] : 0;
}

// jewellery's stat and how many points: a ring 1 a tier, an amulet 2 (null: not
// jewellery); its quality's on top, rounded, but always a point more than Normal
// for a Superior or Masterwork one
export function jewelBonus(id: number): [Stat, number] {
    const r = recipeOf(id);
    if (r?.stat == null) return null;
    const base = (r.type == "amulet" ? 2 : 1) * itemTier(id), q = qualityOf(id);
    return [r.stat, Math.max(base + (q >= Quality.SUPERIOR ? 1 : 0), Math.round(base * QUALITY_MUL[q]))];
}

// what a made thing's worth, worn or used ("+1.5 attack", "+0.6 defence", "+4 LCK", "x1.25 Mining"; null: nothing):
// a weapon's power goes on its wearer's attack in a fight, the rest's on their defence (shared/Fights.ts)
export function itemWorth(id: number) {
    const power = gearPower(id), jewel = jewelBonus(id), skill = TOOL_SKILL[recipeOf(id)?.type];
    if (power) return `+${Math.round(power * 10) / 10} ${WEAPONS.includes(recipeOf(id).type) ? "attack" : "defence"}`;
    if (jewel) return `+${jewel[1]} ${STAT_SHORT[jewel[0]]}`;
    if (skill != null) return `x${Math.round(toolRate(itemTier(id), 0, qualityOf(id)) * 1000) / 1000} ${SKILL_NAMES[skill]}`;
    if (potionOf(id)) return potionText(potionOf(id));
    if (recipeOf(id)?.type == "food") return mealText(id);
    return null;
}

//#endregion

//#region what a hero wears and carries (DESIGN.md "Equipment")

// one of each thing worn, two rings, a slot for every tool, and the potion
// and meal they use (saved by place in HeroData.g: never reorder, add new
// ones at the end). The Potion and Food slots hold a kind, not one of it:
// what they use comes out of the stash as they use it (SUPPLY_SLOTS)
export enum Slot {
    HELM, BODY, HANDS, FEET, WEAPON, SHIELD, AMULET, RING, RING2,
    PICKAXE, HATCHET, SICKLE, ROD, KNIFE, HAMMER, SAW, MORTAR, PAN, NEEDLE, LOUPE,
    POTION, FOOD,
}
export const SLOTS = 22;
export const SLOT_NAMES = ["Helmet", "Body", "Hands", "Feet", "Weapon", "Shield", "Amulet", "Ring", "Ring",
    "Pickaxe", "Hatchet", "Sickle", "Fishing rod", "Hunting knife", "Hammer", "Saw", "Mortar and pestle", "Pan", "Needle", "Jeweller's tools",
    "Potion", "Food"];
export const SUPPLIES: CraftType[] = ["potion", "food"];
export const SUPPLY_SLOTS: Slot[] = [Slot.POTION, Slot.FOOD];
export const WEAPONS: CraftType[] = ["sword", "axe", "mace", "spear", "dagger", "bow", "staff"];
// the tools, Slot.PICKAXE on
export const TOOLS: CraftType[] = ["pickaxe", "hatchet", "sickle", "rod", "knife", "hammer", "saw", "mortar", "pan", "needle", "loupe"];

// the slots a sort of thing goes in (none: not worn)
export function slotsFor(type: CraftType): Slot[] {
    switch (type) {
        case "helm": return [Slot.HELM];
        case "body": return [Slot.BODY];
        case "gloves": return [Slot.HANDS];
        case "feet": return [Slot.FEET];
        case "shield": return [Slot.SHIELD];
        case "amulet": return [Slot.AMULET];
        case "ring": return [Slot.RING, Slot.RING2];
        case "potion": return [Slot.POTION];
        case "food": return [Slot.FOOD];
    }
    if (WEAPONS.includes(type)) return [Slot.WEAPON];
    const tool = TOOLS.indexOf(type);
    return tool >= 0 ? [Slot.PICKAXE + tool] : [];
}

// what's in a slot (0: nothing)
export function worn(h: HeroData, slot: Slot) {
    return h.g?.[slot] || 0;
}

// their stats with what they wear: their own (heroStats) and their jewellery's
export function wornStats(h: HeroData) {
    const s = heroStats(h);
    for (const slot of [Slot.AMULET, Slot.RING, Slot.RING2]) {
        const bonus = jewelBonus(worn(h, slot));
        if (bonus) s[bonus[0]] += bonus[1];
    }
    return s;
}

// the power their gear adds
export function wornPower(h: HeroData) {
    return (h.g ?? []).reduce((sum, id) => sum + (id ? gearPower(id) : 0), 0);
}

// the tier of the tool they carry for a skill (0: none, or no tool for it)
export function toolTier(h: HeroData, skill: Skill) {
    const tool = TOOLS.findIndex((type) => TOOL_SKILL[type] == skill);
    const id = tool >= 0 ? worn(h, Slot.PICKAXE + tool) : 0;
    return id ? itemTier(id) : 0;
}
// and its quality
export function toolQuality(h: HeroData, skill: Skill): Quality {
    const tool = TOOLS.findIndex((type) => TOOL_SKILL[type] == skill);
    return tool >= 0 ? qualityOf(worn(h, Slot.PICKAXE + tool)) : Quality.NORMAL;
}

// an item's name: a material's or a made thing's ("Fine Bronze Sword")
export function itemName(id: number) {
    const q = qualityOf(id);
    return materialOf(id)?.name ?? (recipeOf(id) ? `${q ? `${QUALITY_NAMES[q]} ` : ""}${recipeOf(id).name}` : "Something");
}

//#endregion

// what a task is, in a few words ("Gather 10 Copper Ore at Emberlet Mines")
export function taskText(task: Task, placeName: (id: number) => string) {
    const n = task.n ? `${task.n} ` : "";
    switch (task.k) {
        case TaskKind.TRAVEL: return `Travel to ${placeName(task.p)}`;
        case TaskKind.GATHER: return `Gather ${n}${itemName(task.m)} at ${placeName(task.p)}`;
        case TaskKind.CRAFT: return `Craft ${n}${itemName(task.m)} in ${placeName(task.p)}`;
        case TaskKind.WORK: {
            const where = task.p == null ? "the nearest town" : placeName(task.p);
            return task.n ? `Work ${task.n} shift${task.n == 1 ? "" : "s"} in ${where}` : `Work in ${where}`;
        }
        case TaskKind.REST: return task.n ? `Rest ${task.n} min` : "Rest";
        case TaskKind.EVENT: return anyEvent(task) ? "Events" : "An event";
        case TaskKind.EXPLORE: {
            const where = task.p == null ? "the nearest dungeon" : placeName(task.p);
            return task.n ? `Explore ${where} ${task.n} time${task.n == 1 ? "" : "s"}` : `Explore ${where}`;
        }
        case TaskKind.ADVENTURE: return task.n ? `Adventure to ${task.n} place${task.n == 1 ? "" : "s"}` : "Adventure";
    }
    return "";
}

// what they're doing now, as it shows by their name ("Gathering Copper Ore 3/10"; at an
// event, its short name and how far it's got: "The Docks Rebuild - 64%")
export function doingText(state: HeroState, placeName: (id: number) => string, event?: (id: number) => { n: string, d: number, g: number } | undefined) {
    const w = state.w;
    if (state.o) return "Recovering from a fight";
    if (state.y) return `Held up on the road (${Math.ceil(state.y / 60000)} min)`;
    if (!w) return "Idle";
    const of = w.n ? ` ${state.d}/${w.n}` : "";
    if (w.k == TaskKind.EVENT) {
        if (state.r.length) return `Going to ${placeName(w.p)} for an event`;
        const e = event?.(w.m);
        return e ? `${e.n} - ${Math.floor(100 * e.d / e.g)}%` :`At an event in ${placeName(w.p)}`;
    }
    if (state.r.length && w.p != null && w.k != TaskKind.TRAVEL) return `Going to ${placeName(w.p)} to ${TASK_NAMES[w.k].toLowerCase()}`;
    if (w.k == TaskKind.ADVENTURE && state.a != null) return `Adventuring: ${state.r.length ? "off to" : "looking about"} ${placeName(state.a)}${of}`;
    switch (w.k) {
        case TaskKind.EXPLORE: return `Exploring ${placeName(w.p)}${of}${state.e ? `, floor ${state.e}` : ""}`;
        case TaskKind.ADVENTURE: return `Adventuring${of}`;
        case TaskKind.TRAVEL: return `Travelling to ${placeName(w.p)}`;
        case TaskKind.GATHER: return `Gathering ${itemName(w.m)}${of}`;
        case TaskKind.CRAFT: return `Crafting ${itemName(w.m)}${of}`;
        case TaskKind.WORK: return `Working in ${placeName(w.p)}${of}`;
        case TaskKind.REST: return w.n ? `Resting ${Math.floor(state.u / 60000)}/${w.n} min` : "Resting";
    }
    return "Idle";
}
