import * as PIXI from "pixi.js";
import { FEET_Y } from "../../art/Backdrops";
import { Bubble, BUBBLE_H, bubbleTexture, TENT_DOOR_Y, TENT_X, zTexture } from "../../art/CampArt";
import { darkness } from "../../../../shared/Weather";
import { Facing } from "../../people/AvatarArt";
import { Looks } from "../../people/LookArt";
import { personTexture } from "../../people/People";

// A party camped in a hero window (the user, 2026-10-28): not just standing
// round the fire. Every so often (SCENE_MS) they find something else to do,
// walking over to it: two or three chatting (facing each other, taking turns,
// a little picture of what they're on about in a bubble over whoever's
// talking, bobbing as they say it), warming themselves at the fire and now and
// then looking round, looking about them, a little dance, a stroll up and
// down, or a nap in the tent (Zzz drifting out of its door; more of them turn
// in at night). Only the poses the people have: standing and walking, any way.

type Doing = "warm" | "look" | "dance" | "stroll" | "tent" | "talk2" | "talk3";
interface Spot { x: number; face: Facing; }

const L = Facing.LEFT, R = Facing.RIGHT, D = Facing.DOWN, U = Facing.UP;
const at = (x: number, face: Facing): Spot => ({ x, face });

// where each can be done (scene px), one spot each for who's doing it (a stroll: its two ends).
// Clear of the fire and its tripod (87-105); the log (108-132) is behind them
const PLACES: { [d in Doing]: Spot[][] } = {
    warm: [[at(80, R)], [at(66, R)], [at(113, L)], [at(126, L)]],
    look: [[at(56, D)], [at(148, D)], [at(140, U)], [at(70, U)]],
    dance: [[at(142, D)], [at(60, D)]],
    stroll: [[at(52, R), at(82, L)], [at(134, R), at(156, L)]],
    tent: [[at(TENT_X, D)]],
    talk2: [[[140, R], [153, L]], [[57, R], [70, L]], [[113, R], [126, L]], [[66, R], [79, L]]].map((g) => g.map(([x, f]) => at(x, f))),
    talk3: [[[56, R], [68, D], [80, L]], [[113, R], [125, D], [137, L]]].map((g) => g.map(([x, f]) => at(x, f))),
};

// what one on their own does: [doing, how likely by day, at night]
const SOLO: [Doing, number, number][] = [["warm", 4, 4], ["look", 2, 1], ["dance", 1, 0.3], ["stroll", 2, 1], ["tent", 1, 6]];

// what's said, and how often
const SAYS: [Bubble, number][] = [
    ["dots", 3], ["laugh", 3], ["bang", 2], ["what", 2], ["sword", 1.5], ["coin", 1.5], ["meat", 1.5], ["star", 1], ["heart", 1], ["note", 1],
];

const WALK = [1, 0, 2, 0];

interface Person {
    x: number; doing: Doing; spot: Spot; ends?: Spot[]; end: number;
    face: Facing; walking: boolean; wait: number; step: number; bob: number; hop: number; beat: number;
}
interface Group { who: number[]; wait: number; last: number; }
interface Floater { sprite: PIXI.Sprite; owner: number; age: number; life: number; x: number; y: number; dx: number; rise: number; }

const rand = (a: number, b: number) => a + Math.random() * (b - a);
const pick = <T>(list: T[]) => list[Math.floor(Math.random() * list.length)];
function weighted<T>(list: [T, number][]): T {
    let r = Math.random() * list.reduce((s, [, w]) => s + w, 0);
    for (const [v, w] of list) if ((r -= w) < 0) return v;
    return list[list.length - 1][0];
}

export class CampLife {

    public static WALK_SPEED = 18;          // scene px a second, going to what they'll do next
    public static STEP_MS = 150;
    public static SCENE_MS = [14000, 26000];
    public static SAY_MS = [900, 2400];     // between one saying something and the next
    public static BUBBLE_MS = 1700;
    public static BOB_MS = 300;             // saying it: up a px for half of this
    public static HOP_MS = 180;             // dancing: up 2 px
    public static BEAT_MS = 380;            // a dance's turns
    public static Z_MS = 900;
    public static Z_MS_LIFE = 2600;

    private people: Person[] = [];
    private groups: Group[] = [];
    private floaters: Floater[] = [];
    private sceneLeft = 0;
    private zWait = 0;

