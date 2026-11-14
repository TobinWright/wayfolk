import * as PIXI from "pixi.js";
import { chance, CHOICE_MS, isSure, momentOf, MomentDef, outcomeText, ownPick, Pending, testText } from "../../../../shared/Choices";
import { Event } from "../../constants/Events";
import { AP } from "../../constants/Palette";
import { HeroRow } from "../../data/HeroesData";
import { IBC } from "../../Engine";
import { Panel } from "../../shared/Panel";
import { TitleBar } from "../../shared/ui/titlebar/TitleBar";
import { BaseComponent, ComponentType } from "../BaseComponent";
import { Chat, wrap } from "../chat/Chat";
import { text, textWidth } from "../games/GameUI";
import { fit } from "../heroroster/HeroRoster";

// A moment on the road (shared/Choices.ts; the user, 2026-10-30): opened as
// one of your heroes comes to one (HeroState.c), one at a time. What's
// happening, then a row a way open to them - what it's called, what it
// tests and the chance it goes well, what comes of it well or badly - their
// own pick marked; a bar running down to when they pick for themselves. A
// way clicked (or its number typed) is your answer; Escape, the cross or Let
// them pick leaves it to them now. What came of it shows after (HERO_CHOSE)
// till Continue, then the next one waiting, if any.

export class HeroChoice extends BaseComponent {

    public static SCALE = 2;
    public static W = 250;              // its content, in its own px
    public static PAD = 6;
    public static LINE = 9;
    public static ROW_H = 22;
    public static BUTTON_H = 13;
    public static INSET_X = 12;         // the window round it, in screen px
    public static INSET_Y = 28;

    // moments answered here (hero id, and when it runs out), so one isn't opened again before its state comes back
    private static answered = new Set<string>();

    private heroId = -1;
    private pending: Pending;
    private moment: MomentDef;
    private picked = -1;                // your answer, sent (-1: none yet)
    private result: { won: boolean, line: string, way: number } = null;

    public background: Panel;
    public titleBar: TitleBar;
    private content: PIXI.Container;
    private clock: PIXI.Container;      // the bar running down
    private shown = -1;                 // (the seconds it shows)
    private placed = false;             // (put in the middle once; dragged after, it stays)
    private h = 0;

    private keys = (e: KeyboardEvent) => {
        if (Chat.takes(e)) return;
        if (e.key == "Escape") this.leave();
        else if (e.key == "Enter" && this.result) this.next();
        else if (/^[1-9]$/.test(e.key) && !this.result) this.pick(this.pending?.o[Number(e.key) - 1]);
        else return;
        e.stopPropagation();
        e.preventDefault();
    };

    constructor() {
        super(ComponentType.HERO_CHOICE);
    }

    private static key(hero: HeroRow) {
        return `${hero.id}:${hero.s.c?.t}`;
    }

    // a moment waiting on you (none: null)
    private static waiting() {
        return IBC.data.heroes.heroes.find((h) => h.s.c && momentOf(h.s.c.m) && !HeroChoice.answered.has(HeroChoice.key(h)) && h.s.c.t > Date.now());
    }

    // (on each hero's state) the window for the first moment waiting, if it isn't open
    public static check() {
        if (IBC.comp.getFirstByType(ComponentType.HERO_CHOICE)) return;
        const hero = HeroChoice.waiting();
        if (!hero) return;
        const view = IBC.comp.create(ComponentType.HERO_CHOICE) as HeroChoice;
        view.show(hero);
    }

    private show(hero: HeroRow) {
        super.create();
        this.heroId = hero.id;
        this.pending = hero.s.c;
        this.moment = momentOf(hero.s.c.m);
        this.container.eventMode = "static";
        this.container.on("pointerdown", (e: PIXI.FederatedPointerEvent) => e.stopPropagation());
        this.background = new Panel(this.container);
        this.titleBar = new TitleBar(this);
        this.titleBar.setPosition(4, 4);
        this.content = new PIXI.Container();
        this.content.scale.set(HeroChoice.SCALE);
        this.content.position.set(HeroChoice.INSET_X, HeroChoice.INSET_Y);
        this.container.addChild(this.content);
        window.addEventListener("keydown", this.keys, true);
        IBC.events.register(Event.HERO_STATE, (h: HeroRow) => { if (h.id == this.heroId) this.stateCame(h); }, this);
        IBC.events.register(Event.HERO_DISMISSED, (h: HeroRow) => { if (h.id == this.heroId) IBC.comp.destroy(this); }, this);
        this.draw();
    }

