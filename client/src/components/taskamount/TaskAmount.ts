import * as PIXI from "pixi.js";
import { Skill, SKILL_NAMES } from "../../../../shared/Heroes";
import {
    AMOUNTS, craftBaseMs, craftMs, GATHER_MS, gatherMs, gatherSkill, itemName, LOOK_MS, lookMs, recipeOf, Task, TaskKind,
    taskText, todoMost, unitXp,
} from "../../../../shared/Tasks";
import { Constants } from "../../constants/Constants";
import { Event } from "../../constants/Events";
import { AP } from "../../constants/Palette";
import { HeroRow } from "../../data/HeroesData";
import { IBC } from "../../Engine";
import { Panel } from "../../shared/Panel";
import { TitleBar } from "../../shared/ui/titlebar/TitleBar";
import { BaseComponent, ComponentType } from "../BaseComponent";
import { Chat } from "../chat/Chat";
import { fit } from "../heroroster/HeroRoster";
import { itemTexture } from "../inventory/Item";
import { ItemInfo } from "../iteminfo/ItemInfo";
import { Plan, planCraft } from "./Plan";

// How many of a task to give a hero (the user, 2026-10-28: clicking a thing
// to craft - or gather, rest, adventure - on the to-do list's right opens it,
// "Name: Craft Bronze Sword"), Claude's layout. Its sprite, name and where;
// the amount, by -10 -1 +1 +10, a row of quick picks (and Max: as many as
// their materials make, crafting) or typed; what that takes - crafting, each
// material against what they have -, how long and the XP; + To-do puts
// it on the end of their list (Enter), Cancel (Escape) doesn't.

export class TaskAmount extends BaseComponent {

    public static SCALE = 2;
    public static W = 220;              // in its own px
    public static H = 243;             // (a craft's three materials and what goes on first)
    public static PAD = 4;
    public static LINE = 10;
    public static HEAD = 30;            // the band along the top: its sprite, name and where
    public static MATERIAL_H = 17;      // a material's row: its sprite, name and have/need over a bar
    // the window round it, in screen px
    public static INSET_X = 12;
    public static INSET_Y = 28;         // (under the title bar)
    public static WIDTH = TaskAmount.INSET_X * 2 + TaskAmount.W * TaskAmount.SCALE;
    public static HEIGHT = TaskAmount.INSET_Y + TaskAmount.H * TaskAmount.SCALE + TaskAmount.INSET_X;

    private heroId = -1;
    private task: Task;
    private icon: PIXI.Texture;
    private where = "";
    private n = 1;
    private typed = "";                 // (digits typed since the last button: they make the amount)

    public background: Panel;
    public titleBar: TitleBar;
    private content: PIXI.Container;
    private sheet: PIXI.Container;
    private toDo: PIXI.Container;       // (its + To-do)

    // (on the capture: ahead of the to-do list's, so Escape closes this, not that)
    private keys = (e: KeyboardEvent) => {
        if (Chat.takes(e)) return;
        if (e.key == "Escape") IBC.comp.destroy(this);
        else if (e.key == "Enter") this.add();
        else if (/^[0-9]$/.test(e.key)) { this.typed = (this.typed + e.key).slice(-3); this.set(Number(this.typed)); }
        else if (e.key == "Backspace") { this.typed = this.typed.slice(0, -1); this.set(Number(this.typed) || this.amount.least); }
        else if (e.key == "ArrowUp" || e.key == "ArrowRight") this.step(1);
        else if (e.key == "ArrowDown" || e.key == "ArrowLeft") this.step(-1);
        else return;
        e.stopPropagation();
        e.preventDefault();
    };

    constructor() {
        super(ComponentType.TASK_AMOUNT);
        this.create();
    }

    // a task (its kind having an amount) for a hero: its sprite, and where it's done ("in Rockbarrow")
    public static open(heroId: number, task: Task, icon: PIXI.Texture, where: string) {
        const view = IBC.comp.getOrCreate(ComponentType.TASK_AMOUNT) as TaskAmount;
        view.bringToTop();
        view.show(heroId, task, icon, where);
    }

