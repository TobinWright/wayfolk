import * as PIXI from "pixi.js";
import { GAMES, oddsText, RACE_BET_MS, RacePhase, raceAt, RaceState, RoomLine } from "../../../../../shared/Games";
import { Pic } from "../../../art/Backdrops";
import { anteIcon, coinIcon, eyeIcon, infoIcon, SMALL_ICON } from "../../../art/MenuIcons";
import { crowdPic, SLIME_H, SLIME_HUES, SLIME_W, slimePic, trackPic } from "../../../art/RaceArt";
import { Event } from "../../../constants/Events";
import { AP } from "../../../constants/Palette";
import { IBC } from "../../../Engine";
import { picTexture } from "../../../people/People";
import { Panel } from "../../../shared/Panel";
import { TitleBar } from "../../../shared/ui/titlebar/TitleBar";
import { BaseComponent, ComponentType } from "../../BaseComponent";
import { text, textWidth, Tip } from "../GameUI";
import { RoomChat } from "../RoomChat";
import { RaceSounds, Specks } from "./RaceFx";

// A slime race's track, watched (from its game's rooms): the room's own chat
// on the left (RoomChat), the track on the right, twice as wide as it's high:
// the stands along the top (their crowd), a lane a slime, the start on the
// left and the chequered finish on the right. While betting's open each lane
// says its slime's name, who's bet on it (half size) and its odds, a striped
// barrier in front of it; clicking a lane puts the stake on it (or moves your
// bet there), yours lit, and hovering one says what it pays. Then the race:
// the slimes hop along their lanes as the server ran them (shared/Games.ts
// raceAt), yours marked over its head, each numbered by where it finished as
// it crosses the line; then who won, and what you won rising off your slime.
// The stake, your gold and how many watch in the bottom left, each saying what
// it is hovered; how the race is going in the bottom right; the rules hovering
// the "i" in the top right. The countdowns are counted down here. Escape (not
// typing) or the cross closes it, leaving the track (a bet's taken back while
// betting's open).
//
// And it dazzles (the user, 2026-11-03: "make it dazzle more"; the effects
// Claude's): over the stands a callout - "Place your bets!", a big 3, 2, 1
// beeping, "GO!", who's leading and who takes the lead, "Photo finish!" -
// popping in as it changes; the barriers lift at GO, the track shaking and
// dust kicked up; the crowd jumps and cheers through the race, wilder at the
// end; each slime leaves a goo trail, splats as it lands and streaks when it
// surges, the leader crowned; confetti off the finish post as the winner
// crosses (a close second a white flash); then a banner of who won pops in,
// the winner bouncing for joy, a fanfare, and coins fountaining off your
// slime if it was yours (RaceFx: the specks and the sounds).

// the rules, hovering the track's "i"
const RULES = [
    "Bet the stake on a slime before the race",
    "Switch slimes until betting closes",
    "Odds are set by each slime's chances",
    "A winning bet pays the stake times its odds",
];

const CONFETTI = [AP.FLAME, AP.STRAW, AP.SKY, AP.LIME, AP.ORCHID, AP.WHITE, AP.ICE];
const COINS = [AP.STRAW, AP.AMBER, AP.OCHRE, AP.WHITE];

// gold paid or won, rising off (x, y) for FLOAT_MS
interface Float { shown: PIXI.Container; x: number; y: number; at: number; }

export class SlimeRace extends BaseComponent {

    public static SCALE = 2;
    public static H = 160;              // the content, in its own px
    public static CHAT_W = 140;
    public static TRACK_X = 146;
    public static TRACK_W = SlimeRace.H * 2;
    public static W = SlimeRace.TRACK_X + SlimeRace.TRACK_W;
    public static INSET_X = 12;         // the window round it, in screen px
    public static INSET_Y = 28;
    public static WIDTH = SlimeRace.INSET_X * 2 + SlimeRace.W * SlimeRace.SCALE;
    public static HEIGHT = SlimeRace.INSET_Y + SlimeRace.H * SlimeRace.SCALE + SlimeRace.INSET_X;
    public static TOP = 22;             // the lanes, from here
    public static LANE = 17;
    public static LANES = 6;
    public static START_X = 40;         // a slime's middle, at the start
    public static BAR_X = SlimeRace.START_X + 9;    // the barrier in front of it
    public static FINISH_X = 296;       // the finish line (a slime's middle ends 4 past it)
    public static NAME_SIZE = 16;       // who's bet, half size
    public static SAID_MS = 3000;       // a refusal shown on the track
    public static FLOAT_MS = 1400;
    public static LIFT_MS = 450;        // the barriers lifting at GO
    public static GO_MS = 900;          // "GO!" shown
    public static POP_MS = 200;         // a callout popping in
    public static BANNER_MS = 450;      // the winner's banner popping in
    public static PHOTO_MS = 250;       // first and second closer than this: a photo finish
    public static BANNER_X = 152;       // the winner's banner's middle (clear of the finish, where the winner is)
    public static BANNER_W = 200;       // its title big, if it's no wider

