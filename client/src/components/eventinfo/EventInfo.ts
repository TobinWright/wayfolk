import * as PIXI from "pixi.js";
import { BASE_GOLD, baneText, eventDef, isBossEvent, marchTarget, eventSkills, eventStage, eventStages, eventTitle, EventView, GOLD_A_POINT, TOP } from "../../../../shared/Events";
import { growsTown } from "../../../../shared/Towns";
import { SKILL_NAMES } from "../../../../shared/Heroes";
import { TaskKind, todoMost } from "../../../../shared/Tasks";
import { distancesFrom } from "../../../../shared/Travel";
import { heroesIcon, skillIcon } from "../../art/BoardIcons";
import { HeroStatus } from "../herostatus/HeroStatus";
import { clockIcon, coinIcon, SMALL_ICON } from "../../art/MenuIcons";
import { TASK_ICON } from "../../art/TaskIcons";
import { Constants } from "../../constants/Constants";
import { Event } from "../../constants/Events";
import { AP } from "../../constants/Palette";
import { timeLeft } from "../../data/EventsData";
import { IBC } from "../../Engine";
import { picTexture } from "../../people/People";
import { Panel } from "../../shared/Panel";
import { TitleBar } from "../../shared/ui/titlebar/TitleBar";
import { BaseComponent, ComponentType } from "../BaseComponent";
import { Chat, wrap } from "../chat/Chat";
import { textWidth, Tip } from "../games/GameUI";
import { fit } from "../heroroster/HeroRoster";
import { miles } from "../locationinfo/LocationInfo";

// A dynamic event (shared/Events.ts) in a window of its own (the user,
// 2026-10-28: "events need their own component... clicking the event on the
// map should open the event component"), Claude's layout: titled with its
// short name (eventTitle); its kind and the time left, what it's doing (its
// name; where it is taken off, the user, 2026-10-28), a bar of how far it's got, the
// skills it's worked with and how many heroes are on it ("x Participating"),
// the top givers (Participants), its Completion Rewards, and your heroes, each
// a name, how far they are set against Join, and Join (the user, 2026-11-02:
// "remove the bottom info bar, add tooltips to the skill icons... remove time
// from heroes, push miles up against the join button and leave the rest of the
// space for the name"; tooltips on the skills, the time, the bar and Join,
// a hero's name opening their status). Kept up as the events change, heroes move and the clock turns; once
// it's over it says how it ended.

export class EventInfo extends BaseComponent {

    public static SCALE = 2;
    public static W = 240;              // in its own px
    public static H = 262;
    public static PAD = 6;
    public static LINE = 10;
    public static BAR_H = 11;
    public static HERO_H = 14;          // a hero's row
    public static BUTTON_W = 34;
    public static TIP_W = 150;          // a tooltip's lines, at most
    // the window round it, in screen px
    public static INSET_X = 12;
    public static INSET_Y = 28;         // (under the title bar)
    public static WIDTH = EventInfo.INSET_X * 2 + EventInfo.W * EventInfo.SCALE;
    public static HEIGHT = EventInfo.INSET_Y + EventInfo.H * EventInfo.SCALE + EventInfo.INSET_X;

    private event: number = null;       // its id
    private drawn = "";                 // (what it was drawn from: redrawn when it changes)
    private since = 0;

    public background: Panel;
    public titleBar: TitleBar;
    private content: PIXI.Container;
    private sheet: PIXI.Container;
    private tip: Tip;
    private clock: PIXI.BitmapText = null;      // the time left, kept up between redraws
    private clockFace: PIXI.Sprite = null;
    private crowd: PIXI.Container = null;       // the heroes on it, left of the time
    private crowdW = 0;
    // what says more, and where the pointer was: a redraw under a tooltip shows the new one's
    private tipped: [PIXI.Container, string[]][] = [];
    private pointer: PIXI.Point = null;

    private keys = (e: KeyboardEvent) => { if (e.key == "Escape" && !Chat.takes(e)) IBC.comp.destroy(this); };

