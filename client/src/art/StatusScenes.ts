import { AP } from "../constants/Palette";
import { SCENES } from "../../../shared/Scenes";
import { GROUND_Y, hash, Pic, pine, range, ridge, roundTree, SCENE_H, SCENE_W, sky } from "./Backdrops";

// The backdrops a hero's status window can show behind them (shared/Scenes,
// the user, 2026-10-29), picked in place of the land they're in. Each is one
// still picture the size of a hero window's scene (SCENE_W x SCENE_H, the
// middle of it showing; feet on FEET_Y), drawn in code in Apollo colours,
// and a few lights that twinkle over it: stars, flames, fireflies, petals.

export interface StatusScene {
    pic: Pic;
    lights: [number, number, number][];     // [x, y, colour]
}

const W = SCENE_W, H = SCENE_H;

// a picture's coloured pixels laid over another's
function over(p: Pic, q: Pic) {
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const c = q.get(x, y); if (c >= 0) p.set(x, y, c); }
}

// a puffy cloud, lit on top
function cloud(p: Pic, x: number, y: number, s = 1, light = AP.WHITE, shade = AP.MIST) {
    p.oval(x, y, 8 * s, 3 * s, light, shade);
    p.oval(x - 5 * s, y + 1, 5 * s, 2.5 * s, light, shade);
    p.oval(x + 4 * s, y - 1.5 * s, 5 * s, 3 * s, light, shade);
}

// a wall of bricks: rows 4 high, every other row offset half a brick
function bricks(p: Pic, top: number, bottom: number, mortar: number, face: number, light: number, salt = 0) {
    p.rect(0, top, W, bottom - top, face);
    for (let y = top; y < bottom; y += 4) {
        p.rect(0, y, W, 1, mortar);
        const off = ((y - top) / 4) % 2 ? 4 : 0;
        for (let x = off; x < W; x += 8) {
            p.column(x, y, mortar, Math.min(bottom, y + 4));
            if (hash(x + y * 7, salt) < 0.35) p.rect(x + 1, y + 1, 3, 1, light);   // a lit chip here and there
        }
    }
}

// a torch on a wall: a bracket, its stick and a flame (its lights flicker)
function torch(p: Pic, lights: StatusScene["lights"], x: number, y: number) {
    p.rect(x - 1, y + 4, 3, 2, AP.BARK);
    p.rect(x, y, 1, 4, AP.UMBER);
    p.set(x, y - 1, AP.FLAME); p.set(x, y - 2, AP.AMBER); p.set(x - 1, y - 1, AP.RED); p.set(x + 1, y - 1, AP.EMBER);
    lights.push([x, y - 3, AP.STRAW], [x - 1, y - 2, AP.EMBER], [x + 1, y - 2, AP.AMBER]);
}

// stars over the sky's top rows (a few of them twinkling)
function stars(p: Pic, lights: StatusScene["lights"], above: number, n: number, salt: number) {
    for (let i = 0; i < n; i++) {
        const x = Math.floor(hash(i, salt) * W), y = Math.floor(hash(i, salt + 1) * above);
        if (i % 4 == 0) lights.push([x, y, AP.WHITE]);
        else p.set(x, y, hash(i, salt + 2) < 0.4 ? AP.MIST : AP.STONE);
    }
}

// little lights dotted about a band of rows (fireflies, embers, petals, snow)
function motes(lights: StatusScene["lights"], top: number, bottom: number, n: number, colors: number[], salt: number) {
    for (let i = 0; i < n; i++)
        lights.push([Math.floor(hash(i, salt) * W), top + Math.floor(hash(i, salt + 1) * (bottom - top)), colors[i % colors.length]]);
}

// a floor from GROUND_Y down: its top row, then the rest
function floor(p: Pic, top: number, fill: number, dark: number) {
    p.rect(0, GROUND_Y, W, H - GROUND_Y, fill);
    p.rect(0, GROUND_Y, W, 1, top);
    p.rect(0, H - 1, W, 1, dark);
}

// a long carpet along the floor, its edges gold-flecked
function carpet(p: Pic, edge: number, fill: number, fleck: number) {
    p.rect(0, 42, W, 5, edge);
    p.rect(0, 43, W, 3, fill);
    for (let x = 1; x < W; x += 6) { p.set(x, 42, fleck); p.set(x + 3, 46, fleck); }
}

//#region the scenes

function meadow(): StatusScene {
    const p = sky([[AP.SKY, 8], [AP.ICE, 12], [AP.FOAM, 28]]), lights: StatusScene["lights"] = [];
    cloud(p, 36, 8); cloud(p, 112, 5, 0.8); cloud(p, 150, 12, 0.6);
    over(p, range(W, H, ridge(W, 30, [[1, 3, 0.4], [2, 2, 1.1], [5, 1, 0]]), AP.GRASS, AP.LEAF));
    const mid = range(W, H, ridge(W, 36, [[1, 2, 2], [3, 1.5, 0.3]]), AP.LIME, AP.GRASS);
    for (const x of [40, 122]) roundTree(mid, x, 37, 4, AP.UMBER, AP.LEAF, AP.FOREST, AP.LIME);
    over(p, mid);
    floor(p, AP.LIME, AP.GRASS, AP.LEAF);
    // flowers, on stems
    const petals = [AP.PINK, AP.STRAW, AP.WHITE, AP.ORCHID, AP.FLAME];
    for (let i = 0; i < 46; i++) {
        const x = Math.floor(hash(i, 11) * W), y = GROUND_Y + 2 + Math.floor(hash(i, 12) * 6);
        p.set(x, y, AP.LEAF); p.set(x, y - 1, petals[i % petals.length]);
    }
    motes(lights, 26, 38, 6, [AP.STRAW, AP.WHITE, AP.PINK], 13);
    return { pic: p, lights };
}

function castleHall(): StatusScene {
    const p = new Pic(W, H), lights: StatusScene["lights"] = [];
    bricks(p, 0, GROUND_Y, AP.SLATE, AP.IRON, AP.STEEL, 1);
    // tall arched windows, the day through them
    for (const x of [40, 120]) {
        p.rect(x - 6, 6, 12, 22, AP.SLATE);
        p.oval(x - 0.5, 9, 6, 5, AP.SLATE);
        p.rect(x - 5, 9, 10, 18, AP.SKY);
        p.oval(x - 0.5, 9, 5, 4, AP.SKY);
        for (let k = 0; k < 6; k++) p.set(x - 4 + k, 22 - k * 2, AP.ICE);
        p.column(x, 5, AP.SLATE, 27); p.rect(x - 5, 17, 10, 1, AP.SLATE);
        p.rect(x - 7, 27, 14, 2, AP.STONE);
    }
    // banners, hung from rods
    for (const x of [16, 80, 144]) {
        p.rect(x - 6, 1, 12, 1, AP.OCHRE);
        p.rect(x - 4, 2, 8, 20, AP.RED);
        p.rect(x + 3, 2, 1, 20, AP.MAROON);
        p.rect(x - 4, 2, 1, 20, AP.FLAME);
        p.rect(x - 4, 22, 3, 1, AP.RED); p.rect(x + 1, 22, 3, 1, AP.MAROON);
        for (const [dx, dy] of [[0, -2], [-1, -1], [0, -1], [1, -1], [-2, 0], [-1, 0], [0, 0], [1, 0], [2, 0], [-1, 1], [0, 1], [1, 1], [0, 2]]) p.set(x + dx - 0.5, 10 + dy, AP.AMBER);
        lights.push([x, 8, AP.STRAW]);
    }
    for (const x of [60, 100]) torch(p, lights, x, 18);
    floor(p, AP.STONE, AP.STEEL, AP.IRON);
    for (let x = 0; x < W; x += 10) p.column(x, GROUND_Y + 1, AP.IRON);
    carpet(p, AP.MAROON, AP.RED, AP.AMBER);
    return { pic: p, lights };
}