    private static pics = new Map<string, PIXI.Texture>();      // (the track, the slimes and the icons, made once)

    public background: Panel;
    public titleBar: TitleBar;
    private content: PIXI.Container;
    private chat: RoomChat;
    private track: PIXI.Container;
    private crowd: PIXI.Sprite;
    private callout = new PIXI.Container();     // over the stands
    private board: PIXI.Container;      // the lanes' words and the corners, drawn again as the race changes
    private gates: PIXI.Graphics;       // the barriers
    private trails: PIXI.Graphics;      // goo trails and speed lines, every frame
    private runners: PIXI.Container;    // the slimes, moved every frame
    private shadows: PIXI.Graphics[] = [];
    private sprites: PIXI.Sprite[] = [];
    private crown: PIXI.Graphics;       // (over the leader's head)
    private mark: PIXI.Graphics;        // (over your slime's head)
    private specks = new Specks();
    private banner = new PIXI.Container();
    private flash: PIXI.Graphics;
    private fx: PIXI.Container;         // what's rising off them
    private floats: Float[] = [];
    private tip: Tip;
    private lanes: PIXI.Container[] = [];
    private stakeHint: PIXI.Container;
    private goldHint: PIXI.Container;
    private hover = -1;                 // the lane under the pointer
    private pointer = new PIXI.Point(); // (where it was, to move the tip as the lane's drawn again)

    private game = 0;
    private roomId = -1;
    private room: RaceState = null;     // (null: coming in)
    private left = 0;                   // ms left in the race's phase (RaceState.t, counted down)
    private ms = 0;                     // ms since the race started (RaceState.x, counted up)
    private shownSecs = -1;
    private crossed = 0;                // (how many have finished, as last drawn)
    private refused = "";
    private refusedFor = 0;

    // the show
    private calledOut = "";             // (what the callout says)
    private calloutAt = 0;              // ms since it changed
    private leader = -1;
    private leadSince = 0;              // (ms into the race the lead last changed)
    private landed: boolean[] = [];     // (each slime on the ground, as last drawn)
    private cheered = 0;                // (how many crossings celebrated)
    private bannerAt = 0;
    private flashAt = 1e9;
    private shake = 0;                  // ms left shaking
    private sparkle = 0;

    constructor() {
        super(ComponentType.SLIME_RACE);
        this.create();
    }

    // the window (one room at a time), watching track `room`
    public static open(game: number, room: number) {
        IBC.comp.destroy(IBC.comp.getFirstByType(ComponentType.BLACKJACK));     // (one room watched at a time)
        const view = IBC.comp.getOrCreate(ComponentType.SLIME_RACE) as SlimeRace;
        view.bringToTop();
        view.watch(game, room);
    }

