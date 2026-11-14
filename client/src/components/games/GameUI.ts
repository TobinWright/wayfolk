import * as PIXI from "pixi.js";
import { Constants } from "../../constants/Constants";
import { AP } from "../../constants/Palette";

// What the games' windows draw with (components/games): the pixel font's
// text, how wide it is (at its own size, or `size` 16 at half that), and a
// button as the friends window's are.

let measure: PIXI.BitmapText;

export function textWidth(text: string, size = 32) {
    measure ??= new PIXI.BitmapText("", { fontName: Constants.PIXEL_FONT, fontSize: 32 });
    measure.text = text;
    return Math.ceil(measure.textWidth) * size / 32;
}

export function text(text: string, x: number, y: number, tint: number, parent: PIXI.Container, size = 32) {
    const t = new PIXI.BitmapText(text, { fontName: Constants.PIXEL_FONT, fontSize: size });
    t.tint = tint;
    t.position.set(x, y);
    t.eventMode = "none";
    parent.addChild(t);
    return t;
}

// a button with `label` at (x, y), as wide as it needs; its width
export function button(label: string, x: number, y: number, parent: PIXI.Container, act: () => void) {
    const w = textWidth(label) + 6;
    const b = new PIXI.Container();
    b.position.set(x, y);
    const back = new PIXI.Graphics();
    const paint = (lit: boolean) => back.clear()
        .beginFill(AP.BLACK).drawRect(0, 0, w, 9).endFill()
        .beginFill(lit ? AP.IRON : AP.SLATE).drawRect(1, 1, w - 2, 7).endFill();
    paint(false);
    b.addChild(back);
    text(label, 3, 1, AP.WHITE, b);
    b.eventMode = "static";
    b.cursor = "pointer";
    b.hitArea = new PIXI.Rectangle(0, 0, w, 9);
    b.on("pointerover", () => paint(true));
    b.on("pointerout", () => paint(false));
    b.on("pointerdown", (e: PIXI.FederatedPointerEvent) => e.stopPropagation());
    b.on("pointertap", act);
    parent.addChild(b);
    return w;
}

// a button that's only its `label` at (x, y), `tint` and `lit` under the
// pointer, clicked anywhere in `hit` (its text's box, a px round it, if none)
// (one drawn again in the same place while the pointer's over it stays lit)
let litKey: string = null;

export function textButton(label: string, x: number, y: number, tint: number, lit: number, parent: PIXI.Container, act: () => void, hit?: PIXI.IHitArea) {
    const b = new PIXI.Container(), key = `${label}@${x},${y}`;
    b.position.set(x, y);
    const t = text(label, 0, 0, litKey == key ? lit : tint, b);
    b.eventMode = "static";
    b.cursor = "pointer";
    b.hitArea = hit ?? new PIXI.Rectangle(-2, -2, textWidth(label) + 3, 11);
    b.on("pointerover", () => { t.tint = lit; litKey = key; });
    b.on("pointerout", () => { t.tint = tint; if (litKey == key) litKey = null; });
    b.on("pointerdown", (e: PIXI.FederatedPointerEvent) => e.stopPropagation());
    b.on("pointertap", act);
    parent.addChild(b);
    return b;
}

// a box of a line or more over the pointer, kept inside `parent` (w across):
// zone() makes a box of `parent`'s say what it is while hovered
export class Tip {

    private box = new PIXI.Container();

    constructor(private parent: PIXI.Container, private w: number) {
        this.box.eventMode = "none";
        this.box.visible = false;
        parent.addChild(this.box);
    }

    // (call again after adding over it, to stay on top)
    public raise() {
        this.parent.addChild(this.box);
    }

    public zone(x: number, y: number, w: number, h: number, lines: string[], into: PIXI.Container) {
        const z = new PIXI.Container();
        z.eventMode = "static";
        z.hitArea = new PIXI.Rectangle(x, y, w, h);
        z.on("pointerenter", (e: PIXI.FederatedPointerEvent) => this.show(lines, e));
        z.on("pointermove", (e: PIXI.FederatedPointerEvent) => this.move(e));
        z.on("pointerleave", () => this.hide());
        into.addChild(z);
        return z;
    }

    public show(lines: string[], e: PIXI.FederatedPointerEvent) {
        this.box.removeChildren().forEach((c) => c.destroy({ children: true }));
        const w = Math.max(...lines.map((l) => textWidth(l))) + 6, h = lines.length * 9 + 2;
        this.box.addChild(new PIXI.Graphics().beginFill(AP.BLACK).drawRect(0, 0, w, h).endFill().beginFill(AP.SHADOW).drawRect(1, 1, w - 2, h - 2).endFill());
        lines.forEach((line, i) => text(line, 3, 2 + i * 9, AP.WHITE, this.box));
        this.box.visible = true;
        this.move(e);
    }

    public move(e: PIXI.FederatedPointerEvent) {
        if (!this.box.visible) return;
        const p = this.parent.toLocal(e.global);
        const above = p.y - this.box.height - 2;      // (under it, if there's no room above)
        this.box.position.set(Math.round(Math.max(0, Math.min(p.x + 4, this.w - this.box.width))), Math.round(above >= 0 ? above : p.y + 10));
    }

    public hide() {
        this.box.visible = false;
    }
}