    constructor() {
        super(ComponentType.EVENT_INFO);
        this.create();
    }

    // an event, by its id (one open at a time: clicking another shows it)
    public static open(id: number) {
        const view = IBC.comp.getOrCreate(ComponentType.EVENT_INFO) as EventInfo;
        view.bringToTop();
        view.show(id);
    }

    public create() {
        super.create();
        const { WIDTH, HEIGHT, W, H } = EventInfo;
        this.container.eventMode = "static";
        this.container.hitArea = new PIXI.Rectangle(0, 0, WIDTH, HEIGHT);
        this.container.on("pointerdown", (e: PIXI.FederatedPointerEvent) => e.stopPropagation());

        this.background = new Panel(this.container);
        this.background.setSize(WIDTH, HEIGHT);

        this.titleBar = new TitleBar(this);
        this.titleBar.setPosition(4, 4);
        this.titleBar.setSize(WIDTH - 8, 20);

        this.content = new PIXI.Container();
        this.content.scale.set(EventInfo.SCALE);
        this.content.position.set(EventInfo.INSET_X, EventInfo.INSET_Y);
        this.container.addChild(this.content);

        // (the panel's middle lets the map through)
        this.content.addChild(new PIXI.Graphics().beginFill(AP.INK).drawRect(-4, -2, W + 8, H + 6).endFill());
        this.sheet = new PIXI.Container();
        this.content.addChild(this.sheet);
        this.tip = new Tip(this.content, W);     // (over the sheet)

        window.addEventListener("keydown", this.keys);
        IBC.events.register(Event.HERO_STATE, () => this.draw(), this);
        IBC.events.register(Event.EVENTS_CHANGED, () => this.draw(), this);
        // opens left of the middle of the screen (the place's window opens right of it)
        this.setPosition(Math.max(0, Math.round((window.innerWidth - WIDTH) / 2) - 160), Math.max(0, Math.round((window.innerHeight - HEIGHT) / 2) - 20));
    }

    public destroy() {
        super.destroy();
        window.removeEventListener("keydown", this.keys);
        this.titleBar.destroy();
        this.titleBar = null;
        this.background.destroy();
        this.background = null;
        this.container.destroy({ children: true });
    }

    public show(id: number) {
        if (id != this.event) this.drawn = "";
        this.event = id;
        this.draw();
    }

    // the time left, kept up
    public update(deltaTime: number) {
        this.since += deltaTime;
        if (this.since < 1000) return;
        this.since = 0;
        this.draw();
    }

    private draw() {
        const e = IBC.data.events.get(this.event), heroes = IBC.data.heroes.heroes, now = Date.now();
        // (state comes often: redrawn only when something shown has changed, the clock kept up on its own)
        const key = JSON.stringify([this.event, e, heroes.map((h) => [h.id, h.s.p, h.s.r, h.s.q.length, h.s.w?.k, h.s.w?.m]), e ? now >= e.e : 0]);
        if (key == this.drawn) { this.tick(e); return; }
        this.drawn = key;
        const tipShown = this.pointer != null;
        this.sheet.removeChildren().forEach((c) => c.destroy({ children: true }));
        this.tipped = [];
        this.clock = this.clockFace = null;
        this.crowd = null;
        this.tip.hide();
        if (!e) {
            this.titleBar.setTitle("Event");
            this.text("It's over and gone", EventInfo.PAD, 4, AP.STONE, this.sheet);
            return;
        }
        this.titleBar.setTitle(eventTitle(e));
        let y = this.drawTop(e);
        y = this.drawGivers(e, y);
        y = this.drawPay(e, y);
        this.drawHeroes(e, y);
        if (tipShown) this.retip();
    }

