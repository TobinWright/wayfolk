import * as PIXI from "pixi.js";
import { itemName } from "../../../../shared/Tasks";
import { eventDef, EventKind, eventTitle, EventView, PastEvent, PAST_MOST, isBossEvent } from "../../../../shared/Events";
import { Constants } from "../../constants/Constants";
import { Event } from "../../constants/Events";
import { AP } from "../../constants/Palette";
import { timeLeft } from "../../data/EventsData";
import { IBC } from "../../Engine";
import { Panel } from "../../shared/Panel";
import { Hint } from "../../shared/ui/Hint";
import { TitleBar } from "../../shared/ui/titlebar/TitleBar";
import { BaseComponent, ComponentType } from "../BaseComponent";
import { Chat } from "../chat/Chat";
import { fit } from "../heroroster/HeroRoster";
import { EventInfo } from "../eventinfo/EventInfo";
import { itemTexture } from "../inventory/Item";

// The events window, from the main menu: the world's news. Those on now at
// the top (each its short name, where, a bar and the time left; clicked, the
// event's window), and under them a log of the last PAST_MOST over, newest
// first (EVENT_PAST): what it was, where, how it ended (done, by how many,
// or out of time and how far it got), when, and your points in it; pointing
// at one says more (its long name, the top givers, its boon if it's still
// on). The log's asked for as it opens, every REFRESH_MS while it's open,
// and again as one ends. The wheel or its bar scrolls it; Escape or its cross closes it.

export class EventsWindow extends BaseComponent {

    public static SCALE = 2;
    public static W = 240;              // in its own px
    public static H = 262;
    public static PAD = 6;
    public static LINE = 10;
    public static LIVE_ROW = 23;        // one on now
    public static PAST_ROW = 22;        // one over
    public static INSET_X = 12;         // the window round it, in screen px
    public static INSET_Y = 28;
    public static WIDTH = EventsWindow.INSET_X * 2 + EventsWindow.W * EventsWindow.SCALE;
    public static HEIGHT = EventsWindow.INSET_Y + EventsWindow.H * EventsWindow.SCALE + EventsWindow.INSET_X;
    public static REFRESH_MS = 60000;

    public background: Panel;
    public titleBar: TitleBar;
    private content: PIXI.Container;
    private top = new PIXI.Container();         // on now, and the log's heading
    private list = new PIXI.Container();        // the log, scrolled
    private listMask = new PIXI.Graphics();
    private bar = new PIXI.Graphics();          // (where it's scrolled to)
    private foot: PIXI.BitmapText;

    private past: PastEvent[] = null;           // (null: not come yet)
    private liveIds = "";
    private drawn = "";
    private listY = 0;
    private listH = 0;
    private scroll = 0;
    private grab: number = null;                // (dragging the bar: how far down the thumb it's held)
    private since = 0;
    private askedAt = 0;

    private keys = (e: KeyboardEvent) => { if (e.key == "Escape" && !Chat.takes(e)) IBC.comp.destroy(this); };

    constructor() {
        super(ComponentType.EVENTS);
        this.create();
    }

    // the window (one open at a time), the log asked for
    public static open() {
        const view = IBC.comp.getOrCreate(ComponentType.EVENTS) as EventsWindow;
        view.bringToTop();
        view.ask();
    }

