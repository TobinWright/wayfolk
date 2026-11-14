import * as PIXI from "pixi.js";
import { Pic } from "../../../art/Backdrops";
import { anteIcon, coinIcon, eyeIcon, infoIcon, potIcon, SMALL_ICON } from "../../../art/MenuIcons";
import { picTexture } from "../../../people/People";
import { cardPic, feltPic, ringPic, spotPic } from "../../../art/TableArt";
import { BJ_TURN_MS, BjPhase, BjStats, GAMES, handRank, RANKS, RoomLine, RoomState } from "../../../../../shared/Games";
import { Event } from "../../../constants/Events";
import { AP } from "../../../constants/Palette";
import { IBC } from "../../../Engine";
import { Panel } from "../../../shared/Panel";
import { TitleBar } from "../../../shared/ui/titlebar/TitleBar";
import { BaseComponent, ComponentType } from "../../BaseComponent";
import { text, textButton, textWidth, Tip } from "../GameUI";
import { RoomChat } from "../RoomChat";

// A blackjack room, watched (from its game's rooms): the room's own chat on
// the left (RoomChat), and the table on the right, twice as
// wide as it's high: the dealer and their cards along the top, the seats round
// the bottom, each who sits in it (half size on a plate, so a name's twice
// as long fits) or Sit, yours lit with Leave under it, their
// cards over them and what their hand's worth in their circle ("..." waiting
// for the next round), the ante (a chip), how many watch (an eye) and the pot
// (chips piled) in its top left corner, each saying what it is hovered, the
// rules hovering the "i" in its top right, and in the middle how the round's
// going (Hit and Stand there on your turn). Each sitting stands by their
// circle (their first hero), on the side away from the table's middle; the
// turn's time left is an amber arc round the circle whose turn it is,
// shrinking. What changes moves: antes slide from the seats into the pot (the
// gold paid rising off them), cards slide from the shoe to where they go, the
// dealer's hidden card turns over, and the pot slides to who won it (what
// they won rising off them) or to the dealer. Clicking a name shows their
// blackjack (hands played, the biggest pot, won or lost) in a box over the
// table till anything's clicked. The round's run by the server (shared/Games.ts);
// its countdowns are counted down here. Escape (not typing) or the cross
// closes it, leaving the room (and your seat).

// the rules, hovering the table's "i"
const RULES = [
    "Each player pays the ante into the pot",
    "Best hand takes the pot",
    "Blackjack beats any other 21",
    "Players tied for best split the pot",
    "Dealer stands on 17",
    "Dealer wins ties",
];

// something moving over the table, shown from `wait` ms on for `ms` (`at` ms since it was queued):
// step() puts it where it is t of the way (0 to 1), end() once it's there
interface Anim { shown: PIXI.Container; wait: number; ms: number; at: number; step: (t: number) => void; end?: () => void; }

export class Blackjack extends BaseComponent {

    public static SCALE = 2;
    public static H = 160;              // the content, in its own px
    public static CHAT_W = 140;         // the chat, on the left
    public static TABLE_X = 146;        // the table, the rest: twice as wide as it's high
    public static TABLE_W = Blackjack.H * 2;
    public static W = Blackjack.TABLE_X + Blackjack.TABLE_W;
    public static SEAT_W = 46;          // a seat's name, at most (at half size, as many letters as 92 at full)
    public static NAME_SIZE = 16;       // a seat's name's font size, half the rest's
    public static INSET_X = 12;         // the window round it, in screen px
    public static INSET_Y = 28;
    public static WIDTH = Blackjack.INSET_X * 2 + Blackjack.W * Blackjack.SCALE;
    public static HEIGHT = Blackjack.INSET_Y + Blackjack.H * Blackjack.SCALE + Blackjack.INSET_X;
    public static SAID_MS = 3000;       // a refusal shown on the table
    public static CARD_W = 14;
    public static CARD_H = 19;
    public static CARD_STEP = 9;        // a hand's cards, fanned
    public static POT_Y = 70;           // the pot, in the middle of the table (Hit and Stand under it)
    public static SHOE_X = Blackjack.TABLE_W / 2 + 54;     // where the cards come out of the shoe (TableArt feltPic)
    public static SHOE_Y = 7;
    public static FLY_MS = 260;         // a card or chips sliding across
    public static DEAL_GAP = 140;       // between cards dealt
    public static ANTE_GAP = 90;        // between antes paid in
    public static FLIP_MS = 300;        // the dealer's hidden card turned over
    public static FLOAT_MS = 1400;      // gold paid or won rising off a seat

