import * as PIXI from "pixi.js";
import { eventDef, WorldEvent } from "../../../../shared/Events";
import { glowTexture, GLOW_R } from "../../art/WeatherArt";
import { AP } from "../../constants/Palette";
import { timeLeft } from "../../data/EventsData";
import { IBC } from "../../Engine";
import { Hint } from "../../shared/ui/Hint";

// The dynamic events on the map (shared/Events.ts, EventsData): a green star
// over each place whose boon is in effect, bobbing in a soft glow and
// twinkling now and then (those on have a bubble over the place instead:
// EventBubbles; their flags taken off, the user, 2026-10-28). Pointed at, it
// says it's an event's buff, what it does and how long it has left
// (Hint; the user, 2026-11-01). Its own layer, over the heroes, so it can be
// pointed at. Drawn again when the events change, bobbed every frame.

interface Star { star: PIXI.Container; glow: PIXI.Sprite; y: number; }

export class EventMarkers {

    public static BOB = 1.5;            // map px up and down
    public static BOB_MS = 900;
    public static R = 5;                // map px from its middle to a point
    public static GLOW = 9;             // map px round its glow
    public static GLOW_MS = 2200;       // once bright and back
    public static TWINKLE_MS = 3200;    // a twinkle this often
    public static TWINKLE = 0.25;       // how much bigger it grows as it twinkles

    public container = new PIXI.Container();
    private stars: Star[] = [];

    constructor(private tile: number, private placeSize: number) {
        this.container.eventMode = "passive";
    }

    // (the places' tiles: world.json's)
    public draw(places: { i: number; x: number; y: number }[]) {
        for (const s of this.stars) for (const part of [s.star, s.glow]) part.destroy({ children: true });
        this.stars = [];
        const now = Date.now();
        for (const e of IBC.data.events.list) {
            const place = places.find((p) => p.i == e.p);
            if (!place) continue;
            if (!(e.w == 1 && (e.u ?? 0) > now)) continue;
            const x = (place.x + 0.5) * this.tile, y = (place.y + 1) * this.tile - this.placeSize - 2;

            const glow = new PIXI.Sprite(glowTexture());
            glow.anchor.set(0.5);
            glow.scale.set(EventMarkers.GLOW / GLOW_R);
            glow.tint = AP.LIME;
            glow.blendMode = PIXI.BLEND_MODES.ADD;
            glow.eventMode = "none";
            glow.position.set(x, y);

            const star = new PIXI.Container();
            star.addChild(EventMarkers.drawStar());
            star.position.set(x, y);
            star.eventMode = "static";
            star.hitArea = new PIXI.Circle(0, 0, EventMarkers.R + 2);
            star.on("pointerover", (ev: PIXI.FederatedPointerEvent) => Hint.show(EventMarkers.hint(e), ev));
            star.on("pointermove", (ev: PIXI.FederatedPointerEvent) => Hint.move(ev));
            star.on("pointerout", () => Hint.hide());
            star.on("destroyed", () => Hint.hide());

            this.container.addChild(glow, star);
            this.stars.push({ star, glow, y });
        }
    }

    public update(time: number) {
        this.stars.forEach((s, k) => {
            s.star.y = s.glow.y = s.y + Math.round(EventMarkers.BOB * Math.sin(time / EventMarkers.BOB_MS * Math.PI * 2 + k));
            s.glow.alpha = 0.35 + 0.25 * Math.sin(time / EventMarkers.GLOW_MS * Math.PI * 2 + k);
            // a quick swell now and then, each at its own time
            const t = ((time + k * 977) % EventMarkers.TWINKLE_MS) / 300;
            s.star.scale.set(1 + (t < 1 ? EventMarkers.TWINKLE * Math.sin(t * Math.PI) : 0));
        });
    }

    // that it's an event's buff, what it does, how long it has left
    private static hint(e: WorldEvent) {
        return [
            "Event Buff",
            eventDef(e.k).boonText,
            `${timeLeft((e.u ?? 0) - Date.now())} left`,
        ].join("\n");
    }

    // a five-pointed star round 0, 0: outlined, its edges shaded, lighter to its middle, a glint up top
    private static drawStar() {
        const points = (r: number, dy = 0) => {
            const at: number[] = [];
            for (let k = 0; k < 10; k++) {
                const a = -Math.PI / 2 + k * Math.PI / 5, d = k % 2 ? r * 0.45 : r;
                at.push(Math.cos(a) * d, Math.sin(a) * d + dy);
            }
            return at;
        };
        const R = EventMarkers.R;
        return new PIXI.Graphics()
            .beginFill(AP.BLACK, 0.35).drawPolygon(points(R + 1.2, 1.5)).endFill()     // its shadow, below
            .beginFill(AP.PINE).drawPolygon(points(R + 1.2)).endFill()                 // the outline
            .beginFill(AP.LEAF).drawPolygon(points(R)).endFill()                       // the shaded edges
            .beginFill(AP.LIME).drawPolygon(points(R * 0.85, -0.6)).endFill()          // the face
            .beginFill(AP.PALE).drawPolygon(points(R * 0.4, -1.4)).endFill()           // lighter in the middle
            .beginFill(AP.WHITE).drawCircle(-1.2, -2, 0.7).endFill();                  // a glint
    }

}
