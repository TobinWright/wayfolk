import * as PIXI from "pixi.js";
import { maskSwearing } from "../../../../shared/ChatFilter";
import { hasThings, Letter, LETTER_DAYS, NOTE_LONGEST } from "../../../../shared/Mail";
import { itemName } from "../../../../shared/Tasks";
import { GOLD_MOST, Offer, OFFER_MOST } from "../../../../shared/Trade";
import { coinIcon } from "../../art/MenuIcons";
import { Event } from "../../constants/Events";
import { AP } from "../../constants/Palette";
import { IBC } from "../../Engine";
import { picTexture } from "../../people/People";
import { Panel } from "../../shared/Panel";
import { Hint } from "../../shared/ui/Hint";
import { TextField } from "../../shared/ui/TextField";
import { TitleBar } from "../../shared/ui/titlebar/TitleBar";
import { BaseComponent, ComponentType } from "../BaseComponent";
import { Chat, wrap } from "../chat/Chat";
import { button, text, textWidth, Tip } from "../games/GameUI";
import { fit } from "../heroroster/HeroRoster";
import { itemTexture } from "../inventory/Item";
import { ItemInfo } from "../iteminfo/ItemInfo";

// Mail (shared/Mail.ts; the layout Claude's), from the other menu's Mail, or
// Mail by a friend, a guildmate or a name in the chat. Two tabs. Inbox: your
// letters down the left (who from, the start of the note or what's in it; a
// dot on those unopened), the one picked on the right - who from, when, when
// it runs out, the note, what's in it (each thing's sprite its info) - with
// Take all, Send back, Reply and Delete. Write: To (a friend's or guildmate's
// name), a note, up to OFFER_MOST things dragged in from the Inventory (as a
// trade's: all you have of it to start, a row clicked to type how many, the
// wheel steps it, x takes it out) and some gold; Send. Opens right of the
// Inventory so things can be dragged across; what's said back along the
// bottom. Escape or its cross closes it.

type Tab = "inbox" | "write";

export class Mail extends BaseComponent {

    public static SCALE = 2;
    public static W = 280;              // the content, in its own px
    public static H = 236;
    public static TAB_H = 13;
    public static TOP = 17;             // under the tabs
    public static LIST_W = 112;         // (Inbox) the letters down the left
    public static PANE_X = 118;         // (Inbox) the one picked
    public static ROW = 22;             // (Inbox) a letter in the list
    public static THING = 16;           // a thing in a letter
    public static BOX_Y = 56;           // (Write) the things put in
    public static BOX_H = OFFER_MOST * Mail.THING + 2;
    public static INSET_X = 12;
    public static INSET_Y = 28;
    public static WIDTH = Mail.INSET_X * 2 + Mail.W * Mail.SCALE;
    public static HEIGHT = Mail.INSET_Y + Mail.H * Mail.SCALE + Mail.INSET_X;
    public static BLINK_MS = 500;
    public static SAID_MS = 8000;

    private tab: Tab = "inbox";
    private picked = -1;                // (Inbox) the letter open, by its id
    private scroll = 0;
    private things: [number, number][] = [];       // (Write) what's going in
    private typing = -1;                // (Write) the thing whose amount is being typed (its item id)
    private typed = "";
    private dropping = false;
    private sending = false;            // (sent, not answered yet)
    private said = "";
    private saidOk = true;
    private saidAt = 0;
    private blink = 0;

    public background: Panel;
    public titleBar: TitleBar;
    private content: PIXI.Container;
    private body: PIXI.Container;
    private fieldLayer: PIXI.Container;
    private caret: PIXI.Graphics;
    private tip: Tip;
    private toField: TextField;
    private noteField: TextField;
    private goldField: TextField;
    private fields: TextField[];

    private keys = (e: KeyboardEvent) => this.onKey(e);
    private paste = (e: ClipboardEvent) => this.fields.find((f) => f.focused)?.paste(e.clipboardData?.getData("text") ?? "");

    constructor() {
        super(ComponentType.MAIL);
        this.create();
    }

    // the window (one open at a time), on the inbox
    public static open() {
        const view = IBC.comp.getOrCreate(ComponentType.MAIL) as Mail;
        view.bringToTop();
        return view;
    }

