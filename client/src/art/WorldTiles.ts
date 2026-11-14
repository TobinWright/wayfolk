import { AP } from "../constants/Palette";
import { hash, NE, NW, SE, SW, TO_E, TO_N, TO_S, TO_W } from "./WorldAutotile";

// The world map's tileset, painted in code in Apollo colours (never
// dithered: shading is the next colour of a ramp, lit from the top left).
// Textures come from noise that repeats every tile, so tiles sit side by
// side without seams. Terrain meets terrain in corner sets: a tile for each
// combination of a tile's corners a terrain covers (bits NW NE SE SW), its
// edge running between them wobbled by that repeating noise, so neighbours
// agree along the edge they share. Water, coasts and rivers are animated:
// FRAMES frames side by side in the sheet, the waves drifting a quarter of a
// tile a frame so the last runs back into the first.
// tools/render-world.js writes the sheet out and builds the map with it.

export const N = 16;
export const FRAMES = 4;
export const COLUMNS = 16;
export type Pic = number[]; // N x N colours, row by row; -1 see-through

// (the corners' bits, a river's ways and the noise are WorldAutotile's, which
// chooses which of these tiles goes where)
export { hash, NE, NW, SE, SW, TO_E, TO_N, TO_S, TO_W };

const blank = (): Pic => new Array(N * N).fill(-1);
const at = (x: number, y: number) => ((y & 15) << 4) | (x & 15); // wraps, so textures tile

//#region noise

const smooth = (t: number) => t * t * (3 - 2 * t);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

// smooth value noise, 0-1, repeating every tile (cell divides 16)
function noise(x: number, y: number, seed: number, cell: number) {
    const g = N / cell;
    const fx = x / cell, fy = y / cell, x0 = Math.floor(fx), y0 = Math.floor(fy);
    const v = (i: number, j: number) => hash(((i % g) + g) % g, ((j % g) + g) % g, seed);
    const tx = smooth(fx - x0), ty = smooth(fy - y0);
    return lerp(lerp(v(x0, y0), v(x0 + 1, y0), tx), lerp(v(x0, y0 + 1), v(x0 + 1, y0 + 1), tx), ty);
}

// the colour of a ramp for v (0-1)
const tone = (ramp: number[], v: number) => ramp[Math.max(0, Math.min(ramp.length - 1, Math.floor(v * ramp.length)))];

//#endregion

//#region water

interface Water { base: number; crest: number; glint: number; }
const DEEP: Water = { base: AP.NAVY, crest: AP.DENIM, glint: AP.COBALT };
const SEA: Water = { base: AP.DENIM, crest: AP.COBALT, glint: AP.SKY };
const SHALLOW: Water = { base: AP.COBALT, crest: AP.SKY, glint: AP.ICE };

// swells drifting a quarter tile a frame (two ways at once), so FRAMES loop
function swell(x: number, y: number, f: number, seed: number) {
    return noise(x + 4 * f, y, seed, 8) * 0.6 + noise(x - 4 * f, y + 4 * f, seed + 1, 8) * 0.4;
}

function water(w: Water, f: number, seed = 1): Pic {
    const p = blank();
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
        const v = swell(x, y, f, seed);
        // the lit top of a swell, and now and then a glint on it
        const top = v > 0.62 && swell(x, y - 1, f, seed) <= 0.62;
        p[at(x, y)] = top ? (v > 0.66 && hash(x, y, seed + f) < 0.3 ? w.glint : w.crest) : w.base;
    }
    return p;
}

//#endregion

//#region the ground

function grass(seed = 2, extra = 0): Pic {
    const p = blank();
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
        const v = 0.5 + (noise(x, y, seed, 8) - 0.5) * 0.5 + (noise(x, y, seed + 1, 4) - 0.5) * 0.35;
        p[at(x, y)] = v > 0.76 ? AP.LIME : AP.GRASS;
    }
    // tufts: a lit pixel
    for (let k = 0; k < 2 + extra; k++) {
        const x = Math.floor(hash(k, 1, seed + 10 * extra) * N), y = Math.floor(hash(k, 2, seed + 10 * extra) * N);
        p[at(x, y)] = AP.LIME;
    }
    return p;
}

