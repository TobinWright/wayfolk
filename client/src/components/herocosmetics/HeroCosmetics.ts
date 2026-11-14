import * as PIXI from "pixi.js";
import { BACKDROP, canWear, DYE_NAMES, EARNED, EYE_NAMES, LOOK_NAMES, packOf, SUPPORTER, tierOf } from "../../../../shared/Wardrobe";
import { SCENES } from "../../../../shared/Scenes";
import { Constants } from "../../constants/Constants";
import { Event } from "../../constants/Events";
import { AP, R64 } from "../../constants/Palette";
import { HeroRow } from "../../data/HeroesData";
import { IBC } from "../../Engine";
import { AVATAR_W, DYES, EYE_DYES, Facing, SKIN_DYES } from "../../people/AvatarArt";
import { HAIRS, Look, LOOK_COUNTS, Looks, OUTFITS } from "../../people/LookArt";
import { personTexture } from "../../people/People";
import { Panel } from "../../shared/Panel";
import { TitleBar } from "../../shared/ui/titlebar/TitleBar";
import { BaseComponent, ComponentType } from "../BaseComponent";
import { Chat } from "../chat/Chat";
import { fit } from "../heroroster/HeroRoster";

// A hero's cosmetics, "<name> - Cosmetics" (the user, 2026-10-28: "pull
// cosmetics menu from lithalia"; Lithalia's WardrobeMenu), opened from their
// status: them turning and walking on the left, a row for each part (click
// one to pick it; < > step through its choices), and under them every choice
// for the picked part - swatches for colours, a little one of them for each
// hairstyle and outfit. Free to change (shared/Wardrobe.ts); who each choice
// is for is the catalog's (the admin's Cosmetics editor): a Supporter's have a
// crown's gold corner, a pack's a blue one. Anyone can try them on, but only
// theirs are worn. What's picked is worn as the window closes (or another
// hero's opened in it).

const EDGE = 7;               // px over the first thing
const ROW = 12;
const ROWS_Y = EDGE + 2;      // the parts' rows start here
const LEFT = 84;              // ...here across (the preview's to their left)
const STRIP_Y = 99;           // the choices for the part picked
const ARROW_GAP = 9;          // px between a choice and the < > round it
const SWATCH = 10, GAP = 1;
const SWATCHES = 16, SWATCH_X = SWATCH + GAP + 6, SWATCH_Y = SWATCH + GAP + 2;  // colours a row, and px from one to the next
const FIGURES = 9, FIGURE_X = 30, FIGURE_Y = 28;                                // ...little people
const TURN = 1400;            // ms the preview faces each way
const FACINGS = [Facing.DOWN, Facing.RIGHT, Facing.UP, Facing.LEFT];

export class HeroCosmetics extends BaseComponent {

    public static SCALE = 2;
    public static W = 290;              // in its own px
    public static INFO_H = 11;          // the line along the bottom
    public static INSET_X = 12;         // the window round it, in screen px
    public static INSET_Y = 28;

    private heroId = -1;
    private looks: Looks = [];          // as picked (worn as it closes)
    private row = 0;
    private time = 0;
    private drawn = "";
    private h = 0;                      // its content's height (own px)

    public background: Panel;
    public titleBar: TitleBar;
    private content: PIXI.Container;
    private back: PIXI.Graphics;
    private body: PIXI.Container;
    private preview = new PIXI.Sprite();
    private info: PIXI.BitmapText;

    private keys = (e: KeyboardEvent) => { if (e.key == "Escape" && !Chat.takes(e)) IBC.comp.destroy(this); };

    constructor() {
        super(ComponentType.HERO_COSMETICS);
        this.create();
    }

    // a hero's cosmetics (one open at a time: opening another's wears what was picked, then shows theirs)
    public static open(heroId: number) {
        const view = IBC.comp.getOrCreate(ComponentType.HERO_COSMETICS) as HeroCosmetics;
        view.bringToTop();
        view.show(heroId);
    }

