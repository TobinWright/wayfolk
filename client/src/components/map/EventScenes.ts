import * as PIXI from "pixi.js";
import { bestSkill, BOSSES, EventKind, eventSkills, eventStage, EventView, marchAt } from "../../../../shared/Events";
import { Skill } from "../../../../shared/Heroes";
import { PartyMember } from "../../../../shared/Parties";
import { WorldPlace } from "../../../../shared/Places";
import { TaskKind } from "../../../../shared/Tasks";
import { enemyTexture } from "../../art/EnemyArt";
import { BLOW, blowAt, HAND, othersSkill, ROUND_MS, STRIKE, toolSprite, Work, WorkFx, workOf, workPose } from "../../art/WorkArt";
import { AP } from "../../constants/Palette";
import { HeroRow } from "../../data/HeroesData";
import { IBC } from "../../Engine";
import { Facing } from "../../people/AvatarArt";
import { randomLooks } from "../../people/LookArt";
import { personTexture, shadowTexture } from "../../people/People";

// Heroes at work at the events on the map (the user, 2026-10-28: "show
// characters doing something at events based on the event"): your heroes
// there with what they work it with in hand (the best of the event's skills
// for them), and the other heroes on it (EventView c, but yours; up to OTHERS)
// standing round the place, each with one of its skills, working as
// art/WorkArt has it: a tool swung, sawn, tipped or jabbed, chips flying off
// where it strikes. A boss stands by its place, the heroes all facing it with
// their swords: each blow a slash on it and a flash, and now and then it
// lunges at them. Drawn again when the events or who's on them change, moved
// every frame. (In a hero window: herowindow/AtWork.)

interface Worker {
    hero?: number;                  // yours (drawn by the map), or one of the others
    person?: PIXI.Sprite; shadow?: PIXI.Sprite;
    tool: PIXI.Sprite;
    work: Work;
    x: number; y: number;           // their feet (the others'; yours: from the map each frame)
    right: boolean;                 // facing right
    phase: number;                  // ms out of step
    struck: number;                 // the last round they struck in
    scene: Scene;
}
interface Scene { e: EventView; x: number; y: number; boss?: PIXI.Sprite; bossX?: number; hit: number; }

export class EventScenes {

    public static OTHERS = 4;           // the other heroes on it shown at most
    public static SCALE = 0.5;          // map px a person's px (as the map's heroes: Map.MARKER_SCALE)
    public static FEET = 6;             // map px under the place's node they stand (Map.FEET)
    public static BOSS_SCALE = 0.75;
    public static BOSS_AWAY = 14;       // map px right of the place a boss stands
    public static LUNGE_MS = 4200;      // between a boss's lunges
    public static FLASH_MS = 120;
    public static CHECK_MS = 1000;
    // the others' spots, map px from where your heroes stand: round the place, or left of a boss
    private static SPOTS: [number, number][] = [[-11, 2], [11, 2], [-17, -2], [17, -2]];
    private static BOSS_SPOTS: [number, number][] = [[-9, 3], [-15, -1], [-19, 4], [-24, 0]];

    private scenes: Scene[] = [];
    private workers: Worker[] = [];
    private fx = new WorkFx(EventScenes.SCALE);
    private drawn = "";
    private since = 0;

    // (nodeAt: a place's node, map px)
    constructor(private parent: PIXI.Container, private nodeAt: (place: number) => { x: number, y: number }) {
        this.fx.g.zIndex = 100000;
        parent.addChild(this.fx.g);
    }

    // your heroes working an event, there
    private mine(e: EventView) {
        const heroes = IBC.data.heroes;
        return heroes.heroes.filter((h) => h.s.w?.k == TaskKind.EVENT && h.s.w.m == e.i && h.s.p == e.p && !h.s.r.length && !heroes.resting(h));
    }

    // the others in your heroes' parties there (anyone's but yours): as their windows have them
    private mates(mine: HeroRow[]) {
        const mates = new Map<number, PartyMember>();
        for (const h of mine) for (const m of h.party ?? []) if (!IBC.data.heroes.get(m[0])) mates.set(m[0], m);
        return Array.from(mates.values());
    }

    private key(live: EventView[]) {
        return JSON.stringify(live.map((e) => {
            const mine = this.mine(e);
            return [e.i, eventStage(e), e.c ?? 0, mine.map((h) => h.id), this.mates(mine).map((m) => m[0]), this.bossHere(e)];
        }));
    }

