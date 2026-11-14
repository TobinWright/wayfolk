import * as PIXI from "pixi.js";
import { healRate } from "../../../../shared/Fights";
import { barracksSlots, extLevel, extLevelPart, heroSlots, isExtended, JOBS, levelPart, skillName } from "../../../../shared/Heroes";
import { heroPower } from "../../../../shared/Locations";
import { doingText, TaskKind, taskSkill } from "../../../../shared/Tasks";
import { Constants } from "../../constants/Constants";
import { Event } from "../../constants/Events";
import { AP } from "../../constants/Palette";
import { HeroRow } from "../../data/HeroesData";
import { IBC } from "../../Engine";
import { Facing } from "../../people/AvatarArt";
import { personTexture, shadowTexture } from "../../people/People";
import { store } from "../../shared/dom/Dom";
import { Panel } from "../../shared/Panel";
import { Hint } from "../../shared/ui/Hint";
import { ScrollView } from "../../shared/ui/ScrollView";
import { TitleBar } from "../../shared/ui/titlebar/TitleBar";
import { BaseComponent, ComponentType } from "../BaseComponent";
import { Chat } from "../chat/Chat";
import { HeroBoard } from "../heroboard/HeroBoard";
import { fit } from "../heroroster/HeroRoster";
import { HeroStatus } from "../herostatus/HeroStatus";
import { progressTint, TaskPlanner, taskProgress } from "../taskplanner/TaskPlanner";

// All your heroes in one window (the main menu's Heroes), a row a roster
// slot (the user, 2026-11-02: "needs some love"). A hero's row: them standing
// in a frame with their health under them, their name, job and power, a dot by
// what they're doing (lit by how they are: waiting on you, idle, hurt, held up,
// on the road or at work; the ones needing you striped down the left), where
// they are and what they're training (its level, how far into it under that),
// and how far into what they're doing now along the bottom (kept up as it
// goes; pointed at, what they're doing shows whole). Down the right, To-do
// opens their list (how much is on it in the button), Status (or clicking the
// row) their status, and Dismiss (never on the last hero: the first hire's
// free while you have none) asks in the row first - Dismiss or Keep. The top counts them, says how many are waiting on
// you, idle or hurt, and sorts them (roster order, by power, the ones needing
// you first, or by name; remembered). An empty slot has a button to the hiring
// board. Taller than the screen, the rows scroll. It keeps up as they work
// (HERO_STATE) and as heroes are hired (HERO_HIRED) and let go (HERO_DISMISSED).
//
// The barracks (the user, 2026-11-06; shared/Heroes.ts barracksSlots): Barracks
// along the top shows those in it instead, a row a bed - them, where they were
// left, how much of their list is kept, healing - with Call up (the roster
// full: back to it to pick who goes in their place, each row's buttons a
// Swap, Cancel or Escape to stop), Gear off (all of it back to the stash, for
// the others) and Dismiss. A roster row's Barracks sends them there (never
// the last, nor with it full).

// how a hero is, for their row's dot and the sort: what needs you most first
enum How { WAITING, IDLE, HURT, HELD, ROAD, BUSY }
const HOW_TINT = [AP.PINK, AP.AMBER, AP.FLAME, AP.STRAW, AP.SKY, AP.LIME];
const HOW_HINT = ["Waiting on your answer", "Idle: give them something to do", "Recovering from a fight", "Held up on the road", "On the road", "Working"];

function howOf(hero: HeroRow) {
    const s = hero.s;
    if (s.c) return How.WAITING;
    if (s.o) return How.HURT;
    if (s.y) return How.HELD;
    if (!s.w) return How.IDLE;
    return s.r.length ? How.ROAD : How.BUSY;
}

const SORTS = ["Roster", "Power", "Needs you", "Name"];

// a row's bars kept up every frame: how far into what they're doing (none while it
// asks whether to let them go, or in the barracks), `w` wide, and their health
// as they heal (in the barracks: as if resting)
interface Live { id: number; task: PIXI.Graphics; w: number; health: PIXI.Graphics; benched?: boolean; }

enum Tab { ROSTER, BARRACKS }
const REFUSED_MS = 4000;

export class Adventurers extends BaseComponent {

