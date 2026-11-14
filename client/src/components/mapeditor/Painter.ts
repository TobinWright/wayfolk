import { PAINT_COVER, PAINT_FIELDS, PAINT_GROUND, PAINT_LAND, PAINT_PART_MOST, PAINT_RIVER, PAINT_SNOW } from "../../../../shared/MapEdit";
import {
    ASH, Box, byTile, DEAD, decode, DESERT, FOREST, grow, HILLS, inner, LAYERS, MOUNTAINS, PEAKS, PINES, rockDistance, ROCK_MOST,
    SNOW_PINES, SWAMP, terrainAt, TileSets, tilesAt, TO_E, TO_N, TO_S, TO_W, waterDepth, WorldFields,
} from "../../art/WorldAutotile";
import { Map as WorldMap } from "../map/Map";

// The map editor's painting: the map's corners (art/WorldAutotile) painted
// by brush, as the brushes' rules have it, and the tiles round what was
// painted chosen again and put on the map as it's painted. A stroke (from
// pressing to letting go) is kept to undo: each field's values before and
// after, and the tiles and terrain it came to, to send.

export type BrushKind = "sea" | "grass" | "snow" | "ground" | "cover" | "river" | "unriver";
export interface Brush { name: string; kind: BrushKind; value?: number; hint: string; }

export const BRUSHES: Brush[] = [
    { name: "Sea", kind: "sea", hint: "Water: the shore, the shallows and the deep come by themselves" },
    { name: "Grass", kind: "grass", hint: "Land, bare: takes off any ground, woods or snow" },
    { name: "Snow", kind: "snow", hint: "Snowy land (pines on it snowy too)" },
    { name: "Desert", kind: "ground", value: DESERT, hint: "Sand over the grass (not on the shore)" },
    { name: "Swamp", kind: "ground", value: SWAMP, hint: "Bog over the grass (not on the shore)" },
    { name: "Ash", kind: "ground", value: ASH, hint: "A volcano's ash over the grass (not on the shore)" },
    { name: "No ground", kind: "ground", value: 0, hint: "Takes off sand, bog or ash" },
    { name: "Forest", kind: "cover", value: FOREST, hint: "Broadleaf woods (on snow: snowy pines). Keeps off the shore and rivers" },
    { name: "Pines", kind: "cover", value: PINES, hint: "Pine woods (on snow: snowy). Keeps off the shore and rivers" },
    { name: "Dead wood", kind: "cover", value: DEAD, hint: "Bare dead trees, as in the swamp" },
    { name: "Hills", kind: "cover", value: HILLS, hint: "Rolling hills" },
    { name: "Mountains", kind: "cover", value: MOUNTAINS, hint: "A range (its shores go rocky)" },
    { name: "Peaks", kind: "cover", value: PEAKS, hint: "Snowy peaks: paint them inside mountains" },
    { name: "No cover", kind: "cover", value: 0, hint: "Takes off woods, hills and mountains" },
    { name: "River", kind: "river", hint: "Drag along where it runs, tile by tile; it joins up as it goes" },
    { name: "No river", kind: "unriver", hint: "Takes rivers off (the brush's size)" },
];

export const FILL_MOST = 30000;         // corners a fill takes at most
const CLEARING_BIG = new Set(["castle", "town", "cathedral", "icecastle", "port", "volcano"]);     // (render-world.js's BIG: a wider clearing)

// a field's values, by corner or tile number
type Values = Map<number, number>[];
export interface Stroke {
    label: string;
    before: Values;                     // (each of PAINT_FIELDS)
    after: Values;
    tiles: Map<number, number>;         // layer * tiles + tile number: the tile now
    terrain: Map<number, number>;       // tile number: its terrain now
    pins: Values;                       // values not changed, but sent as painted (where a place was: Painter.pin)
}

const WAYS = [[0, -1, TO_N, TO_S], [1, 0, TO_E, TO_W], [0, 1, TO_S, TO_N], [-1, 0, TO_W, TO_E]];

export class Painter {

    public f: WorldFields;
    private stroke: Stroke = null;
    private dirty: Box = null;          // corners painted since the tiles were last chosen
    private landDirty = false;
    private coverDirty = false;
    private lastRiver: number = null;   // the river tile the stroke's at
    private out: number[] = new Array(LAYERS.length);