    // the time left, right-aligned with its clock before it, the heroes on it before that
    private tick(e: EventView) {
        if (!this.clock || !e) return;
        const { W, PAD } = EventInfo;
        this.clock.text = `${timeLeft(e.e - Date.now())} left`;
        this.clock.x = W - PAD - Math.ceil(this.clock.textWidth);
        this.clockFace.x = this.clock.x - SMALL_ICON - 3;
        this.clock.hitArea = new PIXI.Rectangle(-SMALL_ICON - 4, -1, Math.ceil(this.clock.textWidth) + SMALL_ICON + 6, EventInfo.LINE - 1);   // (its clock too)
        this.crowd.x = this.clockFace.x - 8 - this.crowdW;
    }

    // its kind and the time left (or how it ended), what it's doing, where,
    // the bar, and the skills it's worked with and the heroes on it
    private drawTop(e: EventView) {
        const { W, PAD, LINE, BAR_H } = EventInfo, def = eventDef(e.k), now = Date.now();
        const boss = isBossEvent(e), hue = boss ? AP.FLAME : AP.STRAW;
        const place = IBC.data.heroes.places.get(e.p), town = IBC.data.heroes.nameOf(marchTarget(e));
        let y = 2;
        this.text(def.name, PAD, y, hue, this.sheet);
        // the heroes on it, all players': their icon and how many
        const heroes = e.c ?? 0;
        this.crowd = new PIXI.Container();
        this.crowd.position.set(0, y);
        this.sprite(heroesIcon(), 0, -2, this.crowd);
        const count = this.text(`${heroes}`, TASK_ICON + 2, 0, heroes ? AP.WHITE : AP.STONE, this.crowd);
        this.crowdW = TASK_ICON + 2 + Math.ceil(count.textWidth);
        this.sheet.addChild(this.crowd);
        this.tipOn(this.crowd, `${heroes} Participating`, new PIXI.Rectangle(-1, -2, this.crowdW + 2, TASK_ICON));
        const live = !e.w && now < e.e;
        const [state, tint, more] = e.w == 3 ? [`Reached ${town}`, AP.FLAME, `It wasn't stopped in time: ${baneText(e)} in ${town}`]
            : e.w == 1 ? ["Done!", AP.LIME, "Done in time: everyone who gave has been paid"]
            : !live ? ["Out of time", AP.STONE, "It ran out of time before the goal was met"]
            : ["", AP.WHITE, `It ends at ${new Date(e.e).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`];
        const left = this.line(state, 0, y, tint, this.sheet, more);
        if (live) {
            this.clock = left;
            this.clockFace = this.sprite(picTexture(clockIcon()), 0, y - 1, this.sheet);
            this.tick(e);
        } else {
            left.x = W - PAD - Math.ceil(left.textWidth);
            this.crowd.x = left.x - 8 - this.crowdW;
        }
        y += LINE + 3;

        // what it's doing, wrapped
        for (const row of wrap(e.n, W - PAD * 2, W - PAD * 2, (s) => textWidth(s))) {
            this.text(row, PAD, y, AP.MIST, this.sheet);
            y += LINE;
        }
        y += 4;

        // the bar, with how far it's got on it
        const part = Math.min(1, e.d / e.g), barX = PAD, barW = W - PAD * 2, fill = Math.round((barW - 2) * part);
        const bar = new PIXI.Graphics();
        bar.beginFill(AP.BLACK).drawRect(barX, y, barW, BAR_H).endFill();
        bar.beginFill(AP.SLATE).drawRect(barX + 1, y + 1, barW - 2, BAR_H - 2).endFill();
        bar.beginFill(boss ? AP.RED : AP.OCHRE).drawRect(barX + 1, y + 1, fill, BAR_H - 2).endFill();
        bar.beginFill(hue).drawRect(barX + 1, y + 1, fill, 2).endFill();
        this.sheet.addChild(bar);
        this.tipOn(bar, `${Math.floor(e.d)} of ${e.g} ${boss ? "points of its health taken" : "units of work done"}, by everyone`, new PIXI.Rectangle(barX, y, barW, BAR_H));
        const done = this.text(`${Math.floor(e.d)} / ${e.g}  (${Math.floor(part * 100)}%)`, 0, y + 2, AP.WHITE, this.sheet);
        done.x = Math.round(barX + (barW - done.textWidth) / 2);
        y += BAR_H + 4;

        // the skills, an icon each
        // (staged: what's being done now on the line over, each stage's skill in turn, the one it's at lit)
        const stages = eventStages(e), at = eventStage(e);
        if (stages) {
            fit(this.text(`Stage ${at + 1}: ${stages[at].name}`, PAD, y, AP.WHITE, this.sheet), W - PAD * 2);
            y += LINE + 2;
        }
        let x = PAD;
        if (stages) {
            stages.forEach((s, k) => {
                const icon = this.icon(skillIcon(s.skill), x, y, [`Stage ${k + 1}: ${SKILL_NAMES[s.skill]}`]);
                icon.alpha = k == at ? 1 : k < at ? 0.3 : 0.6;
                x += TASK_ICON + 3;
            });
        } else {
            const skills = place ? eventSkills(e, place) : [];
            for (const s of skills) {
                if (x + TASK_ICON > W - PAD) break;
                this.icon(skillIcon(s), x, y, [SKILL_NAMES[s]]);
                x += TASK_ICON + 3;
            }
        }
        return y + TASK_ICON + 7;
    }

