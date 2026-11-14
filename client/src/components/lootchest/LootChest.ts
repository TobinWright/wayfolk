import * as PIXI from "pixi.js";
import { CHEST_NAMES, ChestLoot, ChestTier, lootText, MIMIC_LEAST_MS } from "../../../../shared/Chests";
import { Pic } from "../../art/Backdrops";
import { Event } from "../../constants/Events";
import { AP } from "../../constants/Palette";
import { IBC } from "../../Engine";
import { picTexture } from "../../people/People";
import { Sfx } from "../../utils/Sfx";
import { Effects } from "../../utils/Effects";
import { BaseComponent, ComponentType } from "../BaseComponent";
import { ScreenFx } from "../fx/ScreenFx";
import { text, textWidth } from "../games/GameUI";

// A loot chest up now (shared/Chests.ts; IBC.data.player.chest): dropped in
// at the bottom middle of the screen, over every window (as the corner's
// buttons), bobbing and shaking now and then in a pulsing glow, sparkles off
// it and a bar under it of how long it'll wait. Clicked: it shakes, then (the
// server's PLAYER_CHEST_OPENED) bursts open, rays out of it, coins and
// confetti, a banner of what was in it; then fades. Not opened in time: it
// fades. Always here once signed in, showing nothing without one.
// A daily chest says which day of the streak it is. A mimic (PLAYER_CHEST_MIMIC)
// bites as it's clicked: teeth out, hopping about, beaten by clicking it so
// many times before its bar runs out (then it opens as a chest does), or it
// gets away.

const ART_W = 20, ART_H = 17;
const SCALE = 4;                        // the chest's px on screen
const WORDS = 2;                        // the words' (PixelFont 32 x 2)

// its colours by tier: wood (or metal) light, mid, dark; trim light, dark; the glow's
const LOOKS = [
    { wood: [AP.CLAY, AP.UMBER, AP.BARK], trim: [AP.STRAW, AP.OCHRE], glow: AP.STRAW },
    { wood: [AP.STONE, AP.STEEL, AP.IRON], trim: [AP.WHITE, AP.ASH], glow: AP.FOAM },
    { wood: [AP.STRAW, AP.AMBER, AP.OCHRE], trim: [AP.WHITE, AP.STRAW], glow: AP.STRAW },
];
const lookOf = (t: ChestTier) => LOOKS[t] ?? LOOKS[0];

const pics = new Map<string, PIXI.Texture>();
function chestTexture(t: ChestTier, open: boolean) {
    const key = `${t}${open ? "o" : ""}`;
    let tex = pics.get(key);
    if (tex) return tex;
    const p = new Pic(ART_W, ART_H), { wood: [light, mid, dark], trim: [shine, edge] } = lookOf(t);
    const outline = AP.BLACK;
    // the body: rows 8 to 16
    p.rect(0, 8, ART_W, 9, outline);
    p.rect(1, 9, ART_W - 2, 7, mid);
    p.rect(1, 9, ART_W - 2, 1, light);
    p.rect(1, 15, ART_W - 2, 1, dark);
    p.rect(1, 12, ART_W - 2, 1, dark);
    for (const x of [4, ART_W - 5]) p.rect(x, 9, 1, 7, edge);       // (its bands)
    if (!open) {
        // the lid shut: rows 2 to 8, rounded
        p.rect(1, 2, ART_W - 2, 7, outline);
        p.rect(0, 4, ART_W, 5, outline);
        p.rect(2, 3, ART_W - 4, 5, mid);
        p.rect(1, 5, ART_W - 2, 3, mid);
        p.rect(2, 3, ART_W - 4, 1, light);
        p.rect(1, 7, ART_W - 2, 1, dark);
        for (const x of [4, ART_W - 5]) p.rect(x, 3, 1, 5, edge);
        // the lock, half on the lid
        p.rect(8, 6, 4, 5, outline);
        p.rect(9, 7, 2, 3, shine);
        p.set(9, 9, edge); p.set(10, 9, edge);
    } else {
        // the lid thrown back, its inside seen behind, and what's in it heaped up lit over the rim
        p.rect(1, 1, ART_W - 2, 7, outline);
        p.rect(2, 2, ART_W - 4, 5, dark);
        p.rect(2, 2, ART_W - 4, 1, mid);
        for (const x of [4, ART_W - 5]) p.rect(x, 2, 1, 5, edge);
        p.rect(1, 7, ART_W - 2, 2, outline);
        p.rect(2, 7, ART_W - 4, 2, shine);
        p.rect(4, 6, ART_W - 8, 1, shine);
        p.rect(6, 5, ART_W - 12, 1, AP.WHITE);
        p.set(5, 6, AP.WHITE); p.set(ART_W - 7, 7, AP.WHITE);
        // (the lock hanging open)
        p.rect(8, 9, 4, 3, outline);
        p.rect(9, 10, 2, 1, shine);
    }
    tex = picTexture(p);
    pics.set(key, tex);
    return tex;
}

