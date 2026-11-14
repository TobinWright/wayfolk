import * as PIXI from "pixi.js";
import { cleanFeedback, FEEDBACK_KINDS, FEEDBACK_LONGEST, FEEDBACK_SHORTEST } from "../../../../shared/Feedback";
import { Constants } from "../../constants/Constants";
import { Event } from "../../constants/Events";
import { AP, R64 } from "../../constants/Palette";
import { IBC } from "../../Engine";
import { Panel } from "../../shared/Panel";
import { TitleBar } from "../../shared/ui/titlebar/TitleBar";
import { BaseComponent, ComponentType } from "../BaseComponent";
import { Chat, wrap } from "../chat/Chat";
import { button, text, textButton, textWidth } from "../games/GameUI";

// Feedback (shared/Feedback.ts; the user, 2026-11-01: "add a feedback
// button and component to the menu"), from the other menu: what it's about
// (Bug, Idea, Other), a box to write in - several lines, Enter a new line,
// Ctrl+Enter sends - and Send. Staff read it on the admin panel's Feedback
// tab. Under it, the game's Discord. What's said back along the bottom;
// Escape or its cross closes it.

const KIND_HINTS = [
    "What went wrong? What were you doing just before?",
    "What would you like to see in the game?",
    "Anything else you'd like to tell us.",
];
const LINE = 9;
const BOX_LINES = 9;
const BLINK_MS = 500;

export class Feedback extends BaseComponent {

    public static SCALE = 2;
    public static W = 240;              // the content, in its own px
    public static H = 160;
    public static BOX_Y = 40;
    public static BOX_H = BOX_LINES * LINE + 4;
    public static INSET_X = 12;
    public static INSET_Y = 28;
    public static WIDTH = Feedback.INSET_X * 2 + Feedback.W * Feedback.SCALE;
    public static HEIGHT = Feedback.INSET_Y + Feedback.H * Feedback.SCALE + Feedback.INSET_X;

    private static kind = -1;           // (kept, with what's written, if it's closed unsent)
    private static words = "";
    private focused = true;
    private sending = false;
    private said = "";
    private saidTint: number = AP.ASH;
    private blink = 0;

    public background: Panel;
    public titleBar: TitleBar;
    private content: PIXI.Container;
    private body: PIXI.Container;
    private caret = new PIXI.Graphics().beginFill(AP.WHITE).drawRect(0, 0, 1, 8).endFill();

    private keys = (e: KeyboardEvent) => this.onKey(e);
    private paste = (e: ClipboardEvent) => {
        if (!this.focused) return;
        e.preventDefault();
        this.write(e.clipboardData?.getData("text") ?? "");
    };

    constructor() {
        super(ComponentType.FEEDBACK);
        this.create();
    }

    public static open() {
        const view = IBC.comp.getOrCreate(ComponentType.FEEDBACK) as Feedback;
        view.bringToTop();
        Chat.stop();
        return view;
    }

    public create() {
        super.create();
        const { WIDTH, HEIGHT, W, H, SCALE, INSET_X, INSET_Y } = Feedback;
        this.container.eventMode = "static";
        this.container.hitArea = new PIXI.Rectangle(0, 0, WIDTH, HEIGHT);
        this.container.on("pointerdown", (e: PIXI.FederatedPointerEvent) => { e.stopPropagation(); this.focus(false); });

        this.background = new Panel(this.container);
        this.background.setSize(WIDTH, HEIGHT);
        this.titleBar = new TitleBar(this);
        this.titleBar.setPosition(4, 4);
        this.titleBar.setSize(WIDTH - 8, 20);
        this.titleBar.setTitle("Feedback");

        this.content = new PIXI.Container();
        this.content.scale.set(SCALE);
        this.content.position.set(INSET_X, INSET_Y);
        this.container.addChild(this.content);
        this.content.addChild(new PIXI.Graphics().beginFill(AP.INK).drawRect(-4, -2, W + 8, H + 6).endFill());
        this.body = new PIXI.Container();
        this.content.addChild(this.body);

        window.addEventListener("keydown", this.keys, true);     // (first, so the others see it's taken)
        document.addEventListener("paste", this.paste);
        IBC.events.register(Event.FEEDBACK_SENT, () => {
            this.sending = false;
            Feedback.words = "";
            this.say("Sent - thank you! We read every one.", R64.LEAF);
        }, this);
        IBC.events.register(Event.FEEDBACK_REFUSED, (why: string) => {
            this.sending = false;
            this.say(why, R64.SALMON);
        }, this);
        IBC.events.register(Event.CHAT_TYPING, (on: boolean) => { if (on) this.focus(false); }, this);
        IBC.events.register(Event.MAP_POINTER_DOWN, () => this.focus(false), this);

        this.setPosition(Math.max(0, Math.round((window.innerWidth - WIDTH) / 2)), Math.max(0, Math.round((window.innerHeight - HEIGHT) / 2) - 20));
        this.draw();
    }