    public create() {
        super.create();
        const { H, WIDTH, HEIGHT, SCALE, CHAT_W, TRACK_X, TRACK_W, TOP, LANE, LANES, START_X, FINISH_X } = SlimeRace;
        this.container.eventMode = "static";
        this.container.hitArea = new PIXI.Rectangle(0, 0, WIDTH, HEIGHT);
        this.container.on("pointerdown", (e: PIXI.FederatedPointerEvent) => { e.stopPropagation(); this.chat.setTyping(false); });

        this.background = new Panel(this.container);
        this.background.setSize(WIDTH, HEIGHT);
        this.titleBar = new TitleBar(this);
        this.titleBar.setPosition(4, 4);
        this.titleBar.setSize(WIDTH - 8, 20);
        this.titleBar.setTitle(GAMES[this.game]);

        this.content = new PIXI.Container();
        this.content.scale.set(SCALE);
        this.content.position.set(SlimeRace.INSET_X, SlimeRace.INSET_Y);
        this.container.addChild(this.content);
        this.chat = new RoomChat(CHAT_W, H, this, () => IBC.comp.destroy(this));
        this.content.addChild(this.chat.view);

        // the track, cut to its box: its picture and crowd, the callout over them, the lanes' words, the barriers,
        // the trails, the slimes, the specks, the banner, the flash, what's rising off them
        this.track = new PIXI.Container();
        this.track.x = TRACK_X;
        const mask = new PIXI.Graphics().beginFill(0xffffff).drawRect(0, 0, TRACK_W, H).endFill();
        this.track.addChild(mask);
        this.track.mask = mask;
        this.track.addChild(new PIXI.Sprite(SlimeRace.pic("track", () => trackPic(TRACK_W, H, TOP, LANES, LANE, START_X - 8, FINISH_X))));
        this.crowd = new PIXI.Sprite(SlimeRace.pic("crowd0", () => crowdPic(TRACK_W, TOP, 0, FINISH_X)));
        this.callout.position.set(TRACK_W / 2, 9);
        this.board = new PIXI.Container();
        this.gates = SlimeRace.barriers();
        this.trails = new PIXI.Graphics();
        this.runners = new PIXI.Container();
        this.runners.eventMode = "none";
        for (let i = 0; i < LANES; i++) {
            this.shadows.push(new PIXI.Graphics());
            this.sprites.push(new PIXI.Sprite());
            this.runners.addChild(this.shadows[i], this.sprites[i]);
        }
        this.crown = new PIXI.Graphics().beginFill(AP.BLACK).drawRect(-3, -4, 7, 4).drawRect(-3, -5, 1, 1).drawRect(0, -5, 1, 1).drawRect(3, -5, 1, 1).endFill()
            .beginFill(AP.STRAW).drawRect(-2, -3, 5, 2).drawRect(-2, -4, 1, 1).drawRect(0, -4, 1, 1).drawRect(2, -4, 1, 1).endFill()
            .beginFill(AP.RED).drawRect(0, -2, 1, 1).endFill();
        this.mark = new PIXI.Graphics().beginFill(AP.BLACK).drawPolygon([-3, -1, 4, -1, 0.5, 3]).endFill()
            .beginFill(AP.LIME).drawPolygon([-2, -0.5, 3, -0.5, 0.5, 2]).endFill();
        this.runners.addChild(this.crown, this.mark);
        this.banner.position.set(SlimeRace.BANNER_X, TOP + LANE * 3);
        this.banner.visible = false;
        this.flash = new PIXI.Graphics().beginFill(AP.WHITE).drawRect(0, 0, TRACK_W, H).endFill();
        this.flash.visible = false;
        this.fx = new PIXI.Container();
        this.fx.eventMode = "none";
        for (const c of [this.crowd, this.callout, this.board, this.gates, this.trails, this.runners, this.specks.view, this.banner, this.flash, this.fx]) {
            c.eventMode = "none";
            this.track.addChild(c);
        }
        this.content.addChild(this.track);

        // each lane, clicked (while betting's open) to bet on its slime, hovered to say what it pays
        this.tip = new Tip(this.content, SlimeRace.W);
        for (let i = 0; i < LANES; i++) {
            const lane = new PIXI.Container();
            lane.eventMode = "static";
            lane.hitArea = new PIXI.Rectangle(0, TOP + i * LANE + 1, TRACK_W, LANE - 1);
            lane.on("pointerenter", (e: PIXI.FederatedPointerEvent) => { this.hover = i; this.pointer.copyFrom(e.global); this.drawBoard(); });
            lane.on("pointermove", (e: PIXI.FederatedPointerEvent) => { this.pointer.copyFrom(e.global); this.tip.move(e); });
            lane.on("pointerleave", () => { if (this.hover == i) { this.hover = -1; this.tip.hide(); this.drawBoard(); } });
            lane.on("pointerdown", (e: PIXI.FederatedPointerEvent) => { e.stopPropagation(); this.chat.setTyping(false); });
            lane.on("pointertap", () => { if (this.room?.r == RacePhase.BETTING && i < this.room.l.length) IBC.net.game.bet(i); });
            this.track.addChild(lane);
            this.lanes.push(lane);
        }
        this.makeHints();
        this.tip.raise();

        IBC.events.register(Event.GAME_ROOM, (got: { room: RaceState, lines?: RoomLine[] }) => {
            if (got.room.g != this.game || got.room.i != this.roomId) return;
            const was = this.room;
            this.room = got.room;
            this.left = got.room.t;
            this.ms = got.room.x;
            this.changed(was, got.room);
            this.titleBar.setTitle(`${GAMES[this.game]} - ${got.room.n}`);
            if (got.lines) { this.chat.comingIn = false; this.chat.reset(got.lines); }
            this.drawBoard();
        }, this);
        IBC.events.register(Event.GAME_REFUSED, (why: string) => {
            this.refused = why;
            this.refusedFor = SlimeRace.SAID_MS;
            this.drawBoard();
        }, this);
        IBC.events.register(Event.INVENTORY_GOLD_UPDATED, () => this.drawBoard(), this);

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
        if (this.refusedFor > 0 && (this.refusedFor -= deltaTime) <= 0) { this.refused = ""; this.drawBoard(); }
        this.left = Math.max(0, this.left - deltaTime);
        this.ms += deltaTime;
        const room = this.room;
        if (room?.r == RacePhase.BETTING && Math.ceil(this.left / 1000) != this.shownSecs) {
            if (this.shownSecs > 1 && Math.ceil(this.left / 1000) <= 3) RaceSounds.countdown();
            this.drawBoard();
        }
        if (room?.r == RacePhase.RUNNING && room.f.filter((f) => f <= this.ms).length != this.crossed) this.drawBoard();
        this.drawRunners(deltaTime);
        this.show(deltaTime);
        this.specks.update(deltaTime);
        this.stepFloats(deltaTime);
        this.chat.update(deltaTime);
    }

    private watch(game: number, room: number) {
        if (game == this.game && room == this.roomId) return;
        this.game = game;
        this.roomId = room;
        this.room = null;
        this.chat.comingIn = true;
        this.chat.reset();
        this.specks.clear();
        this.titleBar.setTitle(GAMES[game]);
        this.drawBoard();
        IBC.net.game.watch(game, room);
    }

    //#region the track

