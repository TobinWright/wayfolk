import * as PIXI from "pixi.js";
import { IBC } from "../Engine";

export enum ComponentType {
    MAP, TITLE, GOLD_DISPLAY, CHAT,
    CHOICE_PROMPT,
    ADVENTURERS, INVENTORY,
    NODE_EDITOR,
    MAIN_MENU, ADMIN_MENU,
    HERO_WINDOW,
    RING_MENU, HERO_BOARD,
    HERO_ROSTER, TASK_PLANNER, HERO_STATUS,
    FRIENDS,
    LOCATION_INFO,
    ITEM_INFO,
    TASK_AMOUNT,
    GAMES, GAME_ROOMS, BLACKJACK,
    LEADERBOARDS,
    PREMIUM,
    EVENT_INFO,
    HERO_COSMETICS,
    COSMETIC_EDITOR,
    SETTINGS,
    MARKET,
    AWAY_SUMMARY,
    GUIDE,
    GUILD_WINDOW,
    ENCYCLOPEDIA,
    HERO_JOURNAL,
    ANALYTICS,
    TRADE_ASK, TRADE, MAIL,
    ADMIN_PANEL,
    HERO_CHOICE,
    EVENTS,
    SIGHT_INFO,
    MAP_EDITOR,
    BLACKJACK_BUTTON,
    ITEM_TOASTS,
    FEEDBACK,
    MORE_MENU, UPDATES,
    PROFILE,
    SLIME_RACE,
    SLIME_RACE_BUTTON,
    PARTIES,
    PARTY_ASK,
    DEMO_MODE,
    SCREEN_FX, LOOT_CHEST,
    DELIGHT, BOUNTY_BOX, ACHIEVEMENTS,
}

export class BaseComponent {

    public type: ComponentType;
    public id: number;

    public container: PIXI.Container;

    // the corner's buttons (the menus', the games') draw over every window, under
    // the toasts (1e8) and notices (1e9): the user, 2026-11-03, "the bottom right
    // icons should show above any menu"
    public static CORNER = 1e7;
    protected zBand = 0;

    constructor(type: ComponentType) {
        this.type = type;
        this.id = IBC.comp.ids.getNext();
    }

    public create() {
        this.container = new PIXI.Container();
        this.container.zIndex = this.zBand + IBC.comp.zIndices.getNext();
        IBC.pixi.stage.addChild(this.container);
    }

    public destroy() {
        IBC.events.unregisterAll(this);
        IBC.pixi.stage.removeChild(this.container);
    }

    public update(deltaTime: number) { }

    public resize() { }

    public setPosition(x: number, y: number) {
        this.container.x = x;
        this.container.y = y;
    }

    public bringToTop() {
        this.container.zIndex = this.zBand + IBC.comp.zIndices.getNext();
    }

}