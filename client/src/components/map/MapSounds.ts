import { snowing } from "../../art/WeatherArt";
import { TerrainType } from "../../constants/Constants";
import { darkness } from "../../../../shared/Weather";
import { Loop } from "../../utils/Loop";
import { Sound } from "../../utils/Sound";
import type { Map as WorldMap } from "./Map";
import type { MapLife } from "./MapLife";
import type { MapWeather } from "./MapWeather";

// The map's sounds (the user, 2026-11-01: the first batch of atmospheric
// sounds, from Leohpaz's Ambiences pack, as the rain), each heard as much as
// the view's of what makes it, from the side of the view it's on, louder
// zoomed in, fading to it (Loop):
//   waves by the coasts (water near the land), gulls over them by day;
//   birdsong over the grass, hills and woods by day (less in Winter, none in rain);
//   crickets over the land by night (none in Winter or rain), owls in the woods;
//   wind over the tundra and mountains (some over the hills), more in Winter
//     and in storms;
//   thunder with the rain (MapWeather: as much of the view's rained on, not
//     in Winter's snow);
//   rivers running (near the river layer's tiles);
//   frogs and insects over the swamps and marshes.
// What's in view is looked at a grid of points across it every SURVEY_MS.

const TILE = 16, ASHEN = 5;
const OPEN = new Set([TerrainType.GRASSLANDS, TerrainType.OASIS, TerrainType.HILLS, TerrainType.FOREST]);
const COLD: { [t: number]: number } = { [TerrainType.TUNDRA]: 1, [TerrainType.MOUNTAINS]: 1, [TerrainType.HILLS]: 0.4, [ASHEN]: 0.5 };

type Kind = "coast" | "open" | "land" | "forest" | "cold" | "river" | "swamp";

export class MapSounds {

    public static SURVEY_MS = 200;
    public static COLS = 20;
    public static ROWS = 12;
    public static ZOOM = [0.25, 0.5, 0.75, 0.9, 1];  // each one's loudness at each of Camera.ZOOM_LEVELS
    public static PAN = 0.6;            // how far to one side one's heard, all at the view's edge
    public static RIVER_NEAR = 2;       // tiles from a river it's heard
    // each: its file, how loud at its loudest, what makes it and how much of
    // the view of that is all it takes for its loudest
    public static SOUNDS: { [name: string]: { file: string; volume: number; kind?: Kind; full?: number } } = {
        waves: { file: "waves.ogg", volume: 0.5, kind: "coast", full: 0.2 },
        gulls: { file: "gulls.ogg", volume: 0.3, kind: "coast", full: 0.25 },
        birds: { file: "birds.ogg", volume: 0.35, kind: "open", full: 0.5 },
        crickets: { file: "crickets.ogg", volume: 0.3, kind: "land", full: 0.5 },
        owls: { file: "owls.ogg", volume: 0.35, kind: "forest", full: 0.3 },
        wind: { file: "wind.ogg", volume: 0.35, kind: "cold", full: 0.4 },
        thunder: { file: "thunder.ogg", volume: 0.45 },
        river: { file: "river.ogg", volume: 0.4, kind: "river", full: 0.08 },
        swamp: { file: "swamp.ogg", volume: 0.4, kind: "swamp", full: 0.3 },
    };

    private loops: { [name: string]: Loop } = {};
    private nearRiver: Uint8Array;
    private share: { [kind in Kind]?: number } = {};    // of the view (survey)
    private pan: { [kind in Kind]?: number } = {};      // where across it, -1 to 1
    private surveyAt = Infinity;

    constructor(private map: WorldMap, private life: MapLife, private weather: MapWeather) {
        for (const name in MapSounds.SOUNDS) this.loops[name] = new Loop(MapSounds.SOUNDS[name].file);
        this.nearRiver = this.near(map.world.layers.find((l) => l.n == "river"), MapSounds.RIVER_NEAR);
    }

