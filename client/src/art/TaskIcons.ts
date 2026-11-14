import * as PIXI from "pixi.js";
import { AP } from "../constants/Palette";
import { picTexture } from "../people/People";
import { Pic } from "./Backdrops";

// The to-do list's small icons (components/taskplanner), 10 x 10, drawn in
// code in Apollo colours: one for each tab, and one for each sort of thing
// under it (the user, 2026-10-28): places (towns, dungeons, gathering spots,
// the rest), materials (ore, stone and gems, wood, beast parts, herbs,
// arcane), things made (materials, weapons by kind, armour by where it's
// worn, jewellery, potions, tools for gathering and crafting by kind); "all"
// and "back". And the Misc tab's tasks'
// own, 16 x 16, for their bubbles: adventuring's (resting's is the tent).

export const TASK_ICON = 10;
export const TASK_BIG_ICON = 16;

const textures = new Map<string, PIXI.Texture>();
export function taskIcon(name: string): PIXI.Texture {
    let t = textures.get(name);
    if (!t) {
        const draw = DRAW[name] ?? DRAW.other;
        const p = new Pic(name == "adventure" ? TASK_BIG_ICON : TASK_ICON, name == "adventure" ? TASK_BIG_ICON : TASK_ICON);
        draw(p);
        textures.set(name, t = picTexture(p));
    }
    return t;
}

// pixels in a row, all one colour
function dots(p: Pic, c: number, points: number[][]) {
    for (const [x, y] of points) p.set(x, y, c);
}

