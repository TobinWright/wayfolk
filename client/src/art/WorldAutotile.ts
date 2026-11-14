// Which of the world tileset's tiles (WorldTiles) go where. The map is
// worked out over its corners: each corner of a tile says whether it's land,
// which ground is on it (desert, swamp, ash) and what stands on it (forests,
// hills, mountains...); a tile is then each layer's corner-set tile for the
// corners it has of each. tools/render-world.js works the corners out from
// the reference picture and world-layout.ts and builds the whole map with
// this; the map editor (components/mapeditor) paints the corners and builds
// the tiles round what it painted again, the same way. Nothing here needs
// the tileset's pictures: only its tiles' numbers (world-sets.json).

export const NW = 1, NE = 2, SE = 4, SW = 8;
// a river tile's mask: which neighbours it flows to
export const TO_N = 1, TO_E = 2, TO_S = 4, TO_W = 8;

// the map's layers, bottom first (world.json's, in this order)
export const LAYERS = ["sea", "deep", "shallows", "land", "ground", "river", "cover", "cover2"];
export const SEA_L = 0, DEEP_L = 1, SHALLOWS_L = 2, LAND_L = 3, GROUND_L = 4, RIVER_L = 5, COVER_L = 6, COVER2_L = 7;

// grounds over the grass
export const DESERT = 1, SWAMP = 2, ASH = 3;
// what stands on it (a later one wins where they meet)
export const FOREST = 1, PINES = 2, SNOW_PINES = 3, DEAD = 4, HILLS = 5, MOUNTAINS = 6, PEAKS = 7;
const GROUND_SETS = [null, "DESERT", "SWAMP", "ASH"];
const COVER_SETS = [null, "FOREST", "PINES", "SNOW_PINES", "DEAD", "HILLS", "MOUNTAINS", "PEAKS"];

//#region noise