    private static icons = new Map<Pic, PIXI.Texture>();    // (the corner's icons, made once)
    private static pics = new Map<string, PIXI.Texture>();  // (the cards, circles and spots, made once)
    private static arcPx: [number, number][];               // (the turn arc's px round a circle, clockwise from its top)

    public background: Panel;
    public titleBar: TitleBar;
    private content: PIXI.Container;
    private chat: RoomChat;
    private table: PIXI.Container;
    private seats: PIXI.Container;
    private potHint: PIXI.Container;    // (hoverable only while there's a pot)
    private anteHint: PIXI.Container;   // (as wide as the ante's number)
    private goldHint: PIXI.Container;   // (beside it, as wide as your gold)
    private fx: PIXI.Container;         // what's moving, over the table
    private arc: PIXI.Graphics;         // the turn's time left
    private arcShown = -1;              // (its px lit)
    private statsCard: PIXI.Container;  // a player's blackjack, their name clicked
    private tip: Tip;                   // what's under the pointer, hovered
    private anims: Anim[] = [];
    private flying = new Set<string>(); // cards on their way ("seat:card", the dealer's seat -1), not drawn in their hands yet
    private potComing = false;          // (antes on their way in: the pot not shown yet)

    private game = 0;
    private roomId = -1;
    private room: RoomState = null;     // (null: coming in)
    private refused = "";
    private refusedFor = 0;
    private left = 0;                   // ms left on the round's countdown (RoomState.t, counted down)
    private shownSecs = -1;

    constructor() {
        super(ComponentType.BLACKJACK);
        this.create();
    }

    // the window (one room at a time), watching `room` of `game`
    public static open(game: number, room: number) {
        IBC.comp.destroy(IBC.comp.getFirstByType(ComponentType.SLIME_RACE));      // (one room watched at a time)
        const view = IBC.comp.getOrCreate(ComponentType.BLACKJACK) as Blackjack;
        view.bringToTop();
        view.watch(game, room);
    }

    public create() {
        super.create();
        const { H, WIDTH, HEIGHT, SCALE, CHAT_W, TABLE_X, TABLE_W } = Blackjack;
        this.container.eventMode = "static";
        this.container.hitArea = new PIXI.Rectangle(0, 0, WIDTH, HEIGHT);
        this.container.on("pointerdown", (e: PIXI.FederatedPointerEvent) => { e.stopPropagation(); this.chat.setTyping(false); this.statsCard.visible = false; });

        this.background = new Panel(this.container);
        this.background.setSize(WIDTH, HEIGHT);
        this.titleBar = new TitleBar(this);
        this.titleBar.setPosition(4, 4);
        this.titleBar.setSize(WIDTH - 8, 20);
        this.titleBar.setTitle(GAMES[this.game]);

        this.content = new PIXI.Container();
        this.content.scale.set(SCALE);
        this.content.position.set(Blackjack.INSET_X, Blackjack.INSET_Y);
        this.container.addChild(this.content);

        this.chat = new RoomChat(CHAT_W, H, this, () => IBC.comp.destroy(this));
        this.content.addChild(this.chat.view);

        // the table, its felt cut to its box
        this.table = new PIXI.Container();
        this.table.x = TABLE_X;
        const tableMask = new PIXI.Graphics().beginFill(0xffffff).drawRect(0, 0, TABLE_W, H).endFill();
        this.table.addChild(tableMask);
        this.table.mask = tableMask;
        this.drawFelt();
        this.seats = new PIXI.Container();
        this.arc = new PIXI.Graphics();
        this.fx = new PIXI.Container();
        this.fx.eventMode = "none";
        this.table.addChild(this.seats, this.arc, this.fx);
        this.tip = new Tip(this.content, Blackjack.W);
        this.makeHints();
        this.statsCard = new PIXI.Container();
        this.statsCard.visible = false;
        this.table.addChild(this.statsCard);
        this.content.addChild(this.table);
        this.tip.raise();

        IBC.events.register(Event.GAME_ROOM, (got: { room: RoomState, lines?: RoomLine[] }) => {
            if (got.room.g != this.game || got.room.i != this.roomId) return;
            this.animate(this.room, got.room);
            this.room = got.room;
            this.left = got.room.t;
            this.titleBar.setTitle(`${GAMES[this.game]} - ${got.room.n}`);
            if (got.lines) { this.chat.comingIn = false; this.chat.reset(got.lines); }
            this.drawRound();
        }, this);
        IBC.events.register(Event.GAME_REFUSED, (why: string) => {
            this.refused = why;
            this.refusedFor = Blackjack.SAID_MS;
            this.drawRound();
        }, this);
        IBC.events.register(Event.GAME_STATS, (o: BjStats) => this.showStats(o), this);
        IBC.events.register(Event.INVENTORY_GOLD_UPDATED, () => this.drawRound(), this);

        this.setPosition(Math.round((window.innerWidth - WIDTH) / 2), Math.round((window.innerHeight - HEIGHT) / 2));
    }

