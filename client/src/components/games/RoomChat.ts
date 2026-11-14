import * as PIXI from "pixi.js";
import { maskSwearing } from "../../../../shared/ChatFilter";
import { CHAT_LONGEST } from "../../../../shared/Chat";
import { RoomLine } from "../../../../shared/Games";
import { SMALL_ICON } from "../../art/MenuIcons";
import { Event } from "../../constants/Events";
import { AP } from "../../constants/Palette";
import { IBC } from "../../Engine";
import { BaseComponent } from "../BaseComponent";
import { Chat, wrap } from "../chat/Chat";
import { text, textWidth } from "./GameUI";

// A game room's own chat (Blackjack, SlimeRace), w x h, on the window's
// left: its lines (the room's own - who sat down or bet, who won - grey),
// the newest at the bottom (the wheel scrolls back), the line being typed
// under them. Enter (or clicking the line) starts typing, Enter again says
// it, Escape stops; not typing, Escape calls `close` (the window's). Its
// listeners go with `owner`'s; destroy() takes the keyboard's.

export class RoomChat {

    public static INPUT_H = 13;
    public static LINE = 10;
    public static PAD = 4;
    public static BLINK_MS = 500;

    public view = new PIXI.Container();
    public comingIn = true;             // (no room yet: "Coming in...")
    private lines = new PIXI.Container();
    private input = new PIXI.Container();
    private caret: PIXI.Graphics;
    private said: RoomLine[] = [];
    private back = 0;                   // lines scrolled back from the newest
    private typing = false;
    private draft = "";
    private blink = 0;

    private keys = (e: KeyboardEvent) => this.onKey(e);
    private paste = (e: ClipboardEvent) => {
        if (!this.typing) return;
        this.draft = (this.draft + (e.clipboardData?.getData("text") ?? "").replace(/\s+/g, " ")).slice(0, CHAT_LONGEST);
        this.drawInput();
    };

    constructor(private w: number, private h: number, owner: BaseComponent, private close: () => void) {
        const { INPUT_H } = RoomChat;
        this.view.eventMode = "static";
        this.view.hitArea = new PIXI.Rectangle(0, 0, w, h);
        this.view.on("wheel", (e: PIXI.FederatedWheelEvent) => {
            e.stopPropagation();
            this.back = Math.max(0, this.back + (e.deltaY < 0 ? 3 : -3));
            this.drawLines();
        });
        const box = new PIXI.Graphics();
        box.beginFill(AP.BLACK).drawRect(0, 0, w, h).endFill();
        box.beginFill(AP.INK).drawRect(1, 1, w - 2, h - 2).endFill();
        box.beginFill(AP.BLACK).drawRect(1, h - INPUT_H - 1, w - 2, 1).endFill();
        this.view.addChild(box);
        const mask = new PIXI.Graphics().beginFill(0xffffff).drawRect(1, 1, w - 2, h - INPUT_H - 2).endFill();
        this.lines.mask = mask;
        this.input.position.set(0, h - INPUT_H);
        this.input.eventMode = "static";
        this.input.cursor = "text";
        this.input.hitArea = new PIXI.Rectangle(0, 0, w, INPUT_H);
        this.input.on("pointerdown", (e: PIXI.FederatedPointerEvent) => { e.stopPropagation(); this.setTyping(true); });
        this.caret = new PIXI.Graphics().beginFill(AP.WHITE).drawRect(0, 0, 1, 8).endFill();
        this.view.addChild(mask, this.lines, this.input);

        window.addEventListener("keydown", this.keys, true);     // (first, so the chat sees it's taken)
        document.addEventListener("paste", this.paste);
        IBC.events.register(Event.GAME_SAID, (line: RoomLine) => {
            this.said.push(line);
            if (this.said.length > 200) this.said.shift();
            if (this.back) this.back++;     // (scrolled back: what's shown stays put)
            this.drawLines();
        }, owner);
        IBC.events.register(Event.MAP_POINTER_DOWN, () => this.setTyping(false), owner);
        IBC.events.register(Event.CHAT_TYPING, (on: boolean) => { if (on) this.setTyping(false); }, owner);
        this.drawInput();
    }

    public destroy() {
        window.removeEventListener("keydown", this.keys, true);
        document.removeEventListener("paste", this.paste);
        this.typing = false;
    }

    public update(deltaTime: number) {
        if (!this.typing) return;
        this.blink += deltaTime;
        this.caret.visible = Math.floor(this.blink / RoomChat.BLINK_MS) % 2 == 0;
    }

