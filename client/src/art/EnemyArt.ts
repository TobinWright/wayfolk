import * as PIXI from "pixi.js";
import { AP } from "../constants/Palette";
import { picTexture } from "../people/People";
import { Pic } from "./Backdrops";

// The enemies heroes fight (shared/Fights.ts ENEMIES), as they show up in a
// hero window: drawn in code in Apollo colours as the backdrops are, each
// ENEMY_PX square with its feet on the bottom row (fliers above it), facing
// left, towards the heroes. A shape for each sort of creature, in the
// colours of each kind (a Frost Wolf is a wolf in ice blues; the night's
// beasts in theirs: a Vampire Bat a bat in plums).

export const ENEMY_PX = 24;
const G = ENEMY_PX - 1;         // the ground row

// a colour ramp: light, mid, dark, and an eye
interface Hue { l: number; m: number; d: number; e: number; }

type Shape = (p: Pic, c: Hue) => void;

function line(p: Pic, x0: number, y0: number, x1: number, y1: number, c: number) {
    const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
    for (let i = 0; i <= n; i++) p.set(x0 + (x1 - x0) * i / n, y0 + (y1 - y0) * i / n, c);
}

const slime: Shape = (p, c) => {
    p.oval(12, G - 4, 8, 5, c.m, c.d);
    p.oval(12, G - 7, 5, 3, c.m, c.m);
    p.rect(5, G, 15, 1, c.d);
    p.set(8, G - 9, c.l); p.set(9, G - 9, c.l); p.set(8, G - 8, c.l);
    p.set(8, G - 5, c.e); p.set(12, G - 5, c.e);
};

const bat: Shape = (p, c) => {
    const y = 9;
    // the wings, spread, their ribs
    for (let i = 0; i < 9; i++) {
        const top = y - 4 + Math.abs(i - 4) / 2, low = y + 2 - (i % 3 == 0 ? 0 : 1);
        for (let yy = top; yy <= low; yy++) { p.set(3 + i, yy, c.d); p.set(20 - i, yy, c.d); }
    }
    p.oval(12, y, 3, 3.5, c.m, c.d);
    p.set(10, y - 4, c.m); p.set(13, y - 4, c.m);         // ears
    p.set(10, y - 1, c.e); p.set(12, y - 1, c.e);
    p.set(11, y + 2, AP.WHITE);                           // a fang
};

const spider: Shape = (p, c) => {
    for (let k = 0; k < 4; k++) {
        const x = 9 + k * 2.5;
        line(p, x, G - 5, x - 3 + k, G - 9, c.d); line(p, x - 3 + k, G - 9, x - 5 + k * 1.5, G, c.d);
    }
    p.oval(15, G - 5, 5, 4, c.m, c.d);
    p.oval(8, G - 4, 3, 2.5, c.m, c.d);
    p.set(14, G - 7, c.l); p.set(17, G - 6, c.l);
    p.set(6, G - 5, c.e); p.set(8, G - 5, c.e);
};

// four legs, a head on the left: a wolf (tail up), a bear (big and round), a drake (wings and horns)
function beast(big: boolean, tail: boolean, wings: boolean): Shape {
    return (p, c) => {
        const top = big ? G - 13 : G - 10, hx = big ? 5 : 4;
        if (wings) for (let i = 0; i < 8; i++) line(p, 10 + i, top - 6 + Math.abs(i - 2), 12 + i / 2, top + 1, i % 2 ? c.d : c.m);
        p.oval(13, top + 3.5, big ? 8 : 7, big ? 5 : 3.5, c.m, c.d);
        for (const x of [8, 11, 15, 18]) p.column(x, top + 5, x == 11 || x == 18 ? c.d : c.m, G + 1);
        if (tail) { line(p, 20, top + 2, 22, top - 1, c.m); p.set(22, top - 2, c.l); }
        p.oval(hx + 1, top + 1, big ? 4 : 3, 3, c.m, c.d);
        p.rect(hx - (big ? 3 : 4), top + 2, 3, 2, c.m);                     // the snout
        p.set(hx - (big ? 3 : 4), top + 2, AP.BLACK);
        if (wings) { p.set(hx, top - 3, AP.ASH); p.set(hx + 2, top - 3, AP.ASH); }
        else if (big) { p.set(hx, top - 2, c.m); p.set(hx + 3, top - 2, c.m); }
        else { p.set(hx + 1, top - 3, c.d); p.set(hx + 2, top - 2, c.d); }
        p.set(hx, top, c.e);
        p.set(12, top + 1, c.l); p.set(14, top + 1, c.l);
    };
}

