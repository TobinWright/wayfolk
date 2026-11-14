import * as PIXI from "pixi.js";
import { GOLD_MOST, isEmpty, Offer, OFFER_MOST } from "../../../../shared/Trade";
import { itemName } from "../../../../shared/Tasks";
import { coinIcon } from "../../art/MenuIcons";
import { Event } from "../../constants/Events";
import { AP } from "../../constants/Palette";
import { IBC } from "../../Engine";
import { picTexture } from "../../people/People";
import { Panel } from "../../shared/Panel";
import { TitleBar } from "../../shared/ui/titlebar/TitleBar";
import { BaseComponent, ComponentType } from "../BaseComponent";
import { Chat } from "../chat/Chat";
import { button, text, textWidth, Tip } from "../games/GameUI";
import { fit } from "../heroroster/HeroRoster";
import { itemTexture } from "../inventory/Item";
import { ItemInfo } from "../iteminfo/ItemInfo";

// A trade with another player (shared/Trade.ts, Lithalia's rules; the layout
// Claude's), opened beside the Inventory as it starts. Two sides: yours on
// the left, theirs on the right, each up to OFFER_MOST things and some gold,
// with whether they're ready or have confirmed. Things are put in by dragging
// them from the Inventory onto the window (all you have of it to start); a
// row of yours clicked lets you type how many (the wheel steps it), x takes
// it out; your gold clicked to type it. Any change clears both Readys. Along
// the bottom what's needed next, Ready, Confirm (once both are ready) and
// Cancel trade. Closing the window calls the trade off.

type Focus = { kind: "gold" } | { kind: "amount", id: number } | null;

export class Trade extends BaseComponent {

    public static SCALE = 2;
    public static W = 280;
    public static H = 184;
    public static COL_W = 136;
    public static THEIRS_X = 144;
    public static HEAD_Y = 14;
    public static BOX_Y = 24;
    public static ROW = 16;
    public static BOX_H = OFFER_MOST * Trade.ROW + 2;
    public static GOLD_Y = Trade.BOX_Y + Trade.BOX_H + 4;
    public static BAR_Y = Trade.GOLD_Y + 18;
    public static BAR_H = Trade.H - Trade.BAR_Y;
    public static INSET_X = 12;
    public static INSET_Y = 28;
    public static WIDTH = Trade.INSET_X * 2 + Trade.W * Trade.SCALE;
    public static HEIGHT = Trade.INSET_Y + Trade.H * Trade.SCALE + Trade.INSET_X;
    public static BLINK_MS = 500;
    public static SAID_MS = 6000;

    private focus: Focus = null;
    private typed = "";                 // (digits typed into the focused field)
    private dropping = false;
    private said = "";
    private saidAt = 0;
    private blink = 0;

    public background: Panel;
    public titleBar: TitleBar;
    private content: PIXI.Container;
    private body: PIXI.Container;
    private caret: PIXI.Graphics;
    private tip: Tip;

    private keys = (e: KeyboardEvent) => this.onKey(e);

    constructor() {
        super(ComponentType.TRADE);
        this.create();
    }

    // the window, if it's open and under a point on the screen
    public static under(global: PIXI.IPointData) {
        const view = IBC.comp.getFirstByType(ComponentType.TRADE) as Trade;
        return view && view.container.getBounds().contains(global.x, global.y) ? view : null;
    }

