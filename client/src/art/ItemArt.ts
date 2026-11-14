import { Skill, Stat } from "../../../shared/Heroes";
import { makeOf, Quality, qualityOf } from "../../../shared/Tasks";
import { AP } from "../constants/Palette";
import { Pic } from "./Backdrops";

// Every item's picture (the user, 2026-10-28): the materials gathered
// (shared/Locations.ts's MATERIALS) and the things crafted from them
// (shared/Tasks.ts's RECIPES), 14 x 14, drawn in code in Apollo colours as
// the menu's icons are - outlined, they're 16 x 16. A handful of shapes (ore,
// a crystal, a log, a bar...) in each item's own colours.

export const ITEM_ART = 14;

type Ramp = [number, number, number];      // light, mid, dark

const pics = new Map<number, Pic>();

// an item's picture, by its id (a pouch for one with none of its own)
export function itemPic(id: number) {
    let p = pics.get(id);
    if (!p) {
        p = new Pic(ITEM_ART, ITEM_ART);
        (ITEMS[id] ?? made(id) ?? pouch)(p);
        centre(p);
        const q = qualityOf(id);
        if (q) sparkle(p, QUALITY_COLOURS[q], q == Quality.MASTERWORK);
        pics.set(id, p);
    }
    return p;
}

// a thing's quality, by colour (shared/Tasks.ts Quality): Normal none, Fine green, Superior blue, Masterwork gold
export const QUALITY_COLOURS = [AP.WHITE, AP.LIME, AP.SKY, AP.STRAW];

// a shape moved so the empty rows over and under it, and the empty columns either side, are as even as can be
function centre(p: Pic) {
    const row = (y: number) => p.p.slice(y * p.w, (y + 1) * p.w).some((c) => c >= 0);
    const column = (x: number) => p.p.some((c, i) => c >= 0 && i % p.w == x);
    let top = 0, bottom = 0, left = 0, right = 0;
    while (top < p.h && !row(top)) top++;
    if (top == p.h) return;
    while (!row(p.h - 1 - bottom)) bottom++;
    while (!column(left)) left++;
    while (!column(p.w - 1 - right)) right++;
    const by = Math.floor((bottom - top) / 2), bx = Math.floor((right - left) / 2);
    if (!by && !bx) return;
    const was = p.p.slice();
    p.p.fill(-1);
    for (let y = top; y < p.h - bottom; y++) for (let x = left; x < p.w - right; x++) p.p[(y + by) * p.w + x + bx] = was[y * p.w + x];
}

// a quality's mark: a little four-pointed sparkle in the top left corner
function sparkle(p: Pic, c: number, bright: boolean) {
    for (const [x, y] of [[1, 0], [0, 1], [2, 1], [1, 2]]) p.set(x, y, c);
    p.set(1, 1, bright ? AP.WHITE : c);
}

//#region the shapes

// a lump of rock, flecks of metal in it
const ore = (fleck: [number, number], rock: Ramp = [AP.ASH, AP.STONE, AP.STEEL]) => (p: Pic) => {
    lump(p, rock);
    for (const [x, y] of [[4, 6], [8, 5], [9, 9], [4, 10], [10, 7], [6, 8]]) { p.set(x, y, fleck[0]); p.set(x + 1, y, fleck[1]); }
};

// a lump of rock, plain
const rock = (c: Ramp) => (p: Pic) => lump(p, c);

function lump(p: Pic, [l, m, d]: Ramp) {
    p.oval(6, 8.5, 5.5, 4.5, m, d);
    p.oval(9, 6.5, 4, 3.5, m, d);
    p.oval(5, 6.5, 2.5, 1.5, l);
}

// a tall crystal, a small one beside it
const crystal = ([l, m, d]: Ramp) => (p: Pic) => {
    for (let y = 5; y <= 12; y++) {
        const w = y == 5 ? 0 : y == 6 ? 1 : 2;
        for (let x = 11 - w; x <= 11 + w; x++) p.set(x, y, x < 11 ? m : d);
    }
    for (let y = 1; y <= 12; y++) {
        const w = y == 1 ? 1 : y == 2 ? 2 : 3;
        for (let x = 7 - w; x < 7 + w; x++) p.set(x, y, x < 6 ? l : x < 8 ? m : d);
    }
    p.set(5, 4, AP.WHITE);
};

// a log on its side, its cut end towards us
const log = ([l, m, d]: Ramp, ring: [number, number]) => (p: Pic) => {
    p.rect(1, 5, 10, 6, m);
    p.rect(1, 5, 10, 1, l);
    p.rect(1, 10, 10, 1, d);
    p.rect(3, 7, 3, 1, d); p.rect(6, 9, 3, 1, d);
    p.oval(11, 8, 2.5, 3.5, ring[0], ring[1]);
    p.set(11, 8, ring[1]);
};

// a bar of metal
const bar = ([l, m, d]: Ramp) => (p: Pic) => {
    for (let y = 4; y <= 6; y++) p.rect(7 - y, y, 2 * y, 1, l);
    p.rect(1, 7, 12, 4, m);
    p.rect(1, 10, 12, 1, d);
    p.rect(12, 7, 1, 4, d);
    p.set(3, 8, l); p.set(4, 8, l);
};

// two boards, one over the other
const planks = ([l, m, d]: Ramp) => (p: Pic) => {
    for (const [x, y] of [[0, 3], [2, 8]]) {
        p.rect(x, y, 12, 4, m);
        p.rect(x, y, 12, 1, l);
        p.rect(x, y + 3, 12, 1, d);
        p.rect(x + 3, y + 1, 4, 1, d);
        p.set(x + 10, y + 2, d);
    }
};

