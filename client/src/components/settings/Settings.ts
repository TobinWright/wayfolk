import * as PIXI from "pixi.js";
import { cleanName, NAME_LONGEST, nameProblem } from "../../../../shared/Names";
import { Event } from "../../constants/Events";
import { AP } from "../../constants/Palette";
import { IBC } from "../../Engine";
import { Panel } from "../../shared/Panel";
import { TitleBar } from "../../shared/ui/titlebar/TitleBar";
import { Sound } from "../../utils/Sound";
import { BaseComponent, ComponentType } from "../BaseComponent";
import { Effects } from "../../utils/Effects";
import { Chat } from "../chat/Chat";
import { text, textWidth } from "../games/GameUI";
import { legalText } from "../../shared/Legal";
import { Invites, INVITES_NAMES } from "../../../../shared/Parties";
import { DeleteAccount } from "./DeleteAccount";
import { SaveAccount } from "./SaveAccount";

// Settings, from the other menu (the user, 2026-10-28): how loud the music and
// the effects are - a slider each (dragged, clicked or wheeled; moving one
// unmutes it), its name clicked to mute or unmute it (Sound, kept in this
// browser) - and your display name (shared/Names.ts): clicked to type a new
// one, Enter or Save to change it, Escape to leave it - and whether the chat
// hides swearing (shared/ChatFilter.ts; on to start with, kept in this browser:
// data/ChatData; the user, 2026-10-29: chat safety) - and who can ask your
// heroes into their party (shared/Parties.ts Invites; the user, 2026-11-03:
// "players should be able to set who can invite them in settings"; kept on
// the server) - and your account (the
// user, 2026-10-29): a guest's Save account (SaveAccount: as an email or
// Google account, keeping everything), else its email (whether it's
// confirmed, the confirm link sent again) and Sign out - and your data (the
// privacy policy): Download my data, Delete account (DeleteAccount) and the
// legal pages (shared/Legal.ts). A window like the
// others (Panel and TitleBar); Escape or its cross closes it.

type Channel = "music" | "effects";
const CHANNELS: [Channel, string][] = [["music", "Music"], ["effects", "Effects"]];

interface Row { label: PIXI.BitmapText; strike: PIXI.Graphics; track: PIXI.Graphics; value: PIXI.BitmapText; }

export class Settings extends BaseComponent {

    public static SCALE = 2;
    public static W = 200;              // its content, in its own px
    public static H = 234;
    public static ROW = 14;
    public static HEAD = 12;            // a heading to what's under it
    public static SLIDER_X = 45;        // a slider's left (own px)
    public static SLIDER_W = 119;
    public static EFFECTS_Y = 41;       // reduce flashing and shaking (under the sound)
    public static NAME_Y = 61;          // the name's heading
    public static CHAT_Y = 94;          // the chat's
    public static PARTY_Y = 126;        // who can ask your heroes into a party
    public static ACCOUNT_Y = 152;      // the account's
    public static ACCOUNT_ROW = 14;
    public static DATA_Y = 198;         // your data's (and the legal pages)
    public static BUTTON_W = 34;
    public static BUTTON_PAD = 10;      // a button's label to its sides, both together
    public static INSET_X = 22;         // the window round it, in screen px
    public static INSET_Y = 36;
    public static WIDTH = Settings.INSET_X * 2 + Settings.W * Settings.SCALE;
    public static HEIGHT = Settings.INSET_Y + Settings.H * Settings.SCALE + Settings.INSET_X;
    public static BLINK_MS = 500;
    public static WHEEL_STEP = 0.05;

    public background: Panel;
    public titleBar: TitleBar;
    private content: PIXI.Container;
    private rows: { [channel: string]: Row } = {};
    private name: PIXI.Container;       // the field and Save (drawn again as they change)
    private caret: PIXI.Graphics;
    private invites: PIXI.Container;    // who can ask (drawn again as it changes)
    private account: PIXI.Container;    // (drawn again as it changes)
    private accountNote = "";           // (a confirm link sent, or why it couldn't be)
    private data: PIXI.Container;       // your data: Download, Delete and the legal pages (drawn again as it changes)
    private dataNote = "";              // (a download made, or why it couldn't be)