    // a picture (RaceArt, MenuIcons), made the first time it's asked for
    private static pic(key: string, make: () => Pic) {
        let t = SlimeRace.pics.get(key);
        if (!t) SlimeRace.pics.set(key, t = picTexture(make()));
        return t;
    }

    // the barriers, a striped red and white bar across the front of each lane
    private static barriers() {
        const { BAR_X, TOP, LANE, LANES } = SlimeRace, g = new PIXI.Graphics();
        for (let i = 0; i < LANES; i++) {
            const y = TOP + i * LANE + 1;
            g.beginFill(AP.BLACK).drawRect(BAR_X - 1, y, 4, LANE - 1).endFill();
            for (let k = 0; k < LANE - 1; k += 2) g.beginFill(Math.floor(k / 2) % 2 ? AP.WHITE : AP.RED).drawRect(BAR_X, y + k, 2, Math.min(2, LANE - 1 - k)).endFill();
        }
        return g;
    }

    // what hovering shows: the stake, your gold and how many watch (bottom left) say what they are, the "i" the rules
    private makeHints() {
        const { TRACK_W, H } = SlimeRace, hints = new PIXI.Container();
        const zone = (x: number, y: number, w: number, h: number, lines: string[]) => this.tip.zone(x, y, w, h, lines, hints);
        this.stakeHint = zone(6, H - 24, 64, 10, ["Stake"]);
        this.goldHint = zone(0, 0, 0, 0, ["Your gold"]);
        zone(6, H - 14, 64, 10, ["Spectators"]);
        const info = new PIXI.Sprite(SlimeRace.pic("info", infoIcon));
        info.position.set(TRACK_W - 10, 6);
        hints.addChild(info);
        zone(TRACK_W - 13, 3, 13, 13, RULES);
        this.track.addChild(hints);
    }

    // the lanes' words (while betting's open, or the places as they cross the line), the corners and how it's going
    private drawBoard() {
        const { TRACK_W, H, TOP, LANE, START_X, FINISH_X, NAME_SIZE } = SlimeRace;
        this.board.removeChildren().forEach((c) => c.destroy({ children: true }));
        this.shownSecs = Math.ceil(this.left / 1000);
        const right = (s: string, y: number, tint: number) => text(s, TRACK_W - 6 - textWidth(s), y, tint, this.board);
        const counted = (s: string, x: number, y: number, tint: number, key: string, pic: () => Pic) => {
            const icon = new PIXI.Sprite(SlimeRace.pic(key, pic));
            icon.position.set(x, y);
            this.board.addChild(icon);
            text(s, x + SMALL_ICON + 3, y, tint, this.board);
        };
        const room = this.room, me = IBC.data.player.name, g = (n: number) => n.toLocaleString("en-US");
        if (!room) { text("Coming in...", Math.round(TRACK_W / 2 - textWidth("Coming in...") / 2), TOP + LANE * 3 - 4, AP.WHITE, this.board); return; }

        // the stake, your gold beside it, how many watch under them
        const stake = g(room.a), stakeW = SMALL_ICON + 3 + textWidth(stake), gold = g(IBC.data.inventory.gold);
        counted(stake, 8, H - 22, AP.AMBER, "ante", anteIcon);
        counted(gold, 8 + stakeW + 8, H - 22, AP.STRAW, "coin", coinIcon);
        this.stakeHint.hitArea = new PIXI.Rectangle(6, H - 24, stakeW + 4, 10);
        this.goldHint.hitArea = new PIXI.Rectangle(8 + stakeW + 6, H - 24, SMALL_ICON + 3 + textWidth(gold) + 4, 10);
        counted(`${room.w}`, 8, H - 12, AP.PALE, "eye", eyeIcon);

        const mine = room.b.find(([n]) => n == me)?.[1] ?? -1, betting = room.r == RacePhase.BETTING;
        const nameX = START_X + 15;
        room.l.forEach((slime, i) => {
            const y = TOP + i * LANE, backers = room.b.filter(([, s]) => s == i).map(([n]) => n);
            // the gate's number, in the slime's colour
            text(`${i + 1}`, 12 - Math.round(textWidth(`${i + 1}`) / 2), y + 5, SLIME_HUES[slime.c][0], this.board);
            if (betting) {
                // a dark band over the mud: its name, who's backed it, its odds; yours lit, the one under the pointer lighter
                const lit = i == mine, over = i == this.hover;
                const band = new PIXI.Graphics().beginFill(lit ? AP.LEAF : over ? AP.SLATE : AP.BLACK).drawRect(START_X + 12, y + 3, FINISH_X - START_X - 16, LANE - 5).endFill();
                band.alpha = lit ? 0.8 : 0.6;
                this.board.addChild(band);
                text(slime.n, nameX, y + 5, lit ? AP.LIME : AP.WHITE, this.board);
                const odds = oddsText(slime.o), oddsX = FINISH_X - 7 - textWidth(odds);
                text(odds, oddsX, y + 5, AP.STRAW, this.board);
                let who = backers.join(", "), more = 0;
                const space = oddsX - (nameX + textWidth(slime.n) + 6) - 4;
                while (who && textWidth(who + (more ? ` +${more}` : ""), NAME_SIZE) > space) { more++; who = backers.slice(0, backers.length - more).join(", "); }
                if (backers.length) text(who + (more ? `${who ? " " : ""}+${more}` : ""), nameX + textWidth(slime.n) + 6, y + 7, AP.ASH, this.board, NAME_SIZE);
                this.lanes[i].cursor = "pointer";
            }
            else this.lanes[i].cursor = "default";
            // its place, as it crosses the line, clear of the slime past it (its middle 4 past the line, 8 each side)
            const place = room.r == RacePhase.DONE ? room.o.indexOf(i) : room.r == RacePhase.RUNNING && room.f[i] <= this.ms ? room.f.filter((f) => f < room.f[i]).length : -1;
            if (place >= 0) text(`${place + 1}`, FINISH_X + 14, y + 5, place == 0 ? AP.STRAW : AP.WHITE, this.board);
        });
        this.crossed = room.r == RacePhase.RUNNING ? room.f.filter((f) => f <= this.ms).length : 0;

        // the lane under the pointer: what it pays, and who's backed it
        const hovered = this.hover >= 0 ? room.l[this.hover] : null;
        if (hovered) {
            const backers = room.b.filter(([, s]) => s == this.hover).map(([n]) => n);
            const lines = [hovered.n, `Odds ${oddsText(hovered.o)}: pays ${g(Math.floor(room.a * hovered.o / 10))}`];
            if (backers.length) lines.push(`Backed by ${backers.length == 1 ? backers[0] : `${backers.length} players`}`);
            if (betting) lines.push(mine == this.hover ? "Your bet" : mine >= 0 ? "Click to switch your bet" : `Click to bet ${g(room.a)}`);
            this.tip.show(lines, { global: this.pointer } as PIXI.FederatedPointerEvent);
        }
        else if (this.hover >= 0) this.tip.hide();

        // how it's going (or what couldn't be)
        let status = "", tint = AP.PALE;
        if (room.r == RacePhase.IDLE) status = "Waiting for the next race";
        else if (betting) { status = `Betting closes in ${this.shownSecs}`; tint = this.left < RACE_BET_MS / 5 ? AP.AMBER : AP.LIME; }
        else if (room.r == RacePhase.RUNNING) status = mine >= 0 ? `Go, ${room.l[mine].n}!` : "They're off!";
        else {
            const winner = room.l[room.o[0]], won = room.p.find(([n]) => n == me)?.[1];
            if (won) { status = `You win ${g(won)}`; tint = AP.LIME; }
            else { status = `${winner.n} wins`; tint = mine >= 0 ? AP.STONE : AP.STRAW; }
        }
        if (this.refused) { status = this.refused; tint = AP.STRAW; }
        right(status, H - 12, tint);
        if (betting && mine < 0) right("Click a slime to bet", H - 22, AP.STONE);
    }

