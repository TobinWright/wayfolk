import * as PIXI from "pixi.js";
import { AP } from "../constants/Palette";
import { picTexture } from "../people/People";
import { Backdrop, FEET_Y, hash, Pic, SCENE_H, SCENE_W } from "./Backdrops";

// A hero resting (the user, 2026-10-28): a little tent for them on the map and
// on the Rest option, and in their window a camp pitched on the land they're
// in - a tent, a campfire under a pot on a tripod, a log to sit on and a pack -
// drawn in code in Apollo colours as the backdrops are. The tent's cloth goes
// with the land (canvas on the plains, red up the mountains, striped in the
// desert, hide with snow on it in the snow...); the fire flickers through a
// few frames (FIRE_FRAMES).

export const FIRE_FRAMES = 4;
export const FIRE_X = 96;                   // the middle of the fire, scene px
export const TENT_ICON = 16;                // the icon's size

export const TENT_X = 30;                   // the tent's middle (its door), scene px
export const TENT_DOOR_Y = 31;              // the top of its door, where a sleeper's Zzz come out

interface Cloth { light: number; dark: number; door: number; stripe?: number; snow?: boolean; }

const CLOTHS: { [k in Backdrop]: Cloth } = {
    plains: { light: AP.SAND, dark: AP.TAN, door: AP.BARK },
    hills: { light: AP.CREAM, dark: AP.SAND, door: AP.UMBER },
    forest: { light: AP.CLAY, dark: AP.RUST, door: AP.SOOT },
    mountains: { light: AP.FLAME, dark: AP.RED, door: AP.OXBLOOD },
    desert: { light: AP.CREAM, dark: AP.SAND, door: AP.UMBER, stripe: AP.RED },
    snow: { light: AP.CLAY, dark: AP.UMBER, door: AP.BARK, snow: true },
    swamp: { light: AP.OCHRE, dark: AP.RUST, door: AP.SOOT },
};

// an A-frame tent seen from the front: apex at (cx, top), its foot along row
// `foot`, `half` px either side; lit on the left, its door open in the middle
function tent(pic: Pic, cx: number, top: number, foot: number, half: number, c: Cloth) {
    const h = foot - top;
    for (let y = top; y <= foot; y++) {
        const w = Math.round((y - top) / h * half);
        for (let i = -w; i <= w; i++) {
            let col = i < 0 ? c.light : c.dark;
            if (c.stripe != null && (y - top) % 4 == 3) col = c.stripe;
            if (c.snow && y - top < 4 + (hash(i + 40, 11) < 0.5 ? 1 : 0)) col = i < 0 ? AP.WHITE : AP.MIST;
            if (i == -w || i == w) col = AP.BARK;
            pic.set(cx + i, y, col);
        }
    }
    // the door: a dark slit widening down, a flap tied back on the right
    const doorTop = top + Math.round(h * 0.35), dh = foot - doorTop;
    for (let y = doorTop; y <= foot; y++) {
        const w = Math.round((y - doorTop) / dh * half * 0.4);
        for (let i = -w; i <= w; i++) pic.set(cx + i, y, c.door);
        pic.set(cx + w + 1, y, c.light);
    }
    // the poles sticking up and the ropes out to pegs
    pic.set(cx, top - 1, AP.UMBER); pic.set(cx, top - 2, AP.UMBER);
    if (half > 6) for (const s of [-1, 1]) {
        const x0 = cx + s * Math.round(half * 0.5), y0 = top + Math.round(h * 0.5), x1 = cx + s * (half + 5);
        for (let x = x0; x != x1; x += s) pic.set(x + s, y0 + Math.round((x - x0) / (x1 - x0) * (foot - y0)), AP.STONE);
        pic.set(x1, foot, AP.BARK); pic.set(x1, foot - 1, AP.UMBER);
    }
}

// the camp, everything but the fire's flames, over the land
function campBack(kind: Backdrop) {
    const pic = new Pic(SCENE_W, SCENE_H);
    tent(pic, TENT_X, 22, FEET_Y, 15, CLOTHS[kind] ?? CLOTHS.plains);
    // a pack by the tent and a bedroll
    pic.oval(51, FEET_Y - 2, 3, 3, AP.CLAY, AP.UMBER); pic.rect(50, FEET_Y - 5, 2, 1, AP.BARK);
    // the log to sit on, its end showing rings
    pic.rect(108, FEET_Y - 3, 24, 3, AP.UMBER); pic.rect(108, FEET_Y - 1, 24, 1, AP.BARK);
    pic.oval(132, FEET_Y - 1.5, 1.6, 1.6, AP.TAN, AP.CLAY); pic.set(132, FEET_Y - 2, AP.UMBER);
    // the tripod and its pot
    for (let y = 26; y <= FEET_Y; y++) {
        const t = (y - 26) / (FEET_Y - 26);
        pic.set(FIRE_X - Math.round(t * 9), y, AP.BARK); pic.set(FIRE_X + Math.round(t * 9), y, AP.UMBER);
    }
    pic.set(FIRE_X, 25, AP.BARK); pic.set(FIRE_X, 28, AP.STONE); pic.set(FIRE_X, 29, AP.STONE);
    pic.oval(FIRE_X, 32, 4, 2.5, AP.STEEL, AP.IRON); pic.rect(FIRE_X - 4, 30, 9, 1, AP.SLATE);
    // the ring of stones and the logs crossed in it
    for (let i = -6; i <= 6; i += 3) pic.oval(FIRE_X + i, FEET_Y + 0.5, 1.6, 1.3, AP.STONE, AP.IRON);
    for (let i = -4; i <= 4; i++) { pic.set(FIRE_X + i, FEET_Y - 2 + Math.round(i / 3), AP.UMBER); pic.set(FIRE_X + i, FEET_Y - 2 - Math.round(i / 3), AP.BARK); }
    return pic;
}