    // the party's looks, their sprites and shadows (in the same order), and where bubbles and z's go
    constructor(private looks: Looks[], private sprites: PIXI.Sprite[], private shadows: PIXI.Sprite[], private over: PIXI.Container) {
        this.newScene(true);
        this.update(0);
    }

    public destroy() {
        for (const f of this.floaters) f.sprite.destroy();
        this.floaters = [];
        for (const s of [...this.sprites, ...this.shadows]) if (!s.destroyed) s.visible = true;
    }

    // what each does now: in twos and threes talking, or on their own; at snap, there already
    private newScene(snap: boolean) {
        const n = this.looks.length, dark = darkness(Date.now());
        const order = Array.from({ length: n }, (_, i) => i).sort(() => Math.random() - 0.5);
        const used: number[][] = [], was = this.people;
        this.people = new Array(n);
        this.groups = [];
        const span = (doing: Doing, spots: Spot[]) => doing == "tent" ? null : [Math.min(...spots.map((s) => s.x)) - 6, Math.max(...spots.map((s) => s.x)) + 6];
        const take = (doing: Doing, who: number[]) => {
            const fits = PLACES[doing].filter((c) => { const s = span(doing, c); return !s || used.every(([a, b]) => s[1] <= a || s[0] >= b); });
            if (!fits.length) return false;
            const spots = pick(fits), s = span(doing, spots);
            if (s) used.push(s);
            who.forEach((i, k) => {
                const spot = doing == "stroll" ? spots[0] : spots[k];
                this.people[i] = {
                    x: snap || !was[i] ? (doing == "tent" ? TENT_X : spot.x) : was[i].x, doing, spot, ends: doing == "stroll" ? spots : null, end: 0,
                    face: spot.face, walking: false, wait: rand(1000, 4000), step: 0, bob: 0, hop: 0, beat: 0,
                };
            });
            if (who.length > 1) this.groups.push({ who, wait: rand(300, 1500), last: -1 });
            return true;
        };
        for (let i = 0; i < n;) {
            const left = n - i, r = Math.random();
            if (left >= 3 && r < 0.2 && take("talk3", order.slice(i, i + 3))) { i += 3; continue; }
            if (left >= 2 && r < 0.6 && take("talk2", order.slice(i, i + 2))) { i += 2; continue; }
            const solo = weighted(SOLO.map(([d, day, night]) => [d, day + (night - day) * dark] as [Doing, number]));
            // (somewhere for everyone: there's always room in the tent)
            if (take(solo, [order[i]]) || take("warm", [order[i]]) || take("tent", [order[i]])) i++;
        }
        this.sceneLeft = rand(CampLife.SCENE_MS[0], CampLife.SCENE_MS[1]);
    }

    private goal(p: Person) {
        return p.doing == "tent" ? TENT_X : p.ends ? p.ends[p.end].x : p.spot.x;
    }

    public update(deltaTime: number) {
        this.sceneLeft -= deltaTime;
        if (this.sceneLeft <= 0) this.newScene(false);
        this.people.forEach((p, i) => {
            const goal = this.goal(p), d = goal - p.x;
            if (Math.abs(d) > 0.01) {
                // going over to it
                p.x += Math.sign(d) * Math.min(Math.abs(d), CampLife.WALK_SPEED * deltaTime / 1000);
                p.face = d > 0 ? R : L;
                p.step += deltaTime;
                p.walking = true;
            } else {
                if (p.walking) this.arrive(p);
                p.walking = false;
                this.idle(p, i, deltaTime);
            }
            p.bob = Math.max(0, p.bob - deltaTime);
            p.hop = Math.max(0, p.hop - deltaTime);
            this.draw(i);
        });
        for (const g of this.groups) this.chat(g, deltaTime);
        this.snore(deltaTime);
        this.drift(deltaTime);
    }

    // there: facing the way it's done
    private arrive(p: Person) {
        p.face = p.ends ? pick([p.spot.face, D, U, p.ends[p.end].face]) : p.spot.face;
        p.wait = p.ends ? rand(1000, 3500) : rand(2000, 6000);
    }

