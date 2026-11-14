import * as PIXI from "pixi.js";
import { AP } from "../../constants/Palette";
import { Event } from "../../constants/Events";
import { IBC } from "../../Engine";
import { Panel } from "../../shared/Panel";
import { BaseComponent, ComponentType } from "../BaseComponent";
import { button, text, textWidth } from "../games/GameUI";
import { fit } from "../heroroster/HeroRoster";

// An ask to trade (shared/Trade.ts), at the top of the screen as Lithalia's
// request panel is: one to you - who's asking, the time running down, Accept
// and Decline -, or yours - who you asked, the time, Take back. Closed by the
// network handler as the ask ends (TradeHandler).

export class TradeAsk extends BaseComponent {

    public static SCALE = 2;
    public static W = 170;
    public static H = 34;
    public static INSET = 8;
    public static WIDTH = TradeAsk.INSET * 2 + TradeAsk.W * TradeAsk.SCALE;
    public static HEIGHT = TradeAsk.INSET * 2 + TradeAsk.H * TradeAsk.SCALE;

    private background: Panel;
    private content: PIXI.Container;
    private left: PIXI.BitmapText;
    private shownSecs = -1;

    constructor() {
        super(ComponentType.TRADE_ASK);
        this.create();
    }

    public create() {
        super.create();
        const { WIDTH, HEIGHT, W, H, SCALE, INSET } = TradeAsk;
        this.container.eventMode = "static";
        this.container.hitArea = new PIXI.Rectangle(0, 0, WIDTH, HEIGHT);
        this.container.on("pointerdown", (e: PIXI.FederatedPointerEvent) => e.stopPropagation());
        this.background = new Panel(this.container);
        this.background.setSize(WIDTH, HEIGHT);
        this.content = new PIXI.Container();
        this.content.scale.set(SCALE);
        this.content.position.set(INSET, INSET);
        this.container.addChild(this.content);
        IBC.events.register(Event.TRADE_ASK, () => this.draw(), this);
        this.resize();
        this.draw();
    }

    public destroy() {
        super.destroy();
        this.background.destroy();
        this.container.destroy({ children: true });
    }

    public resize() {
        this.setPosition(Math.round((window.innerWidth - TradeAsk.WIDTH) / 2), 16);
    }

    public update() {
        const secs = this.secsLeft();
        if (secs != this.shownSecs && this.left) {
            this.shownSecs = secs;
            this.left.text = `${secs}s`;
        }
    }

    private secsLeft() {
        const a = IBC.net.trade.ask;
        return a ? Math.max(0, Math.ceil((a.e - Date.now()) / 1000)) : 0;
    }

    private draw() {
        const { W, H } = TradeAsk, a = IBC.net.trade.ask;
        this.content.removeChildren().forEach((c) => c.destroy({ children: true }));
        this.left = null;
        if (!a) return;
        this.content.addChild(new PIXI.Graphics().beginFill(AP.INK).drawRect(-2, -2, W + 4, H + 4).endFill());
        this.bringToTop();
        const line = a.f ? `Asking ${a.n} to trade...` : `${a.n} wants to trade`;
        fit(text(line, 2, 2, a.f ? AP.ASH : AP.STRAW, this.content), W - 24);
        this.left = text(`${this.secsLeft()}s`, W - 20, 2, AP.STONE, this.content);
        if (a.f) {
            const w = textWidth("Take back") + 6;
            button("Take back", W - 2 - w, 20, this.content, () => IBC.net.trade.cancel());
            return;
        }
        const dw = textWidth("Decline") + 6;
        button("Decline", W - 2 - dw, 20, this.content, () => IBC.net.trade.answer(false));
        const aw = textWidth("Accept") + 6;
        button("Accept", W - 2 - dw - 4 - aw, 20, this.content, () => IBC.net.trade.answer(true));
    }

}
