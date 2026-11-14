import * as PIXI from "pixi.js";
import { ACHIEVEMENTS } from "../../../../shared/Achievements";
import { Event } from "../../constants/Events";
import { AP } from "../../constants/Palette";
import { IBC } from "../../Engine";
import { Panel } from "../../shared/Panel";
import { TitleBar } from "../../shared/ui/titlebar/TitleBar";
import { BaseComponent, ComponentType } from "../BaseComponent";
import { Chat } from "../chat/Chat";
import { text, textWidth } from "../games/GameUI";
import { fit } from "../heroroster/HeroRoster";

// Achievements (shared/Achievements.ts; the user, 2026-11-05), from the other
// menu: how many are done, and each - a cup (gold when done), its name, what
// it takes and when it was done; those done first, newest first, then those
// to do, those that can be counted showing how far along ("640/1,000" and a
// bar). The wheel or its bar scrolls it; Escape or its cross closes it.

export class Achievements extends BaseComponent {

    public static SCALE = 2;
    public static W = 240;              // in its own px
    public static H = 250;
    public static ROW_H = 25;
    public static PAD = 6;
    public static INSET_X = 12;         // the window round it, in screen px
    public static INSET_Y = 28;
    public static WIDTH = Achievements.INSET_X * 2 + Achievements.W * Achievements.SCALE;
    public static HEIGHT = Achievements.INSET_Y + Achievements.H * Achievements.SCALE + Achievements.INSET_X;

    public background: Panel;
    public titleBar: TitleBar;
    private content: PIXI.Container;
    private list = new PIXI.Container();
    private listMask = new PIXI.Graphics();
    private bar = new PIXI.Graphics();
    private listH = 0;
    private scroll = 0;
    private top = 0;                    // (the list's top, under the count)

    private keys = (e: KeyboardEvent) => { if (e.key == "Escape" && !Chat.takes(e)) IBC.comp.destroy(this); };

    constructor() {
        super(ComponentType.ACHIEVEMENTS);
        this.create();
    }

    public static open() {
        const view = IBC.comp.getOrCreate(ComponentType.ACHIEVEMENTS) as Achievements;
        view.bringToTop();
        return view;
    }

    public create() {
        super.create();
        const { WIDTH, HEIGHT, W, H, ROW_H } = Achievements;
        this.container.eventMode = "static";
        this.container.hitArea = new PIXI.Rectangle(0, 0, WIDTH, HEIGHT);
        this.container.on("pointerdown", (e: PIXI.FederatedPointerEvent) => e.stopPropagation());
        this.container.on("wheel", (e: PIXI.FederatedWheelEvent) => {
            e.stopPropagation();
            this.scroll += e.deltaY < 0 ? -ROW_H * 2 : ROW_H * 2;
            this.placeList();
        });
        this.background = new Panel(this.container);
        this.background.setSize(WIDTH, HEIGHT);
        this.titleBar = new TitleBar(this);
        this.titleBar.setPosition(4, 4);
        this.titleBar.setSize(WIDTH - 8, 20);
        this.titleBar.setTitle("Achievements");

        this.content = new PIXI.Container();
        this.content.scale.set(Achievements.SCALE);
        this.content.position.set(Achievements.INSET_X, Achievements.INSET_Y);
        this.container.addChild(this.content);
        this.content.addChild(new PIXI.Graphics().beginFill(AP.INK).drawRect(-4, -2, W + 8, H + 6).endFill());
        this.content.addChild(this.list, this.listMask, this.bar);
        this.list.mask = this.listMask;

        IBC.events.register(Event.ACHIEVED, () => this.draw(), this);
        IBC.events.register(Event.ACHIEVEMENTS, () => this.draw(), this);
        window.addEventListener("keydown", this.keys);
        this.setPosition(Math.max(0, Math.round((window.innerWidth - WIDTH) / 2)), Math.max(0, Math.round((window.innerHeight - HEIGHT) / 2) - 20));
        this.draw();
    }

    public destroy() {
        super.destroy();
        window.removeEventListener("keydown", this.keys);
        this.titleBar.destroy();
        this.background.destroy();
        this.container.destroy({ children: true });
    }

