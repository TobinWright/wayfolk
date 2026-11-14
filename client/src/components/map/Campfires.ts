import * as PIXI from "pixi.js";
import { darkness } from "../../../../shared/Weather";
import { TravelNode } from "../../../../shared/Travel";
import { CAMPFIRE_FRAMES, CAMPFIRE_H, campfireTextures } from "../../art/OverheadArt";
import { AP } from "../../constants/Palette";
import { MapWeather } from "./MapWeather";
import { tentAt } from "./Wander";

// Campfires where heroes rest at night (the user, 2026-10-31: "with whole
// parties sitting round them"): from dusk to dawn a hero resting (or
// recovering) at a place sits by a campfire instead of in their tent, their
// party (those resting there together, anyone's) round the same one, lit at
// their leader's tent spot, each at their seat by their place in the party,
// facing it. Whoever draws a hero asks seat() each frame; a fire nobody's
// sat at this frame is put out.

export const SEATS: [number, number][] = [[-7, 0], [7, 0], [-5, -4], [5, -4], [-5, 4], [5, 4]];
export const FIRE_FRAME_MS = 140;
const SCALE = 0.5;          // as the heroes' (Map.MARKER_SCALE)
const FEET = 6;             // as Map.FEET

// whether it's dark enough to sit out by a fire
export function campNight(now = Date.now()) {
    return darkness(now) >= 0.5;
}

interface Fire { sprite: PIXI.Sprite; glow: PIXI.Sprite; lit: boolean; }

export class Campfires {

    private fires = new Map<string, Fire>();
    private time = 0;

    constructor(private parent: PIXI.Container, private weather: MapWeather) { }

    // where a hero resting at `node` sits tonight (map px, as a node's; face 1 right, -1 left), their party's fire lit
    public seat(heroId: number, party: number[], node: TravelNode) {
        const ids = party?.includes(heroId) ? party : [heroId], lead = ids[0];
        const at = tentAt(lead, node), key = `${lead}:${node.i}`;
        let fire = this.fires.get(key);
        if (!fire) {
            const sprite = new PIXI.Sprite(campfireTextures()[0]);
            sprite.anchor.set(0.5, 1);
            sprite.scale.set(SCALE);
            this.parent.addChild(sprite);
            this.fires.set(key, fire = { sprite, glow: this.weather.glow(AP.AMBER), lit: true });
        }
        fire.lit = true;
        const x = Math.round(at.x), y = Math.round(at.y) + FEET;
        fire.sprite.position.set(x, y);
        // drawn as though back past its flames' tips, so anyone passing by whose feet are by them walks in front (the user, 2026-11-01, 11-02); only those at the far seats sit behind it
        const z = fire.sprite.zIndex = y - CAMPFIRE_H * SCALE - 1;
        fire.glow.position.set(x, y - 2);
        const [dx, dy] = SEATS[Math.max(0, ids.indexOf(heroId)) % SEATS.length];
        // (z: what to draw them at, the far seats' behind the fire)
        return { x: at.x + dx, y: at.y + dy, face: dx < 0 ? 1 : -1, z: dy < 0 ? z - 0.5 : undefined as number | undefined };
    }

    // the flames flickering, glowing as dark as it is; those nobody sat at put out
    public update(deltaTime: number) {
        this.time += deltaTime;
        const frame = Math.floor(this.time / FIRE_FRAME_MS) % CAMPFIRE_FRAMES, textures = campfireTextures();
        const glow = MapWeather.fireAlpha() * 1.3, flicker = 1 + 0.06 * Math.sin(this.time / 80);
        for (const [key, fire] of Array.from(this.fires)) {
            if (!fire.lit) {
                fire.sprite.destroy();
                fire.glow.destroy();
                this.fires.delete(key);
                continue;
            }
            fire.lit = false;
            fire.sprite.texture = textures[frame];
            fire.glow.alpha = Math.min(1, glow);
            fire.glow.scale.set(SCALE * 1.3 * flicker);
        }
    }

}