    // the top givers
    private drawGivers(e: EventView, y: number) {
        const { W, PAD, LINE } = EventInfo;
        this.heading("Participants", y); y += LINE + 3;
        const top = e.t ?? [];
        if (!top.length) { this.text("No one's given yet", PAD + 4, y, AP.IRON, this.sheet); y += LINE; }
        top.forEach(([name, points, supporter], k) => {
            const tint = [AP.STRAW, AP.ASH, AP.OCHRE][k] ?? AP.ASH;
            if (k % 2 == 0) this.stripe(y - 1, LINE);
            this.text(`${k + 1}.`, PAD + 4, y, tint, this.sheet);
            // a Supporter's tag: the chat's crown before their name
            const crownW = supporter ? SMALL_ICON + 2 : 0;
            if (supporter) Chat.crown(PAD + 16, y - 1, this.sheet);
            fit(this.line(name, PAD + 16 + crownW, y, k < 3 ? AP.WHITE : AP.MIST, this.sheet, supporter ? `${name}, a Supporter` : undefined), W - PAD * 2 - 60 - crownW);
            const p = this.text(`${Math.round(points)}`, 0, y, tint, this.sheet);
            p.x = W - PAD - 4 - Math.ceil(p.textWidth);
            y += LINE;
        });
        return y + 5;
    }

    // what it pays done in time, and the boon it leaves, a mark before each
    private drawPay(e: EventView, y: number) {
        const { W, PAD, LINE } = EventInfo, def = eventDef(e.k);
        this.heading("Completion Rewards", y); y += LINE + 3;
        const lines: [string, number, (x: number, y: number) => void][] = [
            [`All Participants: ${BASE_GOLD}g and ${GOLD_A_POINT}g a point`, AP.STRAW, (x, y) => this.sprite(picTexture(coinIcon()), x, y - 1, this.sheet)],
            [`Top ${TOP} Participants: a rare find too`, AP.ORCHID, (x, y) => this.gem(x, y - 1)],
            [`${def.boonText}, for a day`, AP.LIME, (x, y) => this.spark(x, y - 1)],
            ...(growsTown(e.k) ? [["The town grows, for good", AP.LIME, (x: number, y: number) => this.spark(x, y - 1)] as [string, number, (x: number, y: number) => void]] : []),
        ];
        for (const [t, tint, mark] of lines) {
            mark(PAD + 4, y);
            fit(this.text(t, PAD + 4 + SMALL_ICON + 4, y, tint, this.sheet), W - PAD * 2 - SMALL_ICON - 8);
            y += LINE;
        }
        return y + 5;
    }

