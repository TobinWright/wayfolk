import { AP } from "../constants/Palette";
import { hash } from "./WorldTiles";

// What stands on the world map's ground - trees, peaks, hills - painted one
// by one over the whole map rather than as tiles that repeat, so a forest
// thins out into lone trees at its edge and a range rises from foothills to
// big snowy peaks along its spine, each overlapping the ones behind it.
// tools/render-world.js places them and cuts the painting into tiles.
// The same Apollo ramps as the tiles, lit from the top left, outlined in the
// ramp's darkest; never dithered.

// the whole map's picture: 0xRRGGBB colours, -1 see-through
export interface Paper { w: number; h: number; px: Int32Array; }

const put = (p: Paper, x: number, y: number, c: number) => {
    if (x >= 0 && y >= 0 && x < p.w && y < p.h) p.px[y * p.w + x] = c;
};

// the colour of a ramp for v (0-1)
const tone = (ramp: number[], v: number) => ramp[Math.max(0, Math.min(ramp.length - 1, Math.floor(v * ramp.length)))];

// smooth 1D noise, 0-1
function wave(t: number, seed: number) {
    const i = Math.floor(t), f = t - i, s = f * f * (3 - 2 * f);
    return hash(i, 0, seed) * (1 - s) + hash(i + 1, 0, seed) * s;
}

// a shape given by `inside` (dx, dy from (cx, cy)) within `r` px, its
// outline the ramp's first colour and the rest from `light`
function stamp(p: Paper, cx: number, cy: number, r: number, ramp: number[],
    inside: (dx: number, dy: number) => boolean, light: (dx: number, dy: number) => number) {
    const isIn = (x: number, y: number) => inside(x + 0.5 - cx, y + 0.5 - cy);
    for (let y = Math.floor(cy - r); y <= cy + r; y++) for (let x = Math.floor(cx - r); x <= cx + r; x++) {
        if (!isIn(x, y)) continue;
        const edge = !isIn(x - 1, y) || !isIn(x + 1, y) || !isIn(x, y - 1) || !isIn(x, y + 1);
        put(p, x, y, edge ? ramp[0] : tone(ramp.slice(1), light(x + 0.5 - cx, y + 0.5 - cy)));
    }
}

//#region shadows

// Shadows go down first, all of them, counted per pixel: where one falls
// it's the ground's darker colour, and where two or more overlap (inside a
// wood) darker again, so the floor between crowns is shade, not grass.
export class Shade {
    readonly count: Uint8Array;
    readonly dark: Int32Array;
    constructor(readonly p: Paper) {
        this.count = new Uint8Array(p.w * p.h);
        this.dark = new Int32Array(p.w * p.h);
    }

    // an oval under something, in the ground's [dark, darker]
    oval(cx: number, cy: number, rx: number, ry: number, ground: [number, number]) {
        for (let y = Math.floor(cy - ry); y <= cy + ry; y++) for (let x = Math.floor(cx - rx); x <= cx + rx; x++) {
            if (x < 0 || y < 0 || x >= this.p.w || y >= this.p.h) continue;
            const dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry;
            if (dx * dx + dy * dy > 1) continue;
            const k = y * this.p.w + x;
            if (this.count[k] < 255) this.count[k]++;
            this.p.px[k] = this.count[k] > 1 ? ground[1] : ground[0];
        }
    }
}

// the shadow colours on each ground
export const SHADES = {
    grass: [AP.LEAF, AP.FOREST] as [number, number],
    snow: [AP.ASH, AP.STONE] as [number, number],
    sand: [AP.OCHRE, AP.RUST] as [number, number],
    bog: [AP.SOOT, AP.SOOT] as [number, number],
    ash: [AP.SLATE, AP.SHADOW] as [number, number],
};

//#endregion

//#region trees

const LEAVES = [AP.PINE, AP.FOREST, AP.LEAF, AP.GRASS];
const NEEDLES = [AP.PINE, AP.PINE, AP.FOREST, AP.LEAF];

