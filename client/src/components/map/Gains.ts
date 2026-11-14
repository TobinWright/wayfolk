import * as PIXI from "pixi.js";
import { Skill } from "../../../../shared/Heroes";
import { TaskKind } from "../../../../shared/Tasks";
import { itemPic } from "../../art/ItemArt";
import { hash } from "../../art/Backdrops";
import { displayFont } from "../../art/DisplayFont";
import { Event } from "../../constants/Events";
import { AP } from "../../constants/Palette";
import { HeroRow } from "../../data/HeroesData";
import { IBC } from "../../Engine";
import { picTexture } from "../../people/People";

// What your heroes get, over their heads on the map (the user, 2026-11-01:
// "do numbers 2-7", game feel), only for looks:
//   A thing gathered or crafted: its picture and "+1" rising off them and
//     fading (one more of a task done: HERO_STATE's d going up).
//   A level gone up: a ring of sparkles bursting out round them and the
//     skill's new level rising over them in gold.
// Map calls mark() for each of your heroes it draws each frame, so the pops
// follow them as they walk. Over the weather (in its own layer), so the
// night doesn't dim them.

const SCALE = 0.5;                  // as the heroes' (Map.MARKER_SCALE)
const RISE = 9;                     // map px a pop rises
const POP_MS = 1400;
const LEVEL_MS = 2200;
const SPARKS = 10;
const SPARK_REACH = 11;             // map px out the sparkles fly
const TEXT_SCALE = 2;               // screen px a px of the words, at any zoom (as the windows')

interface Pop { hero: number; parts: PIXI.Container; t: number; ms: number; lift: number; }
interface Spark { hero: number; sprite: PIXI.Graphics; t: number; dx: number; dy: number; }

export class Gains {

    private pops: Pop[] = [];
    private sparks: Spark[] = [];
    private at = new Map<number, { x: number; top: number; feet: number }>();
    private seen = new Map<number, { k: TaskKind; m: number; d: number }>();
    private zoom = 1;
    public container = new PIXI.Container();

    constructor() {
        this.container.eventMode = "none";
        IBC.events.register(Event.HERO_STATE, (hero: HeroRow) => this.state(hero), this);
        IBC.events.register(Event.HERO_LEVEL, (e: { hero: HeroRow, skill: Skill }) => this.level(e.hero, e.skill), this);
    }

    public destroy() {
        IBC.events.unregisterAll(this);
    }

    // one more of a gathering or crafting task done: what it made
    private state(hero: HeroRow) {
        const w = hero.s.w, was = this.seen.get(hero.id);
        if (!w || (w.k != TaskKind.GATHER && w.k != TaskKind.CRAFT) || w.m == null) { this.seen.delete(hero.id); return; }
        this.seen.set(hero.id, { k: w.k, m: w.m, d: hero.s.d });
        if (was && was.k == w.k && was.m == w.m && hero.s.d > was.d) this.item(hero.id, w.m, hero.s.d - was.d);
    }

    private item(hero: number, id: number, n: number) {
        const parts = new PIXI.Container();
        const icon = new PIXI.Sprite(picTexture(itemPic(id)));
        icon.anchor.set(1, 0.5);
        icon.scale.set(SCALE);
        const text = this.words(`+${n}`, AP.WHITE, 0);
        text.x = 1;
        parts.addChild(icon, text);
        this.pop(hero, parts, POP_MS);
    }

    private level(hero: HeroRow, skill: Skill) {
        const level = hero.d.k[skill];
        if (level == null) return;
        const parts = new PIXI.Container();
        parts.addChild(this.words(`Level ${level}!`, AP.STRAW, 0.5));
        this.pop(hero.id, parts, LEVEL_MS);
        for (let i = 0; i < SPARKS; i++) {
            const a = (i / SPARKS + hash(i, hero.id) * 0.05) * Math.PI * 2, c = i % 2 ? AP.STRAW : AP.WHITE;
            const sprite = new PIXI.Graphics().beginFill(c).drawRect(-0.5, -2, 1, 4).drawRect(-2, -0.5, 4, 1).endFill();
            this.container.addChild(sprite);
            this.sparks.push({ hero: hero.id, sprite, t: 0, dx: Math.cos(a), dy: Math.sin(a) * 0.7 });
        }
    }

    // words in the display font, a dark shadow under them, drawn the same
    // size on the screen whatever the zoom; anchored at (ax, 0.5)
    private words(s: string, tint: number, ax: number) {
        const words = new PIXI.Container();
        for (const [c, d] of [[AP.BLACK, 1], [tint, 0]]) {
            const text = new PIXI.BitmapText(s, { fontName: displayFont(), fontSize: 32, tint: c });
            text.anchor.set(ax, 0.5);
            text.position.set(d, d);
            words.addChild(text);
        }
        words.scale.set(TEXT_SCALE / this.zoom);
        return words;
    }

    // (a second at once goes higher, so they don't sit on each other)
    private pop(hero: number, parts: PIXI.Container, ms: number) {
        const lift = this.pops.filter((p) => p.hero == hero && p.t < 300).length * 6;
        this.container.addChild(parts);
        this.pops.push({ hero, parts, t: 0, ms, lift });
    }

    // a hero of yours drawn this frame: feet at (x, feet), the top of their head `top` (map px)
    public mark(hero: number, x: number, top: number, feet: number) {
        this.at.set(hero, { x, top, feet });
    }

    public update(deltaTime: number, zoom: number) {
        this.zoom = zoom;
        this.pops = this.pops.filter((p) => {
            p.t += deltaTime;
            const at = this.at.get(p.hero), f = p.t / p.ms;
            if (!at || f >= 1) { p.parts.destroy({ children: true }); return false; }
            // (out quick, then drifting; fading over the last third)
            const ease = 1 - Math.pow(1 - Math.min(1, f * 1.6), 3);
            p.parts.position.set(at.x, Math.round((at.top - 4 - p.lift - ease * RISE) * 2) / 2);
            p.parts.alpha = f < 0.66 ? 1 : 1 - (f - 0.66) / 0.34;
            p.parts.scale.set(f < 0.1 ? 0.6 + 4 * f : 1);
            return true;
        });
        this.sparks = this.sparks.filter((s) => {
            s.t += deltaTime;
            const at = this.at.get(s.hero), f = s.t / 700;
            if (!at || f >= 1) { s.sprite.destroy(); return false; }
            const out = (1 - Math.pow(1 - f, 2)) * SPARK_REACH;
            s.sprite.position.set(at.x + s.dx * out, (at.top + at.feet) / 2 + s.dy * out);
            s.sprite.alpha = 1 - f * f;
            return true;
        });
        this.at.clear();
    }

}
