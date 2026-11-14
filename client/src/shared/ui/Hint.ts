import * as PIXI from "pixi.js";
import { Constants } from "../../constants/Constants";
import { AP } from "../../constants/Palette";
import { IBC } from "../../Engine";

// A line of text (or a few, split on "\n") in a little box by the pointer, over
// everything: one at a time, shown while something's pointed at. Hint.on(thing,
// "text") wires it up.
export class Hint {

    private static SCALE = 2;
    private static PAD = 3;             // round the text, in its own px
    private static OFFSET = 12;         // screen px from the pointer
    private static LINE = 10;           // a line's height, in its own px

    private static box: PIXI.Container;
    private static back: PIXI.Graphics;
    private static lines: PIXI.BitmapText[] = [];

    // show `text` while `target` is pointed at, following the pointer
    public static on(target: PIXI.Container, text: string) {
        target.on("pointerover", (e: PIXI.FederatedPointerEvent) => Hint.show(text, e));
        target.on("pointermove", (e: PIXI.FederatedPointerEvent) => Hint.move(e));
        target.on("pointerout", () => Hint.hide());
        target.on("destroyed", () => Hint.hide());
    }

    public static show(text: string, e: PIXI.FederatedPointerEvent) {
        if (!Hint.box) {
            Hint.box = new PIXI.Container();
            Hint.box.zIndex = 100000;
            Hint.box.eventMode = "none";
            Hint.box.scale.set(Hint.SCALE);
            Hint.back = new PIXI.Graphics();
            Hint.box.addChild(Hint.back);
        }
        // a BitmapText a line (made as needed, kept)
        const rows = text.split("\n"), P = Hint.PAD;
        while (Hint.lines.length < rows.length) {
            const t = new PIXI.BitmapText("", { fontName: Constants.PIXEL_FONT, fontSize: 32 });
            t.position.set(P, P + Hint.lines.length * Hint.LINE);
            Hint.lines.push(t);
            Hint.box.addChild(t);
        }
        Hint.lines.forEach((t, i) => { t.text = rows[i] ?? ""; t.visible = i < rows.length; });
        const w = Math.max(...rows.map((_, i) => Math.ceil(Hint.lines[i].textWidth))) + P * 2, h = 7 + (rows.length - 1) * Hint.LINE + P * 2;
        Hint.back.clear()
            .beginFill(AP.BLACK).drawRect(0, 0, w, h).endFill()
            .beginFill(AP.SHADOW).drawRect(1, 1, w - 2, h - 2).endFill();
        IBC.pixi.stage.addChild(Hint.box);
        Hint.move(e);
    }

    public static move(e: PIXI.FederatedPointerEvent) {
        if (!Hint.box?.parent) return;
        // below right of the pointer, or left of it near the screen's right edge
        const w = Hint.box.width, O = Hint.OFFSET;
        const x = e.globalX + O + w > window.innerWidth ? e.globalX - O - w : e.globalX + O;
        Hint.box.position.set(Math.round(x), Math.round(e.globalY + O));
    }

    public static hide() {
        Hint.box?.parent?.removeChild(Hint.box);
    }

}