    public draw(places: WorldPlace[]) {
        const live = IBC.data.events.live();
        this.drawn = this.key(live);
        for (const w of this.workers) { w.tool.destroy(); w.person?.destroy(); w.shadow?.destroy(); }
        for (const s of this.scenes) s.boss?.destroy();
        this.workers = [];
        this.scenes = [];
        for (const e of live) {
            const place = places.find((p) => p.i == e.p), node = this.nodeAt(e.p);
            if (!place || !node) continue;
            const boss = this.bossHere(e);
            const scene: Scene = { e, x: node.x, y: node.y + EventScenes.FEET, hit: -Infinity };
            this.scenes.push(scene);
            if (boss) {
                const s = scene.boss = new PIXI.Sprite(enemyTexture(BOSSES.find((b) => b.id == e.b)?.e ?? 0));
                s.anchor.set(0.5, 1);
                s.scale.set(EventScenes.BOSS_SCALE);
                s.eventMode = "none";
                scene.bossX = node.x + EventScenes.BOSS_AWAY;
                s.position.set(scene.bossX, scene.y + 1);
                s.zIndex = scene.y;
                this.parent.addChild(s);
            }
            const skills = boss ? [Skill.FIGHTING] : eventSkills(e, place);
            const mine = this.mine(e);
            mine.forEach((h, k) => this.add(scene, bestSkill(h.d.k, skills), { hero: h.id, x: 0, y: 0, right: true, phase: k * 230 }));
            // the others on it: your heroes' party mates first, as they are and at
            // what their windows have them at; then strangers, looks of their own, the same each time it's drawn
            const mates = this.mates(mine);
            const others = Math.min(EventScenes.OTHERS, Math.max(mates.length, (e.c ?? 0) - mine.length));
            const spots = boss ? EventScenes.BOSS_SPOTS : EventScenes.SPOTS;
            for (let k = 0; k < others; k++) {
                const [dx, dy] = spots[k], mate = mates[k];
                const right = boss || dx < 0;
                const looks = mate ? mate[2] : randomLooks(seeded(e.i * 31 + k * 7 + 1));
                const skill = mate ? othersSkill(skills, mate[0], mate[4]) : skills[k % skills.length];
                const person = new PIXI.Sprite(personTexture(looks, right ? Facing.RIGHT : Facing.LEFT, 0));
                const shadow = new PIXI.Sprite(shadowTexture());
                person.anchor.set(0.5, 1); shadow.anchor.set(0.5, 0.5);
                person.scale.set(EventScenes.SCALE); shadow.scale.set(EventScenes.SCALE);
                const x = scene.x + dx, y = scene.y + dy;
                person.position.set(x, y + 1); shadow.position.set(x, y);
                person.zIndex = shadow.zIndex = y;
                this.parent.addChild(shadow, person);
                this.add(scene, skill, { person, shadow, x, y, right, phase: 170 + k * 310 });
            }
        }
    }

    // a boss stood at its place: a world boss, or one on the march while it's halted there (walking, MapSights has it)
    private bossHere(e: EventView) {
        if (e.k == EventKind.BOSS) return true;
        return e.k == EventKind.MARCH && !!marchAt(e, IBC.data.heroes.graph, Date.now())?.halted;
    }

    private add(scene: Scene, skill: Skill, w: Partial<Worker>) {
        const tool = toolSprite(skill);
        this.parent.addChild(tool);
        this.workers.push({ ...w, tool, work: workOf(skill), scene, struck: -1 } as Worker);
    }

    // which way a hero of yours working an event faces (null: not working one: as the map has them)
    public facing(hero: HeroRow) {
        const w = this.workers.find((w) => w.hero == hero.id);
        return w ? (w.right ? Facing.RIGHT : Facing.LEFT) : null;
    }

    // (spotOf: where a hero of yours stands, map px, their feet)
    public update(deltaTime: number, places: WorldPlace[], spotOf: (heroId: number) => { x: number, y: number }) {
        this.since += deltaTime;
        if (this.since >= EventScenes.CHECK_MS) {
            this.since = 0;
            if (this.key(IBC.data.events.live()) != this.drawn) this.draw(places);
        }
        const now = Date.now(), S = EventScenes.SCALE;

        // the bosses: breathing, lunging now and then, flashing when hit
        for (const s of this.scenes) {
            if (!s.boss) continue;
            const lunge = (now + s.e.i * 977) % EventScenes.LUNGE_MS, l = lunge < 300 ? Math.sin(lunge / 300 * Math.PI) : 0;
            s.boss.x = Math.round(s.bossX - 4 * l);
            s.boss.scale.y = EventScenes.BOSS_SCALE * (1 + 0.03 * Math.sin(now / 500 + s.e.i));
            s.boss.tint = now - s.hit < EventScenes.FLASH_MS ? AP.RED : 0xffffff;
        }

        for (const w of this.workers) {
            if (w.hero != null) {
                const at = spotOf(w.hero);
                if (!at) { w.tool.visible = false; continue; }
                w.x = Math.round(at.x); w.y = Math.round(at.y);
                // (one alone faces the place's middle, or the boss)
                w.right = !!w.scene.boss || w.x <= w.scene.x;
            }
            const t = ((now + w.phase) % ROUND_MS) / ROUND_MS, round = Math.floor((now + w.phase) / ROUND_MS);
            const dir = w.right ? 1 : -1, { a, ox, oy } = workPose(w.work.style, t);
            const hx = w.x + (HAND[0] + ox) * S * dir, hy = w.y + (HAND[1] + oy) * S;
            w.tool.visible = true;
            w.tool.scale.set(S * dir * (w.work.flip ? -1 : 1), S);
            w.tool.rotation = (a - w.work.lean) * dir;
            w.tool.position.set(hx, hy);
            w.tool.zIndex = w.y + 0.5;
            // their body dipping with the blow
            if (w.person) w.person.y = w.y + 1 + (w.work.style == "swing" && t > STRIKE && t < STRIKE + BLOW * 2 ? 0.5 : 0);

            // a blow landing: chips off where it struck (steam rising off a brew), a slash on a boss
            if (t >= STRIKE + BLOW && round != w.struck) {
                w.struck = round;
                if (w.work.style == "brew") { this.fx.steam(w.work.chips[0], hx, hy - 10 * S, now); continue; }
                const [bx, by] = blowAt(w.work.style, a, dir);
                this.fx.chipsOff(w.work, hx + bx * S, hy + by * S, dir, now);
                if (w.scene.boss) {
                    w.scene.hit = now;
                    this.fx.slash(w.scene.boss.x - 2 + Math.random() * 4, w.scene.y - 8 - Math.random() * 6, now);
                }
            }
        }
        this.fx.draw(now);
    }

}

// the same run of numbers for the same seed (mulberry32)
function seeded(seed: number) {
    return () => {
        seed = (seed + 0x6D2B79F5) | 0;
        let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}