// grass with a few flowers (`extra` as grass's, so they and its tufts fall elsewhere)
function meadow(extra = 1, flowers = [[3, 4, AP.PALE], [11, 3, AP.PINK], [7, 11, AP.STRAW], [13, 12, AP.PALE]]): Pic {
    const p = grass(2, extra);
    flowers.forEach(([x, y, c]) => p[at(x, y)] = c);
    return p;
}



// Grounds with features of their own (snow, sand, bog) are a flat colour
// with specks and one or two features scattered at random, and come in
// several versions picked at random, as a picture repeating every tile
// would show the grid.

// `n` random spots in the tile (k-th: x, y)
const spot = (k: number, seed: number): [number, number] => [Math.floor(hash(k, 1, seed) * N), Math.floor(hash(k, 2, seed) * N)];
function specks(p: Pic, n: number, c: number, seed: number) {
    for (let k = 0; k < n; k++) { const [x, y] = spot(k, seed); p[at(x, y)] = c; }
}

// snow: a drift's shaded lip here and there, a few sparkles
function snow(seed = 3): Pic {
    const p = blank().map(() => AP.MIST);
    specks(p, 5, AP.ASH, seed);
    specks(p, 2, AP.WHITE, seed + 1);
    const [x, y] = spot(0, seed + 2);
    for (let i = 0; i < 6; i++) p[at(x + i, y + (i == 0 || i == 5 ? 0 : 1))] = AP.ASH;
    return p;
}

// sand: specks, and a ripple lit on its windward side
function desert(seed = 4): Pic {
    const p = blank().map(() => AP.AMBER);
    specks(p, 6, AP.OCHRE, seed);
    specks(p, 2, AP.STRAW, seed + 1);
    const [x, y] = spot(0, seed + 2);
    for (let i = 0; i < 6; i++) {
        const dy = i == 0 || i == 5 ? 1 : 0;
        p[at(x + i, y + dy)] = AP.STRAW; p[at(x + i, y + dy + 1)] = AP.OCHRE;
    }
    return p;
}

// a bog: dark mud, moss, reeds, and a still pool
function swamp(seed = 5): Pic {
    const p = blank().map(() => AP.BARK);
    specks(p, 8, AP.UMBER, seed);
    specks(p, 4, AP.FOREST, seed + 1);
    for (let k = 0; k < 2; k++) {
        const [x, y] = spot(k, seed + 3);
        p[at(x, y)] = AP.LIME; p[at(x, y + 1)] = AP.LEAF; p[at(x + 1, y + 1)] = AP.LIME; p[at(x + 1, y + 2)] = AP.LEAF;
    }
    const [cx, cy] = spot(0, seed + 4), rx = 2.5 + hash(1, 1, seed) * 2, ry = 1.6 + hash(2, 2, seed);
    for (let y = -3; y <= 3; y++) for (let x = -5; x <= 5; x++) {
        const d = (x / rx) ** 2 + (y / ry) ** 2;
        if (d > 1) continue;
        const top = ((x / rx) ** 2 + ((y - 1) / ry) ** 2) > 1;
        p[at(cx + x, cy + y)] = top ? AP.SHADOW : y == 0 && x == -1 ? AP.STEEL : AP.IRON;
    }
    return p;
}

// ash round the volcano, cracked with glowing lava
function ash(seed = 6): Pic {
    const p = blank();
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
        const v = 0.5 + (noise(x, y, seed, 8) - 0.5) * 0.5 + (noise(x, y, seed + 1, 2) - 0.5) * 0.3;
        p[at(x, y)] = v < 0.32 ? AP.SLATE : v > 0.72 ? AP.STEEL : AP.IRON;
    }
    for (let k = 0; k < 1; k++) {
        let x = Math.floor(hash(k, 1, seed) * N), y = Math.floor(hash(k, 2, seed) * N);
        for (let i = 0; i < 5; i++) {
            p[at(x, y)] = i == 2 || i == 3 ? AP.EMBER : AP.FLAME;
            if (hash(k, i, seed + 1) < 0.5) x++; else y++;
        }
    }
    return p;
}

