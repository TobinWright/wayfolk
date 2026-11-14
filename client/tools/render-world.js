// Builds the world map (npm run world): paints the tileset (src/art/WorldTiles)
// and the places' sprites (src/art/PlaceArt), and works out every tile of the
// map from the reference picture (land, sea, desert, snow: its colours) and
// world-layout.ts (forests, mountains, the swamp, rivers, places). Trees,
// hills and peaks are painted over the whole map (src/art/WorldCover) and cut
// into tiles of their own.
// Writes dist/assets/images/tilesets/world.png (Summer's, as drawn) and a
// tileset for each other season, world-spring.png, world-autumn.png and
// world-winter.png (src/art/Seasonal: the same tiles recoloured by what they
// are - grass, broadleaf woods, pines, rock, rivers, the swamp; Winter's pines
// are the snowy pines' tiles), images/sprites/places.png and
// json/world.json, and previews and terrain.json (for build-nodes.js) into
// tools/out/.

const fs = require("fs");
const path = require("path");
const { Canvas, readPng } = require("./canvas");
const { SHEET, T, N, FRAMES, COLUMNS, NW, NE, SE, SW, TO_N, TO_E, TO_S, TO_W, hash } = require("../src/art/WorldTiles.ts");
const { PLACE_SIZE, PLACE_KINDS, PLACE_PICS, placePic } = require("../src/art/PlaceArt.ts");
const { Shade, SHADES, tree, pine, deadTree, hill, rock, mountain } = require("../src/art/WorldCover.ts");
const { APOLLO } = require("../src/constants/Palette.ts");
const { recolour } = require("../src/art/Seasonal.ts");
const AUTO = require("../src/art/WorldAutotile.ts");
const { SeasonKind } = require("../../shared/Seasons.ts");
const LAYOUT = require("./world-layout.ts");
// forests and mountains as the tileset's tiles that repeat; --painted:
// painted tree by tree and peak by peak instead
const TILES = !process.argv.includes("--painted");

// the map, in tiles: the reference's 192 x 144, with PAD rows of open sea
// added over and under it and PAD_X columns either side of it
const PAD = 16, PAD_X = 50;
const W = 192 + PAD_X * 2, H = 144 + PAD * 2;
// the layout's places, moved over and down with the reference
const down = ([x, y]) => [x + PAD_X, y + PAD];
const AREAS = LAYOUT.AREAS.map((a) => ({ ...a, pts: a.pts.map(down) }));
const RIVERS = LAYOUT.RIVERS.map((line) => line.map(down));
const PLACES = LAYOUT.PLACES.map((p) => ({ ...p, x: p.x + PAD_X, y: p.y + PAD }));
const VW = W + 1, VH = H + 1;         // its corners
const ASSETS = path.join(__dirname, "../dist/assets");
const OUT = path.join(__dirname, "out");
fs.mkdirSync(OUT, { recursive: true });

const cell = (x, y) => y * W + x;
const vert = (i, j) => j * VW + i;
const corners = (field, x, y) => [field[vert(x, y)], field[vert(x + 1, y)], field[vert(x + 1, y + 1)], field[vert(x, y + 1)]];

// noise over the whole map (not repeating)
const { vnoise, fbm } = AUTO;

//#region what's been painted in the map editor (components/mapeditor)

// world-paint.json: the corners and tiles painted, each field as runs of
// [value, count] over the whole map (UNPAINTED where it wasn't), put over
// what's worked out here
const PAINT_FILE = path.join(__dirname, "world-paint.json");
const UNPAINTED = 255, RIVER_UNPAINTED = -2;
let PAINT = null;
if (fs.existsSync(PAINT_FILE)) {
    PAINT = JSON.parse(fs.readFileSync(PAINT_FILE, "utf8"));
    if (PAINT.w != W || PAINT.h != H) throw new Error("world-paint.json is for a " + PAINT.w + "x" + PAINT.h + " map, not " + W + "x" + H);
}
function painted(field, into) {
    if (!PAINT || !PAINT[field]) return 0;
    const unset = field == "river" ? RIVER_UNPAINTED : UNPAINTED, r = PAINT[field];
    let n = 0;
    for (let i = 0, k = 0; i < r.length; i += 2) {
        if (r[i] != unset) { into.fill(r[i], k, k + r[i + 1]); n += r[i + 1]; }
        k += r[i + 1];
    }
    return n;
}

//#endregion

//#region the reference: land, desert and snow by colour

const ref = readPng(path.join(__dirname, "reference/world-ref.png"));
if (ref.width != (W - PAD_X * 2) * N || ref.height != (H - PAD * 2) * N) throw new Error("the reference should be " + (W - PAD_X * 2) * N + "x" + (H - PAD * 2) * N);
const land = new Uint8Array(W * H), desertCell = new Uint8Array(W * H), white = new Uint8Array(W * H);
for (let y = PAD; y < H - PAD; y++) for (let x = PAD_X; x < W - PAD_X; x++) {
    let r = 0, g = 0, b = 0;
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
        const o = (((y - PAD) * N + j) * ref.width + (x - PAD_X) * N + i) * 4;
        r += ref.data[o]; g += ref.data[o + 1]; b += ref.data[o + 2];
    }
    r /= N * N; g /= N * N; b /= N * N;
    const orange = r - b > 25 && r - g > 30, green = r - b > 18, bright = (r + g + b) / 3 > 150;
    land[cell(x, y)] = orange || green || bright ? 1 : 0;
    desertCell[cell(x, y)] = orange ? 1 : 0;
    white[cell(x, y)] = bright && !green && !orange ? 1 : 0;
}

