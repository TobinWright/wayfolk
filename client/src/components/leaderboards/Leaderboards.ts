import * as PIXI from "pixi.js";
import { JOBS, SKILL_NAMES } from "../../../../shared/Heroes";
import { Board, BoardRow, BoardView, boardName, boardSkill, isHeroBoard, SKILL_BOARD } from "../../../../shared/Leaderboards";
import { hash, Pic } from "../../art/Backdrops";
import { cardsIcon, heroesIcon, seasonIcon, skillIcon, skillsIcon, wealthIcon } from "../../art/BoardIcons";
import { seasonAt, seasonName, SEASON_TAKE_PART, SEASON_TITLED, SEASON_GUILDS, DEED_NAMES, DEED_POINTS } from "../../../../shared/Seasons";
import { coinIcon, crownIcon, SMALL_ICON } from "../../art/MenuIcons";
import { taskIcon } from "../../art/TaskIcons";
import { Event } from "../../constants/Events";
import { AP } from "../../constants/Palette";
import { IBC } from "../../Engine";
import { Facing } from "../../people/AvatarArt";
import { personTexture, picTexture, shadowTexture } from "../../people/People";
import { Panel } from "../../shared/Panel";
import { Hint } from "../../shared/ui/Hint";
import { TitleBar } from "../../shared/ui/titlebar/TitleBar";
import { BaseComponent, ComponentType } from "../BaseComponent";
import { Chat } from "../chat/Chat";
import { text, textWidth } from "../games/GameUI";

// The leaderboards (shared/Leaderboards.ts), from the other menu. Along the
// top a tab each - Heroes (by all their skills), Skills (a row of the skills
// under it, one picked), Wealth, Events and Blackjack - and under them what
// the board's ranked by. Then the top three on a podium under the night sky,
// the first crowned and hopping now and then; under it everyone else on the
// top 100, a row each (yours lit), the wheel scrolling them; along the
// bottom where you stand (clicked: the list to your row). Pointing at a row
// or a place on the podium says more. Each board's asked for as it's picked
// and again every REFRESH_MS while it's shown. A window like the others
// (Panel and TitleBar); Escape or its cross closes it.

enum Tab { HEROES, SKILLS, WEALTH, EVENTS, BLACKJACK, SEASON }
const TABS = [
    { name: "Heroes", icon: heroesIcon, about: "Every hero, by all their skills' levels together" },
    { name: "Skills", icon: skillsIcon, about: "" },
    { name: "Wealth", icon: wealthIcon, about: "Players by the gold in their stash" },
    { name: "Events", icon: () => taskIcon("events"), about: "Players by the points they've given to events" },
    { name: "Blackjack", icon: cardsIcon, about: "Players by their winnings at the blackjack tables" },
    { name: "Season", icon: seasonIcon, about: "" },
];

// a podium place's colours, first to third: its top, front, side, number, name
const PLACES = [
    { top: AP.STRAW, face: AP.AMBER, side: AP.OCHRE, mark: AP.OCHRE, tint: AP.STRAW, h: 30 },
    { top: AP.WHITE, face: AP.MIST, side: AP.STONE, mark: AP.STEEL, tint: AP.MIST, h: 22 },
    { top: AP.SAND, face: AP.CLAY, side: AP.UMBER, mark: AP.BARK, tint: AP.TAN, h: 16 },
];

interface Twinkle { g: PIXI.Graphics; phase: number; speed: number; }
interface Sparkle { g: PIXI.Graphics; at: number; }

export class Leaderboards extends BaseComponent {

    public static SCALE = 2;
    public static W = 316;              // the content, in its own px
    public static H = 262;
    public static TAB_H = 14;
    public static SUB_Y = 17;           // the skills, or what the board's ranked by
    public static STAGE_Y = 32;         // the podium
    public static STAGE_H = 100;
    public static FLOOR = 68;           // (in the stage: where the podium stands)
    public static HEAD_Y = 135;         // the list's headings
    public static LIST_Y = 145;
    public static ROW = 11;
    public static ROWS = 9;             // shown at once
    public static YOU_Y = 247;          // where you stand
    public static INSET_X = 12;         // the window round it, in screen px
    public static INSET_Y = 28;
    public static WIDTH = Leaderboards.INSET_X * 2 + Leaderboards.W * Leaderboards.SCALE;
    public static HEIGHT = Leaderboards.INSET_Y + Leaderboards.H * Leaderboards.SCALE + Leaderboards.INSET_X;
    public static REFRESH_MS = 60000;
    public static RISE_MS = 450;        // the podium coming up, a place
    public static HOP_MS = 3200;        // the first's hops, this far apart

