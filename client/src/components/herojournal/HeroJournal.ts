import * as PIXI from "pixi.js";
import { JournalKind } from "../../../../shared/Journal";
import { Event } from "../../constants/Events";
import { AP } from "../../constants/Palette";
import { HeroRow } from "../../data/HeroesData";
import { IBC } from "../../Engine";
import { Panel } from "../../shared/Panel";
import { TitleBar } from "../../shared/ui/titlebar/TitleBar";
import { BaseComponent, ComponentType } from "../BaseComponent";
import { Chat, wrap } from "../chat/Chat";
import { text, textWidth } from "../games/GameUI";

// A hero's journal, "<name> - Journal" (the user, 2026-10-29: "a character
// journal type thing that players can read to see whats happened to their
// character, add the button next to the cosmetics button"), opened from their
// status. What's happened to them (shared/Journal.ts, written by the server as
// it happens, signed out too), newest first under a heading a day: when, a
// mark the colour of what kind of thing it was, and what happened (and how many
// times in a row). Tabs along the top show only some kinds; the wheel scrolls
// it. New lines come in while it's open (HERO_JOURNAL_LINE).

const PAD = 6;
const TABS_Y = 3, TAB_H = 11;
const TOP = TABS_Y + TAB_H + 5;     // the list starts here
const LINE = 9;
const MARK = 3;                     // the kind's mark
const BAR_W = 2;                    // the scrollbar, down the right
const STEP = LINE * 3;              // px a turn of the wheel scrolls

// a kind's colour (its mark, and the tab it's under)
const TINTS: Record<JournalKind, number> = {
    [JournalKind.JOINED]: AP.AMBER,
    [JournalKind.LEVEL]: AP.LIME,
    [JournalKind.WON]: AP.SKY,
    [JournalKind.LOST]: AP.FLAME,
    [JournalKind.PLACE]: AP.ORCHID,
    [JournalKind.DONE]: AP.GRASS,
    [JournalKind.GAVE_UP]: AP.OCHRE,
    [JournalKind.GEAR]: AP.MIST,
    [JournalKind.EVENT]: AP.PINK,
    [JournalKind.WEATHER]: AP.ICE,
    [JournalKind.CHOICE]: AP.STRAW,
};

