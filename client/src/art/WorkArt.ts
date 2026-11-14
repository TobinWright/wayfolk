import * as PIXI from "pixi.js";
import { EventKind } from "../../../shared/Events";
import { Job, JOBS, Skill } from "../../../shared/Heroes";
import { materialOf } from "../../../shared/Locations";
import { gatherSkill } from "../../../shared/Tasks";
import { AP } from "../constants/Palette";
import { picTexture } from "../people/People";
import { FEET_Y, GROUND_Y, hash, Pic, SCENE_H } from "./Backdrops";
import { skillIcon } from "./BoardIcons";
import { taskIcon } from "./TaskIcons";

// Heroes at work (the user, 2026-10-28: "show characters doing something at
// events based on the event"): what each skill's worked with and how - a tool
// swung, sawn, tipped over a pot, jabbed or held -, chips flying off where it
// strikes, and what's worked at in a hero window: a station for each skill
// (a rock, a stump, an anvil...) and a building going up for a rebuild or an
// upgrade. Used by the map (components/map/EventScenes) and the hero windows
// (components/herowindow/AtWork). Positions in a person's px (AVATAR_W x
// AVATAR_H, feet at 0), scaled by whoever draws them.

export type Style = "swing" | "saw" | "brew" | "jab" | "hold" | "shoot";

// by skill: how it's worked, the icon's handle (its px, where it's held:
// swung about it), how far the icon already leans forward (rad), and the
// chips' colours (icon: another than the skill's; flip: held the other way round, a pan by its handle)
export interface Work { style: Style; handle: [number, number]; lean: number; chips: number[]; icon?: string; flip?: boolean; }
const WORK: { [skill: number]: Work } = {
    [Skill.MINING]: { style: "swing", handle: [5.5, 9.5], lean: 0, chips: [AP.STONE, AP.ASH, AP.IRON] },
    [Skill.WOODCUTTING]: { style: "swing", handle: [2.5, 9.5], lean: 0.6, chips: [AP.TAN, AP.CLAY, AP.SAND] },
    [Skill.FORAGING]: { style: "swing", handle: [1.5, 9.5], lean: 0.8, chips: [AP.LEAF, AP.GRASS, AP.LIME] },
    [Skill.SMITHING]: { style: "swing", handle: [2.5, 9.5], lean: 0.8, chips: [AP.STRAW, AP.AMBER, AP.EMBER] },
    [Skill.JEWELCRAFTING]: { style: "swing", handle: [2.5, 9.5], lean: 0.8, chips: [AP.WHITE, AP.ICE], icon: "hammer" },
    [Skill.FIGHTING]: { style: "swing", handle: [0.5, 9.5], lean: 0.8, chips: [AP.WHITE, AP.MIST] },
    [Skill.WOODWORKING]: { style: "saw", handle: [1.5, 4.5], lean: 0, chips: [AP.SAND, AP.CREAM] },
    [Skill.ALCHEMY]: { style: "brew", handle: [5, 10], lean: 0, chips: [AP.LIME, AP.PALE] },
    [Skill.COOKING]: { style: "brew", handle: [9, 5], lean: 0, chips: [AP.MIST, AP.ASH], flip: true },
    [Skill.TAILORING]: { style: "jab", handle: [1.5, 9.5], lean: 0.8, chips: [AP.WHITE] },
    // (the bow's drawn facing left: turned round, held by its grip)
    [Skill.HUNTING]: { style: "shoot", handle: [2.5, 5], lean: 0, chips: [], flip: true },
};
const HOLD: Work = { style: "hold", handle: [1.5, 9.5], lean: 0.8, chips: [] };

export function workOf(skill: Skill) {
    return WORK[skill] ?? HOLD;
}

// what someone else's hero works an event with (their levels unknown): the
// first of its skills their job has, or one by their id; the same on the map and in a window
export function othersSkill(skills: Skill[], id: number, job?: Job) {
    return skills.find((s) => JOBS[job]?.skills.includes(s)) ?? skills[Math.abs(id) % skills.length];
}

