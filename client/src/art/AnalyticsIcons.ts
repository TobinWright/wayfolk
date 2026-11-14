import * as PIXI from "pixi.js";
import { AP } from "../constants/Palette";
import { picTexture } from "../people/People";
import { Pic } from "./Backdrops";
import { TASK_ICON } from "./TaskIcons";

// The admin's Analytics tabs' small icons (components/analytics), 10 x 10
// like the leaderboards', drawn in code in Apollo colours. Heroes and
// Economy use the leaderboards' helm and coins (art/BoardIcons).

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

// Overview: three bars rising on a baseline, lit down their left
export function overviewIcon() {
    return drawn("overview", (p) => {
        p.rect(0, 9, 10, 1, AP.STONE);
        for (const [x, top] of [[1, 6], [4, 3], [7, 0]]) {
            p.rect(x, top, 2, 9 - top, AP.COBALT);
            p.rect(x, top, 1, 9 - top, AP.SKY);
        }
    });
}

// Players: two heads and shoulders, one behind the other
export function playersIcon() {
    return drawn("players", (p) => {
        p.oval(7.5, 2.5, 1.5, 1.5, AP.SAND, AP.TAN);
        p.oval(7.5, 9, 2.5, 3.5, AP.LEAF, AP.FOREST);
        p.oval(3, 3, 2, 2, AP.CREAM, AP.SAND);
        p.oval(3, 10, 3, 4, AP.SKY, AP.COBALT);
    });
}

// Social: a speech bubble, its tail at the bottom left, three dots in it
export function socialIcon() {
    return drawn("social", (p) => {
        p.rect(1, 1, 8, 6, AP.WHITE);
        p.rect(0, 2, 10, 4, AP.WHITE);
        p.rect(1, 6, 8, 1, AP.MIST); p.rect(9, 2, 1, 4, AP.MIST);
        p.rect(2, 7, 2, 1, AP.MIST); p.set(2, 8, AP.MIST);
        for (const x of [2, 4, 6]) p.rect(x, 3, 1, 2, AP.STEEL);
    });
}

// Feedback (the admin panel's tab): a page with lines on it, a pencil at its corner
export function feedbackIcon() {
    return drawn("feedback", (p) => {
        p.rect(0, 0, 7, 10, AP.CREAM);
        p.rect(6, 0, 1, 10, AP.SAND); p.rect(0, 9, 7, 1, AP.SAND);
        for (const y of [2, 4, 6]) p.rect(1, y, 4, 1, AP.STONE);
        for (let k = 0; k < 5; k++) { p.set(9 - k, 3 + k, AP.AMBER); p.set(8 - k, 3 + k, AP.STRAW); }
        p.set(9, 2, AP.PINK); p.set(4, 8, AP.SLATE);
    });
}

// Play time: an hourglass, its sand half run through
export function timeIcon() {
    return drawn("time", (p) => {
        p.rect(1, 0, 8, 1, AP.UMBER); p.rect(1, 9, 8, 1, AP.UMBER);
        p.rect(2, 1, 6, 2, AP.MIST); p.rect(3, 3, 4, 1, AP.MIST); p.rect(4, 4, 2, 2, AP.MIST);
        p.rect(3, 6, 4, 1, AP.MIST); p.rect(2, 7, 6, 2, AP.MIST);
        p.rect(3, 2, 4, 1, AP.SAND); p.rect(4, 3, 2, 1, AP.SAND); p.set(4, 5, AP.SAND);
        p.rect(4, 7, 2, 1, AP.SAND); p.rect(3, 8, 4, 1, AP.SAND);
    });
}

// Retention: a calendar page, the weeks ticked off in blue
export function retentionIcon() {
    return drawn("retention", (p) => {
        p.rect(0, 1, 10, 9, AP.WHITE);
        p.rect(0, 1, 10, 2, AP.RED);
        p.set(2, 0, AP.STONE); p.set(7, 0, AP.STONE);
        p.rect(0, 9, 10, 1, AP.MIST);
        for (const [x, y, on] of [[1, 4, 1], [4, 4, 1], [7, 4, 1], [1, 7, 1], [4, 7, 0], [7, 7, 0]])
            p.rect(x, y, 2, 2, on ? AP.COBALT : AP.MIST);
    });
}

// Features: a pointer, clicking
export function featuresIcon() {
    return drawn("features", (p) => {
        for (let y = 0; y < 7; y++) p.rect(1, y, Math.min(y + 1, 6), 1, AP.WHITE);
        p.rect(1, 6, 2, 1, AP.WHITE); p.rect(3, 7, 2, 1, AP.WHITE); p.rect(4, 8, 2, 1, AP.WHITE);
        p.rect(0, 0, 1, 8, AP.STEEL);
        p.set(7, 1, AP.STRAW); p.set(8, 3, AP.STRAW); p.set(6, 0, AP.STRAW);
    });
}

// Churn: an open door, a red arrow leaving through it
export function churnIcon() {
    return drawn("churn", (p) => {
        p.rect(0, 0, 6, 10, AP.UMBER);
        p.rect(1, 1, 4, 9, AP.INK);
        p.rect(1, 1, 2, 9, AP.TAN);
        p.set(2, 5, AP.STRAW);
        p.rect(4, 4, 4, 2, AP.RED);
        p.rect(7, 3, 1, 4, AP.RED); p.rect(8, 4, 1, 2, AP.RED); p.set(9, 4, AP.FLAME);
    });
}

// (the admin panel's tabs, components/adminpanel: Players uses the one above)

// Reports: a red flag on a pole
export function reportsIcon() {
    return drawn("reports", (p) => {
        p.rect(1, 0, 1, 10, AP.STONE);
        p.rect(2, 1, 7, 5, AP.RED);
        p.rect(2, 5, 7, 1, AP.MAROON);
        p.rect(6, 2, 3, 1, AP.FLAME);
        p.set(8, 1, -1); p.set(8, 5, -1); p.set(7, 3, AP.MAROON);
    });
}

// Server: a bell, rung for everyone (announcements, events)
export function serverIcon() {
    return drawn("server", (p) => {
        p.set(4, 0, AP.OCHRE); p.set(5, 0, AP.OCHRE);
        p.rect(3, 1, 4, 2, AP.AMBER);
        p.rect(2, 3, 6, 4, AP.AMBER);
        p.rect(1, 7, 8, 1, AP.AMBER);
        p.rect(3, 1, 1, 6, AP.STRAW);
        p.rect(7, 3, 1, 4, AP.OCHRE);
        p.rect(1, 8, 8, 1, AP.OCHRE);
        p.rect(4, 9, 2, 1, AP.UMBER);
    });
}
