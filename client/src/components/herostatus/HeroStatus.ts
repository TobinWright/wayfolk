import * as PIXI from "pixi.js";
import { worldSeasonAt } from "../../../../shared/Seasons";
import {
    EXT, EXTENDED, extLevel, extLevelPart, extXp, isExtended, isSpecialty, JOBS, levelPart, levelXp, Skill, SKILL_MAX, SKILL_NAMES,
    SPECIALTY_XP, startTown, STAT_NAMES, TRAITS, XP_AT,
} from "../../../../shared/Heroes";
import { heroPower } from "../../../../shared/Locations";
import { doingText, itemName, itemTier, itemWorth, QUALITY_NAMES, qualityOf, recipeOf, SKILL_STAT, Slot, SLOT_NAMES, slotsFor, SUPPLY_SLOTS, taskSkill, TOOLS, workRate, worn, wornPower, wornStats } from "../../../../shared/Tasks";
import { POSES, SCENES, sceneOf } from "../../../../shared/Scenes";
import { BACKDROP, owns, tierOf } from "../../../../shared/Wardrobe";
import { isSeaLeg, TRAVEL_SPEED, travelSpeed } from "../../../../shared/Travel";
import { conditionsAt, conditionsText, workSkillOf } from "../../../../shared/Conditions";
import { Backdrop, backdropArt, FEET_Y, Pic, SCENE_H, SCENE_W } from "../../art/Backdrops";
import { cosmeticsIcon, editIcon, journalIcon, todoIcon } from "../../art/MenuIcons";
import { statusScene } from "../../art/StatusScenes";
import { TASK_ICON, taskIcon } from "../../art/TaskIcons";
import { Constants } from "../../constants/Constants";
import { Event } from "../../constants/Events";
import { AP } from "../../constants/Palette";
import { HeroRow } from "../../data/HeroesData";
import { IBC } from "../../Engine";
import { Facing } from "../../people/AvatarArt";
import { personTexture, picTexture, shadowTexture } from "../../people/People";
import { Panel } from "../../shared/Panel";
import { TitleBar } from "../../shared/ui/titlebar/TitleBar";
import { BaseComponent, ComponentType } from "../BaseComponent";
import { Chat } from "../chat/Chat";
import { HeroCosmetics, tierCorner, whose } from "../herocosmetics/HeroCosmetics";
import { HeroJournal } from "../herojournal/HeroJournal";
import { fit } from "../heroroster/HeroRoster";
import { HeroWindow } from "../herowindow/HeroWindow";
import { itemTexture } from "../inventory/Item";
import { ItemInfo } from "../iteminfo/ItemInfo";
import { Profile } from "../profile/Profile";
import { TaskPlanner } from "../taskplanner/TaskPlanner";

// A hero's status (the user, 2026-10-28), opened from the button on their box
// in the roster. On the left, them standing in the land they're in, their
// name, job, the town they came from, their power in a fight and how quick
// they travel, what they're doing and where, their traits, and buttons to
// their to-do list, cosmetics and journal. In the middle their gear (the
// user, 2026-11-01): a slot each for what's worn and a tool for each skill,
// an empty one its sort's icon, dim. Something dragged in from the Inventory
// and let go on a slot it goes in is put on; one dragged off a slot is taken
// off (let go on another slot it goes in, moved there). On the right their
// five stats as bars (with what traits and jewellery add, and the skills each
// leans on), and under them their
// skills, core then extended, scrolled by the wheel and drawn alike: level,
// how far into it, their job's and their specialties marked, the one they're
// training lit. Pointing at anything says more in a box over the pointer.
// It keeps up as they work (HERO_STATE). Someone else's hero, clicked in a
// window of yours (HeroWindow, HERO_VIEW), shows as they were when asked for:
// whose they are where the buttons would be (their name clicked, their
// profile: components/profile), no scene picker, gear not moved.

export class HeroStatus extends BaseComponent {

    public static SCALE = 2;
    public static H = 214;              // in its own px
    public static PAD = 4;
    public static LINE = 10;
    public static LEFT_W = 112;         // the left column
    public static BOX = 20;             // a gear slot
    public static BOX_GAP = 3;
    public static GEAR = HeroStatus.PAD + HeroStatus.LEFT_W + 8;     // the gear, between them
    public static GEAR_W = HeroStatus.BOX * 3 + HeroStatus.BOX_GAP * 2;
    public static RIGHT = HeroStatus.GEAR + HeroStatus.GEAR_W + 8;
    public static RIGHT_W = 232;
    public static W = HeroStatus.RIGHT + HeroStatus.RIGHT_W + HeroStatus.PAD;
    public static DRAG_PX = 4;          // (screen px a pressed slot moves before it's dragged)
    public static STAGE_H = 48;         // where they stand (as tall as their window's scene)
    public static ICON_W = 22;          // an icon's button (the to-do list's, gear's, cosmetics', journal's)
    public static ICON_H = 18;
    public static STAT_MOST = 20;       // a stat bar's full length
    public static SKILL_H = 14;         // a skill's cell
    private static WALK = [1, 0, 2, 0]; // (walking frames, as in their window)
    // the worn slots, three by three, and under them the potion and meal they use (null: a gap); the tools under those
    private static GRID: Slot[] = [
        Slot.AMULET, Slot.HELM, Slot.RING,
        Slot.WEAPON, Slot.BODY, Slot.SHIELD,
        Slot.HANDS, Slot.FEET, Slot.RING2,
        Slot.POTION, null, Slot.FOOD,
    ];
    // an empty slot's icon (art/TaskIcons)
    private static ICONS = ["helm", "body", "gloves", "feet", "sword", "shield", "amulet", "ring", "ring", ...TOOLS, "potion", "food"];
    // the window round it, in screen px
    public static INSET_X = 12;
    public static INSET_Y = 28;         // (under the title bar)
    public static WIDTH = HeroStatus.INSET_X * 2 + HeroStatus.W * HeroStatus.SCALE;
    public static HEIGHT = HeroStatus.INSET_Y + HeroStatus.H * HeroStatus.SCALE + HeroStatus.INSET_X;

    private heroId = -1;
    private drawn = "";                 // (what it was drawn from: redrawn when it changes)
    private weatherLook = 0;            // (ms till the time and weather are looked at again)
    // the skills under the stats, core then extended, scrolled by the wheel
    private skills: PIXI.Container = null;
    private skillsTop = Infinity;       // (where they start, in the content's px)
    private skillsH = 0;                // (how tall they are, all of them)
    private skillScroll = 0;            // (px scrolled past: kept through redraws)
    private picking = false;            // the scene picker open, over the right
    // them where they stand, doing what's picked for them (POSES)
    private actor: Actor = null;
    private paceX = 0.5;                // (how far along, 0 to 1: kept through redraws)
    private paceDir = 1;
    private stepTime = 0;
    private poseTime = 0;
    private wanderTo = -1;              // (wandering: where to next, -1 resting)
    private wanderRest = 0;
    private lights: { g: PIXI.Graphics, at: [number, number, number][], x: number, y: number, tick: number } = null;
    private time = 0;
    // the gear slots as drawn, and dragging things on and off them
    private boxes: { slot: Slot, box: PIXI.Container, paint: (over: boolean) => void }[] = [];
    private dragging = 0;               // (what's dragged, from the Inventory or off a slot: the slots it goes in lit)
    private dropSlot = -1;              // (the one it'd go in if let go now)
    private press: { slot: Slot, id: number, from: PIXI.Point } = null;    // (a worn thing pressed: dragged once it moves a few px)
    private ghost: PIXI.Sprite = null;  // (what's dragged, under the pointer)
    private dragged = false;            // (the last press was a drag, not a click)