    public static SCALE = 2;
    public static W = 328;             // in its own px
    public static PAD = 4;
    public static TOP = 14;             // the rows start under the count
    public static ROW_H = 52;
    public static GAP = 3;
    public static FRAME_W = 28;         // the frame they stand in
    public static BUTTON_W = 54;
    // the window round it, in screen px
    public static INSET_X = 12;
    public static INSET_Y = 28;         // (under the title bar)
    public static MARGIN = 40;          // (kept clear above and below it on the screen)
    public static WIDTH = Adventurers.INSET_X * 2 + Adventurers.W * Adventurers.SCALE;

    private drawn = "";                 // (what it was drawn from: redrawn when it changes)
    private h = 0;                      // its height in its own px (the rows as shown)
    private asking = -1;                // (the hero whose row asks whether to let them go, or none)
    private tab = Tab.ROSTER;
    private swapIn = -1;                // (one in the barracks being called up, the roster full: who goes in their place is picked; or none)
    private refused = "";               // (why a swap was refused, along the top a few seconds)
    private refusedUntil = 0;
    private sort = Math.max(0, SORTS.indexOf(store.get(Constants.LS_HERO_SORT)));
    private live: Live[] = [];

    public background: Panel;
    public titleBar: TitleBar;
    private content: PIXI.Container;
    private back: PIXI.Graphics;
    private head: PIXI.Container;
    private rows: ScrollView;

    // (Escape: Keep first, if a row's asking; then a swap being picked stopped)
    private keys = (e: KeyboardEvent) => {
        if (e.key != "Escape" || Chat.takes(e)) return;
        if (this.asking >= 0) this.ask(-1);
        else if (this.swapIn >= 0) this.pickSwap(-1);
        else IBC.comp.destroy(this);
    };

    constructor() {
        super(ComponentType.ADVENTURERS);
        this.create();
    }

    public create() {
        super.create();
        // (so clicking on it doesn't reach the map under it)
        this.container.eventMode = "static";
        this.container.on("pointerdown", (e: PIXI.FederatedPointerEvent) => e.stopPropagation());

        this.background = new Panel(this.container);

        this.titleBar = new TitleBar(this);
        this.titleBar.setPosition(4, 4);
        this.titleBar.setTitle("Heroes");

        this.content = new PIXI.Container();
        this.content.scale.set(Adventurers.SCALE);
        this.content.position.set(Adventurers.INSET_X, Adventurers.INSET_Y);
        this.container.addChild(this.content);

        // (the panel's middle lets the map through)
        this.back = new PIXI.Graphics();
        this.head = new PIXI.Container();
        this.content.addChild(this.back, this.head);
        // (its bar thin, just right of the rows)
        const { W, TOP } = Adventurers;
        this.rows = new ScrollView(this.content, W + 4, 1);
        this.rows.position(0, TOP);
        this.rows.scrollbar.clear().beginFill(AP.STEEL).drawRect(0, 0, 2, 40).endFill();
        this.rows.scrollbar.x = W + 1;

        window.addEventListener("keydown", this.keys);
        IBC.events.register(Event.HERO_STATE, () => this.draw(), this);
        IBC.events.register(Event.HERO_HIRED, () => this.draw(), this);
        IBC.events.register(Event.HERO_DISMISSED, () => this.draw(), this);
        IBC.events.register(Event.HERO_BARRACKS, () => this.draw(), this);
        IBC.events.register(Event.HERO_SWAPPED, () => { this.swapIn = -1; this.draw(); }, this);
        IBC.events.register(Event.HERO_REFUSED, (why: string) => {
            this.refused = why;
            this.refusedUntil = Date.now() + REFUSED_MS;
            this.draw();
        }, this);
        this.draw();
        this.setPosition(Math.round((window.innerWidth - Adventurers.WIDTH) / 2), Math.round((window.innerHeight - this.height) / 2));
    }

    public destroy() {
        super.destroy();
        window.removeEventListener("keydown", this.keys);
        this.live = [];
        this.rows.destroy();
        this.rows = null;
        this.titleBar.destroy();
        this.titleBar = null;
        this.background.destroy();
        this.background = null;
        this.container.destroy({ children: true });
    }

    // (how many rows fit by the screen's height)
    public resize() {
        this.drawn = "";
        this.draw();
    }