// joined groups of cells (4 ways, or 8), each cell's group number
function groups(grid, value, eight = false) {
    const id = new Int32Array(W * H).fill(-1), sizes = [];
    const ways = eight ? [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]] : [[1, 0], [-1, 0], [0, 1], [0, -1]];
    for (let k = 0; k < W * H; k++) {
        if (grid[k] != value || id[k] >= 0) continue;
        const g = sizes.length, stack = [k];
        id[k] = g; let n = 0;
        while (stack.length) {
            const c = stack.pop(); n++;
            const x = c % W, y = Math.floor(c / W);
            for (const [dx, dy] of ways) {
                const nx = x + dx, ny = y + dy, nk = cell(nx, ny);
                if (nx < 0 || ny < 0 || nx >= W || ny >= H || grid[nk] != value || id[nk] >= 0) continue;
                id[nk] = g; stack.push(nk);
            }
        }
        sizes.push(n);
    }
    return { id, sizes };
}

// specks of land go under, little pools inside the land fill in (the lake stays)
{
    const l = groups(land, 1);
    for (let k = 0; k < W * H; k++) if (land[k] && l.sizes[l.id[k]] < 30) land[k] = 0;
    const w = groups(land, 0);
    for (let k = 0; k < W * H; k++) if (!land[k] && w.sizes[w.id[k]] < 10) land[k] = 1;
}

// the snowy island: any landmass mostly white
const snowCell = new Uint8Array(W * H);
{
    const g = groups(land, 1, true), whites = new Array(g.sizes.length).fill(0);
    for (let k = 0; k < W * H; k++) if (land[k] && white[k]) whites[g.id[k]]++;
    const snowy = new Uint8Array(W * H);
    for (let k = 0; k < W * H; k++) if (land[k] && whites[g.id[k]] > g.sizes[g.id[k]] * 0.2) snowy[k] = 1;
    // and the water round it, as its shore may come out a little bigger than the picture's
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++)
        for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
            const nx = x + dx, ny = y + dy;
            if (nx >= 0 && ny >= 0 && nx < W && ny < H && snowy[cell(nx, ny)]) snowCell[cell(x, y)] = 1;
        }
}

//#endregion

//#region corners: what covers each

// a field over the corners from one over the cells (each corner the average
// of the cells round it), blurred, then whether it's over half once wobbled
function cornerField(cells, seed, wobble = 0.35, blurs = 1) {
    let v = new Float32Array(VW * VH);
    for (let j = 0; j < VH; j++) for (let i = 0; i < VW; i++) {
        let s = 0;
        for (const [dx, dy] of [[-1, -1], [0, -1], [-1, 0], [0, 0]]) {
            const x = i + dx, y = j + dy;
            if (x >= 0 && y >= 0 && x < W && y < H) s += cells[cell(x, y)];
        }
        v[vert(i, j)] = s / 4;
    }
    for (let pass = 0; pass < blurs; pass++) {
        const b = new Float32Array(VW * VH);
        for (let j = 0; j < VH; j++) for (let i = 0; i < VW; i++) {
            let s = 0, n = 0;
            for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
                const x = i + dx, y = j + dy;
                if (x >= 0 && y >= 0 && x < VW && y < VH) { s += v[vert(x, y)] * (dx || dy ? 1 : 2); n += dx || dy ? 1 : 2; }
            }
            b[vert(i, j)] = s / n;
        }
        v = b;
    }
    // read at a point nudged by noise (so long straight edges wander), plus a little more noise
    const at = (x, y) => {
        x = Math.max(0, Math.min(VW - 1.001, x)); y = Math.max(0, Math.min(VH - 1.001, y));
        const x0 = Math.floor(x), y0 = Math.floor(y), tx = x - x0, ty = y - y0;
        const a = v[vert(x0, y0)], b = v[vert(x0 + 1, y0)], c = v[vert(x0, y0 + 1)], d = v[vert(x0 + 1, y0 + 1)];
        return (a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + d * tx) * ty;
    };
    const out = new Uint8Array(VW * VH);
    for (let j = 0; j < VH; j++) for (let i = 0; i < VW; i++) {
        const wx = i + (fbm(i, j, seed + 3) - 0.5) * 5, wy = j + (fbm(i, j, seed + 4) - 0.5) * 5;
        out[vert(i, j)] = at(wx, wy) + (fbm(i, j, seed) - 0.5) * wobble > 0.5 ? 1 : 0;
    }
    return out;
}

const landV = cornerField(land, 100, 0.35, 2);
for (let i = 0; i < VW; i++) landV[vert(i, 0)] = landV[vert(i, VH - 1)] = 0;
for (let j = 0; j < VH; j++) landV[vert(0, j)] = landV[vert(VW - 1, j)] = 0;
// every place stands on land (a spit's tip may have wobbled away)
for (const p of PLACES) if (p.kind != "pier")
    for (let j = p.y - 1; j <= p.y + 2; j++) for (let i = p.x - 1; i <= p.x + 2; i++)
        if (Math.hypot(i - p.x - 0.5, j - p.y - 0.5) <= 1.6) landV[vert(i, j)] = 1;
if (PAINT) console.log("painted in the map editor: " + painted("land", landV) + " corners of land and sea, " + painted("snow", snowCell) + " tiles of snow");

