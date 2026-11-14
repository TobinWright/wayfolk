import * as PIXI from "pixi.js";
import { CHANNELS, CHAT_LONGEST, ChatLine, GUILD_CHANNEL, REPORT_REASONS } from "../../../../shared/Chat";
import { canInvite } from "../../../../shared/Guilds";
import { maskSwearing } from "../../../../shared/ChatFilter";
import { Constants } from "../../constants/Constants";
import { Event } from "../../constants/Events";
import { AP } from "../../constants/Palette";
import { chatIcon, crownIcon, SMALL_ICON } from "../../art/MenuIcons";
import { ChatData } from "../../data/ChatData";
import { IBC } from "../../Engine";
import { picTexture } from "../../people/People";
import { BaseComponent, ComponentType } from "../BaseComponent";
import { MainMenu } from "../mainmenu/MainMenu";
import { Mail } from "../mail/Mail";
import { Profile } from "../profile/Profile";
import { EventNotices } from "./EventNotices";
import { outlined } from "../ringmenu/RingMenu";
import { typingInField } from "../../shared/dom/Dom";

// The chat, in the bottom left (the user, 2026-10-28): its button (a speech
// bubble) in the corner, opening and closing it - lit while it's closed and
// something's been said -, and over it a tab for each channel
// (shared/Chat.ts) along the top - one with lines you haven't seen lit -,
// the channel's lines under them (the newest at the bottom; the wheel
// scrolls back), and the line you're typing along the bottom. Closed, Enter
// opens it typing; open, Enter (or clicking that line) starts typing, Enter
// again says it (nothing typed, or Enter when not typing, closes it), Escape
// stops; Tab moves to the next channel. A subscriber's name is in the colour
// they picked (gold to start), a crown before it (ChatLine.p). Hovering a line shows when it was said
// (DD-MM-YY HH:MM:SS, the player's own time). While it's typing it takes the keys
// (Chat.takes: the map's WASD and Escape closing windows leave them alone).
// The last tab is whispers (shared/Friends.ts): yours and your friends', and
// notes such as an ask come in; they go to the friend picked (clicking a
// name there, or Msg in Friends). Lines from anyone you've blocked aren't shown.
// Chat safety (shared/Chat.ts, the user, 2026-10-29): clicking someone's name
// opens a menu by it - their Profile (shared/Profile.ts), Whisper (a friend)
// or Add friend, Block, and Report (picking why). Swearing's shown with asterisks unless that's off in
// Settings. Notes for you only (a line refused, a report taken) are in every channel.
// Guilds (shared/Guilds.ts, the user, 2026-10-29): a Guild tab before Whispers,
// your guild's own chat (what happens in it said there too, from "Guild");
// in the channels a guild's tag by each of its members' names. An officer or
// leader has Invite to guild in the menu by a name.
// Trading (shared/Trade.ts): Trade in the menu by a name asks them.
// An event's lines aren't in it: they slide in from the left (EventNotices).

// a Supporter's name's colours, as NAME_COLORS names them (none of them the
// SKY anyone else's is, or the LIME yours is)
export const NAME_TINTS = [AP.AMBER, AP.STRAW, AP.EMBER, AP.PINK, AP.ORCHID, AP.FOAM, AP.PALE, AP.ICE];

const TABS = [...CHANNELS, "Guild", "Whispers"];
const GUILD = GUILD_CHANNEL;
const WHISPERS = GUILD_CHANNEL + 1;

export class Chat extends BaseComponent {

    public static SCALE = 2;
    public static W = 300;              // the chat, in its own px
    public static H = 236;
    public static TAB_H = 12;
    public static INPUT_H = 13;
    public static LINE = 10;
    public static PAD = 4;
    public static LEFT = 20;            // screen px in from the left
    public static BOTTOM = 20;          // and up from the bottom
    public static GAP = 8;              // screen px between the button and the chat
    public static BLINK_MS = 500;       // the caret

    // the chat's taking the keys (typing)
    public static typing = false;

    private open = false;
    private missed = false;             // something said while it was closed
    private channel = 0;
    private unread = new Set<number>();
    private draft = "";
    private back = 0;                   // lines scrolled back from the newest
    private blink = 0;