const DRAW: { [name: string]: (p: Pic) => void } = {

    //#region the tabs

    // a signpost, a board pointing each way
    travel: (p) => {
        p.rect(4, 1, 2, 9, AP.UMBER); p.column(5, 1, AP.BARK);
        p.rect(1, 1, 7, 3, AP.TAN); p.set(8, 2, AP.TAN); p.rect(1, 3, 7, 1, AP.CLAY);
        p.rect(3, 5, 6, 2, AP.CLAY); p.set(2, 5, AP.CLAY); p.rect(3, 6, 6, 1, AP.UMBER);
    },
    // a pickaxe
    gather: (p) => {
        dots(p, AP.CLAY, [[1, 9], [2, 8], [3, 7], [4, 6], [5, 5], [6, 4]]);
        dots(p, AP.UMBER, [[2, 9], [3, 8], [4, 7]]);
        dots(p, AP.ASH, [[1, 2], [2, 1], [3, 1], [4, 1], [5, 2], [6, 3], [7, 4], [8, 5]]);
        dots(p, AP.STONE, [[5, 3], [7, 5], [8, 6], [8, 7]]);
    },
    // a hammer, head up
    craft: (p) => {
        p.rect(1, 1, 8, 3, AP.STONE); p.rect(1, 1, 8, 1, AP.ASH); p.rect(1, 3, 8, 1, AP.STEEL);
        p.rect(4, 4, 2, 6, AP.CLAY); p.column(5, 4, AP.UMBER);
    },
    // a swallow-tailed banner on a pole
    events: (p) => {
        p.column(1, 0, AP.STONE); p.set(1, 0, AP.ASH);
        p.rect(2, 1, 7, 5, AP.RED); p.rect(2, 1, 7, 1, AP.FLAME); p.rect(2, 5, 7, 1, AP.MAROON);
        p.set(8, 3, -1); p.set(7, 3, -1); p.set(8, 2, -1); p.set(8, 4, -1);
        p.rect(4, 3, 2, 1, AP.STRAW);
    },
    // a sack, tied at the neck
    misc: (p) => {
        p.oval(5, 6.5, 4.5, 3.5, AP.TAN, AP.CLAY);
        p.rect(4, 1, 2, 2, AP.TAN);
        p.rect(3, 3, 4, 1, AP.RUST);
    },

    //#endregion

    //#region places

    // a house, a red roof over it
    town: (p) => {
        for (let k = 0; k < 4; k++) p.rect(4 - k, 1 + k, 2 + 2 * k, 1, k == 3 ? AP.MAROON : AP.RED);
        p.rect(2, 5, 6, 5, AP.CREAM); p.column(7, 5, AP.SAND);
        p.rect(4, 7, 2, 3, AP.UMBER);
    },
    // a cave's dark mouth in a mound of rock
    dungeon: (p) => {
        p.oval(5, 7, 5, 6, AP.STONE, AP.STEEL);
        p.oval(5, 8, 2.5, 3.5, AP.INK);
        p.rect(0, 9, 10, 1, AP.IRON);
    },
    // a tree: the wilds, where things are gathered
    wilds: (p) => {
        p.oval(5, 4, 4.5, 4, AP.GRASS, AP.LEAF);
        p.set(3, 2, AP.LIME);
        p.rect(4, 7, 2, 3, AP.UMBER); p.set(5, 8, AP.BARK);
    },
    // a pin on the map: everywhere else
    other: (p) => {
        p.oval(5, 3.5, 3.5, 3.5, AP.RED, AP.MAROON);
        p.rect(3, 6, 4, 1, AP.MAROON); p.rect(4, 7, 2, 2, AP.MAROON);
        p.rect(4, 3, 2, 1, AP.CREAM);
    },

    //#endregion

    //#region materials

    // a lump of rock, flecked with copper and gold
    ore: (p) => {
        p.oval(5, 6, 4.5, 3.5, AP.STEEL, AP.IRON);
        dots(p, AP.EMBER, [[3, 5], [6, 7]]);
        dots(p, AP.STRAW, [[6, 4], [7, 6], [2, 7]]);
    },
    // a cut gem
    stone: (p) => {
        p.rect(3, 2, 4, 1, AP.FOAM);
        p.rect(2, 3, 6, 1, AP.ICE);
        p.rect(1, 4, 8, 1, AP.SKY);
        p.rect(2, 5, 6, 1, AP.SKY); p.rect(3, 6, 4, 1, AP.COBALT); p.rect(4, 7, 2, 1, AP.COBALT);
        p.set(3, 3, AP.WHITE);
    },
    // a log, its end to the right
    wood: (p) => {
        p.rect(0, 3, 8, 4, AP.CLAY); p.rect(0, 3, 8, 1, AP.TAN); p.rect(0, 6, 8, 1, AP.UMBER);
        p.oval(8, 5, 1.5, 2, AP.SAND);
        p.set(8, 5, AP.CLAY);
    },
    // a fang
    beast: (p) => {
        p.rect(2, 1, 5, 2, AP.MIST);
        p.rect(3, 3, 4, 2, AP.MIST); p.column(6, 1, AP.ASH, 5);
        p.rect(4, 5, 3, 2, AP.CREAM); p.set(6, 6, AP.SAND);
        p.rect(5, 7, 2, 1, AP.SAND); p.set(6, 8, AP.SAND);
        p.rect(2, 1, 5, 1, AP.WHITE);
    },
    // a sprig, a leaf either side
    plant: (p) => {
        p.column(5, 3, AP.FOREST);
        p.oval(3, 4.5, 2.5, 1.5, AP.GRASS, AP.LEAF);
        p.oval(7.5, 3, 2.5, 1.5, AP.GRASS, AP.LEAF);
        p.rect(5, 0, 1, 3, AP.LIME);
    },
    // an orb, something swirling in it
    arcane: (p) => {
        p.oval(5, 5, 4.5, 4.5, AP.VIOLET, AP.GRAPE);
        dots(p, AP.ORCHID, [[4, 4], [5, 4], [6, 5], [5, 6], [4, 6]]);
        p.set(3, 2, AP.PINK);
    },

    //#endregion

    //#region things made

    // a bar, cast
    material: (p) => {
        p.rect(3, 3, 5, 1, AP.STRAW);
        p.rect(2, 4, 7, 3, AP.AMBER); p.rect(2, 6, 7, 1, AP.OCHRE);
        p.rect(1, 7, 9, 1, AP.OCHRE);
    },
    // a sword, point up and to the right
    sword: (p) => {
        dots(p, AP.MIST, [[3, 6], [4, 5], [5, 4], [6, 3], [7, 2], [8, 1], [9, 0]]);
        dots(p, AP.STONE, [[4, 6], [5, 5], [6, 4], [7, 3], [8, 2]]);
        dots(p, AP.AMBER, [[1, 5], [2, 6], [3, 7], [4, 8]]);
        dots(p, AP.UMBER, [[2, 7], [1, 8]]);
        p.set(0, 9, AP.STRAW);
    },
    weapon: (p) => DRAW.sword(p),
    // a red toolbox, a handle on top
    tool: (p) => {
        p.rect(3, 2, 4, 1, AP.STONE); p.set(3, 3, AP.STONE); p.set(6, 3, AP.STONE);
        p.rect(1, 4, 8, 5, AP.RED); p.rect(1, 4, 8, 1, AP.FLAME); p.rect(1, 8, 8, 1, AP.MAROON);
        p.rect(4, 5, 2, 1, AP.STRAW);
    },
    // (as the Gather and Craft tabs)
    gathertools: (p) => DRAW.gather(p),
    crafttools: (p) => DRAW.craft(p),
    // a pickaxe, its head across the top
    pickaxe: (p) => {
        p.column(5, 2, AP.CLAY); p.set(5, 9, AP.UMBER);
        p.rect(2, 2, 6, 1, AP.ASH); p.rect(4, 1, 2, 1, AP.STONE);
        dots(p, AP.ASH, [[1, 3], [8, 3]]);
        dots(p, AP.STONE, [[0, 4], [9, 4]]);
    },
    // a hatchet, its head on the right
    hatchet: (p) => {
        dots(p, AP.CLAY, [[2, 9], [3, 8], [3, 7], [4, 6], [4, 5], [5, 4], [5, 3]]);
        p.rect(5, 1, 2, 2, AP.STONE); p.rect(7, 0, 2, 4, AP.ASH); p.column(9, 0, AP.MIST, 4);
    },
    // a sickle, its blade curving round
    sickle: (p) => {
        p.oval(5.5, 4.5, 4, 4, AP.MIST, AP.ASH);
        p.oval(4.5, 5.5, 3.5, 3.5, -1);
        dots(p, AP.CLAY, [[2, 8], [1, 9]]); p.set(3, 7, AP.UMBER);
    },
    // a fishing rod, its line hanging from the tip
    rod: (p) => {
        dots(p, AP.CLAY, [[1, 9], [2, 8], [4, 6], [5, 5], [6, 4], [7, 3], [8, 2], [9, 1]]);
        p.rect(2, 6, 2, 2, AP.STEEL);
        p.column(9, 2, AP.MIST, 7); p.set(9, 7, AP.RED);
    },
    // a knife, its blade to the right
    knife: (p) => {
        p.rect(0, 4, 4, 2, AP.UMBER); p.rect(0, 4, 4, 1, AP.CLAY);
        p.column(4, 3, AP.STONE, 7);
        p.rect(5, 4, 4, 1, AP.MIST); p.rect(5, 5, 3, 1, AP.ASH); p.set(9, 4, AP.ASH);
    },
    // a smith's hammer, leaning
    hammer: (p) => {
        dots(p, AP.CLAY, [[2, 9], [3, 8], [4, 7], [5, 6], [6, 5], [6, 4]]);
        p.rect(4, 1, 5, 3, AP.STEEL); p.rect(4, 1, 5, 1, AP.ASH); p.column(9, 1, AP.STONE, 4);
    },
    // a saw, its teeth along the bottom
    saw: (p) => {
        p.rect(0, 2, 3, 5, AP.CLAY); p.set(1, 4, -1); p.column(2, 2, AP.UMBER, 7);
        p.rect(3, 3, 7, 3, AP.ASH); p.rect(3, 3, 7, 1, AP.MIST);
        dots(p, AP.STONE, [[3, 6], [5, 6], [7, 6], [9, 6]]);
    },
    // a stone bowl, the pestle in it
    mortar: (p) => {
        dots(p, AP.CREAM, [[7, 0], [6, 1], [6, 2], [5, 3], [5, 4]]);
        p.oval(5, 7, 4.5, 2.5, AP.STONE, AP.STEEL);
        p.rect(2, 5, 6, 1, AP.IRON);
    },
    // a pan, its handle to the right
    pan: (p) => {
        p.oval(4, 6, 3.5, 3, AP.STEEL, AP.IRON);
        p.oval(4, 5.5, 2.5, 2, AP.INK);
        p.rect(7, 5, 3, 1, AP.UMBER);
    },
    // a needle, red thread through its eye
    needle: (p) => {
        dots(p, AP.MIST, [[1, 9], [2, 8], [3, 7], [4, 6], [5, 5], [6, 4], [7, 3]]);
        dots(p, AP.ASH, [[8, 1], [7, 2], [9, 2], [8, 3]]);
        dots(p, AP.RED, [[9, 3], [9, 4], [8, 5], [7, 6], [7, 7]]);
    },
    // a jeweller's glass, gold rimmed
    loupe: (p) => {
        p.oval(4, 4, 3.5, 3.5, AP.AMBER, AP.OCHRE);
        p.oval(4, 4, 2.5, 2.5, AP.ICE, AP.SKY);
        p.set(3, 3, AP.WHITE);
        dots(p, AP.UMBER, [[7, 7], [8, 8], [9, 9]]);
    },
    // an axe, its head on the left
    axe: (p) => {
        p.column(6, 1, AP.CLAY); p.column(7, 2, AP.UMBER);
        p.rect(2, 1, 4, 4, AP.ASH); p.rect(2, 4, 4, 1, AP.STONE);
        p.rect(1, 0, 1, 6, AP.MIST); p.set(6, 0, AP.CLAY);
    },
    // a spiked mace
    mace: (p) => {
        dots(p, AP.UMBER, [[1, 9], [2, 8], [3, 7], [4, 6]]);
        p.oval(6.5, 3.5, 3, 3, AP.STONE, AP.IRON);
        dots(p, AP.ASH, [[6, 0], [9, 3], [3, 3], [5, 2]]);
    },
    // a spear, its point up and to the right
    spear: (p) => {
        dots(p, AP.CLAY, [[0, 9], [1, 8], [2, 7], [3, 6], [4, 5], [5, 4]]);
        dots(p, AP.MIST, [[6, 3], [7, 2], [8, 1], [9, 0]]);
        dots(p, AP.STONE, [[6, 2], [7, 3]]);
        dots(p, AP.ASH, [[7, 1], [8, 2]]);
    },
    // a short blade
    dagger: (p) => {
        dots(p, AP.MIST, [[4, 5], [5, 4], [6, 3], [7, 2]]);
        dots(p, AP.STONE, [[5, 5], [6, 4], [7, 3]]);
        dots(p, AP.AMBER, [[2, 4], [3, 5], [4, 6], [5, 7]]);
        dots(p, AP.UMBER, [[3, 6], [2, 7], [1, 8]]);
    },
    // a bow, strung
    bow: (p) => {
        p.column(7, 0, AP.MIST);
        dots(p, AP.CLAY, [[6, 0], [5, 1], [4, 2], [3, 3], [3, 6], [4, 7], [5, 8], [6, 9]]);
        p.rect(2, 4, 2, 2, AP.UMBER);
    },
    // a staff, an orb at its head
    staff: (p) => {
        dots(p, AP.CLAY, [[1, 9], [2, 8], [3, 7], [4, 6], [5, 5]]);
        dots(p, AP.UMBER, [[2, 9], [3, 8], [6, 4]]);
        p.oval(7.5, 2.5, 2.5, 2.5, AP.ICE, AP.SKY);
        p.set(7, 1, AP.WHITE);
    },
    // a heater shield, a gold band down it
    shield: (p) => {
        p.rect(1, 1, 8, 5, AP.COBALT); p.rect(1, 1, 8, 1, AP.SKY);
        p.rect(2, 6, 6, 1, AP.COBALT); p.rect(3, 7, 4, 1, AP.DENIM); p.rect(4, 8, 2, 1, AP.DENIM);
        p.rect(4, 1, 2, 8, AP.AMBER);
    },
    // a helm, open faced
    helm: (p) => {
        p.oval(5, 5.5, 4.5, 4.5, AP.ASH, AP.STONE);
        p.rect(3, 6, 4, 4, -1);
        p.rect(3, 5, 4, 1, AP.STEEL);
        p.set(3, 2, AP.MIST);
    },
    // a breastplate
    body: (p) => {
        p.rect(1, 1, 3, 3, AP.STONE); p.rect(6, 1, 3, 3, AP.STONE);
        p.rect(2, 3, 6, 6, AP.ASH); p.rect(4, 2, 2, 1, AP.ASH);
        p.column(7, 3, AP.STONE, 9);
        p.rect(2, 6, 6, 1, AP.STEEL);
    },
    // a glove
    gloves: (p) => {
        p.rect(2, 1, 5, 5, AP.TAN);
        p.column(3, 1, AP.CLAY, 3); p.column(5, 1, AP.CLAY, 3);
        p.rect(7, 3, 2, 2, AP.TAN); p.set(8, 4, AP.CLAY);
        p.rect(1, 6, 7, 3, AP.CLAY); p.rect(1, 6, 7, 1, AP.UMBER);
    },
    // a boot
    feet: (p) => {
        p.rect(2, 1, 4, 6, AP.CLAY); p.column(5, 1, AP.UMBER, 7);
        p.rect(2, 6, 7, 3, AP.CLAY); p.set(8, 6, -1);
        p.rect(2, 1, 4, 1, AP.TAN);
        p.rect(2, 9, 7, 1, AP.BARK);
    },
    // a red stone on a chain
    amulet: (p) => {
        dots(p, AP.AMBER, [[1, 0], [2, 1], [3, 2], [4, 3], [8, 0], [7, 1], [6, 2], [5, 3]]);
        p.oval(5, 6.5, 3, 3, AP.AMBER, AP.OCHRE);
        p.oval(5, 6.5, 2, 2, AP.RED, AP.MAROON);
    },
    // a gold ring, a stone set in it
    ring: (p) => {
        p.oval(5, 6, 4, 3.5, AP.AMBER, AP.OCHRE);
        p.oval(5, 6, 2.5, 2, -1);
        p.oval(5, 2, 1.5, 1.5, AP.ICE, AP.COBALT);
    },
    // a flask, red inside
    potion: (p) => {
        p.rect(4, 1, 2, 3, AP.MIST); p.rect(4, 0, 2, 1, AP.CLAY);
        p.oval(5, 6.5, 4, 3.5, AP.MIST, AP.ASH);
        p.oval(5, 7, 3, 2.5, AP.RED, AP.MAROON);
        p.set(3, 5, AP.WHITE);
    },
    // a fish, facing left
    fish: (p) => {
        p.oval(4, 5, 3.5, 2.5, AP.SKY, AP.COBALT);
        p.rect(1, 4, 5, 1, AP.ICE);
        p.rect(8, 3, 1, 5, AP.COBALT); p.rect(9, 2, 1, 7, AP.COBALT);
        p.set(2, 4, AP.BLACK);
    },
    // a loaf on a plate: a meal
    food: (p) => {
        p.oval(5, 7.5, 4.5, 1.5, AP.WHITE, AP.MIST);
        p.oval(5, 5, 3.5, 2.5, AP.OCHRE, AP.RUST);
        p.rect(3, 3, 4, 1, AP.AMBER);
        p.set(4, 4, AP.STRAW); p.set(6, 4, AP.STRAW);
    },

    //#endregion

    //#region choosing

    // four little boxes: everything
    all: (p) => {
        for (const [x, y] of [[1, 1], [6, 1], [1, 6], [6, 6]]) { p.rect(x, y, 3, 3, AP.STONE); p.set(x, y, AP.ASH); }
    },
    // an arrow pointing left: up a level
    back: (p) => {
        p.rect(2, 4, 1, 2, AP.MIST); p.rect(3, 3, 1, 4, AP.MIST); p.rect(4, 2, 1, 6, AP.MIST);
        p.rect(5, 4, 4, 2, AP.MIST);
    },

    //#endregion

    // a compass, its needle pointing north (16 x 16)
    adventure: (p) => {
        p.oval(8, 8, 7, 7, AP.AMBER, AP.OCHRE);
        p.oval(8, 8, 5.5, 5.5, AP.CREAM, AP.SAND);
        p.rect(7, 4, 2, 4, AP.RED); p.rect(7, 8, 2, 4, AP.IRON);
        p.rect(7, 3, 1, 1, AP.RED); p.set(8, 12, AP.IRON);
        p.rect(7, 7, 2, 2, AP.INK);
    },
};