//#endregion

//#region corner sets

// the corners blended over the tile: 1 at a covered corner, 0 at one that isn't
function blend(mask: number, x: number, y: number) {
    const c = (bit: number) => mask & bit ? 1 : 0, u = x / N, v = y / N;
    return lerp(lerp(c(NW), c(NE), u), lerp(c(SW), c(SE), u), v);
}

// how covered a pixel is (0.5 and over: covered), its edge wobbling
function cover(mask: number, x: number, y: number, seed: number) {
    return blend(mask, x + 0.5, y + 0.5) + (noise(x, y, seed, 4) - 0.5) * 0.3 + (noise(x, y, seed + 1, 2) - 0.5) * 0.12;
}

// a terrain's picture over what's under it, see-through where it isn't
function patch(mask: number, pic: Pic, seed: number, fringe = -1): Pic {
    const p = blank();
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
        const c = cover(mask, x, y, seed), k = at(x, y);
        if (c >= 0.54) p[k] = pic[k];
        else if (c >= 0.5) p[k] = fringe >= 0 ? fringe : pic[k];
    }
    return p;
}

interface Shore { ground: Pic; dark: number; rim: [number, number]; seed: number; }
// (one seed for them all, so a beach meets rocks or ice along the same edge)
const GRASS_SHORE: Shore = { ground: grass(), dark: AP.LEAF, rim: [AP.SAND, AP.CREAM], seed: 30 };
const ROCK_SHORE: Shore = { ground: grass(), dark: AP.LEAF, rim: [AP.IRON, AP.STEEL], seed: 30 };
const SNOW_SHORE: Shore = { ground: snow(), dark: AP.ASH, rim: [AP.ICE, AP.FOAM], seed: 30 };

// land over the water: the ground, its rim (a beach, rocks, ice), and the
// surf, which washes up and back over the frames; the water is the map's
// water layer under it
function shore(mask: number, f: number, s: Shore): Pic {
    const p = blank();
    const c = (x: number, y: number) => cover(mask, x, y, s.seed);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
        const v = c(x, y), k = at(x, y);
        if (v >= 0.58) p[k] = c(x, y + 1) < 0.58 || c(x + 1, y) < 0.58 ? s.dark : s.ground[k];
        else if (v >= 0.5) p[k] = v >= 0.54 ? s.rim[1] : s.rim[0];
        else {
            const surf = 0.07 + 0.045 * Math.sin((f / FRAMES) * Math.PI * 2 + noise(x, y, s.seed + 5, 8) * Math.PI * 2);
            if (v >= 0.5 - surf * 0.45) p[k] = AP.WHITE;
            else if (v >= 0.5 - surf) p[k] = AP.FOAM;
        }
    }
    return p;
}

//#endregion

//#region scattered shapes: trees, peaks, hills

// a shape at (x, y), reaching `reach` px every way
interface Shape { x: number; y: number; reach: number; }
type Draw = (p: Pic, s: Shape, ox: number, oy: number, seed: number) => void;

// The same shapes in every tile: a jittered grid of them, any reaching over
// two of the tile's edges at once (across a corner) shrunk until it doesn't,
// so a shape only ever spills into one neighbour.
function layout(cols: number, rows: number, size: number, seed: number): Shape[] {
    const shapes: Shape[] = [];
    for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
        const x = ((i + (j % 2 ? 0.5 : 0.25) + (hash(i, j, seed) - 0.5) * 0.35) / cols) * N;
        const y = ((j + 0.5 + (hash(i, j, seed + 1) - 0.5) * 0.3) / rows) * N;
        let reach = size * (0.85 + hash(i, j, seed + 2) * 0.3);
        const crossX = () => x - reach < 0 || x + reach > N, crossY = () => y - reach < 0 || y + reach > N;
        while (crossX() && crossY() && reach > 1.5) reach -= 0.25;
        shapes.push({ x: ((x % N) + N) % N, y, reach });
    }
    return shapes;
}

