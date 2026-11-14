import { levelsOf, MATERIALS, materialsAt } from "./Locations";
import { Graph, legLength } from "./Travel";
import { WorldPlace } from "./Places";

// Things that turn up on the map for a while (the user, 2026-10-31: "things
// that turn up, short-lived, clickable"); the numbers, names and stock are
// Claude's proposal, open to change. Each is on the map and clicked opens its
// window (client/src/components/sightinfo/SightInfo.ts).
//
// - A wandering merchant stops at a town for MERCHANT_MS selling a few rare
//   things; a player buys only with a hero of theirs standing in the town.
// - A rare find (a glowing patch, a fallen star, a rich vein) turns up at a
//   gathering place for FIND_MS: heroes gathering there have a FIND_CHANCE
//   with each one gathered of a rare material from its pool too.
// - A roaming beast (a dragon flying across the map, a troll walking the
//   roads) for BEAST_MS: a hero coming to a stop on the road within
//   BEAST_REACH of it fights it, hard, once (better loot).
// - An opening (a cave mouth, ruins) at a bend in the road for OPENING_MS:
//   a dungeon of its own (a place, while it's open), explored for twice the
//   finds and gold and now and then a rare find.
// (The world boss that marches on a town is a dynamic event: shared/Events.ts MARCH.)
//
// Kinds and variants are saved (by number): add new ones at the end.

export enum SightKind { MERCHANT, FIND, BEAST, OPENING }

// a lot on a merchant's stall: the item, its price each, how many each player may buy
export type Lot = [number, number, number];

// a sight as kept and sent: i its id, k its kind, v its variant (FINDS,
// BEASTS, OPENINGS), n its name, s when it came, e when it goes (ms), p its
// place (a beast: none); a merchant's stall l; a flying beast's way a (from
// x, y to x, y, map px), a walking one's r (the graph's nodes); an opening's
// place o (a dungeon of its own at node p, while it's open)
export interface Sight {
    i: number; k: SightKind; v: number; n: string; s: number; e: number; p?: number;
    l?: Lot[]; a?: [number, number, number, number]; r?: number[]; o?: WorldPlace;
}
// and as sent to a player: b how many of each lot they've bought
export interface SightView extends Sight { b?: number[]; }

export function isOn(s: Sight, now: number) {
    return now >= s.s && now < s.e;
}

//#region the numbers

export const SIGHT_GAP_LEAST_MS = 10 * 60000;   // between one turning up and the next: 10-30 min
export const SIGHT_GAP_MOST_MS = 30 * 60000;
export const MOST_OF: number[] = [2, 2, 2, 1];  // on at once, by kind

export const MERCHANT_MS = 60 * 60000;
export const LOTS = 4;                          // on a merchant's stall
export const LOT_LEVEL = 6;                     // its materials: found this deep or more
export const LOT_MOST = [1, 3];                 // each player may buy 1-3 of each lot

export const FIND_MS = 2 * 3600000;
export const FIND_CHANCE = 0.15;                // with each one gathered there

export const BEAST_MS = 3 * 3600000;
export const BEAST_REACH = 64;                  // map px (4 miles) from it a stop on the road meets it
export const BEAST_POWER = 1.6;                 // its danger at a hero's level, times this
export const BEAST_GOLD = 5;                    // won: so many dungeon runs' gold at that level
export const BEAST_XP_MS = 5 * 40000;           // won: so much Fighting XP (a road fight's five times)

export const OPENING_MS = 24 * 3600000;
export const OPENING_LOOT = 2;                  // finds and gold exploring it, times this
export const OPENING_RARE = 0.25;               // a run's chance of a rare find too
export const RARE_FROM = 9;                     // an opening's rare finds: a material found this deep or more

//#endregion

//#region the kinds

// a rare find's variants: what it's called, where it turns up (kinds of place), and what it gives (material ids)
export interface FindDef { name: string; at: string[]; pool: number[]; text: string; }
export const FINDS: FindDef[] = [
    { name: "A glowing patch", at: ["farm", "oasis", "bigtree", "camp", "altar", "stones"], pool: [23, 44, 47, 22], text: "Something glows among the growth here" },
    { name: "A fallen star", at: ["mine", "cave", "camp", "farm", "oasis", "bigtree", "altar", "stones", "crater", "volcano", "icecastle", "ruins", "lair", "pyramids", "steptemple", "darktower"], pool: [33, 42, 32, 13], text: "A star fell here: shards of it lie about, still warm" },
    { name: "A rich vein", at: ["mine", "cave", "volcano", "icecastle", "crater"], pool: [7, 6, 8, 13, 31, 35], text: "A rich vein of ore and gems has been struck here" },
];