    private dragging: Channel = null;
    private typing = false;
    private draft = "";
    private blink = 0;
    private refused = "";               // (why the last change couldn't be: shown in the field till it's clicked)

    private keys = (e: KeyboardEvent) => this.onKey(e);
    private paste = (e: ClipboardEvent) => {
        if (!this.typing) return;
        this.draft = (this.draft + (e.clipboardData?.getData("text") ?? "")).replace(/\s+/g, " ").slice(0, NAME_LONGEST);
        this.drawName();
    };

    constructor() {
        super(ComponentType.SETTINGS);
        this.create();
    }

    // the window (one open at a time)
    public static open() {
        const view = IBC.comp.getOrCreate(ComponentType.SETTINGS) as Settings;
        view.bringToTop();
        return view;
    }

    public create() {
        super.create();
        const { WIDTH, HEIGHT, SCALE, INSET_X, INSET_Y } = Settings;
        this.container.eventMode = "static";
        this.container.hitArea = new PIXI.Rectangle(0, 0, WIDTH, HEIGHT);
        this.container.on("pointerdown", (e: PIXI.FederatedPointerEvent) => { e.stopPropagation(); this.setTyping(false); });
        this.container.on("wheel", (e: PIXI.FederatedWheelEvent) => e.stopPropagation());

        this.background = new Panel(this.container);
        this.background.setSize(WIDTH, HEIGHT);
        this.titleBar = new TitleBar(this);
        this.titleBar.setPosition(4, 4);
        this.titleBar.setSize(WIDTH - 8, 20);
        this.titleBar.setTitle("Settings");

        this.content = new PIXI.Container();
        this.content.scale.set(SCALE);
        this.content.position.set(INSET_X, INSET_Y);
        this.container.addChild(this.content);

        const { HEAD } = Settings;
        this.heading("SOUND", 0);
        CHANNELS.forEach(([channel, label], k) => this.createRow(channel, label, HEAD + k * Settings.ROW));
        this.createToggle("Reduce flashing and shaking", Settings.EFFECTS_Y, () => Effects.reduced(), (on) => Effects.set(on));

        this.heading("DISPLAY NAME", Settings.NAME_Y);
        this.name = new PIXI.Container();
        this.name.y = Settings.NAME_Y + HEAD;
        this.content.addChild(this.name);
        this.caret = new PIXI.Graphics().beginFill(AP.WHITE).drawRect(0, 0, 1, 8).endFill();
        this.drawName();

        this.heading("CHAT", Settings.CHAT_Y);
        this.createToggle("Hide swearing", Settings.CHAT_Y + HEAD, () => IBC.data.chat.hideSwearing, (on) => {
            IBC.data.chat.setHideSwearing(on);
            IBC.events.emit(Event.CHAT_FILTER);
        });

        this.heading("PARTY ASKS", Settings.PARTY_Y);
        this.invites = new PIXI.Container();
        this.invites.y = Settings.PARTY_Y + HEAD;
        this.content.addChild(this.invites);
        this.drawInvites();
        IBC.events.register(Event.PARTY_LIST, () => this.drawInvites(), this);

        this.heading("ACCOUNT", Settings.ACCOUNT_Y);
        this.account = new PIXI.Container();
        this.account.y = Settings.ACCOUNT_Y + HEAD;
        this.content.addChild(this.account);
        this.drawAccount();
        IBC.events.register(Event.PLAYER_ACCOUNT_SAVED, () => { this.accountNote = ""; this.drawAccount(); }, this);
        IBC.events.register(Event.PLAYER_CONFIRM_SENT, () => { this.accountNote = "Sent! Check your inbox"; this.drawAccount(); }, this);
        IBC.events.register(Event.PLAYER_SAVE_REFUSED, (why: string) => {
            if (SaveAccount.isOpen()) return;
            this.accountNote = why;
            this.drawAccount();
        }, this);

        this.heading("YOUR DATA", Settings.DATA_Y);
        this.data = new PIXI.Container();
        this.data.y = Settings.DATA_Y + HEAD;
        this.content.addChild(this.data);
        this.drawData();
        IBC.events.register(Event.PLAYER_EXPORTED, () => { this.dataNote = "Downloaded"; this.drawData(); }, this);
        IBC.events.register(Event.PLAYER_DELETE_REFUSED, (why: string) => {
            if (DeleteAccount.isOpen()) return;
            this.dataNote = why;
            this.drawData();
        }, this);

        window.addEventListener("keydown", this.keys, true);     // (first, so the others see it's taken)
        document.addEventListener("paste", this.paste);
        IBC.events.register(Event.PLAYER_NAME, () => { this.draft = ""; this.refused = ""; this.drawName(); }, this);
        IBC.events.register(Event.PLAYER_REFUSED, (why: string) => { this.refused = why; this.drawName(); }, this);
        IBC.events.register(Event.MAP_POINTER_DOWN, () => this.setTyping(false), this);
        IBC.events.register(Event.CHAT_TYPING, (on: boolean) => { if (on) this.setTyping(false); }, this);

        this.setPosition(Math.round((window.innerWidth - WIDTH) / 2), Math.round((window.innerHeight - HEIGHT) / 2));
    }

