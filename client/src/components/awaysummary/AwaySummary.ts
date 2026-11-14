import * as PIXI from "pixi.js";
import { AwayHero, AwaySummary as Summary } from "../../../../shared/Away";
import { skillName } from "../../../../shared/Heroes";
import { doingText, itemName } from "../../../../shared/Tasks";
import { AP } from "../../constants/Palette";
import { IBC } from "../../Engine";
import { Facing } from "../../people/AvatarArt";
import { personTexture, shadowTexture } from "../../people/People";
import { Panel } from "../../shared/Panel";
import { TitleBar } from "../../shared/ui/titlebar/TitleBar";
import { BaseComponent, ComponentType } from "../BaseComponent";
import { Chat, wrap } from "../chat/Chat";
import { text, textWidth } from "../games/GameUI";
import { fit } from "../heroroster/HeroRoster";
import { HeroStatus } from "../herostatus/HeroStatus";
import { itemTexture } from "../inventory/Item";
import { ScreenFx } from "../fx/ScreenFx";
import { Sfx } from "../../utils/Sfx";

// While you were away (the user, 2026-10-29; Claude's layout): opened as you
// sign in, if you were away long enough and your heroes got something done
// (shared/Away.ts, S2C.HERO_AWAY). How long you were away (and whether they
// stopped working before you came back), the gold made, a row a hero - them,
// XP gained, levels gone up, fights won and lost, what they're doing now
// (clicked, their status) - and what came into the stash and went out of it,
// pointing at one naming it along the bottom. Escape, Enter, its cross or
// Continue closes it. It plays in (the user, 2026-11-05: "dopamine"): the
// gold counting up, the heroes' rows sliding in one by one, the stash's
// things dropping in after, a blip each, rising; a fanfare to end on.

export class AwaySummary extends BaseComponent {

    public static SCALE = 2;
    public static W = 240;              // its content, in its own px
    public static PAD = 8;
    public static LINE = 9;
    public static ROW_H = 34;           // a hero's row
    public static FRAME_W = 22;         // the frame they stand in
    public static CELL_W = 26;          // an item and its count
    public static CELL_H = 27;
    public static ITEM_ROWS = 3;        // (more than fit: "and N more")
    public static INSET_X = 12;         // the window round it, in screen px
    public static INSET_Y = 28;
    public static BUTTON_W = 60;
    public static BUTTON_H = 13;

    public background: Panel;
    public titleBar: TitleBar;
    private content: PIXI.Container;
    private info: PIXI.BitmapText;
    private h = 0;                      // its content's height (own px)
    private openedAt = 0;
    private goldText: PIXI.BitmapText = null;
    private goldTo = 0;
    private goldDone = false;
    private reveals: { node: PIXI.Container, y: number, at: number, kind: number, done?: boolean }[] = [];    // (kind 0 a hero, 1 a thing)
    private ended = false;

    private keys = (e: KeyboardEvent) => {
        if ((e.key == "Escape" || e.key == "Enter") && !Chat.takes(e)) IBC.comp.destroy(this);
    };

    constructor() {
        super(ComponentType.AWAY_SUMMARY);
    }

    // the window, for this summary (one open at a time)
    public static open(summary: Summary) {
        IBC.comp.getFirstByType(ComponentType.AWAY_SUMMARY) && IBC.comp.destroy(IBC.comp.getFirstByType(ComponentType.AWAY_SUMMARY));
        const view = IBC.comp.create(ComponentType.AWAY_SUMMARY) as AwaySummary;
        view.show(summary);
        return view;
    }