function tavern(): StatusScene {
    const p = new Pic(W, H), lights: StatusScene["lights"] = [];
    // plank walls under a beam
    p.rect(0, 0, W, GROUND_Y, AP.UMBER);
    for (let x = 0; x < W; x += 7) { p.column(x, 0, AP.BARK, GROUND_Y); if (hash(x, 3) < 0.4) p.set(x + 3, 10 + Math.floor(hash(x, 4) * 24), AP.BARK); }
    p.rect(0, 0, W, 4, AP.BARK); p.rect(0, 4, W, 1, AP.SOOT);
    // the hearth, its fire behind them
    p.rect(64, 13, 32, 3, AP.BARK); p.rect(64, 13, 32, 1, AP.CLAY);
    p.rect(66, 16, 28, 24, AP.STONE);
    for (let y = 16; y < 40; y += 4) { p.rect(66, y, 28, 1, AP.STEEL); for (let x = 66 + ((y / 4) % 2) * 3; x < 94; x += 6) p.column(x, y, AP.STEEL, y + 4); }
    p.rect(71, 24, 18, 16, AP.BLACK);
    p.oval(79.5, 27, 9, 4, AP.BLACK);
    p.rect(73, 37, 14, 2, AP.BARK); p.rect(74, 36, 5, 1, AP.UMBER); p.rect(81, 36, 5, 1, AP.UMBER);
    p.oval(80, 33, 4, 4, AP.FLAME, AP.RED); p.oval(77, 34.5, 2.5, 2.5, AP.EMBER, AP.FLAME); p.oval(83, 34.5, 2.5, 2.5, AP.EMBER, AP.FLAME);
    p.oval(80, 34, 2, 2, AP.AMBER);
    lights.push([80, 28, AP.STRAW], [78, 30, AP.AMBER], [82, 30, AP.EMBER], [80, 31, AP.STRAW], [76, 32, AP.FLAME], [84, 31, AP.AMBER]);
    // shelves of bottles
    for (const [sx, sy] of [[30, 18], [30, 28]]) {
        p.rect(sx, sy, 26, 2, AP.BARK); p.rect(sx, sy, 26, 1, AP.CLAY);
        const glass = [AP.FOREST, AP.RED, AP.COBALT, AP.AMBER, AP.VIOLET, AP.LEAF];
        for (let i = 0; i < 6; i++) {
            const bx = sx + 2 + i * 4, c = glass[(i + sy) % glass.length];
            p.rect(bx, sy - 5, 2, 5, c); p.set(bx, sy - 6, c); p.set(bx, sy - 7, AP.TAN); p.set(bx, sy - 4, AP.WHITE);
        }
    }
    // a lantern hung from the beam
    p.column(60, 5, AP.SOOT, 9);
    p.rect(58, 9, 5, 6, AP.SOOT); p.rect(59, 10, 3, 4, AP.AMBER);
    lights.push([60, 11, AP.STRAW], [60, 12, AP.STRAW]);
    // a window on the night
    p.rect(98, 12, 16, 14, AP.BARK); p.rect(99, 13, 14, 12, AP.NAVY);
    p.column(106, 13, AP.BARK, 25); p.rect(99, 19, 14, 1, AP.BARK);
    p.oval(110, 15.5, 1.5, 1.5, AP.CREAM);
    lights.push([101, 15, AP.WHITE], [103, 22, AP.ASH]);
    // barrels
    for (const x of [121, 131]) {
        p.oval(x, 33, 5.5, 7, AP.CLAY, AP.RUST);
        for (const y of [29, 37]) p.rect(x - 5, y, 11, 1, AP.SOOT);
        p.column(x - 2, 27, AP.UMBER, 40); p.column(x + 2, 27, AP.UMBER, 40);
    }
    floor(p, AP.CLAY, AP.RUST, AP.BARK);
    for (const y of [43, 46]) p.rect(0, y, W, 1, AP.UMBER);
    for (let x = 0; x < W; x += 11) p.column(x + (x % 3) * 2, 41, AP.UMBER, 43);
    return { pic: p, lights };
}

function starryNight(): StatusScene {
    const p = sky([[AP.BLACK, 6], [AP.MIDNIGHT, 10], [AP.NAVY, 10], [AP.DENIM, 22]]), lights: StatusScene["lights"] = [];
    stars(p, lights, 30, 90, 21);
    // a crescent moon, and a falling star
    p.oval(124, 9, 5, 5, AP.CREAM, AP.SAND);
    p.oval(126.5, 7.5, 4.5, 4.5, AP.MIDNIGHT);
    for (let k = 0; k < 6; k++) p.set(34 + k, 4 + k / 2, k < 2 ? AP.WHITE : k < 4 ? AP.ASH : AP.STONE);
    over(p, range(W, H, ridge(W, 30, [[1, 3, 0.4], [3, 2, 1.1]]), AP.GRAPE, AP.MIDNIGHT));
    const near = range(W, H, ridge(W, 36, [[1, 2, 2], [2, 1.5, 0.3]]), AP.PINE, AP.SHADOW);
    for (const x of [14, 46, 128, 150]) pine(near, x, 37, 10, AP.SOOT, AP.PINE, AP.SHADOW);
    over(p, near);
    floor(p, AP.FOREST, AP.PINE, AP.SHADOW);
    for (let x = 0; x < W; x++) if (hash(x, 22) < 0.2) p.set(x, GROUND_Y - 1, AP.FOREST);
    motes(lights, 28, 40, 9, [AP.LIME, AP.PALE], 23);
    return { pic: p, lights };
}

function sunsetBeach(): StatusScene {
    const p = sky([[AP.PLUM, 4], [AP.MAROON, 4], [AP.MAGENTA, 4], [AP.ORCHID, 4], [AP.PINK, 4], [AP.EMBER, 4], [AP.AMBER, 6], [AP.STRAW, 18]]);
    const lights: StatusScene["lights"] = [];
    // the sun, half down
    p.oval(80, 30, 9, 9, AP.STRAW); p.oval(80, 30, 6, 6, AP.CREAM);
    cloud(p, 40, 12, 0.7, AP.ORCHID, AP.MAGENTA); cloud(p, 128, 16, 0.6, AP.PINK, AP.ORCHID);
    // gulls
    for (const [x, y] of [[54, 9], [60, 12], [104, 7]]) { p.set(x - 1, y - 1, AP.PLUM); p.set(x, y, AP.PLUM); p.set(x + 1, y - 1, AP.PLUM); }
    // the sea, the sun laid along it
    p.rect(0, 30, W, 3, AP.VIOLET); p.rect(0, 33, W, 3, AP.GRAPE); p.rect(0, 36, W, 3, AP.DENIM);
    for (let y = 30; y < 39; y++) {
        const half = Math.round(9 - (y - 30) * 0.6);
        for (let x = 80 - half; x <= 80 + half; x++) if ((x + y) % 3 == 0) p.set(x, y, y < 33 ? AP.STRAW : AP.AMBER);
        for (let x = 0; x < W; x += 1) if (hash(x * 3 + y, 31) < 0.012) p.set(x, y, AP.ORCHID);
    }
    lights.push([77, 31, AP.CREAM], [83, 32, AP.CREAM], [79, 34, AP.STRAW], [82, 36, AP.STRAW], [80, 38, AP.AMBER]);
    // the beach, wet at its edge
    floor(p, AP.TAN, AP.SAND, AP.TAN);
    p.rect(0, 39, W, 1, AP.FOAM);
    for (let x = 0; x < W; x++) if (hash(x, 32) < 0.06) p.set(x, 42 + Math.floor(hash(x, 33) * 5), hash(x, 34) < 0.5 ? AP.CREAM : AP.PINK);
    // a palm, leaning
    for (let y = 14; y < 41; y++) {
        const x = 124 - Math.round(((41 - y) * (41 - y)) / 90);
        p.rect(x, y, 2, 1, y % 3 ? AP.UMBER : AP.BARK);
    }
    const tx = 124 - Math.round((27 * 27) / 90), ty = 14;
    for (const [dx, dy] of [[-1, 0], [1, 0], [-1, 0.5], [1, 0.6], [0.2, -1]]) for (let k = 1; k < 11; k++)
        p.set(tx + dx * k, ty + dy * k + (k * k) / 30, k < 5 ? AP.LEAF : AP.FOREST);
    p.oval(tx + 1, ty + 1, 1.5, 1.5, AP.BARK);
    return { pic: p, lights };
}

