import * as PIXI from "pixi.js";
import { favouritesMost, FriendInfo, FRIENDS_MOST, Presence } from "../../../../shared/Friends";
import { Constants } from "../../constants/Constants";
import { Event } from "../../constants/Events";
import { AP } from "../../constants/Palette";
import { IBC } from "../../Engine";
import { Panel } from "../../shared/Panel";
import { Hint } from "../../shared/ui/Hint";
import { TitleBar } from "../../shared/ui/titlebar/TitleBar";
import { BaseComponent, ComponentType } from "../BaseComponent";
import { Chat } from "../chat/Chat";
import { Mail } from "../mail/Mail";
import { Map } from "../map/Map";

// Friends (shared/Friends.ts), from the other menu: asking someone by name
// along the top, then the asks to you (yes, no or block) and yours (cancel),
// your friends - signed in, away (signed out, their heroes still working) or
// when they were last seen, what their heroes are doing, and for each a star
// (a favourite: their heroes on your map), Msg (whisper to them), Find (the
// map to their heroes) and x (remove or block) - and those you've blocked,
// each on a card that lights under the pointer. The wheel or its bar scrolls it. While it's open the list is asked for again every
// REFRESH_MS (what their heroes are doing isn't sent otherwise). A window
// like the others (Panel and TitleBar); Escape or its cross closes it.

export class Friends extends BaseComponent {

    public static SCALE = 2;
    public static W = 220;              // the content, in its own px
    public static H = 230;
    public static TOP = 26;             // the list's top (under asking and what came of it)
    public static LINE = 11;
    public static HEAD = 12;            // a heading to what's under it
    public static ROW_H = 13;           // an ask or a blocked name, its card and the gap under it
    public static FRIEND_H = 23;        // a friend: their name and how they are, what their heroes are doing
    public static LIST_W = Friends.W - 6;   // the cards, the bar right of them
    public static INSET_X = 12;         // the window round it, in screen px
    public static INSET_Y = 28;
    public static WIDTH = Friends.INSET_X * 2 + Friends.W * Friends.SCALE;
    public static HEIGHT = Friends.INSET_Y + Friends.H * Friends.SCALE + Friends.INSET_X;
    public static REFRESH_MS = 30000;
    public static BLINK_MS = 500;

    public background: Panel;
    public titleBar: TitleBar;
    private content: PIXI.Container;
    private top: PIXI.Container;        // asking, the count, what came of it
    private list: PIXI.Container;
    private measure: PIXI.BitmapText;

    private typing = false;
    private draft = "";
    private blink = 0;
    private caret: PIXI.Graphics;
    private said = "";
    private saidTint: number = AP.ASH;
    private scroll = 0;                 // px of the list scrolled past
    private listH = 0;
    private bar: PIXI.Graphics;
    private grab: number = null;        // (dragging the bar: how far down the thumb it's held)
    private confirming = -1;            // the friend whose x was clicked (remove, block or keep)
    private finding = -1;               // the friend whose heroes were asked for, to find
    private refresh = 0;

    private keys = (e: KeyboardEvent) => this.onKey(e);
    private paste = (e: ClipboardEvent) => {
        if (!this.typing) return;
        this.draft = (this.draft + (e.clipboardData?.getData("text") ?? "").replace(/\s+/g, " ")).trim().slice(0, 64);
        this.drawTop();
    };

    constructor() {
        super(ComponentType.FRIENDS);
        this.create();
    }

    // the window (one open at a time), its list asked for again
    public static open() {
        const view = IBC.comp.getOrCreate(ComponentType.FRIENDS) as Friends;
        view.bringToTop();
        IBC.net.friend.list();
    }