    public background: Panel;
    public titleBar: TitleBar;
    private content: PIXI.Container;
    private sheet: PIXI.Container;
    private tip: PIXI.Container;
    private pointer = new PIXI.Point();  // (where the pointer is, in the content's px)

    private keys = (e: KeyboardEvent) => { if (e.key == "Escape" && !Chat.takes(e)) IBC.comp.destroy(this); };

    constructor() {
        super(ComponentType.HERO_STATUS);
        this.create();
    }

    // a hero's status (one open at a time: opening another's shows theirs)
    public static open(heroId: number) {
        const view = IBC.comp.getOrCreate(ComponentType.HERO_STATUS) as HeroStatus;
        view.bringToTop();
        view.show(heroId);
    }

    public create() {
        super.create();
        const { WIDTH, HEIGHT, W, H } = HeroStatus;
        this.container.eventMode = "static";
        this.container.hitArea = new PIXI.Rectangle(0, 0, WIDTH, HEIGHT);
        this.container.on("pointerdown", (e: PIXI.FederatedPointerEvent) => e.stopPropagation());
        // the wheel, over the skills, scrolls them
        this.container.on("wheel", (e: PIXI.FederatedWheelEvent) => {
            e.stopPropagation();
            if (this.pointer.x >= HeroStatus.RIGHT - 4 && this.pointer.y >= this.skillsTop) this.scrollSkills(e.deltaY < 0 ? -HeroStatus.SKILL_H * 2 : HeroStatus.SKILL_H * 2);
        });

        this.background = new Panel(this.container);
        this.background.setSize(WIDTH, HEIGHT);

        this.titleBar = new TitleBar(this);
        this.titleBar.setPosition(4, 4);
        this.titleBar.setSize(WIDTH - 8, 20);

        this.content = new PIXI.Container();
        this.content.scale.set(HeroStatus.SCALE);
        this.content.position.set(HeroStatus.INSET_X, HeroStatus.INSET_Y);
        this.container.addChild(this.content);

        // (the panel's middle lets the map through)
        this.content.addChild(new PIXI.Graphics().beginFill(AP.INK).drawRect(-4, -2, W + 8, H + 6).endFill());
        // either side of the gear
        const split = new PIXI.Graphics();
        for (const x of [HeroStatus.GEAR, HeroStatus.RIGHT]) {
            split.beginFill(AP.BLACK).drawRect(x - 5, 0, 1, H).endFill();
            split.beginFill(AP.IRON).drawRect(x - 4, 0, 1, H).endFill();
        }
        this.content.addChild(split);

        this.sheet = new PIXI.Container();
        this.content.addChild(this.sheet);
        // a word on what's pointed at, over the pointer (on top of the sheet, kept through redraws)
        this.tip = new PIXI.Container();
        this.tip.eventMode = "none";
        this.tip.visible = false;
        this.content.addChild(this.tip);
        this.container.on("pointermove", (e: PIXI.FederatedPointerEvent) => { this.pointer = this.content.toLocal(e.global); this.moveTip(); });
        // dragging something off a gear slot
        this.container.on("globalpointermove", (e: PIXI.FederatedPointerEvent) => this.dragMove(e));
        this.container.on("pointerup", (e: PIXI.FederatedPointerEvent) => this.dragEnd(e));
        this.container.on("pointerupoutside", (e: PIXI.FederatedPointerEvent) => this.dragEnd(e));

        window.addEventListener("keydown", this.keys);
        IBC.events.register(Event.HERO_STATE, (hero: HeroRow) => { if (hero.id == this.heroId) this.draw(); }, this);
        IBC.events.register(Event.HERO_DISMISSED, (h: HeroRow) => { if (h.id == this.heroId) IBC.comp.destroy(this); }, this);
        IBC.events.register(Event.COSMETIC_CATALOG, () => { if (this.picking) this.draw(); }, this);
        // opens left of the middle of the screen (so the to-do list, in the middle, doesn't hide it all)
        this.setPosition(Math.max(0, Math.round((window.innerWidth - WIDTH) / 2) - 120), Math.round((window.innerHeight - HEIGHT) / 2) - 40);
    }

    public destroy() {
        super.destroy();
        window.removeEventListener("keydown", this.keys);
        this.dropGhost();
        this.titleBar.destroy();
        this.titleBar = null;
        this.background.destroy();
        this.background = null;
        this.container.destroy({ children: true });
    }

    private get hero() {
        return IBC.data.heroes.get(this.heroId) ?? IBC.data.heroes.viewed(this.heroId);
    }

    // (yours: not someone else's, viewed)
    // whose it's showing
    public get showing() { return this.heroId; }

    private get mine() {
        return !!IBC.data.heroes.get(this.heroId);
    }

    public show(heroId: number) {
        if (heroId != this.heroId) this.skillScroll = 0;
        this.heroId = heroId;
        if (!this.mine) this.picking = false;
        this.drawn = "";        // (someone else's sent again: drawn as they are now)
        this.draw();
    }

    // what's pointed at, in a box over the pointer ("" hides it)
    private say(text: string, tint: number = AP.WHITE) {
        this.tip.removeChildren().forEach((c) => c.destroy({ children: true }));
        this.tip.visible = !!text;
        if (!text) return;
        const back = new PIXI.Graphics();
        this.tip.addChild(back);
        // a line each (split on "\n"), each kept inside the window
        const rows = text.split("\n"), { LINE } = HeroStatus;
        const w = Math.max(...rows.map((row, i) => Math.ceil(fit(this.text(row, 3, 2 + i * LINE, tint, this.tip), HeroStatus.W - 6).textWidth))) + 6;
        const h = 11 + (rows.length - 1) * LINE;
        back.beginFill(AP.BLACK).drawRect(0, 0, w, h).endFill().beginFill(AP.SHADOW).drawRect(1, 1, w - 2, h - 2).endFill();
        this.moveTip();
    }

    private moveTip() {
        if (!this.tip.visible) return;
        const p = this.pointer, { W } = HeroStatus;
        this.tip.position.set(Math.round(Math.max(0, Math.min(p.x + 4, W - this.tip.width))), Math.round(Math.max(0, p.y - 2 - this.tip.height)));
    }

