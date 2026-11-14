import * as PIXI from "pixi.js";
import { EventKind, isLive } from "../../../../shared/Events";
import { busyLevel, isDungeon, isTown, WorldPlace } from "../../../../shared/Places";
import { seasonName } from "../../../../shared/Seasons";
import { darkness } from "../../../../shared/Weather";
import { embersTexture, stallTexture, tentTexture } from "../../art/EventSiteArt";
import { COATS, monumentTexture, speckTexture, walkerTexture } from "../../art/LifeArt";
import { cloudTexture } from "../../art/WeatherArt";
import { AP } from "../../constants/Palette";
import { Event } from "../../constants/Events";
import { IBC } from "../../Engine";
import { Hint } from "../../shared/ui/Hint";
import type { MapLife } from "./MapLife";
import { walkAt } from "./Wander";

// What the map says about the world (the user, 2026-10-31, from the first
// list of ideas: "busy places, event progress and leaderboard monuments"):
//   Busy places look busy: by how many heroes are there now, anyone's
//     (S2C.EVENT_BUSY, shared/Places busyLevel), a town gets market stalls
//     and folk about them; anywhere else a camp of tents, campfires and
//     adventurers. (Not while an event's on there: its own scene is: EventSites.)
//     Pointing at the place says how many (Map's label).
//   A world boss's shadow looms over its dungeon while it stands, red eyes
//     in it, shrinking as it's worn down. (The rest of an event's progress
//     is EventSites'.)
//   The last season's champions stand as monuments in the three start
//     towns: the first in gold in Rockbarrow, the second in silver in
//     Luminmoor, the third in bronze in Gullhaven (SeasonState.m); before
//     any season's over, their plinths wait. Pointing at one names them.

const TILE = 16;
const MONUMENT_TOWNS = ["Rockbarrow", "Luminmoor", "Gullhaven"];
const PLACES_OF_RANK = ["first", "second", "third"];

// where a busy place's things go round it (from its sprite's bottom middle), in turn
const SPOTS = [[-24, 7], [24, 7], [-12, 16], [12, 17], [0, 24], [-34, 0], [34, 0], [-26, 22], [26, 22]];

interface Busy { level: number; parts: PIXI.DisplayObject[]; folk: { sprite: PIXI.Sprite; seed: number; home: { x: number; y: number; s: number }; coat: number }[]; fires: { sprite: PIXI.Sprite; glow: PIXI.Sprite; seed: number }[]; }
interface Shadow { id: number; cloud: PIXI.Sprite; eyes: PIXI.Sprite[]; glows: PIXI.Sprite[]; x: number; y: number; f: number; }

export class MapLandmarks {

    public static CHECK_MS = 1000;
    public static STALLS = [0, 1, 2, 3];        // at a town, by how busy
    public static TOWN_FOLK = [0, 2, 4, 7];
    public static TENTS = [0, 1, 2, 3];         // anywhere else
    public static FIRES = [0, 0, 1, 2];
    public static CAMP_FOLK = [0, 1, 2, 4];

    public container = new PIXI.Container();
    private busy = new Map<number, Busy>();
    private shadows: Shadow[] = [];
    private monuments: PIXI.Sprite[] = [];
    private checkAt = 0;
    private time = 0;

    constructor(private life: MapLife) {
        this.container.eventMode = "passive";
        this.container.sortableChildren = true;
        this.drawMonuments();
        IBC.events.register(Event.SEASON, () => this.drawMonuments(), this);
    }

    private foot(p: WorldPlace) {
        return { x: (p.x + 0.5) * TILE, y: (p.y + 1) * TILE + 4 };
    }

    private put(t: PIXI.Texture, x: number, y: number, parts: PIXI.DisplayObject[]) {
        const s = new PIXI.Sprite(t);
        s.anchor.set(0.5, 1);
        s.eventMode = "none";
        s.position.set(Math.round(x), Math.round(y));
        s.zIndex = y;
        this.container.addChild(s);
        parts.push(s);
        return s;
    }

    //#region busy places