    public create() {
        super.create();
        const { W, H, WIDTH, HEIGHT, SCALE, TOP } = Friends;
        this.container.eventMode = "static";
        this.container.hitArea = new PIXI.Rectangle(0, 0, WIDTH, HEIGHT);
        this.container.on("pointerdown", (e: PIXI.FederatedPointerEvent) => { e.stopPropagation(); this.setTyping(false); });
        this.container.on("wheel", (e: PIXI.FederatedWheelEvent) => {
            e.stopPropagation();
            this.scroll += e.deltaY < 0 ? -Friends.LINE * 2 : Friends.LINE * 2;
            this.placeList();
        });

        this.background = new Panel(this.container);
        this.background.setSize(WIDTH, HEIGHT);
        this.titleBar = new TitleBar(this);
        this.titleBar.setPosition(4, 4);
        this.titleBar.setSize(WIDTH - 8, 20);
        this.titleBar.setTitle("Friends");

        this.content = new PIXI.Container();
        this.content.scale.set(SCALE);
        this.content.position.set(Friends.INSET_X, Friends.INSET_Y);
        this.container.addChild(this.content);
        this.top = new PIXI.Container();
        this.list = new PIXI.Container();
        const mask = new PIXI.Graphics().beginFill(0xffffff).drawRect(0, TOP, W, H - TOP).endFill();
        this.list.mask = mask;
        this.caret = new PIXI.Graphics().beginFill(AP.WHITE).drawRect(0, 0, 1, 8).endFill();
        this.bar = new PIXI.Graphics();
        this.content.addChild(new PIXI.Graphics().beginFill(AP.INK).drawRect(-4, TOP - 3, W + 8, H - TOP + 5).endFill());
        this.content.addChild(mask, this.top, this.list, this.bar);
        // the bar dragged by its thumb, or the thumb jumped to where the track's pressed
        this.bar.eventMode = "static";
        this.bar.cursor = "pointer";
        this.bar.on("pointerdown", (e: PIXI.FederatedPointerEvent) => {
            e.stopPropagation();
            if (this.listH <= H - TOP) return;
            const y = this.content.toLocal(e.global).y - TOP;
            const { thumb, at } = this.thumb();
            this.grab = y >= at && y < at + thumb ? y - at : thumb / 2;
            this.dragTo(y);
        });
        this.bar.on("globalpointermove", (e: PIXI.FederatedPointerEvent) => { if (this.grab != null) this.dragTo(this.content.toLocal(e.global).y - TOP); });
        this.bar.on("pointerup", () => this.grab = null);
        this.bar.on("pointerupoutside", () => this.grab = null);

        window.addEventListener("keydown", this.keys, true);     // (first, so the others see it's taken)
        document.addEventListener("paste", this.paste);
        IBC.events.register(Event.FRIEND_LIST, () => this.draw(), this);
        IBC.events.register(Event.FRIEND_SAID, (said: { text: string, ok: boolean }) => this.say(said.text, said.ok ? AP.LIME : AP.FLAME), this);
        IBC.events.register(Event.FRIEND_HEROES, (owner: number) => { if (owner == this.finding) { this.finding = -1; this.centerOn(owner); } }, this);
        IBC.events.register(Event.MAP_POINTER_DOWN, () => this.setTyping(false), this);
        IBC.events.register(Event.CHAT_TYPING, (on: boolean) => { if (on) this.setTyping(false); }, this);

        this.setPosition(Math.round((window.innerWidth - WIDTH) / 2), Math.round((window.innerHeight - HEIGHT) / 2));
        this.draw();
    }

    public destroy() {
        super.destroy();
        window.removeEventListener("keydown", this.keys, true);
        document.removeEventListener("paste", this.paste);
        this.typing = false;
        this.titleBar.destroy();
        this.background.destroy();
        this.measure?.destroy();
        this.container.destroy({ children: true });
    }

    public update(deltaTime: number) {
        if ((this.refresh += deltaTime) >= Friends.REFRESH_MS) {
            this.refresh = 0;
            IBC.net.friend.list();
        }
        if (this.typing) {
            this.blink += deltaTime;
            this.caret.visible = Math.floor(this.blink / Friends.BLINK_MS) % 2 == 0;
        }
    }

    //#region typing a name

    private setTyping(on: boolean) {
        if (on == this.typing) return;
        this.typing = on;
        this.blink = 0;
        if (on) Chat.stop();
        this.drawTop();
    }