// a block, its top and side showing
const block = ([l, m, d]: Ramp) => (p: Pic) => {
    for (let y = 2; y <= 4; y++) p.rect(6 - y, y, 9, 1, l);
    p.rect(1, 5, 9, 8, m);
    for (let k = 1; k <= 3; k++) p.rect(9 + k, 5 - k, 1, 8, d);
    p.rect(1, 8, 9, 1, d);
    p.rect(5, 9, 1, 4, d);
};

// a bolt of cloth, rolled
const bolt = ([l, m, d]: Ramp) => (p: Pic) => {
    p.rect(3, 10, 6, 3, m);
    p.rect(8, 10, 1, 3, d);
    p.rect(1, 3, 9, 8, m);
    p.rect(1, 3, 9, 1, l);
    p.rect(1, 10, 9, 1, d);
    p.rect(1, 6, 9, 1, d);
    p.oval(10, 7, 2.5, 4, l, m);
    p.set(10, 7, d); p.set(10, 6, d);
};

// a heap of powder, specks in it
const heap = ([l, m, d]: Ramp, speck = d) => (p: Pic) => {
    for (let y = 4; y <= 12; y++) {
        const w = Math.min(6, y - 3);
        for (let x = 7 - w; x < 7 + w; x++) p.set(x, y, y == 12 ? d : x < 5 ? l : x < 9 ? m : d);
    }
    for (const [x, y] of [[6, 7], [4, 10], [9, 9], [8, 11], [3, 11], [7, 5]]) p.set(x, y, speck);
};

// a corked bottle
const bottle = ([l, m, d]: Ramp) => (p: Pic) => {
    p.rect(6, 0, 2, 2, AP.CLAY);
    p.rect(6, 2, 2, 3, AP.ASH);
    p.oval(7, 9, 5, 4.5, m, d);
    p.set(4, 7, AP.WHITE); p.set(4, 8, l); p.set(5, 7, l);
};

// a scale, pointed at its foot
const scale = ([l, m, d]: Ramp) => (p: Pic) => {
    p.oval(7, 6, 5.5, 4.5, m, d);
    for (let y = 9; y <= 13; y++) { const w = 13 - y; p.rect(7 - w, y, w * 2, 1, y == 9 ? m : d); p.set(7 - w, y, m); }
    p.rect(5, 3, 1, 6, l);
    p.set(6, 2, l);
};

// a gem, cut
const gem = ([l, m, d]: Ramp) => (p: Pic) => {
    for (let y = 3; y <= 11; y++) {
        const w = y <= 5 ? y + 1 : 12 - y;
        for (let x = 7 - w; x < 7 + w; x++) p.set(x, y, y <= 5 ? l : x < 7 ? m : d);
    }
    p.rect(3, 6, 8, 1, d);
    p.set(5, 4, AP.WHITE);
};

// a drop
const drop = ([l, m, d]: Ramp) => (p: Pic) => {
    p.oval(7, 9, 4.5, 4.5, m, d);
    for (let y = 1; y <= 5; y++) { const w = Math.ceil(y / 2); p.rect(7 - w, y, w * 2, 1, m); }
    p.set(5, 8, l); p.set(5, 9, l); p.set(6, 7, l);
};

//#endregion

//#region one-offs

function hide(p: Pic) {
    for (const [x, y] of [[1, 1], [11, 1], [1, 11], [11, 11]]) p.rect(x, y, 2, 2, AP.CLAY);
    p.rect(3, 2, 8, 10, AP.CLAY);
    p.rect(3, 2, 8, 1, AP.TAN);
    p.rect(10, 3, 1, 9, AP.UMBER);
    p.rect(3, 11, 8, 1, AP.UMBER);
    p.rect(6, 4, 2, 6, AP.TAN);
}

function fang(p: Pic) {
    const rows: [number, number][] = [[3, 7], [3, 7], [4, 7], [4, 8], [5, 8], [5, 8], [6, 8], [6, 8], [7, 8], [7, 8], [8, 8]];
    rows.forEach(([a, b], i) => { p.rect(a, i + 2, b - a + 1, 1, i < 2 ? AP.TAN : AP.CREAM); p.set(b, i + 2, i < 2 ? AP.CLAY : AP.SAND); });
}

function scarab(p: Pic) {
    for (const y of [5, 8, 11]) { p.set(1, y, AP.INK); p.set(12, y, AP.INK); }
    p.rect(5, 0, 4, 2, AP.INK);
    p.oval(7, 8, 5, 6, AP.GRASS, AP.FOREST);
    p.rect(7, 3, 1, 10, AP.PINE);
    p.set(4, 5, AP.LIME); p.set(4, 6, AP.LIME); p.set(9, 5, AP.LIME);
}

function bone(p: Pic) {
    for (const [x, y] of [[2, 5.5], [2, 8.5], [12, 5.5], [12, 8.5]]) p.oval(x, y, 1.8, 1.8, AP.CREAM, AP.SAND);
    p.rect(2, 6, 10, 2, AP.CREAM);
    p.rect(2, 8, 10, 1, AP.SAND);
}

function boneCharm(p: Pic) {
    for (const [x, y] of [[3, 0], [3, 1], [4, 2], [4, 3], [5, 4], [6, 5], [10, 0], [10, 1], [9, 2], [9, 3], [8, 4], [7, 5]]) p.set(x, y, AP.UMBER);
    p.oval(7, 9.5, 3.5, 4, AP.CREAM, AP.SAND);
    p.rect(6, 9, 2, 2, AP.RED);
    p.set(6, 9, AP.FLAME);
}

function runestone(p: Pic) {
    lump(p, [AP.STONE, AP.STEEL, AP.IRON]);
    for (const [x, y] of [[5, 5], [5, 6], [5, 7], [5, 8], [5, 9], [6, 6], [7, 7], [9, 6], [9, 7], [9, 8], [10, 9], [8, 9]]) p.set(x, y, AP.ICE);
}

