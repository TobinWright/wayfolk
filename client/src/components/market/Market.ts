import * as PIXI from "pixi.js";
import {
    HISTORY_DAYS, historySummary, isItem, itemMatches, itemOrder, ListingRow, listingProblem, LISTING_MS, orderProblem, OrderRow, PriceHistory, SaleRow,
    SHOWN_MOST, Sort, sortOf, SORTS,
} from "../../../../shared/Market";
import { MATERIALS } from "../../../../shared/Locations";
import { hasQuality, itemName, Quality, RECIPES, withQuality } from "../../../../shared/Tasks";
import { chestIcon, coinIcon, infoIcon } from "../../art/MenuIcons";
import { TASK_ICON, taskIcon } from "../../art/TaskIcons";
import { Event } from "../../constants/Events";
import { AP } from "../../constants/Palette";
import { IBC } from "../../Engine";
import { picTexture } from "../../people/People";
import { Panel } from "../../shared/Panel";
import { ScrollView } from "../../shared/ui/ScrollView";
import { TitleBar } from "../../shared/ui/titlebar/TitleBar";
import { BaseComponent, ComponentType } from "../BaseComponent";
import { Chat } from "../chat/Chat";
import { button, text, textWidth, Tip } from "../games/GameUI";
import { fit } from "../heroroster/HeroRoster";
import { itemTexture } from "../inventory/Item";
import { ItemInfo } from "../iteminfo/ItemInfo";

// The market (the user, 2026-10-28: "an auction house for players... drag
// items from their inventory into the market window"; the rules are
// shared/Market.ts, the layout Claude's). From the main menu. Three tabs:
// Browse - everything on the market by sort (the inventory's icons) and a
// search, a row a listing (the thing, how many, gold each, who's selling,
// time left), clicked to buy some or all -; Wanted - the buy orders the same
// way (the user, 2026-10-30), clicked to sell to one from your stash, and
// under them the things your search matches, clicked to post an order for
// one -; and Yours - your listings and orders (Take down) and your last
// sales. How it works, hovering the "i" by your gold; the chest by it opens the
// Inventory. Along the bottom, only while it has something to show, a bar: something dragged from the Inventory and
// let go over the window opens the sell form there (how many, gold each -
// the cheapest of the others' as it starts -, the total, List), Browse
// searching for it so you see what it goes for; a listing clicked opens the
// buy form (how many, the total, Buy), an order the form to sell to it, a
// thing the order form (how many, at most each, what's set aside, Order).
// Under each form, what the thing has sold for (the user, 2026-10-30: price
// history): over the last two weeks how many, the average and the range
// each, the last sale and the best order, and a line of each day's average.
// A window like the others; Escape closes a form, then the window.

type Tab = "browse" | "wanted" | "yours";
type Focus = "search" | "amount" | "price" | null;
interface SellForm { kind: "sell"; item: number; n: number; price: number; priceSet: boolean; }
interface BuyForm { kind: "buy"; row: ListingRow; n: number; }
interface OrderForm { kind: "order"; item: number; n: number; price: number; priceSet: boolean; }
interface FillForm { kind: "fill"; row: OrderRow; n: number; }
type Form = SellForm | BuyForm | OrderForm | FillForm;

export class Market extends BaseComponent {

    public static SCALE = 2;
    public static W = 300;              // its content, in its own px
    public static H = 254;
    public static TAB_H = 13;
    public static FILTER_Y = 17;        // (Browse, Wanted) the sorts and the search
    public static HEAD_Y = 34;          // (Browse, Wanted) the column heads
    public static LIST_Y = 44;
    public static BAR_H = 66;
    public static BAR_Y = Market.H - Market.BAR_H;
    public static ROW = 18;
    public static SORT = 14;            // a sort's square
    // columns (right edges for numbers)
    public static NAME_X = 20;
    public static QTY_R = 140;
    public static EACH_R = 182;
    public static SELLER_X = 190;
    public static ENDS_R = 290;
    public static CHART_W = 42;         // the price history's line of days
    public static HISTORY_Y = 45;       // (in the bar) its two lines, and the chart beside them
    // the window round it, in screen px
    public static INSET_X = 12;
    public static INSET_Y = 28;         // (under the title bar)
    public static WIDTH = Market.INSET_X * 2 + Market.W * Market.SCALE;
    public static HEIGHT = Market.INSET_Y + Market.H * Market.SCALE + Market.INSET_X;
    public static REFRESH_MS = 15000;   // asked for again while open
    public static SEARCH_MS = 300;      // (after the last key typed in the search)
    public static BLINK_MS = 500;
    public static SAID_MS = 6000;       // what came of the last thing done, shown in the bar
    public static HISTORY_MS = 60000;   // a thing's price history asked for again after this
    public static WANT_SHOWN = 12;      // things your search matches, to post an order for
    public static AMOUNT_MOST = 999999; // (an order's amount, typed)

    private tab: Tab = "browse";
    private sort: Sort | "" = "";
    private search = "";
    private focus: Focus = null;
    private typed = false;              // (a number field: typed in since it was clicked, so a digit adds on, not replaces)
    private form: Form = null;
    private said = "";
    private saidOk = true;
    private saidAt = 0;
    private dropping = false;           // (something from the Inventory dragged over the window)
    private barShown = false;           // (the bar is up, the list stopping above it)

    private rows: ListingRow[] = [];
    private orders: OrderRow[] = [];    // (Wanted)
    private matched = 0;
    private mine: ListingRow[] = [];
    private myOrders: OrderRow[] = [];
    private sales: SaleRow[] = [];
    private most = 0;
    private ordersMost = 0;
    private listed = false;             // (Browse's or Wanted's list has come since it was last asked for)
    private selected = -1;              // (the listing or order whose form is open)
    private histories = new Map<number, { at: number, h: PriceHistory }>();

    private searchAt = 0;               // (when to ask for the search typed)
    private refreshTime = 0;
    private blink = 0;

    public background: Panel;
    public titleBar: TitleBar;
    private content: PIXI.Container;
    private top: PIXI.Container;
    private filters: PIXI.Container;
    private list: ScrollView;
    private bar: PIXI.Container;
    private caret: PIXI.Graphics;
    private tip: Tip;

    private keys = (e: KeyboardEvent) => this.onKey(e);
    private paste = (e: ClipboardEvent) => {
        if (this.focus != "search") return;
        this.setSearch(this.search + (e.clipboardData?.getData("text") ?? "").replace(/\s+/g, " "));
    };

    constructor() {
        super(ComponentType.MARKET);
        this.create();
    }

    // the window (one open at a time)
    public static open() {
        const view = IBC.comp.getOrCreate(ComponentType.MARKET) as Market;
        view.bringToTop();
        return view;
    }