    private button: PIXI.Container;
    private dot: PIXI.Graphics;
    private light: PIXI.Graphics;       // connected or not, by the button
    private lightTip: PIXI.Container;
    private content: PIXI.Container;
    private tabs: PIXI.Container;
    private lines: PIXI.Container;
    private input: PIXI.Container;
    private caret: PIXI.Graphics;
    private tip: PIXI.Container;        // when the line under the pointer was said
    private menu: PIXI.Container;       // the menu by a name clicked
    private menuFor: ChatLine = null;   // (whose)
    private menuAt = new PIXI.Point();
    private reporting = false;          // (the menu's showing why to report them)
    private asked = false;              // (a friend asked for from the menu: what came of it said here)
    private invited = false;            // (and someone invited into your guild)
    private measure: PIXI.BitmapText;
    private notices: EventNotices;
    private static crownTexture: PIXI.Texture;

    private keys = (e: KeyboardEvent) => this.onKey(e);
    private paste = (e: ClipboardEvent) => {
        if (!Chat.typing) return;
        this.draft = (this.draft + (e.clipboardData?.getData("text") ?? "").replace(/\s+/g, " ")).slice(0, CHAT_LONGEST);
        this.drawInput();
    };

    constructor() {
        super(ComponentType.CHAT);
        this.create();
    }

    // not typing (something else is)
    public static stop() {
        (IBC.comp.getFirstByType(ComponentType.CHAT) as Chat)?.setTyping(false);
    }

    // a subscriber's crown, before their name (this chat's and a game room's), at x, y
    public static crown(x: number, y: number, parent: PIXI.Container) {
        const crown = new PIXI.Sprite(Chat.crownTexture ??= picTexture(crownIcon()));
        crown.position.set(x, y);
        parent.addChild(crown);
        return crown;
    }

    // a subscriber's name's tint, by a line's p (1 + their NAME_COLORS)
    public static nameTint(p: number) {
        return NAME_TINTS[p - 1] ?? NAME_TINTS[0];
    }

    // the whispers, to a friend, typing
    public static whisperTo(friendId: number) {
        const chat = IBC.comp.getFirstByType(ComponentType.CHAT) as Chat;
        if (!chat) return;
        IBC.data.friends.to = friendId;
        chat.setOpen(true);
        chat.setChannel(WHISPERS);
        chat.setTyping(true);
    }

    // a key the chat has taken (others leave it alone)
    public static takes(e: KeyboardEvent) {
        return Chat.typing || !!(e as any).chat || typingInField();     // (an HTML field focused: Dom.ts)
    }