// the tool in hand, held by its handle
export function toolSprite(skill: Skill) {
    const work = workOf(skill), tool = new PIXI.Sprite(work.icon ? taskIcon(work.icon) : skillIcon(skill));
    tool.anchor.set(work.handle[0] / tool.texture.width, work.handle[1] / tool.texture.height);
    tool.eventMode = "none";
    return tool;
}

export const ROUND_MS = 900;        // a swing, up and down
export const STRIKE = 0.7;          // how far through a round it's brought down (landing BLOW later)
export const BLOW = 0.08;
export const HAND: [number, number] = [4, -12];    // where it's held, forward of their middle, up from their feet

// a tool's pose a round in (t 0-1): its angle forward of upright, and how
// far it's moved off the hand. `down`: how far forward a blow lands (rad:
// lower to hit the ground). A swing's raised slowly back, brought down
// quick, held a moment, then back to rest
export function workPose(style: Style, t: number, down = 1.7) {
    switch (style) {
        case "swing": {
            const back = STRIKE + BLOW + 0.06;
            const a = t < STRIKE ? 0.3 - 1.3 * Math.sin(t / STRIKE * Math.PI / 2)
                : t < back ? -1 + (down + 1) * Math.min(1, (t - STRIKE) / BLOW)
                : down - (down - 0.3) * Math.sin((t - back) / (1 - back) * Math.PI / 2);
            return { a, ox: 0, oy: 0 };
        }
        case "saw": return { a: 0, ox: Math.round(3 * Math.sin(t * Math.PI * 4)), oy: 4 };
        // tipped over what's brewing, rocking
        case "brew": return { a: 0.5 + 0.25 * Math.sin(t * Math.PI * 2), ox: 4, oy: 0 };
        case "jab": return { a: 0.4, ox: 0, oy: t > STRIKE && t < STRIKE + BLOW ? 2 : 0 };
        case "hold": return { a: 0.2 * Math.sin(t * Math.PI * 2), ox: 0, oy: 0 };
        // held out, kicking up a little as it's loosed
        case "shoot": return { a: 0, ox: 2, oy: t > STRIKE && t < STRIKE + BLOW * 2 ? -1 : 0 };
    }
}

// where a blow lands, from the hand (a person's px; dir 1 facing right)
export function blowAt(style: Style, a: number, dir: number): [number, number] {
    if (style == "saw") return [6 * dir, 2];
    const reach = style == "swing" ? 9 : 6;
    return [Math.sin(a) * reach * dir, -Math.cos(a) * reach];
}

// chips flying off blows (steam rising off a brew), slashes on what's fought,
// drawn into a Graphics `scale` px a person's px
interface Chip { x: number; y: number; vx: number; vy: number; born: number; life: number; color: number; rise?: boolean; }
interface Slash { x: number; y: number; born: number; dir: number; }
interface Arrow { x: number; y: number; born: number; }
export class WorkFx {

    public static GRAVITY = 0.00016;    // a person's px / ms²
    public static CHIP_MS = 420;
    public static SLASH_MS = 220;
    public static STEAM_MS = 900;
    public static ARROW_PACE = 0.16;    // a person's px / ms
    public static ARROW_MS = 1000;

    public g = new PIXI.Graphics();
    private chips: Chip[] = [];
    private slashes: Slash[] = [];
    private arrows: Arrow[] = [];

    constructor(private scale: number) {
        this.g.eventMode = "none";
    }

    // (x, y: where it lands, in the drawer's px; dir which way it was struck)
    public chipsOff(work: Work, x: number, y: number, dir: number, now: number) {
        const s = this.scale, n = work.style == "swing" ? 3 : 1;
        for (let k = 0; k < n && work.chips.length; k++) this.chips.push({
            x, y,
            vx: dir * (0.008 + Math.random() * 0.016) * (Math.random() < 0.3 ? -1 : 1) * s, vy: (-0.02 - Math.random() * 0.02) * s,
            born: now, life: WorkFx.CHIP_MS * (0.7 + Math.random() * 0.6), color: work.chips[k % work.chips.length],
        });
    }