export function hash(x: number, y: number, seed: number) {
    let h = Math.imul(x | 0, 0x27d4eb2d) ^ Math.imul(y | 0, 0x165667b1) ^ Math.imul((seed | 0) + 1, 0x9e3779b1);
    h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
    h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

// noise over the whole map (not repeating)
export function vnoise(x: number, y: number, seed: number) {
    const x0 = Math.floor(x), y0 = Math.floor(y), tx = x - x0, ty = y - y0;
    const s = (t: number) => t * t * (3 - 2 * t), l = (a: number, b: number, t: number) => a + (b - a) * t;
    return l(l(hash(x0, y0, seed), hash(x0 + 1, y0, seed), s(tx)), l(hash(x0, y0 + 1, seed), hash(x0 + 1, y0 + 1, seed), s(tx)), s(ty));
}
export const fbm = (x: number, y: number, seed: number) => vnoise(x / 5, y / 5, seed) * 0.6 + vnoise(x / 2, y / 2, seed + 1) * 0.4;

//#endregion

//#region the tiles' numbers

// a corner set: its tile for each mask (m[1-15]), and `full` the versions of the whole tile
export interface TileSet { m: number[]; full?: number[]; }
// each kind of tile's numbers in the tileset (WorldTiles' T, as world-sets.json has it)
export interface TileSets {
    SEA: number[]; DEEP: number[]; DEEP_FULL: number[]; SHALLOW: number[]; SHALLOW_FULL: number[];
    GRASS_SHORE: number[]; ROCK_SHORE: number[]; SNOW_SHORE: number[]; RIVER: number[];
    GRASS: number[]; SNOW: number[];
    [set: string]: number[] | TileSet;
}

// WorldTiles' T (its corner sets arrays with `full` on them, which JSON drops) as TileSets
export function tileSets(T: { [kind: string]: number[] & { full?: number[] } }): TileSets {
    const out: any = {};
    for (const [kind, ids] of Object.entries(T)) out[kind] = ids.full ? { m: Array.from(ids), full: ids.full } : Array.from(ids);
    return out;
}

//#endregion

//#region the corners

// what covers the map, corner by corner (and some things tile by tile)
export interface WorldFields {
    w: number; h: number;       // in tiles; the corners are (w + 1) x (h + 1)
    land: Uint8Array;           // corners: 1 land
    snow: Uint8Array;           // tiles: 1 snowy (snow, and pines with snow on, there)
    ground: Uint8Array;         // corners: DESERT, SWAMP, ASH (0 grass)
    cover: Uint8Array;          // corners: FOREST ... PEAKS (0 none)
    river: Int16Array;          // tiles: the ways it flows (TO_N ...; 0 a pool), -1 none
    deep: Uint8Array;           // corners: the deep water and the shallows (waterDepth)
    shallow: Uint8Array;
    rock: Uint8Array;           // corners: how far from mountains, out to ROCK_MOST (a shore by them is rocky)
    rocky?: Uint8Array;         // tiles: 1 a rocky shore whatever the mountains (as decode found it)
}

export const ROCK_MOST = 3;
const WATER_MOST = 12;

export function emptyFields(w: number, h: number): WorldFields {
    const v = (w + 1) * (h + 1);
    return {
        w, h, land: new Uint8Array(v), snow: new Uint8Array(w * h), ground: new Uint8Array(v), cover: new Uint8Array(v),
        river: new Int16Array(w * h).fill(-1), deep: new Uint8Array(v), shallow: new Uint8Array(v), rock: new Uint8Array(v).fill(255),
    };
}

// a box of corners, i0-i1 by j0-j1 (in it), cut to the map
export interface Box { i0: number; j0: number; i1: number; j1: number; }
export function grow(f: WorldFields, b: Box, by: number): Box {
    return { i0: Math.max(0, b.i0 - by), j0: Math.max(0, b.j0 - by), i1: Math.min(f.w, b.i1 + by), j1: Math.min(f.h, b.j1 + by) };
}

// how far each corner of `box` is from one `isFrom` (8 ways), out to `most`
// (255 further); worked out over the box grown by most + 1, so it's right
// in the box whatever's outside it
function distances(f: WorldFields, box: Box, most: number, isFrom: (k: number) => boolean, into: Uint8Array) {
    const VW = f.w + 1, b = grow(f, box, most + 1), bw = b.i1 - b.i0 + 1, bh = b.j1 - b.j0 + 1;
    const d = new Uint8Array(bw * bh).fill(255);
    let edge: number[] = [];
    for (let j = 0; j < bh; j++) for (let i = 0; i < bw; i++) if (isFrom((b.j0 + j) * VW + b.i0 + i)) { d[j * bw + i] = 0; edge.push(j * bw + i); }
    for (let step = 1; step <= most && edge.length; step++) {
        const next: number[] = [];
        for (const k of edge) {
            const i = k % bw, j = Math.floor(k / bw);
            for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
                const x = i + dx, y = j + dy, nk = y * bw + x;
                if (x < 0 || y < 0 || x >= bw || y >= bh || d[nk] != 255) continue;
                d[nk] = step; next.push(nk);
            }
        }
        edge = next;
    }
    for (let j = box.j0; j <= box.j1; j++) for (let i = box.i0; i <= box.i1; i++) into[j * VW + i] = d[(j - b.j0) * bw + i - b.i0];
}

// the water's depth over `box`: shallows near the land, the deep far out
export function waterDepth(f: WorldFields, box: Box) {
    const VW = f.w + 1, from = new Uint8Array(f.land.length);
    distances(f, box, WATER_MOST, (k) => f.land[k] == 1, from);
    for (let j = box.j0; j <= box.j1; j++) for (let i = box.i0; i <= box.i1; i++) {
        const k = j * VW + i, n = (fbm(i, j, 110) - 0.5) * 3;
        f.shallow[k] = from[k] + n <= 2.2 ? 1 : 0;
        f.deep[k] = from[k] + n >= 7 ? 1 : 0;
    }
}

// how far from the mountains over `box`
export function rockDistance(f: WorldFields, box: Box) {
    distances(f, box, ROCK_MOST, (k) => f.cover[k] == MOUNTAINS || f.cover[k] == PEAKS, f.rock);
}