    public create() {
        super.create();
        const { W, H, SCALE, TAB_H, INPUT_H } = Chat;
        // the button, its bottom left on the container's corner; a dot on it while something's missed
        this.button = new PIXI.Container();
        const icon = new PIXI.Sprite(picTexture(outlined(chatIcon())));
        icon.anchor.set(0, 1);
        icon.scale.set(MainMenu.SCALE);
        this.dot = new PIXI.Graphics().beginFill(AP.BLACK).drawRect(-1, -1, 5, 5).endFill().beginFill(AP.RED).drawRect(0, 0, 3, 3).endFill();
        this.dot.scale.set(MainMenu.SCALE);
        this.dot.position.set(MainMenu.SIZE - 6 * MainMenu.SCALE, -MainMenu.SIZE + 2 * MainMenu.SCALE);
        this.button.addChild(icon, this.dot);
        this.button.eventMode = "static";
        this.button.cursor = "pointer";
        this.button.on("pointerenter", () => { this.button.y = 1; });
        this.button.on("pointerleave", () => { this.button.y = 0; });
        this.button.on("pointerdown", (e: PIXI.FederatedPointerEvent) => { e.stopPropagation(); this.button.y = 2; this.setOpen(!this.open); });
        this.button.on("pointerup", () => { this.button.y = 1; });
        this.container.addChild(this.button);

        // a light by the button: green while connected to the server, red not; hovering it says which
        this.light = new PIXI.Graphics();
        this.light.scale.set(MainMenu.SCALE);
        this.light.position.set(MainMenu.SIZE + 3 * MainMenu.SCALE, -Math.round(MainMenu.SIZE / 2) - 2 * MainMenu.SCALE);
        this.light.eventMode = "static";
        this.light.hitArea = new PIXI.Rectangle(-3, -3, 11, 11);
        this.lightTip = new PIXI.Container();
        this.lightTip.scale.set(Chat.SCALE);
        this.lightTip.eventMode = "none";
        this.lightTip.visible = false;
        this.light.on("pointerenter", () => { this.drawLightTip(); this.lightTip.visible = true; });
        this.light.on("pointerleave", () => { this.lightTip.visible = false; });
        this.container.addChild(this.light, this.lightTip);
        IBC.events.register(Event.NETWORK_CONNECTED, () => this.drawLight(), this);
        IBC.events.register(Event.NETWORK_DISCONNECTED, () => this.drawLight(), this);
        this.drawLight();

        this.content = new PIXI.Container();
        this.content.scale.set(SCALE);
        this.content.y = -MainMenu.SIZE - Chat.GAP - H * SCALE;
        this.content.visible = this.open;
        this.container.addChild(this.content);
        this.content.eventMode = "static";
        this.content.hitArea = new PIXI.Rectangle(0, 0, W, H);
        this.content.on("pointerdown", (e: PIXI.FederatedPointerEvent) => { e.stopPropagation(); this.closeMenu(); });
        this.content.on("wheel", (e: PIXI.FederatedWheelEvent) => {
            e.stopPropagation();
            this.closeMenu();
            this.back = Math.max(0, this.back + (e.deltaY < 0 ? 3 : -3));
            this.drawLines();
        });

        // the window: the tabs over a dark box, the line being typed along its bottom
        const box = new PIXI.Graphics();
        box.beginFill(AP.BLACK, 0.85).drawRect(0, TAB_H, W, H - TAB_H).endFill();
        box.beginFill(AP.INK, 0.85).drawRect(1, TAB_H + 1, W - 2, H - TAB_H - 2).endFill();
        box.beginFill(AP.BLACK).drawRect(1, H - INPUT_H - 1, W - 2, 1).endFill();
        this.content.addChild(box);

        this.tabs = new PIXI.Container();
        this.lines = new PIXI.Container();
        const mask = new PIXI.Graphics().beginFill(0xffffff).drawRect(1, TAB_H + 1, W - 2, H - TAB_H - INPUT_H - 3).endFill();
        this.lines.mask = mask;
        this.input = new PIXI.Container();
        this.input.position.set(0, H - INPUT_H);
        this.caret = new PIXI.Graphics();
        this.tip = new PIXI.Container();
        this.tip.eventMode = "none";
        this.tip.visible = false;
        this.menu = new PIXI.Container();
        this.menu.eventMode = "static";
        this.menu.on("pointerdown", (e: PIXI.FederatedPointerEvent) => e.stopPropagation());
        this.content.addChild(mask, this.tabs, this.lines, this.input, this.tip, this.menu);

        // clicking the line being typed starts typing; clicking the map stops it
        this.input.eventMode = "static";
        this.input.cursor = "text";
        this.input.hitArea = new PIXI.Rectangle(0, 0, W, INPUT_H);
        this.input.on("pointertap", () => this.setTyping(true));
        IBC.events.register(Event.MAP_POINTER_DOWN, () => { this.setTyping(false); this.closeMenu(); }, this);

        this.notices = new EventNotices();
        IBC.events.register(Event.CHAT_SAID, (line: ChatLine) => {
            if (ChatData.isEvent(line)) return this.notices.add(line);
            if (!this.open && !IBC.data.friends.isBlocked(line.n, line.i)) { this.missed = true; this.drawButton(); }
            if (line.c >= 0 && line.c != this.channel) { this.unread.add(line.c); this.drawTabs(); return; }
            if (this.back) this.back++;     // (scrolled back: what's shown stays put)
            this.drawLines();
        }, this);
        IBC.events.register(Event.WHISPER_SAID, () => this.onWhispers(), this);
        IBC.events.register(Event.CHAT_FILTER, () => this.drawLines(), this);
        IBC.events.register(Event.FRIEND_LIST, () => { this.onWhispers(); if (this.channel != WHISPERS) this.drawLines(); }, this);
        IBC.events.register(Event.FRIEND_SAID, (said: { text: string, ok: boolean }) => {
            if (!this.asked) return;
            this.asked = false;
            this.addNote(said.text, !said.ok);
        }, this);
        IBC.events.register(Event.GUILD_RESULT, (said: { text: string, ok: boolean }) => {
            if (!this.invited) return;
            this.invited = false;
            this.addNote(said.text, !said.ok);
        }, this);
        IBC.events.register(Event.GUILD, () => { if (this.channel == GUILD) this.draw(); }, this);
        if (IBC.data.friends.unseen()) this.unread.add(WHISPERS);
        window.addEventListener("keydown", this.keys);
        document.addEventListener("paste", this.paste);

        this.draw();
        this.drawButton();
        this.resize();
    }