// a cluster of crystals growing from (x, foot), up (dir -1) or down (dir 1)
function crystals(p: Pic, x: number, foot: number, dir: number, light: number, mid: number, dark: number, sizes: number[]) {
    sizes.forEach((h, i) => {
        const cx = x + (i - (sizes.length - 1) / 2) * 4;
        for (let k = 0; k < h; k++) {
            const y = foot + dir * k, half = k >= h - 2 ? 0 : 1;
            for (let dx = -half; dx <= half + 1; dx++) p.set(cx + dx, y, dx < 0 ? light : dx == 0 ? mid : dark);
        }
    });
}

function crystalCave(): StatusScene {
    const p = new Pic(W, H), lights: StatusScene["lights"] = [];
    p.rect(0, 0, W, H, AP.SHADOW);
    for (let i = 0; i < 30; i++) p.oval(hash(i, 41) * W, hash(i, 42) * 36, 2 + hash(i, 43) * 5, 1 + hash(i, 44) * 3, AP.SLATE, AP.SHADOW);
    // stalactites and stalagmites
    for (let i = 0; i < 18; i++) {
        const x = Math.floor(hash(i, 45) * W), len = 4 + Math.floor(hash(i, 46) * 10);
        for (let k = 0; k < len; k++) { const w = Math.max(0, Math.round((1 - k / len) * 2)); for (let d = -w; d <= w; d++) p.set(x + d, k, d < 0 ? AP.STEEL : AP.IRON); }
    }
    for (const x of [20, 104, 150]) for (let k = 0; k < 9; k++) { const w = Math.round((1 - k / 9) * 2.5); for (let d = -w; d <= w; d++) p.set(x + d, GROUND_Y - k, d < 0 ? AP.STEEL : AP.IRON); }
    // glowing crystals
    crystals(p, 38, GROUND_Y, -1, AP.PINK, AP.ORCHID, AP.VIOLET, [6, 11, 8]);
    crystals(p, 124, GROUND_Y, -1, AP.FOAM, AP.ICE, AP.SKY, [7, 13, 5, 9]);
    crystals(p, 70, 0, 1, AP.PINK, AP.ORCHID, AP.MAGENTA, [5, 8, 4]);
    crystals(p, 140, 0, 1, AP.FOAM, AP.ICE, AP.COBALT, [6, 4]);
    crystals(p, 92, GROUND_Y, -1, AP.LIME, AP.GRASS, AP.LEAF, [4, 6]);
    lights.push([34, 30, AP.WHITE], [38, 28, AP.WHITE], [43, 31, AP.PINK], [118, 32, AP.WHITE], [122, 26, AP.WHITE], [131, 30, AP.FOAM],
        [66, 6, AP.WHITE], [70, 8, AP.PINK], [137, 6, AP.WHITE], [90, 35, AP.PALE]);
    motes(lights, 4, 38, 8, [AP.ORCHID, AP.ICE], 47);
    floor(p, AP.IRON, AP.SLATE, AP.SHADOW);
    for (let x = 0; x < W; x++) if (hash(x, 48) < 0.12) p.set(x, 42 + Math.floor(hash(x, 49) * 5), AP.IRON);
    return { pic: p, lights };
}

function library(): StatusScene {
    const p = new Pic(W, H), lights: StatusScene["lights"] = [];
    p.rect(0, 0, W, GROUND_Y, AP.BARK);
    const spines = [AP.RED, AP.MAROON, AP.COBALT, AP.DENIM, AP.FOREST, AP.LEAF, AP.OCHRE, AP.VIOLET, AP.UMBER, AP.GRAPE, AP.SKY];
    // shelves from wall to wall, full of books (but for a round window in the middle)
    for (let sy = 2; sy < 38; sy += 9) {
        let x = 0, i = 0;
        while (x < W) {
            const w = 2 + Math.floor(hash(i + sy * 31, 51) * 2), h = 5 + Math.floor(hash(i + sy * 31, 52) * 3), c = spines[Math.floor(hash(i + sy * 31, 53) * spines.length)];
            if (hash(i + sy * 31, 54) < 0.08) { x += 3; i++; continue; }
            p.rect(x, sy + 8 - h, w, h, c);
            p.set(x, sy + 8 - h, AP.CREAM);
            if (w > 2) p.rect(x, sy + 8 - h + 2, w, 1, AP.AMBER);
            x += w; i++;
        }
        p.rect(0, sy + 8, W, 1, AP.UMBER);
    }
    for (let x = 0; x < W; x += 32) p.rect(x, 0, 2, GROUND_Y, AP.SOOT);
    p.oval(80, 18, 12, 12, AP.SOOT);
    p.oval(80, 18, 10, 10, AP.SKY, AP.COBALT);
    p.oval(78, 15, 5, 5, AP.ICE);
    p.rect(70, 18, 21, 1, AP.SOOT); p.column(80, 8, AP.SOOT, 29);
    // candles on the shelves
    for (const [x, y] of [[26, 28], [134, 19], [146, 37]]) { p.rect(x, y - 2, 1, 3, AP.CREAM); p.set(x, y - 3, AP.AMBER); lights.push([x, y - 4, AP.STRAW]); }
    motes(lights, 4, 38, 4, [AP.CREAM], 55);
    floor(p, AP.CLAY, AP.RUST, AP.BARK);
    for (const y of [44, 47]) p.rect(0, y, W, 1, AP.UMBER);
    carpet(p, AP.GRAPE, AP.VIOLET, AP.STRAW);
    return { pic: p, lights };
}

function volcano(): StatusScene {
    const p = sky([[AP.SOOT, 5], [AP.OXBLOOD, 8], [AP.MAROON, 8], [AP.RED, 8], [AP.FLAME, 19]]), lights: StatusScene["lights"] = [];
    // smoke from the crater
    for (let k = 0; k < 6; k++) p.oval(80 + k * 3 + Math.sin(k) * 2, 9 - k * 2, 4 + k, 2 + k * 0.4, AP.IRON, AP.SLATE);
    // the mountain, lava down it
    for (let x = 0; x < W; x++) {
        const top = Math.max(12, 12 + Math.round(Math.abs(x - 80) * 0.55) - 3);
        for (let y = top; y < GROUND_Y; y++) p.set(x, y, x < 80 ? AP.PLUM : AP.SOOT);
    }
    p.rect(74, 12, 12, 1, AP.EMBER); p.rect(76, 11, 8, 1, AP.AMBER);
    for (const [dir, salt] of [[-1, 0], [1, 1], [0.3, 2]]) for (let y = 13; y < GROUND_Y; y++) {
        const x = 80 + dir * (y - 13) * 0.45 + Math.sin(y * 0.6 + salt) * 1.5;
        p.set(x, y, y % 4 ? AP.FLAME : AP.AMBER);
        if (y % 5 == 0) lights.push([Math.round(x), y, AP.STRAW]);
    }
    over(p, range(W, H, ridge(W, 36, [[2, 2, 0.4], [5, 1.5, 1.1]]), AP.SOOT, AP.BLACK));
    floor(p, AP.SOOT, AP.BLACK, AP.BLACK);
    // cracks in the ground, glowing
    for (let i = 0; i < 12; i++) {
        const x = Math.floor(hash(i, 61) * W), y = 42 + Math.floor(hash(i, 62) * 5), len = 3 + Math.floor(hash(i, 63) * 6);
        for (let k = 0; k < len; k++) p.set(x + k, y + (k % 3 == 2 ? 1 : 0), k % 2 ? AP.RED : AP.FLAME);
        lights.push([x + 1, y, AP.AMBER]);
    }
    motes(lights, 4, 38, 14, [AP.AMBER, AP.EMBER, AP.STRAW], 64);
    return { pic: p, lights };
}