    public create() {
        super.create();
        const { WIDTH, HEIGHT, W, H, SCALE, INSET_X, INSET_Y } = Trade;
        this.container.eventMode = "static";
        this.container.hitArea = new PIXI.Rectangle(0, 0, WIDTH, HEIGHT);
        this.container.on("pointerdown", (e: PIXI.FederatedPointerEvent) => { e.stopPropagation(); this.setFocus(null); });
        this.container.on("wheel", (e: PIXI.FederatedWheelEvent) => e.stopPropagation());

        this.background = new Panel(this.container);
        this.background.setSize(WIDTH, HEIGHT);
        this.titleBar = new TitleBar(this);
        this.titleBar.setPosition(4, 4);
        this.titleBar.setSize(WIDTH - 8, 20);
        this.titleBar.setTitle("Trade");

        this.content = new PIXI.Container();
        this.content.scale.set(SCALE);
        this.content.position.set(INSET_X, INSET_Y);
        this.container.addChild(this.content);
        this.content.addChild(new PIXI.Graphics().beginFill(AP.INK).drawRect(-4, -2, W + 8, H + 6).endFill());
        this.body = new PIXI.Container();
        this.content.addChild(this.body);
        this.caret = new PIXI.Graphics().beginFill(AP.WHITE).drawRect(0, 0, 1, 8).endFill();
        this.tip = new Tip(this.content, W);

        window.addEventListener("keydown", this.keys, true);
        IBC.events.register(Event.TRADE, () => this.draw(), this);
        IBC.events.register(Event.TRADE_REFUSED, (why: string) => { this.said = why; this.saidAt = Date.now(); this.draw(); }, this);
        IBC.events.register(Event.HERO_STASH, () => this.draw(), this);
        IBC.events.register(Event.MAP_POINTER_DOWN, () => this.setFocus(null), this);
        IBC.events.register(Event.CHAT_TYPING, (on: boolean) => { if (on) this.setFocus(null); }, this);

        // (right of the Inventory, so the two sit side by side)
        const x = Math.round(window.innerWidth / 2 + 26);
        this.setPosition(Math.max(0, Math.min(x, window.innerWidth - WIDTH)), Math.max(0, Math.round((window.innerHeight - HEIGHT) / 2) - 20));
        this.draw();
    }

    public destroy() {
        super.destroy();
        window.removeEventListener("keydown", this.keys, true);
        if (IBC.net.trade.view) IBC.net.trade.cancel();     // (closed by hand: called off; as it ends, the view's gone first)
        this.caret.destroy();
        this.titleBar.destroy();
        this.background.destroy();
        this.container.destroy({ children: true });
    }

    public update(deltaTime: number) {
        if (this.focus) {
            this.blink += deltaTime;
            this.caret.visible = Math.floor(this.blink / Trade.BLINK_MS) % 2 == 0;
        }
        if (this.said && Date.now() - this.saidAt > Trade.SAID_MS) { this.said = ""; this.draw(); }
    }

    //#region changing your offer

    private mine(): Offer {
        const v = IBC.net.trade.view;
        return v ? { g: v.o[0].g, i: v.o[0].i.map(([id, n]) => [id, n] as [number, number]) } : null;
    }

    private have(id: number) {
        return IBC.data.inventory.items.get(id)?.amount ?? 0;
    }

    private send(o: Offer) {
        IBC.net.trade.offer(o);
    }

    // something dragged from the Inventory is over the window (or not)
    public dragOver(over: boolean) {
        if (over == this.dropping) return;
        this.dropping = over;
        this.draw();
    }

    // something from your stash let go over the window: in, all you have of it
    public offer(item: number) {
        this.dropping = false;
        this.bringToTop();
        const o = this.mine(), n = this.have(item);
        if (!o || !n) return this.draw();
        if (o.i.some(([id]) => id == item)) return this.setFocus({ kind: "amount", id: item });
        if (o.i.length >= OFFER_MOST) { this.say(`Up to ${OFFER_MOST} different things in a trade`); return; }
        o.i.push([item, n]);
        this.send(o);
    }

    private remove(item: number) {
        const o = this.mine();
        if (!o) return;
        o.i = o.i.filter(([id]) => id != item);
        if (this.focus?.kind == "amount" && this.focus.id == item) this.focus = null;
        this.send(o);
    }

    private setAmount(item: number, n: number) {
        const o = this.mine(), e = o?.i.find(([id]) => id == item);
        if (!e) return;
        n = Math.max(1, Math.min(this.have(item), n));
        if (n == e[1]) return this.draw();
        e[1] = n;
        this.send(o);
    }

    private setGold(g: number) {
        const o = this.mine();
        if (!o) return;
        g = Math.max(0, Math.min(IBC.data.inventory.gold ?? 0, GOLD_MOST, g));
        if (g == o.g) return this.draw();
        o.g = g;
        this.send(o);
    }