    // (kept from one opening to the next)
    private static tab = Tab.HEROES;
    private static skill = 0;

    public background: Panel;
    public titleBar: TitleBar;
    private content: PIXI.Container;
    private tabs = new PIXI.Container();
    private sub = new PIXI.Container();
    private stage = new PIXI.Container();
    private heads = new PIXI.Container();
    private list = new PIXI.Container();
    private bar = new PIXI.Container();
    private you = new PIXI.Container();
    private textures = new Map<string, PIXI.Texture>();

    private views = new Map<number, BoardView>();
    private asked = new Map<number, number>();      // (board: when it was last asked for)
    private scroll = 0;
    private listH = 0;
    private time = 0;
    private risingFrom = -1;            // (when the podium started coming up; -1 up already)
    private shownAt = 0;                // (when the board shown was worked out: "updated" counts from it)
    private updated: PIXI.BitmapText;
    private updatedSaid = "";

    // the podium's moving parts
    private places: PIXI.Container[] = [];
    private hopper: PIXI.Sprite;
    private crown: PIXI.Sprite;
    private twinkles: Twinkle[] = [];
    private sparkles: Sparkle[] = [];

    private keys = (e: KeyboardEvent) => { if (e.key == "Escape" && !Chat.takes(e)) IBC.comp.destroy(this); };

    constructor() {
        super(ComponentType.LEADERBOARDS);
        this.create();
    }

    // the window (one open at a time), its board asked for if it's not been for a while
    public static open() {
        const view = IBC.comp.getOrCreate(ComponentType.LEADERBOARDS) as Leaderboards;
        view.bringToTop();
        view.ask(false);
    }

    public create() {
        super.create();
        const { W, WIDTH, HEIGHT, SCALE, LIST_Y, ROW, ROWS } = Leaderboards;
        this.container.eventMode = "static";
        this.container.hitArea = new PIXI.Rectangle(0, 0, WIDTH, HEIGHT);
        this.container.on("pointerdown", (e: PIXI.FederatedPointerEvent) => e.stopPropagation());
        this.container.on("wheel", (e: PIXI.FederatedWheelEvent) => {
            e.stopPropagation();
            this.scroll += e.deltaY < 0 ? -ROW * 2 : ROW * 2;
            this.placeList();
        });

        this.background = new Panel(this.container);
        this.background.setSize(WIDTH, HEIGHT);
        this.titleBar = new TitleBar(this);
        this.titleBar.setPosition(4, 4);
        this.titleBar.setSize(WIDTH - 8, 20);
        this.titleBar.setTitle("Leaderboards");

        this.content = new PIXI.Container();
        this.content.scale.set(SCALE);
        this.content.position.set(Leaderboards.INSET_X, Leaderboards.INSET_Y);
        this.container.addChild(this.content);

        this.sub.y = Leaderboards.SUB_Y;
        this.stage.y = Leaderboards.STAGE_Y;
        this.heads.y = Leaderboards.HEAD_Y;
        this.you.y = Leaderboards.YOU_Y;
        const listBox = new PIXI.Graphics()
            .beginFill(AP.BLACK).drawRect(0, LIST_Y - 1, W, ROWS * ROW + 2).endFill()
            .beginFill(AP.INK).drawRect(1, LIST_Y, W - 2, ROWS * ROW).endFill();
        const listMask = new PIXI.Graphics().beginFill(0xffffff).drawRect(1, LIST_Y, W - 2, ROWS * ROW).endFill();
        this.list.mask = listMask;
        this.content.addChild(this.tabs, this.sub, this.stage, this.heads, listBox, listMask, this.list, this.bar, this.you);

        window.addEventListener("keydown", this.keys);
        IBC.events.register(Event.LEADER_BOARD, (view: BoardView) => this.onView(view), this);
        IBC.events.register(Event.SEASON, () => { if (Leaderboards.tab == Tab.SEASON) this.drawSub(); }, this);

        this.setPosition(Math.round((window.innerWidth - WIDTH) / 2), Math.round((window.innerHeight - HEIGHT) / 2));
        this.pick(Leaderboards.tab, Leaderboards.skill);
    }

    public destroy() {
        super.destroy();
        window.removeEventListener("keydown", this.keys);
        Hint.hide();
        this.titleBar.destroy();
        this.background.destroy();
        this.container.destroy({ children: true });
        this.textures.forEach((t) => t.destroy(true));
    }

