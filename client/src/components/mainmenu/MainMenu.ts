import { menuIcon } from "../../art/MenuIcons";
import { IBC } from "../../Engine";
import { Games } from "../games/Games";
import { Encyclopedia } from "../encyclopedia/Encyclopedia";
import { EventsWindow } from "../events/EventsWindow";
import { HeroBoard } from "../heroboard/HeroBoard";
import { Market } from "../market/Market";
import { Parties } from "../parties/Parties";
import * as PIXI from "pixi.js";
import { Constants } from "../../constants/Constants";
import { AP } from "../../constants/Palette";
import { BaseComponent, ComponentType } from "../BaseComponent";
import { Toolbar } from "./Toolbar";
import { Menu } from "./menu/Menu";

// the game's menu, in the corner; the rest (Updates, Mail, the social windows,
// Settings) is the other menu's to the left of it (components/moremenu: the user, 2026-11-02)
export class MainMenu extends BaseComponent {

	// the ones played with most nearest the button
	public static LABELS = ["Heroes", "Parties", "Inventory", "Hiring", "Market", "Events", "Games", "Encyclopedia"];

	public static SCALE = 2;			// screen px an icon pixel
	public static SIZE = 18 * MainMenu.SCALE;	// an icon on screen, outline and all

	public toolbar: Toolbar;
	public menu: Menu;

	protected zBand = BaseComponent.CORNER;

	constructor() {
		super(ComponentType.MAIN_MENU);

		this.create();
		this.resize();
	}

	public create() {
		super.create();

		this.toolbar = new Toolbar(this, menuIcon());
		this.menu = new Menu(this, MainMenu.LABELS);
	}

	public destroy() {
		super.destroy();

		this.menu.destroy();
		this.menu = null;

		this.toolbar.destroy();
		this.toolbar = null;
	}

	public resize() {
		this.container.x = window.innerWidth - 20;
		this.container.y = window.innerHeight - 20;
	}

	public selectOption(option: string) {
		this.menu.toggleOpen();

		switch (option) {
			case "Heroes": IBC.comp.getOrCreate(ComponentType.ADVENTURERS).bringToTop(); break;
			case "Inventory": IBC.comp.getOrCreate(ComponentType.INVENTORY).bringToTop(); break;
			case "Parties": Parties.open(); break;
			case "Hiring": HeroBoard.open(); break;
			case "Market": Market.open(); break;
			case "Events": EventsWindow.open(); break;
			case "Games": Games.open(); break;
			case "Encyclopedia": Encyclopedia.open(); break;
		}
	}

}

// a count (9+ past nine), or a word, in white on red, outlined: on a menu's button or option
export function badge(n: number | string) {
	const c = new PIXI.Container();
	const t = new PIXI.BitmapText(typeof n == "number" && n > 9 ? "9+" : String(n), { fontName: Constants.PIXEL_FONT, fontSize: 32, tint: AP.WHITE });
	const w = Math.ceil(t.textWidth) + 6, h = 12;
	c.addChild(new PIXI.Graphics()
		.beginFill(AP.BLACK).drawRect(-2, -2, w + 4, h + 4).endFill()
		.beginFill(AP.RED).drawRect(0, 0, w, h).endFill());
	t.position.set(3, 2);
	c.addChild(t);
	c.eventMode = "none";
	return c;
}