// a mimic: the lid up a little, a row of teeth top and bottom, a tongue, eyes on the lid
let mimicTex: PIXI.Texture = null;
function mimicTexture() {
    if (mimicTex) return mimicTex;
    const p = new Pic(ART_W, ART_H), [light, mid, dark] = LOOKS[0].wood, outline = AP.BLACK;
    p.rect(0, 9, ART_W, 8, outline);
    p.rect(1, 10, ART_W - 2, 6, mid);
    p.rect(1, 15, ART_W - 2, 1, dark);
    p.rect(1, 0, ART_W - 2, 6, outline);
    p.rect(2, 1, ART_W - 4, 4, mid);
    p.rect(2, 1, ART_W - 4, 1, light);
    // (the mouth: dark inside, teeth, a tongue)
    p.rect(1, 6, ART_W - 2, 4, AP.WINE);
    for (let x = 2; x < ART_W - 2; x += 3) { p.set(x, 6, AP.WHITE); p.set(x + 1, 6, AP.WHITE); p.set(x + 1, 7, AP.WHITE); }
    for (let x = 3; x < ART_W - 2; x += 3) { p.set(x, 9, AP.WHITE); p.set(x + 1, 9, AP.WHITE); p.set(x, 8, AP.WHITE); }
    p.rect(7, 8, 6, 1, AP.PINK); p.rect(8, 9, 4, 1, AP.PINK);
    // (eyes)
    p.rect(5, 2, 2, 2, AP.STRAW); p.set(6, 3, AP.BLACK);
    p.rect(13, 2, 2, 2, AP.STRAW); p.set(13, 3, AP.BLACK);
    mimicTex = picTexture(p);
    return mimicTex;
}

export class LootChest extends BaseComponent {

    public static DROP_MS = 500;
    public static OPEN_MS = 1800;       // shown open before fading
    public static FADE_MS = 400;
    public static SHAKE_EVERY = 2200;

    private chest: { i: number; t: ChestTier; until: number } = null;
    private stays = 1;                  // (ms it was up for, for the bar)
    private shownAt = 0;
    private openedAt = 0;               // (0: shut)
    private clickedAt = 0;
    private fadeAt = 0;
    private sparkAt = 0;
    private mimic: { n: number; hits: number; until: number; at: number; ms: number } = null;
    private hitAt = 0;
    private hopX = 0;
    private hopTo = 0;
    private hopAt = 0;

    private glow = new PIXI.Graphics();
    private rays = new PIXI.Graphics();
    private sprite = new PIXI.Sprite();
    private label = new PIXI.Container();
    private bar = new PIXI.Graphics();

    constructor() {
        super(ComponentType.LOOT_CHEST);
        this.zBand = BaseComponent.CORNER;
        this.create();
    }

    public create() {
        super.create();
        this.sprite.anchor.set(0.5, 1);
        this.sprite.scale.set(SCALE);
        this.label.scale.set(WORDS);
        this.container.addChild(this.rays, this.glow, this.sprite, this.label, this.bar);
        this.container.visible = false;
        this.container.eventMode = "static";
        this.container.cursor = "pointer";
        this.container.hitArea = new PIXI.Rectangle(-ART_W * SCALE / 2 - 10, -ART_H * SCALE - 14, ART_W * SCALE + 20, ART_H * SCALE + 44);
        this.container.on("pointerdown", (e: PIXI.FederatedPointerEvent) => e.stopPropagation());
        this.container.on("pointertap", () => this.click());
        IBC.events.register(Event.CHEST, () => this.changed(), this);
        IBC.events.register(Event.CHEST_OPENED, (loot: ChestLoot) => this.opened(loot), this);
        IBC.events.register(Event.CHEST_MIMIC, (m: { i: number, n: number, e: number }) => this.bit(m), this);
        this.changed();
        this.resize();
    }

    public destroy() {
        super.destroy();
        this.container.destroy({ children: true });
    }

    public resize() {
        this.setPosition(Math.round(window.innerWidth / 2), Math.round(window.innerHeight - 64));
    }