    private draw() {
        const hero = this.hero;
        if (!hero) { IBC.comp.destroy(this); return; }
        // (state comes often: redrawn only when something shown has changed)
        const c = this.conditionsNow(hero);
        const key = JSON.stringify([hero.id, hero.d.l, hero.d.v, hero.d.k, hero.d.e, hero.d.p, hero.d.g, hero.s.w, hero.s.r.length, hero.s.p, IBC.data.heroes.nodeOf(hero)?.te, hero.d.sc, this.picking, c.night, Math.round(c.rain * 20)]);
        if (key == this.drawn) return;
        this.drawn = key;
        this.titleBar.setTitle(`${hero.d.n}: Status`);
        this.sheet.removeChildren().forEach((c) => c.destroy({ children: true }));
        this.skills = null;
        this.skillsTop = Infinity;
        this.drawLeft(hero);
        this.drawGear(hero);
        if (this.picking) this.drawPicker(hero);
        else {
            this.drawStats(hero);
            this.drawSkills(hero, 72);
        }
    }

    //#region the left: who they are, and what they're up to

    private drawLeft(hero: HeroRow) {
        const { PAD, LINE, LEFT_W, STAGE_H } = HeroStatus;
        const h = hero.d, x = PAD, w = LEFT_W;
        this.drawStage(hero, x, 0, w);

        let y = STAGE_H + 5;
        fit(this.line(h.n, x, y, AP.WHITE, this.sheet), w); y += LINE;
        const job = JOBS[h.j];
        this.line(`From ${startTown(h)}`, x, y, AP.SAND, this.sheet); y += LINE;
        this.line(`${job.name} (${job.role})`, x, y, AP.ICE, this.sheet, `${job.does}\n\nJob Skills\nWork 1.1x better\nLearn 1.25x faster\n${job.skills.map((s) => SKILL_NAMES[s]).join(", ")}`); y += LINE + 2;

        // in a fight, and on the road
        const power = heroPower(h), gear = wornPower(h), speed = travelSpeed(h) / TRAVEL_SPEED;
        this.pair("Power", `${Math.round(power)}`, x, y, w, AP.STRAW, `Power in a fight\n${(power - gear).toFixed(1)} from stats\n${gear.toFixed(1)} from gear`); y += LINE;
        this.pair("Travel", `x${speed.toFixed(2)}`, x, y, w, speed > 1 ? AP.LIME : speed < 1 ? AP.FLAME : AP.WHITE, `Travels ${speed.toFixed(2)} miles a second (by Agility)`); y += LINE + 2;

        // what they're doing, and where
        const heroes = IBC.data.heroes, s = hero.s;
        this.text("Now", x, y, AP.STONE, this.sheet);
        const doing = doingText(s, heroes.nameOf, (id) => IBC.data.events.named(id));
        fit(this.line(doing, x + 20, y, AP.SAND, this.sheet), w - 20); y += LINE;
        // (in a formed party: which, first; shared/Parties.ts)
        const party = IBC.data.parties.of(hero.id), at = s.r.length ? `on the road from ${heroes.nameOf(s.p)}` : `at ${heroes.nameOf(s.p)}`;
        const where = party ? `${party.n}, ${at}` : at[0].toUpperCase() + at.slice(1);
        fit(this.line(where, x + 20, y, party ? AP.STRAW : AP.ASH, this.sheet, party ? `In ${party.n} (${party.o}'s): on its to-do list, their own waiting (Parties, in the menu)` : undefined), w - 20); y += LINE;
        // the time of day and the weather there, and what they make of them (shared/Conditions.ts)
        const said = conditionsText(h, this.conditionsNow(hero), s.r.length ? -2 : workSkillOf(s.w));
        const pace = s.r.length ? said.travel : said.work;
        fit(this.line(said.short.split(":")[0] + (Math.abs(pace - 1) > 0.005 ? ` x${pace.toFixed(2)}` : ""), x + 20, y, pace > 1.005 ? AP.LIME : pace < 0.995 ? AP.FLAME : AP.ICE, this.sheet, said.long), w - 20); y += LINE + 2;

        // traits, good and bad
        this.text("Traits", x, y, AP.STONE, this.sheet); y += LINE;
        let tx = x;
        for (const t of h.t) {
            const trait = TRAITS[t];
            if (!trait) continue;
            const tint = trait.worth > 0 ? AP.GRASS : trait.worth < 0 ? AP.FLAME : AP.STRAW;
            const chip = this.chip(trait.name, tint, trait.text);
            if (tx > x && tx + chip.width > x + w) { tx = x; y += 12; }
            chip.position.set(tx, y);
            tx += Math.ceil(chip.width) + 3;
        }

        // their to-do list, cosmetics and journal, as icons (named while pointed at)
        const { ICON_W, ICON_H } = HeroStatus, iy = HeroStatus.H - ICON_H;
        // (someone else's: whose instead, their name clicked opening their profile)
        // (not in demo mode: not their name on a stream)
        if (!this.mine) { if (!IBC.comp.getFirstByType(ComponentType.DEMO_MODE)) this.ownerLine(hero.owner, x, HeroStatus.H - LINE, w); return; }
        this.iconButton(todoIcon(), x, iy, "To-dos", () => TaskPlanner.open(hero.id));
        this.iconButton(cosmeticsIcon(), x + ICON_W + 3, iy, "Cosmetics", () => HeroCosmetics.open(hero.id));
        this.iconButton(journalIcon(), x + (ICON_W + 3) * 2, iy, "Journal", () => HeroJournal.open(hero.id));
    }

    // them standing in the land they're in (camped: by the fire's glow), in a frame
    private drawStage(hero: HeroRow, x: number, y: number, w: number) {
        const H = HeroStatus.STAGE_H;
        const frame = new PIXI.Graphics();
        frame.beginFill(AP.BLACK).drawRect(x, y, w, H + 2).endFill();
        frame.beginFill(AP.IRON).drawRect(x + 1, y + 1, w - 2, H).endFill();
        this.sheet.addChild(frame);

        const stage = new PIXI.Container();
        stage.position.set(x + 2, y + 1);
        const sw = w - 4, sh = H - 1;
        const mask = new PIXI.Graphics().beginFill(0xffffff).drawRect(x + 2, y + 1, sw, sh).endFill();
        this.sheet.addChild(mask, stage);
        stage.mask = mask;

        // the scene picked (none: their window's backdrop, its middle, still)
        const [scene, pose] = sceneOf(hero.d.sc);
        const top = sh - SCENE_H;
        stage.addChild(this.sceneView(hero, scene, sw, sh));
        if (!scene && IBC.data.heroes.resting(hero)) stage.addChild(new PIXI.Graphics().beginFill(AP.AMBER, 0.15).drawCircle(sw / 2, top + FEET_Y - 8, 20).endFill());
        // its lights, twinkling (update)
        if (scene) {
            const g = new PIXI.Graphics();
            stage.addChild(g);
            this.lights = { g, at: statusScene(scene).lights, x: -Math.round((SCENE_W - sw) / 2), y: top, tick: -1 };
        } else this.lights = null;

        const shadow = new PIXI.Sprite(shadowTexture());
        shadow.anchor.set(0.5, 0.5);
        shadow.position.set(sw / 2, top + FEET_Y);
        const person = new PIXI.Sprite(personTexture(hero.d.l, Facing.DOWN, 0));
        person.anchor.set(0.5, 1);
        person.position.set(sw / 2, top + FEET_Y + 1);
        stage.addChild(shadow, person);
        const zzz = this.text("z", 0, 0, AP.WHITE, stage);
        zzz.visible = false;
        if (this.actor?.pose != pose) { this.poseTime = 0; this.wanderTo = -1; this.wanderRest = 0; }
        this.actor = { person, shadow, zzz, looks: hero.d.l, pose, sw, feet: top + FEET_Y };
        this.animate(0);

        // the pencil, top left: picking the scene and what they do in it (lit while pointed at, or open)
        if (!this.mine) return;
        const button = new PIXI.Sprite(iconTexture(editIcon(this.picking)));
        button.position.set(x + 3, y + 2);
        button.eventMode = "static";
        button.cursor = "pointer";
        button.hitArea = new PIXI.Rectangle(-2, -2, 12, 12);
        button.on("pointerover", () => { button.texture = iconTexture(editIcon(true)); });
        button.on("pointerout", () => { button.texture = iconTexture(editIcon(this.picking)); });
        button.on("pointertap", () => { this.picking = !this.picking; this.draw(); });
        this.sheet.addChild(button);
    }