    constructor(private map: WorldMap, private S: TileSets, private terrain: Int32Array) {
        this.reread();
    }

    // the corners again from the map's tiles (another editor painted)
    public reread() {
        const { w, h } = this.map.world;
        this.f = decode(w, h, this.map.tileLayers, this.S);
    }

    private get VW() { return this.f.w + 1; }

    //#region === Strokes ===

    public begin(label: string) {
        this.stroke = { label, before: PAINT_FIELDS.map(() => new Map()), after: PAINT_FIELDS.map(() => new Map()), tiles: new Map(), terrain: new Map(), pins: PAINT_FIELDS.map(() => new Map()) };
        this.lastRiver = null;
    }

    public get painting() {
        return this.stroke != null;
    }

    // done: what it did (null nothing), its tiles chosen
    public end(): Stroke {
        this.retile();
        const s = this.stroke;
        this.stroke = null;
        if (!s) return null;
        // (only what's not as it was)
        s.after.forEach((m, field) => m.forEach((v, k) => { if (s.before[field].get(k) == v) { m.delete(k); s.before[field].delete(k); } }));
        return s.after.some((m) => m.size) || s.tiles.size || s.pins.some((m) => m.size) ? s : null;
    }

    // a field's values set as they were in `values` (undoing or redoing), as a stroke of its own
    public restore(label: string, values: Values) {
        this.begin(label);
        values.forEach((m, field) => m.forEach((v, k) => this.set(field, k, v)));
        return this.end();
    }

    private set(field: number, k: number, v: number) {
        const a = this.array(field);
        if (a[k] == v) return;
        const s = this.stroke;
        if (!s.before[field].has(k)) s.before[field].set(k, a[k]);
        s.after[field].set(k, v);
        a[k] = v;
        // (the corners it touches)
        const tile = field == PAINT_SNOW || field == PAINT_RIVER;
        const i = tile ? k % this.f.w : k % this.VW, j = tile ? Math.floor(k / this.f.w) : Math.floor(k / this.VW);
        const b = { i0: i, j0: j, i1: tile ? i + 1 : i, j1: tile ? j + 1 : j };
        this.dirty = this.dirty ? { i0: Math.min(this.dirty.i0, b.i0), j0: Math.min(this.dirty.j0, b.j0), i1: Math.max(this.dirty.i1, b.i1), j1: Math.max(this.dirty.j1, b.j1) } : b;
        if (field == PAINT_LAND) this.landDirty = true;
        if (field == PAINT_COVER) this.coverDirty = true;
    }

    private array(field: number): Uint8Array | Int16Array {
        const f = this.f;
        return [f.land, f.snow, f.ground, f.cover, f.river][field];
    }

    //#endregion

    //#region === The brushes ===

    // corners within the brush round (ci, cj) (in tiles; size 1: the nearest one)
    public cornersAt(ci: number, cj: number, size: number) {
        const out: number[] = [];
        if (size <= 1) {
            const i = Math.round(ci), j = Math.round(cj);
            if (i >= 0 && j >= 0 && i <= this.f.w && j <= this.f.h) out.push(j * this.VW + i);
            return out;
        }
        const r = size / 2;
        for (let j = Math.max(0, Math.ceil(cj - r)); j <= Math.min(this.f.h, Math.floor(cj + r)); j++)
            for (let i = Math.max(0, Math.ceil(ci - r)); i <= Math.min(this.f.w, Math.floor(ci + r)); i++)
                if (Math.hypot(i - ci, j - cj) <= r) out.push(j * this.VW + i);
        return out;
    }

    // tiles within it (size 1: the one it's on)
    public tilesIn(ci: number, cj: number, size: number) {
        const out: number[] = [], { w, h } = this.f;
        if (size <= 1) {
            const x = Math.floor(ci), y = Math.floor(cj);
            if (x >= 0 && y >= 0 && x < w && y < h) out.push(y * w + x);
            return out;
        }
        const r = size / 2;
        for (let y = Math.max(0, Math.floor(cj - r)); y < Math.min(h, Math.ceil(cj + r)); y++)
            for (let x = Math.max(0, Math.floor(ci - r)); x < Math.min(w, Math.ceil(ci + r)); x++)
                if (Math.hypot(x + 0.5 - ci, y + 0.5 - cj) <= r) out.push(y * w + x);
        return out;
    }