    // the window, if it's open and under a point on the screen
    public static under(global: PIXI.IPointData) {
        const view = IBC.comp.getFirstByType(ComponentType.MARKET) as Market;
        return view && view.container.getBounds().contains(global.x, global.y) ? view : null;
    }

    public create() {
        super.create();
        const { WIDTH, HEIGHT, W, H, SCALE, INSET_X, INSET_Y } = Market;
        this.container.eventMode = "static";
        this.container.hitArea = new PIXI.Rectangle(0, 0, WIDTH, HEIGHT);
        this.container.on("pointerdown", (e: PIXI.FederatedPointerEvent) => { e.stopPropagation(); this.setFocus(null); });
        this.container.on("wheel", (e: PIXI.FederatedWheelEvent) => e.stopPropagation());

        this.background = new Panel(this.container);
        this.background.setSize(WIDTH, HEIGHT);
        this.titleBar = new TitleBar(this);
        this.titleBar.setPosition(4, 4);
        this.titleBar.setSize(WIDTH - 8, 20);
        this.titleBar.setTitle("Market");

        this.content = new PIXI.Container();
        this.content.scale.set(SCALE);
        this.content.position.set(INSET_X, INSET_Y);
        this.container.addChild(this.content);
        // (the panel's middle lets the map through)
        this.content.addChild(new PIXI.Graphics().beginFill(AP.INK).drawRect(-4, -2, W + 8, H + 6).endFill());
        this.top = new PIXI.Container();
        this.filters = new PIXI.Container();
        this.bar = new PIXI.Container();
        this.bar.y = Market.BAR_Y;
        this.content.addChild(this.top, this.filters, this.bar);
        this.list = new ScrollView(this.content, W, 10);
        this.caret = keep = new PIXI.Graphics().beginFill(AP.WHITE).drawRect(0, 0, 1, 8).endFill();
        this.tip = new Tip(this.content, W);

        window.addEventListener("keydown", this.keys, true);     // (first, so the others see it's taken)
        document.addEventListener("paste", this.paste);
        IBC.events.register(Event.MARKET_LIST, (o: { rows: ListingRow[], n: number }) => this.gotList(o.rows, o.n), this);
        IBC.events.register(Event.MARKET_WANTED, (o: { rows: OrderRow[], n: number }) => this.gotWanted(o.rows, o.n), this);
        IBC.events.register(Event.MARKET_MINE, (o: { rows: ListingRow[], sales: SaleRow[], most: number, orders: OrderRow[], ordersMost: number }) => {
            this.mine = o.rows; this.sales = o.sales; this.most = o.most; this.myOrders = o.orders ?? []; this.ordersMost = o.ordersMost ?? 0;
            if (this.tab == "yours") this.drawList(true);
            this.drawBar();
        }, this);
        IBC.events.register(Event.MARKET_HISTORY, (h: PriceHistory) => this.gotHistory(h), this);
        IBC.events.register(Event.MARKET_DONE, (what: string) => this.done(what), this);
        IBC.events.register(Event.MARKET_REFUSED, (why: string) => { this.say(why, false); this.ask(); }, this);
        IBC.events.register(Event.MARKET_CHANGED, () => this.ask(), this);
        IBC.events.register(Event.HERO_STASH, () => { this.drawTop(); this.drawBar(); }, this);
        IBC.events.register(Event.MAP_POINTER_DOWN, () => this.setFocus(null), this);
        IBC.events.register(Event.CHAT_TYPING, (on: boolean) => { if (on) this.setFocus(null); }, this);

        // (right of the Inventory, so the two sit side by side)
        const x = Math.round(window.innerWidth / 2 + 26);
        this.setPosition(Math.max(0, Math.min(x, window.innerWidth - WIDTH)), Math.max(0, Math.round((window.innerHeight - HEIGHT) / 2) - 20));
        this.drawAll();
        this.ask();
    }

    public destroy() {
        super.destroy();
        window.removeEventListener("keydown", this.keys, true);
        document.removeEventListener("paste", this.paste);
        this.focus = null;
        this.list.destroy();
        this.titleBar.destroy();
        this.background.destroy();
        this.caret.destroy();
        this.container.destroy({ children: true });
    }

    public update(deltaTime: number) {
        if (this.focus) {
            this.blink += deltaTime;
            this.caret.visible = Math.floor(this.blink / Market.BLINK_MS) % 2 == 0;
        }
        if (this.searchAt && Date.now() >= this.searchAt) { this.searchAt = 0; this.askList(); }
        if (this.said && Date.now() - this.saidAt > Market.SAID_MS) { this.said = ""; this.drawBar(); }
        if ((this.refreshTime += deltaTime) >= Market.REFRESH_MS) this.ask();
    }

    //#region asking the server

    private ask() {
        this.refreshTime = 0;
        this.askList();
        IBC.net.market.mine();
        const item = this.formItemId();
        if (item != null) this.askHistory(item, true);
    }

    // Browse's listings, or Wanted's orders
    private askList() {
        this.listed = false;
        if (this.tab == "wanted") IBC.net.market.wanted(this.sort, this.search.trim());
        else IBC.net.market.list(this.sort, this.search.trim());
    }

    // what a thing's sold for (unless it's been asked for lately, or `again`)
    private askHistory(item: number, again = false) {
        const had = this.histories.get(item);
        if (!again && had && Date.now() - had.at < Market.HISTORY_MS) return;
        IBC.net.market.history(item);
    }

    private gotList(rows: ListingRow[], n: number) {
        if (this.tab == "wanted") return;
        this.rows = rows;
        this.matched = n;
        this.listed = true;
        // the buy form's listing as it is now (gone: the form goes)
        const f = this.form;
        if (f?.kind == "buy") {
            const now = rows.find((r) => r[0] == f.row[0]);
            if (now) { f.row = now; f.n = Math.min(f.n, now[2]); } else if (rows.length < SHOWN_MOST) this.closeForm();
        }
        // a new sell form's price: the cheapest of anyone else's of it
        if (f?.kind == "sell" && !f.priceSet) {
            const others = rows.filter((r) => r[1] == f.item && r[4] != IBC.data.player.id);
            if (others.length) f.price = Math.min(...others.map((r) => r[3]));
            f.priceSet = true;
        }
        if (this.tab == "browse") this.drawList(true);
        this.drawBar();
    }

    private gotWanted(rows: OrderRow[], n: number) {
        if (this.tab != "wanted") return;
        this.orders = rows;
        this.matched = n;
        this.listed = true;
        // the fill form's order as it is now (gone: the form goes)
        const f = this.form;
        if (f?.kind == "fill") {
            const now = rows.find((r) => r[0] == f.row[0]);
            if (now) { f.row = now; f.n = Math.min(f.n, this.mostOf(f)); } else if (rows.length < SHOWN_MOST) this.closeForm();
        }
        this.drawList(true);
        this.drawBar();
    }

