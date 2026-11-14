import * as PIXI from "pixi.js";
import { bestSkill, BOSSES, EventKind, eventSkills, EventView, isBossEvent } from "../../../../shared/Events";
import { Job, Skill } from "../../../../shared/Heroes";
import { FEET_Y } from "../../art/Backdrops";
import { enemyTexture } from "../../art/EnemyArt";
import { BLOW, blowAt, BUILD_W, buildingTexture, HAND, othersSkill, ROUND_MS, StationTexture, stationOf, STRIKE, toolSprite, Work, WorkFx, workOf, workPose } from "../../art/WorkArt";
import { IBC } from "../../Engine";
import { Facing } from "../../people/AvatarArt";
import { Looks } from "../../people/LookArt";
import { personTexture, shadowTexture } from "../../people/People";

// A party at work where they are, in a hero window: at an event (the user,
// 2026-10-28: "show characters doing something at events based on the event
// ... in the side view window"), or at their task (DESIGN.md "Hero windows":
// "the window shows what they're doing (mining, fishing, chopping...)").
// Standing in a line facing right, each at what they work it with - at an
// event the best of its skills for your heroes (art/WorkArt's othersSkill
// for anyone else's, as the map has them); at a task its skill, a party
// being all on the same one (shared/Parties) - a pickaxe at a rock, a
// hatchet at a log, a sickle at a bush, a hammer at an anvil, a saw at a
// sawhorse, a flask over a cauldron, a pan over a pot, a needle at cloth, a
// bow loosing arrows off out of the window, a spyglass looking about
// (art/WorkArt), chips flying off each blow. A rebuild or an upgrade has its
// building going up on the right, as far as the event's got. A boss stands
// on the right as in a fight, the party sparring with it between bouts (the
// bouts themselves play as fights do): each blow a slash and a flash on it,
// and now and then it lunges at the front. (Odd jobs and dungeon runs: TaskWork.)

// what they're at: an event, or a task's skill and what it's worked at
// (none: nothing before them); or hauling crates, or down a dungeon
// (TaskWork). The same key, the same scene
export interface Site { key: string; e?: EventView; skill?: Skill; station?: StationTexture; haul?: boolean; delve?: boolean; }

// a scene of work in a hero window (walks: the window keeps them walking in
// their line, as on the road; underground: no sky, so no weather or daylight)
export interface WorkScene { site: Site; walks?: boolean; underground?: boolean; update(deltaTime: number): void; destroy(): void; }

interface Worker {
    sprite: PIXI.Sprite; shadow: PIXI.Sprite; tool: PIXI.Sprite; work: Work;
    x: number; down: number; phase: number; struck: number;
    station?: { sprite: PIXI.Sprite, steams?: number };
}

export class AtWork implements WorkScene {

    public static GAP = 30;             // scene px between workers (each with their station)
    public static FRONT = 74;           // the front worker, one alone (more: further on)
    public static BUILD_FRONT = 100;    // with a building
    public static STATION = 12;         // scene px in front of a worker their station's middle
    public static BOSS_X = 138;         // as a fight's (HeroWindow.FOE_X)
    public static BOSS_SCALE = 1.5;     // (a fight's boss)
    public static BOSS_FRONT = 114;     // the front one sparring
    public static BOSS_GAP = 18;        // (HeroWindow.SPACING)
    public static LUNGE_MS = 3200;      // between a boss's lunges
    public static LUNGE = 6;
    public static FLASH_MS = 120;
    public static CHECK_MS = 1000;
    public static ARROW_EVERY = 2;      // rounds to a hunter's arrow

    private workers: Worker[] = [];
    private fx = new WorkFx(1);
    private boss: PIXI.Sprite;
    private building: PIXI.Sprite;
    private hit = -Infinity;
    private since = 0;