    private checkBusy() {
        const live = new Set(IBC.data.events.list.filter((e) => isLive(e, Date.now())).map((e) => e.p));
        for (const p of this.life.places) {
            const level = live.has(p.i) ? 0 : busyLevel(IBC.data.events.busy.get(p.i) ?? 0);
            const was = this.busy.get(p.i);
            if ((was?.level ?? 0) == level) continue;
            if (was) { for (const part of was.parts) part.destroy(); for (const f of was.fires) f.glow.destroy(); }
            this.busy.delete(p.i);
            if (level) this.busy.set(p.i, this.drawBusy(p, level));
        }
    }

    private drawBusy(p: WorldPlace, level: number): Busy {
        const b: Busy = { level, parts: [], folk: [], fires: [] }, { x: cx, y: bottom } = this.foot(p), town = isTown(p);
        const spots = SPOTS.map(([dx, dy]) => ({ x: cx + dx, y: bottom + dy })).filter((s) => this.life.at(s.x, s.y) != 0 && this.life.at(s.x - 5, s.y) != 0 && this.life.at(s.x + 5, s.y) != 0);
        let k = 0;
        const next = () => spots[k++ % Math.max(1, spots.length)];
        if (!spots.length) return b;
        if (town) {
            const colours = [AP.RED, AP.SKY, AP.LIME, AP.AMBER, AP.ORCHID];
            for (let j = 0; j < MapLandmarks.STALLS[level]; j++) { const s = next(); this.put(stallTexture(colours[(p.i + j) % colours.length]), s.x, s.y, b.parts); }
        } else {
            // a camp: plain tents (a dungeon's adventurers' darker), their fires
            const colours = isDungeon(p) ? [AP.RUST, AP.UMBER, AP.OXBLOOD] : [AP.TAN, AP.CLAY, AP.OCHRE];
            for (let j = 0; j < MapLandmarks.TENTS[level]; j++) { const s = next(); this.put(tentTexture(colours[(p.i + j) % colours.length]), s.x, s.y, b.parts); }
            for (let j = 0; j < MapLandmarks.FIRES[level]; j++) {
                const s = next(), sprite = this.put(embersTexture(0), s.x, s.y, b.parts), glow = this.life.glow(AP.AMBER, 0.3);
                glow.position.set(s.x, s.y - 2);
                b.fires.push({ sprite, glow, seed: p.i * 5 + j });
            }
        }
        const folk = (town ? MapLandmarks.TOWN_FOLK : MapLandmarks.CAMP_FOLK)[level];
        for (let j = 0; j < folk; j++) {
            const sprite = this.put(walkerTexture(0, 0), cx, bottom, b.parts);
            b.folk.push({ sprite, seed: p.i * 31 + j * 7, home: { x: cx, y: bottom + 14, s: 16 }, coat: (p.i + j) % COATS.length });
        }
        return b;
    }

    //#endregion

    //#region a world boss's shadow

    private checkShadows() {
        const now = Date.now(), want = IBC.data.events.list.filter((e) => e.k == EventKind.BOSS && e.w != 1 && isLive(e, now));
        for (const s of this.shadows.slice()) if (!want.some((e) => e.i == s.id)) {
            s.cloud.destroy(); for (const e of s.eyes) e.destroy(); for (const g of s.glows) g.destroy();
            this.shadows.splice(this.shadows.indexOf(s), 1);
        }
        for (const e of want) {
            const f = Math.max(0, Math.min(1, e.d / Math.max(1, e.g)));
            let s = this.shadows.find((x) => x.id == e.i);
            if (!s) {
                const p = this.life.places.find((x) => x.i == e.p);
                if (!p) continue;
                const { x, y } = this.foot(p);
                const cloud = new PIXI.Sprite(cloudTexture());
                cloud.anchor.set(0.5); cloud.tint = AP.BLACK; cloud.eventMode = "none"; cloud.zIndex = -5;
                this.container.addChild(cloud);
                const eyes = [-3, 3].map(() => { const eye = new PIXI.Sprite(speckTexture()); eye.anchor.set(0.5); eye.tint = AP.RED; eye.eventMode = "none"; eye.zIndex = -4; this.container.addChild(eye); return eye; });
                const glows = [-3, 3].map(() => this.life.glow(AP.RED, 0.08));
                s = { id: e.i, cloud, eyes, glows, x, y: y - 20, f };
                this.shadows.push(s);
            }
            s.f = f;
        }
    }