    // the room's lines so far (coming in), or none (going into another)
    public reset(lines: RoomLine[] = []) {
        this.said = lines.slice();
        this.back = 0;
        this.drawLines();
    }

    public setTyping(on: boolean) {
        if (on == this.typing) return;
        this.typing = on;
        this.blink = 0;
        if (on) Chat.stop();
        this.drawInput();
    }

    private onKey(e: KeyboardEvent) {
        if (e.ctrlKey || e.metaKey || e.altKey) return;
        if (!this.typing) {
            if (Chat.takes(e)) return;
            if (e.key == "Escape") this.close();
            else if (e.key == "Enter") { (e as any).chat = true; e.preventDefault(); this.setTyping(true); }
            return;
        }
        (e as any).chat = true;
        e.preventDefault();
        if (e.key == "Enter") {
            const said = this.draft.trim();
            if (said) IBC.net.game.say(said);
            this.draft = "";
            this.back = 0;
            this.setTyping(false);
            this.drawLines();
        }
        else if (e.key == "Escape") this.setTyping(false);
        else if (e.key == "Backspace") { this.draft = this.draft.slice(0, -1); this.drawInput(); }
        else if (e.key.length == 1 && this.draft.length < CHAT_LONGEST) { this.draft += e.key; this.drawInput(); }
        this.blink = 0;
    }

    // the room's lines, wrapped, the newest at the bottom (less `back`)
    private drawLines() {
        const { INPUT_H, LINE, PAD } = RoomChat, { w, h } = this;
        this.lines.removeChildren().forEach((c) => c.destroy({ children: true }));
        const width = w - PAD * 2, me = IBC.data.player.name;
        // every line as rows of [x, text (or a subscriber's crown), tint] pieces
        const rows: [number, string | null, number][][] = [];
        for (const line of this.said) {
            if (line.s) {       // the room's own, grey, no name
                for (const row of wrap(line.t, width, width, textWidth)) rows.push([[0, row, AP.STONE]]);
                continue;
            }
            if (line.n != me && IBC.data.friends.isBlocked(line.n)) continue;
            const crownW = line.p ? SMALL_ICON + 2 : 0, name = `${line.n}:`, nameW = crownW + textWidth(name) + 4;
            const wrapped = wrap(IBC.data.chat.hideSwearing ? maskSwearing(line.t) : line.t, width - nameW, width, textWidth);
            rows.push([...(line.p ? [[0, null, 0] as [number, null, number]] : []), [crownW, name, line.p ? Chat.nameTint(line.p) : line.n == me ? AP.LIME : AP.SKY], [nameW, wrapped[0], AP.WHITE]]);
            for (const more of wrapped.slice(1)) rows.push([[0, more, AP.WHITE]]);
        }
        if (!rows.length) {
            if (this.comingIn) text("Coming in...", PAD, 4, AP.IRON, this.lines);
            return;
        }
        const fits = Math.floor((h - INPUT_H - 4) / LINE);
        this.back = Math.min(this.back, Math.max(0, rows.length - fits));
        const shown = rows.slice(Math.max(0, rows.length - fits - this.back), rows.length - this.back);
        let y = h - INPUT_H - 3 - shown.length * LINE;
        for (const row of shown) {
            for (const [x, s, tint] of row) {
                if (s == null) Chat.crown(PAD + x, y + 1, this.lines);
                else text(s, PAD + x, y + 2, tint, this.lines);
            }
            y += LINE;
        }
        if (this.back) {
            const more = `${this.back} more`, mw = textWidth(more);
            this.lines.addChild(new PIXI.Graphics().beginFill(AP.SHADOW).drawRect(w - PAD - mw - 3, 1, mw + PAD + 2, 10).endFill());
            text(more, w - PAD - mw, 3, AP.STONE, this.lines);
        }
    }

    // the line being typed (its end, if it's longer than there's room for), or how to start
    private drawInput() {
        const { PAD } = RoomChat;
        this.input.removeChildren().forEach((c) => { if (c != this.caret) c.destroy({ children: true }); });
        if (!this.typing) {
            text("Press Enter to chat", PAD, 3, AP.STONE, this.input);
            return;
        }
        const prompt = text(">", PAD, 3, AP.SKY, this.input);
        const x = PAD + Math.ceil(prompt.textWidth) + 3, room = this.w - x - PAD - 3;
        let shown = this.draft;
        while (shown && textWidth(shown) > room) shown = shown.slice(1);
        const t = text(shown, x, 3, AP.WHITE, this.input);
        this.caret.position.set(x + (shown ? Math.ceil(t.textWidth) + 1 : 0), 2);
        this.caret.visible = true;
        this.input.addChild(this.caret);
    }

}
