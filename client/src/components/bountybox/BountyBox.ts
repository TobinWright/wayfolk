import * as PIXI from "pixi.js";
import { itemName } from "../../../../shared/Tasks";
import { Event } from "../../constants/Events";
import { AP } from "../../constants/Palette";
import { IBC } from "../../Engine";
import { Sfx } from "../../utils/Sfx";
import { BaseComponent, ComponentType } from "../BaseComponent";
import { ScreenFx } from "../fx/ScreenFx";
import { text, textWidth } from "../games/GameUI";
import { itemTexture } from "../inventory/Item";

// The bounty up now (shared/Chests.ts; IBC.data.player.bounty), at the top
// middle: "Bounty: gather 12 Tin Ore", how many so far over a bar, and the
// time left. Dropping in with a call as it comes; the count popping as it
// goes up; done, lit green with a fanfare and a banner (its chest comes
// after, LootChest); out of time, faded. Showing nothing without one.

export class BountyBox extends BaseComponent {

    public static SCALE = 2;
    public static W = 170;              // in its own px
    public static H = 30;
    public static TOP = 8;              // screen px

    private box = new PIXI.Container();
    private bar: PIXI.Graphics = null;
    private count: PIXI.BitmapText = null;
    private time: PIXI.BitmapText = null;
    private shown: { m: number; n: number; d: number; until: number } = null;
    private shownAt = 0;
    private popAt = 0;
    private doneAt = 0;
    private goneAt = 0;

    constructor() {
        super(ComponentType.BOUNTY_BOX);
        this.zBand = BaseComponent.CORNER;
        this.create();
    }

    public create() {
        super.create();
        this.container.eventMode = "none";
        this.box.scale.set(BountyBox.SCALE);
        this.container.addChild(this.box);
        this.container.visible = false;
        IBC.events.register(Event.BOUNTY, () => this.changed(), this);
        this.changed();
    }

    public destroy() {
        super.destroy();
        this.container.destroy({ children: true });
    }

    private changed() {
        const b = IBC.data.player.bounty, now = performance.now();
        if (!b) {
            if (this.shown && !this.doneAt && !this.goneAt) this.goneAt = now;
            return;
        }
        const fresh = !this.shown || this.shown.m != b.m || this.shown.n != b.n || this.doneAt || this.goneAt;
        if (fresh && !b.w) {
            this.shown = { ...b };
            this.shownAt = now;
            this.doneAt = this.goneAt = 0;
            this.draw();
            this.container.visible = true;
            this.bringToTop();
            Sfx.bounty();
            return;
        }
        if (!this.shown) return;
        if (b.d > this.shown.d) this.popAt = now;
        this.shown.d = b.d;
        this.shown.until = b.until;
        if (b.w && !this.doneAt) {
            this.doneAt = now;
            Sfx.bountyDone();
            ScreenFx.banner("Bounty done!", "A silver chest's on its way", AP.LEAF, 2800);
            ScreenFx.confetti(window.innerWidth / 2, BountyBox.TOP + BountyBox.H, 50);
        }
        this.draw();
    }

    private draw() {
        const { W, H } = BountyBox, b = this.shown;
        this.box.removeChildren().forEach((c) => c.destroy({ children: true }));
        const done = !!this.doneAt, edge = done ? AP.LEAF : AP.STRAW;
        this.box.addChild(new PIXI.Graphics()
            .beginFill(AP.BLACK).drawRect(-W / 2, 0, W, H).endFill()
            .beginFill(edge).drawRect(-W / 2 + 1, 1, W - 2, H - 2).endFill()
            .beginFill(done ? AP.PINE : AP.SLATE).drawRect(-W / 2 + 2, 2, W - 4, H - 4).endFill());
        const pic = new PIXI.Sprite(itemTexture(b.m));
        pic.position.set(-W / 2 + 5, 7);
        this.box.addChild(pic);
        text(done ? "Bounty done!" : "Bounty", -W / 2 + 25, 4, edge, this.box);
        text(`Gather ${b.n} ${itemName(b.m)}`, -W / 2 + 25, 14, AP.WHITE, this.box);
        this.count = text("", 0, 4, AP.WHITE, this.box);
        this.time = text("", 0, 14, AP.ASH, this.box);
        this.bar = new PIXI.Graphics();         // (the last one went with the box's children)
        this.box.addChild(this.bar);
        this.place();
    }

    // the count and time on the right, the bar along the bottom
    private place() {
        const { W, H } = BountyBox, b = this.shown, now = performance.now();
        if (!b || !this.count) return;
        this.count.text = `${b.d}/${b.n}`;
        this.count.x = W / 2 - 5 - textWidth(this.count.text);
        const left = Math.max(0, Math.ceil((b.until - now) / 1000));
        this.time.text = this.doneAt ? "" : `${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}`;
        this.time.x = W / 2 - 5 - textWidth(this.time.text);
        this.time.tint = left < 60 ? AP.FLAME : AP.ASH;
        const w = W - 8, full = Math.round(w * Math.min(1, b.d / b.n));
        this.bar.clear().beginFill(AP.BLACK).drawRect(-W / 2 + 4, H - 5, w, 2).endFill()
            .beginFill(this.doneAt ? AP.LIME : AP.STRAW).drawRect(-W / 2 + 4, H - 5, full, 2).endFill();
    }

    public update(deltaTime: number) {
        if (!this.container.visible || !this.shown) return;
        const now = performance.now(), age = now - this.shownAt;
        this.place();
        // dropping in; the count popping up a moment as it goes up
        const drop = Math.min(1, age / 300), y = BountyBox.TOP - Math.round(40 * Math.pow(1 - drop, 2));
        const pop = Math.max(0, 1 - (now - this.popAt) / 180);
        if (this.count) this.count.y = 4 - Math.round(pop * 2);
        this.container.position.set(Math.round(window.innerWidth / 2), y);
        // done or gone: faded after a while
        const endAt = this.doneAt ? this.doneAt + 2500 : this.goneAt;
        if (endAt) {
            const k = (now - endAt) / 500;
            this.container.alpha = k <= 0 ? 1 : Math.max(0, 1 - k);
            if (k >= 1) {
                this.container.visible = false;
                this.container.alpha = 1;
                this.shown = null;
            }
        } else this.container.alpha = 1;
    }

}