    public destroy() {
        super.destroy();
        window.removeEventListener("keydown", this.keys, true);
        document.removeEventListener("paste", this.paste);
        this.typing = false;
        SaveAccount.close();
        DeleteAccount.close();
        this.titleBar.destroy();
        this.background.destroy();
        this.caret.destroy();
        this.container.destroy({ children: true });
    }

    public update(deltaTime: number) {
        if (this.typing) {
            this.blink += deltaTime;
            this.caret.visible = Math.floor(this.blink / Settings.BLINK_MS) % 2 == 0;
        }
    }

    // a section's name, a rule running from it to the right edge
    private heading(label: string, y: number) {
        text(label, 0, y, AP.STONE, this.content);
        const x = textWidth(label) + 4;
        this.content.addChild(new PIXI.Graphics().beginFill(AP.IRON).drawRect(x, y + 3, Settings.W - x, 1).endFill());
    }

    // s, cut short with "..." to be no wider than room
    private fit(s: string, room = Settings.W) {
        if (textWidth(s) <= room) return s;
        while (s && textWidth(s + "...") > room) s = s.slice(0, -1);
        return s + "...";
    }

    //#region sound

    // a channel's name (muting it), its slider and how loud it is, at y
    private createRow(channel: Channel, label: string, y: number) {
        const { SLIDER_X, SLIDER_W } = Settings;
        const name = new PIXI.Container();
        name.position.set(0, y);
        name.eventMode = "static";
        name.cursor = "pointer";
        name.hitArea = new PIXI.Rectangle(-2, -1, SLIDER_X - 4, 11);
        const row: Row = {
            label: text(label, 0, 1, AP.WHITE, name),
            strike: new PIXI.Graphics().beginFill(AP.ASH).drawRect(-1, 4, textWidth(label) + 2, 1).endFill(),
            track: new PIXI.Graphics(),
            value: text("", 0, y + 1, AP.ASH, this.content),
        };
        name.addChild(row.strike);
        const muted = () => Sound.get()[`${channel}Muted`];
        name.on("pointerover", () => { row.label.tint = AP.LIME; });
        name.on("pointerout", () => this.paintRow(channel));
        name.on("pointertap", () => {
            Sound.set({ [`${channel}Muted`]: !muted() });
            this.paintRow(channel);
            row.label.tint = AP.LIME;
        });
        this.content.addChild(name);

        const track = row.track;
        track.position.set(SLIDER_X, y);
        track.eventMode = "static";
        track.cursor = "pointer";
        track.hitArea = new PIXI.Rectangle(-3, -1, SLIDER_W + 6, 12);
        track.on("pointerdown", (e: PIXI.FederatedPointerEvent) => { e.stopPropagation(); this.setTyping(false); this.dragging = channel; this.slide(channel, e); });
        track.on("globalpointermove", (e: PIXI.FederatedPointerEvent) => { if (this.dragging == channel) this.slide(channel, e); });
        track.on("pointerup", () => this.dragging = null);
        track.on("pointerupoutside", () => this.dragging = null);
        track.on("wheel", (e: PIXI.FederatedWheelEvent) => {
            const step = e.deltaY < 0 ? Settings.WHEEL_STEP : -Settings.WHEEL_STEP;
            this.setLevel(channel, Math.round((Sound.get()[channel] + step) * 100) / 100);
        });
        this.content.addChild(track);

        this.rows[channel] = row;
        this.paintRow(channel);
    }