function relic(p: Pic) {
    p.rect(1, 2, 11, 11, AP.ASH);
    for (let k = 0; k < 4; k++) p.rect(12 - k - 1, 2 + k * 2, k + 1, 2, -1);
    p.rect(1, 12, 9, 1, AP.STONE);
    p.rect(1, 2, 11, 1, AP.MIST);
    for (const y of [5, 7, 9]) p.rect(3, y, y == 9 ? 3 : 5, 1, AP.STEEL);
    p.set(4, 4, AP.AMBER);
}

function magmaCore(p: Pic) {
    p.oval(7, 7.5, 6, 6, AP.OXBLOOD, AP.SOOT);
    p.oval(7, 7.5, 3.5, 3.5, AP.EMBER, AP.FLAME);
    p.oval(6.5, 7, 1.5, 1.5, AP.STRAW);
    for (const [x, y] of [[2, 6], [3, 10], [11, 4], [11, 10], [7, 2]]) p.set(x, y, AP.FLAME);
}

function bark(p: Pic) {
    p.rect(3, 1, 8, 12, AP.UMBER);
    p.rect(3, 1, 1, 12, AP.CLAY);
    p.rect(10, 1, 1, 12, AP.BARK);
    for (const [x, y, h] of [[5, 2, 5], [8, 4, 6], [6, 9, 3]]) p.rect(x, y, 1, h, AP.BARK);
    p.set(4, 3, AP.LEAF); p.set(4, 4, AP.GRASS); p.set(9, 11, AP.LEAF);
}

function shadowEssence(p: Pic) {
    p.oval(7, 9, 4.5, 4, AP.VIOLET, AP.GRAPE);
    for (let y = 1; y <= 6; y++) { const w = Math.ceil(y / 2); p.rect(7 - w + (y < 3 ? 1 : 0), y, w * 2, 1, AP.VIOLET); }
    p.oval(7, 9.5, 2, 2, AP.ORCHID, AP.MAGENTA);
    p.set(6, 9, AP.PINK);
}

function goldLeaf(p: Pic) {
    p.rect(2, 2, 10, 10, AP.STRAW);
    p.rect(11, 2, 1, 10, AP.OCHRE);
    p.rect(2, 11, 10, 1, AP.OCHRE);
    for (const [x, y] of [[4, 4], [5, 5], [8, 3], [7, 8], [8, 9], [4, 9]]) p.set(x, y, AP.AMBER);
    p.rect(3, 3, 2, 1, AP.CREAM);
}

function lotus(p: Pic) {
    p.oval(7, 11, 6.5, 2, AP.GRASS, AP.LEAF);
    for (const [x, y, rx, ry] of [[3.5, 8, 2.5, 1.5], [10.5, 8, 2.5, 1.5], [7, 5, 1.5, 3.5], [5, 6.5, 1.5, 2.5], [9, 6.5, 1.5, 2.5]])
        p.oval(x, y, rx, ry, AP.PINK, AP.ORCHID);
    p.oval(7, 8.5, 1.5, 1, AP.STRAW);
}

function flax(p: Pic) {
    for (let x = 4; x <= 9; x++) p.rect(x, 3 + (x % 2), 1, 10 - (x % 2), x % 2 ? AP.AMBER : AP.STRAW);
    p.rect(3, 8, 8, 1, AP.UMBER);
    for (const [x, y] of [[4, 1], [6, 0], [8, 1], [9, 2], [5, 2]]) p.set(x, y, AP.SKY);
}

function wool(p: Pic) {
    for (const [x, y, rx, ry] of [[4.5, 8, 3.5, 3.5], [9.5, 8, 3.5, 3.5], [7, 5.5, 3.5, 3], [7, 10, 4, 2.5]]) p.oval(x, y, rx, ry, AP.WHITE, AP.MIST);
    for (const [x, y] of [[5, 6], [8, 8], [10, 6], [6, 10]]) p.set(x, y, AP.ASH);
}

function silk(p: Pic) {
    p.rect(3, 4, 8, 7, AP.MIST);
    for (const y of [5, 7, 9]) p.rect(3, y, 8, 1, AP.WHITE);
    p.rect(10, 4, 1, 7, AP.ASH);
    p.rect(2, 2, 10, 2, AP.CLAY);
    p.rect(2, 11, 10, 2, AP.UMBER);
    p.rect(11, 2, 1, 2, AP.UMBER);
}

function scrap(p: Pic) {
    p.rect(1, 6, 7, 6, AP.RUST);
    p.rect(1, 6, 7, 1, AP.OCHRE);
    p.rect(7, 2, 6, 7, AP.STEEL);
    p.rect(7, 2, 6, 1, AP.ASH);
    p.rect(12, 3, 1, 6, AP.IRON);
    for (const [x, y] of [[9, 5], [10, 7], [8, 4], [3, 8], [5, 10], [11, 4]]) p.set(x, y, AP.RUST);
    p.set(2, 9, AP.OXBLOOD); p.set(6, 11, AP.OXBLOOD);
}

// an herb's sprig: a stem, leaves up it in pairs, a flower on top (none: leaves only)
const herb = (leaf: Ramp, flower?: [number, number]) => (p: Pic) => {
    p.column(7, 3, AP.FOREST, 13);
    for (const y of [10, 7, 4]) {
        p.oval(4.5, y, 2.5, 1.2, leaf[1], leaf[2]); p.set(3, y, leaf[0]);
        p.oval(9.5, y - 1, 2.5, 1.2, leaf[1], leaf[2]); p.set(10, y - 1, leaf[0]);
    }
    if (flower) { p.oval(7, 2, 2, 1.8, flower[0], flower[1]); p.set(7, 2, AP.STRAW); }
};