    // a scene, its middle w x h showing (0: the land they're in)
    private sceneView(hero: HeroRow, scene: number, w: number, h: number) {
        const view = new PIXI.Container();
        const off = -Math.round((SCENE_W - w) / 2), top = h - SCENE_H;
        if (scene) {
            const pic = new PIXI.Sprite(sceneTexture(scene));
            pic.position.set(off, top);
            view.addChild(pic);
            return view;
        }
        const land = landTextures(HeroWindow.backdropOf(IBC.data.heroes.nodeOf(hero)?.te));
        const sky = new PIXI.Sprite(land.sky);
        sky.position.set(off, top);
        view.addChild(sky);
        for (const texture of land.strips) {
            const strip = new PIXI.TilingSprite(texture, w, SCENE_H);
            strip.position.set(0, top);
            strip.tilePosition.x = off;
            view.addChild(strip);
        }
        return view;
    }

    // them doing what's picked: pacing up and down the middle, running end to
    // end, wandering about and stopping, hopping, dancing, spinning, looking
    // about, standing, or asleep on the ground
    private animate(deltaTime: number) {
        const a = this.actor;
        if (!a) return;
        const { WALK } = HeroStatus, { WALK_SPEED, STEP_MS } = HeroWindow;
        this.stepTime += deltaTime;
        this.poseTime += deltaTime;
        const step = (ms = STEP_MS) => WALK[Math.floor(this.stepTime / ms) % WALK.length];
        const t = this.poseTime;
        let x = a.sw / 2, lift = 0, facing = Facing.DOWN, frame = 0, lying = false, shadowW = 1;
        switch (POSES[a.pose]) {
            case "Pacing":
            case "Running": {
                const run = POSES[a.pose] == "Running";
                const from = run ? a.sw * 0.12 : a.sw / 4, to = run ? a.sw * 0.88 : a.sw * 3 / 4;
                this.paceX += this.paceDir * WALK_SPEED * (run ? 2.5 : 1) * deltaTime / 1000 / (to - from);
                if (this.paceX >= 1) { this.paceX = 1; this.paceDir = -1; }
                if (this.paceX <= 0) { this.paceX = 0; this.paceDir = 1; }
                x = from + (to - from) * this.paceX;
                facing = this.paceDir < 0 ? Facing.LEFT : Facing.RIGHT;
                frame = step(run ? STEP_MS / 2 : STEP_MS);
                if (run) lift = frame ? 1 : 0;
                break;
            }
            case "Looking about":
                facing = [Facing.DOWN, Facing.LEFT, Facing.DOWN, Facing.RIGHT, Facing.UP][Math.floor(t / 1200) % 5];
                break;
            case "Hopping": {
                const up = Math.sin(((t % 700) / 700) * Math.PI);
                lift = Math.round(up * 7);
                shadowW = 1 - up * 0.4;
                break;
            }
            case "Dancing": {
                const beat = Math.floor(t / 300);
                facing = [Facing.DOWN, Facing.LEFT, Facing.DOWN, Facing.RIGHT][beat % 4];
                frame = beat % 2 ? 1 : 2;
                x += [0, -3, 0, 3][beat % 4];
                lift = beat % 4 == 2 ? 3 : 0;
                break;
            }
            case "Wandering": {
                const stride = WALK_SPEED * deltaTime / 1000 / (a.sw * 0.8);
                if (this.wanderTo < 0) {
                    this.wanderRest -= deltaTime;
                    if (this.wanderRest <= 0) this.wanderTo = Math.random();
                } else {
                    const d = this.wanderTo - this.paceX;
                    if (Math.abs(d) <= stride) { this.paceX = this.wanderTo; this.wanderTo = -1; this.wanderRest = 1000 + Math.random() * 2500; }
                    else {
                        this.paceX += Math.sign(d) * stride;
                        facing = d < 0 ? Facing.LEFT : Facing.RIGHT;
                        frame = step();
                    }
                }
                x = a.sw * (0.1 + 0.8 * this.paceX);
                break;
            }
            case "Sleeping": {
                lying = true;
                shadowW = 2.4;
                const k = (t % 2400) / 2400;
                a.zzz.visible = true;
                a.zzz.text = k < 0.5 ? "z" : "Z";
                a.zzz.position.set(Math.round(x - 14 + k * 6), Math.round(a.feet - 14 - k * 12));
                a.zzz.alpha = 1 - k;
                break;
            }
            case "Spinning":
                facing = [Facing.DOWN, Facing.RIGHT, Facing.UP, Facing.LEFT][Math.floor(t / 110) % 4];
                break;
        }
        if (!lying) a.zzz.visible = false;
        x = Math.round(x);
        a.shadow.x = x;
        a.shadow.scale.x = shadowW;
        a.person.rotation = lying ? -Math.PI / 2 : 0;
        // (lying: their feet by the shadow's right, their head off to the left)
        a.person.position.set(lying ? x + 13 : x, lying ? a.feet - 4 : a.feet + 1 - lift);
        a.person.texture = personTexture(a.looks, facing, frame);
    }

    // a scene's lights, each on and off at its own pace
    private twinkle() {
        const l = this.lights;
        if (!l) return;
        const tick = Math.floor(this.time / 90);
        if (tick == l.tick) return;
        l.tick = tick;
        l.g.clear();
        l.at.forEach(([x, y, c], i) => {
            if (Math.sin(this.time / (260 + (i % 5) * 70) + i * 2.3) < -0.25) return;
            l.g.beginFill(c).drawRect(l.x + x, l.y + y, 1, 1).endFill();
        });
    }

    public update(deltaTime: number) {
        this.time += deltaTime;
        this.animate(deltaTime);
        this.twinkle();
        // (the time of day and the weather change as it's open: looked at now and then)
        if ((this.weatherLook -= deltaTime) <= 0) { this.weatherLook = 2000; this.draw(); }
    }