// corners well inside the land (all their neighbours land): grounds and
// what stands on them never reach the shore tiles
const inner = new Uint8Array(VW * VH);
for (let j = 1; j < VH - 1; j++) for (let i = 1; i < VW - 1; i++) {
    let all = 1;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (!landV[vert(i + dx, j + dy)]) all = 0;
    inner[vert(i, j)] = all;
}

// how far each corner is from something (8 ways), out to `most`
function distanceFrom(isFrom, most = 12) {
    const d = new Uint8Array(VW * VH).fill(255);
    let edge = [];
    for (let k = 0; k < VW * VH; k++) if (isFrom(k)) { d[k] = 0; edge.push(k); }
    for (let step = 1; step <= most && edge.length; step++) {
        const next = [];
        for (const k of edge) {
            const i = k % VW, j = Math.floor(k / VW);
            for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
                const x = i + dx, y = j + dy, nk = vert(x, y);
                if (x < 0 || y < 0 || x >= VW || y >= VH || d[nk] != 255) continue;
                d[nk] = step; next.push(nk);
            }
        }
        edge = next;
    }
    return d;
}

// the water's depth: shallows near the land, the deep far out
const fromLand = distanceFrom((k) => landV[k]);
const shallowV = new Uint8Array(VW * VH), deepV = new Uint8Array(VW * VH);
for (let k = 0; k < VW * VH; k++) {
    const i = k % VW, j = Math.floor(k / VW), n = (fbm(i, j, 110) - 0.5) * 3;
    shallowV[k] = fromLand[k] + n <= 2.2 ? 1 : 0;
    deepV[k] = fromLand[k] + n >= 7 ? 1 : 0;
}

const snowV = new Uint8Array(VW * VH);
for (let j = 0; j < VH; j++) for (let i = 0; i < VW; i++)
    for (const [dx, dy] of [[-1, -1], [0, -1], [-1, 0], [0, 0]]) {
        const x = i + dx, y = j + dy;
        if (x >= 0 && y >= 0 && x < W && y < H && snowCell[cell(x, y)]) snowV[vert(i, j)] = 1;
    }

function inPolygon(x, y, pts) {
    let inside = false;
    for (let a = 0, b = pts.length - 1; a < pts.length; b = a++) {
        const [xa, ya] = pts[a], [xb, yb] = pts[b];
        if ((ya > y) != (yb > y) && x < ((xb - xa) * (y - ya)) / (yb - ya) + xa) inside = !inside;
    }
    return inside;
}
// whether a corner's in an area: the point tested is nudged by noise, so its edge wobbles
function inArea(i, j, area, seed) {
    return inPolygon(i + (fbm(i, j, seed) - 0.5) * 4, j + (fbm(i, j, seed + 7) - 0.5) * 4, area.pts);
}

// grounds over the grass: 1 desert, 2 swamp, 3 ash
const DESERT = 1, SWAMP = 2, ASH = 3;
const groundV = new Uint8Array(VW * VH);
{
    const desertV = cornerField(desertCell, 120, 0.4);
    for (let k = 0; k < VW * VH; k++) if (inner[k] && desertV[k]) groundV[k] = DESERT;
    for (const a of AREAS) {
        const g = a.kind == "swamp" ? SWAMP : a.kind == "ash" ? ASH : 0;
        if (g) for (let j = 0; j < VH; j++) for (let i = 0; i < VW; i++) if (inner[vert(i, j)] && inArea(i, j, a, 130)) groundV[vert(i, j)] = g;
    }
    painted("ground", groundV);
}

// What stands on the ground (forests, mountains...) goes by how far inside
// its kind's areas a point is: for each kind, each corner's distance in tiles
// from the nearest edge (below 0 outside), the edges wobbled by noise.
function segmentDistance(x, y, [ax, ay], [bx, by]) {
    const vx = bx - ax, vy = by - ay, t = Math.max(0, Math.min(1, ((x - ax) * vx + (y - ay) * vy) / (vx * vx + vy * vy)));
    return Math.hypot(x - ax - vx * t, y - ay - vy * t);
}
function signedDistance(x, y, pts) {
    let d = Infinity;
    for (let a = 0, b = pts.length - 1; a < pts.length; b = a++) d = Math.min(d, segmentDistance(x, y, pts[b], pts[a]));
    return inPolygon(x, y, pts) ? d : -d;
}
const FAR = -9;
const depth = {};
for (const kind of ["forest", "pines", "dead", "hills", "mountains"]) {
    const f = depth[kind] = new Float32Array(VW * VH).fill(FAR);
    for (const a of AREAS) {
        if (a.kind != kind) continue;
        const xs = a.pts.map((p) => p[0]), ys = a.pts.map((p) => p[1]);
        for (let j = Math.max(0, Math.min(...ys) - 8); j <= Math.min(VH - 1, Math.max(...ys) + 8); j++)
            for (let i = Math.max(0, Math.min(...xs) - 8); i <= Math.min(VW - 1, Math.max(...xs) + 8); i++) {
                const wx = i + (fbm(i, j, 140) - 0.5) * 4, wy = j + (fbm(i, j, 147) - 0.5) * 4;
                f[vert(i, j)] = Math.max(f[vert(i, j)], signedDistance(wx, wy, a.pts));
            }
    }
}
// a kind's depth anywhere (x, y in tiles), read between the corners
function depthAt(kind, x, y) {
    const f = depth[kind];
    x = Math.max(0, Math.min(VW - 1.001, x)); y = Math.max(0, Math.min(VH - 1.001, y));
    const x0 = Math.floor(x), y0 = Math.floor(y), tx = x - x0, ty = y - y0;
    const a = f[vert(x0, y0)], b = f[vert(x0 + 1, y0)], c = f[vert(x0, y0 + 1)], d = f[vert(x0 + 1, y0 + 1)];
    return (a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + d * tx) * ty;
}
// how high the mountains are there: their depth, roughened
const height = (x, y) => depthAt("mountains", x, y) + (fbm(x * 0.5, y * 0.5, 161) - 0.5) * 4 + (fbm(x * 1.5, y * 1.5, 160) - 0.5) * 1.6;

