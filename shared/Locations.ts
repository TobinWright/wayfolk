import { HeroData, JOBS, Skill, Stat } from "./Heroes";
import { wornPower, wornStats } from "./Tasks";

// Locations' levels (DESIGN.md "Locations"): every place on the map goes
// down level by level, each more dangerous than the last. A party goes as
// deep as it can handle - the deepest level whose danger its power meets -
// so every place is of use to everyone: a new hero works its first level, a
// strong party its deep ones. Some crafting materials are only found at or
// below a certain level of a place.
//
// Material ids are saved (in inventories): never renumber or reuse one; add
// new ones at the end.

// how many levels each kind of place has (the map's kinds, client/src/art/PlaceArt.ts);
// a kind not here has DEFAULT_LEVELS
export const DEFAULT_LEVELS = 5;
export const LEVELS: { [kind: string]: number } = {
    mine: 15, cave: 12, lair: 15, ruins: 12, darktower: 15, volcano: 15, crater: 12, pyramids: 12, steptemple: 10,
    icecastle: 12, camp: 12, bigtree: 15, altar: 10, stones: 8, temple: 8, tower: 8, oasis: 6, farm: 6,
    pier: 15, bridge: 10, port: 8,
};
export function levelsOf(kind: string) {
    return LEVELS[kind] ?? DEFAULT_LEVELS;
}

// the power a party needs to work a level: 10 at level 1 (one new hero),
// about 40 at 3 (five new heroes reach it), 150 at 8, 250 at 12 (five
// masters reach 11; deeper will take gear)
export const DANGER = 10, DANGER_GROWTH = 1.3;
export function danger(level: number) {
    return DANGER * Math.pow(level, DANGER_GROWTH);
}

// a hero's power in a fight: 10 for a new one, by their Fighting (as any
// skill: 1 + 0.03 a level over 1), their Strength, Agility and Vitality
// (1 + 0.02 a point over or under 10) and their job (x1.1 if it favours Fighting),
// and what their gear adds (DESIGN.md "Equipment")
export function heroPower(h: HeroData) {
    const s = wornStats(h);
    const body = (s[Stat.STR] + s[Stat.AGI] + s[Stat.VIT]) / 3;
    const skill = 1 + 0.03 * (h.k[Skill.FIGHTING] - 1);
    const job = JOBS[h.j]?.skills.includes(Skill.FIGHTING) ? 1.1 : 1;
    return DANGER * skill * (1 + 0.02 * (body - 10)) * job + wornPower(h);
}
export function partyPower(heroes: HeroData[]) {
    return heroes.reduce((sum, h) => sum + heroPower(h), 0);
}

// the deepest level of a kind of place a party can handle (always the first)
export function deepestLevel(kind: string, heroes: HeroData[]) {
    return deepestAt(kind, partyPower(heroes));
}
// (by the power itself: a formed party's, as sent, PartyView w)
export function deepestAt(kind: string, power: number) {
    let level = 1;
    while (level < levelsOf(kind) && danger(level + 1) <= power) level++;
    return level;
}