    public steam(color: number, x: number, y: number, now: number) {
        const s = this.scale;
        this.chips.push({ x: x + (Math.random() * 4 - 2) * s, y, vx: (Math.random() - 0.5) * 0.008 * s, vy: -0.016 * s, born: now, life: WorkFx.STEAM_MS, color, rise: true });
    }

    public slash(x: number, y: number, now: number) {
        this.slashes.push({ x, y, born: now, dir: Math.random() < 0.5 ? 1 : -1 });
    }

    // an arrow loosed to the right, flying off out of sight
    public arrow(x: number, y: number, now: number) {
        this.arrows.push({ x, y, born: now });
    }

    public draw(now: number) {
        const g = this.g, s = this.scale;
        g.clear();
        this.chips = this.chips.filter((c) => now - c.born < c.life);
        for (const c of this.chips) {
            const t = now - c.born, size = (c.rise ? 2 : 1) * s;
            const x = c.x + c.vx * t, y = c.y + c.vy * t + (c.rise ? 0 : WorkFx.GRAVITY * s * t * t / 2);
            g.beginFill(c.color, 1 - t / c.life).drawRect(Math.round(x / s) * s, Math.round(y / s) * s, size, size).endFill();
        }
        // a white stroke across it, fading
        const { SLASH_MS } = WorkFx;
        this.slashes = this.slashes.filter((l) => now - l.born < SLASH_MS);
        for (const l of this.slashes) {
            g.lineStyle(1.5 * s, AP.WHITE, 1 - (now - l.born) / SLASH_MS).moveTo(l.x - 6 * s * l.dir, l.y - 6 * s).lineTo(l.x + 6 * s * l.dir, l.y + 6 * s);
            g.lineStyle(0);
        }
        // a shaft, its head and its feathers
        this.arrows = this.arrows.filter((r) => now - r.born < WorkFx.ARROW_MS);
        for (const r of this.arrows) {
            const x = Math.round((r.x + WorkFx.ARROW_PACE * s * (now - r.born)) / s) * s, y = Math.round(r.y / s) * s;
            g.beginFill(AP.TAN).drawRect(x - 4 * s, y, 5 * s, s).endFill();
            g.beginFill(AP.ASH).drawRect(x + s, y, s, s).endFill();
            g.beginFill(AP.WHITE).drawRect(x - 5 * s, y - s, s, s).drawRect(x - 5 * s, y + s, s, s).endFill();
        }
    }

}

//#region what's worked at, in a hero window

