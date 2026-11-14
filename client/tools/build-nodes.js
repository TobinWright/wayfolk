// Builds the travel graph (npm run nodes, after npm run world): a node on
// every place on the map, linked to its neighbours by the land between them,
// with waypoints along the way, and sea routes from the pier to the islands.
// - Each place's cheapest way over land to every other (forests, hills,
//   swamp, rivers - but at a bridge - cost more, mountains nearly bar the
//   way, water does); two places are linked when no third lies on the way
//   (going by it costs not much more than going straight).
// - The ways are laid shortest first, each later one cheaper along those
//   already laid, so they share roads; a waypoint every SPACING tiles of
//   them, one near another (or a place) taken as the same.
// - The land the pier's not on is reached by sea from it, to the place on
//   its shore nearest by sea.
// Reads tools/out/terrain.json (from render-world.js); writes
// tools/out/nodes.json and a preview, tools/out/nodes-map.png. With --db it
// replaces the server's node table (server/.env's database) with them:
// restart the server after, it keeps the nodes in memory.
// Node ids: the places' are their ids in world.json (1, 2, ...), the
// waypoints' come after.

const fs = require("fs");
const path = require("path");
const { Canvas, readPng } = require("./canvas");

const OUT = path.join(__dirname, "out");
const SPACING = 7;          // tiles between waypoints over land
const SEA_SPACING = 10;     // and by sea
const MERGE = 3.5;          // tiles: a waypoint this near another node is that node
const DETOUR = 1.25;        // a link's dropped if going by a third place costs at most this much more

let src;
try { src = JSON.parse(fs.readFileSync(path.join(OUT, "terrain.json"), "utf8")); }
catch (e) { console.log("No tools/out/terrain.json: run npm run world first"); process.exit(1); }
const { w: W, h: H, tile: N } = src;
const unruns = (r) => { const a = []; for (let i = 0; i < r.length; i += 2) for (let n = 0; n < r[i + 1]; n++) a.push(r[i]); return a; };
const terrain = unruns(src.terrain), river = unruns(src.river);
const PLACES = src.places;
const cell = (x, y) => y * W + x;

// the server's NodeType and TerrainType
const OTHER = 0, SETTLEMENT = 1, DUNGEON = 2;
const WATER = 0, OASIS = 4;
const TERRAIN_NAMES = { 0: "Sea", 2: "Grasslands", 3: "Tundra", 5: "Steppe", 6: "Desert", 7: "Swamp", 9: "Forest", 10: "Hills", 11: "Mountains" };
const SETTLEMENTS = new Set(["village", "town", "castle", "cathedral", "fort", "manor", "farm", "chapel", "camp", "hut", "icecastle", "port", "pier"]);
const DUNGEONS = new Set(["cave", "mine", "lair", "ruins", "darktower", "crater", "pyramids", "steptemple", "altar", "volcano"]);
const BIG = new Set(["castle", "town", "cathedral", "icecastle", "port"]);

//#region what crossing a tile costs

const COST = { 2: 1, 3: 1.3, 5: 1.4, 6: 1.4, 7: 2.5, 9: 1.6, 10: 2, 11: 12 };
const FORD = 4;             // more to cross a river (not by a bridge)

const placeAt = new Map();
PLACES.forEach((p, i) => placeAt.set(cell(p.x, p.y), i));
const pier = PLACES.findIndex((p) => p.kind == "pier");
const byBridge = new Uint8Array(W * H);
for (const p of PLACES) if (p.kind == "bridge")
    for (let y = p.y - 1; y <= p.y + 1; y++) for (let x = p.x - 1; x <= p.x + 1; x++) byBridge[cell(x, y)] = 1;

// over land (a place's own tile always, but the pier's: it's out on the water)
const road = new Float32Array(W * H).fill(1);
function landCost(k) {
    const at = placeAt.get(k);
    if (at != null && at != pier) return road[k];
    const t = terrain[k];
    if (t == WATER) return Infinity;
    return (COST[t] + (river[k] && !byBridge[k] ? FORD : 0)) * road[k];
}
const seaCost = (k) => terrain[k] == WATER ? 1 : Infinity;