    // one turned up, or the one up gone
    private changed() {
        const c = IBC.data.player.chest;
        if (c && c.i != this.chest?.i) {
            this.chest = { ...c };
            this.stays = Math.max(1, c.until - performance.now());
            this.shownAt = performance.now();
            this.openedAt = this.clickedAt = this.fadeAt = 0;
            this.mimic = null;
            this.hopX = this.hopTo = 0;
            this.sprite.texture = chestTexture(c.t, false);
            this.drawLabel(c.d ? `Day ${c.d} chest! Click it` : "Click to open!", c.d ? AP.STRAW : AP.WHITE);
            this.container.visible = true;
            this.container.alpha = 1;
            this.container.eventMode = "static";
            this.bringToTop();
            Sfx.chestAppear();
        } else if (!c && this.chest && !this.openedAt && !this.fadeAt) {
            this.fadeAt = performance.now();
            if (this.mimic) {
                this.drawLabel("It got away!", AP.FLAME);
                Sfx.mimicGone();
            }
        }
    }

    // it was a mimic: teeth out, hopping, to be hit so many times in time
    private bit(m: { i: number, n: number, e: number }) {
        if (!this.chest || this.chest.i != m.i) return;
        const now = performance.now();
        this.mimic = { n: m.n, hits: 0, until: now + m.e, at: now, ms: m.e };
        this.clickedAt = 0;
        this.sprite.texture = mimicTexture();
        this.drawLabel(`A mimic! Hit it ${m.n} times!`, AP.FLAME);
        Sfx.mimic();
        ScreenFx.flash(AP.RED, 300, 0.25);
    }

    private click() {
        if (this.mimic && !this.fadeAt && !this.openedAt) return this.hitMimic();
        if (!this.chest || this.clickedAt || this.fadeAt) return;
        this.clickedAt = performance.now();
        this.drawLabel("", AP.WHITE);
        Sfx.tick();
        IBC.net.player.openChest(this.chest.i);
    }

    private hitMimic() {
        const m = this.mimic, now = performance.now();
        if (m.hits >= m.n) return;
        m.hits++;
        this.hitAt = now;
        Sfx.mimicHit(m.hits);
        ScreenFx.sparkle(this.container.x, this.container.y - ART_H * SCALE / 2, 10, [AP.WHITE, AP.FLAME]);
        this.drawLabel(m.hits >= m.n ? "Got it!" : `${m.n - m.hits} more!`, m.hits >= m.n ? AP.STRAW : AP.FLAME);
        if (m.hits >= m.n) {
            // (no quicker than the server takes)
            const wait = Math.max(0, MIMIC_LEAST_MS + 100 - (now - m.at));
            this.clickedAt = now;
            setTimeout(() => { if (this.chest) IBC.net.player.openChest(this.chest.i, true); }, wait);
        }
    }

    // what was in it (in the stash already: its toasts and the gold's count come with it)
    private opened(loot: ChestLoot) {
        if (!this.chest) return;
        const look = lookOf(loot.t), name = loot.x ? "Mimic beaten" : loot.d ? `Day ${loot.d} chest` : CHEST_NAMES[loot.t] ?? "Chest";
        this.mimic = null;
        this.hopX = this.hopTo = 0;
        this.openedAt = performance.now();
        this.container.eventMode = "none";
        this.sprite.texture = chestTexture(loot.t, true);
        this.drawLabel(name, look.glow);
        Sfx.chestOpen(loot.t);
        const x = this.container.x, y = this.container.y - ART_H * SCALE * 0.6;
        ScreenFx.coins(x, y, 14 + loot.t * 10);
        ScreenFx.sparkle(x, y, 18, [AP.WHITE, look.glow]);
        if (loot.t >= ChestTier.SILVER) ScreenFx.confetti(x, y, 30 + loot.t * 25);
        ScreenFx.banner(`${name}!`, lootText(loot), look.glow, 3200);
    }

    private drawLabel(words: string, tint: number) {
        this.label.removeChildren().forEach((c) => c.destroy({ children: true }));
        if (!words) return;
        const w = textWidth(words);
        text(words, -Math.floor(w / 2) + 1, 1, AP.BLACK, this.label);
        text(words, -Math.floor(w / 2), 0, tint, this.label);
        this.label.position.set(0, 6);
    }

