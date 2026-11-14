import * as PIXI from "pixi.js";
import { AP } from "../constants/Palette";
import { pic } from "./LifeArt";

// What the events leave on the world map (components/map/EventSites.ts), as
// tiny as the map's life (art/LifeArt: a map px a pixel): scaffolding going
// up, rubble and the other mess a Restoring clears, a fair's tents and flags,
// and what a won one leaves - a banner, a statue, market stalls, flowers.

const cache = new Map<string, PIXI.Texture>();
function once(name: string, make: () => PIXI.Texture) {
    let t = cache.get(name);
    if (!t) cache.set(name, t = make());
    return t;
}

export const BUILD_STEPS = 12;      // how many looks a building going up has

// a building going up in its scaffolding, `step` of BUILD_STEPS along: the
// poles first, then the walls rising behind the planks, the roof last
export function buildingTexture(step: number) {
    step = Math.max(0, Math.min(BUILD_STEPS, step));
    return once("building" + step, () => {
        const W = 15, H = 20, f = step / BUILD_STEPS;
        const rows: string[][] = Array.from({ length: H }, () => Array(W).fill("."));
        const set = (x: number, y: number, c: string) => { if (x >= 0 && x < W && y >= 0 && y < H) rows[y][x] = c; };
        // the walls, up to 13 rows by the last stretch (from the bottom), stone in courses
        const wallTop = H - 1 - Math.round(13 * Math.min(1, f / 0.8));
        for (let y = H - 1; y > wallTop; y--) for (let x = 2; x <= 12; x++) set(x, y, (x + (y % 2) * 2) % 4 == 0 ? "k" : "s");
        // a door, once the walls are past it
        if (wallTop < H - 6) for (let y = H - 5; y < H; y++) for (const x of [7, 8]) set(x, y, "d");
        // a window, higher up
        if (wallTop < H - 11) for (const [x, y] of [[4, H - 10], [5, H - 10], [10, H - 10], [11, H - 10]]) set(x, y, "w");
        // the roof, the last stretch
        if (f > 0.8) {
            const rows_ = Math.round((f - 0.8) / 0.2 * 5), top = wallTop;
            for (let k = 0; k < rows_; k++) for (let x = 1 + k; x <= 13 - k; x++) set(x, top - k, k == rows_ - 1 && f < 1 ? "R" : "r");
        }
        // the scaffolding: poles either side, rising ahead of the walls, a plank every 4 rows
        const scaffTop = Math.max(1, Math.min(wallTop - 2, H - 1 - Math.round(4 + 15 * Math.min(1, f / 0.7))));
        if (f < 1) {
            for (let y = scaffTop; y < H; y++) for (const x of [0, 14]) set(x, y, "p");
            for (let y = H - 4; y >= scaffTop; y -= 4) for (let x = 0; x < W; x++) set(x, y, x % 3 == 1 ? "P" : "b");
            // a ladder up the left
            for (let y = H - 1; y > H - 9 && y >= scaffTop; y--) set(1, y, y % 2 ? "l" : rows[y][1]);
        }
        return pic(rows.map((r) => r.join("")), {
            s: AP.STONE, k: AP.STEEL, d: AP.BARK, w: AP.SLATE, r: AP.RUST, R: AP.OCHRE,
            p: AP.UMBER, P: AP.CLAY, b: AP.TAN, l: AP.CLAY,
        });
    });
}

// a pile of rubble (one of three)
export function rubbleTexture(kind: number) {
    const rows = [
        ["..ss...", ".sSSk..", "sSkSSs.", "kSSsSSk"],
        ["...s..", ".skSs.", "sSSkSs"],
        [".ss.s..", "sSkSSks"],
    ][kind % 3];
    return once("rubble" + (kind % 3), () => pic(rows, { s: AP.ASH, S: AP.STONE, k: AP.STEEL }));
}

// silt heaped where a spring's been dug out
export function siltTexture() {
    return once("silt", () => pic(["..ccc..", ".cCCCc.", "cCCcCCc"], { c: AP.SAND, C: AP.TAN }));
}

