// A hero's cosmetics (the user, 2026-10-28: "pull cosmetics menu from
// lithalia"; Lithalia's shared Wardrobe and Looks): their hairstyle, outfit,
// skin, eyes and three dyes, changed any time, for free. Who can pick each
// choice is the catalog's (sorted in the admin's Cosmetics editor, the user,
// 2026-10-28: "drag and drop to sort cosmetics between free, subscriber, and
// ones that can be purchased as parts of packs"): everyone's, a Supporter's
// (a Premium perk), or a pack's (those who own it). Till it's sorted, the
// first STARTER_DYES dyes are everyone's and the rest a Supporter's.
// One worn and no longer theirs to pick (lapsed) stays till it's changed.
// Looks are [head, body, skin, eyes, hair, primary, secondary] (client
// people/LookArt); how many hairstyles and outfits there are is the client's
// looks.json, so the counts are passed in.
// The catalog also sorts the backdrops a hero's status window can show
// (shared/Scenes; the user, 2026-10-29: "add status window backgrounds to
// cosmetic sorter"): one more part after the looks, BACKDROP, never worn as a
// look - all everyone's till sorted, and "Where they are" always everyone's.
// The seasons' backdrops (SEASON_SCENES; the user, 2026-10-30) are EARNED,
// never sorted: theirs who took part in a season of that kind.
// The hairstyles, outfits and backdrops added since (Wayfolk's own, the user,
// 2026-11-01: "Add more cosmetics. Make them all subscriber to start") are a
// Supporter's till sorted: those from NEWER_FROM on.

import { SCENES, SEASON_SCENES } from "./Scenes";

export const LOOK_NAMES = ["Hair", "Outfit", "Skin", "Eyes", "Hair colour", "Clothes", "Trim"];
export const SKINS = 6;
export const EYES = 37;
export const DYES = 32;
export const STARTER_DYES = 16;
export const DYE_LOOKS = [4, 5, 6];         // hair colour, clothes, trim: picking from the dyes
export const BACKDROP = 7;                  // the catalog's part after the looks: status window backdrops
export const PART_NAMES = [...LOOK_NAMES, "Backdrop"];   // the catalog's parts

// each dye's name (Lithalia's), in the client's AvatarArt DYES order
export const DYE_NAMES = [
    "Ink", "Shadow", "Mud", "Rust", "Amber", "Crimson", "Maroon", "Pine",
    "Forest", "Navy", "Cobalt", "Teal", "Grape", "Berry", "Steel", "Mist",
    "Sunset", "Butter", "Olive", "Moss", "Lime", "Jade", "Mint", "Sky",
    "Lavender", "Lilac", "Pink", "Hot pink", "Raspberry", "Night", "Sage", "Gold",
];

// each eye colour's name, in the client's AvatarArt EYE_DYES order
export const EYE_NAMES = [
    "Ink", "Navy", "Forest", "Teal", "Cobalt", "Mud", "Grape", "Crimson",
    "Dusk", "Sand", "Mauve grey", "Steel", "Red", "Orange", "Amber", "Gold",
    "Olive", "Moss", "Lime", "Pear", "Pine", "Spruce", "Fern", "Sage", "Emerald", "Leaf",
    "Jade", "Mint", "Aqua", "Blue", "Sky", "Violet", "Lavender", "Lilac", "Rose", "Cerise", "Hot pink",
];

// how many of each part there are, in Looks order (hairs, outfits: the looks.json's)
export function lookCounts(hairs: number, outfits: number) {
    return [hairs, outfits, SKINS, EYES, DYES, DYES, DYES];
}

// how many of each part the catalog sorts: the looks', then the backdrops
export function catalogCounts(looks: number[]) {
    return [...looks, SCENES.length];
}

// who a choice is for: FREE, SUPPORTER, or else the id of the pack it's in
export const FREE = 0;
export const SUPPORTER = -1;
export const EARNED = -2;
export const PACK_NAME_MOST = 24;

export interface Pack { i: number; n: string; }     // id (> 0), name
// t[look][value]: who each choice is for (one past the end - a hairstyle added
// since - goes by defaultTier); p: the packs, in the order they're shown
export interface Catalog { t: number[][]; p: Pack[]; }
// what a player has: a Supporter or not, the packs they own, and the season backdrops they've earned (SCENES places)
export interface Access { premium: boolean; packs: number[]; earned?: number[]; }