    public destroy() {
        super.destroy();
        IBC.net.game.leave();
        this.chat.destroy();
        this.titleBar.destroy();
        this.background.destroy();
        this.container.destroy({ children: true });
    }

    public update(deltaTime: number) {
        if (this.refusedFor > 0 && (this.refusedFor -= deltaTime) <= 0) { this.refused = ""; this.drawRound(); }
        if (this.left > 0) {
            this.left = Math.max(0, this.left - deltaTime);
            if (this.room?.r == BjPhase.NEXT && Math.ceil(this.left / 1000) != this.shownSecs) this.drawRound();
        }
        if (this.anims.length) this.stepAnims(deltaTime);
        this.drawArc();
        this.chat.update(deltaTime);
    }

    private watch(game: number, room: number) {
        if (game == this.game && room == this.roomId) return;
        this.game = game;
        this.roomId = room;
        this.room = null;
        this.chat.comingIn = true;
        this.chat.reset();
        this.stopAnims();
        this.statsCard.visible = false;
        this.titleBar.setTitle(GAMES[game]);
        this.drawRound();
        IBC.net.game.watch(game, room);
    }

    //#region the table

    // the felt: a half oval hung from the dealer's edge, rimmed in wood, a px of it two on screen (TableArt)
    private drawFelt() {
        const { TABLE_W, H } = Blackjack;
        this.table.addChild(new PIXI.Sprite(Blackjack.pic("felt", () => feltPic(TABLE_W, H, -24, H + 18, TABLE_W / 2 - 30, H - 44))));
    }

    // a picture of the table's (TableArt), made the first time it's asked for
    private static pic(key: string, make: () => Pic) {
        let t = Blackjack.pics.get(key);
        if (!t) Blackjack.pics.set(key, t = picTexture(make()));
        return t;
    }

    private sprite(key: string, make: () => Pic, x: number, y: number) {
        const s = new PIXI.Sprite(Blackjack.pic(key, make));
        s.position.set(x, y);
        this.seats.addChild(s);
        return s;
    }

    // what hovering shows: the ante and spectators (bottom left) and the pot (the middle) say what they are, the "i" in the top right the rules
    private makeHints() {
        const { TABLE_W, H, POT_Y } = Blackjack, hints = new PIXI.Container();
        const zone = (x: number, y: number, w: number, h: number, lines: string[]) => this.tip.zone(x, y, w, h, lines, hints);
        this.anteHint = zone(6, H - 24, 64, 10, ["Ante"]);
        this.goldHint = zone(0, 0, 0, 0, ["Your gold"]);
        zone(6, H - 14, 64, 10, ["Spectators"]);
        this.potHint = zone(TABLE_W / 2 - 32, POT_Y - 2, 64, 10, ["Pot"]);
        const info = new PIXI.Sprite(picTexture(infoIcon()));
        info.position.set(TABLE_W - 12, 6);
        hints.addChild(info);
        zone(TABLE_W - 15, 3, 13, 13, RULES);
        this.table.addChild(hints);
    }