// Crafting materials: what sort they are (the to-do list's Gather tab sorts by
// it), where they're found (kinds of place) and the least level of it they're found at.
export type MaterialType = "ore" | "stone" | "wood" | "beast" | "plant" | "arcane" | "fish";
export interface MaterialDef { id: number; name: string; type: MaterialType; at: string[]; level: number; }
export const MATERIALS: MaterialDef[] = [
    // ores
    { id: 1, name: "Copper Ore", type: "ore", at: ["mine"], level: 1 },
    { id: 2, name: "Tin Ore", type: "ore", at: ["mine"], level: 1 },
    { id: 3, name: "Iron Ore", type: "ore", at: ["mine"], level: 3 },
    { id: 4, name: "Coal", type: "ore", at: ["mine", "cave"], level: 2 },
    { id: 5, name: "Silver Ore", type: "ore", at: ["mine"], level: 5 },
    { id: 6, name: "Gold Ore", type: "ore", at: ["mine"], level: 7 },
    { id: 7, name: "Mithril Ore", type: "ore", at: ["mine"], level: 6 },
    { id: 8, name: "Adamantite Ore", type: "ore", at: ["mine"], level: 9 },
    // stone and gems
    { id: 9, name: "Stone", type: "stone", at: ["cave", "mine", "ruins"], level: 1 },
    { id: 10, name: "Flint", type: "stone", at: ["cave"], level: 1 },
    { id: 11, name: "Quartz", type: "stone", at: ["cave"], level: 1 },
    { id: 12, name: "Amethyst", type: "stone", at: ["cave"], level: 8 },
    { id: 13, name: "Deep Crystal", type: "stone", at: ["cave"], level: 11 },
    { id: 14, name: "Sandstone", type: "stone", at: ["pyramids", "oasis"], level: 1 },
    { id: 15, name: "Jade", type: "stone", at: ["steptemple"], level: 1 },
    // wood
    { id: 16, name: "Pine Log", type: "wood", at: ["camp"], level: 1 },
    { id: 17, name: "Oak Log", type: "wood", at: ["camp"], level: 3 },
    { id: 18, name: "Maple Log", type: "wood", at: ["camp"], level: 6 },
    { id: 19, name: "Yew Log", type: "wood", at: ["camp"], level: 9 },
    { id: 20, name: "Ironwood Log", type: "wood", at: ["camp"], level: 12 },
    { id: 21, name: "Ancient Bark", type: "wood", at: ["bigtree", "camp"], level: 1 },
    { id: 22, name: "Heartwood", type: "wood", at: ["bigtree"], level: 15 },
    { id: 23, name: "Golden Sap", type: "wood", at: ["bigtree"], level: 9 },
    // from beasts
    { id: 24, name: "Hide", type: "beast", at: ["lair", "camp"], level: 1 },
    { id: 25, name: "Fang", type: "beast", at: ["lair", "camp"], level: 1 },
    { id: 26, name: "Thick Scale", type: "beast", at: ["lair"], level: 9 },
    { id: 27, name: "Dragon Scale", type: "beast", at: ["lair"], level: 15 },
    { id: 28, name: "Scarab Shell", type: "beast", at: ["pyramids"], level: 1 },
    // fire and frost
    { id: 29, name: "Sulfur", type: "stone", at: ["volcano", "crater"], level: 1 },
    { id: 30, name: "Obsidian", type: "stone", at: ["volcano"], level: 4 },
    { id: 31, name: "Fire Opal", type: "stone", at: ["volcano"], level: 8 },
    { id: 32, name: "Magma Core", type: "arcane", at: ["volcano"], level: 13 },
    { id: 33, name: "Starmetal", type: "ore", at: ["crater"], level: 12 },
    { id: 34, name: "Frost Crystal", type: "stone", at: ["icecastle"], level: 1 },
    { id: 35, name: "Everfrost", type: "stone", at: ["icecastle"], level: 10 },
    // old and strange
    { id: 36, name: "Rusted Scrap", type: "ore", at: ["ruins"], level: 1 },
    { id: 37, name: "Runestone", type: "arcane", at: ["ruins", "stones", "tower"], level: 5 },
    { id: 38, name: "Relic Fragment", type: "arcane", at: ["ruins", "tower"], level: 7 },
    { id: 39, name: "Bone", type: "beast", at: ["altar", "lair", "camp"], level: 1 },
    { id: 40, name: "Cursed Ash", type: "arcane", at: ["altar"], level: 6 },
    { id: 41, name: "Shadow Essence", type: "arcane", at: ["darktower"], level: 12 },
    { id: 42, name: "Void Shard", type: "arcane", at: ["darktower"], level: 12 },
    { id: 43, name: "Gold Leaf", type: "arcane", at: ["pyramids"], level: 8 },
    { id: 44, name: "Desert Lotus", type: "plant", at: ["oasis"], level: 3 },
    // growing
    { id: 45, name: "Flax", type: "plant", at: ["farm"], level: 1 },
    { id: 46, name: "Wool", type: "beast", at: ["farm"], level: 3 },
    { id: 47, name: "Silk", type: "beast", at: ["farm"], level: 6 },
    // herbs (the user, 2026-10-31: potions' herbs at the quiet places and farms), gathered with Foraging
    { id: 48, name: "Mint", type: "plant", at: ["farm", "chapel", "hut", "shrine"], level: 1 },
    { id: 49, name: "Bloodroot", type: "plant", at: ["hut", "shrine", "stones"], level: 1 },
    { id: 50, name: "Silverleaf", type: "plant", at: ["chapel", "shrine", "hut", "stones"], level: 4 },
    { id: 51, name: "Moonpetal", type: "plant", at: ["stones", "bigtree"], level: 6 },
    { id: 52, name: "Starbloom", type: "plant", at: ["bigtree", "crater"], level: 12 },
    // fish, caught with Fishing at the water: the port, the quay, the bridge, the oasis
    { id: 53, name: "Sardine", type: "fish", at: ["pier", "port", "bridge"], level: 1 },
    { id: 54, name: "Trout", type: "fish", at: ["bridge", "pier", "oasis"], level: 3 },
    { id: 55, name: "Golden Carp", type: "fish", at: ["oasis", "bridge"], level: 4 },
    { id: 56, name: "Salmon", type: "fish", at: ["pier", "bridge", "port"], level: 6 },
    { id: 57, name: "Swordfish", type: "fish", at: ["pier"], level: 9 },
    { id: 58, name: "Leviathan Eel", type: "fish", at: ["pier"], level: 12 },
    // game, hunted (lairs and the woodcutters' camps), and the farms' crops: for Cooking
    { id: 59, name: "Venison", type: "beast", at: ["lair", "camp"], level: 1 },
    { id: 60, name: "Boar Meat", type: "beast", at: ["lair", "camp"], level: 4 },
    { id: 61, name: "Drake Meat", type: "beast", at: ["lair"], level: 12 },
    { id: 62, name: "Wheat", type: "plant", at: ["farm"], level: 1 },
    { id: 63, name: "Apple", type: "plant", at: ["farm"], level: 2 },
    { id: 64, name: "Honeycomb", type: "plant", at: ["farm", "bigtree"], level: 5 },
];

export function materialOf(id: number) {
    return MATERIALS.find((m) => m.id == id);
}

// what a level of a kind of place has: the materials found there, by its depth
export function materialsAt(kind: string, level: number) {
    return MATERIALS.filter((m) => m.at.includes(kind) && m.level <= level);
}