// a corner whose neighbours are all land: grounds and what stands on them
// keep to these, never reaching the shore tiles
export function inner(f: WorldFields, i: number, j: number) {
    if (i < 1 || j < 1 || i >= f.w || j >= f.h) return false;
    const VW = f.w + 1;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (!f.land[(j + dy) * VW + i + dx]) return false;
    return true;
}

// a corner by a snowy tile (or a river's)
export function byTile(f: WorldFields, of: (k: number) => boolean, i: number, j: number) {
    for (const [dx, dy] of [[-1, -1], [0, -1], [-1, 0], [0, 0]]) {
        const x = i + dx, y = j + dy;
        if (x >= 0 && y >= 0 && x < f.w && y < f.h && of(y * f.w + x)) return true;
    }
    return false;
}

//#endregion

//#region the tiles

// the tile at (x, y) on each layer (LAYERS; -1 none), into `out`
export function tilesAt(f: WorldFields, S: TileSets, x: number, y: number, out: number[]) {
    const VW = f.w + 1, k = y * f.w + x;
    const ks = [y * VW + x, y * VW + x + 1, (y + 1) * VW + x + 1, (y + 1) * VW + x];
    const mask = (field: Uint8Array, value = 1) =>
        (field[ks[0]] == value ? NW : 0) | (field[ks[1]] == value ? NE : 0) | (field[ks[2]] == value ? SE : 0) | (field[ks[3]] == value ? SW : 0);
    // a corner set's tile, a whole one in any of its versions
    const pick = (set: TileSet, m: number, seed: number) => m == 15 && set.full ? set.full[Math.floor(hash(x, y, seed) * set.full.length)] : set.m[m];
    out.fill(-1, 0, LAYERS.length);

    const lm = mask(f.land);
    if (lm != 15) {
        // (whole tiles of water in one of a few patterns, so the waves don't line up in a grid)
        const v = Math.floor(hash(x, y, 6) * S.SEA.length);
        out[SEA_L] = S.SEA[v];
        const d = mask(f.deep), s = mask(f.shallow);
        if (d) out[DEEP_L] = d == 15 ? S.DEEP_FULL[v] : S.DEEP[d];
        if (s) out[SHALLOWS_L] = s == 15 ? S.SHALLOW_FULL[v] : S.SHALLOW[s];
    }
    if (lm == 15) {
        const set = f.snow[k] ? S.SNOW : S.GRASS;
        out[LAND_L] = set[Math.floor(hash(x, y, 5) * set.length)];
    } else if (lm) {
        const rocky = f.rocky?.[k] || ks.some((c) => f.rock[c] <= ROCK_MOST);
        out[LAND_L] = (f.snow[k] ? S.SNOW_SHORE : rocky ? S.ROCK_SHORE : S.GRASS_SHORE)[lm];
    }
    // the ground: whichever's highest of its corners'
    const g = Math.max(...ks.map((c) => f.ground[c]));
    if (g) out[GROUND_L] = pick(S[GROUND_SETS[g]] as TileSet, mask(f.ground, g), 7);
    if (f.river[k] >= 0) out[RIVER_L] = S.RIVER[f.river[k]];
    // what stands on it: up to two kinds, the stronger over (where peaks
    // meet the mountains round them, the mountains go under the peaks too,
    // so there's no gap between them: the same peaks, with snow on)
    const kinds = Array.from(new Set(ks.map((c) => f.cover[c]).filter((c) => c))).sort((a, b) => a - b).slice(-2);
    kinds.forEach((c, n) => {
        const m = mask(f.cover, c) | (c == MOUNTAINS ? mask(f.cover, PEAKS) : 0);
        out[n ? COVER2_L : COVER_L] = pick(S[COVER_SETS[c]] as TileSet, m, 8);
    });
}

