import * as PIXI from "pixi.js";
import { worldSeasonAt, SeasonKind } from "../../../../shared/Seasons";
import { CYCLE_MS, cycleAt, darkness, DAY_MS, rainAt, twilight } from "../../../../shared/Weather";
import { hash } from "../../art/Backdrops";
import { speckTexture } from "../../art/LifeArt";
import { cloudTexture } from "../../art/WeatherArt";
import { AP } from "../../constants/Palette";
import type { Map as WorldMap } from "./Map";
import type { MapLife } from "./MapLife";
import type { MapWeather } from "./MapWeather";

// The sky over the map (the user, 2026-10-31: "time and sky", the second
// list of ideas), only for looks. (The moon's phases light the night:
// shared/Weather moonlight, art/WeatherArt lightTint.)
//   Shooting stars now and then on a clear night, where you're looking.
//   The northern lights over the snowy island: every Winter night, and on
//     a few nights other seasons (by the night, so everyone sees the same).
//   A red sky before a storm: the light reddening over the view while a
//     storm's on its way to it (shared/Weather storms, looked ahead), more so
//     at dawn and dusk.
//   Fog at dawn: by the water (coasts, lakes, rivers), thickening before
//     dawn, burning off through the morning.

const TILE = 16, WATER = 0, TUNDRA = 3, DESERT = 6;

export class MapSky {

    public static STAR_EVERY = [6000, 20000];   // ms between shooting stars, at night
    public static STAR_MS = 700;
    public static TRAIL = 9;                    // specks in a shooting star's tail
    public static AURORA_NIGHTS = 0.12;         // of nights out of Winter with the northern lights
    public static AURORA_BANDS = 9;
    public static STORM_AHEAD = 240000;         // how far ahead a storm's coming reddens the sky
    public static RED = 0xff8f6e;               // the light at its reddest
    public static FOG_BEFORE = 75000;           // ms before dawn it starts to gather
    public static FOG_AFTER = 120000;           // ms after dawn it's burnt off

    public layer = new PIXI.Container();        // fog and the red of the sky (over the map, under the night)
    private lit = new PIXI.Container();         // shooting stars and the northern lights (in the weather's lights)
    private red: PIXI.Sprite;
    private fog: { x: number; y: number; seed: number; sprite: PIXI.Sprite }[] = [];
    private aurora: { sprite: PIXI.Sprite; x: number; y: number; seed: number }[] = [];
    private star: { sprites: PIXI.Sprite[]; x: number; y: number; vx: number; vy: number; age: number } = null;
    private starAt = 0;
    private redness = 0;
    private redWant = 0;                        // where it's easing to (looked at once a second)
    private redCheck = 0;

    constructor(private map: WorldMap, private life: MapLife, weather: MapWeather) {
        this.layer.eventMode = this.lit.eventMode = "none";
        weather.lights.addChild(this.lit);

        // fog by the water: land a tile from it (sampled), not in the desert
        const near = this.nearWater();
        let n = 0;
        for (let k = 0; k < near.length; k++) {
            if (!near[k] || life.terrain[k] == DESERT || hash(k, 801) > 0.16) continue;
            const s = life.sprite(cloudTexture(), this.layer, 0.5, 0.5);
            s.tint = AP.WHITE;
            this.fog.push({ x: (k % life.w + 0.5) * TILE, y: (Math.floor(k / life.w) + 0.5) * TILE, seed: n++, sprite: s });
        }

        // the northern lights: bands across the top of the snowy island
        let x0 = Infinity, x1 = -Infinity, y0 = Infinity;
        for (let k = 0; k < life.terrain.length; k++) if (life.terrain[k] == TUNDRA) {
            const x = k % life.w, y = Math.floor(k / life.w);
            x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y);
        }
        if (x1 >= x0) for (let j = 0; j < MapSky.AURORA_BANDS; j++) {
            const s = life.sprite(cloudTexture(), this.lit, 0.5, 0.5);
            s.blendMode = PIXI.BLEND_MODES.ADD;
            s.tint = [AP.LIME, AP.FOAM, AP.LIME, AP.ICE, AP.LIME, AP.ORCHID][j % 6];
            this.aurora.push({ sprite: s, x: (x0 + (x1 - x0 + 1) * (j + 0.5) / MapSky.AURORA_BANDS) * TILE, y: (y0 + 3) * TILE, seed: j });
        }