    // the window on Write, to someone (by name)
    public static writeTo(name: string) {
        const view = Mail.open();
        view.toField.set(name);
        view.setTab("write");
        view.unfocus(view.noteField);
        view.noteField.setFocused(true);
        Chat.stop();
        return view;
    }

    // the window, if it's open and under a point on the screen
    public static under(global: PIXI.IPointData) {
        const view = IBC.comp.getFirstByType(ComponentType.MAIL) as Mail;
        return view && view.container.getBounds().contains(global.x, global.y) ? view : null;
    }

    public create() {
        super.create();
        const { WIDTH, HEIGHT, W, H, SCALE, INSET_X, INSET_Y } = Mail;
        this.container.eventMode = "static";
        this.container.hitArea = new PIXI.Rectangle(0, 0, WIDTH, HEIGHT);
        this.container.on("pointerdown", (e: PIXI.FederatedPointerEvent) => { e.stopPropagation(); this.unfocus(); });
        this.container.on("wheel", (e: PIXI.FederatedWheelEvent) => {
            e.stopPropagation();
            if (this.tab != "inbox") return;
            this.scroll += e.deltaY < 0 ? -1 : 1;
            this.draw();
        });

        this.background = new Panel(this.container);
        this.background.setSize(WIDTH, HEIGHT);
        this.titleBar = new TitleBar(this);
        this.titleBar.setPosition(4, 4);
        this.titleBar.setSize(WIDTH - 8, 20);
        this.titleBar.setTitle("Mail");

        this.content = new PIXI.Container();
        this.content.scale.set(SCALE);
        this.content.position.set(INSET_X, INSET_Y);
        this.container.addChild(this.content);
        this.content.addChild(new PIXI.Graphics().beginFill(AP.INK).drawRect(-4, -2, W + 8, H + 6).endFill());
        this.body = new PIXI.Container();
        this.fieldLayer = new PIXI.Container();
        this.content.addChild(this.body, this.fieldLayer);
        this.caret = new PIXI.Graphics().beginFill(AP.WHITE).drawRect(0, 0, 1, 8).endFill();
        this.tip = new Tip(this.content, W);

        const focus = () => this.unfocus();
        this.toField = new TextField(120, { max: 64, hint: "their name", onFocus: focus, onEnter: () => this.next(this.toField) });
        this.noteField = new TextField(W - 26, { max: NOTE_LONGEST, hint: "a few words (or none)", onFocus: focus, onEnter: () => this.next(this.noteField) });
        this.goldField = new TextField(80, { max: 10, hint: "0", digits: true, onFocus: focus, onEnter: () => this.next(this.goldField) });
        this.fields = [this.toField, this.noteField, this.goldField];
        for (const f of this.fields) this.fieldLayer.addChild(f.container);

        window.addEventListener("keydown", this.keys, true);     // (first, so the others see it's taken)
        document.addEventListener("paste", this.paste);
        IBC.events.register(Event.MAIL_LIST, () => this.gotList(), this);
        IBC.events.register(Event.MAIL_RESULT, (r: { text: string, ok: boolean }) => this.result(r.text, r.ok), this);
        IBC.events.register(Event.HERO_STASH, () => this.draw(), this);
        IBC.events.register(Event.INVENTORY_GOLD_UPDATED, () => this.draw(), this);
        IBC.events.register(Event.MAP_POINTER_DOWN, () => this.unfocus(), this);
        IBC.events.register(Event.CHAT_TYPING, (on: boolean) => { if (on) this.unfocus(); }, this);

        // (right of the Inventory, so the two sit side by side)
        const x = Math.round(window.innerWidth / 2 + 26);
        this.setPosition(Math.max(0, Math.min(x, window.innerWidth - WIDTH)), Math.max(0, Math.round((window.innerHeight - HEIGHT) / 2) - 20));
        IBC.net.mail.list();
        this.draw();
    }

    public destroy() {
        super.destroy();
        window.removeEventListener("keydown", this.keys, true);
        document.removeEventListener("paste", this.paste);
        for (const f of this.fields) f.destroy();
        this.caret.destroy();
        this.titleBar.destroy();
        this.background.destroy();
        this.container.destroy({ children: true });
    }

    public update(deltaTime: number) {
        for (const f of this.fields) f.update(deltaTime);
        if (this.typing >= 0) {
            this.blink += deltaTime;
            this.caret.visible = Math.floor(this.blink / Mail.BLINK_MS) % 2 == 0;
        }
        if (this.said && Date.now() - this.saidAt > Mail.SAID_MS) { this.said = ""; this.draw(); }
    }