// pictures with their feet on the bottom row, drawn facing right (the
// worker on their left), each skill's: where its blows land, its top, and
// whether it steams
export interface Station { pic: () => Pic; top: number; steams?: number; }
const STATIONS: { [skill: number]: Station } = {
    // a boulder, ore glinting in it
    [Skill.MINING]: {
        top: 9, pic: () => {
            const p = new Pic(14, 10);
            p.oval(7, 6, 6.5, 4.5, AP.STONE, AP.STEEL); p.oval(5, 4.5, 3, 2, AP.ASH);
            p.set(9, 5, AP.STRAW); p.set(4, 7, AP.STRAW); p.set(10, 7, AP.AMBER);
            p.rect(1, 9, 12, 1, AP.SHADOW);
            return p;
        },
    },
    // a log stood on end, an axe's cut in it
    [Skill.WOODCUTTING]: {
        top: 10, pic: () => {
            const p = new Pic(10, 11);
            p.rect(1, 2, 8, 9, AP.UMBER); p.column(2, 2, AP.CLAY, 10); p.column(7, 2, AP.BARK, 10);
            p.oval(5, 2, 4, 1.5, AP.TAN, AP.SAND); p.set(5, 2, AP.CLAY);
            p.set(1, 5, AP.SAND); p.set(2, 5, AP.SAND); p.set(1, 6, AP.BARK);
            p.rect(0, 10, 10, 1, AP.SHADOW);
            return p;
        },
    },
    // a bush, berries on it
    [Skill.FORAGING]: {
        top: 9, pic: () => {
            const p = new Pic(14, 10);
            p.oval(7, 5.5, 6.5, 4.5, AP.LEAF, AP.FOREST); p.oval(5, 4, 3, 2, AP.GRASS);
            p.set(4, 6, AP.RED); p.set(9, 4, AP.RED); p.set(10, 7, AP.RED); p.set(6, 3, AP.PINK);
            p.rect(2, 9, 10, 1, AP.SHADOW);
            return p;
        },
    },
    // a pool, ripples on it and a float bobbing
    [Skill.FISHING]: {
        top: 4, pic: () => {
            const p = new Pic(16, 5);
            p.oval(8, 2.5, 7.5, 2.2, AP.SKY, AP.COBALT);
            p.rect(3, 2, 3, 1, AP.ICE); p.rect(10, 3, 3, 1, AP.ICE);
            p.set(8, 1, AP.RED); p.set(8, 2, AP.WHITE);
            return p;
        },
    },
    // an anvil, something glowing on it
    [Skill.SMITHING]: {
        top: 8, pic: () => {
            const p = new Pic(14, 9);
            p.rect(1, 1, 11, 2, AP.STEEL); p.rect(1, 1, 11, 1, AP.ASH); p.rect(0, 2, 1, 1, AP.STEEL);
            p.rect(4, 3, 5, 3, AP.IRON); p.rect(2, 6, 9, 2, AP.IRON); p.rect(2, 6, 9, 1, AP.STEEL);
            p.rect(3, 0, 5, 1, AP.EMBER); p.set(5, 0, AP.STRAW);
            p.rect(1, 8, 12, 1, AP.SHADOW);
            return p;
        },
    },
    // a sawhorse, a plank across it
    [Skill.WOODWORKING]: {
        top: 7, pic: () => {
            const p = new Pic(16, 8);
            p.rect(0, 1, 16, 2, AP.TAN); p.rect(0, 1, 16, 1, AP.SAND); p.set(8, 2, AP.CLAY);
            for (const x of [3, 12]) { p.column(x - 1, 3, AP.UMBER, 7); p.column(x + 1, 3, AP.UMBER, 7); p.set(x, 4, AP.UMBER); }
            p.rect(1, 7, 14, 1, AP.SHADOW);
            return p;
        },
    },
    // a cauldron bubbling green
    [Skill.ALCHEMY]: {
        top: 8, steams: AP.LIME, pic: () => {
            const p = new Pic(12, 9);
            p.oval(6, 5, 5.5, 3.5, AP.SLATE, AP.INK); p.rect(1, 1, 10, 2, AP.IRON); p.rect(2, 1, 8, 1, AP.LIME);
            p.set(4, 1, AP.PALE); p.set(1, 8, AP.INK); p.set(10, 8, AP.INK);
            return p;
        },
    },
    // a pot over a small fire
    [Skill.COOKING]: {
        top: 9, steams: AP.MIST, pic: () => {
            const p = new Pic(12, 10);
            p.oval(6, 4.5, 5, 3, AP.STEEL, AP.IRON); p.rect(1, 1, 10, 1, AP.IRON); p.rect(2, 1, 8, 1, AP.CLAY);
            p.rect(3, 8, 6, 1, AP.EMBER); p.set(5, 7, AP.STRAW); p.set(7, 7, AP.AMBER); p.rect(2, 9, 8, 1, AP.UMBER);
            return p;
        },
    },
    // cloth on a stand
    [Skill.TAILORING]: {
        top: 11, pic: () => {
            const p = new Pic(10, 12);
            p.rect(1, 1, 8, 7, AP.RED); p.rect(1, 1, 8, 1, AP.FLAME); p.column(8, 2, AP.MAROON, 8);
            p.rect(3, 3, 4, 1, AP.STRAW);
            p.column(4, 8, AP.UMBER, 11); p.column(5, 8, AP.UMBER, 11); p.rect(2, 11, 6, 1, AP.UMBER);
            return p;
        },
    },
};
STATIONS[Skill.JEWELCRAFTING] = STATIONS[Skill.SMITHING];