// which shapes this tile draws, and where: its own in its covered part (and
// over an edge only if all of that edge is covered), and its neighbours'
// reaching into it over an edge all covered
function placed(mask: number, shapes: Shape[], seed: number): [Shape, number, number][] {
    const full = {
        top: (mask & NW) && (mask & NE), bottom: (mask & SW) && (mask & SE),
        left: (mask & NW) && (mask & SW), right: (mask & NE) && (mask & SE),
    };
    const out: [Shape, number, number][] = [];
    for (const s of shapes) for (const oy of [-N, 0, N]) for (const ox of [-N, 0, N]) {
        const x = s.x + ox, y = s.y + oy;
        if (x + s.reach < 0 || x - s.reach > N || y + s.reach < 0 || y - s.reach > N) continue;
        const crossesL = x - s.reach < 0, crossesR = x + s.reach > N, crossesT = y - s.reach < 0, crossesB = y + s.reach > N;
        if (ox == 0 && oy == 0) {
            const c = blend(mask, x, y);
            if (c < 0.5 || (c < 0.65 && hash(Math.floor(x), Math.floor(y), seed) < 0.5)) continue;
            if ((crossesL && !full.left) || (crossesR && !full.right) || (crossesT && !full.top) || (crossesB && !full.bottom)) continue;
        } else if (ox != 0 && oy != 0) continue;
        else if (ox < 0 ? !full.left : ox > 0 ? !full.right : oy < 0 ? !full.top : !full.bottom) continue;
        out.push([s, ox, oy]);
    }
    return out.sort((a, b) => (a[0].y + a[2]) - (b[0].y + b[2])); // back to front
}

// shapes over a darker floor where the tile's well covered
function scattered(mask: number, shapes: Shape[], draw: Draw, floor: number[], seed: number): Pic {
    const p = blank();
    if (floor.length) for (let y = 0; y < N; y++) for (let x = 0; x < N; x++)
        if (cover(mask, x, y, seed) >= 0.66) p[at(x, y)] = tone(floor, 0.5 + (noise(x, y, seed, 4) - 0.5) * 0.9);
    for (const [s, ox, oy] of placed(mask, shapes, seed)) draw(p, s, ox, oy, seed);
    return p;
}

// a shape given by `inside` (dx, dy from its middle), lit by `light`,
// outlined in the ramp's darkest, clipped to the tile
function stamp(p: Pic, s: Shape, ox: number, oy: number, ramp: number[], inside: (dx: number, dy: number) => boolean,
    light: (dx: number, dy: number) => number) {
    const cx = s.x + ox, cy = s.y + oy, r = Math.ceil(s.reach * 1.7) + 1;
    const isIn = (x: number, y: number) => inside(x + 0.5 - cx, y + 0.5 - cy);
    for (let y = Math.floor(cy - r); y <= cy + r; y++) for (let x = Math.floor(cx - r); x <= cx + r; x++) {
        if (x < 0 || y < 0 || x >= N || y >= N || !isIn(x, y)) continue;
        const edge = !isIn(x - 1, y) || !isIn(x + 1, y) || !isIn(x, y - 1) || !isIn(x, y + 1);
        p[y * N + x] = edge ? ramp[0] : tone(ramp.slice(1), light(x + 0.5 - cx, y + 0.5 - cy));
    }
}

const LEAVES = [AP.PINE, AP.FOREST, AP.LEAF, AP.GRASS];
const NEEDLES = [AP.PINE, AP.PINE, AP.FOREST, AP.LEAF];
const ROCK = [AP.SHADOW, AP.IRON, AP.STEEL, AP.STONE, AP.ASH];