    public create() {
        super.create();
        const { WIDTH, HEIGHT, W, H, PAD } = EventsWindow;
        this.container.eventMode = "static";
        this.container.hitArea = new PIXI.Rectangle(0, 0, WIDTH, HEIGHT);
        this.container.on("pointerdown", (e: PIXI.FederatedPointerEvent) => e.stopPropagation());
        this.container.on("wheel", (e: PIXI.FederatedWheelEvent) => {
            e.stopPropagation();
            this.scroll += e.deltaY < 0 ? -EventsWindow.PAST_ROW : EventsWindow.PAST_ROW;
            this.placeList();
        });

        this.background = new Panel(this.container);
        this.background.setSize(WIDTH, HEIGHT);
        this.titleBar = new TitleBar(this);
        this.titleBar.setPosition(4, 4);
        this.titleBar.setSize(WIDTH - 8, 20);
        this.titleBar.setTitle("Events");

        this.content = new PIXI.Container();
        this.content.scale.set(EventsWindow.SCALE);
        this.content.position.set(EventsWindow.INSET_X, EventsWindow.INSET_Y);
        this.container.addChild(this.content);
        // (the panel's middle lets the map through)
        this.content.addChild(new PIXI.Graphics().beginFill(AP.INK).drawRect(-4, -2, W + 8, H + 6).endFill());
        this.list.mask = this.listMask;
        this.content.addChild(this.top, this.listMask, this.list, this.bar);
        // the bar dragged by its thumb, or the thumb jumped to where the track's pressed
        this.bar.eventMode = "static";
        this.bar.cursor = "pointer";
        this.bar.on("pointerdown", (e: PIXI.FederatedPointerEvent) => {
            e.stopPropagation();
            if (this.listH <= this.room()) return;
            const y = this.content.toLocal(e.global).y - this.listY;
            const { thumb, at } = this.thumb();
            this.grab = y >= at && y < at + thumb ? y - at : thumb / 2;
            this.dragTo(y);
        });
        this.bar.on("globalpointermove", (e: PIXI.FederatedPointerEvent) => { if (this.grab != null) this.dragTo(this.content.toLocal(e.global).y - this.listY); });
        this.bar.on("pointerup", () => this.grab = null);
        this.bar.on("pointerupoutside", () => this.grab = null);
        this.content.addChild(new PIXI.Graphics().beginFill(AP.SHADOW).drawRect(0, H - 11, W, 10).endFill());
        this.foot = this.text("", PAD, H - 9, AP.STONE, this.content);

        window.addEventListener("keydown", this.keys);
        IBC.events.register(Event.EVENT_PAST, (list: PastEvent[]) => { this.past = list ?? []; this.draw(); }, this);
        IBC.events.register(Event.EVENTS_CHANGED, () => this.eventsChanged(), this);
        this.liveIds = this.liveKey();
        this.setPosition(Math.max(0, Math.round((window.innerWidth - WIDTH) / 2)), Math.max(0, Math.round((window.innerHeight - HEIGHT) / 2) - 20));
        this.draw();
    }

    public destroy() {
        super.destroy();
        Hint.hide();
        window.removeEventListener("keydown", this.keys);
        this.titleBar.destroy();
        this.titleBar = null;
        this.background.destroy();
        this.background = null;
        this.container.destroy({ children: true });
    }

    // the log, from the server (it keeps it a minute, so asking again is cheap)
    public ask() {
        this.askedAt = Date.now();
        IBC.net.event.past();
    }

    // one ending (or starting): the log asked for again
    private eventsChanged() {
        const key = this.liveKey();
        if (key != this.liveIds) {
            this.liveIds = key;
            this.ask();
        }
        this.draw();
    }

    private liveKey() {
        return IBC.data.events.live().map((e) => e.i).join(",");
    }

    // the clocks kept up, the log now and then
    public update(deltaTime: number) {
        this.since += deltaTime;
        if (this.since < 1000) return;
        this.since = 0;
        if (Date.now() - this.askedAt >= EventsWindow.REFRESH_MS) this.ask();
        this.draw();
    }

    private draw() {
        const live = IBC.data.events.live(), now = Date.now();
        // (redrawn only when something shown has changed)
        const key = JSON.stringify([live, live.map((e) => timeLeft(e.e - now)), this.past, Math.floor(now / 60000)]);
        if (key == this.drawn) return;
        this.drawn = key;
        Hint.hide();
        for (const c of [this.top, this.list]) c.removeChildren().forEach((d) => d.destroy({ children: true }));
        this.listY = this.drawLive(live);
        this.drawPast();
    }