    private say(text: string) {
        this.said = text;
        this.saidAt = Date.now();
        this.draw();
    }

    //#endregion

    //#region typing

    // (leaving a field puts in what was typed)
    private setFocus(focus: Focus) {
        const was = this.focus;
        if (JSON.stringify(focus) == JSON.stringify(was)) return;
        const typed = this.typed;
        this.focus = focus;
        this.typed = "";
        this.blink = 0;
        if (focus) Chat.stop();
        if (was && typed) {
            if (was.kind == "gold") return this.setGold(Number(typed));
            return this.setAmount(was.id, Number(typed));
        }
        this.draw();
    }

    private onKey(e: KeyboardEvent) {
        if (e.ctrlKey || e.metaKey || e.altKey) return;
        const f = this.focus;
        if (!f) {
            if (Chat.takes(e) || e.key != "Escape") return;
            (e as any).chat = true;
            e.preventDefault();
            IBC.comp.destroy(this);
            return;
        }
        (e as any).chat = true;
        e.preventDefault();
        this.blink = 0;
        if (e.key == "Escape") { this.typed = ""; return this.setFocus(null); }
        if (e.key == "Enter" || e.key == "Tab") return this.setFocus(null);
        if (f.kind == "amount" && (e.key == "ArrowUp" || e.key == "ArrowDown")) {
            const now = this.mine()?.i.find(([id]) => id == f.id)?.[1] ?? 0;
            this.typed = "";
            return this.setAmount(f.id, now + (e.key == "ArrowUp" ? 1 : -1));
        }
        if (e.key == "Backspace") this.typed = this.typed.slice(0, -1);
        else if (/^[0-9]$/.test(e.key)) this.typed = (this.typed + e.key).replace(/^0+/, "").slice(0, 10);
        else return;
        this.draw();
    }

    //#endregion

    //#region drawing

    private draw() {
        const v = IBC.net.trade.view;
        this.body.removeChildren().forEach((c) => { if (c != this.caret) c.destroy({ children: true }); });
        if (!v) return;
        const { W, COL_W, THEIRS_X } = Trade, inv = IBC.data.inventory;

        fit(text(`Trading with ${v.n}`, 0, 0, AP.STRAW, this.body), W - 80);
        const gold = text((inv.gold ?? 0).toLocaleString("en-US"), 0, 0, AP.STRAW, this.body);
        gold.x = W - Math.ceil(gold.textWidth);
        const coin = new PIXI.Sprite(coinTexture());
        coin.position.set(gold.x - 10, 0);
        this.body.addChild(coin);

        this.side(0, "You offer", v.o[0], !!v.rd[0], !!v.cf[0], true);
        this.side(THEIRS_X, `${v.n} offers`, v.o[1], !!v.rd[1], !!v.cf[1], false);
        this.body.addChild(new PIXI.Graphics().beginFill(AP.IRON).drawRect(COL_W + 4, Trade.HEAD_Y, 1, Trade.GOLD_Y + 12 - Trade.HEAD_Y).endFill());
        this.drawBar();
        this.tip.raise();
    }