// the first of each part added since the catalog was first sorted (hairstyles,
// outfits, backdrops): those from here on are a Supporter's till sorted
export const NEWER_FROM: { [look: number]: number } = { 0: 8, 1: 6, [BACKDROP]: 20 };

// before it was sorted: the dyes past the starter ones and the newer choices a Supporter's
export function defaultTier(look: number, value: number) {
    if (look == BACKDROP && SEASON_SCENES.includes(value)) return EARNED;
    if (value >= (NEWER_FROM[look] ?? Infinity)) return SUPPORTER;
    return DYE_LOOKS.includes(look) && value >= STARTER_DYES ? SUPPORTER : FREE;
}

export function defaultCatalog(counts: number[]): Catalog {
    return { t: counts.map((n, look) => Array.from({ length: n }, (_, v) => defaultTier(look, v))), p: [] };
}

export function tierOf(catalog: Catalog, look: number, value: number) {
    return catalog.t[look]?.[value] ?? defaultTier(look, value);
}

// the pack a choice is in (null: it's not a pack's)
export function packOf(catalog: Catalog, look: number, value: number): Pack {
    const tier = tierOf(catalog, look, value);
    return tier > 0 ? catalog.p.find((p) => p.i == tier) ?? null : null;
}

// how many choices are a Supporter's (the Premium window lists them)
export function supporterCount(catalog: Catalog, counts: number[]) {
    let n = 0;
    counts.forEach((count, look) => { for (let v = 0; v < count; v++) if (tierOf(catalog, look, v) == SUPPORTER) n++; });
    return n;
}

// a part's choices that are everyone's (heroes on the hiring board are made from these)
export function freeChoices(catalog: Catalog, look: number, count: number) {
    const free: number[] = [];
    for (let v = 0; v < count; v++) if (tierOf(catalog, look, v) == FREE) free.push(v);
    return free.length ? free : [0];
}

// whether a choice is theirs to pick
export function owns(catalog: Catalog, look: number, value: number, access: Access) {
    const tier = tierOf(catalog, look, value);
    if (tier == EARNED) return !!access.earned?.includes(value);
    return tier == FREE || (tier == SUPPORTER ? access.premium : access.packs.includes(tier));
}

// whether a part can be set to a value: there, and theirs to pick
export function canWear(look: number, value: number, counts: number[], catalog: Catalog, access: Access) {
    return Number.isInteger(value) && value >= 0 && value < counts[look] && owns(catalog, look, value, access);
}

// looks as asked for, made safe: a part that can't be is left as it `was`
export function wearable(raw: any, was: number[], counts: number[], catalog: Catalog, access: Access): number[] {
    return counts.map((_, look) => Array.isArray(raw) && raw[look] != was[look] && canWear(look, raw[look], counts, catalog, access) ? raw[look] : was[look]);
}

// a catalog as the editor sent it, made safe: names trimmed, every choice
// there and for everyone, a Supporter or one of its packs (anything else as
// it was before it was sorted). Null if it isn't a catalog at all.
export function cleanCatalog(raw: any, counts: number[]): Catalog {
    if (!raw || !Array.isArray(raw.t) || !Array.isArray(raw.p)) return null;
    const p: Pack[] = [];
    for (const pack of raw.p) {
        const i = pack?.i, n = typeof pack?.n == "string" ? pack.n.trim().slice(0, PACK_NAME_MOST) : "";
        if (Number.isInteger(i) && i > 0 && i < 1e6 && n && !p.some((q) => q.i == i)) p.push({ i, n });
    }
    const t = counts.map((count, look) => Array.from({ length: count }, (_, v) => {
        const tier = Array.isArray(raw.t[look]) ? raw.t[look][v] : undefined;
        if (look == BACKDROP && v == 0) return FREE;     // (where they are: always everyone's)
        if (look == BACKDROP && SEASON_SCENES.includes(v)) return EARNED;     // (a season's: earned)
        return tier === FREE || tier === SUPPORTER || p.some((q) => q.i == tier) ? tier : defaultTier(look, v);
    }));
    return { t, p };
}