    public update(deltaTime: number) {
        this.live.forEach((live) => this.fillBars(live));
        if (this.refused && Date.now() >= this.refusedUntil) { this.refused = ""; this.draw(); }
    }

    // in screen px
    private get height() {
        return Adventurers.INSET_Y + this.h * Adventurers.SCALE + Adventurers.INSET_X;
    }

    private draw() {
        const heroes = IBC.data.heroes, premium = IBC.data.premium.active, benched = this.tab == Tab.BARRACKS;
        if (!heroes.benched(this.swapIn)) this.swapIn = -1;
        if (benched) this.swapIn = -1;
        const list = benched ? heroes.barracks : heroes.heroes, slots = benched ? barracksSlots(premium) : heroSlots(premium);
        if (benched ? !heroes.benched(this.asking) : (!heroes.get(this.asking) || list.length <= 1)) this.asking = -1;
        if (this.swapIn >= 0) this.asking = -1;
        // (state comes often: redrawn only when something shown has changed)
        const key = JSON.stringify([this.tab, this.swapIn, this.refused, heroSlots(premium), barracksSlots(premium), heroes.heroes.length, heroes.barracks.length, this.asking, this.sort,
            list.map((h) => [h.id, h.d.l, h.d.k, h.d.v, h.d.e, h.d.g, h.s.w, h.s.d, h.s.q.length, h.s.r.length, h.s.p, !!h.s.c, h.s.o, h.s.y])]);
        if (key == this.drawn) return;
        this.drawn = key;

        const { W, TOP, ROW_H, GAP, WIDTH, SCALE, INSET_X, INSET_Y, MARGIN } = Adventurers;
        const count = Math.max(slots, list.length), whole = count * (ROW_H + GAP) - GAP;
        // (as many rows as fit on the screen; the rest scroll)
        const most = Math.floor((window.innerHeight - 2 * MARGIN - INSET_Y - INSET_X) / SCALE) - TOP;
        const view = Math.max(ROW_H, Math.min(whole, most));
        const h = TOP + view + 1;
        if (h != this.h) {
            this.h = h;
            this.background.setSize(WIDTH, this.height);
            this.titleBar.setSize(WIDTH - 8, 20);
            this.container.hitArea = new PIXI.Rectangle(0, 0, WIDTH, this.height);
            this.back.clear().beginFill(AP.INK).drawRect(-4, -2, W + 8, h + 3).endFill();
        }
        this.rows.setViewHeight(view);
        this.rows.container.hitArea = new PIXI.Rectangle(0, 0, W + 4, view);
        this.rows.setContentHeight(whole);
        this.rows.scrollbar.visible = whole > view;

        this.drawHead(list, slots);

        this.live = [];
        this.rows.content.removeChildren().forEach((c) => c.destroy({ children: true }));
        const order = this.order(list);
        for (let i = 0; i < count; i++) {
            const y = i * (ROW_H + GAP);
            if (order[i]) (benched ? this.drawBenched(order[i], y) : this.drawHero(order[i], y));
            else if (benched) this.drawBed(y);
            else this.drawEmpty(y);
        }
    }