    public update(deltaTime: number) {
        this.time += deltaTime;
        if (this.time - (this.asked.get(this.board) ?? 0) >= Leaderboards.REFRESH_MS) this.ask(true);
        this.animate();
        if (this.updated && this.shownAt) {
            const said = `updated ${ago(this.shownAt)}`;
            if (said != this.updatedSaid) {
                this.updatedSaid = this.updated.text = said;
                this.updated.x = Leaderboards.W - 4 - textWidth(said);
            }
        }
    }

    //#region picking and asking

    private get board() {
        const tab = Leaderboards.tab;
        switch (tab) {
            case Tab.HEROES: return Board.LEVEL;
            case Tab.SKILLS: return SKILL_BOARD + Leaderboards.skill;
            case Tab.WEALTH: return Board.WEALTH;
            case Tab.EVENTS: return Board.EVENTS;
            case Tab.BLACKJACK: return Board.BLACKJACK;
            case Tab.SEASON: return Board.SEASON;
        }
    }

    private pick(tab: Tab, skill: number) {
        Leaderboards.tab = tab;
        Leaderboards.skill = skill;
        this.scroll = 0;
        this.risingFrom = this.views.has(this.board) ? this.time : -1;
        this.drawTabs();
        this.drawSub();
        this.draw();
        this.ask(false);
    }

    // the board shown asked for (again, if `fresh` or it's not been for a while)
    private ask(fresh: boolean) {
        const b = this.board, at = this.asked.get(b);
        if (!fresh && at != undefined && this.time - at < Leaderboards.REFRESH_MS) return;
        this.asked.set(b, this.time);
        IBC.net.leaderboard.board(b);
    }

    private onView(view: BoardView) {
        const first = !this.views.has(view.b);
        this.views.set(view.b, view);
        if (view.b != this.board) return;
        if (first) this.risingFrom = this.time;
        this.draw();
    }

    //#endregion

    //#region the tabs, and under them

    private drawTabs() {
        const { W, TAB_H } = Leaderboards;
        clear(this.tabs);
        const widths = TABS.map((t) => 4 + 10 + 3 + textWidth(t.name) + 5);
        const gap = Math.floor((W - widths.reduce((a, w) => a + w, 0)) / (TABS.length - 1));
        let x = 0;
        TABS.forEach((t, k) => {
            const on = k == Leaderboards.tab, w = k == TABS.length - 1 ? W - x : widths[k];
            const tab = new PIXI.Container();
            tab.position.set(x, 0);
            const back = new PIXI.Graphics();
            const paint = (lit: boolean) => back.clear()
                .beginFill(on ? AP.STRAW : AP.BLACK).drawRect(0, 0, w, TAB_H).endFill()
                .beginFill(on ? AP.IRON : lit ? AP.IRON : AP.SLATE).drawRect(1, 1, w - 2, TAB_H - 2).endFill()
                .beginFill(on ? AP.STEEL : AP.IRON, on || lit ? 1 : 0.5).drawRect(1, 1, w - 2, 1).endFill();
            paint(false);
            tab.addChild(back);
            const icon = new PIXI.Sprite(t.icon());
            icon.position.set(4, 2);
            tab.addChild(icon);
            text(t.name, 17, 3, on ? AP.WHITE : AP.ASH, tab);
            this.clickable(tab, w, TAB_H, () => { if (!on) this.pick(k, Leaderboards.skill); }, paint);
            this.tabs.addChild(tab);
            x += w + gap;
        });
    }

    // the season's tab: which season, how long left, and your title (clicked: the next of yours)
    private drawSeason() {
        const { W } = Leaderboards, season = seasonAt(Date.now()), data = IBC.data.season;
        const left = Math.max(0, season.e - Date.now()), days = Math.floor(left / 86400000), hours = Math.floor(left / 3600000) % 24;
        const name = text(`${seasonName(season.n)}: ${days}d ${hours}h left`, 1, 2, AP.STRAW, this.sub);
        name.eventMode = "static";
        const points = DEED_NAMES.map((n, d) => `${n.toLowerCase()} ${DEED_POINTS[d]}`).join(", ");
        Hint.on(name, `Points for ${points}. As it ends: the top ${SEASON_TITLED} a title, everyone with ${SEASON_TAKE_PART} points its backdrop, the top ${SEASON_GUILDS} guilds' members a guild title`);
        const titles = data.state.t, shown = data.title;
        const label = titles.length ? `Title: ${shown ?? "none"}` : "No titles yet";
        const t = text(label, 0, 2, titles.length ? (shown ? AP.LIME : AP.ASH) : AP.IRON, this.sub);
        t.x = W - Math.ceil(t.textWidth) - 1;
        t.eventMode = "static";
        if (titles.length) {
            t.cursor = "pointer";
            // (none, then each of them in turn)
            t.on("pointertap", () => IBC.net.season.pickTitle(data.state.h + 1 >= titles.length ? -1 : data.state.h + 1));
            Hint.on(t, `Shown by your name in the chat. Click for the next of your ${titles.length} title${titles.length == 1 ? "" : "s"}`);
        } else Hint.on(t, `Finish a season in its top ${SEASON_TITLED}, or in one of its top ${SEASON_GUILDS} guilds, for a title`);
    }

