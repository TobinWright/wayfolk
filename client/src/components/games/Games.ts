import * as PIXI from "pixi.js";
import { GAMES, Game } from "../../../../shared/Games";
import { Pic } from "../../art/Backdrops";
import { blackjackIcon, slimeRaceIcon } from "../../art/MenuIcons";
import { AP } from "../../constants/Palette";
import { IBC } from "../../Engine";
import { picTexture } from "../../people/People";
import { Panel } from "../../shared/Panel";
import { TitleBar } from "../../shared/ui/titlebar/TitleBar";
import { BaseComponent, ComponentType } from "../BaseComponent";
import { Chat } from "../chat/Chat";
import { outlined } from "../ringmenu/RingMenu";
import { GameRooms } from "./GameRooms";
import { text, textWidth } from "./GameUI";

// The games (shared/Games.ts), from the main menu: a tile for each, its icon
// over its name, COLS to a row; clicking one opens its rooms (GameRooms).
// A window like the others (Panel and TitleBar); Escape or its cross closes it.

export class Games extends BaseComponent {

    public static SCALE = 2;
    public static COLS = 3;
    public static TILE_W = 52;          // a tile, in its own px
    public static TILE_H = 50;
    public static GAP = 12;
    public static W = Games.COLS * Games.TILE_W + (Games.COLS - 1) * Games.GAP;
    public static H = Math.ceil(GAMES.length / Games.COLS) * (Games.TILE_H + Games.GAP) - Games.GAP;
    public static INSET_X = 28;         // the window round it, in screen px
    public static INSET_Y = 44;
    public static WIDTH = Games.INSET_X * 2 + Games.W * Games.SCALE;
    public static HEIGHT = Games.INSET_Y + Games.H * Games.SCALE + Games.INSET_X;

    public background: Panel;
    public titleBar: TitleBar;
    private content: PIXI.Container;
    private icons: PIXI.Texture[] = [];

    private keys = (e: KeyboardEvent) => { if (e.key == "Escape" && !Chat.takes(e)) IBC.comp.destroy(this); };

    constructor() {
        super(ComponentType.GAMES);
        this.create();
    }

    // the window (one open at a time)
    public static open() {
        IBC.comp.getOrCreate(ComponentType.GAMES).bringToTop();
    }

    public create() {
        super.create();
        const { WIDTH, HEIGHT, SCALE } = Games;
        this.container.eventMode = "static";
        this.container.hitArea = new PIXI.Rectangle(0, 0, WIDTH, HEIGHT);
        this.container.on("pointerdown", (e: PIXI.FederatedPointerEvent) => e.stopPropagation());

        this.background = new Panel(this.container);
        this.background.setSize(WIDTH, HEIGHT);
        this.titleBar = new TitleBar(this);
        this.titleBar.setPosition(4, 4);
        this.titleBar.setSize(WIDTH - 8, 20);
        this.titleBar.setTitle("Games");

        this.content = new PIXI.Container();
        this.content.scale.set(SCALE);
        this.content.position.set(Games.INSET_X, Games.INSET_Y);
        this.container.addChild(this.content);
        GAMES.forEach((name, i) => this.tile(i, name));

        window.addEventListener("keydown", this.keys);
        this.setPosition(Math.round((window.innerWidth - WIDTH) / 2), Math.round((window.innerHeight - HEIGHT) / 2));
    }

    public destroy() {
        super.destroy();
        window.removeEventListener("keydown", this.keys);
        this.titleBar.destroy();
        this.background.destroy();
        this.container.destroy({ children: true });
        this.icons.forEach((t) => t.destroy(true));
    }

    // a game's tile: its icon in a box, its name under it, lit under the pointer
    private tile(game: number, name: string) {
        const { COLS, TILE_W, TILE_H, GAP } = Games, BOX = 40;
        const tile = new PIXI.Container();
        tile.position.set((game % COLS) * (TILE_W + GAP), Math.floor(game / COLS) * (TILE_H + GAP));
        const box = new PIXI.Graphics();
        const paint = (lit: boolean) => box.clear()
            .beginFill(AP.BLACK).drawRect((TILE_W - BOX) / 2, 0, BOX, BOX).endFill()
            .beginFill(lit ? AP.SLATE : AP.INK).drawRect((TILE_W - BOX) / 2 + 1, 1, BOX - 2, BOX - 2).endFill();
        paint(false);
        tile.addChild(box);

        const texture = picTexture(outlined(gameIcon(game)));
        this.icons.push(texture);
        const icon = new PIXI.Sprite(texture);
        icon.position.set(Math.round((TILE_W - texture.width * 2) / 2), Math.round((BOX - texture.height * 2) / 2));
        icon.scale.set(2);
        tile.addChild(icon);
        text(name, Math.round((TILE_W - textWidth(name)) / 2), BOX + 3, AP.WHITE, tile);

        tile.eventMode = "static";
        tile.cursor = "pointer";
        tile.hitArea = new PIXI.Rectangle(0, 0, TILE_W, TILE_H);
        tile.on("pointerover", () => paint(true));
        tile.on("pointerout", () => paint(false));
        tile.on("pointertap", () => GameRooms.open(game));
        this.content.addChild(tile);
    }

}

function gameIcon(game: number): Pic {
    switch (game) {
        case Game.BLACKJACK: return blackjackIcon();
        case Game.SLIME_RACE: return slimeRaceIcon();
    }
}