    // the brush once at (ci, cj), tiles (rivers: from where the stroke was)
    public dab(brush: Brush, ci: number, cj: number, size: number) {
        if (brush.kind == "river") return this.river(Math.floor(ci), Math.floor(cj));
        const corners = this.cornersAt(ci, cj, size);
        const tiles = brush.kind == "snow" || brush.kind == "grass" || brush.kind == "unriver" ? this.tilesIn(ci, cj, Math.max(size, 1)) : [];
        this.apply(brush, corners, tiles);
    }

    // the brush over the corners and tiles given, by its rules
    public apply(brush: Brush, corners: number[], tiles: number[]) {
        const f = this.f, VW = this.VW;
        const at = (k: number) => [k % VW, Math.floor(k / VW)];
        const snowy = (i: number, j: number) => byTile(f, (t) => f.snow[t] == 1, i, j);
        switch (brush.kind) {
            case "sea":
                for (const k of corners) this.set(PAINT_LAND, k, 0);
                // (grounds and what stands on them keep off the shore)
                for (const k of corners) {
                    const [i, j] = at(k);
                    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
                        const x = i + dx, y = j + dy;
                        if (x < 0 || y < 0 || x > f.w || y > f.h || inner(f, x, y)) continue;
                        this.set(PAINT_GROUND, y * VW + x, 0);
                        this.set(PAINT_COVER, y * VW + x, 0);
                    }
                }
                break;
            case "grass": case "snow":
                for (const t of tiles) this.set(PAINT_SNOW, t, brush.kind == "snow" ? 1 : 0);
                for (const k of corners) {
                    this.set(PAINT_LAND, k, 1);
                    this.set(PAINT_GROUND, k, 0);
                    const c = f.cover[k];
                    if (brush.kind == "grass") this.set(PAINT_COVER, k, 0);
                    else if (c == FOREST || c == PINES) this.set(PAINT_COVER, k, SNOW_PINES);
                }
                break;
            case "ground":
                for (const k of corners) {
                    const [i, j] = at(k);
                    if (!brush.value || inner(f, i, j)) this.set(PAINT_GROUND, k, brush.value);
                }
                break;
            case "cover":
                for (const k of corners) {
                    const [i, j] = at(k);
                    if (!brush.value) { this.set(PAINT_COVER, k, 0); continue; }
                    if (!inner(f, i, j) || byTile(f, (t) => f.river[t] >= 0, i, j)) continue;
                    const v = (brush.value == FOREST || brush.value == PINES) && snowy(i, j) ? SNOW_PINES : brush.value;
                    this.set(PAINT_COVER, k, v);
                }
                break;
            case "unriver":
                for (const t of tiles) {
                    if (f.river[t] < 0) continue;
                    this.set(PAINT_RIVER, t, -1);
                    // (and the ways into it from round it)
                    const x = t % f.w, y = Math.floor(t / f.w);
                    for (const [dx, dy, , back] of WAYS) {
                        const nx = x + dx, ny = y + dy, n = ny * f.w + nx;
                        if (nx >= 0 && ny >= 0 && nx < f.w && ny < f.h && f.river[n] > 0) this.set(PAINT_RIVER, n, f.river[n] & ~back);
                    }
                }
                break;
        }
    }

    // a river run on to tile (x, y) from the last, a tile at a time (four ways), each joined to the one before
    private river(x: number, y: number) {
        const f = this.f;
        if (x < 0 || y < 0 || x >= f.w || y >= f.h) return;
        const to = y * f.w + x;
        if (this.lastRiver == null) {
            this.riverTile(to);
            this.lastRiver = to;
            return;
        }
        let cx = this.lastRiver % f.w, cy = Math.floor(this.lastRiver / f.w);
        while (cx != x || cy != y) {
            // (along whichever way is further behind, so it runs straight-ish)
            const ex = Math.abs(x - cx), ey = Math.abs(y - cy);
            const [dx, dy] = ex > ey || (ex == ey && (cx + cy) % 2) ? [Math.sign(x - cx), 0] : [0, Math.sign(y - cy)];
            const from = cy * f.w + cx;
            cx += dx; cy += dy;
            const next = cy * f.w + cx;
            this.riverTile(next);
            const [, , way, back] = WAYS.find(([wx, wy]) => wx == dx && wy == dy);
            this.set(PAINT_RIVER, from, f.river[from] | way);
            this.set(PAINT_RIVER, next, f.river[next] | back);
        }
        this.lastRiver = to;
    }

    // a tile a river runs through: nothing standing on its corners
    private riverTile(t: number) {
        const f = this.f, x = t % f.w, y = Math.floor(t / f.w);
        if (f.river[t] < 0) this.set(PAINT_RIVER, t, 0);
        for (const [i, j] of [[x, y], [x + 1, y], [x + 1, y + 1], [x, y + 1]]) this.set(PAINT_COVER, j * this.VW + i, 0);
    }

    // the corners joined (four ways) to the one at k that are what it is,
    // for the brush (its land, ground or cover); null too many
    public fillFrom(brush: Brush, k: number): { corners: number[], tiles: number[] } {
        const f = this.f, VW = this.VW;
        const classOf = brush.kind == "ground" ? (c: number) => f.land[c] ? f.ground[c] : -1
            : brush.kind == "cover" ? (c: number) => f.land[c] ? f.cover[c] : -1
            : (c: number) => f.land[c];
        const want = classOf(k), seen = new Uint8Array(f.land.length), open = [k], corners: number[] = [];
        seen[k] = 1;
        while (open.length) {
            const c = open.pop();
            corners.push(c);
            if (corners.length > FILL_MOST) return null;
            const i = c % VW, j = Math.floor(c / VW);
            for (const [dx, dy] of WAYS) {
                const x = i + dx, y = j + dy, n = y * VW + x;
                if (x < 0 || y < 0 || x > f.w || y > f.h || seen[n] || classOf(n) != want) continue;
                seen[n] = 1;
                open.push(n);
            }
        }
        // (the tiles all of whose corners it took)
        const tiles: number[] = [];
        for (const c of corners) {
            const x = c % VW, y = Math.floor(c / VW);
            if (x < f.w && y < f.h && seen[y * VW + x + 1] && seen[(y + 1) * VW + x] && seen[(y + 1) * VW + x + 1]) tiles.push(y * f.w + x);
        }
        return { corners, tiles };
    }

    //#region === Places ===

    // the corners under a place on tile (x, y), as render-world.js has them:
    // those it makes land (but under a pier, out on the water), and the
    // clearing round it, where nothing stands
    private placeCorners(x: number, y: number, kind: string) {
        const f = this.f, land: number[] = [], clear: number[] = [];
        const ok = (i: number, j: number) => i >= 0 && j >= 0 && i <= f.w && j <= f.h;
        if (kind != "pier")
            for (let j = y - 1; j <= y + 2; j++) for (let i = x - 1; i <= x + 2; i++)
                if (ok(i, j) && Math.hypot(i - x - 0.5, j - y - 0.5) <= 1.6) land.push(j * this.VW + i);
        const r = CLEARING_BIG.has(kind) ? 2.4 : 1.7;
        for (let j = Math.floor(y - r); j <= y + r + 1; j++) for (let i = Math.floor(x - r); i <= x + r + 1; i++)
            if (ok(i, j) && Math.hypot(i - x - 0.5, j - y - 0.5) <= r) clear.push(j * this.VW + i);
        return { land, clear };
    }

    // a place come to tile (x, y): the ground under it made as render-world.js makes it
    public settle(x: number, y: number, kind: string) {
        const { land, clear } = this.placeCorners(x, y, kind);
        for (const k of land) this.set(PAINT_LAND, k, 1);
        for (const k of clear) this.set(PAINT_COVER, k, 0);
    }

    // a place gone from tile (x, y): the ground it had kept as it is (sent as
    // painted, so a build without the place there makes it the same)
    public pin(x: number, y: number, kind: string) {
        const { land, clear } = this.placeCorners(x, y, kind), s = this.stroke;
        for (const k of land) s.pins[PAINT_LAND].set(k, this.f.land[k]);
        for (const k of clear) s.pins[PAINT_COVER].set(k, this.f.cover[k]);
    }

    //#endregion

    //#region === The tiles ===

    // the tiles round what's been painted chosen again, and put on the map
    public retile() {
        const b = this.dirty, s = this.stroke;
        if (!b) return;
        this.dirty = null;
        const f = this.f;
        // (land moves the shallows and the deep out round it; mountains, the rocky shores by them)
        let box = grow(f, b, 1);
        if (this.landDirty) {
            const water = grow(f, b, 9);
            waterDepth(f, water);
            box = grow(f, water, 1);
        }
        if (this.coverDirty || this.landDirty) {
            const rock = grow(f, b, ROCK_MOST + 1);
            rockDistance(f, rock);
            box = { i0: Math.min(box.i0, rock.i0 - 1), j0: Math.min(box.j0, rock.j0 - 1), i1: Math.max(box.i1, rock.i1 + 1), j1: Math.max(box.j1, rock.j1 + 1) };
        }
        this.landDirty = this.coverDirty = false;

        const layers = this.map.tileLayers, tiles = f.w * f.h, changes: number[] = [];
        for (let y = Math.max(0, box.j0); y < Math.min(f.h, box.j1); y++) for (let x = Math.max(0, box.i0); x < Math.min(f.w, box.i1); x++) {
            const k = y * f.w + x;
            tilesAt(f, this.S, x, y, this.out);
            for (let l = 0; l < LAYERS.length; l++) {
                if (layers[l][k] == this.out[l]) continue;
                changes.push(l, k, this.out[l]);
                s?.tiles.set(l * tiles + k, this.out[l]);
            }
            const t = terrainAt(f, x, y);
            if (this.terrain[k] != t) {
                this.terrain[k] = t;
                s?.terrain.set(k, t);
            }
        }
        if (changes.length) this.map.setTiles(changes);
    }

    // a stroke as messages' worth (each at most PAINT_PART_MOST numbers)
    public parts(s: Stroke) {
        const tiles = this.f.w * this.f.h, parts: { c: number[], e: number[], p: number[] }[] = [];
        let part = { c: [] as number[], e: [] as number[], p: [] as number[] }, n = 0;
        const room = (by: number) => {
            if (n + by <= PAINT_PART_MOST) { n += by; return; }
            parts.push(part);
            part = { c: [], e: [], p: [] };
            n = by;
        };
        s.tiles.forEach((t, key) => { room(3); part.c.push(Math.floor(key / tiles), key % tiles, t); });
        s.terrain.forEach((t, k) => { room(2); part.e.push(k, t); });
        s.pins.forEach((m, field) => m.forEach((v, k) => { if (!s.after[field].has(k)) { room(3); part.p.push(field, k, v); } }));
        s.after.forEach((m, field) => m.forEach((v, k) => { room(3); part.p.push(field, k, v); }));
        if (n) parts.push(part);
        return parts;
    }

    //#endregion

    //#region === What's there ===

    // the brush that paints what's at corner (ci, cj) (the one nearest), or on tile (x, y) a river
    public brushAt(ci: number, cj: number): Brush {
        const f = this.f, x = Math.floor(ci), y = Math.floor(cj);
        if (x >= 0 && y >= 0 && x < f.w && y < f.h && f.river[y * f.w + x] >= 0) return BRUSHES.find((b) => b.kind == "river");
        const i = Math.max(0, Math.min(f.w, Math.round(ci))), j = Math.max(0, Math.min(f.h, Math.round(cj))), k = j * this.VW + i;
        if (!f.land[k]) return BRUSHES[0];
        const c = f.cover[k] == SNOW_PINES ? PINES : f.cover[k];
        if (c) return BRUSHES.find((b) => b.kind == "cover" && b.value == c);
        if (f.ground[k]) return BRUSHES.find((b) => b.kind == "ground" && b.value == f.ground[k]);
        return BRUSHES.find((b) => b.kind == (byTile(f, (t) => f.snow[t] == 1, i, j) ? "snow" : "grass"));
    }

    // the corner nearest (ci, cj) told
    public describe(ci: number, cj: number) {
        const f = this.f, i = Math.max(0, Math.min(f.w, Math.round(ci))), j = Math.max(0, Math.min(f.h, Math.round(cj))), k = j * this.VW + i;
        if (!f.land[k]) return "sea";
        const parts = [byTile(f, (t) => f.snow[t] == 1, i, j) ? "snow" : "land"];
        if (f.ground[k]) parts.push(["", "desert", "swamp", "ash"][f.ground[k]]);
        if (f.cover[k]) parts.push(["", "forest", "pines", "snowy pines", "dead wood", "hills", "mountains", "peaks"][f.cover[k]]);
        if (!inner(f, i, j)) parts.push("shore");
        return parts.join(", ");
    }

    //#endregion

}