// (chips: their colours, in place of the tool's)
export interface StationTexture { texture: PIXI.Texture; top: number; steams?: number; chips?: number[]; }
const stations = new Map<number, PIXI.Texture>();
export function stationOf(skill: Skill): StationTexture {
    const s = STATIONS[skill];
    if (!s) return null;
    let texture = stations.get(skill);
    if (!texture) stations.set(skill, texture = picTexture(s.pic()));
    return { texture, top: s.top, steams: s.steams };
}

// what a material's gathered from, in a hero window (null: nothing before
// them - a hunter shooting off out of it): a rock glinting with its ore, a
// rock its crystals grow out of, a standing stone its rune glowing, a sheep,
// a heap of bones; logs and plants their skill's (a log on end, a bush)
type Two = [number, number];
const ORE: { [id: number]: Two } = {
    1: [AP.OCHRE, AP.CLAY], 2: [AP.MIST, AP.ASH], 3: [AP.RUST, AP.CLAY], 4: [AP.INK, AP.SOOT], 5: [AP.WHITE, AP.MIST],
    6: [AP.STRAW, AP.AMBER], 7: [AP.SKY, AP.ICE], 8: [AP.LIME, AP.LEAF], 33: [AP.ICE, AP.WHITE], 36: [AP.RUST, AP.OCHRE],
};
const CRYSTAL: { [id: number]: Two } = {
    11: [AP.WHITE, AP.MIST], 12: [AP.ORCHID, AP.VIOLET], 13: [AP.ICE, AP.SKY], 15: [AP.LIME, AP.GRASS], 29: [AP.STRAW, AP.AMBER],
    30: [AP.SLATE, AP.INK], 31: [AP.FLAME, AP.EMBER], 34: [AP.FOAM, AP.ICE], 35: [AP.WHITE, AP.ICE],
};
const RUNE: { [id: number]: Two } = {
    32: [AP.FLAME, AP.EMBER], 37: [AP.SKY, AP.ICE], 38: [AP.STRAW, AP.AMBER], 40: [AP.ASH, AP.MIST],
    41: [AP.VIOLET, AP.GRAPE], 42: [AP.MAGENTA, AP.GRAPE], 43: [AP.STRAW, AP.AMBER],
};
// (a plain rock's own colours: [body, shade, light])
const ROCK: { [id: number]: [number, number, number] } = { 10: [AP.SLATE, AP.IRON, AP.STEEL], 14: [AP.SAND, AP.TAN, AP.CREAM] };
const WOOL = 46, SILK = 47;

const gathered = new Map<string, StationTexture>();
export function gatherStation(materialId: number): StationTexture {
    const m = materialOf(materialId), skill = gatherSkill(materialId);
    if (skill == Skill.HUNTING) return null;
    if (m?.type == "wood") return stationOf(Skill.WOODCUTTING);
    if (m?.type == "fish") return stationOf(Skill.FISHING);
    if (m?.type == "plant" || materialId == SILK) return stationOf(Skill.FORAGING);
    if (!m) return stationOf(skill);
    const key = `${materialId}`;
    let s = gathered.get(key);
    if (s) return s;
    const [body, shade, light] = ROCK[materialId] ?? [AP.STONE, AP.STEEL, AP.ASH];
    if (m.type == "ore") {
        const [a, b] = ORE[materialId] ?? [AP.STRAW, AP.AMBER];
        s = { texture: picTexture(rock(body, shade, light, a, b)), top: 9, chips: [body, a, b] };
    } else if (m.type == "stone") {
        const c = CRYSTAL[materialId];
        s = c ? { texture: picTexture(crystals(c[0], c[1])), top: 7, chips: [c[0], c[1], AP.STONE] }
            : { texture: picTexture(rock(body, shade, light)), top: 9, chips: [body, light, shade] };
    } else if (m.type == "arcane") {
        const [a, b] = RUNE[materialId] ?? [AP.ICE, AP.SKY];
        s = { texture: picTexture(runestone(a, b)), top: 13, chips: [a, b, AP.STONE] };
    } else if (materialId == WOOL) s = { texture: picTexture(sheep()), top: 8, chips: [AP.WHITE, AP.MIST] };
    else s = { texture: picTexture(bones(m.at[0] == "pyramids")), top: 6, chips: [AP.SAND, AP.MIST, AP.TAN] };
    gathered.set(key, s);
    return s;
}

