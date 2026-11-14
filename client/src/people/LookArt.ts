import LOOKS_JSON from "./looks.json";
import OWN_LOOKS_JSON from "./ownlooks.json";

// The people, ported from Lithalia (shared Looks and LookArt there): heroes
// and their cosmetics are drawn in Lithalia's looks. A person's looks are
// [head, body, skin, eyes, hair, primary, secondary]: a hairstyle and an
// outfit (their art below), and five dyes (the colours are AvatarArt's).
//
// Every hairstyle and outfit is Lithalia's staff's, drawn in its editor and
// copied here by tools/import-looks.js (looks.json). Each is drawn in the
// person's 16x32 frame for three facings - down, up and side (facing right;
// left is it mirrored) - as rows of characters, one a pixel: "." nothing, a
// dye's letter (DYE_CHARS: drawn in the wearer's dye) or a fixed colour
// (FIXED_COLORS, Resurrect 64, the characters from FIXED_FIRST on). A
// hairstyle is one layer, laid over the face; an outfit is its top (over the
// legs), what goes over the legs (a skirt, a robe's hem, a cape's tails) and
// the dye its legs are.
// Wayfolk's own hairstyles and outfits (ownlooks.json, the user, 2026-11-01:
// "Add more cosmetics") come after Lithalia's, drawn the same way.

export type Looks = number[];
export enum Look { HEAD, BODY, SKIN, EYES, HAIR, PRIMARY, SECONDARY }

export const SKINS = 6;
export const EYES = 37;
export const DYES = 32;

export type Side = "down" | "up" | "side";
export const FRAME_W = 16, FRAME_H = 32;

export type Grid = string[];                    // FRAME_H rows of FRAME_W characters
export type Sides = { down: Grid, up: Grid, side: Grid };

export interface HairArt {
    n: number;      // its number in Looks
    name: string;
    art: Sides;
}

export interface OutfitArt {
    n: number;
    name: string;
    top: Sides;     // laid over the legs
    over: Sides;    // laid over the top and legs (a skirt, a robe's hem)
    leg: string;    // the dye its legs are drawn in (one of DYE_CHARS)
}

// the letters drawn in a dye: ink (outline), skin and its shade, eyes, white,
// hair and its shade, clothes and their shade, trim and its shade, boots
export const DYE_CHARS = ["O", "S", "s", "E", "W", "H", "h", "P", "p", "Q", "q", "B"];

// Resurrect 64, in its own order, for pixels that keep their colour whatever the dyes
// (a gold buckle, a red gem): pixel character FIXED_FIRST + its place here. Never reorder.
export const FIXED_FIRST = 0xC0;
export const FIXED_COLORS = [
    0x2E222F, 0x3E3546, 0x625565, 0x966C6C, 0xAB947A, 0x694F62, 0x7F708A, 0x9BABB2, 0xC7DCD0, 0xFFFFFF,
    0x6E2727, 0xB33831, 0xEA4F36, 0xF57D4A, 0xAE2334, 0xE83B3B, 0xFB6B1D, 0xF79617, 0xF9C22B, 0x7A3045,
    0x9E4539, 0xCD683D, 0xE6904E, 0xFBB954, 0x4C3E24, 0x676633, 0xA2A947, 0xD5E04B, 0xFBFF86, 0x165A4C,
    0x239063, 0x1EBC73, 0x91DB69, 0xCDDF6C, 0x313638, 0x374E4A, 0x547E64, 0x92A984, 0xB2BA90, 0x0B5E65,
    0x0B8A8F, 0x0EAF9B, 0x30E1B9, 0x8FF8E2, 0x323353, 0x484A77, 0x4D65B4, 0x4D9BE6, 0x8FD3FF, 0x45293F,
    0x6B3E75, 0x905EA9, 0xA884F3, 0xEAADED, 0x753C54, 0xA24B6F, 0xCF657F, 0xED8099, 0x831C5D, 0xC32454,
    0xF04F78, 0xF68181, 0xFCA790, 0xFDCBB0,
];

export function fixedChar(i: number) {
    return String.fromCharCode(FIXED_FIRST + i);
}

function isPixel(ch: string) {
    const fixed = ch.charCodeAt(0) - FIXED_FIRST;
    return ch == "." || DYE_CHARS.indexOf(ch) >= 0 || (fixed >= 0 && fixed < FIXED_COLORS.length);
}

// a packed grid (rows without their trailing dots, no empty rows at the end) as a whole frame
function unpackGrid(raw: any): Grid {
    const grid: Grid = [];
    for (let y = 0; y < FRAME_H; y++) {
        const row = typeof raw?.[y] == "string" ? raw[y] : "";
        grid.push((row + ".".repeat(FRAME_W)).slice(0, FRAME_W).split("").map((ch: string) => isPixel(ch) ? ch : ".").join(""));
    }
    return grid;
}

function unpackSides(raw: any): Sides {
    return { down: unpackGrid(raw?.down), up: unpackGrid(raw?.up), side: unpackGrid(raw?.side) };
}

export const HAIRS: HairArt[] = ([...LOOKS_JSON.hairs, ...OWN_LOOKS_JSON.hairs] as any[]).map((h) => ({ n: h.n, name: h.name, art: unpackSides(h.art) }));
export const OUTFITS: OutfitArt[] = ([...LOOKS_JSON.outfits, ...OWN_LOOKS_JSON.outfits] as any[]).map((o) => ({
    n: o.n, name: o.name, top: unpackSides(o.top), over: unpackSides(o.over),
    leg: DYE_CHARS.indexOf(o.leg) >= 0 ? o.leg : "q",
}));

// how many of each part there are, in Looks order
export const LOOK_COUNTS = [HAIRS.length, OUTFITS.length, SKINS, EYES, DYES, DYES, DYES];

// someone's looks at random (every hairstyle and outfit, the first 16 dyes: Lithalia's starter ones)
export function randomLooks(random: () => number = Math.random): Looks {
    const pick = (n: number) => Math.floor(random() * n);
    return [pick(HAIRS.length), pick(OUTFITS.length), pick(SKINS), pick(EYES), pick(16), pick(16), pick(16)];
}