//#endregion

//#region cheapest ways (Dijkstra, 8 ways; no cutting a corner past what can't be crossed)

function cheapest(from, costOf, to = -1) {
    const dist = new Float64Array(W * H).fill(Infinity), prev = new Int32Array(W * H).fill(-1);
    const heap = [];
    const push = (d, k) => {
        heap.push([d, k]);
        for (let i = heap.length - 1; i > 0;) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; }
    };
    const pop = () => {
        const top = heap[0], last = heap.pop();
        if (heap.length) {
            heap[0] = last;
            for (let i = 0; ;) {
                const l = i * 2 + 1, r = l + 1;
                let m = i;
                if (l < heap.length && heap[l][0] < heap[m][0]) m = l;
                if (r < heap.length && heap[r][0] < heap[m][0]) m = r;
                if (m == i) break;
                [heap[m], heap[i]] = [heap[i], heap[m]]; i = m;
            }
        }
        return top;
    };
    // (from one tile, or the nearest of several)
    for (const k of [from].flat()) { dist[k] = 0; push(0, k); }
    while (heap.length) {
        const [d, k] = pop();
        if (d > dist[k]) continue;
        if (k == to) break;
        const x = k % W, y = Math.floor(k / W);
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
            if (!dx && !dy) continue;
            const nx = x + dx, ny = y + dy;
            if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
            const nk = cell(nx, ny), c = costOf(nk);
            if (c == Infinity) continue;
            if (dx && dy && (costOf(cell(x + dx, y)) == Infinity || costOf(cell(x, y + dy)) == Infinity)) continue;
            const nd = d + c * (dx && dy ? Math.SQRT2 : 1);
            if (nd < dist[nk]) { dist[nk] = nd; prev[nk] = k; push(nd, nk); }
        }
    }
    return { dist, prev };
}
function wayTo(prev, to) {
    const way = [];
    for (let k = to; k >= 0; k = prev[k]) way.push(k);
    return way.reverse();
}

//#endregion

//#region which places are linked

const landPlaces = PLACES.map((p, i) => i).filter((i) => i != pier);
const cost = PLACES.map(() => new Float64Array(PLACES.length).fill(Infinity));
for (const i of landPlaces) {
    const { dist } = cheapest(cell(PLACES[i].x, PLACES[i].y), landCost);
    for (const j of landPlaces) cost[i][j] = dist[cell(PLACES[j].x, PLACES[j].y)];
}
const links = [];
for (const i of landPlaces) for (const j of landPlaces) {
    if (j <= i || cost[i][j] == Infinity) continue;
    if (landPlaces.some((c) => c != i && c != j && cost[i][c] + cost[c][j] <= cost[i][j] * DETOUR)) continue;
    links.push([i, j]);
}
links.sort((a, b) => cost[a[0]][a[1]] - cost[b[0]][b[1]]);

//#endregion

//#region the nodes and their edges

const nodes = PLACES.map((p) => ({
    x: p.x, y: p.y, place: p, water: p.kind == "pier",
    terrain: p.kind == "oasis" ? OASIS : terrain[cell(p.x, p.y)],
}));
const edges = new Set();
const edgeKey = (a, b) => a < b ? a + "-" + b : b + "-" + a;
const link = (a, b) => { if (a != b) edges.add(edgeKey(a, b)); };

// a node for tile k: one already near it (of the same kind, land or water), or a new waypoint
function nodeAt(k, water) {
    const x = k % W, y = Math.floor(k / W);
    let best = -1, bestD = MERGE;
    nodes.forEach((n, i) => {
        const d = Math.hypot(n.x - x, n.y - y);
        if (n.water == water && d <= bestD) { best = i; bestD = d; }
    });
    if (best >= 0) return best;
    return nodes.push({ x, y, water, terrain: terrain[k] }) - 1;
}
// a way's nodes: its ends, and waypoints evenly along it
function layWay(way, a, b, spacing, water) {
    const along = [0];
    for (let s = 1; s < way.length; s++) {
        const p = way[s - 1], q = way[s];
        along.push(along[s - 1] + Math.hypot(p % W - q % W, Math.floor(p / W) - Math.floor(q / W)));
    }
    // (at least one out on the water, by sea)
    const length = along[along.length - 1], n = Math.max(water ? 1 : 0, Math.round(length / spacing) - 1);
    const chain = [a];
    for (let m = 1, s = 0; m <= n; m++) {
        const at = (length * m) / (n + 1);
        while (along[s] < at) s++;
        const node = nodeAt(way[s], water);
        if (node != chain[chain.length - 1]) chain.push(node);
    }
    chain.push(b);
    for (let i = 1; i < chain.length; i++) link(chain[i - 1], chain[i]);
}

