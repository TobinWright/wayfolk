import * as PIXI from "pixi.js";
import { TaskKind } from "../../../../shared/Tasks";
import { Overhead, OVERHEAD_H, overheadTexture, PUFF_FRAMES, puffTextures } from "../../art/OverheadArt";
import { HeroRow } from "../../data/HeroesData";
import { hash } from "../../art/Backdrops";
import { inFight } from "./Wander";

// Over the heroes on the map (the user, 2026-10-31), anyone's: a little icon
// over their head saying what they're up to (art/OverheadArt: a pickaxe
// gathering, a hammer crafting, a coin at a shift, a torch down a dungeon,
// crossed swords in a fight, a "!" as a moment on the road waits), close
// enough in (ICON_ZOOM) to make it out; and wherever one's fighting, a puff
// now and then round them at any zoom, so you can watch the world being busy.
// Whoever draws a hero calls mark() each frame; the icons of those not
// marked go.

const SCALE = 0.5;                  // as the heroes' (Map.MARKER_SCALE)
const ICON_ZOOM = 2;                // the least zoom icons are shown at
const PUFF_GAP_MS = 420;            // between a fighter's puffs
const PUFF_FRAME_MS = 90;
const PUFF_REACH = 5;               // map px round them a puff bursts

interface Icon { sprite: PIXI.Sprite; marked: boolean; }
interface Puff { sprite: PIXI.Sprite; t: number; }

// what a hero's up to, as an icon (none: nothing worth one - resting, on the way)
export function overheadOf(row: HeroRow, resting: boolean): Overhead {
    if (inFight(row.id)) return "fight";
    if (row.s.c) return "moment";
    if (resting || row.s.r.length) return null;
    switch (row.s.w?.k) {
        case TaskKind.GATHER: return "gather";
        case TaskKind.CRAFT: return "craft";
        case TaskKind.WORK: return "work";
        case TaskKind.EXPLORE: return "explore";
    }
    return null;
}

export class Overheads {

    private icons = new Map<number, Icon>();
    private puffs: Puff[] = [];
    private lastPuff = new Map<number, number>();
    private time = 0;

    constructor(private parent: PIXI.Container) { }

    // a hero drawn this frame: feet at (x, feet), the top of their head `top`
    // (map px); how much higher a name over them goes (an icon's there)
    public mark(row: HeroRow, resting: boolean, x: number, top: number, feet: number, zoom: number) {
        const kind = zoom >= ICON_ZOOM || inFight(row.id) ? overheadOf(row, resting) : null;
        let icon = this.icons.get(row.id);
        if (kind) {
            if (!icon) {
                const sprite = new PIXI.Sprite();
                sprite.anchor.set(0.5, 1);
                sprite.scale.set(SCALE);
                this.parent.addChild(sprite);
                this.icons.set(row.id, icon = { sprite, marked: true });
            }
            icon.marked = true;
            icon.sprite.texture = overheadTexture(kind);
            icon.sprite.visible = zoom >= ICON_ZOOM;
            const bob = Math.round(Math.sin(this.time / 300 + row.id) * 0.6 * 2) / 2;
            icon.sprite.position.set(x, top - 1 + bob);
            icon.sprite.zIndex = 1e6 + feet;
        } else if (icon) icon.sprite.visible = false, icon.marked = true;
        if (inFight(row.id) && this.time - (this.lastPuff.get(row.id) ?? -Infinity) >= PUFF_GAP_MS) {
            this.lastPuff.set(row.id, this.time);
            this.puff(x + (hash(this.time | 0, row.id) * 2 - 1) * PUFF_REACH, feet - 4 + (hash(this.time | 0, row.id + 7) * 2 - 1) * PUFF_REACH * 0.6, zoom);
        }
        return icon?.sprite.visible ? Math.ceil(OVERHEAD_H * SCALE) + 1 : 0;
    }

    private puff(x: number, y: number, zoom: number) {
        const sprite = new PIXI.Sprite(puffTextures()[0]);
        sprite.anchor.set(0.5);
        // (bigger the farther out, to be seen)
        sprite.scale.set(SCALE * Math.max(1, ICON_ZOOM / zoom));
        sprite.position.set(Math.round(x), Math.round(y));
        sprite.zIndex = 1e6 + y;
        this.parent.addChild(sprite);
        this.puffs.push({ sprite, t: 0 });
    }

    // the puffs going on, the icons of those not marked gone
    public update(deltaTime: number) {
        this.time += deltaTime;
        const textures = puffTextures();
        this.puffs = this.puffs.filter((p) => {
            p.t += deltaTime;
            const f = Math.floor(p.t / PUFF_FRAME_MS);
            if (f >= PUFF_FRAMES) { p.sprite.destroy(); return false; }
            p.sprite.texture = textures[f];
            return true;
        });
        for (const [id, icon] of Array.from(this.icons)) {
            if (icon.marked) { icon.marked = false; continue; }
            icon.sprite.destroy();
            this.icons.delete(id);
            this.lastPuff.delete(id);
        }
    }

}