// two legs and arms, a head (goblin ears, a skull, horns), something in hand
function biped(c2: { ears?: boolean, bones?: boolean, horns?: boolean, wings?: boolean, wraps?: boolean, short?: boolean }): Shape {
    return (p, c) => {
        const head = c2.short ? G - 13 : G - 17, hip = c2.short ? G - 4 : G - 6;
        if (c2.wings) for (let i = 0; i < 6; i++) line(p, 13, head + 6, 17 + i / 2, head - 1 + i, c.d);
        // legs and the body
        p.column(10, hip, c.d, G + 1); p.column(13, hip, c.d, G + 1);
        p.rect(9, head + 5, 6, hip - head - 5, c2.bones ? AP.SHADOW : c.m);
        if (c2.bones) for (let y = head + 6; y < hip; y += 2) p.rect(9, y, 6, 1, c.l);
        if (c2.wraps) for (let y = head + 5; y < G; y += 3) p.rect(9, y, 6, 1, c.d);
        // the arm forward, with a club or a blade
        line(p, 9, head + 6, 6, head + 9, c.m);
        line(p, 5, head + 10, 4, head + 4, c2.bones ? AP.ASH : AP.UMBER);
        // the head
        p.oval(11.5, head + 2, 3, 3, c.l, c.m);
        if (c2.ears) { p.set(7, head + 1, c.l); p.set(8, head + 2, c.l); p.set(15, head + 1, c.m); }
        if (c2.horns) { p.set(9, head - 2, AP.SAND); p.set(14, head - 2, AP.SAND); }
        p.set(10, head + 2, c.e); p.set(12, head + 2, c.e);
        if (c2.bones) p.rect(10, head + 4, 3, 1, AP.BLACK);
        if (c2.horns) { line(p, 15, hip, 18, hip + 2, c.d); p.set(19, hip + 1, c.d); }        // a tail
    };
}

const wisp: Shape = (p, c) => {
    const y = 10;
    for (let i = 0; i < 8; i++) p.oval(13 + i, y + i * 0.4, 3.5 - i * 0.4, 3 - i * 0.3, i < 3 ? c.m : c.d, c.d);
    p.oval(10, y, 4, 4, c.l, c.m);
    p.set(8, y - 1, AP.WHITE); p.set(9, y - 2, AP.WHITE);
    p.set(9, y, c.e); p.set(11, y, c.e);
};

const snake: Shape = (p, c) => {
    // coiled on the ground, its neck up and its head out on the left
    p.oval(14, G - 2, 7, 2.5, c.m, c.d);
    p.oval(15, G - 4, 5, 2, c.m, c.d);
    for (let y = G - 4; y > G - 11; y--) { p.set(10 - (G - 4 - y) * 0.3, y, c.m); p.set(11 - (G - 4 - y) * 0.3, y, c.d); }
    p.oval(7, G - 12, 3, 2, c.m, c.d);
    p.set(6, G - 13, c.e);
    p.set(3, G - 11, AP.RED); p.set(2, G - 12, AP.RED);
    for (let x = 10; x < 20; x += 3) p.set(x, G - 2, c.l);
};

