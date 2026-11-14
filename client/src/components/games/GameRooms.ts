import * as PIXI from "pixi.js";
import { Game, GAMES, RoomInfo } from "../../../../shared/Games";
import { Pic } from "../../art/Backdrops";
import { anteIcon, chairIcon, doorIcon, eyeIcon, SMALL_ICON } from "../../art/MenuIcons";
import { picTexture } from "../../people/People";
import { Event } from "../../constants/Events";
import { AP } from "../../constants/Palette";
import { IBC } from "../../Engine";
import { Panel } from "../../shared/Panel";
import { TitleBar } from "../../shared/ui/titlebar/TitleBar";
import { BaseComponent, ComponentType } from "../BaseComponent";
import { Chat } from "../chat/Chat";
import { Blackjack } from "./blackjack/Blackjack";
import { SlimeRace } from "./race/SlimeRace";
import { text, textWidth, Tip } from "./GameUI";

// A game's rooms (from the games window), by ante: a row a room - its name,
// its ante (a slime race's stake), how many sit of its seats (2/5; a slime
// race's tracks have none: how many have bet on its race) and how many watch, the columns
// headed by icons (a door, a chip, a chair, an eye), each saying what it is
// hovered -, lit under
// the pointer (the wheel scrolls); clicking one opens it to watch
// (Blackjack, SlimeRace). Asked for again every REFRESH_MS while it's open. A window
// like the others; Escape or its cross closes it.

export class GameRooms extends BaseComponent {

    public static SCALE = 2;
    public static W = 240;              // the content, in its own px
    public static ROW = 14;
    public static ROWS = 10;            // rooms shown (the window's height)
    public static H = GameRooms.ROW * (GameRooms.ROWS + 1);
    public static INSET_X = 12;         // the window round it, in screen px
    public static INSET_Y = 28;
    public static WIDTH = GameRooms.INSET_X * 2 + GameRooms.W * GameRooms.SCALE;
    public static HEIGHT = GameRooms.INSET_Y + GameRooms.H * GameRooms.SCALE + GameRooms.INSET_X;
    public static REFRESH_MS = 5000;
    public static ANTE_X = 146;         // where the ante, seats and watchers columns end
    public static SEATS_X = 186;
    public static WATCH_X = 236;

    private static heads = new Map<Pic, PIXI.Texture>();    // (the columns' icons, made once)

    public background: Panel;
    public titleBar: TitleBar;
    private content: PIXI.Container;
    private game = 0;
    private heads = [["Room"], ["Ante"], ["Seats"]];   // (the first three columns' tips, a slime race's said otherwise)
    private rooms: RoomInfo[] = [];
    private refresh = 0;
    private scroll = 0;                 // rows scrolled down

    private keys = (e: KeyboardEvent) => { if (e.key == "Escape" && !Chat.takes(e)) IBC.comp.destroy(this); };

    constructor() {
        super(ComponentType.GAME_ROOMS);
        this.create();
    }

    // the window (one open at a time) on `game`'s rooms, asked for
    public static open(game: number) {
        const view = IBC.comp.getOrCreate(ComponentType.GAME_ROOMS) as GameRooms;
        view.bringToTop();
        view.show(game);
    }

    public create() {
        super.create();
        const { WIDTH, HEIGHT, SCALE } = GameRooms;
        this.container.eventMode = "static";
        this.container.hitArea = new PIXI.Rectangle(0, 0, WIDTH, HEIGHT);
        this.container.on("pointerdown", (e: PIXI.FederatedPointerEvent) => e.stopPropagation());
        this.container.on("wheel", (e: PIXI.FederatedWheelEvent) => {
            e.stopPropagation();
            this.scroll += e.deltaY < 0 ? -1 : 1;
            this.draw();
        });

        this.background = new Panel(this.container);
        this.background.setSize(WIDTH, HEIGHT);
        this.titleBar = new TitleBar(this);
        this.titleBar.setPosition(4, 4);
        this.titleBar.setSize(WIDTH - 8, 20);

        this.content = new PIXI.Container();
        this.content.scale.set(SCALE);
        this.content.position.set(GameRooms.INSET_X, GameRooms.INSET_Y);
        this.container.addChild(this.content);

        // the heads' tips, over the rows (kept: the rows are drawn again)
        const hover = new PIXI.Container();
        hover.scale.set(SCALE);
        hover.position.copyFrom(this.content.position);
        this.container.addChild(hover);
        const tip = new Tip(hover, GameRooms.W), { ANTE_X, SEATS_X, WATCH_X, ROW } = GameRooms;
        tip.zone(2, 0, SMALL_ICON + 4, ROW, this.heads[0], hover);
        tip.zone(ANTE_X - SMALL_ICON - 2, 0, SMALL_ICON + 4, ROW, this.heads[1], hover);
        tip.zone(SEATS_X - SMALL_ICON - 2, 0, SMALL_ICON + 4, ROW, this.heads[2], hover);
        tip.zone(WATCH_X - SMALL_ICON - 2, 0, SMALL_ICON + 4, ROW, ["Spectators"], hover);
        tip.raise();

        IBC.events.register(Event.GAME_ROOMS, (got: { game: number, rooms: RoomInfo[] }) => {
            if (got.game != this.game) return;
            this.rooms = got.rooms;
            this.draw();
        }, this);
        window.addEventListener("keydown", this.keys);
        this.setPosition(Math.round((window.innerWidth - WIDTH) / 2) + 40, Math.round((window.innerHeight - HEIGHT) / 2) + 40);
    }

