import * as PIXI from "pixi.js";
import { Constants } from "../../constants/Constants";
import { AP } from "../../constants/Palette";
import { IBC } from "../../Engine";
import { Panel } from "../../shared/Panel";
import { store } from "../../shared/dom/Dom";
import { TitleBar } from "../../shared/ui/titlebar/TitleBar";
import { BaseComponent, ComponentType } from "../BaseComponent";
import { Chat, wrap } from "../chat/Chat";
import { text, textWidth } from "../games/GameUI";
import { fit } from "../heroroster/HeroRoster";
import { MoreMenu } from "../moremenu/MoreMenu";
import { UPDATE_NOTES } from "./UpdateNotes";

// Updates (the user, 2026-11-02: "call it updates or something then and it
// should list ai made human readable patch notes"), from the other menu: the
// patch notes (UpdateNotes.ts), newest first - each update's title, its
// version and date, and what changed, a wrapped line a point. Those newer
// than the last read are marked New; opening it reads them all (the other
// menu's New goes). The wheel or its bar scrolls it; Escape or its cross closes it.

export class Updates extends BaseComponent {

    public static SCALE = 2;
    public static W = 260;              // in its own px
    public static H = 262;
    public static PAD = 6;
    public static LINE = 10;
    public static BULLET = 8;           // a point's lines in from its dash
    public static GAP = 10;             // between updates
    public static INSET_X = 12;         // the window round it, in screen px
    public static INSET_Y = 28;
    public static WIDTH = Updates.INSET_X * 2 + Updates.W * Updates.SCALE;
    public static HEIGHT = Updates.INSET_Y + Updates.H * Updates.SCALE + Updates.INSET_X;

    public background: Panel;
    public titleBar: TitleBar;
    private content: PIXI.Container;
    private list = new PIXI.Container();
    private listMask = new PIXI.Graphics();
    private bar = new PIXI.Graphics();          // (where it's scrolled to)
    private listH = 0;
    private scroll = 0;
    private grab: number = null;                // (dragging the bar: how far down the thumb it's held)
    private seen: string;                       // (the newest read before this opening)

    private keys = (e: KeyboardEvent) => { if (e.key == "Escape" && !Chat.takes(e)) IBC.comp.destroy(this); };

    constructor() {
        super(ComponentType.UPDATES);
        this.create();
    }

    // the window (one open at a time), every note read
    public static open() {
        const view = IBC.comp.getOrCreate(ComponentType.UPDATES) as Updates;
        view.bringToTop();
        store.set(Constants.LS_UPDATES_SEEN, UPDATE_NOTES[0].version);
        (IBC.comp.getFirstByType(ComponentType.MORE_MENU) as MoreMenu)?.showBadges();
        return view;
    }

    // a note out since the last one read (none read yet: only the newest)
    public static isNew(version: string, seen = store.get(Constants.LS_UPDATES_SEEN)) {
        const at = UPDATE_NOTES.findIndex((n) => n.version == seen);
        const k = UPDATE_NOTES.findIndex((n) => n.version == version);
        return at < 0 ? k == 0 : k < at;
    }