// a round crown of leaves
const tree: Draw = (p, s, ox, oy, seed) => stamp(p, s, ox, oy, LEAVES,
    (dx, dy) => dx * dx + dy * dy * 1.15 <= s.reach * s.reach,
    (dx, dy) => 0.5 + (-dx * 0.6 - dy) / s.reach * 0.35 + (hash(Math.floor(dx + s.x), Math.floor(dy + s.y), seed) - 0.5) * 0.25);

// a pine: a narrow triangle, its boughs in steps, lit on their left
const pine: Draw = (p, s, ox, oy) => stamp(p, s, ox, oy, NEEDLES,
    (dx, dy) => dy <= s.reach && dy >= -s.reach * 1.25 && Math.abs(dx) <= (dy + s.reach * 1.25) * 0.36 + 0.3,
    (dx, dy) => (dx < 0 ? 0.45 : 0.15) + (Math.floor(dy + s.reach * 1.25) % 3 == 0 && dx < 0 ? 0.3 : 0));

// a pine in the snow: its lit boughs white
const snowyPine: Draw = (p, s, ox, oy, seed) => {
    const before = p.slice();
    pine(p, s, ox, oy, seed);
    for (let i = 0; i < p.length; i++) if (p[i] == AP.LEAF && p[i] != before[i]) p[i] = AP.WHITE;
};

// a bare, dead tree: a short crooked trunk forking into branches (some
// places have none, so the swamp shows between them)
const deadTree: Draw = (p, s, ox, oy, seed) => {
    const k = Math.floor(s.x * 7 + s.y * 13);
    if (hash(k, 0, seed) < 0.3) return;
    const set = (x: number, y: number, c: number) => { if (x >= 0 && y >= 0 && x < N && y < N) p[y * N + x] = c; };
    const cx = Math.round(s.x + ox), base = Math.round(s.y + oy + 2);
    const lean = hash(k, 1, seed) < 0.5 ? -1 : 1;
    set(cx - 1, base + 1, AP.SHADOW); set(cx, base + 1, AP.SHADOW); set(cx + 1, base + 1, AP.SHADOW);
    // bleached grey wood, lit on the left
    for (let y = base; y > base - 4; y--) { set(cx, y, AP.STEEL); set(cx - 1, y, AP.ASH); }
    // a fork: one branch up and out each way, the leaning one longer
    for (let i = 1; i <= 3; i++) set(cx - 1 - i, base - 3 - i + (lean < 0 ? 0 : 1), AP.ASH);
    for (let i = 1; i <= 3; i++) set(cx + i, base - 3 - i + (lean > 0 ? 0 : 1), AP.STEEL);
    set(cx, base - 4, AP.STEEL); set(cx, base - 5, AP.STEEL);
};

// a mountain: a jagged peak, lit on its left face, darker on its right;
// a high one capped with snow
function peak(snowy: boolean): Draw {
    return (p, s, ox, oy, seed) => {
        const h = s.reach * 1.6, half = s.reach;
        const jag = (dx: number) => (hash(Math.floor(dx + s.x + 40), 7, seed) - 0.5) * 1.2;
        const inPeak = (dx: number, dy: number) => dy <= half * 0.75 && dy >= -h * 0.62 + Math.abs(dx) * 1.25 + jag(dx);
        const capped = (dx: number, dy: number) => snowy && dy < -h * 0.62 + 4.5 + Math.abs(dx) * 0.5;
        const lit = (dx: number, dy: number) => dx < (dy + h * 0.6) * 0.12 - 0.5;
        stamp(p, s, ox, oy, ROCK, inPeak,
            (dx, dy) => capped(dx, dy) ? 0.99 : (lit(dx, dy) ? 0.62 : 0.2) + (Math.abs(dy) % 3 < 1 ? -0.12 : 0));
        if (!snowy) return;
        const cx = s.x + ox, cy = s.y + oy;
        for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
            const dx = x + 0.5 - cx, dy = y + 0.5 - cy;
            if (inPeak(dx, dy) && capped(dx, dy) && p[y * N + x] != ROCK[0]) p[y * N + x] = lit(dx, dy) ? AP.WHITE : AP.MIST;
        }
    };
}