    //#region keys

    // (leaving an amount being typed puts it in)
    private unfocus(but?: TextField) {
        for (const f of this.fields) if (f != but) f.setFocused(false);
        this.typeAmount(-1);
    }

    private next(from: TextField) {
        const order = [this.toField, this.noteField, this.goldField], k = order.indexOf(from);
        if (k == order.length - 1) return this.sendIt();
        from.setFocused(false);
        order[k + 1].setFocused(true);
    }

    private onKey(e: KeyboardEvent) {
        if (e.ctrlKey || e.metaKey || e.altKey) return;
        const field = this.fields.find((f) => f.focused && f.container.visible);
        if (!field && this.typing < 0) {
            if (e.key == "Escape" && !Chat.takes(e)) {
                (e as any).chat = true;
                e.preventDefault();
                IBC.comp.destroy(this);
            }
            return;
        }
        (e as any).chat = true;
        e.preventDefault();
        Chat.stop();
        if (field) {
            if (e.key == "Tab") return this.next(field);
            return field.key(e);
        }

        // an amount
        this.blink = 0;
        const id = this.typing;
        if (e.key == "Escape") { this.typed = ""; return this.typeAmount(-1); }
        if (e.key == "Enter" || e.key == "Tab") return this.typeAmount(-1);
        if (e.key == "ArrowUp" || e.key == "ArrowDown") {
            this.typed = "";
            const now = this.things.find(([t]) => t == id)?.[1] ?? 0;
            return this.setAmount(id, now + (e.key == "ArrowUp" ? 1 : -1));
        }
        if (e.key == "Backspace") this.typed = this.typed.slice(0, -1);
        else if (/^[0-9]$/.test(e.key)) this.typed = (this.typed + e.key).replace(/^0+/, "").slice(0, 10);
        else return;
        this.draw();
    }

    //#endregion

    //#region doing things

    private setTab(tab: Tab) {
        if (tab == this.tab) return;
        this.tab = tab;
        this.unfocus();
        this.scroll = 0;
        if (tab == "write") IBC.comp.getOrCreate(ComponentType.INVENTORY);
        else IBC.net.mail.list();
        this.bringToTop();
        this.draw();
    }

    private gotList() {
        const letters = IBC.net.mail.letters;
        if (!letters.some((l) => l.i == this.picked)) this.picked = -1;
        this.draw();
    }

    private pick(l: Letter) {
        this.picked = l.i;
        IBC.net.mail.read(l);
        this.draw();
    }

    private result(text: string, ok: boolean) {
        this.said = text;
        this.saidOk = ok;
        this.saidAt = Date.now();
        if (this.sending) {
            this.sending = false;
            if (ok) this.clearLetter(false);
        }
        this.draw();
    }

    private say(text: string) {
        this.result(text, false);
    }

    private have(id: number) {
        return IBC.data.inventory.items.get(id)?.amount ?? 0;
    }

    // something dragged from the Inventory is over the window (or not)
    public dragOver(over: boolean) {
        if (over == this.dropping) return;
        this.dropping = over;
        this.draw();
    }

    // something from your stash let go over the window: in the letter, all you have of it
    public offer(item: number) {
        this.dropping = false;
        this.bringToTop();
        if (this.tab != "write") this.setTab("write");
        const n = this.have(item);
        if (!n) return this.draw();
        if (this.things.some(([id]) => id == item)) return this.typeAmount(item);
        if (this.things.length >= OFFER_MOST) return this.say(`Up to ${OFFER_MOST} different things in a letter`);
        this.things.push([item, n]);
        this.draw();
    }

    private removeThing(item: number) {
        this.things = this.things.filter(([id]) => id != item);
        if (this.typing == item) { this.typing = -1; this.typed = ""; }
        this.draw();
    }

    private setAmount(item: number, n: number) {
        const e = this.things.find(([id]) => id == item);
        if (e) e[1] = Math.max(1, Math.min(this.have(item), n));
        this.draw();
    }

    // an amount to type (-1: none; what was typed put in)
    private typeAmount(item: number) {
        const was = this.typing, typed = this.typed;
        if (item == was) return;
        this.typing = item;
        this.typed = "";
        this.blink = 0;
        if (item >= 0) {
            for (const f of this.fields) f.setFocused(false);
            Chat.stop();
        }
        if (was >= 0 && typed) return this.setAmount(was, Number(typed));
        this.draw();
    }