    // the round: the dealer's hand, each seat's, the corner and how it's going
    private drawRound() {
        const { TABLE_W, H, SEAT_W, NAME_SIZE, POT_Y } = Blackjack, cx = TABLE_W / 2;
        const mid = (s: string, y: number, tint: number) => text(s, Math.round(cx - textWidth(s) / 2), y, tint, this.seats);
        const right = (s: string, y: number, tint: number) => text(s, TABLE_W - 6 - textWidth(s), y, tint, this.seats);
        this.seats.removeChildren().forEach((c) => c.destroy({ children: true }));
        this.shownSecs = Math.ceil(this.left / 1000);
        // an icon and its number, from x
        const counted = (s: string, x: number, y: number, tint: number, pic: Pic) => {
            const icon = new PIXI.Sprite(Blackjack.icon(pic));
            icon.position.set(x, y);
            this.seats.addChild(icon);
            text(s, x + SMALL_ICON + 3, y, tint, this.seats);
        };
        if (!this.room) { mid("Coming in...", POT_Y, AP.PALE); return; }

        const room = this.room, me = IBC.data.player.name, seats = room.s, secs = this.shownSecs;
        const running = room.r == BjPhase.PLAY || room.r == BjPhase.DEALER || room.r == BjPhase.DONE;
        const shown = room.r == BjPhase.DEALER || room.r == BjPhase.DONE;     // (the dealer's hand turned up)
        // the ante, your gold beside it, how many watch under them
        const ante = room.a.toLocaleString("en-US"), anteW = SMALL_ICON + 3 + textWidth(ante), gold = IBC.data.inventory.gold.toLocaleString("en-US");
        counted(ante, 8, H - 22, AP.AMBER, anteIcon());
        counted(gold, 8 + anteW + 8, H - 22, AP.STRAW, coinIcon());
        this.anteHint.hitArea = new PIXI.Rectangle(6, H - 24, anteW + 4, 10);
        this.goldHint.hitArea = new PIXI.Rectangle(8 + anteW + 6, H - 24, SMALL_ICON + 3 + textWidth(gold) + 4, 10);
        counted(`${room.w}`, 8, H - 12, AP.PALE, eyeIcon());
        const pot = room.r == BjPhase.DONE || this.potComing ? 0 : room.p;     // (won, or the antes still on their way in)
        if (pot) {
            const s = pot.toLocaleString("en-US");
            counted(s, Math.round(cx - (SMALL_ICON + 3 + textWidth(s)) / 2), POT_Y, AP.STRAW, potIcon());
        }
        else if (this.potHint.eventMode == "static") this.tip.hide();     // (the pot gone from under the pointer)
        this.potHint.eventMode = pot ? "static" : "none";

        // the dealer: their cards (or where they go), and what they're worth once they're up (and there)
        const worth = (cards: number[]) => { const r = handRank(cards); return r < 0 ? "bust" : r == 22 ? "blackjack" : `${r}`; };
        const there = room.d.length && this.landed(room.d, -1).length == room.d.length;
        mid(shown && there ? `Dealer ${worth(room.d)}` : "Dealer", 7, AP.PALE);
        if (room.d.length) this.hand(room.d, -1, seats.length);
        else for (const x of [cx - 15, cx + 1]) this.cardSpot(x, 18);

        // how it's going (or what couldn't be), and Hit and Stand on your turn
        const turnName = room.u >= 0 ? seats[room.u] : null, mine = turnName != null && turnName == me;
        let status = "", tint = AP.PALE;
        if (room.r == BjPhase.IDLE || (room.r == BjPhase.NEXT && !seats.some((s) => s))) { status = "Waiting for players"; tint = AP.LIME; }
        else if (room.r == BjPhase.NEXT) status = `Next round in ${secs}`;
        else if (room.r == BjPhase.PLAY) { status = mine ? "Your turn" : `${turnName ?? "?"}'s turn`; if (mine) tint = AP.LIME; }
        else if (room.r == BjPhase.DEALER) status = "Dealer's turn";
        else {
            const winners = room.o.map((won, i) => won > 0 ? i : -1).filter((i) => i >= 0);
            if (!winners.length) { status = `The house keeps ${room.p.toLocaleString("en-US")}`; tint = AP.STRAW; }
            else if (winners.length == 1) {
                const who = seats[winners[0]] ?? "?", won = room.o[winners[0]].toLocaleString("en-US");
                status = who == me ? `You win ${won}` : `${who} wins ${won}`;
                tint = AP.LIME;
            }
            else { status = `${winners.length} split the pot`; tint = AP.LIME; }
        }
        if (this.refused) { status = this.refused; tint = AP.STRAW; }
        right(status, H - 12, tint);
        if (room.r == BjPhase.PLAY && mine) {
            const hitW = textWidth("Hit"), x = Math.round(cx - (hitW + 12 + textWidth("Stand")) / 2);
            textButton("Hit", x, POT_Y + 12, AP.PALE, AP.LIME, this.seats, () => IBC.net.game.hit());
            textButton("Stand", x + hitW + 12, POT_Y + 12, AP.PALE, AP.AMBER, this.seats, () => IBC.net.game.hold());
        }
        else if (running && room.r != BjPhase.DONE && seats.includes(me) && !room.h[seats.indexOf(me)]) right("You're in the next round", H - 22, AP.STONE);

        // round the bottom, the first on the left: a circle (the hand's worth in it), the cards over it, who sits there or Sit
        seats.forEach((name, i) => {
            const { x, y } = Blackjack.seatAt(i, seats.length);
            const hand = room.h[i], isMe = name != null && name == me, turn = room.r == BjPhase.PLAY && room.u == i;
            const ring = isMe ? AP.LIME : name ? AP.PALE : AP.LEAF;
            this.sprite(`ring${ring}`, () => ringPic(9, ring), x - 9, y - 9);
            if (hand) {
                this.hand(hand, i, seats.length);
                const got = this.landed(hand, i), r = handRank(got), s = r < 0 ? "X" : r == 22 ? "BJ" : `${r}`;
                if (got.length) text(s, Math.round(x - textWidth(s) / 2) + 1, y - 3, r < 0 ? AP.FLAME : room.o[i] > 0 ? AP.LIME : r == 22 ? AP.AMBER : AP.WHITE, this.seats);
            }
            else if (name && running) text("...", Math.round(x - textWidth("...") / 2) + 1, y - 4, AP.STONE, this.seats);
            if (!name) {        // Sit in the empty circle, the circle clicked (not while you sit in another)
                if (seats.includes(me)) return;
                const w = textWidth("Sit"), left = Math.round(x - w / 2) + 1;
                textButton("Sit", left, y - 3, AP.PALE, AP.LIME, this.seats, () => IBC.net.game.sit(i), new PIXI.Circle(x - left, 3, 10));
                return;
            }
            // the name, half size, on a dark plate (a px of its border and padding one on screen, as the letters are)
            let label = name;
            while (label.length > 1 && textWidth(label, NAME_SIZE) > SEAT_W) label = label.slice(0, -1);
            if (label != name) label = label.slice(0, -1) + ".";
            const labelW = textWidth(label, NAME_SIZE), plateX = Math.round(x - labelW / 2 - 1.5), plateW = labelW + 3;
            this.seats.addChild(new PIXI.Graphics()
                .beginFill(turn ? AP.AMBER : AP.BLACK).drawRect(plateX, y + 12, plateW, 5.5).endFill()
                .beginFill(AP.INK).drawRect(plateX + 0.5, y + 12.5, plateW - 1, 4.5).endFill());
            text(label, plateX + 1.5, y + 13, isMe ? AP.LIME : running && !hand ? AP.STONE : AP.WHITE, this.seats, NAME_SIZE);
            const plate = new PIXI.Container();     // (clicked: their blackjack)
            plate.eventMode = "static";
            plate.cursor = "pointer";
            plate.hitArea = new PIXI.Rectangle(plateX - 1, y + 11, plateW + 2, 8);
            plate.on("pointerdown", (e: PIXI.FederatedPointerEvent) => e.stopPropagation());
            plate.on("pointertap", () => IBC.net.game.stats(name));
            this.seats.addChild(plate);
            if (isMe) textButton("Leave", Math.round(x - textWidth("Leave") / 2), y + 20, AP.STONE, AP.FLAME, this.seats, () => IBC.net.game.stand());
        });
    }

