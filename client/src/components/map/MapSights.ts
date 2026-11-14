import * as PIXI from "pixi.js";
import { BOSSES, EventKind, eventTitle, EventView, marchAt, marchTarget } from "../../../../shared/Events";
import { beastAt, beastName, BEASTS, FINDS, Sight, SightKind } from "../../../../shared/Sights";
import { coinTexture, dragonTexture, stallTexture, trollTexture } from "../../art/SightArt";
import { enemyTexture } from "../../art/EnemyArt";
import { AP } from "../../constants/Palette";
import { Event } from "../../constants/Events";
import { IBC } from "../../Engine";
import { Hint } from "../../shared/ui/Hint";
import { timeLeft } from "../../data/EventsData";
import { EventInfo } from "../eventinfo/EventInfo";
import { LocationInfo } from "../locationinfo/LocationInfo";
import { SightInfo } from "../sightinfo/SightInfo";
import { placeTexture } from "../taskplanner/TaskPlanner";
import type { Map as WorldMap } from "./Map";

// What's turned up on the map for a while (shared/Sights.ts), and world
// bosses on the march (shared/Events.ts MARCH), drawn where they are and
// clickable (each opens its window; pointed at, it's named):
//   a wandering merchant's stall by its town, a coin bobbing over it;
//   a rare find twinkling round its place, in its colours (clicked, the
//     place's window, where the find is);
//   a roaming beast where it's got to: a dragon flying (its shadow on the
//     ground under it), a troll walking the roads;
//   an opening, a place of its own at a bend in the road, a glow pulsing round it;
//   a boss on the march walking from place to place (halted at one, the
//     event's scene has it: EventScenes), its way on to the town it's
//     making for dashed out in red.
// Where a beast or a boss is comes from its start and the clock, as on the
// server, so it's where the server says it is.

interface Drawn { id: string; parts: PIXI.DisplayObject[]; tick?: (now: number) => void; }

export class MapSights {

    public static CHECK_MS = 1000;
    public static FLY_HIGH = 18;        // map px a flier's over its shadow
    public static STEP_MS = 220;        // a walking or flapping frame
    public static TWINKLES = 10;        // round a rare find
    public static DRAGON_SCALE = 1.5;   // (bigger than anything else about)
    public static TROLL_SCALE = 1.3;    // (a head taller than a hero)

    public container = new PIXI.Container();    // (over the heroes and the life on the ground)
    private ways = new PIXI.Graphics();         // marching bosses' ways on
    private drawn: Drawn[] = [];
    private key = "";
    private since = 0;

    constructor(private map: WorldMap) {
        this.container.sortableChildren = true;
        this.ways.eventMode = "none";
        this.container.addChild(this.ways);
        IBC.events.register(Event.SIGHTS_CHANGED, () => this.draw(), this);
        IBC.events.register(Event.EVENTS_CHANGED, () => this.draw(), this);
        IBC.events.register(Event.TITLE_SIGNED_IN, () => this.draw(), this);
    }

    private marches() {
        return IBC.data.events.live().filter((e) => e.k == EventKind.MARCH && e.r);
    }

    private keyOf() {
        return JSON.stringify([IBC.data.sights.on().map((s) => s.i), this.marches().map((e) => e.i)]);
    }

    public draw() {
        this.key = this.keyOf();
        for (const d of this.drawn) for (const p of d.parts) p.destroy();
        this.drawn = [];
        for (const s of IBC.data.sights.on()) this.drawn.push(this.drawSight(s));
        for (const e of this.marches()) this.drawn.push(this.drawMarch(e));
    }

    public update(deltaTime: number) {
        if ((this.since += deltaTime) >= MapSights.CHECK_MS) {
            this.since = 0;
            if (this.keyOf() != this.key) this.draw();
        }
        const now = Date.now();
        this.ways.clear();
        for (const d of this.drawn) d.tick?.(now);
    }

    //#region each

    private tile() {
        return this.map.world.tile;
    }

    // a place's sprite's bottom middle (map px)
    private foot(place: number) {
        const p = IBC.data.heroes.places.get(place), tile = this.tile();
        return p ? { x: (p.x + 0.5) * tile, y: (p.y + 1) * tile + 4 } : null;
    }

    // clicked opens it; pointed at, named (and what it is)
    private clickable(it: PIXI.Container, hint: string, open: () => void) {
        it.eventMode = "static";
        it.cursor = "pointer";
        Hint.on(it, hint);
        it.on("pointerdown", (e: PIXI.FederatedPointerEvent) => e.stopPropagation());
        it.on("pointertap", open);
        return it;
    }

    private add<T extends PIXI.DisplayObject>(it: T, z = 0): T {
        it.zIndex = z;
        this.container.addChild(it);
        return it;
    }

