import * as PIXI from "pixi.js";
import { AP } from "../constants/Palette";
import { pic } from "./LifeArt";

// What turns up on the map for a while (shared/Sights.ts,
// components/map/MapSights.ts), drawn as the map's life is (art/LifeArt.ts):
// tiny, a map px a pixel, facing right (the map flips them to face left).

const cache = new Map<string, PIXI.Texture>();
function once(name: string, make: () => PIXI.Texture) {
    let t = cache.get(name);
    if (!t) cache.set(name, t = make());
    return t;
}

// a wandering merchant's stall: a striped awning on poles over a counter of
// wares, a cart wheel by it
export function stallTexture() {
    return once("stall", () => pic([
        "RWRWRWRWRWRW..",
        "RWRWRWRWRWRWR.",
        ".p..........p.",
        ".p.g.b.o.r..p.",
        ".pBBBBBBBBBBp.",
        ".pBBBBBBBBBBp.",
        ".p.B......B.oo",
        ".p.B......Bo.o",
        "...........oo.",
    ], { R: AP.RED, W: AP.CREAM, p: AP.BARK, B: AP.UMBER, g: AP.STRAW, b: AP.COBALT, o: AP.BARK, r: AP.LIME }));
}

// a coin, for over the stall
export function coinTexture() {
    return once("coin", () => pic([
        ".yyy.",
        "yYyYy",
        "yYyyy",
        "yYyYy",
        ".yyy.",
    ], { y: AP.OCHRE, Y: AP.STRAW }));
}

// a dragon flying, its wings raised (frame 0) or beating down (1); the body
// the same rows in both, so it doesn't jump between them
export function dragonTexture(frame: number) {
    const up = [
        "..........W.......W.....",
        ".........WW......WW.....",
        "........WwW.....WwW.....",
        ".......WwwW....WwwW.....",
        "......WwwwW...WwwwW..hh.",
        ".....WwwwwRRRRwwwwW.hHHe",
        ".tRRRRRRRRRRRRRRRRRRHHH.",
        "tt..RRrrrrrrrrRRR...hH..",
        "t.....L.L....L.L........",
        "........................",
        "........................",
        "........................",
        "........................",
    ], down = [
        "........................",
        "........................",
        "........................",
        "........................",
        ".....................hh.",
        "....................hHHe",
        ".tRRRRRRRRRRRRRRRRRRHHH.",
        "tt..RRrrrrrrrrRRR...hH..",
        "t....WRL.L...WRL.L......",
        "....WwwwW....WwwwW......",
        "...WwwwW....WwwwW.......",
        "...WwwW.....WwwW........",
        "...WW.......WW..........",
    ];
    return once("dragon" + frame, () => pic(frame ? down : up, {
        R: AP.RED, r: AP.MAROON, W: AP.MAROON, w: AP.FLAME, t: AP.MAROON, L: AP.MAROON, h: AP.RED, H: AP.FLAME, e: AP.STRAW,
    }));
}

// a troll walking, its club over its shoulder (frame 0 or 1)
export function trollTexture(frame: number) {
    return once("troll" + frame, () => pic([
        "......cc.",
        ".....cc..",
        "..GGGc...",
        ".GGGGGG..",
        "GeGGGGGG.",
        "TGGGGGGG.",
        ".GGllGGG.",
        "G.UUUU.G.",
        "..G..G...",
        frame ? ".G....G.." : "..G..G...",
        frame ? "GG....GG." : "..GG.GG..",
    ], { G: AP.LEAF, e: AP.STRAW, T: AP.WHITE, c: AP.BARK, l: AP.LIME, U: AP.UMBER }));
}