    // a player's blackjack, in a box over the dealer's end (anything clicked puts it away)
    private showStats(o: BjStats) {
        const card = this.statsCard, g = (n: number) => n.toLocaleString("en-US");
        card.removeChildren().forEach((c) => c.destroy({ children: true }));
        const rows: [string, string, number][] = [
            ["Hands played", g(o.h), AP.WHITE],
            ["Biggest pot", g(o.b), AP.STRAW],
            [o.w < 0 ? "Lost" : "Won", g(Math.abs(o.w)), o.w < 0 ? AP.FLAME : AP.LIME],
        ];
        const w = Math.max(textWidth(o.n), ...rows.map(([label, value]) => textWidth(label) + 12 + textWidth(value))) + 10, h = 15 + rows.length * 10;
        card.addChild(new PIXI.Graphics().beginFill(AP.BLACK).drawRect(0, 0, w, h).endFill().beginFill(AP.SHADOW).drawRect(1, 1, w - 2, h - 2).endFill());
        text(o.n, 5, 3, o.n == IBC.data.player.name ? AP.LIME : AP.WHITE, card);
        rows.forEach(([label, value, tint], i) => {
            text(label, 5, 14 + i * 10, AP.STONE, card);
            text(value, w - 5 - textWidth(value), 14 + i * 10, tint, card);
        });
        card.position.set(Math.round(Blackjack.TABLE_W / 2 - w / 2), 20);
        card.visible = true;
    }