    private gold() {
        return Math.min(Number(this.goldField.value || 0), GOLD_MOST);
    }

    private enclosed(): Offer {
        return { g: this.gold(), i: this.things.filter(([id, n]) => n > 0 && this.have(id) > 0).map(([id, n]) => [id, Math.min(n, this.have(id))]) };
    }

    private sendIt() {
        this.unfocus();
        const to = this.toField.value.trim(), note = this.noteField.value.trim(), o = this.enclosed();
        if (!to) return this.say("Who's it to? Type their name");
        if (!note && !o.g && !o.i.length) return this.say("Write a note, or put things or gold in");
        if (o.g > (IBC.data.inventory.gold ?? 0)) return this.say("You don't have that much gold");
        this.sending = true;
        IBC.net.mail.write(to, note, o);
    }

    // (keep: who it's to stays, for another)
    private clearLetter(all = true) {
        if (all) this.toField.set("");
        this.noteField.set("");
        this.goldField.set("");
        this.things = [];
        this.typing = -1;
        this.typed = "";
    }

    private reply(l: Letter) {
        if (!l.f) return;
        this.clearLetter();
        this.toField.set(l.f);
        this.setTab("write");
        this.noteField.setFocused(true);
    }

    //#endregion

    //#region drawing

    private draw() {
        this.body.removeChildren().forEach((c) => { if (c != this.caret) c.destroy({ children: true }); });
        this.caret.visible = false;
        this.drawTop();
        for (const f of this.fields) f.container.visible = this.tab == "write";
        if (this.tab == "inbox") this.drawInbox();
        else this.drawWrite();
        this.drawSaid();
        this.tip.raise();
    }

