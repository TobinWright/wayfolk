import * as PIXI from "pixi.js";
import { eventSkills, eventTitle, EventView, isBossEvent } from "../../../../shared/Events";
import { SKILL_NAMES } from "../../../../shared/Heroes";
import { WorldPlace } from "../../../../shared/Places";
import { eventIcon, heroesIcon, skillIcon } from "../../art/BoardIcons";
import { TASK_ICON } from "../../art/TaskIcons";
import { Constants } from "../../constants/Constants";
import { Hint } from "../../shared/ui/Hint";
import { AP } from "../../constants/Palette";
import { timeLeft } from "../../data/EventsData";
import { IBC } from "../../Engine";
import { EventInfo } from "../eventinfo/EventInfo";

// A bubble over each place where a dynamic event's on (shared/Events.ts),
// centred over it, its tail on its top: its short name (eventTitle, kept to
// what fits; one that doesn't scrolls by), how far
// it's got as a bar (points of the goal), the skills it's worked with (an
// icon each), the time left and how many heroes are on it, each icon named while pointed
// at (Hint). The same
// size on the screen at any zoom, like a place's name, but zoomed all the way
// out just a box round the event icon (named while pointed at), so they don't
// cover the map (the user, 2026-10-28); clicked, it opens the
// event's window (EventInfo), where your heroes join it. Drawn again when the
// events change or the time left does, or on zooming in or out of the least.
export class EventBubbles {

    public static PAD = 7;
    public static LINE = 10;
    public static W_LEAST = 96;         // in its own px (LABEL_SCALE screen px each)
    public static W_MOST = 136;
    public static TAIL = 4;
    public static RISE = 2;             // map px over the place's top the tail's tip is
    public static CHECK_MS = 1000;
    public static MARQUEE_SPEED = 20;   // its own px a second a name too long to fit scrolls by
    public static MARQUEE_PAUSE = 2000; // ms it waits at its start each time round
    public static MARQUEE_GAP = 24;     // px between the name and the next of it
    public static SMALL_PAD = 3;        // round the icon, zoomed all the way out
    public static BOB = 2;              // its own px it bobs up and down (the user, 2026-10-28)
    public static BOB_MS = 1800;        // once up and down

    public container = new PIXI.Container();
    private bubbles: PIXI.Container[] = [];
    private rests: number[] = [];       // each bubble's y, bobbed about
    private marquees: { id: EventView["i"], strip: PIXI.Container, span: number }[] = [];
    private scrolled = new Map<EventView["i"], number>();   // ms into its round each name's at, kept through redraws
    private drawn = "";
    private since = 0;
    private small = false;              // zoomed all the way out: the icon only

    constructor(private tile: number, private placeSize: number) {
        this.container.sortableChildren = true;
    }

    // (the places' tiles: world.json's)
    public draw(places: WorldPlace[]) {
        const live = IBC.data.events.live();
        this.drawn = this.key(live);
        for (const b of this.bubbles) b.destroy({ children: true });
        this.bubbles = [];
        this.rests = [];
        this.marquees = [];
        this.scrolled.forEach((_, id) => { if (!live.some((e) => e.i == id)) this.scrolled.delete(id); });
        for (const e of live) {
            const place = places.find((p) => p.i == e.p);
            if (!place) continue;
            const bubble = this.bubble(e, place);
            bubble.position.set((place.x + 0.5) * this.tile, (place.y + 1) * this.tile + 4 - this.placeSize - EventBubbles.RISE);
            bubble.zIndex = bubble.y;
            this.container.addChild(bubble);
            this.bubbles.push(bubble);
            this.rests.push(bubble.y);
        }
    }