// a grassy hill: a low hump lit from the top left, a shadow at its foot
const hill: Draw = (p, s, ox, oy) => {
    const cx = s.x + ox, cy = s.y + oy, rx = s.reach * 1.2, ry = s.reach * 0.8;
    for (let y = Math.floor(cy - ry); y <= cy + 1; y++) for (let x = Math.floor(cx - rx); x <= cx + rx; x++) {
        if (x < 0 || y < 0 || x >= N || y >= N) continue;
        const dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry;
        if (dy > 0.15) { if (dx * dx < 0.8 && y == Math.floor(cy + 1)) p[y * N + x] = AP.FOREST; continue; }
        const d = dx * dx + dy * dy;
        if (d > 1) continue;
        p[y * N + x] = d > 0.78 ? AP.FOREST : dx * 0.8 + dy < -0.55 ? AP.LIME : dx > 0.3 ? AP.LEAF : AP.GRASS;
    }
};

const TREES = layout(3, 4, 3.2, 70);
const PINES = layout(4, 3, 3.2, 71);
// dead trees: two or three, kept off the tile's edges (so versions of a
// tile can sit side by side)
function snags(seed: number): Shape[] {
    const n = Math.floor(hash(0, 0, seed) * 3.5), out: Shape[] = [];
    for (let k = 0; k < n; k++) out.push({ x: 4 + ((k + hash(k, 1, seed)) / n) * 8, y: 4 + hash(k, 2, seed) * 6, reach: 3 });
    return out;
}
const HUMPS = layout(2, 2, 4.5, 73);
// peaks: one at the top middle, two at the sides, one in front
const RANGE: Shape[] = [{ x: 8, y: 4.5, reach: 6 }, { x: 3, y: 9.5, reach: 5.5 }, { x: 13, y: 9.5, reach: 5.5 }, { x: 8, y: 13.5, reach: 6 }];

//#endregion

//#region rivers

// a river from the middle of the tile to each edge it flows to (a lone
// one, a spring: a pool), its banks darker; the water drifting as the sea's
function river(mask: number, f: number): Pic {
    const p = blank(), w = water(SHALLOW, f, 9);
    const ends = [[8, -1], [17, 8], [8, 17], [-1, 8]].filter((_, i) => mask & (1 << i));
    // how far from the river's middle line (segments from the tile's middle to each edge)
    const dist = (x: number, y: number) => {
        let d = mask ? 99 : Math.hypot(x - 8, y - 8) - 2;
        for (const [ex, ey] of ends) {
            const vx = ex - 8, vy = ey - 8, t = Math.max(0, Math.min(1, ((x - 8) * vx + (y - 8) * vy) / (vx * vx + vy * vy)));
            d = Math.min(d, Math.hypot(x - 8 - vx * t, y - 8 - vy * t));
        }
        return d;
    };
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
        const d = dist(x + 0.5, y + 0.5) + (noise(x, y, 60, 4) - 0.5) * 1.2;
        if (d < 2.6) p[at(x, y)] = w[at(x, y)];
        else if (d < 3.6) p[at(x, y)] = d < 3.1 ? AP.SAND : AP.LEAF;
    }
    return p;
}

//#endregion

//#region the sheet

export type CornerSet = number[] & { full?: number[] };

// Tiles in the order they're added; an animated one takes FRAMES places in a
// row (starting on a multiple of FRAMES, so it never wraps a row).
class Sheet {
    readonly pics: Pic[] = [];
    readonly anim: number[] = [];

    add(p: Pic) { this.pics.push(p); return this.pics.length - 1; }

    addAnim(paint: (f: number) => Pic) {
        while (this.pics.length % FRAMES) this.pics.push(blank());
        const i = this.pics.length;
        for (let f = 0; f < FRAMES; f++) this.pics.push(paint(f));
        this.anim.push(i);
        return i;
    }