    private onKey(e: KeyboardEvent) {
        if (e.ctrlKey || e.metaKey || e.altKey) return;
        if (!this.typing) {
            if (e.key == "Escape" && !Chat.takes(e)) IBC.comp.destroy(this);
            return;
        }
        (e as any).chat = true;
        e.preventDefault();
        if (e.key == "Enter") this.send();
        else if (e.key == "Escape") this.setTyping(false);
        else if (e.key == "Backspace") { this.draft = this.draft.slice(0, -1); this.drawTop(); }
        else if (e.key.length == 1 && this.draft.length < 64) { this.draft += e.key; this.drawTop(); }
        this.blink = 0;
    }

    // ask the name typed
    private send() {
        const name = this.draft.trim();
        if (name) IBC.net.friend.ask(name);
        this.draft = "";
        if (this.typing) this.setTyping(false);
        else this.drawTop();
    }

    private say(text: string, tint: number) {
        this.said = text;
        this.saidTint = tint;
        this.drawTop();
    }

    //#endregion

    //#region drawing

    private draw() {
        this.drawTop();
        this.drawList();
    }

    // asking by name (Enter or Add), and what came of the last ask
    private drawTop() {
        const { W } = Friends;
        this.top.removeChildren().forEach((c) => { if (c != this.caret) c.destroy({ children: true }); });
        const w = this.buttons(this.top, 0, [["Add", () => this.send(), GO]], W, 11) - 2;
        const field = new PIXI.Graphics();
        field.beginFill(this.typing ? AP.STEEL : AP.BLACK).drawRect(0, 0, w, 11).endFill();
        field.beginFill(this.typing ? AP.SLATE : AP.INK).drawRect(1, 1, w - 2, 9).endFill();
        field.eventMode = "static";
        field.cursor = "text";
        field.on("pointerdown", (e: PIXI.FederatedPointerEvent) => { e.stopPropagation(); this.setTyping(true); });
        this.top.addChild(field);
        if (this.typing || this.draft) {
            let shown = this.draft;
            while (shown && this.width(shown) > w - 8) shown = shown.slice(1);
            const t = this.text(shown, 3, 2, AP.WHITE, this.top);
            if (this.typing) {
                this.caret.position.set(3 + (shown ? Math.ceil(t.textWidth) + 1 : 0), 1.5);
                this.caret.visible = true;
                this.top.addChild(this.caret);
            }
        } else {
            this.text("Add by name", 3, 2, AP.STEEL, this.top);
        }
        if (this.said) this.text(this.fit(this.said, W), 0, 14, this.saidTint, this.top);
    }

