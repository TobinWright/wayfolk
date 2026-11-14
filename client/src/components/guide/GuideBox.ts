import * as PIXI from "pixi.js";
import { ALL_STEPS, nextStep, QUICK_START, Step, stepDone, STEPS, stepsDone } from "../../../../shared/Guide";
import { itemName, TaskKind } from "../../../../shared/Tasks";
import { Event } from "../../constants/Events";
import { HeroRow } from "../../data/HeroesData";
import { AP } from "../../constants/Palette";
import { IBC } from "../../Engine";
import { BaseComponent, ComponentType } from "../BaseComponent";
import { wrap } from "../chat/Chat";
import { text, textWidth } from "../games/GameUI";
import { HeroBoard } from "../heroboard/HeroBoard";
import { HeroRoster } from "../heroroster/HeroRoster";
import type { MainMenu } from "../mainmenu/MainMenu";
import type { TaskAmount } from "../taskamount/TaskAmount";
import { TaskPlanner, taskProgress } from "../taskplanner/TaskPlanner";
import type { Map as WorldMap } from "../map/Map";
import { ScreenFx } from "../fx/ScreenFx";
import { Sfx } from "../../utils/Sfx";

// First steps (shared/Guide.ts; the user, 2026-10-29: a checklist, not to be
// skipped): a box under the roster with how many are done, the first not done
// and how to do it (what it pays shows as it's paid: GoldDisplay, ItemToasts); a pip a step along the bottom. The button
// it needs glows (an outline over everything, pulsing; none while the window it
// opens is open). Lit green a moment as a step's done, with confetti off it,
// a chime and a banner of what it paid; gone once all are, with a fanfare
// (the user, 2026-11-05: "more flashy"). The first job given: the to-do list
// shut and the map following the hero, so they're seen going to it (most new
// players left a minute after it, looking at the list).

export class GuideBox extends BaseComponent {

    public static SCALE = 2;
    public static W = HeroRoster.W;     // in its own px, as wide as the roster
    public static PAD = 5;
    public static LINE = 9;
    public static GAP = 6;              // screen px under the roster
    public static FLASH_MS = 1200;
    // the task a step gives them, pointed at in the to-do list (the backup: dragged, so not)
    public static KINDS: { [s: number]: TaskKind } = { [Step.GATHER]: TaskKind.GATHER, [Step.CRAFT]: TaskKind.CRAFT, [Step.ADVENTURE]: TaskKind.ADVENTURE };

    private content: PIXI.Container;
    private glow: PIXI.Graphics;
    private back: PIXI.Graphics;
    private h = 0;
    private flashAt = 0;
    private seenAt = 0;                 // (when the client last said the Inventory was open)
    private bar: PIXI.Graphics;         // (how far into the first thing gathered: waiting)
    private waitKey = "";

    constructor() {
        super(ComponentType.GUIDE);
        this.create();
    }

    // the box, if there are steps left
    public static start() {
        if (IBC.data.player.guide != ALL_STEPS && !IBC.comp.getFirstByType(ComponentType.GUIDE)) IBC.comp.create(ComponentType.GUIDE);
    }

    // signed in with no heroes and none hired yet: the Hiring board, open (the user, 2026-11-01:
    // a quarter of new players never found it)
    public static welcome() {
        if (!IBC.data.heroes.heroes.length && !stepDone(IBC.data.player.guide, Step.HIRE)) HeroBoard.open();
    }

    // the first hero hired: straight to their to-do list's Gather tab, the board shut (the next step)
    private hired(hero: HeroRow) {
        this.resize();
        if (IBC.data.heroes.heroes.length != 1 || stepDone(IBC.data.player.guide, Step.GATHER)) return;
        const board = IBC.comp.getFirstByType(ComponentType.HERO_BOARD);
        if (board) IBC.comp.destroy(board);
        TaskPlanner.open(hero.id, TaskKind.GATHER);
    }

    public create() {
        super.create();
        this.content = new PIXI.Container();
        this.content.scale.set(GuideBox.SCALE);
        this.content.eventMode = "none";
        this.container.addChild(this.content);
        this.glow = new PIXI.Graphics();
        this.glow.eventMode = "none";
        this.glow.zIndex = 1e9;
        IBC.pixi.stage.addChild(this.glow);
        IBC.events.register(Event.GUIDE, (just: Step) => this.done(just), this);
        IBC.events.register(Event.HERO_HIRED, (hero: HeroRow) => this.hired(hero), this);
        this.draw();
        this.resize();
    }

    public destroy() {
        super.destroy();
        IBC.pixi.stage.removeChild(this.glow);
        this.glow.destroy();
        this.container.destroy({ children: true });
    }

