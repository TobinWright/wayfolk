import * as PIXI from "pixi.js";
import { moreIcon } from "../../art/MenuIcons";
import { Constants } from "../../constants/Constants";
import { Event } from "../../constants/Events";
import { IBC } from "../../Engine";
import { BaseComponent, ComponentType } from "../BaseComponent";
import { Feedback } from "../feedback/Feedback";
import { Friends } from "../friends/Friends";
import { Guild } from "../guild/Guild";
import { Leaderboards } from "../leaderboards/Leaderboards";
import { Mail } from "../mail/Mail";
import { badge, MainMenu } from "../mainmenu/MainMenu";
import { Toolbar } from "../mainmenu/Toolbar";
import { Menu } from "../mainmenu/menu/Menu";
import { Premium } from "../premium/Premium";
import { Profile } from "../profile/Profile";
import { Settings } from "../settings/Settings";
import { Updates } from "../updates/Updates";
import { Achievements } from "../achievements/Achievements";
import { UPDATE_NOTES } from "../updates/UpdateNotes";

// The other menu (the user, 2026-11-02: the main menu "is getting too big
// and should be split between 2 menus, one for the game and the other for
// other stuff, news, settings, etc"): a letter in front of a news sheet (the user, 2026-11-02) to the left of the main
// menu's button, made like it - Updates, the social windows (your Profile among them), Settings. The
// main menu keeps the game's. Letters not opened are counted on Mail and on
// the button; patch notes not read say New on Updates (and on the button,
// with no letters to count).
export class MoreMenu extends BaseComponent {

	// "Premium" is hidden for now; put it back at the end to show it again
	// (Settings, Feedback and Discord at the bottom, as they were in the main menu)
	public static LABELS = ["Settings", "Feedback", "Discord", "Leaderboards", "Achievements", "Guild", "Friends", "Profile", "Mail", "Updates"];

	public toolbar: Toolbar;
	public menu: Menu;

	protected zBand = BaseComponent.CORNER;

	constructor() {
		super(ComponentType.MORE_MENU);

		this.create();
		this.resize();
	}

	public create() {
		super.create();

		this.toolbar = new Toolbar(this, moreIcon());
		this.menu = new Menu(this, MoreMenu.LABELS);
		IBC.events.register(Event.MAIL_UNREAD, () => this.showBadges(), this);
		this.showBadges();
	}

	// letters not opened, and patch notes not read: on the options and the button
	private badges: PIXI.Container[] = [];
	public showBadges() {
		for (const b of this.badges.splice(0)) b.destroy({ children: true });
		const n = IBC.net.mail?.unread ?? 0, fresh = Updates.isNew(UPDATE_NOTES[0].version);
		const put = (b: PIXI.Container, on: PIXI.Container, x: number, y: number) => {
			b.position.set(x, y);
			on.addChild(b);
			this.badges.push(b);
		};
		if (n || fresh) put(badge(n || "New"), this.toolbar.container, -MainMenu.SIZE, -MainMenu.SIZE);
		const option = (label: string) => this.menu.buttons.find((b) => b.label == label)?.container;
		if (n && option("Mail")) put(badge(n), option("Mail"), -MainMenu.SIZE, -MainMenu.SIZE / 2);
		if (fresh && option("Updates")) put(badge("New"), option("Updates"), -MainMenu.SIZE, -MainMenu.SIZE / 2);
	}

	public destroy() {
		super.destroy();

		this.menu.destroy();
		this.menu = null;

		this.toolbar.destroy();
		this.toolbar = null;
	}

	// the second slot from the corner (the admin menu the third, the games' buttons the fourth and fifth)
	public resize() {
		this.container.x = window.innerWidth - 20 - (MainMenu.SIZE + 8);
		this.container.y = window.innerHeight - 20;
	}

	public selectOption(option: string) {
		this.menu.toggleOpen();

		switch (option) {
			case "Updates": Updates.open(); break;
			case "Mail": Mail.open(); break;
			case "Friends": Friends.open(); break;
			case "Profile": Profile.mine(); break;
			case "Guild": Guild.open(); break;
			case "Leaderboards": Leaderboards.open(); break;
			case "Achievements": Achievements.open(); break;
			case "Premium": Premium.open(); break;
			case "Discord": window.open(Constants.DISCORD_INVITE, "_blank", "noopener"); break;
			case "Feedback": Feedback.open(); break;
			case "Settings": Settings.open(); break;
		}
	}

}
