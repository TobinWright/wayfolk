import * as PIXI from "pixi.js";
import { materialOf } from "../../../../shared/Locations";
import { itemOrder as order } from "../../../../shared/Market";
import { itemName, itemTier, itemWorth, QUALITY_NAMES, qualityOf, recipeOf, SUPPLIES, TaskKind } from "../../../../shared/Tasks";
import { QUALITY_COLOURS } from "../../art/ItemArt";
import { coinIcon } from "../../art/MenuIcons";
import { TASK_ICON, taskIcon } from "../../art/TaskIcons";
import { Constants } from "../../constants/Constants";
import { Event } from "../../constants/Events";
import { AP } from "../../constants/Palette";
import { IBC } from "../../Engine";
import { picTexture } from "../../people/People";
import { Panel } from "../../shared/Panel";
import { ScrollView } from "../../shared/ui/ScrollView";
import { TitleBar } from "../../shared/ui/titlebar/TitleBar";
import { BaseComponent, ComponentType } from "../BaseComponent";
import { Chat } from "../chat/Chat";
import { HeroStatus } from "../herostatus/HeroStatus";
import { ItemInfo } from "../iteminfo/ItemInfo";
import { Market } from "../market/Market";
import { CATEGORIES, Category, sortsOf } from "../taskplanner/TaskPlanner";
import { Trade } from "../trade/Trade";
import { Mail } from "../mail/Mail";
import { Guild } from "../guild/Guild";
import { itemTexture } from "./Item";

// Your stash (the user, 2026-10-28: "make it work and look nice"), drawn as
// ItemInfo is. Along the top a tab each - All, Gathered and Crafted (all that's
// made: worked materials and tools in it too; the user, 2026-11-01) - and your
// gold; under them the tab's sorts as small icons, as the to-do list's gather
// and craft tabs have them (the same sorts); under those a grid of slots, each a
// sprite and how many, grouped by sort under headings (gathered things in the
// order they're found, made things in their recipes' order), each group's last
// row filled out with empty slots. A Fine, Superior or Masterwork thing's slot
// is edged in its quality's colour; something you've just got more of glows a
// moment. Pointed at, a slot says what it is (its name in its quality's
// colour), its tier, how many exactly, what it does and which of your heroes
// have one on (those that do: a little mark in its top left corner). What's
// worn has left the stash (a potion or meal stays in it, used as it's needed),
// so something worn with none spare is shown too, dimmed, with no count, and
// can't be dragged anywhere: it's on them. Clicking one opens its ItemInfo.
// Redrawn as the stash changes. A slot dragged out and let go over the
// Market window is put up for sale there (Market.offer), over the Trade
// window put into your offer (Trade.offer), over Mail into the letter
// being written (Mail.offer), or on a hero's gear slot in their status
// window put on them (HeroStatus.drop).

export class Inventory extends BaseComponent {

    public static SCALE = 2;
    public static PAD = 4;
    public static COLS = 11;            // (wide enough for a row of sorts and the longest sort's name)
    public static CELL = 22;            // a slot (a gap after it)
    public static GAP = 2;
    public static W = Inventory.PAD * 2 + Inventory.COLS * (Inventory.CELL + Inventory.GAP) + 6;   // (room for the scrollbar)
    public static H = 222;
    public static TAB = 14;             // a tab's square
    public static SORT = TASK_ICON + 2; // a sort's, in the row under the tabs
    public static SORTS_Y = Inventory.TAB + 2;
    public static TOP = Inventory.SORTS_Y + Inventory.SORT + 4;
    public static DRAG_PX = 4;          // (screen px a pressed slot moves before it's dragged)
    public static GLOW_MS = 1600;       // (how long a slot glows for something just got)
    public static VIEW_H = Inventory.H - Inventory.TOP;
    // the window round it, in screen px
    public static INSET_X = 12;
    public static INSET_Y = 28;         // (under the title bar)
    public static WIDTH = Inventory.INSET_X * 2 + Inventory.W * Inventory.SCALE;
    public static HEIGHT = Inventory.INSET_Y + Inventory.H * Inventory.SCALE + Inventory.INSET_X;

