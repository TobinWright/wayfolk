import * as PIXI from "pixi.js";
import { IBC } from "../../Engine";
import { clockIcon, coinIcon, flameIcon, SMALL_ICON } from "../../art/MenuIcons";
import { Constants } from "../../constants/Constants";
import { Event } from "../../constants/Events";
import { AP } from "../../constants/Palette";
import { picTexture } from "../../people/People";
import { BaseComponent, ComponentType } from "../BaseComponent";
import { ScreenFx } from "../fx/ScreenFx";
import { Sfx } from "../../utils/Sfx";
import { SEASONS, worldSeasonAt } from "../../../../shared/Seasons";
import { CLOCK_HOUR_MS } from "../../../../shared/Weather";

// The gold in hand, top right: the sum and a coin after it, each with a
// black shadow a pixel down and right. To its left the world's time
// (shared/Seasons.ts worldSeasonAt, the user, 2026-10-31): "Spring, Day 20" and a
// clock, looked at on the hour. Drawn at 1:1 and scaled up. Gold coming in
// counts up, its "+25" rising into the sum (the user, 2026-11-01), coins
// flying off the coin with a ping (more for more; the user, 2026-11-05).
// Left of the time, the daily streak going (shared/Chests.ts): a flame and the
// days, dim till today's chest is opened.
export class GoldDisplay extends BaseComponent {

    public static SCALE = 2;
    public static WIDTH = 100;      // unscaled
    public static CLOCK_GAP = 8;    // unscaled, between the time's clock and the gold

    public value: PIXI.BitmapText;
    public shadow: PIXI.BitmapText;
    private time: PIXI.BitmapText;
    private timeShadow: PIXI.BitmapText;
    private clock: PIXI.Sprite;
    private clockShadow: PIXI.Sprite;
    private flame: PIXI.Sprite;
    private flameShadow: PIXI.Sprite;
    private streak: PIXI.BitmapText;
    private streakShadow: PIXI.BitmapText;
    private hour = -1;              // (the clock hour shown, from 1970)
    private content: PIXI.Container;
    private shown: number = null;   // (the gold shown, counting up to `target`)
    private target = 0;
    private countFrom = 0;
    private countAt = 0;
    private rising: { words: PIXI.Container, at: number }[] = [];

    public static COUNT_MS = 600;
    public static RISE_MS = 1000;

    constructor() {
        super(ComponentType.GOLD_DISPLAY);

        this.create();
        this.resize();
    }

    public create() {
        super.create();

        const content = this.content = new PIXI.Container();
        content.scale.set(GoldDisplay.SCALE);
        this.container.addChild(content);

        const W = GoldDisplay.WIDTH, coin = picTexture(coinIcon()), clock = picTexture(clockIcon());
        const coinShadow = new PIXI.Sprite(coin);
        coinShadow.tint = AP.BLACK;
        coinShadow.position.set(W - SMALL_ICON + 1, 1);
        const coinSprite = new PIXI.Sprite(coin);
        coinSprite.position.set(W - SMALL_ICON, 0);

        const text = () => {
            const t = new PIXI.BitmapText("0", { fontName: Constants.PIXEL_FONT, fontSize: 32 });
            t.anchor.set(1, 0);
            return t;
        };
        this.shadow = text();
        this.shadow.tint = AP.BLACK;
        this.shadow.position.set(W - SMALL_ICON - 2 + 1, 1);
        this.value = text();
        this.value.position.set(W - SMALL_ICON - 2, 0);

        this.timeShadow = text();
        this.timeShadow.tint = AP.BLACK;
        this.time = text();
        this.clockShadow = new PIXI.Sprite(clock);
        this.clockShadow.tint = AP.BLACK;
        this.clock = new PIXI.Sprite(clock);

        const flame = picTexture(flameIcon());
        this.flameShadow = new PIXI.Sprite(flame);
        this.flameShadow.tint = AP.BLACK;
        this.flame = new PIXI.Sprite(flame);
        this.streakShadow = text();
        this.streakShadow.tint = AP.BLACK;
        this.streak = text();
        content.addChild(this.shadow, coinShadow, this.value, coinSprite, this.timeShadow, this.clockShadow, this.time, this.clock,
            this.streakShadow, this.flameShadow, this.streak, this.flame);
        IBC.events.register(Event.DAILY, () => this.placeTime(), this);

        IBC.events.register(Event.INVENTORY_GOLD_UPDATED, this.goldUpdated, this);
        this.goldUpdated();
        this.update(0);
    }