    private idle(p: Person, i: number, deltaTime: number) {
        p.wait -= deltaTime;
        switch (p.doing) {
            case "warm":
                // at the fire, now and then looking round
                if (p.wait <= 0) {
                    p.face = p.face == p.spot.face && Math.random() < 0.5 ? pick([D, p.spot.face == R ? L : R]) : p.spot.face;
                    p.wait = p.face == p.spot.face ? rand(3000, 8000) : rand(700, 1600);
                }
                break;
            case "look":
                if (p.wait <= 0) { p.face = pick([L, R, U, D].filter((f) => f != p.face)); p.wait = rand(1200, 3200); }
                break;
            case "dance":
                // turning round on the beat, a hop each turn, humming
                if (p.wait <= 0) {
                    p.face = [D, R, U, L][p.beat++ % 4];
                    p.hop = CampLife.HOP_MS;
                    p.wait = CampLife.BEAT_MS;
                    if (p.beat % 8 == 1) this.say(i, "note");
                    if (p.beat % 16 == 0) p.wait = rand(1500, 3000);   // a breather
                }
                break;
            case "stroll":
                // up and down, stopping at each end a while
                if (p.wait <= 0) p.end = 1 - p.end;
                break;
        }
    }

    // a group chatting, once they're all there: someone says something, mostly
    // not who spoke last; a laugh sets them all bobbing
    private chat(g: Group, deltaTime: number) {
        if (g.who.some((i) => this.people[i].walking || Math.abs(this.goal(this.people[i]) - this.people[i].x) > 0.01)) return;
        for (const i of g.who) this.people[i].face = this.people[i].spot.face;
        g.wait -= deltaTime;
        if (g.wait > 0) return;
        const others = g.who.filter((i) => i != g.last), who = Math.random() < 0.2 && g.last >= 0 ? g.last : pick(others);
        const what = weighted(SAYS);
        this.say(who, what);
        this.people[who].bob = CampLife.BOB_MS * (what == "laugh" ? 2 : 1);
        if (what == "laugh") for (const i of g.who) if (Math.random() < 0.6) this.people[i].bob = CampLife.BOB_MS * 2;
        g.last = who;
        g.wait = rand(CampLife.SAY_MS[0], CampLife.SAY_MS[1]);
    }

    // a bubble over someone's head (theirs before it gone)
    private say(i: number, what: Bubble) {
        this.floaters = this.floaters.filter((f) => f.owner != i || (f.sprite.destroy(), false));
        const sprite = new PIXI.Sprite(bubbleTexture(what));
        this.over.addChild(sprite);
        const x = Math.round(this.people[i].x) - 2, y = FEET_Y - 26 - BUBBLE_H;
        this.floaters.push({ sprite, owner: i, age: 0, life: CampLife.BUBBLE_MS, x, y, dx: 0, rise: 2 });
    }

    // Zzz out of the tent's door while anyone's asleep in it
    private snore(deltaTime: number) {
        if (!this.people.some((p) => p.doing == "tent" && !p.walking && p.x == TENT_X)) return;
        this.zWait -= deltaTime;
        if (this.zWait > 0) return;
        this.zWait = CampLife.Z_MS;
        const sprite = new PIXI.Sprite(zTexture());
        this.over.addChild(sprite);
        this.floaters.push({ sprite, owner: -1, age: 0, life: CampLife.Z_MS_LIFE, x: TENT_X + 1, y: TENT_DOOR_Y - 4, dx: 6, rise: 14 });
    }

    // bubbles and z's rising and fading
    private drift(deltaTime: number) {
        this.floaters = this.floaters.filter((f) => {
            f.age += deltaTime;
            if (f.age >= f.life) { f.sprite.destroy(); return false; }
            const t = f.age / f.life;
            f.sprite.position.set(Math.round(f.x + f.dx * t + (f.owner < 0 ? Math.sin(t * 6) * 1.5 : 0)), Math.round(f.y - f.rise * t));
            f.sprite.alpha = t < 0.7 ? 1 : (1 - t) / 0.3;
            return true;
        });
    }

    private draw(i: number) {
        const p = this.people[i], sprite = this.sprites[i], shadow = this.shadows[i];
        if (!sprite || sprite.destroyed) return;
        // (asleep in the tent: out of sight)
        sprite.visible = shadow.visible = !(p.doing == "tent" && !p.walking && p.x == TENT_X);
        const x = Math.round(p.x), up = (p.bob % CampLife.BOB_MS > CampLife.BOB_MS / 2 ? 1 : 0) + (p.hop > 0 ? 2 : 0);
        sprite.position.set(x, FEET_Y + 1 - up);
        shadow.position.set(x, FEET_Y);
        sprite.texture = personTexture(this.looks[i], p.face, p.walking ? WALK[Math.floor(p.step / CampLife.STEP_MS) % WALK.length] : 0);
    }
}