    public create() {
        super.create();
        const { WIDTH, HEIGHT, W, H } = TaskAmount;
        this.container.eventMode = "static";
        this.container.hitArea = new PIXI.Rectangle(0, 0, WIDTH, HEIGHT);
        this.container.on("pointerdown", (e: PIXI.FederatedPointerEvent) => e.stopPropagation());
        this.container.on("wheel", (e: WheelEvent) => this.step(e.deltaY < 0 ? 1 : -1));

        this.background = new Panel(this.container);
        this.background.setSize(WIDTH, HEIGHT);

        this.titleBar = new TitleBar(this);
        this.titleBar.setPosition(4, 4);
        this.titleBar.setSize(WIDTH - 8, 20);

        this.content = new PIXI.Container();
        this.content.scale.set(TaskAmount.SCALE);
        this.content.position.set(TaskAmount.INSET_X, TaskAmount.INSET_Y);
        this.container.addChild(this.content);
        // (the panel's middle lets the map through)
        this.content.addChild(new PIXI.Graphics().beginFill(AP.INK).drawRect(-4, -2, W + 8, H + 6).endFill());
        this.sheet = new PIXI.Container();
        this.content.addChild(this.sheet);

        window.addEventListener("keydown", this.keys, true);
        IBC.events.register(Event.HERO_STATE, () => this.draw(), this);
        IBC.events.register(Event.HERO_DISMISSED, (h: HeroRow) => { if (h.id == this.heroId) IBC.comp.destroy(this); }, this);
        IBC.events.register(Event.HERO_STASH, () => this.draw(), this);
        this.setPosition(Math.round((window.innerWidth - WIDTH) / 2), Math.round((window.innerHeight - HEIGHT) / 2));
    }

    public destroy() {
        super.destroy();
        window.removeEventListener("keydown", this.keys, true);
        this.titleBar.destroy();
        this.titleBar = null;
        this.background.destroy();
        this.background = null;
        this.container.destroy({ children: true });
    }

    public show(heroId: number, task: Task, icon: PIXI.Texture, where: string) {
        this.heroId = heroId;
        this.task = task;
        this.icon = icon;
        this.where = where;
        this.typed = "";
        this.n = this.amount.first;
        this.draw();
    }

    private get hero() {
        return IBC.data.heroes.get(this.heroId);
    }

    private get amount() {
        return AMOUNTS[this.task.k];
    }

    private set(n: number) {
        this.n = Math.max(this.amount.least, Math.min(this.amount.most, Math.round(n) || this.amount.least));
        this.draw();
    }

    private step(by: number) {
        this.typed = "";
        this.set(this.n + by);
    }

    // crafting: as many as their materials make (0: not one)
    private most() {
        const r = this.task.k == TaskKind.CRAFT ? recipeOf(this.task.m) : null;
        return r ? Math.min(...r.needs.map(([id, n]) => Math.floor(this.have(id) / n))) : null;
    }

    private have(id: number) {
        return IBC.data.inventory.items.get(id)?.amount ?? 0;
    }

    // what goes on their list: a craft, what it takes first (Plan); anything else, just it
    private tasks(): Plan {
        const t = this.task;
        return t.k == TaskKind.CRAFT ? planCraft(this.hero, t.m, this.n) : { tasks: [{ ...t, n: this.n }], short: [] };
    }

    // on the end of their list, if there's room for all of it (it comes back as their state)
    private add() {
        const hero = this.hero;
        if (!hero) return;
        const { tasks } = this.tasks();
        if (hero.s.q.length + tasks.length > todoMost(IBC.data.premium.active)) return;
        IBC.net.hero.give(hero.id, tasks);
        IBC.comp.destroy(this);
    }