    private drawSight(s: Sight): Drawn {
        const id = `s${s.i}`, open = () => SightInfo.open(s.i);
        const name = s.k == SightKind.BEAST ? beastName(s) : s.n, left = () => timeLeft(s.e - Date.now());
        switch (s.k) {
            case SightKind.MERCHANT: {
                const at = this.foot(s.p);
                if (!at) return { id, parts: [] };
                const stall = this.add(new PIXI.Sprite(stallTexture()), at.y);
                stall.anchor.set(0, 1);
                stall.position.set(Math.round(at.x + 9), Math.round(at.y - 1));
                const coin = this.add(new PIXI.Sprite(coinTexture()), at.y);
                coin.anchor.set(0.5, 1);
                this.clickable(stall, name, open);
                this.clickable(coin, name, open);
                return { id, parts: [stall, coin], tick: (now) => coin.position.set(stall.x + 6, Math.round(stall.y - 11 - 1.5 * (1 + Math.sin(now / 400)))) };
            }
            case SightKind.FIND: {
                const at = this.foot(s.p);
                if (!at) return { id, parts: [] };
                const hues = [[AP.LIME, AP.PALE], [AP.STRAW, AP.WHITE], [AP.ICE, AP.ORCHID]][s.v] ?? [AP.WHITE, AP.STRAW];
                const g = this.add(new PIXI.Graphics(), at.y + 1);
                const area = new PIXI.Rectangle(at.x - 16, at.y - 30, 32, 30);
                g.hitArea = area;
                // (it covers its place, so clicked it opens the place, the find in it: the user, 2026-11-02)
                const place = IBC.data.heroes.places.get(s.p);
                this.clickable(g, `${FINDS[s.v]?.name ?? name} (${left()} left)`, () => place ? LocationInfo.open(place) : open());
                return {
                    id, parts: [g], tick: (now) => {
                        // a soft glow on the ground, pulsing, and stars twinkling over the place
                        const pulse = 0.5 + 0.5 * Math.sin(now / 450);
                        g.clear().beginFill(hues[0], 0.18 + 0.14 * pulse).drawEllipse(at.x, at.y - 3, 18, 6).endFill()
                            .beginFill(hues[1], 0.12 + 0.12 * pulse).drawEllipse(at.x, at.y - 3, 10, 3).endFill();
                        for (let k = 0; k < MapSights.TWINKLES; k++) {
                            const t = ((now / 1300 + k * 0.37) % 1), a = Math.sin(t * Math.PI);
                            const x = Math.round(at.x - 16 + ((k * 37 + s.i * 11) % 32)), y = Math.round(at.y - 2 - ((k * 23 + s.i * 7) % 30) - 4 * t);
                            const r = a > 0.7 ? 3 : a > 0.35 ? 2 : 1;
                            g.beginFill(hues[k % 2], Math.min(1, a * 1.3)).drawRect(x - r, y, r * 2 + 1, 1).drawRect(x, y - r, 1, r * 2 + 1).endFill();
                            if (r == 3) g.beginFill(AP.WHITE, a).drawRect(x, y, 1, 1).endFill();
                        }
                    },
                };
            }
            case SightKind.BEAST: {
                const def = BEASTS[s.v], graph = IBC.data.heroes.graph;
                const shadow = this.add(new PIXI.Graphics().beginFill(AP.BLACK, 0.25).drawEllipse(0, 0, def?.flies ? 14 : 4, def?.flies ? 4 : 1.5).endFill());
                const beast = this.add(new PIXI.Sprite(def?.flies ? dragonTexture(0) : trollTexture(0)));
                beast.anchor.set(0.5, 1);
                shadow.eventMode = "none";
                this.clickable(beast, name, open);
                return {
                    id, parts: [shadow, beast], tick: (now) => {
                        const at = beastAt(s, graph, now);
                        beast.visible = shadow.visible = !!at;
                        if (!at) return;
                        const frame = Math.floor(now / MapSights.STEP_MS) % 2;
                        beast.texture = def?.flies ? dragonTexture(frame) : trollTexture(frame);
                        const size = def?.flies ? MapSights.DRAGON_SCALE : MapSights.TROLL_SCALE;
                        beast.scale.set(at.face < 0 ? -size : size, size);
                        const high = def?.flies ? MapSights.FLY_HIGH + 2 * Math.sin(now / 600) : 0;
                        beast.position.set(Math.round(at.x), Math.round(at.y + 4 - high));
                        shadow.position.set(Math.round(at.x), Math.round(at.y + 4));
                        beast.zIndex = def?.flies ? 100000 : at.y + 4;
                        shadow.zIndex = at.y;
                    },
                };
            }
            case SightKind.OPENING: {
                const o = s.o;
                if (!o) return { id, parts: [] };
                const tile = this.tile(), x = (o.x + 0.5) * tile, y = (o.y + 1) * tile + 4;
                const glow = this.add(new PIXI.Graphics(), y - 1);
                glow.eventMode = "none";
                const sprite = this.add(new PIXI.Sprite(placeTexture(o)), y);
                sprite.anchor.set(0.5, 1);
                sprite.position.set(x, y);
                this.clickable(sprite, `${name}: open for ${left()}`, open);
                // (a ring pulsing out on the ground round it, and motes of light rising from its mouth)
                const motes = this.add(new PIXI.Graphics(), y + 1);
                motes.eventMode = "none";
                return {
                    id, parts: [glow, sprite, motes], tick: (now) => {
                        const a = 0.35 + 0.15 * Math.sin(now / 500), ring = (now % 2400) / 2400;
                        glow.clear().beginFill(AP.VIOLET, a).drawEllipse(x, y - 3, 17, 6).endFill()
                            .beginFill(AP.ORCHID, a).drawEllipse(x, y - 3, 11, 4).endFill()
                            .lineStyle(1, AP.ORCHID, 0.8 * (1 - ring)).drawEllipse(x, y - 3, 12 + 14 * ring, 4 + 5 * ring).lineStyle(0);
                        motes.clear();
                        for (let k = 0; k < 5; k++) {
                            const t = ((now / 2000 + k * 0.21) % 1);
                            motes.beginFill(k % 2 ? AP.ORCHID : AP.PINK, Math.sin(t * Math.PI))
                                .drawRect(Math.round(x - 6 + ((k * 29) % 13) + Math.sin(t * 6 + k) * 2), Math.round(y - 6 - t * 22), 1, 1).endFill();
                        }
                    },
                };
            }
        }
        return { id, parts: [] };
    }