        // the sky's red: over the view, multiplied
        this.red = new PIXI.Sprite(PIXI.Texture.WHITE);
        this.red.blendMode = PIXI.BLEND_MODES.MULTIPLY;
        this.layer.addChild(this.red);
    }

    // land tiles next to water
    private nearWater() {
        const { w, h, terrain } = this.life, out = new Uint8Array(w * h);
        for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
            const k = y * w + x;
            if (terrain[k] == WATER) continue;
            if (terrain[k - 1] == WATER || terrain[k + 1] == WATER || terrain[k - w] == WATER || terrain[k + w] == WATER) out[k] = 1;
        }
        return out;
    }

    public update(deltaTime: number) {
        const now = Date.now(), dark = darkness(now), view = this.life.view(), zoom = this.map.camera.getZoom();
        this.updateFog(now, view);
        this.updateRed(deltaTime, now, view);
        this.updateAurora(now, dark, view);
        this.updateStar(deltaTime, now, dark, view, zoom);
    }

    // how thick the dawn fog is, 0 to 1
    public static fogAt(now: number) {
        const t = cycleAt(now);
        if (t >= CYCLE_MS - MapSky.FOG_BEFORE) return (t - (CYCLE_MS - MapSky.FOG_BEFORE)) / MapSky.FOG_BEFORE;
        if (t < MapSky.FOG_AFTER) return 1 - t / MapSky.FOG_AFTER;
        return 0;
    }

    private updateFog(now: number, view: PIXI.Rectangle) {
        const thick = MapSky.fogAt(now);
        for (const f of this.fog) {
            f.sprite.visible = thick > 0 && view.contains(f.x, f.y);
            if (!f.sprite.visible) continue;
            const t = now / 1000 + f.seed * 13;
            f.sprite.position.set(f.x + Math.sin(t / 11) * 8, f.y + Math.cos(t / 15) * 3);
            f.sprite.width = 58 + 12 * Math.sin(t / 9);
            f.sprite.height = 22;
            f.sprite.alpha = 0.32 * thick * (0.75 + 0.25 * Math.sin(t / 6));
        }
    }

    // a storm coming to the middle of the view (and not here yet): the light reddens
    private updateRed(deltaTime: number, now: number, view: PIXI.Rectangle) {
        this.redCheck -= deltaTime;
        if (this.redCheck <= 0) {
            this.redCheck = 1000;
            const cx = view.x + view.width / 2, cy = view.y + view.height / 2;
            const here = rainAt(cx, cy, now), coming = Math.max(rainAt(cx, cy, now + MapSky.STORM_AHEAD / 2), rainAt(cx, cy, now + MapSky.STORM_AHEAD));
            this.redWant = here < 0.15 && coming > 0.25 ? Math.min(1, coming + 0.2) * (0.45 + 0.55 * twilight(now)) : 0;
        }
        // eased, over a few seconds
        const step = deltaTime / 4000;
        this.redness += Math.max(-step, Math.min(step, this.redWant - this.redness));
        this.red.visible = this.redness > 0.01;
        if (!this.red.visible) return;
        this.red.position.set(view.x, view.y);
        this.red.width = view.width; this.red.height = view.height;
        this.red.tint = mix(0xffffff, MapSky.RED, this.redness * 0.6);
    }

    // the northern lights: Winter nights, and a few others
    public static auroraTonight(now: number) {
        if (worldSeasonAt(now).k == SeasonKind.WINTER) return true;
        return hash(Math.floor(now / CYCLE_MS), 811) < MapSky.AURORA_NIGHTS;
    }

    private updateAurora(now: number, dark: number, view: PIXI.Rectangle) {
        const on = dark > 0.5 && cycleAt(now) >= DAY_MS && MapSky.auroraTonight(now);
        for (const a of this.aurora) {
            a.sprite.visible = on && a.x + 80 > view.x && a.x - 80 < view.right && a.y + 120 > view.y && a.y - 120 < view.bottom;
            if (!a.sprite.visible) continue;
            const t = now / 1000 + a.seed * 3.7;
            a.sprite.position.set(a.x + Math.sin(t / 6) * 24 + Math.sin(t / 2.3) * 6, a.y + Math.sin(t / 8 + a.seed) * 10);
            a.sprite.width = 34 + 10 * Math.sin(t / 3);
            a.sprite.height = 150 + 40 * Math.sin(t / 5);
            a.sprite.alpha = 0.22 * (dark - 0.5) * 2 * (0.6 + 0.4 * Math.sin(t / 1.7)) * (1 - rainAt(a.x, a.y, now));
        }
    }

    // a shooting star: across the view, its tail fading behind it
    private updateStar(deltaTime: number, now: number, dark: number, view: PIXI.Rectangle, zoom: number) {
        if (!this.star) {
            this.starAt -= deltaTime;
            if (this.starAt > 0 || dark < 0.85 || rainAt(view.x + view.width / 2, view.y + view.height / 2, now) > 0.1) return;
            const [a, b] = MapSky.STAR_EVERY;
            this.starAt = a + Math.random() * (b - a);
            const left = Math.random() < 0.5, speed = 420 / zoom, angle = (0.25 + Math.random() * 0.35) * (left ? -1 : 1);
            const sprites: PIXI.Sprite[] = [];
            for (let j = 0; j < MapSky.TRAIL; j++) {
                const s = this.life.sprite(speckTexture(), this.lit, 0.5, 0.5);
                s.tint = j < 2 ? AP.WHITE : AP.FOAM;
                s.scale.set(Math.max(1, 2 / zoom) * (j == 0 ? 1.5 : 1));
                sprites.push(s);
            }
            this.star = {
                sprites, age: 0,
                x: view.x + view.width * (0.2 + Math.random() * 0.6), y: view.y + view.height * (0.1 + Math.random() * 0.4),
                vx: Math.cos(angle) * speed * (left ? -1 : 1), vy: Math.abs(Math.sin(angle)) * speed,
            };
        }
        const s = this.star;
        s.age += deltaTime;
        if (s.age >= MapSky.STAR_MS) {
            for (const p of s.sprites) p.destroy();
            this.star = null;
            return;
        }
        const t = s.age / 1000, fade = 1 - s.age / MapSky.STAR_MS, gap = 0.012;
        s.sprites.forEach((p, j) => {
            const tt = Math.max(0, t - j * gap);
            p.position.set(s.x + s.vx * tt, s.y + s.vy * tt);
            p.alpha = fade * (1 - j / MapSky.TRAIL) * dark;
        });
    }

}

function mix(a: number, b: number, f: number) {
    let out = 0;
    for (const s of [16, 8, 0]) out |= Math.round(((a >> s) & 255) + (((b >> s) & 255) - ((a >> s) & 255)) * f) << s;
    return out;
}