    public destroy() {
        super.destroy();
        window.removeEventListener("keydown", this.keys);
        this.titleBar.destroy();
        this.background.destroy();
        this.container.destroy({ children: true });
    }

    public update(deltaTime: number) {
        if ((this.refresh += deltaTime) < GameRooms.REFRESH_MS) return;
        this.refresh = 0;
        IBC.net.game.rooms(this.game);
    }

    private show(game: number) {
        if (game != this.game) { this.rooms = []; this.scroll = 0; }
        this.game = game;
        this.refresh = 0;
        this.titleBar.setTitle(GAMES[game]);
        const race = game == Game.SLIME_RACE;
        [race ? "Track" : "Room", race ? "Stake" : "Ante", race ? "Bets on this race" : "Seats"].forEach((s, i) => this.heads[i][0] = s);
        this.draw();
        IBC.net.game.rooms(game);
    }

    private draw() {
        const { W, ROW, ROWS, ANTE_X, SEATS_X, WATCH_X } = GameRooms;
        this.content.removeChildren().forEach((c) => c.destroy({ children: true }));
        const right = (s: string, x: number, y: number, tint: number, parent: PIXI.Container) => text(s, x - textWidth(s), y, tint, parent);
        // the columns' heads, icons: a door (the room), a chip (its ante), a chair (seats), an eye (watching)
        const head = (pic: Pic, x: number) => {
            const icon = new PIXI.Sprite(GameRooms.heads.get(pic) ?? GameRooms.heads.set(pic, picTexture(pic)).get(pic));
            icon.position.set(x, 3);
            this.content.addChild(icon);
        };
        head(doorIcon(), 4);
        head(anteIcon(), ANTE_X - SMALL_ICON);
        head(chairIcon(), SEATS_X - SMALL_ICON);
        head(eyeIcon(), WATCH_X - SMALL_ICON);
        if (!this.rooms.length) text("Finding rooms...", 4, ROW + 3, AP.IRON, this.content);

        this.scroll = Math.max(0, Math.min(this.scroll, this.rooms.length - ROWS));
        this.rooms.slice(this.scroll, this.scroll + ROWS).forEach((room, i) => {
            const row = new PIXI.Container();
            row.y = ROW * (i + 1);
            const back = new PIXI.Graphics();
            const paint = (lit: boolean) => back.clear()
                .beginFill(lit ? AP.SLATE : i % 2 ? AP.INK : AP.SHADOW).drawRect(0, 0, W, ROW - 1).endFill();
            paint(false);
            row.addChild(back);
            const full = room.s && room.p >= room.s;
            let name = room.n;
            while (name.length > 1 && textWidth(name) > ANTE_X - 34) name = name.slice(0, -1);
            if (name != room.n) name = name.slice(0, -1) + ".";
            text(name, 4, 3, AP.WHITE, row);
            right(room.a.toLocaleString("en-US"), ANTE_X, 3, AP.AMBER, row);
            if (room.s) right(`${room.p}/${room.s}`, SEATS_X, 3, full ? AP.FLAME : room.p ? AP.LIME : AP.ASH, row);
            else right(`${room.p}`, SEATS_X, 3, room.p ? AP.LIME : AP.ASH, row);
            right(`${room.w}`, WATCH_X, 3, AP.ASH, row);
            row.eventMode = "static";
            row.cursor = "pointer";
            row.hitArea = new PIXI.Rectangle(0, 0, W, ROW - 1);
            row.on("pointerover", () => paint(true));
            row.on("pointerout", () => paint(false));
            row.on("pointertap", () => (this.game == Game.SLIME_RACE ? SlimeRace : Blackjack).open(this.game, room.i));
            this.content.addChild(row);
        });
    }

}