    // the skills (their tab), or what the board's ranked by
    private drawSub() {
        clear(this.sub);
        if (Leaderboards.tab == Tab.SEASON) return this.drawSeason();
        if (Leaderboards.tab != Tab.SKILLS) {
            text(TABS[Leaderboards.tab].about, 1, 2, AP.STONE, this.sub);
            return;
        }
        const S = 12;
        const label = text("", 0, 2, AP.STRAW, this.sub);
        const named = (k: number) => { label.text = SKILL_NAMES[k]; };
        const resting = () => named(Leaderboards.skill);
        SKILL_NAMES.forEach((_, k) => {
            const on = k == Leaderboards.skill;
            const b = new PIXI.Container();
            b.position.set(k * (S + 1), 0);
            const back = new PIXI.Graphics();
            const paint = (lit: boolean) => back.clear()
                .beginFill(on ? AP.STRAW : AP.BLACK).drawRect(0, 0, S, S).endFill()
                .beginFill(on || lit ? AP.IRON : AP.SLATE).drawRect(1, 1, S - 2, S - 2).endFill();
            paint(false);
            b.addChild(back);
            const icon = new PIXI.Sprite(skillIcon(k));
            icon.position.set(1, 1);
            b.addChild(icon);
            this.clickable(b, S, S, () => { if (!on) this.pick(Tab.SKILLS, k); }, (lit) => { paint(lit); lit ? named(k) : resting(); });
            this.sub.addChild(b);
        });
        label.x = SKILL_NAMES.length * (S + 1) + 4;
        resting();
        const about = text("by XP", 0, 2, AP.IRON, this.sub);
        about.x = Leaderboards.W - 1 - textWidth("by XP");
    }

    //#endregion

    //#region the board

    private draw() {
        const view = this.views.get(this.board);
        this.drawStage(view);
        this.drawHeads();
        this.drawList(view);
        this.drawYou(view);
    }

    // the night sky, spotlights, the podium and the three on it
    private drawStage(view: BoardView) {
        const { W, STAGE_H, FLOOR } = Leaderboards;
        clear(this.stage);
        this.places = [];
        this.twinkles = [];
        this.sparkles = [];
        this.hopper = this.crown = null;

        const sky = new PIXI.Graphics();
        sky.beginFill(AP.BLACK).drawRect(0, 0, W, STAGE_H).endFill();
        const bands = [AP.MIDNIGHT, AP.NAVY, AP.NAVY, AP.SHADOW, AP.SHADOW, AP.INK];
        const bandH = (STAGE_H - 2) / bands.length;
        bands.forEach((c, k) => sky.beginFill(c).drawRect(1, 1 + Math.round(k * bandH), W - 2, Math.ceil(bandH)).endFill());
        this.stage.addChild(sky);
        const mask = new PIXI.Graphics().beginFill(0xffffff).drawRect(1, 1, W - 2, STAGE_H - 2).endFill();
        const inside = new PIXI.Container();
        inside.mask = mask;
        this.stage.addChild(mask, inside);

        // stars, twinkling
        for (let k = 0; k < 26; k++) {
            const x = 3 + Math.floor(hash(k, 11) * (W - 6)), y = 14 + Math.floor(hash(k, 23) * 30);
            const c = [AP.FOAM, AP.MIST, AP.STRAW, AP.ICE][Math.floor(hash(k, 5) * 4)];
            const g = new PIXI.Graphics().beginFill(c).drawRect(x, y, 1, 1).endFill();
            if (hash(k, 7) > 0.8) g.beginFill(c, 0.5).drawRect(x - 1, y, 1, 1).drawRect(x + 1, y, 1, 1).drawRect(x, y - 1, 1, 1).drawRect(x, y + 1, 1, 1).endFill();
            inside.addChild(g);
            this.twinkles.push({ g, phase: hash(k, 3) * Math.PI * 2, speed: 0.6 + hash(k, 9) * 1.6 });
        }

        // the floor, and a spotlight on each place
        const centres = [W / 2, W / 2 - 90, W / 2 + 90];
        const light = new PIXI.Graphics();
        centres.forEach((cx, k) => {
            light.beginFill(k == 0 ? AP.STRAW : AP.FOAM, k == 0 ? 0.09 : 0.05)
                .drawPolygon([cx - 6, 0, cx + 6, 0, cx + 34, FLOOR, cx - 34, FLOOR]).endFill();
        });
        inside.addChild(light);
        inside.addChild(new PIXI.Graphics()
            .beginFill(AP.SLATE).drawRect(0, FLOOR, W, 1).endFill()
            .beginFill(AP.SHADOW).drawRect(0, FLOOR + 1, W, STAGE_H - FLOOR).endFill());

        // its title and how many are on it, and how long since it was worked out
        const title = text(boardName(this.board), 4, 3, AP.STRAW, inside);
        this.shownAt = view?.t ?? 0;
        this.updatedSaid = "";
        text(view ? `${fmt(view.c)} ranked` : "", 4 + textWidth(title.text) + 6, 3, AP.STONE, inside);
        this.updated = text("", W - 4, 3, AP.STEEL, inside);

        // the places, second and third either side of the first
        for (let k = 0; k < 3; k++) {
            const place = this.place(k, view?.l[k], centres[k]);
            inside.addChild(place);
            this.places.push(place);
        }
        if (!view) text("Loading...", Math.round((W - textWidth("Loading...")) / 2), 26, AP.STONE, inside);
        else if (!view.l.length) text("Nobody's here yet", Math.round((W - textWidth("Nobody's here yet")) / 2), 26, AP.STONE, inside);
        this.animate();
    }