    // the turn's time left, round the circle whose turn it is: amber px clockwise from its top, fewer as it runs out
    private drawArc() {
        const room = this.room, turn = room?.r == BjPhase.PLAY ? room.u : -1, px = Blackjack.arcPx ??= Blackjack.arcPixels();
        const lit = turn < 0 ? 0 : Math.ceil(px.length * Math.min(1, this.left / BJ_TURN_MS)), key = turn < 0 ? -1 : turn * 1000 + lit;
        if (key == this.arcShown) return;
        this.arcShown = key;
        this.arc.clear();
        if (turn < 0) return;
        const { x, y } = Blackjack.seatAt(turn, room.s.length);
        this.arc.beginFill(AP.AMBER);
        for (const [dx, dy] of px.slice(0, lit)) this.arc.drawRect(x + dx, y + dy, 1, 1);
        this.arc.endFill();
    }

    // the 2 px just outside a seat's circle (ringPic 9, its middle half a px in from where it's placed), clockwise from its top
    private static arcPixels() {
        const px: [number, number, number][] = [];
        for (let dy = -12; dy <= 12; dy++) for (let dx = -12; dx <= 12; dx++) {
            const d = Math.hypot(dx, dy);
            if (d > 9.5 && d <= 11.5) px.push([dx, dy, (Math.atan2(dx, -dy) + Math.PI * 2) % (Math.PI * 2)]);
        }
        return px.sort((a, b) => a[2] - b[2]).map(([dx, dy]) => [dx, dy] as [number, number]);
    }

    // where seat i of n's circle is (its middle), round the bottom, the first on the left
    private static seatAt(i: number, n: number) {
        const { TABLE_W, H } = Blackjack, a = Math.PI * (0.8 - 0.6 * i / (n - 1));      // (144 degrees on the left round to 36 on the right)
        return { x: Math.round(TABLE_W / 2 + Math.cos(a) * (TABLE_W / 2 - 30)), y: Math.round(-24 + Math.sin(a) * (H - 11)) };
    }

    // where card k of a hand of n goes (its top left): a seat's (of `seats`) fanned over its circle, the dealer's (seat -1) along the top
    private static cardAt(seat: number, k: number, n: number, seats: number) {
        const { TABLE_W, CARD_W, CARD_H, CARD_STEP } = Blackjack;
        let x = TABLE_W / 2, y = 18;
        if (seat >= 0) { const s = Blackjack.seatAt(seat, seats); x = s.x; y = s.y - 11 - CARD_H; }
        return { x: Math.round(x - (CARD_W + CARD_STEP * (n - 1)) / 2) + CARD_STEP * k, y };
    }