    public destroy() {
        super.destroy();
        window.removeEventListener("keydown", this.keys);
        document.removeEventListener("paste", this.paste);
        this.setTyping(false);
        this.measure?.destroy();
        this.notices.destroy();
        this.container.destroy({ children: true });
    }

    public resize() {
        this.setPosition(Chat.LEFT, window.innerHeight - Chat.BOTTOM);
    }

    public update(deltaTime: number) {
        this.notices.update(deltaTime);
        if (!Chat.typing) return;
        this.blink += deltaTime;
        this.caret.visible = Math.floor(this.blink / Chat.BLINK_MS) % 2 == 0;
    }

    private setOpen(open: boolean) {
        if (open == this.open) return;
        this.open = open;
        this.content.visible = open;
        if (!open) { this.setTyping(false); this.hideTip(); this.closeMenu(); }
        else {
            this.missed = false;
            if (this.channel == WHISPERS && this.unread.delete(WHISPERS)) { this.seeWhispers(); this.draw(); }
        }
        this.drawButton();
    }

    private drawButton() {
        this.dot.visible = !this.open && (this.missed || this.unread.has(WHISPERS));
    }

    private lightText() {
        const net = IBC.net;
        return net?.connected ? "Online" : net?.wasConnected ? "Disconnected" : "Offline";
    }

    private drawLight() {
        const on = !!IBC.net?.connected;
        this.light.clear().beginFill(AP.BLACK).drawRect(-1, -1, 5, 5).endFill().beginFill(on ? AP.GRASS : AP.RED).drawRect(0, 0, 3, 3).endFill();
        if (this.lightTip.visible) this.drawLightTip();
    }

    // the light's tip, above it
    private drawLightTip() {
        this.lightTip.removeChildren().forEach((c) => c.destroy({ children: true }));
        const text = this.lightText();
        const w = this.width(text) + 6;
        this.lightTip.addChild(new PIXI.Graphics().beginFill(AP.BLACK).drawRect(0, 0, w, 11).endFill().beginFill(AP.SHADOW).drawRect(1, 1, w - 2, 9).endFill());
        this.text(text, 3, 2, AP.WHITE, this.lightTip);
        this.lightTip.position.set(this.light.x - 2 * Chat.SCALE, this.light.y - 14 * Chat.SCALE);
    }

    private setTyping(on: boolean) {
        if (on && !this.open) return;
        if (on == Chat.typing) return;
        Chat.typing = on;
        this.blink = 0;
        if (this.input) this.drawInput();
        IBC.events.emit(Event.CHAT_TYPING, on);
    }

    private setChannel(channel: number) {
        this.channel = channel;
        this.closeMenu();
        this.unread.delete(channel);
        this.back = 0;
        if (channel == WHISPERS) this.seeWhispers();
        this.draw();
    }

    // a whisper or note came: lit, or shown and seen
    private onWhispers() {
        if (this.channel != WHISPERS || !this.open) {
            if (IBC.data.friends.unseen()) { this.unread.add(WHISPERS); this.drawTabs(); this.drawButton(); }
            return;
        }
        this.seeWhispers();
        if (this.back) this.back++;
        this.draw();
    }

    private seeWhispers() {
        const friends = IBC.data.friends;
        if (friends.whispers.some((w) => w.u && !w.s)) IBC.net.friend.seen();
        friends.seeAll();
    }