// over land, shortest first, each the cheaper along those laid
for (const [i, j] of links) {
    const from = cell(PLACES[i].x, PLACES[i].y), to = cell(PLACES[j].x, PLACES[j].y);
    const way = wayTo(cheapest(from, landCost, to).prev, to);
    for (const k of way) road[k] = 0.5;
    layWay(way, i, j, SPACING, false);
}

// a link that a waypoint between its ends makes no longer (a triangle's long side)
{
    const len = (a, b) => Math.hypot(nodes[a].x - nodes[b].x, nodes[a].y - nodes[b].y);
    const near = () => {
        const m = nodes.map(() => new Set());
        for (const e of edges) { const [a, b] = e.split("-").map(Number); m[a].add(b); m[b].add(a); }
        return m;
    };
    const sorted = [...edges].map((e) => e.split("-").map(Number)).sort((p, q) => len(q[0], q[1]) - len(p[0], p[1]));
    for (const [a, b] of sorted) {
        const m = near();
        if ([...m[a]].some((c) => c != b && m[c].has(b) && len(a, c) + len(c, b) <= len(a, b) * 1.15)) edges.delete(edgeKey(a, b));
    }
}

// the pier to its port (it's on the lake)
if (pier >= 0) {
    const port = landPlaces.filter((i) => PLACES[i].kind == "port")
        .sort((a, b) => Math.hypot(PLACES[a].x - PLACES[pier].x, PLACES[a].y - PLACES[pier].y) - Math.hypot(PLACES[b].x - PLACES[pier].x, PLACES[b].y - PLACES[pier].y))[0];
    if (port != null) link(pier, port);
}

// by sea from the mainland (the part with the most places) to each other
// part: from the place on its shore nearest by sea, to theirs
{
    const part = nodes.map((n, i) => i);
    const root = (i) => part[i] == i ? i : (part[i] = root(part[i]));
    for (const e of edges) { const [a, b] = e.split("-").map(Number); part[root(a)] = root(b); }
    const count = new Map();
    for (const i of landPlaces) count.set(root(i), (count.get(root(i)) || 0) + 1);
    const main = [...count.keys()].sort((a, b) => count.get(b) - count.get(a))[0];
    // the water by a place (within 3 tiles), and which place it's by
    const shoreOf = new Map();
    const shore = (i) => {
        const { x, y } = PLACES[i], ks = [];
        for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) {
            const nx = x + dx, ny = y + dy;
            if (nx < 0 || ny < 0 || nx >= W || ny >= H || Math.hypot(dx, dy) > 3 || terrain[cell(nx, ny)] != WATER) continue;
            ks.push(cell(nx, ny));
        }
        return ks;
    };
    const mainShore = [];
    for (const i of landPlaces) if (root(i) == main) for (const k of shore(i)) if (!shoreOf.has(k)) { shoreOf.set(k, i); mainShore.push(k); }
    const sea = cheapest(mainShore, seaCost);
    for (const p of count.keys()) {
        if (p == main) continue;
        let best = null;
        for (const i of landPlaces) if (root(i) == p)
            for (const k of shore(i)) if (sea.dist[k] < (best?.d ?? Infinity)) best = { i, k, d: sea.dist[k] };
        if (!best) { console.log("no way by sea to " + (PLACES[landPlaces.find((i) => root(i) == p)].name || "a part of the map")); continue; }
        const way = wayTo(sea.prev, best.k);
        layWay(way, shoreOf.get(way[0]), best.i, SEA_SPACING, true);
    }
}