    private tab: Category = null;       // (null: everything)
    private picked: Category[] = [];    // the tab's sort picked, and those it's under (none: all of the tab)
    private drawn = "";                 // (what it was drawn from: redrawn when it changes)
    private drawnTab: Category = null;
    private seen: Map<number, number> = null;           // (how many of each there were last drawn: more since, it glows)
    private glowing = new Map<number, number>();        // (what's glowing, and ms left)
    private glows = new Map<number, PIXI.Graphics>();   // (their slots' glow, as drawn)

    public background: Panel;
    public titleBar: TitleBar;
    private content: PIXI.Container;
    private top: PIXI.Container;
    private grid: ScrollView;
    private tip: PIXI.Container;       // (an item's name, over the pointer)
    private press: { id: number, from: PIXI.Point } = null;    // (a slot pressed: dragged once it moves a few px)
    private ghost: PIXI.Sprite = null;  // (what's dragged, under the pointer)
    private dragged = false;            // (the last press was a drag, not a click)

    private keys = (e: KeyboardEvent) => { if (e.key == "Escape" && !Chat.takes(e)) IBC.comp.destroy(this); };

    constructor() {
        super(ComponentType.INVENTORY);
        this.create();
        this.refresh();
    }

    public create() {
        super.create();
        const { WIDTH, HEIGHT, W, H, TOP, VIEW_H, PAD } = Inventory;
        this.container.eventMode = "static";
        this.container.hitArea = new PIXI.Rectangle(0, 0, WIDTH, HEIGHT);
        this.container.on("pointerdown", (e: PIXI.FederatedPointerEvent) => e.stopPropagation());

        this.background = new Panel(this.container);
        this.background.setSize(WIDTH, HEIGHT);

        this.titleBar = new TitleBar(this);
        this.titleBar.setPosition(4, 4);
        this.titleBar.setSize(WIDTH - 8, 20);
        this.titleBar.setTitle("Inventory");

        this.content = new PIXI.Container();
        this.content.scale.set(Inventory.SCALE);
        this.content.position.set(Inventory.INSET_X, Inventory.INSET_Y);
        this.container.addChild(this.content);

        // (the panel's middle lets the map through)
        this.content.addChild(new PIXI.Graphics().beginFill(AP.INK).drawRect(-4, -2, W + 8, H + 6).endFill());
        this.top = new PIXI.Container();
        this.content.addChild(this.top);
        // (its scrollbar out at the window's edge)
        this.grid = new ScrollView(this.content, W - PAD + 3, VIEW_H);
        this.grid.position(PAD, TOP);
        this.grid.container.hitArea = new PIXI.Rectangle(0, 0, W - PAD + 3, VIEW_H);
        this.tip = new PIXI.Container();
        this.tip.eventMode = "none";
        this.tip.visible = false;
        this.content.addChild(this.tip);

        // dragging a slot (to the Market)
        this.container.on("globalpointermove", (e: PIXI.FederatedPointerEvent) => this.dragMove(e));
        this.container.on("pointerup", (e: PIXI.FederatedPointerEvent) => this.dragEnd(e));
        this.container.on("pointerupoutside", (e: PIXI.FederatedPointerEvent) => this.dragEnd(e));

        window.addEventListener("keydown", this.keys);
        IBC.events.register(Event.HERO_STASH, () => this.refresh(), this);
        IBC.events.register(Event.INVENTORY_GOLD_UPDATED, () => this.refresh(), this);
        IBC.events.register(Event.HERO_STATE, () => this.refresh(), this);     // (their gear changed: who's marked)
        // opens left of the middle of the screen (an item's opens right of it)
        this.setPosition(Math.max(0, Math.round((window.innerWidth - WIDTH) / 2) - 200), Math.max(0, Math.round((window.innerHeight - HEIGHT) / 2) - 20));
    }

    public destroy() {
        super.destroy();
        IBC.events.unregisterAll(this);
        window.removeEventListener("keydown", this.keys);
        this.dropGhost();
        this.grid.destroy();
        this.titleBar.destroy();
        this.titleBar = null;
        this.background.destroy();
        this.background = null;
        this.container.destroy({ children: true });
    }