    private updateShadows(now: number, dark: number, view: PIXI.Rectangle) {
        for (const s of this.shadows) {
            const seen = view.contains(s.x, s.y);
            s.cloud.visible = seen;
            s.eyes.forEach((e) => e.visible = seen);
            s.glows.forEach((g) => g.visible = seen);
            if (!seen) continue;
            // (worn down, smaller and fainter)
            const size = 96 * (1 - s.f * 0.55) * (1 + 0.05 * Math.sin(now / 1400));
            s.cloud.position.set(s.x, s.y);
            s.cloud.width = size; s.cloud.height = size * 0.7;
            s.cloud.alpha = 0.42 * (1 - s.f * 0.6);
            // its eyes peering out beside the place, blinking now and then (over it, the event's bubble)
            const blink = (now % 5200) < 160 ? 0 : 1, glare = (0.7 + 0.3 * Math.sin(now / 300)) * blink * (1 - s.f * 0.5);
            s.eyes.forEach((e, k) => { e.position.set(Math.round(s.x + 24 + (k ? 3 : -3)), Math.round(s.y - 4)); e.alpha = glare; e.scale.set(2); });
            s.glows.forEach((g, k) => { g.position.set(s.x + 24 + (k ? 3 : -3), s.y - 4); g.alpha = glare * dark; });
        }
    }

    //#endregion

    //#region the season's champions

    private drawMonuments() {
        for (const m of this.monuments) m.destroy();
        this.monuments = [];
        const state = IBC.data.season.state, last = state.m, now = seasonName(state.n);
        MONUMENT_TOWNS.forEach((name, rank) => {
            const p = this.life.places.find((x) => x.n == name);
            if (!p) return;
            const { x: cx, y: bottom } = this.foot(p);
            // to one side below the town, on land
            const spot = [[-44, 4], [44, 4], [-42, -8], [42, -8]].map(([dx, dy]) => ({ x: cx + dx, y: bottom + dy })).find((s) => this.life.at(s.x, s.y) != 0) ?? { x: cx - 44, y: bottom + 4 };
            const who = last?.[1]?.[rank];
            const s = new PIXI.Sprite(monumentTexture(who ? rank : -1));
            s.anchor.set(0.5, 1);
            s.position.set(Math.round(spot.x), Math.round(spot.y));
            s.zIndex = spot.y;
            s.eventMode = "static";
            s.cursor = "help";
            Hint.on(s, who
                ? `${seasonName(last[0])}'s ${PLACES_OF_RANK[rank]}: ${who}\nThe season's champions stand here till the next one's over`
                : `A plinth for ${PLACES_OF_RANK[rank]} place on the season's board\n${now}'s will stand here once it's over`);
            this.container.addChild(s);
            this.monuments.push(s);
        });
    }

    //#endregion

    public update(deltaTime: number) {
        this.time += deltaTime;
        if ((this.checkAt -= deltaTime) <= 0) {
            this.checkAt = MapLandmarks.CHECK_MS;
            this.checkBusy();
            this.checkShadows();
        }
        const now = Date.now(), dark = darkness(now), view = this.life.view(), step = Math.floor(this.time / 220) % 2;
        for (const b of Array.from(this.busy.values())) {
            for (const f of b.folk) {
                // (indoors, or in their tents, at night)
                const seen = dark < 0.6 && view.contains(f.home.x, f.home.y);
                f.sprite.visible = seen;
                if (!seen) continue;
                const s = walkAt(f.seed, f.home as any, now * 0.8);
                f.sprite.texture = walkerTexture(f.coat, s.walking ? step : 0);
                f.sprite.position.set(Math.round(s.x), Math.round(s.y));
                f.sprite.zIndex = s.y;
                f.sprite.alpha = Math.min(1, (0.6 - dark) * 3);
                if (s.face) f.sprite.scale.x = s.face < 0 ? -1 : 1;
            }
            for (const f of b.fires) {
                f.sprite.texture = embersTexture(Math.floor(now / 200 + f.seed) % 2);
                f.glow.alpha = 0.6 * dark * (0.85 + 0.15 * Math.sin(now / 90 + f.seed));
            }
        }
        this.updateShadows(now, dark, view);
    }

}
