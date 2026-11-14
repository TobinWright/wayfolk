import * as PIXI from "pixi.js";
import { kindOf } from "../../../../shared/Places";
import { worldSeasonAt, SeasonKind } from "../../../../shared/Seasons";
import { darkness, rainAt, storms } from "../../../../shared/Weather";
import { hash } from "../../art/Backdrops";
import {
    emberTexture, fieldTexture, sailsTexture, SAILS_Y, speckTexture, wakeTexture, windmillTexture,
} from "../../art/LifeArt";
import { cloudTexture } from "../../art/WeatherArt";
import { AP } from "../../constants/Palette";
import type { Map as WorldMap } from "./Map";
import { F, MapLife } from "./MapLife";

// The land moving (the user, 2026-10-31: "land that moves", the second list
// of ideas), only for looks:
//   Waves breaking along the shore, where you're looking.
//   The wind: gusts rippling over the grass and woods under a storm, the
//     windmills' sails turning faster in it.
//   Lava: embers glowing in the cracks of the ash lands, and lava creeping
//     down the volcano from its crater.
//   Windmills at the farms, sails turning.
//   The farms' fields through the year: sown and sprouting in Spring, ripe
//     wheat in Summer, stubble in Autumn, under snow in Winter.
// (Waterfalls and water wheels were here too, taken out: the user didn't like
// their looks.)

const TILE = 16, WATER = 0, ASHEN = 5;

export class MapLand {

    public static EMBERS = 0.35;            // of the ash lands' tiles with an ember
    public static WIND = { x: 1, y: 0.15 }; // the way the wind mostly blows (from the west, as the storms: shared/Weather)

    private mills: { tower: PIXI.Sprite; sails: PIXI.Sprite; x: number; y: number; seed: number; turned: number }[] = [];
    private fields: { sprite: PIXI.Sprite; x: number; y: number }[] = [];
    private embers: { sprite: PIXI.Sprite; glow: PIXI.Sprite; x: number; y: number; seed: number }[] = [];
    private crater: { x: number; y: number } = null;
    private spawnAt = 0;
    private time = 0;

    constructor(private map: WorldMap, private life: MapLife) {
        this.makeTowns();
        this.makeEmbers();
    }

    private tile(x: number, y: number) {
        const { w, h, terrain } = this.life;
        return x < 0 || y < 0 || x >= w || y >= h ? WATER : terrain[y * w + x];
    }

    // windmills and fields
    private makeTowns() {
        const season = worldSeasonAt(Date.now()).k;
        for (const p of this.life.places) {
            const kind = kindOf(p), cx = (p.x + 0.5) * TILE, bottom = (p.y + 1) * TILE + 4;
            if (kind != "farm" && kind != "village") continue;
            // a windmill at a farm
            if (kind == "farm") for (const side of [1, -1]) {
                const x = cx + side * 15, y = bottom - 1;
                if (this.life.at(x, y) == WATER) continue;
                const tower = this.life.sprite(windmillTexture(), this.life.ground, 0.5, 1);
                const sails = this.life.sprite(sailsTexture(0), this.life.ground, 0.5, 0.5);
                tower.position.set(Math.round(x), Math.round(y)); tower.zIndex = y;
                sails.position.set(Math.round(x), Math.round(y) - SAILS_Y); sails.zIndex = y + 0.5;
                this.mills.push({ tower, sails, x, y, seed: p.i, turned: 0 });
                break;
            }
            // fields below it (two at a farm, one at a village)
            const spots = [[-9, 13], [8, 15], [-20, 6], [20, 8]];
            let n = kind == "farm" ? 2 : 1;
            for (const [dx, dy] of spots) {
                if (!n) break;
                const x = cx + dx, y = bottom + dy;
                if ([[-7, -4], [7, -4], [-7, 4], [7, 4]].some(([ox, oy]) => this.life.at(x + ox, y + oy) == WATER)) continue;
                const s = this.life.sprite(fieldTexture(season), this.life.ground, 0.5, 0.5);
                s.position.set(Math.round(x), Math.round(y));
                s.zIndex = -2;
                this.fields.push({ sprite: s, x, y });
                n--;
            }
        }
    }

