import * as PIXI from "pixi.js";
import { BaseComponent } from "../../../components/BaseComponent";
import { Event } from "../../../constants/Events";
import { AP } from "../../../constants/Palette";
import { displayFont } from "../../../art/DisplayFont";
import { IBC } from "../../../Engine";
import { CloseButton } from "./CloseButton";

export class TitleBar {

    public static FILL = AP.GRAPE;
    public static LIGHT = AP.VIOLET;
    public static DARK = AP.MIDNIGHT;
    public static TEXT = AP.CREAM;

    public component: BaseComponent;
    private edges: PIXI.Graphics;
    private shadow: PIXI.BitmapText;

    public container: PIXI.Container;
    public background: PIXI.Sprite;
    public title: PIXI.BitmapText;
    public closeButton: CloseButton;

    private pointerDown: boolean = false;
    private pointerX: number;
    private pointerY: number;
    private offsetX: number;
    private offsetY: number;

    constructor(component: BaseComponent) {
        this.component = component;

        this.create();
    }

    public create() {
        this.container = new PIXI.Container();
        this.component.container.addChild(this.container);

        this.background = new PIXI.Sprite(PIXI.Texture.WHITE);
        this.background.tint = TitleBar.FILL;
        this.container.addChild(this.background);
        // its edges: a light line along the top, a dark one under it (the user, 2026-11-01: windows that look made)
        this.edges = new PIXI.Graphics();
        this.edges.eventMode = "none";
        this.container.addChild(this.edges);

        // (in the display font, its shadow a font px under it and to the right)
        this.shadow = new PIXI.BitmapText("", { fontName: displayFont(), fontSize: 64, tint: TitleBar.DARK });
        this.shadow.anchor.set(0.5, 0);
        this.shadow.eventMode = "none";
        this.container.addChild(this.shadow);
        this.title = new PIXI.BitmapText("", {
            fontName: displayFont(),
            fontSize: 64,
            tint: TitleBar.TEXT
        });
        this.title.anchor.set(0.5, 0);
        this.title.position.set(5, 3);
        this.title.eventMode = "none";      // (so the bar drags from anywhere on it, the words too)
        this.container.addChild(this.title);

        this.closeButton = new CloseButton(this);

        this.background.eventMode = "static";
        this.background.cursor = "pointer";
        this.background.on("pointerdown", (e: PIXI.FederatedPointerEvent) => {
            this.pointerDown = true;

            this.pointerX = e.x;
            this.pointerY = e.y;
            this.offsetX = this.component.container.x;
            this.offsetY = this.component.container.y;
        });
        // (a press anywhere on the window brings it to the top, caught on the way down so a button stopping it still does)
        this.component.container.on("pointerdowncapture", () => this.component.bringToTop());
        this.background.on("pointerup", (e: PIXI.FederatedPointerEvent) => {
            this.pointerDown = false;
        });
        IBC.events.register(Event.GLOBAL_POINTER_MOVE, (e: PointerEvent) => {
            if (!this.pointerDown) return;

            const deltaX = this.pointerX - e.x;
            const deltaY = this.pointerY - e.y;
            this.component.container.x = this.offsetX - deltaX;
            this.component.container.y = this.offsetY - deltaY;
        }, this);
    }

    public destroy() {
        IBC.events.unregisterAll(this);

        this.closeButton.destroy();
        this.closeButton = null;

        this.title.destroy();
        this.title = null;

        this.edges.destroy();
        this.shadow.destroy();
        this.background.removeAllListeners();
        this.background.destroy();
        this.background = null;

        this.container.destroy();
        this.container = null;
    }

    public setPosition(x: number, y: number) {
        this.container.position.set(x, y);
    }

    public setSize(width: number, height: number) {
        this.background.width = width;
        this.background.height = height;
        this.edges.clear()
            .beginFill(TitleBar.LIGHT).drawRect(0, 0, width, 2).endFill()
            .beginFill(TitleBar.DARK).drawRect(0, height - 2, width, 2).endFill();
        this.title.x = width / 2;
        this.shadow.position.set(this.title.x + 2, this.title.y + 2);
        this.closeButton.setPosition(width - 21, 2);
    }

    public setTitle(text: string) {
        this.title.text = text;
        this.shadow.text = text;
    }

}