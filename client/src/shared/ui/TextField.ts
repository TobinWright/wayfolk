import * as PIXI from "pixi.js";
import { AP } from "../../constants/Palette";
import { text, textWidth } from "../../components/games/GameUI";

// A line to type in, in a window's own px (11 high): clicked, it takes the
// keys its window hands it (key), a caret blinking at its end (update);
// what's typed past its width scrolls off the left. Its window keeps one
// focused at a time, and lets go of them all when the chat starts typing.
export interface FieldOptions {
    max: number;                        // characters at most
    hint: string;                       // shown while it's empty and not focused
    upper?: boolean;                    // in capitals
    digits?: boolean;                   // 0-9 only (an amount)
    onEnter?: (value: string) => void;
    onFocus?: () => void;               // (clicked: the window lets go of the others)
}

export class TextField {

    public static BLINK_MS = 500;

    public container = new PIXI.Container();
    public value = "";
    public focused = false;
    private caret = new PIXI.Graphics().beginFill(AP.WHITE).drawRect(0, 0, 1, 8).endFill();
    private blink = 0;

    constructor(private w: number, private opts: FieldOptions) {
        this.container.eventMode = "static";
        this.container.cursor = "text";
        this.container.hitArea = new PIXI.Rectangle(0, 0, w, 11);
        this.container.on("pointerdown", (e: PIXI.FederatedPointerEvent) => {
            e.stopPropagation();
            this.opts.onFocus?.();
            this.setFocused(true);
        });
        this.draw();
    }

    public setFocused(on: boolean) {
        if (on == this.focused) return;
        this.focused = on;
        this.blink = 0;
        this.draw();
    }

    public resize(w: number) {
        if (w == this.w) return;
        this.w = w;
        this.container.hitArea = new PIXI.Rectangle(0, 0, w, 11);
        this.draw();
    }

    public set(value: string) {
        this.value = value.slice(0, this.opts.max);
        this.draw();
    }

    // a key while it's focused
    public key(e: KeyboardEvent) {
        if (e.key == "Enter") this.opts.onEnter?.(this.value.trim());
        else if (e.key == "Escape") this.setFocused(false);
        else if (e.key == "Backspace") this.value = this.value.slice(0, -1);
        else if (e.key.length == 1 && this.value.length < this.opts.max && (!this.opts.digits || /[0-9]/.test(e.key)))
            this.value += this.opts.upper ? e.key.toUpperCase() : e.key;
        this.blink = 0;
        this.draw();
    }

    public paste(pasted: string) {
        const more = this.opts.digits ? pasted.replace(/[^0-9]/g, "") : pasted.replace(/\s+/g, " ");
        this.set(this.value + (this.opts.upper ? more.toUpperCase() : more));
    }

    public update(deltaTime: number) {
        if (!this.focused) return;
        this.blink += deltaTime;
        this.caret.visible = Math.floor(this.blink / TextField.BLINK_MS) % 2 == 0;
    }

    private draw() {
        const w = this.w;
        this.container.removeChildren().forEach((c) => { if (c != this.caret) c.destroy({ children: true }); });
        this.container.addChild(new PIXI.Graphics()
            .beginFill(AP.BLACK).drawRect(0, 0, w, 11).endFill()
            .beginFill(this.focused ? AP.SLATE : AP.INK).drawRect(1, 1, w - 2, 9).endFill());
        if (!this.focused && !this.value) {
            text(this.opts.hint, 3, 2, AP.IRON, this.container);
            return;
        }
        let shown = this.value;
        while (shown && textWidth(shown) > w - 8) shown = shown.slice(1);
        const t = text(shown, 3, 2, AP.WHITE, this.container);
        if (!this.focused) return;
        this.caret.position.set(3 + (shown ? Math.ceil(t.textWidth) + 1 : 0), 1.5);
        this.caret.visible = true;
        this.container.addChild(this.caret);
    }

    public destroy() {
        this.caret.destroy();
        this.container.destroy({ children: true });
    }

}