//#endregion

//#region rivers and places

// the cells a river runs through, joined four ways
function riverCells(line) {
    const cells = [];
    const push = (x, y) => { const last = cells[cells.length - 1]; if (!last || last[0] != x || last[1] != y) cells.push([x, y]); };
    for (let s = 0; s + 1 < line.length; s++) {
        let [x, y] = line[s];
        const [tx, ty] = line[s + 1];
        push(x, y);
        while (x != tx || y != ty) {
            // step along whichever way is further behind, so it runs straight-ish
            const ex = Math.abs(tx - x), ey = Math.abs(ty - y);
            if (ex > ey || (ex == ey && (x + y) % 2)) x += Math.sign(tx - x); else y += Math.sign(ty - y);
            push(x, y);
        }
    }
    return cells;
}

const fullLand = (x, y) => x >= 0 && y >= 0 && x < W && y < H &&
    landV[vert(x, y)] && landV[vert(x + 1, y)] && landV[vert(x + 1, y + 1)] && landV[vert(x, y + 1)];
const WAYS = [[0, -1, TO_N], [1, 0, TO_E], [0, 1, TO_S], [-1, 0, TO_W]];

const riverMask = new Int16Array(W * H).fill(-1);
for (const line of RIVERS) {
    // up to the first cell that isn't all land (where it meets the water),
    // and that one too: its mouth, running out over the shore
    const all = riverCells(line), cells = [];
    for (const c of all) { cells.push(c); if (!fullLand(c[0], c[1])) break; }
    if (fullLand(...cells[cells.length - 1])) console.warn("river from " + line[0] + " doesn't reach the water");
    // a spring beside water (the lake) flows out of it: a mouth there too
    const [sx, sy] = cells[0];
    const source = WAYS.map(([dx, dy]) => [sx + dx, sy + dy]).find(([x, y]) => x >= 0 && y >= 0 && x < W && y < H && !fullLand(x, y));
    if (source) cells.unshift(source);
    cells.forEach(([x, y], n) => {
        const next = cells[n + 1], prev = cells[n - 1];
        let m = 0;
        for (const [dx, dy, bit] of WAYS) {
            const nx = x + dx, ny = y + dy;
            if ((next && next[0] == nx && next[1] == ny) || (prev && prev[0] == nx && prev[1] == ny)) m |= bit;
        }
        // a mouth also runs on the other way, off into the water
        const joined = next || prev;
        if (!fullLand(x, y) && joined) for (const [dx, dy, bit] of WAYS) if (x - dx == joined[0] && y - dy == joined[1]) m |= bit;
        riverMask[cell(x, y)] = Math.max(0, riverMask[cell(x, y)]) | m;
    });
}

painted("river", riverMask);

for (const p of PLACES)
    if (!fullLand(p.x, p.y) && p.kind != "pier") console.warn(p.kind + " " + (p.name || "") + " at " + p.x + "," + p.y + " isn't on land");

//#endregion

//#region what stands on the ground, painted over the whole map

// Trees, hills and peaks are painted one by one onto a picture of the whole
// map (src/art/WorldCover), then cut into tiles (the same tile twice is one
// tile in the sheet).
const paper = { w: W * N, h: H * N, px: new Int32Array(W * N * H * N).fill(-1) };

// clearings round the places (in tiles), so nothing hides them
const BIG = new Set(["castle", "town", "cathedral", "icecastle", "port", "volcano"]);
const clearOf = (p) => BIG.has(p.kind) ? 2.4 : 1.7;
// whether something whose box is x0-x1, y0-y1 (px), its foot at (fx, fy),
// keeps to the land, its foot off rivers and the box out of the places' clearings
function fits(x0, y0, x1, y1, fx, fy, riversToo = false) {
    for (let cy = Math.floor(y0 / N); cy <= Math.floor(y1 / N); cy++) for (let cx = Math.floor(x0 / N); cx <= Math.floor(x1 / N); cx++) {
        if (!fullLand(cx, cy)) return false;
        if (riversToo && riverMask[cell(cx, cy)] >= 0) return false;
    }
    if (riverMask[cell(Math.floor(fx / N), Math.floor(fy / N))] >= 0) return false;
    for (const p of PLACES) {
        const px = (p.x + 0.5) * N, py = (p.y + 0.5) * N;
        const nx = Math.max(x0, Math.min(x1, px)), ny = Math.max(y0, Math.min(y1, py));
        if (Math.hypot(nx - px, ny - py) < clearOf(p) * N) return false;
    }
    return true;
}
// the ground's shadow colours under a point (px)
function shadeAt(x, y) {
    const cx = Math.floor(x / N), cy = Math.floor(y / N);
    if (snowCell[cell(cx, cy)]) return SHADES.snow;
    const g = corners(groundV, cx, cy).sort((a, b) => b - a)[0];
    return g == DESERT ? SHADES.sand : g == SWAMP ? SHADES.bog : g == ASH ? SHADES.ash : SHADES.grass;
}

