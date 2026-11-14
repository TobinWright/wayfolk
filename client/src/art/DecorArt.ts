import * as PIXI from "pixi.js";
import { AP } from "../constants/Palette";

// The little things lying about on open ground (components/map/MapDecor),
// drawn in code in Apollo colours, a map px a pixel like the tiles: rocks,
// tufts, flowers, mushrooms, bushes and stumps on the grass; drifts, snowy
// rocks, bare twigs and tracks in the snow; cacti, bones and pebbles in the
// desert. Each as rows of characters, one a pixel ("." nothing; "z" a soft
// shadow on the ground), standing on its bottom row.

export type Decor =
    "rock" | "pebbles" | "tuft" | "flowers" | "daisies" | "mushroom" | "bush" | "stump" | "leaves" | "dryTuft" |
    "drift" | "snowRock" | "twigs" | "tracks" |
    "cactus" | "bones" | "sandPebbles";

const INKS: { [ch: string]: number } = {
    K: AP.SLATE, T: AP.STEEL, S: AP.STONE, A: AP.ASH, M: AP.MIST, W: AP.WHITE,
    P: AP.PINE, F: AP.FOREST, L: AP.LEAF, G: AP.GRASS, I: AP.LIME,
    B: AP.BARK, U: AP.UMBER, C: AP.CLAY, N: AP.TAN, D: AP.SAND, E: AP.CREAM,
    R: AP.RED, O: AP.OCHRE, Y: AP.STRAW, H: AP.AMBER, X: AP.RUST, Q: AP.PINK, V: AP.ICE,
};
const SHADOW = AP.BLACK, SHADOW_ALPHA = 60;

const ART: { [k in Decor]: string[] } = {
    // (small and soft, no dark rim: the user found them standing out)
    rock: [
        ".SSA.",
        "TSSST",
        "zTTTz",
    ],
    pebbles: [
        "T....",
        "...S.",
        ".S..T",
    ],
    tuft: [
        "..I..",
        "I.IG.",
        "GIGL.",
        ".LGLG",
    ],
    flowers: [
        ".Q..Y.",
        "QYQ.L.",
        ".LQ..L",
        ".L.L.L",
    ],
    daisies: [
        "W..W.",
        ".L.YW",
        "W.L..",
        "L.L..",
    ],
    mushroom: [
        ".RRR.",
        "RWRWR",
        "RRRRR",
        "..E..",
        "z.E.z",
    ],
    bush: [
        "..GGI..",
        ".GLLGL.",
        "GLLLLLF",
        "LLLFLFF",
        "zPFPFPz",
    ],
    stump: [
        ".CNC.",
        "UCNCU",
        "UUUUB",
        "UBUBB",
        "zBzBz",
    ],
    leaves: [
        ".H.O..",
        "OHXHO.",
        "XOXHOX",
    ],
    dryTuft: [
        "..Y..",
        "N.YN.",
        "NYNC.",
        ".CNCN",
    ],
    drift: [
        "...WW....",
        ".WWWWWM..",
        "WWWWWWMMA",
        "MMMMAAAAS",
        ".zzzzzzz.",
    ],
    snowRock: [
        ".WWM.",
        "TMSST",
        "zTTTz",
    ],
    twigs: [
        "U...U.",
        ".U.U..",
        "..UU.U",
        "..BUU.",
        ".zBBz.",
    ],
    tracks: [
        "S.S......",
        "....S.S..",
        "..S.S....",
        "......S.S",
    ],
    cactus: [
        "..I..",
        "..GI.",
        "L.GL.",
        "LGGL.",
        "..GLI",
        "..GLG",
        "..GL.",
        ".zPPz",
    ],
    bones: [
        "E.ME..",
        ".EEEE.",
        "..ME.E",
    ],
    sandPebbles: [
        "C....",
        "...U.",
        ".N..C",
    ],
};

// what lies about where (MapDecor picks one by the ground and the season)
export const GRASS_DECOR: Decor[] = ["pebbles", "tuft", "flowers", "flowers", "daisies", "mushroom", "bush", "stump"];
export const AUTUMN_DECOR: Decor[] = ["pebbles", "dryTuft", "leaves", "leaves", "mushroom", "mushroom", "bush", "stump"];
export const SNOW_DECOR: Decor[] = ["drift", "drift", "snowRock", "twigs", "tracks"];
export const DESERT_DECOR: Decor[] = ["cactus", "bones", "sandPebbles", "sandPebbles", "dryTuft"];
export const HILL_DECOR: Decor[] = ["rock", "pebbles", "pebbles", "tuft", "tuft"];

const textures = new Map<Decor, PIXI.Texture>();
export function decorTexture(kind: Decor): PIXI.Texture {
    let t = textures.get(kind);
    if (t) return t;
    const rows = ART[kind], w = rows[0].length, h = rows.length;
    const canvas = document.createElement("canvas");
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext("2d"), img = ctx.createImageData(w, h);
    rows.forEach((row, y) => row.split("").forEach((ch, x) => {
        const c = ch == "z" ? SHADOW : INKS[ch];
        if (c == null) return;
        const i = (y * w + x) * 4;
        img.data[i] = (c >> 16) & 255; img.data[i + 1] = (c >> 8) & 255; img.data[i + 2] = c & 255; img.data[i + 3] = ch == "z" ? SHADOW_ALPHA : 255;
    }));
    ctx.putImageData(img, 0, 0);
    textures.set(kind, t = PIXI.Texture.from(canvas));
    t.baseTexture.scaleMode = PIXI.SCALE_MODES.NEAREST;
    return t;
}
