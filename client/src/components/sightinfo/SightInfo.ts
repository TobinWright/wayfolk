import * as PIXI from "pixi.js";
import { levelsOf, materialOf } from "../../../../shared/Locations";
import { kindOf } from "../../../../shared/Places";
import {
    BEAST_GOLD, beastAt, beastName, BEASTS, FIND_CHANCE, findPool, KIND_NAMES, OPENING_RARE, Sight, SightKind, sightText, SightView,
} from "../../../../shared/Sights";
import { itemName, TaskKind, todoMost } from "../../../../shared/Tasks";
import { distancesFrom } from "../../../../shared/Travel";
import { clockIcon, coinIcon, SMALL_ICON } from "../../art/MenuIcons";
import { Constants } from "../../constants/Constants";
import { Event } from "../../constants/Events";
import { AP } from "../../constants/Palette";
import { timeLeft } from "../../data/EventsData";
import { IBC } from "../../Engine";
import { picTexture } from "../../people/People";
import { Panel } from "../../shared/Panel";
import { TitleBar } from "../../shared/ui/titlebar/TitleBar";
import { BaseComponent, ComponentType } from "../BaseComponent";
import { Chat, wrap } from "../chat/Chat";
import { textWidth, Tip } from "../games/GameUI";
import { fit } from "../heroroster/HeroRoster";
import { HeroStatus } from "../herostatus/HeroStatus";
import { itemTexture } from "../inventory/Item";
import { ItemInfo } from "../iteminfo/ItemInfo";
import { miles } from "../locationinfo/LocationInfo";
import type { Map as WorldMap } from "../map/Map";

// Something that's turned up on the map for a while (shared/Sights.ts) in a
// window of its own, opened from the place's window (or a beast, an opening
// or a merchant's stall on the map); Claude's layout. Titled with its name:
// its kind and the time left, where it is (Show centres the map on it), what
// it is; then by its kind - a merchant's wares (each in its slot, its price,
// how many you've bought of the most you may, and Buy, open while a hero of
// yours stands in its town; what the merchant said to a buy on the heading a
// while, your gold otherwise), what a rare find or a beast may give (a slot
// each, two to a row), an opening's floors and what it gives - and your
// heroes, each how far off set against Travel (an opening: Explore), their
// name opening their status. Pointing at anything says more in a tooltip
// (the info bar along the bottom taken off, the user, 2026-11-02: "remove
// the info bar on the bottom. and put some time into make everything look
// nicer").

export class SightInfo extends BaseComponent {

    public static SCALE = 2;
    public static W = 240;              // in its own px
    public static H = 250;              // (till it's drawn: then as tall as what it shows, fitTo)
    public static PAD = 6;
    public static LINE = 10;
    public static SLOT = 20;            // an item's slot
    public static ROW_H = 22;           // a ware's or a find's row (its slot)
    public static HERO_H = 14;
    public static BUTTON_W = 40;
    public static BUTTON_H = 12;
    public static TIP_W = 150;          // a tooltip's lines, at most
    public static TOLD_MS = 6000;       // what the merchant said stays this long
    public static EXPLORE_RUNS = 5;     // an opening's Explore puts this many runs on the list
    public static INSET_X = 12;
    public static INSET_Y = 28;
    public static WIDTH = SightInfo.INSET_X * 2 + SightInfo.W * SightInfo.SCALE;
    public static HEIGHT = SightInfo.INSET_Y + SightInfo.H * SightInfo.SCALE + SightInfo.INSET_X;

    private sight: number = null;
    private drawn = "";
    private since = 0;
    private told: { text: string, ok: boolean, until: number } = null;      // (what the merchant last said)

    public background: Panel;
    public titleBar: TitleBar;
    private content: PIXI.Container;
    private back: PIXI.Graphics;
    private sheet: PIXI.Container;
    private tip: Tip;
    // what says more, and where the pointer was: a redraw under a tooltip shows the new one's
    private tipped: [PIXI.Container, string[]][] = [];
    private pointer: PIXI.Point = null;