    // the slider's level where the pointer is along it
    private slide(channel: Channel, e: PIXI.FederatedPointerEvent) {
        const x = this.rows[channel].track.toLocal(e.global).x;
        this.setLevel(channel, Math.round(x / Settings.SLIDER_W * 100) / 100);
    }

    // (unmuted: moving it is wanting to hear it)
    private setLevel(channel: Channel, level: number) {
        Sound.set({ [channel]: Math.max(0, Math.min(1, level)), [`${channel}Muted`]: false });
        this.paintRow(channel);
    }

    private paintRow(channel: Channel) {
        const { SLIDER_W } = Settings, row = this.rows[channel], levels = Sound.get();
        const level = levels[channel], muted = levels[`${channel}Muted`];
        row.label.tint = muted ? AP.IRON : AP.WHITE;
        row.strike.visible = muted;
        const fill = Math.round(level * (SLIDER_W - 2));
        row.track.clear()
            .beginFill(AP.BLACK).drawRect(0, 2, SLIDER_W, 7).endFill()
            .beginFill(AP.INK).drawRect(1, 3, SLIDER_W - 2, 5).endFill()
            .beginFill(muted ? AP.IRON : AP.LEAF).drawRect(1, 3, fill, 5).endFill()
            .beginFill(AP.BLACK).drawRect(fill - 1, 0, 5, 11).endFill()
            .beginFill(muted ? AP.STONE : AP.WHITE).drawRect(fill, 1, 3, 9).endFill();
        row.value.text = muted ? "Muted" : `${Math.round(level * 100)}%`;
        row.value.tint = muted ? AP.IRON : AP.ASH;
        row.value.x = Settings.W - textWidth(row.value.text);
    }

    //#endregion

    // a box ticked or not, and what it's for, at y: clicked, the other way
    private createToggle(label: string, y: number, get: () => boolean, set: (on: boolean) => void) {
        const toggle = new PIXI.Container();
        toggle.position.set(0, y);
        const box = new PIXI.Graphics();
        const t = text(label, 14, 1, AP.WHITE, toggle);
        const paint = (lit: boolean) => {
            box.clear().beginFill(AP.BLACK).drawRect(0, 0, 10, 10).endFill().beginFill(AP.INK).drawRect(1, 1, 8, 8).endFill();
            if (get()) box.beginFill(AP.LIME).drawRect(2, 5, 1, 1).drawRect(3, 6, 1, 1).drawRect(4, 5, 1, 1).drawRect(5, 4, 1, 1).drawRect(6, 3, 1, 1).drawRect(7, 2, 1, 1).endFill();
            t.tint = lit ? AP.LIME : AP.WHITE;
        };
        paint(false);
        toggle.addChild(box);
        toggle.eventMode = "static";
        toggle.cursor = "pointer";
        toggle.hitArea = new PIXI.Rectangle(-2, -1, 16 + textWidth(label), 12);
        toggle.on("pointerover", () => paint(true));
        toggle.on("pointerout", () => paint(false));
        toggle.on("pointertap", () => { set(!get()); paint(true); });
        this.content.addChild(toggle);
    }

    // who can ask your heroes into their party: a button each, the one it is lit
    private drawInvites() {
        this.invites.removeChildren().forEach((c) => c.destroy({ children: true }));
        let x = 0;
        for (const v of [Invites.ANYONE, Invites.FRIENDS, Invites.NOBODY]) {
            const w = this.buttonW(INVITES_NAMES[v]);
            this.smallButton(INVITES_NAMES[v], x, 0, w, IBC.data.parties.invites == v, () => IBC.net.party.invites(v), this.invites);
            x += w + 3;
        }
    }