    // kept the same size on the screen, bobbing (by the clock, so a redraw
    // doesn't jump; each a little out of step), the names too long to fit
    // scrolling by; drawn again once a second if what it says has changed
    public update(deltaTime: number, scale: number, zoom: number, small: boolean, places: WorldPlace[]) {
        if (small != this.small) {
            this.small = small;
            this.draw(places);
        }
        const now = Date.now();
        this.bubbles.forEach((b, k) => {
            b.scale.set(scale);
            // (snapped to whole screen px: a part of one leaves its pixel
            // text and rim shimmering between them as it goes)
            const bob = EventBubbles.BOB * scale * (1 + Math.sin(now / EventBubbles.BOB_MS * Math.PI * 2 + k)) / 2;
            b.y = this.rests[k] - Math.round(bob * zoom) / zoom;
        });
        const { MARQUEE_SPEED, MARQUEE_PAUSE } = EventBubbles;
        for (const m of this.marquees) {
            const round = MARQUEE_PAUSE + m.span / MARQUEE_SPEED * 1000;
            const t = ((this.scrolled.get(m.id) ?? 0) + deltaTime) % round;
            this.scrolled.set(m.id, t);
            m.strip.x = EventBubbles.PAD - Math.round(Math.max(0, t - MARQUEE_PAUSE) * MARQUEE_SPEED / 1000);
        }
        this.since += deltaTime;
        if (this.since < EventBubbles.CHECK_MS) return;
        this.since = 0;
        if (this.key(IBC.data.events.live()) != this.drawn) this.draw(places);
    }

    private key(live: EventView[]) {
        const now = Date.now();
        return JSON.stringify(live.map((e) => [e.i, Math.floor(e.d), e.g, e.c, timeLeft(e.e - now)]));
    }

    private bubble(e: EventView, place: WorldPlace) {
        const { PAD, LINE, W_LEAST, W_MOST } = EventBubbles;
        const boss = isBossEvent(e), hue = boss ? AP.FLAME : AP.STRAW;
        const part = Math.min(1, e.d / e.g);
        const bubble = new PIXI.Container();
        const box = new PIXI.Graphics(), body = new PIXI.Container();
        bubble.addChild(box, body);

        // zoomed all the way out: the event icon, named while pointed at
        if (this.small) {
            const { SMALL_PAD } = EventBubbles;
            this.icon(eventIcon(), SMALL_PAD, SMALL_PAD, eventTitle(e), body);
            return this.box(bubble, box, body, e, hue, TASK_ICON + SMALL_PAD * 2, TASK_ICON + SMALL_PAD * 2);
        }

        // its name; the bar; the skills it's worked with on the bottom left, the
        // time left, then how many heroes are on it and a helm on the bottom right
        const name = this.text(eventTitle(e), PAD, PAD, AP.WHITE, body);
        const barY = PAD + LINE, BAR_H = 11, iconY = barY + BAR_H + 2;     // (the bar: the text, a px over and under it inside its rim)
        const skills = eventSkills(e, place);
        skills.forEach((s, k) => this.icon(skillIcon(s), PAD + k * (TASK_ICON + 2), iconY, SKILL_NAMES[s], body));
        const heroes = e.c ?? 0;
        const count = this.text(`${heroes}`, 0, iconY + 2, heroes ? AP.WHITE : AP.STONE, body);
        const left = this.text(timeLeft(e.e - Date.now()), 0, iconY + 2, hue, body);
        const skillsW = skills.length * (TASK_ICON + 2), heroesW = TASK_ICON + 2 + Math.ceil(count.textWidth);
        const widest = Math.max(name.textWidth, skillsW + 8 + Math.ceil(left.textWidth) + 6 + heroesW);
        const w = Math.min(W_MOST, Math.max(W_LEAST, Math.ceil(widest) + PAD * 2));
        const h = iconY + TASK_ICON + PAD;
        if (name.textWidth > w - PAD * 2) this.marquee(e, name, w - PAD * 2, body);
        const helm = this.icon(heroesIcon(), w - PAD - TASK_ICON, iconY, `${heroes} Participating`, body);
        count.x = helm.x - 2 - Math.ceil(count.textWidth);
        left.x = count.x - 6 - Math.ceil(left.textWidth);

        // the bar, with how far it's got on it (2px past the sides' padding either way)
        const barX = PAD - 2, barW = w - PAD * 2 + 4, fill = Math.round((barW - 2) * part);
        const bar = new PIXI.Graphics();
        bar.beginFill(AP.BLACK).drawRect(barX, barY, barW, BAR_H).endFill();
        bar.beginFill(AP.SLATE).drawRect(barX + 1, barY + 1, barW - 2, BAR_H - 2).endFill();
        bar.beginFill(boss ? AP.RED : AP.OCHRE).drawRect(barX + 1, barY + 1, fill, BAR_H - 2).endFill();
        bar.beginFill(hue).drawRect(barX + 1, barY + 1, fill, 2).endFill();
        body.addChildAt(bar, 0);
        const done = this.text(`${Math.floor(e.d)} / ${e.g}  (${Math.floor(part * 100)}%)`, 0, barY + 2, AP.WHITE, body);
        done.x = Math.round(barX + (barW - done.textWidth) / 2);
        return this.box(bubble, box, body, e, hue, w, h);
    }