    private keys = (e: KeyboardEvent) => { if (e.key == "Escape" && !Chat.takes(e)) IBC.comp.destroy(this); };

    constructor() {
        super(ComponentType.SIGHT_INFO);
        this.create();
    }

    // one, by its id (one open at a time: clicking another shows it)
    public static open(id: number) {
        const view = IBC.comp.getOrCreate(ComponentType.SIGHT_INFO) as SightInfo;
        view.bringToTop();
        view.show(id);
    }

    public create() {
        super.create();
        const { WIDTH, HEIGHT, W, H } = SightInfo;
        this.container.eventMode = "static";
        this.container.hitArea = new PIXI.Rectangle(0, 0, WIDTH, HEIGHT);
        this.container.on("pointerdown", (e: PIXI.FederatedPointerEvent) => e.stopPropagation());

        this.background = new Panel(this.container);
        this.background.setSize(WIDTH, HEIGHT);
        this.titleBar = new TitleBar(this);
        this.titleBar.setPosition(4, 4);
        this.titleBar.setSize(WIDTH - 8, 20);

        this.content = new PIXI.Container();
        this.content.scale.set(SightInfo.SCALE);
        this.content.position.set(SightInfo.INSET_X, SightInfo.INSET_Y);
        this.container.addChild(this.content);
        // (as tall as what it shows: fitTo)
        this.back = new PIXI.Graphics().beginFill(AP.INK).drawRect(-4, -2, W + 8, H + 6).endFill();
        this.content.addChild(this.back);
        this.sheet = new PIXI.Container();
        this.content.addChild(this.sheet);
        this.tip = new Tip(this.content, W);     // (over the sheet)

        window.addEventListener("keydown", this.keys);
        IBC.events.register(Event.HERO_STATE, () => this.draw(), this);
        IBC.events.register(Event.HERO_STASH, () => this.draw(), this);
        IBC.events.register(Event.INVENTORY_GOLD_UPDATED, () => this.draw(), this);
        IBC.events.register(Event.SIGHTS_CHANGED, () => this.draw(), this);
        IBC.events.register(Event.SIGHT_SAID, (said: { text: string, ok: boolean }) => {
            this.told = { ...said, until: Date.now() + SightInfo.TOLD_MS };
            this.draw();
        }, this);
        this.setPosition(Math.max(0, Math.round((window.innerWidth - WIDTH) / 2) - 160), Math.max(0, Math.round((window.innerHeight - HEIGHT) / 2) - 20));
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

    public show(id: number) {
        if (id != this.sight) { this.drawn = ""; this.told = null; }
        this.sight = id;
        this.draw();
    }

    public update(deltaTime: number) {
        this.since += deltaTime;
        if (this.since < 1000) return;
        this.since = 0;
        this.draw();
    }

    private draw() {
        const s = IBC.data.sights.get(this.sight), heroes = IBC.data.heroes.heroes, now = Date.now();
        if (this.told && now >= this.told.until) this.told = null;
        const key = JSON.stringify([this.sight, s, heroes.map((h) => [h.id, h.s.p, h.s.r, h.s.q.length, h.s.w?.k, h.s.w?.p, h.d.k]),
            IBC.data.inventory.gold, s ? timeLeft(s.e - now) : 0, this.told?.text]);
        if (key == this.drawn) return;
        this.drawn = key;
        const tipShown = this.pointer != null;
        this.sheet.removeChildren().forEach((c) => c.destroy({ children: true }));
        this.tipped = [];
        this.tip.hide();
        if (!s || now >= s.e) {
            this.titleBar.setTitle(s ? s.n : "Gone");
            this.text("It's gone again", SightInfo.PAD, 4, AP.STONE, this.sheet);
            this.fitTo(16);
            return;
        }
        this.titleBar.setTitle(s.k == SightKind.BEAST ? beastName(s) : s.n);
        let y = this.drawTop(s);
        switch (s.k) {
            case SightKind.MERCHANT: y = this.drawWares(s, y); break;
            case SightKind.FIND: y = this.drawFinds(s, y); break;
            case SightKind.BEAST: y = this.drawBeast(s, y); break;
            case SightKind.OPENING: y = this.drawOpening(s, y); break;
        }
        this.fitTo(this.drawHeroes(s, y) + 2);
        if (tipShown) this.retip();
    }

    // its kind and the time left (its clock before it), where it is and Show, what it is
    private drawTop(s: Sight) {
        const { W, PAD, LINE, BUTTON_W } = SightInfo;
        let y = 2;
        const hue = s.k == SightKind.BEAST ? AP.FLAME : s.k == SightKind.OPENING ? AP.ORCHID : AP.STRAW;
        this.text(KIND_NAMES[s.k], PAD, y, hue, this.sheet);
        const left = this.text(`${timeLeft(s.e - Date.now())} left`, 0, y, AP.WHITE, this.sheet);
        left.x = W - PAD - Math.ceil(left.textWidth);
        this.sprite(picTexture(clockIcon()), left.x - SMALL_ICON - 3, y - 1, this.sheet);
        this.tipOn(left, `It goes at ${new Date(s.e).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`,
            new PIXI.Rectangle(-SMALL_ICON - 4, -1, Math.ceil(left.textWidth) + SMALL_ICON + 6, LINE - 1));
        y += LINE + 4;

        const where = s.k == SightKind.BEAST ? "Roaming the land" : s.k == SightKind.OPENING ? "At a bend in the road" : `At ${IBC.data.heroes.nameOf(s.p)}`;
        this.stripe(y - 2, LINE + 3);
        fit(this.text(where, PAD + 4, y, AP.SAND, this.sheet), W - PAD * 2 - BUTTON_W - 10);
        this.button("Show", W - PAD - BUTTON_W, y - 2, BUTTON_W, true, false, "Centre the map on it", () => this.showOnMap(s));
        y += LINE + 6;

        for (const row of wrap(sightText(s), W - PAD * 2 - 4, W - PAD * 2 - 4, (t) => textWidth(t))) {
            this.text(row, PAD + 2, y, AP.MIST, this.sheet);
            y += LINE;
        }
        return y + 5;
    }

    // a merchant's wares: the item in its slot, its price, how many you've
    // bought of the most you may, Buy; what the merchant said on the heading
    private drawWares(s: SightView, y: number) {
        const { W, PAD, ROW_H, BUTTON_W } = SightInfo;
        const here = this.heroHere(s), gold = IBC.data.inventory.gold;
        const told = this.told;
        this.heading("Wares", y, told ? told.text : `You have ${gold}g`, told ? (told.ok ? AP.LIME : AP.FLAME) : AP.STRAW,
            told ? undefined : here ? "A hero of yours is here: you can buy" : `Send a hero to ${IBC.data.heroes.nameOf(s.p)} to buy`);
        y += 13;
        (s.l ?? []).forEach(([item, price, most], k) => {
            const bought = s.b?.[k] ?? 0, can = here && bought < most && gold >= price;
            if (k % 2 == 0) this.stripe(y, ROW_H);
            const buyX = W - PAD - 2 - BUTTON_W;
            const n = this.line(`${bought}/${most}`, 0, y + 7, bought >= most ? AP.STONE : AP.ASH, this.sheet, `You've bought ${bought} of the ${most} the merchant will sell you`);
            n.x = buyX - 6 - Math.ceil(n.textWidth);
            const cost = this.text(`${price}g`, 0, y + 7, gold >= price ? AP.STRAW : AP.FLAME, this.sheet);
            cost.x = n.x - 10 - Math.ceil(cost.textWidth);
            this.sprite(picTexture(coinIcon()), cost.x - SMALL_ICON - 2, y + 6, this.sheet);
            this.itemCell(item, PAD + 2, y, cost.x - SMALL_ICON - 6 - (PAD + 2));
            const why = bought >= most ? "You've bought as many as the merchant will sell you" : !here ? `Send a hero to ${IBC.data.heroes.nameOf(s.p)} to buy`
                : gold < price ? `You need ${price}g` : `Buy one ${itemName(item)} for ${price}g`;
            this.button("Buy", buyX, y + 5, BUTTON_W, can, bought >= most, why, () => IBC.net.event.buy(s.i, k, 1));
            y += ROW_H;
        });
        return y + 5;
    }

    // a rare find: what may be found, and how often
    private drawFinds(s: Sight, y: number) {
        this.heading("May be found", y, `${Math.round(FIND_CHANCE * 100)}% a gathering`, AP.LIME,
            `Each gathering here has a ${Math.round(FIND_CHANCE * 100)}% chance of one of these too`);
        return this.itemGrid(findPool(s).map((m) => m.id), y + 13);
    }

    // a beast: what it leaves, and how much gold
    private drawBeast(s: Sight, y: number) {
        const def = BEASTS[s.v];
        this.heading("It leaves", y, `${BEAST_GOLD}x gold`, AP.STRAW, `Beating it pays ${BEAST_GOLD}x a road fight's gold`);
        return this.itemGrid(def?.drops ?? [], y + 13);
    }

    // an opening: its floors, and what it gives, a mark before each
    private drawOpening(s: Sight, y: number) {
        const { W, PAD, LINE } = SightInfo;
        const kind = s.o ? kindOf(s.o) : "cave";
        this.heading("Inside", y); y += 13;
        const lines: [string, number, (x: number, y: number) => void][] = [
            [`${levelsOf(kind)} floors, ${kind == "ruins" ? "ruins" : "a cave"}`, AP.FOAM, (x, y) => this.stairs(x, y)],
            ["Twice the finds and gold", AP.LIME, (x, y) => this.spark(x, y)],
            [`A ${Math.round(OPENING_RARE * 100)}% chance a run of something rare`, AP.ORCHID, (x, y) => this.gem(x, y)],
        ];
        for (const [t, tint, mark] of lines) {
            mark(PAD + 4, y - 1);
            fit(this.text(t, PAD + 4 + SMALL_ICON + 4, y, tint, this.sheet), W - PAD * 2 - SMALL_ICON - 8);
            y += LINE;
        }
        return y + 5;
    }

    // a row a hero: their name (opening their status), how far off (an
    // opening's, how deep they'd get) set against Travel (an opening: Explore)
    private drawHeroes(s: Sight, y: number) {
        const { W, PAD, HERO_H, BUTTON_W } = SightInfo;
        const data = IBC.data.heroes;
        this.heading("Your heroes", y); y += 13;
        if (!data.heroes.length) { this.text("None yet: hire one from the main menu", PAD + 4, y, AP.IRON, this.sheet); return y + SightInfo.LINE; }
        if (s.k == SightKind.BEAST) {
            for (const row of wrap("Any hero of yours on the road near it will have to fight it. Strong heroes are best kept on its way.", W - PAD * 2 - 8, W - PAD * 2 - 8, (t) => textWidth(t))) {
                this.text(row, PAD + 4, y, AP.ASH, this.sheet);
                y += SightInfo.LINE;
            }
            return y;
        }
        const full = (q: unknown[]) => q.length >= todoMost(IBC.data.premium.active);
        data.heroes.forEach((hero, k) => {
            const st = hero.s, from = st.r.length ? st.r[0] : st.p;
            const here = !st.r.length && st.p == s.p, going = st.r.length && st.r[st.r.length - 1] == s.p;
            const px = distancesFrom(data.graph, from).get(s.p);
            if (k % 2 == 0) this.stripe(y, HERO_H - 2);
            const buttonX = W - PAD - BUTTON_W;
            let right = buttonX - 5;
            if (s.k == SightKind.OPENING && s.o) {
                const deepest = IBC.data.parties.deepest(kindOf(s.o), hero);
                const fl = this.line(`fl ${deepest}`, 0, y + 2, AP.STRAW, this.sheet, `${hero.d.n} would get as deep as floor ${deepest}`);
                fl.x = right - Math.ceil(fl.textWidth);
                right = fl.x - 6;
            }
            const [where, tint] = here ? ["here now", AP.LIME] : going ? [`on the way, ${miles(px)}`, AP.GRASS] : px == null ? ["no road there", AP.FLAME] : [miles(px), AP.SAND];
            const far = this.text(where, 0, y + 2, tint, this.sheet);
            far.x = right - Math.ceil(far.textWidth);
            // the name opens their status
            const name = fit(this.text(hero.d.n, PAD + 4, y + 2, AP.WHITE, this.sheet), far.x - 6 - (PAD + 4));
            name.eventMode = "static";
            name.cursor = "pointer";
            name.hitArea = new PIXI.Rectangle(-1, -1, Math.ceil(name.textWidth) + 2, SightInfo.LINE);
            name.on("pointerover", () => name.tint = AP.STRAW);
            name.on("pointerout", () => name.tint = AP.WHITE);
            name.on("pointertap", () => HeroStatus.open(hero.id));

            if (s.k == SightKind.OPENING) {
                const exploring = st.q.some((t) => t.k == TaskKind.EXPLORE && t.p == s.p) || (st.w?.k == TaskKind.EXPLORE && st.w.p == s.p);
                const can = !exploring && px != null && !full(st.q);
                this.button(exploring ? "Going" : "Explore", buttonX, y, BUTTON_W, can, exploring,
                    exploring ? "Exploring it already" : full(st.q) ? "Their to-do list is full" : px == null ? "No road there" : `Explore it ${SightInfo.EXPLORE_RUNS} times (on the end of their to-do list)`,
                    () => IBC.net.hero.give(hero.id, [{ k: TaskKind.EXPLORE, p: s.p, n: SightInfo.EXPLORE_RUNS }]));
            } else {
                const can = !here && !going && px != null && !full(st.q);
                this.button(here ? "Here" : going ? "Going" : "Travel", buttonX, y, BUTTON_W, can, !!(here || going),
                    here ? "Here now" : going ? "On the way" : full(st.q) ? "Their to-do list is full" : px == null ? "No road there" : "Go there (on the end of their to-do list)",
                    () => IBC.net.hero.give(hero.id, [{ k: TaskKind.TRAVEL, p: s.p }]));
            }
            y += HERO_H;
        });
        return y - 2;
    }

    //#region bits

    // the window made `h` tall (its content's px), kept on the screen
    private fitTo(h: number) {
        const { WIDTH, W, SCALE, INSET_X, INSET_Y } = SightInfo, height = INSET_Y + h * SCALE + INSET_X;
        this.background.setSize(WIDTH, height);
        this.container.hitArea = new PIXI.Rectangle(0, 0, WIDTH, height);
        this.back.clear().beginFill(AP.INK).drawRect(-4, -2, W + 8, h + 6).endFill();
        this.container.y = Math.max(0, Math.min(this.container.y, window.innerHeight - height));
    }

    // a hero of yours standing at its place
    private heroHere(s: Sight) {
        return IBC.data.heroes.heroes.some((h) => !h.s.r.length && h.s.p == s.p);
    }

    private showOnMap(s: Sight) {
        const map = IBC.comp.getFirstByType(ComponentType.MAP) as WorldMap;
        if (!map) return;
        const graph = IBC.data.heroes.graph, at = s.k == SightKind.BEAST ? beastAt(s, graph, Date.now()) : graph.get(s.p);
        if (!at) return;
        map.follow(null);
        map.camera.centerOn(at.x, at.y);
    }

    // items two to a row, each in its slot with its name, a shaded box round each
    private itemGrid(ids: number[], y: number) {
        const { W, PAD, ROW_H } = SightInfo;
        const cellW = Math.floor((W - PAD * 2 - 4) / 2);
        ids.forEach((id, k) => {
            const x = PAD + (k % 2) * (cellW + 4), at = y + Math.floor(k / 2) * (ROW_H + 2);
            this.sheet.addChild(new PIXI.Graphics().beginFill(AP.SHADOW).drawRect(x, at, cellW, ROW_H).endFill());
            this.itemCell(id, x + 1, at, cellW - 2);
        });
        return y + Math.ceil(ids.length / 2) * (ROW_H + 2) + 4;
    }

    // an item in its slot and its name, a material's floor under it, fitted to
    // width (no tooltip: the user, 2026-11-02); pointed at, the name lit; clicked, its info
    private itemCell(id: number, x: number, y: number, width: number) {
        const { SLOT, ROW_H } = SightInfo;
        const cell = new PIXI.Container();
        cell.position.set(x, y);
        const top = Math.floor((ROW_H - SLOT) / 2);
        cell.addChild(new PIXI.Graphics()
            .beginFill(AP.BLACK).drawRect(0, top, SLOT, SLOT).endFill()
            .beginFill(AP.SLATE).drawRect(1, top + 1, SLOT - 2, SLOT - 2).endFill()
            .beginFill(AP.STEEL).drawRect(1, top + 1, SLOT - 2, 1).endFill());
        const texture = itemTexture(id), sprite = this.sprite(texture, 0, 0, cell);
        sprite.position.set(Math.floor((SLOT - texture.width) / 2), top + Math.floor((SLOT - texture.height) / 2));
        const m = materialOf(id);
        const name = fit(this.text(itemName(id), SLOT + 5, m ? 3 : Math.floor((ROW_H - 7) / 2), AP.WHITE, cell), width - SLOT - 7);
        if (m) fit(this.text(`Floor ${m.level}`, SLOT + 5, 12, AP.STONE, cell), width - SLOT - 7);
        cell.eventMode = "static";
        cell.hitArea = new PIXI.Rectangle(0, 0, width, ROW_H);
        cell.cursor = "pointer";
        cell.on("pointerover", () => name.tint = AP.STRAW);
        cell.on("pointerout", () => name.tint = AP.WHITE);
        cell.on("pointertap", () => ItemInfo.open(id));
        this.sheet.addChild(cell);
    }

    // a heading with a rule from it to the other side, or to a note on its right
    private heading(text: string, y: number, note?: string, tint?: number, more?: string) {
        const { PAD, W } = SightInfo;
        const t = this.text(text, PAD, y, AP.STRAW, this.sheet);
        const from = PAD + Math.ceil(t.textWidth) + 4;
        let to = W - PAD;
        if (note) {
            const n = fit(this.line(note, 0, y, tint, this.sheet, more), W - PAD - from - 10);
            n.x = W - PAD - Math.ceil(n.textWidth);
            to = n.x - 4;
        }
        if (to > from) this.sheet.addChild(new PIXI.Graphics().beginFill(AP.IRON).drawRect(from, y + 3, to - from, 1).endFill()
            .beginFill(AP.SLATE).drawRect(from, y + 4, to - from, 1).endFill());
    }

    // every other row a shade lighter
    private stripe(y: number, h: number) {
        const { W, PAD } = SightInfo;
        this.sheet.addChild(new PIXI.Graphics().beginFill(AP.SHADOW).drawRect(PAD, y, W - PAD * 2, h).endFill());
    }

    // (a tooltip's text in lines that fit)
    private wrapped(text: string) {
        return wrap(text, SightInfo.TIP_W, SightInfo.TIP_W, (s) => textWidth(s));
    }

    // pointing at it says more, in a box over the pointer
    private tipOn(it: PIXI.Container, more: string | string[], area: PIXI.Rectangle) {
        const lines = typeof more == "string" ? this.wrapped(more) : more;
        it.eventMode = "static";
        it.hitArea = area;
        it.on("pointerover", (e: PIXI.FederatedPointerEvent) => { this.pointer = e.global.clone(); this.tip.show(lines, e); });
        it.on("pointermove", (e: PIXI.FederatedPointerEvent) => { this.pointer = e.global.clone(); this.tip.move(e); });
        it.on("pointerout", () => { this.pointer = null; this.tip.hide(); });
        this.tipped.push([it, lines]);
    }

    // after a redraw under a tooltip: the tooltip of what's under the pointer now
    private retip() {
        const at = this.tipped.find(([it]) => { const p = it.toLocal(this.pointer); return it.hitArea.contains(p.x, p.y); });
        if (at) this.tip.show(at[1], { global: this.pointer } as PIXI.FederatedPointerEvent);
        else this.pointer = null;
    }

    // text that says more while it's pointed at
    private line(text: string, x: number, y: number, tint: number, parent: PIXI.Container, more?: string) {
        const t = this.text(text, x, y, tint, parent);
        if (more) this.tipOn(t, more, new PIXI.Rectangle(-1, -1, Math.max(20, Math.ceil(t.textWidth) + 2), SightInfo.LINE - 1));
        return t;
    }

    private text(text: string, x: number, y: number, tint: number, parent: PIXI.Container) {
        const t = new PIXI.BitmapText(text, { fontName: Constants.PIXEL_FONT, fontSize: 32 });
        t.tint = tint;
        t.position.set(x, y);
        t.eventMode = "none";
        parent.addChild(t);
        return t;
    }

    private sprite(texture: PIXI.Texture, x: number, y: number, parent: PIXI.Container) {
        const s = new PIXI.Sprite(texture);
        s.position.set(x, y);
        parent.addChild(s);
        return s;
    }

    // the floors' mark: steps going down
    private stairs(x: number, y: number) {
        this.sheet.addChild(new PIXI.Graphics()
            .beginFill(AP.SKY).drawRect(x, y + 1, 2, 6).drawRect(x + 2, y + 3, 2, 4).drawRect(x + 4, y + 5, 3, 2).endFill()
            .beginFill(AP.FOAM).drawRect(x, y + 1, 2, 1).drawRect(x + 2, y + 3, 2, 1).drawRect(x + 4, y + 5, 3, 1).endFill());
    }

    // twice the finds' mark: a four-pointed spark
    private spark(x: number, y: number) {
        this.sheet.addChild(new PIXI.Graphics()
            .beginFill(AP.GRASS).drawRect(x + 3, y, 1, 7).drawRect(x, y + 3, 7, 1).endFill()
            .beginFill(AP.LIME).drawRect(x + 2, y + 2, 3, 3).endFill()
            .beginFill(AP.PALE).drawRect(x + 3, y + 3, 1, 1).endFill());
    }

    // something rare's mark: a small cut gem
    private gem(x: number, y: number) {
        this.sheet.addChild(new PIXI.Graphics()
            .beginFill(AP.MAGENTA).drawRect(x + 2, y, 3, 1).drawRect(x + 1, y + 1, 5, 1).drawRect(x, y + 2, 7, 2).drawRect(x + 1, y + 4, 5, 1).drawRect(x + 2, y + 5, 3, 1).drawRect(x + 3, y + 6, 1, 1).endFill()
            .beginFill(AP.PINK).drawRect(x + 2, y + 1, 2, 1).drawRect(x + 1, y + 2, 2, 1).endFill()
            .beginFill(AP.WHITE).drawRect(x + 2, y + 2, 1, 1).endFill());
    }

    // a button, the event window's: green, lit on top; done, dark green; off, grey
    private button(label: string, x: number, y: number, w: number, on: boolean, done: boolean, more: string, tap: () => void) {
        const h = SightInfo.BUTTON_H, button = new PIXI.Container();
        button.position.set(x, y);
        const box = new PIXI.Graphics();
        const paint = (over: boolean) => box.clear()
            .beginFill(AP.BLACK).drawRect(0, 0, w, h).endFill()
            .beginFill(done ? AP.FOREST : !on ? AP.IRON : over ? AP.GRASS : AP.LEAF).drawRect(1, 1, w - 2, h - 2).endFill()
            .beginFill(done ? AP.LEAF : !on ? AP.STEEL : over ? AP.LIME : AP.GRASS).drawRect(1, 1, w - 2, 1).endFill();
        paint(false);
        button.addChild(box);
        const t = this.text(label, 0, 2, on ? AP.WHITE : done ? AP.LIME : AP.STONE, button);
        fit(t, w - 4);     // (never past its sides)
        t.x = Math.round((w - t.textWidth) / 2);
        this.tipOn(button, more, new PIXI.Rectangle(0, 0, w, h));
        button.on("pointerover", () => paint(true));
        button.on("pointerout", () => paint(false));
        if (on) {
            button.cursor = "pointer";
            button.on("pointertap", tap);
        }
        this.sheet.addChild(button);
    }

    //#endregion

}