    private drawList() {
        const { LIST_W, HEAD, ROW_H, FRIEND_H } = Friends, data = IBC.data.friends, { f, i, o, b } = data.list;
        this.list.removeChildren().forEach((c) => c.destroy({ children: true }));
        let y = 0;

        if (i.length) {
            this.heading("ASKING YOU", y);
            y += HEAD;
            for (const s of i) {
                const row = this.card(y, ROW_H - 1);
                const x = this.buttons(row, 1, [
                    ["Yes", () => IBC.net.friend.answer(s.i, true), GO],
                    ["No", () => IBC.net.friend.answer(s.i, false)],
                    ["Block", () => IBC.net.friend.block(s.i), STOP],
                ]);
                this.text(this.fit(s.n, x - 8), 4, 2, AP.WHITE, row);
                y += ROW_H;
            }
            y += 5;
        }
        if (o.length) {
            this.heading("YOU'VE ASKED", y);
            y += HEAD;
            for (const s of o) {
                const row = this.card(y, ROW_H - 1);
                const x = this.buttons(row, 1, [["Cancel", () => IBC.net.friend.cancel(s.i)]]);
                const when = ago(s.a), name = this.text(this.fit(s.n, x - 12 - this.width(when)), 4, 2, AP.ASH, row);
                this.text(when, 8 + Math.ceil(name.textWidth), 2, AP.STEEL, row);
                y += ROW_H;
            }
            y += 5;
        }

        const most = favouritesMost(IBC.data.premium.active);
        this.heading(`FRIENDS  ${f.length}/${FRIENDS_MOST}`, y, `${data.favourites()}/${most}`,
            `Favourites, up to ${most}: their heroes are on your map`);
        y += HEAD;
        if (!f.length) {
            const row = this.card(y, 25);
            const a = this.text("No friends yet", 0, 4, AP.ASH, row), c = this.text("Add someone by name, above", 0, 14, AP.STEEL, row);
            a.x = Math.round((LIST_W - a.textWidth) / 2);
            c.x = Math.round((LIST_W - c.textWidth) / 2);
            y += 27;
        }
        const order = (a: FriendInfo) => (a.f ? 0 : 3) + (2 - a.p);
        for (const friend of f.slice().sort((a, c) => order(a) - order(c) || a.n.localeCompare(c.n))) {
            this.friendRow(friend, y);
            y += FRIEND_H;
        }

        if (b.length) {
            y += 5;
            this.heading("BLOCKED", y);
            y += HEAD;
            for (const s of b) {
                const row = this.card(y, ROW_H - 1);
                const x = this.buttons(row, 1, [["Unblock", () => IBC.net.friend.unblock(s.i)]]);
                this.text(this.fit(s.n, x - 8), 4, 2, AP.STONE, row);
                y += ROW_H;
            }
        }

        this.listH = y;
        this.placeList();
    }

    // a friend's card: how they are, what their heroes are doing, and what can be done
    private friendRow(friend: FriendInfo, y: number) {
        const { LIST_W, FRIEND_H } = Friends;
        const row = this.card(y, FRIEND_H - 2);
        const tint = friend.p == Presence.ONLINE ? AP.LIME : friend.p == Presence.AWAY ? AP.AMBER : AP.IRON;
        row.addChild(new PIXI.Graphics().beginFill(tint).drawRect(4, 4, 4, 2).drawRect(5, 3, 2, 4).endFill());

        let right: number;
        if (this.confirming == friend.i) {
            right = this.buttons(row, 1, [
                ["Remove", () => { this.confirming = -1; IBC.net.friend.remove(friend.i); }, STOP],
                ["Block", () => { this.confirming = -1; IBC.net.friend.block(friend.i); }, STOP],
                ["Keep", () => { this.confirming = -1; this.drawList(); }],
            ]);
        } else {
            right = this.buttons(row, 1, [
                // (signed in, a trade; not, a letter)
                friend.p == Presence.ONLINE ? ["Trade", () => IBC.net.trade.request(friend.i)] : ["Mail", () => Mail.writeTo(friend.n)],
                ["Msg", () => Chat.whisperTo(friend.i)],
                ["Find", () => this.find(friend.i)],
                ["x", () => { this.confirming = friend.i; this.drawList(); }, STOP],
            ]) - 9;
            this.star(right, 1, !!friend.f, row, () => {
                const most = favouritesMost(IBC.data.premium.active);
                if (!friend.f && IBC.data.friends.favourites() >= most) this.say(`Up to ${most} favourites: take one off first`, AP.FLAME);
                else IBC.net.friend.favourite(friend.i, !friend.f);
            });
        }

        const name = this.text(this.fit(friend.n, right - 14), 11, 2, friend.p == Presence.OFFLINE ? AP.ASH : AP.WHITE, row);
        const how = friend.p == Presence.ONLINE ? "online"
            : friend.p == Presence.AWAY ? `away, ${left(friend.u)} left` : `seen ${ago(friend.s)}`;
        const hx = 15 + Math.ceil(name.textWidth);
        if (right - 3 - hx >= this.width("...") + 6) this.text(this.fit(how, right - 3 - hx), hx, 2, AP.STONE, row);

        if (friend.a?.length) {
            const all = friend.a[0] + (friend.a.length > 1 ? `  (+${friend.a.length - 1} more)` : "");
            const shown = this.fit(all, LIST_W - 15);
            const d = this.text(shown, 11, 11, AP.STEEL, row);
            if (friend.a.length > 1 || shown != all) {
                d.eventMode = "static";
                Hint.on(d, friend.a.join("  /  "));
            }
        }
    }