// a blossoming tree: a crooked trunk and a pink cloud of a canopy
function blossom(p: Pic, x: number, foot: number, s: number) {
    for (let y = foot - s * 2; y < foot; y++) p.rect(x + Math.round(Math.sin(y * 0.3) * 1.2), y, 2, 1, AP.BARK);
    p.rect(x - 3, foot - s * 2 + 2, 3, 1, AP.BARK); p.rect(x + 2, foot - s * 2 + 4, 3, 1, AP.BARK);
    const top = foot - s * 2 - s * 0.4;
    p.oval(x + 1, top, s * 1.4, s * 0.8, AP.PINK, AP.ORCHID);
    p.oval(x - s * 0.7, top + s * 0.4, s * 0.8, s * 0.6, AP.PINK, AP.ORCHID);
    p.oval(x + s * 1.1, top + s * 0.3, s * 0.8, s * 0.6, AP.PINK, AP.ORCHID);
    for (let i = 0; i < s * 3; i++) p.set(x + 1 + (hash(i, x) - 0.5) * s * 2.4, top + (hash(i, x + 1) - 0.6) * s * 1.2, AP.WHITE);
}

function blossomGrove(): StatusScene {
    const p = sky([[AP.ICE, 8], [AP.FOAM, 14], [AP.CREAM, 26]]), lights: StatusScene["lights"] = [];
    cloud(p, 60, 7, 0.7); cloud(p, 136, 10, 0.5);
    const far = range(W, H, ridge(W, 30, [[1, 3, 1], [3, 1.5, 0]]), AP.PALE, AP.LIME);
    blossom(far, 96, 31, 3);
    over(p, far);
    over(p, range(W, H, ridge(W, 37, [[2, 1.5, 0], [5, 1, 1]]), AP.LIME, AP.GRASS));
    blossom(p, 30, GROUND_Y, 7); blossom(p, 136, GROUND_Y, 8);
    floor(p, AP.LIME, AP.GRASS, AP.LEAF);
    for (let i = 0; i < 40; i++) p.set(Math.floor(hash(i, 71) * W), 41 + Math.floor(hash(i, 72) * 6), i % 3 ? AP.PINK : AP.WHITE);
    motes(lights, 10, 40, 16, [AP.PINK, AP.WHITE, AP.ORCHID], 73);
    return { pic: p, lights };
}

function dungeon(): StatusScene {
    const p = new Pic(W, H), lights: StatusScene["lights"] = [];
    bricks(p, 0, GROUND_Y, AP.BLACK, AP.SLATE, AP.IRON, 2);
    for (let i = 0; i < 40; i++) { const x = Math.floor(hash(i, 81) * W), y = 28 + Math.floor(hash(i, 82) * 12); p.set(x, y, i % 2 ? AP.FOREST : AP.PINE); }
    // a barred window high up, the moon's light
    p.rect(70, 4, 20, 12, AP.BLACK); p.rect(71, 5, 18, 10, AP.NAVY);
    for (let x = 73; x < 89; x += 4) { p.column(x, 5, AP.STEEL, 15); p.column(x + 1, 5, AP.IRON, 15); }
    lights.push([84, 7, AP.WHITE]);
    // chains on the wall
    for (const x of [40, 122]) {
        for (let y = 6; y < 24; y++) p.set(x + (y % 2), y, y % 3 ? AP.STEEL : AP.IRON);
        p.rect(x - 2, 24, 5, 1, AP.STEEL); p.rect(x - 2, 25, 1, 2, AP.STEEL); p.rect(x + 2, 25, 1, 2, AP.STEEL);
    }
    for (const x of [58, 102]) torch(p, lights, x, 16);
    floor(p, AP.STEEL, AP.IRON, AP.SLATE);
    for (let x = 0; x < W; x += 9) p.column(x + ((x / 9) % 2) * 4, 41, AP.SLATE, 44);
    p.rect(0, 44, W, 1, AP.SLATE);
    p.rect(30, 45, 12, 1, AP.DENIM); p.rect(32, 46, 8, 1, AP.DENIM);
    // a skull and a bone
    p.oval(132, 41, 3, 2.5, AP.MIST, AP.ASH); p.rect(131, 43, 3, 1, AP.MIST);
    p.set(131, 41, AP.BLACK); p.set(133, 41, AP.BLACK);
    p.rect(137, 43, 5, 1, AP.ASH); p.set(137, 42, AP.MIST); p.set(141, 44, AP.MIST);
    motes(lights, 30, 40, 3, [AP.ICE], 83);
    return { pic: p, lights };
}

// a cottage: walls, a snowy roof, a lit window, a door and a chimney
function cottage(p: Pic, lights: StatusScene["lights"], x: number, w: number, h: number, foot: number, wall: number, roof: number) {
    p.rect(x, foot - h, w, h, wall);
    p.rect(x + w - 2, foot - h, 2, h, AP.UMBER);
    const peak = Math.ceil(w / 2) + 2;
    for (let r = 0; r < peak; r++) {
        const y = foot - h - peak + r, half = r + 1;
        p.rect(x + w / 2 - half, y, half * 2, 1, r < 2 ? AP.WHITE : roof);
        p.set(x + w / 2 - half, y, AP.WHITE);
    }
    p.rect(x - 2, foot - h, w + 4, 1, AP.MIST);
    p.rect(x + w - 6, foot - h - peak, 3, 5, AP.STONE); p.rect(x + w - 6, foot - h - peak, 3, 1, AP.WHITE);
    p.rect(x + 2, foot - 6, 4, 6, AP.BARK);
    p.rect(x + w - 8, foot - h + 3, 4, 3, AP.AMBER); p.set(x + w - 6, foot - h + 3, AP.UMBER);
    lights.push([x + w - 7, foot - h + 4, AP.STRAW]);
}

function snowyVillage(): StatusScene {
    const p = sky([[AP.NAVY, 6], [AP.DENIM, 8], [AP.COBALT, 10], [AP.STEEL, 24]]), lights: StatusScene["lights"] = [];
    stars(p, lights, 14, 30, 91);
    over(p, range(W, H, ridge(W, 24, [[2, 5, 1], [3, 3, 0], [7, 1.5, 2]]), AP.MIST, AP.ASH, [22, AP.WHITE]));
    const mid = new Pic(W, H);
    for (const x of [10, 52, 108, 150]) pine(mid, x, 37, 12, AP.BARK, AP.FOREST, AP.PINE, AP.WHITE);
    over(p, mid);
    cottage(p, lights, 22, 18, 11, 39, AP.CLAY, AP.MAROON);
    cottage(p, lights, 66, 22, 13, 37, AP.TAN, AP.RUST);
    cottage(p, lights, 118, 18, 10, 39, AP.CLAY, AP.OXBLOOD);
    p.rect(0, 37, W, 3, AP.MIST);
    floor(p, AP.WHITE, AP.MIST, AP.ASH);
    for (let x = 0; x < W; x++) if (hash(x, 92) < 0.1) p.set(x, 42 + Math.floor(hash(x, 93) * 5), AP.ASH);
    motes(lights, 0, 40, 22, [AP.WHITE, AP.MIST], 94);
    return { pic: p, lights };
}

// an island afloat: grass on top, rock tapering under it, a waterfall off one side
function island(p: Pic, lights: StatusScene["lights"], cx: number, top: number, w: number) {
    const half = w / 2;
    for (let r = 0; r < w * 0.6; r++) {
        const hw = Math.round(half * (1 - r / (w * 0.6)));
        for (let d = -hw; d <= hw; d++) p.set(cx + d, top + 2 + r, d < 0 ? AP.CLAY : r % 3 ? AP.UMBER : AP.BARK);
    }
    p.rect(cx - half - 1, top, w + 2, 2, AP.GRASS); p.rect(cx - half - 1, top, w + 2, 1, AP.LIME);
    roundTree(p, cx - half / 3, top, 3, AP.UMBER, AP.LEAF, AP.FOREST, AP.LIME);
    const fx = Math.round(cx + half - 1);
    for (let y = top + 2; y < Math.min(GROUND_Y, top + 22); y++) { p.set(fx, y, AP.ICE); p.set(fx + 1, y, y % 2 ? AP.FOAM : AP.WHITE); }
    lights.push([fx, top + 6, AP.WHITE], [fx + 1, top + 12, AP.WHITE]);
}