    // the time of day and the weather where they are now
    private conditionsNow(hero: HeroRow) {
        const heroes = IBC.data.heroes, at = heroes.position(hero), s = hero.s;
        const from = heroes.graph.get(s.p), to = s.r.length ? heroes.graph.get(s.r[0]) : null;
        return conditionsAt(at.x, at.y, Date.now(), !!to && isSeaLeg(from, to));
    }

    //#endregion

    //#region the middle: their gear

    // what's worn, then the tools under a rule, three across, in the middle of the column's height
    private drawGear(hero: HeroRow) {
        const { GEAR, GEAR_W, BOX, BOX_GAP, GRID, H } = HeroStatus, step = BOX + BOX_GAP;
        const wornRows = Math.ceil(GRID.length / 3), toolRows = Math.ceil(TOOLS.length / 3);
        const top = Math.floor((H - ((wornRows + toolRows) * step - BOX_GAP + 6)) / 2);
        this.boxes = [];
        GRID.forEach((slot, i) => { if (slot != null) this.gearBox(hero, slot, GEAR + (i % 3) * step, top + Math.floor(i / 3) * step); });
        const tools = top + wornRows * step + 6;
        this.sheet.addChild(new PIXI.Graphics().beginFill(AP.IRON).drawRect(GEAR, tools - 5, GEAR_W, 1).endFill());
        TOOLS.forEach((_, i) => this.gearBox(hero, Slot.PICKAXE + i, GEAR + (i % 3) * step, tools + Math.floor(i / 3) * step));
    }

    // a slot: what's in it, or its icon (dim); pointed at, its name (or what's in it) over the pointer; clicked, what's in it opens
    private gearBox(hero: HeroRow, slot: Slot, x: number, y: number) {
        const { BOX } = HeroStatus, id = worn(hero.d, slot);
        const box = new PIXI.Container();
        box.position.set(x, y);
        const back = new PIXI.Graphics();
        // (lit while something that goes in it is dragged, brighter while it'd go in it)
        const paint = (over: boolean) => {
            const drop = slot == this.dropSlot, fits = this.dragging && this.fits(this.dragging, slot);
            back.clear()
                .beginFill(drop ? AP.STRAW : over ? AP.STONE : fits ? AP.LEAF : AP.BLACK).drawRect(0, 0, BOX, BOX).endFill()
                .beginFill(drop ? AP.IRON : AP.SLATE).drawRect(1, 1, BOX - 2, BOX - 2).endFill();
        };
        paint(false);
        box.addChild(back);
        if (id) {
            const sprite = new PIXI.Sprite(itemTexture(id));
            sprite.position.set(Math.floor((BOX - sprite.width) / 2), Math.floor((BOX - sprite.height) / 2));
            box.addChild(sprite);
        } else {
            const icon = new PIXI.Sprite(taskIcon(HeroStatus.ICONS[slot]));
            icon.alpha = 0.35;
            icon.position.set(Math.floor((BOX - TASK_ICON) / 2), Math.floor((BOX - TASK_ICON) / 2));
            box.addChild(icon);
        }
        box.eventMode = "static";
        if (id) box.cursor = "pointer";
        box.hitArea = new PIXI.Rectangle(0, 0, BOX, BOX);
        box.on("pointerover", () => { paint(true); if (!this.ghost) this.say(id ? this.gearSays(id, slot) : SLOT_NAMES[slot]); });
        box.on("pointerout", () => { paint(false); this.say(""); });
        if (id && !this.mine) box.on("pointertap", () => ItemInfo.open(id));
        else if (id) {
            box.on("pointerdown", (e: PIXI.FederatedPointerEvent) => { this.press = { slot, id, from: e.global.clone() }; this.dragged = false; });
            box.on("pointertap", () => { if (!this.dragged) ItemInfo.open(id); });
        }
        this.sheet.addChild(box);
        this.boxes.push({ slot, box, paint });
    }

    // what's in a slot, pointed at: its name, its tier and quality, what it's worth worn (a potion
    // or meal: how many are left in the stash for them to use)
    private gearSays(id: number, slot: Slot) {
        const q = qualityOf(id), worth = itemWorth(id);
        const rows = [itemName(id), `Tier ${itemTier(id)}${q ? `, ${QUALITY_NAMES[q]}` : ""}`];
        if (worth) rows.push(worth);
        if (this.mine && SUPPLY_SLOTS.includes(slot)) rows.push(`${(IBC.data.inventory.items.get(id)?.amount ?? 0).toLocaleString("en-US")} in the stash`);
        return rows.join("\n");
    }

    // whether a thing goes in a slot
    private fits(id: number, slot: Slot) {
        const recipe = recipeOf(id);
        return !!recipe && slotsFor(recipe.type).includes(slot);
    }

    // the slot under a point on screen that a thing goes in (-1: none)
    private slotUnder(global: PIXI.IPointData, id: number) {
        const b = this.boxes.find((b) => b.box.getBounds().contains(global.x, global.y));
        return b && this.fits(id, b.slot) ? b.slot : -1;
    }

    // the window, if it's open and under a point on screen
    public static under(global: PIXI.IPointData) {
        const view = IBC.comp.getFirstByType(ComponentType.HERO_STATUS) as HeroStatus;
        return view && view.container.getBounds().contains(global.x, global.y) ? view : null;
    }

    // something dragged (from the Inventory, or off a slot) is at a point on screen: the slots it goes in lit (0: nothing dragged)
    public dragOver(id: number, global?: PIXI.IPointData, from = -1) {
        const slot = id ? this.slotUnder(global, id) : -1, drop = slot == from ? -1 : slot;
        if (id == this.dragging && drop == this.dropSlot) return;
        this.dragging = id;
        this.dropSlot = drop;
        for (const b of this.boxes) b.paint(false);
    }

    // something from the Inventory let go over the window: on a slot it goes in, it's put on (false: it wasn't)
    public drop(id: number, global: PIXI.IPointData) {
        const slot = this.mine ? this.slotUnder(global, id) : -1;
        this.dragOver(0);
        if (slot < 0) return false;
        IBC.net.hero.equip(this.heroId, slot as Slot, id);
        return true;
    }

    // after a few px a pressed slot's thing is picked up, its sprite following the pointer
    private dragMove(e: PIXI.FederatedPointerEvent) {
        const p = this.press;
        if (!p) return;
        if (!this.ghost) {
            if (Math.abs(e.global.x - p.from.x) + Math.abs(e.global.y - p.from.y) < HeroStatus.DRAG_PX) return;
            this.dragged = true;
            this.say("");
            this.ghost = new PIXI.Sprite(itemTexture(p.id));
            this.ghost.anchor.set(0.5);
            this.ghost.scale.set(HeroStatus.SCALE);
            this.ghost.alpha = 0.9;
            this.ghost.eventMode = "none";
            this.ghost.zIndex = Number.MAX_SAFE_INTEGER;
            IBC.pixi.stage.addChild(this.ghost);
        }
        this.ghost.position.set(Math.round(e.global.x), Math.round(e.global.y));
        this.dragOver(p.id, e.global, p.slot);
    }

