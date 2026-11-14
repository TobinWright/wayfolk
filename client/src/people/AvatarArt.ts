import { R64 } from "../constants/Palette";
import { FIXED_COLORS, fixedChar, HAIRS, HairArt, Look, Looks, OUTFITS, OutfitArt, Side } from "./LookArt";

// Ported from Lithalia (client/src/game/art/AvatarArt.ts): keep the two alike.
// Lithalia's people, in the style of FF6's: a figure about 16x24 (a big
// head, a short body) standing at the bottom of a 16x32 frame, the space
// over it free for tall hair. The frame's bottom 16 rows are the tile the
// person stands on; the rest reaches up into the tile above (AVATAR_TOP: how
// far a head goes). Three frames a facing (standing, a step on either foot).
// A character is a head
// (a face, with one of the hairstyles laid over it) on a body (an outfit: a
// top, legs, and maybe a skirt, robe or cape over them), in its five dyes -
// skin, eyes, hair, and the outfit's primary and secondary colours. Drawn
// facing down, up and right; left is right mirrored. The hairstyles and
// outfits are staff's, drawn in Lithalia's editor (LookArt);
// the face, eyes and legs are here.

export enum Facing { UP = 1, RIGHT = 2, DOWN = 3, LEFT = 4 }

export const AVATAR_W = 16, AVATAR_H = 32;
export const AVATAR_TOP = 9; // px above the tile a person stands on that their head reaches (most hairstyles)

// [shade, main] for each skin, hair and clothes dye; eyes are one colour
export const SKIN_DYES: [number, number][] = [
    [R64.PEACH, R64.BLUSH], [R64.TAN, R64.PEACH], [R64.COPPER, R64.TAN], [R64.RUST, R64.COPPER], [R64.WINE, R64.RUST], [R64.AUBERGINE, R64.WINE],
];
// eyes: one pixel each, beside the eye's white - Lithalia's 8, then every Resurrect 64 colour that
// shows on every skin and against the white and isn't all but another (new ones on the end: heroes are saved by it)
export const EYE_DYES = [R64.INK, R64.NAVY, R64.FOREST, R64.TEAL, R64.COBALT, R64.MUD, R64.GRAPE, R64.CRIMSON,
    R64.DUSK, R64.SAND, R64.MAUVE_GREY, R64.STEEL, R64.RED, R64.ORANGE, R64.AMBER, R64.GOLD,
    R64.OLIVE, R64.MOSS, R64.LIME, R64.PEAR, R64.PINE, R64.SPRUCE, R64.FERN, R64.SAGE, R64.EMERALD, R64.LEAF,
    R64.JADE, R64.MINT, R64.AQUA, R64.BLUE, R64.SKY, R64.VIOLET, R64.LAVENDER, R64.LILAC, R64.ROSE, R64.CERISE, R64.HOT_PINK];
export const DYES: [number, number][] = [
    [R64.INK, R64.SHADOW], [R64.SHADOW, R64.SLATE], [R64.MUD, R64.RUST], [R64.RUST, R64.COPPER],
    [R64.AMBER, R64.GOLD], [R64.CRIMSON, R64.RED], [R64.MAROON, R64.BRICK], [R64.PINE, R64.FOREST],
    [R64.FOREST, R64.EMERALD], [R64.NAVY, R64.INDIGO], [R64.COBALT, R64.BLUE], [R64.DEEP_TEAL, R64.TEAL],
    [R64.GRAPE, R64.VIOLET], [R64.BERRY, R64.ROSE], [R64.STEEL, R64.MIST], [R64.MIST, R64.WHITE],
    // the rest are found, bought or earned (shared Wardrobe)
    [R64.VERMILION, R64.ORANGE], [R64.TAN, R64.BUTTER], [R64.MUD, R64.OLIVE], [R64.OLIVE, R64.MOSS],
    [R64.MOSS, R64.LIME], [R64.TEAL, R64.JADE], [R64.JADE, R64.MINT], [R64.BLUE, R64.SKY],
    [R64.VIOLET, R64.LAVENDER], [R64.LAVENDER, R64.LILAC], [R64.ROSE, R64.PINK], [R64.CERISE, R64.HOT_PINK],
    [R64.RASPBERRY, R64.CERISE], [R64.CHARCOAL, R64.SPRUCE], [R64.FERN, R64.SAGE], [R64.GOLD, R64.LEMON],
];