    // a new order form's price: what it last sold for, else the best order's
    private gotHistory(h: PriceHistory) {
        this.histories.set(h.i, { at: Date.now(), h });
        const f = this.form;
        if (f?.kind == "order" && f.item == h.i && !f.priceSet) {
            f.price = h.l || h.w || h.c;
            f.priceSet = true;
        }
        if (this.formItemId() == h.i) this.drawBar();
    }

    private done(what: string) {
        this.closeForm();
        this.say(what, true);
        this.ask();
    }

    private say(text: string, ok: boolean) {
        this.said = text;
        this.saidOk = ok;
        this.saidAt = Date.now();
        this.drawBar();
    }

    //#endregion

    //#region dropping things from the Inventory

    // something dragged from the Inventory is over the window (or not): the bar lit
    public dragOver(over: boolean) {
        if (over == this.dropping) return;
        this.dropping = over;
        this.drawBar();
    }

    // something from your stash, let go over the window: the sell form for it,
    // Browse showing what it's going for
    public offer(item: number) {
        this.dropping = false;
        this.bringToTop();
        const have = IBC.data.inventory.items.get(item)?.amount ?? 0;
        if (!have) return;
        this.form = { kind: "sell", item, n: have, price: 0, priceSet: false };
        this.selected = -1;
        this.said = "";
        this.tab = "browse";
        this.sort = "";
        this.search = itemName(item);
        this.setFocus("price");
        this.drawAll();
        this.askList();
        this.askHistory(item);
    }

    //#endregion

    //#region typing

    private setFocus(focus: Focus) {
        if (focus == this.focus) return;
        this.focus = focus;
        this.typed = false;
        this.blink = 0;
        if (focus) Chat.stop();
        this.drawFilters();
        this.drawBar();
    }

    private onKey(e: KeyboardEvent) {
        if (e.ctrlKey || e.metaKey || e.altKey) return;
        const f = this.focus;
        if (!f) {
            if (Chat.takes(e)) return;
            if (e.key == "Escape") { if (this.form) this.closeForm(); else IBC.comp.destroy(this); }
            else if (e.key == "Enter" && this.form) this.confirm();
            else return;
            (e as any).chat = true;     // (taken: the chat and other windows leave it)
            e.preventDefault();
            return;
        }
        (e as any).chat = true;
        e.preventDefault();
        this.blink = 0;
        if (e.key == "Escape") return this.setFocus(null);
        if (f == "search") {
            if (e.key == "Enter") this.setFocus(null);
            else if (e.key == "Backspace") this.setSearch(this.search.slice(0, -1));
            else if (e.key.length == 1) this.setSearch(this.search + e.key);
            return;
        }
        if (e.key == "Enter") return this.confirm();
        const priced = this.priced();
        if (e.key == "Tab" && priced) return this.setFocus(f == "price" ? "amount" : "price");
        if (e.key == "ArrowUp") return this.stepAmount(1);
        if (e.key == "ArrowDown") return this.stepAmount(-1);
        const now = f == "amount" ? this.form?.n ?? 0 : priced?.price ?? 0;
        let digits = this.typed ? String(now) : "";
        if (e.key == "Backspace") digits = (this.typed ? digits : String(now)).slice(0, -1);
        else if (/^[0-9]$/.test(e.key)) digits = (digits + e.key).replace(/^0+/, "").slice(0, 9);
        else return;
        this.typed = true;
        this.setNumber(f, Number(digits) || 0);
    }

    private setSearch(search: string) {
        this.search = search.slice(0, 30);
        this.searchAt = Date.now() + Market.SEARCH_MS;
        this.drawFilters();
        if (this.tab == "wanted") this.drawList(true);     // (the things it matches, to order)
    }

    //#endregion

    //#region the forms

    // the form open, if you set its price (selling or ordering)
    private priced() {
        const f = this.form;
        return f?.kind == "sell" || f?.kind == "order" ? f : null;
    }

    // the thing the form's for (null: none open)
    private formItemId() {
        const f = this.form;
        return !f ? null : f.kind == "buy" || f.kind == "fill" ? f.row[1] : f.item;
    }

    private have(item: number) {
        return IBC.data.inventory.items.get(item)?.amount ?? 0;
    }

    // how many there can be: all you have, all that's listed or wanted (and
    // you have), or (an order) any number
    private mostOf(form: Form) {
        switch (form.kind) {
            case "sell": return this.have(form.item);
            case "buy": return form.row[2];
            case "fill": return Math.min(form.row[2], this.have(form.row[1]));
            case "order": return Market.AMOUNT_MOST;
        }
    }

    private setNumber(field: Focus, n: number) {
        const f = this.form;
        if (!f) return;
        if (field == "amount") f.n = Math.max(0, Math.min(this.mostOf(f), n));
        else if (f.kind == "sell" || f.kind == "order") { f.price = n; f.priceSet = true; }
        this.drawBar();
    }

    private stepAmount(by: number) {
        if (this.form) this.setNumber("amount", Math.max(1, this.form.n + by));
    }

    private closeForm() {
        this.form = null;
        this.selected = -1;
        this.focus = null;
        this.drawFilters();
        if (this.tab != "yours") this.drawList(true);
        this.drawBar();
    }

    // a listing clicked: yours goes to Yours, anyone else's opens the buy form
    private pick(row: ListingRow) {
        if (row[4] == IBC.data.player.id) { this.setTab("yours"); return; }
        this.openForm({ kind: "buy", row, n: row[2] }, row[0]);
    }

    // an order clicked: yours goes to Yours, anyone else's opens the form to sell to it
    private pickOrder(row: OrderRow) {
        if (row[4] == IBC.data.player.id) { this.setTab("yours"); return; }
        const f: FillForm = { kind: "fill", row, n: 0 };
        f.n = this.mostOf(f);
        this.openForm(f, row[0]);
    }

    // a thing clicked, to post an order for
    private want(item: number) {
        this.openForm({ kind: "order", item, n: 1, price: 0, priceSet: false }, -1);
        this.setFocus("amount");
    }

    private openForm(form: Form, selected: number) {
        this.form = form;
        this.selected = selected;
        this.said = "";
        this.focus = null;
        this.drawFilters();
        this.drawList(true);
        this.drawBar();
        this.askHistory(this.formItemId());
    }

