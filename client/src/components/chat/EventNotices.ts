import * as PIXI from "pixi.js";
import { ChatLine } from "../../../../shared/Chat";
import { isLive, marchAt } from "../../../../shared/Events";
import { Constants } from "../../constants/Constants";
import { AP } from "../../constants/Palette";
import { IBC } from "../../Engine";
import { ComponentType } from "../BaseComponent";
import { EventInfo } from "../eventinfo/EventInfo";
import type { Map as WorldMap } from "../map/Map";
import { wrap } from "./Chat";

// An event's line (ChatData.isEvent, the user, 2026-10-31: "remove the event
// messages from the chat window. make them into a little box that slides in
// from the side of the screen"): a little box sliding in from the left edge,
// top left, staying a while and sliding out again. Several stack down, the
// newest at the bottom. Clicking one sends it off early, and shows its event
// (the user, 2026-11-03: "clicking the event toasts should center the camera on
// the event and open the event component"). The chat's (Chat makes, moves and
// ends it), on the stage over the windows. What you got for one stays longer
// and is the last to make way (a player, 2026-11-04: it "needs to last a lot
// longer"; the events window's log keeps it after: EventsWindow).

interface Notice { box: PIXI.Container; h: number; age: number; out: number; stay: number; reward: boolean; }

export class EventNotices {

    public static SCALE = 2;
    public static W = 150;              // a box, in its own px
    public static TOP = 60;             // screen px down from the top
    public static LEFT = 20;            // and in from the left, slid in
    public static GAP = 4;              // screen px between boxes
    public static SLIDE_MS = 250;
    public static STAY_MS = 20000;
    public static REWARD_STAY_MS = 45000;
    public static MOST = 4;             // shown at once (the oldest go)

    private container = new PIXI.Container();
    private notices: Notice[] = [];
    private measure: PIXI.BitmapText;

    constructor() {
        this.container.zIndex = 1e9;
        IBC.pixi.stage.addChild(this.container);
    }

    public destroy() {
        IBC.pixi.stage.removeChild(this.container);
        this.container.destroy({ children: true });
        this.measure?.destroy();
    }

    public add(line: ChatLine) {
        const { W, SCALE } = EventNotices;
        const lines = wrap(line.t, W - 8, W - 8, (s) => this.width(s));
        const h = 14 + lines.length * 10;
        const box = new PIXI.Container();
        box.scale.set(SCALE);
        box.addChild(new PIXI.Graphics()
            .beginFill(AP.BLACK, 0.9).drawRect(0, 0, W, h).endFill()
            .beginFill(AP.INK, 0.9).drawRect(1, 1, W - 2, h - 2).endFill()
            .beginFill(AP.STRAW).drawRect(1, 1, 2, h - 2).endFill());
        this.text(line.n, 6, 3, AP.STRAW, box);
        lines.forEach((l, i) => this.text(l, 6, 13 + i * 10, AP.SAND, box));
        box.eventMode = "static";
        box.cursor = "pointer";
        const reward = !!line.r;
        const notice: Notice = { box, h: h * SCALE, age: 0, out: 0, stay: reward ? EventNotices.REWARD_STAY_MS : EventNotices.STAY_MS, reward };
        box.on("pointerdown", (e: PIXI.FederatedPointerEvent) => e.stopPropagation());
        box.on("pointertap", () => { notice.out ||= 1; this.showEvent(line.v); });
        this.container.addChild(box);
        this.notices.push(notice);
        // too many: the oldest go, rewards after the rest (never the one just come)
        const older = this.notices.slice(0, -1).sort((a, b) => +a.reward - +b.reward);
        for (const n of older.slice(0, Math.max(0, this.notices.length - EventNotices.MOST))) n.out ||= 1;
        this.place(0);
    }

    public update(deltaTime: number) {
        if (this.notices.length) this.place(deltaTime);
    }

    // its window, and the map to where it is now (one over and gone: nothing to show)
    private showEvent(id: number) {
        const e = IBC.data.events.get(id);
        if (!e) return;
        EventInfo.open(id);
        const map = IBC.comp.getFirstByType(ComponentType.MAP) as WorldMap, graph = IBC.data.heroes.graph, now = Date.now();
        const at = (isLive(e, now) ? marchAt(e, graph, now) : null) ?? graph.get(e.p);
        if (!map || !at) return;
        map.follow(null);
        map.camera.centerOn(at.x, at.y);
    }

    // each box slid in as far as it's got (or out), stacked under those before it
    private place(deltaTime: number) {
        const { W, SCALE, TOP, LEFT, GAP, SLIDE_MS } = EventNotices;
        let y = TOP;
        for (const n of this.notices.slice()) {
            n.age += deltaTime;
            if (!n.out && n.age >= SLIDE_MS + n.stay) n.out = 1;
            else if (n.out) n.out += deltaTime;
            const shown = n.out ? 1 - Math.min(1, n.out / SLIDE_MS) : Math.min(1, n.age / SLIDE_MS);
            if (n.out && shown <= 0) {
                this.notices.splice(this.notices.indexOf(n), 1);
                n.box.destroy({ children: true });
                continue;
            }
            const ease = 1 - (1 - shown) * (1 - shown);
            n.box.position.set(Math.round(-W * SCALE + (W * SCALE + LEFT) * ease), y);
            y += n.h + GAP;
        }
    }

    private width(text: string) {
        this.measure ??= new PIXI.BitmapText("", { fontName: Constants.PIXEL_FONT, fontSize: 32 });
        this.measure.text = text;
        return Math.ceil(this.measure.textWidth);
    }

    private text(text: string, x: number, y: number, tint: number, parent: PIXI.Container) {
        const t = new PIXI.BitmapText(text, { fontName: Constants.PIXEL_FONT, fontSize: 32 });
        t.tint = tint;
        t.position.set(x, y);
        t.eventMode = "none";
        parent.addChild(t);
        return t;
    }

}