    public update(deltaTime: number) {
        if (!this.chest || !this.container.visible) return;
        const now = performance.now(), look = lookOf(this.chest.t);
        const age = now - this.shownAt, H = ART_H * SCALE;

        // gone: faded out, then put away
        const fadeFrom = this.fadeAt || (this.openedAt ? this.openedAt + LootChest.OPEN_MS : 0);
        if (fadeFrom && now >= fadeFrom) {
            const k = (now - fadeFrom) / LootChest.FADE_MS;
            this.container.alpha = Math.max(0, 1 - k);
            if (k >= 1) {
                this.container.visible = false;
                this.container.alpha = 1;
                this.chest = null;
                return;
            }
        }

        // dropped in from above, bouncing once; then bobbing (shut)
        let dy = 0, angle = 0, squash = 1;
        if (age < LootChest.DROP_MS) {
            const k = age / LootChest.DROP_MS;
            if (k < 0.7) dy = -220 * Math.pow(1 - k / 0.7, 2);
            else {
                dy = -18 * Math.sin(Math.PI * (k - 0.7) / 0.3);
                if (k < 0.78) squash = 0.85;
            }
        } else if (this.mimic && !this.openedAt) {
            // (a mimic: hopping about, jolted when hit)
            if (now - this.hopAt > 450 && !this.fadeAt) { this.hopAt = now; this.hopTo = Math.round((Math.random() - 0.5) * 220); }
            this.hopX += (this.hopTo - this.hopX) * Math.min(1, deltaTime / 120);
            const hop = ((now - this.hopAt) % 450) / 450;
            dy = -Math.round(16 * Math.sin(Math.PI * hop));
            const hit = Math.max(0, 1 - (now - this.hitAt) / 150);
            angle = 0.25 * Math.sin(now / 30) * hit + 0.08 * Math.sin(now / 90);
            if (hit > 0) squash = 0.85;
        } else if (!this.openedAt) {
            dy = -Math.round(3 * Math.sin(now / 300));
            // (a shake now and then, and all the time once clicked, waiting on the server)
            const shaking = this.clickedAt || ((age - LootChest.DROP_MS) % LootChest.SHAKE_EVERY) < 360;
            if (shaking) angle = 0.12 * Math.sin(now / (this.clickedAt ? 25 : 40));
        } else {
            // (popped up a little as it opens)
            const k = Math.min(1, (now - this.openedAt) / 250);
            dy = -10 * Math.sin(Math.PI * k);
        }
        this.sprite.position.set(Math.round(this.hopX), Math.round(dy));
        this.glow.x = this.label.x = this.bar.x = this.rays.x = Math.round(this.hopX);
        this.container.hitArea = new PIXI.Rectangle(Math.round(this.hopX) - ART_W * SCALE / 2 - 14, -ART_H * SCALE - 30, ART_W * SCALE + 28, ART_H * SCALE + 60);
        this.sprite.rotation = Effects.reduced() ? 0 : angle;
        this.sprite.scale.set(SCALE * (squash < 1 ? 1.12 : 1), SCALE * squash);

        // the glow behind it, pulsing
        const pulse = 0.5 + 0.5 * Math.sin(now / 220);
        this.glow.clear();
        const r = (this.openedAt ? 46 : 36) + pulse * 6;
        for (let i = 3; i >= 1; i--)
            this.glow.beginFill(look.glow, (this.openedAt ? 0.16 : 0.1) * (0.6 + 0.4 * pulse)).drawEllipse(0, dy - H / 2, r * i / 2.2, r * i / 3).endFill();

        // rays out of it, open
        this.rays.clear();
        if (this.openedAt) {
            const k = Math.min(1, (now - this.openedAt) / 300), spin = now / 1400, cy = dy - H * 0.55;
            for (let i = 0; i < 10; i++) {
                const a = spin + (i / 10) * Math.PI * 2, len = (70 + (i % 2) * 30) * k, w = 0.09;
                this.rays.beginFill(look.glow, 0.28).drawPolygon([
                    0, cy,
                    Math.cos(a - w) * len, cy + Math.sin(a - w) * len,
                    Math.cos(a + w) * len, cy + Math.sin(a + w) * len,
                ]).endFill();
            }
        }

        // sparkles off it now and then (shut)
        if (!this.openedAt && age > LootChest.DROP_MS && now - this.sparkAt > 450) {
            this.sparkAt = now;
            ScreenFx.sparkle(this.container.x + (Math.random() - 0.5) * ART_W * SCALE, this.container.y + dy - Math.random() * H, 3, [AP.WHITE, look.glow]);
        }

        // how long it'll wait, under it
        this.bar.clear();
        if (!this.openedAt && !this.fadeAt) {
            const left = this.mimic ? Math.max(0, Math.min(1, (this.mimic.until - now) / this.mimic.ms))
                : Math.max(0, Math.min(1, (this.chest.until - now) / this.stays)), w = ART_W * SCALE;
            this.bar.beginFill(AP.BLACK, 0.8).drawRect(-w / 2 - 1, 30, w + 2, 6).endFill()
                .beginFill(left < 0.25 ? AP.FLAME : look.glow).drawRect(-w / 2, 31, Math.round(w * left), 4).endFill();
        }
        // ("Click to open!" pulsing)
        this.label.alpha = this.openedAt ? 1 : 0.7 + 0.3 * pulse;
    }

}