    // a place on the podium (k: 0 first), and who's on it
    private place(k: number, row: BoardRow, cx: number) {
        const { FLOOR } = Leaderboards, P = PLACES[k], BW = 76, x = Math.round(cx - BW / 2), top = FLOOR - P.h;
        const place = new PIXI.Container();
        const block = new PIXI.Graphics();
        block.beginFill(AP.BLACK).drawRect(x - 1, top - 1, BW + 2, P.h + 1).endFill();
        block.beginFill(P.face).drawRect(x, top, BW, P.h).endFill();
        block.beginFill(P.top).drawRect(x, top, BW, 3).endFill();
        block.beginFill(P.side).drawRect(x + BW - 4, top + 3, 4, P.h - 3).endFill();
        block.beginFill(P.side, 0.6).drawRect(x, FLOOR - 2, BW - 4, 2).endFill();
        block.beginFill(AP.WHITE, 0.35).drawRect(x + 1, top + 1, BW - 6, 1).endFill();
        place.addChild(block);
        const n = String(k + 1), nx = Math.round(cx - 2 - textWidth(n) / 2), ny = top + Math.round((P.h + 3) / 2) - 5;
        text(n, nx, ny + 1, P.top, place);
        text(n, nx, ny, P.mark, place);
        if (!row) {
            block.alpha = 0.4;
            place.alpha = 1;
            text("-", Math.round(cx - textWidth("-") / 2), FLOOR + 4, AP.IRON, place);
            return place;
        }

        if (row.l) {
            const shadow = new PIXI.Sprite(shadowTexture());
            shadow.anchor.set(0.5, 0.5);
            shadow.position.set(cx, top);
            const person = new PIXI.Sprite(personTexture(row.l as any, Facing.DOWN, 0));
            person.anchor.set(0.5, 1);
            person.position.set(cx, top + 1);
            place.addChild(shadow, person);
            if (k == 0) {
                this.hopper = person;
                this.crown = new PIXI.Sprite(this.icon("crown", crownIcon));
                this.crown.position.set(Math.round(cx - 4), top - 34);
                place.addChild(this.crown);
                for (let s = 0; s < 4; s++) {
                    const g = new PIXI.Graphics();
                    place.addChild(g);
                    this.sparkles.push({ g, at: -s * 400 });
                }
            }
        }

        const mine = row.i == IBC.data.player.id;
        const name = row.h ?? row.n;
        // (a Supporter's tag: the chat's crown after it)
        const nameText = fit(name, row.s ? 78 : 88), crownW = row.s ? SMALL_ICON + 2 : 0;
        const nameX = Math.round(cx - (textWidth(nameText) + crownW) / 2);
        text(nameText, nameX, FLOOR + 3, mine ? AP.ICE : AP.WHITE, place);
        if (row.s) Chat.crown(nameX + textWidth(nameText) + 2, FLOOR + 2, place);
        const value = this.podiumValue(row);
        text(value.text, Math.round(cx - textWidth(value.text) / 2), FLOOR + 12, value.tint ?? P.tint, place);
        if (row.h) {
            const owner = fit(row.n, 88);
            text(owner, Math.round(cx - textWidth(owner) / 2), FLOOR + 21, AP.STEEL, place);
        }

        const hit = new PIXI.Container();
        hit.eventMode = "static";
        hit.hitArea = new PIXI.Rectangle(x, top - 28, BW, P.h + 28 + 30);
        Hint.on(hit, this.about(row));
        place.addChild(hit);
        return place;
    }

