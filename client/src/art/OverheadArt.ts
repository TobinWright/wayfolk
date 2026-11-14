import * as PIXI from "pixi.js";
import { AP } from "../constants/Palette";
import { picTexture } from "../people/People";
import { hash, Pic } from "./Backdrops";

// What's drawn over and round heroes on the map (the user, 2026-10-31), in
// Apollo colours as the rest: a little bubble over a hero's head saying what
// they're at (a pickaxe gathering, a hammer crafting, a coin working a shift,
// a torch down a dungeon, crossed swords in a fight, a "!" on a gold bubble
// as a moment on the road waits on its player); a fight's puff, a burst of
// sparks and dust in a few frames; and a campfire, a ring of stones round
// crossed logs, its flames flickering.

export type Overhead = "gather" | "craft" | "work" | "explore" | "fight" | "moment";

// each icon 7 x 7: I iron, S steel, U umber, A amber, O ochre, F flame, Y straw, K ink
const ICONS: { [k in Overhead]: string[] } = {
    gather: [".IIIII.", "I..U..I", "...U...", "...U...", "...U...", "...U...", "...U..."],
    craft: [".SSSSS.", ".IIIII.", "...U...", "...U...", "...U...", "...U...", "...U..."],
    work: ["..OOO..", ".OAAAO.", "OAAYAAO", "OAYAAAO", "OAAAAAO", ".OAAAO.", "..OOO.."],
    explore: ["...F...", "..FYF..", "..FAF..", "...U...", "...U...", "...U...", "...U..."],
    fight: ["I.....I", ".I...I.", "..I.I..", "...I...", "..I.I..", ".A...A.", "U.....U"],
    moment: ["...K...", "...K...", "...K...", "...K...", "...K...", ".......", "...K..."],
};
const INKS: { [ch: string]: number } = { I: AP.IRON, S: AP.STEEL, U: AP.UMBER, A: AP.AMBER, O: AP.OCHRE, F: AP.FLAME, Y: AP.STRAW, K: AP.INK };

export const OVERHEAD_W = 11, OVERHEAD_H = 13;      // the bubble, its tail under it in the middle

const icons = new Map<Overhead, PIXI.Texture>();
export function overheadTexture(kind: Overhead): PIXI.Texture {
    let t = icons.get(kind);
    if (t) return t;
    const pic = new Pic(OVERHEAD_W, OVERHEAD_H), fill = kind == "moment" ? AP.STRAW : kind == "fight" ? AP.CREAM : AP.WHITE;
    pic.rect(1, 0, 9, 1, AP.INK); pic.rect(1, 10, 9, 1, AP.INK);
    pic.rect(0, 1, 1, 9, AP.INK); pic.rect(10, 1, 1, 9, AP.INK);
    pic.rect(1, 1, 9, 9, fill);
    ICONS[kind].forEach((row, y) => row.split("").forEach((ch, x) => { if (INKS[ch] != null) pic.set(x + 2, y + 2, INKS[ch]); }));
    // the tail
    pic.set(4, 11, AP.INK); pic.set(5, 11, fill); pic.set(6, 11, AP.INK); pic.set(5, 12, AP.INK);
    icons.set(kind, t = picTexture(pic));
    return t;
}

// a fight's puff: a white flash, sparks flying out, a ring of dust, the dust going
export const PUFF_FRAMES = 4, PUFF_SIZE = 15;
let puffs: PIXI.Texture[];
export function puffTextures(): PIXI.Texture[] {
    if (puffs) return puffs;
    const c = 7, ray = (pic: Pic, from: number, to: number, col: number, every = 1) => {
        for (let d = 0; d < 8; d += every) {
            const a = d * Math.PI / 4, dx = Math.round(Math.cos(a)), dy = Math.round(Math.sin(a));
            for (let r = from; r <= to; r++) pic.set(c + dx * r, c + dy * r, col);
        }
    };
    puffs = Array.from({ length: PUFF_FRAMES }, (_, f) => {
        const pic = new Pic(PUFF_SIZE, PUFF_SIZE);
        if (f == 0) { pic.oval(c + 0.5, c + 0.5, 2.2, 2.2, AP.WHITE); ray(pic, 2, 3, AP.STRAW, 2); }
        if (f == 1) { ray(pic, 1, 3, AP.WHITE); ray(pic, 4, 5, AP.STRAW); pic.set(c, c, AP.AMBER); }
        if (f == 2) {
            for (let k = 0; k < 12; k++) { const a = k * Math.PI / 6 + 0.2; pic.set(c + Math.cos(a) * 5, c + Math.sin(a) * 5, k % 3 ? AP.MIST : AP.ASH); }
            ray(pic, 6, 6, AP.STRAW, 2);
        }
        if (f == 3) for (let k = 0; k < 8; k++) if (hash(k, 3) < 0.7) { const a = k * Math.PI / 4 + 0.4; pic.set(c + Math.cos(a) * 6.5, c + Math.sin(a) * 6.5, AP.ASH); }
        return picTexture(pic);
    });
    return puffs;
}

// a campfire, 12 x 10, its foot along the bottom row
export const CAMPFIRE_FRAMES = 3, CAMPFIRE_W = 12, CAMPFIRE_H = 10;
let fires: PIXI.Texture[];
export function campfireTextures(): PIXI.Texture[] {
    if (fires) return fires;
    fires = Array.from({ length: CAMPFIRE_FRAMES }, (_, f) => {
        const pic = new Pic(CAMPFIRE_W, CAMPFIRE_H), base = CAMPFIRE_H - 3, mid = 6;
        // the logs crossed
        for (let i = -4; i <= 4; i++) { pic.set(mid + i, base + 1 + Math.round(i / 4), AP.UMBER); pic.set(mid + i, base + 1 - Math.round(i / 4), AP.BARK); }
        // the flames, each tongue its own height
        for (let i = -2; i <= 2; i++) {
            const h = Math.round((3 - Math.abs(i)) * 1.5 + hash(i + 10, f + 50) * 2.5);
            for (let y = 0; y < h; y++) {
                const t = y / h, core = Math.abs(i) <= 0 && t < 0.5;
                pic.set(mid + i, base - y, core ? AP.STRAW : t < 0.5 ? AP.AMBER : t < 0.8 ? AP.EMBER : AP.FLAME);
            }
        }
        pic.set(mid - 1 + Math.floor(hash(f, 61) * 3), base - 6 - Math.floor(hash(f, 62) * 2), AP.STRAW);
        // the ring of stones in front
        for (let x = 1; x <= 10; x += 2) { pic.set(x, CAMPFIRE_H - 1, AP.IRON); pic.set(x + 1, CAMPFIRE_H - 1, AP.STONE); pic.set(x, CAMPFIRE_H - 2, AP.STONE); }
        pic.set(0, CAMPFIRE_H - 2, AP.STONE); pic.set(11, CAMPFIRE_H - 2, AP.IRON);
        return picTexture(pic);
    });
    return fires;
}