    private onKey(e: KeyboardEvent) {
        if (e.ctrlKey || e.metaKey || e.altKey) return;
        if (!Chat.typing && (e as any).chat) return;    // (taken by something else typing)
        if (!Chat.typing) {
            if (e.key == "Escape" && this.menuFor) { this.closeMenu(); (e as any).chat = true; return; }
            if (e.key != "Enter" || IBC.comp.getFirstByType(ComponentType.TITLE)) return;
            // closed: open, typing; open: close
            if (this.open) this.setOpen(false);
            else { this.setOpen(true); this.setTyping(true); }
            e.preventDefault();
            return;
        }
        (e as any).chat = true;
        e.preventDefault();
        if (e.key == "Enter") {
            const text = this.draft.trim();
            if (text && this.channel == WHISPERS) { if (IBC.data.friends.friend(IBC.data.friends.to)) IBC.net.friend.whisper(IBC.data.friends.to, text); }
            else if (text && this.channel == GUILD) { if (IBC.data.guilds.guild || text.startsWith("/")) IBC.net.guild.say(text); }
            else if (text) IBC.net.chat.say(this.channel, text);
            this.draft = "";
            this.back = 0;
            this.setTyping(false);
            if (!text) this.setOpen(false);
            this.drawLines();
        }
        else if (e.key == "Escape") this.setTyping(false);
        else if (e.key == "Tab") this.setChannel((this.channel + (e.shiftKey ? TABS.length - 1 : 1)) % TABS.length);
        else if (e.key == "Backspace") { this.draft = this.draft.slice(0, -1); this.drawInput(); }
        else if (e.key.length == 1 && this.draft.length < CHAT_LONGEST) { this.draft += e.key; this.drawInput(); }
        this.blink = 0;
    }

    private draw() {
        this.drawTabs();
        this.drawLines();
        this.drawInput();
    }

    // one a channel, each as wide as its name (and some)
    private drawTabs() {
        const { TAB_H } = Chat;
        this.tabs.removeChildren().forEach((c) => c.destroy({ children: true }));
        let x = 0;
        TABS.forEach((name, i) => {
            const on = i == this.channel, w = this.width(name) + 10;
            const tab = new PIXI.Container();
            tab.position.set(x, 0);
            x += w + 1;
            const back = new PIXI.Graphics();
            back.beginFill(AP.BLACK).drawRect(0, 0, w, TAB_H + (on ? 1 : 0)).endFill();
            back.beginFill(on ? AP.INK : AP.SHADOW).drawRect(1, 1, w - 2, on ? TAB_H : TAB_H - 2).endFill();
            tab.addChild(back);
            this.text(name, 5, 3, on ? AP.WHITE : this.unread.has(i) ? AP.STRAW : AP.STONE, tab);
            tab.eventMode = "static";
            tab.cursor = "pointer";
            tab.hitArea = new PIXI.Rectangle(0, 0, w, TAB_H);
            tab.on("pointertap", () => { if (!on) this.setChannel(i); });
            this.tabs.addChild(tab);
        });
    }