    // what's in the way of the form going ahead ("" nothing)
    private problem(f: Form) {
        const gold = IBC.data.inventory.gold ?? 0;
        switch (f.kind) {
            case "sell": {
                const have = this.have(f.item);
                if (!have) return "None left in your stash";
                if (this.mine.length >= this.most && this.most && !this.toOrders(f)) return `You can have ${this.most} listings at once`;
                return listingProblem(f.n, f.price, have);
            }
            case "buy":
                if (f.n < 1) return "Buy at least one";
                if (f.n * f.row[3] > gold) return "Not enough gold";
                return "";
            case "fill":
                if (!this.have(f.row[1])) return "You have none";
                if (f.n < 1) return "Sell at least one";
                return "";
            case "order":
                if (this.myOrders.length >= this.ordersMost && this.ordersMost) return `You can have ${this.ordersMost} buy orders at once`;
                return orderProblem(f.n, f.price, gold);
        }
    }

    // (a sell form) whether all of it would go to buy orders as far as we know
    private toOrders(f: SellForm) {
        const h = this.histories.get(f.item)?.h;
        return !!h && f.price > 0 && f.price <= h.w && f.n <= h.x;
    }

    private confirm() {
        const f = this.form;
        if (!f || this.problem(f)) return;
        switch (f.kind) {
            case "sell": IBC.net.market.sell(f.item, f.n, f.price); break;
            case "buy": IBC.net.market.buy(f.row[0], f.n, f.row[3]); break;
            case "fill": IBC.net.market.fill(f.row[0], f.n, f.row[3]); break;
            case "order": IBC.net.market.order(f.item, f.n, f.price); break;
        }
        this.setFocus(null);
    }

    //#endregion

    //#region drawing

    private drawAll() {
        this.drawTop();
        this.drawFilters();
        this.drawList(false);
        this.drawBar();
    }

    private setTab(tab: Tab) {
        if (tab == this.tab) return;
        this.tab = tab;
        this.setFocus(null);
        // (a form for a row of the tab left goes; a sell or order form stays)
        if (this.form?.kind == "buy" || this.form?.kind == "fill") { this.form = null; this.selected = -1; }
        this.rows = [];
        this.orders = [];
        this.matched = 0;
        this.drawAll();
        this.ask();
    }

    // the tabs, and your gold on the right
    private drawTop() {
        const { W, TAB_H } = Market, inv = IBC.data.inventory;
        clear(this.top);
        let x = 0;
        const tabs: [Tab, string][] = [["browse", "Browse"], ["wanted", "Wanted"], ["yours", "Yours"]];
        for (const [tab, label] of tabs) {
            const on = tab == this.tab, w = textWidth(label) + 10;
            const t = new PIXI.Container();
            t.position.set(x, 0);
            const back = new PIXI.Graphics();
            const paint = (over: boolean) => back.clear()
                .beginFill(on ? AP.LIME : AP.BLACK).drawRect(0, 0, w, TAB_H).endFill()
                .beginFill(on ? AP.IRON : over ? AP.STONE : AP.SLATE).drawRect(1, 1, w - 2, TAB_H - 2).endFill();
            paint(false);
            t.addChild(back);
            text(label, 5, 3, on ? AP.WHITE : AP.ASH, t);
            t.eventMode = "static";
            t.cursor = "pointer";
            t.hitArea = new PIXI.Rectangle(0, 0, w, TAB_H);
            t.on("pointerover", () => paint(true));
            t.on("pointerout", () => paint(false));
            t.on("pointertap", () => this.setTab(tab));
            this.top.addChild(t);
            x += w + 2;
        }
        const gold = text((inv.gold ?? 0).toLocaleString("en-US"), 0, 3, AP.STRAW, this.top);
        gold.x = W - Math.ceil(gold.textWidth);
        const coin = new PIXI.Sprite(coinTexture());
        coin.position.set(gold.x - 10, 3);
        this.top.addChild(coin);
        // how it works, hovering the "i"
        const info = new PIXI.Sprite(picTexture(infoIcon()));
        info.position.set(coin.x - 11, 3);
        this.top.addChild(info);
        // the Inventory, opened by the chest
        const chest = new PIXI.Sprite(picTexture(chestIcon()));
        chest.position.set(info.x - 11, 3);
        chest.eventMode = "static";
        chest.cursor = "pointer";
        chest.hitArea = new PIXI.Rectangle(-3, -3, 13, TAB_H);
        chest.on("pointerover", (e: PIXI.FederatedPointerEvent) => this.tip.show(["Open Inventory"], e));
        chest.on("pointermove", (e: PIXI.FederatedPointerEvent) => this.tip.move(e));
        chest.on("pointerout", () => this.tip.hide());
        chest.on("pointertap", () => IBC.comp.getOrCreate(ComponentType.INVENTORY));
        this.top.addChild(chest);
        this.tip.zone(info.x - 3, 0, 13, TAB_H, [
            "To sell something, drag it here from your Inventory",
            "Click a listing to buy it",
            "Want something? Post a buy order for it in Wanted",
            "Click someone's order in Wanted to sell to them",
            `Listings and orders last ${LISTING_MS / 3600000}h`,
        ], this.top);
    }