// the tabs: what each shows (none: everything)
const TABS: { name: string, kinds?: JournalKind[] }[] = [
    { name: "All" },
    { name: "Levels", kinds: [JournalKind.LEVEL] },
    { name: "Fights", kinds: [JournalKind.WON, JournalKind.LOST] },
    { name: "Travels", kinds: [JournalKind.PLACE, JournalKind.JOINED, JournalKind.WEATHER] },
    { name: "Deeds", kinds: [JournalKind.DONE, JournalKind.GAVE_UP, JournalKind.EVENT, JournalKind.GEAR, JournalKind.CHOICE] },
];

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export class HeroJournal extends BaseComponent {

    public static SCALE = 2;
    public static W = 240;              // in its own px
    public static H = 200;
    public static INSET_X = 12;         // the window round it, in screen px
    public static INSET_Y = 28;

    private heroId = -1;
    private tab = 0;
    private scroll = 0;                 // px scrolled down the list
    private listH = 0;                  // how tall the list is, all of it

    public background: Panel;
    public titleBar: TitleBar;
    private content: PIXI.Container;
    private tabs: PIXI.Container;
    private list: PIXI.Container;
    private bar: PIXI.Graphics;

    private keys = (e: KeyboardEvent) => { if (e.key == "Escape" && !Chat.takes(e)) IBC.comp.destroy(this); };

    constructor() {
        super(ComponentType.HERO_JOURNAL);
        this.create();
    }

    // a hero's journal (one open at a time: opening another's shows theirs)
    public static open(heroId: number) {
        const view = IBC.comp.getOrCreate(ComponentType.HERO_JOURNAL) as HeroJournal;
        view.bringToTop();
        view.show(heroId);
    }

    public create() {
        super.create();
        const { W, H, SCALE, INSET_X, INSET_Y } = HeroJournal;
        const WIDTH = INSET_X * 2 + W * SCALE, HEIGHT = INSET_Y + H * SCALE + INSET_X;
        this.container.eventMode = "static";
        this.container.hitArea = new PIXI.Rectangle(0, 0, WIDTH, HEIGHT);
        this.container.on("pointerdown", (e: PIXI.FederatedPointerEvent) => e.stopPropagation());
        this.container.on("wheel", (e: PIXI.FederatedWheelEvent) => {
            e.stopPropagation();
            this.scrollTo(this.scroll + (e.deltaY < 0 ? -STEP : STEP));
        });
        this.background = new Panel(this.container);
        this.background.setSize(WIDTH, HEIGHT);
        this.titleBar = new TitleBar(this);
        this.titleBar.setPosition(4, 4);
        this.titleBar.setSize(WIDTH - 8, 20);

        this.content = new PIXI.Container();
        this.content.scale.set(SCALE);
        this.content.position.set(INSET_X, INSET_Y);
        this.container.addChild(this.content);

        // (the panel's middle lets the map through) and a rule under the tabs
        this.content.addChild(new PIXI.Graphics()
            .beginFill(AP.INK).drawRect(-4, -2, W + 8, H + 6).endFill()
            .beginFill(AP.IRON).drawRect(PAD, TOP - 3, W - PAD * 2, 1).endFill());
        this.tabs = new PIXI.Container();
        this.list = new PIXI.Container();
        const mask = new PIXI.Graphics().beginFill(0xffffff).drawRect(0, TOP, W, H - TOP).endFill();
        this.list.mask = mask;
        this.bar = new PIXI.Graphics();
        this.content.addChild(this.tabs, mask, this.list, this.bar);

        window.addEventListener("keydown", this.keys);
        IBC.events.register(Event.HERO_JOURNAL, (hero: HeroRow) => { if (hero.id == this.heroId) this.draw(); }, this);
        IBC.events.register(Event.HERO_DISMISSED, (h: HeroRow) => { if (h.id == this.heroId) IBC.comp.destroy(this); }, this);
        // opens on the right of the screen (their status opens left of the middle)
        this.setPosition(Math.max(0, window.innerWidth - WIDTH - 16), Math.max(0, Math.round((window.innerHeight - HEIGHT) / 2) - 40));
    }

    public destroy() {
        super.destroy();
        window.removeEventListener("keydown", this.keys);
        this.titleBar.destroy();
        this.background.destroy();
        this.container.destroy({ children: true });
    }

    private get hero() {
        return IBC.data.heroes.get(this.heroId);
    }

    public show(heroId: number) {
        if (heroId != this.heroId) { this.scroll = 0; this.tab = 0; }
        this.heroId = heroId;
        const hero = this.hero;
        if (!hero) { IBC.comp.destroy(this); return; }
        this.titleBar.setTitle(`${hero.d.n} - Journal`);
        IBC.net.hero.journal(heroId);       // (asked for each time: it keeps up by itself after)
        this.draw();
    }

    private draw() {
        const hero = this.hero;
        if (!hero) { IBC.comp.destroy(this); return; }
        this.drawTabs();
        this.list.removeChildren().forEach((c) => c.destroy({ children: true }));
        const { W } = HeroJournal;

        if (!hero.journal) {
            text("Opening the journal...", PAD, TOP + 2, AP.STONE, this.list);
            this.listH = 0;
            this.scrollTo(0);
            return;
        }
        const kinds = TABS[this.tab].kinds;
        const lines = hero.journal.filter((e) => !kinds || kinds.includes(e[1])).reverse();
        if (!lines.length) {
            text(hero.journal.length ? "Nothing of that kind yet" : "Nothing written yet", PAD, TOP + 2, AP.STONE, this.list);
            this.listH = 0;
            this.scrollTo(0);
            return;
        }

        // newest first, under a heading a day
        const textX = PAD + MARK + 3 + textWidth("00:00") + 5, textW = W - textX - PAD - BAR_W - 2;
        const g = new PIXI.Graphics();
        this.list.addChild(g);
        let y = TOP + 1, day = "";
        for (const e of lines) {
            const when = new Date(e[0]);
            if (when.toDateString() != day) {
                day = when.toDateString();
                if (y > TOP + 1) y += 3;
                const head = text(dayName(when), PAD, y, AP.STRAW, this.list);
                const from = PAD + Math.ceil(head.textWidth) + 4;
                g.beginFill(AP.IRON).drawRect(from, y + 3, W - PAD - BAR_W - 2 - from, 1).endFill();
                y += LINE + 2;
            }
            g.beginFill(AP.BLACK).drawRect(PAD - 1, y + 1, MARK + 2, MARK + 2).endFill()
                .beginFill(TINTS[e[1]] ?? AP.WHITE).drawRect(PAD, y + 2, MARK, MARK).endFill();
            text(clock(when), PAD + MARK + 3, y, AP.STONE, this.list);
            const said = e[3] > 1 ? `${e[2]} (x${e[3]})` : e[2];
            for (const row of wrap(said, textW, textW, (s) => textWidth(s))) {
                text(row, textX, y, e[1] == JournalKind.LOST ? AP.SAND : AP.WHITE, this.list);
                y += LINE;
            }
            y += 2;
        }
        this.listH = y - TOP;
        this.scrollTo(this.scroll);
    }

    // the tabs along the top, the one picked lit
    private drawTabs() {
        this.tabs.removeChildren().forEach((c) => c.destroy({ children: true }));
        let x = PAD;
        TABS.forEach((tab, i) => {
            const label = tab.name, picked = i == this.tab;
            const w = textWidth(label) + 8;
            const button = new PIXI.Container();
            button.position.set(x, TABS_Y);
            const box = new PIXI.Graphics();
            const paint = (over: boolean) => box.clear()
                .beginFill(AP.BLACK).drawRect(0, 0, w, TAB_H).endFill()
                .beginFill(picked ? AP.STEEL : over ? AP.IRON : AP.SLATE).drawRect(1, 1, w - 2, TAB_H - 2).endFill();
            paint(false);
            button.addChild(box);
            text(label, 4, 2, picked ? AP.WHITE : AP.MIST, button);
            button.eventMode = "static";
            button.cursor = "pointer";
            button.hitArea = new PIXI.Rectangle(0, 0, w, TAB_H);
            button.on("pointerover", () => paint(true));
            button.on("pointerout", () => paint(false));
            button.on("pointertap", () => { if (this.tab != i) { this.tab = i; this.scroll = 0; this.draw(); } });
            this.tabs.addChild(button);
            x += w + 2;
        });
    }

    // scrolled to `px` down the list (kept inside it), and the scrollbar to match
    private scrollTo(px: number) {
        const { W, H } = HeroJournal, room = H - TOP;
        const most = Math.max(0, this.listH - room);
        this.scroll = Math.max(0, Math.min(most, Math.round(px)));
        this.list.y = -this.scroll;
        this.bar.clear();
        if (!most) return;
        const length = Math.max(10, Math.round(room * room / this.listH)), at = TOP + Math.round((room - length) * this.scroll / most);
        this.bar.beginFill(AP.SHADOW).drawRect(W - PAD - BAR_W, TOP, BAR_W, room).endFill()
            .beginFill(AP.STONE).drawRect(W - PAD - BAR_W, at, BAR_W, length).endFill();
    }

}

// "Today", "Yesterday", "Oct 27" (another year's: "Oct 27 2025")
function dayName(when: Date) {
    const today = new Date(), yesterday = new Date(today.getTime() - 86400000);
    if (when.toDateString() == today.toDateString()) return "Today";
    if (when.toDateString() == yesterday.toDateString()) return "Yesterday";
    return `${MONTHS[when.getMonth()]} ${when.getDate()}${when.getFullYear() != today.getFullYear() ? ` ${when.getFullYear()}` : ""}`;
}

// "14:32"
function clock(when: Date) {
    return `${when.getHours()}:${String(when.getMinutes()).padStart(2, "0")}`;
}