    // (redrawn only when the stash, your gold or the tab has changed; kept scrolled where it was but for a new tab)
    public refresh() {
        const inv = IBC.data.inventory;
        const key = JSON.stringify([this.tab?.name, this.picked.map((c) => c.name), inv.gold, Array.from(inv.items.values(), (i) => [i.id, i.amount]),
            IBC.data.heroes.heroes.map((h) => [h.d.n, h.d.g])]);
        if (key == this.drawn) return;
        const same = this.drawn && this.tab == this.drawnTab;
        this.drawn = key;
        this.drawnTab = this.tab;
        // (more of something than last time: it glows; not everything on first opening)
        const amounts = new Map(Array.from(inv.items.values(), (i) => [i.id, i.amount] as [number, number]));
        if (this.seen) amounts.forEach((n, id) => { if (n > (this.seen.get(id) ?? 0)) this.glowing.set(id, Inventory.GLOW_MS); });
        this.seen = amounts;
        this.glows.clear();
        this.top.removeChildren().forEach((c) => c.destroy({ children: true }));
        this.grid.content.removeChildren().forEach((c) => c.destroy({ children: true }));
        this.hideTip();     // (what was pointed at may be gone)
        this.drawTop();
        this.grid.setContentHeight(Math.max(this.drawGrid(), 1));
        if (!same) this.grid.scrollTo(0);
    }

    // what's just got fades from glowing
    public update(deltaTime: number) {
        Array.from(this.glowing.entries()).forEach(([id, left]) => {
            const now = left - deltaTime;
            if (now <= 0) this.glowing.delete(id); else this.glowing.set(id, now);
            const glow = this.glows.get(id);
            if (glow) glow.alpha = Math.max(0, now / Inventory.GLOW_MS);
        });
    }

    //#region along the top: the tabs, their sorts, your gold

    // the tabs, an icon each (as the to-do list's are; dim with nothing of it), and the name of the
    // one on or pointed at after them; your gold on the right; under them the tab's sorts, and the
    // name of the one picked or pointed at after them
    private drawTop() {
        const { W, PAD, TAB } = Inventory, inv = IBC.data.inventory;
        const tabs = [null, ...TABS];
        const tabLabel = this.text("", PAD + tabs.length * (TAB + 1) + 2, 3, AP.WHITE, this.top);
        const tabNamed = (name: string) => { tabLabel.text = name; };
        const tabResting = () => tabNamed(this.tab?.name ?? "All");
        tabResting();
        const label = this.text("", 0, Inventory.SORTS_Y + 3, AP.WHITE, this.top);
        const named = (name: string) => { label.text = name; };
        const resting = () => named(this.pickedName());
        const pad = (TAB - TASK_ICON) / 2;
        let x = PAD;
        for (const t of tabs) {
            const on = t == this.tab, n = this.itemsOf(t).length;
            const tab = new PIXI.Container();
            tab.position.set(x, 0);
            x += TAB + 1;
            const back = new PIXI.Graphics();
            const paint = (over: boolean) => back.clear()
                .beginFill(on ? AP.LIME : AP.BLACK).drawRect(0, 0, TAB, TAB).endFill()
                .beginFill(on ? AP.IRON : over ? AP.STONE : n ? AP.SLATE : AP.SHADOW).drawRect(1, 1, TAB - 2, TAB - 2).endFill();
            paint(false);
            tab.addChild(back);
            const icon = new PIXI.Sprite(taskIcon(t?.icon ?? "all"));
            icon.position.set(pad, pad);
            if (!n) icon.alpha = 0.35;
            tab.addChild(icon);
            tab.eventMode = "static";
            tab.cursor = "pointer";
            tab.hitArea = new PIXI.Rectangle(0, 0, TAB, TAB);
            tab.on("pointerover", () => { paint(true); tabNamed(t?.name ?? "All"); });
            tab.on("pointerout", () => { paint(false); tabResting(); });
            tab.on("pointertap", () => { if (!on) { this.tab = t; this.picked = []; this.refresh(); } });
            this.top.addChild(tab);
        }
        label.x = PAD + this.drawSorts(named, resting) + 2;
        resting();

        const gold = this.text(inv.gold.toLocaleString("en-US"), 0, 4, AP.STRAW, this.top);
        gold.x = W - PAD - Math.ceil(gold.textWidth);
        const coin = new PIXI.Sprite(picTexture(coinIcon()));
        coin.position.set(gold.x - 10, 4);
        this.top.addChild(coin);
    }