    // (Browse, Wanted) the sorts, the search, the column heads
    private drawFilters() {
        const { W, SORT, FILTER_Y, HEAD_Y } = Market;
        clear(this.filters);
        if (this.tab == "yours") return;
        const sorts = [{ sort: "" as Sort | "", name: "All", icon: "all" }, ...SORTS];
        const pad = (SORT - TASK_ICON) / 2;
        let x = 0;
        for (const s of sorts) {
            const on = s.sort == this.sort;
            const b = new PIXI.Container();
            b.position.set(x, FILTER_Y);
            x += SORT + 1;
            const back = new PIXI.Graphics();
            const paint = (over: boolean) => back.clear()
                .beginFill(on ? AP.LIME : AP.BLACK).drawRect(0, 0, SORT, SORT).endFill()
                .beginFill(on ? AP.IRON : over ? AP.STONE : AP.SLATE).drawRect(1, 1, SORT - 2, SORT - 2).endFill();
            paint(false);
            b.addChild(back);
            const icon = new PIXI.Sprite(taskIcon(s.icon));
            icon.position.set(pad, pad);
            b.addChild(icon);
            b.eventMode = "static";
            b.cursor = "pointer";
            b.hitArea = new PIXI.Rectangle(0, 0, SORT, SORT);
            b.on("pointerover", (e: PIXI.FederatedPointerEvent) => { paint(true); this.tip.show([s.name], e); });
            b.on("pointermove", (e: PIXI.FederatedPointerEvent) => this.tip.move(e));
            b.on("pointerout", () => { paint(false); this.tip.hide(); });
            b.on("pointertap", () => { if (!on) { this.sort = s.sort; this.drawFilters(); this.askList(); } });
            this.filters.addChild(b);
        }

        // the search: clicked to type; a cross to clear it
        const fx = x + 4, fw = W - fx, typing = this.focus == "search";
        const field = new PIXI.Graphics()
            .beginFill(typing ? AP.LIME : AP.BLACK).drawRect(0, 0, fw, SORT).endFill()
            .beginFill(typing ? AP.SLATE : AP.SHADOW).drawRect(1, 1, fw - 2, SORT - 2).endFill();
        field.position.set(fx, FILTER_Y);
        field.eventMode = "static";
        field.cursor = "text";
        field.on("pointerdown", (e: PIXI.FederatedPointerEvent) => { e.stopPropagation(); this.setFocus("search"); });
        this.filters.addChild(field);
        let shown = this.search;
        while (shown && textWidth(shown) > fw - 20) shown = shown.slice(1);
        const t = text(shown || (typing ? "" : this.tab == "wanted" ? "Search (or to order something)" : "Search"), fx + 4, FILTER_Y + 3, shown ? AP.WHITE : AP.IRON, this.filters);
        if (typing) this.putCaret(this.filters, fx + 4 + (shown ? Math.ceil(t.textWidth) + 1 : 0), FILTER_Y + 2.5);
        if (this.search) {
            const cross = text("x", fx + fw - 9, FILTER_Y + 3, AP.STONE, this.filters);
            const hit = new PIXI.Container();
            hit.eventMode = "static";
            hit.cursor = "pointer";
            hit.hitArea = new PIXI.Rectangle(fx + fw - 12, FILTER_Y, 12, SORT);
            hit.on("pointerover", () => { cross.tint = AP.WHITE; });
            hit.on("pointerout", () => { cross.tint = AP.STONE; });
            hit.on("pointerdown", (e: PIXI.FederatedPointerEvent) => {
                e.stopPropagation(); this.search = ""; this.searchAt = 0; this.drawFilters(); this.askList();
                if (this.tab == "wanted") this.drawList(true);
            });
            this.filters.addChild(hit);
        }

        // the column heads
        const head = (label: string, at: number, right: boolean) => text(label, right ? at - textWidth(label) : at, HEAD_Y, AP.STONE, this.filters);
        head("Item", Market.NAME_X, false);
        head("Qty", Market.QTY_R, true);
        head(this.tab == "wanted" ? "Pays" : "Each", Market.EACH_R, true);
        head(this.tab == "wanted" ? "Buyer" : "Seller", Market.SELLER_X, false);
        head("Ends", Market.ENDS_R, true);
        this.filters.addChild(new PIXI.Graphics().beginFill(AP.IRON).drawRect(0, HEAD_Y + 8, W, 1).endFill());
    }

    // the list: Browse's listings, Wanted's orders, or yours (kept scrolled where it was if `keep`)
    private drawList(keep: boolean) {
        const { W, H, LIST_Y, FILTER_Y, BAR_Y } = Market;
        const ratio = this.list.scrollRatio;
        this.list.destroy();
        const y = this.tab == "yours" ? FILTER_Y : LIST_Y;
        const h = (this.barShown ? BAR_Y - 3 : H) - y;
        this.list = new ScrollView(this.content, W, h);
        this.list.position(0, y);
        this.list.container.hitArea = new PIXI.Rectangle(0, 0, W, h);
        this.content.addChild(this.bar);       // (the bar and the tip over the list)
        this.tip.raise();
        const parent = this.list.content;
        const tall = this.tab == "browse" ? this.drawBrowse(parent) : this.tab == "wanted" ? this.drawWanted(parent) : this.drawYours(parent);
        this.list.setContentHeight(Math.max(tall, 1));
        this.list.scrollTo(keep ? ratio : 0);
    }

    private drawBrowse(parent: PIXI.Container) {
        const { ROW } = Market;
        if (!this.rows.length) {
            const what = !this.listed ? "Looking..." : this.search || this.sort ? "Nothing like that on the market" : "Nothing on the market yet";
            text(what, 2, 4, AP.STONE, parent);
            if (this.listed) text("Drag things here from your Inventory to sell them,", 2, 16, AP.IRON, parent);
            if (this.listed) text("or post a buy order for what you want in Wanted", 2, 26, AP.IRON, parent);
            return 38;
        }
        this.rows.forEach((row, k) => this.offerRow(row, k * ROW, parent, false, false));
        let h = this.rows.length * ROW;
        if (this.matched > this.rows.length) {
            text(`${this.matched - this.rows.length} more - search to narrow it down`, 2, h + 4, AP.STONE, parent);
            h += 16;
        }
        return h;
    }

    // the orders, then the things your search matches, to order one
    private drawWanted(parent: PIXI.Container) {
        const { ROW } = Market;
        let y = 0;
        if (!this.orders.length) {
            const what = !this.listed ? "Looking..." : this.search || this.sort ? "Nobody's after anything like that" : "Nobody's after anything yet";
            text(what, 2, y + 4, AP.STONE, parent);
            y += 16;
        } else {
            this.orders.forEach((row) => { this.offerRow(row, y, parent, false, true); y += ROW; });
            if (this.matched > this.orders.length) {
                text(`${this.matched - this.orders.length} more - search to narrow it down`, 2, y + 4, AP.STONE, parent);
                y += 16;
            }
        }
        y += 4;
        y = this.heading("Post a buy order", y, parent);
        const q = this.search.trim();
        if (!q) {
            text("Search for what you want, then click it here", 2, y + 2, AP.STONE, parent);
            return y + 14;
        }
        const things = wantable().filter((id) => itemMatches(id, q) && (!this.sort || sortOf(id) == this.sort));
        if (!things.length) {
            text("Nothing's called that", 2, y + 2, AP.STONE, parent);
            return y + 14;
        }
        for (const id of things.slice(0, Market.WANT_SHOWN)) { this.wantRow(id, y, parent); y += ROW; }
        if (things.length > Market.WANT_SHOWN) {
            text(`${things.length - Market.WANT_SHOWN} more - search to narrow it down`, 2, y + 4, AP.STONE, parent);
            y += 16;
        }
        return y;
    }