    // the channel's lines, wrapped, the newest at the bottom (less `back`)
    private drawLines() {
        const { W, H, TAB_H, INPUT_H, LINE, PAD } = Chat;
        this.lines.removeChildren().forEach((c) => c.destroy({ children: true }));
        const width = W - PAD * 2, me = IBC.data.player.name;
        this.hideTip();
        // every line as rows of [x, text (or the crown), tint, (clicking it)] pieces, and when it was said
        type Tap = (e: PIXI.FederatedPointerEvent) => void;
        const rows: { a: number; pieces: [number, string | null, number, Tap?][] }[] = [];
        const add = (a: number, name: string, tint: number, text: string, textTint: number, tap?: Tap, crowned = false, tag = "") => {
            const crownW = crowned ? SMALL_ICON + 2 : 0, tagText = tag ? `[${tag}]` : "", tagW = tag ? this.width(tagText) + 3 : 0;
            const nameW = name ? crownW + tagW + this.width(name) + 4 : 0;
            const wrapped = wrap(text, width - nameW, width, (s) => this.width(s));
            rows.push({ a, pieces: [
                ...(crowned ? [[0, null, 0] as [number, null, number]] : []),
                ...(tag ? [[crownW, tagText, AP.STONE] as [number, string, number]] : []),
                [crownW + tagW, name, tint, tap], [nameW, wrapped[0], textTint]] });
            for (const more of wrapped.slice(1)) rows.push({ a, pieces: [[0, more, textTint]] });
        };
        const hide = IBC.data.chat.hideSwearing;
        const note = (line: ChatLine) => add(line.a, "", AP.ASH, line.t, line.e == ChatData.WARNING ? AP.FLAME : AP.ASH);
        if (this.channel == WHISPERS) {
            // (with the notes for you, by when)
            const friends = IBC.data.friends, notes = IBC.data.chat.lines.filter((l) => l.c < 0);
            let n = 0;
            for (const w of friends.whispers) {
                while (n < notes.length && notes[n].a <= w.a) note(notes[n++]);
                const pick = friends.friend(w.w) ? () => { friends.to = w.w; this.drawInput(); } : undefined;
                if (w.s) add(w.a, w.n, AP.STRAW, w.t, AP.STONE);
                else add(w.a, w.m ? `To ${w.n}:` : `${w.n}:`, w.m ? AP.LIME : AP.PINK, hide ? maskSwearing(w.t) : w.t, AP.WHITE, pick);
            }
            while (n < notes.length) note(notes[n++]);
        } else {
            for (const line of IBC.data.chat.of(this.channel)) {
                if (line.e == ChatData.NOTE || line.e == ChatData.WARNING) note(line);
                else if (line.e) add(line.a, `${line.n}:`, AP.STRAW, line.t, AP.SAND);     // (the game's: a season's, an announcement, a guild's)
                else if (line.n == me || !IBC.data.friends.isBlocked(line.n, line.i)) {
                    const mine = line.n == me, tap = !mine && line.i ? (e: PIXI.FederatedPointerEvent) => this.openMenu(line, e) : undefined;
                    add(line.a, `${line.n}:`, line.p ? Chat.nameTint(line.p) : mine ? AP.LIME : AP.SKY, hide ? maskSwearing(line.t) : line.t, AP.WHITE, tap, !!line.p,
                        this.channel == GUILD ? "" : line.g ?? "");     // (in the guild's own chat, no tags: they're all its)
                }
            }
        }
        const fits = Math.floor((H - TAB_H - INPUT_H - 4) / LINE);
        this.back = Math.min(this.back, Math.max(0, rows.length - fits));
        const shown = rows.slice(Math.max(0, rows.length - fits - this.back), rows.length - this.back);
        let y = H - INPUT_H - 3 - shown.length * LINE;
        for (const { a, pieces } of shown) {
            // a row, hovered, shows when it was said
            const row = new PIXI.Container();
            row.position.set(0, y);
            row.eventMode = "static";
            row.hitArea = new PIXI.Rectangle(0, 0, W, LINE);
            row.on("pointerenter", (e: PIXI.FederatedPointerEvent) => this.showTip(a, e));
            row.on("pointermove", (e: PIXI.FederatedPointerEvent) => this.moveTip(e));
            row.on("pointerleave", () => this.hideTip());
            this.lines.addChild(row);
            for (const [x, text, tint, tap] of pieces) {
                if (text == null) { Chat.crown(PAD + x, 1, row); continue; }
                const t = this.text(text, PAD + x, 2, tint, row);
                if (!tap) continue;
                t.eventMode = "static";
                t.cursor = "pointer";
                t.on("pointertap", tap);
            }
            y += LINE;
        }
        if (this.back) {
            const more = this.text(`${this.back} more`, 0, TAB_H + 3, AP.STONE, this.lines);
            more.x = W - PAD - Math.ceil(more.textWidth);
        }
    }

    // when a line was said (DD-MM-YY HH:MM:SS), in a box over the pointer
    private showTip(a: number, e: PIXI.FederatedPointerEvent) {
        this.tip.removeChildren().forEach((c) => c.destroy({ children: true }));
        const d = new Date(a), two = (n: number) => String(n).padStart(2, "0");
        const when = `${two(d.getDate())}-${two(d.getMonth() + 1)}-${two(d.getFullYear() % 100)} ${two(d.getHours())}:${two(d.getMinutes())}:${two(d.getSeconds())}`;
        const w = this.width(when) + 6;
        this.tip.addChild(new PIXI.Graphics().beginFill(AP.BLACK).drawRect(0, 0, w, 11).endFill().beginFill(AP.SHADOW).drawRect(1, 1, w - 2, 9).endFill());
        this.text(when, 3, 2, AP.WHITE, this.tip);
        this.tip.visible = true;
        this.moveTip(e);
    }