    public destroy() {
        super.destroy();
        window.removeEventListener("keydown", this.keys, true);
        document.removeEventListener("paste", this.paste);
        IBC.events.unregisterAll(this);
        this.caret.destroy();
        this.titleBar.destroy();
        this.background.destroy();
        this.container.destroy({ children: true });
    }

    public update(deltaTime: number) {
        if (!this.focused) return;
        this.blink += deltaTime;
        this.caret.visible = Math.floor(this.blink / BLINK_MS) % 2 == 0;
    }

    //#region keys

    private focus(on: boolean) {
        if (on == this.focused) return;
        this.focused = on;
        this.blink = 0;
        if (on) Chat.stop();
        this.draw();
    }

    private onKey(e: KeyboardEvent) {
        if (!this.focused) {
            if (e.key == "Escape" && !Chat.takes(e)) {
                (e as any).chat = true;
                e.preventDefault();
                IBC.comp.destroy(this);
            }
            return;
        }
        if ((e.ctrlKey || e.metaKey) && e.key == "Enter") {
            e.preventDefault();
            return this.sendIt();
        }
        if (e.ctrlKey || e.metaKey || e.altKey) return;     // (Ctrl+V: the paste event)
        (e as any).chat = true;
        e.preventDefault();
        if (e.key == "Escape") return this.focus(false);
        if (e.key == "Enter") return this.write("\n");
        if (e.key == "Backspace") {
            Feedback.words = Feedback.words.slice(0, -1);
            this.blink = 0;
            return this.draw();
        }
        if (e.key.length == 1) this.write(e.key);
    }

    private write(more: string) {
        Feedback.words = (Feedback.words + more.replace(/\r\n?/g, "\n")).slice(0, FEEDBACK_LONGEST);
        this.blink = 0;
        if (this.said) this.said = "";
        this.draw();
    }

    //#endregion

    private sendIt() {
        if (this.sending) return;
        const words = cleanFeedback(Feedback.words);
        if (Feedback.kind < 0) return this.say("Pick what it's about first", R64.SALMON);
        if (words.length < FEEDBACK_SHORTEST) return this.say("Write a little more first", R64.SALMON);
        this.sending = true;
        IBC.net.feedback.submit(Feedback.kind, words);
        this.say("Sending...");
    }

    private say(what: string, tint: number = AP.ASH) {
        this.said = what;
        this.saidTint = tint;
        this.draw();
    }