// everything to paint, as [foot y, paint], painted back to front
const standing = [];
const shade = new Shade(paper);

// trees: a staggered grid of places, each kept by chance - always deep in a
// wood (but for clearings), less and less towards its edge, now and then
// just outside it, and here and there a lone one on open grass
for (let gy = 0, row = 0; gy < paper.h; gy += 5, row++) for (let gx = row % 2 ? 3 : 0; gx < paper.w; gx += 6) {
    const x = gx + (hash(gx * 2, gy, 201) - 0.5) * 3, y = gy + (hash(gx * 2, gy, 202) - 0.5) * 2.4;
    const tx = x / N, ty = y / N;
    if (!fullLand(Math.floor(tx), Math.floor(ty)) || height(tx, ty) > -0.6) continue;
    let kind = null, d = FAR;
    for (const k of ["forest", "pines", "dead"]) { const v = depthAt(k, tx, ty); if (v > d) { d = v; kind = k; } }
    // (the edge wanders a good way in and out, in bays and fingers)
    const s = d + (fbm(tx * 0.5, ty * 0.5, 212) - 0.5) * 6 + (fbm(tx * 1.2, ty * 1.2, 210) - 0.5) * 3 + (vnoise(tx * 1.5, ty * 1.5, 211) - 0.5) * 1.2;
    let chance = s >= 0 ? Math.min(1, 0.3 + s * 0.4) : s > -3 ? 0.14 * (1 + s / 3) : 0;
    if (d > 2.5 && vnoise(tx / 5, ty / 5, 220) < 0.22) chance *= 0.08;   // a clearing
    if (chance == 0) {
        // a lone tree on open grass
        if (snowCell[cell(Math.floor(tx), Math.floor(ty))] || shadeAt(x, y) != SHADES.grass) continue;
        chance = 0.0015; kind = hash(gx, gy, 204) < 0.3 ? "pines" : "forest";
    }
    if (kind == "dead") chance *= 0.15;
    const seed = Math.floor(gx * 7 + gy * 131);
    if (hash(gx * 2, gy, 203) >= chance) continue;
    const snowy = snowCell[cell(Math.floor(tx), Math.floor(ty))] == 1;
    const ground = shadeAt(x, y);
    if (kind == "dead") {
        if (!fits(x - 4, y - 6, x + 4, y + 1, x, y)) continue;
        standing.push([y, () => deadTree(paper, x, y, seed)]);
    } else if (kind == "pines" || snowy || (kind == "forest" && vnoise(tx / 3, ty / 3, 213) > 0.7 && hash(gx, gy, 214) < 0.5)) {
        const r = 3 + hash(gx, gy, 205) * 1.1;
        if (!fits(x - r, y - r * 1.3 - 1, x + r, y + r + 2, x, y + r)) continue;
        shade.oval(x + 0.5, y + r * 0.9, r * 0.75, r * 0.4, ground);
        standing.push([y + r, () => pine(paper, x, y, r, snowy)]);
    } else {
        // (older, bigger trees deep in a wood)
        const r = 3 + hash(gx, gy, 205) * 1.3 + Math.min(1, Math.max(0, s - 1) * 0.3);
        if (!fits(x - r - 1, y - r - 1, x + r + 1, y + r + 2, x, y + r)) continue;
        shade.oval(x + 1, y + r * 0.75, r * 1.05, r * 0.55, ground);
        // (stands of lighter and darker trees)
        const tint = (vnoise(tx / 3, ty / 3, 215) - 0.5) * 0.35;
        standing.push([y + r * 0.9, () => tree(paper, x, y, r, seed, tint)]);
    }
}

// hills: in the hills' areas, and the foothills round a range
for (let gy = 0, row = 0; gy < paper.h; gy += 7, row++) for (let gx = row % 2 ? 5 : 0; gx < paper.w; gx += 10) {
    const x = gx + (hash(gx, gy, 231) - 0.5) * 9, y = gy + (hash(gx, gy, 232) - 0.5) * 6;
    const tx = x / N, ty = y / N, e = height(tx, ty);
    const chance = depthAt("hills", tx, ty) > 0 ? 0.85 : e > -2.6 && e < -0.5 && fbm(tx, ty, 230) > 0.48 ? 0.6 : 0;
    if (!chance || hash(gx, gy, 233) >= chance || shadeAt(x, y) != SHADES.grass) continue;
    const r = 3.6 + hash(gx, gy, 234) * 1.2;
    if (!fits(x - r * 1.3, y - r, x + r * 1.3, y, x, y)) continue;
    standing.push([y, () => hill(paper, x, y, r)]);
}

