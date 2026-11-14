import * as PIXI from "pixi.js";
import { AP } from "../constants/Palette";

// The life on the world map (components/map/MapLife.ts), drawn in Apollo
// colours, tiny (a map px a pixel; a hero on the map is about 16 px tall):
// wagons and walkers on the roads, ships at sea, deer, sheep and camels,
// birds and bats, a fish jumping and a whale, snowmen, and the specks that
// drift - smoke, ash, leaves, petals, fireflies, foam. Each faces right; the
// map flips it to face left. Walking ones have two frames.

// a picture from rows of letters, each letter a colour in `key` ("." none)
export function pic(rows: string[], key: { [ch: string]: number }) {
    const w = Math.max(...rows.map((r) => r.length)), h = rows.length;
    const canvas = document.createElement("canvas");
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext("2d"), img = ctx.createImageData(w, h);
    rows.forEach((row, y) => row.split("").forEach((ch, x) => {
        const c = key[ch];
        if (c == null) return;
        const i = (y * w + x) * 4;
        img.data[i] = (c >> 16) & 255; img.data[i + 1] = (c >> 8) & 255; img.data[i + 2] = c & 255; img.data[i + 3] = 255;
    }));
    ctx.putImageData(img, 0, 0);
    return PIXI.Texture.from(canvas);
}

const cache = new Map<string, PIXI.Texture>();
function once(name: string, make: () => PIXI.Texture) {
    let t = cache.get(name);
    if (!t) cache.set(name, t = make());
    return t;
}

// a covered wagon and its horse, walking (frame 0 or 1)
export function wagonTexture(frame: number) {
    const legs = frame ? ".oo..oo..H.H.H" : ".oo..oo.H...H.";
    return once("wagon" + frame, () => pic([
        ".cccc.........",
        "cWWWWc........",
        "cWWWWc.....mH.",
        "cWWWWc....mHHe",
        "BBBBBB-HHHHH..",
        legs,
    ], { c: AP.TAN, W: AP.CREAM, B: AP.UMBER, "-": AP.BARK, H: AP.CLAY, m: AP.BARK, e: AP.UMBER, o: AP.BARK }));
}

// someone on foot (one of a few coats), walking (frame 0 or 1)
export const COATS = [AP.RED, AP.COBALT, AP.LEAF, AP.OCHRE, AP.VIOLET, AP.STEEL];
export function walkerTexture(coat: number, frame: number) {
    return once("walker" + coat + "_" + frame, () => pic([
        ".h.",
        ".s.",
        "ccc",
        "ccc",
        ".l.",
        frame ? ".l." : "l.l",
        frame ? ".b." : "b.b",
    ], { h: AP.BARK, s: AP.TAN, c: COATS[coat % COATS.length], l: AP.UMBER, b: AP.SOOT }));
}

// a ship under sail (big), or a fishing boat
export function shipTexture(big: boolean) {
    return big ? once("ship", () => pic([
        ".....m.....",
        ".....mSS...",
        "....SmSSS..",
        "...SSmSSSS.",
        "..SSSmSSSSS",
        ".....m.....",
        "UUUUUUUUUUU",
        ".uuuuuuuuu.",
    ], { m: AP.BARK, S: AP.WHITE, U: AP.UMBER, u: AP.BARK })) : once("boat", () => pic([
        "..m...",
        "..mS..",
        "..mSS.",
        "UUUUUU",
        ".uuuu.",
    ], { m: AP.BARK, S: AP.CREAM, U: AP.CLAY, u: AP.UMBER }));
}

// foam at a ship's bow and stern as it goes
export function wakeTexture() {
    return once("wake", () => pic(["F.F.F"], { F: AP.FOAM }));
}

// a deer (antlers on some), walking (frame 0 or 1)
export function deerTexture(stag: boolean, frame: number) {
    return once("deer" + stag + frame, () => pic([
        stag ? ".....b.b" : "........",
        stag ? "......b." : "........",
        ".....DD.",
        "tDDDDDe.",
        ".DDDD...",
        frame ? "..l.l..." : ".l...l..",
    ], { b: AP.BARK, D: AP.CLAY, e: AP.UMBER, t: AP.CREAM, l: AP.UMBER }));
}

// a sheep, walking (frame 0 or 1)
export function sheepTexture(frame: number) {
    return once("sheep" + frame, () => pic([
        ".WWW.",
        "WWWWk",
        "WWWW.",
        frame ? "..k.k" : ".k.k.",
    ], { W: AP.WHITE, k: AP.SLATE }));
}

// a camel, walking (frame 0 or 1)
export function camelTexture(frame: number) {
    return once("camel" + frame, () => pic([
        "..T.T...",
        ".TTTTT.T",
        "TTTTTTTT",
        ".tTTTT..",
        frame ? "..t..t.." : ".t....t.",
        frame ? "..t..t.." : ".t....t.",
    ], { T: AP.CLAY, t: AP.UMBER }));
}

// a bird flying, its wings up (frame 0) or down (1); a bat the same, darker
export function birdTexture(frame: number, bat = false) {
    const c = bat ? AP.PLUM : AP.SLATE;
    return once("bird" + frame + bat, () => frame ? pic([
        ".....",
        "BB.BB",
        "..B..",
    ], { B: c }) : pic([
        "B...B",
        ".B.B.",
        "..B..",
    ], { B: c }));
}

