import * as PIXI from "pixi.js";
import { EventKind, EventView, eventStage, isLive } from "../../../../shared/Events";
import { kindOf, WorldPlace } from "../../../../shared/Places";
import { hash } from "../../art/Backdrops";
import {
    bannerTexture, blightTexture, BUILD_STEPS, buildingTexture, embersTexture, flagTexture, flowersTexture, rubbleTexture, saplingTexture,
    siltTexture, stallTexture, statueTexture, stumpTexture, tentTexture,
} from "../../art/EventSiteArt";
import { COATS, walkerTexture } from "../../art/LifeArt";
import { AP } from "../../constants/Palette";
import { IBC } from "../../Engine";
import { walkAt } from "./Wander";

// Events you can see happen (the user, 2026-10-31), round the place each is
// at, only for looks:
//   On: a Rebuild's rubble cleared bit by bit through its first stage, then
//     its building rising in scaffolding; an Upgrade's going up from the
//     start; a Restoring's mess (a cave-in's rubble, a silted spring's silt,
//     burnt stumps, blight) cleared a piece at a time; a festival's fair -
//     tents, flags and a crowd, more of each the further it's got.
//   Won, for as long as its boon lasts: a boss beaten, a banner; a Rebuild,
//     the building done and a new statue; an Upgrade, the building done and
//     a busier market; a Restoring, flowers (saplings where the stumps were);
//     a festival's bunting stays up (MapLife).
//   A marching boss reached its town: rubble and fires, while the bane lasts.
// Drawn again when what's to show changes (checked every second); the flags,
// fires and crowd move every frame.

const TILE = 16;

interface Walker { sprite: PIXI.Sprite; seed: number; home: { x: number; y: number; s: number }; coat: number; }
interface Waver { sprite: PIXI.Sprite; frames: (f: number) => PIXI.Texture; phase: number; ms: number; }

export class EventSites {

    public static CHECK_MS = 1000;
    public static MESS = 8;             // a Restoring's bits of mess
    public static RUBBLE = 5;           // a Rebuild's piles, cleared through its first stage
    public static TENTS = [2, 5];       // a fair's, starting and at its end
    public static CROWD = [3, 10];
    public static MARKET_CROWD = 5;
    public static WAVE_MS = 450;

    public container = new PIXI.Container();
    private walkers: Walker[] = [];
    private wavers: Waver[] = [];
    private drawn = "";
    private since = 0;

    // (landAt: whether a map px is on land)
    constructor(private places: WorldPlace[], private landAt: (x: number, y: number) => boolean) {
        this.container.eventMode = "none";
        this.container.sortableChildren = true;
    }

    // the events with something to show: on, won with its boon on, or a town laid waste
    private showing(now: number) {
        return IBC.data.events.list.filter((e) => isLive(e, now) || (e.w == 1 || e.w == 3) && (e.u ?? 0) > now);
    }

    // how far along it's got, 0-1
    private static along(e: EventView) {
        return e.w == 1 ? 1 : Math.max(0, Math.min(1, e.d / Math.max(1, e.g)));
    }

    // what's drawn for it, so it's drawn again only when that changes
    private look(e: EventView) {
        const f = EventSites.along(e);
        switch (e.k) {
            case EventKind.REBUILD: case EventKind.UPGRADE: return Math.floor(f * BUILD_STEPS * 3);
            case EventKind.RESTORE: return Math.ceil(EventSites.MESS * (1 - f));
            case EventKind.FESTIVAL: return Math.round(f * 20);
            default: return 0;
        }
    }

    private key(now: number) {
        return JSON.stringify(this.showing(now).map((e) => [e.i, e.p, e.w, this.look(e)]));
    }

    public update(deltaTime: number) {
        const now = Date.now();
        this.since += deltaTime;
        if (this.since >= EventSites.CHECK_MS) {
            this.since = 0;
            const key = this.key(now);
            if (key != this.drawn) this.draw(now, key);
        }
        const step = Math.floor(now / 220) % 2;
        for (const w of this.walkers) {
            const s = walkAt(w.seed, w.home as any, now);
            w.sprite.texture = walkerTexture(w.coat, s.walking ? step : 0);
            w.sprite.position.set(Math.round(s.x), Math.round(s.y));
            w.sprite.zIndex = s.y;
            if (s.face) w.sprite.scale.x = s.face < 0 ? -1 : 1;
        }
        for (const v of this.wavers) v.sprite.texture = v.frames(Math.floor((now + v.phase) / v.ms) % 2);
    }

    private draw(now: number, key: string) {
        this.drawn = key;
        for (const c of [...this.container.children]) c.destroy();
        this.walkers = [];
        this.wavers = [];
        for (const e of this.showing(now)) {
            const p = this.places.find((x) => x.i == e.p);
            if (p) this.site(e, p);
        }
    }

    private sprite(t: PIXI.Texture, x: number, y: number, tint = 0xffffff) {
        const s = new PIXI.Sprite(t);
        s.anchor.set(0.5, 1);
        s.tint = tint;
        s.position.set(Math.round(x), Math.round(y));
        s.zIndex = y;
        this.container.addChild(s);
        return s;
    }

    // a spot near (x, y) on land: as it is, or flipped to the other side, or nudged in (null: none)
    private land(cx: number, x: number, y: number) {
        for (const [px, py] of [[x, y], [2 * cx - x, y], [cx + (x - cx) * 0.6, y - 4], [2 * cx - (cx + (x - cx) * 0.6), y - 4]])
            if (this.landAt(px, py) && this.landAt(px - 4, py) && this.landAt(px + 4, py)) return { x: px, y: py };
        return null;
    }