    // let go: taken off, or on another slot it goes in, moved there (back on its own, left as it was)
    private dragEnd(e: PIXI.FederatedPointerEvent) {
        const p = this.press;
        this.press = null;
        if (!p || !this.ghost) return;
        this.dropGhost();
        const to = this.slotUnder(e.global, p.id);
        this.dragOver(0);
        if (to == p.slot) return;
        IBC.net.hero.equip(this.heroId, p.slot, 0);
        if (to >= 0) IBC.net.hero.equip(this.heroId, to as Slot, p.id);
    }

    private dropGhost() {
        if (!this.ghost) return;
        this.ghost.destroy();
        this.ghost = null;
    }

    //#endregion

    //#region the scene picker, over the right

    // every scene, a little one of each, and what they can do in it; picked, it's theirs at once
    private drawPicker(hero: HeroRow) {
        const { RIGHT, RIGHT_W } = HeroStatus;
        const [scene, pose] = sceneOf(hero.d.sc);
        this.heading("Scene", RIGHT, 0, RIGHT_W);
        const tw = 42, th = 22, cols = 5, gap = Math.floor((RIGHT_W - 2 - cols * tw) / (cols - 1));
        SCENES.forEach((name, i) => {
            const cell = new PIXI.Container();
            cell.position.set(RIGHT + 1 + (i % cols) * (tw + gap), 13 + Math.floor(i / cols) * (th + 4));
            const on = i == scene;
            const border = new PIXI.Graphics();
            const paint = (over: boolean) => border.clear().beginFill(on ? AP.STRAW : over ? AP.STEEL : AP.BLACK).drawRect(-1, -1, tw + 2, th + 2).endFill();
            paint(false);
            const view = this.sceneView(hero, i, tw * 2, th * 2);
            view.scale.set(0.5);
            const mask = new PIXI.Graphics().beginFill(0xffffff).drawRect(0, 0, tw, th).endFill();
            view.mask = mask;
            // (one that isn't everyone's: its corner, and theirs to pick or not - the cosmetics catalog's BACKDROP)
            const { catalog, access } = IBC.data.cosmetics, corner = new PIXI.Graphics();
            const mine = on || owns(catalog, BACKDROP, i, access);
            tierCorner(corner, tw, 0, tierOf(catalog, BACKDROP, i));
            if (!mine) view.alpha = 0.5;
            cell.addChild(border, view, mask, corner);
            cell.eventMode = "static";
            cell.cursor = "pointer";
            cell.hitArea = new PIXI.Rectangle(-1, -1, tw + 2, th + 2);
            const land = HeroWindow.backdropOf(IBC.data.heroes.nodeOf(hero)?.te);
            const said = !i ? `${name}: the ${land} they're in` : mine ? name : `${name}: ${whose(BACKDROP, i)}`;
            cell.on("pointerover", () => { paint(true); this.say(said, on || !mine ? AP.STRAW : AP.ASH); });
            cell.on("pointerout", () => { paint(false); this.say(""); });
            cell.on("pointertap", () => { if (!on && mine) this.setScene(hero, [i, pose]); });
            this.sheet.addChild(cell);
        });

        const py = 13 + Math.ceil(SCENES.length / cols) * (th + 4) + 2;
        this.heading("Doing", RIGHT, py, RIGHT_W);
        let x = RIGHT, y = py + 12;
        POSES.forEach((name, i) => {
            const on = i == pose;
            const chip = this.toggle(name, on, () => { if (!on) this.setScene(hero, [scene, i]); }, `${hero.d.n}: ${name.toLowerCase()}`);
            if (x > RIGHT && x + chip.width > RIGHT + RIGHT_W) { x = RIGHT; y += 13; }
            chip.position.set(x, y);
            x += Math.ceil(chip.width) + 3;
        });

        const done = this.toggle("Done", false, () => { this.picking = false; this.say(""); this.draw(); }, "Back to their stats and skills");
        done.position.set(RIGHT + RIGHT_W - Math.ceil(done.width), HeroStatus.H - 11);
    }

    // a word in a box, lit when it's the one picked
    private toggle(text: string, on: boolean, tap: () => void, more: string) {
        const chip = new PIXI.Container();
        const t = this.text(text, 4, 2, on ? AP.WHITE : AP.ASH, chip);
        const w = Math.ceil(t.textWidth) + 8, box = new PIXI.Graphics();
        const paint = (over: boolean) => box.clear()
            .beginFill(on ? AP.STRAW : AP.BLACK).drawRect(0, 0, w, 11).endFill()
            .beginFill(on ? AP.IRON : over ? AP.SLATE : AP.SHADOW).drawRect(1, 1, w - 2, 9).endFill();
        paint(false);
        chip.addChildAt(box, 0);
        chip.eventMode = "static";
        chip.cursor = "pointer";
        chip.hitArea = new PIXI.Rectangle(0, 0, w, 11);
        chip.on("pointerover", () => { paint(true); this.say(more); });
        chip.on("pointerout", () => { paint(false); this.say(""); });
        chip.on("pointertap", tap);
        this.sheet.addChild(chip);
        return chip;
    }

    // their scene and pose, shown now and kept on the server (HERO_SCENE)
    private setScene(hero: HeroRow, s: [number, number]) {
        if (s[0] || s[1]) hero.d.sc = s; else delete hero.d.sc;
        IBC.net.hero.scene(hero.id, s);
        this.draw();
    }

    //#endregion

    //#region the right: stats and skills

    private drawStats(hero: HeroRow) {
        const { RIGHT, RIGHT_W, LINE, STAT_MOST } = HeroStatus;
        const h = hero.d, stats = wornStats(h);
        this.heading("Stats", RIGHT, 0, RIGHT_W);
        const nameW = 55, numW = 30, barW = RIGHT_W - nameW - numW;
        stats.forEach((v, s) => {
            const y = 12 + s * LINE;
            const tint = v > 10 ? AP.LIME : v < 10 ? AP.FLAME : AP.WHITE;
            const leans = SKILL_STAT.map((stat, k) => stat == s ? SKILL_NAMES[k] : null).filter((n) => n);
            const extra = v - h.s[s];
            const more = [`${STAT_NAMES[s]} ${v}`, ...(extra ? [`${extra > 0 ? "+" : ""}${extra} from traits and jewellery`] : []),
                `Works at ${(1 + 0.02 * (v - 10)).toFixed(2)}x`, ...(leans.length ? [`Skills: ${leans.join(", ")}`] : [])].join("\n");
            this.line(STAT_NAMES[s], RIGHT, y, AP.MIST, this.sheet, more);

            // the bar: its notch at 10 (where an ordinary hero is)
            const bar = new PIXI.Graphics(), bx = RIGHT + nameW, by = y + 1;
            bar.beginFill(AP.BLACK).drawRect(bx, by, barW, 6).endFill();
            bar.beginFill(AP.SHADOW).drawRect(bx + 1, by + 1, barW - 2, 4).endFill();
            const fill = Math.round((barW - 2) * Math.min(1, Math.max(0, v) / STAT_MOST));
            const [lit, dark] = v > 10 ? [AP.LIME, AP.LEAF] : v < 10 ? [AP.FLAME, AP.RED] : [AP.ASH, AP.STONE];
            bar.beginFill(dark).drawRect(bx + 1, by + 1, fill, 4).endFill();
            bar.beginFill(lit).drawRect(bx + 1, by + 1, fill, 2).endFill();
            bar.beginFill(AP.STEEL).drawRect(bx + 1 + Math.round((barW - 2) / 2), by, 1, 6).endFill();
            this.sheet.addChild(bar);

            const num = this.text(`${v}`, 0, y, tint, this.sheet);
            if (extra) this.text(`${extra > 0 ? "+" : ""}${extra}`, RIGHT + RIGHT_W - 12, y, AP.STRAW, this.sheet);
            num.x = RIGHT + nameW + barW + 4;
        });
    }