    // a listing or an order: the thing, how many, gold each, who (Browse,
    // Wanted) or Take down (Yours), time left
    private offerRow(row: ListingRow | OrderRow, y: number, parent: PIXI.Container, yours: boolean, order: boolean) {
        const { W, ROW, NAME_X, QTY_R, EACH_R, SELLER_X, ENDS_R } = Market;
        const [id, item, n, price, who, name, ends] = row;
        const theirs = who == IBC.data.player.id, picked = id == this.selected && !yours && (order ? this.form?.kind == "fill" : this.form?.kind == "buy");
        const r = new PIXI.Container();
        r.position.set(0, y);
        const back = new PIXI.Graphics();
        const paint = (over: boolean) => back.clear()
            .beginFill(picked ? AP.SLATE : over ? AP.SHADOW : AP.INK).drawRect(0, 0, W - 8, ROW - 1).endFill();
        paint(false);
        r.addChild(back);
        this.itemSprite(item, r);
        fit(text(itemName(item), NAME_X, 5, AP.WHITE, r), QTY_R - 26 - NAME_X);
        const right = (s: string, at: number, tint: number) => text(s, at - textWidth(s), 5, tint, r);
        right(n.toLocaleString("en-US"), QTY_R, AP.ASH);
        right(`${price.toLocaleString("en-US")}g`, EACH_R, AP.STRAW);
        right(timeLeft(ends - Date.now()), ENDS_R, AP.STONE);
        if (!yours) fit(text(theirs ? "You" : name, SELLER_X, 5, theirs ? AP.LIME : AP.ASH, r), ENDS_R - 24 - SELLER_X);
        r.eventMode = "static";
        r.cursor = "pointer";
        r.hitArea = new PIXI.Rectangle(0, 0, W - 8, ROW - 1);
        r.on("pointerover", () => paint(true));
        r.on("pointerout", () => paint(false));
        if (!yours) r.on("pointertap", () => order ? this.pickOrder(row) : this.pick(row));
        parent.addChild(r);
        if (yours) button("Take down", SELLER_X - 2, 4, r, () => order ? IBC.net.market.unorder(id) : IBC.net.market.cancel(id));
    }

    // a thing to post an order for: its name, what's in your stash, Order
    private wantRow(item: number, y: number, parent: PIXI.Container) {
        const { W, ROW, NAME_X } = Market;
        const picked = this.form?.kind == "order" && this.form.item == item;
        const r = new PIXI.Container();
        r.position.set(0, y);
        const back = new PIXI.Graphics();
        const paint = (over: boolean) => back.clear()
            .beginFill(picked ? AP.SLATE : over ? AP.SHADOW : AP.INK).drawRect(0, 0, W - 8, ROW - 1).endFill();
        paint(false);
        r.addChild(back);
        this.itemSprite(item, r);
        fit(text(itemName(item), NAME_X, 5, AP.WHITE, r), 150);
        const have = this.have(item);
        if (have) text(`You have ${have.toLocaleString("en-US")}`, 176, 5, AP.STONE, r);
        r.eventMode = "static";
        r.cursor = "pointer";
        r.hitArea = new PIXI.Rectangle(0, 0, W - 8, ROW - 1);
        r.on("pointerover", () => paint(true));
        r.on("pointerout", () => paint(false));
        r.on("pointertap", () => this.want(item));
        parent.addChild(r);
        const w = textWidth("Order") + 6;
        button("Order", W - 12 - w, 4, r, () => this.want(item));
    }

    // a thing's sprite at the left of a row, clicked for its info
    private itemSprite(item: number, r: PIXI.Container) {
        const sprite = new PIXI.Sprite(itemTexture(item));
        sprite.position.set(1, 0);
        r.addChild(sprite);
        sprite.eventMode = "static";
        sprite.cursor = "help";
        sprite.on("pointerover", (e: PIXI.FederatedPointerEvent) => this.tip.show([`${itemName(item)} (click for more)`], e));
        sprite.on("pointermove", (e: PIXI.FederatedPointerEvent) => this.tip.move(e));
        sprite.on("pointerout", () => this.tip.hide());
        sprite.on("pointertap", (e: PIXI.FederatedPointerEvent) => { e.stopPropagation(); ItemInfo.open(item); });
        return sprite;
    }

    private drawYours(parent: PIXI.Container) {
        const { W, ROW } = Market;
        let y = 0;
        y = this.heading(`Your listings (${this.mine.length}/${this.most || "-"})`, y, parent);
        if (!this.mine.length) {
            text("Nothing listed. Drag things from your Inventory", 2, y + 2, AP.STONE, parent);
            text("onto this window to sell them.", 2, y + 12, AP.STONE, parent);
            y += 26;
        } else {
            this.mine.forEach((row) => { this.offerRow(row, y, parent, true, false); y += ROW; });
            y += 4;
        }
        y = this.heading(`Your buy orders (${this.myOrders.length}/${this.ordersMost || "-"})`, y, parent);
        if (!this.myOrders.length) {
            text("None. Post one from Wanted: search for what you want.", 2, y + 2, AP.STONE, parent);
            y += 16;
        } else {
            this.myOrders.forEach((row) => { this.offerRow(row, y, parent, true, true); y += ROW; });
            y += 4;
        }
        y = this.heading("Your last sales", y, parent);
        if (!this.sales.length) {
            text("Nothing sold yet", 2, y + 2, AP.STONE, parent);
            return y + 14;
        }
        for (const [item, n, gold, buyer, at] of this.sales) {
            const ago = `${timeLeft(Date.now() - at)} ago`;
            const t = text(`${buyer} bought ${n} ${itemName(item)}`, 2, y + 1, AP.ASH, parent);
            const g = `${gold.toLocaleString("en-US")}g`;
            text(g, W - 52 - textWidth(g), y + 1, AP.STRAW, parent);
            text(ago, W - 8 - textWidth(ago), y + 1, AP.STONE, parent);
            fit(t, W - 60 - textWidth(g) - 2);
            y += 10;
        }
        return y + 2;
    }

    // a heading with a rule from it to the end of the row; under it
    private heading(label: string, y: number, parent: PIXI.Container) {
        const t = text(label, 0, y, AP.STRAW, parent);
        const from = Math.ceil(t.textWidth) + 4;
        parent.addChild(new PIXI.Graphics().beginFill(AP.IRON).drawRect(from, y + 3, Market.W - 8 - from, 1).endFill());
        return y + 12;
    }

    // the bar along the bottom: where things are dropped to sell, a form, or what came of the last
    // thing done - gone when there's none of those, the list down to the bottom
    private drawBar() {
        const { W, BAR_H } = Market, f = this.form;
        clear(this.bar);
        const lit = this.dropping;
        const shown = !!(f || lit || this.said);
        this.bar.visible = shown;
        if (shown != this.barShown) { this.barShown = shown; this.drawList(true); }
        if (!shown) return;
        this.bar.addChild(new PIXI.Graphics()
            .beginFill(lit ? AP.LIME : AP.IRON).drawRect(0, 0, W, BAR_H).endFill()
            .beginFill(lit ? AP.FOREST : AP.SHADOW).drawRect(1, 1, W - 2, BAR_H - 2).endFill());
        if (lit) {
            const s = "Let go to sell it";
            text(s, Math.round((W - textWidth(s)) / 2), 28, AP.WHITE, this.bar);
            return;
        }
        if (!f) { fit(text(this.said, 6, 6, this.saidOk ? AP.LIME : AP.FLAME, this.bar), W - 12); return; }
        switch (f.kind) {
            case "sell": this.drawSell(f); break;
            case "buy": this.drawBuy(f); break;
            case "fill": this.drawFill(f); break;
            case "order": this.drawOrder(f); break;
        }
        this.drawHistory(this.formItemId());
    }