    private draw() {
        const hero = this.hero, task = this.task;
        if (!hero || !task) { IBC.comp.destroy(this); return; }
        const { PAD, LINE, W, H } = TaskAmount;
        const h = hero.d, n = this.n;
        // (crafting and gathering, only "Name: Craft" / "Name: Gather": what's made or got is by its sprite under it; the user, 2026-11-02)
        this.titleBar.setTitle(`${h.n}: ${task.k == TaskKind.CRAFT ? "Craft" : task.k == TaskKind.GATHER ? "Gather" : verb(task)}`);
        this.sheet.removeChildren().forEach((c) => c.destroy({ children: true }));

        // a band along the top: its sprite in a slot, its name and where, and its i
        const HEAD = TaskAmount.HEAD;
        const band = new PIXI.Graphics();
        band.beginFill(AP.SHADOW).drawRect(0, 0, W, HEAD).endFill();
        band.beginFill(AP.IRON).drawRect(0, HEAD, W, 1).endFill();
        band.beginFill(AP.BLACK).drawRect(PAD, 3, 24, 24).endFill();
        band.beginFill(AP.SLATE).drawRect(PAD + 1, 4, 22, 22).endFill();
        band.beginFill(AP.IRON).drawRect(PAD + 1, 4, 22, 1).endFill();     // (lit along its top)
        this.sheet.addChild(band);
        const sprite = new PIXI.Sprite(this.icon);
        sprite.anchor.set(0.5);
        sprite.position.set(PAD + 13, 15);
        this.sheet.addChild(sprite);
        const what = task.k == TaskKind.CRAFT || task.k == TaskKind.GATHER ? itemName(task.m) : verb(task);
        fit(this.text(what, PAD + 32, 6, AP.WHITE, this.sheet), W - PAD * 2 - 50);
        fit(this.text(this.where, PAD + 32, 17, AP.STONE, this.sheet), W - PAD * 2 - 50);
        if (task.m) this.button("i", W - PAD - 12, 9, 12, true, false, () => ItemInfo.open(task.m, this.heroId));

        // how many: -10 -1 [n] +1 +10
        let y = this.heading("Quantity", HEAD + 5);
        const { least, most } = this.amount, mid = Math.round(W / 2);
        this.button("-10", mid - 76, y + 2, 22, n > least, false, () => this.step(-10));
        this.button("-1", mid - 52, y + 2, 20, n > least, false, () => this.step(-1));
        const box = new PIXI.Graphics();
        box.beginFill(AP.BLACK).drawRect(mid - 30, y, 60, 16).endFill();
        box.beginFill(AP.INK).drawRect(mid - 29, y + 1, 58, 14).endFill();
        box.beginFill(AP.SLATE).drawRect(mid - 29, y + 14, 58, 1).endFill();
        this.sheet.addChild(box);
        const count = this.text(`${n}`, 0, y + 4, AP.STRAW, this.sheet);
        count.x = mid - Math.round(count.textWidth / 2);
        this.button("+1", mid + 32, y + 2, 20, n < most, false, () => this.step(1));
        this.button("+10", mid + 54, y + 2, 22, n < most, false, () => this.step(10));
        y += 20;

        // quick picks, and Max (crafting: as many as they can make)
        const picks = [1, 5, 10, 25, 50, 100].filter((p) => p >= least && p < most);
        picks.push(most);
        const can = this.most();
        const all = picks.map((p) => [`${p}`, p] as [string, number]);
        if (can != null) all.push([`Max (${Math.min(can, most)})`, Math.min(can, most)]);
        let widths = all.map(([label]) => Math.max(16, this.measure(label) + 8));
        const room = W - PAD * 2, across = (ws: number[]) => ws.reduce((a, b) => a + b, 0) + (ws.length - 1) * 2;
        if (across(widths) > room) widths = all.map(([label]) => this.measure(label) + 4);     // (squeezed to stay inside)
        let x = mid - Math.round(across(widths) / 2);
        all.forEach(([label, p], i) => {
            const usable = p >= least && p != n;
            this.button(label, x, y, widths[i], usable, p == n, () => { this.typed = ""; this.set(p); });
            x += widths[i] + 2;
        });
        y += 17;

        // what it takes: crafting, each material - its sprite, name, have/need and a bar of how much of it they have
        const r = task.k == TaskKind.CRAFT ? recipeOf(task.m) : null;
        if (r) {
            y = this.heading("Materials", y);
            for (const [id, k] of r.needs) {
                const have = this.have(id), need = k * n, enough = have >= need;
                const icon = new PIXI.Sprite(itemTexture(id));
                icon.anchor.set(0.5);
                icon.position.set(PAD + 10, y + 8);
                this.sheet.addChild(icon);
                const count = this.text(`${have}/${need}`, 0, y + 1, enough ? AP.LIME : AP.FLAME, this.sheet);
                count.x = W - PAD - Math.ceil(count.textWidth);
                fit(this.text(itemName(id), PAD + 22, y + 1, AP.WHITE, this.sheet), count.x - 6 - (PAD + 22));
                const barW = W - PAD * 2 - 22, filled = Math.round(barW * Math.min(1, have / Math.max(1, need)));
                const bar = new PIXI.Graphics();
                bar.beginFill(AP.SLATE).drawRect(PAD + 22, y + 11, barW, 3).endFill();
                if (filled) bar.beginFill(enough ? AP.GRASS : AP.EMBER).drawRect(PAD + 22, y + 11, filled, 3).endFill();
                this.sheet.addChild(bar);
                y += TaskAmount.MATERIAL_H;
            }
            y += 3;
        } else if (task.k == TaskKind.GATHER) {
            y = this.heading("Stash", y);
            const have = this.have(task.m);
            this.text(`You have ${have}, ${have + n} after`, PAD + 4, y, AP.LIME, this.sheet); y += LINE + 2;
        }

        // how long, and the XP: side by side
        const [ms, skill, base] = this.work();
        const chips: [string, number][] = [];
        if (ms) chips.push([`Takes ~${duration(ms * n / 1000)}${task.k == TaskKind.ADVENTURE ? " + walks" : ""}`, AP.SAND]);
        if (skill != null) chips.push([`+${unitXp(h, skill, base) * n} ${SKILL_NAMES[skill]} XP`, AP.SKY]);
        if (chips.length) {
            const cw = Math.floor((W - PAD * 2 - (chips.length - 1) * 4) / chips.length);
            chips.forEach(([label, tint], i) => {
                const cx = PAD + i * (cw + 4);
                this.sheet.addChild(new PIXI.Graphics()
                    .beginFill(AP.BLACK).drawRect(cx, y, cw, 14).endFill()
                    .beginFill(AP.SHADOW).drawRect(cx + 1, y + 1, cw - 2, 12).endFill());
                const t = fit(this.text(label, 0, y + 3, tint, this.sheet), cw - 6);
                t.x = cx + Math.round((cw - t.textWidth) / 2);
            });
            y += 22;
        }

        // a craft: what's put on first to get what it takes (Plan), and what can't be got
        const plan = this.tasks();
        const FOOT = H - 19;
        if (r) {
            const before = plan.tasks.slice(0, -1);
            y = this.heading("Additional Tasks", y);
            if (!before.length) { this.text("Nothing: it's ready to make", PAD + 4, y, AP.STONE, this.sheet); y += LINE; }
            const room = Math.max(1, Math.floor((FOOT - 2 - y) / LINE) - (plan.short.length ? 1 : 0));
            before.slice(0, before.length > room ? room - 1 : room).forEach((t, i) => {
                const k = this.text(`${i + 1}`, 0, y, AP.STEEL, this.sheet);
                k.x = PAD + 9 - Math.ceil(k.textWidth);
                fit(this.text(taskText(t, IBC.data.heroes.nameOf), PAD + 13, y, AP.MIST, this.sheet), W - PAD * 2 - 13); y += LINE;
            });
            if (before.length > room) { this.text(`and ${before.length - room + 1} more`, PAD + 13, y, AP.STONE, this.sheet); y += LINE; }
            if (plan.short.length) fit(this.text(`Out of reach: ${plan.short.join(", ")}`, PAD + 4, y, AP.FLAME, this.sheet), W - PAD * 2 - 4);
        }

        // along the bottom: Cancel, + To-do (if there's room on the list for all of it), why not if not
        this.sheet.addChild(new PIXI.Graphics().beginFill(AP.IRON).drawRect(0, FOOT, W, 1).endFill());
        const left = todoMost(IBC.data.premium.active) - hero.s.q.length, fits = plan.tasks.length <= left;
        const toDoW = this.measure("+ To-do") + 14, cancelX = W - PAD - toDoW - 4 - 44;
        if (!fits) fit(this.text(left ? `Takes ${plan.tasks.length} slots: ${left} left` : "Their to-do list is full", PAD, H - 11, AP.FLAME, this.sheet), cancelX - 4 - PAD);
        this.button("Cancel", cancelX, H - 14, 44, true, false, () => IBC.comp.destroy(this));
        this.toDo = this.button("+ To-do", W - PAD - toDoW, H - 14, toDoW, fits, true, () => this.add());
    }