    public create() {
        super.create();
        const { W, SCALE, INSET_X, INSET_Y, INFO_H } = HeroCosmetics;
        // as tall as the part with the most choices needs (so it doesn't jump about from part to part)
        this.h = Math.max(...LOOK_NAMES.map((_, look) => this.stripEnd(look))) + EDGE + INFO_H;
        const WIDTH = INSET_X * 2 + W * SCALE, HEIGHT = INSET_Y + this.h * SCALE + INSET_X;

        this.container.eventMode = "static";
        this.container.hitArea = new PIXI.Rectangle(0, 0, WIDTH, HEIGHT);
        this.container.on("pointerdown", (e: PIXI.FederatedPointerEvent) => e.stopPropagation());
        this.background = new Panel(this.container);
        this.background.setSize(WIDTH, HEIGHT);
        this.titleBar = new TitleBar(this);
        this.titleBar.setPosition(4, 4);
        this.titleBar.setSize(WIDTH - 8, 20);

        this.content = new PIXI.Container();
        this.content.scale.set(SCALE);
        this.content.position.set(INSET_X, INSET_Y);
        this.container.addChild(this.content);

        // (the panel's middle lets the map through) and the preview's frame
        this.back = new PIXI.Graphics()
            .beginFill(AP.INK).drawRect(-4, -2, W + 8, this.h + 6).endFill()
            .beginFill(R64.INK).drawRect(6, EDGE, 72, 80).endFill()
            .beginFill(R64.SPRUCE).drawRect(7, EDGE + 1, 70, 78).endFill()
            .beginFill(R64.FERN).drawRect(7, EDGE + 62, 70, 17).endFill()
            .beginFill(AP.SHADOW).drawRect(0, this.h - INFO_H, W, INFO_H - 1).endFill();
        this.body = new PIXI.Container();
        this.preview.scale.set(2);
        this.preview.position.set(26, EDGE + 13);
        this.content.addChild(this.back, this.body, this.preview);
        this.info = this.text("", 4, this.h - INFO_H + 2, AP.ASH, this.content);

        window.addEventListener("keydown", this.keys);
        IBC.events.register(Event.PREMIUM_STORE, () => this.draw(), this);
        IBC.events.register(Event.HERO_DISMISSED, (h: HeroRow) => { if (h.id == this.heroId) IBC.comp.destroy(this); }, this);
        IBC.events.register(Event.COSMETIC_CATALOG, () => { this.drawn = ""; this.draw(); }, this);
        IBC.events.register(Event.SEASON, () => { this.drawn = ""; this.draw(); }, this);     // (a season backdrop earned)
        this.setPosition(Math.round((window.innerWidth - WIDTH) / 2), Math.round((window.innerHeight - HEIGHT) / 2));
    }

    public destroy() {
        this.wear();
        super.destroy();
        window.removeEventListener("keydown", this.keys);
        this.titleBar.destroy();
        this.background.destroy();
        this.container.destroy({ children: true });
    }

    private get hero(): HeroRow {
        return IBC.data.heroes.get(this.heroId);
    }

    public show(heroId: number) {
        if (heroId == this.heroId) return;
        this.wear();
        this.heroId = heroId;
        const hero = this.hero;
        if (!hero) return;
        this.looks = [...hero.d.l];
        this.row = 0;
        this.drawn = "";
        this.titleBar.setTitle(`${hero.d.n} - Cosmetics`);
        this.draw();
    }

    public update(deltaTime: number) {
        if (!this.looks.length) return;
        this.time += deltaTime;
        const facing = FACINGS[Math.floor(this.time / TURN) % FACINGS.length];
        const frame = [1, 0, 2, 0][Math.floor(this.time / 200) % 4];
        this.preview.texture = personTexture(this.looks, facing, frame);
    }

    private say(line: string, tint: number = AP.ASH) {
        this.info.text = line;
        this.info.tint = tint;
        fit(this.info, HeroCosmetics.W - 8);
    }

    private wearable(look: number, value: number) {
        return canWear(look, value, LOOK_COUNTS, IBC.data.cosmetics.catalog, IBC.data.cosmetics.access);
    }

    // wear what's picked: what's changed and theirs to wear (the server checks it too)
    private wear() {
        const hero = this.hero;
        if (!hero || this.looks.join() == hero.d.l.join()) return;
        const l = this.looks.map((v, look) => v == hero.d.l[look] || this.wearable(look, v) ? v : hero.d.l[look]);
        if (l.join() != hero.d.l.join()) IBC.net.hero.looks(hero.id, l);
    }