    // how far along slime i is now (0 to 1)
    private along(i: number) {
        const room = this.room;
        if (room.r != RacePhase.RUNNING && room.r != RacePhase.DONE) return 0;
        return raceAt(room.k[i], room.f[i], room.r == RacePhase.DONE ? Math.max(this.ms, room.f[i]) : this.ms);
    }

    // where slime i's middle is, and how far it's hopped up: sitting at the start (betting), hopping along, or past
    // the line (the winner, once it's won, bouncing for joy)
    private runnerAt(i: number) {
        const { TOP, LANE, START_X, FINISH_X } = SlimeRace, room = this.room;
        const y = TOP + (i + 1) * LANE - 2;
        const run = room.r == RacePhase.RUNNING || room.r == RacePhase.DONE;
        if (!run) return { x: START_X, y, up: 0, frame: Math.floor((this.ms + i * 170) / 600) % 4 == 3 ? 2 : 0 };
        const ms = room.r == RacePhase.DONE ? Math.max(this.ms, room.f[i]) : this.ms, time = room.f[i];
        const x = START_X + (FINISH_X + 4 - START_X) * this.along(i);
        if (ms >= time) {
            if (room.r != RacePhase.DONE || room.o[0] != i) return { x, y, up: 0, frame: Math.floor((ms - time) / 400) % 2 ? 2 : 0 };
            return { x, y, ...SlimeRace.hop(ms, 520, 9) };
        }
        return { x, y, ...SlimeRace.hop(ms + i * 97, 360 + i * 23, 5) };
    }

    // a hop `period` ms long, `high` px: in the air most of it (stretched rising, sitting falling), squashed as it lands
    private static hop(ms: number, period: number, high: number) {
        const t = (ms % period) / period;
        if (t >= 0.75) return { up: 0, frame: 2 };
        return { up: Math.round(Math.sin(Math.PI * t / 0.75) * high), frame: t < 0.35 ? 1 : 0 };
    }

