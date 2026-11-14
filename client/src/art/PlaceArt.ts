import { AP } from "../constants/Palette";

// The places on the world map: a 32x32 sprite each (castles, towns, caves,
// ruins...), drawn in code in Apollo colours over the map's tiles, standing
// on the bottom of their tile and reaching up over the one above. Every place
// has a sprite of its own (the user, 2026-10-27): a kind's own, or for the
// second or third of a kind one of PLACE_VARIANTS, drawn for where it stands.
// tools/render-world.js writes them out in a row as places.png, in
// PLACE_PICS order (world.json's places name theirs by that index, `s`, and
// their kind by its index in PLACE_KINDS, `k`).

export const PLACE_SIZE = 32;
// the kinds and the sprites' names are shared/Places.ts's (the server
// needs them too: the map editor writes places into world-layout.ts)
import { PLACE_KINDS, PLACE_PICS, PLACE_VARIANTS } from "../../../shared/Places";
export { PLACE_KINDS, PLACE_PICS, PLACE_VARIANTS };
import type { PlaceKind, PlacePic } from "../../../shared/Places";
export type { PlaceKind, PlacePic };

const S = PLACE_SIZE;
const OUTLINE = AP.INK;

// a picture to draw on; its outline is added last, round everything drawn
class Art {
    readonly p: number[] = new Array(S * S).fill(-1);
    set(x: number, y: number, c: number) {
        x = Math.round(x); y = Math.round(y);
        if (x >= 0 && y >= 0 && x < S && y < S) this.p[y * S + x] = c;
    }
    get(x: number, y: number) { return x >= 0 && y >= 0 && x < S && y < S ? this.p[y * S + x] : -1; }
    rect(x: number, y: number, w: number, h: number, c: number) {
        for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) this.set(i, j, c);
    }
    // a filled ellipse, lit on its top left when given two colours
    oval(cx: number, cy: number, rx: number, ry: number, c: number, shade = c) {
        for (let y = Math.floor(cy - ry); y <= cy + ry; y++) for (let x = Math.floor(cx - rx); x <= cx + rx; x++) {
            const dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry;
            if (dx * dx + dy * dy <= 1) this.set(x, y, dx + dy * 0.5 > 0.25 ? shade : c);
        }
    }
    // a triangle pointing up: its tip at (cx, top), `half` wide each way at `bottom`
    peak(cx: number, top: number, bottom: number, half: number, light: number, dark: number) {
        for (let y = top; y <= bottom; y++) {
            const w = ((y - top + 1) / (bottom - top + 1)) * half;
            for (let x = Math.floor(cx - w); x <= Math.ceil(cx + w) - 1; x++) this.set(x, y, x + 0.5 < cx ? light : dark);
        }
    }
    outline() {
        const filled = this.p.slice();
        for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
            if (filled[y * S + x] >= 0) continue;
            const near = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => {
                const nx = x + dx, ny = y + dy;
                return nx >= 0 && ny >= 0 && nx < S && ny < S && filled[ny * S + nx] >= 0 && filled[ny * S + nx] != OUTLINE;
            });
            if (near) this.p[y * S + x] = OUTLINE;
        }
        return this.p;
    }
}

//#region the pieces

// a steady 0..1 for a pixel, so speckles and cracks land the same every build
function noise(x: number, y: number, seed = 0) {
    let n = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(seed, 1442695041)) | 0;
    n = Math.imul(n ^ (n >>> 13), 1274126177);
    return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}

const RED_ROOF = [AP.FLAME, AP.RED, AP.MAROON];
const BROWN_ROOF = [AP.CLAY, AP.UMBER, AP.BARK];
const BLUE_ROOF = [AP.SKY, AP.COBALT, AP.DENIM];
const SLATE_ROOF = [AP.STEEL, AP.IRON, AP.SLATE];
const PURPLE_ROOF = [AP.MAGENTA, AP.VIOLET, AP.GRAPE];
const PLASTER = [AP.CREAM, AP.SAND, AP.TAN];
const STONE = [AP.MIST, AP.ASH, AP.STONE];
const DARK_STONE = [AP.STEEL, AP.IRON, AP.SLATE];
const WOOD = [AP.CLAY, AP.UMBER, AP.BARK];

// a house seen from the front: a gabled roof over walls, a door and a lit window
function house(a: Art, x: number, base: number, w: number, wallH: number, roof: number[], wall = PLASTER) {
    const rh = Math.ceil(w / 2), top = base - wallH - rh;
    for (let r = 0; r < rh; r++) {
        const half = ((r + 1) / rh) * (w / 2 + 1);
        for (let i = Math.floor(x + w / 2 - half); i < Math.ceil(x + w / 2 + half); i++)
            // courses of tiles every other row, darker on the shaded side
            a.set(i, top + r, r == rh - 1 ? roof[2] : i < x + w / 2 ? (r % 2 ? roof[1] : roof[0]) : (r % 2 ? roof[2] : roof[1]));
    }
    a.rect(x, base - wallH, w, wallH, wall[0]);
    a.rect(x, base - wallH, w, 1, wall[1]);
    a.rect(x + w - 1, base - wallH, 1, wallH, wall[2]);
    const door = x + Math.floor(w / 2) - (w > 6 ? 1 : 0);
    const dh = Math.min(3, wallH);
    a.rect(door, base - dh, w > 6 ? 2 : 1, dh, AP.BARK);
    if (w > 6 && dh == 3) a.set(door + 1, base - 2, AP.UMBER);
    // lit windows, two pixels tall where there's room
    const win = (wx: number) => { a.set(wx, base - wallH + 1, AP.STRAW); if (wallH >= 5) a.set(wx, base - wallH + 2, AP.AMBER); };
    if (w > 4) win(x + 1);
    if (w > 7) win(x + w - 2);
}

// a round tower: walls with a cone roof (or battlements), a slit window
function tower(a: Art, cx: number, top: number, base: number, half: number, roof: number[] | null, wall = STONE) {
    for (let y = top; y < base; y++) for (let x = cx - half; x < cx + half; x++)
        a.set(x, y, x == cx - half ? wall[0] : x >= cx + half - 1 ? wall[2] : (y - top) % 4 == 3 ? wall[2] : wall[1]);
    if (roof) a.peak(cx, top - half * 2 - 1, top - 1, half + 1, roof[0], roof[1]);
    else for (let x = cx - half; x < cx + half; x += 2) a.set(x, top - 1, wall[1]);
    a.rect(cx - 1, top + 3, 1, 2, AP.SHADOW);
}

