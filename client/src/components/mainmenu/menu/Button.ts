import * as PIXI from "pixi.js";
import { optionIcon } from "../../../art/MenuIcons";
import { AP } from "../../../constants/Palette";
import { Constants } from "../../../constants/Constants";
import { picTexture } from "../../../people/People";
import { outlined } from "../../ringmenu/RingMenu";
import { MainMenu } from "../MainMenu";
import { Menu, MenuOwner } from "./Menu";

// an option: its icon, its name in a box to the left of it (right aligned)
export class Button {

    public static GAP = 6;          // between the name's box and the icon

    private component: MenuOwner;
    private menu: Menu;

    public label: string;
    public container: PIXI.Container;
    public icon: PIXI.Sprite;
    public box: PIXI.Graphics;
    public text: PIXI.BitmapText;
    public yPos: number;

    constructor(component: MenuOwner, menu: Menu, label: string) {
        this.component = component;
        this.menu = menu;
        this.label = label;

        this.create();
    }

    private create() {
        this.container = new PIXI.Container();
        this.menu.container.addChild(this.container);

        this.icon = new PIXI.Sprite(picTexture(outlined(optionIcon(this.label))));
        this.icon.anchor.set(1, 0.5);
        this.icon.scale.set(MainMenu.SCALE);

        this.text = new PIXI.BitmapText(this.label, {
            fontName: Constants.PIXEL_FONT,
            fontSize: 64,
            tint: AP.WHITE
        });
        this.text.anchor.set(1, 0);
        const right = -MainMenu.SIZE - Button.GAP;
        this.text.position.set(right - 6, -7);

        const w = Math.ceil(this.text.textWidth) + 12;
        this.box = new PIXI.Graphics();
        this.box.beginFill(AP.BLACK).drawRect(right - w, -11, w, 22).endFill();
        this.box.beginFill(AP.INK).drawRect(right - w + 2, -9, w - 4, 18).endFill();

        this.container.addChild(this.box, this.text, this.icon);

        this.container.eventMode = "static";
        this.container.cursor = "pointer";
        this.container.hitArea = new PIXI.Rectangle(right - w, -MainMenu.SIZE / 2, w - right, MainMenu.SIZE);
        this.container.on("pointerenter", (e: PIXI.FederatedPointerEvent) => { this.container.y = this.yPos + 1; });
        this.container.on("pointerleave", (e: PIXI.FederatedPointerEvent) => { this.container.y = this.yPos; });
        this.container.on("pointerdown", (e: PIXI.FederatedPointerEvent) => { this.container.y = this.yPos + 2; });
        this.container.on("pointerup", (e: PIXI.FederatedPointerEvent) => { this.container.y = this.yPos + 1; this.component.selectOption(this.label); });
    }

    public destroy() {
        this.container.destroy({ children: true });
    }

    public position(x: number, y: number) {
        this.container.position.set(x, y);
        this.yPos = y;
    }

}