    // the tabs, and your gold on the right
    private drawTop() {
        const { W, TAB_H } = Mail, unread = IBC.net.mail.unread;
        let x = 0;
        const tabs: [Tab, string][] = [["inbox", unread ? `Inbox (${unread})` : "Inbox"], ["write", "Write"]];
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
            t.on("pointerdown", (e: PIXI.FederatedPointerEvent) => e.stopPropagation());
            t.on("pointertap", () => this.setTab(tab));
            this.body.addChild(t);
            x += w + 2;
        }
        const gold = text((IBC.data.inventory.gold ?? 0).toLocaleString("en-US"), 0, 3, AP.STRAW, this.body);
        gold.x = W - Math.ceil(gold.textWidth);
        const coin = new PIXI.Sprite(coinTexture());
        coin.position.set(gold.x - 10, 3);
        this.body.addChild(coin);
    }

    // what was said back, along the bottom
    private drawSaid() {
        const { W, H } = Mail;
        if (this.said) fit(text(this.said, 0, H - 9, this.saidOk ? AP.LIME : AP.FLAME, this.body), W);
        else if (this.sending) text("Sending...", 0, H - 9, AP.STONE, this.body);
    }

    //#region the inbox

    private drawInbox() {
        const { LIST_W, PANE_X, TOP, ROW, H, W } = Mail, letters = IBC.net.mail.letters;
        const bottom = H - 12, shown = Math.floor((bottom - TOP) / ROW);
        this.body.addChild(new PIXI.Graphics()
            .beginFill(AP.IRON).drawRect(0, TOP, LIST_W, bottom - TOP).endFill()
            .beginFill(AP.SHADOW).drawRect(1, TOP + 1, LIST_W - 2, bottom - TOP - 2).endFill()
            .beginFill(AP.IRON).drawRect(LIST_W + 3, TOP, 1, bottom - TOP).endFill());
        if (!IBC.net.mail.listed) text("Looking...", 5, TOP + 5, AP.STONE, this.body);
        else if (!letters.length) {
            text("No letters", 5, TOP + 5, AP.STONE, this.body);
            text("Letters from friends", 5, TOP + 17, AP.IRON, this.body);
            text("and guildmates come", 5, TOP + 26, AP.IRON, this.body);
            text("here", 5, TOP + 35, AP.IRON, this.body);
        }
        this.scroll = Math.max(0, Math.min(this.scroll, letters.length - shown));
        letters.slice(this.scroll, this.scroll + shown).forEach((l, k) => this.letterRow(l, 1, TOP + 1 + k * ROW, LIST_W - 2));
        if (letters.length > shown) {
            const more = text(`${this.scroll + 1}-${Math.min(letters.length, this.scroll + shown)} of ${letters.length}`, 0, bottom + 2, AP.IRON, this.body);
            more.x = LIST_W - Math.ceil(more.textWidth);
        }

        const l = letters.find((x) => x.i == this.picked);
        if (l) this.drawLetter(l, PANE_X, W - PANE_X);
        else if (letters.length) text("Pick a letter to read it", PANE_X, TOP + 5, AP.STONE, this.body);
    }

    // a letter down the left: who from (a dot if unopened), and the start of its note or what's in it
    private letterRow(l: Letter, x: number, y: number, w: number) {
        const { ROW } = Mail, on = l.i == this.picked;
        const r = new PIXI.Container();
        r.position.set(x, y);
        const back = new PIXI.Graphics();
        const paint = (over: boolean) => back.clear().beginFill(on ? AP.SLATE : over ? AP.INK : AP.SHADOW).drawRect(0, 0, w, ROW - 1).endFill();
        paint(false);
        r.addChild(back);
        if (l.u) r.addChild(new PIXI.Graphics().beginFill(AP.FLAME).drawRect(3, 5, 3, 3).endFill());
        const who = l.b ? `Back from ${l.f}` : l.f || "A former player";
        fit(text(who, 9, 3, l.u ? AP.STRAW : AP.ASH, r), w - 34);
        const age = text(shortAgo(l.a), 0, 3, AP.IRON, r);
        age.x = w - 3 - Math.ceil(age.textWidth);
        const things = hasThings(l) ? [...l.o.map(([id, n]) => `${n} ${itemName(id)}`), ...(l.g ? [`${l.g.toLocaleString("en-US")}g`] : [])].join(", ") : "";
        const line = l.t ? this.note(l.t) : things || "(empty)";
        fit(text(line, 9, 12, AP.STONE, r), w - (hasThings(l) ? 24 : 12));
        if (hasThings(l)) {
            const icon = new PIXI.Sprite(l.o.length ? itemTexture(l.o[0][0]) : coinTexture());
            icon.scale.set(l.o.length ? 0.5 : 1);
            icon.position.set(w - 11, 11);
            r.addChild(icon);
        }
        r.eventMode = "static";
        r.cursor = "pointer";
        r.on("pointerover", () => paint(true));
        r.on("pointerout", () => paint(false));
        r.on("pointerdown", (e: PIXI.FederatedPointerEvent) => e.stopPropagation());
        r.on("pointertap", () => this.pick(l));
        this.body.addChild(r);
    }

    // the letter picked: who from and when, its note, what's in it, and what can be done
    private drawLetter(l: Letter, x: number, w: number) {
        const { TOP, THING, H } = Mail;
        let y = TOP;
        const from = l.b ? `Sent back by ${l.f}` : l.f ? `From ${l.f}` : "From a former player";
        fit(text(from, x, y, AP.STRAW, this.body), w);
        y += 10;
        const when = l.e ? `${ago(l.a)} - ${daysLeft(l.e)} left` : `${ago(l.a)} - kept till taken`;
        const e = text(when, x, y, AP.IRON, this.body);
        fit(e, w);
        if (l.e) Hint.on(e, hasThings(l) ? "Not taken by then, it goes back to them" : "Then it's thrown away");
        e.eventMode = "static";
        y += 13;

        if (l.t) {
            if (l.b) { text("You wrote:", x, y, AP.STONE, this.body); y += 9; }
            for (const line of wrap(this.note(l.t), w, w, (s) => textWidth(s)).slice(0, 7)) {
                text(line, x, y, AP.WHITE, this.body);
                y += 9;
            }
            y += 4;
        } else if (!l.f) {
            text("(their note went with their account)", x, y, AP.IRON, this.body);
            y += 13;
        }

        if (l.o.length || l.g) {
            const taken = !!l.k;
            text(taken ? "You took:" : "In it:", x, y, AP.STONE, this.body);
            y += 10;
            for (const [id, n] of l.o) {
                this.thingRow(x, y, w, id, n, false, taken);
                y += THING;
            }
            if (l.g) {
                const coin = new PIXI.Sprite(coinTexture());
                coin.position.set(x + 4, y + 1);
                this.body.addChild(coin);
                text(`${l.g.toLocaleString("en-US")}g`, x + 18, y + 1, taken ? AP.STONE : AP.STRAW, this.body);
            }
        }

        // what can be done, along the pane's bottom
        const by = H - 26;
        let bx = x;
        if (hasThings(l)) bx += this.bigButton("Take all", bx, by, () => IBC.net.mail.take(l.i)) + 4;
        if (hasThings(l) && l.f && !l.b) bx += button("Send back", bx, by + 1, this.body, () => IBC.net.mail.sendBack(l.i)) + 4;
        if (l.f && !l.b) bx += button("Reply", bx, by + 1, this.body, () => this.reply(l)) + 4;
        if (!hasThings(l)) {
            const dw = textWidth("Delete") + 6;
            button("Delete", x + w - dw, by + 1, this.body, () => { this.picked = -1; IBC.net.mail.remove(l.i); });
        }
    }

    private note(t: string) {
        return IBC.data.chat.hideSwearing ? maskSwearing(t) : t;
    }

    //#endregion

    //#region writing

    private drawWrite() {
        const { W, TOP, BOX_Y, BOX_H, THING, H } = Mail;
        text("To", 0, TOP + 2, AP.ASH, this.body);
        this.toField.container.position.set(24, TOP);
        text("a friend or guildmate", 150, TOP + 2, AP.IRON, this.body);
        text("Note", 0, TOP + 16, AP.ASH, this.body);
        this.noteField.container.position.set(26, TOP + 14);
        const left = NOTE_LONGEST - this.noteField.value.length;
        if (this.noteField.focused && left < 40) {
            const n = text(`${left}`, 0, TOP + 26, left ? AP.STONE : AP.FLAME, this.body);
            n.x = W - Math.ceil(n.textWidth);
        }

        // the things going in
        const lit = this.dropping;
        text("Things", 0, BOX_Y - 9, AP.ASH, this.body);
        const count = text(`${this.things.length}/${OFFER_MOST}`, 0, BOX_Y - 9, AP.IRON, this.body);
        count.x = W - Math.ceil(count.textWidth);
        this.body.addChild(new PIXI.Graphics()
            .beginFill(lit ? AP.LIME : AP.IRON).drawRect(0, BOX_Y, W, BOX_H).endFill()
            .beginFill(lit ? AP.FOREST : AP.SHADOW).drawRect(1, BOX_Y + 1, W - 2, BOX_H - 2).endFill());
        this.things.forEach(([id, n], k) => this.thingRow(1, BOX_Y + 1 + k * THING, W - 2, id, n, true, false));
        if (this.things.length < OFFER_MOST) {
            const y = BOX_Y + 5 + this.things.length * THING;
            if (lit) text("Let go to put it in", 5, y, AP.WHITE, this.body);
            else if (!this.things.length) {
                text("Drag things here from your Inventory", 5, y, AP.IRON, this.body);
                text("(then click a row to change how many)", 5, y + 10, AP.IRON, this.body);
            }
        }

        // gold
        const gy = BOX_Y + BOX_H + 5;
        const coin = new PIXI.Sprite(coinTexture());
        coin.position.set(2, gy + 2);
        this.body.addChild(coin);
        this.goldField.container.position.set(13, gy);
        const g = this.gold(), have = IBC.data.inventory.gold ?? 0;
        text(g > have ? "more than you have" : `of your ${have.toLocaleString("en-US")}g`, 98, gy + 2, g > have ? AP.FLAME : AP.IRON, this.body);

        text(`Not taken in ${LETTER_DAYS} days? It comes back to you.`, 0, gy + 16, AP.IRON, this.body);

        const by = H - 26;
        this.bigButton(this.sending ? "Sending..." : "Send", 0, by, () => { if (!this.sending) this.sendIt(); });
        const cw = textWidth("Clear") + 6;
        button("Clear", W - cw, by + 1, this.body, () => { this.clearLetter(); this.unfocus(); this.draw(); });
    }

    //#endregion

    // a thing in a letter: its sprite (its info), name, how many; one being
    // written clicked to type how many (the wheel steps it), x to take it out
    private thingRow(x: number, y: number, w: number, id: number, n: number, writing: boolean, faded: boolean) {
        const { THING } = Mail;
        const typing = writing && this.typing == id;
        const r = new PIXI.Container();
        r.position.set(x, y);
        const back = new PIXI.Graphics();
        const paint = (over: boolean) => back.clear().beginFill(typing ? AP.SLATE : over && writing ? AP.INK : AP.SHADOW).drawRect(0, 0, w, THING - 1).endFill();
        paint(false);
        r.addChild(back);
        const sprite = new PIXI.Sprite(itemTexture(id));
        sprite.position.set(0, -1);
        sprite.alpha = faded ? 0.5 : 1;
        r.addChild(sprite);
        const shown = typing ? this.typed : n.toLocaleString("en-US");
        const right = writing ? w - 12 : w - 3;
        const a = text(shown, 0, 4, faded ? AP.STONE : AP.WHITE, r);
        a.x = right - Math.ceil(a.textWidth);
        fit(text(itemName(id), 18, 4, faded ? AP.STONE : AP.ASH, r), a.x - 22);
        if (writing && n > this.have(id)) text("(you have fewer)", 0, 4, AP.FLAME, r).x = a.x - 70;
        if (typing) {
            this.caret.position.set(x + right + 1, y + 3.5);
            this.caret.visible = true;
            this.body.addChild(this.caret);
        }
        r.eventMode = "static";
        if (writing) {
            r.cursor = "text";
            r.on("pointerover", () => paint(true));
            r.on("pointerout", () => paint(false));
            r.on("pointerdown", (e: PIXI.FederatedPointerEvent) => { e.stopPropagation(); this.typeAmount(id); });
            r.on("wheel", (e: PIXI.FederatedWheelEvent) => { this.typed = ""; this.setAmount(id, n + (e.deltaY < 0 ? 1 : -1)); });
            const x2 = text("x", w - 8, 4, AP.STONE, r);
            const hit = new PIXI.Container();
            hit.eventMode = "static";
            hit.cursor = "pointer";
            hit.hitArea = new PIXI.Rectangle(w - 11, 0, 11, THING - 1);
            hit.on("pointerover", () => { x2.tint = AP.FLAME; });
            hit.on("pointerout", () => { x2.tint = AP.STONE; });
            hit.on("pointerdown", (e: PIXI.FederatedPointerEvent) => e.stopPropagation());
            hit.on("pointertap", () => this.removeThing(id));
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

    // a green button; its width
    private bigButton(label: string, x: number, y: number, act: () => void) {
        const w = textWidth(label) + 14;
        const b = new PIXI.Container();
        b.position.set(x, y);
        const back = new PIXI.Graphics();
        const paint = (over: boolean) => back.clear()
            .beginFill(AP.BLACK).drawRect(0, 0, w, 11).endFill()
            .beginFill(over ? AP.GRASS : AP.LEAF).drawRect(1, 1, w - 2, 9).endFill();
        paint(false);
        b.addChild(back);
        text(label, 7, 2, AP.WHITE, b);
        b.eventMode = "static";
        b.cursor = "pointer";
        b.on("pointerdown", (e: PIXI.FederatedPointerEvent) => e.stopPropagation());
        b.on("pointerover", () => paint(true));
        b.on("pointerout", () => paint(false));
        b.on("pointertap", act);
        this.body.addChild(b);
        return w;
    }

    //#endregion

}

let coin: PIXI.Texture;
function coinTexture() {
    return coin ??= picTexture(coinIcon());
}

const MINUTE = 60 * 1000, HOUR = 60 * MINUTE, DAY = 24 * HOUR;

function ago(at: number) {
    const ms = Date.now() - at;
    if (ms < MINUTE) return "Just now";
    if (ms < HOUR) return `${Math.floor(ms / MINUTE)} min ago`;
    if (ms < DAY) return `${Math.floor(ms / HOUR)}h ago`;
    const d = Math.floor(ms / DAY);
    return `${d} day${d == 1 ? "" : "s"} ago`;
}

function shortAgo(at: number) {
    const ms = Date.now() - at;
    return ms < HOUR ? `${Math.max(1, Math.floor(ms / MINUTE))}m` : ms < DAY ? `${Math.floor(ms / HOUR)}h` : `${Math.floor(ms / DAY)}d`;
}

function daysLeft(ends: number) {
    const ms = ends - Date.now();
    if (ms < DAY) return `${Math.max(1, Math.ceil(ms / HOUR))}h`;
    const d = Math.ceil(ms / DAY);
    return `${d} day${d == 1 ? "" : "s"}`;
}
