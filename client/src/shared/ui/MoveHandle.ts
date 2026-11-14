import { Engine } from "../../Engine";
import * as PIXI from "pixi.js";
import { Constants } from "../../constants/Constants";

export class MoveHandle {

    private engine: Engine;
    private parent: PIXI.Container;

    public sprite: PIXI.Sprite;

    constructor(engine: Engine, parent: PIXI.Container) {
        this.engine = engine;
        this.parent = parent;

        this.create();
    }

    public create() {
        this.sprite = new PIXI.Sprite(PIXI.Assets.get("icon-move"));
        this.parent.addChild(this.sprite);
    }

    public destroy() {
        this.sprite.destroy();
        this.sprite = null;
    }

    public setPosition(x: number, y: number) {
        this.sprite.position.set(x, y);
    }

}