    private draw() {
        const { W, H, PAD, ROW_H } = Achievements, had = IBC.data.player.achievements;
        for (const c of this.content.children.filter((c) => (c as any).head)) c.destroy({ children: true });
        this.list.removeChildren().forEach((c) => c.destroy({ children: true }));

        // how many done, and a bar of it
        const done = ACHIEVEMENTS.filter((a) => had.has(a.id)).length, head = new PIXI.Container();
        (head as any).head = true;
        text(`${done} of ${ACHIEVEMENTS.length} done`, PAD, 2, AP.STRAW, head);
        const w = W - PAD * 2;
        head.addChild(new PIXI.Graphics().beginFill(AP.SHADOW).drawRect(PAD, 13, w, 3).endFill()
            .beginFill(AP.STRAW).drawRect(PAD, 13, Math.round(w * done / ACHIEVEMENTS.length), 3).endFill());
        this.content.addChild(head);
        this.top = 22;

        // done (newest first), then to do
        const rows = [...ACHIEVEMENTS].sort((a, b) => (had.get(b.id) ?? 0) - (had.get(a.id) ?? 0));
        rows.forEach((a, k) => {
            const at = had.get(a.id), y = k * ROW_H, row = new PIXI.Container();
            row.y = y;
            row.addChild(new PIXI.Graphics().beginFill(AP.BLACK).drawRect(PAD, 0, W - PAD * 2 - 6, ROW_H - 2).endFill()
                .beginFill(at ? AP.SLATE : AP.SHADOW).drawRect(PAD + 1, 1, W - PAD * 2 - 8, ROW_H - 4).endFill());
            row.addChild(cup(PAD + 4, 4, !!at));
            const x = PAD + 20;
            const along = at ? null : progressOf(a.id);
            const label = at ? new Date(at).toLocaleDateString(undefined, { day: "numeric", month: "short" }) : along ? `${count(Math.min(along[0], along[1]))}/${count(along[1])}` : "";
            const when = label ? text(label, 0, 3, at ? AP.STONE : AP.ASH, row) : null;
            if (along) {
                const bw = 40, bx = W - PAD - 10 - bw;
                row.addChild(new PIXI.Graphics().beginFill(AP.BLACK).drawRect(bx, 14, bw, 3).endFill()
                    .beginFill(AP.STRAW).drawRect(bx, 14, Math.round(bw * Math.min(1, along[0] / along[1])), 3).endFill());
            }
            if (when) when.x = W - PAD - 10 - textWidth(when.text);
            fit(text(a.name, x, 3, at ? AP.WHITE : AP.STONE, row), (when ? when.x : W - PAD - 10) - x - 4);
            fit(text(a.text, x, 13, at ? AP.ASH : AP.IRON, row), W - PAD - 10 - x - (along ? 44 : 0));
            this.list.addChild(row);
        });
        this.listH = rows.length * ROW_H;
        this.listMask.clear().beginFill(0xffffff).drawRect(0, this.top, W, H - this.top).endFill();
        this.placeList();
    }

    private placeList() {
        const { W, H } = Achievements, room = H - this.top;
        this.scroll = Math.max(0, Math.min(this.scroll, this.listH - room));
        this.list.y = this.top - this.scroll;
        this.bar.clear();
        if (this.listH <= room) return;
        const thumb = Math.max(12, Math.round(room * room / this.listH)), at = this.top + Math.round((room - thumb) * this.scroll / (this.listH - room));
        this.bar.beginFill(AP.SHADOW).drawRect(W - 3, this.top, 2, room).endFill();
        this.bar.beginFill(AP.STONE).drawRect(W - 3, at, 2, thumb).endFill();
    }

}

// how far along one that can be counted is: [have, needed] (null: not counted)
function progressOf(id: string): [number, number] {
    const gold = IBC.data.inventory.gold ?? 0, heroes = IBC.data.heroes.heroes;
    const pile = Math.max(0, ...Array.from(IBC.data.inventory.items.values()).map((i) => i.amount));
    const level = Math.max(1, ...heroes.map((h) => Math.max(...h.d.k)));
    switch (id) {
        case "gold100": return [gold, 100];
        case "gold1k": return [gold, 1000];
        case "gold10k": return [gold, 10000];
        case "pile100": return [pile, 100];
        case "pile1k": return [pile, 1000];
        case "heroes3": return [heroes.length, 3];
        case "level10": return [level, 10];
        case "level25": return [level, 25];
        case "level50": return [level, 50];
        case "daily3": return [IBC.data.player.daily.s, 3];
        case "daily7": return [IBC.data.player.daily.s, 7];
    }
    return null;
}

// 1,234
function count(n: number) {
    return Math.round(n).toLocaleString("en-US");
}

// a little cup: gold, done; grey, not yet
function cup(x: number, y: number, done: boolean) {
    const [c, lit, dark] = done ? [AP.AMBER, AP.STRAW, AP.OCHRE] : [AP.IRON, AP.STEEL, AP.SHADOW];
    return new PIXI.Graphics()
        .beginFill(c).drawRect(x + 1, y, 10, 6).drawRect(x + 2, y + 6, 8, 2).drawRect(x + 4, y + 8, 4, 3).endFill()
        .beginFill(lit).drawRect(x + 2, y, 2, 5).endFill()
        .beginFill(c).drawRect(x - 1, y + 1, 2, 1).drawRect(x - 1, y + 1, 1, 3).drawRect(x + 11, y + 1, 2, 1).drawRect(x + 12, y + 1, 1, 3).endFill()
        .beginFill(dark).drawRect(x + 2, y + 11, 8, 3).endFill();
}