    // the picked part's choice, the next one along
    private step(by: number) {
        const n = LOOK_COUNTS[this.row];
        this.set(this.row, (this.looks[this.row] + by + n) % n);
    }

    private set(look: number, value: number) {
        this.row = look;
        this.looks[look] = value;
        this.draw();
        if (!this.wearable(look, value)) this.say(`${choiceName(look, value)}: ${whose(look, value)} - tried on, but not worn`, AP.STRAW);
        else this.say("");
    }

    // px down the strip's last row ends, for a part's choices
    private stripEnd(look: number) {
        const n = LOOK_COUNTS[look], colours = isColour(look);
        const rows = Math.max(1, Math.ceil(n / (colours ? SWATCHES : FIGURES)));
        return STRIP_Y + (rows - 1) * (colours ? SWATCH_Y : FIGURE_Y) + (colours ? SWATCH + 1 : 25);
    }

    private draw() {
        const hero = this.hero;
        if (!hero) return;
        const key = [this.looks.join(), this.row, IBC.data.premium.active].join("|");
        if (key == this.drawn) return;
        this.drawn = key;
        this.body.removeChildren().forEach((c) => c.destroy({ children: true }));
        const w = HeroCosmetics.W, valueRight = w - 26;
        const g = new PIXI.Graphics();
        this.body.addChild(g);
        // each part: its name, and its choice (< > on the picked one); one not theirs to wear in red
        LOOK_NAMES.forEach((name, look) => {
            const y = ROWS_Y + look * ROW, picked = look == this.row;
            const ok = this.looks[look] == hero.d.l[look] || this.wearable(look, this.looks[look]);
            if (picked) g.beginFill(AP.WHITE, 0.1).drawRect(LEFT, y - 2, w - LEFT - 6, ROW).endFill();
            this.text(name, LEFT + 4, y, picked ? AP.WHITE : AP.MIST, this.body);
            this.hit(LEFT, y - 2, 110, ROW, () => { this.row = look; this.draw(); });
            const value = this.text(choiceName(look, this.looks[look]), 0, y, ok ? AP.ICE : R64.SALMON, this.body);
            value.x = valueRight - Math.ceil(value.textWidth) + 2;
            if (picked) {
                const next = this.text(">", valueRight + 1 + ARROW_GAP, y, R64.LEMON, this.body);
                const prev = this.text("<", 0, y, R64.LEMON, this.body);
                prev.x = value.x - ARROW_GAP - Math.ceil(prev.textWidth) + 1;
                this.hit(next.x - 3, y - 2, 12, ROW, () => this.step(1));
                this.hit(prev.x - 5, y - 2, 12, ROW, () => this.step(-1));
            }
        });
        this.strip(g);
        this.update(0);
    }

    // every choice for the picked part: swatches for colours, little ones of them for hairstyles and outfits
    private strip(g: PIXI.Graphics) {
        const look = this.row;
        const colours = choiceColours(look);
        for (let v = 0; v < LOOK_COUNTS[look]; v++) {
            const on = this.looks[look] == v, name = choiceName(look, v), tier = tierOf(IBC.data.cosmetics.catalog, look, v);
            const more = tier ? `${name} - ${whose(look, v)}` : name;
            if (colours) {
                const x = 8 + (v % SWATCHES) * SWATCH_X, y = STRIP_Y + Math.floor(v / SWATCHES) * SWATCH_Y;
                const [shade, main] = colours[v];
                g.beginFill(on ? AP.WHITE : R64.INK).drawRect(x - 1, y - 1, SWATCH + 2, SWATCH + 2).endFill();
                g.beginFill(main).drawRect(x, y, SWATCH, SWATCH).endFill();
                g.beginFill(shade).drawRect(x, y + SWATCH - 3, SWATCH, 3).endFill();
                tierCorner(g, x + SWATCH, y, tier);
                this.hit(x - 1, y - 1, SWATCH + 3, SWATCH + 3, () => this.set(look, v), more);
            } else {
                const x = 8 + (v % FIGURES) * FIGURE_X, y = STRIP_Y + Math.floor(v / FIGURES) * FIGURE_Y;
                const trial = [...this.looks];
                trial[look] = v;
                g.beginFill(on ? AP.WHITE : R64.INK).drawRect(x - 1, y - 1, 26, 26).endFill();
                g.beginFill(R64.SPRUCE).drawRect(x, y, 24, 24).endFill();
                const who = new PIXI.Sprite(personPart(trial, look == Look.HEAD ? 3 : 8, 24));    // (a hairstyle from its top, an outfit from the face down)
                who.position.set(x + 4, y);
                this.body.addChild(who);
                tierCorner(g, x + 24, y, tier, who);
                this.hit(x - 1, y - 1, 26, 26, () => this.set(look, v), more);
            }
        }
    }