    private draw() {
        const { W, BOX_Y, BOX_H } = Feedback;
        this.caret.parent?.removeChild(this.caret);
        this.body.removeChildren().forEach((c) => c.destroy({ children: true }));
        const g = new PIXI.Graphics();
        this.body.addChild(g);

        // what it's about
        text("What's it about?", 2, 2, AP.MIST, this.body);
        const kw = Math.floor((W - 2 - 8) / FEEDBACK_KINDS.length);
        FEEDBACK_KINDS.forEach((name, k) => {
            const on = k == Feedback.kind, x = 2 + k * (kw + 4), y = 13;
            g.beginFill(on ? AP.STRAW : AP.BLACK).drawRect(x, y, kw, 12).endFill()
                .beginFill(on ? AP.IRON : AP.SLATE).drawRect(x + 1, y + 1, kw - 2, 10).endFill();
            const t = text(name, 0, y + 2, on ? AP.WHITE : AP.ASH, this.body);
            t.x = Math.round(x + (kw - t.textWidth) / 2);
            const hit = new PIXI.Container();
            hit.eventMode = "static";
            hit.cursor = "pointer";
            hit.hitArea = new PIXI.Rectangle(x, y, kw, 12);
            hit.on("pointerdown", (e: PIXI.FederatedPointerEvent) => e.stopPropagation());
            hit.on("pointertap", () => { Feedback.kind = k; this.said = ""; this.focus(true); this.draw(); });
            this.body.addChild(hit);
        });

        // the box: the last lines written, wrapped, the caret after them
        const count = text(`${Feedback.words.length} / ${FEEDBACK_LONGEST}`, 0, BOX_Y - 10, AP.STEEL, this.body);
        count.x = W - 2 - Math.ceil(count.textWidth);
        text("Tell us", 2, BOX_Y - 10, AP.MIST, this.body);
        g.beginFill(AP.BLACK).drawRect(0, BOX_Y, W, BOX_H).endFill()
            .beginFill(this.focused ? AP.SLATE : AP.SHADOW).drawRect(1, BOX_Y + 1, W - 2, BOX_H - 2).endFill();
        const box = new PIXI.Container();
        box.eventMode = "static";
        box.cursor = "text";
        box.hitArea = new PIXI.Rectangle(0, BOX_Y, W, BOX_H);
        box.on("pointerdown", (e: PIXI.FederatedPointerEvent) => { e.stopPropagation(); this.focus(true); });
        this.body.addChild(box);
        const room = W - 8;
        const lines = Feedback.words.split("\n").flatMap((para) => wrap(para, room, room, (s) => textWidth(s)));
        if (!Feedback.words && !this.focused) {
            const hint = text(Feedback.kind < 0 ? "Pick what it's about, then write it here." : KIND_HINTS[Feedback.kind], 3, BOX_Y + 3, AP.IRON, this.body);
            hint.maxWidth = room;
        } else {
            const shown = lines.slice(-BOX_LINES);
            shown.forEach((l, k) => text(l, 3, BOX_Y + 3 + k * LINE, AP.WHITE, this.body));
            if (this.focused) {
                const last = shown[shown.length - 1] ?? "";
                this.caret.position.set(3 + (last ? textWidth(last) + 1 : 0), BOX_Y + 2.5 + (shown.length - 1) * LINE);
                this.caret.visible = true;
                this.body.addChild(this.caret);
            }
        }
        if (!Feedback.words && this.focused && Feedback.kind >= 0) {
            const hint = text(KIND_HINTS[Feedback.kind], 5, BOX_Y + 3, AP.IRON, this.body);
            hint.maxWidth = room - 2;
        }

        // Send, and what's said back
        let y = BOX_Y + BOX_H + 4;
        const ready = !this.sending && Feedback.kind >= 0 && cleanFeedback(Feedback.words).length >= FEEDBACK_SHORTEST;
        if (ready) button("Send", W - textWidth("Send") - 6, y, this.body, () => this.sendIt());
        else {
            const w = textWidth("Send") + 6, x = W - w;
            g.beginFill(AP.BLACK).drawRect(x, y, w, 9).endFill().beginFill(AP.SHADOW).drawRect(x + 1, y + 1, w - 2, 7).endFill();
            text("Send", x + 3, y + 1, AP.IRON, this.body);
        }
        const said = text(this.said || "Ctrl+Enter sends", 2, y + 1, this.said ? this.saidTint : AP.STONE, this.body);
        said.maxWidth = W - textWidth("Send") - 14;
        y += 14;

        // the Discord
        g.beginFill(AP.SLATE).drawRect(0, y, W, 1).endFill();
        y += 4;
        text("Rather talk it over?", 2, y, AP.STONE, this.body);
        textButton("Join us on Discord", 2 + textWidth("Rather talk it over?") + 4, y, R64.SKY, AP.WHITE, this.body,
            () => window.open(Constants.DISCORD_INVITE, "_blank", "noopener"));
    }

}