type Sides = { [side: string]: string[] };

const FACE_AT = 8, LEGS_AT = 25;

// the head without hair, rows 8-17
const FACE: Sides = {
    down: [
        ".....OOOOOO.....",
        "....OSSSSSSO....",
        "...OSSSSSSSSO...",
        "...OSSSSSSSSO...",
        "...OSSSSSSSSO...",
        "...OSSSSSSSSO...",
        "...OSSSSSSSSO...",
        "...OSSSSSSSSO...",
        "....OSSssSSO....",
        ".....OSSSSO.....",
    ],
    up: [
        ".....OOOOOO.....",
        "....OSSSSSSO....",
        "...OSSSSSSSSO...",
        "...OSSSSSSSSO...",
        "...OSSSSSSSSO...",
        "...OSSSSSSSSO...",
        "...OSSSSSSSSO...",
        "...OSSSSSSSSO...",
        "....OSSSSSSO....",
        ".....OSSSSO.....",
    ],
    side: [
        ".....OOOOOO.....",
        "....OSSSSSSO....",
        "...OSSSSSSSSO...",
        "...OSSSSSSSSO...",
        "...OSSSSSSSSO...",
        "...OSSSSSSSSO...",
        "...OSSSSSSSSO...",
        "...OSSSSSSSSO...",
        "....OSSSSSsO....",
        ".....OSSSSO.....",
    ],
};

// the eyes, rows 12-14, laid over the hair: an ink lid, the white on the
// outside and the iris (the eye dye) inside
const EYES: Sides = {
    down: [".....OO..OO.....", ".....WE..EW.....", "......E..E......"],
    up: [],
    side: [".........OO.....", ".........WE.....", "..........E....."],
};
const EYES_AT = 12;

// the legs in each frame (standing, then a step on either foot), rows 25-31:
// L the outfit's leg colour, B boots
const LEGS: { [side: string]: string[][] } = {
    down: [
        ["....OLLLLLLO....", "....OLLOOLLO....", "....OLLOOLLO....", "....OLLOOLLO....", "....OLLOOLLO....", "....OBBOOBBO....", "....OOOOOOOO...."],
        // (a step: one foot lifted two rows, so it shows on the map's little people)
        ["....OLLLLLLO....", "....OLLOOLLO....", "....OLLOOLLO....", "....OLLOOBBO....", "....OLLOOOOO....", "....OBBO........", "....OOOO........"],
        ["....OLLLLLLO....", "....OLLOOLLO....", "....OLLOOLLO....", "....OBBOOLLO....", "....OOOOOLLO....", "........OBBO....", "........OOOO...."],
    ],
    side: [
        [".....OLLOLO.....", ".....OLLOLO.....", ".....OLLOLO.....", ".....OLLOLO.....", ".....OLLOLO.....", ".....OBBBOBO....", ".....OOOOOOO...."],
        [".....OOLLLO.....", ".....OLOLLO.....", "....OLLOOLLO....", "...OLLO..OLLOO..", "..OBBO...OLLBO..", "...OBBO...OBO...", "....OO....OO...."],
        [".....OLLLLO.....", ".....OLLLOO.....", "....OLLOOLLO....", "...OLLOO.OLLOO..", "..OBBO...OLLBO..", "...OBBO...OBO...", "....OO....OO...."],
    ],
};
LEGS.up = LEGS.down;

// the arms in each frame, over an outfit's top, rows 21-24 (side) and 23-24
// (front and back): O ink, a the sleeve, t the body, b the belt or hem, S the hand,
// c the cape (more of what's left of it),
// _ nothing, . as the outfit has it. For tops with the tunic's arm (a column
// of sleeve at x 5, ink at 6) and the cape's (sleeve at 6, ink at 7, the cape
// behind it).
const SIDE_ARMS = [
    ["", "", "....OSObbbbO....", ""],
    ["...OaaOttttO....", "...OaOtttttO....", "...OSObbbbbO....", "....OObbbbO....."],
    ["", "", "...._OSObbbO....", ".....OObbbO....."],
];
const CAPE_ARMS = [
    ["", "", ".....OSObbbO....", ""],
    ["....OaaOtttO....", "....OaOttttO....", "....OSObbbbO....", ""],
    ["", "", ".....cOSObbO....", ".....c.O........"],
];
function setAt(grid: string[], y: number, x: number, ch: string) {
    grid[y] = grid[y].slice(0, x) + ch + grid[y].slice(x + 1);
}