    public destroy() {
        super.destroy();

        IBC.events.unregisterAll(this);
    }

    public resize() {
        this.setPosition(window.innerWidth - GoldDisplay.WIDTH * GoldDisplay.SCALE - 20, 28);
    }

    public update(deltaTime: number) {
        this.animate();
        const now = Date.now(), hour = Math.floor(now / CLOCK_HOUR_MS);
        if (hour == this.hour) return;
        this.hour = hour;
        const season = worldSeasonAt(now);
        this.time.text = this.timeShadow.text = `${SEASONS[season.k].name}, Day ${season.day}`;
        this.placeTime();
    }

    // more than there was: counted up to, a "+25" rising into it from under it
    private goldUpdated() {
        const gold = IBC.data.inventory.gold;
        if (gold == null) return;
        const more = this.shown == null ? 0 : gold - this.target;
        this.target = gold;
        if (more > 0) {
            this.countFrom = this.shown;
            this.countAt = performance.now();
            this.rise(more);
        } else this.showGold(gold);
    }

    private showGold(gold: number) {
        this.shown = gold;
        this.value.text = this.shadow.text = String(gold);
        this.placeTime();
    }

    private rise(more: number) {
        const words = new PIXI.Container(), mk = (tint: number, d: number) => {
            const t = new PIXI.BitmapText(`+${more}`, { fontName: Constants.PIXEL_FONT, fontSize: 32 });
            t.anchor.set(1, 0);
            t.tint = tint;
            t.position.set(d, d);
            words.addChild(t);
        };
        mk(AP.BLACK, 1);
        mk(AP.AMBER, 0);
        const S = GoldDisplay.SCALE, x = this.container.x + (GoldDisplay.WIDTH - SMALL_ICON / 2) * S, y = this.container.y + (SMALL_ICON / 2) * S;
        ScreenFx.coins(x, y, Math.min(24, 6 + Math.round(Math.sqrt(more) * 2)));
        Sfx.coin();
        words.x = this.value.x;
        words.alpha = 0;
        this.content.addChild(words);
        this.rising.push({ words, at: performance.now() });
    }

    // the count and what's rising, moved on
    private animate() {
        const now = performance.now();
        if (this.shown != this.target) {
            const k = Math.min(1, (now - this.countAt) / GoldDisplay.COUNT_MS);
            this.showGold(k >= 1 ? this.target : Math.round(this.countFrom + (this.target - this.countFrom) * k));
        }
        this.rising = this.rising.filter((r) => {
            const k = (now - r.at) / GoldDisplay.RISE_MS;
            if (k >= 1) {
                r.words.destroy({ children: true });
                return false;
            }
            r.words.y = Math.round(12 - k * 10);
            r.words.alpha = k < 0.2 ? k / 0.2 : k > 0.6 ? (1 - k) / 0.4 : 1;
            return true;
        });
    }

    // the time and its clock left of the gold, however wide that is
    private placeTime() {
        const x = this.value.x - Math.ceil(this.value.textWidth) - GoldDisplay.CLOCK_GAP - SMALL_ICON;
        this.clock.position.set(x, 0);
        this.clockShadow.position.set(x + 1, 1);
        this.time.position.set(x - 2, 0);
        this.timeShadow.position.set(x - 2 + 1, 1);
        // (the streak, left of the time)
        const d = IBC.data.player.daily, on = d.s > 0;
        for (const part of [this.flame, this.flameShadow, this.streak, this.streakShadow]) part.visible = on;
        if (!on) return;
        this.streak.text = this.streakShadow.text = String(d.s);
        const right = x - 2 - Math.ceil(this.time.textWidth) - GoldDisplay.CLOCK_GAP;
        this.streak.position.set(right, 0);
        this.streakShadow.position.set(right + 1, 1);
        const fx = right - Math.ceil(this.streak.textWidth) - 2 - SMALL_ICON;
        this.flame.position.set(fx, 0);
        this.flameShadow.position.set(fx + 1, 1);
        this.flame.alpha = this.streak.alpha = d.t ? 1 : 0.55;
    }

}