    // a section's name, a rule running from it to the right edge (or to `right`, a lit star before it)
    private heading(label: string, y: number, right = "", hint = "") {
        const { LIST_W } = Friends;
        this.text(label, 0, y + 1, AP.STONE, this.list);
        const x = this.width(label) + 4;
        let end = LIST_W;
        if (right) {
            const t = this.text(right, 0, y + 1, AP.STONE, this.list);
            t.x = LIST_W - Math.ceil(t.textWidth);
            end = t.x - 13;
            const star = this.star(t.x - 9, y, true, this.list);
            if (hint) Hint.on(star, hint);
        }
        this.list.addChild(new PIXI.Graphics().beginFill(AP.IRON).drawRect(x, y + 4, end - x, 1).endFill());
    }

    // a card along the list at y, lit under the pointer; what's on it goes in it
    private card(y: number, h: number) {
        const row = new PIXI.Container();
        row.y = y;
        const back = new PIXI.Graphics();
        const paint = (lit: boolean) => back.clear()
            .beginFill(lit ? AP.SLATE : AP.SHADOW).drawRect(0, 0, Friends.LIST_W, h).endFill()
            .beginFill(lit ? AP.IRON : AP.SLATE).drawRect(0, h - 1, Friends.LIST_W, 1).endFill();
        paint(false);
        row.addChild(back);
        row.eventMode = "static";
        row.on("pointerenter", () => paint(true));
        row.on("pointerleave", () => paint(false));
        this.list.addChild(row);
        return row;
    }

    // buttons along the right of a row, the last rightmost (ending at right), h tall; where the first starts
    private buttons(parent: PIXI.Container, y: number, buttons: [string, () => void, Tone?][], right = Friends.LIST_W - 2, h = 9) {
        let x = right;
        for (const [label, act, [dark, lit] = PLAIN] of buttons.slice().reverse()) {
            const w = this.width(label) + 6;
            x -= w;
            const button = new PIXI.Container();
            button.position.set(x, y);
            const back = new PIXI.Graphics();
            const paint = (on: boolean) => back.clear()
                .beginFill(AP.BLACK).drawRect(0, 0, w, h).endFill()
                .beginFill(on ? lit : dark).drawRect(1, 1, w - 2, h - 2).endFill();
            paint(false);
            button.addChild(back);
            this.text(label, 3, Math.floor((h - 9) / 2) + 1, AP.WHITE, button);
            button.eventMode = "static";
            button.cursor = "pointer";
            button.hitArea = new PIXI.Rectangle(0, 0, w, h);
            button.on("pointerover", () => paint(true));
            button.on("pointerout", () => paint(false));
            button.on("pointerdown", (e: PIXI.FederatedPointerEvent) => e.stopPropagation());
            button.on("pointertap", act);
            parent.addChild(button);
            x -= 2;
        }
        return x;
    }

    // a favourite's star: lit, or just its outline (clicked, act)
    private star(x: number, y: number, on: boolean, parent: PIXI.Container, act?: () => void) {
        const points: number[] = [];
        for (let k = 0; k < 10; k++) {
            const a = -Math.PI / 2 + k * Math.PI / 5, r = k % 2 ? 1.6 : 3.8;
            points.push(3.5 + Math.cos(a) * r, 3.8 + Math.sin(a) * r);
        }
        const g = new PIXI.Graphics();
        if (on) g.beginFill(AP.STRAW).drawPolygon(points).endFill();
        else g.lineStyle(1, AP.STONE, 1, 0.5).drawPolygon(points);
        g.position.set(x, y);
        g.eventMode = "static";
        g.hitArea = new PIXI.Rectangle(-1, -1, 9, 9);
        parent.addChild(g);
        if (!act) return g;
        g.cursor = "pointer";
        g.on("pointerdown", (e: PIXI.FederatedPointerEvent) => e.stopPropagation());
        g.on("pointertap", act);
        Hint.on(g, on ? "A favourite: their heroes are on your map (click: no longer)" : "Make a favourite: their heroes on your map");
        return g;
    }