    // the box (its rim the kind's colour) and its tail, the tip at (0, 0);
    // clicked, the event's window
    private box(bubble: PIXI.Container, box: PIXI.Graphics, body: PIXI.Container, e: EventView, hue: number, w: number, h: number) {
        const { TAIL } = EventBubbles;
        const x = -Math.round(w / 2), y = -TAIL - h;
        body.position.set(x, y);
        box.beginFill(AP.BLACK).drawRect(x - 1, y - 1, w + 2, h + 2).drawPolygon([-TAIL - 1, -TAIL, TAIL + 1, -TAIL, 0, 1]).endFill();
        box.beginFill(hue).drawRect(x, y, w, h).drawPolygon([-TAIL, -TAIL - 1, TAIL, -TAIL - 1, 0, 0]).endFill();
        box.beginFill(AP.SHADOW).drawRect(x + 1, y + 1, w - 2, h - 2).drawPolygon([-TAIL + 2, -TAIL - 1, TAIL - 2, -TAIL - 1, 0, -3]).endFill();

        bubble.eventMode = "static";
        bubble.cursor = "pointer";
        bubble.hitArea = new PIXI.Rectangle(x, y, w, h + TAIL);
        bubble.on("pointerdown", (ev: PIXI.FederatedPointerEvent) => ev.stopPropagation());
        bubble.on("pointertap", () => EventInfo.open(e.i));
        return bubble;
    }

    // a name too long to fit, on a strip (it, a gap, it again) shown only
    // inside its line and scrolled by in update, round and round
    private marquee(e: EventView, name: PIXI.BitmapText, width: number, body: PIXI.Container) {
        const { PAD, LINE, MARQUEE_GAP } = EventBubbles;
        const strip = new PIXI.Container(), span = Math.ceil(name.textWidth) + MARQUEE_GAP;
        name.position.set(0, 0);
        strip.addChild(name);
        this.text(name.text, span, 0, AP.WHITE, strip);
        strip.position.set(PAD, PAD);
        const mask = new PIXI.Graphics().beginFill(AP.WHITE).drawRect(PAD, PAD - 2, width, LINE + 2).endFill();
        strip.mask = mask;
        body.addChild(strip, mask);
        this.marquees.push({ id: e.i, strip, span });
    }

    // a 10 x 10 icon, saying what it is while it's pointed at; the hand over
    // it too (Pixi takes the cursor from what's pointed at, not the bubble),
    // its click going on to the bubble's
    private icon(texture: PIXI.Texture, x: number, y: number, hint: string, parent: PIXI.Container) {
        const icon = new PIXI.Sprite(texture);
        icon.position.set(x, y);
        icon.eventMode = "static";
        icon.cursor = "pointer";
        Hint.on(icon, hint);
        parent.addChild(icon);
        return icon;
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
