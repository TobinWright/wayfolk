import * as PIXI from "pixi.js";
import { EventKind, isLive } from "../../../../shared/Events";
import { isTown, kindOf, WorldPlace } from "../../../../shared/Places";
import { worldSeasonAt, SeasonKind } from "../../../../shared/Seasons";
import { findPath, Graph, isSeaLeg } from "../../../../shared/Travel";
import { cycleAt, darkness, DAY_MS, rainAt, storms } from "../../../../shared/Weather";
import { hash } from "../../art/Backdrops";
import {
    birdTexture, camelTexture, COATS, deerTexture, fishTexture, leafTexture, pennantTexture, rippleTexture, sheepTexture, shipTexture,
    snowmanTexture, speckTexture, wagonTexture, wakeTexture, walkerTexture, whaleTexture,
} from "../../art/LifeArt";
import { cloudTexture } from "../../art/WeatherArt";
import { AP } from "../../constants/Palette";
import { IBC } from "../../Engine";
import { walkAt } from "./Wander";
import type { Map as WorldMap } from "./Map";
import type { MapWeather } from "./MapWeather";

// Life on the map (the user, 2026-10-30: "there needs to be more going on,
// on the map"), only for looks: nothing here is sent or saved, and nothing
// can be clicked.
//   Coming and going: wagons and people on foot along the roads between
//     towns, ships and fishing boats at sea, ferries on the sea routes.
//   Animals: deer in the woods, sheep round the farms and villages, camels in
//     the desert, birds crossing the sky by day, bats round the dungeons by
//     night, a fish jumping near the shore, now and then a whale out at sea.
//   Towns: smoke from their chimneys; at night forges glowing at the mines,
//     torches at the castles and forts, Luminmoor's lamps, lanterns on the
//     wagons and ships.
//   Weather: fair-weather clouds' shadows drifting over, mist on the swamp,
//     the volcano smoking and its ash drifting down, whitecaps on the water
//     under a storm.
//   Seasons: leaves falling from the woods in Autumn, blossom in Spring,
//     fireflies on Summer nights, snowmen by the towns in Winter, and bunting
//     and lanterns round a town holding its festival (shared/Events FESTIVAL),
//     left up for a day after it's won (the fair itself: EventSites).
// What comes and goes on a clock (wagons, ships, herds, birds, clouds) comes
// from a seed and the time alone, so everyone watching sees the same; the
// little things (smoke, a fish, a leaf) are only where you're looking.

const TILE = 16;
// world.json's terrain (tools/render-world.js: the server's TerrainType)
const WATER = 0, TUNDRA = 3, ASHEN = 5, DESERT = 6, SWAMP = 7, FOREST = 9;

