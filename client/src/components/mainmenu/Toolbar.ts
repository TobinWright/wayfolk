import * as PIXI from "pixi.js";
import { Pic } from "../../art/Backdrops";
import { picTexture } from "../../people/People";
import { outlined } from "../ringmenu/RingMenu";
import { MainMenu } from "./MainMenu";
import { MenuOwner } from "./menu/Menu";

// a menu's button: its icon in the bottom right corner
export class Toolbar {

    private component: MenuOwner;

    public container: PIXI.Container;
    public icon: PIXI.Sprite;

    constructor(component: MenuOwner, icon: Pic) {
        this.component = component;

        this.create(icon);
    }

    private create(icon: Pic) {
        this.container = new PIXI.Container();
        this.component.container.addChild(this.container);

        this.icon = new PIXI.Sprite(picTexture(outlined(icon)));
        this.icon.anchor.set(1, 1);
        this.icon.scale.set(MainMenu.SCALE);
        this.container.addChild(this.icon);

        this.container.eventMode = "static";
        this.container.cursor = "pointer";
        this.container.on("pointerenter", (e: PIXI.FederatedPointerEvent) => { this.container.y = 1; });
        this.container.on("pointerleave", (e: PIXI.FederatedPointerEvent) => { this.container.y = 0; });
        this.container.on("pointerdown", (e: PIXI.FederatedPointerEvent) => { this.container.y = 2; this.component.menu.toggleOpen(); });
        this.container.on("pointerup", (e: PIXI.FederatedPointerEvent) => { this.container.y = 1; });
    }

    public destroy() { }

}