    // a boss on the march: walking (halted, EventScenes has it at its place),
    // its way on to its town dashed out
    private drawMarch(e: EventView): Drawn {
        const graph = IBC.data.heroes.graph, boss = BOSSES.find((b) => b.id == e.b) ?? BOSSES[0];
        const sprite = this.add(new PIXI.Sprite(enemyTexture(boss.e)));
        sprite.anchor.set(0.5, 1);
        this.clickable(sprite, `${eventTitle(e)}, marching on ${IBC.data.heroes.nameOf(marchTarget(e))}`, () => EventInfo.open(e.i));
        return {
            id: `e${e.i}`, parts: [sprite], tick: (now) => {
                const at = marchAt(e, graph, now);
                if (!at) { sprite.visible = false; return; }
                this.drawWay(e, at, now);
                sprite.visible = !at.halted;
                const step = Math.sin(now / 160) * 0.04;
                sprite.scale.set((at.face < 0 ? -1 : 1) * 0.75, 0.75 * (1 + step));
                sprite.position.set(Math.round(at.x), Math.round(at.y + 6));
                sprite.zIndex = at.y + 6;
            },
        };
    }

    // dashes from where it is along its way to the town, and a red ring round the town
    private drawWay(e: EventView, at: { x: number, y: number, p: number }, now: number) {
        const graph = IBC.data.heroes.graph, r = e.r, from = r.indexOf(at.p);
        if (from < 0) return;
        const pts = [{ x: at.x, y: at.y }, ...r.slice(from).map((id) => graph.get(id)).filter((n) => n)];
        const g = this.ways, DASH = 4, GAP = 4, shift = (now / 80) % (DASH + GAP);
        let carry = -shift;
        for (let k = 1; k < pts.length; k++) {
            const a = pts[k - 1], b = pts[k], len = Math.hypot(b.x - a.x, b.y - a.y);
            if (!len) continue;
            const dx = (b.x - a.x) / len, dy = (b.y - a.y) / len;
            for (let d = carry; d < len; d += DASH + GAP) {
                const s0 = Math.max(0, d), s1 = Math.min(len, d + DASH);
                if (s1 <= s0) continue;
                g.lineStyle(1, AP.RED, 0.8).moveTo(a.x + dx * s0, a.y + dy * s0).lineTo(a.x + dx * s1, a.y + dy * s1);
            }
            carry = ((carry - len) % (DASH + GAP) + (DASH + GAP)) % (DASH + GAP) - (DASH + GAP);
        }
        const town = graph.get(marchTarget(e));
        if (town) g.lineStyle(1, AP.RED, 0.5 + 0.3 * Math.sin(now / 300)).drawEllipse(town.x, town.y + 4, 16, 6);
        g.lineStyle(0);
    }

    //#endregion

}