    private site(e: EventView, p: WorldPlace) {
        const cx = (p.x + 0.5) * TILE, bottom = (p.y + 1) * TILE + 4, f = EventSites.along(e), won = e.w == 1;
        const put = (t: PIXI.Texture, x: number, y: number, tint?: number) => {
            const at = this.land(cx, x, y);
            return at ? this.sprite(t, at.x, at.y, tint) : null;
        };
        const wave = (s: PIXI.Sprite, frames: (f: number) => PIXI.Texture, seed: number) => {
            if (s) this.wavers.push({ sprite: s, frames, phase: hash(seed, 41) * 1000, ms: EventSites.WAVE_MS + hash(seed, 43) * 150 });
        };
        // spots round the place, the same for the same event: a ring `rx` by `ry` past its middle
        const ring = (k: number, n: number, rx: number, ry: number): [number, number] => {
            const a = (k + 0.3 + hash(e.i * 13 + k, 7) * 0.4) / n * Math.PI * 2, d = 0.8 + hash(e.i * 13 + k, 9) * 0.3;
            return [cx + Math.cos(a) * rx * d, bottom - 2 + Math.sin(a) * ry * d];
        };

        // a marching boss reached it: rubble and fires
        if (e.w == 3) {
            for (let k = 0; k < 6; k++) { const [x, y] = ring(k, 6, 30, 14); put(rubbleTexture(k), x, y); }
            for (let k = 0; k < 3; k++) { const [x, y] = ring(k * 2 + 1, 6, 22, 10); wave(put(embersTexture(0), x, y), embersTexture, e.i + k); }
            return;
        }

        switch (e.k) {
            case EventKind.BOSS: case EventKind.MARCH:
                if (won) wave(put(bannerTexture(0), cx + 22, bottom - 1), bannerTexture, e.i);
                return;

            case EventKind.REBUILD: case EventKind.UPGRADE: {
                // (a Rebuild: its rubble cleared through the first stage, and the building after; an Upgrade's from the start)
                const rebuild = e.k == EventKind.REBUILD, first = rebuild && !won && eventStage(e) == 0;
                const build = rebuild ? Math.max(0, (f - 1 / 3) / (2 / 3)) : f;
                if (rebuild && !won) {
                    const left = Math.ceil(EventSites.RUBBLE * (1 - f * 3));
                    for (let k = 0; k < left; k++) { const [x, y] = ring(k, EventSites.RUBBLE, 30, 13); put(rubbleTexture(k), x, y); }
                }
                if (!first) put(buildingTexture(Math.floor(build * BUILD_STEPS)), cx + 30, bottom - 1);
                if (!won) return;
                if (rebuild) put(statueTexture(), cx - 26, bottom + 3);
                else {
                    // a busier market: stalls below the town, folk about them
                    const colours = [AP.RED, AP.SKY, AP.LIME, AP.AMBER];
                    [[-26, 22], [0, 27], [26, 22]].forEach(([dx, dy], k) => put(stallTexture(colours[(e.i + k) % colours.length]), cx + dx, bottom + dy));
                    this.crowd(e.i, cx, bottom + 22, 16, EventSites.MARKET_CROWD);
                }
                return;
            }

            case EventKind.RESTORE: {
                const k_ = kindOf(p), left = won ? 0 : Math.ceil(EventSites.MESS * (1 - f));
                const tint = k_ == "farm" ? AP.PINE : k_ == "bigtree" ? AP.UMBER : AP.GRAPE;
                for (let k = 0; k < EventSites.MESS; k++) {
                    const [x, y] = ring(k, EventSites.MESS, 32, 14);
                    if (k < left) {
                        if (k_ == "mine") put(rubbleTexture(k), x, y);
                        else if (k_ == "oasis") put(siltTexture(), x, y);
                        else if (k_ == "camp") put(stumpTexture(), x, y);
                        else put(blightTexture(), x, y + 1, tint);
                    }
                    // put right: saplings where the stumps were; flowers once it's won
                    else if (k_ == "camp") put(saplingTexture(), x, y);
                    else if (won) put(flowersTexture(), x, y, [AP.PINK, AP.STRAW, AP.WHITE, AP.SKY][(k + e.i) % 4]);
                }
                return;
            }

            case EventKind.FESTIVAL: {
                if (won) return;    // (its bunting stays up: MapLife)
                const [t0, t1] = EventSites.TENTS, [c0, c1] = EventSites.CROWD;
                const tents = t0 + Math.round((t1 - t0) * f), colours = [AP.RED, AP.SKY, AP.AMBER, AP.VIOLET, AP.LIME];
                const spots = [[-36, -2], [36, -2], [-26, 20], [26, 20], [0, 27]];
                for (let k = 0; k < tents; k++) put(tentTexture(colours[(e.i + k) % colours.length]), cx + spots[k][0], bottom + spots[k][1]);
                for (const [k, dx] of [[0, -46], [1, 46]]) wave(put(flagTexture(0), cx + dx, bottom + 6, [AP.SKY, AP.PINK][k]), flagTexture, e.i * 2 + k);
                this.crowd(e.i, cx, bottom + 17, 22, c0 + Math.round((c1 - c0) * f));
                return;
            }
        }
    }

    // folk milling about round (x, y), `s` px
    private crowd(seed: number, x: number, y: number, s: number, n: number) {
        if (!this.landAt(x, y)) return;
        for (let k = 0; k < n; k++) {
            const coat = Math.floor(hash(seed * 7 + k, 3) * COATS.length);
            this.walkers.push({ sprite: this.sprite(walkerTexture(coat, 0), x, y), seed: seed * 100 + k, home: { x, y, s }, coat });
        }
    }

}