    // embers in the ash lands' cracks, and the volcano's crater
    private makeEmbers() {
        const { w, terrain } = this.life;
        for (let k = 0; k < terrain.length; k++) {
            if (terrain[k] != ASHEN || hash(k, 901) > MapLand.EMBERS) continue;
            const x = (k % w) * TILE + 2 + Math.floor(hash(k, 902) * 12), y = Math.floor(k / w) * TILE + 2 + Math.floor(hash(k, 903) * 12);
            const sprite = this.life.sprite(emberTexture(), this.life.ground, 0.5, 0.5);
            sprite.position.set(x, y);
            sprite.zIndex = -1;
            const glow = this.life.glow(AP.FLAME, 0.12);
            glow.position.set(x, y);
            this.embers.push({ sprite, glow, x, y, seed: k });
        }
        const v = this.life.places.find((p) => kindOf(p) == "volcano");
        if (v) this.crater = { x: (v.x + 0.5) * TILE, y: (v.y + 1) * TILE + 4 - 26 };
    }

    public update(deltaTime: number) {
        this.time += deltaTime;
        const now = Date.now(), dark = darkness(now), view = this.life.view(), season = worldSeasonAt(now).k;

        // windmills: quicker in a storm, slow on a still night
        for (const m of this.mills) {
            const seen = view.contains(m.x, m.y);
            m.tower.visible = m.sails.visible = seen;
            if (!seen) continue;
            const wind = 0.6 + 0.4 * Math.sin(now / 90000 + m.seed) + rainAt(m.x, m.y, now) * 2.5;
            m.turned += deltaTime / 1000 * wind * 2.5;
            m.sails.texture = sailsTexture(Math.floor(m.turned) % 2);
        }
        // the fields in the season
        const field = fieldTexture(season);
        for (const f of this.fields) {
            f.sprite.visible = view.contains(f.x, f.y);
            if (f.sprite.visible) f.sprite.texture = field;
        }
        // embers pulsing (by night their glow too)
        for (const e of this.embers) {
            const seen = view.contains(e.x, e.y);
            e.sprite.visible = seen;
            e.glow.visible = seen && dark > 0;
            if (!seen) continue;
            const pulse = 0.5 + 0.5 * Math.sin(now / (500 + hash(e.seed, 7) * 900) + e.seed);
            e.sprite.alpha = 0.35 + 0.65 * pulse;
            e.glow.alpha = 0.5 * dark * pulse;
        }

        this.spawnAt += deltaTime;
        if (!this.life.close) { this.spawnAt = 0; return; }
        while (this.spawnAt >= 100) {
            this.spawnAt -= 100;
            this.spawn(now, view);
        }
    }

    // a tenth of a second's worth: waves, gusts and lava
    private spawn(now: number, view: PIXI.Rectangle) {
        const R = Math.random, life = this.life;
        // waves breaking on the shore: a line of foam washing up and fading
        for (let j = 0; j < 3; j++) {
            const x = view.x + R() * view.width, y = view.y + R() * view.height;
            if (life.at(x, y) != WATER || life.shoreAt(x, y) != 1) continue;
            // (towards the land beside it)
            const i = Math.floor(x / TILE), k = Math.floor(y / TILE);
            const to = [[1, 0], [-1, 0], [0, 1], [0, -1]].find(([dx, dy]) => this.tile(i + dx, k + dy) != WATER);
            if (!to) continue;
            const p = life.fleck(wakeTexture(), F.FADE, x, y, to[0] * 4, to[1] * 4, 1600 + R() * 600, AP.WHITE, life.sea);
            if (p) { p.a = 0.75; if (to[1]) p.sprite.rotation = 0; else p.sprite.rotation = Math.PI / 2; }
        }
        // gusts over the land under a storm
        if (storms(now).length) for (let j = 0; j < 2; j++) {
            const x = view.x + R() * view.width, y = view.y + R() * view.height;
            if (life.at(x, y) == WATER) continue;
            const rain = rainAt(x, y, now);
            if (rain < 0.15 || R() > rain) continue;
            const speed = 40 + R() * 20, p = life.fleck(cloudTexture(), F.FADE, x, y, MapLand.WIND.x * speed, MapLand.WIND.y * speed, 1400 + R() * 800, AP.PALE);
            if (p) { p.a = 0.14; p.sprite.width = 40 + R() * 30; p.sprite.height = 3; p.sprite.rotation = Math.atan2(MapLand.WIND.y, MapLand.WIND.x); }
        }
        // lava creeping down the volcano from its crater
        const c = this.crater;
        if (c && view.contains(c.x, c.y) && R() < 0.35) {
            const side = R() < 0.5 ? -1 : 1;
            const p = life.fleck(speckTexture(), F.STREAK, c.x + side * (1 + R() * 2), c.y + 1, side * (1.5 + R() * 1.5), 4 + R() * 2, 2600 + R() * 1200, R() < 0.6 ? AP.FLAME : AP.EMBER, life.ground);
            if (p) { p.a = 1; p.sprite.zIndex = 1e6; }
        }
    }

}