    // the count, how many need you, the barracks, and the sort; in the
    // barracks, its count and the way back; picking who's swapped out, the question
    private drawHead(list: HeroRow[], slots: number) {
        const { W, PAD } = Adventurers, heroes = IBC.data.heroes, premium = IBC.data.premium.active;
        this.head.removeChildren().forEach((c) => c.destroy({ children: true }));
        const tabTo = (tab: Tab) => { this.tab = tab; this.asking = this.swapIn = -1; this.rows.scrollTo(0); this.draw(); };

        if (this.swapIn >= 0) {
            const cancel = this.link("Cancel", W - PAD, () => this.pickSwap(-1));
            fit(this.text(`Who goes to the barracks for ${heroes.benched(this.swapIn).d.n}?`, PAD, 3, AP.AMBER, this.head), cancel.x - PAD - 8);
            return;
        }
        if (this.tab == Tab.BARRACKS) {
            const back = this.link("Roster", W - PAD, () => tabTo(Tab.ROSTER));
            const title = this.text(`Barracks ${list.length}/${slots}`, PAD, 3, list.length >= slots ? AP.STRAW : AP.WHITE, this.head);
            const x = PAD + Math.ceil(title.textWidth) + 8;
            if (this.refused) fit(this.text(this.refused, x, 3, AP.FLAME, this.head), back.x - x - 8);
            else fit(this.text("Waiting and healing, lists kept", x, 3, AP.STONE, this.head), back.x - x - 8);
            return;
        }

        // (clicked: the next way)
        const sort = this.link(`Sort: ${SORTS[this.sort]}`, W - PAD, () => {
            this.sort = (this.sort + 1) % SORTS.length;
            store.set(Constants.LS_HERO_SORT, SORTS[this.sort]);
            this.rows.scrollTo(0);
            this.draw();
        });
        const barracks = this.link(`Barracks ${heroes.barracks.length}/${barracksSlots(premium)}`, sort.x - 12, () => tabTo(Tab.BARRACKS), AP.ICE);
        Hint.on(barracks, "Heroes off the roster, waiting to be called up");

        const title = this.text(`Heroes ${list.length}/${slots}`, PAD, 3, list.length >= slots ? AP.STRAW : AP.WHITE, this.head);
        let x = PAD + Math.ceil(title.textWidth) + 8;
        const room = barracks.x - 8;
        if (this.refused) { fit(this.text(this.refused, x, 3, AP.FLAME, this.head), room - x); return; }
        for (const [how, word] of [[How.WAITING, "waiting"], [How.IDLE, "idle"], [How.HURT, "hurt"]] as [How, string][]) {
            const n = list.filter((h) => howOf(h) == how).length;
            if (!n) continue;
            const t = this.text(`${n} ${word}`, x + 6, 3, HOW_TINT[how], this.head);
            // (no room left before Barracks: the rest left off)
            if (x + 6 + Math.ceil(t.textWidth) > room) { t.destroy(); break; }
            this.dot(x, 6, HOW_TINT[how], this.head);
            x += 6 + Math.ceil(t.textWidth) + 8;
        }
    }

    // words along the top to click, their right edge at `right` (STONE, white while pointed at)
    private link(label: string, right: number, tap: () => void, tint = AP.STONE) {
        const link = new PIXI.Container();
        const t = this.text(label, 0, 0, tint, link);
        link.position.set(right - Math.ceil(t.textWidth), 3);
        link.eventMode = "static";
        link.cursor = "pointer";
        link.hitArea = new PIXI.Rectangle(-3, -3, Math.ceil(t.textWidth) + 6, 13);
        link.on("pointerenter", () => t.tint = AP.WHITE);
        link.on("pointerleave", () => t.tint = tint);
        link.on("pointertap", tap);
        this.head.addChild(link);
        return link;
    }

    // one in the barracks called up: straight onto the roster with room on it,
    // else who goes in their place is picked first (-1: stopped picking)
    private callUp(heroId: number) {
        const heroes = IBC.data.heroes;
        if (heroes.heroes.length < heroSlots(IBC.data.premium.active)) return IBC.net.hero.swap(0, heroId);
        this.tab = Tab.ROSTER;
        this.pickSwap(heroId);
    }

    private pickSwap(heroId: number) {
        this.swapIn = heroId;
        this.asking = -1;
        this.rows.scrollTo(0);
        this.draw();
    }

    // the heroes as sorted (those the same kept in roster order)
    private order(list: HeroRow[]) {
        const by = [
            null,
            (a: HeroRow, b: HeroRow) => heroPower(b.d) - heroPower(a.d),
            (a: HeroRow, b: HeroRow) => howOf(a) - howOf(b),
            (a: HeroRow, b: HeroRow) => a.d.n.localeCompare(b.d.n),
        ][this.sort];
        return by ? list.slice().sort(by) : list;
    }