    //#region account

    // a guest's: kept in this browser, and Save account; else the email it
    // signs in with (and whether it's confirmed) and Sign out
    private drawAccount() {
        const { W, ACCOUNT_ROW } = Settings, player = IBC.data.player;
        this.account.removeChildren().forEach((c) => c.destroy({ children: true }));
        if (player.type == "guest") {
            text("Guest: only in this browser", 0, 1, AP.ASH, this.account);
            this.smallButton("Save account", 0, ACCOUNT_ROW, 0, true, () => {
                this.setTyping(false);
                Chat.stop();
                SaveAccount.open();
            });
            return;
        }

        const outW = this.buttonW("Sign out");
        const shown = this.fit((player.type == "google" ? "Google: " : "") + (player.email ?? ""), W - outW - 6);
        text(shown, 0, 1, AP.WHITE, this.account);
        this.smallButton("Sign out", W - outW, 0, outW, false, () => IBC.net.player.signOut());

        const y = ACCOUNT_ROW + 1;
        if (this.accountNote) text(this.fit(this.accountNote), 0, y, AP.ASH, this.account);
        else if (player.confirmed) text("Email confirmed", 0, y, AP.STONE, this.account);
        else if (player.type == "email") {
            const lead = "Unconfirmed.";
            text(lead, 0, y, AP.STONE, this.account);
            const link = new PIXI.Container();
            link.position.set(textWidth(lead) + 5, y);
            const t = text("Send link again", 0, 0, AP.LIME, link);
            link.eventMode = "static";
            link.cursor = "pointer";
            link.hitArea = new PIXI.Rectangle(-1, -1, textWidth(t.text) + 2, 10);
            link.on("pointerover", () => t.tint = AP.PALE);
            link.on("pointerout", () => t.tint = AP.LIME);
            link.on("pointertap", () => IBC.net.player.resendConfirm());
            this.account.addChild(link);
        }
    }

    // your data (the privacy policy): a copy of it, or the account deleted
    // (DeleteAccount, to be sure), and the legal pages
    private drawData() {
        const { W, ACCOUNT_ROW } = Settings;
        this.data.removeChildren().forEach((c) => c.destroy({ children: true }));
        const deleteW = this.buttonW("Delete account");
        this.smallButton("Download my data", 0, 0, 0, false, () => {
            this.dataNote = "Getting it ready...";
            this.drawData();
            IBC.net.player.exportData();
        }, this.data);
        this.smallButton("Delete account", W - deleteW, 0, deleteW, false, () => {
            this.setTyping(false);
            Chat.stop();
            DeleteAccount.open();
        }, this.data);
        if (this.dataNote) text(this.fit(this.dataNote), 0, ACCOUNT_ROW + 1, AP.ASH, this.data);
        else legalText(this.data, 0, ACCOUNT_ROW + 1, ["terms", "privacy", "refunds", "credits"]);
    }

    // how wide a button for label is
    private buttonW(label: string) {
        return textWidth(label) + Settings.BUTTON_PAD;
    }

    // a button like Save's: green for going ahead, grey otherwise (w 0: as wide as its label needs)
    private smallButton(label: string, x: number, y: number, w: number, primary: boolean, onTap: () => void, parent = this.account) {
        w ||= this.buttonW(label);
        const button = new PIXI.Container();
        button.position.set(x, y);
        const box = new PIXI.Graphics();
        const paint = (lit: boolean) => box.clear()
            .beginFill(AP.BLACK).drawRect(0, 0, w, 11).endFill()
            .beginFill(primary ? (lit ? AP.GRASS : AP.LEAF) : (lit ? AP.STEEL : AP.IRON)).drawRect(1, 1, w - 2, 9).endFill();
        paint(false);
        button.addChild(box);
        text(label, Math.round((w - textWidth(label)) / 2), 2, AP.WHITE, button);
        button.eventMode = "static";
        button.cursor = "pointer";
        button.on("pointerdown", (e: PIXI.FederatedPointerEvent) => e.stopPropagation());
        button.on("pointerover", () => paint(true));
        button.on("pointerout", () => paint(false));
        button.on("pointertap", onTap);
        parent.addChild(button);
    }

