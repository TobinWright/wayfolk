import * as PIXI from "pixi.js";
import { itemName, qualityOf } from "../../../../shared/Tasks";
import { Event } from "../../constants/Events";
import { AP } from "../../constants/Palette";
import { IBC } from "../../Engine";
import { BaseComponent, ComponentType } from "../BaseComponent";
import { text, textWidth } from "../games/GameUI";
import { GuideBox } from "../guide/GuideBox";
import { HeroRoster } from "../heroroster/HeroRoster";
import { itemTexture } from "../inventory/Item";
import { ScreenFx } from "../fx/ScreenFx";
import { Sfx } from "../../utils/Sfx";

// What came into the stash (the user, 2026-11-01): a note a thing, slid in from
// the right under the roster (or the guide box under it), its picture and
// "+3 Copper Ore"; more under the first. Each slides back out after a while,
// those under it moving up; more of one already showing adds to its count.
// Each lands with a white flash over it, a sparkle off its picture and a blip
// (the user, 2026-11-05: "more flashy"); one added to flashes again. A made
// thing of a quality flashes in its colour. Things coming one after another
// (STREAK_MS apart at most) are a streak: "x5" by them, each blip a semitone
// higher, a chime at every fifth (Event.STREAK for each).

interface Toast {
    id: number;
    n: number;
    box: PIXI.Container;
    w: number;          // screen px
    at: number;         // when it came (or last added to)
    y: number;          // where it's drawn, easing to its place
    flash: PIXI.Graphics;
    flashAt: number;
}

export class ItemToasts extends BaseComponent {

    public static SCALE = 2;
    public static H = 20;               // a note, in its own px
    public static PAD = 3;
    public static GAP = 4;              // screen px between notes, and under what they're under
    public static MOST = 8;             // showing at once (more wait)
    public static SLIDE_MS = 250;
    public static SHOW_MS = 4000;
    public static FLASH_MS = 450;
    public static STREAK_MS = 3000;
    public static STREAK_SHOW = 3;          // (shown from this many on)

    private streak = 0;
    private streakAt = 0;
    private streakBox = new PIXI.Container();
    private streakPop = 0;                  // (when it last went up: popping)

    private toasts: Toast[] = [];
    private waiting: [number, number][] = [];

    constructor() {
        super(ComponentType.ITEM_TOASTS);
        this.create();
    }

    public create() {
        super.create();
        this.container.zIndex = 1e8;
        this.container.eventMode = "none";
        this.streakBox.scale.set(ItemToasts.SCALE);
        this.container.addChild(this.streakBox);
        IBC.events.register(Event.INVENTORY_ITEM_ADDED, (gained: [number, number][]) => gained.forEach(([id, n]) => this.add(id, n)), this);
    }

    public destroy() {
        super.destroy();
        this.container.destroy({ children: true });
    }

    private add(id: number, n: number) {
        const now = performance.now(), showing = this.toasts.find((t) => t.id == id);
        if (showing) {
            showing.n += n;
            showing.at = now - ItemToasts.SLIDE_MS;     // (shown again from the start, not sliding in again)
            this.draw(showing);
            this.landed(showing, now);
            return;
        }
        const queued = this.waiting.find((w) => w[0] == id);
        if (queued) queued[1] += n;
        else if (this.toasts.length >= ItemToasts.MOST) this.waiting.push([id, n]);
        else this.show(id, n, now);
    }

    private show(id: number, n: number, now: number) {
        const box = new PIXI.Container();
        box.scale.set(ItemToasts.SCALE);
        this.container.addChild(box);
        const t: Toast = { id, n, box, w: 0, at: now, y: this.slotY(this.toasts.length), flash: null, flashAt: 0 };
        this.toasts.push(t);
        this.draw(t);
        this.landed(t, now + ItemToasts.SLIDE_MS);
    }

    // its back, picture and words
    private draw(t: Toast) {
        const { H, PAD, SCALE } = ItemToasts;
        t.box.removeChildren().forEach((c) => c.destroy({ children: true }));
        const words = `+${t.n} ${itemName(t.id)}`, w = PAD + 16 + 4 + textWidth(words) + PAD + 1;
        const q = qualityOf(t.id), edge = [AP.BLACK, AP.LEAF, AP.SKY, AP.STRAW][q] ?? AP.BLACK;
        t.box.addChild(new PIXI.Graphics()
            .beginFill(edge).drawRect(0, 0, w, H).endFill()
            .beginFill(AP.SLATE).drawRect(1, 1, w - 2, H - 2).endFill());
        const pic = new PIXI.Sprite(itemTexture(t.id));
        pic.position.set(PAD - 1, (H - 16) / 2);
        t.box.addChild(pic);
        text(words, PAD + 16 + 3, Math.floor((H - 9) / 2) + 1, AP.WHITE, t.box);
        t.flash = new PIXI.Graphics().beginFill(q ? edge : AP.WHITE).drawRect(1, 1, w - 2, H - 2).endFill();
        t.flash.alpha = 0;
        t.box.addChild(t.flash);
        t.w = w * SCALE;
    }

