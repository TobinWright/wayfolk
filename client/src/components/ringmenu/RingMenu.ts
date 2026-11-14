import * as PIXI from "pixi.js";
import { Pic } from "../../art/Backdrops";
import { AP } from "../../constants/Palette";
import { Constants } from "../../constants/Constants";
import { Event } from "../../constants/Events";
import { IBC } from "../../Engine";
import { picTexture } from "../../people/People";
import { BaseComponent, ComponentType } from "../BaseComponent";
import { Chat } from "../chat/Chat";

// A ring menu (the user's call: as Secret of Mana's): clicking a place on the
// map spins its icons out round it into a ring, the one at the front (the
// bottom) picked, its name under the ring. Left / right (or a click on
// another icon) turn the ring, Enter / Space or a click on the front one
// picks it, Escape or a click anywhere else spins them back in.

export interface RingOption {
    name: string;
    icon: Pic;              // ICON x ICON
    pick: () => void;
}

export const ICON = 16;

export class RingMenu extends BaseComponent {

    public static SCALE = 2;            // screen px a pixel
    public static RADIUS_X = 34;        // the ring, in pixels
    public static RADIUS_Y = 24;
    public static OPEN_MS = 350;
    public static CLOSE_MS = 200;
    public static TURN_MS = 90;         // how fast the ring eases round to the next

    public key: any;                    // what it's for (a place clicked again shuts it)
    private anchor: () => { x: number, y: number };    // the ring's middle on the screen
    private options: RingOption[] = [];
    private icons: PIXI.Sprite[] = [];
    private label: PIXI.BitmapText;
    private labelBack: PIXI.Graphics;

    private open = 0;                   // 0 shut, 1 open
    private closing = false;
    private turn = 0;                   // where the ring is (an option's place, fractional)
    private target = 0;                 // where it's turning to

    private keys = (e: KeyboardEvent) => this.onKey(e);

    constructor() {
        super(ComponentType.RING_MENU);
        this.create();
    }

    // the one ring menu, round `anchor`, with these options
    public static show(key: any, anchor: () => { x: number, y: number }, options: RingOption[]) {
        for (const old of IBC.comp.getAllByType(ComponentType.RING_MENU)) IBC.comp.destroy(old);
        if (!options.length) return;
        const ring = IBC.comp.create(ComponentType.RING_MENU) as RingMenu;
        ring.key = key;
        ring.anchor = anchor;
        ring.setOptions(options);
        return ring;
    }

    // the ring menu open now (not shutting), if any
    public static current(): RingMenu {
        return (IBC.comp.getAllByType(ComponentType.RING_MENU) as RingMenu[]).find((r) => !r.closing);
    }

    public create() {
        super.create();
        this.container.scale.set(RingMenu.SCALE);

        this.labelBack = new PIXI.Graphics();
        this.label = new PIXI.BitmapText("", { fontName: Constants.PIXEL_FONT, fontSize: 32, tint: AP.WHITE });
        this.label.anchor.set(0.5, 0);
        this.container.addChild(this.labelBack, this.label);

        window.addEventListener("keydown", this.keys);
        IBC.events.register(Event.MAP_POINTER_DOWN, () => this.close(), this);
    }

    public destroy() {
        super.destroy();
        window.removeEventListener("keydown", this.keys);
        this.container.destroy({ children: true });
    }

    private setOptions(options: RingOption[]) {
        this.options = options;
        this.icons = options.map((option, i) => {
            const sprite = new PIXI.Sprite(picTexture(outlined(option.icon)));
            sprite.anchor.set(0.5, 0.5);
            sprite.eventMode = "static";
            sprite.cursor = "pointer";
            sprite.on("pointerdown", (e: PIXI.FederatedPointerEvent) => e.stopPropagation());
            sprite.on("pointertap", (e: PIXI.FederatedPointerEvent) => {
                e.stopPropagation();
                if (i == this.picked()) this.pick();
                else this.target += this.shortest(i);
            });
            this.container.addChild(sprite);
            return sprite;
        });
        this.place();
    }

    // the option at the front
    private picked() {
        const n = this.options.length;
        return ((Math.round(this.target) % n) + n) % n;
    }