// The mountains: rock under the higher ground, and peaks over it, sized by
// how high the ground is - the biggest, snowy ones along the spine, smaller
// ones down to the foothills. The biggest are placed first, each the room it
// needs from the others (overlapping, but never hiding one another).
const peaks = [];
for (const a of AREAS) {
    if (a.kind != "mountains") continue;
    const xs = a.pts.map((p) => p[0]), ys = a.pts.map((p) => p[1]);
    const x0 = (Math.min(...xs) - 4) * N, x1 = (Math.max(...xs) + 4) * N, y0 = (Math.min(...ys) - 4) * N, y1 = (Math.max(...ys) + 4) * N;
    const high = (x, y) => fullLand(Math.floor(x / N), Math.floor(y / N)) && height(x / N, y / N) > 2;
    rock(paper, x0, y0, x1, y1, high, 240);
    for (let gy = y0, row = 0; gy < y1; gy += 4, row++) for (let gx = x0 + (row % 2 ? 2.5 : 0); gx < x1; gx += 5) {
        const x = gx + (hash(gx, gy, 241) - 0.5) * 5, y = gy + (hash(gx, gy, 242) - 0.5) * 4;
        const e = height(x / N, y / N);
        // (out on the edge, only now and then little ones, in groups)
        if (e < -0.5 || (e < 0.9 && (hash(gx, gy, 245) > 0.35 || fbm(x / N, y / N, 247) < 0.45))) continue;
        const h = Math.min(42, 12 + Math.max(0, e) * 5.5) * (0.7 + hash(gx, gy, 243) * 0.5);
        peaks.push({ x, y, h, e, room: 0.65 + hash(gx, gy, 246) * 0.6, order: h * (0.75 + hash(gx, gy, 248) * 0.5), seed: Math.floor(gx * 13 + gy * 7) });
    }
}
peaks.sort((a, b) => b.order - a.order);
const placedPeaks = [];
for (const p of peaks) {
    const room = (q) => (p.h + q.h) * (p.room + q.room) / 2;
    if (placedPeaks.some((q) => Math.abs(q.x - p.x) < 0.48 * room(q) && Math.abs(q.y - p.y) < 0.24 * room(q))) continue;
    if (!fits(p.x - p.h * 1.2, p.y - p.h, p.x + p.h * 1.2, p.y - 1, p.x, p.y - 1, true)) continue;
    placedPeaks.push(p);
    const snowy = p.h > 26 && p.e + (hash(p.seed, 0, 244) - 0.5) * 1.5 > 3.8;
    standing.push([p.y, () => mountain(paper, p.x, p.y, p.h, snowy, p.seed)]);
}

standing.sort((a, b) => a[0] - b[0]);
for (const [, paint] of standing) paint();
console.log(standing.length + " things standing (" + placedPeaks.length + " peaks)");
// (as tiles, none of it's used: the shadows and rock went straight on)
if (TILES) paper.px.fill(-1);

//#endregion

//#region the layers

const LAYERS = ["sea", "deep", "shallows", "land", "ground", "river", "cover", ...(TILES ? ["cover2"] : [])];
const layers = {};
for (const n of LAYERS) layers[n] = new Int32Array(W * H).fill(-1);
// the corners rivers run by
const riverV = new Uint8Array(VW * VH);
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++)
    if (riverMask[cell(x, y)] >= 0) for (const [i, j] of [[x, y], [x + 1, y], [x, y + 1], [x + 1, y + 1]]) riverV[vert(i, j)] = 1;

// As tiles, what stands on the ground is the corner sets' tiles (that
// repeat) instead of the painting: each corner the kind whose depth it's in,
// in order of priority (a later one wins).
const FOREST = 1, PINES = 2, SNOW_PINES = 3, DEAD = 4, HILLS = 5, MOUNTAINS = 6, PEAKS = 7;
const coverV = new Uint8Array(VW * VH);
const coverPainted = new Uint8Array(VW * VH).fill(UNPAINTED);
if (TILES) {
    for (let k = 0; k < VW * VH; k++) {
        if (!inner[k]) continue;
        if (depth.forest[k] > 0) coverV[k] = snowV[k] ? SNOW_PINES : FOREST;
        if (depth.pines[k] > 0) coverV[k] = snowV[k] ? SNOW_PINES : PINES;
        if (depth.dead[k] > 0) coverV[k] = DEAD;
        if (depth.hills[k] > 0) coverV[k] = HILLS;
        if (depth.mountains[k] > 0) coverV[k] = MOUNTAINS;
    }
    // the mountains' high middles snowy, foothills round them
    const fromLow = distanceFrom((k) => coverV[k] != MOUNTAINS, 4);
    const fromRange = distanceFrom((k) => coverV[k] == MOUNTAINS, 3);
    for (let k = 0; k < VW * VH; k++) {
        const i = k % VW, j = Math.floor(k / VW);
        if (coverV[k] == MOUNTAINS && fromLow[k] >= 3) coverV[k] = PEAKS;
        else if (inner[k] && !coverV[k] && !groundV[k] && fromRange[k] <= 2 && fbm(i, j, 150) > 0.42) coverV[k] = HILLS;
    }
    // nothing on a river, clearings round the places
    for (let k = 0; k < VW * VH; k++) if (riverV[k]) coverV[k] = 0;
    for (const p of PLACES) {
        const r = clearOf(p);
        for (let j = Math.floor(p.y - r); j <= p.y + r + 1; j++) for (let i = Math.floor(p.x - r); i <= p.x + r + 1; i++)
            if (i >= 0 && j >= 0 && i < VW && j < VH && Math.hypot(i - p.x - 0.5, j - p.y - 0.5) <= r) coverV[vert(i, j)] = 0;
    }
    painted("cover", coverV);
    painted("cover", coverPainted);
}
// the shores by the mountains rocky (where the cover's painted, by what's painted)
const fromRock = distanceFrom((k) => coverPainted[k] != UNPAINTED ? coverV[k] == MOUNTAINS || coverV[k] == PEAKS : depth.mountains[k] > -0.5, 3);
// the painting's tiles, each kept once in the sheet
const paintedTiles = new Map();

