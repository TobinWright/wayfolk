import * as PIXI from "pixi.js";
import { Game, GAMES } from "../../../../shared/Games";
import { blackjackIcon, slimeRaceIcon } from "../../art/MenuIcons";
import { Constants } from "../../constants/Constants";
import { Event } from "../../constants/Events";
import { AP } from "../../constants/Palette";
import { IBC } from "../../Engine";
import { picTexture } from "../../people/People";
import { BaseComponent, ComponentType } from "../BaseComponent";
import { MainMenu } from "../mainmenu/MainMenu";
import { outlined } from "../ringmenu/RingMenu";
import { GameRooms } from "./GameRooms";

// A game's button, bottom right, made like the menus' buttons: Blackjack's to
// the left of the admin menu's (where it would be, for those without it),
// Slime Race's to the left of that (the user, 2026-11-03: "add a quick icon
// next to the blackjack icon"). In its bottom right corner how many are
// playing (IBC.net.game: sitting at blackjack's tables, at slime racing's
// tracks); the game's name over it while hovered; a click opens its rooms
// (GameRooms).
export class GameButton extends BaseComponent {

    private button: PIXI.Container;
    private count: PIXI.Container;
    private tip: PIXI.Container;

    // `slot` places from the corner (MoreMenu: the more menu the first, the admin menu the second)
    protected zBand = BaseComponent.CORNER;

    constructor(type: ComponentType, private game: Game, private slot: number) {
        super(type);

        this.create();
        this.resize();
    }

    public create() {
        super.create();

        this.button = new PIXI.Container();
        this.container.addChild(this.button);
        const icon = new PIXI.Sprite(picTexture(outlined(this.game == Game.SLIME_RACE ? slimeRaceIcon() : blackjackIcon())));
        icon.anchor.set(1, 1);
        icon.scale.set(MainMenu.SCALE);
        this.button.addChild(icon);

        this.tip = label(GAMES[this.game]);
        this.tip.position.set(Math.round(-(MainMenu.SIZE + this.tip.width) / 2), -MainMenu.SIZE - this.tip.height - 4);
        this.tip.visible = false;
        this.container.addChild(this.tip);

        this.button.eventMode = "static";
        this.button.cursor = "pointer";
        this.button.on("pointerenter", () => { this.button.y = 1; this.tip.visible = true; });
        this.button.on("pointerleave", () => { this.button.y = 0; this.tip.visible = false; });
        this.button.on("pointerdown", () => { this.button.y = 2; GameRooms.open(this.game); });
        this.button.on("pointerup", () => { this.button.y = 1; });

        IBC.events.register(Event.GAME_PLAYING, () => this.showCount(), this);
        this.showCount();
    }

    // the count, its bottom right on the icon's
    private showCount() {
        const game = IBC.net.game;
        this.count?.destroy({ children: true });
        this.count = label(String((this.game == Game.SLIME_RACE ? game?.racing : game?.playing) ?? 0), 32);
        this.count.position.set(2 - this.count.width, 2 - this.count.height);
        this.button.addChild(this.count);
    }

    public destroy() {
        super.destroy();
        this.container.destroy({ children: true });
    }

    public resize() {
        this.container.x = window.innerWidth - 20 - this.slot * (MainMenu.SIZE + 8);
        this.container.y = window.innerHeight - 20;
    }

}

// white text in a box outlined in black, as the menus' names are (the count's smaller)
function label(s: string, size = 64) {
    const c = new PIXI.Container();
    const t = new PIXI.BitmapText(s, { fontName: Constants.PIXEL_FONT, fontSize: size, tint: AP.WHITE });
    const pad = size / 32, h = size / 32 * 7 + pad * 2;
    const w = Math.ceil(t.textWidth) + pad * 4;
    c.addChild(new PIXI.Graphics()
        .beginFill(AP.BLACK).drawRect(0, 0, w + 4, h + 4).endFill()
        .beginFill(AP.INK).drawRect(2, 2, w, h).endFill());
    t.position.set(2 + pad * 2, 2 + pad);
    c.addChild(t);
    c.eventMode = "none";
    return c;
}
