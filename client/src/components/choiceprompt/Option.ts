import * as PIXI from "pixi.js";
import { BitmapText } from "pixi.js";
import { Constants } from "../../constants/Constants";
import { ChoicePrompt } from "./ChoicePrompt";

export class Option {

    private choicePrompt: ChoicePrompt;
    private label: string;

    public text: BitmapText;

    constructor(choicePrompt: ChoicePrompt, label: string) {
        this.choicePrompt = choicePrompt;
        this.label = label;
        this.create();
    }

    private create() {
        this.text = new PIXI.BitmapText(this.label, {
            fontName: Constants.PIXEL_FONT,
            fontSize: 96
        });
        this.text.anchor.set(0.5, 0);
        this.text.eventMode = "static";
        this.text.cursor = "pointer";
        this.text.hitArea = new PIXI.Rectangle(-100, -10, 200, 40);
        this.text.on("pointerover", e => {
            this.text.scale.set(0.98);
        });
        this.text.on("pointerout", e => {
            this.text.scale.set(1);
        });
        this.text.on("pointerdown", e => {
            this.choicePrompt.callback(this.label);
        });
        this.choicePrompt.container.addChild(this.text);
    }

    public destroy() {
        this.text.destroy();
        this.text = null;
    }

    public position(x: number, y: number) {
        this.text.position.set(x, y);
    }

}