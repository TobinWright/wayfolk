import * as PIXI from "pixi.js";
import { displayFont } from "../../art/DisplayFont";
import { Constants } from "../../constants/Constants";
import { AP } from "../../constants/Palette";
import { IBC } from "../../Engine";
import { BaseComponent, ComponentType } from "../BaseComponent";
import { Burst, Specks } from "../games/race/RaceFx";
import { Sfx } from "../../utils/Sfx";
import { Effects } from "../../utils/Effects";
import { text, textWidth } from "../games/GameUI";
import { itemTexture } from "../inventory/Item";

// Flash over everything (the user, 2026-11-05: "the game needs to be more
// flashy ... without changing the gameplay"), on the screen, not the map, so
// windows don't hide it:
//   burst(): specks flying from a spot (coins off the gold, confetti off the
//     guide box, a chest's sparkle), the slime race's Specks.
//   banner(): a big line and a small one under it, dropping in at the top
//     middle, holding, and rising away (a level up, a chest's haul, the first
//     steps done); one at a time, more waiting their turn (a few at most).
//   flash(): the whole screen lit a moment (a Masterwork, a golden chest).
//   fireworks(): a rocket's burst of sparks.
//   podium(): an event's top 3 shown one at a time, third first, fireworks
//     with each, then where you came.
// Only for looks: nothing here changes anything.

interface Banner { box: PIXI.Container; at: number; ms: number; }
interface Podium { box: PIXI.Container; at: number; steps: PIXI.Container[]; you: PIXI.Container; fired: number; }

export class ScreenFx extends BaseComponent {

    public static SCALE = 2;
    public static TOP = 70;             // screen px: the banner's top, held
    public static IN_MS = 280;
    public static OUT_MS = 380;
    public static BANNER_MS = 2400;     // shown, in and out with it
    public static WAITING_MOST = 4;

    private specks = new Specks();
    private showing: Banner = null;
    private waiting: { title: string, sub: string, tint: number, ms: number }[] = [];
    private banners = new PIXI.Container();
    private flashes = new PIXI.Graphics();
    private flashAt = 0;
    private flashMs = 0;
    private flashTint: number = AP.WHITE;
    private flashMost = 0.5;
    private podiums: Podium = null;

    constructor() {
        super(ComponentType.SCREEN_FX);
        this.create();
    }

    public create() {
        super.create();
        this.container.zIndex = 1e8 + 1;        // (over the toasts, under notices)
        this.container.eventMode = "none";
        this.specks.view.scale.set(ScreenFx.SCALE);
        this.container.addChild(this.flashes, this.specks.view, this.banners);
    }

    public destroy() {
        super.destroy();
        this.container.destroy({ children: true });
    }

    private static get(): ScreenFx {
        return IBC.comp?.getFirstByType(ComponentType.SCREEN_FX) as ScreenFx;
    }

    // specks from (x, y), screen px (a Burst's speeds in screen px too)
    public static burst(x: number, y: number, b: Burst) {
        const fx = ScreenFx.get(), S = ScreenFx.SCALE;
        if (!fx) return;
        if (Effects.reduced()) b = { ...b, n: Math.ceil(b.n / 3) };
        fx.specks.burst(x / S, y / S, { ...b, speed: (b.speed ?? 40) / S, up: (b.up ?? 0) / S, fall: (b.fall ?? 120) / S });
    }

    // confetti, a moment of it
    public static confetti(x: number, y: number, n = 40) {
        ScreenFx.burst(x, y, { n, colors: [AP.STRAW, AP.LEAF, AP.SKY, AP.ORCHID, AP.WHITE, AP.FLAME], speed: 260, up: 160, fall: 420, ms: 1100, size: 2 });
    }

    // coins, glinting
    public static coins(x: number, y: number, n = 12) {
        ScreenFx.burst(x, y, { n, colors: [AP.AMBER, AP.STRAW, AP.WHITE, AP.OCHRE], speed: 150, up: 110, fall: 380, ms: 800, size: 2 });
    }

    // a ring of sparkle round a spot
    public static sparkle(x: number, y: number, n = 14, colors = [AP.WHITE, AP.STRAW, AP.FOAM]) {
        ScreenFx.burst(x, y, { n, colors, speed: 120, fall: 0, ms: 600, size: 2 });
    }