    // the tiles within `r` of one of the layer's
    private near(layer: { d: number[] } | undefined, r: number) {
        const { w, h } = this.life, out = new Uint8Array(w * h);
        if (!layer) return out;
        for (let k = 0, at = 0; k < layer.d.length; k += 2) {
            if (layer.d[k] >= 0) for (let c = at; c < at + layer.d[k + 1]; c++) {
                const x = c % w, y = (c - x) / w;
                for (let j = Math.max(0, y - r); j <= Math.min(h - 1, y + r); j++)
                    out.fill(1, j * w + Math.max(0, x - r), j * w + Math.min(w - 1, x + r) + 1);
            }
            at += layer.d[k + 1];
        }
        return out;
    }

    // how much of the view's of each kind, and where across it
    private survey() {
        const view = this.life.view(0), { COLS, ROWS } = MapSounds;
        const count: { [kind in Kind]?: number } = {}, across: { [kind in Kind]?: number } = {};
        const add = (kind: Kind, much: number, side: number) => {
            count[kind] = (count[kind] ?? 0) + much;
            across[kind] = (across[kind] ?? 0) + much * side;
        };
        for (let j = 0; j < ROWS; j++) for (let i = 0; i < COLS; i++) {
            const x = view.x + (i + 0.5) / COLS * view.width, y = view.y + (j + 0.5) / ROWS * view.height;
            const side = (i + 0.5) / COLS * 2 - 1, t = this.life.at(x, y);
            const ti = Math.floor(x / TILE), tj = Math.floor(y / TILE);
            if (ti >= 0 && tj >= 0 && ti < this.life.w && tj < this.life.h && this.nearRiver[tj * this.life.w + ti]) add("river", 1, side);
            if (t == TerrainType.WATER) {
                if (this.life.shoreAt(x, y) <= 2) add("coast", 1, side);
                continue;
            }
            add("land", 1, side);
            if (OPEN.has(t)) add("open", 1, side);
            if (t == TerrainType.FOREST) add("forest", 1, side);
            if (t == TerrainType.SWAMP || t == TerrainType.MARSH) add("swamp", 1, side);
            if (COLD[t]) add("cold", COLD[t], side);
        }
        for (const kind in count) {
            const k = kind as Kind;
            this.share[k] = count[k] / (COLS * ROWS);
            this.pan[k] = count[k] ? across[k] / count[k] * MapSounds.PAN : 0;
        }
        for (const kind in this.share) if (!(kind in count)) this.share[kind as Kind] = 0;
    }

    public update(deltaTime: number) {
        this.surveyAt += deltaTime;
        if (this.surveyAt >= MapSounds.SURVEY_MS) { this.surveyAt = 0; this.survey(); }
        const now = Date.now(), dark = darkness(now), day = 1 - dark, winter = snowing(now), rained = this.weather.rained;
        const loud = (MapSounds.ZOOM[this.map.camera.zoomIndex] ?? 1) * Sound.effects();
        const heard = (kind: Kind, full: number) => Math.min(1, (this.share[kind] ?? 0) / full);
        // how much each's heard, 0 to 1, from where
        const want: { [name: string]: [number, number] } = {};
        for (const name in MapSounds.SOUNDS) {
            const s = MapSounds.SOUNDS[name];
            if (s.kind) want[name] = [heard(s.kind, s.full), this.pan[s.kind] ?? 0];
        }
        want.gulls[0] *= day * (1 - rained);
        want.birds[0] *= day * (winter ? 0.3 : 1) * (1 - rained);
        want.crickets[0] *= winter ? 0 : dark * (1 - rained);
        want.owls[0] *= dark;
        want.wind[0] = Math.min(1, Math.max(want.wind[0], winter ? 0.35 : 0, rained * 0.6));
        want.thunder = [winter ? 0 : rained, this.weather.rainPan];
        for (const name in this.loops) {
            const [much, pan] = want[name];
            this.loops[name].update(much * MapSounds.SOUNDS[name].volume * loud, pan, deltaTime);
        }
    }

}