    private show(a: Summary) {
        super.create();
        const { W, PAD, LINE, SCALE, INSET_X, INSET_Y, BUTTON_H } = AwaySummary;
        const width = W - PAD * 2;

        this.content = new PIXI.Container();
        this.content.scale.set(SCALE);
        this.content.position.set(INSET_X, INSET_Y);

        // how long, and whether they stopped before you came back
        let y = 6;
        text(`You were away ${duration(a.t)}`, PAD, y, AP.WHITE, this.content);
        y += LINE + 2;
        if (a.s) {
            const more = IBC.data.premium.active ? "" : ". A Supporter's keep going for 72h";
            y = this.para(`Your heroes stopped after ${duration(a.s)} and rested${more}`, PAD, y, width, AP.AMBER);
        }

        // gold
        y += 4;
        const gold = text("Gold", PAD, y, AP.STONE, this.content);
        this.goldText = text(`${a.g >= 0 ? "+" : ""}${count(a.g)}g`, PAD + Math.ceil(gold.textWidth) + 6, y, a.g > 0 ? AP.STRAW : a.g < 0 ? AP.FLAME : AP.STONE, this.content);
        this.goldTo = a.g;
        if (a.g > 0) this.goldText.text = "+0g";
        y += LINE + 6;

        // the heroes (those you still have)
        const rows = a.h.filter((h) => IBC.data.heroes.get(h.i));
        if (rows.length) {
            y = this.heading("Your heroes", y);
            for (const h of rows) y = this.heroRow(h, y) + 3;
            y += 4;
        }

        // the stash: in, then out
        if (a.i.length) {
            y = this.heading("Your stash", y);
            y = this.items(a.i, y);
        }

        this.h = y + 6 + BUTTON_H + 6;
        const WIDTH = INSET_X * 2 + W * SCALE, HEIGHT = INSET_Y + this.h * SCALE + INSET_X;
        this.container.eventMode = "static";
        this.container.hitArea = new PIXI.Rectangle(0, 0, WIDTH, HEIGHT);
        this.container.on("pointerdown", (e: PIXI.FederatedPointerEvent) => e.stopPropagation());
        this.background = new Panel(this.container);
        this.background.setSize(WIDTH, HEIGHT);
        this.titleBar = new TitleBar(this);
        this.titleBar.setPosition(4, 4);
        this.titleBar.setSize(WIDTH - 8, 20);
        this.titleBar.setTitle("Welcome back");
        this.container.addChild(this.content);

        this.info = text("", PAD, this.h - BUTTON_H - 3, AP.ASH, this.content);
        this.continueButton();

        window.addEventListener("keydown", this.keys);
        this.setPosition(Math.round((window.innerWidth - WIDTH) / 2), Math.max(0, Math.round((window.innerHeight - HEIGHT) / 2)));
        // (in turn: the heroes from 300 ms, 160 apart, then the things, 55 apart)
        this.openedAt = performance.now();
        let at = 300;
        for (const r of this.reveals) { r.at = at; at += r.kind == 0 ? 160 : 55; r.node.alpha = 0; }
    }

    public update(deltaTime: number) {
        if (!this.openedAt) return;
        const age = performance.now() - this.openedAt;
        // the gold counting up over 1.2s
        if (this.goldText && this.goldTo > 0 && !this.goldDone) {
            const k = Math.min(1, age / 1200), ease = 1 - Math.pow(1 - k, 3);
            this.goldText.text = `+${count(Math.round(this.goldTo * ease))}g`;
            if (k < 1) Sfx.roll();
            else {
                this.goldDone = true;
                Sfx.coin();
                const g = this.goldText.getGlobalPosition();
                ScreenFx.coins(g.x + 20, g.y + 8, Math.min(30, 8 + Math.round(Math.sqrt(this.goldTo))));
            }
        }
        let n = 0;
        for (const r of this.reveals) {
            const k = (age - r.at) / 220;
            if (k < 0) continue;
            if (!r.done) { r.done = true; Sfx.pickup(r.kind == 0 ? 0 : n); }
            n++;
            r.node.alpha = Math.min(1, k);
            r.node.y = r.y - (k < 1 ? Math.round(4 * (1 - k)) : 0);
        }
        const last = this.reveals.length ? this.reveals[this.reveals.length - 1].at + 220 : 300;
        if (!this.ended && age >= Math.max(last, this.goldTo > 0 ? 1250 : 0)) {
            this.ended = true;
            if (this.goldTo > 0 || this.reveals.length) {
                Sfx.fanfare();
                ScreenFx.confetti(this.container.x + this.container.width / 2, this.container.y + 20, 60);
            }
        }
    }

    public destroy() {
        super.destroy();
        window.removeEventListener("keydown", this.keys);
        this.titleBar?.destroy();
        this.background?.destroy();
        this.container.destroy({ children: true });
    }

    // along the bottom
    private say(line: string, tint = AP.ASH) {
        this.info.text = line;
        this.info.tint = tint;
        fit(this.info, AwaySummary.W - AwaySummary.PAD * 2 - AwaySummary.BUTTON_W - 4);
    }