// a broadleaf tree: a lumpy round crown on a stub of trunk; (x, y) is the
// crown's middle, r its size (about 3-5), tint lightening (above 0) or
// darkening it
export function tree(p: Paper, x: number, y: number, r: number, seed: number, tint = 0) {
    const lumps = 3 + Math.floor(hash(seed, 1, 5) * 3), turn = hash(seed, 2, 5) * 6.3;
    put(p, Math.floor(x), Math.floor(y + r * 0.9), AP.BARK);
    put(p, Math.floor(x), Math.floor(y + r * 0.9) + 1, AP.BARK);
    stamp(p, x, y, r + 1, LEAVES,
        (dx, dy) => {
            const a = Math.atan2(dy, dx), rr = r * (1 + 0.12 * Math.sin(a * lumps + turn));
            return dx * dx + dy * dy * 1.15 <= rr * rr;
        },
        (dx, dy) => 0.48 + tint + (-dx * 0.6 - dy) / r * 0.45 + (hash(Math.floor(dx + x), Math.floor(dy + y), seed) - 0.5) * 0.2);
}

// a pine: a narrow cone of boughs in steps, lit on their left; (x, y) is
// a little under its middle. In the snow its lit boughs are white.
export function pine(p: Paper, x: number, y: number, r: number, snowy: boolean) {
    const ramp = snowy ? [AP.PINE, AP.PINE, AP.FOREST, AP.WHITE] : NEEDLES;
    put(p, Math.floor(x), Math.floor(y + r) + 1, AP.BARK);
    stamp(p, x, y, r * 1.3 + 1, ramp,
        (dx, dy) => dy <= r && dy >= -r * 1.25 && Math.abs(dx) <= (dy + r * 1.25) * 0.36 + 0.3,
        (dx, dy) => (dx < 0 ? 0.45 : 0.15) + (Math.floor(dy + r * 1.25) % 3 == 0 && dx < 0 ? 0.3 : 0));
}

// a bare, dead tree: a short crooked trunk forking into branches; (x, y)
// is its foot
export function deadTree(p: Paper, x: number, y: number, seed: number) {
    const cx = Math.round(x), base = Math.round(y), lean = hash(seed, 1, 6) < 0.5 ? -1 : 1;
    // bleached grey wood, lit on the left
    for (let k = 0; k < 4; k++) { put(p, cx, base - k, AP.STEEL); put(p, cx - 1, base - k, AP.ASH); }
    for (let i = 1; i <= 3; i++) put(p, cx - 1 - i, base - 3 - i + (lean < 0 ? 0 : 1), AP.ASH);
    for (let i = 1; i <= 3; i++) put(p, cx + i, base - 3 - i + (lean > 0 ? 0 : 1), AP.STEEL);
    put(p, cx, base - 4, AP.STEEL); put(p, cx, base - 5, AP.STEEL);
}

//#endregion

//#region hills and mountains

// a grassy hill: a low hump lit from the top left; (x, y) is the middle of its foot
export function hill(p: Paper, x: number, y: number, r: number) {
    const rx = r * 1.25, ry = r * 0.85;
    for (let py = Math.floor(y - ry); py <= y; py++) for (let px = Math.floor(x - rx); px <= x + rx; px++) {
        const dx = (px + 0.5 - x) / rx, dy = (py + 0.5 - y) / ry, d = dx * dx + dy * dy;
        if (d > 1) continue;
        put(p, px, py, d > 0.8 || py == Math.floor(y) ? AP.FOREST : dx * 0.8 + dy < -0.75 ? AP.LIME : dx > 0.25 ? AP.LEAF : AP.GRASS);
    }
}

// Rock round a range's peaks, the ground they stand on: `inside` says
// where; scree in dark greys, rimmed in the darkest.
export function rock(p: Paper, x0: number, y0: number, x1: number, y1: number, inside: (x: number, y: number) => boolean, seed: number) {
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
        if (!inside(x, y)) continue;
        const edge = !inside(x - 1, y) || !inside(x + 1, y) || !inside(x, y - 1) || !inside(x, y + 1);
        const v = hash(x >> 1, y, seed);
        put(p, x, y, edge ? AP.SLATE : v < 0.1 ? AP.SLATE : v < 0.85 ? AP.IRON : AP.STEEL);
    }
}

