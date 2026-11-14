import * as PIXI from "pixi.js";
import { barracksSlots, heroSlots, heroStats, JOBS, OFFERS, SKILL_NAMES, skillName, specialtyXp, STAT_NAMES, STAT_SHORT, startTown, TRAITS } from "../../../../shared/Heroes";
import { Constants } from "../../constants/Constants";
import { Event } from "../../constants/Events";
import { AP } from "../../constants/Palette";
import { IBC } from "../../Engine";
import { Facing } from "../../people/AvatarArt";
import { personTexture, shadowTexture } from "../../people/People";
import { Panel } from "../../shared/Panel";
import { TitleBar } from "../../shared/ui/titlebar/TitleBar";
import { BaseComponent, ComponentType } from "../BaseComponent";
import { Chat } from "../chat/Chat";
import { skillIcon } from "../../art/BoardIcons";
import { coinTexture } from "../../art/SightArt";
import { Tip } from "../games/GameUI";
import { fit } from "../heroroster/HeroRoster";

// The hiring board (DESIGN.md "Heroes"), from the main menu: the player's own
// offers, a card each - the hero standing, their name, job, the town they
// start from, stats, the skills they've trained, their traits and price - and
// HIRE. New offers every 4 hours (the countdown at the top), or now for gold
// (Refresh, beside the roster count: rerollPrice); the first hire is free.
// Pointing at a line says more about it in a tooltip. A window like the
// others (Panel and TitleBar): dragged by its title bar, closed by its cross.

interface Offer { d: any; p: number; }

export class HeroBoard extends BaseComponent {

    public static SCALE = 2;
    public static PAD = 4;
    public static CARD_W = 116;
    public static CARD_H = 228;         // (room for the most a hero rolls: a name on two lines, 3 skills, 2 specialties and 3 traits)
    public static GAP = 4;
    public static LINE = 10;
    public static TOP = 14;             // the cards' top
    public static W = HeroBoard.PAD * 2 + OFFERS * HeroBoard.CARD_W + (OFFERS - 1) * HeroBoard.GAP;
    public static H = HeroBoard.TOP + HeroBoard.CARD_H;
    // each job's backdrop on its card: [sky, floor] (by JOBS)
    public static BACKDROPS = [
        [AP.OXBLOOD, AP.BARK],          // Warrior
        [AP.FOREST, AP.PINE],           // Ranger
        [AP.GRAPE, AP.MIDNIGHT],        // Rogue
        [AP.DENIM, AP.NAVY],            // Mage
        [AP.UMBER, AP.SOOT],            // Cleric
        [AP.LEAF, AP.FOREST],           // Druid
        [AP.RUST, AP.BARK],             // Artisan
        [AP.MAROON, AP.PLUM],           // Bard
    ];
    // the window round the board, in screen px
    public static INSET_X = 12;
    public static INSET_Y = 28;         // (under the title bar)
    public static WIDTH = HeroBoard.INSET_X * 2 + HeroBoard.W * HeroBoard.SCALE;
    public static HEIGHT = HeroBoard.INSET_Y + HeroBoard.H * HeroBoard.SCALE + HeroBoard.INSET_X;

    private offers: Offer[] = [];
    private free = false;
    private toBarracks = false;     // (the roster full: a hire goes to the barracks)
    private rerollPrice = 0;            // (a refresh now)
    private endsAt = 0;
    private asked = false;              // (new offers asked for as the old ran out)

    public background: Panel;
    public titleBar: TitleBar;
    private content: PIXI.Container;    // the board, in its own px
    private cards: PIXI.Container;
    private countdown: PIXI.BitmapText;
    private roster: PIXI.BitmapText;
    private refresh: PIXI.Container;
    private refusedUntil = 0;           // (why a hire was refused shows over the countdown till then)
    private tip: Tip;
    private shown = -1;                 // the second the countdown shows

    private keys = (e: KeyboardEvent) => { if (e.key == "Escape" && !Chat.takes(e)) IBC.comp.destroy(this); };

    constructor() {
        super(ComponentType.HERO_BOARD);
        this.create();
    }

    // the board (one open at a time)
    public static open() {
        const view = IBC.comp.getOrCreate(ComponentType.HERO_BOARD) as HeroBoard;
        view.bringToTop();
        IBC.net.hero.board();
    }