    // a hero: them in a frame, name and XP gained, the levels they went up,
    // what they're doing now and their fights; under it the moments on the
    // road they met (shared/Choices.ts), the last few. The y under it all
    private heroRow(a: AwayHero, y: number) {
        this.heroBox(a, y);
        y += AwaySummary.ROW_H;
        if (!a.c?.length) return y;
        const { PAD, FRAME_W, LINE, W } = AwaySummary, x = PAD + FRAME_W + 7, w = W - PAD - x;
        y += 2;
        for (const line of a.c) { fit(text(line, x, y, AP.SAND, this.content), w); y += LINE; }
        const more = (a.cn ?? 0) - a.c.length;
        if (more > 0) { text(`and ${more} more (in their journal)`, x, y, AP.STONE, this.content); y += LINE; }
        return y;
    }

    private heroBox(a: AwayHero, y: number) {
        const { W, PAD, ROW_H, FRAME_W, LINE } = AwaySummary;
        const hero = IBC.data.heroes.get(a.i), h = hero.d, w = W - PAD * 2;
        const row = new PIXI.Container();
        row.position.set(PAD, y);
        this.content.addChild(row);
        this.reveals.push({ node: row, y, at: 0, kind: 0 });

        const back = new PIXI.Graphics();
        const paint = (over: boolean) => back.clear()
            .beginFill(AP.BLACK).drawRect(0, 0, w, ROW_H).endFill()
            .beginFill(over ? AP.IRON : AP.SLATE).drawRect(1, 1, w - 2, ROW_H - 2).endFill();
        paint(false);
        row.addChild(back);
        row.addChild(new PIXI.Graphics()
            .beginFill(AP.BLACK).drawRect(3, 3, FRAME_W, ROW_H - 6).endFill()
            .beginFill(AP.SHADOW).drawRect(4, 4, FRAME_W - 2, ROW_H - 8).endFill()
            .beginFill(AP.INK).drawRect(4, ROW_H - 10, FRAME_W - 2, 6).endFill());
        const shadow = new PIXI.Sprite(shadowTexture());
        shadow.anchor.set(0.5, 0.5);
        shadow.position.set(3 + FRAME_W / 2, ROW_H - 8);
        const person = new PIXI.Sprite(personTexture(h.l, Facing.DOWN, 0));
        person.anchor.set(0.5, 1);
        person.position.set(3 + FRAME_W / 2, ROW_H - 7);
        row.addChild(shadow, person);

        const x = FRAME_W + 7, right = w - 4;

        // name, XP on the right
        const xp = text(`+${count(a.x)} XP`, 0, 3, a.x ? AP.LIME : AP.STONE, row);
        xp.x = right - Math.ceil(xp.textWidth);
        fit(text(h.n, x, 3, AP.WHITE, row), xp.x - x - 4);

        // the levels they went up
        // (an extended skill picked up meanwhile: from 0, "new")
        const levels = a.k.map(([skill, from, to]) => `${skillName(skill)} ${from ? `${from}>${to}` : `new, ${to}`}`).join(", ");
        fit(text(levels || "No new levels", x, 3 + LINE + 1, levels ? AP.STRAW : AP.STONE, row), right - x);

        // what they're doing now, their fights on the right
        const fights = a.w || a.l ? text(`Won ${a.w}${a.l ? `, lost ${a.l}` : ""}`, 0, 3 + (LINE + 1) * 2, a.l ? AP.AMBER : AP.LIME, row) : null;
        if (fights) fights.x = right - Math.ceil(fights.textWidth);
        const now = doingText(hero.s, IBC.data.heroes.nameOf, (id) => IBC.data.events.named(id));
        fit(text(`Now: ${now}`, x, 3 + (LINE + 1) * 2, AP.SAND, row), (fights ? fights.x : right) - x - 4);

        row.eventMode = "static";
        row.cursor = "pointer";
        row.hitArea = new PIXI.Rectangle(0, 0, w, ROW_H);
        row.on("pointerenter", () => {
            paint(true);
            const fought = a.w + a.l ? `, ${a.w + a.l} fight${a.w + a.l == 1 ? "" : "s"}` : "";
            this.say(`${h.n}: ${count(a.x)} XP${fought} - click for their status`);
        });
        row.on("pointerleave", () => { paint(false); this.say(""); });
        row.on("pointertap", () => HeroStatus.open(a.i));
    }