// a wall with battlements along its top
function wall(a: Art, x: number, top: number, w: number, h: number, stone = STONE) {
    a.rect(x, top, w, h, stone[1]);
    for (let i = x; i < x + w; i++) {
        if ((i - x) % 2 == 0) a.set(i, top - 1, stone[1]);
        a.set(i, top, stone[0]);
    }
    for (let j = top + 2; j < top + h; j += 3) for (let i = x + ((j / 3) % 2 ? 1 : 3); i < x + w; i += 4) a.set(i, j, stone[2]);
    // the walk's shadow under the battlements, the foot in shade
    a.rect(x, top + 1, w, 1, stone[2]);
    a.rect(x, top + h - 1, w, 1, stone[2]);
}

function flag(a: Art, x: number, y: number, c = AP.RED) {
    a.rect(x, y, 1, 5, AP.BARK);
    a.rect(x + 1, y, 3, 2, c);
}

// a lumpy boulder or crag, lit from the top left, speckled and cracked
function rock(a: Art, cx: number, base: number, rx: number, ry: number, ramp = DARK_STONE) {
    const cy = base - ry;
    for (let y = Math.floor(cy - ry * 1.2); y < base; y++) for (let x = Math.floor(cx - rx * 1.2); x <= cx + rx * 1.2; x++) {
        const dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry;
        const ang = Math.atan2(dy, dx);
        const edge = 1 + 0.07 * Math.sin(ang * 5 + cx) + 0.05 * Math.sin(ang * 9 + rx);
        if (dx * dx + dy * dy > edge * edge) continue;
        const l = -(dx * 0.6 + dy * 0.8) + (noise(x, y, rx) - 0.5) * 0.4;
        a.set(x, y, l > 0.35 ? ramp[0] : l < -0.5 ? ramp[2] : ramp[1]);
    }
    // a few cracks running down from its upper half
    for (let k = 0; k < Math.round(rx / 4); k++) {
        let x = Math.round(cx - rx * 0.7 + noise(k, 1, rx) * rx * 1.4), y = Math.round(cy - ry * 0.6 + noise(k, 2, rx) * ry * 0.8);
        for (let i = 0; i < 4; i++) {
            if (a.get(x, y) >= 0) a.set(x, y, ramp[2]);
            y++; if (noise(k, i, 7) < 0.5) x += x < cx ? -1 : 1;
        }
    }
    for (let x = Math.floor(cx - rx + 1); x < cx + rx - 1; x++) a.set(x, base - 1, ramp[2]);
}

// a dark way in, arched, its rim in shadow
function hole(a: Art, cx: number, base: number, rx: number, h: number) {
    const inside = (x: number, y: number) => {
        const dx = (x + 0.5 - cx) / rx;
        return Math.abs(dx) <= 1 && y < base && y >= base - h + rx * (1 - Math.sqrt(1 - dx * dx));
    };
    for (let y = base - h; y < base; y++) for (let x = Math.floor(cx - rx); x <= cx + rx; x++) if (inside(x, y))
        a.set(x, y, !inside(x - 1, y) || !inside(x, y - 1) ? AP.SHADOW : AP.BLACK);
}

// a pyramid of stone courses
function pyramid(a: Art, cx: number, top: number, base: number, half: number) {
    a.peak(cx, top, base, half, AP.STRAW, AP.OCHRE);
    for (let y = top + 4; y <= base; y += 3) for (let x = Math.floor(cx - half); x < cx + half; x++)
        if (a.get(x, y) == AP.STRAW) a.set(x, y, AP.AMBER); else if (a.get(x, y) == AP.OCHRE) a.set(x, y, AP.RUST);
}

// snow on whatever's highest in each column from x to x + w
function snowCap(a: Art, x: number, w: number, depth = 2) {
    for (let i = x; i < x + w; i++) {
        let y = 0;
        while (y < S && a.get(i, y) < 0) y++;
        for (let d = 0; d < depth && y + d < S; d++) a.set(i, y + d, d == 0 ? AP.WHITE : AP.MIST);
    }
}

function pine(a: Art, cx: number, base: number, h: number) {
    a.rect(cx, base - 2, 1, 2, AP.BARK);
    a.peak(cx + 0.5, base - h, base - 2, Math.ceil(h / 3), AP.LEAF, AP.FOREST);
}

// a round-topped tree, `r` across its crown
function tree(a: Art, cx: number, base: number, r: number) {
    a.rect(cx, base - r, 1, r, AP.UMBER);
    a.oval(cx + 0.5, base - r - r * 0.6, r, r * 0.8, AP.GRASS, AP.LEAF);
}

function palm(a: Art, x: number, top: number, base: number) {
    for (let y = top; y < base; y++) a.set(x + Math.round((y - top) / 8), y, AP.UMBER);
    for (const d of [-1, 1]) for (let i = 0; i < 5; i++) { a.set(x + d * (i + 1), top + Math.floor(i / 2), AP.GRASS); a.set(x + d * (i + 1), top + 1 + Math.floor(i / 2), AP.LEAF); }
    a.set(x, top - 1, AP.GRASS);
}

// every few rows of what's drawn between top and bottom in another colour
function stripes(a: Art, top: number, bottom: number, every: number, light: number, dark: number) {
    for (let y = top; y <= bottom; y += every) for (let x = 0; x < S; x++) if (a.get(x, y) >= 0) a.set(x, y, x < 16 ? light : dark);
}

//#endregion

//#region the places