    public create() {
        super.create();
        const { WIDTH, HEIGHT, W, H, LINE } = Updates;
        this.seen = store.get(Constants.LS_UPDATES_SEEN);
        this.container.eventMode = "static";
        this.container.hitArea = new PIXI.Rectangle(0, 0, WIDTH, HEIGHT);
        this.container.on("pointerdown", (e: PIXI.FederatedPointerEvent) => e.stopPropagation());
        this.container.on("wheel", (e: PIXI.FederatedWheelEvent) => {
            e.stopPropagation();
            this.scroll += e.deltaY < 0 ? -3 * LINE : 3 * LINE;
            this.placeList();
        });

        this.background = new Panel(this.container);
        this.background.setSize(WIDTH, HEIGHT);
        this.titleBar = new TitleBar(this);
        this.titleBar.setPosition(4, 4);
        this.titleBar.setSize(WIDTH - 8, 20);
        this.titleBar.setTitle("Updates");

        this.content = new PIXI.Container();
        this.content.scale.set(Updates.SCALE);
        this.content.position.set(Updates.INSET_X, Updates.INSET_Y);
        this.container.addChild(this.content);
        // (the panel's middle lets the map through)
        this.content.addChild(new PIXI.Graphics().beginFill(AP.INK).drawRect(-4, -2, W + 8, H + 6).endFill());
        this.listMask.beginFill(0xffffff).drawRect(0, 0, W, H).endFill();
        this.list.mask = this.listMask;
        this.content.addChild(this.listMask, this.list, this.bar);
        // the bar dragged by its thumb, or the thumb jumped to where the track's pressed
        this.bar.eventMode = "static";
        this.bar.cursor = "pointer";
        this.bar.hitArea = new PIXI.Rectangle(W - 8, 0, 8, H);
        this.bar.on("pointerdown", (e: PIXI.FederatedPointerEvent) => {
            e.stopPropagation();
            if (this.listH <= H) return;
            const y = this.content.toLocal(e.global).y;
            const { thumb, at } = this.thumb();
            this.grab = y >= at && y < at + thumb ? y - at : thumb / 2;
            this.dragTo(y);
        });
        this.bar.on("globalpointermove", (e: PIXI.FederatedPointerEvent) => { if (this.grab != null) this.dragTo(this.content.toLocal(e.global).y); });
        this.bar.on("pointerup", () => this.grab = null);
        this.bar.on("pointerupoutside", () => this.grab = null);

        window.addEventListener("keydown", this.keys);
        this.setPosition(Math.max(0, Math.round((window.innerWidth - WIDTH) / 2)), Math.max(0, Math.round((window.innerHeight - HEIGHT) / 2) - 20));
        this.draw();
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

    // every update: its title (New on the newly out), version and date on the right, its points under it
    private draw() {
        const { W, PAD, LINE, BULLET, GAP } = Updates;
        const room = W - 2 * PAD - 4 - BULLET;
        let y = 2;
        for (const note of UPDATE_NOTES) {
            const fresh = Updates.isNew(note.version, this.seen);
            const when = text(`${note.version}  ${note.date}`, 0, y, AP.STONE, this.list);
            when.x = W - PAD - 4 - Math.ceil(when.textWidth);
            let x = PAD;
            if (fresh) {
                const w = textWidth("New") + 4;
                this.list.addChild(new PIXI.Graphics().beginFill(AP.RED).drawRect(x, y - 1, w, 9).endFill());
                text("New", x + 2, y, AP.WHITE, this.list);
                x += w + 4;
            }
            fit(text(note.title, x, y, AP.STRAW, this.list), when.x - 6 - x);
            y += LINE;
            this.list.addChild(new PIXI.Graphics().beginFill(AP.IRON).drawRect(PAD, y - 1, W - 2 * PAD - 4, 1).endFill());
            y += 3;
            for (const point of note.lines) {
                text("-", PAD + 2, y, AP.STEEL, this.list);
                for (const line of wrap(point, room, room, (s) => textWidth(s))) {
                    text(line, PAD + BULLET, y, fresh ? AP.WHITE : AP.ASH, this.list);
                    y += LINE;
                }
                y += 2;
            }
            y += GAP;
        }
        this.listH = y;
        this.placeList();
    }

    // the bar's thumb: its length, and how far down it is
    private thumb() {
        const { H } = Updates;
        const thumb = Math.max(12, Math.round(H * H / this.listH));
        return { thumb, at: Math.round((H - thumb) * this.scroll / (this.listH - H)) };
    }

    // scrolled so the thumb's grabbed point is at y
    private dragTo(y: number) {
        const { H } = Updates;
        const { thumb } = this.thumb();
        this.scroll = (y - this.grab) / (H - thumb) * (this.listH - H);
        this.placeList();
    }

    // the list where it's scrolled to, its bar on the right
    private placeList() {
        const { W, H } = Updates;
        this.scroll = Math.max(0, Math.min(this.scroll, this.listH - H));
        this.list.y = -this.scroll;
        this.bar.clear();
        if (this.listH <= H) return;
        const { thumb, at } = this.thumb();
        this.bar.beginFill(AP.SHADOW).drawRect(W - 3, 0, 2, H).endFill();
        this.bar.beginFill(AP.STONE).drawRect(W - 3, at, 2, thumb).endFill();
    }

}