// a roaming beast's variants: its enemy look (shared/Fights.ts ENEMIES), flying or walking, names, what it leaves (material ids)
export interface BeastDef { kind: string; e: number; flies: boolean; names: string[]; drops: number[]; }
export const BEASTS: BeastDef[] = [
    { kind: "Dragon", e: 15, flies: true, names: ["Ashwing", "Vermithrax", "Skorch", "The Crimson Terror", "Old Smoulder"], drops: [27, 26, 32, 31] },
    { kind: "Troll", e: 24, flies: false, names: ["Grumblegut", "Old Knuckles", "Mossback", "Bonecrusher", "Hagga the Hill Troll"], drops: [26, 24, 39, 20, 37] },
];

// an opening's variants: the kind of dungeon it is (shared/Places.ts), names
export interface OpeningDef { kind: string; what: string; names: string[]; }
export const OPENINGS: OpeningDef[] = [
    { kind: "cave", what: "A cave mouth has opened", names: ["The Gloomhollow", "The Yawning Deep", "Whisperstone Cavern", "The Glittering Maw", "The Echoing Pit"] },
    { kind: "ruins", what: "Ruins have risen from the earth", names: ["The Sunken Vault", "The Forgotten Keep", "The Drowned Abbey", "The Hollow Crown", "The Lost Reliquary"] },
];

export const KIND_NAMES = ["Wandering merchant", "Rare find", "Roaming beast", "Opening"];

// a few words on it, for its window and the chat
export function sightText(s: Sight) {
    switch (s.k) {
        case SightKind.MERCHANT: return "A wandering merchant has set up a stall. Send a hero there to buy";
        case SightKind.FIND: return `${FINDS[s.v]?.text ?? ""}. Heroes gathering here may find something rare`;
        case SightKind.BEAST: return `${BEASTS[s.v]?.flies ? "It flies" : "It walks the roads"}: heroes on the road near it must fight it. Hard, but it leaves rare things`;
        case SightKind.OPENING: return `${OPENINGS[s.v]?.what ?? "It's open"}, for a day. Explore it for twice the finds and gold, and rare things`;
    }
    return "";
}

// "Ashwing the Dragon" (one that says what it is already, or a title - "The
// Crimson Terror", "Hagga the Hill Troll" - as it is)
export function beastName(s: Sight) {
    const def = BEASTS[s.v];
    return !def || s.n.startsWith("The ") || s.n.includes(def.kind) ? s.n : `${s.n} the ${def.kind}`;
}

// what a rare find gives, as materials
export function findPool(s: Sight) {
    return (FINDS[s.v]?.pool ?? []).map((id) => MATERIALS.find((m) => m.id == id)).filter((m) => m);
}

// whether a kind of place can have a variant of rare find (one with materials)
export function findFits(v: number, kind: string) {
    return FINDS[v].at.includes(kind) && materialsAt(kind, levelsOf(kind)).length > 0;
}

// an opening's and the merchant's rare things: materials found this deep or more
export function rareMaterials(from: number) {
    return MATERIALS.filter((m) => m.level >= from);
}

// a merchant's price for a material (by how deep it's found), a roll 0-1 putting it up to half again
export function lotPrice(level: number, roll: number) {
    return Math.round(8 * level * (1.5 + 0.5 * roll) / 5) * 5;
}

//#endregion

//#region a beast on the move

// where a beast is at `now`, map px, and which way it's going (1 right, -1 left);
// a flier straight across, a walker along its road at an even pace; null if it's not about
export function beastAt(s: Sight, graph: Graph, now: number): { x: number, y: number, face: number } {
    if (s.k != SightKind.BEAST || !isOn(s, now)) return null;
    const t = (now - s.s) / (s.e - s.s);
    if (s.a) {
        const [x0, y0, x1, y1] = s.a;
        return { x: x0 + (x1 - x0) * t, y: y0 + (y1 - y0) * t, face: x1 >= x0 ? 1 : -1 };
    }
    const nodes = (s.r ?? []).map((id) => graph.get(id)).filter((n) => n);
    if (!nodes.length) return null;
    if (nodes.length == 1) return { x: nodes[0].x, y: nodes[0].y, face: 1 };
    // there and back again: out for the first half, home for the second
    const total = nodes.slice(1).reduce((sum, n, k) => sum + legLength(nodes[k], n), 0);
    let along = (t < 0.5 ? t * 2 : 2 - t * 2) * total;
    const back = t >= 0.5;
    for (let k = 1; k < nodes.length; k++) {
        const a = nodes[k - 1], b = nodes[k], leg = legLength(a, b);
        if (along <= leg || k == nodes.length - 1) {
            const f = leg ? Math.min(1, along / leg) : 0, dx = b.x - a.x;
            return { x: a.x + dx * f, y: a.y + (b.y - a.y) * f, face: (dx >= 0 ? 1 : -1) * (back ? -1 : 1) };
        }
        along -= leg;
    }
    return null;
}

//#endregion