    // (at `when`: once it's slid in) its flash, sparkle and blip
    private landed(t: Toast, when: number) {
        t.flashAt = when;
        const delay = Math.max(0, when - performance.now());
        setTimeout(() => {
            if (!this.toasts.includes(t)) return;
            const { PAD, H, SCALE } = ItemToasts;
            ScreenFx.sparkle(t.box.x + (PAD + 8) * SCALE, t.box.y + (H / 2) * SCALE, 8);
            this.streaked(t);
        }, delay);
    }

    // one more in a row (or the first of a new run): its blip, the count by the toasts
    private streaked(t: Toast) {
        const now = performance.now();
        this.streak = now - this.streakAt <= ItemToasts.STREAK_MS ? this.streak + 1 : 1;
        this.streakAt = now;
        Sfx.pickup(this.streak - 1);
        IBC.events.emit(Event.STREAK, this.streak);
        if (this.streak < ItemToasts.STREAK_SHOW) return;
        this.streakPop = now;
        this.streakBox.removeChildren().forEach((c) => c.destroy({ children: true }));
        const words = `x${this.streak}`, tint = this.streak >= 20 ? AP.ORCHID : this.streak >= 10 ? AP.STRAW : AP.WHITE;
        text(words, 1, 1, AP.BLACK, this.streakBox);
        text(words, 0, 0, tint, this.streakBox);
        if (this.streak % 5 == 0) {
            Sfx.streak(this.streak);
            ScreenFx.sparkle(this.streakBox.x + 10, this.streakBox.y + 8, 16, [tint, AP.WHITE, AP.STRAW]);
        }
    }

    // the top of the `i`th note, on screen: under the guide box, or the roster
    private slotY(i: number) {
        const { H, SCALE, GAP } = ItemToasts, R = HeroRoster;
        const guide = IBC.comp.getFirstByType(ComponentType.GUIDE) as GuideBox;
        const heroes = IBC.data.heroes.heroes.length;
        const top = guide ? guide.container.y + guide.container.height + GAP
            : R.TOP + heroes * (R.H + R.GAP) * R.SCALE + (heroes ? GAP : 0);
        return top + i * (H * SCALE + GAP);
    }

    public update(deltaTime: number) {
        const { SLIDE_MS, SHOW_MS } = ItemToasts, now = performance.now();
        // (moving up into a gap a fifth of the way each 10 ms)
        const close = 1 - Math.pow(0.8, deltaTime / 10);
        const right = window.innerWidth - HeroRoster.RIGHT;
        for (let i = this.toasts.length - 1; i >= 0; i--) {
            const t = this.toasts[i], age = now - t.at;
            if (age >= SHOW_MS + SLIDE_MS * 2) {
                this.container.removeChild(t.box);
                t.box.destroy({ children: true });
                this.toasts.splice(i, 1);
            }
        }
        while (this.waiting.length && this.toasts.length < ItemToasts.MOST) this.show(...this.waiting.shift(), now);

        // the streak's count, left of the first toast, popping up as it grows; gone as the streak ends
        const live = this.streak >= ItemToasts.STREAK_SHOW && now - this.streakAt <= ItemToasts.STREAK_MS + 600;
        this.streakBox.visible = live && this.toasts.length > 0;
        if (this.streakBox.visible) {
            const first = this.toasts[0], pop = Math.max(0, 1 - (now - this.streakPop) / 200);
            const w = Math.ceil(this.streakBox.width);
            this.streakBox.position.set(Math.round(first.box.x - w - 8), Math.round(first.y + 10 - pop * 6));
            this.streakBox.alpha = now - this.streakAt > ItemToasts.STREAK_MS ? Math.max(0, 1 - (now - this.streakAt - ItemToasts.STREAK_MS) / 600) : 1;
        }
        this.toasts.forEach((t, i) => {
            const age = now - t.at;
            // in from off the right, then back out
            const k = age < SLIDE_MS ? 1 - age / SLIDE_MS : age > SHOW_MS + SLIDE_MS ? (age - SHOW_MS - SLIDE_MS) / SLIDE_MS : 0;
            const ease = k * k;
            t.y += (this.slotY(i) - t.y) * close;
            t.box.position.set(Math.round(right - t.w + ease * (t.w + HeroRoster.RIGHT)), Math.round(t.y));
            const lit = (now - t.flashAt) / ItemToasts.FLASH_MS;
            if (t.flash) t.flash.alpha = lit >= 0 && lit < 1 ? 0.55 * (1 - lit) * (1 - lit) : 0;
        });
    }

}