// a fish, facing left
const fish = ([l, m, d]: Ramp, fin = d) => (p: Pic) => {
    p.oval(6, 7, 5, 3, m, d);
    p.rect(2, 6, 7, 1, l);
    for (let k = 0; k < 3; k++) p.rect(11 + k, 7 - k - 1, 1, 2 * k + 3, fin);
    p.set(3, 6, AP.BLACK); p.set(6, 4, fin); p.set(7, 4, fin);
};

// a haunch of meat, the bone out of it
const meat = ([l, m, d]: Ramp) => (p: Pic) => {
    p.oval(5.5, 8, 4.5, 4, m, d);
    p.oval(4.5, 6.5, 2, 1.5, l);
    p.rect(9, 3, 2, 4, AP.CREAM); p.set(10, 2, AP.WHITE); p.set(11, 2, AP.CREAM); p.set(11, 3, AP.SAND);
};

function wheat(p: Pic) {
    for (const x of [4, 7, 10]) {
        p.column(x, 5, AP.OCHRE, 13);
        for (let y = 1; y <= 5; y++) { p.set(x - 1, y, y % 2 ? AP.STRAW : AP.AMBER); p.set(x + 1, y, y % 2 ? AP.AMBER : AP.STRAW); }
        p.set(x, 0, AP.STRAW);
    }
    p.rect(3, 9, 9, 1, AP.UMBER);
}

function apple(p: Pic) {
    p.oval(7, 8, 5, 4.5, AP.RED, AP.MAROON);
    p.oval(5, 6.5, 1.5, 1.2, AP.FLAME);
    p.column(7, 1, AP.BARK, 4); p.oval(9.5, 2.5, 2, 1, AP.LEAF, AP.FOREST);
}

function honeycomb(p: Pic) {
    p.rect(1, 2, 12, 10, AP.AMBER);
    for (const [x, y] of [[2, 3], [6, 3], [10, 3], [4, 6], [8, 6], [2, 9], [6, 9], [10, 9]]) { p.rect(x, y, 2, 2, AP.OCHRE); p.set(x, y, AP.STRAW); }
    p.rect(1, 11, 12, 1, AP.RUST);
    p.set(5, 12, AP.AMBER); p.set(5, 13, AP.STRAW);
}

// a glass vial, empty (or with a little in it)
function vial(p: Pic) {
    p.rect(6, 1, 2, 1, AP.CLAY);
    p.rect(5, 2, 4, 10, AP.MIST); p.rect(6, 3, 2, 8, -1);
    p.rect(5, 12, 4, 1, AP.ASH);
    p.set(6, 3, AP.WHITE); p.set(6, 4, AP.WHITE);
}

// a round flask, stoppered, something in it (a glass vial's better ones: a glint)
const flask = ([l, m, d]: Ramp) => (p: Pic) => {
    p.rect(6, 0, 2, 2, AP.CLAY);
    p.rect(6, 2, 2, 3, AP.MIST);
    p.oval(7, 9, 5, 4.5, AP.MIST, AP.ASH);
    p.oval(7, 9.5, 4, 3.5, m, d);
    p.rect(3, 8, 8, 1, l);
    p.set(4, 7, AP.WHITE);
};

// a tall thin draught, a label on it
const draught = ([l, m, d]: Ramp) => (p: Pic) => {
    p.rect(6, 0, 2, 2, AP.CLAY);
    p.rect(4, 2, 6, 11, AP.ASH);
    p.rect(5, 3, 4, 9, m); p.rect(5, 3, 1, 9, l); p.rect(8, 3, 1, 9, d);
    p.rect(5, 7, 4, 2, AP.CREAM);
};

// a bomb, a fuse alight
function bomb(p: Pic) {
    p.oval(6.5, 8.5, 5, 4.5, AP.IRON, AP.SHADOW);
    p.oval(5, 7, 1.5, 1.2, AP.STEEL);
    p.rect(9, 3, 2, 2, AP.STEEL);
    p.set(11, 2, AP.TAN); p.set(12, 1, AP.STRAW); p.set(13, 0, AP.FLAME); p.set(12, 0, AP.EMBER);
}

function bread(p: Pic) {
    p.oval(7, 8, 6, 3.5, AP.OCHRE, AP.RUST);
    p.oval(6, 6.5, 4.5, 1.5, AP.AMBER);
    for (const x of [4, 7, 10]) p.set(x, 6, AP.STRAW);
}

// a bowl of something (stew, soup)
const bowl = ([l, m]: [number, number]) => (p: Pic) => {
    p.oval(7, 7, 6, 2, m, l);
    for (const [x, y] of [[5, 7], [8, 6], [9, 8]]) p.set(x, y, l);
    for (let y = 8; y <= 12; y++) { const w = 6 - Math.floor((y - 8) * 1.2); p.rect(7 - w, y, w * 2, 1, y == 8 ? AP.CLAY : AP.UMBER); }
    p.column(4, 1, AP.MIST, 4); p.column(9, 2, AP.MIST, 5);
};

// a pie, its crust latticed (a filling's colour through it)
const pie = (filling: number) => (p: Pic) => {
    p.oval(7, 8, 6.5, 3.5, AP.OCHRE, AP.RUST);
    p.oval(7, 7.5, 5, 2.5, filling);
    for (const x of [4, 7, 10]) p.column(x, 5, AP.AMBER, 11);
    p.rect(2, 7, 10, 1, AP.AMBER);
};

// a dish: a plate, what's on it drawn over (a fish, a roast)
const plated = (on: (p: Pic) => void) => (p: Pic) => {
    p.oval(7, 10, 6.5, 2.5, AP.WHITE, AP.MIST);
    on(p);
};