    private drawHeads() {
        const { W } = Leaderboards, hero = isHeroBoard(this.board);
        clear(this.heads);
        this.heads.addChild(new PIXI.Graphics()
            .beginFill(AP.BLACK).drawRect(0, -2, W, 11).endFill()
            .beginFill(AP.SHADOW).drawRect(1, -1, W - 2, 9).endFill());
        text("#", 26 - textWidth("#"), 0, AP.IRON, this.heads);
        text(hero ? "Hero" : "Player", 32, 0, AP.IRON, this.heads);
        if (hero) text("Owner", 160, 0, AP.IRON, this.heads);
        const head = ["Total level", "Gold", "Points", "Net won"][this.board] ?? "Level";
        text(head, W - 8 - textWidth(head), 0, AP.IRON, this.heads);
    }

    // everyone after the podium, a row each
    private drawList(view: BoardView) {
        const { W, ROW, ROWS } = Leaderboards;
        clear(this.list);
        clear(this.bar);
        const rows = view?.l.slice(3) ?? [];
        const say = (s: string, y = ROW + 2) => text(s, Math.round((W - textWidth(s)) / 2), y, AP.IRON, this.list);
        if (!view) say("Loading...");
        else if (!view.l.length) say(this.howToGetOn());
        rows.forEach((row, k) => this.row(row, k));
        if (view?.l.length && rows.length < ROWS - 1) say("That's everyone so far", rows.length * ROW + (rows.length ? 4 : ROW + 2));
        this.listH = rows.length * ROW;

        // the scrollbar, if it scrolls
        if (this.listH > ROWS * ROW) {
            const bar = new PIXI.Graphics().beginFill(AP.SHADOW).drawRect(W - 4, Leaderboards.LIST_Y, 3, ROWS * ROW).endFill();
            const thumb = new PIXI.Graphics().beginFill(AP.STEEL).drawRect(0, 0, 3, Math.max(8, Math.round(ROWS * ROW * ROWS * ROW / this.listH))).endFill();
            thumb.name = "thumb";
            this.bar.addChild(bar, thumb);
        }
        this.placeList();
    }

    private row(row: BoardRow, k: number) {
        const { W, ROW } = Leaderboards, mine = row.i == IBC.data.player.id;
        const r = new PIXI.Container();
        r.y = k * ROW;
        const back = new PIXI.Graphics();
        const paint = (lit: boolean) => {
            back.clear().beginFill(lit ? AP.SLATE : mine ? AP.DENIM : k % 2 ? AP.SHADOW : AP.INK).drawRect(1, 0, W - 2, ROW).endFill();
            if (mine) back.beginFill(AP.ICE).drawRect(1, 0, 2, ROW).endFill();
        };
        paint(false);
        r.addChild(back);
        const rank = String(row.r);
        text(rank, 26 - textWidth(rank), 2, mine ? AP.ICE : AP.STONE, r);
        if (row.h) {
            text(fit(row.h, 124), 32, 2, mine ? AP.WHITE : AP.MIST, r);
            text(fit(row.n, 92), 160, 2, mine ? AP.ICE : AP.STEEL, r);
        } else {
            const name = fit(row.n, 200);
            text(name, 32, 2, mine ? AP.WHITE : AP.MIST, r);
            if (row.s) Chat.crown(32 + textWidth(name) + 3, 1, r);     // (a Supporter's tag)
        }
        this.value(row, W - 8, 2, r);
        r.eventMode = "static";
        r.hitArea = new PIXI.Rectangle(1, 0, W - 2, ROW);
        r.on("pointerover", () => paint(true));
        r.on("pointerout", () => paint(false));
        Hint.on(r, this.about(row));
        this.list.addChild(r);
    }

    // the list where it's scrolled to
    private placeList() {
        const { ROW, ROWS, LIST_Y } = Leaderboards, room = ROWS * ROW;
        this.scroll = Math.max(0, Math.min(this.scroll, this.listH - room));
        this.list.y = LIST_Y - this.scroll;
        const thumb = this.bar.getChildByName("thumb") as PIXI.Graphics;
        if (thumb) thumb.position.set(Leaderboards.W - 4, LIST_Y + Math.round((room - thumb.height) * this.scroll / Math.max(1, this.listH - room)));
    }