// a fish leaping, and the ring it leaves
export function fishTexture() {
    return once("fish", () => pic(["..F", ".F.", "f.."], { F: AP.MIST, f: AP.STONE }));
}
export function rippleTexture() {
    return once("ripple", () => pic([".FFF.", "F...F", ".FFF."], { F: AP.FOAM }));
}

// a whale's back breaking the water
export function whaleTexture() {
    return once("whale", () => pic([
        "...SSSS....",
        ".SSSSSSSS.t",
        "FsssssssssF",
    ], { S: AP.IRON, s: AP.SLATE, t: AP.IRON, F: AP.FOAM }));
}

// a snowman, a carrot nose, a hat on some
export function snowmanTexture(hat: boolean) {
    return once("snowman" + hat, () => pic([
        hat ? ".HHH." : ".....",
        hat ? "HHHHH" : ".www.",
        ".wkw.",
        ".wwn.",
        "wwkww",
        "wwwww",
        ".www.",
    ], { H: AP.INK, w: AP.WHITE, k: AP.INK, n: AP.EMBER }));
}

// a speck (ash, a petal, foam, a firefly): one px of white, tinted
export function speckTexture() {
    return once("speck", () => pic(["W"], { W: 0xffffff }));
}

// a leaf falling: two px, tinted
export function leafTexture() {
    return once("leaf", () => pic(["WW"], { W: 0xffffff }));
}

// a pennant on festival bunting, tinted
export function pennantTexture() {
    return once("pennant", () => pic(["WWW", ".W."], { W: 0xffffff }));
}

// a windmill: its tower (the sails go on it at SAILS_Y, turning: sailsTexture)
export const SAILS_Y = 9;      // px up its tower from its foot
export function windmillTexture() {
    return once("windmill", () => pic([
        "..rrr..",
        ".rrrrr.",
        ".wwwww.",
        ".wwkww.",
        ".wwwww.",
        "wwwwwww",
        "wwwwwww",
        "wwwdwww",
        "wwwdwww",
    ], { r: AP.RUST, w: AP.CREAM, k: AP.SLATE, d: AP.BARK }));
}

// its sails, a cross turning (frame 0 or 1: square on, then cornerwise)
export function sailsTexture(frame: number) {
    return once("sails" + frame, () => pic(frame ? [
        "S.......S",
        ".S.....S.",
        "..S...S..",
        "...S.S...",
        "....h....",
        "...S.S...",
        "..S...S..",
        ".S.....S.",
        "S.......S",
    ] : [
        "....S....",
        "....S....",
        "....S....",
        "....S....",
        "SSSShSSSS",
        "....S....",
        "....S....",
        "....S....",
        "....S....",
    ], { S: AP.SAND, h: AP.BARK }));
}

// a field by a farm in a season: sown rows sprouting (Spring), wheat ripe
// (Summer), stubble once it's cut (Autumn), under snow (Winter)
export function fieldTexture(season: number) {
    return once("field" + season, () => {
        const rows: string[] = [];
        for (let y = 0; y < 7; y++) {
            let r = "";
            for (let x = 0; x < 13; x++) {
                const furrow = y % 2 == 1;
                if (season == 0) r += furrow ? "d" : (x + y) % 3 == 0 ? "g" : "s";
                else if (season == 1) r += furrow ? "o" : (x * 7 + y) % 5 == 0 ? "a" : "y";
                else if (season == 2) r += furrow ? "s" : (x + y) % 2 == 0 ? "t" : "s";
                else r += furrow ? "m" : "w";
            }
            rows.push(r);
        }
        return pic(rows, { d: AP.UMBER, s: AP.CLAY, g: AP.LIME, y: AP.STRAW, o: AP.OCHRE, a: AP.AMBER, t: AP.SAND, w: AP.WHITE, m: AP.MIST });
    });
}

// an ember glowing in a crack of the ash lands
export function emberTexture() {
    return once("ember", () => pic(["fF", ".f"], { F: AP.EMBER, f: AP.FLAME }));
}

// a season champion's monument (rank 0 first: gold, 1 silver, 2 bronze), a
// hero on a tall plinth, sword raised; -1 the plinth waiting for one
const METALS = [
    { l: AP.STRAW, m: AP.AMBER, d: AP.OCHRE },
    { l: AP.WHITE, m: AP.MIST, d: AP.ASH },
    { l: AP.EMBER, m: AP.OCHRE, d: AP.RUST },
];
export function monumentTexture(rank: number) {
    const plinth = [
        "..kkkkkkk..",
        "..KKKKKKK..",
        "..KpppppK..",
        "..KKKKKKK..",
        "..KKKKKKK..",
        ".kkkkkkkkk.",
        "kKKKKKKKKKk",
    ];
    const figure = [
        ".......w...",
        "......lw...",
        ".....hlw...",
        "....mmld...",
        "...m.mmd...",
        ".....mm....",
        ".....mmd...",
        "....md.d...",
        "....m..d...",
    ];
    return once("monument" + rank, () => {
        const c = METALS[rank] ?? METALS[0];
        return pic(rank < 0 ? ["...........", ...plinth] : [...figure, ...plinth], {
            w: AP.WHITE, l: c.l, m: c.m, d: c.d, h: c.l, k: AP.STEEL, K: AP.STONE, p: AP.STRAW,
        });
    });
}