function skyIslands(): StatusScene {
    const p = sky([[AP.COBALT, 6], [AP.SKY, 12], [AP.ICE, 14], [AP.FOAM, 16]]), lights: StatusScene["lights"] = [];
    for (let x = 0; x < W + 16; x += 14) cloud(p, x, 36 + hash(x, 101) * 3, 1);
    cloud(p, 70, 6, 0.6);
    island(p, lights, 44, 12, 20);
    island(p, lights, 118, 18, 16);
    island(p, lights, 86, 6, 8);
    // the island they stand on
    floor(p, AP.LIME, AP.GRASS, AP.UMBER);
    p.rect(0, 45, W, 2, AP.UMBER); p.rect(0, 47, W, 1, AP.BARK);
    for (let x = 0; x < W; x++) if (hash(x, 102) < 0.15) p.set(x, GROUND_Y - 1, AP.LIME);
    for (const [x, y] of [[58, 10], [64, 13], [140, 6]]) { p.set(x - 1, y - 1, AP.DENIM); p.set(x, y, AP.DENIM); p.set(x + 1, y - 1, AP.DENIM); }
    motes(lights, 2, 34, 6, [AP.WHITE], 103);
    return { pic: p, lights };
}

function autumnWoods(): StatusScene {
    const p = sky([[AP.SKY, 6], [AP.ICE, 10], [AP.FOAM, 10], [AP.CREAM, 22]]), lights: StatusScene["lights"] = [];
    // a far treeline, two rows of canopies
    for (let x = 0; x < W + 5; x += 5) p.oval(x + hash(x, 111) * 3, 24 + hash(x, 115) * 4, 5, 4, AP.CLAY, AP.RUST);
    p.rect(0, 27, W, 13, AP.RUST);
    for (let x = 0; x < W + 4; x += 4) p.oval(x + hash(x, 116) * 2, 30 + hash(x, 117) * 3, 4, 3, AP.OCHRE, AP.RUST);
    // big trees, tall trunks and their crowns ablaze
    const fall: [number, number, number][] = [[AP.FLAME, AP.RED, AP.EMBER], [AP.AMBER, AP.OCHRE, AP.STRAW], [AP.EMBER, AP.RUST, AP.STRAW]];
    [[36, 7], [64, 5], [100, 6], [128, 8]].forEach(([x, s], i) => {
        const [leaf, shade, light] = fall[i % 3], crown = GROUND_Y - 18 - s;
        p.rect(x - 1, crown, 3, GROUND_Y - crown, AP.BARK); p.column(x - 1, crown, AP.UMBER, GROUND_Y);
        p.rect(x - 4, crown + 6, 3, 1, AP.BARK); p.rect(x + 2, crown + 8, 3, 1, AP.BARK);
        p.oval(x, crown, s + 4, s, leaf, shade);
        p.oval(x - s * 0.6, crown + s * 0.5, s * 0.7, s * 0.6, leaf, shade);
        p.oval(x + s * 0.7, crown + s * 0.4, s * 0.7, s * 0.6, leaf, shade);
        for (let k = 0; k < s * 3; k++) p.set(x + (hash(k, x) - 0.6) * s * 2, crown + (hash(k, x + 1) - 0.7) * s, light);
    });
    floor(p, AP.OCHRE, AP.RUST, AP.UMBER);
    for (let i = 0; i < 70; i++) p.set(Math.floor(hash(i, 112) * W), 40 + Math.floor(hash(i, 113) * 7), [AP.FLAME, AP.AMBER, AP.STRAW, AP.RED][i % 4]);
    motes(lights, 6, 40, 14, [AP.EMBER, AP.AMBER, AP.FLAME], 114);
    return { pic: p, lights };
}

function moonlitLake(): StatusScene {
    const p = sky([[AP.BLACK, 4], [AP.MIDNIGHT, 8], [AP.NAVY, 10], [AP.DENIM, 26]]), lights: StatusScene["lights"] = [];
    stars(p, lights, 24, 60, 121);
    p.oval(80, 11, 6, 6, AP.CREAM, AP.SAND);
    for (const [x, y] of [[78, 9], [82, 13], [79, 13]]) p.set(x, y, AP.SAND);
    // the far shore, pines dark against it
    const shore = range(W, H, ridge(W, 28, [[2, 2, 0.4], [5, 1, 1.1]]), AP.SHADOW, AP.BLACK);
    for (let x = 3; x < W; x += 8) pine(shore, x + hash(x, 122) * 3, 29, 6 + hash(x, 123) * 5, AP.BLACK, AP.SHADOW, AP.BLACK);
    over(p, shore);
    // the lake, the moon along it
    p.rect(0, 30, W, 10, AP.NAVY);
    for (let y = 30; y < 40; y++) for (let x = 0; x < W; x++) if (hash(x + y * W, 124) < 0.05) p.rect(x, y, 3, 1, AP.DENIM);
    for (let y = 31; y < 40; y += 2) { const half = 3 - (y - 31) / 4; p.rect(80 - half, y, half * 2, 1, y < 35 ? AP.CREAM : AP.SAND); }
    lights.push([79, 31, AP.WHITE], [81, 33, AP.WHITE], [80, 37, AP.CREAM]);
    // reeds
    for (const x of [28, 31, 34, 122, 125, 129, 132]) { p.column(x, 33 + (x % 3), AP.FOREST, 40); p.rect(x, 32 + (x % 3), 1, 2, AP.UMBER); }
    floor(p, AP.FOREST, AP.PINE, AP.SHADOW);
    motes(lights, 30, 40, 8, [AP.LIME, AP.PALE], 125);
    return { pic: p, lights };
}

function throneRoom(): StatusScene {
    const p = new Pic(W, H), lights: StatusScene["lights"] = [];
    p.rect(0, 0, W, GROUND_Y, AP.GRAPE);
    for (let x = 0; x < W; x += 6) p.column(x, 0, AP.MIDNIGHT, GROUND_Y);
    // drapes behind the throne
    for (let x = 62; x < 98; x++) p.column(x, 0, (x - 62) % 6 < 2 ? AP.VIOLET : (x - 62) % 6 < 4 ? AP.MAGENTA : AP.ORCHID, 36);
    p.rect(60, 0, 40, 3, AP.AMBER); p.rect(60, 3, 40, 1, AP.OCHRE);
    for (let x = 61; x < 99; x += 3) p.set(x, 4, AP.STRAW);
    // pillars
    for (const x of [18, 44, 116, 142]) {
        p.rect(x - 4, 0, 8, GROUND_Y, AP.MIST);
        p.rect(x + 2, 0, 2, GROUND_Y, AP.ASH); p.rect(x - 4, 0, 1, GROUND_Y, AP.WHITE);
        for (const dx of [-2, 0]) p.column(x + dx, 3, AP.ASH, GROUND_Y - 3);
        p.rect(x - 5, 2, 10, 2, AP.WHITE); p.rect(x - 5, 36, 10, 4, AP.ASH); p.rect(x - 5, 36, 10, 1, AP.WHITE);
    }
    // the throne on its dais
    p.rect(66, 35, 28, 5, AP.STONE); p.rect(66, 35, 28, 1, AP.ASH); p.rect(70, 33, 20, 2, AP.ASH);
    p.rect(72, 10, 16, 23, AP.OCHRE); p.rect(73, 11, 13, 22, AP.AMBER);
    p.rect(75, 13, 10, 14, AP.RED); p.rect(84, 13, 1, 14, AP.MAROON);
    p.rect(70, 25, 20, 3, AP.AMBER); p.rect(70, 27, 20, 1, AP.OCHRE);
    for (const [x, y] of [[73, 8], [80, 6], [87, 8]]) { p.oval(x, y + 1, 1.5, 2, AP.STRAW, AP.AMBER); lights.push([x, y, AP.WHITE]); }
    p.oval(80, 18, 1.5, 1.5, AP.SKY); lights.push([80, 18, AP.ICE]);
    floor(p, AP.WHITE, AP.MIST, AP.STONE);
    for (let y = 41; y < H - 1; y++) for (let x = 0; x < W; x++) if ((Math.floor(x / 4) + Math.floor((y - 41) / 3)) % 2) p.set(x, y, AP.ASH);
    carpet(p, AP.MAROON, AP.RED, AP.STRAW);
    return { pic: p, lights };
}