// a frame of the flames: tongues of fire, each its own height, hot at the core
function flames(frame: number) {
    const pic = new Pic(SCENE_W, SCENE_H);
    const base = FEET_Y - 2;
    for (let i = -3; i <= 3; i++) {
        const h = Math.round((4 - Math.abs(i)) * 1.6 + hash(i + 10, frame + 20) * 3);
        for (let y = 0; y < h; y++) {
            const t = y / h, core = Math.abs(i) <= 1 && t < 0.5;
            pic.set(FIRE_X + i, base - y, core ? (t < 0.25 ? AP.STRAW : AP.AMBER) : t < 0.6 ? AP.EMBER : t < 0.85 ? AP.FLAME : AP.RED);
        }
    }
    // a spark or two over it
    for (let k = 0; k < 2; k++) pic.set(FIRE_X - 3 + Math.floor(hash(k, frame + 30) * 7), base - 9 - Math.floor(hash(k, frame + 40) * 5), AP.STRAW);
    return pic;
}

export interface CampTextures { back: PIXI.Texture; fire: PIXI.Texture[]; }

const camps = new Map<Backdrop, CampTextures>();
let fire: PIXI.Texture[];

export function campTextures(kind: Backdrop): CampTextures {
    let camp = camps.get(kind);
    if (!camp) {
        fire ??= Array.from({ length: FIRE_FRAMES }, (_, f) => picTexture(flames(f)));
        camps.set(kind, camp = { back: picTexture(campBack(kind)), fire });
    }
    return camp;
}

// the icon: a little tent with a fire by it, its foot along the bottom row
let icon: PIXI.Texture;
export function tentTexture(): PIXI.Texture {
    if (icon) return icon;
    const pic = new Pic(TENT_ICON, TENT_ICON);
    tent(pic, 6, 4, 14, 6, CLOTHS.plains);
    pic.rect(1, 15, 13, 1, AP.SHADOW);
    pic.set(12, 14, AP.UMBER); pic.set(14, 14, AP.BARK);
    pic.set(13, 13, AP.EMBER); pic.set(13, 12, AP.AMBER); pic.set(12, 13, AP.FLAME); pic.set(14, 13, AP.FLAME); pic.set(13, 14, AP.STRAW);
    return icon = picTexture(pic);
}

// what someone says at camp, in a speech bubble (components/herowindow/CampLife):
// a picture 9 x 5 inside it. O ink, R red, Y gold, y its shade, B brown, W white
export const BUBBLES = {
    dots: [".........", ".........", ".O..O..O.", ".........", "........."],
    bang: ["....O....", "....O....", "....O....", ".........", "....O...."],
    what: ["...OOO...", ".....O...", "....OO...", ".........", "....O...."],
    heart: ["..RR.RR..", ".RRRRRRR.", "..RRRRR..", "...RRR...", "....R...."],
    note: ["....OOO..", "....O.O..", "....O.O..", "..OOO.O..", "..OO....."],
    laugh: ["O.O...O..", "O.O..O.O.", "OOO..OOO.", "O.O..O.O.", "O.O..O.O."],
    coin: ["...YYY...", "..YYyYY..", "..YYyYY..", "..YYyYY..", "...YYY..."],
    star: ["....Y....", "...YYY...", ".YYYYYYY.", "...YYY...", "..Y...Y.."],
    meat: [".....BBB.", "....BBBBB", "....BBBB.", "...W.BB..", "..W......"],
    sword: ["......WO.", ".....WO..", "..O.WO...", "...BO....", "..B.O...."],
};
export type Bubble = keyof typeof BUBBLES;
export const BUBBLE_W = 11, BUBBLE_H = 9;

const INKS: { [ch: string]: number } = { O: AP.INK, R: AP.RED, Y: AP.STRAW, y: AP.OCHRE, B: AP.UMBER, W: AP.MIST };

const bubbles = new Map<Bubble, PIXI.Texture>();
// a bubble, its tail a tick under its bottom left
export function bubbleTexture(kind: Bubble): PIXI.Texture {
    let texture = bubbles.get(kind);
    if (texture) return texture;
    const pic = new Pic(BUBBLE_W, BUBBLE_H);
    pic.rect(1, 0, 9, 1, AP.INK); pic.rect(1, 6, 9, 1, AP.INK);
    pic.rect(0, 1, 1, 5, AP.INK); pic.rect(10, 1, 1, 5, AP.INK);
    BUBBLES[kind].forEach((row, y) => row.split("").forEach((ch, x) => pic.set(x + 1, y + 1, INKS[ch] ?? AP.WHITE)));
    pic.set(2, 7, AP.INK); pic.set(3, 7, AP.INK); pic.set(2, 8, AP.INK);
    bubbles.set(kind, texture = picTexture(pic));
    return texture;
}

// a sleeper's z, 4 x 4
let zzz: PIXI.Texture;
export function zTexture(): PIXI.Texture {
    if (zzz) return zzz;
    const pic = new Pic(4, 4);
    pic.rect(0, 0, 4, 1, AP.WHITE); pic.set(2, 1, AP.WHITE); pic.set(1, 2, AP.WHITE); pic.rect(0, 3, 4, 1, AP.WHITE);
    return zzz = picTexture(pic);
}