const golem: Shape = (p, c) => {
    p.rect(7, G - 4, 4, 5, c.d); p.rect(14, G - 4, 4, 5, c.d);       // legs
    p.rect(5, G - 14, 15, 10, c.m);                                 // body
    p.rect(5, G - 14, 15, 1, c.l); p.rect(19, G - 13, 1, 9, c.d);
    p.rect(2, G - 13, 3, 9, c.m); p.rect(2, G - 5, 4, 3, c.d);      // the arm forward, its fist
    p.rect(8, G - 19, 7, 5, c.m); p.rect(8, G - 19, 7, 1, c.l);     // head
    p.set(9, G - 17, c.e); p.set(12, G - 17, c.e);
    line(p, 11, G - 12, 15, G - 8, c.d); p.set(8, G - 9, c.l);       // cracks
};

const scorpion: Shape = (p, c) => {
    for (let k = 0; k < 3; k++) { line(p, 10 + k * 3, G - 3, 8 + k * 3, G, c.d); line(p, 11 + k * 3, G - 3, 13 + k * 3, G, c.d); }
    p.oval(13, G - 4, 6, 2.5, c.m, c.d);
    // the tail curling up over it, the sting forward
    const tail: [number, number][] = [[19, G - 5], [20, G - 7], [21, G - 9], [21, G - 11], [20, G - 13], [18, G - 14], [16, G - 14]];
    tail.forEach(([x, y], i) => p.oval(x, y, 1.6, 1.6, i % 2 ? c.d : c.m, c.d));
    p.set(15, G - 13, AP.STRAW);
    // the claws out in front
    line(p, 8, G - 4, 4, G - 6, c.m); p.oval(3, G - 7, 2, 1.5, c.m, c.d); p.set(1, G - 8, c.d);
    p.set(8, G - 5, c.e);
};

// hunched and heavy, long arms, a club over its shoulder, a loincloth
const troll: Shape = (p, c) => {
    p.rect(8, G - 5, 3, 6, c.d); p.rect(14, G - 5, 3, 6, c.d);              // legs
    p.rect(7, G - 6, 11, 2, AP.UMBER);                                      // loincloth
    p.oval(13, G - 11, 7, 6, c.m, c.d);                                     // the hunched body
    p.rect(9, G - 15, 8, 1, c.l);
    line(p, 7, G - 12, 4, G - 4, c.m); p.oval(4, G - 3, 2, 1.5, c.m, c.d);  // the long arm forward, its knuckles
    line(p, 19, G - 12, 21, G - 18, AP.BARK); p.oval(21, G - 19, 2, 2, AP.UMBER, AP.BARK);    // the club
    p.oval(8, G - 15, 3.5, 3, c.m, c.d);                                    // the head, low and forward
    p.set(5, G - 15, c.m); p.set(4, G - 14, c.m);                           // the nose
    p.set(7, G - 16, c.e);
    p.set(7, G - 13, AP.WHITE); p.set(9, G - 13, AP.WHITE);                 // tusks
};