    // the thing at the left of a form: its sprite and name, and a line under
    private formItem(item: number, under: string) {
        const sprite = new PIXI.Sprite(itemTexture(item));
        sprite.position.set(4, 4);
        this.bar.addChild(sprite);
        fit(text(itemName(item), 24, 4, AP.WHITE, this.bar), 104);
        fit(text(under, 24, 15, AP.STONE, this.bar), 104);
    }

    // the line under a form: what's wrong, or the total
    private formTotal(why: string, total: string) {
        if (why) fit(text(why, 6, 31, AP.FLAME, this.bar), 170);
        else fit(text(total, 6, 31, AP.STRAW, this.bar), 170);
    }

    private drawSell(f: SellForm) {
        this.formItem(f.item, `You have ${this.have(f.item).toLocaleString("en-US")}`);
        this.amountField(f, 132);
        text("Each", 222, 4, AP.STONE, this.bar);
        this.numberField("price", f.price ? f.price.toLocaleString("en-US") : "", 222, 13, 62, "g");
        const h = this.histories.get(f.item)?.h;
        const toOrders = h && f.price > 0 && f.price <= h.w ? " (orders first)" : "";
        this.formTotal(this.problem(f), `Total: ${(f.n * f.price).toLocaleString("en-US")}g${toOrders}`);
        this.formButtons("List", !this.problem(f));
    }

    private drawBuy(f: BuyForm) {
        const [, item, n, price, , seller] = f.row;
        this.formItem(item, `${n.toLocaleString("en-US")} from ${seller}`);
        this.amountField(f, 132);
        text("Each", 222, 4, AP.STONE, this.bar);
        text(`${price.toLocaleString("en-US")}g`, 222, 15, AP.STRAW, this.bar);
        this.formTotal(this.problem(f), `Total: ${(f.n * price).toLocaleString("en-US")}g`);
        this.formButtons("Buy", !this.problem(f));
    }

    private drawFill(f: FillForm) {
        const [, item, n, price, , buyer] = f.row;
        this.formItem(item, `${buyer} wants ${n.toLocaleString("en-US")}`);
        this.amountField(f, 132);
        text("Pays", 222, 4, AP.STONE, this.bar);
        text(`${price.toLocaleString("en-US")}g`, 222, 15, AP.STRAW, this.bar);
        this.formTotal(this.problem(f), `You get ${(f.n * price).toLocaleString("en-US")}g (you have ${this.have(item).toLocaleString("en-US")})`);
        this.formButtons("Sell", !this.problem(f));
    }

    private drawOrder(f: OrderForm) {
        const have = this.have(f.item);
        this.formItem(f.item, have ? `You have ${have.toLocaleString("en-US")}` : "Buy order");
        this.amountField(f, 132);
        text("At most", 222, 4, AP.STONE, this.bar);
        this.numberField("price", f.price ? f.price.toLocaleString("en-US") : "", 222, 13, 62, "g");
        this.formTotal(this.problem(f), `Sets aside: ${(f.n * f.price).toLocaleString("en-US")}g`);
        this.formButtons("Order", !this.problem(f));
    }

    // what a thing's sold for, along the bottom of a form: the last two
    // weeks' sales (how many, the average and range each), then the last
    // sale, the best order and the cheapest listing; beside them a line of
    // each day's average (pointed at, the days one by one)
    private drawHistory(item: number) {
        const { W, CHART_W, HISTORY_Y: y } = Market, h = this.histories.get(item)?.h;
        this.bar.addChild(new PIXI.Graphics().beginFill(AP.IRON).drawRect(4, y - 3, W - 8, 1).endFill());
        if (!h) { text("Looking up what it's sold for...", 6, y, AP.IRON, this.bar); return; }
        const s = historySummary(h.d), g = (n: number) => `${n.toLocaleString("en-US")}g`, width = W - 20 - CHART_W;
        const first = s.n ? `${HISTORY_DAYS} days: ${s.n.toLocaleString("en-US")} sold, avg ${g(s.average)}${s.low != s.high ? ` (${g(s.low)}-${g(s.high)})` : ""}`
            : h.l ? `None sold in ${HISTORY_DAYS} days` : "Never sold yet";
        const then = [h.l ? `Last sold at ${g(h.l)}` : "", h.w ? `wanted at ${g(h.w)} x ${h.x.toLocaleString("en-US")}` : "", h.c ? `cheapest ${g(h.c)}` : ""]
            .filter((p) => p).join(" - ");
        for (const [line, at, tint] of [[first, y, AP.ASH], [then.charAt(0).toUpperCase() + then.slice(1), y + 10, AP.STONE]] as [string, number, number][]) {
            if (!line) continue;
            const t = fit(text(line, 6, at, tint, this.bar), width);
            t.eventMode = "static";
            t.on("pointerover", (e: PIXI.FederatedPointerEvent) => this.tip.show(historyTip(h), e));
            t.on("pointermove", (e: PIXI.FederatedPointerEvent) => this.tip.move(e));
            t.on("pointerout", () => this.tip.hide());
        }
        if (s.n) this.drawChart(h, W - 6 - CHART_W, y, CHART_W, 17);
    }