    // a hand's cards (a seat's, the dealer's -1), but those still on their way
    private hand(cards: number[], seat: number, seats: number) {
        cards.forEach((c, k) => {
            if (this.flying.has(`${seat}:${k}`)) return;
            const at = Blackjack.cardAt(seat, k, cards.length, seats);
            this.card(c, at.x, at.y, this.seats);
        });
    }

    // the cards of a hand that are there
    private landed(cards: number[], seat: number) {
        return cards.filter((_, k) => !this.flying.has(`${seat}:${k}`));
    }

    // a card, its shadow on the felt under it: its rank in its top left and its suit in its bottom right, red or black; face down, its red back
    private card(c: number, x: number, y: number, parent: PIXI.Container) {
        const { CARD_W, CARD_H } = Blackjack;
        const shadow = new PIXI.Graphics().beginFill(AP.BLACK)
            .drawRect(x + 2, y + 1, CARD_W - 2, CARD_H).drawRect(x + 1, y + 2, CARD_W, CARD_H - 2).endFill();
        shadow.alpha = 0.45;
        const face = new PIXI.Sprite(Blackjack.pic(`card${c}`, () => cardPic(c, CARD_W, CARD_H)));
        face.position.set(x, y);
        parent.addChild(shadow, face);
        if (c < 0) return;
        const suit = Math.floor(c / 13), ink = suit == 1 || suit == 2 ? AP.RED : AP.BLACK, rank = RANKS[c % 13];
        text(rank, x + (rank.length > 1 ? 1 : 2), y + 2, ink, parent);
    }

    // where a card goes, an outline on the felt
    private cardSpot(x: number, y: number) {
        const { CARD_W, CARD_H } = Blackjack;
        this.sprite("spot", () => spotPic(CARD_W, CARD_H), x, y);
    }

    // one of the small icons (MenuIcons), made once
    private static icon(pic: Pic) {
        return Blackjack.icons.get(pic) ?? Blackjack.icons.set(pic, picTexture(pic)).get(pic);
    }

    //#endregion

    //#region what moves

    // what changed from `was` to `now`, set moving: a new round's antes into the pot and its cards dealt, cards
    // drawn, the dealer's hidden card turned up, and the pot to who won it (or the dealer) as the round ends
    private animate(was: RoomState, now: RoomState) {
        if (!was) return;
        const { TABLE_W, POT_Y, SHOE_X, SHOE_Y, DEAL_GAP, ANTE_GAP, FLY_MS, FLIP_MS, CARD_W } = Blackjack, seats = now.s.length;
        const pot = { x: TABLE_W / 2 - 4, y: POT_Y };
        let wait = this.busyFor();
        const deal = (seat: number, k: number, cards: number[]) => {
            const key = `${seat}:${k}`, shown = new PIXI.Container();
            this.card(cards[k], 0, 0, shown);
            this.flying.add(key);
            this.fly(shown, { x: SHOE_X, y: SHOE_Y }, Blackjack.cardAt(seat, k, cards.length, seats), wait, FLY_MS, () => this.flying.delete(key));
            wait += DEAL_GAP;
        };

        if (!was.h.some((h) => h) && now.h.some((h) => h)) {        // a new round: the antes in, then two cards each and the dealer two
            this.potComing = true;
            now.h.forEach((h, i) => {
                if (!h) return;
                const at = Blackjack.seatAt(i, seats);
                this.fly(this.chip(anteIcon()), { x: at.x - 3, y: at.y - 3 }, pot, wait, FLY_MS);
                this.float(`-${now.a.toLocaleString("en-US")}`, at.x, at.y - 4, AP.FLAME, wait);
                wait += ANTE_GAP;
            });
            wait += FLY_MS - ANTE_GAP;
            this.queue(new PIXI.Container(), wait, 1, () => { }, () => this.potComing = false);
            for (let k = 0; k < 2; k++) {
                now.h.forEach((h, i) => { if (h?.[k] != null) deal(i, k, h); });
                if (now.d[k] != null) deal(-1, k, now.d);
            }
            return;
        }

        now.h.forEach((h, i) => { if (h && was.h[i]) for (let k = was.h[i].length; k < h.length; k++) deal(i, k, h); });
        if (was.d[1] == -1 && now.d[1] >= 0) {      // the dealer's hidden card turned over, about its middle
            const key = "-1:1", at = Blackjack.cardAt(-1, 1, now.d.length, seats);
            const shown = new PIXI.Container(), back = new PIXI.Container(), face = new PIXI.Container();
            this.card(-1, -CARD_W / 2, 0, back);
            this.card(now.d[1], -CARD_W / 2, 0, face);
            shown.addChild(back, face);
            shown.position.set(at.x + CARD_W / 2, at.y);
            this.flying.add(key);
            this.queue(shown, wait, FLIP_MS, (t) => {
                shown.scale.x = Math.max(0.1, Math.abs(Math.cos(Math.PI * t)));
                back.visible = t < 0.5;
                face.visible = t >= 0.5;
            }, () => this.flying.delete(key));
            wait += FLIP_MS;
        }
        for (let k = was.d.length; k < now.d.length; k++) deal(-1, k, now.d);

        if (was.r != BjPhase.DONE && now.r == BjPhase.DONE && now.p) {      // the pot to who won it (what they won rising off them), or the dealer
            const winners = now.o.map((won, i) => won > 0 ? i : -1).filter((i) => i >= 0);
            if (!winners.length) this.fly(this.chip(potIcon()), pot, { x: TABLE_W / 2 - 4, y: 24 }, wait, FLY_MS * 2);
            for (const i of winners) {
                const at = Blackjack.seatAt(i, seats);
                this.fly(this.chip(potIcon()), pot, { x: at.x - 3, y: at.y - 3 }, wait, FLY_MS * 2,
                    () => this.float(`+${now.o[i].toLocaleString("en-US")}`, at.x, at.y - 4, AP.LIME, 0));
            }
        }
    }