function cake(p: Pic) {
    p.rect(2, 6, 10, 6, AP.CREAM); p.rect(2, 11, 10, 1, AP.SAND);
    p.rect(2, 5, 10, 2, AP.AMBER); for (const x of [3, 6, 9]) p.set(x, 7, AP.AMBER);
    p.rect(11, 6, 1, 6, AP.TAN);
    p.set(7, 3, AP.RED); p.set(7, 4, AP.MAROON);
}

function feast(p: Pic) {
    p.oval(7, 10, 6.5, 2.5, AP.STRAW, AP.AMBER);
    fish([AP.FOAM, AP.SKY, AP.COBALT], AP.DENIM)(p);
    p.oval(11, 9, 2, 1.5, AP.OCHRE, AP.RUST);
}

function pouch(p: Pic) {
    p.oval(7, 9, 5, 4, AP.CLAY, AP.UMBER);
    p.rect(5, 3, 4, 3, AP.CLAY);
    p.rect(4, 5, 6, 1, AP.BARK);
}

//#endregion

//#region weapons, armour, jewellery and tools (shared/Tasks.ts's MAKES): a shape
// for each kind, in its tier's material's colours, wooden handles

// a material's colours, as its things are drawn in
const RAMPS: { [id: number]: Ramp } = {
    101: [AP.EMBER, AP.OCHRE, AP.RUST],         // bronze
    102: [AP.ASH, AP.STONE, AP.STEEL],          // iron
    103: [AP.WHITE, AP.MIST, AP.ASH],           // silver
    104: [AP.STRAW, AP.AMBER, AP.OCHRE],        // gold
    105: [AP.FOAM, AP.ICE, AP.SKY],             // mithril
    117: [AP.LIME, AP.LEAF, AP.FOREST],         // adamantite
    118: [AP.ICE, AP.SKY, AP.COBALT],           // starmetal
    119: [AP.FLAME, AP.RED, AP.MAROON],         // dragonsteel
    106: [AP.CREAM, AP.SAND, AP.TAN],           // pine
    107: [AP.TAN, AP.CLAY, AP.UMBER],           // oak
    108: [AP.EMBER, AP.OCHRE, AP.RUST],         // maple
    120: [AP.CLAY, AP.RUST, AP.OXBLOOD],        // yew
    121: [AP.STONE, AP.STEEL, AP.IRON],         // ironwood
    122: [AP.FLAME, AP.RED, AP.MAROON],         // heartwood
    110: [AP.TAN, AP.CLAY, AP.UMBER],           // leather
    112: [AP.FLAME, AP.RED, AP.MAROON],         // wool
    113: [AP.PINK, AP.ORCHID, AP.MAGENTA],      // silk
    123: [AP.LIME, AP.GRASS, AP.FOREST],        // scaled
    124: [AP.ORCHID, AP.VIOLET, AP.GRAPE],      // shadowweave
    125: [AP.EMBER, AP.RED, AP.MAROON],         // dragonhide
};
// jewellery's gem, by its stat
const GEMS: [number, number][] = [];
GEMS[Stat.STR] = [AP.FLAME, AP.RED];
GEMS[Stat.AGI] = [AP.FOAM, AP.ICE];
GEMS[Stat.INT] = [AP.SKY, AP.COBALT];
GEMS[Stat.VIT] = [AP.LIME, AP.GRASS];
GEMS[Stat.LCK] = [AP.PINK, AP.ORCHID];

// a line going up and to the right (/) or down and to the right (\), from x, y
function up(p: Pic, x: number, y: number, n: number, c: number) {
    for (let k = 0; k < n; k++) p.set(x + k, y - k, c);
}
function down(p: Pic, x: number, y: number, n: number, c: number) {
    for (let k = 0; k < n; k++) p.set(x + k, y + k, c);
}
// a handle, / from x, y
function handle(p: Pic, x: number, y: number, n: number) {
    up(p, x, y, n, AP.CLAY);
    up(p, x + 1, y, n - 1, AP.UMBER);
}

