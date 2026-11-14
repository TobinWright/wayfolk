import { AP } from "../constants/Palette";
import { worldSeasonAt, SeasonKind } from "../../../shared/Seasons";
import { recolour } from "./Seasonal";

// The backdrops of the hero windows (components/herowindow): a side view of
// the land a party is crossing, one per kind of terrain, drawn in code in
// Apollo colours as the map's art is. Each is a sky that stays put and three
// strips that repeat across and scroll by at their own pace as the party walks
// (parallax): the far range, the middle ground and the ground they walk on.
// A strip's art wraps round its own width (everything in it is laid out
// modulo it, and its ridges are sums of whole waves), so it tiles seamlessly.
// Each is drawn for the season (art/Seasonal: blossom, autumn leaves, snow).

export const SCENE_W = 160, SCENE_H = 48;  // 10 x 3 tiles
export const GROUND_Y = 40;                // the ground's top row
export const FEET_Y = 44;                  // the row people's feet are on

export const BACKDROPS = ["plains", "forest", "hills", "mountains", "desert", "snow", "swamp"] as const;
export type Backdrop = typeof BACKDROPS[number];

// a picture of w x h (colours, -1 none), wrapping round across
export class Pic {
    readonly p: number[];
    constructor(readonly w: number, readonly h: number) { this.p = new Array(w * h).fill(-1); }
    set(x: number, y: number, c: number) {
        x = ((Math.round(x) % this.w) + this.w) % this.w; y = Math.round(y);
        if (y >= 0 && y < this.h) this.p[y * this.w + x] = c;
    }
    get(x: number, y: number) {
        x = ((Math.round(x) % this.w) + this.w) % this.w;
        return y >= 0 && y < this.h ? this.p[y * this.w + x] : -1;
    }
    rect(x: number, y: number, w: number, h: number, c: number) {
        for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) this.set(i, j, c);
    }
    // a filled ellipse, its bottom right in `shade` (lit from the top left)
    oval(cx: number, cy: number, rx: number, ry: number, c: number, shade = c) {
        for (let y = Math.floor(cy - ry); y <= cy + ry; y++) for (let x = Math.floor(cx - rx); x <= cx + rx; x++) {
            const dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry;
            if (dx * dx + dy * dy <= 1) this.set(x, y, dx + dy * 0.6 > 0.35 ? shade : c);
        }
    }
    // a column from row `top` down to the bottom (or `bottom`)
    column(x: number, top: number, c: number, bottom = this.h) {
        for (let y = Math.max(0, Math.round(top)); y < bottom; y++) this.set(x, y, c);
    }
}

export interface BackdropArt {
    sky: Pic;                                   // SCENE_W x SCENE_H, still
    strips: { pic: Pic, pace: number }[];       // back to front; pace 1 moves with the ground
}