    // where you stand (clicked: the list to your row)
    private drawYou(view: BoardView) {
        const { W } = Leaderboards, H = 14;
        clear(this.you);
        const bar = new PIXI.Container();
        this.you.addChild(bar);
        const me = view?.m;
        const back = new PIXI.Graphics();
        const paint = (lit: boolean) => back.clear()
            .beginFill(AP.BLACK).drawRect(0, 0, W, H).endFill()
            .beginFill(lit && me ? AP.COBALT : AP.DENIM).drawRect(1, 1, W - 2, H - 2).endFill()
            .beginFill(AP.ICE).drawRect(1, 1, 2, H - 2).endFill();
        paint(false);
        bar.addChild(back);
        text("You", 7, 3, AP.ICE, bar);
        if (!view) return;
        if (!me) {
            text(this.howToGetOn(), 32, 3, AP.FOAM, bar);
            return;
        }
        const rank = `#${me.r}`;
        text(rank, 32, 3, me.r <= 3 ? PLACES[me.r - 1].tint : AP.WHITE, bar);
        let x = 32 + textWidth(rank) + 6;
        const who = me.h ? `${me.h} (your best)` : me.n;
        text(fit(who, 150), x, 3, AP.WHITE, bar);
        const of = `of ${fmt(view.c)}`;
        const right = this.value(me, W - 8, 3, bar);
        text(of, right - 8 - textWidth(of), 3, AP.SKY, bar);
        this.clickable(bar, W, H, () => this.toMine(me), paint);
    }

    // the list to your row (on the podium: to the top)
    private toMine(me: BoardRow) {
        const view = this.views.get(this.board), k = view?.l.indexOf(view.l.find((r) => r.i == me.i && r.h == me.h && r.v == me.v)) ?? -1;
        this.scroll = k < 3 ? 0 : (k - 3) * Leaderboards.ROW - Math.floor(Leaderboards.ROWS / 2) * Leaderboards.ROW;
        this.placeList();
    }

    private howToGetOn() {
        switch (this.board) {
            case Board.LEVEL: return "Hire a hero to be on it";
            case Board.WEALTH: return "Earn some gold to be on it";
            case Board.EVENTS: return "Join an event to be on it";
            case Board.BLACKJACK: return "Play a hand of blackjack to be on it";
            case Board.SEASON: return "Gather, craft, fight, explore or join an event to be on it";
        }
        return `Train a hero at ${SKILL_NAMES[boardSkill(this.board)]} to be on it`;
    }

    //#endregion

    //#region what's shown of a row

    // a row's value, right-aligned to `right`; where it starts
    private value(row: BoardRow, right: number, y: number, parent: PIXI.Container) {
        if (this.board == Board.WEALTH) {
            const coin = new PIXI.Sprite(this.icon("coin", coinIcon));
            coin.position.set(right - 7, y);
            parent.addChild(coin);
            const s = fmt(row.v);
            text(s, right - 9 - textWidth(s), y, AP.STRAW, parent);
            return right - 9 - textWidth(s);
        }
        let s: string, tint: number = AP.WHITE;
        switch (this.board) {
            case Board.EVENTS: s = fmt(row.v); tint = AP.PINK; break;
            case Board.SEASON: s = fmt(row.v); tint = AP.LIME; break;
            case Board.BLACKJACK: s = signed(row.v); tint = row.v > 0 ? AP.LIME : row.v < 0 ? AP.FLAME : AP.ASH; break;
            default: s = String(row.x); tint = AP.FOAM;
        }
        text(s, right - textWidth(s), y, tint, parent);
        return right - textWidth(s);
    }

    private podiumValue(row: BoardRow): { text: string, tint?: number } {
        switch (this.board) {
            case Board.LEVEL: return { text: `Total ${row.x}` };
            case Board.WEALTH: return { text: `${fmt(row.v)}g` };
            case Board.EVENTS: return { text: `${fmt(row.v)} pts` };
            case Board.SEASON: return { text: `${fmt(row.v)} pts` };
            case Board.BLACKJACK: return { text: `${signed(row.v)}g`, tint: row.v < 0 ? AP.FLAME : undefined };
        }
        return { text: `Level ${row.x}` };
    }