//#region the seasons' (earned: shared/Scenes.ts SEASON_SCENES; the user, 2026-10-30)

// a string of little flags hung between two points, sagging in the middle
function bunting(p: Pic, x0: number, x1: number, y: number, sag: number, colors: number[]) {
    for (let x = x0; x <= x1; x++) {
        const t = (x - x0) / (x1 - x0), yy = Math.round(y + Math.sin(t * Math.PI) * sag);
        p.set(x, yy, AP.UMBER);
        if ((x - x0) % 5 == 1) {
            const c = colors[Math.floor((x - x0) / 5) % colors.length];
            p.rect(x, yy + 1, 3, 1, c); p.set(x + 1, yy + 2, c);
        }
    }
}

// a market stall: posts, a counter and a striped awning
function stall(p: Pic, x: number, w: number, foot: number, stripe: number) {
    p.column(x, foot - 13, AP.UMBER, foot); p.column(x + w - 1, foot - 13, AP.UMBER, foot);
    p.rect(x - 1, foot - 6, w + 2, 2, AP.TAN); p.rect(x - 1, foot - 4, w + 2, 4, AP.CLAY);
    for (let k = 0; k < w + 4; k++) p.rect(x - 2 + k, foot - 16, 1, 4, Math.floor(k / 3) % 2 ? stripe : AP.WHITE);
    for (let k = 0; k < w + 4; k += 3) p.set(x - 1 + k, foot - 12, Math.floor(k / 3) % 2 ? stripe : AP.WHITE);
    for (let k = 1; k < w - 1; k += 3) p.oval(x + k + 1, foot - 7, 1.2, 1, [AP.RED, AP.STRAW, AP.LIME][k % 3]);
}

function springFair(): StatusScene {
    const p = sky([[AP.SKY, 8], [AP.ICE, 12], [AP.FOAM, 28]]), lights: StatusScene["lights"] = [];
    cloud(p, 28, 7, 0.8); cloud(p, 132, 10, 0.6);
    over(p, range(W, H, ridge(W, 31, [[1, 3, 0.7], [3, 1.5, 2]]), AP.LIME, AP.GRASS));
    blossom(p, 14, 38, 5); blossom(p, 150, 38, 6);
    stall(p, 30, 22, GROUND_Y, AP.RED);
    stall(p, 112, 20, GROUND_Y, AP.COBALT);
    bunting(p, 0, 80, 3, 6, [AP.RED, AP.STRAW, AP.SKY, AP.LIME, AP.PINK]);
    bunting(p, 80, W - 1, 3, 6, [AP.PINK, AP.SKY, AP.STRAW, AP.RED, AP.LIME]);
    floor(p, AP.LIME, AP.GRASS, AP.LEAF);
    const petals = [AP.PINK, AP.STRAW, AP.WHITE, AP.ORCHID];
    for (let i = 0; i < 40; i++) {
        const x = Math.floor(hash(i, 131) * W), y = GROUND_Y + 2 + Math.floor(hash(i, 132) * 6);
        p.set(x, y, AP.LEAF); p.set(x, y - 1, petals[i % petals.length]);
    }
    motes(lights, 4, 38, 14, [AP.PINK, AP.WHITE, AP.ORCHID], 133);
    return { pic: p, lights };
}

function midsummerNight(): StatusScene {
    const p = sky([[AP.GRAPE, 6], [AP.VIOLET, 7], [AP.MAGENTA, 6], [AP.FLAME, 5], [AP.AMBER, 24]]), lights: StatusScene["lights"] = [];
    stars(p, lights, 10, 18, 141);
    over(p, range(W, H, ridge(W, 30, [[1, 3, 0.2], [4, 1.5, 1]]), AP.FOREST, AP.PINE));
    // the maypole, its ribbons down to the ground
    const mx = 80;
    p.rect(mx, 6, 2, GROUND_Y - 6, AP.TAN); p.column(mx + 1, 6, AP.CLAY, GROUND_Y);
    p.oval(mx + 1, 6, 3, 2, AP.LIME, AP.LEAF); p.set(mx + 1, 4, AP.PINK);
    const ribbons = [AP.RED, AP.STRAW, AP.SKY, AP.PINK, AP.WHITE, AP.LIME];
    ribbons.forEach((c, k) => {
        const end = mx - 30 + k * 12;
        for (let y = 8; y < GROUND_Y; y++) p.set(Math.round(mx + 1 + (end - mx) * (y - 8) / (GROUND_Y - 8)), y, c);
    });
    // a bonfire, off to the side
    for (const [x, c] of [[132, AP.BARK], [135, AP.UMBER], [129, AP.UMBER]] as [number, number][]) p.rect(x - 4, GROUND_Y - 2, 9, 2, c);
    p.oval(132, GROUND_Y - 6, 4, 5, AP.FLAME, AP.RED); p.oval(132, GROUND_Y - 8, 2, 4, AP.AMBER, AP.FLAME); p.set(132, GROUND_Y - 12, AP.STRAW);
    lights.push([131, GROUND_Y - 9, AP.STRAW], [133, GROUND_Y - 7, AP.AMBER], [130, GROUND_Y - 14, AP.EMBER], [134, GROUND_Y - 17, AP.EMBER]);
    floor(p, AP.GRASS, AP.LEAF, AP.FOREST);
    motes(lights, 18, 40, 12, [AP.LIME, AP.PALE, AP.STRAW], 142);
    return { pic: p, lights };
}

function harvestMoon(): StatusScene {
    const p = sky([[AP.MIDNIGHT, 6], [AP.NAVY, 10], [AP.DENIM, 12], [AP.GRAPE, 20]]), lights: StatusScene["lights"] = [];
    stars(p, lights, 20, 34, 151);
    p.oval(122, 13, 9, 9, AP.AMBER, AP.OCHRE);
    for (const [x, y] of [[118, 10], [125, 16], [121, 17], [127, 11]]) p.set(x, y, AP.OCHRE);
    lights.push([119, 9, AP.STRAW]);
    // a field of stubble in rows, the far hedge dark
    over(p, range(W, H, ridge(W, 29, [[2, 1.5, 0.3], [5, 1, 1]]), AP.SHADOW, AP.BLACK));
    p.rect(0, 31, W, 9, AP.OCHRE);
    for (let y = 32; y < 40; y += 2) for (let x = (y % 4) * 2; x < W; x += 6) p.rect(x, y, 3, 1, AP.RUST);
    // sheaves and pumpkins
    for (const x of [24, 54, 100, 146]) {
        p.rect(x - 3, GROUND_Y - 9, 7, 9, AP.STRAW); p.rect(x + 2, GROUND_Y - 9, 2, 9, AP.AMBER);
        p.rect(x - 4, GROUND_Y - 5, 9, 1, AP.UMBER);
        p.oval(x, GROUND_Y - 10, 4, 2, AP.STRAW, AP.AMBER);
    }
    for (const x of [38, 70, 84, 126]) {
        p.oval(x, GROUND_Y - 2, 3.5, 2.5, AP.EMBER, AP.RUST); p.column(x, GROUND_Y - 6, AP.LEAF, GROUND_Y - 4);
        if (x == 84) { p.set(x - 1, GROUND_Y - 3, AP.STRAW); p.set(x + 1, GROUND_Y - 3, AP.STRAW); lights.push([x, GROUND_Y - 2, AP.AMBER]); }
    }
    floor(p, AP.OCHRE, AP.UMBER, AP.BARK);
    motes(lights, 24, 40, 6, [AP.AMBER, AP.STRAW], 152);
    return { pic: p, lights };
}