    // Their skills under the stats, in a list the wheel scrolls: Core Skills,
    // then Extended Skills (the ones they've learned, most first, then
    // specialties they've yet to), drawn alike: a cell each with the level
    // and how far into it.
    private drawSkills(hero: HeroRow, top: number) {
        const { RIGHT, RIGHT_W, SKILL_H, H } = HeroStatus;
        const h = hero.d, job = JOBS[h.j];
        const training = hero.s.r.length ? null : taskSkill(hero.s.w)?.[0];
        const list = new PIXI.Container();
        const mask = new PIXI.Graphics().beginFill(0xffffff).drawRect(RIGHT - 2, top, RIGHT_W + 4, H - top).endFill();
        list.mask = mask;
        this.sheet.addChild(mask, list);
        this.skills = list;
        this.skillsTop = top;
        // two columns, down the first then the second
        const colW = Math.floor((RIGHT_W - 4) / 2);
        const grid = (n: number, y: number) => {
            const rows = Math.ceil(n / 2);
            return (i: number): [number, number] => [RIGHT + Math.floor(i / rows) * (colW + 4), y + (i % rows) * SKILL_H];
        };

        let y = top;
        this.heading("Core Skills", RIGHT, y, RIGHT_W, list, "Core skills: every hero has them"); y += 12;
        const core = grid(SKILL_NAMES.length, y);
        SKILL_NAMES.forEach((name, s) => {
            const level = h.k[s], xp = Math.floor(h.v?.[s] ?? XP_AT[level]);
            const job_ = job.skills.includes(s), special = isSpecialty(h, s), now = s == training;
            const more = [`${name} ${level}`, this.into(level, xp), `Works at ${workRate(h, s as Skill).toFixed(2)}x`,
                ...this.why(job_, special), ...(now ? ["Training now"] : [])].join("\n");
            this.skillCell(list, ...core(s), colW, name, level, levelPart(h, s), now, job_, special, more);
        });
        y += Math.ceil(SKILL_NAMES.length / 2) * SKILL_H + 4;

        this.heading("Extended Skills", RIGHT, y, RIGHT_W, list, "Extended skills: anyone can learn them, at an academy or out in the wild"); y += 12;
        const known = [...h.e].sort((a, b) => b[1] - a[1]).map(([e]) => e);
        const waiting = (h.p ?? []).filter((id) => isExtended(id) && !known.includes(id - EXT)).map((id) => id - EXT);
        const all = [...known, ...waiting];
        if (!all.length) {
            this.text("None learned yet", RIGHT, y + 2, AP.ASH, list);
            y += 12;
        }
        const ext = grid(all.length, y);
        all.forEach((e, i) => {
            const name = EXTENDED[e], level = extLevel(h, e), special = isSpecialty(h, EXT + e);
            const more = (level
                ? [`${name} ${level}`, this.into(level, Math.floor(extXp(h, e))), ...this.why(false, special)]
                : [name, "Not learned yet", "Learned at an academy, or out in the wild", ...this.why(false, special)]).join("\n");
            this.skillCell(list, ...ext(i), colW, name, level, extLevelPart(h, e), false, false, special, more);
        });
        y += Math.ceil(all.length / 2) * SKILL_H;

        this.skillsH = y - top;
        this.scrollSkills(0);
    }

    // (kept from running past either end)
    private scrollSkills(by: number) {
        if (!this.skills) return;
        const room = HeroStatus.H - this.skillsTop;
        this.skillScroll = Math.max(0, Math.min(this.skillScroll + by, this.skillsH - room));
        this.skills.y = -this.skillScroll;
    }

    // "120/350 XP to 6", or mastered
    private into(level: number, xp: number) {
        return level >= SKILL_MAX ? "Mastered" : `${xp - XP_AT[level]}/${levelXp(level)} XP to ${level + 1}`;
    }

    // a skill hint's lines for it being their job's, or a specialty
    private why(job: boolean, special: boolean) {
        return [...(job ? ["Job skill: 1.25x XP"] : []), ...(special ? [`Specialty: ${SPECIALTY_XP}x XP`] : [])];
    }

    // a skill's cell: its name (a gem by it if their job's, * if a specialty),
    // level (- if not learned) and a line for how far into the level
    private skillCell(parent: PIXI.Container, cx: number, cy: number, colW: number, name: string, level: number, part: number,
        now: boolean, job: boolean, special: boolean, more: string) {
        const { SKILL_H } = HeroStatus;
        const cell = new PIXI.Container();
        cell.position.set(cx, cy);
        const back = new PIXI.Graphics();
        back.beginFill(AP.BLACK).drawRect(0, 0, colW, SKILL_H - 1).endFill();
        back.beginFill(now ? AP.IRON : level ? AP.SLATE : AP.SHADOW).drawRect(1, 1, colW - 2, SKILL_H - 3).endFill();
        if (now) back.beginFill(AP.LIME).drawRect(1, 1, 2, SKILL_H - 3).endFill();
        cell.addChild(back);

        if (special) this.text("*", 4, 2, AP.STRAW, cell);
        else if (job) cell.addChild(new PIXI.Graphics().beginFill(AP.ICE).drawPolygon([6, 2.5, 8.5, 5, 6, 7.5, 3.5, 5]).endFill());
        this.text(name, 11, 2, level > 1 ? AP.WHITE : level ? AP.ASH : AP.STONE, cell);
        const lv = this.text(level ? `${level}` : "-", 0, 2, level >= SKILL_MAX ? AP.STRAW : now ? AP.LIME : level ? AP.SAND : AP.STONE, cell);
        lv.x = colW - 4 - Math.ceil(lv.textWidth);

        const bw = colW - 15;
        cell.addChild(new PIXI.Graphics()
            .beginFill(AP.SHADOW).drawRect(11, SKILL_H - 4, bw, 1).endFill()
            .beginFill(now ? AP.LIME : AP.SKY).drawRect(11, SKILL_H - 4, Math.round(bw * part), 1).endFill());

        cell.eventMode = "static";
        cell.hitArea = new PIXI.Rectangle(0, 0, colW, SKILL_H - 1);
        cell.on("pointerover", () => this.say(more));
        cell.on("pointerout", () => this.say(""));
        // the mark says what it means, in a box by the pointer (the cell's own words again off it)
        if (special || job) {
            const mark = new PIXI.Container();
            mark.eventMode = "static";
            mark.hitArea = new PIXI.Rectangle(2, 1, 8, SKILL_H - 3);
            const says = special ? `Specialty\nLearn ${SPECIALTY_XP}x faster${job ? " (and their job's)" : ""}` : "Job skill\nWork 1.1x better\nLearn 1.25x faster";
            mark.on("pointerover", (e: PIXI.FederatedPointerEvent) => { e.stopPropagation(); this.say(says); });
            mark.on("pointerout", (e: PIXI.FederatedPointerEvent) => { e.stopPropagation(); this.say(more); });
            cell.addChild(mark);
        }
        parent.addChild(cell);
    }