    // a corner set: its tile for each mask (1-15; [0] none), and `full` the
    // versions of the whole tile (the first is [15])
    set(paint: (mask: number, v: number) => Pic, versions = 1): CornerSet {
        const ids: CornerSet = [-1];
        for (let m = 1; m < 16; m++) ids.push(this.add(paint(m, 0)));
        ids.full = [ids[15]];
        for (let v = 1; v < versions; v++) ids.full.push(this.add(paint(15, v)));
        return ids;
    }

    animSet(paint: (mask: number, f: number) => Pic, from = 1) {
        const ids = [-1];
        for (let m = from; m < 16; m++) ids[m] = this.addAnim((f) => paint(m, f));
        return ids;
    }
}

function build() {
    const s = new Sheet();
    const t = {
        // the water layer: the sea, and the deep and shallows over it
        // (whole tiles in a few patterns, so the waves don't line up in a grid)
        SEA: [1, 11, 21, 31].map((seed) => s.addAnim((f) => water(SEA, f, seed))),
        DEEP: s.animSet((m, f) => patch(m, water(DEEP, f, 2), 20)),
        DEEP_FULL: [2, 12, 22, 32].map((seed) => s.addAnim((f) => water(DEEP, f, seed))),
        SHALLOW: s.animSet((m, f) => patch(m, water(SHALLOW, f, 3), 21)),
        SHALLOW_FULL: [3, 13, 23, 33].map((seed) => s.addAnim((f) => water(SHALLOW, f, seed))),
        // land over it
        GRASS_SHORE: s.animSet((m, f) => shore(m, f, GRASS_SHORE)),
        ROCK_SHORE: s.animSet((m, f) => shore(m, f, ROCK_SHORE)),
        SNOW_SHORE: s.animSet((m, f) => shore(m, f, SNOW_SHORE)),
        // rivers, by the neighbours they flow to (0: a pool)
        RIVER: s.animSet((m, f) => river(m, f), 0),
        // the ground
        // grass in five versions (the same texture, tufts and flowers in other places), picked at random
        GRASS: [s.add(grass()), s.add(grass(2, 1)), s.add(grass(2, 2)), s.add(meadow()),
            s.add(meadow(3, [[5, 2, AP.WHITE], [12, 7, AP.PALE], [2, 12, AP.PINK]]))],
        SNOW: [3, 13, 23, 33, 43, 53].map((seed) => s.add(snow(seed))),
        // grounds over the grass
        DESERT: s.set((m, v) => patch(m, desert(4 + v * 10), 22, AP.OCHRE), 6),
        SWAMP: s.set((m, v) => patch(m, swamp(5 + v * 10), 23, AP.BARK), 6),
        ASH: s.set((m, v) => patch(m, ash(6 + v * 10), 24, AP.SLATE), 4),
        // what stands on it, as tiles that repeat (npm run world -- --tiles;
        // otherwise it's painted over the whole map, WorldCover, and its
        // tiles added after these)
        FOREST: s.set((m) => scattered(m, TREES, tree, [AP.PINE, AP.FOREST], 33)),
        PINES: s.set((m) => scattered(m, PINES, pine, [AP.PINE, AP.FOREST], 34)),
        SNOW_PINES: s.set((m) => scattered(m, PINES, snowyPine, [AP.STONE, AP.ASH], 35)),
        DEAD: s.set((m, v) => scattered(m, snags(72 + v), deadTree, [], 36), 8),
        HILLS: s.set((m) => scattered(m, HUMPS, hill, [], 37)),
        MOUNTAINS: s.set((m) => scattered(m, RANGE, peak(false), [AP.SLATE, AP.IRON], 38)),
        PEAKS: s.set((m) => scattered(m, RANGE, peak(true), [AP.IRON, AP.STEEL], 39)),
    };
    return { pics: s.pics, anim: s.anim, t };
}

export const SHEET = build();
export const T = SHEET.t;

//#endregion
