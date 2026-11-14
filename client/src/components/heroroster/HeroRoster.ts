import * as PIXI from "pixi.js";
import { doingText, todoMost } from "../../../../shared/Tasks";
import { Constants } from "../../constants/Constants";
import { Event } from "../../constants/Events";
import { AP } from "../../constants/Palette";
import { HeroRow } from "../../data/HeroesData";
import { IBC } from "../../Engine";
import { Facing } from "../../people/AvatarArt";
import { personTexture, shadowTexture } from "../../people/People";
import { Hint } from "../../shared/ui/Hint";
import { BaseComponent, ComponentType } from "../BaseComponent";
import { HeroStatus } from "../herostatus/HeroStatus";
import type { Map } from "../map/Map";
import { progressTint, TaskPlanner, taskProgress } from "../taskplanner/TaskPlanner";

// Your heroes down the top right, under the gold (the user, 2026-10-28): a
// box each, stacked, with their name, what they're doing now and how much is
// on their to-do list, how far into what they're doing now (a line along the
// bottom, as on their to-do list; the user, 2026-10-31), and them standing facing you on
// the right. Clicking the left of the box opens their to-do list
// (TaskPlanner), clicking them on the right their status (HeroStatus). An
// eye to the left of each (the user, 2026-10-28) has the map follow their
// party (Map.follow), lit while it does; again, or dragging the map, stops.

export class HeroRoster extends BaseComponent {

    public static SCALE = 2;
    public static W = 170;              // a hero's box, in its own px
    public static H = 32;
    public static GAP = 2;
    public static TOP = 60;             // screen px down from the top (under the gold)
    public static RIGHT = 20;           // and in from the right (in line with the gold)
    public static SPRITE_W = 24;        // the part on the right they stand in
    public static EYE_W = 14;           // the eye to the left of a box
    public static EYE_GAP = 2;

    private content: PIXI.Container;
    private bars: { g: PIXI.Graphics, id: number, w: number }[] = [];

    constructor() {
        super(ComponentType.HERO_ROSTER);
        this.create();
    }

    public create() {
        super.create();
        this.content = new PIXI.Container();
        this.content.scale.set(HeroRoster.SCALE);
        this.container.addChild(this.content);
        IBC.events.register(Event.HERO_STATE, () => this.draw(), this);
        IBC.events.register(Event.HERO_HIRED, () => { this.draw(); this.bringToTop(); }, this);
        IBC.events.register(Event.HERO_DISMISSED, () => this.draw(), this);
        IBC.events.register(Event.HERO_SWAPPED, () => this.draw(), this);
        IBC.events.register(Event.MAP_FOLLOW, () => this.draw(), this);
        this.draw();
        this.resize();
    }

    public destroy() {
        super.destroy();
        this.container.destroy({ children: true });
    }

    public resize() {
        this.setPosition(window.innerWidth - HeroRoster.W * HeroRoster.SCALE - HeroRoster.RIGHT, HeroRoster.TOP);
    }

    public update(deltaTime: number) {
        this.bars.forEach((bar) => this.fillBar(bar));
    }

    private fillBar(bar: { g: PIXI.Graphics, id: number, w: number }) {
        const hero = IBC.data.heroes.heroes.find((h) => h.id == bar.id);
        const done = hero ? taskProgress(hero, hero.s.q[0] ?? hero.s.b) : null;
        bar.g.clear();
        if (done) bar.g.beginFill(progressTint(hero)).drawRect(4, HeroRoster.H - 4, bar.w * done, 1).endFill();
    }

    private draw() {
        this.bars = [];
        this.content.removeChildren().forEach((c) => c.destroy({ children: true }));
        IBC.data.heroes.heroes.forEach((hero, i) => this.drawHero(hero, i * (HeroRoster.H + HeroRoster.GAP)));
    }