    // the slimes where they are now, a shadow under each and its goo trail behind it, streaks behind one surging,
    // a splat as one lands, the leader crowned, yours marked over its head (once betting's closed)
    private drawRunners(deltaTime: number) {
        const { START_X } = SlimeRace, room = this.room, slimes = room && room.r != RacePhase.IDLE ? room.l : [];
        const mine = room?.b.find(([n]) => n == IBC.data.player.name)?.[1] ?? -1, running = room?.r == RacePhase.RUNNING;
        const crowned = !room ? -1 : room.r == RacePhase.DONE ? room.o[0] : running && this.ms > 600 ? this.leader : -1;
        this.mark.visible = this.crown.visible = false;
        this.trails.clear();
        this.sprites.forEach((sprite, i) => {
            const slime = slimes[i], shadow = this.shadows[i];
            sprite.visible = shadow.visible = !!slime;
            if (!slime) return;
            const { x, y, up, frame } = this.runnerAt(i), [light, mid, dark] = SLIME_HUES[slime.c];
            if (room.r != RacePhase.BETTING && x > START_X + 10) this.trails.beginFill(dark, 0.5).drawRect(START_X + 6, y - 1, x - START_X - 12, 1).endFill()
                .beginFill(mid, 0.35).drawRect(START_X + 6, y - 2, x - START_X - 12, 1).endFill();
            if (running && this.ms < room.f[i]) {
                const now = this.along(i), soon = raceAt(room.k[i], room.f[i], this.ms + 80);
                if ((soon - now) / 80 > 1.4 / room.f[i]) for (let k = 0; k < 3; k++)       // (a surge: faster than its pace by half again)
                    this.trails.beginFill(AP.WHITE, 0.7).drawRect(Math.round(x - 11 - k * 2 - (this.ms / 40 + k * 3) % 4), y - 3 - up - k * 3, 4 + k % 2, 1).endFill();
                const ground = frame == 2;
                if (ground && !this.landed[i]) {
                    this.specks.burst(x - 2, y - 1, { n: 3, colors: [light, mid], speed: 30, up: 25, spread: Math.PI * 0.9, fall: 200, ms: 350 });
                    this.specks.burst(x - 6, y - 1, { n: 2, colors: [AP.TAN, AP.SAND], speed: 18, angle: Math.PI * 1.1, spread: 0.6, fall: 60, ms: 400 });
                }
                this.landed[i] = ground;
            }
            shadow.clear().beginFill(AP.BLACK, 0.35).drawEllipse(x, y, 6 - up / 2, 1.5).endFill();
            sprite.texture = SlimeRace.pic(`slime${slime.c}:${frame}`, () => slimePic(slime.c, frame));
            sprite.position.set(Math.round(x - SLIME_W / 2), Math.round(y - SLIME_H - up + 1));
            let top = Math.round(y - SLIME_H - up + 2);
            if (i == crowned) {
                this.crown.visible = true;
                this.crown.position.set(Math.round(x) - 1, top);
                top -= 6;
            }
            if (i != mine || room.r == RacePhase.BETTING) return;
            this.mark.visible = true;
            this.mark.position.set(Math.round(x), top - 6);
        });
        // the winner's sparkle
        if (room?.r == RacePhase.DONE && (this.sparkle -= deltaTime) <= 0) {
            this.sparkle = 140;
            const { x, y, up } = this.runnerAt(room.o[0]);
            this.specks.burst(x + (Math.random() - 0.5) * 16, y - 6 - up - Math.random() * 8, { n: 1, colors: [AP.WHITE, AP.STRAW], speed: 6, fall: 0, ms: 500 });
        }
    }

    //#endregion

    //#region the show

    // what changed from `was` to `now`: a new race (all set again), your bet taken (your stake off your lane), the
    // off (GO), and the result (the banner, the fanfare, and what you won off your slime)
    private changed(was: RaceState, now: RaceState) {
        const me = IBC.data.player.name, { TOP, LANE, START_X, FINISH_X } = SlimeRace;
        if (!was || was.i != now.i || now.r == RacePhase.BETTING && was.r != RacePhase.BETTING) {
            this.leader = -1;
            this.cheered = now.r == RacePhase.RUNNING ? now.f.filter((f) => f <= now.x).length : now.r == RacePhase.DONE ? now.l.length : 0;
            this.landed = [];
            this.banner.visible = false;
        }
        if (!was || was.i != now.i) return;
        const before = was.b.find(([n]) => n == me), after = now.b.find(([n]) => n == me);
        if (!before && after && now.r == RacePhase.BETTING) {
            this.float(`-${now.a.toLocaleString("en-US")}`, START_X, TOP + after[1] * LANE, AP.FLAME);
            RaceSounds.bet();
        }
        else if (before && after && before[1] != after[1]) RaceSounds.bet();
        if (was.r == RacePhase.BETTING && now.r == RacePhase.RUNNING) {     // GO: the track shakes, dust off every slime
            RaceSounds.go();
            this.shake = 300;
            now.l.forEach((_, i) => this.specks.burst(START_X - 4, TOP + (i + 1) * LANE - 3, { n: 6, colors: [AP.TAN, AP.SAND, AP.CREAM], speed: 35, angle: Math.PI, spread: 1.2, fall: 40, ms: 600 }));
        }
        if (was.r != RacePhase.DONE && now.r == RacePhase.DONE) {
            const won = now.p.find(([n]) => n == me)?.[1];
            this.showBanner(now, won);
            RaceSounds.win(!!won);
            if (won && after) {
                const y = TOP + (after[1] + 1) * LANE - 8;
                this.float(`+${won.toLocaleString("en-US")}`, FINISH_X - 8, TOP + after[1] * LANE, AP.LIME);
                this.specks.burst(FINISH_X, y, { n: 36, colors: COINS, speed: 60, up: 90, fall: 220, ms: 1500, size: 2 });
            }
        }
    }