// a boulder (glinting with its ore, if any)
function rock(body: number, shade: number, light: number, a?: number, b?: number) {
    const p = new Pic(14, 10);
    p.oval(7, 6, 6.5, 4.5, body, shade); p.oval(5, 4.5, 3, 2, light);
    if (a != null) { p.set(9, 5, a); p.set(4, 7, a); p.set(10, 7, b); p.set(6, 3, b); }
    p.rect(1, 9, 12, 1, AP.SHADOW);
    return p;
}

// a low rock, crystals growing up out of it
function crystals(c: number, d: number) {
    const p = new Pic(14, 13);
    p.oval(7, 9.5, 6.5, 3, AP.STONE, AP.STEEL); p.oval(5, 8.5, 3, 1.5, AP.ASH);
    for (const [x, h] of [[3, 4], [6, 7], [10, 5]]) {
        p.column(x, 8 - h, c, 9); p.column(x + 1, 9 - h, d, 9);
    }
    p.set(7, 3, AP.WHITE);
    p.rect(1, 12, 12, 1, AP.SHADOW);
    return p;
}

// a standing stone, a rune glowing on it
function runestone(c: number, d: number) {
    const p = new Pic(10, 15);
    p.rect(2, 2, 6, 12, AP.STONE); p.rect(3, 1, 4, 1, AP.STONE);
    p.column(2, 2, AP.ASH, 14); p.column(7, 2, AP.STEEL, 14); p.set(3, 1, AP.ASH);
    p.column(5, 4, c, 11); p.set(4, 5, c); p.set(6, 7, c); p.set(4, 9, c); p.set(6, 10, d);
    p.set(1, 5, d); p.set(8, 8, d); p.set(1, 10, d);
    p.rect(1, 14, 8, 1, AP.SHADOW);
    return p;
}

// a sheep, its head away from whoever's shearing it
function sheep() {
    const p = new Pic(14, 10);
    p.column(4, 7, AP.INK, 9); p.column(9, 7, AP.INK, 9);
    p.oval(7, 4.5, 5.5, 3.5, AP.WHITE, AP.MIST); p.oval(4, 3, 2, 1.5, AP.WHITE);
    p.oval(12, 3.5, 1.8, 1.8, AP.INK); p.set(13, 3, AP.SLATE); p.set(11, 2, AP.SOOT);
    p.rect(2, 9, 10, 1, AP.SHADOW);
    return p;
}

// a mound of earth (sand at the pyramids, a scarab's shell in it) with bones in it
function bones(sand: boolean) {
    const p = new Pic(14, 8);
    p.oval(7, 6, 6.5, 3, sand ? AP.SAND : AP.UMBER, sand ? AP.TAN : AP.BARK);
    p.rect(3, 4, 5, 1, AP.MIST); p.set(3, 3, AP.WHITE); p.set(7, 5, AP.WHITE);
    if (sand) { p.oval(10, 4, 2, 1.5, AP.LEAF, AP.FOREST); p.set(10, 3, AP.LIME); }
    else { p.oval(10, 4, 2, 1.7, AP.MIST, AP.ASH); p.set(10, 4, AP.BLACK); }
    p.rect(1, 7, 12, 1, AP.SHADOW);
    return p;
}

