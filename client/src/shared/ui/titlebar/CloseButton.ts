import * as PIXI from "pixi.js";
import { IBC } from "../../../Engine";
import { TitleBar } from "./TitleBar";

export class CloseButton {

    private titleBar: TitleBar;

    public sprite: PIXI.Sprite;

    constructor(titleBar: TitleBar) {
        this.titleBar = titleBar;

        this.create();
    }

    public create() {
        this.sprite = new PIXI.Sprite(PIXI.Assets.get("icon-cross"));
        this.sprite.eventMode = "static";
        this.sprite.cursor = "pointer";
        this.sprite.on("pointerdown", (e: PIXI.FederatedPointerEvent) => {
            e.stopPropagation();
            IBC.comp.destroy(this.titleBar.component)
        });
        this.titleBar.container.addChild(this.sprite);
    }

    public destroy() {
        this.sprite.removeAllListeners();
        this.sprite.destroy();
        this.sprite = null;
    }

    public setPosition(x: number, y: number) {
        this.sprite.position.set(x, y);
    }

}