// a number for (x, salt), the same every time
export function hash(x: number, salt = 0) {
    let h = (x * 374761393 + salt * 668265263) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

// a ridge line across a strip `w` wide: the height of each column (rows from the top)
export function ridge(w: number, base: number, waves: [number, number, number][]) {
    const out: number[] = [];
    for (let x = 0; x < w; x++)
        out.push(base - waves.reduce((sum, [k, amp, phase]) => sum + amp * Math.sin((2 * Math.PI * k * x) / w + phase), 0));
    return out;
}

// the sky: bands of colour from the top down, the last one reaching the ground
export function sky(bands: [number, number][]) {
    const pic = new Pic(SCENE_W, SCENE_H);
    let y = 0;
    for (const [c, rows] of bands) { pic.rect(0, y, SCENE_W, rows, c); y += rows; }
    if (y < SCENE_H) pic.rect(0, y, SCENE_W, SCENE_H - y, bands[bands.length - 1][0]);
    // the bands meet dithered over a row, so the steps are soft
    y = 0;
    for (let i = 0; i < bands.length - 1; i++) {
        y += bands[i][1];
        for (let x = 0; x < SCENE_W; x += 2) pic.set(x + (y % 2), y, bands[i][0]);
    }
    return pic;
}

// a range of hills or mountains: lit on the left of each slope, darker on the right
export function range(w: number, h: number, line: number[], light: number, dark: number, cap?: [number, number]) {
    const pic = new Pic(w, h);
    for (let x = 0; x < w; x++) {
        const top = Math.round(line[x]);
        // (judged over a few columns, so a slope is one shade rather than flickering)
        const rising = line[(x + 3) % w] < line[(x - 3 + w) % w];
        for (let y = top; y < h; y++) pic.set(x, y, rising ? light : dark);
        // snow on the peaks: anything above row cap[0]
        if (cap && top < cap[0]) for (let y = top; y < Math.min(h, cap[0] + Math.round(hash(x, 7) * 2)); y++) pic.set(x, y, cap[1]);
    }
    return pic;
}

// a round-topped tree: a trunk and a canopy of a few ovals
export function roundTree(pic: Pic, x: number, foot: number, size: number, trunk: number, leaf: number, shade: number, light: number) {
    pic.rect(x - 1, foot - size, 2, size, trunk);
    const top = foot - size - size * 0.6;
    pic.oval(x, top + size * 0.35, size * 0.75, size * 0.55, leaf, shade);
    pic.oval(x - size * 0.3, top + size * 0.2, size * 0.4, size * 0.35, leaf, shade);
    pic.set(x - size * 0.4, top, light); pic.set(x - size * 0.3, top, light); pic.set(x - size * 0.5, top + 1, light);
}

// a pine: a trunk and a stack of triangles, lit on the left
export function pine(pic: Pic, x: number, foot: number, size: number, trunk: number, light: number, dark: number, snow = -1) {
    pic.rect(x, foot - 2, 1, 2, trunk);
    const tiers = 3, tierH = Math.max(3, Math.round(size / tiers) + 1);
    for (let t = 0; t < tiers; t++) {
        const bottom = foot - 2 - t * (tierH - 2), half = (tiers - t) * size * 0.14 + 1;
        for (let y = 0; y < tierH; y++) {
            const w = Math.round((y + 1) / tierH * half);
            for (let i = -w; i <= w; i++) pic.set(x + i, bottom - tierH + y, i <= 0 ? light : dark);
            if (snow >= 0 && y == 0) pic.set(x, bottom - tierH, snow);
        }
        if (snow >= 0) for (let i = -half + 1; i <= 0; i++) pic.set(x + i, bottom - 1, snow);
    }
}

// the ground strip: a top edge, the soil under it, a path along it, pebbles and tufts
function ground(w: number, o: { top: number, soil: number, dark: number, path?: number, pathEdge?: number, tuft?: number, fleck?: number }) {
    const pic = new Pic(w, SCENE_H);
    pic.rect(0, GROUND_Y, w, SCENE_H - GROUND_Y, o.soil);
    for (let x = 0; x < w; x++) {
        pic.set(x, GROUND_Y, o.top);
        if (hash(x, 1) < 0.5) pic.set(x, GROUND_Y + 1, o.top);
        if (o.tuft != null && hash(x, 2) < 0.18) { pic.set(x, GROUND_Y - 1, o.tuft); if (hash(x, 3) < 0.4) pic.set(x, GROUND_Y - 2, o.tuft); }
        if (hash(x, 4) < 0.08) pic.set(x, GROUND_Y + 3 + Math.floor(hash(x, 5) * 4), o.dark);
    }
    if (o.path != null) {
        pic.rect(0, FEET_Y - 2, w, 4, o.path);
        for (let x = 0; x < w; x++) {
            pic.set(x, FEET_Y - 3 + (hash(x, 6) < 0.3 ? 1 : 0), o.pathEdge ?? o.path);
            if (hash(x, 8) < 0.1) pic.set(x, FEET_Y - 1 + Math.floor(hash(x, 9) * 3), o.fleck ?? o.dark);
        }
    }
    pic.rect(0, SCENE_H - 1, w, 1, o.dark);
    return pic;
}

function plains(s: SeasonKind): BackdropArt {
    const far = recolour(range(160, SCENE_H, ridge(160, 30, [[1, 3, 0.4], [2, 2, 1.1], [5, 1, 0]]), AP.SKY, AP.COBALT), s, "rock", 1);
    const mid = recolour(range(128, SCENE_H, ridge(128, 36, [[1, 2, 2], [3, 1.5, 0.3]]), AP.GRASS, AP.LEAF), s, "turf", 2);
    const trees = new Pic(128, SCENE_H);
    for (const x of [14, 70, 101]) roundTree(trees, x, 37, 3, AP.UMBER, AP.LEAF, AP.FOREST, AP.GRASS);
    for (const x of [40, 52, 118]) trees.oval(x, 36, 3, 2, AP.LEAF, AP.FOREST);
    layOver(mid, recolour(trees, s, "leaves", 3));
    return {
        sky: sky([[AP.SKY, 6], [AP.ICE, 12], [AP.FOAM, 30]]),
        strips: [{ pic: far, pace: 0.15 }, { pic: mid, pace: 0.45 },
            { pic: recolour(ground(64, { top: AP.LIME, soil: AP.GRASS, dark: AP.LEAF, path: AP.TAN, pathEdge: AP.SAND, tuft: AP.LIME, fleck: AP.CLAY }), s, "turf", 4), pace: 1 }],
    };
}

function forest(s: SeasonKind): BackdropArt {
    const far = range(160, SCENE_H, ridge(160, 24, [[3, 2, 0], [7, 1.5, 1], [11, 1, 2]]), AP.LEAF, AP.FOREST);
    for (let x = 4; x < 160; x += 9) pine(far, x + Math.floor(hash(x, 3) * 4), 26 + Math.floor(hash(x, 4) * 3), 9, AP.PINE, AP.FOREST, AP.PINE);
    // (the undergrowth as ground, the trees over it as leaves: art/Seasonal)
    const mid = new Pic(96, SCENE_H), trees = new Pic(96, SCENE_H);
    mid.rect(0, 34, 96, SCENE_H - 34, AP.PINE);
    recolour(mid, s, "turf", 16);
    for (const [x, s] of [[10, 6], [42, 7], [71, 5]] as [number, number][]) {
        trees.rect(x - 2, 16, 4, 24, AP.BARK); trees.column(x - 2, 16, AP.UMBER, 40);
        trees.oval(x, 12, s + 4, s, AP.FOREST, AP.PINE); trees.oval(x - 3, 9, s, s - 2, AP.LEAF, AP.FOREST);
    }
    layOver(mid, recolour(trees, s, "leaves", 6));
    return {
        sky: sky([[AP.PALE, 10], [AP.FOAM, 38]]),
        strips: [{ pic: recolour(far, s, "pines", 5), pace: 0.15 }, { pic: mid, pace: 0.5 },
            { pic: recolour(ground(64, { top: AP.LEAF, soil: AP.FOREST, dark: AP.PINE, path: AP.UMBER, pathEdge: AP.RUST, tuft: AP.GRASS, fleck: AP.BARK }), s, "turf", 7), pace: 1 }],
    };
}

function hills(s: SeasonKind): BackdropArt {
    const far = range(160, SCENE_H, ridge(160, 26, [[1, 4, 0], [2, 3, 2], [4, 1.5, 1]]), AP.ICE, AP.SKY);
    const mid = range(128, SCENE_H, ridge(128, 30, [[1, 4, 1], [2, 3, 0], [3, 1, 2]]), AP.GRASS, AP.LEAF);
    // a fence along the near hill
    const fence = new Pic(64, SCENE_H);
    for (let x = 0; x < 64; x += 8) fence.rect(x, 34, 1, 6, AP.UMBER);
    fence.rect(0, 35, 64, 1, AP.CLAY); fence.rect(0, 37, 64, 1, AP.CLAY);
    return {
        sky: sky([[AP.SKY, 8], [AP.ICE, 14], [AP.FOAM, 26]]),
        strips: [{ pic: recolour(far, s, "rock", 8), pace: 0.15 }, { pic: recolour(mid, s, "turf", 9), pace: 0.4 }, { pic: fence, pace: 0.8 },
            { pic: recolour(ground(64, { top: AP.LIME, soil: AP.GRASS, dark: AP.LEAF, path: AP.SAND, pathEdge: AP.CREAM, tuft: AP.LIME, fleck: AP.TAN }), s, "turf", 10), pace: 1 }],
    };
}

function mountains(s: SeasonKind): BackdropArt {
    const far = range(160, SCENE_H, ridge(160, 18, [[2, 7, 0], [3, 4, 1.4], [7, 2, 0.5]]), AP.ASH, AP.STONE, [16, AP.WHITE]);
    const mid = range(96, SCENE_H, ridge(96, 32, [[1, 3, 0], [3, 3, 2], [6, 1, 1]]), AP.STEEL, AP.IRON);
    for (const x of [18, 60]) pine(mid, x, 33, 8, AP.BARK, AP.FOREST, AP.PINE);
    return {
        sky: sky([[AP.COBALT, 4], [AP.SKY, 10], [AP.ICE, 34]]),
        strips: [{ pic: far, pace: 0.1 }, { pic: recolour(mid, s, "rock", 11), pace: 0.45 },
            { pic: recolour(ground(64, { top: AP.STONE, soil: AP.IRON, dark: AP.SLATE, path: AP.STEEL, pathEdge: AP.STONE, tuft: AP.ASH, fleck: AP.IRON }), s, "rock", 12), pace: 1 }],
    };
}

function desert(): BackdropArt {
    const far = range(160, SCENE_H, ridge(160, 30, [[1, 3, 0], [3, 2, 2]]), AP.STRAW, AP.AMBER);
    // a far pyramid
    for (let y = 0; y < 10; y++) for (let i = -y; i <= y; i++) far.set(110 + i, 20 + y, i < 0 ? AP.STRAW : AP.OCHRE);
    const mid = range(128, SCENE_H, ridge(128, 35, [[1, 2, 1], [2, 2, 0], [5, 0.8, 2]]), AP.SAND, AP.TAN);
    for (const x of [30, 95]) {
        mid.rect(x, 26, 2, 12, AP.LEAF); mid.column(x + 1, 26, AP.FOREST, 38);
        mid.rect(x - 3, 29, 3, 1, AP.LEAF); mid.rect(x - 3, 27, 1, 2, AP.LEAF);
        mid.rect(x + 2, 31, 3, 1, AP.FOREST); mid.rect(x + 4, 28, 1, 3, AP.FOREST);
    }
    return {
        sky: sky([[AP.ICE, 6], [AP.FOAM, 10], [AP.CREAM, 32]]),
        strips: [{ pic: far, pace: 0.12 }, { pic: mid, pace: 0.45 },
            { pic: ground(64, { top: AP.CREAM, soil: AP.SAND, dark: AP.TAN, tuft: AP.CREAM, fleck: AP.TAN }), pace: 1 }],
    };
}

function snow(): BackdropArt {
    const far = range(160, SCENE_H, ridge(160, 20, [[2, 6, 1], [3, 3, 0], [8, 1.5, 2]]), AP.WHITE, AP.MIST);
    const mid = new Pic(96, SCENE_H);
    for (const [x, s] of [[8, 13], [20, 10], [55, 14], [67, 9], [80, 11]] as [number, number][]) pine(mid, x, 38, s, AP.BARK, AP.FOREST, AP.PINE, AP.WHITE);
    mid.rect(0, 37, 96, 3, AP.MIST);
    return {
        sky: sky([[AP.STONE, 6], [AP.ASH, 12], [AP.MIST, 30]]),
        strips: [{ pic: far, pace: 0.12 }, { pic: mid, pace: 0.5 },
            { pic: ground(64, { top: AP.WHITE, soil: AP.MIST, dark: AP.ASH, path: AP.ASH, pathEdge: AP.MIST, fleck: AP.STONE }), pace: 1 }],
    };
}

function swamp(s: SeasonKind): BackdropArt {
    const far = range(160, SCENE_H, ridge(160, 28, [[4, 1.5, 0], [9, 1, 1]]), AP.STEEL, AP.IRON);
    for (let x = 3; x < 160; x += 13) roundTree(far, x, 30, 3, AP.SLATE, AP.IRON, AP.SLATE, AP.STEEL);
    const mid = new Pic(112, SCENE_H);
    mid.rect(0, 36, 112, SCENE_H - 36, AP.SLATE);
    // dead trees: a bent trunk and bare branches
    for (const x of [16, 70]) {
        mid.rect(x, 18, 2, 18, AP.BARK); mid.column(x + 1, 18, AP.SOOT, 36);
        mid.rect(x - 5, 22, 5, 1, AP.BARK); mid.set(x - 5, 21, AP.BARK); mid.rect(x + 2, 25, 4, 1, AP.BARK); mid.set(x + 5, 24, AP.BARK);
        mid.rect(x - 2, 17, 2, 1, AP.BARK); mid.set(x + 2, 16, AP.BARK);
    }
    for (const x of [36, 44, 90, 97]) for (let i = 0; i < 3; i++) mid.column(x + i * 2, 31 + (i % 2) * 2, AP.LEAF, 37);
    const pools = ground(64, { top: AP.LEAF, soil: AP.FOREST, dark: AP.PINE, tuft: AP.GRASS, fleck: AP.PINE });
    for (const [x, w] of [[6, 14], [40, 10]]) { pools.rect(x, 46, w, 1, AP.DENIM); pools.rect(x + 2, 45, w - 4, 1, AP.COBALT); }
    return {
        sky: sky([[AP.STONE, 8], [AP.ASH, 14], [AP.PALE, 26]]),
        strips: [{ pic: recolour(far, s, "rock", 13), pace: 0.15 }, { pic: recolour(mid, s, "swamp", 14), pace: 0.5 }, { pic: recolour(pools, s, "swamp", 15), pace: 1 }],
    };
}

// (the desert and the snow look the same all year)
const MAKERS: { [k in Backdrop]: (s: SeasonKind) => BackdropArt } = { plains, forest, hills, mountains, desert, snow, swamp };

// a kind of land in a season (art/Seasonal; none: the season now)
export function backdropArt(kind: Backdrop, season: SeasonKind = worldSeasonAt(Date.now()).k): BackdropArt {
    return (MAKERS[kind] ?? plains)(season);
}

// one picture's coloured pixels laid over another's (the same size)
function layOver(p: Pic, q: Pic) {
    for (let k = 0; k < q.p.length; k++) if (q.p[k] >= 0) p.p[k] = q.p[k];
}
