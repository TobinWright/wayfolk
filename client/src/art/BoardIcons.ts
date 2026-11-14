import * as PIXI from "pixi.js";
import { Skill } from "../../../shared/Heroes";
import { AP } from "../constants/Palette";
import { picTexture } from "../people/People";
import { Pic } from "./Backdrops";
import { TASK_ICON, taskIcon } from "./TaskIcons";

// The leaderboards' small icons (components/leaderboards), 10 x 10 like the
// to-do list's, drawn in code in Apollo colours: a tab each (heroes, skills,
// wealth, events, blackjack), and one for each skill - the to-do list's tool
// for it, and a spyglass for scouting.

const textures = new Map<string, PIXI.Texture>();
function drawn(name: string, draw: (p: Pic) => void) {
    let t = textures.get(name);
    if (!t) {
        const p = new Pic(TASK_ICON, TASK_ICON);
        draw(p);
        textures.set(name, t = picTexture(p));
    }
    return t;
}

// a knight's helm, its visor slit, a red plume
export function heroesIcon() {
    return drawn("heroes", (p) => {
        p.rect(4, 0, 3, 2, AP.RED); p.set(4, 0, AP.FLAME);
        p.oval(5, 5.5, 3.5, 3.5, AP.ASH, AP.STONE);
        p.rect(2, 6, 7, 3, AP.STONE); p.rect(2, 8, 7, 1, AP.STEEL);
        p.rect(3, 5, 5, 1, AP.BLACK);
        p.set(3, 3, AP.WHITE);
    });
}

// an open book, its pages lit, a ribbon down the middle
export function skillsIcon() {
    return drawn("skills", (p) => {
        p.rect(0, 2, 10, 7, AP.UMBER);
        p.rect(1, 2, 4, 6, AP.CREAM); p.rect(5, 2, 4, 6, AP.SAND);
        for (const y of [3, 5]) { p.rect(2, y, 2, 1, AP.TAN); p.rect(6, y, 2, 1, AP.CLAY); }
        p.rect(5, 1, 1, 9, AP.RED); p.set(5, 9, AP.MAROON);
    });
}

// a stack of gold coins, a loose one leaning on it
export function wealthIcon() {
    return drawn("wealth", (p) => {
        for (let k = 0; k < 4; k++) {
            const y = 7 - k * 2;
            p.rect(1, y, 5, 1, AP.STRAW); p.rect(1, y + 1, 5, 1, AP.OCHRE);
            p.set(5, y, AP.AMBER);
        }
        p.oval(7.5, 7, 2.5, 2.5, AP.AMBER, AP.OCHRE);
        p.set(7, 6, AP.STRAW); p.rect(7, 7, 1, 2, AP.OCHRE);
    });
}

// two cards fanned, a heart on the front one
export function cardsIcon() {
    return drawn("blackjack", (p) => {
        p.rect(0, 1, 6, 8, AP.BLACK); p.rect(1, 2, 4, 6, AP.MIST);
        p.rect(4, 1, 6, 9, AP.BLACK); p.rect(5, 2, 4, 7, AP.WHITE);
        p.set(6, 4, AP.RED); p.set(8, 4, AP.RED); p.rect(6, 5, 3, 1, AP.RED); p.set(7, 6, AP.RED);
        p.set(2, 3, AP.INK);
    });
}

// a dynamic event's: a gold starburst, a red "!" on it
export function eventIcon() {
    return drawn("event", (p) => {
        p.rect(2, 2, 6, 6, AP.AMBER);
        p.rect(4, 0, 2, 10, AP.STRAW); p.rect(0, 4, 10, 2, AP.STRAW);
        p.rect(6, 6, 2, 2, AP.OCHRE); p.rect(4, 8, 2, 2, AP.OCHRE); p.rect(8, 4, 2, 2, AP.OCHRE);
        p.set(5, 9, AP.RUST); p.set(9, 5, AP.RUST);
        p.rect(4, 1, 2, 5, AP.RED); p.set(4, 1, AP.FLAME);
        p.rect(4, 7, 2, 2, AP.RED);
    });
}

// a brass spyglass, drawn out, lens to the top right
function spyglassIcon() {
    return drawn("spyglass", (p) => {
        const dots = (c: number, pts: number[][]) => pts.forEach(([x, y]) => p.set(x, y, c));
        dots(AP.UMBER, [[0, 9], [1, 8], [1, 9], [2, 8], [2, 7]]);
        dots(AP.OCHRE, [[3, 7], [3, 6], [4, 6], [4, 5], [5, 5]]);
        dots(AP.AMBER, [[5, 4], [6, 4], [6, 3], [7, 3], [7, 2]]);
        dots(AP.STRAW, [[8, 2], [8, 1], [9, 1], [7, 1], [9, 2]]);
        dots(AP.ICE, [[9, 0]]);
    });
}

// a skill's: the tool it's done with
export function skillIcon(skill: Skill) {
    switch (skill) {
        case Skill.MINING: return taskIcon("pickaxe");
        case Skill.WOODCUTTING: return taskIcon("hatchet");
        case Skill.FORAGING: return taskIcon("sickle");
        case Skill.FISHING: return taskIcon("rod");
        case Skill.HUNTING: return taskIcon("bow");
        case Skill.SMITHING: return taskIcon("hammer");
        case Skill.WOODWORKING: return taskIcon("saw");
        case Skill.ALCHEMY: return taskIcon("potion");
        case Skill.COOKING: return taskIcon("pan");
        case Skill.TAILORING: return taskIcon("needle");
        case Skill.FIGHTING: return taskIcon("sword");
        case Skill.SCOUTING: return spyglassIcon();
        case Skill.JEWELCRAFTING: return taskIcon("ring");
    }
    return taskIcon("other");
}

// the season's board: a round of four quarters, spring green, summer gold, autumn orange, winter white
export function seasonIcon() {
    return drawn("season", (p) => {
        p.oval(5, 5, 5, 5, AP.BLACK);
        const quarters: [number, number, number][] = [[0, 0, AP.LIME], [5, 0, AP.STRAW], [5, 5, AP.EMBER], [0, 5, AP.WHITE]];
        for (const [qx, qy, c] of quarters)
            for (let y = qy; y < qy + 5; y++) for (let x = qx; x < qx + 5; x++) {
                const dx = x + 0.5 - 5, dy = y + 0.5 - 5;
                if (dx * dx + dy * dy <= 16) p.set(x, y, c);
            }
        p.rect(5, 1, 1, 8, AP.BLACK); p.rect(1, 5, 8, 1, AP.BLACK);
    });
}