    // the level of the tab's sorts shown (under the last picked if it has sorts of its own, else the
    // one it's in), those over it, and the one of it picked (null: all of it); as the to-do list's
    private level() {
        const picked = this.picked, last = picked[picked.length - 1];
        const above = last?.kids ? picked : picked.slice(0, -1);
        return { above, level: above.length ? above[above.length - 1].kids : this.tab?.kids ?? [], on: above == picked ? null : last };
    }

    private pickedName() {
        const { above, on } = this.level();
        if (!this.tab) return "";
        return on ? on.name : `All ${(above.length ? above[above.length - 1] : this.tab).name.toLowerCase()}`;
    }

    // the tab's sorts in a row under the tabs, an icon each (dim with nothing of it): first "all" (and,
    // under a sort with sorts of its own, "back" before it); returns how wide it came to
    private drawSorts(named: (name: string) => void, resting: () => void) {
        if (!this.tab) return 0;
        const { SORT, SORTS_Y, PAD } = Inventory;
        const { above, level, on } = this.level();
        const pick = (chain: Category[]) => { this.picked = chain; this.refresh(); };
        let x = 0;
        const button = (icon: string, name: string, lit: boolean, has: boolean, tap: () => void) => {
            const b = new PIXI.Container();
            b.position.set(PAD + x, SORTS_Y);
            x += SORT + 1;
            b.addChild(new PIXI.Graphics()
                .beginFill(lit ? AP.LIME : AP.BLACK).drawRect(0, 0, SORT, SORT).endFill()
                .beginFill(lit ? AP.IRON : has ? AP.SLATE : AP.SHADOW).drawRect(1, 1, SORT - 2, SORT - 2).endFill());
            const sprite = new PIXI.Sprite(taskIcon(icon));
            sprite.position.set(1, 1);
            if (!has) sprite.alpha = 0.35;
            b.addChild(sprite);
            b.eventMode = "static";
            b.cursor = "pointer";
            b.hitArea = new PIXI.Rectangle(0, 0, SORT, SORT);
            b.on("pointerover", () => named(name));
            b.on("pointerout", resting);
            b.on("pointertap", tap);
            this.top.addChild(b);
        };
        if (above.length) button("back", "Back", false, true, () => pick(above.slice(0, -1)));
        button("all", `All ${(above.length ? above[above.length - 1] : this.tab).name.toLowerCase()}`, !on, true, () => pick(above));
        for (const c of level) button(c.icon, c.name, c == on, this.itemsOf(c).length > 0, () => pick(c == on ? above : [...above, c]));
        return x;
    }

    //#endregion

    //#region the grid

    // what you have of a tab or sort (null: everything), and what your heroes have on, in order: gathered things as MATERIALS lists them, made things as RECIPES does
    private itemsOf(c: Category) {
        const sorts = c && sortsOf(c), ids = new Set(IBC.data.inventory.items.keys());
        for (const h of IBC.data.heroes.all()) for (const id of h.d.g ?? []) if (id) ids.add(id);
        return Array.from(ids).filter((id) => !sorts || sorts.includes(sortOf(id))).sort((a, b) => order(a) - order(b));
    }

    // (returns how tall it came to)
    private drawGrid() {
        const { CELL, GAP, COLS } = Inventory, parent = this.grid.content;
        const rowW = COLS * (CELL + GAP) - GAP;
        // everything: under the tabs' headings; a tab: under its sorts' (those shown), but for one picked
        const { level, on } = this.level();
        let y = 0;
        for (const s of !this.tab ? TABS : on ? [on] : level) {
            const ids = this.itemsOf(s);
            if (!ids.length) continue;
            if (!on) { this.heading(`${s.name} (${ids.length})`, 0, y, rowW, parent); y += 11; }
            const at = (i: number): [number, number] => [(i % COLS) * (CELL + GAP), y + Math.floor(i / COLS) * (CELL + GAP)];
            ids.forEach((id, i) => this.cell(id, ...at(i), parent));
            // (the last row filled out, empty)
            for (let i = ids.length; i % COLS; i++) this.emptyCell(...at(i), parent);
            y += Math.ceil(ids.length / COLS) * (CELL + GAP) + 3;
        }
        if (!y) {
            this.text("Nothing here yet", 2, 4, AP.STONE, parent);
            this.text("What your heroes gather and craft comes here", 2, 15, AP.STEEL, parent);
            return 26;
        }
        return y;
    }