    private drawHero(hero: HeroRow, y: number) {
        const { W, ROW_H, FRAME_W, BUTTON_W } = Adventurers;
        const h = hero.d, s = hero.s, heroes = IBC.data.heroes, job = JOBS[h.j], how = howOf(hero);
        const row = new PIXI.Container();
        row.position.set(0, y);
        this.rows.content.addChild(row);

        const back = new PIXI.Graphics();
        const paint = (over: boolean) => {
            back.clear()
                .beginFill(AP.BLACK).drawRect(0, 0, W, ROW_H).endFill()
                .beginFill(over ? AP.IRON : AP.SLATE).drawRect(1, 1, W - 2, ROW_H - 2).endFill();
            if (how <= How.HURT) back.beginFill(HOW_TINT[how]).drawRect(1, 1, 1, ROW_H - 2).endFill();
        };
        paint(false);
        row.addChild(back);

        // them, facing you, in a frame, their health under it
        const frameH = ROW_H - 11;
        const frame = new PIXI.Container();
        frame.addChild(new PIXI.Graphics()
            .beginFill(AP.BLACK).drawRect(3, 3, FRAME_W, frameH).endFill()
            .beginFill(AP.SHADOW).drawRect(4, 4, FRAME_W - 2, frameH - 2).endFill()
            .beginFill(AP.INK).drawRect(4, frameH - 4, FRAME_W - 2, 6).endFill());
        const shadow = new PIXI.Sprite(shadowTexture());
        shadow.anchor.set(0.5, 0.5);
        shadow.position.set(3 + FRAME_W / 2, frameH - 1);
        const person = new PIXI.Sprite(personTexture(h.l, Facing.DOWN, 0));
        person.anchor.set(0.5, 1);
        person.position.set(3 + FRAME_W / 2, frameH);
        frame.addChild(shadow, person);
        frame.eventMode = "static";
        frame.hitArea = new PIXI.Rectangle(3, 3, FRAME_W, frameH);
        Hint.on(frame, HOW_HINT[how]);
        row.addChild(frame);
        const health = new PIXI.Graphics();
        health.position.set(3, ROW_H - 6);
        row.addChild(health);

        const bx = W - BUTTON_W - 4, x = FRAME_W + 8, right = bx - 6, w = right - x;
        if (this.asking == hero.id) {
            fit(this.text(`Let ${h.n} go?`, x, 12, AP.FLAME, row), w);
            fit(this.text("Gone for good. Their gear goes back to your stash", x, 27, AP.SAND, row), w);
            // (Keep where Dismiss was, so a second click there doesn't let them go)
            this.button("Dismiss", bx, 4, BUTTON_W, row, () => { this.ask(-1); IBC.net.hero.dismiss(hero.id); }, AP.RED, AP.FLAME);
            this.button("Keep", bx, 36, BUTTON_W, row, () => this.ask(-1));
            this.live.push({ id: hero.id, task: null, w: 0, health });
            return;
        }

        // name and job, power on the right
        const power = this.text(`Power ${Math.round(heroPower(h))}`, 0, 7, AP.STRAW, row);
        power.x = right - Math.ceil(power.textWidth);
        const jobText = this.text(job.name, 0, 7, AP.ICE, row);
        const name = fit(this.text(h.n, x, 7, AP.WHITE, row), power.x - x - Math.ceil(jobText.textWidth) - 10);
        jobText.x = x + Math.ceil(name.textWidth) + 4;
        jobText.eventMode = "static";
        Hint.on(jobText, `${job.name} (${job.role}): ${job.does}`);

        // a dot by how they are, and what they're doing
        this.dot(x, 23, HOW_TINT[how], row);
        const doing = s.c ? "Waiting on your answer" : doingText(s, heroes.nameOf, (id) => IBC.data.events.named(id));
        fit(this.text(doing, x + 6, 20, how == How.IDLE ? AP.AMBER : AP.SAND, row), w - 6);
        // (pointed at, the whole of it, however long: the user, 2026-11-02)
        const doingZone = new PIXI.Container();
        doingZone.eventMode = "static";
        doingZone.hitArea = new PIXI.Rectangle(x, 18, w, 11);
        Hint.on(doingZone, doing);
        row.addChild(doingZone);

        // where they are, and what they're training: its level, how far into it under that
        const where = fit(this.text(s.r.length ? `On the road from ${heroes.nameOf(s.p)}` : `At ${heroes.nameOf(s.p)}`, x, 33, AP.STONE, row), w);
        const skill = s.r.length ? null : taskSkill(s.w)?.[0] ?? null;
        if (skill != null) {
            const ext = isExtended(skill);
            const t = this.text(`${skillName(skill)} ${ext ? extLevel(h, skill) : h.k[skill]}`, 0, 33, AP.PALE, row);
            t.x = right - Math.ceil(t.textWidth);
            fit(where, t.x - x - 6);
            const tw = Math.ceil(t.textWidth), part = ext ? extLevelPart(h, skill) : levelPart(h, skill);
            row.addChild(new PIXI.Graphics()
                .beginFill(AP.SHADOW).drawRect(t.x, 41, tw, 1).endFill()
                .beginFill(AP.LIME).drawRect(t.x, 41, Math.round(tw * part), 1).endFill());
        }

        // along the bottom, how far into what they're doing now
        const task = new PIXI.Graphics();
        task.position.set(x, ROW_H - 6);
        row.addChild(task);
        this.live.push({ id: hero.id, task, w, health });

        row.eventMode = "static";
        row.cursor = "pointer";
        row.hitArea = new PIXI.Rectangle(0, 0, W, ROW_H);
        row.on("pointerenter", () => paint(true));
        row.on("pointerleave", () => paint(false));
        // (picking who's swapped out: the whole row, and a Swap down the right)
        if (this.swapIn >= 0) {
            const swap = () => IBC.net.hero.swap(hero.id, this.swapIn);
            row.on("pointertap", swap);
            this.button("Swap", bx, 4, BUTTON_W, row, swap, AP.OCHRE, AP.AMBER, ROW_H - 8);
            return;
        }
        row.on("pointertap", () => HeroStatus.open(hero.id));

        // (idle: To-do lit, to give them something; four to a row, a little shorter)
        const idle = how == How.IDLE, left = s.q.length, bh = 11;
        this.button(left ? `To-do (${left})` : "To-do", bx, 2, BUTTON_W, row, () => TaskPlanner.open(hero.id), idle ? AP.OCHRE : AP.LEAF, idle ? AP.AMBER : AP.GRASS, bh);
        this.button("Status", bx, 14, BUTTON_W, row, () => HeroStatus.open(hero.id), AP.IRON, AP.STEEL, bh);
        if (heroes.heroes.length > 1) {
            const full = heroes.barracks.length >= barracksSlots(IBC.data.premium.active);
            const b = this.button("Barracks", bx, 26, BUTTON_W, row, () => { if (!full) IBC.net.hero.swap(hero.id, 0); }, full ? AP.SHADOW : AP.SLATE, full ? AP.SHADOW : AP.STEEL, bh, full ? AP.STONE : AP.WHITE);
            Hint.on(b, full ? "The barracks is full" : `Send ${h.n} to the barracks: they stop where they are, their list kept`);
            this.button("Dismiss", bx, 38, BUTTON_W, row, () => this.ask(hero.id), AP.OXBLOOD, AP.RED, bh);
        }
    }