    // each frame: the crowd, the barriers, the callout, crossings celebrated, the banner, the flash and the shake
    private show(deltaTime: number) {
        const { TRACK_X, FINISH_X, TOP, LIFT_MS, GO_MS, POP_MS, BANNER_MS, PHOTO_MS } = SlimeRace, room = this.room;
        const phase = room?.r ?? RacePhase.IDLE, ms = this.ms;

        // the crowd: sitting, stirring in the countdown, jumping through the race, wild at the end
        const beat = phase == RacePhase.RUNNING ? 220 : phase == RacePhase.DONE ? 120 : phase == RacePhase.BETTING && this.left < 3000 ? 420 : 0;
        const frame = beat ? 1 + Math.floor(ms / beat) % 2 : 0;
        this.crowd.texture = SlimeRace.pic(`crowd${frame}`, () => crowdPic(SlimeRace.TRACK_W, TOP, frame, FINISH_X));

        // the barriers: down while betting's open, lifting away at GO
        this.gates.visible = phase == RacePhase.BETTING || phase == RacePhase.RUNNING && ms < LIFT_MS;
        const lift = phase == RacePhase.RUNNING ? Math.min(1, ms / LIFT_MS) : 0;
        this.gates.y = -Math.round(lift * lift * 140);
        this.gates.alpha = 1 - lift * 0.6;

        // the leader, and the callout
        if (phase == RacePhase.RUNNING) {
            let best = -1, lead = this.leader;
            room.l.forEach((_, i) => { const a = this.along(i); if (a > best + 0.002) { best = a; lead = i; } });
            if (lead != this.leader && (this.leader < 0 || ms - this.leadSince > 900)) {
                if (this.leader >= 0 && ms > GO_MS) RaceSounds.lead();
                this.leader = lead;
                this.leadSince = ms;
            }
        }
        this.setCallout(...this.calloutNow());
        this.calloutAt += deltaTime;
        this.callout.scale.set(1 + 0.6 * Math.max(0, 1 - this.calloutAt / POP_MS));

        // each crossing: confetti off the post for the winner (a roar), a white flash if the second's close behind
        if (phase == RacePhase.RUNNING) {
            const order = room.l.map((_, i) => i).sort((a, b) => room.f[a] - room.f[b]);
            while (this.cheered < order.length && room.f[order[this.cheered]] <= ms) {
                if (this.cheered == 0) {
                    this.specks.burst(FINISH_X + 4, 4, { n: 50, colors: CONFETTI, speed: 80, up: 40, fall: 70, ms: 2200 });
                    this.specks.burst(FINISH_X + 2, TOP + 50, { n: 25, colors: CONFETTI, speed: 70, angle: -Math.PI * 0.6, spread: 1.4, up: 30, fall: 90, ms: 1800 });
                    RaceSounds.finish();
                }
                if (this.cheered == 1 && room.f[order[1]] - room.f[order[0]] < PHOTO_MS) {
                    this.flashAt = 0;
                    this.shake = 200;
                    RaceSounds.photo();
                }
                this.cheered++;
            }
        }

        // the banner popping in (overshooting a little, then settling)
        if (this.banner.visible) {
            const t = Math.min(1, (this.bannerAt += deltaTime) / BANNER_MS);
            this.banner.scale.set(Math.max(0.05, t < 0.6 ? t / 0.6 * 1.15 : 1.15 - (t - 0.6) / 0.4 * 0.15));
        }

        // the flash, fading; the shake, a px each way
        this.flash.visible = (this.flashAt += deltaTime) < 300;
        this.flash.alpha = 0.8 * (1 - this.flashAt / 300);
        this.shake = Math.max(0, this.shake - deltaTime);
        this.track.position.set(TRACK_X + (this.shake ? Math.round(Math.random() * 2 - 1) : 0), this.shake ? Math.round(Math.random() * 2 - 1) : 0);
    }