    // s, cut short with "..." to be no wider than room
    private fit(s: string, room: number) {
        if (this.width(s) <= room) return s;
        while (s && this.width(s + "...") > room) s = s.slice(0, -1);
        return s + "...";
    }

    //#endregion

    //#region scrolling

    // the bar's thumb: its length, and how far down the list's top it is
    private thumb() {
        const room = Friends.H - Friends.TOP;
        const thumb = Math.max(12, Math.round(room * room / this.listH));
        return { thumb, at: Math.round((room - thumb) * this.scroll / (this.listH - room)) };
    }

    // scrolled so the thumb's grabbed point is y down the list's top
    private dragTo(y: number) {
        const room = Friends.H - Friends.TOP, { thumb } = this.thumb();
        this.scroll = (y - this.grab) / (room - thumb) * (this.listH - room);
        this.placeList();
    }

    // the list where it's scrolled to, its bar on the right (a strip wider than it takes the pointer)
    private placeList() {
        const { W, H, TOP } = Friends, room = H - TOP;
        this.scroll = Math.max(0, Math.min(this.scroll, this.listH - room));
        this.list.y = TOP - this.scroll;
        this.bar.clear();
        this.bar.hitArea = this.listH > room ? new PIXI.Rectangle(W - 6, TOP, 6, room) : new PIXI.Rectangle(0, 0, 0, 0);
        if (this.listH <= room) return;
        const { thumb, at } = this.thumb();
        this.bar.beginFill(AP.SHADOW).drawRect(W - 3, TOP, 2, room).endFill();
        this.bar.beginFill(AP.STONE).drawRect(W - 3, TOP + at, 2, thumb).endFill();
    }

    //#endregion

    //#region finding their heroes

    // the map to their heroes: a favourite's are known, anyone else's asked for
    private find(owner: number) {
        if (IBC.data.friends.friend(owner)?.f && IBC.data.friends.heroesOf(owner).length) return this.centerOn(owner);
        this.finding = owner;
        IBC.net.friend.find(owner);
    }

    private centerOn(owner: number) {
        const rows = IBC.data.friends.heroesOf(owner), map = IBC.comp.getFirstByType(ComponentType.MAP) as Map;
        if (!rows.length) return this.say(`${IBC.data.friends.friend(owner)?.n ?? "They"} has no heroes yet`, AP.ASH);
        const at = IBC.data.heroes.position(rows[0]);
        map?.camera.centerOn(at.x, at.y);
    }

    //#endregion

    private width(text: string) {
        this.measure ??= new PIXI.BitmapText("", { fontName: Constants.PIXEL_FONT, fontSize: 32 });
        this.measure.text = text;
        return Math.ceil(this.measure.textWidth);
    }

    private text(text: string, x: number, y: number, tint: number, parent: PIXI.Container) {
        const t = new PIXI.BitmapText(text, { fontName: Constants.PIXEL_FONT, fontSize: 32 });
        t.tint = tint;
        t.position.set(x, y);
        t.eventMode = "none";
        parent.addChild(t);
        return t;
    }

}

// a button's colours: as it is, and lit
type Tone = [number, number];
const PLAIN: Tone = [AP.SLATE, AP.IRON], GO: Tone = [AP.FOREST, AP.LEAF], STOP: Tone = [AP.MAROON, AP.RED];

// how long ago, in a word or two
function ago(at: number) {
    const s = Math.max(0, (Date.now() - at) / 1000);
    if (s < 60) return "just now";
    if (s < 3600) return `${Math.floor(s / 60)}m ago`;
    if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
    return `${Math.floor(s / 86400)}d ago`;
}

// how long till `at`
function left(at: number) {
    const s = Math.max(0, (at - Date.now()) / 1000);
    if (s < 3600) return `${Math.max(1, Math.floor(s / 60))}m`;
    return `${Math.floor(s / 3600)}h`;
}