    // a section's name, a rule after it to the edge; where what's under it starts
    private heading(text: string, y: number) {
        const { PAD, W } = TaskAmount;
        const t = this.text(text, PAD, y, AP.STRAW, this.sheet);
        const from = PAD + Math.ceil(t.textWidth) + 4;
        this.sheet.addChild(new PIXI.Graphics().beginFill(AP.IRON).drawRect(from, y + 3, W - PAD - from, 1).endFill());
        return y + 12;
    }

    // where its + To-do is on screen, if it's for a task of `kind` (the guide points at it: GuideBox)
    public toDoButton(kind: TaskKind) {
        return this.task?.k == kind && this.toDo && !this.toDo.destroyed ? this.toDo.getBounds() : null;
    }

    // how long one takes them (a quick start too), the skill it trains and its time at x1 (null skill: none)
    private work(): [number, number, number] {
        const h = this.hero.d, t = this.task;
        switch (t.k) {
            case TaskKind.CRAFT: return [craftMs(h, t.m) / IBC.data.player.quick() / IBC.data.guilds.craftRate(), recipeOf(t.m).skill, craftBaseMs(t.m)];
            case TaskKind.GATHER: return [gatherMs(h, t.m) / IBC.data.player.quick(), gatherSkill(t.m), GATHER_MS];
            case TaskKind.REST: return [60000, null, 0];
            case TaskKind.ADVENTURE: return [lookMs(h), Skill.SCOUTING, LOOK_MS];
        }
        return [0, null, 0];
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

    private measure(text: string) {
        const t = new PIXI.BitmapText(text, { fontName: Constants.PIXEL_FONT, fontSize: 32 });
        const w = Math.ceil(t.textWidth);
        t.destroy();
        return w;
    }

    // a button at least w wide, wider to keep its label inside it (lit: the one picked, or the main one)
    private button(label: string, x: number, y: number, w: number, on: boolean, lit: boolean, tap: () => void) {
        const button = new PIXI.Container();
        button.position.set(x, y);
        const t = this.text(label, 0, 2, on || lit ? AP.WHITE : AP.STONE, button);
        w = Math.max(w, Math.ceil(t.textWidth) + 8);
        const box = new PIXI.Graphics();
        const paint = (over: boolean) => box.clear()
            .beginFill(lit ? AP.LIME : AP.BLACK).drawRect(0, 0, w, 12).endFill()
            .beginFill(!on && !lit ? AP.IRON : over ? AP.GRASS : lit ? AP.LEAF : AP.SLATE).drawRect(1, 1, w - 2, 10).endFill();
        paint(false);
        button.addChildAt(box, 0);
        t.x = Math.round((w - t.textWidth) / 2);
        if (on) {
            button.eventMode = "static";
            button.cursor = "pointer";
            button.hitArea = new PIXI.Rectangle(0, 0, w, 12);
            button.on("pointerover", () => paint(true));
            button.on("pointerout", () => paint(false));
            button.on("pointertap", tap);
        }
        this.sheet.addChild(button);
        return button;
    }

    //#endregion

}

// what it is, as the title says it ("Craft Bronze Sword", "Rest")
function verb(task: Task) {
    switch (task.k) {
        case TaskKind.CRAFT: return `Craft ${itemName(task.m)}`;
        case TaskKind.GATHER: return `Gather ${itemName(task.m)}`;
        case TaskKind.REST: return "Rest";
        case TaskKind.ADVENTURE: return "Adventure";
        case TaskKind.WORK: return "Work";
        case TaskKind.EXPLORE: return "Explore";
    }
    return "";
}

// "1m 20s", "45s", "1h 5m"
function duration(seconds: number) {
    const s = Math.round(seconds);
    if (s < 60) return `${s}s`;
    const m = Math.floor(s / 60);
    return m < 60 ? `${m}m${s % 60 ? ` ${s % 60}s` : ""}` : `${Math.floor(m / 60)}h ${m % 60}m`;
}