function wintersEve(): StatusScene {
    const p = sky([[AP.BLACK, 4], [AP.MIDNIGHT, 8], [AP.NAVY, 12], [AP.DENIM, 24]]), lights: StatusScene["lights"] = [];
    stars(p, lights, 22, 40, 161);
    over(p, range(W, H, ridge(W, 28, [[2, 4, 1], [5, 2, 0]]), AP.MIST, AP.ASH, [26, AP.WHITE]));
    const back = new Pic(W, H);
    for (const x of [12, 30, 132, 150]) pine(back, x, 38, 10, AP.BARK, AP.FOREST, AP.PINE, AP.WHITE);
    over(p, back);
    // the great tree, hung with lights, a star on top
    const tx = 80, foot = GROUND_Y, h = 34;
    p.rect(tx - 1, foot - 4, 3, 4, AP.BARK);
    for (let r = 0; r < h - 4; r++) {
        const y = foot - 4 - r, half = Math.round((h - 4 - r) * 0.45 + (r % 6 < 2 ? 1 : 0));
        p.rect(tx - half, y, half * 2 + 1, 1, r % 6 < 2 ? AP.PINE : AP.FOREST);
        if (r % 6 == 0) p.rect(tx - half, y, half * 2 + 1, 1, AP.WHITE);
    }
    const bulbs = [AP.RED, AP.STRAW, AP.SKY, AP.PINK, AP.LIME];
    for (let k = 0; k < 18; k++) {
        const r = 2 + Math.floor(hash(k, 162) * (h - 8)), half = Math.round((h - 4 - r) * 0.45), y = foot - 4 - r;
        const x = Math.round(tx - half + hash(k, 163) * half * 2);
        p.set(x, y, bulbs[k % bulbs.length]);
        if (k % 2) lights.push([x, y, bulbs[k % bulbs.length]]);
    }
    p.set(tx, foot - h - 1, AP.STRAW); p.rect(tx - 1, foot - h, 3, 1, AP.STRAW); p.set(tx, foot - h + 1, AP.AMBER);
    lights.push([tx, foot - h - 1, AP.WHITE]);
    // gifts under it, lanterns either side
    for (const [x, c, w] of [[70, AP.RED, 5], [88, AP.COBALT, 6], [76, AP.LIME, 4]] as [number, number, number][]) {
        p.rect(x, foot - 4, w, 4, c); p.column(x + Math.floor(w / 2), foot - 4, AP.STRAW, foot); p.rect(x, foot - 3, w, 1, AP.STRAW);
    }
    for (const x of [46, 114]) {
        p.column(x, foot - 14, AP.IRON, foot); p.rect(x - 2, foot - 17, 5, 4, AP.IRON); p.rect(x - 1, foot - 16, 3, 2, AP.AMBER);
        lights.push([x, foot - 15, AP.STRAW]);
    }
    floor(p, AP.WHITE, AP.MIST, AP.ASH);
    for (let x = 0; x < W; x++) if (hash(x, 164) < 0.1) p.set(x, 42 + Math.floor(hash(x, 165) * 5), AP.ASH);
    motes(lights, 0, 40, 26, [AP.WHITE, AP.MIST], 166);
    return { pic: p, lights };
}

//#endregion

//#region more (a Supporter's to start; the user, 2026-11-01: "Add more cosmetics")

// a palm, its trunk bending `lean` px over its height, fronds drooping from the top
function palm(p: Pic, foot: number, x: number, top: number, lean: number) {
    const h = foot - top;
    for (let y = top; y < foot; y++) p.rect(x + Math.round(lean * ((foot - y) / h) ** 2), y, 2, 1, y % 3 ? AP.UMBER : AP.BARK);
    const tx = x + lean;
    for (const [dx, dy] of [[-1, 0], [1, 0], [-1, 0.5], [1, 0.6], [0.2, -1]]) for (let k = 1; k < 10; k++)
        p.set(tx + dx * k, top + dy * k + (k * k) / 30, k < 5 ? AP.LEAF : AP.FOREST);
    p.oval(tx + 1, top + 1, 1.5, 1.5, AP.BARK);
}

function coralReef(): StatusScene {
    const p = sky([[AP.ICE, 3], [AP.SKY, 7], [AP.COBALT, 12], [AP.DENIM, 26]]), lights: StatusScene["lights"] = [];
    // the light coming down in slanting shafts
    for (const x0 of [20, 58, 104, 140]) for (let y = 0; y < GROUND_Y; y++) for (let d = 0; d < 4; d++)
        if ((d + y) % 2 == 0) p.set(x0 + d - y * 0.4, y, y < 12 ? AP.FOAM : AP.ICE);
    // far rocks, then the sea floor
    over(p, range(W, H, ridge(W, 33, [[2, 2, 0.6], [5, 1.5, 0]]), AP.DENIM, AP.NAVY));
    floor(p, AP.SAND, AP.TAN, AP.CLAY);
    for (let x = 0; x < W; x++) if (hash(x, 171) < 0.08) p.set(x, 42 + Math.floor(hash(x, 172) * 5), hash(x, 173) < 0.5 ? AP.CREAM : AP.PINK);
    // seaweed, swaying
    for (const x of [8, 12, 46, 50, 96, 132, 152]) {
        const h = 10 + Math.floor(hash(x, 174) * 12);
        for (let k = 0; k < h; k++) p.set(x + Math.round(Math.sin(k / 2.5 + x) * 1.2), GROUND_Y - k, k % 4 ? AP.LEAF : AP.GRASS);
    }
    // branching coral and round brain coral
    const branch = (x: number, h: number, light: number, dark: number) => {
        for (let k = 0; k < h; k++) p.set(x, GROUND_Y - k, k % 3 ? light : dark);
        for (const [dx, from, len] of [[-1, 3, 5], [1, 5, 4], [-1, 8, 3]]) for (let k = 0; k < len && from + k < h + 2; k++)
            p.set(x + dx * (1 + Math.floor(k / 2)), GROUND_Y - from - k, light);
    };
    branch(26, 14, AP.PINK, AP.ORCHID); branch(31, 10, AP.ORCHID, AP.MAGENTA); branch(116, 15, AP.EMBER, AP.FLAME);
    branch(121, 9, AP.STRAW, AP.AMBER); branch(140, 12, AP.PINK, AP.ORCHID);
    for (const [x, r, c, d] of [[38, 4, AP.AMBER, AP.OCHRE], [106, 3, AP.LIME, AP.GRASS], [62, 3, AP.ORCHID, AP.VIOLET]] as [number, number, number, number][]) {
        p.oval(x, GROUND_Y - r + 1, r + 1, r, c, d);
        for (let k = -r; k <= r; k += 2) p.set(x + k, GROUND_Y - r + 1, d);
    }
    // fish
    for (const [x, y, c, s] of [[52, 10, AP.AMBER, 1], [70, 16, AP.STRAW, -1], [124, 8, AP.FLAME, 1], [88, 22, AP.FOAM, -1]]) {
        p.oval(x, y, 2.5, 1.5, c); p.set(x - 3 * s, y - 1, c); p.set(x - 3 * s, y + 1, c); p.set(x + s, y, AP.INK);
    }
    // bubbles rising
    motes(lights, 2, 38, 18, [AP.WHITE, AP.FOAM], 175);
    return { pic: p, lights };
}