    // under the roster's boxes
    public resize() {
        const { SCALE, W, GAP } = GuideBox, R = HeroRoster;
        const heroes = IBC.data.heroes.heroes.length;
        this.setPosition(window.innerWidth - W * SCALE - R.RIGHT, R.TOP + heroes * (R.H + R.GAP) * R.SCALE + (heroes ? GAP : 0));
    }

    private done(just: Step) {
        if (just != null) this.celebrate(just);
        if (IBC.data.player.guide == ALL_STEPS) return IBC.comp.destroy(this);
        if (just != null) this.flashAt = performance.now();
        if (just == Step.GATHER) this.watchFirstJob();
        this.draw();
    }

    // confetti off the box, a chime and a banner of what it paid (all done: a fanfare)
    private celebrate(just: Step) {
        const d = STEPS.find((d) => d.s == just);
        if (!d) return;
        const { SCALE, W } = GuideBox, all = IBC.data.player.guide == ALL_STEPS;
        ScreenFx.confetti(this.container.x + (W * SCALE) / 2, this.container.y + 12 * SCALE, all ? 90 : 36);
        const paid = `+${d.g} gold${d.i ? `, ${d.i[1]} ${itemName(d.i[0])}` : ""}`;
        if (all) {
            Sfx.fanfare();
            ScreenFx.banner("First steps done!", `${paid} - have fun out there!`, AP.STRAW, 3600);
        } else {
            Sfx.chime();
            ScreenFx.banner(d.name, paid, AP.LEAF);
        }
    }

    // the first job given to the first hero: the to-do list shut and the map on them
    private watchFirstJob() {
        const heroes = IBC.data.heroes.heroes;
        if (heroes.length != 1) return;
        for (const type of [ComponentType.TASK_AMOUNT, ComponentType.TASK_PLANNER]) {
            const open = IBC.comp.getFirstByType(type);
            if (open) IBC.comp.destroy(open);
        }
        (IBC.comp.getFirstByType(ComponentType.MAP) as WorldMap)?.follow(heroes[0].id);
    }

    private draw() {
        const { W, PAD, LINE } = GuideBox;
        this.content.removeChildren().forEach((c) => c.destroy({ children: true }));
        const g = IBC.data.player.guide, step = nextStep(g);
        if (!step) return;
        this.back = new PIXI.Graphics();
        this.content.addChild(this.back);

        let y = PAD;
        text("First steps", PAD, y, AP.STRAW, this.content);
        const count = `${stepsDone(g)}/${STEPS.length}`;
        text(count, W - PAD - textWidth(count), y, AP.ASH, this.content);
        y += LINE + 3;
        text(step.name, PAD, y, AP.WHITE, this.content);
        y += LINE + 1;
        const waiting = this.waiting();
        this.waitKey = this.waitingKey();
        for (const line of wrap(waiting?.text ?? step.hint, W - PAD * 2, W - PAD * 2, (s) => textWidth(s))) {
            text(line, PAD, y, AP.ASH, this.content);
            y += LINE;
        }
        // (gathering the first: how far, filled in update)
        this.bar = null;
        if (waiting?.at) {
            y += 2;
            this.bar = new PIXI.Graphics();
            this.bar.y = y;
            this.content.addChild(this.bar);
            y += 4;
        }
        if (IBC.data.player.quick() > 1) {
            y += 2;
            text(`Quick start: tasks go ${QUICK_START}x faster`, PAD, y, AP.LEAF, this.content);
            y += LINE;
        }

        // a pip a step: done, the one shown, still to do
        y += 3;
        const pip = 6, gap = 3, pips = new PIXI.Graphics();
        STEPS.forEach((d, i) => {
            pips.beginFill(stepDone(g, d.s) ? AP.LEAF : d == step ? AP.STRAW : AP.SHADOW).drawRect(PAD + i * (pip + gap), y, pip, 3).endFill();
        });
        this.content.addChild(pips);
        this.h = y + 3 + PAD;
        this.paint(0);
    }

    // its back, lit green by `lit` (0-1) as a step's just done
    private paint(lit: number) {
        const { W } = GuideBox;
        this.back.clear();
        this.back.beginFill(lit > 0 ? AP.LEAF : AP.BLACK).drawRect(0, 0, W, this.h).endFill();
        this.back.beginFill(AP.SLATE).drawRect(1, 1, W - 2, this.h - 2).endFill();
        if (lit > 0) this.back.beginFill(AP.LEAF, 0.35 * lit).drawRect(1, 1, W - 2, this.h - 2).endFill();
    }

