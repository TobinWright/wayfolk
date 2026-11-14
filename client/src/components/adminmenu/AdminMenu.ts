import { adminIcon } from "../../art/MenuIcons";
import { IBC } from "../../Engine";
import { BaseComponent, ComponentType } from "../BaseComponent";
import { MainMenu } from "../mainmenu/MainMenu";
import { Toolbar } from "../mainmenu/Toolbar";
import { Menu } from "../mainmenu/menu/Menu";

// the admin menu: a button left of the other menu's (the third from the corner), made like the main menu
export class AdminMenu extends BaseComponent {

	public static LABELS = ["Admin", "Locations", "Map", "Nodes", "Cosmetics", "Analytics", "Demo"];

	public toolbar: Toolbar;
	public menu: Menu;

	protected zBand = BaseComponent.CORNER;

	constructor() {
		super(ComponentType.ADMIN_MENU);

		this.create();
		this.resize();
	}

	public create() {
		super.create();

		this.toolbar = new Toolbar(this, adminIcon());
		this.menu = new Menu(this, AdminMenu.LABELS);
	}

	public destroy() {
		super.destroy();

		this.menu.destroy();
		this.menu = null;

		this.toolbar.destroy();
		this.toolbar = null;
	}

	public resize() {
		this.container.x = window.innerWidth - 20 - 2 * (MainMenu.SIZE + 8);
		this.container.y = window.innerHeight - 20;
	}

	public selectOption(option: string) {
		this.menu.toggleOpen();

		switch (option) {
			case "Map": (IBC.comp.getOrCreate(ComponentType.MAP_EDITOR) as BaseComponent).bringToTop(); break;
			case "Nodes": (IBC.comp.getOrCreate(ComponentType.NODE_EDITOR) as BaseComponent).bringToTop(); break;
			case "Cosmetics": (IBC.comp.getOrCreate(ComponentType.COSMETIC_EDITOR) as BaseComponent).bringToTop(); break;
			case "Analytics": (IBC.comp.getOrCreate(ComponentType.ANALYTICS) as BaseComponent).bringToTop(); break;
			case "Admin": (IBC.comp.getOrCreate(ComponentType.ADMIN_PANEL) as BaseComponent).bringToTop(); break;
			case "Demo": IBC.comp.getOrCreate(ComponentType.DEMO_MODE); break;
		}
	}

}