    // one in the barracks: them, where they were left and how much of their
    // list is kept; Call up, Gear off (with any on) and Dismiss down the right
    // (Dismiss asks first, as on the roster)
    private drawBenched(hero: HeroRow, y: number) {
        const { W, ROW_H, FRAME_W, BUTTON_W } = Adventurers;
        const h = hero.d, s = hero.s, heroes = IBC.data.heroes, job = JOBS[h.j];
        const row = new PIXI.Container();
        row.position.set(0, y);
        this.rows.content.addChild(row);
        row.addChild(new PIXI.Graphics()
            .beginFill(AP.BLACK).drawRect(0, 0, W, ROW_H).endFill()
            .beginFill(AP.SLATE).drawRect(1, 1, W - 2, ROW_H - 2).endFill());

        const frameH = ROW_H - 11;
        row.addChild(new PIXI.Graphics()
            .beginFill(AP.BLACK).drawRect(3, 3, FRAME_W, frameH).endFill()
            .beginFill(AP.SHADOW).drawRect(4, 4, FRAME_W - 2, frameH - 2).endFill()
            .beginFill(AP.INK).drawRect(4, frameH - 4, FRAME_W - 2, 6).endFill());
        const shadow = new PIXI.Sprite(shadowTexture());
        shadow.anchor.set(0.5, 0.5);
        shadow.position.set(3 + FRAME_W / 2, frameH - 1);
        const person = new PIXI.Sprite(personTexture(h.l, Facing.DOWN, 0));
        person.anchor.set(0.5, 1);
        person.position.set(3 + FRAME_W / 2, frameH);
        row.addChild(shadow, person);
        const health = new PIXI.Graphics();
        health.position.set(3, ROW_H - 6);
        row.addChild(health);
        this.live.push({ id: hero.id, task: null, w: 0, health, benched: true });

        const bx = W - BUTTON_W - 4, x = FRAME_W + 8, right = bx - 6, w = right - x;
        if (this.asking == hero.id) {
            fit(this.text(`Let ${h.n} go?`, x, 12, AP.FLAME, row), w);
            fit(this.text("Gone for good. Their gear goes back to your stash", x, 27, AP.SAND, row), w);
            this.button("Dismiss", bx, 4, BUTTON_W, row, () => { this.ask(-1); IBC.net.hero.dismiss(hero.id); }, AP.RED, AP.FLAME);
            this.button("Keep", bx, 36, BUTTON_W, row, () => this.ask(-1));
            return;
        }

        const power = this.text(`Power ${Math.round(heroPower(h))}`, 0, 7, AP.STRAW, row);
        power.x = right - Math.ceil(power.textWidth);
        const jobText = this.text(job.name, 0, 7, AP.ICE, row);
        const name = fit(this.text(h.n, x, 7, AP.WHITE, row), power.x - x - Math.ceil(jobText.textWidth) - 10);
        jobText.x = x + Math.ceil(name.textWidth) + 4;

        const hurt = !!s.h;
        this.dot(x, 23, hurt ? HOW_TINT[How.HURT] : AP.STONE, row);
        fit(this.text(hurt ? "In the barracks, healing" : "In the barracks, resting", x + 6, 20, AP.SAND, row), w - 6);
        const left = s.q.length;
        fit(this.text(`Left ${s.r.length ? `on the road from ${heroes.nameOf(s.p)}` : `at ${heroes.nameOf(s.p)}`}${left ? `, ${left} to do` : ""}`, x, 33, AP.STONE, row), w);

        const full = heroes.heroes.length >= heroSlots(IBC.data.premium.active);
        const call = this.button("Call up", bx, 4, BUTTON_W, row, () => this.callUp(hero.id));
        Hint.on(call, full ? `Your roster is full: pick who ${h.n} swaps with` : `Back on the roster, from where ${h.n} was left`);
        if ((h.g ?? []).some((id) => id)) {
            const off = this.button("Gear off", bx, 20, BUTTON_W, row, () => (h.g ?? []).forEach((id, slot) => { if (id) IBC.net.hero.equip(hero.id, slot, 0); }), AP.IRON, AP.STEEL);
            Hint.on(off, "Everything they have on back to your stash, for the others");
        }
        this.button("Dismiss", bx, 36, BUTTON_W, row, () => this.ask(hero.id), AP.OXBLOOD, AP.RED);
    }