const SHAPES: { [type: string]: (p: Pic, r: Ramp, soft: boolean, gem: [number, number]) => void } = {
    sword: (p, [l, m, d]) => {
        up(p, 5, 8, 8, l); up(p, 6, 8, 7, d); up(p, 6, 9, 7, m);
        down(p, 2, 7, 5, d);
        handle(p, 2, 11, 2); p.set(1, 12, m);
    },
    axe: (p, [l, m, d]) => {
        handle(p, 2, 12, 10);
        p.oval(9, 4, 3.5, 3.5, m, d); p.oval(4.5, 3.5, 2, 2.5, m, d);
        up(p, 9, 4, 3, AP.UMBER);
        p.set(10, 1, l); p.set(11, 2, l); p.set(3, 2, l);
    },
    mace: (p, [l, m, d]) => {
        handle(p, 2, 12, 7);
        p.oval(9.5, 4.5, 3, 3, m, d);
        for (const [x, y] of [[9, 0], [13, 4], [6, 4], [10, 8], [12, 1]]) p.set(x, y, d);
        p.set(8, 3, l); p.set(9, 3, l);
    },
    spear: (p, [l, m, d]) => {
        handle(p, 1, 13, 10);
        up(p, 10, 4, 4, l); up(p, 10, 5, 4, d); p.set(9, 3, m); p.set(11, 5, m); p.set(10, 2, m); p.set(12, 4, m);
    },
    dagger: (p, [l, m, d]) => {
        up(p, 6, 7, 6, l); up(p, 7, 7, 5, d); up(p, 7, 8, 5, m);
        down(p, 3, 6, 5, d);
        handle(p, 3, 10, 2); p.set(2, 11, m);
    },
    bow: (p, [l, m, d]) => {
        for (let y = 0; y < 14; y++) {
            const x = 3 + Math.round(6 * Math.sin(Math.PI * y / 13));
            p.set(x, y, m); p.set(x + 1, y, d);
            if (y > 3 && y < 10) p.set(x - 1, y, l);
        }
        p.column(3, 1, AP.MIST, 13);
        p.rect(8, 6, 2, 2, AP.UMBER);
    },
    staff: (p, [l, m, d]) => {
        up(p, 2, 13, 8, m); up(p, 3, 13, 7, d);
        p.oval(10.5, 3.5, 3, 3, m, d); p.set(9, 2, l);
        p.oval(10.5, 3.5, 1.2, 1.2, AP.FOAM, AP.ICE);
    },
    shield: (p, [l, m, d]) => {
        for (let y = 1; y <= 13; y++) {
            const w = y < 8 ? 6 : 6 - (y - 7);
            p.rect(7 - w, y, 2 * w, 1, y == 1 || y == 13 ? d : m);
            p.set(7 - w, y, d); p.set(6 + w, y, d);
        }
        p.rect(6, 2, 2, 10, l); p.rect(2, 5, 10, 2, l);
        p.oval(7, 6, 1.5, 1.5, d);
    },
    helm: (p, [l, m, d], soft) => {
        p.oval(7, 7, 6, 6, m, d);
        p.rect(1, 7, 12, 6, m); p.column(12, 7, d, 13); p.rect(1, 12, 12, 1, d);
        p.rect(3, 3, 2, 2, l);
        if (soft) { p.oval(7, 9.5, 3, 3.5, AP.SOOT); p.rect(4, 13, 6, 1, -1); }
        else { p.rect(3, 8, 8, 1, AP.INK); p.column(7, 9, d, 12); }
    },
    body: (p, [l, m, d], soft) => {
        p.rect(0, 2, 14, 4, m); p.rect(2, 2, 10, 12, m);
        p.rect(0, 2, 14, 1, l); p.column(11, 3, d); p.column(13, 2, d, 6); p.rect(2, 13, 10, 1, d);
        p.oval(7, 2, 2.5, 1.5, -1);
        if (soft) p.rect(2, 9, 10, 1, d);
        else { p.column(7, 4, d, 12); p.rect(3, 4, 2, 3, l); }
    },
    gloves: (p, [l, m, d]) => {
        p.rect(3, 3, 6, 8, m); p.rect(3, 3, 6, 1, l); p.column(8, 3, d, 11);
        for (const x of [4, 6]) p.column(x, 3, d, 6);
        p.rect(9, 6, 2, 3, m); p.set(10, 8, d);
        p.rect(2, 11, 8, 2, d); p.rect(2, 11, 8, 1, m);
    },
    feet: (p, [l, m, d]) => {
        p.rect(3, 1, 5, 9, m); p.rect(3, 1, 5, 1, l); p.column(7, 2, d, 9);
        p.rect(3, 8, 9, 4, m); p.set(11, 8, -1); p.rect(8, 8, 3, 1, l);
        p.rect(3, 12, 10, 1, d);
    },
    ring: (p, [l, m, d], _, gem) => {
        p.oval(7, 8.5, 5, 4.5, m, d);
        p.oval(7, 8.5, 3, 2.5, -1);
        p.set(3, 7, l); p.set(4, 6, l);
        p.oval(7, 3.5, 2.5, 2, gem[0], gem[1]); p.set(6, 3, AP.WHITE);
    },
    amulet: (p, [l, m, d], _, gem) => {
        down(p, 2, 0, 5, d); up(p, 7, 4, 5, d);
        p.oval(7, 9, 4, 4.5, m, d); p.set(5, 6, l);
        p.oval(7, 9, 2, 2.5, gem[0], gem[1]); p.set(6, 8, AP.WHITE);
    },
    pickaxe: (p, [l, m, d]) => {
        handle(p, 3, 12, 7);
        down(p, 5, 1, 9, m); down(p, 6, 1, 7, l);
        p.set(4, 2, d); p.set(13, 9, d); p.set(12, 9, d);
    },
    hatchet: (p, [l, m, d]) => {
        handle(p, 3, 12, 8);
        p.rect(7, 2, 5, 4, m); p.rect(11, 1, 2, 6, l); p.rect(7, 5, 5, 1, d);
    },
    sickle: (p, [l, m, d]) => {
        handle(p, 2, 12, 4);
        p.oval(8, 5.5, 5, 5, m, d);
        p.oval(6.5, 7, 4, 4.5, -1);
        p.set(9, 1, l); p.set(10, 1, l);
    },
    rod: (p, [, m, d]) => {
        up(p, 1, 13, 12, m); up(p, 2, 13, 11, d);
        p.column(12, 2, AP.MIST, 11); p.set(11, 11, AP.STONE); p.set(11, 10, AP.STONE);
        p.oval(4, 10, 1.5, 1.5, AP.STONE, AP.STEEL);
    },
    knife: (p, [l, m, d]) => {
        up(p, 6, 7, 6, l); up(p, 6, 8, 6, m); up(p, 7, 8, 5, d);
        handle(p, 2, 11, 4);
    },
    hammer: (p, [l, m, d]) => {
        p.rect(2, 2, 10, 4, m); p.rect(2, 2, 10, 1, l); p.rect(2, 5, 10, 1, d); p.column(11, 2, d, 6);
        p.rect(6, 6, 2, 8, AP.CLAY); p.column(7, 6, AP.UMBER);
    },
    saw: (p, [l, m, d]) => {
        p.rect(0, 4, 10, 5, m); p.rect(0, 4, 10, 1, l);
        for (let x = 0; x < 10; x += 2) p.set(x, 9, d);
        p.rect(9, 3, 4, 7, AP.CLAY); p.rect(10, 5, 2, 3, -1); p.column(12, 3, AP.UMBER, 10);
    },
    mortar: (p, [l, m, d]) => {
        up(p, 7, 8, 6, AP.ASH); up(p, 8, 8, 5, AP.STONE);
        p.oval(7, 10, 6, 3.5, m, d);
        p.rect(2, 8, 10, 1, l); p.rect(4, 9, 6, 1, AP.SOOT);
    },
    pan: (p, [l, m, d]) => {
        p.oval(5.5, 8, 5, 4, m, d);
        p.oval(5.5, 8, 3.5, 2.5, d, AP.IRON);
        p.set(3, 6, l);
        p.rect(10, 7, 4, 2, AP.CLAY); p.rect(10, 8, 4, 1, AP.UMBER);
    },
    needle: (p, [l, m]) => {
        up(p, 2, 12, 10, l); up(p, 3, 12, 9, m);
        p.set(12, 1, -1); p.set(13, 1, m); p.set(12, 0, m);
        for (const [x, y] of [[13, 3], [12, 5], [11, 7], [11, 8], [12, 10], [13, 12]]) p.set(x, y, AP.RED);
    },
    loupe: (p, [l, m, d]) => {
        handle(p, 7, 13, 5);
        p.oval(5.5, 5.5, 4.5, 4.5, m, d);
        p.oval(5.5, 5.5, 3, 3, AP.FOAM, AP.ICE);
        p.set(4, 4, AP.WHITE); p.set(2, 3, l);
    },
};