    public destroy() {
        // (closed by its cross with the moment still waiting: left to them)
        if (!this.result && this.picked < 0 && this.hero?.s.c?.t == this.pending?.t) this.send(-1);
        super.destroy();
        window.removeEventListener("keydown", this.keys, true);
        this.titleBar?.destroy();
        this.background?.destroy();
        this.container.destroy({ children: true });
    }

    private get hero() {
        return IBC.data.heroes.get(this.heroId);
    }

    // their state again: the moment gone without an answer coming here (their
    // own pick, as you came back), the window's done with
    private stateCame(hero: HeroRow) {
        if (!this.result && hero.s.c?.t != this.pending.t && this.picked < 0) IBC.comp.destroy(this);
    }

    // what came of it (S2C.HERO_CHOSE): shown till Continue
    public static chose(heroId: number, way: number, won: boolean, line: string) {
        const view = IBC.comp.getFirstByType(ComponentType.HERO_CHOICE) as HeroChoice;
        if (view?.heroId != heroId || view.result) return;
        view.result = { won, line, way };
        view.draw();
    }

    private send(way: number) {
        const hero = this.hero;
        if (!hero?.s.c) return;
        HeroChoice.answered.add(HeroChoice.key(hero));
        IBC.net.hero.choose(hero.id, way);
    }

    private pick(way: number) {
        if (way == null || this.picked >= 0 || this.result) return;
        this.picked = way;
        this.send(way);
        this.draw();
    }

    // Escape, the cross, Let them pick: theirs now (or, with what came of it shown, on to the next)
    private leave() {
        if (this.result) { this.next(); return; }
        if (this.picked < 0) { this.picked = -2; this.send(-1); this.draw(); }
    }

    // closed, and the next moment waiting opened
    private next() {
        IBC.comp.destroy(this);
        HeroChoice.check();
    }

    private draw() {
        const hero = this.hero, m = this.moment;
        if (!hero || !m) { IBC.comp.destroy(this); return; }
        const { W, PAD, LINE, ROW_H, SCALE, INSET_X, INSET_Y, BUTTON_H } = HeroChoice;
        const h = hero.d, width = W - PAD * 2, mine = ownPick(h, m, this.pending.o);
        this.content.removeChildren().forEach((c) => c.destroy({ children: true }));
        this.titleBar.setTitle(`${h.n}: ${m.n}`);

        // what's happening
        let y = 4;
        for (const row of wrap(m.t, width, width, (s) => textWidth(s))) { text(row, PAD, y, AP.WHITE, this.content); y += LINE; }
        y += 4;

        // the ways open to them
        this.pending.o.forEach((i, k) => {
            const way = m.o[i];
            const taken = this.result ? this.result.way == i : this.picked == i;
            this.wayRow(hero, way, i, k, y, i == mine, taken);
            y += ROW_H + 2;
        });
        y += 2;

        // what came of it, or the time left
        if (this.result) {
            text(this.result.won ? "It went well." : "It went badly.", PAD, y, this.result.won ? AP.LIME : AP.FLAME, this.content);
            y += LINE + 1;
            for (const row of wrap(this.result.line, width, width, (s) => textWidth(s))) { text(row, PAD, y, AP.SAND, this.content); y += LINE; }
            y += 4;
            this.actButton("Continue", W - PAD, y, () => this.next());
        } else {
            const said = this.picked >= 0 ? "Answered: waiting to hear..." : this.picked == -2 ? "Left to them: waiting to hear..." : "";
            if (said) text(said, PAD, y + 3, AP.STONE, this.content);
            else {
                this.clock = new PIXI.Container();
                this.clock.position.set(PAD, y);
                this.content.addChild(this.clock);
                this.drawClock();
                this.actButton("Let them pick", W - PAD, y, () => this.leave());
            }
        }
        y += BUTTON_H + 4;

        this.h = y;
        const WIDTH = INSET_X * 2 + W * SCALE, HEIGHT = INSET_Y + this.h * SCALE + INSET_X;
        this.container.hitArea = new PIXI.Rectangle(0, 0, WIDTH, HEIGHT);
        this.background.setSize(WIDTH, HEIGHT);
        this.titleBar.setSize(WIDTH - 8, 20);
        if (!this.placed) {
            this.placed = true;
            this.setPosition(Math.round((window.innerWidth - WIDTH) / 2), Math.max(0, Math.round(window.innerHeight * 0.18)));
        }
    }