    // each of the days' average gold each, a dot (none sold: none), joined;
    // the highest at the top, the lowest at the bottom
    private drawChart(h: PriceHistory, x: number, y: number, w: number, ht: number) {
        const today = Math.floor(Date.now() / 86400000), dayW = w / HISTORY_DAYS;
        const points = h.d.map(([at, n, gold]) => ({ k: HISTORY_DAYS - 1 - (today - Math.floor(at / 86400000)), each: gold / n }))
            .filter((p) => p.k >= 0);
        const lo = Math.min(...points.map((p) => p.each)), hi = Math.max(...points.map((p) => p.each));
        const g = new PIXI.Graphics();
        g.beginFill(AP.BLACK).drawRect(x - 1, y - 1, w + 2, ht + 2).endFill();
        g.beginFill(AP.INK).drawRect(x, y, w, ht).endFill();
        const at = (p: { k: number, each: number }) => ({
            px: Math.round(x + (p.k + 0.5) * dayW), py: Math.round(y + ht - 2 - (hi > lo ? (p.each - lo) / (hi - lo) : 0.5) * (ht - 3)),
        });
        g.lineStyle(1, AP.STONE, 1, 0);
        points.forEach((p, i) => { const { px, py } = at(p); if (i) g.lineTo(px, py + 0.5); else g.moveTo(px, py + 0.5); });
        g.lineStyle(0);
        for (const p of points) { const { px, py } = at(p); g.beginFill(AP.STRAW).drawRect(px, py, 1, 1).endFill(); }
        this.bar.addChild(g);
        // (pointed at: the days, one a line)
        g.eventMode = "static";
        g.hitArea = new PIXI.Rectangle(x, y, w, ht);
        g.on("pointerover", (e: PIXI.FederatedPointerEvent) => this.tip.show(historyTip(h), e));
        g.on("pointermove", (e: PIXI.FederatedPointerEvent) => this.tip.move(e));
        g.on("pointerout", () => this.tip.hide());
    }

    // how many: - [n] + All (an order's: Max, as many as your gold buys at its price)
    private amountField(f: Form, x: number) {
        text("Amount", x, 4, AP.STONE, this.bar);
        const minus = button("-", x, 14, this.bar, () => this.stepAmount(-1));
        this.numberField("amount", f.n.toLocaleString("en-US"), x + minus + 2, 13, 34, "");
        const plus = button("+", x + minus + 38, 14, this.bar, () => this.stepAmount(1));
        if (f.kind == "order") button("Max", x + minus + 38 + plus + 2, 14, this.bar,
            () => this.setNumber("amount", f.price ? Math.floor((IBC.data.inventory.gold ?? 0) / f.price) : f.n));
        else button("All", x + minus + 38 + plus + 2, 14, this.bar, () => this.setNumber("amount", this.mostOf(f)));
        // (the wheel over it, a step)
        const wheel = new PIXI.Container();
        wheel.eventMode = "static";
        wheel.hitArea = new PIXI.Rectangle(x, 12, 60, 12);
        wheel.on("wheel", (e: PIXI.FederatedWheelEvent) => this.stepAmount(e.deltaY < 0 ? 1 : -1));
        this.bar.addChildAt(wheel, 1);
    }

    // a number field, clicked to type in it
    private numberField(field: Focus, shown: string, x: number, y: number, w: number, unit: string) {
        const typing = this.focus == field;
        const box = new PIXI.Graphics()
            .beginFill(typing ? AP.LIME : AP.BLACK).drawRect(0, 0, w, 11).endFill()
            .beginFill(typing ? AP.SLATE : AP.INK).drawRect(1, 1, w - 2, 9).endFill();
        box.position.set(x, y);
        box.eventMode = "static";
        box.cursor = "text";
        box.on("pointerdown", (e: PIXI.FederatedPointerEvent) => { e.stopPropagation(); this.setFocus(field); });
        this.bar.addChild(box);
        const t = text(shown, x + 3, y + 2, AP.WHITE, this.bar);
        if (unit) text(unit, x + w + 2, y + 2, AP.STRAW, this.bar);
        if (typing) this.putCaret(this.bar, x + 3 + (shown ? Math.ceil(t.textWidth) + 1 : 0), y + 1.5);
    }

    // the form's buttons, bottom right: what it does (Enter) and Cancel (Escape)
    private formButtons(label: string, can: boolean) {
        const { W } = Market;
        const cw = textWidth("Cancel") + 6;
        button("Cancel", W - 6 - cw, 30, this.bar, () => this.closeForm());
        const w = textWidth(label) + 14, x = W - 6 - cw - 4 - w;
        const b = new PIXI.Container();
        b.position.set(x, 29);
        const back = new PIXI.Graphics();
        const paint = (over: boolean) => back.clear()
            .beginFill(AP.BLACK).drawRect(0, 0, w, 11).endFill()
            .beginFill(!can ? AP.IRON : over ? AP.GRASS : AP.LEAF).drawRect(1, 1, w - 2, 9).endFill();
        paint(false);
        b.addChild(back);
        text(label, 7, 2, can ? AP.WHITE : AP.STONE, b);
        b.eventMode = "static";
        b.cursor = can ? "pointer" : "default";
        b.on("pointerdown", (e: PIXI.FederatedPointerEvent) => e.stopPropagation());
        b.on("pointerover", () => paint(can));
        b.on("pointerout", () => paint(false));
        b.on("pointertap", () => this.confirm());
        this.bar.addChild(b);
    }

    private putCaret(parent: PIXI.Container, x: number, y: number) {
        this.caret.position.set(x, y);
        this.caret.visible = true;
        parent.addChild(this.caret);
    }

    //#endregion

}

// (the caret is kept: it's put back each time)
let keep: PIXI.DisplayObject = null;
function clear(c: PIXI.Container) {
    c.removeChildren().forEach((child) => { if (child != keep) child.destroy({ children: true }); });
}

let coin: PIXI.Texture;
function coinTexture() {
    return coin ??= picTexture(coinIcon());
}

// how long, shortly: 47h, 35m, <1m
function timeLeft(ms: number) {
    if (ms >= 3600000) return `${Math.floor(ms / 3600000)}h`;
    if (ms >= 60000) return `${Math.floor(ms / 60000)}m`;
    return "<1m";
}

// everything an order can be posted for: the materials, then what's made
// (each quality of what's worn or carried), in the inventory's order
let all: number[];
function wantable() {
    if (!all) {
        all = MATERIALS.map((m) => m.id);
        for (const r of RECIPES) {
            all.push(r.id);
            if (hasQuality(r)) for (const q of [Quality.FINE, Quality.SUPERIOR, Quality.MASTERWORK]) all.push(withQuality(r.id, q));
        }
        all = all.filter(isItem).sort((a, b) => itemOrder(a) - itemOrder(b));
    }
    return all;
}

// the days a thing sold, newest first: how many, and the average and range each
function historyTip(h: PriceHistory) {
    const g = (n: number) => `${n.toLocaleString("en-US")}g`;
    const lines = h.d.slice().reverse().map(([at, n, gold, lo, hi]) => {
        const day = new Date(at).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
        return `${day}: ${n.toLocaleString("en-US")} sold, avg ${g(Math.round(gold / n))}${lo != hi ? ` (${g(lo)}-${g(hi)})` : ""}`;
    });
    if (h.c) lines.push(`Cheapest listed now: ${g(h.c)}`);
    if (h.w) lines.push(`Best buy order now: ${g(h.w)} for ${h.x.toLocaleString("en-US")}`);
    return lines.length ? lines.slice(0, 16) : ["Never sold yet"];
}