    // a side: its heading and state, its things, its gold
    private side(x: number, heading: string, o: Offer, ready: boolean, confirmed: boolean, yours: boolean) {
        const { COL_W, HEAD_Y, BOX_Y, BOX_H, ROW, GOLD_Y } = Trade;
        fit(text(heading, x, HEAD_Y, yours ? AP.LIME : AP.WHITE, this.body), COL_W - 52);
        const state = confirmed ? "Confirmed" : ready ? "Ready" : "Not ready";
        const s = text(state, 0, HEAD_Y, confirmed || ready ? AP.LIME : AP.STONE, this.body);
        s.x = x + COL_W - Math.ceil(s.textWidth);

        const lit = yours && this.dropping;
        this.body.addChild(new PIXI.Graphics()
            .beginFill(lit ? AP.LIME : ready ? AP.LEAF : AP.IRON).drawRect(x, BOX_Y, COL_W, BOX_H).endFill()
            .beginFill(lit ? AP.FOREST : AP.SHADOW).drawRect(x + 1, BOX_Y + 1, COL_W - 2, BOX_H - 2).endFill());
        for (let k = 0; k < OFFER_MOST; k++) {
            const y = BOX_Y + 1 + k * ROW, e = o.i[k];
            if (e) this.itemRow(x + 1, y, e[0], e[1], yours);
            else if (k == o.i.length) {
                const hint = lit ? "Let go to put it in" : yours ? "Drag things here from" : "";
                if (hint) text(hint, x + 5, y + 4, lit ? AP.WHITE : AP.IRON, this.body);
                if (yours && !lit) text("your Inventory", x + 5, y + 4 + ROW, AP.IRON, this.body);
                if (!yours && !o.i.length) text("Nothing yet", x + 5, y + 4, AP.IRON, this.body);
            }
        }

        // gold: yours clicked to type it
        const coin = new PIXI.Sprite(coinTexture());
        coin.position.set(x + 2, GOLD_Y + 2);
        this.body.addChild(coin);
        const typing = yours && this.focus?.kind == "gold";
        const shown = typing ? this.typed : o.g.toLocaleString("en-US");
        if (yours) {
            const fw = COL_W - 14;
            const box = new PIXI.Graphics()
                .beginFill(typing ? AP.LIME : AP.BLACK).drawRect(0, 0, fw, 11).endFill()
                .beginFill(typing ? AP.SLATE : AP.INK).drawRect(1, 1, fw - 2, 9).endFill();
            box.position.set(x + 13, GOLD_Y);
            box.eventMode = "static";
            box.cursor = "text";
            box.on("pointerdown", (e: PIXI.FederatedPointerEvent) => { e.stopPropagation(); this.setFocus({ kind: "gold" }); });
            this.body.addChild(box);
            const t = text(shown, x + 16, GOLD_Y + 2, AP.STRAW, this.body);
            if (typing) this.putCaret(x + 16 + (shown ? Math.ceil(t.textWidth) + 1 : 0), GOLD_Y + 1.5);
        } else text(`${shown}g`, x + 14, GOLD_Y + 2, o.g ? AP.STRAW : AP.STONE, this.body);
    }

    // a thing in an offer: its sprite (its info), name, how many; yours clicked
    // to type how many (the wheel steps it), x to take it out
    private itemRow(x: number, y: number, id: number, n: number, yours: boolean) {
        const { COL_W, ROW } = Trade, w = COL_W - 2;
        const typing = yours && this.focus?.kind == "amount" && this.focus.id == id;
        const r = new PIXI.Container();
        r.position.set(x, y);
        const back = new PIXI.Graphics();
        const paint = (over: boolean) => back.clear().beginFill(typing ? AP.SLATE : over && yours ? AP.INK : AP.SHADOW).drawRect(0, 0, w, ROW - 1).endFill();
        paint(false);
        r.addChild(back);
        const sprite = new PIXI.Sprite(itemTexture(id));
        sprite.position.set(0, -1);
        r.addChild(sprite);
        const amount = typing ? this.typed : n.toLocaleString("en-US");
        const right = yours ? w - 12 : w - 3;
        const a = text(amount, 0, 4, AP.WHITE, r);
        a.x = right - Math.ceil(a.textWidth);
        fit(text(itemName(id), 18, 4, AP.ASH, r), a.x - 22);
        if (typing) this.putCaret(x + right + 1, y + 3.5);
        r.eventMode = "static";
        if (yours) {
            r.cursor = "text";
            r.on("pointerover", () => paint(true));
            r.on("pointerout", () => paint(false));
            r.on("pointerdown", (e: PIXI.FederatedPointerEvent) => { e.stopPropagation(); this.setFocus({ kind: "amount", id }); });
            r.on("wheel", (e: PIXI.FederatedWheelEvent) => { this.typed = ""; this.setAmount(id, n + (e.deltaY < 0 ? 1 : -1)); });
            const x2 = text("x", w - 8, 4, AP.STONE, r);
            const hit = new PIXI.Container();
            hit.eventMode = "static";
            hit.cursor = "pointer";
            hit.hitArea = new PIXI.Rectangle(w - 11, 0, 11, ROW - 1);
            hit.on("pointerover", () => { x2.tint = AP.FLAME; });
            hit.on("pointerout", () => { x2.tint = AP.STONE; });
            hit.on("pointerdown", (e: PIXI.FederatedPointerEvent) => e.stopPropagation());
            hit.on("pointertap", () => this.remove(id));
            r.addChild(hit);
        }
        sprite.eventMode = "static";
        sprite.cursor = "help";
        sprite.on("pointerover", (e: PIXI.FederatedPointerEvent) => this.tip.show([`${itemName(id)} (click for more)`], e));
        sprite.on("pointermove", (e: PIXI.FederatedPointerEvent) => this.tip.move(e));
        sprite.on("pointerout", () => this.tip.hide());
        sprite.on("pointerdown", (e: PIXI.FederatedPointerEvent) => e.stopPropagation());
        sprite.on("pointertap", () => ItemInfo.open(id));
        this.body.addChild(r);
    }