    // a row a hero: their name, how far they are (or that they're on it) set against Join, Join
    private drawHeroes(e: EventView, y: number) {
        const { W, PAD, H, HERO_H, BUTTON_W } = EventInfo;
        const data = IBC.data.heroes, live = IBC.data.events.liveAt(e.p)?.i == e.i;
        this.heading("Your heroes", y); y += 13;
        if (!data.heroes.length) { this.text("None yet: hire one from the main menu", PAD + 4, y, AP.IRON, this.sheet); return; }
        data.heroes.forEach((hero, k) => {
            if (y + HERO_H - 2 > H) return;
            const s = hero.s, from = s.r.length ? s.r[0] : s.p;
            const px = distancesFrom(data.graph, from).get(e.p);
            const working = s.w?.k == TaskKind.EVENT && s.w.m == e.i;
            const joined = working || s.q.some((t) => t.k == TaskKind.EVENT && t.m == e.i);
            const here = !s.r.length && s.p == e.p;
            if (k % 2 == 0) this.stripe(y, HERO_H - 2);
            const joinX = W - PAD - BUTTON_W;

            const [where, tint] = working && here ? ["participating", AP.LIME] : px == null ? ["no road", AP.FLAME]
                : [miles(px), joined ? AP.GRASS : AP.SAND];
            const far = this.text(where, 0, y + 2, tint, this.sheet);
            far.x = joinX - 5 - Math.ceil(far.textWidth);
            // the name opens their status
            const name = fit(this.text(hero.d.n, PAD + 4, y + 2, AP.WHITE, this.sheet), far.x - 6 - (PAD + 4));
            name.eventMode = "static";
            name.cursor = "pointer";
            name.hitArea = new PIXI.Rectangle(-1, -1, Math.ceil(name.textWidth) + 2, EventInfo.LINE);
            name.on("pointerover", () => name.tint = AP.STRAW);
            name.on("pointerout", () => name.tint = AP.WHITE);
            name.on("pointertap", () => HeroStatus.open(hero.id));

            const full = s.q.length >= todoMost(IBC.data.premium.active);
            const can = live && !joined && px != null && !full;
            this.button(joined ? "Joined" : "Join", joinX, y, BUTTON_W, can, joined,
                can ? `${hero.d.n} goes and works on it till it's over (on the end of their to-do list)` : !live ? "It's over" : joined ? "They've joined it" : full ? "Their to-do list is full" : "No road there",
                () => IBC.net.hero.give(hero.id, [{ k: TaskKind.EVENT, p: e.p, m: e.i }]));
            y += HERO_H;
        });
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

    private sprite(texture: PIXI.Texture, x: number, y: number, parent: PIXI.Container) {
        const s = new PIXI.Sprite(texture);
        s.position.set(x, y);
        parent.addChild(s);
        return s;
    }

    // (a tooltip's text in lines that fit)
    private wrapped(text: string) {
        return wrap(text, EventInfo.TIP_W, EventInfo.TIP_W, (s) => textWidth(s));
    }

    // pointing at it says more, in a box over the pointer
    private tipOn(it: PIXI.Container, more: string | string[], area: PIXI.Rectangle) {
        const lines = typeof more == "string" ? this.wrapped(more) : more;
        it.eventMode = "static";
        it.hitArea = area;
        it.on("pointerover", (e: PIXI.FederatedPointerEvent) => { this.pointer = e.global.clone(); this.tip.show(lines, e); });
        it.on("pointermove", (e: PIXI.FederatedPointerEvent) => { this.pointer = e.global.clone(); this.tip.move(e); });
        it.on("pointerout", () => { this.pointer = null; this.tip.hide(); });
        this.tipped.push([it, lines]);
    }

    // after a redraw under a tooltip: the tooltip of what's under the pointer now
    private retip() {
        const at = this.tipped.find(([it]) => { const p = it.toLocal(this.pointer); return it.hitArea.contains(p.x, p.y); });
        if (at) this.tip.show(at[1], { global: this.pointer } as PIXI.FederatedPointerEvent);
        else this.pointer = null;
    }

    // a line that says more while it's pointed at
    private line(text: string, x: number, y: number, tint: number, parent: PIXI.Container, more?: string) {
        const t = this.text(text, x, y, tint, parent);
        if (more) this.tipOn(t, more, new PIXI.Rectangle(-1, -1, Math.max(20, Math.ceil(t.textWidth) + 2), EventInfo.LINE - 1));
        return t;
    }

    // a 10 x 10 icon that says what it is while it's pointed at
    private icon(texture: PIXI.Texture, x: number, y: number, more: string | string[]) {
        const icon = this.sprite(texture, x, y, this.sheet);
        this.tipOn(icon, more, new PIXI.Rectangle(0, 0, TASK_ICON, TASK_ICON));
        return icon;
    }

    // a heading with a rule from it to the other side
    private heading(text: string, y: number) {
        const { W, PAD } = EventInfo;
        const t = this.text(text, PAD, y, AP.STRAW, this.sheet);
        const from = PAD + Math.ceil(t.textWidth) + 4;
        this.sheet.addChild(new PIXI.Graphics().beginFill(AP.IRON).drawRect(from, y + 3, W - PAD - from, 1).endFill()
            .beginFill(AP.SLATE).drawRect(from, y + 4, W - PAD - from, 1).endFill());
    }

    // every other row a shade lighter
    private stripe(y: number, h: number) {
        const { W, PAD } = EventInfo;
        this.sheet.addChild(new PIXI.Graphics().beginFill(AP.SHADOW).drawRect(PAD, y, W - PAD * 2, h).endFill());
    }

    // the rare find's mark: a small cut gem
    private gem(x: number, y: number) {
        const g = new PIXI.Graphics();
        g.beginFill(AP.MAGENTA).drawRect(x + 2, y, 3, 1).drawRect(x + 1, y + 1, 5, 1).drawRect(x, y + 2, 7, 2).drawRect(x + 1, y + 4, 5, 1).drawRect(x + 2, y + 5, 3, 1).drawRect(x + 3, y + 6, 1, 1).endFill();
        g.beginFill(AP.PINK).drawRect(x + 2, y + 1, 2, 1).drawRect(x + 1, y + 2, 2, 1).endFill();
        g.beginFill(AP.WHITE).drawRect(x + 2, y + 2, 1, 1).endFill();
        this.sheet.addChild(g);
    }

    // the boon's mark: a four-pointed spark
    private spark(x: number, y: number) {
        const g = new PIXI.Graphics();
        g.beginFill(AP.GRASS).drawRect(x + 3, y, 1, 7).drawRect(x, y + 3, 7, 1).endFill();
        g.beginFill(AP.LIME).drawRect(x + 2, y + 2, 3, 3).endFill();
        g.beginFill(AP.PALE).drawRect(x + 3, y + 3, 1, 1).endFill();
        this.sheet.addChild(g);
    }

    private button(label: string, x: number, y: number, w: number, on: boolean, done: boolean, more: string, tap: () => void) {
        const button = new PIXI.Container();
        button.position.set(x, y);
        const box = new PIXI.Graphics();
        const paint = (over: boolean) => box.clear()
            .beginFill(AP.BLACK).drawRect(0, 0, w, 12).endFill()
            .beginFill(done ? AP.FOREST : !on ? AP.IRON : over ? AP.GRASS : AP.LEAF).drawRect(1, 1, w - 2, 10).endFill()
            .beginFill(done ? AP.LEAF : !on ? AP.STEEL : over ? AP.LIME : AP.GRASS).drawRect(1, 1, w - 2, 1).endFill();
        paint(false);
        button.addChild(box);
        const t = this.text(label, 0, 2, on ? AP.WHITE : done ? AP.LIME : AP.STONE, button);
        fit(t, w - 4);     // (never past its sides)
        t.x = Math.round((w - t.textWidth) / 2);
        this.tipOn(button, more, new PIXI.Rectangle(0, 0, w, 12));
        button.on("pointerover", () => paint(true));
        button.on("pointerout", () => paint(false));
        if (on) {
            button.cursor = "pointer";
            button.on("pointertap", tap);
        }
        this.sheet.addChild(button);
    }

    //#endregion

}
