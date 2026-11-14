import * as PIXI from "pixi.js";
import { IBC } from "../../Engine";
import { Constants } from "../../constants/Constants";
import { BaseComponent, ComponentType } from "../BaseComponent";
import { Option } from "./Option";

export class ChoicePrompt extends BaseComponent {

    public overlay: PIXI.Graphics;
    public question: PIXI.BitmapText;
    public options: Option[] = [];
    public callback: CallableFunction;

    constructor() {
        super(ComponentType.CHOICE_PROMPT);

        this.create();
        this.resize();
    }

    public create() {
        super.create();

        this.overlay = new PIXI.Graphics();
        this.overlay.alpha = 0.95;
        this.overlay.eventMode = "static";
        this.container.addChild(this.overlay);

        this.question = new PIXI.BitmapText("", {
            fontName: Constants.PIXEL_FONT,
            fontSize: 96
        });
        this.question.anchor.set(0.5, 0);
        this.container.addChild(this.question);
    }

    public destroy() {
        super.destroy();
        IBC.events.unregisterAll(this);

        for (let i = 0; i < this.options.length; i++)
            this.options[i].destroy();
        this.options = null;

        this.question.destroy();
        this.question = null;

        this.overlay.destroy();
        this.overlay = null;
    }

    public resize() {
        this.overlay.clear();
        this.overlay.beginFill(0x000000);
        this.overlay.drawRect(0, 0, window.innerWidth, window.innerHeight);
        this.overlay.endFill();

        this.question.position.set(window.innerWidth / 2, window.innerHeight / 2 - 100);

        for (let i = 0; i < this.options.length; i++)
            this.options[i].position(window.innerWidth / 2, window.innerHeight / 2 + (i * 50));
    }

    public setup(question: string, options: string[], callback: CallableFunction) {
        this.question.text = question;

        // remove old options
        for (let i = 0; i < this.options.length; i++)
            this.options[i].destroy();
        this.options = [];

        // add new options
        for (let i = 0; i < options.length; i++)
            this.options.push(new Option(this, options[i]));

        this.callback = callback;
        this.resize();
    }

}