    // a bed nobody's in yet
    private drawBed(y: number) {
        const { W, ROW_H, FRAME_W } = Adventurers;
        const row = new PIXI.Container();
        row.position.set(0, y);
        this.rows.content.addChild(row);
        row.addChild(new PIXI.Graphics()
            .beginFill(AP.BLACK).drawRect(0, 0, W, ROW_H).endFill()
            .beginFill(AP.SHADOW).drawRect(1, 1, W - 2, ROW_H - 2).endFill()
            .beginFill(AP.INK).drawRect(3, 3, FRAME_W, ROW_H - 6).endFill());
        this.text("Empty bed", FRAME_W + 8, 16, AP.STONE, row);
        fit(this.text("Send one here from the roster", FRAME_W + 8, 29, AP.IRON, row), W - FRAME_W - 16);
    }

    // a row's bars as they are now (healing on from s.h as the server does)
    private fillBars(live: Live) {
        const hero = live.benched ? IBC.data.heroes.benched(live.id) : IBC.data.heroes.get(live.id);
        if (!hero) return;
        const { FRAME_W } = Adventurers, s = hero.s;
        if (live.task) {
            const done = taskProgress(hero, s.q[0] ?? s.b);
            live.task.clear().beginFill(AP.SHADOW).drawRect(0, 0, live.w, 2).endFill();
            if (done) live.task.beginFill(progressTint(hero)).drawRect(0, 0, Math.round(live.w * done), 2).endFill();
        }
        const since = Math.max(0, Date.now() - s.t), resting = live.benched || !!s.o || s.w?.k == TaskKind.REST;
        const left = 1 - Math.max(0, (s.h ?? 0) - since * healRate(hero.d, s, resting));
        live.health.clear()
            .beginFill(AP.BLACK).drawRect(0, 0, FRAME_W, 3).endFill()
            .beginFill(AP.OXBLOOD).drawRect(1, 1, FRAME_W - 2, 1).endFill()
            .beginFill(left > 0.5 ? AP.GRASS : left > 0.25 ? AP.AMBER : AP.RED).drawRect(1, 1, Math.max(1, Math.round((FRAME_W - 2) * left)), 1).endFill();
    }