//#endregion

//#region odd jobs and dungeon runs, in a hero window

// a crate (carried), a stack of them to fetch from, and a cart to load them onto
export const CRATE_W = 7, CRATE_H = 6;
let crate: PIXI.Texture, stack: PIXI.Texture, cart: PIXI.Texture;
function crateAt(p: Pic, x: number, y: number) {
    p.rect(x, y, CRATE_W, CRATE_H, AP.TAN); p.rect(x, y, CRATE_W, 1, AP.SAND);
    p.column(x, y, AP.UMBER, y + CRATE_H); p.column(x + CRATE_W - 1, y, AP.UMBER, y + CRATE_H); p.rect(x, y + CRATE_H - 1, CRATE_W, 1, AP.UMBER);
    p.rect(x + 1, y + 2, CRATE_W - 2, 1, AP.CLAY);
}
export function crateTexture() {
    if (!crate) { const p = new Pic(CRATE_W, CRATE_H); crateAt(p, 0, 0); crate = picTexture(p); }
    return crate;
}
export function stackTexture() {
    if (!stack) {
        const p = new Pic(16, 13);
        crateAt(p, 1, 6); crateAt(p, 8, 6); crateAt(p, 4, 0);
        p.rect(0, 12, 16, 1, AP.SHADOW);
        stack = picTexture(p);
    }
    return stack;
}
export function cartTexture() {
    if (!cart) {
        const p = new Pic(26, 14);
        crateAt(p, 6, 0); crateAt(p, 13, 1);
        p.rect(2, 6, 20, 3, AP.TAN); p.rect(2, 6, 20, 1, AP.SAND); p.rect(2, 8, 20, 1, AP.UMBER);
        p.rect(21, 7, 5, 1, AP.UMBER);
        for (const x of [6, 18]) { p.oval(x, 10.5, 3, 3, AP.UMBER, AP.BARK); p.set(x, 10, AP.CLAY); }
        p.rect(2, 13, 20, 1, AP.SHADOW);
        cart = picTexture(p);
    }
    return cart;
}

// a dungeon's passage, as a backdrop's strips: a brick wall with torches
// on it going by slower than its flagstones, both wrapping round
let passage: { texture: PIXI.Texture, pace: number }[];
export function passageStrips() {
    return passage ??= passageArt().map((s) => ({ texture: picTexture(s.pic), pace: s.pace }));
}
function passageArt(): { pic: Pic, pace: number }[] {
    const wall = new Pic(64, SCENE_H);
    wall.rect(0, 0, 64, GROUND_Y, AP.IRON);
    for (let y = 2; y < GROUND_Y; y += 4) {
        wall.rect(0, y, 64, 1, AP.SLATE);
        for (let x = ((y - 2) / 4) % 2 ? 4 : 0; x < 64; x += 8) {
            wall.column(x, y, AP.SLATE, Math.min(GROUND_Y, y + 4));
            if (hash(x + y * 7, 91) < 0.3) wall.rect(x + 1, y + 1, 3, 1, AP.STEEL);
        }
    }
    // (dark up under the roof, fading down into the wall)
    wall.rect(0, 0, 64, 2, AP.BLACK); wall.rect(0, 2, 64, 1, AP.INK);
    for (let y = 3; y < 5; y++) for (let x = y % 2; x < 64; x += 2) wall.set(x, y, AP.INK);
    // a torch: a bracket, its stick and a flame
    const tx = 32, ty = 16;
    wall.rect(tx - 1, ty + 4, 3, 2, AP.BARK); wall.rect(tx, ty, 1, 4, AP.UMBER);
    wall.set(tx, ty - 1, AP.FLAME); wall.set(tx, ty - 2, AP.STRAW); wall.set(tx - 1, ty - 1, AP.RED); wall.set(tx + 1, ty - 1, AP.EMBER);
    for (const [dx, dy] of [[-2, -1], [2, 0], [-1, 2], [1, -3]]) wall.set(tx + dx, ty + dy, AP.CLAY);
    const flags = new Pic(36, SCENE_H);
    flags.rect(0, GROUND_Y, 36, SCENE_H - GROUND_Y, AP.STEEL);
    flags.rect(0, GROUND_Y, 36, 1, AP.STONE);
    for (let x = 0; x < 36; x += 9) flags.column(x + ((x / 9) % 2) * 4, GROUND_Y + 1, AP.IRON, FEET_Y);
    flags.rect(0, FEET_Y, 36, 1, AP.IRON);
    for (let x = 0; x < 36; x += 12) flags.column(x + 6, FEET_Y + 1, AP.IRON);
    return [{ pic: wall, pace: 0.6 }, { pic: flags, pace: 1 }];
}