// what a tile is, as the server's TerrainType (0 water, 2 grasslands, 3
// tundra, 5 steppe - the ash -, 6 desert, 7 swamp, 9 forest, 10 hills, 11
// mountains): most of its corners' (water with two or more)
export function terrainAt(f: WorldFields, x: number, y: number) {
    const VW = f.w + 1, count = new Array(12).fill(0);
    for (const [i, j] of [[x, y], [x + 1, y], [x + 1, y + 1], [x, y + 1]]) count[terrainOf(f, i, j, j * VW + i)]++;
    if (count[0] >= 2) return 0;
    // (the first of those most of them are, as render-world.js had it)
    let best = 1;
    for (let t = 2; t < count.length; t++) if (count[t] > count[best]) best = t;
    return best;
}

function terrainOf(f: WorldFields, i: number, j: number, k: number) {
    if (!f.land[k]) return 0;
    const c = f.cover[k], g = f.ground[k];
    if (c == MOUNTAINS || c == PEAKS) return 11;
    if (c == HILLS) return 10;
    if (c == DEAD || g == SWAMP) return 7;
    if (c) return 9;
    return g == DESERT ? 6 : g == ASH ? 5 : byTile(f, (t) => f.snow[t] == 1, i, j) ? 3 : 2;
}

// the corners again from the tiles on the map (each layer's, tile by tile),
// as near as they can be told: a corner's what any tile round it says it is
export function decode(w: number, h: number, layers: Int32Array[], S: TileSets): WorldFields {
    const f = emptyFields(w, h), VW = w + 1;
    // each tile number's set and mask
    const of = new Map<number, { set: string, m: number }>();
    const add = (set: string, ids: number[] | TileSet) => {
        if (Array.isArray(ids)) ids.forEach((id, m) => { if (id >= 0 && !of.has(id)) of.set(id, { set, m }); });
        else {
            ids.m.forEach((id, m) => { if (id >= 0) of.set(id, { set, m }); });
            for (const id of ids.full ?? []) of.set(id, { set, m: 15 });
        }
    };
    for (const [set, ids] of Object.entries(S)) {
        if (set == "GRASS" || set == "SNOW") for (const id of ids as number[]) of.set(id, { set, m: 15 });
        else if (set != "SEA" && set != "DEEP_FULL" && set != "SHALLOW_FULL") add(set, ids);
    }
    const corner = (x: number, y: number, m: number, put: (k: number) => void) => {
        if (m & NW) put(y * VW + x);
        if (m & NE) put(y * VW + x + 1);
        if (m & SE) put((y + 1) * VW + x + 1);
        if (m & SW) put((y + 1) * VW + x);
    };
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const k = y * w + x;
        const land = of.get(layers[LAND_L][k]);
        if (land) {
            corner(x, y, land.m, (c) => f.land[c] = 1);
            if (land.set == "SNOW" || land.set == "SNOW_SHORE") f.snow[k] = 1;
        }
        const ground = of.get(layers[GROUND_L][k]), g = ground ? GROUND_SETS.indexOf(ground.set) : -1;
        if (g > 0) corner(x, y, ground.m, (c) => f.ground[c] = g);
        const river = of.get(layers[RIVER_L][k]);
        if (river?.set == "RIVER") f.river[k] = river.m;
        for (const l of [COVER_L, COVER2_L]) {
            const cover = of.get(layers[l][k]), c = cover ? COVER_SETS.indexOf(cover.set) : -1;
            if (c > 0) corner(x, y, cover.m, (at) => f.cover[at] = Math.max(f.cover[at], c));
        }
    }
    const all = { i0: 0, j0: 0, i1: w, j1: h };
    waterDepth(f, all);
    rockDistance(f, all);
    // (render-world.js has the shores rocky a little further from the
    // mountains than their corners say: those it made rocky stay so)
    const rocky = new Set(S.ROCK_SHORE.filter((id) => id >= 0));
    f.rocky = new Uint8Array(w * h);
    for (let k = 0; k < w * h; k++) if (rocky.has(layers[LAND_L][k])) f.rocky[k] = 1;
    return f;
}

//#endregion