    // a slot: its sprite, how many in the corner, edged in its quality's colour (Fine and up); pointed
    // at, lifted a px and what it is over the pointer; clicked, it opens
    private cell(id: number, x: number, y: number, parent: PIXI.Container) {
        const { CELL } = Inventory, amount = IBC.data.inventory.items.get(id)?.amount ?? 0, q = qualityOf(id);
        // (none in the stash: it's only here as one of your heroes has it on)
        const wearers = wearersOf(id), held = amount > 0, supply = SUPPLIES.includes(recipeOf(id)?.type);
        const cell = new PIXI.Container();
        cell.position.set(x, y);
        const box = new PIXI.Graphics();
        const paint = (over: boolean) => box.clear()
            .beginFill(over ? (q ? AP.WHITE : AP.STONE) : q ? QUALITY_COLOURS[q] : AP.BLACK).drawRect(0, 0, CELL, CELL).endFill()
            .beginFill(over ? AP.IRON : held ? AP.SLATE : AP.SHADOW).drawRect(1, 1, CELL - 2, CELL - 2).endFill()
            // (a lighter top edge inside, as if lit from above)
            .beginFill(over ? AP.STEEL : held ? AP.IRON : AP.SLATE).drawRect(1, 1, CELL - 2, 1).endFill();
        paint(false);
        cell.addChild(box);
        // (just got more of: a glow fading, update)
        const glow = new PIXI.Graphics()
            .beginFill(AP.PALE, 0.3).drawRect(1, 1, CELL - 2, CELL - 2).endFill()
            .beginFill(AP.PALE).drawRect(0, 0, CELL, 1).drawRect(0, CELL - 1, CELL, 1).drawRect(0, 1, 1, CELL - 2).drawRect(CELL - 1, 1, 1, CELL - 2).endFill();
        glow.alpha = (this.glowing.get(id) ?? 0) / Inventory.GLOW_MS;
        this.glows.set(id, glow);
        cell.addChild(glow);
        const sprite = new PIXI.Sprite(itemTexture(id));
        // (in the middle of the slot; how many over its bottom right)
        const rest = Math.round((CELL - 16) / 2);
        sprite.position.set(rest, rest);
        if (!held) sprite.alpha = 0.45;
        cell.addChild(sprite);
        // how many, in the corner, shadowed to read over the sprite
        if (held) {
            const n = short(amount);
            const shadow = this.text(n, 0, CELL - 7, AP.BLACK, cell);
            const count = this.text(n, 0, CELL - 8, AP.WHITE, cell);
            count.x = CELL - 2 - Math.ceil(count.textWidth);
            shadow.x = count.x + 1;
        }
        // (one of your heroes has one on: a little mark, top left)
        if (wearers.length) cell.addChild(wornMark(2, 2));
        cell.eventMode = "static";
        cell.cursor = "pointer";
        cell.hitArea = new PIXI.Rectangle(0, 0, CELL, CELL);
        // what it is: its name (in its quality's colour), its tier and quality, how many, what it does
        const worth = itemWorth(id);
        const says: [string, number][] = [
            [itemName(id), q ? QUALITY_COLOURS[q] : AP.WHITE],
            [`Tier ${itemTier(id)}${q ? `, ${QUALITY_NAMES[q]}` : ""} - ${held ? `${amount.toLocaleString("en-US")} held` : supply ? "none left" : "none spare"}`, AP.ASH],
            ...(worth ? [[worth, AP.LIME] as [string, number]] : []),
            ...(wearers.length ? [[`${supply ? "Used" : held ? "Also worn" : "Worn"} by ${namesOf(wearers)}`, AP.STRAW] as [string, number]] : []),
            [held ? "Click for more, drag to use" : "Click for more", AP.STEEL],
        ];
        cell.on("pointerover", (e: PIXI.FederatedPointerEvent) => { paint(true); sprite.y = rest - 1; this.showTip(says, e); });
        cell.on("pointermove", (e: PIXI.FederatedPointerEvent) => this.moveTip(e));
        cell.on("pointerout", () => { paint(false); sprite.y = rest; this.hideTip(); });
        cell.on("pointerdown", (e: PIXI.FederatedPointerEvent) => { this.dragged = false; if (held) this.press = { id, from: e.global.clone() }; });
        cell.on("pointertap", () => { if (!this.dragged) ItemInfo.open(id); });
        parent.addChild(cell);
    }