const HUES: { [name: string]: Hue } = {
    green: { l: AP.LIME, m: AP.GRASS, d: AP.LEAF, e: AP.PINE },
    dusk: { l: AP.STONE, m: AP.IRON, d: AP.SLATE, e: AP.RED },
    brown: { l: AP.TAN, m: AP.CLAY, d: AP.UMBER, e: AP.BLACK },
    grey: { l: AP.ASH, m: AP.STONE, d: AP.STEEL, e: AP.STRAW },
    dark: { l: AP.UMBER, m: AP.BARK, d: AP.SOOT, e: AP.BLACK },
    goblin: { l: AP.LIME, m: AP.LEAF, d: AP.BARK, e: AP.RED },
    bone: { l: AP.MIST, m: AP.ASH, d: AP.STONE, e: AP.BLACK },
    spirit: { l: AP.FOAM, m: AP.ICE, d: AP.SKY, e: AP.NAVY },
    venom: { l: AP.PALE, m: AP.LIME, d: AP.FOREST, e: AP.BLACK },
    stone: { l: AP.SAND, m: AP.TAN, d: AP.UMBER, e: AP.AMBER },
    fire: { l: AP.EMBER, m: AP.FLAME, d: AP.MAROON, e: AP.STRAW },
    frost: { l: AP.WHITE, m: AP.FOAM, d: AP.ICE, e: AP.COBALT },
    sand: { l: AP.STRAW, m: AP.OCHRE, d: AP.RUST, e: AP.BLACK },
    magma: { l: AP.STRAW, m: AP.AMBER, d: AP.RED, e: AP.SOOT },
    wraps: { l: AP.CREAM, m: AP.SAND, d: AP.TAN, e: AP.AMBER },
    drake: { l: AP.FLAME, m: AP.RED, d: AP.MAROON, e: AP.STRAW },
    ice: { l: AP.WHITE, m: AP.MIST, d: AP.ICE, e: AP.COBALT },
    // the night's: pale, bruised and shadowed
    ghost: { l: AP.WHITE, m: AP.MIST, d: AP.ASH, e: AP.VIOLET },
    vampire: { l: AP.PLUM, m: AP.GRAPE, d: AP.MIDNIGHT, e: AP.RED },
    werewolf: { l: AP.STONE, m: AP.IRON, d: AP.SHADOW, e: AP.STRAW },
    wraith: { l: AP.VIOLET, m: AP.GRAPE, d: AP.MIDNIGHT, e: AP.LIME },
    moth: { l: AP.CREAM, m: AP.PINK, d: AP.ORCHID, e: AP.MIDNIGHT },
    shade: { l: AP.IRON, m: AP.SLATE, d: AP.INK, e: AP.EMBER },
    frostwraith: { l: AP.FOAM, m: AP.ICE, d: AP.COBALT, e: AP.WHITE },
    troll: { l: AP.LIME, m: AP.GRASS, d: AP.FOREST, e: AP.STRAW },
};

// by enemy id (ENEMIES), its shape and colours
const LOOKS: [Shape, Hue][] = [
    [slime, HUES.green],                                    // Slime
    [bat, HUES.dusk],                                       // Bat
    [spider, HUES.dark],                                    // Spider
    [beast(false, true, false), HUES.grey],                 // Wolf
    [beast(true, false, false), HUES.brown],                // Bear
    [biped({ ears: true, short: true }), HUES.goblin],      // Goblin
    [biped({ bones: true }), HUES.bone],                    // Skeleton
    [wisp, HUES.spirit],                                    // Wisp
    [snake, HUES.venom],                                    // Snake
    [golem, HUES.stone],                                    // Golem
    [biped({ horns: true, wings: true, short: true }), HUES.fire],      // Imp
    [beast(false, true, false), HUES.frost],                // Frost Wolf
    [scorpion, HUES.sand],                                  // Scorpion
    [slime, HUES.magma],                                    // Magma Slime
    [biped({ wraps: true }), HUES.wraps],                   // Mummy
    [beast(false, true, true), HUES.drake],                 // Drake
    [wisp, HUES.ice],                                       // Ice Wisp
    // out at night
    [wisp, HUES.ghost],                                     // Ghost
    [bat, HUES.vampire],                                    // Vampire Bat
    [beast(true, true, false), HUES.werewolf],              // Werewolf
    [biped({ bones: true, wings: true }), HUES.wraith],     // Wraith
    [bat, HUES.moth],                                       // Moon Moth
    [wisp, HUES.shade],                                     // Shade
    [biped({ bones: true, wings: true }), HUES.frostwraith],   // Frost Wraith
    [troll, HUES.troll],                                    // Troll (a roaming beast)
];

const textures = new Map<number, PIXI.Texture>();

export function enemyTexture(id: number) {
    let t = textures.get(id);
    if (!t) {
        const [shape, hue] = LOOKS[id] ?? LOOKS[0], pic = new Pic(ENEMY_PX, ENEMY_PX);
        shape(pic, hue);
        textures.set(id, t = picTexture(pic));
    }
    return t;
}