// each tile from its corners (src/art/WorldAutotile, as the map editor does it)
const SETS = AUTO.tileSets(T);
const fields = { w: W, h: H, land: landV, snow: snowCell, ground: groundV, cover: coverV, river: riverMask, deep: deepV, shallow: shallowV, rock: fromRock };
const at = new Array(AUTO.LAYERS.length);
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const k = cell(x, y);
    AUTO.tilesAt(fields, SETS, x, y, at);
    for (const n of LAYERS) layers[n][k] = at[AUTO.LAYERS.indexOf(n)];
    if (TILES) continue;
    // what stands on it: its piece of the painting
    const pic = [];
    let any = false;
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
        const c = paper.px[(y * N + j) * paper.w + x * N + i];
        pic.push(c); if (c >= 0) any = true;
    }
    if (!any) continue;
    const key = pic.join(",");
    if (!paintedTiles.has(key)) paintedTiles.set(key, SHEET.pics.push(pic) - 1);
    layers.cover[k] = paintedTiles.get(key);
}
console.log(paintedTiles.size + " painted tiles");

//#endregion

//#region writing it out

// the tileset, its colours checked; wider than COLUMNS if it'd be over
// 4096px tall (as much as any GPU takes)
const COLS = [COLUMNS, COLUMNS * 2, COLUMNS * 4].find((c) => Math.ceil(SHEET.pics.length / c) * N <= 4096);
const rows = Math.ceil(SHEET.pics.length / COLS);
const sheet = new Canvas(COLS * N, rows * N);
const apollo = new Set(APOLLO);
SHEET.pics.forEach((p, i) => {
    sheet.draw(p, N, (i % COLS) * N, Math.floor(i / COLS) * N);
    for (const c of p) if (c >= 0 && !apollo.has(c)) throw new Error("tile " + i + " has a colour not in Apollo: " + c.toString(16));
});
fs.mkdirSync(path.join(ASSETS, "images/tilesets"), { recursive: true });
sheet.save(path.join(ASSETS, "images/tilesets/world.png"));
sheet.save(path.join(OUT, "world-tiles-x3.png"), 3);

// the other seasons' tilesets: each tile by the kind it is (a tile in no kind
// - the sea, the desert, the ash, peaks - the same all year)
const ROLES = { GRASS: "turf", GRASS_SHORE: "turf", ROCK_SHORE: "turf", HILLS: "turf", FOREST: "leaves", PINES: "pines", MOUNTAINS: "rock", RIVER: "river", SWAMP: "swamp" };
const idsOf = (x, out = []) => { if (typeof x == "number") out.push(x); else if (x && typeof x == "object") for (const v of Object.values(x)) idsOf(v, out); return out; };
const roleOf = new Map();
// (an animated tile - the shores' surf - is FRAMES tiles in a row: all of them)
const animated = new Set(SHEET.anim);
for (const [kind, role] of Object.entries(ROLES)) for (const i of idsOf(T[kind]))
    for (let f = 0; f < (animated.has(i) ? FRAMES : 1); f++) roleOf.set(i + f, role);
// (in Winter the pines are the snowy pines: the same corner sets, tile for tile)
const snowyPine = new Map();
const pair = (a, b) => { if (typeof a == "number" && typeof b == "number") snowyPine.set(a, b); else if (a && b && typeof a == "object") for (const k of Object.keys(a)) pair(a[k], b[k]); };
pair(T.PINES, T.SNOW_PINES);
for (const [a, b] of Array.from(snowyPine)) if (animated.has(a)) for (let f = 1; f < FRAMES; f++) snowyPine.set(a + f, b + f);
for (const [name, season] of [["spring", SeasonKind.SPRING], ["autumn", SeasonKind.AUTUMN], ["winter", SeasonKind.WINTER]]) {
    const out = new Canvas(COLS * N, rows * N);
    SHEET.pics.forEach((p, i) => {
        let px = p;
        if (season == SeasonKind.WINTER && snowyPine.has(i)) px = SHEET.pics[snowyPine.get(i)];
        else if (roleOf.has(i)) px = recolour({ w: N, h: N, p: p.slice() }, season, roleOf.get(i), i).p;
        out.draw(px, N, (i % COLS) * N, Math.floor(i / COLS) * N);
        for (const c of px) if (c >= 0 && !apollo.has(c)) throw new Error(name + " tile " + i + " has a colour not in Apollo: " + c.toString(16));
    });
    out.save(path.join(ASSETS, "images/tilesets/world-" + name + ".png"));
}
console.log("wrote the seasons' tilesets");

// the places' sprites, a row of them; each place its own (its kind's, or its pic)
const picOf = (p) => p.pic || p.kind;
const seen = new Map();
for (const p of PLACES) {
    if (!PLACE_PICS.includes(picOf(p))) throw new Error("no sprite " + picOf(p));
    if (seen.has(picOf(p))) throw new Error((p.name || p.kind) + " and " + seen.get(picOf(p)) + " share the sprite " + picOf(p) + ": give one a pic of its own");
    seen.set(picOf(p), p.name || p.kind);
}
const places = new Canvas(PLACE_PICS.length * PLACE_SIZE, PLACE_SIZE);
PLACE_PICS.forEach((pic, i) => {
    const p = placePic(pic);
    for (const c of p) if (c >= 0 && !apollo.has(c)) throw new Error("place " + pic + " has a colour not in Apollo: " + c.toString(16));
    places.draw(p, PLACE_SIZE, i * PLACE_SIZE, 0);
});
fs.mkdirSync(path.join(ASSETS, "images/sprites"), { recursive: true });
places.save(path.join(ASSETS, "images/sprites/places.png"));
places.save(path.join(OUT, "places-x4.png"), 4);