    // how far round from the front to option i, the short way
    private shortest(i: number) {
        const n = this.options.length;
        let d = (i - this.picked()) % n;
        if (d > n / 2) d -= n;
        if (d < -n / 2) d += n;
        return d;
    }

    private pick() {
        if (this.closing) return;
        const option = this.options[this.picked()];
        this.close();
        option.pick();
    }

    public close() {
        this.closing = true;
    }

    private onKey(e: KeyboardEvent) {
        if (this.closing || (e.target as HTMLElement)?.tagName == "INPUT" || Chat.takes(e)) return;
        switch (e.key) {
            case "ArrowLeft": case "a": this.target--; break;
            case "ArrowRight": case "d": this.target++; break;
            case "Enter": case " ": this.pick(); break;
            case "Escape": this.close(); break;
            default: return;
        }
        e.preventDefault();
    }

    public update(deltaTime: number) {
        if (this.closing) {
            this.open -= deltaTime / RingMenu.CLOSE_MS;
            if (this.open <= 0) { IBC.comp.destroy(this); return; }
        } else {
            this.open = Math.min(1, this.open + deltaTime / RingMenu.OPEN_MS);
        }
        this.turn += (this.target - this.turn) * Math.min(1, deltaTime / RingMenu.TURN_MS);
        if (Math.abs(this.target - this.turn) < 0.01) this.turn = this.target;
        this.place();
    }

    // each icon round the ring (spinning out from the middle as it opens),
    // the front one whole and bright, those behind smaller and dimmer
    private place() {
        const at = this.anchor?.() ?? { x: 0, y: 0 };
        this.setPosition(Math.round(at.x), Math.round(at.y));
        const n = this.options.length;
        const ease = 1 - Math.pow(1 - Math.max(0, this.open), 3);
        const spin = (1 - ease) * Math.PI * 2;
        this.icons.forEach((sprite, i) => {
            // the front is straight down (a quarter turn round from the right)
            const a = Math.PI / 2 + ((i - this.turn) / n) * Math.PI * 2 + spin;
            const depth = (Math.sin(a) + 1) / 2;        // 1 at the front, 0 at the back
            sprite.position.set(Math.round(Math.cos(a) * RingMenu.RADIUS_X * ease), Math.round(Math.sin(a) * RingMenu.RADIUS_Y * ease));
            sprite.scale.set(n == 1 ? 1 : 0.75 + depth * 0.25);
            sprite.alpha = ease * (n == 1 ? 1 : 0.5 + depth * 0.5);
            sprite.zIndex = depth;
        });
        this.container.sortChildren();

        // the front one's name under the ring, once it's open
        const name = this.open >= 1 && Math.abs(this.target - this.turn) < 0.3 ? this.options[this.picked()]?.name ?? "" : "";
        if (this.label.text != name) {
            this.label.text = name;
            this.labelBack.clear();
            if (name) {
                const w = Math.ceil(this.label.textWidth) + 6, y = RingMenu.RADIUS_Y + ICON / 2 + 3;
                this.labelBack.beginFill(AP.BLACK).drawRect(-Math.ceil(w / 2), y, w, 11).endFill();
                this.labelBack.beginFill(AP.INK).drawRect(-Math.ceil(w / 2) + 1, y + 1, w - 2, 9).endFill();
                this.label.position.set(0, y + 2);
            }
        }
        this.labelBack.zIndex = this.label.zIndex = 2;
    }

}

// a picture with a dark line round everything in it, one pixel out (so an
// icon reads on any ground)
export function outlined(pic: Pic) {
    const out = new Pic(pic.w + 2, pic.h + 2);
    for (let y = 0; y < pic.h; y++) for (let x = 0; x < pic.w; x++) {
        if (pic.p[y * pic.w + x] < 0) continue;
        for (let dy = 0; dy <= 2; dy++) for (let dx = 0; dx <= 2; dx++)
            if (out.get(x + dx, y + dy) < 0) out.set(x + dx, y + dy, AP.BLACK);
    }
    for (let y = 0; y < pic.h; y++) for (let x = 0; x < pic.w; x++) {
        const c = pic.p[y * pic.w + x];
        if (c >= 0) out.set(x + 1, y + 1, c);
    }
    return out;
}