// one of MAKES' things' picture (null: not one)
function made(id: number) {
    const [make, tier] = makeOf(id) ?? [];
    const draw = make && SHAPES[make.type];
    if (!draw) return null;
    const ramp = RAMPS[make.line.of[tier - 1]] ?? [AP.ASH, AP.STONE, AP.STEEL];
    return (p: Pic) => draw(p, ramp, make.skill == Skill.TAILORING, GEMS[make.stat] ?? GEMS[Stat.STR]);
}

//#endregion

// by item id: materials 1-47, crafted 101 on (the made things' by kind, above)
const ITEMS: { [id: number]: (p: Pic) => void } = {
    1: ore([AP.EMBER, AP.RUST]),                                // copper ore
    2: ore([AP.WHITE, AP.MIST]),                                // tin ore
    3: ore([AP.CLAY, AP.RUST]),                                 // iron ore
    4: rock([AP.STEEL, AP.IRON, AP.INK]),                       // coal
    5: ore([AP.WHITE, AP.ASH], [AP.STONE, AP.STEEL, AP.IRON]),  // silver ore
    6: ore([AP.STRAW, AP.AMBER]),                               // gold ore
    7: ore([AP.FOAM, AP.ICE], [AP.STONE, AP.STEEL, AP.IRON]),   // mithril ore
    8: ore([AP.LIME, AP.LEAF], [AP.STEEL, AP.IRON, AP.SLATE]),  // adamantite ore
    9: rock([AP.MIST, AP.ASH, AP.STONE]),                       // stone
    10: rock([AP.STONE, AP.STEEL, AP.IRON]),                    // flint
    11: crystal([AP.WHITE, AP.MIST, AP.ASH]),                   // quartz
    12: crystal([AP.PINK, AP.ORCHID, AP.VIOLET]),               // amethyst
    13: crystal([AP.ICE, AP.SKY, AP.COBALT]),                   // deep crystal
    14: block([AP.CREAM, AP.SAND, AP.TAN]),                     // sandstone
    15: gem([AP.LIME, AP.GRASS, AP.LEAF]),                      // jade
    16: log([AP.CLAY, AP.UMBER, AP.BARK], [AP.CREAM, AP.TAN]),  // pine log
    17: log([AP.UMBER, AP.BARK, AP.SOOT], [AP.TAN, AP.CLAY]),   // oak log
    18: log([AP.ASH, AP.STONE, AP.STEEL], [AP.STRAW, AP.OCHRE]), // maple log
    19: log([AP.RUST, AP.OXBLOOD, AP.SOOT], [AP.EMBER, AP.RUST]), // yew log
    20: log([AP.STEEL, AP.IRON, AP.SLATE], [AP.ASH, AP.STONE]), // ironwood log
    21: bark,                                                   // ancient bark
    22: log([AP.UMBER, AP.BARK, AP.SOOT], [AP.FLAME, AP.RED]),  // heartwood
    23: drop([AP.STRAW, AP.AMBER, AP.OCHRE]),                   // golden sap
    24: hide,
    25: fang,
    26: scale([AP.LIME, AP.GRASS, AP.FOREST]),                  // thick scale
    27: scale([AP.EMBER, AP.RED, AP.MAROON]),                   // dragon scale
    28: scarab,                                                 // scarab shell
    29: heap([AP.PALE, AP.STRAW, AP.AMBER]),                    // sulfur
    30: crystal([AP.STONE, AP.IRON, AP.SHADOW]),                // obsidian
    31: gem([AP.STRAW, AP.EMBER, AP.FLAME]),                    // fire opal
    32: magmaCore,
    33: ore([AP.FOAM, AP.SKY], [AP.STEEL, AP.IRON, AP.SLATE]), // starmetal
    34: crystal([AP.WHITE, AP.FOAM, AP.ICE]),                   // frost crystal
    35: crystal([AP.FOAM, AP.SKY, AP.DENIM]),                   // everfrost
    36: scrap,                                                  // rusted scrap
    37: runestone,
    38: relic,                                                  // relic fragment
    39: bone,
    40: heap([AP.ASH, AP.STONE, AP.STEEL], AP.VIOLET),          // cursed ash
    41: shadowEssence,
    42: crystal([AP.MAGENTA, AP.VIOLET, AP.GRAPE]),             // void shard
    43: goldLeaf,
    44: lotus,                                                  // desert lotus
    45: flax,
    46: wool,
    47: silk,
    48: herb([AP.PALE, AP.LIME, AP.GRASS]),                      // mint
    49: herb([AP.LEAF, AP.GRASS, AP.FOREST], [AP.RED, AP.MAROON]), // bloodroot
    50: herb([AP.WHITE, AP.MIST, AP.ASH]),                      // silverleaf
    51: herb([AP.LIME, AP.GRASS, AP.FOREST], [AP.ICE, AP.SKY]), // moonpetal
    52: herb([AP.LIME, AP.LEAF, AP.FOREST], [AP.STRAW, AP.FLAME]), // starbloom
    53: fish([AP.MIST, AP.ASH, AP.STEEL]),                      // sardine
    54: fish([AP.PINK, AP.STONE, AP.STEEL], AP.IRON),           // trout
    55: fish([AP.STRAW, AP.AMBER, AP.OCHRE], AP.EMBER),         // golden carp
    56: fish([AP.PINK, AP.ORCHID, AP.STEEL], AP.IRON),          // salmon
    57: fish([AP.ICE, AP.SKY, AP.COBALT], AP.NAVY),             // swordfish
    58: fish([AP.LIME, AP.PINE, AP.MIDNIGHT], AP.VIOLET),       // leviathan eel
    59: meat([AP.PINK, AP.RED, AP.MAROON]),                     // venison
    60: meat([AP.PINK, AP.CLAY, AP.RUST]),                      // boar meat
    61: meat([AP.FLAME, AP.EMBER, AP.OXBLOOD]),                 // drake meat
    62: wheat,
    63: apple,
    64: honeycomb,
    101:bar([AP.EMBER, AP.OCHRE, AP.RUST]),                    // bronze bar
    102: bar([AP.ASH, AP.STONE, AP.STEEL]),                     // iron bar
    103: bar([AP.WHITE, AP.MIST, AP.ASH]),                      // silver bar
    104: bar([AP.STRAW, AP.AMBER, AP.OCHRE]),                   // gold bar
    105: bar([AP.FOAM, AP.ICE, AP.SKY]),                        // mithril bar
    106: planks([AP.CREAM, AP.SAND, AP.TAN]),                   // pine plank
    107: planks([AP.TAN, AP.CLAY, AP.UMBER]),                   // oak plank
    108: planks([AP.EMBER, AP.OCHRE, AP.RUST]),                 // maple plank
    109: block([AP.MIST, AP.ASH, AP.STONE]),                    // stone block
    110: bolt([AP.TAN, AP.CLAY, AP.UMBER]),                     // leather
    111: bolt([AP.CREAM, AP.SAND, AP.TAN]),                     // linen
    112: bolt([AP.FLAME, AP.RED, AP.MAROON]),                   // wool cloth
    113: bolt([AP.PINK, AP.ORCHID, AP.MAGENTA]),                // silk cloth
    114: heap([AP.STEEL, AP.IRON, AP.SHADOW], AP.EMBER),        // firepowder
    115: bottle([AP.PINK, AP.ORCHID, AP.MAGENTA]),              // lotus tonic
    116: boneCharm,
    117: bar(RAMPS[117]),                                       // adamantite bar
    118: bar(RAMPS[118]),                                       // starmetal bar
    119: bar(RAMPS[119]),                                       // dragonsteel bar
    120: planks(RAMPS[120]),                                    // yew plank
    121: planks(RAMPS[121]),                                    // ironwood plank
    122: planks(RAMPS[122]),                                    // heartwood plank
    123: bolt(RAMPS[123]),                                      // scaled leather
    124: bolt(RAMPS[124]),                                      // shadowweave
    125: bolt(RAMPS[125]),                                      // dragonhide
    126: vial,                                                  // glass vial
    127: flask([AP.PINK, AP.RED, AP.MAROON]),                   // minor healing potion
    128: flask([AP.FLAME, AP.RED, AP.MAROON]),                  // healing potion
    129: flask([AP.PINK, AP.MAGENTA, AP.WINE]),                 // greater
    130: flask([AP.ORCHID, AP.VIOLET, AP.GRAPE]),               // superior
    131: flask([AP.STRAW, AP.AMBER, AP.OCHRE]),                 // supreme
    132: draught([AP.FLAME, AP.EMBER, AP.RUST]),                // draught of might
    133: draught([AP.RED, AP.MAROON, AP.OXBLOOD]),              // draught of fury
    134: draught([AP.TAN, AP.CLAY, AP.UMBER]),                  // barkskin draught
    135: flask([AP.FOAM, AP.ICE, AP.SKY]),                      // frostward elixir
    136: flask([AP.LIME, AP.GRASS, AP.FOREST]),                 // elixir of fortune
    137: flask([AP.ICE, AP.STRAW, AP.AMBER]),                   // elixir of the ancients
    138: bomb,                                                  // scrap bomb
    139: bread,
    140: plated(fish([AP.MIST, AP.ASH, AP.STEEL])),             // grilled sardines
    141: bowl([AP.CLAY, AP.RUST]),                              // venison stew
    142: pie(AP.RED),                                           // apple pie
    143: pie(AP.PINK),                                          // trout pie
    144: bowl([AP.STRAW, AP.AMBER]),                            // golden carp soup
    145: plated(meat([AP.AMBER, AP.CLAY, AP.RUST])),            // boar roast
    146: cake,                                                  // honey cake
    147: plated(fish([AP.PINK, AP.ORCHID, AP.STEEL], AP.IRON)), // salmon fillet
    148: plated(fish([AP.STRAW, AP.SKY, AP.COBALT], AP.AMBER)), // sap-glazed swordfish
    149: plated(meat([AP.EMBER, AP.RUST, AP.OXBLOOD])),         // drake roast
    150: feast,                                                 // leviathan feast
};