    // what's needed next, and Ready, Confirm, Cancel trade
    private drawBar() {
        const { W, BAR_Y, BAR_H } = Trade, v = IBC.net.trade.view;
        const bar = new PIXI.Container();
        bar.y = BAR_Y;
        this.body.addChild(bar);
        bar.addChild(new PIXI.Graphics()
            .beginFill(AP.IRON).drawRect(0, 0, W, BAR_H).endFill()
            .beginFill(AP.SHADOW).drawRect(1, 1, W - 2, BAR_H - 2).endFill());

        const [youReady, theyReady] = [!!v.rd[0], !!v.rd[1]], [youConf, theyConf] = [!!v.cf[0], !!v.cf[1]];
        const both = youReady && theyReady, nothing = isEmpty(v.o[0]) && isEmpty(v.o[1]);
        let line: string, tint = AP.ASH;
        if (this.said) { line = this.said; tint = AP.FLAME; }
        else if (nothing) line = "Put things or gold in, then press Ready";
        else if (!youReady) line = theyReady ? `${v.n} is ready - press Ready if it looks right` : "Press Ready when your offer's right";
        else if (!theyReady) line = `Waiting for ${v.n} to be ready`;
        else if (!youConf) { line = "Both ready: check what you'll get, then Confirm"; tint = AP.LIME; }
        else line = `Waiting for ${v.n} to confirm`;
        fit(text(line, 6, 5, tint, bar), W - 12);
        if (both && !isEmpty(v.o[0]) && isEmpty(v.o[1]) && !this.said)
            text(`${v.n} is offering nothing in return`, 6, 15, AP.AMBER, bar);
        else text("Any change clears both Readys", 6, 15, AP.IRON, bar);

        let x = 6;
        x += this.bigButton(youReady ? "Not ready" : "Ready", x, BAR_H - 13, true, () => IBC.net.trade.ready(!youReady), bar) + 4;
        this.bigButton(youConf ? "Confirmed" : "Confirm", x, BAR_H - 13, both && !youConf && !nothing, () => IBC.net.trade.confirm(), bar);
        const cw = textWidth("Cancel trade") + 6;
        button("Cancel trade", W - 6 - cw, BAR_H - 12, bar, () => IBC.comp.destroy(this));
    }

    // a green button (grey when it can't be pressed); its width
    private bigButton(label: string, x: number, y: number, can: boolean, act: () => void, parent: PIXI.Container) {
        const w = textWidth(label) + 14;
        const b = new PIXI.Container();
        b.position.set(x, y);
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
        b.on("pointertap", () => { if (can) act(); });
        parent.addChild(b);
        return w;
    }

    private putCaret(x: number, y: number) {
        this.caret.position.set(x, y);
        this.caret.visible = true;
        this.body.addChild(this.caret);
    }

    //#endregion

}

let coin: PIXI.Texture;
function coinTexture() {
    return coin ??= picTexture(coinIcon());
}