// the map: each layer as runs of [tile, count]
function runs(a) {
    const out = [];
    for (let k = 0; k < a.length;) {
        let n = 1;
        while (k + n < a.length && a[k + n] == a[k]) n++;
        out.push(a[k], n);
        k += n;
    }
    return out;
}
// what each tile is, for build-nodes.js (the server's TerrainType: 0 water,
// 2 grasslands, 3 tundra, 5 steppe - the ash -, 6 desert, 7 swamp, 9 forest,
// 10 hills, 11 mountains), and the rivers; world.json has the terrain too
// (for the life on the map: client/src/components/map/MapLife.ts)
const terrain = new Array(W * H);
{
    const terrainOf = (k) => {
        if (!landV[k]) return 0;
        const c = TILES ? coverV[k] : depth.mountains[k] > 0 ? MOUNTAINS : depth.hills[k] > 0 ? HILLS : depth.dead[k] > 0 ? DEAD : depth.forest[k] > 0 || depth.pines[k] > 0 ? FOREST : 0;
        if (c == MOUNTAINS || c == PEAKS) return 11;
        if (c == HILLS) return 10;
        if (c == DEAD || groundV[k] == SWAMP) return 7;
        if (c) return 9;
        return groundV[k] == DESERT ? 6 : groundV[k] == ASH ? 5 : snowV[k] ? 3 : 2;
    };
    const river = new Array(W * H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        // (the most of its corners; land only with three or more)
        const ks = [vert(x, y), vert(x + 1, y), vert(x + 1, y + 1), vert(x, y + 1)];
        const kinds = ks.map(terrainOf), count = {};
        for (const t of kinds) count[t] = (count[t] || 0) + 1;
        terrain[cell(x, y)] = (count[0] || 0) >= 2 ? 0 : +Object.keys(count).filter((t) => t != 0).sort((a, b) => count[b] - count[a])[0];
        river[cell(x, y)] = riverMask[cell(x, y)] >= 0 ? 1 : 0;
    }
    fs.writeFileSync(path.join(OUT, "terrain.json"), JSON.stringify({
        w: W, h: H, tile: N, terrain: runs(terrain), river: runs(river),
        places: PLACES.map((p) => ({ kind: p.kind, x: p.x, y: p.y, name: p.name || "" })),
    }));
}

const world = {
    w: W, h: H, tile: N, columns: COLS, animFrames: FRAMES, anim: SHEET.anim, placeSize: PLACE_SIZE,
    layers: LAYERS.map((n) => ({ n, d: runs(layers[n]) })),
    terrain: runs(terrain),
    places: PLACES.map((p, i) => ({ i: p.id ?? i + 1, k: PLACE_KINDS.indexOf(p.kind), s: PLACE_PICS.indexOf(picOf(p)), x: p.x, y: p.y, n: p.name || "" })),
};
fs.writeFileSync(path.join(ASSETS, "json/world.json"), JSON.stringify(world));
// the tiles' numbers, for the map editor to choose tiles by
fs.writeFileSync(path.join(ASSETS, "json/world-sets.json"), JSON.stringify(SETS));
console.log("wrote json/world.json (" + Math.round(JSON.stringify(world).length / 1024) + " KB)");

// previews: the whole map, and close-ups
const anim = new Set(SHEET.anim);
function render(frame) {
    const c = new Canvas(W * N, H * N, 0);
    for (const n of LAYERS) for (let k = 0; k < W * H; k++) {
        const t = layers[n][k];
        if (t >= 0) c.draw(SHEET.pics[anim.has(t) ? t + frame : t], N, (k % W) * N, Math.floor(k / W) * N);
    }
    for (const p of PLACES) c.draw(placePic(picOf(p)), PLACE_SIZE, Math.round((p.x + 0.5) * N - PLACE_SIZE / 2), (p.y + 1) * N - PLACE_SIZE + 4);
    return c;
}
const map = render(0);
map.save(path.join(OUT, "world-map.png"));
const half = new Canvas(W * N / 2, H * N / 2);
for (let y = 0; y < half.h; y++) for (let x = 0; x < half.w; x++) half.px[y * half.w + x] = map.px[y * 2 * map.w + x * 2];
half.save(path.join(OUT, "world-map-half.png"));
// (in the reference's tiles, as the layout is)
const crops = { nw: [10, 28], lake: [110, 82], river: [104, 100], swamp: [138, 100], snow: [140, 20], desert: [10, 95], volcano: [60, 12], range: [86, 46], forest: [140, 62] };
for (const [name, [cx, cy]] of Object.entries(crops)) {
    const c = new Canvas(24 * N, 16 * N);
    c.blit(map, (cx + PAD_X) * N, (cy + PAD) * N, 24 * N, 16 * N, 0, 0);
    c.save(path.join(OUT, "crop-" + name + "-x2.png"), 2);
}

//#endregion