    private queue(shown: PIXI.Container, wait: number, ms: number, step: (t: number) => void, end?: () => void) {
        shown.visible = false;
        this.fx.addChild(shown);
        this.anims.push({ shown, wait, ms, at: 0, step, end });
    }

    // ms till what's moving now has stopped
    private busyFor() {
        return this.anims.reduce((most, a) => Math.max(most, a.wait + a.ms - a.at), 0);
    }

    // `shown` sliding from `from` to `to`, slowing as it gets there
    private fly(shown: PIXI.Container, from: { x: number, y: number }, to: { x: number, y: number }, wait: number, ms: number, end?: () => void) {
        this.queue(shown, wait, ms, (t) => {
            const e = 1 - (1 - t) * (1 - t);
            shown.position.set(Math.round(from.x + (to.x - from.x) * e), Math.round(from.y + (to.y - from.y) * e));
        }, end);
    }

    // gold paid or won, centred on x, rising off y and fading
    private float(s: string, x: number, y: number, tint: number, wait: number) {
        const shown = new PIXI.Container(), left = Math.round(x - textWidth(s) / 2) + 1;
        text(s, 1, 1, AP.BLACK, shown);
        text(s, 0, 0, tint, shown);
        this.queue(shown, wait, Blackjack.FLOAT_MS, (t) => {
            shown.position.set(left, Math.round(y - 14 * t));
            shown.alpha = t < 0.5 ? 1 : 2 - t * 2;
        });
    }

    private chip(pic: Pic) {
        const shown = new PIXI.Container();
        shown.addChild(new PIXI.Sprite(Blackjack.icon(pic)));
        return shown;
    }

    // each moving on; any that's got there gone, and the table drawn again (with the cards that landed)
    private stepAnims(deltaTime: number) {
        let ended = false;
        for (const a of this.anims) {
            a.at += deltaTime;
            const t = (a.at - a.wait) / a.ms;
            if (t < 0) continue;
            a.shown.visible = true;
            a.step(Math.min(1, t));
            if (t >= 1) { a.end?.(); ended = true; }
        }
        if (!ended) return;
        this.anims = this.anims.filter((a) => {
            if (a.at < a.wait + a.ms) return true;
            a.shown.destroy({ children: true });
            return false;
        });
        this.drawRound();
    }

    private stopAnims() {
        for (const a of this.anims) a.shown.destroy({ children: true });
        this.anims = [];
        this.flying.clear();
        this.potComing = false;
    }

    //#endregion

}