    public update() {
        const now = performance.now();
        if (this.back && this.flashAt) {
            const left = 1 - (now - this.flashAt) / GuideBox.FLASH_MS;
            this.paint(Math.max(0, left));
            if (left <= 0) this.flashAt = 0;
        }
        this.seeInventory(now);
        if (this.waitingKey() != this.waitKey) this.draw();
        if (this.bar) {
            const { W, PAD } = GuideBox, hero = this.waiting()?.at, p = hero ? taskProgress(hero, hero.s.w) ?? 0 : 0, w = W - PAD * 2;
            this.bar.clear().beginFill(AP.SHADOW).drawRect(PAD, 0, w, 3).endFill()
                .beginFill(AP.STRAW).drawRect(PAD, 0, Math.round(w * p), 3).endFill();
        }

        // the glow, round what the step needs
        this.glow.clear();
        const at = this.target();
        if (!at) return;
        const a = 0.45 + 0.45 * Math.sin(now / 250);
        this.glow.lineStyle(3, AP.STRAW, a).drawRect(at.x - 3, at.y - 3, at.width + 6, at.height + 6);
    }

    // the Inventory open with something in it: the step that wants that, said done (the server checks)
    private seeInventory(now: number) {
        if (stepDone(IBC.data.player.guide, Step.LOOK) || now - this.seenAt < 3000) return;
        if (!IBC.comp.getFirstByType(ComponentType.INVENTORY) || !this.hasItems()) return;
        this.seenAt = now;
        IBC.net.player.guideSeen(Step.LOOK);
    }

    private hasItems() {
        return Array.from(IBC.data.inventory.items.values()).some((i) => i.amount > 0);
    }

    // waiting on the first thing gathered (the user, 2026-11-02: most new players left
    // in the quiet minute after giving the first job): what their hero's up to, said in
    // place of the hint (at: the one gathering now, for the bar; null: nothing to wait on)
    private waiting(): { text: string, at: HeroRow } {
        if (nextStep(IBC.data.player.guide)?.s != Step.LOOK || this.hasItems()) return null;
        for (const hero of IBC.data.heroes.heroes) {
            const s = hero.s, task = s.w ?? s.q[0];
            if (task?.k != TaskKind.GATHER) continue;
            const name = hero.d.n.split(" ")[0], item = itemName(task.m);
            if (s.r.length || !s.w) return { text: `${name} is on the way to gather ${item}. It goes in your Inventory.`, at: null };
            return { text: `${name} is gathering ${item}. The first goes in your Inventory any moment now.`, at: hero };
        }
        return null;
    }

    // (what's said changing, or the quick start ending: drawn again)
    private waitingKey() {
        const w = this.waiting();
        return `${w ? `${w.text}|${!!w.at}` : ""}|${IBC.data.player.quick()}`;
    }

    // where on screen the step's button is (null: nothing to point at now)
    private target(): PIXI.Rectangle {
        const step = nextStep(IBC.data.player.guide);
        const open = (type: ComponentType) => !!IBC.comp.getFirstByType(type);
        switch (step?.s) {
            case Step.HIRE: case Step.SECOND: return open(ComponentType.HERO_BOARD) ? null : this.menu("Hiring");
            case Step.LOOK: return !this.hasItems() || open(ComponentType.INVENTORY) ? null : this.menu("Inventory");
            case Step.GATHER: case Step.CRAFT: case Step.ADVENTURE: case Step.BACKUP: {
                // in the to-do list: its tab, the option, then the amount window's + To-do
                const kind = GuideBox.KINDS[step.s];
                const amount = IBC.comp.getFirstByType(ComponentType.TASK_AMOUNT) as TaskAmount;
                if (amount) return amount.toDoButton(kind);
                const planner = IBC.comp.getFirstByType(ComponentType.TASK_PLANNER) as TaskPlanner;
                return planner ? planner.guideTarget(kind) : this.roster(false);
            }
            case Step.EQUIP: return open(ComponentType.HERO_STATUS) ? null : this.roster(true);
        }
        return null;
    }

    // a main menu option, or the menu's button while it's shut
    private menu(label: string) {
        const menu = IBC.comp.getFirstByType(ComponentType.MAIN_MENU) as MainMenu;
        if (!menu) return null;
        const b = menu.menu.isOpen ? menu.menu.buttons.find((b) => b.label == label) : null;
        return (b ? b.container : menu.toolbar.container).getBounds();
    }

    // the first hero's box in the roster: its to-do part, or their status on the right
    private roster(status: boolean) {
        const roster = IBC.comp.getFirstByType(ComponentType.HERO_ROSTER);
        if (!roster || !IBC.data.heroes.heroes.length) return null;
        const R = HeroRoster, c = roster.container, part = (R.W - R.SPRITE_W) * R.SCALE;
        return status
            ? new PIXI.Rectangle(c.x + part, c.y, R.SPRITE_W * R.SCALE, R.H * R.SCALE)
            : new PIXI.Rectangle(c.x, c.y, part, R.H * R.SCALE);
    }

}