function desertOasis(): StatusScene {
    const p = sky([[AP.SKY, 6], [AP.ICE, 10], [AP.FOAM, 8], [AP.CREAM, 24]]), lights: StatusScene["lights"] = [];
    p.oval(36, 10, 6, 6, AP.WHITE, AP.CREAM); p.oval(36, 10, 4, 4, AP.WHITE);
    lights.push([34, 8, AP.WHITE]);
    // dunes, far then near
    over(p, range(W, H, ridge(W, 28, [[1, 3, 0.2], [3, 2, 1.4]]), AP.SAND, AP.TAN));
    over(p, range(W, H, ridge(W, 34, [[2, 2, 2.1], [4, 1, 0.5]]), AP.CREAM, AP.SAND));
    // the pool, its edge green with grass
    p.oval(92, 38, 30, 3, AP.SKY, AP.COBALT);
    p.rect(66, 37, 52, 1, AP.ICE);
    for (let x = 60; x < 126; x++) if (hash(x, 181) < 0.4 && Math.abs(x - 92) > 26) p.set(x, 37 + Math.floor(hash(x, 182) * 3), AP.GRASS);
    lights.push([80, 37, AP.WHITE], [100, 38, AP.FOAM], [110, 37, AP.WHITE]);
    // palms round it
    palm(p, GROUND_Y, 64, 14, 6); palm(p, GROUND_Y, 120, 18, -5); palm(p, GROUND_Y, 128, 22, 4);
    floor(p, AP.CREAM, AP.SAND, AP.TAN);
    for (let x = 0; x < W; x++) if (hash(x, 183) < 0.1) p.set(x, 42 + Math.floor(hash(x, 184) * 5), AP.TAN);
    motes(lights, 20, 38, 5, [AP.CREAM], 185);
    return { pic: p, lights };
}

// a toadstool: a stalk and a domed cap, spotted
function toadstool(p: Pic, lights: StatusScene["lights"], x: number, h: number, r: number, cap: number, shade: number, spot: number, glow: boolean) {
    p.rect(x - 1, GROUND_Y - h, 3, h, AP.CREAM); p.column(x + 1, GROUND_Y - h, AP.SAND, GROUND_Y);
    const top = GROUND_Y - h;
    for (let dy = 0; dy <= r * 0.6; dy++) {
        const half = Math.round(r * Math.sqrt(1 - (dy / (r * 0.6 + 1)) ** 2));
        p.rect(x - half, top - dy, half * 2 + 1, 1, dy == 0 ? shade : cap);
    }
    for (let k = 0; k < r; k++) {
        const sx = Math.round(x + (hash(k, x) - 0.5) * r * 1.4), sy = Math.round(top - 1 - hash(k, x + 1) * r * 0.45);
        p.set(sx, sy, spot);
        if (glow && k % 2 == 0) lights.push([sx, sy, spot]);
    }
}

function mushroomForest(): StatusScene {
    const p = sky([[AP.MIDNIGHT, 8], [AP.GRAPE, 12], [AP.VIOLET, 28]]), lights: StatusScene["lights"] = [];
    stars(p, lights, 14, 24, 191);
    over(p, range(W, H, ridge(W, 30, [[2, 2, 0.8], [6, 1, 0]]), AP.PLUM, AP.WINE));
    toadstool(p, lights, 22, 22, 13, AP.RED, AP.MAROON, AP.WHITE, false);
    toadstool(p, lights, 52, 9, 6, AP.ORCHID, AP.MAGENTA, AP.PINK, true);
    toadstool(p, lights, 112, 26, 15, AP.SKY, AP.COBALT, AP.FOAM, true);
    toadstool(p, lights, 140, 12, 7, AP.AMBER, AP.OCHRE, AP.STRAW, true);
    toadstool(p, lights, 82, 5, 4, AP.RED, AP.MAROON, AP.WHITE, false);
    floor(p, AP.FOREST, AP.PINE, AP.SHADOW);
    // little ones in the moss, glowing
    for (let i = 0; i < 16; i++) {
        const x = Math.floor(hash(i, 192) * W), y = GROUND_Y + 2 + Math.floor(hash(i, 193) * 5), c = [AP.ORCHID, AP.FOAM, AP.STRAW][i % 3];
        p.set(x, y, AP.CREAM); p.set(x - 1, y - 1, c); p.set(x, y - 1, c); p.set(x + 1, y - 1, c);
        if (i % 3 == 0) lights.push([x, y - 1, c]);
    }
    motes(lights, 4, 38, 14, [AP.PINK, AP.FOAM, AP.LIME], 194);
    return { pic: p, lights };
}

function graveyard(): StatusScene {
    const p = sky([[AP.BLACK, 6], [AP.MIDNIGHT, 10], [AP.SLATE, 12], [AP.IRON, 20]]), lights: StatusScene["lights"] = [];
    stars(p, lights, 18, 30, 201);
    p.oval(126, 12, 8, 8, AP.CREAM, AP.SAND); p.oval(124, 10, 2, 1.5, AP.SAND); p.oval(129, 15, 1.5, 1, AP.SAND);
    lights.push([122, 8, AP.WHITE]);
    // a bare tree, its branches crooked
    p.rect(30, 14, 3, GROUND_Y - 14, AP.SOOT);
    for (const [dx, dir, y, len] of [[0, -1, 20, 9], [2, 1, 16, 10], [0, -1, 28, 6], [2, 1, 25, 7]]) for (let k = 0; k < len; k++)
        p.set(30 + dx + dir * k, y - Math.floor(k * 0.6) - (k > len / 2 ? 1 : 0), AP.SOOT);
    // a chapel, its window lit
    p.rect(54, 16, 22, GROUND_Y - 16, AP.SHADOW);
    for (let k = 0; k < 12; k++) p.rect(54 + k, 16 - k, 22 - k * 2, 1, AP.BLACK);
    p.rect(64, 0, 2, 6, AP.SHADOW); p.rect(62, 2, 6, 1, AP.SHADOW);
    p.rect(62, 22, 6, 8, AP.AMBER); p.oval(64.5, 22, 3, 2, AP.AMBER); p.column(65, 20, AP.SHADOW, 30); p.rect(62, 25, 6, 1, AP.SHADOW);
    lights.push([63, 23, AP.STRAW], [66, 27, AP.STRAW]);
    // an iron fence along the back
    p.rect(0, 33, W, 1, AP.BLACK);
    for (let x = 1; x < W; x += 4) { p.column(x, 30, AP.BLACK, GROUND_Y); p.set(x, 29, AP.SHADOW); }
    // gravestones
    for (const [x, w, h, round] of [[14, 6, 9, 1], [44, 5, 7, 0], [88, 7, 10, 1], [102, 5, 6, 0], [138, 6, 8, 1], [152, 4, 6, 0]]) {
        p.rect(x, GROUND_Y - h, w, h, AP.STONE); p.rect(x + w - 1, GROUND_Y - h, 1, h, AP.STEEL);
        if (round) { p.rect(x + 1, GROUND_Y - h - 1, w - 2, 1, AP.STONE); }
        else { p.rect(x + Math.floor(w / 2) - 2, GROUND_Y - h + 2, 5, 1, AP.STEEL); p.column(x + Math.floor(w / 2), GROUND_Y - h, AP.STEEL, GROUND_Y - h + 5); }
        p.rect(x + 1, GROUND_Y - h + 3, w - 3, 1, AP.STEEL);
    }
    floor(p, AP.LEAF, AP.FOREST, AP.PINE);
    // the mist along the ground
    for (let x = 0; x < W; x++) if (hash(x, 202) < 0.5) p.set(x, GROUND_Y - 1 - Math.floor(hash(x, 203) * 2), AP.STONE);
    // will-o'-the-wisps
    motes(lights, 18, 38, 7, [AP.FOAM, AP.LIME], 204);
    return { pic: p, lights };
}

//#endregion

// in SCENES order (0, the land they're in, isn't one of these)
const MAKERS: (() => StatusScene)[] = [null, meadow, castleHall, tavern, starryNight, sunsetBeach, crystalCave, library,
    volcano, blossomGrove, dungeon, snowyVillage, skyIslands, autumnWoods, moonlitLake, throneRoom,
    springFair, midsummerNight, harvestMoon, wintersEve, coralReef, desertOasis, mushroomForest, graveyard];
if (MAKERS.length != SCENES.length) console.warn("StatusScenes: a scene without art");

const made = new Map<number, StatusScene>();
export function statusScene(i: number): StatusScene {
    let scene = made.get(i);
    if (!scene) made.set(i, scene = (MAKERS[i] ?? meadow)());
    return scene;
}