    // a slot with nothing in it (filling out a row)
    private emptyCell(x: number, y: number, parent: PIXI.Container) {
        const { CELL } = Inventory;
        parent.addChild(new PIXI.Graphics()
            .beginFill(AP.BLACK).drawRect(x, y, CELL, CELL).endFill()
            .beginFill(AP.SHADOW).drawRect(x + 1, y + 1, CELL - 2, CELL - 2).endFill());
    }

    //#endregion

    //#region dragging a slot out

    // after a few px a pressed slot is picked up, its sprite following the pointer; the Market or Trade lit while it's over it
    private dragMove(e: PIXI.FederatedPointerEvent) {
        const p = this.press;
        if (!p) return;
        if (!this.ghost) {
            if (Math.abs(e.global.x - p.from.x) + Math.abs(e.global.y - p.from.y) < Inventory.DRAG_PX) return;
            this.dragged = true;
            this.hideTip();
            this.ghost = new PIXI.Sprite(itemTexture(p.id));
            this.ghost.anchor.set(0.5);
            this.ghost.scale.set(Inventory.SCALE);
            this.ghost.alpha = 0.9;
            this.ghost.eventMode = "none";
            this.ghost.zIndex = Number.MAX_SAFE_INTEGER;
            IBC.pixi.stage.addChild(this.ghost);
        }
        this.ghost.position.set(Math.round(e.global.x), Math.round(e.global.y));
        const market = IBC.comp.getFirstByType(ComponentType.MARKET) as Market;
        const trade = IBC.comp.getFirstByType(ComponentType.TRADE) as Trade;
        const mail = IBC.comp.getFirstByType(ComponentType.MAIL) as Mail;
        const overTrade = Trade.under(e.global), overMail = !overTrade && Mail.under(e.global);
        trade?.dragOver(!!overTrade);
        mail?.dragOver(!!overMail);
        const overGuild = !overTrade && !overMail && !!Guild.under(e.global);
        (IBC.comp.getFirstByType(ComponentType.GUILD_WINDOW) as Guild)?.dragOver(overGuild);
        market?.dragOver(!overTrade && !overMail && !overGuild && !!Market.under(e.global));
        (IBC.comp.getFirstByType(ComponentType.HERO_STATUS) as HeroStatus)?.dragOver(p.id, e.global);
    }

    // let go: over the Market, it's offered there
    private dragEnd(e: PIXI.FederatedPointerEvent) {
        const p = this.press;
        this.press = null;
        if (!p || !this.ghost) return;
        this.dropGhost();
        (IBC.comp.getFirstByType(ComponentType.MARKET) as Market)?.dragOver(false);
        (IBC.comp.getFirstByType(ComponentType.TRADE) as Trade)?.dragOver(false);
        (IBC.comp.getFirstByType(ComponentType.MAIL) as Mail)?.dragOver(false);
        (IBC.comp.getFirstByType(ComponentType.GUILD_WINDOW) as Guild)?.dragOver(false);
        (IBC.comp.getFirstByType(ComponentType.HERO_STATUS) as HeroStatus)?.dragOver(0);
        if (HeroStatus.under(e.global)?.drop(p.id, e.global)) return;
        const trade = Trade.under(e.global), mail = !trade && Mail.under(e.global), guild = !trade && !mail && Guild.under(e.global);
        if (trade) trade.offer(p.id);
        else if (mail) mail.offer(p.id);
        else if (guild) guild.offer(p.id);
        else Market.under(e.global)?.offer(p.id);
    }

    private dropGhost() {
        if (!this.ghost) return;
        this.ghost.destroy();
        this.ghost = null;
    }

    //#endregion

    //#region bits

