import * as PIXI from "pixi.js";
import { IBC } from "../../Engine";
import { cloudTexture, dropTexture, flakeTexture, GLOW_R, glowTexture, lightTint, snowing, splashTexture } from "../../art/WeatherArt";
import { AP } from "../../constants/Palette";
import { darkness, Storm, storms } from "../../../../shared/Weather";
import { isTown } from "../../../../shared/Places";
import { Loop } from "../../utils/Loop";
import { Sound } from "../../utils/Sound";
import { townBusy } from "./MapLife";
import type { Map as WorldMap } from "./Map";

// Day and night, and rain, on the map (shared/Weather): over the land, places
// and heroes, the storms - the shadow of each cloud, rain falling out of it
// and splashing (only those in view, at most DROPS_MOST drops) - then the
// light of the time of day multiplied over the lot, then, at night, the
// towns' windows and resting heroes' campfires glowing through it. The rain
// heard (rain.wav) as loud as the view's rained on and as near as it's
// zoomed, and from the side of the view it's raining on (panned), fading to
// it.
export class MapWeather {

    public static DENSITY = 1 / 900;    // drops a map px² of a storm at its hardest
    public static DROPS_MOST = 1500;
    public static FALL = 140;           // map px a second a drop falls
    public static DROP_MS = [180, 380]; // a drop's fall
    public static SPLASH_MS = 120;
    public static WIND = 0.35;          // map px across for every one down
    public static SNOW_PACE = 0.25;     // in Winter, snow: falling this much as quick, lasting as much longer, quiet
    public static CLOUD_ALPHA = 0.3;
    public static LAMP_ALPHA = 0.55;    // a town's glow at the dead of night
    public static FIRE_ALPHA = 0.6;     // a campfire's
    public static RAIN_ZOOM = [0, 0.15, 0.5, 0.8, 1];  // the rain's loudness at each of Camera.ZOOM_LEVELS (none at the farthest)
    public static RAIN_VOLUME = 0.6;    // at its loudest
    public static RAIN_FADE = 0.4;      // volume a second it fades by
    public static RAIN_PAN = 0.8;       // how far to one side it's heard, raining only at the view's edge
    public static RAIN_PAN_RATE = 1.5;  // pan a second it moves by

    private map: WorldMap;
    private clouds: PIXI.Container;
    private cloudOf: { [storm: number]: PIXI.Sprite } = {};
    private drops: PIXI.ParticleContainer;
    private pool: { sprite: PIXI.Sprite, x: number, y: number, age: number, life: number }[] = [];
    private shade: PIXI.Sprite;
    public lights: PIXI.Container;      // (Map puts the campfires' in)
    private lamps: PIXI.Sprite[] = [];
    private rain = new Loop("rain.ogg", MapWeather.RAIN_FADE, MapWeather.RAIN_PAN_RATE);
    public rained = 0;                  // how much of the view's under rain, 0 to 1 (updateDrops; MapSounds' thunder too)
    public rainPan = 0;                 // where across the view it's raining, -1 (left) to 1 (right) (updateDrops)

    constructor(map: WorldMap) {
        this.map = map;
        this.clouds = new PIXI.Container();
        this.drops = new PIXI.ParticleContainer(MapWeather.DROPS_MOST, { position: true, alpha: true, uvs: true });
        this.shade = new PIXI.Sprite(PIXI.Texture.WHITE);
        this.shade.width = map.width;
        this.shade.height = map.height;
        this.shade.blendMode = PIXI.BLEND_MODES.MULTIPLY;
        this.lights = new PIXI.Container();
        for (const c of [this.clouds, this.drops, this.shade, this.lights]) c.eventMode = "none";

        // a glow over each town (its windows lit)
        const tile = map.world.tile;
        for (const place of map.world.places) if (isTown(place)) {
            const lamp = this.glow(AP.STRAW);
            lamp.position.set((place.x + 0.5) * tile, (place.y + 1) * tile - map.world.placeSize / 3);
            this.lamps.push(lamp);
        }
    }

    // its layers, in order (between the heroes and the place names)
    public layers() {
        return [this.clouds, this.drops, this.shade, this.lights];
    }

    // a glow to put in lights
    public glow(tint: number) {
        const g = new PIXI.Sprite(glowTexture());
        g.anchor.set(0.5);
        g.tint = tint;
        g.blendMode = PIXI.BLEND_MODES.ADD;
        this.lights.addChild(g);
        return g;
    }

    public update(deltaTime: number) {
        const now = Date.now(), dark = darkness(now), under = storms(now);
        this.shade.tint = lightTint(now);
        this.lights.visible = dark > 0;
        // (windows dimming as the night gets late, lit again before dawn: MapLife townBusy)
        const lit = Math.min(1, 0.45 + 0.35 * townBusy(now));
        for (const lamp of this.lamps) lamp.alpha = MapWeather.LAMP_ALPHA * dark * lit;
        this.updateClouds(under);
        this.updateDrops(under, deltaTime);
        this.updateRain(deltaTime);
    }

    // the rain's sound fading to how loud it should be (Loop)
    private updateRain(deltaTime: number) {
        const want = snowing(Date.now()) ? 0 : MapWeather.RAIN_VOLUME * this.rained * (MapWeather.RAIN_ZOOM[this.map.camera.zoomIndex] ?? 1) * Sound.effects();
        this.rain.update(want, this.rainPan, deltaTime);
    }

