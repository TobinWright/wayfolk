import * as PIXI from "pixi.js";
import { Event } from "../../constants/Events";
import { AP } from "../../constants/Palette";
import { IBC } from "../../Engine";
import { Panel } from "../../shared/Panel";
import { BaseComponent, ComponentType } from "../BaseComponent";
import { button, text, textWidth } from "../games/GameUI";
import { fit } from "../heroroster/HeroRoster";
import { TradeAsk } from "../trade/TradeAsk";

// The asks to you into a party (shared/Parties.ts; the user, 2026-11-03: "players
// should get a 20 second message and if they dont accept, its canceled"), at
// the top of the screen under where an ask to trade comes (TradeAsk): for each,
// who's asking which of your heroes into what, who's in it, the time running
// down, Accept and Decline. There while there are any (PartyHandler).

export class PartyAskBox extends BaseComponent {

    public static SCALE = 2;
    public static W = 220;
    public static ROW_H = 34;
    public static INSET = 8;
    public static WIDTH = PartyAskBox.INSET * 2 + PartyAskBox.W * PartyAskBox.SCALE;

    private background: Panel;
    private content: PIXI.Container;
    private times: [PIXI.BitmapText, number][] = [];    // the time left shown, when it runs out

    constructor() {
        super(ComponentType.PARTY_ASK);
        this.create();
    }

    public create() {
        super.create();
        const { SCALE, INSET } = PartyAskBox;
        this.container.eventMode = "static";
        this.container.on("pointerdown", (e: PIXI.FederatedPointerEvent) => e.stopPropagation());
        this.background = new Panel(this.container);
        this.content = new PIXI.Container();
        this.content.scale.set(SCALE);
        this.content.position.set(INSET, INSET);
        this.container.addChild(this.content);
        IBC.events.register(Event.PARTY_LIST, () => this.draw(), this);
        this.resize();
        this.draw();
    }

    public destroy() {
        super.destroy();
        this.background.destroy();
        this.container.destroy({ children: true });
    }

    public resize() {
        this.setPosition(Math.round((window.innerWidth - PartyAskBox.WIDTH) / 2), 16 + TradeAsk.HEIGHT + 4);
    }

    public update() {
        for (const [t, e] of this.times) t.text = this.secsLeft(e);
    }

    private secsLeft(ends: number) {
        return `${Math.max(0, Math.ceil((ends - Date.now()) / 1000))}s`;
    }

    private draw() {
        const { W, ROW_H, WIDTH, INSET, SCALE } = PartyAskBox, asks = IBC.data.parties.asks;
        const h = asks.length * ROW_H, height = INSET * 2 + h * SCALE;
        this.content.removeChildren().forEach((c) => c.destroy({ children: true }));
        this.times = [];
        this.background.setSize(WIDTH, height);
        this.container.hitArea = new PIXI.Rectangle(0, 0, WIDTH, height);
        this.content.addChild(new PIXI.Graphics().beginFill(AP.INK).drawRect(-2, -2, W + 4, h + 4).endFill());
        this.bringToTop();
        asks.forEach((a, i) => {
            const y = i * ROW_H, hero = IBC.data.heroes.get(a.h)?.d.n ?? "a hero of yours";
            fit(text(`${a.o} asks ${hero} to join`, 2, y + 2, AP.STRAW, this.content), W - 24);
            this.times.push([text(this.secsLeft(a.e), W - 20, y + 2, AP.STONE, this.content), a.e]);
            const dw = textWidth("Decline") + 6, aw = textWidth("Accept") + 6;
            fit(text(`${a.n}: ${a.m.map((m) => m[1]).join(", ")}`, 2, y + 12, AP.ASH, this.content), W - 4);
            button("Decline", W - 2 - dw, y + 21, this.content, () => IBC.net.party.answer(a.i, 0));
            button("Accept", W - 2 - dw - 4 - aw, y + 21, this.content, () => IBC.net.party.answer(a.i, a.h));
        });
    }

}