    private text(text: string, x: number, y: number, tint: number, parent: PIXI.Container) {
        const t = new PIXI.BitmapText(text, { fontName: Constants.PIXEL_FONT, fontSize: 32 });
        t.tint = tint;
        t.position.set(Math.round(x), Math.round(y));
        t.eventMode = "none";
        parent.addChild(t);
        return t;
    }

    // somewhere to click (saying what it is along the bottom while it's pointed at)
    private hit(x: number, y: number, w: number, h: number, on: () => void, more?: string) {
        const area = new PIXI.Container();
        area.eventMode = "static";
        area.cursor = "pointer";
        area.hitArea = new PIXI.Rectangle(x, y, w, h);
        area.on("pointertap", on);
        if (more) {
            area.on("pointerover", () => this.say(more));
            area.on("pointerout", () => this.say(""));
        }
        this.body.addChild(area);
    }

}

// (what follows is the Cosmetics editor's too: components/cosmeticeditor)

export function choiceName(look: number, value: number) {
    switch (look) {
        case Look.HEAD: return HAIRS[value]?.name ?? "?";
        case Look.BODY: return OUTFITS[value]?.name ?? "?";
        case BACKDROP: return SCENES[value] ?? "?";
        case Look.SKIN: return `Tone ${value + 1}`;
        case Look.EYES: return EYE_NAMES[value] ?? "?";
    }
    return DYE_NAMES[value] ?? "?";
}

export function isColour(look: number) {
    return look != Look.HEAD && look != Look.BODY && look != BACKDROP;
}

// a colour part's choices, [shade, main] (null: hairstyles and outfits)
export function choiceColours(look: number): [number, number][] {
    return look == Look.SKIN ? SKIN_DYES : look == Look.EYES ? EYE_DYES.map((c) => [c, c] as [number, number]) : isColour(look) ? DYES : null;
}

// who a choice is for, said: "a Supporter's", "in the Winter pack"
export function whose(look: number, value: number) {
    const catalog = IBC.data.cosmetics.catalog;
    if (tierOf(catalog, look, value) == SUPPORTER) return "a Supporter's";
    if (tierOf(catalog, look, value) == EARNED) return "earned taking part in a season (its board, Leaderboards)";
    return `in the ${packOf(catalog, look, value)?.n ?? "?"} pack`;
}

// a choice that isn't everyone's: a corner at its top right (gold a Supporter's, blue a pack's, green a season's),
// over `after` if it's drawn on top of the graphics
export function tierCorner(g: PIXI.Graphics, right: number, top: number, tier: number, after?: PIXI.Container) {
    if (!tier) return;
    const corner = after ? new PIXI.Graphics() : g;
    corner.beginFill(AP.BLACK).drawRect(right - 4, top, 4, 4).endFill()
        .beginFill(tier == SUPPORTER ? AP.AMBER : tier == EARNED ? AP.LIME : AP.SKY).drawRect(right - 3, top, 3, 3).endFill();
    if (after) after.parent.addChildAt(corner, after.parent.getChildIndex(after) + 1);
}

// part of someone facing down, rows `from` to `from + rows` of their frame (made once and kept)
const parts = new Map<string, PIXI.Texture>();
export function personPart(looks: Looks, from: number, rows: number) {
    const key = `${looks.join(",")}|${from}|${rows}`;
    let texture = parts.get(key);
    if (!texture) {
        const whole = personTexture(looks, Facing.DOWN, 0);
        texture = new PIXI.Texture(whole.baseTexture, new PIXI.Rectangle(whole.frame.x, whole.frame.y + from, AVATAR_W, rows));
        parts.set(key, texture);
    }
    return texture;
}