    //#endregion

    //#region display name

    private setTyping(on: boolean) {
        if (on == this.typing) return;
        this.typing = on;
        this.blink = 0;
        if (on) {
            Chat.stop();
            this.draft = IBC.data.player.name ?? "";
            this.refused = "";
        }
        this.drawName();
    }

    private onKey(e: KeyboardEvent) {
        if (e.ctrlKey || e.metaKey || e.altKey || SaveAccount.isOpen() || DeleteAccount.isOpen()) return;
        if (!this.typing) {
            if (e.key == "Escape" && !Chat.takes(e)) IBC.comp.destroy(this);
            return;
        }
        (e as any).chat = true;
        e.preventDefault();
        if (e.key == "Enter") this.save();
        else if (e.key == "Escape") this.setTyping(false);
        else if (e.key == "Backspace") { this.draft = this.draft.slice(0, -1); this.drawName(); }
        else if (e.key.length == 1 && this.draft.length < NAME_LONGEST) { this.draft += e.key; this.drawName(); }
        this.blink = 0;
    }

    // what's in the way of saving the draft ("" nothing)
    private problem() {
        const name = cleanName(this.draft);
        if (name == IBC.data.player.name) return "That's your name already";
        return nameProblem(name);
    }

    private save() {
        if (!this.typing || this.problem()) return;
        IBC.net.player.rename(cleanName(this.draft));
        this.setTyping(false);
    }

    // the field (your name, what you're typing, or why a change couldn't be) and Save
    private drawName() {
        const { W, BUTTON_W } = Settings, w = W - BUTTON_W - 4;
        this.name.removeChildren().forEach((c) => { if (c != this.caret) c.destroy({ children: true }); });
        const field = new PIXI.Graphics();
        field.beginFill(AP.BLACK).drawRect(0, 0, w, 11).endFill();
        field.beginFill(this.typing ? AP.SLATE : AP.INK).drawRect(1, 1, w - 2, 9).endFill();
        field.eventMode = "static";
        field.cursor = "text";
        field.on("pointerdown", (e: PIXI.FederatedPointerEvent) => { e.stopPropagation(); this.setTyping(true); });
        this.name.addChild(field);
        let shown = this.typing ? this.draft : this.refused ? this.fit(this.refused, w - 8) : (IBC.data.player.name ?? "");
        while (shown && textWidth(shown) > w - 8) shown = shown.slice(1);
        const t = text(shown, 3, 2, !this.typing && this.refused ? AP.FLAME : AP.WHITE, this.name);
        if (this.typing) {
            this.caret.position.set(3 + (shown ? Math.ceil(t.width) + 1 : 0), 1.5);
            this.caret.visible = true;
            this.name.addChild(this.caret);
        }

        const problem = this.typing ? this.problem() : "";
        const can = this.typing && !problem;
        const button = new PIXI.Container();
        button.position.set(W - BUTTON_W, 0);
        const box = new PIXI.Graphics();
        const paint = (lit: boolean) => box.clear()
            .beginFill(AP.BLACK).drawRect(0, 0, BUTTON_W, 11).endFill()
            .beginFill(!can ? AP.IRON : lit ? AP.GRASS : AP.LEAF).drawRect(1, 1, BUTTON_W - 2, 9).endFill();
        paint(false);
        button.addChild(box);
        text("Save", Math.round((BUTTON_W - textWidth("Save")) / 2), 2, can ? AP.WHITE : AP.STONE, button);
        button.eventMode = "static";
        button.cursor = can ? "pointer" : "default";
        button.on("pointerdown", (e: PIXI.FederatedPointerEvent) => e.stopPropagation());
        button.on("pointerover", () => paint(can));
        button.on("pointerout", () => paint(false));
        button.on("pointertap", () => this.save());
        this.name.addChild(button);

    }

    //#endregion

}