    private drawHero(hero: HeroRow, y: number) {
        const { W, H } = HeroRoster;
        const box = new PIXI.Container();
        box.position.set(0, y);
        this.content.addChild(box);

        // each part lit while it's pointed at
        const S = HeroRoster.SPRITE_W, back = new PIXI.Graphics();
        const paint = (over: "todo" | "status" | null) => {
            back.clear();
            back.beginFill(AP.BLACK).drawRect(0, 0, W, H).endFill();
            back.beginFill(over == "todo" ? AP.IRON : AP.SLATE).drawRect(1, 1, W - 2, H - 2).endFill();
            back.beginFill(over == "status" ? AP.IRON : AP.SHADOW).drawRect(W - S, 1, S - 1, H - 2).endFill();
        };
        paint(null);
        box.addChild(back);

        const textW = W - 30;
        const name = this.text(hero.d.n, 4, 8, AP.WHITE, box);
        const left = hero.s.q.length;
        const count = this.text(`${left}/${todoMost(IBC.data.premium.active)}`, 0, 8, left ? AP.STRAW : AP.STONE, box);
        count.x = W - S - 4 - Math.ceil(count.textWidth);
        fit(name, count.x - 8);
        const doingWhole = doingText(hero.s, IBC.data.heroes.nameOf, (id) => IBC.data.events.named(id));
        const doing = this.text(doingWhole, 4, 19, AP.ASH, box);
        fit(doing, textW);

        // along the bottom, how far into what they're doing now, as on their to-do list (filled every frame: update)
        if (taskProgress(hero, hero.s.q[0] ?? hero.s.b) != null) {
            box.addChild(new PIXI.Graphics().beginFill(AP.SHADOW).drawRect(4, H - 4, textW, 1).endFill());
            const bar = { g: new PIXI.Graphics(), id: hero.id, w: textW };
            box.addChild(bar.g);
            this.bars.push(bar);
            this.fillBar(bar);
        }

        // them, facing you
        const shadow = new PIXI.Sprite(shadowTexture());
        shadow.anchor.set(0.5, 0.5);
        shadow.position.set(W - 12, H - 4);
        const person = new PIXI.Sprite(personTexture(hero.d.l, Facing.DOWN, 0));
        person.anchor.set(0.5, 1);
        person.position.set(W - 12, H - 3);
        box.addChild(shadow, person);

        this.zone(0, W - S, H, box, "Open to-do", (over) => paint(over ? "todo" : null), () => TaskPlanner.open(hero.id));
        // over what they're doing, all of it (the line may be cut short)
        this.zone(0, W - S, H - 17, box, doingWhole, (over) => paint(over ? "todo" : null), () => TaskPlanner.open(hero.id), 17);
        this.zone(W - S, S, H, box, "Open status", (over) => paint(over ? "status" : null), () => HeroStatus.open(hero.id));
        this.drawEye(hero, box);
    }

    // to the left of the box: an eye, the map following their party while it's lit
    private drawEye(hero: HeroRow, box: PIXI.Container) {
        const { H, EYE_W: E, EYE_GAP } = HeroRoster;
        const map = IBC.comp.getFirstByType(ComponentType.MAP) as Map;
        const on = map?.following == hero.id;
        const eye = new PIXI.Container();
        eye.position.set(-E - EYE_GAP, 0);
        box.addChild(eye);
        const back = new PIXI.Graphics(), cx = E / 2, cy = H / 2;
        const paint = (over: boolean) => {
            back.clear();
            back.beginFill(AP.BLACK).drawRect(0, 0, E, H).endFill();
            back.beginFill(on ? (over ? AP.GRASS : AP.LEAF) : over ? AP.IRON : AP.SLATE).drawRect(1, 1, E - 2, H - 2).endFill();
            // the eye: its white, the iris, the pupil
            back.beginFill(on ? AP.WHITE : AP.ASH).drawPolygon([cx - 5, cy, cx - 2, cy - 3, cx + 2, cy - 3, cx + 5, cy, cx + 2, cy + 3, cx - 2, cy + 3]).endFill();
            back.beginFill(on ? AP.SKY : AP.STEEL).drawRect(cx - 2, cy - 2, 4, 4).endFill();
            back.beginFill(AP.BLACK).drawRect(cx - 1, cy - 1, 2, 2).endFill();
        };
        paint(false);
        eye.addChild(back);
        this.zone(0, E, H, eye, on ? "Stop following" : "Follow on the map", paint, () => map?.follow(on ? null : hero.id));
    }

    // a part of a box that does something when clicked, saying what by the pointer
    private zone(x: number, w: number, h: number, box: PIXI.Container, hint: string, light: (over: boolean) => void, tap: () => void, y = 0) {
        const zone = new PIXI.Container();
        Hint.on(zone, hint);
        zone.eventMode = "static";
        zone.cursor = "pointer";
        zone.hitArea = new PIXI.Rectangle(x, y, w, h);
        zone.on("pointerdown", (e: PIXI.FederatedPointerEvent) => e.stopPropagation());
        zone.on("pointerover", () => light(true));
        zone.on("pointerout", () => light(false));
        zone.on("pointertap", tap);
        box.addChild(zone);
    }

    private text(text: string, x: number, y: number, tint: number, parent: PIXI.Container) {
        const t = new PIXI.BitmapText(text, { fontName: Constants.PIXEL_FONT, fontSize: 32 });
        t.tint = tint;
        t.position.set(x, y);
        t.eventMode = "none";
        parent.addChild(t);
        return t;
    }

}

// a line cut short (and "..") to fit a width
export function fit(t: PIXI.BitmapText, width: number) {
    const whole = t.text;
    if (t.textWidth <= width) return t;
    let n = whole.length;
    do { t.text = whole.slice(0, --n).trimEnd() + ".."; } while (n > 1 && t.textWidth > width);
    return t;
}