const DRAW: Record<PlacePic, (a: Art) => void> = {
    village: (a) => {
        house(a, 3, 22, 8, 4, RED_ROOF);
        house(a, 17, 18, 9, 5, BROWN_ROOF);
        house(a, 11, 29, 9, 5, RED_ROOF);
    },
    town: (a) => {
        wall(a, 2, 23, 28, 6);
        house(a, 3, 20, 8, 5, RED_ROOF);
        house(a, 20, 20, 9, 5, BROWN_ROOF);
        tower(a, 15, 9, 22, 3, BLUE_ROOF, PLASTER);
        a.rect(14, 25, 3, 4, AP.BARK);
    },
    castle: (a) => {
        wall(a, 4, 18, 24, 11);
        tower(a, 16, 9, 18, 4, BLUE_ROOF);
        tower(a, 5, 15, 29, 3, BLUE_ROOF);
        tower(a, 27, 15, 29, 3, BLUE_ROOF);
        a.rect(14, 23, 4, 6, AP.SHADOW);
        a.rect(15, 22, 2, 1, AP.SHADOW);
        flag(a, 16, 0);
    },
    cathedral: (a) => {
        a.rect(6, 16, 20, 13, STONE[1]);
        a.rect(6, 16, 1, 13, STONE[0]); a.rect(25, 16, 1, 13, STONE[2]);
        a.peak(16, 9, 16, 11, SLATE_ROOF[0], SLATE_ROOF[1]);
        tower(a, 16, 6, 16, 3, SLATE_ROOF);
        a.oval(16, 20, 2.5, 2.5, AP.ORCHID, AP.VIOLET);
        a.set(16, 20, AP.PINK);
        a.rect(15, 25, 3, 4, AP.BARK);
        for (const x of [9, 22]) a.rect(x, 19, 1, 4, AP.COBALT);
    },
    fort: (a) => {
        // a square keep behind a curtain wall, squat towers at its ends, a portcullis
        a.rect(10, 7, 12, 12, DARK_STONE[1]);
        a.rect(10, 7, 1, 12, DARK_STONE[0]); a.rect(21, 7, 1, 12, DARK_STONE[2]);
        for (let x = 10; x < 22; x += 2) a.rect(x, 5, 1, 2, DARK_STONE[1]);
        a.rect(10, 7, 12, 1, DARK_STONE[0]);
        for (const x of [13, 18]) a.rect(x, 10, 1, 3, AP.BLACK);
        wall(a, 3, 18, 26, 11, DARK_STONE);
        tower(a, 6, 13, 29, 3, null, DARK_STONE);
        tower(a, 26, 13, 29, 3, null, DARK_STONE);
        hole(a, 16, 29, 3, 7);
        for (let x = 14; x < 19; x += 2) a.rect(x, 23, 1, 6, AP.IRON);
        for (let y = 24; y < 29; y += 2) a.rect(13, y, 7, 1, AP.IRON);
        flag(a, 16, 0, AP.ICE);
    },
    manor: (a) => {
        house(a, 2, 28, 10, 6, SLATE_ROOF);
        house(a, 20, 28, 10, 6, SLATE_ROOF);
        house(a, 9, 28, 14, 9, SLATE_ROOF);
        a.rect(18, 10, 2, 4, AP.UMBER); a.rect(18, 10, 2, 1, AP.CLAY);
    },
    farm: (a) => {
        // a field of wheat, a house and a barn
        for (let y = 24; y < 30; y++) for (let x = 2; x < 30; x++) a.set(x, y, (y % 2 == 0) ? AP.STRAW : AP.AMBER);
        for (let x = 2; x < 30; x += 3) a.set(x, 23, AP.UMBER);
        house(a, 3, 22, 8, 5, RED_ROOF);
        house(a, 15, 22, 13, 7, [AP.RED, AP.MAROON, AP.OXBLOOD], [AP.FLAME, AP.RED, AP.MAROON]);
    },
    chapel: (a) => {
        house(a, 8, 29, 16, 8, SLATE_ROOF, STONE);
        tower(a, 16, 8, 16, 2, SLATE_ROOF, STONE);
        a.rect(16, 0, 1, 4, AP.STRAW); a.rect(15, 1, 3, 1, AP.STRAW);
        a.oval(16, 18, 1.5, 1.5, AP.SKY);
    },
    temple: (a) => {
        // a temple of red stone: steps, columns, a pediment, fire on its altar
        a.rect(3, 27, 26, 3, AP.CLAY); a.rect(5, 25, 22, 2, AP.TAN);
        a.peak(16, 9, 14, 13, AP.FLAME, AP.RED);
        a.rect(4, 14, 24, 2, AP.MAROON);
        for (const x of [6, 11, 16, 21, 25]) { a.rect(x, 16, 2, 9, AP.SAND); a.rect(x + 1, 16, 1, 9, AP.TAN); }
        a.rect(13, 19, 6, 6, AP.SOOT);
        a.oval(16, 21, 2, 2.5, AP.EMBER, AP.FLAME);
        a.set(16, 19, AP.STRAW);
    },
    steptemple: (a) => {
        // a stepped pyramid of sandstone, a shrine on top
        const steps = [[2, 26, 28], [5, 22, 22], [8, 18, 16], [11, 14, 10]];
        for (const [x, y, w] of steps) { a.rect(x, y, w, 4, AP.SAND); a.rect(x, y, w, 1, AP.CREAM); a.rect(x + w - 2, y, 2, 4, AP.TAN); }
        a.rect(15, 15, 2, 15, AP.CLAY);
        house(a, 12, 14, 8, 4, [AP.OCHRE, AP.RUST, AP.OXBLOOD], [AP.STRAW, AP.AMBER, AP.OCHRE]);
    },
    tower: (a) => {
        // the Lanternspire: tall, white, a light at its top
        tower(a, 16, 9, 30, 4, null);
        a.rect(13, 3, 6, 6, AP.STRAW);
        a.rect(14, 4, 4, 4, AP.WHITE);
        a.peak(16, 0, 2, 4, AP.AMBER, AP.OCHRE);
        for (const y of [14, 20, 25]) a.rect(15, y, 2, 2, AP.SKY);
    },
    darktower: (a) => {
        for (let y = 8; y < 31; y++) {
            const half = 3 + Math.floor((y - 8) / 8);
            // its stones in courses, staggered
            const joint = (x: number) => y % 4 == 3 || (x + (y >> 2) * 3) % 6 == 0;
            for (let x = 16 - half; x < 16 + half; x++)
                a.set(x, y, x == 16 - half ? AP.VIOLET : x >= 16 + half - 1 || joint(x) ? AP.MIDNIGHT : AP.GRAPE);
        }
        // spikes
        a.peak(16, 0, 8, 3, AP.VIOLET, AP.GRAPE);
        a.peak(11, 6, 12, 1.5, AP.VIOLET, AP.GRAPE);
        a.peak(21, 6, 12, 1.5, AP.VIOLET, AP.GRAPE);
        for (const y of [13, 19, 25]) a.set(16, y, AP.PINK);
    },
    watchtower: (a) => {
        a.rect(12, 12, 8, 18, AP.ASH);
        a.rect(12, 12, 1, 18, AP.MIST); a.rect(19, 12, 1, 18, AP.STONE);
        a.rect(10, 9, 12, 3, AP.STONE);
        for (let x = 10; x < 22; x += 2) a.set(x, 8, AP.ASH);
        a.rect(15, 15, 2, 3, AP.SHADOW);
        a.rect(15, 26, 2, 4, AP.BARK);
        flag(a, 16, 2);
    },
    cave: (a) => {
        rock(a, 16, 30, 14, 12);
        // moss along its top, a mouth, stones fallen at its foot
        for (let x = 4; x < 28; x++) {
            let y = 0;
            while (y < S && a.get(x, y) < 0) y++;
            if (noise(x, 3) < 0.6) a.set(x, y, noise(x, 4) < 0.5 ? AP.GRASS : AP.LEAF);
        }
        hole(a, 16, 30, 5, 10);
        rock(a, 5, 31, 3, 2, STONE);
        rock(a, 26, 31, 2, 1.5, STONE);
    },
    mine: (a) => {
        rock(a, 16, 30, 14, 12);
        a.rect(11, 18, 10, 12, AP.BLACK);
        a.rect(12, 19, 8, 1, AP.SHADOW);
        a.rect(10, 17, 12, 2, AP.UMBER); a.rect(10, 17, 12, 1, AP.CLAY);
        a.rect(10, 17, 2, 13, AP.UMBER); a.rect(20, 17, 2, 13, AP.UMBER); a.rect(10, 17, 1, 13, AP.CLAY);
        // rails out of the dark, a cart of ore, a lamp
        for (const x of [13, 18]) a.rect(x, 26, 1, 4, AP.STEEL);
        for (let y = 27; y < 30; y += 2) a.rect(12, y, 8, 1, AP.UMBER);
        for (let x = 1; x < 10; x++) a.set(x, 29, AP.STEEL);
        a.rect(2, 25, 6, 3, AP.RUST); a.rect(2, 25, 6, 1, AP.OCHRE); a.rect(3, 24, 4, 1, AP.STONE); a.set(4, 23, AP.ASH);
        a.rect(23, 15, 1, 3, AP.BARK); a.set(23, 18, AP.STRAW);
    },
    camp: (a) => {
        a.peak(9, 14, 27, 7, AP.CREAM, AP.TAN);
        a.peak(9, 21, 27, 2, AP.SOOT, AP.SOOT);
        a.rect(9, 12, 1, 3, AP.UMBER);
        a.peak(23, 17, 27, 6, AP.SAND, AP.CLAY);
        a.peak(23, 23, 27, 1.5, AP.SOOT, AP.SOOT);
        // a fire ringed with stones, logs crossed under it
        a.rect(13, 28, 7, 1, AP.UMBER); a.set(13, 29, AP.UMBER); a.set(19, 27, AP.UMBER);
        for (const x of [12, 15, 18, 20]) a.set(x, 29, AP.STONE);
        a.oval(16, 26, 1.5, 2.5, AP.EMBER, AP.FLAME);
        a.set(16, 24, AP.STRAW); a.set(16, 26, AP.STRAW);
    },
    hut: (a) => {
        house(a, 9, 29, 13, 6, [AP.STRAW, AP.AMBER, AP.OCHRE], WOOD);
        a.rect(19, 15, 2, 5, AP.UMBER); a.rect(19, 15, 2, 1, AP.CLAY);
    },
    lair: (a) => {
        rock(a, 16, 30, 14, 10, [AP.IRON, AP.SLATE, AP.SHADOW]);
        hole(a, 16, 30, 5, 8);
        // horns, eyes in the dark, a skull and bones
        for (const [x, d] of [[6, 1], [26, -1]]) for (let i = 0; i < 7; i++) a.set(x + d * Math.floor(i / 2), 18 - i, i < 2 ? AP.TAN : AP.CREAM);
        a.set(14, 26, AP.RED); a.set(18, 26, AP.RED);
        a.rect(7, 27, 3, 2, AP.CREAM); a.set(7, 27, AP.WHITE); a.set(8, 28, AP.SOOT);
        a.rect(9, 29, 4, 1, AP.CREAM); a.rect(21, 28, 3, 1, AP.CREAM); a.set(23, 29, AP.CREAM);
        for (const [x, y] of [[22, 22], [23, 23], [24, 22], [25, 23]]) a.set(x, y, AP.SHADOW);
    },
    ruins: (a) => {
        a.rect(3, 26, 26, 3, AP.STONE);
        for (const [x, h] of [[5, 14], [11, 8], [19, 12], [25, 5]]) {
            a.rect(x, 26 - h, 3, h, AP.ASH); a.rect(x + 2, 26 - h, 1, h, AP.STONE);
            a.rect(x - 1, 26 - h, 5, 1, AP.MIST);
        }
        a.rect(13, 23, 5, 3, AP.ASH);
        a.set(9, 25, AP.LEAF); a.set(22, 24, AP.LEAF); a.set(23, 25, AP.LEAF);
    },
    stones: (a) => {
        for (const [x, y, h] of [[4, 24, 10], [11, 19, 9], [20, 19, 9], [27, 24, 10], [14, 29, 8]]) {
            a.rect(x - 1, y - h, 3, h, AP.STONE);
            a.rect(x - 1, y - h, 1, h, AP.ASH);
        }
        a.rect(9, 9, 14, 2, AP.ASH);
    },
    pyramids: (a) => {
        pyramid(a, 11, 7, 29, 11);
        pyramid(a, 25, 17, 29, 6);
        a.rect(10, 25, 2, 4, AP.SOOT); a.set(10, 24, AP.SOOT);
    },
    crater: (a) => {
        // a scorched bowl, rocks thrown out round it, the fallen star glowing at its heart
        a.oval(16, 20, 15, 9, AP.CLAY, AP.UMBER);
        a.oval(16, 21, 11, 6, AP.UMBER, AP.BARK);
        a.oval(16, 22, 7, 3.5, AP.BARK, AP.SOOT);
        for (const [x, y] of [[7, 15], [11, 13], [20, 13], [25, 15], [5, 22], [27, 23]]) a.set(x, y, AP.TAN);
        for (const [x, y] of [[9, 21], [10, 22], [23, 21], [22, 23], [13, 25], [19, 25]]) a.set(x, y, AP.SOOT);
        rock(a, 3, 28, 2.5, 2, BROWN_ROOF);
        rock(a, 29, 27, 2, 1.5, BROWN_ROOF);
        a.peak(16, 17, 23, 2, AP.ORCHID, AP.VIOLET);
        a.peak(13.5, 20, 23, 1.2, AP.MAGENTA, AP.GRAPE);
        a.peak(18.5, 19, 23, 1.2, AP.MAGENTA, AP.GRAPE);
        a.set(15, 19, AP.PINK);
    },
    bigtree: (a) => {
        a.rect(13, 18, 6, 12, AP.UMBER);
        a.rect(13, 18, 2, 12, AP.CLAY);
        a.rect(10, 28, 12, 2, AP.BARK);
        a.oval(16, 11, 15, 10, AP.GRASS, AP.FOREST);
        a.oval(10, 9, 6, 5, AP.LIME, AP.LEAF);
        a.oval(22, 12, 6, 5, AP.LEAF, AP.FOREST);
        for (const [x, y] of [[8, 6], [17, 4], [24, 9], [13, 13]]) a.set(x, y, AP.PALE);
    },
    signpost: (a) => {
        a.rect(15, 12, 2, 18, AP.UMBER);
        a.rect(8, 13, 12, 3, AP.CLAY); a.set(7, 14, AP.CLAY);
        a.rect(13, 18, 12, 3, AP.CLAY); a.set(25, 19, AP.CLAY);
        a.rect(9, 14, 8, 1, AP.UMBER); a.rect(15, 19, 8, 1, AP.UMBER);
    },
    icecastle: (a) => {
        for (const [x, top, half] of [[16, 2, 4], [8, 10, 3], [24, 9, 3], [3, 18, 2], [29, 17, 2]]) {
            a.peak(x, top, top + half * 2, half, AP.WHITE, AP.ICE);
            a.rect(x - half, top + half * 2 + 1, half * 2, 29 - top - half * 2, AP.FOAM);
            a.rect(x + half - 1, top + half * 2 + 1, 1, 29 - top - half * 2, AP.ICE);
        }
        a.rect(14, 24, 4, 6, AP.COBALT);
    },
    port: (a) => {
        house(a, 2, 20, 9, 5, BLUE_ROOF);
        house(a, 13, 20, 8, 5, RED_ROOF);
        house(a, 22, 22, 8, 5, BLUE_ROOF);
        // the quay, and crates on it
        a.rect(1, 23, 30, 3, AP.TAN);
        for (let x = 1; x < 31; x += 3) a.set(x, 25, AP.UMBER);
        a.rect(3, 21, 3, 2, AP.CLAY); a.rect(26, 20, 2, 3, AP.UMBER);
        a.rect(4, 26, 1, 4, AP.UMBER); a.rect(27, 26, 1, 4, AP.UMBER);
    },
    pier: (a) => {
        // planks out over the water, a boat tied up
        a.rect(4, 12, 6, 18, AP.CLAY);
        for (let y = 13; y < 30; y += 2) a.rect(4, y, 6, 1, AP.UMBER);
        a.rect(3, 29, 1, 2, AP.BARK); a.rect(10, 29, 1, 2, AP.BARK);
        a.oval(20, 24, 7, 3, AP.UMBER, AP.BARK);
        a.rect(15, 22, 11, 1, AP.CLAY);
        a.rect(20, 10, 1, 13, AP.BARK);
        a.peak(21, 11, 20, 5, AP.WHITE, AP.MIST);
        // ripples round the boat
        for (const [x, y, w] of [[13, 28, 3], [24, 28, 4], [28, 25, 2]]) a.rect(x, y, w, 1, AP.FOAM);
    },
    bridge: (a) => {
        // a humped stone bridge over a river running north to south, the water seen through its arch
        const deck = (x: number) => 11 + Math.round(5 * ((x - 15.5) / 15) ** 2);
        const arch = (x: number, y: number) => { const dx = (x + 0.5 - 16) / 8, dy = (y + 0.5 - 29) / 10; return dx * dx + dy * dy <= 1; };
        for (let x = 1; x < 31; x++) for (let y = deck(x); y < 30; y++) {
            if (arch(x, y)) a.set(x, y, y >= 26 ? ((x + y) % 5 == 0 ? AP.FOAM : y == 26 ? AP.ICE : AP.SKY) : y < 22 ? AP.SHADOW : AP.SLATE);
            else if (arch(x, y + 1) || arch(x - 1, y) || arch(x + 1, y)) a.set(x, y, (x + y) % 3 ? AP.MIST : AP.STONE);
            else a.set(x, y, y % 3 == 0 || (x + (y % 6 < 3 ? 0 : 2)) % 4 == 0 ? AP.STONE : AP.ASH);
        }
        // the parapet along its top
        for (let x = 1; x < 31; x++) { a.set(x, deck(x) - 1, AP.MIST); a.set(x, deck(x), AP.WHITE); a.set(x, deck(x) + 1, AP.STONE); }
        for (let x = 2; x < 31; x += 5) a.set(x, deck(x) - 2, AP.MIST);
    },
    altar: (a) => {
        // black stone, purple fire, spikes round it
        for (const x of [4, 9, 23, 28]) a.peak(x, 14, 29, 1.5, AP.IRON, AP.SLATE);
        a.rect(10, 22, 12, 7, AP.SLATE);
        a.rect(9, 21, 14, 2, AP.IRON);
        a.oval(16, 16, 3, 4.5, AP.ORCHID, AP.VIOLET);
        a.oval(16, 17, 1.5, 2.5, AP.PINK);
        a.set(16, 11, AP.MAGENTA);
    },
    shrine: (a) => {
        a.rect(8, 27, 16, 3, AP.STONE);
        a.rect(11, 15, 10, 12, AP.ASH);
        a.rect(11, 15, 1, 12, AP.MIST); a.rect(20, 15, 1, 12, AP.STONE);
        a.peak(16, 8, 14, 7, AP.SKY, AP.COBALT);
        a.oval(16, 21, 2, 3, AP.FOAM, AP.ICE);
    },
    volcano: (a) => {
        // a ragged cone of dark rock in bands, fire at its mouth, lava running down, smoke
        for (let y = 8; y < 31; y++) {
            const half = 4 + (y - 8) * 0.52 + (noise(0, y, 3) - 0.5) * 1.5;
            for (let x = Math.floor(16 - half); x < Math.ceil(16 + half); x++) {
                const t = (x + 0.5 - 16) / half + (noise(x, y, 5) - 0.5) * 0.3;
                const band = (y + Math.round(noise(x >> 2, 0, 9) * 2)) % 6 == 0;
                a.set(x, y, t < -0.35 ? (band ? AP.UMBER : AP.CLAY) : t > 0.3 ? (band ? AP.SOOT : AP.BARK) : band ? AP.BARK : AP.UMBER);
            }
        }
        a.rect(12, 7, 8, 1, AP.EMBER); a.rect(13, 8, 6, 1, AP.FLAME); a.rect(14, 6, 4, 1, AP.STRAW);
        // two flows of lava, bright where they're fresh
        for (const [x0, drift, len] of [[14, -0.35, 15], [18, 0.3, 11]]) for (let i = 0; i < len; i++) {
            const x = Math.round(x0 + drift * i + Math.sin(i / 2) * 0.8), y = 9 + i;
            a.set(x, y, i < 4 ? AP.STRAW : AP.EMBER);
            a.set(x + 1, y, i < len - 3 ? AP.FLAME : AP.RED);
        }
        // smoke
        a.oval(14, 4, 3, 2, AP.STONE, AP.STEEL);
        a.oval(18, 2, 3.5, 2, AP.ASH, AP.STONE);
        a.oval(23, 1, 2.5, 1.5, AP.MIST, AP.ASH);
    },
    oasis: (a) => {
        // a pool ringed with sand and reeds, palms leaning over it
        a.oval(16, 24.5, 13, 6, AP.CREAM, AP.SAND);
        a.oval(16, 24, 11, 5, AP.SKY, AP.COBALT);
        a.oval(14, 23, 5, 2, AP.ICE);
        a.set(19, 26, AP.FOAM); a.set(20, 26, AP.FOAM);
        for (const [x, h] of [[7, 3], [8, 4], [24, 4], [25, 3], [10, 2]]) a.rect(x, 27 - h, 1, h, (x % 2) ? AP.LEAF : AP.GRASS);
        for (const [x, top] of [[6, 10], [25, 12]]) {
            for (let y = top; y < 26; y++) a.set(x + Math.round((y - top) / 8), y, AP.UMBER);
            for (const d of [-1, 1]) for (let i = 0; i < 5; i++) { a.set(x + d * (i + 1), top + Math.floor(i / 2), AP.GRASS); a.set(x + d * (i + 1), top + 1 + Math.floor(i / 2), AP.LEAF); }
            a.set(x, top - 1, AP.GRASS);
        }
    },

    // the variants

    rockbarrow: (a) => {
        // stone houses among the boulders it's named for
        rock(a, 26, 17, 5, 5);
        house(a, 3, 21, 9, 5, BROWN_ROOF, STONE);
        house(a, 16, 23, 8, 4, RED_ROOF, STONE);
        house(a, 8, 30, 9, 5, RED_ROOF, STONE);
        rock(a, 25, 30, 5, 4);
        rock(a, 3, 30, 3, 2);
    },
    snowvillage: (a) => {
        pine(a, 4, 27, 13);
        pine(a, 28, 25, 12);
        house(a, 7, 22, 9, 5, BROWN_ROOF, WOOD);
        house(a, 18, 20, 8, 4, RED_ROOF, WOOD);
        house(a, 12, 30, 9, 5, BROWN_ROOF, WOOD);
        snowCap(a, 0, S);
    },
    lumintown: (a) => {
        // Luminmoor: blue roofs in the forest, lamps lit along the way
        tree(a, 4, 22, 4);
        tree(a, 28, 21, 4);
        house(a, 10, 26, 12, 7, BLUE_ROOF);
        a.oval(16, 16, 1.5, 1.5, AP.STRAW);
        house(a, 1, 30, 8, 5, BLUE_ROOF);
        house(a, 23, 30, 8, 5, BLUE_ROOF);
        for (const x of [11, 20]) { a.rect(x, 25, 1, 5, AP.IRON); a.rect(x - 1, 23, 3, 2, AP.STRAW); a.set(x, 23, AP.WHITE); }
    },
    snowcastle: (a) => {
        wall(a, 3, 18, 26, 11, DARK_STONE);
        tower(a, 9, 9, 18, 3, SLATE_ROOF, DARK_STONE);
        tower(a, 23, 9, 18, 3, SLATE_ROOF, DARK_STONE);
        a.rect(14, 22, 4, 7, AP.SHADOW);
        a.rect(15, 21, 2, 1, AP.SHADOW);
        for (const x of [5, 25]) { a.rect(x, 20, 2, 4, AP.COBALT); a.set(x, 24, AP.COBALT); }
        snowCap(a, 0, S);
    },
    palisade: (a) => {
        // a wooden fort: sharpened logs, a gate, look-outs
        for (let x = 2; x < 30; x += 2) {
            a.rect(x, 16, 1, 13, AP.CLAY); a.rect(x + 1, 16, 1, 13, AP.UMBER);
            a.set(x, 15, AP.CLAY);
        }
        house(a, 2, 15, 7, 3, BROWN_ROOF, WOOD);
        house(a, 23, 15, 7, 3, BROWN_ROOF, WOOD);
        a.rect(13, 20, 6, 9, AP.BARK);
        for (let y = 21; y < 29; y += 3) a.rect(13, y, 6, 1, AP.UMBER);
        flag(a, 16, 9, AP.GRASS);
    },
    estate: (a) => {
        // a brick manor behind a hedged garden
        house(a, 6, 22, 20, 9, SLATE_ROOF, [AP.CLAY, AP.RUST, AP.OXBLOOD]);
        for (const x of [9, 12, 19, 22]) a.rect(x, 16, 1, 2, AP.STRAW);
        a.rect(9, 4, 2, 6, AP.RUST); a.rect(22, 4, 2, 6, AP.RUST);
        a.rect(9, 4, 2, 1, AP.CLAY); a.rect(22, 4, 2, 1, AP.CLAY);
        a.rect(15, 22, 2, 8, AP.SAND);
        a.rect(2, 26, 12, 3, AP.LEAF); a.rect(2, 26, 12, 1, AP.GRASS);
        a.rect(18, 26, 12, 3, AP.LEAF); a.rect(18, 26, 12, 1, AP.GRASS);
        a.oval(4, 24, 2, 2, AP.GRASS, AP.LEAF); a.oval(28, 24, 2, 2, AP.GRASS, AP.LEAF);
    },
    gullhaven: (a) => {
        // a manor by the sea, a cottage, a sailing boat drawn up, gulls
        house(a, 8, 27, 14, 8, SLATE_ROOF);
        house(a, 1, 29, 7, 4, BLUE_ROOF);
        a.rect(26, 15, 1, 12, AP.BARK);
        a.peak(28, 16, 25, 3, AP.WHITE, AP.MIST);
        a.oval(26, 28, 5, 2, AP.CLAY, AP.UMBER);
        a.rect(21, 27, 11, 1, AP.UMBER);
        for (const [x, y] of [[3, 9], [24, 5]]) { a.set(x, y, AP.WHITE); a.set(x + 1, y + 1, AP.WHITE); a.set(x + 2, y, AP.WHITE); }
    },
    orchard: (a) => {
        // fruit trees in rows behind a fence
        for (const [x, y] of [[6, 13], [16, 11], [26, 13], [11, 21], [21, 21]]) {
            a.rect(x, y + 2, 1, 5, AP.UMBER);
            a.oval(x + 0.5, y, 4, 3.5, AP.GRASS, AP.LEAF);
            a.set(x - 1, y - 1, AP.RED); a.set(x + 2, y + 1, AP.RED);
        }
        a.rect(1, 28, 30, 1, AP.CLAY);
        for (let x = 1; x < 31; x += 5) a.rect(x, 27, 1, 3, AP.UMBER);
    },
    sheepfarm: (a) => {
        // a barn in the snow, a fold of sheep
        house(a, 3, 20, 12, 6, RED_ROOF, WOOD);
        snowCap(a, 0, 17);
        a.rect(1, 24, 30, 1, AP.CLAY);
        for (let x = 1; x < 31; x += 5) a.rect(x, 23, 1, 3, AP.UMBER);
        for (const [x, y] of [[21, 20], [25, 27], [12, 28]]) {
            a.oval(x, y, 3, 2, AP.WHITE, AP.MIST);
            a.rect(x + 2, y - 2, 2, 2, AP.SOOT);
            a.set(x - 1, y + 2, AP.SOOT); a.set(x + 1, y + 2, AP.SOOT);
        }
    },
    desertchapel: (a) => {
        // domed, of sun-dried brick, a slim tower beside it
        a.oval(16, 18, 7, 6, AP.CREAM, AP.TAN);
        a.rect(16, 9, 1, 4, AP.AMBER); a.set(16, 8, AP.STRAW);
        a.rect(7, 18, 18, 11, AP.SAND);
        a.rect(7, 18, 1, 11, AP.CREAM); a.rect(24, 18, 1, 11, AP.TAN);
        a.rect(14, 23, 4, 6, AP.UMBER); a.rect(15, 22, 2, 1, AP.UMBER);
        a.rect(10, 21, 1, 3, AP.SKY); a.rect(21, 21, 1, 3, AP.SKY);
        tower(a, 4, 13, 29, 2, null, PLASTER);
        a.oval(4, 11, 2, 2, AP.CREAM, AP.TAN);
    },
    stavechurch: (a) => {
        // a wooden church of the north, roof over roof, in the snow
        a.rect(9, 20, 14, 9, AP.UMBER);
        a.rect(9, 20, 1, 9, AP.CLAY); a.rect(22, 20, 1, 9, AP.BARK);
        a.peak(16, 12, 20, 9, AP.BARK, AP.SOOT);
        a.rect(13, 8, 6, 5, AP.UMBER);
        a.peak(16, 2, 8, 4, AP.BARK, AP.SOOT);
        a.rect(15, 25, 3, 4, AP.SOOT);
        snowCap(a, 0, S);
    },
    tent: (a) => {
        // a nomad's tent, striped, a pennant on its pole
        a.peak(16, 10, 28, 13, AP.CREAM, AP.TAN);
        stripes(a, 13, 28, 4, AP.FLAME, AP.RED);
        a.peak(16, 21, 28, 3, AP.SOOT, AP.SOOT);
        a.rect(16, 6, 1, 4, AP.UMBER); a.rect(17, 6, 3, 1, AP.RED);
        a.rect(4, 29, 24, 1, AP.RUST);
        a.oval(28, 27, 2, 1.5, AP.CLAY, AP.UMBER);
    },
    sandcave: (a) => {
        // a sandstone bluff, a cave in it, a cactus
        rock(a, 14, 30, 12, 11, [AP.SAND, AP.TAN, AP.CLAY]);
        for (const y of [17, 22]) for (let x = 0; x < S; x++) if (a.get(x, y) >= 0) a.set(x, y, AP.CLAY);
        hole(a, 14, 30, 4, 9);
        a.rect(27, 19, 2, 11, AP.LEAF); a.rect(28, 19, 1, 11, AP.FOREST);
        a.rect(25, 22, 2, 1, AP.LEAF); a.rect(25, 20, 1, 2, AP.LEAF);
        a.rect(29, 24, 2, 1, AP.LEAF); a.rect(30, 22, 1, 2, AP.LEAF);
    },
    embermine: (a) => {
        // red rock with glowing seams, fire deep inside
        rock(a, 16, 30, 14, 12, [AP.RUST, AP.OXBLOOD, AP.SOOT]);
        for (const [x, y] of [[5, 22], [6, 23], [7, 23], [24, 19], [25, 20], [26, 24], [9, 26]]) a.set(x, y, AP.EMBER);
        a.rect(11, 18, 10, 12, AP.BLACK);
        a.rect(13, 25, 6, 5, AP.OXBLOOD); a.rect(14, 27, 4, 3, AP.FLAME);
        a.rect(10, 17, 12, 2, AP.UMBER); a.rect(10, 17, 2, 13, AP.UMBER); a.rect(20, 17, 2, 13, AP.UMBER);
        a.rect(23, 26, 6, 3, AP.IRON); a.rect(24, 25, 4, 1, AP.EMBER);
        a.rect(22, 29, 9, 1, AP.STEEL);
    },
    loggingcamp: (a) => {
        // the woodcutters': a pine still standing, logs stacked, an axe in a stump
        pine(a, 6, 22, 16);
        for (const [x, y, w] of [[2, 28, 15], [3, 26, 13], [5, 24, 9]]) {
            a.rect(x, y, w, 2, AP.CLAY); a.rect(x, y + 1, w, 1, AP.UMBER);
            a.set(x, y, AP.TAN);
        }
        house(a, 18, 23, 11, 5, BROWN_ROOF, WOOD);
        a.rect(21, 27, 4, 3, AP.UMBER); a.rect(21, 27, 4, 1, AP.TAN);
        a.rect(24, 23, 1, 4, AP.CLAY); a.rect(22, 23, 2, 2, AP.STEEL);
    },
    desertcamp: (a) => {
        // a caravan's stop: two tents and a palm
        palm(a, 26, 7, 29);
        a.peak(10, 13, 28, 8, AP.STRAW, AP.AMBER);
        stripes(a, 16, 28, 3, AP.OCHRE, AP.OCHRE);
        a.peak(20, 19, 28, 5, AP.SKY, AP.COBALT);
        a.peak(10, 22, 28, 2, AP.SOOT, AP.SOOT);
        a.rect(1, 26, 3, 3, AP.CLAY); a.rect(1, 26, 3, 1, AP.TAN);
    },
    overgrownruins: (a) => {
        // a broken arch, a tree growing out of it, vines
        a.rect(2, 28, 28, 2, AP.STONE);
        for (const x of [6, 21]) { a.rect(x, 11, 4, 17, AP.ASH); a.rect(x + 3, 11, 1, 17, AP.STONE); }
        a.rect(4, 8, 19, 3, AP.ASH); a.rect(4, 8, 19, 1, AP.MIST);
        a.rect(13, 25, 5, 3, AP.STONE);
        a.oval(25, 7, 6, 4.5, AP.GRASS, AP.FOREST);
        a.rect(24, 10, 1, 4, AP.UMBER);
        for (const [x, y] of [[6, 13], [7, 14], [6, 17], [8, 20], [7, 23], [22, 15], [23, 16], [21, 19], [24, 22], [10, 9], [15, 10], [11, 26], [19, 27]])
            a.set(x, y, (x + y) % 2 ? AP.LEAF : AP.GRASS);
    },
    // the start towns' gathering places (the user, 2026-10-31: "every starter
    // town needs the basic gather items nearby"): Rockbarrow's mine, jetty and
    // croft, Gullhaven's mine, wharf and hunters' camp
    coppermine: (a) => {
        // brown rock streaked green with copper, a cart of ore on rails, a lamp by the way in
        rock(a, 16, 30, 14, 12, [AP.CLAY, AP.UMBER, AP.BARK]);
        for (const [x, y] of [[5, 23], [6, 22], [7, 22], [24, 20], [25, 21], [26, 25], [9, 27], [22, 25]]) a.set(x, y, AP.FOAM);
        a.rect(11, 18, 10, 12, AP.BLACK);
        a.rect(10, 17, 12, 2, AP.BARK); a.rect(10, 17, 2, 13, AP.BARK); a.rect(20, 17, 2, 13, AP.BARK);
        a.rect(23, 15, 1, 3, AP.BARK); a.set(23, 18, AP.STRAW);
        a.rect(1, 29, 10, 1, AP.STEEL);
        a.rect(2, 25, 6, 3, AP.IRON); a.rect(3, 24, 4, 1, AP.OCHRE); a.set(4, 23, AP.EMBER);
    },
    jetty: (a) => {
        // a short jetty of planks on posts, a rowing boat tied up, a crate and a rod
        a.rect(6, 10, 7, 20, AP.TAN);
        for (let y = 11; y < 30; y += 2) a.rect(6, y, 7, 1, AP.CLAY);
        for (const y of [11, 19, 27]) { a.rect(5, y, 1, 3, AP.BARK); a.rect(13, y, 1, 3, AP.BARK); }
        a.rect(7, 22, 3, 3, AP.UMBER); a.rect(7, 22, 3, 1, AP.CLAY);
        a.rect(11, 6, 1, 6, AP.BARK); a.set(12, 6, AP.BARK); a.set(13, 7, AP.BARK); a.set(14, 8, AP.STONE); a.set(14, 9, AP.STONE);
        // the boat
        a.oval(22, 21, 7, 3, AP.CLAY, AP.UMBER);
        a.rect(17, 20, 10, 1, AP.BARK);
        a.rect(19, 19, 1, 1, AP.UMBER); a.rect(24, 19, 1, 1, AP.UMBER);
        a.rect(14, 20, 1, 1, AP.STRAW); a.rect(15, 20, 1, 1, AP.STRAW);
    },
    croft: (a) => {
        // a thatched cottage, rows of cabbages and a haystack
        house(a, 4, 18, 11, 6, [AP.STRAW, AP.AMBER, AP.OCHRE], STONE);
        for (let y = 21; y < 30; y += 3) for (let x = 2; x < 30; x += 3) a.oval(x + 1, y + 1, 1.5, 1.2, AP.LIME, AP.LEAF);
        a.oval(24, 15, 5, 4.5, AP.STRAW, AP.AMBER);
        a.rect(20, 18, 9, 1, AP.OCHRE);
        a.rect(1, 20, 30, 1, AP.UMBER);
    },
    tinmine: (a) => {
        // a grey stone mound, a lantern by the way in, a hut and a cart of tin ore
        rock(a, 14, 30, 13, 11, STONE);
        for (const [x, y] of [[5, 23], [6, 22], [20, 20], [21, 21], [8, 27]]) a.set(x, y, AP.WHITE);
        a.rect(10, 20, 8, 10, AP.BLACK);
        a.rect(9, 19, 10, 2, AP.BARK); a.rect(9, 19, 2, 11, AP.BARK); a.rect(17, 19, 2, 11, AP.BARK);
        a.rect(20, 17, 1, 5, AP.BARK); a.rect(21, 17, 2, 1, AP.BARK); a.rect(22, 18, 1, 2, AP.STRAW);
        house(a, 23, 29, 8, 4, SLATE_ROOF, WOOD);
        a.rect(3, 26, 5, 3, AP.UMBER); a.rect(4, 25, 3, 1, AP.ASH); a.set(5, 24, AP.MIST);
    },
    wharf: (a) => {
        // a wide wharf on piles, barrels and crates, a fishing boat with a red sail, gulls
        a.rect(2, 22, 20, 4, AP.TAN);
        for (let x = 2; x < 22; x += 3) a.set(x, 25, AP.UMBER);
        for (const x of [3, 9, 15, 21]) a.rect(x, 26, 1, 4, AP.BARK);
        a.oval(5, 20, 2, 2, AP.CLAY, AP.UMBER); a.rect(3, 20, 5, 1, AP.BARK);
        a.oval(9, 20, 2, 2, AP.CLAY, AP.UMBER); a.rect(7, 20, 5, 1, AP.BARK);
        a.rect(14, 18, 4, 4, AP.UMBER); a.rect(14, 18, 4, 1, AP.CLAY);
        a.oval(26, 27, 5, 2, AP.UMBER, AP.BARK);
        a.rect(21, 26, 11, 1, AP.CLAY);
        a.rect(26, 11, 1, 15, AP.BARK);
        a.peak(27.5, 12, 23, 4, AP.FLAME, AP.RED);
        for (const [x, y] of [[4, 8], [14, 4]]) { a.set(x, y, AP.WHITE); a.set(x + 1, y + 1, AP.WHITE); a.set(x + 2, y, AP.WHITE); }
    },
    huntcamp: (a) => {
        // the hunters': a hide tent, a drying rack of pelts, a fire, a pine behind
        pine(a, 27, 20, 14);
        a.peak(10, 12, 27, 8, AP.TAN, AP.UMBER);
        a.rect(9, 21, 2, 6, AP.BARK);
        a.rect(19, 15, 1, 12, AP.BARK); a.rect(28, 15, 1, 12, AP.BARK); a.rect(19, 15, 10, 1, AP.BARK);
        a.rect(20, 16, 3, 6, AP.CLAY); a.rect(24, 16, 3, 5, AP.SAND);
        a.oval(16, 29, 2.5, 1.2, AP.IRON);
        a.oval(16, 27, 1.2, 2, AP.EMBER, AP.FLAME);
    },
};

//#endregion

export function placePic(pic: PlacePic): number[] {
    const a = new Art();
    DRAW[pic](a);
    return a.outline();
}