    public create() {
        super.create();
        const { W, WIDTH, HEIGHT } = HeroBoard;
        // (so clicking on it doesn't reach the map under it)
        this.container.eventMode = "static";
        this.container.hitArea = new PIXI.Rectangle(0, 0, WIDTH, HEIGHT);
        this.container.on("pointerdown", (e: PIXI.FederatedPointerEvent) => e.stopPropagation());

        this.background = new Panel(this.container);
        this.background.setSize(WIDTH, HEIGHT);

        this.titleBar = new TitleBar(this);
        this.titleBar.setPosition(4, 4);
        this.titleBar.setSize(WIDTH - 8, 20);
        this.titleBar.setTitle("Hiring Board");

        this.content = new PIXI.Container();
        this.content.scale.set(HeroBoard.SCALE);
        this.content.position.set(HeroBoard.INSET_X, HeroBoard.INSET_Y);
        this.container.addChild(this.content);

        this.countdown = this.text("", HeroBoard.PAD + 2, 2, AP.STONE, this.content);
        this.roster = this.text("", W - 30, 2, AP.STONE, this.content);
        this.refresh = new PIXI.Container();
        this.content.addChild(this.refresh);
        this.content.addChild(new PIXI.Graphics().beginFill(AP.IRON).drawRect(HeroBoard.PAD, 11, W - HeroBoard.PAD * 2, 1).endFill());

        this.cards = new PIXI.Container();
        this.content.addChild(this.cards);
        this.tip = new Tip(this.content, W);     // (over the cards)

        window.addEventListener("keydown", this.keys);
        IBC.events.register(Event.HERO_BOARD, this.onBoard, this);
        IBC.events.register(Event.HERO_REFUSED, this.say, this);
        IBC.events.register(Event.INVENTORY_GOLD_UPDATED, () => this.draw(), this);
        // opens in the middle of the screen; moved, it stays where it's put
        this.setPosition(Math.round((window.innerWidth - WIDTH) / 2), Math.round((window.innerHeight - HEIGHT) / 2));
    }

    public destroy() {
        super.destroy();
        window.removeEventListener("keydown", this.keys);
        this.titleBar.destroy();
        this.titleBar = null;
        this.background.destroy();
        this.background = null;
        this.container.destroy({ children: true });
    }