    // those on now, then the log's heading; where the log starts
    private drawLive(live: EventView[]) {
        const { W, PAD, LINE, LIVE_ROW } = EventsWindow, now = Date.now();
        let y = 2;
        this.heading("On now", y); y += LINE + 2;
        if (!live.length) {
            this.text("None on now: another starts before long", PAD + 4, y, AP.IRON, this.top);
            y += LINE;
        }
        for (const e of live.sort((a, b) => a.e - b.e)) {
            const boss = isBossEvent(e), hue = boss ? AP.FLAME : AP.STRAW;
            const row = this.row(this.top, y, LIVE_ROW, () => EventInfo.open(e.i));
            Hint.on(row, `${e.n}\n${eventDef(e.k).name}, at ${IBC.data.heroes.nameOf(e.p)}${e.m ? `\nYour points: ${Math.round(e.m)}` : ""}\nClick for the event's window, to send heroes`);
            const t = this.text(eventTitle(e), PAD, y + 2, hue, this.top);
            const left = this.text(`${timeLeft(e.e - now)} left`, 0, y + 2, hue, this.top);
            left.x = W - PAD - Math.ceil(left.textWidth);
            fit(t, left.x - 6 - PAD);
            // where, and a bar of how far it's got
            const part = Math.min(1, e.d / e.g), barW = 80, barX = W - PAD - barW, by = y + 12;
            fit(this.text(IBC.data.heroes.nameOf(e.p), PAD, by + 1, AP.SAND, this.top), barX - 6 - PAD);
            const bar = new PIXI.Graphics();
            bar.beginFill(AP.BLACK).drawRect(barX, by, barW, 9).endFill();
            bar.beginFill(AP.SLATE).drawRect(barX + 1, by + 1, barW - 2, 7).endFill();
            bar.beginFill(boss ? AP.RED : AP.OCHRE).drawRect(barX + 1, by + 1, Math.round((barW - 2) * part), 7).endFill();
            bar.eventMode = "none";
            this.top.addChild(bar);
            const pc = this.text(`${Math.floor(part * 100)}%`, 0, by + 1, AP.WHITE, this.top);
            pc.x = Math.round(barX + (barW - pc.textWidth) / 2);
            y += LIVE_ROW;
        }
        y += 3;
        this.heading("Past events", y);
        return y + LINE + 2;
    }

    // the log: a row each, newest first
    private drawPast() {
        const { W, H, PAD, PAST_ROW } = EventsWindow, now = Date.now();
        const room = H - 12 - this.listY;
        this.listMask.clear().beginFill(0xffffff).drawRect(0, this.listY, W, room).endFill();
        const past = this.past;
        this.foot.text = past == null ? "Looking..." : past.length ? `The last ${past.length == PAST_MOST ? PAST_MOST : past.length} over, newest first` : "";
        let y = 0;
        if (past && !past.length) { this.text("None over yet", PAD + 4, y, AP.IRON, this.list); y += EventsWindow.LINE; }
        for (const e of past ?? []) {
            const won = e.w == 1, boss = isBossEvent(e);
            const shown = IBC.data.events.get(e.i);        // (won, its boon still on: it has a window)
            const row = this.row(this.list, y, PAST_ROW, shown ? () => EventInfo.open(e.i) : null);
            Hint.on(row, this.about(e, !!shown));
            const t = this.text(eventTitle(e), PAD, y + 2, won ? (boss ? AP.FLAME : AP.STRAW) : AP.ASH, this.list);
            // your rare find down the right, if you got one
            let edge = W - PAD - 4;
            if (e.f) {
                const pic = new PIXI.Sprite(itemTexture(e.f));
                edge -= 16;
                pic.position.set(edge, y + 2);
                pic.eventMode = "none";
                this.list.addChild(pic);
                edge -= 3;
            }
            const when = this.text(ago(e.x, now), 0, y + 2, AP.STONE, this.list);
            when.x = edge - Math.ceil(when.textWidth);
            fit(t, when.x - 6 - PAD);
            // how it ended, at where; your points and gold on the right
            const how = won ? `Done! by ${e.c} player${e.c == 1 ? "" : "s"}` : e.w == 3 ? `Reached its town at ${Math.floor(100 * Math.min(1, e.d / e.g))}%` : `Out of time at ${Math.floor(100 * Math.min(1, e.d / e.g))}%`;
            const h = this.text(how, PAD, y + 12, won ? AP.LIME : AP.STONE, this.list);
            const at = this.text(`at ${IBC.data.heroes.nameOf(e.p)}`, PAD + Math.ceil(h.textWidth) + 4, y + 12, AP.SAND, this.list);
            let right = edge;
            if (e.y) {
                const gold = this.text(`+${e.y}g`, 0, y + 12, AP.STRAW, this.list);
                gold.x = right - Math.ceil(gold.textWidth);
                right = gold.x - 4;
            }
            if (e.m) {
                const you = this.text(`You: ${Math.round(e.m)}`, 0, y + 12, AP.WHITE, this.list);
                you.x = right - Math.ceil(you.textWidth);
                right = you.x - 6;
            }
            fit(at, right - at.x);
            y += PAST_ROW;
        }
        this.listH = y;
        this.placeList();
    }