    //#endregion

    //#region bits

    private text(text: string, x: number, y: number, tint: number, parent: PIXI.Container) {
        const t = new PIXI.BitmapText(text, { fontName: Constants.PIXEL_FONT, fontSize: 32 });
        t.tint = tint;
        t.position.set(x, y);
        t.eventMode = "none";
        parent.addChild(t);
        return t;
    }

    // "Name's hero", the name lit under the pointer and clicked opening their profile (shared/Profile.ts)
    private ownerLine(owner: string, x: number, y: number, w: number) {
        if (!owner) return;
        const name = this.text(owner, x, y, AP.SKY, this.sheet);
        fit(name, w);
        const nw = Math.min(Math.ceil(name.textWidth), w);
        if (nw < w) fit(this.text("'s hero", x + nw, y, AP.ASH, this.sheet), w - nw);
        name.eventMode = "static";
        name.cursor = "pointer";
        name.hitArea = new PIXI.Rectangle(-1, -1, nw + 2, HeroStatus.LINE - 1);
        name.on("pointerover", () => { name.tint = AP.ICE; this.say(`See ${owner}'s profile`); });
        name.on("pointerout", () => { name.tint = AP.SKY; this.say(""); });
        name.on("pointerdown", (e: PIXI.FederatedPointerEvent) => e.stopPropagation());
        name.on("pointertap", () => Profile.open(owner));
    }

    // a line that says more while it's pointed at
    private line(text: string, x: number, y: number, tint: number, parent: PIXI.Container, more?: string) {
        const t = this.text(text, x, y, tint, parent);
        if (more) {
            t.eventMode = "static";
            t.hitArea = new PIXI.Rectangle(-1, -1, Math.ceil(t.textWidth) + 2, HeroStatus.LINE - 1);
            t.on("pointerover", () => this.say(more));
            t.on("pointerout", () => this.say(""));
        }
        return t;
    }

    // a name on the left, its value on the right
    private pair(name: string, value: string, x: number, y: number, w: number, tint: number, more: string) {
        this.line(name, x, y, AP.MIST, this.sheet, more);
        const v = this.text(value, 0, y, tint, this.sheet);
        v.x = x + w - Math.ceil(v.textWidth);
    }

    // a heading with a rule from it to the end of the column
    private heading(text: string, x: number, y: number, w: number, parent = this.sheet, more?: string) {
        const t = this.line(text, x, y, AP.STRAW, parent, more);
        const from = x + Math.ceil(t.textWidth) + 4;
        parent.addChild(new PIXI.Graphics().beginFill(AP.IRON).drawRect(from, y + 3, x + w - from, 1).endFill());
    }

    // a word in a little rounded box, saying more while pointed at
    private chip(text: string, tint: number, more: string) {
        const chip = new PIXI.Container();
        const t = this.text(text, 3, 2, tint, chip);
        const w = Math.ceil(t.textWidth) + 6;
        chip.addChildAt(new PIXI.Graphics()
            .beginFill(AP.BLACK).drawRoundedRect(0, 0, w, 11, 3).endFill()
            .beginFill(AP.SLATE).drawRoundedRect(1, 1, w - 2, 9, 2).endFill(), 0);
        chip.eventMode = "static";
        chip.hitArea = new PIXI.Rectangle(0, 0, w, 11);
        chip.on("pointerover", () => this.say(more));
        chip.on("pointerout", () => this.say(""));
        this.sheet.addChild(chip);
        return chip;
    }

    // a button with an icon on it, saying what it is while it's pointed at
    private iconButton(pic: Pic, x: number, y: number, more: string, tap: () => void) {
        const { ICON_W, ICON_H } = HeroStatus;
        const button = new PIXI.Container();
        button.position.set(x, y);
        const box = new PIXI.Graphics();
        const paint = (over: boolean) => box.clear()
            .beginFill(AP.BLACK).drawRect(0, 0, ICON_W, ICON_H).endFill()
            .beginFill(over ? AP.STEEL : AP.IRON).drawRect(1, 1, ICON_W - 2, ICON_H - 2).endFill();
        paint(false);
        const icon = new PIXI.Sprite(iconTexture(pic));
        icon.position.set(Math.round((ICON_W - pic.w) / 2), Math.round((ICON_H - pic.h) / 2));
        button.addChild(box, icon);
        button.eventMode = "static";
        button.cursor = "pointer";
        button.hitArea = new PIXI.Rectangle(0, 0, ICON_W, ICON_H);
        button.on("pointerover", () => { paint(true); this.say(more); });
        button.on("pointerout", () => { paint(false); this.say(""); });
        button.on("pointertap", tap);
        this.sheet.addChild(button);
    }

    //#endregion

}

// the icons' textures, made once each
const icons = new Map<Pic, PIXI.Texture>();
function iconTexture(pic: Pic) {
    let texture = icons.get(pic);
    if (!texture) icons.set(pic, texture = picTexture(pic));
    return texture;
}

// a backdrop's sky and strips as textures, made once a kind a season (art/Seasonal)
const lands = new Map<string, { sky: PIXI.Texture, strips: PIXI.Texture[] }>();
export function landTextures(kind: Backdrop) {
    const season = worldSeasonAt(Date.now()).k, key = `${kind}:${season}`;
    let land = lands.get(key);
    if (!land) {
        const art = backdropArt(kind, season);
        land = { sky: picTexture(art.sky), strips: art.strips.map((s) => picTexture(s.pic)) };
        lands.set(key, land);
    }
    return land;
}

// a picked scene's picture as a texture, made once each
const scenes = new Map<number, PIXI.Texture>();
export function sceneTexture(scene: number) {
    let texture = scenes.get(scene);
    if (!texture) scenes.set(scene, texture = picTexture(statusScene(scene).pic));
    return texture;
}

// them in their status window, and what they're doing there
interface Actor {
    person: PIXI.Sprite;
    shadow: PIXI.Sprite;
    zzz: PIXI.BitmapText;               // (asleep: drifting up from them)
    looks: HeroRow["d"]["l"];
    pose: number;                       // in POSES
    sw: number;                         // the stage's width
    feet: number;                       // the row their feet are on
}