function swingArms(grid: string[], side: Side, frame: number) {
    if (side == "side") {
        // where the arm is: a column of sleeve between two inks, rows 21-22
        const arm = [5, 6].find((x) => grid[21][x - 1] == "O" && grid[21][x + 1] == "O" && grid[22][x + 1] == "O" && grid[21][x] != "O");
        if (!arm) return;
        const sleeve = grid[21][arm];
        (arm == 5 ? SIDE_ARMS : CAPE_ARMS)[frame].forEach((row, i) => {
            // where the arm and hand were, the body, belt or hem goes on as the outfit has it just past them
            const y = 21 + i, fill = grid[y][arm + 3];
            row.split("").forEach((ch, x) => {
                if (ch == "." || x > arm + 2) return; // past the arm, the outfit stays as it is
                setAt(grid, y, x, ch == "_" ? "." : ch == "a" ? sleeve : ch == "c" ? grid[y][x - 1] : ch == "t" || ch == "b" ? fill : ch);
            });
        });
        return;
    }
    // front and back: the hand on the stepping side comes up a row
    if (frame == 0) return;
    const [hand, out] = frame == 1 ? [3, 2] : [12, 13];
    if (grid[23][hand] != "S" || grid[24][hand] != "O") return;
    // (with a cape round them, it goes on where the hand was)
    const cape = grid[23][out] != "O" ? grid[24][out] : ".";
    if (cape == ".") setAt(grid, 23, out, ".");
    setAt(grid, 23, hand, "O");
    setAt(grid, 24, hand, cape);
}

// rows laid over the grid from row `at` ("." leaves what's under them showing)
function lay(grid: string[], at: number, rows: string[]) {
    rows.forEach((row, i) => {
        const y = at + i;
        if (y < 0 || y >= grid.length || !row) return;
        grid[y] = grid[y].split("").map((ch, x) => row[x] && row[x] != "." ? row[x] : ch).join("");
    });
}

// a hairstyle or outfit to draw instead of the one the looks say
export interface Drawing { hair?: HairArt, outfit?: OutfitArt }

// the rows of a character: 32 of them, 16 wide
export function avatarRows(looks: Looks, facing: number, frame: number, drawing: Drawing = {}): string[] {
    const side: Side = facing == Facing.UP ? "up" : facing == Facing.DOWN ? "down" : "side";
    const outfit = drawing.outfit ?? OUTFITS[looks[Look.BODY]] ?? OUTFITS[0];
    const hair = drawing.hair ?? HAIRS[looks[Look.HEAD]] ?? HAIRS[0];
    const grid = Array.from({ length: AVATAR_H }, () => ".".repeat(AVATAR_W));
    lay(grid, LEGS_AT, LEGS[side][frame % 3].map((r) => r.replace(/L/g, outfit?.leg ?? "q")));
    if (outfit) lay(grid, 0, outfit.top[side]);
    swingArms(grid, side, frame % 3);
    if (outfit) lay(grid, 0, outfit.over[side]);
    lay(grid, FACE_AT, FACE[side]);
    if (hair) lay(grid, 0, hair.art[side]);
    lay(grid, EYES_AT, EYES[side]);
    return facing == Facing.LEFT ? grid.map((r) => r.split("").reverse().join("")) : grid;
}

export function avatarColors(looks: Looks) {
    const [skinShade, skin] = SKIN_DYES[looks[Look.SKIN]] ?? SKIN_DYES[1];
    const [hairShade, hair] = DYES[looks[Look.HAIR]] ?? DYES[2];
    const [primaryShade, primary] = DYES[looks[Look.PRIMARY]] ?? DYES[5];
    const [secondaryShade, secondary] = DYES[looks[Look.SECONDARY]] ?? DYES[9];
    return {
        O: R64.INK, S: skin, s: skinShade, E: EYE_DYES[looks[Look.EYES]] ?? R64.INK, W: R64.WHITE,
        H: hair, h: hairShade, P: primary, p: primaryShade, Q: secondary, q: secondaryShade, B: R64.MUD,
        ...FIXED, // (pixels that keep their colour whatever the dyes)
    } as { [ch: string]: number };
}

const FIXED: { [ch: string]: number } = {};
FIXED_COLORS.forEach((c, i) => FIXED[fixedChar(i)] = c);