//#endregion

//#region buildings

// (an event's) a building going up, BUILD_W x BUILD_H, its foot on the bottom row: a
// rebuild timber walls in a frame, an upgrade stone ones behind scaffolding,
// so far up as it's got (part 0-1, by tenths); the roof on once it's all but done
export const BUILD_W = 30, BUILD_H = 34;
const buildings = new Map<string, PIXI.Texture>();
export function buildingTexture(kind: EventKind, part: number) {
    const tenths = Math.max(0, Math.min(10, Math.floor(part * 10))), key = `${kind}:${tenths}`;
    let texture = buildings.get(key);
    if (texture) return texture;
    const p = new Pic(BUILD_W, BUILD_H), stone = kind == EventKind.UPGRADE;
    const eaves = 11, foot = BUILD_H - 1, rows = foot - eaves, up = Math.round(rows * tenths / 10);
    // the walls, rising
    for (let y = foot - up; y < foot; y++) {
        const course = (foot - y) % 3 == 0;
        p.rect(3, y, BUILD_W - 6, 1, stone ? (course ? AP.STEEL : AP.ASH) : (course ? AP.CLAY : AP.TAN));
        if (stone && !course) for (let x = 3 + ((foot - y) % 6 < 3 ? 2 : 5); x < BUILD_W - 3; x += 6) p.set(x, y, AP.STEEL);
    }
    if (tenths >= 3) { p.rect(12, foot - 9, 6, 9, AP.INK); p.rect(13, foot - 8, 4, 8, AP.BARK); }
    if (tenths >= 6) { p.rect(6, eaves + 5, 4, 4, AP.INK); p.rect(20, eaves + 5, 4, 4, AP.INK); p.set(7, eaves + 6, AP.STRAW); p.set(21, eaves + 6, AP.STRAW); }
    // the roof, done
    if (tenths >= 9) for (let y = 0; y <= eaves; y++) {
        const half = Math.round(y * (BUILD_W / 2) / eaves);
        p.rect(BUILD_W / 2 - half, y, half * 2, 1, y % 3 == 0 ? AP.MAROON : stone ? AP.IRON : AP.RED);
    }
    // the frame: posts and beams, the roof's line (a rebuild's), or scaffolding (an upgrade's)
    const wood = stone ? AP.CLAY : AP.UMBER;
    for (const x of stone ? [0, BUILD_W - 1] : [3, BUILD_W / 2 - 1, BUILD_W - 4]) p.column(x, stone ? 6 : eaves, wood, foot);
    for (const y of stone ? [10, 18, 26] : [eaves, eaves + 11]) p.rect(stone ? 0 : 3, y, stone ? BUILD_W : BUILD_W - 6, 1, wood);
    if (!stone && tenths < 9) for (let y = 0; y <= eaves; y++) {
        const half = Math.round(y * (BUILD_W / 2) / eaves);
        p.set(BUILD_W / 2 - half, y, wood); p.set(BUILD_W / 2 + half - 1, y, wood);
    }
    p.rect(0, foot, BUILD_W, 1, AP.SHADOW);
    buildings.set(key, texture = picTexture(p));
    return texture;
}

//#endregion