    // pointed at: all about a row
    private about(row: BoardRow) {
        const job = row.j != undefined ? JOBS[row.j]?.name : "";
        switch (this.board) {
            case Board.LEVEL: return `${row.h}, ${job} (${row.n}): total level ${row.x}, ${fmt(row.v)} XP`;
            case Board.WEALTH: return `${row.n}: ${fmt(row.v)} gold`;
            case Board.EVENTS: return `${row.n}${row.s ? ", a Supporter" : ""}: ${fmt(row.v)} points over ${row.x} event${row.x == 1 ? "" : "s"}`;
            case Board.BLACKJACK: return `${row.n}: ${signed(row.v)}g over ${fmt(row.x)} hand${row.x == 1 ? "" : "s"}`;
            case Board.SEASON: return `${row.n}: ${fmt(row.v)} points this season${row.r <= SEASON_TITLED ? " (a title if it ends so)" : ""}`;
        }
        return `${row.h}, ${job} (${row.n}): ${SKILL_NAMES[boardSkill(this.board)]} ${row.x}, ${fmt(row.v)} XP`;
    }

    //#endregion

    //#region moving

    private animate() {
        const t = this.time, { RISE_MS, HOP_MS } = Leaderboards;
        // the podium coming up, third first
        const order = [2, 1, 0];
        this.places.forEach((place, k) => {
            if (this.risingFrom < 0) { place.y = 0; place.alpha = 1; return; }
            const p = Math.max(0, Math.min(1, (t - this.risingFrom - order[k] * 110) / RISE_MS));
            const e = 1 - Math.pow(1 - p, 3);
            place.y = Math.round((1 - e) * 60);
            place.alpha = e;
        });
        if (this.risingFrom >= 0 && t - this.risingFrom > RISE_MS + 3 * 110) this.risingFrom = -1;

        // the first hops now and then, the crown bobbing over them
        if (this.hopper) {
            const h = t % HOP_MS, hop = h < 360 ? Math.round(Math.sin((h / 360) * Math.PI) * 3) : 0;
            const base = Leaderboards.FLOOR - PLACES[0].h + 1;
            this.hopper.y = base - hop;
            if (this.crown) this.crown.y = base - 34 - hop + (Math.sin(t / 380) > 0 ? 0 : 1);
        }
        for (const s of this.twinkles) s.g.alpha = 0.35 + 0.65 * Math.max(0, Math.sin(s.phase + t / 1000 * s.speed));

        // sparkles round the first, each in a new place every time round
        const cx = Leaderboards.W / 2, top = Leaderboards.FLOOR - PLACES[0].h;
        for (const s of this.sparkles) {
            const age = t - s.at;
            if (age < 0) continue;
            if (age > 900) s.at = t + hash(Math.floor(t), 1) * 500;
            const round = Math.floor(s.at);
            const x = Math.round(cx - 20 + hash(round, 2) * 40), y = Math.round(top - 30 + hash(round, 4) * 28);
            const a = Math.sin(Math.min(1, age / 900) * Math.PI);
            s.g.clear().beginFill(AP.STRAW, a * 0.8).drawRect(x - 1, y, 3, 1).drawRect(x, y - 1, 1, 3).endFill()
                .beginFill(AP.WHITE, a).drawRect(x, y, 1, 1).endFill();
        }
    }

    //#endregion

    // a menu icon's texture, made once while the window's open
    private icon(name: string, pic: () => Pic) {
        let t = this.textures.get(name);
        if (!t) this.textures.set(name, t = picTexture(pic()));
        return t;
    }

    // clicked anywhere in w x h; `lit` told as the pointer comes and goes
    private clickable(c: PIXI.Container, w: number, h: number, act: () => void, lit?: (on: boolean) => void) {
        c.eventMode = "static";
        c.cursor = "pointer";
        c.hitArea = new PIXI.Rectangle(0, 0, w, h);
        if (lit) {
            c.on("pointerover", () => lit(true));
            c.on("pointerout", () => lit(false));
        }
        c.on("pointerdown", (e: PIXI.FederatedPointerEvent) => e.stopPropagation());
        c.on("pointertap", act);
    }

}

function clear(c: PIXI.Container) {
    c.removeChildren().forEach((k) => k.destroy({ children: true }));
}

// cut to fit `w` px, ".." on the end if it had to be
function fit(s: string, w: number) {
    if (textWidth(s) <= w) return s;
    while (s && textWidth(s + "..") > w) s = s.slice(0, -1);
    return s.trimEnd() + "..";
}

function fmt(n: number) {
    const a = Math.abs(n);
    if (a >= 10_000_000) return `${(n / 1_000_000).toFixed(0)}M`;
    if (a >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    return Math.round(n).toLocaleString("en-US");
}

function signed(n: number) {
    return n > 0 ? `+${fmt(n)}` : fmt(n);
}

// how long ago, in a word or two
function ago(at: number) {
    const s = Math.max(0, (Date.now() - at) / 1000);
    if (s < 60) return "just now";
    if (s < 3600) return `${Math.floor(s / 60)}m ago`;
    return `${Math.floor(s / 3600)}h ago`;
}
