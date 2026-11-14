// The places on the world map, as both sides know them: their kinds (by
// their index here: world.json's places name their kind by it, `k`) and the
// map's places as tools/render-world.js writes them (assets/json/world.json).
// A place's id is its travel graph node's (DESIGN.md "The travel graph").
//
// Add new kinds at the end: world.json saves them by their index.

export const PLACE_KINDS = [
    "village", "town", "castle", "cathedral", "fort", "manor", "farm", "chapel", "temple", "steptemple",
    "tower", "darktower", "watchtower", "cave", "mine", "camp", "hut", "lair", "ruins", "stones", "pyramids", "crater",
    "bigtree", "signpost", "icecastle", "port", "pier", "bridge", "altar", "shrine", "volcano", "oasis",
] as const;
export type PlaceKind = typeof PLACE_KINDS[number];

// more sprites (client art/PlaceArt) for kinds there's more than one of (add new ones at the end)
export const PLACE_VARIANTS = [
    "rockbarrow", "snowvillage", "lumintown", "snowcastle", "palisade", "estate", "gullhaven", "orchard", "sheepfarm",
    "desertchapel", "stavechurch", "tent", "sandcave", "embermine", "loggingcamp", "desertcamp", "overgrownruins",
    // (the start towns' gathering places, 2026-10-31)
    "coppermine", "jetty", "croft", "tinmine", "wharf", "huntcamp",
] as const;
// every sprite, in places.png's order (world.json's places name theirs by its index, `s`)
export const PLACE_PICS = [...PLACE_KINDS, ...PLACE_VARIANTS];
export type PlacePic = typeof PLACE_PICS[number];

// a place on the map: i its id, k its kind, s its sprite, x and y its tile, n its name ("": unnamed)
export interface WorldPlace { i: number; k: number; s: number; x: number; y: number; n: string; }

// the kinds of place there's work and a workshop in (working for gold, crafting)
export const TOWN_KINDS: string[] = ["village", "town", "castle", "cathedral", "fort", "manor", "port"];

// the kinds of place that can be explored, level by level (Claude's proposal, 2026-10-28)
export const DUNGEON_KINDS: string[] = ["cave", "lair", "ruins", "darktower", "pyramids", "icecastle", "steptemple", "tower", "volcano", "crater"];

export function kindOf(place: WorldPlace) {
    return PLACE_KINDS[place.k] ?? "";
}

export function isTown(place: WorldPlace) {
    return TOWN_KINDS.includes(kindOf(place));
}

export function isDungeon(place: WorldPlace) {
    return DUNGEON_KINDS.includes(kindOf(place));
}

// its name, or an unnamed one's kind ("Cave")
export function placeName(place: WorldPlace) {
    if (!place) return "somewhere";
    const kind = kindOf(place);
    return place.n || kind.charAt(0).toUpperCase() + kind.slice(1);
}

// How busy a place is (the user, 2026-10-31: "busy places look busy"): the
// server counts the heroes at each place, anyone's, not on their way, every
// BUSY_MS (S2C.EVENT_BUSY); the map shows a busier place with more about it
// (client/src/components/map/MapLandmarks.ts), and pointing at it says how many.
export const BUSY_MS = 15000;
export const BUSY_LEVELS = [2, 5, 10];     // heroes for each step busier (below the first: as it is)
export const HERE_MOST = 200;               // the others' heroes a place's window is sent, at most (S2C.EVENT_HERE)

// 0 (as it is) to BUSY_LEVELS.length (as busy as it gets)
export function busyLevel(heroes: number) {
    let level = 0;
    while (level < BUSY_LEVELS.length && heroes >= BUSY_LEVELS[level]) level++;
    return level;
}