    private moveTip(e: PIXI.FederatedPointerEvent) {
        if (!this.tip.visible) return;
        const p = this.content.toLocal(e.global);
        this.tip.position.set(Math.round(Math.min(p.x + 4, Chat.W - this.tip.width)), Math.round(p.y - 13));
    }

    private hideTip() {
        if (this.tip) this.tip.visible = false;
    }

    //#region the menu by a name

    // a note for you, in the chat (not sent anywhere)
    private addNote(text: string, warn = false) {
        IBC.events.emit(Event.CHAT_SAID, IBC.data.chat.note(text, warn));
    }

    private openMenu(line: ChatLine, e: PIXI.FederatedPointerEvent) {
        e.stopPropagation();
        this.menuFor = line;
        this.reporting = false;
        this.menuAt = this.content.toLocal(e.global);
        this.hideTip();
        this.drawMenu();
    }

    private closeMenu() {
        if (!this.menuFor) return;
        this.menuFor = null;
        this.menu.removeChildren().forEach((c) => c.destroy({ children: true }));
    }

    // their name, then what can be done: Whisper or Add friend, Block, Report
    // (picked, the reasons to report them for, and Back)
    private drawMenu() {
        const { W, H, LINE } = Chat, line = this.menuFor, friends = IBC.data.friends;
        this.menu.removeChildren().forEach((c) => c.destroy({ children: true }));
        if (!line) return;
        type Option = [string, (() => void) | null, number?];
        const options: Option[] = [];
        if (this.reporting) {
            REPORT_REASONS.forEach((reason, k) => options.push([reason, () => { IBC.net.chat.report(line.k, k); this.closeMenu(); }]));
            options.push(["Back", () => { this.reporting = false; this.drawMenu(); }, AP.STONE]);
        } else {
            if (line.h) options.push([line.h, null, AP.STRAW]);     // (the title they show: shared/Seasons.ts)
            options.push(["Profile", () => { this.closeMenu(); Profile.open(line.n); }]);
            if (friends.friend(line.i)) options.push(["Whisper", () => { this.closeMenu(); Chat.whisperTo(line.i); }]);
            else if (friends.list.o.some((o) => o.i == line.i)) options.push(["Asked to be friends", null]);
            else options.push(["Add friend", () => { this.asked = true; IBC.net.friend.ask(line.n); this.closeMenu(); }]);
            if (line.i != IBC.data.player.id && !IBC.net.trade.view && !IBC.net.trade.ask)
                options.push(["Trade", () => { IBC.net.trade.request(line.i); this.closeMenu(); }]);
            if (line.i != IBC.data.player.id && (friends.friend(line.i) || IBC.data.guilds.rankOf(line.i) >= 0))
                options.push(["Send mail", () => { this.closeMenu(); Mail.writeTo(line.n); }]);
            const guild = IBC.data.guilds.guild;
            if (guild && canInvite(IBC.data.guilds.rankOf(IBC.data.player.id) as number) && line.g != guild.t)
                options.push(["Invite to guild", () => { this.invited = true; IBC.net.guild.invite(line.n); this.closeMenu(); }]);
            options.push(["Block", () => {
                IBC.net.friend.block(line.i);
                this.closeMenu();
                this.addNote(`You've blocked ${line.n}: you won't see what they say. Unblock them in Friends`);
            }]);
            options.push(["Report...", () => { this.reporting = true; this.drawMenu(); }, AP.FLAME]);
        }
        const title = this.reporting ? `Report ${line.n} for` : line.n;
        const w = Math.max(this.width(title), ...options.map(([label]) => this.width(label))) + 10;
        const h = 4 + LINE * (options.length + 1) + 2;
        const x = Math.round(Math.max(1, Math.min(this.menuAt.x, W - w - 1)));
        const y = Math.round(Math.max(Chat.TAB_H + 1, Math.min(this.menuAt.y + 4, H - Chat.INPUT_H - h - 1)));
        this.menu.position.set(x, y);
        this.menu.hitArea = new PIXI.Rectangle(0, 0, w, h);
        this.menu.addChild(new PIXI.Graphics()
            .beginFill(AP.BLACK).drawRect(0, 0, w, h).endFill()
            .beginFill(AP.SHADOW).drawRect(1, 1, w - 2, h - 2).endFill()
            .beginFill(AP.BLACK).drawRect(1, 2 + LINE, w - 2, 1).endFill());
        this.text(title, 5, 3, this.reporting ? AP.FLAME : AP.STRAW, this.menu);
        options.forEach(([label, act, tint], k) => {
            const row = new PIXI.Container();
            row.position.set(1, 4 + LINE * (k + 1));
            const back = new PIXI.Graphics();
            const paint = (lit: boolean) => back.clear().beginFill(lit && act ? AP.SLATE : AP.SHADOW).drawRect(0, 0, w - 2, LINE).endFill();
            paint(false);
            row.addChild(back);
            this.text(label, 4, 1, !act ? tint ?? AP.STONE : tint ?? AP.WHITE, row);
            row.eventMode = "static";
            row.cursor = act ? "pointer" : "default";
            row.hitArea = new PIXI.Rectangle(0, 0, w - 2, LINE);
            row.on("pointerenter", () => paint(true));
            row.on("pointerleave", () => paint(false));
            row.on("pointertap", (e: PIXI.FederatedPointerEvent) => { e.stopPropagation(); act?.(); });
            this.menu.addChild(row);
        });
    }