    // a row asking whether to let its hero go (-1: none)
    private ask(heroId: number) {
        this.asking = heroId;
        this.draw();
    }

    // a slot nobody's in yet
    private drawEmpty(y: number) {
        const { W, ROW_H, FRAME_W, BUTTON_W } = Adventurers;
        const row = new PIXI.Container();
        row.position.set(0, y);
        this.rows.content.addChild(row);
        row.addChild(new PIXI.Graphics()
            .beginFill(AP.BLACK).drawRect(0, 0, W, ROW_H).endFill()
            .beginFill(AP.SHADOW).drawRect(1, 1, W - 2, ROW_H - 2).endFill()
            .beginFill(AP.INK).drawRect(3, 3, FRAME_W, ROW_H - 6).endFill());
        const q = this.text("?", 0, 0, AP.IRON, row);
        q.position.set(3 + Math.round((FRAME_W - q.textWidth) / 2), Math.round((ROW_H - 7) / 2));
        this.text("Empty slot", FRAME_W + 8, 16, AP.STONE, row);
        this.text("Hire a hero from the board", FRAME_W + 8, 29, AP.IRON, row);
        this.button("Hire", W - BUTTON_W - 6, Math.round((ROW_H - 13) / 2), BUTTON_W, row, () => HeroBoard.open());
    }

    //#region bits

    private text(text: string, x: number, y: number, tint: number, parent: PIXI.Container) {
        const t = new PIXI.BitmapText(text, { fontName: Constants.PIXEL_FONT, fontSize: 32 });
        t.tint = tint;
        t.position.set(x, y);
        t.eventMode = "none";
        parent.addChild(t);
        return t;
    }

    // a little square, its middle at y
    private dot(x: number, y: number, tint: number, parent: PIXI.Container) {
        parent.addChild(new PIXI.Graphics()
            .beginFill(AP.BLACK).drawRect(x, y - 2, 4, 4).endFill()
            .beginFill(tint).drawRect(x + 1, y - 1, 2, 2).endFill());
    }

    // (its label `tint`, white while pointed at)
    private button(label: string, x: number, y: number, w: number, parent: PIXI.Container, tap: () => void, fill = AP.LEAF, overFill = AP.GRASS, h = 13, tint = AP.WHITE) {
        const button = new PIXI.Container();
        button.position.set(x, y);
        const box = new PIXI.Graphics();
        button.addChild(box);
        const t = this.text(label, 0, Math.round((h - 7) / 2), tint, button);
        const paint = (over: boolean) => {
            box.clear()
                .beginFill(AP.BLACK).drawRect(0, 0, w, h).endFill()
                .beginFill(over ? overFill : fill).drawRect(1, 1, w - 2, h - 2).endFill();
            t.tint = over ? AP.WHITE : tint;
        };
        paint(false);
        fit(t, w - 4);     // (never past its sides)
        t.x = Math.round((w - t.textWidth) / 2);
        button.eventMode = "static";
        button.cursor = "pointer";
        button.hitArea = new PIXI.Rectangle(0, 0, w, h);
        button.on("pointerenter", () => paint(true));
        button.on("pointerleave", () => paint(false));
        button.on("pointertap", (e: PIXI.FederatedPointerEvent) => { e.stopPropagation(); tap(); });
        parent.addChild(button);
        return button;
    }

    //#endregion

}