    // a few lines, each its own colour, in a box over the pointer (as chat's times are)
    private showTip(rows: [string, number][], e: PIXI.FederatedPointerEvent) {
        this.tip.removeChildren().forEach((c) => c.destroy({ children: true }));
        const back = new PIXI.Graphics();
        this.tip.addChild(back);
        const w = Math.max(...rows.map(([text, tint], i) => Math.ceil(this.text(text, 3, 2 + i * 10, tint, this.tip).textWidth))) + 6;
        const h = 11 + (rows.length - 1) * 10;
        back.beginFill(AP.BLACK).drawRect(0, 0, w, h).endFill().beginFill(AP.SHADOW).drawRect(1, 1, w - 2, h - 2).endFill();
        this.tip.visible = true;
        this.moveTip(e);
    }

    // (kept inside the window: over the pointer, or under it if there's no room over)
    private moveTip(e: PIXI.FederatedPointerEvent) {
        if (!this.tip.visible) return;
        const p = this.content.toLocal(e.global), h = this.tip.height;
        const y = p.y - 2 - h >= 0 ? p.y - 2 - h : Math.min(p.y + 10, Inventory.H - h);
        this.tip.position.set(Math.round(Math.max(0, Math.min(p.x + 4, Inventory.W - this.tip.width))), Math.round(y));
    }

    private hideTip() {
        if (this.tip) this.tip.visible = false;
    }

    private text(text: string, x: number, y: number, tint: number, parent: PIXI.Container) {
        const t = new PIXI.BitmapText(text, { fontName: Constants.PIXEL_FONT, fontSize: 32 });
        t.tint = tint;
        t.position.set(x, y);
        t.eventMode = "none";
        parent.addChild(t);
        return t;
    }

    // a heading with a rule from it to the end of the row
    private heading(text: string, x: number, y: number, w: number, parent: PIXI.Container) {
        const t = this.text(text, x, y, AP.STRAW, parent);
        const from = x + Math.ceil(t.textWidth) + 4;
        parent.addChild(new PIXI.Graphics().beginFill(AP.IRON).drawRect(from, y + 3, x + w - from, 1).endFill());
    }

    //#endregion

}

// the tabs: their sorts the to-do list's gather and craft tabs' (the sorts things are of: a
// gathered thing's what it is, a made thing's its recipe's)
const TABS: Category[] = [
    { name: "Gathered", icon: "gather", kids: CATEGORIES[TaskKind.GATHER] },
    { name: "Crafted", icon: "craft", kids: CATEGORIES[TaskKind.CRAFT] },
];
// your heroes with one on (a potion or meal: in their slot, to use)
function wearersOf(id: number) {
    return IBC.data.heroes.all().filter((h) => h.d.g?.includes(id));
}

// "Ana", "Ana and Bo", "Ana, Bo and Cy", "Ana, Bo, Cy and 2 more"
function namesOf(heroes: { d: { n: string } }[]) {
    const names = heroes.map((h) => h.d.n);
    if (names.length > 3) return `${names.slice(0, 3).join(", ")} and ${names.length - 3} more`;
    return names.length > 1 ? `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}` : names[0];
}

// a little shield, edged in black (7x8, over the sprite's corner)
function wornMark(x: number, y: number) {
    const g = new PIXI.Graphics()
        .beginFill(AP.BLACK).drawRect(0, 0, 7, 6).drawRect(1, 6, 5, 1).drawRect(2, 7, 3, 1).endFill()
        .beginFill(AP.STRAW).drawRect(1, 1, 5, 4).drawRect(2, 5, 3, 1).endFill()
        .beginFill(AP.OCHRE).drawRect(3, 1, 1, 5).endFill();
    g.position.set(x - 1, y - 1);
    g.eventMode = "none";
    return g;
}

function sortOf(id: number): string {
    return materialOf(id)?.type ?? recipeOf(id)?.type ?? "material";
}

// a count to fit a slot: 999, 1.2k, 12k, 1.2m
function short(n: number) {
    if (n < 1000) return String(n);
    if (n < 10000) return `${Math.floor(n / 100) / 10}k`;
    if (n < 1000000) return `${Math.floor(n / 1000)}k`;
    return `${Math.floor(n / 100000) / 10}m`;
}