    constructor(public site: Site, members: Looks[], memberIds: number[], memberJobs: Job[], sprites: PIXI.Sprite[], shadows: PIXI.Sprite[],
        private back: PIXI.Container, private front: PIXI.Container) {
        const W = AtWork, e = site.e, boss = isBossEvent(e), built = e?.k == EventKind.REBUILD || e?.k == EventKind.UPGRADE;
        const place = e && IBC.data.heroes.places.get(e.p);
        const skills = !e ? [site.skill] : boss ? [Skill.FIGHTING] : place ? eventSkills(e, place) : [Skill.MINING];
        if (boss) {
            const shadow = new PIXI.Sprite(shadowTexture());
            this.boss = new PIXI.Sprite(enemyTexture(BOSSES.find((b) => b.id == e.b)?.e ?? 0));
            this.boss.anchor.set(0.5, 1); shadow.anchor.set(0.5, 0.5);
            this.boss.scale.set(W.BOSS_SCALE); shadow.scale.set(W.BOSS_SCALE);
            this.boss.position.set(W.BOSS_X, FEET_Y + 1); shadow.position.set(W.BOSS_X, FEET_Y);
            back.addChild(shadow, this.boss);
        }
        if (built) {
            this.building = new PIXI.Sprite(buildingTexture(e.k, e.d / e.g));
            this.building.anchor.set(0, 1);
            this.building.position.set(160 - BUILD_W - 1, FEET_Y + 1);
            back.addChild(this.building);
        }
        const n = members.length, lead = boss ? W.BOSS_FRONT : built ? W.BUILD_FRONT : W.FRONT + (n - 1) * W.GAP / 2;
        members.forEach((looks, i) => {
            const hero = IBC.data.heroes.get(memberIds[i]);
            const skill = skills.length == 1 ? skills[0] : hero ? bestSkill(hero.d.k, skills) : othersSkill(skills, memberIds[i], memberJobs[i]);
            const x = lead - i * (boss ? W.BOSS_GAP : W.GAP), sprite = sprites[i], shadow = shadows[i];
            sprite.visible = shadow.visible = true;
            sprite.texture = personTexture(looks, Facing.RIGHT, 0);
            sprite.position.set(x, FEET_Y + 1);
            shadow.position.set(x, FEET_Y);
            const tool = toolSprite(skill);
            front.addChild(tool);
            // what they're at, before them (at an event, their skill's; its chips off it); their blows landing on its top
            const station = boss ? null : e ? stationOf(skill) : site.station;
            const work = station?.chips ? { ...workOf(skill), chips: station.chips } : workOf(skill);
            const worker: Worker = { sprite, shadow, tool, work, x, down: 1.7, phase: i * 290, struck: -1 };
            if (station) {
                const s = new PIXI.Sprite(station.texture), sx = x + W.STATION;
                s.anchor.set(0.5, 1);
                s.position.set(sx, FEET_Y + 1);
                back.addChild(s);
                worker.station = { sprite: s, steams: station.steams };
                const dx = sx - s.width / 4 - (x + HAND[0]), dy = FEET_Y + 1 - station.top - (FEET_Y + HAND[1]);
                worker.down = Math.atan2(dx, -dy);
            }
            this.workers.push(worker);
        });
    }

    public update(deltaTime: number) {
        const now = Date.now(), W = AtWork;
        this.since += deltaTime;
        if (this.building && this.since >= W.CHECK_MS) {
            this.since = 0;
            const e = IBC.data.events.get(this.site.e.i) ?? this.site.e;
            this.building.texture = buildingTexture(e.k, e.d / e.g);
        }
        // the boss breathing, flashing when struck, lunging now and then (the front one reddening)
        let lunged = false;
        if (this.boss) {
            const lunge = (now + this.site.e.i * 977) % W.LUNGE_MS, l = lunge < 300 ? Math.sin(lunge / 300 * Math.PI) : 0;
            this.boss.x = Math.round(W.BOSS_X - W.LUNGE * l);
            this.boss.scale.y = W.BOSS_SCALE * (1 + 0.03 * Math.sin(now / 500));
            this.boss.tint = now - this.hit < W.FLASH_MS ? 0xff7070 : 0xffffff;
            lunged = l > 0.6;
        }
        this.workers.forEach((w, i) => {
            const t = ((now + w.phase) % ROUND_MS) / ROUND_MS, round = Math.floor((now + w.phase) / ROUND_MS);
            const { a, ox, oy } = workPose(w.work.style, t, w.down);
            const hx = w.x + HAND[0] + ox, hy = FEET_Y + HAND[1] + oy;
            const flip = w.work.flip ? -1 : 1;
            w.tool.scale.set(flip, 1);
            w.tool.rotation = a - w.work.lean;
            w.tool.position.set(hx, hy);
            w.sprite.y = FEET_Y + 1 + (w.work.style == "swing" && t > STRIKE && t < STRIKE + BLOW * 2 ? 1 : 0);
            w.sprite.tint = lunged && i == 0 ? 0xff7070 : 0xffffff;

            if (t >= STRIKE + BLOW && round != w.struck) {
                w.struck = round;
                // steam off what's brewing; an arrow loosed; chips off where it struck; a slash on a boss
                if (w.work.style == "brew") {
                    const s = w.station?.sprite;
                    this.fx.steam(w.station?.steams ?? w.work.chips[0], s ? s.x : hx, s ? s.y - s.height : hy - 10, now);
                    return;
                }
                if (w.work.style == "shoot") {
                    if (round % W.ARROW_EVERY == 0) this.fx.arrow(hx + 4, hy, now);
                    return;
                }
                const [bx, by] = blowAt(w.work.style, a, 1);
                this.fx.chipsOff(w.work, hx + bx, hy + by, 1, now);
                if (this.boss && i == 0) {
                    this.hit = now;
                    this.fx.slash(this.boss.x - 4 + Math.random() * 8, FEET_Y - 10 - Math.random() * 14, now);
                }
            }
        });
        if (!this.fx.g.parent) this.front.addChild(this.fx.g);
        this.fx.draw(now);
    }

    // the party back as they were: the window places them again
    public destroy() {
        // (the window may have destroyed their sprites already, the party changing)
        for (const w of this.workers) if (!w.sprite.destroyed) { w.sprite.tint = 0xffffff; w.sprite.y = FEET_Y + 1; }
        this.back.removeChildren().forEach((c) => c.destroy());
        this.front.removeChildren().forEach((c) => c.destroy());
        this.workers = [];
    }

}