    // a fire's glow, as dark as it is
    public static fireAlpha() {
        return MapWeather.FIRE_ALPHA * darkness(Date.now());
    }

    private updateClouds(under: Storm[]) {
        const seen = new Set<number>();
        for (const s of under) {
            seen.add(s.id);
            let c = this.cloudOf[s.id];
            if (!c) {
                c = this.cloudOf[s.id] = new PIXI.Sprite(cloudTexture());
                c.anchor.set(0.5);
                c.tint = AP.NAVY;
                this.clouds.addChild(c);
            }
            c.position.set(s.x, s.y);
            c.width = c.height = s.r * 2.3;
            c.alpha = MapWeather.CLOUD_ALPHA * s.strength;
        }
        for (const id in this.cloudOf) if (!seen.has(+id)) {
            this.cloudOf[id].destroy();
            delete this.cloudOf[id];
        }
    }

    // the map in view (map px), a little over
    private view() {
        const cam = this.map.camera, zoom = cam.getZoom(), more = 32;
        return new PIXI.Rectangle(cam.scrollX / zoom - more, cam.scrollY / zoom - more, window.innerWidth / zoom + more * 2, window.innerHeight / zoom + more * 2);
    }

    // how many drops there should be: by the storms in view, how big and hard
    // they're raining (each weighed for picking one to fall from); and where
    // across the view it's raining, by the middle of each one's part in view
    // weighed the same
    private updateDrops(under: Storm[], deltaTime: number) {
        const view = this.view();
        const seen = under.filter((s) => s.x + s.r > view.x && s.x - s.r < view.right && s.y + s.r > view.y && s.y - s.r < view.bottom);
        let across = 0;
        const weights = seen.map((s) => {
            // only the part of it in view
            const left = Math.max(s.x - s.r, view.x), right = Math.min(s.x + s.r, view.right);
            const w = Math.max(0, right - left);
            const h = Math.max(0, Math.min(s.y + s.r, view.bottom) - Math.max(s.y - s.r, view.y));
            const weight = Math.min(w * h, Math.PI * s.r * s.r) * s.strength * MapWeather.DENSITY;
            across += weight * ((left + right) / 2 - view.x - view.width / 2) / (view.width / 2);
            return weight;
        });
        const total = weights.reduce((a, b) => a + b, 0);
        if (total) this.rainPan = Math.max(-1, Math.min(1, across / total)) * MapWeather.RAIN_PAN;
        this.rained = Math.min(1, total / MapWeather.DENSITY / (view.width * view.height));
        const want = Math.min(MapWeather.DROPS_MOST, Math.round(total));
        while (this.pool.length < want) {
            const sprite = new PIXI.Sprite(dropTexture());
            this.drops.addChild(sprite);
            this.pool.push({ sprite, x: 0, y: 0, age: Infinity, life: -1 });
        }
        while (this.pool.length > want) this.pool.pop().sprite.destroy();

        const snow = snowing(Date.now()), fall = MapWeather.FALL * (snow ? MapWeather.SNOW_PACE : 1), splashMs = MapWeather.SPLASH_MS * (snow ? 4 : 1);
        for (const d of this.pool) {
            d.age += deltaTime * (snow ? MapWeather.SNOW_PACE : 1);
            if (d.age >= d.life + splashMs && !this.respawn(d, seen, weights, total, view)) { d.sprite.alpha = 0; continue; }
            if (d.age < d.life) {
                // falling to where it'll land (x, y)
                const up = (d.life - d.age) * fall / 1000;
                d.sprite.texture = snow ? flakeTexture() : dropTexture();
                const across = snow ? Math.sin(d.age / 300 + d.x) * 2 : -up * MapWeather.WIND;
                d.sprite.position.set(Math.round(d.x + across), Math.round(d.y - up) - 4);
                d.sprite.alpha = 1;
            } else if (snow) {
                // (come to rest, melting away)
                d.sprite.texture = flakeTexture();
                d.sprite.position.set(d.x, d.y - 1);
                d.sprite.alpha = 1 - (d.age - d.life) / splashMs;
            } else {
                d.sprite.texture = splashTexture();
                d.sprite.position.set(d.x - 1, d.y - 1);
            }
        }
    }

    // a new drop, from a storm in view picked by weight, somewhere under it
    // (thinner out towards its edge)
    private respawn(d: MapWeather["pool"][number], seen: Storm[], weights: number[], total: number, view: PIXI.Rectangle) {
        if (!total) return false;
        for (let tries = 0; tries < 6; tries++) {
            let pick = Math.random() * total, i = 0;
            while (i < seen.length - 1 && pick >= weights[i]) pick -= weights[i++];
            const s = seen[i], a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * s.r;
            const x = s.x + Math.cos(a) * r, y = s.y + Math.sin(a) * r;
            if (!view.contains(x, y) || x < 0 || y < 0 || x >= this.map.width || y >= this.map.height) continue;
            if (r / s.r > 0.65 && Math.random() > (1 - r / s.r) / 0.35) continue;
            const fresh = d.life < 0;
            d.x = Math.round(x); d.y = Math.round(y);
            d.life = MapWeather.DROP_MS[0] + Math.random() * (MapWeather.DROP_MS[1] - MapWeather.DROP_MS[0]);
            // new ones part way down already, so they don't all fall at once
            d.age = fresh ? Math.random() * d.life : 0;
            d.sprite.alpha = 1;
            return true;
        }
        return false;
    }

}