//#endregion

//#region writing it out

const ids = nodes.map((n, i) => i + 1);
const near = nodes.map(() => []);
for (const e of edges) { const [a, b] = e.split("-").map(Number); near[a].push(ids[b]); near[b].push(ids[a]); }
const label = (kind) => kind[0].toUpperCase() + kind.slice(1);
const rows = nodes.map((n, i) => ({
    id: ids[i],
    data: JSON.stringify({
        name: n.place ? n.place.name || label(n.place.kind) : TERRAIN_NAMES[n.terrain] ?? "",
        x: Math.round((n.x + 0.5) * N),
        y: Math.round((n.y + 0.5) * N),
        size: n.place ? (BIG.has(n.place.kind) ? 16 : 12) : 6,
        level: 1,
        type: n.place ? (SETTLEMENTS.has(n.place.kind) ? SETTLEMENT : DUNGEONS.has(n.place.kind) ? DUNGEON : OTHER) : OTHER,
        terrain: n.terrain,
        resources: "[]",
        edges: near[i].sort((a, b) => a - b),
    }),
}));
fs.writeFileSync(path.join(OUT, "nodes.json"), JSON.stringify(rows, null, 1));
console.log(nodes.length + " nodes (" + PLACES.length + " places), " + edges.size + " edges; wrote " + path.join(OUT, "nodes.json"));

// the preview: the map at half size, the edges and nodes over it
{
    const png = readPng(path.join(OUT, "world-map-half.png"));
    const map = new Canvas(png.width, png.height);
    for (let k = 0; k < map.px.length; k++) map.px[k] = (png.data[k * 4] << 16) | (png.data[k * 4 + 1] << 8) | png.data[k * 4 + 2];
    const S = N / 2, at = (n) => [Math.round((n.x + 0.5) * S), Math.round((n.y + 0.5) * S)];
    for (const e of edges) {
        const [a, b] = e.split("-").map(Number), [x0, y0] = at(nodes[a]), [x1, y1] = at(nodes[b]);
        const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
        const c = nodes[a].water || nodes[b].water ? 0x73bed3 : 0xebede9;
        for (let s = 0; s <= steps; s++) map.set(Math.round(x0 + ((x1 - x0) * s) / steps), Math.round(y0 + ((y1 - y0) * s) / steps), c);
    }
    for (const n of nodes) {
        const [x, y] = at(n), r = n.place ? 3 : 1;
        for (let dy = -r - 1; dy <= r + 1; dy++) for (let dx = -r - 1; dx <= r + 1; dx++) {
            const d = Math.hypot(dx, dy);
            if (d <= r) map.set(x + dx, y + dy, n.place ? 0xcf573c : 0xe8c170);
            else if (d <= r + 1) map.set(x + dx, y + dy, 0x090a14);
        }
    }
    map.save(path.join(OUT, "nodes-map.png"));
}

// into the database
if (process.argv.includes("--db")) (async () => {
    const SERVER = path.join(__dirname, "../../server");
    const env = {};
    for (const line of fs.readFileSync(path.join(SERVER, ".env"), "utf8").split(/\r?\n/)) {
        const m = /^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/.exec(line);
        if (m) env[m[1]] = m[2];
    }
    const mysql = require(path.join(SERVER, "node_modules/mysql2/promise"));
    const conn = await mysql.createConnection({ host: env.DB_HOST ?? "localhost", port: parseInt(env.DB_PORT ?? "3306", 10), user: env.DB_USER, password: env.DB_PASS, database: env.DB_DATABASE ?? "game_wayfolk" });
    await conn.beginTransaction();
    await conn.query("DELETE FROM node");
    await conn.query("INSERT INTO node (id, data) VALUES ?", [rows.map((r) => [r.id, r.data])]);
    await conn.commit();
    await conn.query("ALTER TABLE node AUTO_INCREMENT = " + (rows.length + 1));
    await conn.end();
    console.log("replaced the node table (" + rows.length + " nodes): restart the server");
})();

//#endregion