// A mountain: (x, y) the middle of its foot, h its height in px. Its slopes
// wander, its ridge runs from the summit down a little to one side with the
// sunlit face left of it, gullies score both faces, and a snowy one has a
// cap that runs down the gullies.
export function mountain(p: Paper, x: number, y: number, h: number, snowy: boolean, seed: number) {
    const top = y - h;
    const slopeL = 0.45 + hash(seed, 1, 7) * 0.35, slopeR = 0.45 + hash(seed, 2, 7) * 0.35;
    const lean = (hash(seed, 3, 7) - 0.35) * 0.35;
    // a shoulder down one side: the slope eases off there, then drops again
    const shoulderAt = h * (0.3 + hash(seed, 4, 7) * 0.3), shoulderSide = hash(seed, 5, 7) < 0.5 ? -1 : 1;
    const shoulder = (d: number, side: number) => side != shoulderSide ? 0 : Math.max(0, Math.min(d - shoulderAt, h * 0.15)) * 0.9;
    // how far down from the summit (0 at it), and each side's edge there:
    // steep up top, flaring out at the foot
    const flare = (d: number) => d * (0.8 + 0.45 * d / h);
    const left = (d: number) => x - flare(d) * slopeL - shoulder(d, -1) - (wave(d / 3, seed + 10) - 0.5) * Math.min(3, d * 0.5) + 0.3;
    const right = (d: number) => x + flare(d) * slopeR + shoulder(d, 1) + (wave(d / 3, seed + 11) - 0.5) * Math.min(3, d * 0.5) - 0.3;
    const ridge = (d: number) => x + d * lean + (wave(d / 4, seed + 12) - 0.5) * 1.6;
    const isIn = (px: number, py: number) => {
        const d = py + 0.5 - top, fx = px + 0.5;
        return d >= 0 && py < y && fx >= left(d) && fx <= right(d);
    };
    // gullies: lines from the ridge down and out, a few each side
    const gullies: [number, number, number][] = [];  // [from d, side, steepness]
    for (let k = 0; k < Math.max(1, Math.floor(h / 7)); k++)
        gullies.push([h * (0.2 + hash(seed, 20 + k, 7) * 0.5), hash(seed, 30 + k, 7) < 0.5 ? -1 : 1, 1.4 + hash(seed, 40 + k, 7)]);
    const inGully = (fx: number, d: number) => gullies.some(([from, side, steep]) => {
        if (d < from) return false;
        const gx = ridge(from) + side * (d - from) / steep;
        return Math.abs(fx - gx) < 0.6;
    });
    const snowLine = (fx: number) => h * 0.3 + (wave(fx / 2.5, seed + 13) - 0.5) * h * 0.18;
    for (let py = Math.floor(top); py < y; py++) for (let px = Math.floor(x - h * 1.6); px <= x + h * 1.6; px++) {
        if (!isIn(px, py)) continue;
        const d = py + 0.5 - top, fx = px + 0.5;
        const edge = !isIn(px - 1, py) || !isIn(px + 1, py) || !isIn(px, py - 1) || !isIn(px, py + 1);
        if (edge) { put(p, px, py, AP.SHADOW); continue; }
        const lit = fx < ridge(d), gully = inGully(fx, d);
        const nearRidge = Math.abs(fx - ridge(d)) < 1.5;
        // rough rock: ledges catching the light here and there
        const rough = hash(px >> 1, py, seed + 14);
        let c = lit ? (nearRidge || rough < 0.08 ? AP.ASH : AP.STONE) : (d > h * 0.7 || rough < 0.1 ? AP.SLATE : AP.IRON);
        if (lit && d > h * 0.72 && !nearRidge) c = rough < 0.15 ? AP.STONE : AP.STEEL;   // the foot in its own dust
        if (gully) c = lit ? AP.STEEL : AP.SLATE;
        if (snowy && d < snowLine(fx) + (gully ? h * 0.12 : 0)) c = lit ? AP.WHITE : gully ? AP.STONE : AP.MIST;
        put(p, px, py, c);
    }
}

//#endregion