    // a way: its number and name (their own pick marked) and the chance it
    // goes well; under it what it tests and what comes of it, well and badly
    private wayRow(hero: HeroRow, way: MomentDef["o"][number], i: number, k: number, y: number, mine: boolean, taken: boolean) {
        const { W, PAD, ROW_H, LINE } = HeroChoice;
        const w = W - PAD * 2, h = hero.d, open = !this.result && this.picked == -1;
        const row = new PIXI.Container();
        row.position.set(PAD, y);
        this.content.addChild(row);
        const back = new PIXI.Graphics();
        const paint = (over: boolean) => back.clear()
            .beginFill(taken ? AP.STRAW : mine ? AP.OCHRE : AP.BLACK).drawRect(0, 0, w, ROW_H).endFill()
            .beginFill(over || taken ? AP.IRON : AP.SLATE).drawRect(1, 1, w - 2, ROW_H - 2).endFill();
        paint(false);
        row.addChild(back);

        const p = chance(h, way), sure = isSure(way);
        const odds = text(sure ? "Sure" : `${Math.round(p * 100)}%`, 0, 3, sure ? AP.STONE : p >= 0.7 ? AP.LIME : p >= 0.45 ? AP.STRAW : AP.FLAME, row);
        odds.x = w - 4 - Math.ceil(odds.textWidth);
        const name = `${k + 1}. ${way.n}${mine ? "  (their pick)" : ""}`;
        fit(text(name, 4, 3, this.result && !taken ? AP.STONE : AP.WHITE, row), odds.x - 8);

        // (what's tested on the left; on the right what comes of it, well in green / badly in red)
        const y2 = 3 + LINE + 1, well = outcomeText(way.win) || (sure ? "" : "through"), badly = way.lose ? outcomeText(way.lose) || "nothing" : "";
        let x = w - 4;
        const right = (s: string, tint: number) => { if (!s) return; const t = text(s, 0, y2, tint, row); x -= Math.ceil(t.textWidth); t.x = x; };
        if (badly) { right(badly, AP.FLAME); x -= 3; right("/", AP.STONE); x -= 3; }
        right(well, sure ? AP.STONE : AP.LIME);
        fit(text(sure ? "No risk" : testText(h, way), 4, y2, AP.ASH, row), x - 10);

        if (!open) return;
        row.eventMode = "static";
        row.cursor = "pointer";
        row.hitArea = new PIXI.Rectangle(0, 0, w, ROW_H);
        row.on("pointerenter", () => paint(true));
        row.on("pointerleave", () => paint(false));
        row.on("pointertap", () => this.pick(i));
    }

    // the time left before they pick, a bar running down
    private drawClock() {
        if (!this.clock) return;
        const BUTTON_H = HeroChoice.BUTTON_H, w = HeroChoice.W - HeroChoice.PAD * 2 - textWidth("Let them pick") - 20;
        const left = Math.max(0, this.pending.t - Date.now()), secs = Math.ceil(left / 1000);
        const part = Math.min(1, left / CHOICE_MS);
        this.clock.removeChildren().forEach((c) => c.destroy({ children: true }));
        this.clock.addChild(new PIXI.Graphics()
            .beginFill(AP.BLACK).drawRect(0, BUTTON_H - 4, w, 4).endFill()
            .beginFill(secs <= 15 ? AP.FLAME : AP.STRAW).drawRect(1, BUTTON_H - 3, Math.round((w - 2) * part), 2).endFill());
        text(`They pick in ${secs}s`, 0, 0, secs <= 15 ? AP.FLAME : AP.STONE, this.clock);
    }

    public update(deltaTime: number) {
        if (!this.pending || this.result || this.picked != -1) return;
        const secs = Math.ceil((this.pending.t - Date.now()) / 1000);
        if (secs != this.shown) { this.shown = secs; this.drawClock(); }
    }

    // a button as wide as its label, its right edge at `right`
    private actButton(label: string, right: number, y: number, act: () => void) {
        const { BUTTON_H } = HeroChoice, w = textWidth(label) + 12;
        const b = new PIXI.Container();
        b.position.set(right - w, y);
        const box = new PIXI.Graphics();
        const paint = (lit: boolean) => box.clear()
            .beginFill(AP.BLACK).drawRect(0, 0, w, BUTTON_H).endFill()
            .beginFill(lit ? AP.GRASS : AP.LEAF).drawRect(1, 1, w - 2, BUTTON_H - 2).endFill();
        paint(false);
        b.addChild(box);
        text(label, Math.round((w - textWidth(label)) / 2), 3, AP.WHITE, b);
        b.eventMode = "static";
        b.cursor = "pointer";
        b.on("pointerover", () => paint(true));
        b.on("pointerout", () => paint(false));
        b.on("pointertap", act);
        this.content.addChild(b);
    }

}