    // what came in and went out, an icon each with how many under it; the y under them
    private items(list: [number, number][], y: number) {
        const { W, PAD, CELL_W, CELL_H, ITEM_ROWS } = AwaySummary;
        const across = Math.floor((W - PAD * 2) / CELL_W), most = across * ITEM_ROWS;
        const shown = list.length > most ? list.slice(0, most - 1) : list;
        shown.forEach(([id, n], k) => {
            const cell = new PIXI.Container();
            cell.position.set(PAD + (k % across) * CELL_W, y + Math.floor(k / across) * CELL_H);
            this.content.addChild(cell);
            this.reveals.push({ node: cell, y: cell.y, at: 0, kind: 1 });
            const icon = new PIXI.Sprite(itemTexture(id));
            icon.position.set(Math.round((CELL_W - 16) / 2), 0);
            cell.addChild(icon);
            const label = `${n > 0 ? "+" : "-"}${short(Math.abs(n))}`;
            text(label, Math.round((CELL_W - textWidth(label)) / 2), 17, n > 0 ? AP.LIME : AP.FLAME, cell);
            cell.eventMode = "static";
            cell.hitArea = new PIXI.Rectangle(0, 0, CELL_W, CELL_H);
            cell.on("pointerenter", () => this.say(`${itemName(id)}: ${n > 0 ? "+" : "-"}${count(Math.abs(n))}`, n > 0 ? AP.LIME : AP.FLAME));
            cell.on("pointerleave", () => this.say(""));
        });
        if (shown.length < list.length) {
            const k = shown.length, left = list.length - shown.length;
            text(`+${left}`, PAD + (k % across) * CELL_W + 4, y + Math.floor(k / across) * CELL_H + 4, AP.STONE, this.content);
        }
        return y + Math.ceil((shown.length + (shown.length < list.length ? 1 : 0)) / across) * CELL_H;
    }

    private continueButton() {
        const { W, PAD, BUTTON_W, BUTTON_H } = AwaySummary;
        const button = new PIXI.Container();
        button.position.set(W - PAD - BUTTON_W, this.h - BUTTON_H - 6);
        const box = new PIXI.Graphics();
        const paint = (lit: boolean) => box.clear()
            .beginFill(AP.BLACK).drawRect(0, 0, BUTTON_W, BUTTON_H).endFill()
            .beginFill(lit ? AP.GRASS : AP.LEAF).drawRect(1, 1, BUTTON_W - 2, BUTTON_H - 2).endFill();
        paint(false);
        button.addChild(box);
        text("Continue", Math.round((BUTTON_W - textWidth("Continue")) / 2), 3, AP.WHITE, button);
        button.eventMode = "static";
        button.cursor = "pointer";
        button.on("pointerover", () => paint(true));
        button.on("pointerout", () => paint(false));
        button.on("pointertap", () => IBC.comp.destroy(this));
        this.content.addChild(button);
    }

    private heading(line: string, y: number) {
        text(line.toUpperCase(), AwaySummary.PAD, y, AP.STONE, this.content);
        return y + AwaySummary.LINE + 2;
    }

    // `line` wrapped to `width` at (x, y); the y under it
    private para(line: string, x: number, y: number, width: number, tint: number) {
        for (const row of wrap(line, width, width, (s) => textWidth(s))) {
            text(row, x, y, tint, this.content);
            y += AwaySummary.LINE;
        }
        return y;
    }

}

// "3d 4h", "30h 5m", "24h", "45m" (to the nearest minute)
function duration(ms: number) {
    const m = Math.round(ms / 60000), h = Math.floor(m / 60), d = Math.floor(h / 24);
    if (d >= 2) return `${d}d${h % 24 ? ` ${h % 24}h` : ""}`;
    if (h) return `${h}h${m % 60 ? ` ${m % 60}m` : ""}`;
    return `${Math.max(1, m)}m`;
}

// 1,234
function count(n: number) {
    return Math.round(n).toLocaleString("en-US");
}

// 40, 1.2k, 15k (to fit under an icon)
function short(n: number) {
    if (n < 1000) return `${n}`;
    if (n < 10000) return `${(n / 1000).toFixed(1).replace(/\.0$/, "")}k`;
    return `${Math.floor(n / 1000)}k`;
}
