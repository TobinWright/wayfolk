import * as PIXI from "pixi.js";
import { IBC } from "../../../Engine";
import { BaseComponent, ComponentType } from "../../BaseComponent";
import { MainMenu } from "../MainMenu";
import { Button } from "./Button";

// what owns a menu: the main menu or the admin menu
export interface MenuOwner extends BaseComponent {
    toolbar: { container: PIXI.Container };
    menu: Menu;
    selectOption(option: string): void;
}

export class Menu {

    public static SPACING = 4;          // between icons

    private component: MenuOwner;
    private labels: string[];

    public isOpen: boolean = false;
    public container: PIXI.Container;
    public buttons: Button[] = [];

    constructor(component: MenuOwner, labels: string[]) {
        this.component = component;
        this.labels = labels;

        this.create();
    }

    // a stack of the options' icons over the menu button, the first at the bottom
    private create() {
        this.container = new PIXI.Container();
        this.container.y = -MainMenu.SIZE - Menu.SPACING;

        for (let i = 0; i < this.labels.length; i++) {
            const newButton = new Button(this.component, this, this.labels[i]);
            newButton.position(0, -(i * (MainMenu.SIZE + Menu.SPACING)) - MainMenu.SIZE / 2);
            this.buttons.push(newButton);
        }
    }

    public destroy() {
        if (this.isOpen) this.toggleOpen();
    }

    // opening one menu closes the others
    public toggleOpen() {
        if (this.isOpen) {
            this.component.container.removeChild(this.container);
            window.removeEventListener("pointerdown", this.onPointerDown, true);
        } else {
            for (const type of [ComponentType.MAIN_MENU, ComponentType.MORE_MENU, ComponentType.ADMIN_MENU]) {
                const other = IBC.comp.getFirstByType(type) as MenuOwner;
                if (other && other !== this.component && other.menu.isOpen) other.menu.toggleOpen();
            }
            // over every window opened since, or its options draw under them
            this.component.bringToTop();
            this.component.container.addChild(this.container);
            window.addEventListener("pointerdown", this.onPointerDown, true);
        }
        this.isOpen = !this.isOpen;
    }

    // a press anywhere but on the menu or its button closes it
    private onPointerDown = (e: PointerEvent) => {
        const over = (c: PIXI.Container) => c.getBounds().contains(e.clientX, e.clientY);
        if (!over(this.container) && !over(this.component.toolbar.container)) this.toggleOpen();
    };

}