    // what pointing at one in the log says
    private about(e: PastEvent, shown: boolean) {
        const lines = [e.n, `${eventDef(e.k).name}, at ${IBC.data.heroes.nameOf(e.p)}`];
        const ended = new Date(e.x).toLocaleString([], { weekday: "short", hour: "numeric", minute: "2-digit" });
        lines.push(e.w == 1 ? `Done ${ended}, ${Math.floor(e.g)} points given` : `${e.w == 3 ? "Reached its town" : "Out of time"} ${ended}, ${Math.floor(e.d)} of ${Math.floor(e.g)} points given`);
        e.t.forEach(([name, points, , item], k) => lines.push(`${k + 1}. ${name} ${Math.round(points)}${item ? `, found ${itemName(item)}` : ""}`));
        if (e.m) lines.push(`Your points: ${Math.round(e.m)}`);
        if (e.y) lines.push(`You got ${e.y}g${e.f ? ` and ${itemName(e.f)}` : ""}`);
        if (shown && (e.u ?? 0) > Date.now()) lines.push(`${eventDef(e.k).boonText} till ${new Date(e.u).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })} (click for its window)`);
        return lines.join("\n");
    }

    // the log's height on screen
    private room() {
        return EventsWindow.H - 12 - this.listY;
    }

    // the bar's thumb: its length, and how far down the log's top it is
    private thumb() {
        const room = this.room();
        const thumb = Math.max(12, Math.round(room * room / this.listH));
        return { thumb, at: Math.round((room - thumb) * this.scroll / (this.listH - room)) };
    }

    // scrolled so the thumb's grabbed point is y down the log's top
    private dragTo(y: number) {
        const room = this.room(), { thumb } = this.thumb();
        this.scroll = (y - this.grab) / (room - thumb) * (this.listH - room);
        this.placeList();
    }

    // the log where it's scrolled to, its bar on the right (a strip wider than it takes the pointer)
    private placeList() {
        const { W } = EventsWindow, room = this.room();
        this.scroll = Math.max(0, Math.min(this.scroll, this.listH - room));
        this.list.y = this.listY - this.scroll;
        this.bar.clear();
        this.bar.hitArea = this.listH > room ? new PIXI.Rectangle(W - 8, this.listY, 8, room) : new PIXI.Rectangle(0, 0, 0, 0);
        if (this.listH <= room) return;
        const { thumb, at } = this.thumb();
        this.bar.beginFill(AP.SHADOW).drawRect(W - 3, this.listY, 2, room).endFill();
        this.bar.beginFill(AP.STONE).drawRect(W - 3, this.listY + at, 2, thumb).endFill();
    }

    //#region bits

    // a row's back, lit while pointed at (clickable with `tap`)
    private row(parent: PIXI.Container, y: number, h: number, tap: () => void) {
        const { W } = EventsWindow;
        const back = new PIXI.Graphics();
        const paint = (lit: boolean) => back.clear().beginFill(lit ? AP.SLATE : AP.SHADOW, lit ? 1 : 0.5).drawRect(2, y, W - 4, h - 2).endFill();
        paint(false);
        back.eventMode = "static";
        back.hitArea = new PIXI.Rectangle(2, y, W - 4, h - 2);
        back.on("pointerover", () => paint(true));
        back.on("pointerout", () => paint(false));
        if (tap) {
            back.cursor = "pointer";
            back.on("pointertap", tap);
        }
        parent.addChild(back);
        return back;
    }

    private text(text: string, x: number, y: number, tint: number, parent: PIXI.Container) {
        const t = new PIXI.BitmapText(text, { fontName: Constants.PIXEL_FONT, fontSize: 32 });
        t.tint = tint;
        t.position.set(x, y);
        t.eventMode = "none";
        parent.addChild(t);
        return t;
    }

    // a heading with a rule from it to the other side
    private heading(text: string, y: number) {
        const { W, PAD } = EventsWindow;
        const t = this.text(text, PAD, y, AP.STRAW, this.top);
        const from = PAD + Math.ceil(t.textWidth) + 4;
        this.top.addChild(new PIXI.Graphics().beginFill(AP.IRON).drawRect(from, y + 3, W - PAD - from, 1).endFill());
    }

    //#endregion

}

// how long ago, in a word or two
function ago(at: number, now: number) {
    const s = Math.max(0, (now - at) / 1000);
    if (s < 60) return "just now";
    if (s < 3600) return `${Math.floor(s / 60)}m ago`;
    if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
    return `${Math.floor(s / 86400)}d ago`;
}