    // the whole screen lit a moment, fading
    public static flash(tint: number = AP.WHITE, ms = 500, most = 0.5) {
        const fx = ScreenFx.get();
        if (!fx || Effects.reduced()) return;
        fx.flashAt = performance.now();
        fx.flashMs = ms;
        fx.flashTint = tint;
        fx.flashMost = most;
    }

    // a rocket's burst: sparks out in a ring, falling and fading (a whistle and a crackle with it)
    public static fireworks(x: number, y: number, colors = [AP.STRAW, AP.WHITE, AP.ORCHID], sound = true) {
        ScreenFx.burst(x, y, { n: 46, colors, speed: 300, fall: 160, ms: 1300, size: 2 });
        ScreenFx.burst(x, y, { n: 14, colors: [AP.WHITE], speed: 120, fall: 60, ms: 700, size: 2 });
        if (sound) Sfx.firework();
    }

    // an event's top 3 ([name, their rare find]), third first; then where you
    // came (place: 1 first) or that you helped and what you got
    public static podium(event: string, top: [string, number][], place: number, gold: number) {
        const fx = ScreenFx.get();
        if (!fx || !top.length) return;
        fx.podiums?.box.destroy({ children: true });
        const box = new PIXI.Container(), S = ScreenFx.SCALE;
        box.scale.set(S);
        fx.container.addChild(box);
        const W = 200, BASE = 96, colW = 60;
        const heights = [46, 34, 24], colors = [AP.STRAW, AP.ASH, AP.CLAY], order = [1, 0, 2];       // (second on the left, first in the middle)
        box.addChild(new PIXI.Graphics().beginFill(AP.BLACK, 0.8).drawRect(-W / 2, -4, W, BASE + 30).endFill()
            .beginFill(AP.STRAW).drawRect(-W / 2, -4, W, 1).endFill());
        const title = `${event}: done!`;
        text(title, -Math.floor(textWidth(title) / 2), 0, AP.STRAW, box);
        const steps: PIXI.Container[] = [];
        top.slice(0, 3).forEach(([name, item], k) => {
            const col = order.indexOf(k), x = -W / 2 + 10 + col * (colW + 3), h = heights[k], step = new PIXI.Container();
            step.addChild(new PIXI.Graphics().beginFill(AP.BLACK).drawRect(x, BASE - h, colW, h).endFill()
                .beginFill(colors[k]).drawRect(x + 1, BASE - h + 1, colW - 2, h - 2).endFill());
            const n = `${k + 1}`;
            text(n, x + Math.floor((colW - textWidth(n)) / 2), BASE - h + 4, AP.BLACK, step);
            const short = name.length > 11 ? name.slice(0, 10) + "." : name;
            text(short, x + Math.floor((colW - textWidth(short)) / 2), BASE - h - 10, AP.WHITE, step);
            if (item) {
                const pic = new PIXI.Sprite(itemTexture(item));
                pic.position.set(x + Math.floor((colW - 16) / 2), BASE - h - 28);
                step.addChild(pic);
            }
            step.visible = false;
            box.addChild(step);
            steps[k] = step;
        });
        const you = new PIXI.Container(), line = place >= 1 && place <= 3 ? `You came ${["first", "second", "third"][place - 1]}! +${gold} gold` : `You helped! +${gold} gold`;
        text(line, -Math.floor(textWidth(line) / 2), BASE + 10, place >= 1 && place <= 3 ? AP.STRAW : AP.WHITE, you);
        you.visible = false;
        box.addChild(you);
        fx.podiums = { box, at: performance.now(), steps, you, fired: 0 };
    }

    // a big line at the top middle, and a smaller one under it
    public static banner(title: string, sub = "", tint: number = AP.STRAW, ms = ScreenFx.BANNER_MS) {
        const fx = ScreenFx.get();
        if (!fx) return;
        if (fx.waiting.length >= ScreenFx.WAITING_MOST) fx.waiting.shift();
        fx.waiting.push({ title, sub, tint, ms });
    }