// a number generator from a seed, the same every time
function rng(seed: number) {
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6d2b79f5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

// one going back and forth along a line of points, resting a while at each end
interface Route { pts: { x: number; y: number }[]; len: number[]; total: number; }
function route(pts: { x: number; y: number }[]): Route {
    const len = [0];
    for (let k = 1; k < pts.length; k++) len.push(len[k - 1] + Math.hypot(pts[k].x - pts[k - 1].x, pts[k].y - pts[k - 1].y));
    return { pts, len, total: len[len.length - 1] };
}
// where along it at `now`: speed map px a second, rest ms at each end, `side` px off to the right of the way going
function along(r: Route, now: number, speed: number, rest: number, phase: number, side = 0) {
    const goMs = r.total / speed * 1000, cycle = 2 * (goMs + rest);
    let t = ((now + phase * cycle) % cycle + cycle) % cycle, back = false;
    if (t >= goMs + rest) { t -= goMs + rest; back = true; }
    const moving = t < goMs;
    let d = Math.min(1, t / goMs) * r.total;
    if (back) d = r.total - d;
    let k = 1;
    while (k < r.len.length - 1 && r.len[k] < d) k++;
    const a = r.pts[k - 1], b = r.pts[k], seg = r.len[k] - r.len[k - 1] || 1, f = (d - r.len[k - 1]) / seg;
    let dx = (b.x - a.x) / seg, dy = (b.y - a.y) / seg;
    if (back) { dx = -dx; dy = -dy; }
    return { x: a.x + (b.x - a.x) * f - dy * side, y: a.y + (b.y - a.y) * f + dx * side, face: dx >= 0 ? 1 : -1, moving };
}

// a sprite that faces left or right (flipped about its middle)
function face(s: PIXI.Sprite, dir: number) {
    s.scale.x = dir < 0 ? -Math.abs(s.scale.x) : Math.abs(s.scale.x);
}

interface Traveller { r: Route; phase: number; speed: number; wagon: boolean; coat: number; sprite: PIXI.Sprite; lamp: PIXI.Sprite; }
interface Ship { r: Route; phase: number; speed: number; big: boolean; ferry?: boolean; fisher?: boolean; sprite: PIXI.Sprite; wake: PIXI.Sprite; lamp: PIXI.Sprite; }
interface Beast { kind: "deer" | "sheep" | "camel"; seed: number; home: { x: number; y: number; s: number }; dx: number; dy: number; stag: boolean; sprite: PIXI.Sprite; }
interface Bat { x: number; y: number; seed: number; sprite: PIXI.Sprite; }
export interface Fleck { sprite: PIXI.Sprite; x: number; y: number; vx: number; vy: number; age: number; life: number; kind: number; a: number; grow?: number; }
interface Mist { x: number; y: number; seed: number; sprite: PIXI.Sprite; }
interface Glow { sprite: PIXI.Sprite; seed: number; alpha: number; late?: boolean; }
interface Folk { home: { x: number; y: number; s: number }; seed: number; coat: number; sprite: PIXI.Sprite; }

// what a fleck is (how it moves and fades)
// (FADE: in and out again as it goes; STREAK: bright at once, fading out)
export const enum F { SMOKE, ASH, LEAF, PETAL, FIREFLY, FOAM, FISH, RIPPLE, WHALE, SPOUT, FADE, STREAK }

// how busy the towns are through the day and night (shared/Weather cycleAt):
// fires lit for breakfast at dawn and supper at dusk, quiet in the dead of night
export function townBusy(now: number) {
    const t = cycleAt(now);
    if (t < 45000) return 1.8;
    if (t < DAY_MS - 30000) return 0.9;
    if (t < DAY_MS + 30000) return 1.8;
    if (t < DAY_MS + 180000) return 0.6;
    return 0.3;
}

// a fishing boat's day: out from its mooring just after dawn, fishing at the
// far end of its lane, home before dusk, moored all night
const SAIL_OUT = 10000, HOME_BY = DAY_MS - 15000;
function boatAt(r: Route, now: number, speed: number, phase: number) {
    const a = r.pts[0], b = r.pts[1], goMs = r.total / speed * 1000;
    const t = cycleAt(now + (phase - 0.5) * 30000), back = HOME_BY - goMs;
    const dir = Math.sign(b.x - a.x) || 1;
    const at = (f: number) => ({ x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f });
    if (t < SAIL_OUT || t >= HOME_BY) return { ...at(0), face: dir, moving: false, moored: true };
    if (t < SAIL_OUT + goMs) return { ...at((t - SAIL_OUT) / goMs), face: dir, moving: true, moored: false };
    if (t < back) {
        const p = at(1);
        return { x: p.x + Math.sin(t / 5000 + phase * 9) * 4, y: p.y + Math.cos(t / 7000) * 2, face: Math.cos(t / 5000 + phase * 9) > 0 ? 1 : -1, moving: false, moored: false };
    }
    return { ...at(1 - (t - back) / goMs), face: -dir, moving: true, moored: false };
}

export class MapLife {

    public static TRAVELLERS = 26;      // on the roads at once (some wagons, some on foot)
    public static SHIPS = 9;            // big ships out at sea
    public static BOATS = 10;           // fishing boats near the shore
    public static HERDS = 34;           // of deer, in the woods
    public static CARAVANS = 7;         // of camels, in the desert
    public static FLOCKS = 7;           // of birds in the sky at once
    public static CLOUDS = 14;          // fair-weather clouds over the map
    public static WAGON_SPEED = 4;      // map px a second (a hero goes 8)
    public static WALK_SPEED = 3;
    public static SHIP_SPEED = 5;
    public static BIRD_SPEED = 26;
    public static FLECKS_MOST = 700;    // smoke, ash, leaves and the rest at once
    public static FLECK_ZOOM = 1;       // the little things only from this zoom (Camera.ZOOM_LEVELS index) in

    public sea = new PIXI.Container();      // ships, whales and fish (under the places)
    public ground = new PIXI.Container();   // wagons, walkers and animals (over the places, under the heroes)
    public air = new PIXI.Container();      // smoke, mist, clouds' shadows, birds (over the heroes)
    private glows = new PIXI.Container();   // what shines at night (in the weather's lights)

    public terrain: Uint8Array;
    private deep: Uint8Array;
    private shore: Uint8Array;              // water tiles: how many tiles to land (up to 9)
    public w: number;
    public h: number;
    public places: WorldPlace[];
    public close = false;                   // near enough for the little things (FLECK_ZOOM)

    private travellers: Traveller[] = [];
    private ships: Ship[] = [];
    private beasts: Beast[] = [];
    private flocks: PIXI.Sprite[][] = [];
    private bats: Bat[] = [];
    private clouds: PIXI.Sprite[] = [];
    private mists: Mist[] = [];
    private lamps: Glow[] = [];             // forges, torches, Luminmoor's lamps
    private snowmen: PIXI.Sprite[] = [];
    private folk: Folk[] = [];              // about the towns by day, indoors at night
    private flecks: Fleck[] = [];
    private chimneys: { x: number; y: number; big: boolean }[] = [];
    private ashen: { x: number; y: number }[] = [];
    private woods: { x: number; y: number }[] = [];
    private bunting: PIXI.Container = new PIXI.Container();
    private lanterns: PIXI.Sprite[] = [];   // the festival bunting's (in the lights)
    private festivalAt: string = "";
    private graphSize = 0;
    private spawnAt = 0;
    private whaleAt = 0;
    private time = 0;

    constructor(private map: WorldMap, private weather: MapWeather) {
        for (const c of [this.sea, this.ground, this.air, this.glows, this.bunting]) c.eventMode = "none";
        this.ground.sortableChildren = true;
        weather.lights.addChild(this.glows);
        this.ground.addChild(this.bunting);
        this.bunting.zIndex = -1;

        const world = map.world as any;
        this.w = world.w; this.h = world.h; this.places = world.places;
        this.terrain = new Uint8Array(this.w * this.h).fill(2);
        if (world.terrain) for (let k = 0, at = 0; k < world.terrain.length; k += 2) this.terrain.fill(world.terrain[k], at, at += world.terrain[k + 1]);
        this.deep = new Uint8Array(this.w * this.h);
        const deep = world.layers.find((l: any) => l.n == "deep");
        if (deep) for (let k = 0, at = 0; k < deep.d.length; k += 2) { if (deep.d[k] >= 0) this.deep.fill(1, at, at + deep.d[k + 1]); at += deep.d[k + 1]; }
        this.shore = this.distanceToLand(9);

        this.makeShips();
        this.makeBeasts();
        this.makeSky();
        this.makeTowns();
        this.makeSpots();
    }

    // the terrain under a map px (outside: water)
    public at(x: number, y: number) {
        const i = Math.floor(x / TILE), j = Math.floor(y / TILE);
        return i < 0 || j < 0 || i >= this.w || j >= this.h ? WATER : this.terrain[j * this.w + i];
    }
    public shoreAt(x: number, y: number) {
        const i = Math.floor(x / TILE), j = Math.floor(y / TILE);
        return i < 0 || j < 0 || i >= this.w || j >= this.h ? 9 : this.shore[j * this.w + i];
    }

    // for each water tile, how far to land (0 land, up to `most`)
    private distanceToLand(most: number) {
        const d = new Uint8Array(this.w * this.h).fill(most);
        let edge: number[] = [];
        for (let k = 0; k < d.length; k++) if (this.terrain[k] != WATER) { d[k] = 0; edge.push(k); }
        for (let step = 1; step < most && edge.length; step++) {
            const next: number[] = [];
            for (const k of edge) {
                const x = k % this.w, y = (k - x) / this.w;
                for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
                    if (nx < 0 || ny < 0 || nx >= this.w || ny >= this.h) continue;
                    const n = ny * this.w + nx;
                    if (d[n] > step) { d[n] = step; next.push(n); }
                }
            }
            edge = next;
        }
        return d;
    }

    public sprite(t: PIXI.Texture, parent: PIXI.Container, ax = 0.5, ay = 1) {
        const s = new PIXI.Sprite(t);
        s.anchor.set(ax, ay);
        parent.addChild(s);
        return s;
    }

    // a light (in the weather's lights, shown at night)
    public glow(tint: number, scale: number) {
        const g = this.weather.glow(tint);
        this.weather.lights.removeChild(g);
        this.glows.addChild(g);
        g.scale.set(scale);
        return g;
    }

    //#region making it all, once

    // ships on lanes of open water (one end to the other all water), fishing boats near the shore
    private makeShips() {
        const r = rng(4101);
        const lane = (big: boolean) => {
            for (let tries = 0; tries < 3000; tries++) {
                const x = r() * this.w * TILE, y = r() * this.h * TILE, a = r() * Math.PI * 2;
                const near = this.shoreAt(x, y);
                if (big ? near < 4 : near < 1 || near > 2) continue;
                const len = (big ? 30 + r() * 50 : 5 + r() * 9) * TILE, bx = x + Math.cos(a) * len, by = y + Math.sin(a) * len;
                let ok = true;
                for (let d = 0; d <= len && ok; d += 6) {
                    const px = x + Math.cos(a) * d, py = y + Math.sin(a) * d, s = this.shoreAt(px, py);
                    if (px < 8 || py < 8 || px > this.w * TILE - 8 || py > this.h * TILE - 8 || (big ? s < 3 : s < 1 || s > 3)) ok = false;
                }
                // (a fishing boat moors at the end nearer the shore)
                if (ok) return !big && this.shoreAt(bx, by) < near ? route([{ x: bx, y: by }, { x, y }]) : route([{ x, y }, { x: bx, y: by }]);
            }
            return null;
        };
        for (let k = 0; k < MapLife.SHIPS + MapLife.BOATS; k++) {
            const big = k < MapLife.SHIPS, l = lane(big);
            if (l) { this.addShip(l, big, r()); this.ships[this.ships.length - 1].fisher = !big; }
        }
    }

    private addShip(r: Route, big: boolean, phase: number) {
        const ship: Ship = {
            r, phase, big, speed: MapLife.SHIP_SPEED * (big ? 1 : 0.6),
            sprite: this.sprite(shipTexture(big), this.sea, 0.5, 0.8),
            wake: this.sprite(wakeTexture(), this.sea, 0.5, 0),
            lamp: this.glow(AP.STRAW, big ? 0.3 : 0.2),
        };
        this.ships.push(ship);
    }

    // the roads between towns (and the sea routes), once the travel graph's come
    private makeRoutes(graph: Graph) {
        for (const t of this.travellers) { t.sprite.destroy(); t.lamp.destroy(); }
        this.travellers = [];
        const towns = this.places.filter((p) => isTown(p) && graph.has(p.i));
        const r = rng(2203);
        for (let k = 0, tries = 0; k < MapLife.TRAVELLERS && tries < 500 && towns.length > 1; tries++) {
            const a = towns[Math.floor(r() * towns.length)], b = towns[Math.floor(r() * towns.length)];
            if (a == b) continue;
            const path = findPath(graph, a.i, b.i);
            if (!path) continue;
            const ids = [a.i, ...path], pts = ids.map((i) => graph.get(i));
            if (pts.some((n, j) => j && isSeaLeg(pts[j - 1], n))) continue;
            const way = route(pts.map((n) => ({ x: n.x, y: n.y })));
            if (way.total < 10 * TILE || way.total > 70 * TILE) continue;
            const wagon = r() < 0.45;
            this.travellers.push({
                r: way, phase: r(), wagon, coat: Math.floor(r() * COATS.length),
                speed: wagon ? MapLife.WAGON_SPEED : MapLife.WALK_SPEED * (0.85 + r() * 0.3),
                sprite: this.sprite(wagon ? wagonTexture(0) : walkerTexture(0, 0), this.ground),
                lamp: this.glow(AP.STRAW, wagon ? 0.22 : 0.15),
            });
            k++;
        }
        // a ferry on each sea route: from land through the sea's nodes to land again
        for (const s of this.ships.filter((s) => s.ferry)) { s.sprite.destroy(); s.wake.destroy(); s.lamp.destroy(); }
        this.ships = this.ships.filter((s) => !s.ferry);
        const done = new Set<string>();
        graph.forEach((n) => {
            if (n.te == WATER) return;
            for (const e of n.e) {
                const m = graph.get(e);
                if (!m || m.te != WATER) continue;
                // along the sea's nodes to the first land
                const pts = [n, m], seen = new Set([n.i, m.i]);
                let at = m;
                while (at && at.te == WATER) {
                    const next = at.e.map((i) => graph.get(i)).find((x) => x && !seen.has(x.i));
                    if (!next) { at = null; break; }
                    pts.push(next); seen.add(next.i); at = next;
                }
                if (!at || at.te == WATER) continue;
                const key = [n.i, at.i].sort((a, b) => a - b).join("-");
                if (done.has(key)) continue;
                done.add(key);
                this.addShip(route(pts.map((p) => ({ x: p.x, y: p.y }))), false, hash(n.i, 31));
                this.ships[this.ships.length - 1].ferry = true;
            }
        });
    }

    // deer in the woods, sheep round farms and villages, camels in the desert
    private makeBeasts() {
        const r = rng(3307);
        const tiles = (kind: number) => {
            const out: number[] = [];
            for (let k = 0; k < this.terrain.length; k++) if (this.terrain[k] == kind) out.push(k);
            return out;
        };
        const herd = (kind: Beast["kind"], home: { x: number; y: number; s: number }, n: number, seed: number) => {
            for (let j = 0; j < n; j++) {
                const stag = kind == "deer" && j == 0;
                const tex = kind == "deer" ? deerTexture(stag, 0) : kind == "sheep" ? sheepTexture(0) : camelTexture(0);
                this.beasts.push({
                    kind, seed, home, stag, dx: (r() - 0.5) * (kind == "sheep" ? 14 : 10), dy: (r() - 0.5) * 6,
                    sprite: this.sprite(tex, this.ground),
                });
                // sheep each graze their own way, a herd keeps together
                if (kind == "sheep") seed = Math.floor(r() * 1e6);
            }
        };
        const woods = tiles(FOREST);
        for (let k = 0; k < MapLife.HERDS && woods.length; k++) {
            const t = woods[Math.floor(r() * woods.length)], x = (t % this.w + 0.5) * TILE, y = (Math.floor(t / this.w) + 0.5) * TILE;
            herd("deer", { x, y, s: 20 }, 2 + Math.floor(r() * 3), Math.floor(r() * 1e6));
        }
        const sand = tiles(DESERT);
        for (let k = 0; k < MapLife.CARAVANS && sand.length; k++) {
            const t = sand[Math.floor(r() * sand.length)], x = (t % this.w + 0.5) * TILE, y = (Math.floor(t / this.w) + 0.5) * TILE;
            herd("camel", { x, y, s: 28 }, 2 + Math.floor(r() * 2), Math.floor(r() * 1e6));
        }
        for (const p of this.places) {
            const kind = kindOf(p), n = kind == "farm" ? 6 : kind == "village" ? 3 : kind == "manor" ? 2 : 0;
            if (!n) continue;
            // a pasture beside it, on land
            for (let tries = 0; tries < 12; tries++) {
                const a = r() * Math.PI * 2, x = (p.x + 0.5) * TILE + Math.cos(a) * 26, y = (p.y + 1) * TILE + 4 + Math.sin(a) * 16;
                if ([[0, 0], [12, 0], [-12, 0], [0, 10], [0, -10]].some(([dx, dy]) => this.at(x + dx, y + dy) == WATER)) continue;
                herd("sheep", { x, y, s: 10 }, n, Math.floor(r() * 1e6));
                break;
            }
        }
    }

    // birds, bats, clouds' shadows and the swamp's mist
    private makeSky() {
        for (let k = 0; k < MapLife.FLOCKS; k++) {
            const n = 3 + Math.floor(hash(k, 501) * 4), flock: PIXI.Sprite[] = [];
            for (let j = 0; j < n; j++) flock.push(this.sprite(birdTexture(0), this.air, 0.5, 0.5));
            this.flocks.push(flock);
        }
        for (const p of this.places) {
            const kind = kindOf(p);
            if (!["cave", "lair", "ruins", "darktower", "icecastle", "tower", "crater"].includes(kind)) continue;
            for (let j = 0; j < 3; j++)
                this.bats.push({ x: (p.x + 0.5) * TILE, y: (p.y + 1) * TILE - 22, seed: p.i * 10 + j, sprite: this.sprite(birdTexture(0, true), this.air, 0.5, 0.5) });
        }
        for (let k = 0; k < MapLife.CLOUDS; k++) {
            const c = this.sprite(cloudTexture(), this.air, 0.5, 0.5);
            c.tint = AP.NAVY;
            this.clouds.push(c);
        }
        const r = rng(5501);
        for (let k = 0; k < this.terrain.length; k++) {
            if (this.terrain[k] != SWAMP || r() > 0.22) continue;
            const m = this.sprite(cloudTexture(), this.air, 0.5, 0.5);
            m.tint = AP.MIST;
            this.mists.push({ x: (k % this.w + 0.5) * TILE, y: (Math.floor(k / this.w) + 0.5) * TILE, seed: k, sprite: m });
        }
    }

    // chimneys, lamps and snowmen
    private makeTowns() {
        const r = rng(6607);
        for (const p of this.places) {
            const kind = kindOf(p), cx = (p.x + 0.5) * TILE, bottom = (p.y + 1) * TILE + 4;
            if (isTown(p) || ["farm", "hut", "camp"].includes(kind)) {
                const n = kind == "town" || kind == "castle" || kind == "port" ? 2 : 1;
                for (let j = 0; j < n; j++) this.chimneys.push({ x: cx + (r() - 0.5) * 16, y: bottom - 18 - r() * 6, big: false });
            }
            if (kind == "volcano") this.chimneys.push({ x: cx, y: bottom - 27, big: true });
            // forges glowing at the mines, torches at castles and forts
            if (kind == "mine") this.lamps.push({ sprite: this.glow(AP.EMBER, 0.45), seed: p.i, alpha: 0.7 }), this.lamps[this.lamps.length - 1].sprite.position.set(cx, bottom - 6);
            if (kind == "castle" || kind == "fort" || kind == "icecastle")
                for (const dx of [-11, 11]) { const g = this.glow(AP.FLAME, 0.22); g.position.set(cx + dx, bottom - 14); this.lamps.push({ sprite: g, seed: p.i * 3 + dx, alpha: 0.8 }); }
            if (kind == "volcano") { const g = this.glow(AP.FLAME, 0.7); g.position.set(cx, bottom - 26); this.lamps.push({ sprite: g, seed: p.i, alpha: 0.6 }); }
            // Luminmoor, lamplit: lamps round it
            if (p.n == "Luminmoor") for (let j = 0; j < 7; j++) {
                const a = j / 7 * Math.PI * 2, g = this.glow(AP.STRAW, 0.18);
                g.position.set(cx + Math.cos(a) * 20, bottom - 8 + Math.sin(a) * 10);
                this.lamps.push({ sprite: g, seed: j, alpha: 0.9 });
            }
            // folk about the town by day; its tavern lit at night, late
            if (isTown(p)) {
                const n = kind == "village" || kind == "manor" ? 2 : 4;
                for (let j = 0; j < n; j++)
                    this.folk.push({ home: { x: cx, y: bottom + 3, s: 13 }, seed: Math.floor(r() * 1e6), coat: Math.floor(r() * COATS.length), sprite: this.sprite(walkerTexture(0, 0), this.ground) });
                const g = this.glow(AP.AMBER, 0.26);
                g.position.set(cx + (r() < 0.5 ? -7 : 7), bottom - 7);
                this.lamps.push({ sprite: g, seed: p.i * 7, alpha: 0.75, late: true });
            }
            // snowmen by the towns (shown in Winter)
            if (isTown(p) || kind == "farm") for (let tries = 0; tries < 8; tries++) {
                const x = cx + (r() < 0.5 ? -1 : 1) * (18 + r() * 10), y = bottom + (r() - 0.5) * 14;
                if (this.at(x, y) == WATER) continue;
                const s = this.sprite(snowmanTexture(r() < 0.5), this.ground);
                s.position.set(Math.round(x), Math.round(y));
                s.zIndex = y;
                this.snowmen.push(s);
                break;
            }
        }
    }

    // where ash falls and leaves fall from (sampled, so picking one is quick)
    private makeSpots() {
        const r = rng(7703);
        for (let k = 0; k < this.terrain.length; k++) {
            const t = this.terrain[k], x = (k % this.w + 0.5) * TILE, y = (Math.floor(k / this.w) + 0.5) * TILE;
            if (t == ASHEN) this.ashen.push({ x, y });
            if (t == FOREST && r() < 0.5) this.woods.push({ x, y });
        }
        const volcano = this.places.find((p) => kindOf(p) == "volcano");
        if (volcano) for (let k = 0; k < 60; k++) {
            const a = r() * Math.PI * 2, d = Math.sqrt(r()) * 9 * TILE;
            this.ashen.push({ x: (volcano.x + 0.5) * TILE + Math.cos(a) * d, y: (volcano.y + 0.5) * TILE + Math.sin(a) * d });
        }
    }

    //#endregion

    // the map in view (map px), a little over
    public view(more = 24) {
        const cam = this.map.camera, zoom = cam.getZoom();
        return new PIXI.Rectangle(cam.scrollX / zoom - more, cam.scrollY / zoom - more, window.innerWidth / zoom + more * 2, window.innerHeight / zoom + more * 2);
    }

    public update(deltaTime: number) {
        const graph = IBC.data.heroes.graph;
        if (graph.size != this.graphSize) { this.graphSize = graph.size; this.makeRoutes(graph); }
        this.time += deltaTime;
        const now = Date.now(), dark = darkness(now), season = worldSeasonAt(now).k, view = this.view();
        const step = Math.floor(this.time / 220) % 2;

        // on the roads
        for (const t of this.travellers) {
            const p = along(t.r, now, t.speed, 20000, t.phase, 3);
            const seen = view.contains(p.x, p.y);
            t.sprite.visible = seen;
            t.lamp.visible = seen && t.wagon;
            if (!seen) continue;
            const frame = p.moving ? step : 0;
            t.sprite.texture = t.wagon ? wagonTexture(frame) : walkerTexture(t.coat, frame);
            t.sprite.position.set(Math.round(p.x), Math.round(p.y) + 4);
            t.sprite.zIndex = p.y;
            face(t.sprite, p.face);
            t.lamp.position.set(p.x + p.face * 5, p.y);
            t.lamp.alpha = 0.5 * dark;
        }

        // at sea, bobbing
        for (const s of this.ships) {
            const p: { x: number; y: number; face: number; moving: boolean; moored?: boolean } = s.fisher ? boatAt(s.r, now, s.speed, s.phase) : along(s.r, now, s.speed, s.big ? 30000 : 50000, s.phase);
            const seen = view.contains(p.x, p.y);
            s.sprite.visible = s.lamp.visible = seen;
            s.wake.visible = seen && p.moving;
            if (!seen) continue;
            const bob = Math.sin(now / 700 + s.phase * 9) > 0.3 ? 1 : 0;
            s.sprite.position.set(Math.round(p.x), Math.round(p.y) + bob);
            face(s.sprite, p.face);
            s.wake.position.set(Math.round(p.x - p.face * (s.big ? 3 : 2)), Math.round(p.y) + 1);
            s.wake.alpha = 0.5 + 0.3 * Math.sin(now / 300 + s.phase * 7);
            s.lamp.position.set(p.x, p.y - 2);
            s.lamp.alpha = (p.moored ? 0.3 : 0.55) * dark;
        }

        // animals walking about their homes (as heroes do where they work: Wander)
        for (const b of this.beasts) {
            const home = b.home, seen = view.contains(home.x, home.y);
            b.sprite.visible = seen;
            if (!seen) continue;
            const s = walkAt(b.seed, home as any, now * (b.kind == "camel" ? 0.6 : 1));
            const x = Math.round(s.x + b.dx), y = Math.round(s.y + b.dy);
            const frame = s.walking ? step : 0;
            b.sprite.texture = b.kind == "deer" ? deerTexture(b.stag, frame) : b.kind == "sheep" ? sheepTexture(frame) : camelTexture(frame);
            b.sprite.position.set(x, y);
            b.sprite.zIndex = y;
            if (s.face) face(b.sprite, s.face);
        }

        // folk about the towns by day, gone in as it gets dark
        for (const f of this.folk) {
            const seen = dark < 0.6 && view.contains(f.home.x, f.home.y);
            f.sprite.visible = seen;
            if (!seen) continue;
            const s = walkAt(f.seed, f.home as any, now * 0.7);
            f.sprite.texture = walkerTexture(f.coat, s.walking ? step : 0);
            f.sprite.position.set(Math.round(s.x), Math.round(s.y));
            f.sprite.zIndex = s.y;
            f.sprite.alpha = Math.min(1, (0.6 - dark) * 3);
            if (s.face) face(f.sprite, s.face);
        }

        // snowmen in Winter
        for (const s of this.snowmen) s.visible = season == SeasonKind.WINTER && view.contains(s.x, s.y);

        this.updateSky(now, dark, view);
        this.updateLamps(now, dark);
        this.updateFestivals(now, dark);
        this.updateFlecks(deltaTime, now, dark, season, view);
    }

    // birds by day, bats by night, the clouds' shadows and the mist
    private updateSky(now: number, dark: number, view: PIXI.Rectangle) {
        const W = this.w * TILE, H = this.h * TILE, flap = Math.floor(this.time / 160);
        // each flock crosses the map in a slot of its own: from a spot off one side to the other
        this.flocks.forEach((flock, k) => {
            const SLOT = 240000, t = now + hash(k, 503) * SLOT, slot = Math.floor(t / SLOT), into = (t - slot * SLOT) / 1000;
            const y0 = hash(slot, 510 + k) * H, a = (hash(slot, 520 + k) - 0.5) * 0.8 + (hash(slot, 530 + k) < 0.5 ? 0 : Math.PI);
            const x0 = Math.cos(a) > 0 ? -60 : W + 60;
            const hx = x0 + Math.cos(a) * MapLife.BIRD_SPEED * into, hy = y0 + Math.sin(a) * MapLife.BIRD_SPEED * into;
            const flying = dark < 0.5 && worldSeasonAt(now).k != SeasonKind.WINTER || k < 3;
            flock.forEach((b, j) => {
                const row = Math.ceil(j / 2), side = j % 2 ? 1 : -1;
                const x = hx - Math.cos(a) * row * 7 - Math.sin(a) * side * row * 6, y = hy - Math.sin(a) * row * 7 + Math.cos(a) * side * row * 6;
                b.visible = flying && dark < 0.6 && view.contains(x, y);
                if (!b.visible) return;
                b.texture = birdTexture((flap + j) % 3 == 0 ? 1 : 0);
                b.position.set(Math.round(x), Math.round(y));
            });
        });
        for (const b of this.bats) {
            b.sprite.visible = dark > 0.3 && view.contains(b.x, b.y);
            if (!b.sprite.visible) continue;
            const t = now / 1000 + hash(b.seed, 7) * 50;
            b.sprite.texture = birdTexture((flap + b.seed) % 2, true);
            b.sprite.position.set(Math.round(b.x + Math.sin(t * 1.3) * 12 + Math.sin(t * 3.1) * 3), Math.round(b.y + Math.cos(t * 1.9) * 6));
            b.sprite.alpha = Math.min(1, (dark - 0.3) * 3);
        }
        // fair-weather clouds drifting east, their shadows faint
        this.clouds.forEach((c, k) => {
            const size = 120 + hash(k, 601) * 200, span = W + size * 2;
            const x = ((hash(k, 602) * span + now / 1000 * (2 + hash(k, 603) * 2)) % span) - size;
            const y = hash(k, 604) * H + Math.sin(now / 90000 + k) * 40;
            c.width = size; c.height = size * 0.6;
            c.position.set(x, y);
            c.visible = x + size > view.x && x - size < view.right && y + size > view.y && y - size < view.bottom;
            c.alpha = 0.09 * (1 - dark * 0.7);
        });
        // the swamp's mist, thicker at night and at dawn
        for (const m of this.mists) {
            m.sprite.visible = view.contains(m.x, m.y);
            if (!m.sprite.visible) continue;
            const t = now / 1000 + hash(m.seed, 3) * 100;
            m.sprite.position.set(m.x + Math.sin(t / 9) * 10, m.y + Math.cos(t / 13) * 4);
            m.sprite.width = 40 + 10 * Math.sin(t / 7); m.sprite.height = 18;
            m.sprite.alpha = (0.12 + 0.08 * Math.sin(t / 5)) * (1 + dark * 0.6);
        }
    }

    // forges, torches and lamps flickering at night
    private updateLamps(now: number, dark: number) {
        this.glows.visible = dark > 0;
        for (const l of this.lamps) {
            const flicker = 0.85 + 0.15 * Math.sin(now / 110 + l.seed * 5) * Math.sin(now / 47 + l.seed);
            l.sprite.alpha = l.alpha * dark * flicker * (l.late ? Math.min(1, 0.5 + townBusy(now)) : 1);
        }
    }

    // bunting and lanterns round a town holding its festival
    private updateFestivals(now: number, dark: number) {
        // (on, or won, for as long as its boon lasts)
        const on = IBC.data.events.list.filter((e) => e.k == EventKind.FESTIVAL && (isLive(e, now) || e.w == 1 && (e.u ?? 0) > now)).map((e) => e.p);
        const key = on.join(",");
        if (key != this.festivalAt) {
            this.festivalAt = key;
            for (const c of [...this.bunting.children]) c.destroy();
            for (const g of this.lanterns) g.destroy();
            this.lanterns = [];
            for (const id of on) {
                const p = this.places.find((x) => x.i == id);
                if (!p) continue;
                const cx = (p.x + 0.5) * TILE, bottom = (p.y + 1) * TILE + 4;
                const colours = [AP.RED, AP.STRAW, AP.SKY, AP.LIME, AP.PINK];
                // two strings of pennants either side, sagging
                for (const side of [-1, 1]) for (let j = 0; j < 7; j++) {
                    const f = j / 6, x = cx + side * (14 + f * 14), y = bottom - 10 + Math.sin(f * Math.PI) * 3;
                    const s = this.sprite(pennantTexture(), this.bunting, 0.5, 0);
                    s.tint = colours[(j + (side > 0 ? 2 : 0)) % colours.length];
                    s.position.set(Math.round(x), Math.round(y));
                    // every other one a lantern, glowing at night
                    if (j % 2 == 0) {
                        const g = this.glow(s.tint as number, 0.12);
                        g.position.set(x, y + 1);
                        this.lanterns.push(g);
                    }
                }
            }
        }
        for (const g of this.lanterns) g.alpha = 0.7 * dark * (0.8 + 0.2 * Math.sin(now / 300 + g.x));
    }

    //#region the little things that come and go where you're looking

    public fleck(texture: PIXI.Texture, kind: F, x: number, y: number, vx: number, vy: number, life: number, tint = 0xffffff, parent = this.air) {
        if (this.flecks.length >= MapLife.FLECKS_MOST) return null;
        const s = this.sprite(texture, parent, 0.5, 0.5);
        s.tint = tint;
        const f: Fleck = { sprite: s, x, y, vx, vy, age: 0, life, kind, a: 1 };
        this.flecks.push(f);
        return f;
    }

    // a random spot in view on a list of spots (null: none in view)
    public pick(spots: { x: number; y: number }[], view: PIXI.Rectangle) {
        for (let tries = 0; tries < 12; tries++) {
            const s = spots[Math.floor(Math.random() * spots.length)];
            if (s && view.contains(s.x, s.y)) return s;
        }
        return null;
    }

    // a random water tile in view `from`-`to` tiles from land
    private water(view: PIXI.Rectangle, from: number, to: number) {
        for (let tries = 0; tries < 12; tries++) {
            const x = view.x + Math.random() * view.width, y = view.y + Math.random() * view.height, d = this.shoreAt(x, y);
            if (this.at(x, y) == WATER && d >= from && d <= to) return { x, y };
        }
        return null;
    }

    private updateFlecks(deltaTime: number, now: number, dark: number, season: SeasonKind, view: PIXI.Rectangle) {
        const dt = deltaTime / 1000, wind = 3 + 3 * Math.sin(now / 400000);
        const close = this.close = this.map.camera.zoomIndex >= MapLife.FLECK_ZOOM;
        this.spawnAt += deltaTime;
        if (close) while (this.spawnAt >= 100) {
            this.spawnAt -= 100;
            this.spawn(now, dark, season, view, wind);
        }
        else this.spawnAt = 0;

        for (let k = this.flecks.length - 1; k >= 0; k--) {
            const f = this.flecks[k];
            f.age += deltaTime;
            if (f.age >= f.life || !close) { f.sprite.destroy(); this.flecks.splice(k, 1); continue; }
            const t = f.age / f.life;
            f.x += f.vx * dt; f.y += f.vy * dt;
            let x = f.x, y = f.y, alpha = 1;
            switch (f.kind) {
                case F.SMOKE: {
                    const size = (f.grow ?? 4) * (0.5 + t * 1.5);
                    f.sprite.width = f.sprite.height = size;
                    alpha = (t < 0.15 ? t / 0.15 : 1 - (t - 0.15) / 0.85) * f.a;
                    break;
                }
                case F.ASH: case F.LEAF: case F.PETAL:
                    x += Math.sin(f.age / 300 + f.a * 9) * 2;
                    alpha = t > 0.8 ? (1 - t) / 0.2 : 1;
                    if (f.kind == F.LEAF) f.sprite.rotation = Math.round(Math.sin(f.age / 250 + f.a * 9)) * Math.PI / 2;
                    break;
                case F.FIREFLY:
                    x += Math.sin(f.age / 500 + f.a * 9) * 4;
                    y += Math.cos(f.age / 700 + f.a * 5) * 3;
                    alpha = Math.max(0, Math.sin(t * Math.PI)) * (0.5 + 0.5 * Math.sin(f.age / 180 + f.a * 20)) * dark;
                    break;
                case F.FOAM: case F.RIPPLE:
                    alpha = Math.sin(t * Math.PI) * 0.8;
                    break;
                case F.FISH:
                    // up and over in an arc
                    y -= Math.sin(t * Math.PI) * 5;
                    f.sprite.rotation = (t - 0.5) * 1.6 * (f.vx < 0 ? -1 : 1);
                    break;
                case F.WHALE:
                    y += t < 0.2 ? (0.2 - t) * 15 : t > 0.8 ? (t - 0.8) * 15 : 0;
                    alpha = t < 0.2 ? t / 0.2 : t > 0.8 ? (1 - t) / 0.2 : 1;
                    break;
                case F.SPOUT:
                    alpha = 1 - t;
                    break;
                case F.STREAK:
                    alpha = (1 - t) * f.a;
                    break;
                case F.FADE:
                    alpha = Math.sin(t * Math.PI) * f.a;
                    break;
            }
            f.sprite.position.set(Math.round(x), Math.round(y));
            f.sprite.alpha = alpha;
        }
    }

    // a tenth of a second's worth of new little things
    private spawn(now: number, dark: number, season: SeasonKind, view: PIXI.Rectangle, wind: number) {
        const R = Math.random;
        // smoke from the chimneys in view (the volcano's thick and dark)
        const busy = townBusy(now);
        for (const c of this.chimneys) {
            if (!view.contains(c.x, c.y) || R() > (c.big ? 0.5 : 0.12 * busy)) continue;
            const f = this.fleck(cloudTexture(), F.SMOKE, c.x + (R() - 0.5) * (c.big ? 6 : 1), c.y, wind * (0.6 + R() * 0.5), -(c.big ? 9 : 6) - R() * 3, (c.big ? 5000 : 3200) + R() * 1000, c.big ? (R() < 0.5 ? AP.IRON : AP.SLATE) : AP.ASH);
            if (f) { f.grow = c.big ? 12 : 5; f.a = c.big ? 0.75 : 0.55; }
        }
        // the volcano's ash drifting down
        for (let j = 0; j < 2; j++) {
            const s = this.pick(this.ashen, view);
            if (s) { const f = this.fleck(speckTexture(), F.ASH, s.x + (R() - 0.5) * TILE, s.y - 10, wind * 0.6, 4 + R() * 3, 2500 + R() * 1500, R() < 0.5 ? AP.STONE : AP.IRON); if (f) f.a = R(); }
        }
        // leaves in Autumn, blossom in Spring, fireflies on Summer nights
        if (season == SeasonKind.AUTUMN || season == SeasonKind.SPRING) for (let j = 0; j < 2; j++) {
            const s = this.pick(this.woods, view);
            if (!s) continue;
            const autumn = season == SeasonKind.AUTUMN;
            const tint = autumn ? [AP.AMBER, AP.EMBER, AP.RUST, AP.STRAW][Math.floor(R() * 4)] : [AP.PINK, AP.WHITE, AP.PINK][Math.floor(R() * 3)];
            const f = this.fleck(autumn ? leafTexture() : speckTexture(), autumn ? F.LEAF : F.PETAL, s.x + (R() - 0.5) * TILE, s.y - 8, wind * 0.8, 5 + R() * 3, 2200 + R() * 1200, tint);
            if (f) f.a = R();
        }
        if (season == SeasonKind.SUMMER && dark > 0.4) {
            const s = this.pick(this.woods, view);
            if (s && R() < 0.8) {
                const f = this.fleck(speckTexture(), F.FIREFLY, s.x + (R() - 0.5) * TILE * 1.5, s.y + (R() - 0.5) * TILE, 0, 0, 3000 + R() * 2000, AP.LIME, this.glows);
                if (f) f.a = R();
            }
        }
        // a fish jumping near the shore
        if (R() < 0.08) {
            const s = this.water(view, 1, 3);
            if (s) {
                const dir = R() < 0.5 ? -1 : 1;
                this.fleck(fishTexture(), F.FISH, s.x, s.y, dir * 8, 0, 600, 0xffffff, this.sea);
                this.fleck(rippleTexture(), F.RIPPLE, s.x, s.y + 1, 0, 0, 900, 0xffffff, this.sea);
                this.fleck(rippleTexture(), F.RIPPLE, s.x + dir * 5, s.y + 1, 0, 0, 900, 0xffffff, this.sea);
            }
        }
        // now and then a whale, far out
        if (now > this.whaleAt && R() < 0.02) {
            const s = this.water(view, 6, 9);
            if (s) {
                this.whaleAt = now + 45000 + R() * 60000;
                const dir = R() < 0.5 ? -1 : 1, f = this.fleck(whaleTexture(), F.WHALE, s.x, s.y, dir * 2, 0, 7000, 0xffffff, this.sea);
                if (f) face(f.sprite, dir);
                for (let j = 0; j < 8; j++) this.fleck(speckTexture(), F.SPOUT, s.x + dir * 3 + (R() - 0.5) * 2, s.y - 3, (R() - 0.5) * 4, -10 - R() * 6, 900 + j * 120, AP.FOAM, this.sea);
            }
        }
        // whitecaps under a storm
        const under = storms(now);
        if (under.length) for (let j = 0; j < 4; j++) {
            const s = this.water(view, 1, 9);
            if (!s) continue;
            const rain = rainAt(s.x, s.y, now, under);
            if (rain > 0.2 && R() < rain) {
                const f = this.fleck(wakeTexture(), F.FOAM, s.x, s.y, wind, 0, 1200 + R() * 600, 0xffffff, this.sea);
                if (f) f.sprite.scale.x = 0.6;
            }
        }
    }

    //#endregion

}