    public update(deltaTime: number) {
        const left = Math.max(0, this.endsAt - Date.now()), s = Math.ceil(left / 1000);
        if (this.refusedUntil && Date.now() >= this.refusedUntil) {
            this.refusedUntil = 0;
            this.countdown.tint = AP.STONE;
            this.shown = -1;
        }
        if (this.endsAt && s != this.shown && !this.refusedUntil) {
            this.shown = s;
            const h = Math.floor(s / 3600), m = Math.floor(s / 60) % 60, sec = s % 60;
            this.countdown.text = `New heroes in ${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
        }
        if (this.endsAt && left == 0 && !this.asked) {
            this.asked = true;
            IBC.net.hero.board();
        }
    }

    private onBoard(message: any) {
        this.offers = message.o;
        this.free = !!message.f;
        this.rerollPrice = message.c ?? 0;
        this.endsAt = Date.now() + message.e;
        this.asked = false;
        this.draw();
    }

    // why a hire was refused, in red where the countdown is for a few seconds
    private say(why: string) {
        this.refusedUntil = Date.now() + 4000;
        this.countdown.text = why;
        this.countdown.tint = AP.FLAME;
        fit(this.countdown, this.refresh.x - this.countdown.x - 4);    // (short of Refresh)
    }

    private text(text: string, x: number, y: number, tint: number, parent: PIXI.Container) {
        const t = new PIXI.BitmapText(text, { fontName: Constants.PIXEL_FONT, fontSize: 32 });
        t.tint = tint;
        t.position.set(x, y);
        t.eventMode = "none";           // (text alone never gets in the way of what's under it)
        parent.addChild(t);
        return t;
    }

    // a line with a tooltip while it's pointed at - its hitbox the words and
    // a px round them, short of the line under it
    private line(text: string, x: number, y: number, tint: number, parent: PIXI.Container, more?: string[]) {
        const t = this.text(text, x, y, tint, parent);
        if (more) {
            t.eventMode = "static";
            t.hitArea = new PIXI.Rectangle(-1, -1, Math.ceil(t.textWidth) + 2, HeroBoard.LINE - 1);
            this.tipOn(t, more);
        }
        return t;
    }

    private tipOn(target: PIXI.Container, lines: string[]) {
        target.on("pointerover", (e: PIXI.FederatedPointerEvent) => this.tip.show(lines, e));
        target.on("pointermove", (e: PIXI.FederatedPointerEvent) => this.tip.move(e));
        target.on("pointerout", () => this.tip.hide());
    }

    private draw() {
        const heroes = IBC.data.heroes;
        // (the roster full, a hire goes to the barracks: full only with both)
        const premium = IBC.data.premium.active, rosterFull = heroes.heroes.length >= heroSlots(premium);
        this.toBarracks = rosterFull;
        const full = rosterFull && heroes.barracks.length >= barracksSlots(premium);
        this.roster.text = `Heroes ${heroes.heroes.length}/${heroSlots(IBC.data.premium.active)}`;
        this.roster.x = HeroBoard.W - HeroBoard.PAD - 2 - Math.ceil(this.roster.textWidth);
        this.tip.hide();
        this.drawRefresh();
        this.cards.removeChildren().forEach((c) => c.destroy({ children: true }));
        this.offers.forEach((offer, i) => {
            const card = new PIXI.Container();
            card.position.set(HeroBoard.PAD + i * (HeroBoard.CARD_W + HeroBoard.GAP), HeroBoard.TOP);
            this.cards.addChild(card);
            this.drawCard(card, offer, i, full);
        });
    }

    // Refresh, left of the roster count: new offers now for its price
    private drawRefresh() {
        const button = this.refresh;
        button.removeChildren().forEach((c) => c.destroy({ children: true }));
        button.removeAllListeners();
        const price = this.rerollPrice;
        const can = price > 0 && IBC.data.inventory.gold >= price;
        const label = this.text("Refresh", 3, 2, can ? AP.WHITE : AP.STONE, button);
        const coin = new PIXI.Sprite(coinTexture());
        coin.position.set(Math.ceil(label.x + label.textWidth) + 4, 1);
        const cost = this.text(price.toLocaleString("en-US"), coin.x + 8, 2, can ? AP.STRAW : AP.STONE, button);
        const w = Math.ceil(cost.x + cost.textWidth) + 3, h = 10;
        const box = new PIXI.Graphics();
        const paint = (lit: boolean) => {
            box.clear();
            box.beginFill(AP.BLACK).drawRect(0, 0, w, h).endFill();
            box.beginFill(can ? (lit ? AP.STEEL : AP.IRON) : AP.SHADOW).drawRect(1, 1, w - 2, h - 2).endFill();
        };
        paint(false);
        button.addChildAt(box, 0);
        button.addChild(coin);
        button.position.set(this.roster.x - 6 - w, 0);
        button.eventMode = "static";
        button.cursor = can ? "pointer" : "default";
        if (can) {
            button.on("pointerover", () => paint(true));
            button.on("pointerout", () => paint(false));
        }
        this.tipOn(button, can ? [`New heroes now for ${price}g`, "The price doubles each time, till new heroes come"] : ["Not enough gold"]);
        button.on("pointertap", () => { this.tip.hide(); if (can) IBC.net.hero.reroll(); });
    }

    // a thin rule across the card, between its parts
    private rule(card: PIXI.Container, y: number) {
        card.addChild(new PIXI.Graphics().beginFill(AP.IRON).drawRect(4, y, HeroBoard.CARD_W - 8, 1).endFill());
    }

    private drawCard(card: PIXI.Container, offer: Offer, index: number, full: boolean) {
        const { CARD_W: W, CARD_H: H, LINE } = HeroBoard;
        const back = new PIXI.Graphics();
        const frame = (lit: boolean) => {
            back.clear();
            back.beginFill(AP.BLACK).drawRect(0, 0, W, H).endFill();
            back.beginFill(lit ? AP.STEEL : AP.IRON).drawRect(1, 1, W - 2, H - 2).endFill();
            back.beginFill(AP.SLATE).drawRect(2, 2, W - 4, H - 4).endFill();
        };
        frame(false);
        card.addChild(back);
        if (!offer) {
            back.alpha = 0.5;
            const t = this.text("Hired", 0, H / 2 - 4, AP.STONE, card);
            t.x = Math.round((W - t.textWidth) / 2);
            return;
        }
        const h = offer.d;
        // (the frame lights up while the card's pointed at)
        card.eventMode = "static";
        card.hitArea = new PIXI.Rectangle(0, 0, W, H);
        card.on("pointerenter", () => frame(true));
        card.on("pointerleave", () => frame(false));

        // where they stand: a backdrop in their job's colours, a floor and a glow
        const [sky, floor] = HeroBoard.BACKDROPS[h.j] ?? [AP.INK, AP.SHADOW];
        const stage = new PIXI.Graphics();
        stage.beginFill(AP.BLACK).drawRect(3, 3, W - 6, 40).endFill();
        stage.beginFill(sky).drawRect(4, 4, W - 8, 30).endFill();
        stage.beginFill(floor).drawRect(4, 34, W - 8, 8).endFill();
        stage.beginFill(AP.WHITE, 0.06).drawEllipse(W / 2, 22, 22, 18).endFill();
        card.addChild(stage);
        const shadow = new PIXI.Sprite(shadowTexture());
        shadow.anchor.set(0.5, 0.5);
        shadow.position.set(W / 2, 38);
        const person = new PIXI.Sprite(personTexture(h.l, Facing.DOWN, 0));
        person.anchor.set(0.5, 1);
        person.position.set(W / 2, 39);
        card.addChild(shadow, person);

        let y = 46;
        const x = 5;
        // the name, the surname on a line of its own if it won't fit
        const name = this.line(h.n, x, y, AP.WHITE, card); y += LINE;
        if (name.textWidth > W - x * 2) {
            const space = h.n.indexOf(" ");
            name.text = h.n.slice(0, space);
            this.line(h.n.slice(space + 1), x, y, AP.WHITE, card); y += LINE;
        }
        const job = JOBS[h.j];
        this.line(`${job.name} (${job.role})`, x, y, AP.ICE, card, [job.does, `Better at ${job.skills.map((s) => SKILL_NAMES[s]).join(", ")}`]); y += LINE;
        this.line(`From ${startTown(h)}`, x, y, AP.SAND, card); y += LINE;
        this.rule(card, y); y += 3;

        // stats, two to a line, over 10 green and under it red
        const stats = heroStats(h);
        stats.forEach((v, s) => {
            const tint = v > 10 ? AP.LIME : v < 10 ? AP.FLAME : AP.WHITE;
            this.line(`${STAT_SHORT[s]} ${v}`, x + (s % 2) * 54, y + Math.floor(s / 2) * LINE, tint, card, [STAT_NAMES[s]]);
        });
        y += Math.ceil(stats.length / 2) * LINE;

        // the skills they've trained (by their tools), then their specialties
        const trained = h.k.some((level: number) => level > 1) || (h.p ?? []).length;
        if (trained) { this.rule(card, y); y += 3; }
        h.k.forEach((level: number, s: number) => {
            if (level <= 1) return;
            const icon = new PIXI.Sprite(skillIcon(s));
            icon.position.set(x, y - 1);
            card.addChild(icon);
            this.line(`${SKILL_NAMES[s]} ${level}`, x + 12, y, AP.WHITE, card);
            y += LINE;
        });
        for (const id of h.p ?? []) {
            this.line(`* ${skillName(id)}`, x, y, AP.STRAW, card, ["Specialty", `Learn ${specialtyXp(h)}x as fast`]);
            y += LINE;
        }
        if (h.t.some((t: number) => TRAITS[t])) { this.rule(card, y); y += 3; }
        for (const t of h.t) {
            const trait = TRAITS[t];
            if (!trait) continue;
            const tint = trait.worth > 0 ? AP.GRASS : trait.worth < 0 ? AP.FLAME : AP.STRAW;
            this.line(trait.name, x, y, tint, card, [trait.text]);
            y += LINE;
        }

        // the price and HIRE, on a band along the bottom
        card.addChild(new PIXI.Graphics().beginFill(AP.SHADOW).drawRect(2, H - 20, W - 4, 18).endFill()
            .beginFill(AP.IRON).drawRect(2, H - 21, W - 4, 1).endFill());
        const price = this.free ? 0 : offer.p;
        if (price) {
            const coin = new PIXI.Sprite(coinTexture());
            coin.position.set(x, H - 14);
            card.addChild(coin);
        }
        this.line(price ? price.toLocaleString("en-US") : "Free", price ? x + 8 : x, H - 14, price ? AP.STRAW : AP.LIME, card);
        const poor = IBC.data.inventory.gold < price;
        const can = !full && !poor;
        const button = new PIXI.Container();
        button.position.set(W - 35, H - 17);
        const box = new PIXI.Graphics();
        const paint = (lit: boolean) => {
            box.clear();
            box.beginFill(AP.BLACK).drawRect(0, 0, 31, 13).endFill();
            box.beginFill(can ? (lit ? AP.GRASS : AP.LEAF) : AP.IRON).drawRect(1, 1, 29, 11).endFill();
            box.beginFill(can ? (lit ? AP.LIME : AP.GRASS) : AP.STEEL).drawRect(1, 1, 29, 1).endFill();     // (a lit top edge)
        };
        paint(false);
        button.addChild(box);
        if (can) {
            button.on("pointerover", () => paint(true));
            button.on("pointerout", () => paint(false));
        }
        const label = this.text("Hire", 0, 3, can ? AP.WHITE : AP.STONE, button);
        label.x = Math.round((31 - label.textWidth) / 2);
        button.eventMode = "static";
        button.cursor = can ? "pointer" : "default";
        this.tipOn(button, [full ? "Your roster and barracks are full" : poor ? "Not enough gold" : `Hire ${h.n}${price ? ` for ${price}g` : " for free"}${this.toBarracks ? " (into the barracks: your roster is full)" : ""}`]);
        button.on("pointertap", () => { this.tip.hide(); if (can) IBC.net.hero.hire(index); });
        card.addChild(button);
    }

}