    //#endregion

    // the line being typed (its end, if it's longer than there's room for), or how to start
    private drawInput() {
        const { W, PAD } = Chat;
        this.input.removeChildren().forEach((c) => { if (c != this.caret) c.destroy({ children: true }); });
        const friends = IBC.data.friends, to = this.channel == WHISPERS ? friends.friend(friends.to) : null;
        const noGuild = this.channel == GUILD && !IBC.data.guilds.guild;
        if (noGuild) {
            this.text("Guild>", PAD, 3, AP.STEEL, this.input);     // greyed: no guild to talk to
            return;
        }
        if (!Chat.typing) {
            this.text(this.channel != WHISPERS ? "Press Enter to chat" : to ? `Press Enter to whisper to ${to.n}` : "Click a name to whisper to them", PAD, 3, AP.STONE, this.input);
            return;
        }
        if (this.channel == WHISPERS && !to) {
            this.text("Click a name, or Msg in Friends", PAD, 3, AP.STONE, this.input);
            return;
        }
        const prompt = this.text(to ? `To ${to.n}>` : this.channel == GUILD ? `[${IBC.data.guilds.guild.t}]>` : `${CHANNELS[this.channel]}>`, PAD, 3, to ? AP.PINK : this.channel == GUILD ? AP.STRAW : AP.SKY, this.input);
        const x = PAD + Math.ceil(prompt.textWidth) + 4, room = W - x - PAD - 3;
        let shown = this.draft;
        while (shown && this.width(shown) > room) shown = shown.slice(1);
        const t = this.text(shown, x, 3, AP.WHITE, this.input);
        this.caret.clear().beginFill(AP.WHITE).drawRect(0, 0, 1, 8).endFill();
        this.caret.position.set(x + (shown ? Math.ceil(t.textWidth) + 1 : 0), 2);
        this.caret.visible = true;
        this.input.addChild(this.caret);
    }

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

// text in lines no wider than `width` (the first `first` wide); a word too long for a line is cut
export function wrap(text: string, first: number, width: number, measure: (s: string) => number) {
    const lines: string[] = [];
    let line = "";
    const room = () => lines.length ? width : first;
    for (let word of text.split(" ")) {
        // a word longer than a whole line: as much as fits, a line at a time
        while (measure(word) > width) {
            const lead = line ? line + " " : "";
            let n = word.length;
            while (n > 1 && measure(lead + word.slice(0, n)) > room()) n--;
            lines.push(lead + word.slice(0, n));
            line = "";
            word = word.slice(n);
        }
        const next = line ? `${line} ${word}` : word;
        if (line && measure(next) > room()) { lines.push(line); line = word; }
        else if (!line && measure(next) > room()) { lines.push(""); line = word; }   // (not even a word by the name)
        else line = next;
    }
    lines.push(line);
    return lines;
}