// a burnt stump, and the sapling planted where one was
export function stumpTexture() {
    return once("stump", () => pic([".k.", "kSk", "SSS"], { k: AP.SOOT, S: AP.INK }));
}
export function saplingTexture() {
    return once("sapling", () => pic([".g.", "gGg", ".G.", ".b."], { g: AP.LIME, G: AP.LEAF, b: AP.UMBER }));
}

// a patch of blight on the ground (tinted: a farm's, a tree's, an altar's)
export function blightTexture() {
    return once("blight", () => pic(["..WWW..", ".WWWWW.", "WW.WWWW", ".WWW.W."], { W: 0xffffff }));
}

// flowers come up where it's been put right (tinted)
export function flowersTexture() {
    return once("flowers", () => pic(["F.F..", ".g.Fg", "g.g.g"], { F: 0xffffff, g: AP.LEAF }));
}

// a victory banner on a pole, red and gold, waving (frame 0 or 1)
export function bannerTexture(frame: number) {
    return once("banner" + frame, () => pic(frame ? [
        "o......",
        "pCCCCC.",
        "pCCeCCC",
        "pCeeeC.",
        "pCCeCCC",
        "pCCCCC.",
        "pC.C.C.",
        "p......", "p......", "p......", "p......", "p......", "p......", "p......",
        "kp.....",
    ] : [
        "o......",
        "pCCCCC.",
        "pCCeCC.",
        "pCeeeCC",
        "pCCeCC.",
        "pCCCCCC",
        "p.C.C..",
        "p......", "p......", "p......", "p......", "p......", "p......", "p......",
        "kp.....",
    ], { o: AP.STRAW, p: AP.BARK, C: AP.RED, e: AP.STRAW, k: AP.UMBER }));
}

// a new statue of a hero on its plinth, sword raised
export function statueTexture() {
    return once("statue", () => pic([
        "....w..",
        "...hw..",
        "..sSw..",
        ".sSSs..",
        "..SS...",
        "..SS...",
        "..S.S..",
        "..S.S..",
        "kkkkkkk",
        ".KKKKK.",
        ".KkKkK.",
        "KKKKKKK",
    ], { w: AP.MIST, h: AP.ASH, s: AP.STONE, S: AP.ASH, k: AP.STEEL, K: AP.STONE }));
}

// a market stall, its awning striped in a colour and white, goods on the counter
export function stallTexture(colour: number) {
    return once("stall" + colour, () => pic([
        "ACACACA",
        "ACACACA",
        "p.....p",
        "p.....p",
        "bgybgrb",
        "BBBBBBB",
        "B.....B",
    ], { A: colour, C: AP.WHITE, p: AP.UMBER, b: AP.CLAY, B: AP.UMBER, g: AP.LIME, y: AP.STRAW, r: AP.RED }));
}

// a fair's tent, striped in a colour and white, a pennant on top
export function tentTexture(colour: number) {
    return once("fairtent" + colour, () => pic([
        "....F....",
        "....pF...",
        "....p....",
        "...ACA...",
        "..AACAA..",
        ".AACACAA.",
        "AACACACAA",
        ".ACAdACA.",
        ".ACAdACA.",
    ], { F: AP.STRAW, p: AP.BARK, A: colour, C: AP.WHITE, d: AP.SOOT }));
}

// a flag on a tall pole (tinted), waving (frame 0 or 1)
export function flagTexture(frame: number) {
    return once("flag" + frame, () => pic(frame ? [
        "oFFF.", "pFFFF", "pFF..", "p....", "p....", "p....", "p....", "p....", "p....", "p....",
    ] : [
        "oFFFF", "pFFF.", "p.FF.", "p....", "p....", "p....", "p....", "p....", "p....", "p....",
    ], { o: AP.STRAW, p: AP.BARK, F: 0xffffff }));
}

// a fire still burning in the ruins a marching boss left
export function embersTexture(frame: number) {
    return once("embers" + frame, () => pic(frame ? ["..f..", ".fFf.", "fFYFf", "kkkkk"] : [".f...", ".fF.f", "fFYFf", "kkkkk"],
        { f: AP.FLAME, F: AP.EMBER, Y: AP.STRAW, k: AP.SOOT }));
}