    // what the callout says now: [what, tint, size (32 or a big 64)]
    private calloutNow(): [string, number, number] {
        const room = this.room, { GO_MS, PHOTO_MS } = SlimeRace;
        if (!room || room.r == RacePhase.IDLE) return ["", 0, 32];
        if (room.r == RacePhase.BETTING) {
            const secs = Math.ceil(this.left / 1000);
            return secs <= 3 ? [`${Math.max(1, secs)}`, secs == 1 ? AP.FLAME : AP.STRAW, 64] : ["Place your bets!", AP.STRAW, 32];
        }
        if (room.r == RacePhase.RUNNING && this.ms < GO_MS) return ["GO!", AP.LIME, 64];
        const order = room.l.map((_, i) => i).sort((a, b) => room.f[a] - room.f[b]), first = room.l[order[0]];
        if (room.r == RacePhase.DONE || room.f[order[0]] <= this.ms) {
            if (room.f[order[1]] - room.f[order[0]] < PHOTO_MS && (room.r == RacePhase.DONE || this.ms < room.f[order[1]] + 1500)) return ["Photo finish!", AP.WHITE, 32];
            return [`${first.n} wins!`, AP.STRAW, 32];
        }
        if (this.leader < 0) return ["They're off!", AP.WHITE, 32];
        const fresh = this.ms - this.leadSince < 1500 && this.leadSince > GO_MS;
        return [fresh ? `${room.l[this.leader].n} takes the lead!` : `${room.l[this.leader].n} leads`, fresh ? AP.LIME : AP.WHITE, 32];
    }

    // the callout drawn again if it's changed (popping in), on a dark plate over the stands
    private setCallout(s: string, tint: number, size: number) {
        const key = `${s}:${tint}:${size}`;
        if (key == this.calledOut) return;
        this.calledOut = key;
        this.calloutAt = 0;
        this.callout.removeChildren().forEach((c) => c.destroy({ children: true }));
        if (!s) return;
        const w = textWidth(s, size), h = size / 32 * 7 + 4;
        this.callout.addChild(new PIXI.Graphics().beginFill(AP.BLACK, 0.75).drawRect(-w / 2 - 4, -h / 2, w + 8, h).endFill());
        text(s, Math.round(-w / 2) + size / 32, Math.round(-h / 2) + 2 + size / 32, AP.BLACK, this.callout, size);
        text(s, Math.round(-w / 2), Math.round(-h / 2) + 2, tint, this.callout, size);
    }

    // the winner's banner over the middle lanes: "<NAME> WINS!" (big if it fits), its odds, and how you did
    private showBanner(room: RaceState, won: number) {
        const winner = room.l[room.o[0]], mine = room.b.find(([n]) => n == IBC.data.player.name)?.[1] ?? -1;
        this.banner.removeChildren().forEach((c) => c.destroy({ children: true }));
        const title = `${winner.n.toUpperCase()} WINS!`, size = textWidth(title, 64) <= SlimeRace.BANNER_W ? 64 : 32;
        const lines: [string, number, number][] = [[title, AP.STRAW, size], [`at ${oddsText(winner.o)}`, AP.WHITE, 32]];
        if (won) lines.push([`You win ${won.toLocaleString("en-US")}!`, AP.LIME, 32]);
        else if (mine >= 0) lines.push(["Better luck next race", AP.STONE, 32]);
        const w = Math.max(...lines.map(([s, , z]) => textWidth(s, z))) + 20, h = lines.reduce((a, [, , z]) => a + z / 32 * 7 + 4, 0) + 10;
        const [light, mid] = SLIME_HUES[winner.c];
        this.banner.addChild(new PIXI.Graphics()
            .beginFill(AP.BLACK).drawRect(-w / 2 - 2, -h / 2 - 2, w + 4, h + 4).endFill()
            .beginFill(AP.AMBER).drawRect(-w / 2 - 1, -h / 2 - 1, w + 2, h + 2).endFill()
            .beginFill(AP.INK).drawRect(-w / 2, -h / 2, w, h).endFill()
            .beginFill(mid).drawRect(-w / 2, -h / 2, w, 2).drawRect(-w / 2, h / 2 - 2, w, 2).endFill()
            .beginFill(light).drawRect(-w / 2, -h / 2, w, 1).endFill());
        let y = -h / 2 + 6;
        for (const [s, tint, z] of lines) {
            const x = Math.round(-textWidth(s, z) / 2);
            text(s, x + z / 32, Math.round(y) + z / 32, AP.BLACK, this.banner, z);
            text(s, x, Math.round(y), tint, this.banner, z);
            y += z / 32 * 7 + 4;
        }
        this.banner.visible = true;
        this.bannerAt = 0;
        this.banner.scale.set(0.05);
    }

    // gold paid or won, centred on x, rising off y and fading
    private float(s: string, x: number, y: number, tint: number) {
        const shown = new PIXI.Container();
        text(s, 1, 1, AP.BLACK, shown);
        text(s, 0, 0, tint, shown);
        this.fx.addChild(shown);
        this.floats.push({ shown, x: Math.round(x - textWidth(s) / 2), y, at: 0 });
    }

    private stepFloats(deltaTime: number) {
        this.floats = this.floats.filter((f) => {
            f.at += deltaTime;
            const t = f.at / SlimeRace.FLOAT_MS;
            if (t >= 1) { f.shown.destroy({ children: true }); return false; }
            f.shown.position.set(f.x, Math.round(f.y - 14 * t));
            f.shown.alpha = t < 0.5 ? 1 : 2 - t * 2;
            return true;
        });
    }

    //#endregion

}