    private show(title: string, sub: string, tint: number, ms: number) {
        const S = ScreenFx.SCALE, box = new PIXI.Container();
        box.scale.set(S);
        const words = (s: string, font: string, color: number, y: number) => {
            const c = new PIXI.Container();
            for (const [t, d] of [[AP.BLACK, 1], [color, 0]]) {
                const b = new PIXI.BitmapText(s, { fontName: font, fontSize: 32, tint: t });
                b.anchor.set(0.5, 0);
                b.position.set(d, y + d);
                c.addChild(b);
            }
            return c;
        };
        const big = words(title, displayFont(), tint, 6);
        const bigW = Math.ceil((big.children[1] as PIXI.BitmapText).textWidth);
        let w = bigW + 24, h = 26;
        let small: PIXI.Container = null;
        if (sub) {
            small = words(sub, Constants.PIXEL_FONT, AP.WHITE, 22);
            w = Math.max(w, Math.ceil((small.children[1] as PIXI.BitmapText).textWidth) + 24);
            h = 36;
        }
        const back = new PIXI.Graphics()
            .beginFill(AP.BLACK, 0.85).drawRect(-w / 2, 0, w, h).endFill()
            .beginFill(tint).drawRect(-w / 2, 0, w, 1).drawRect(-w / 2, h - 1, w, 1).endFill()
            .beginFill(tint, 0.5).drawRect(-w / 2 - 1, 1, 1, h - 2).drawRect(w / 2, 1, 1, h - 2).endFill();
        box.addChild(back, big);
        if (small) box.addChild(small);
        this.banners.addChild(box);
        this.showing = { box, at: performance.now(), ms };
        ScreenFx.sparkle(window.innerWidth / 2 - (w / 2) * S, ScreenFx.TOP + h, 8, [tint, AP.WHITE]);
        ScreenFx.sparkle(window.innerWidth / 2 + (w / 2) * S, ScreenFx.TOP + h, 8, [tint, AP.WHITE]);
    }

    public update(deltaTime: number) {
        this.specks.update(deltaTime);
        const now = performance.now();
        this.flashes.clear();
        if (this.flashAt) {
            const k = (now - this.flashAt) / this.flashMs;
            if (k >= 1) this.flashAt = 0;
            else this.flashes.beginFill(this.flashTint, this.flashMost * (1 - k) * (1 - k)).drawRect(0, 0, window.innerWidth, window.innerHeight).endFill();
        }
        this.updatePodium(now);
        if (!this.showing && this.waiting.length) {
            const b = this.waiting.shift();
            this.show(b.title, b.sub, b.tint, b.ms);
        }
        const b = this.showing;
        if (!b) return;
        const { IN_MS, OUT_MS, TOP } = ScreenFx, age = now - b.at;
        if (age >= b.ms) {
            b.box.destroy({ children: true });
            this.showing = null;
            return;
        }
        let y = TOP, alpha = 1;
        if (age < IN_MS) {
            // (dropping in, a little past and back)
            const k = age / IN_MS, back = 1.7;
            const ease = 1 + (back + 1) * Math.pow(k - 1, 3) + back * Math.pow(k - 1, 2);
            y = TOP - 60 * (1 - ease);
            alpha = Math.min(1, k * 2);
        } else if (age > b.ms - OUT_MS) {
            const k = (age - (b.ms - OUT_MS)) / OUT_MS;
            y = TOP - 30 * k * k;
            alpha = 1 - k;
        }
        // (whole screen px and never rescaled, so its letters stay sharp: PixelFont at 32 x 2)
        b.box.position.set(Math.round(window.innerWidth / 2), Math.round(y));
        b.box.alpha = alpha;
    }


    // third, second, then first shown, fireworks with each; then you; gone after 7s
    private updatePodium(now: number) {
        const p = this.podiums;
        if (!p) return;
        const age = now - p.at, S = ScreenFx.SCALE, cx = Math.round(window.innerWidth / 2), top = 170;
        p.box.position.set(cx, top);
        const at = [1700, 1000, 300];         // (first, second, third)
        const shown = [2, 1, 0].filter((k) => p.steps[k] && age >= at[k]);
        for (const k of shown) {
            if (p.steps[k].visible) continue;
            p.steps[k].visible = true;
            const col = [1, 0, 2].indexOf(k), x = cx + (-100 + 10 + col * 63 + 30) * S;
            ScreenFx.fireworks(x, top + 40 * S, k == 0 ? [AP.STRAW, AP.WHITE, AP.AMBER] : [AP.SKY, AP.WHITE, AP.ORCHID]);
            if (k == 0) Sfx.fanfare();
        }
        if (age >= 2400 && !p.you.visible) p.you.visible = true;
        p.box.alpha = age > 6500 ? Math.max(0, 1 - (age - 6500) / 500) : Math.min(1, age / 200);
        if (age > 7000) {
            p.box.destroy({ children: true });
            this.podiums = null;
        }
    }

}
