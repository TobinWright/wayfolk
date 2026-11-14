import { AP } from "../constants/Palette";
import { hash, Pic } from "./Backdrops";

// Slime racing's pictures (components/games/race), a px each a px of the
// track, shown twice the size as the map is: the track and the slimes.

// the slimes' colours (RaceSlime c, shared/Games RACE_COLORS): light, mid, dark
export const SLIME_HUES: [number, number, number][] = [
    [AP.LIME, AP.GRASS, AP.LEAF],           // green
    [AP.ICE, AP.SKY, AP.COBALT],            // blue
    [AP.PINK, AP.ORCHID, AP.MAGENTA],       // pink
    [AP.STRAW, AP.AMBER, AP.OCHRE],         // gold
    [AP.ORCHID, AP.VIOLET, AP.GRAPE],       // purple
    [AP.EMBER, AP.FLAME, AP.RED],           // red
    [AP.WHITE, AP.FOAM, AP.ICE],            // frost
    [AP.ASH, AP.STONE, AP.STEEL],           // stone
];

export const SLIME_W = 16;
export const SLIME_H = 12;

// a slime facing right, SLIME_W x SLIME_H, its bottom on the bottom row and its middle across: `frame` 0 sitting,
// 1 stretched up (leaping), 2 squashed (landing); outlined in black, lit at its top left, its eyes on its right
export function slimePic(color: number, frame: number) {
    const [l, m, d] = SLIME_HUES[color % SLIME_HUES.length], p = new Pic(SLIME_W, SLIME_H);
    const [rx, ry] = [[5.5, 4.5], [4.5, 5.5], [6.5, 3.5]][frame], cx = SLIME_W / 2, cy = SLIME_H - ry - 0.5;
    p.oval(cx, cy, rx + 1, ry + 1, AP.BLACK);
    p.oval(cx, cy, rx, ry, m, d);
    p.rect(Math.round(cx - rx) + 1, SLIME_H - 2, Math.round(rx * 2) - 1, 1, d);     // (its base, flat on the ground)
    const top = Math.round(cy - ry), left = Math.round(cx - rx * 0.6);
    p.set(left, top + 1, l); p.set(left + 1, top + 1, l); p.set(left - 1, top + 2, l);
    const eyeY = Math.round(cy - ry * 0.25), eyeX = Math.round(cx + rx * 0.2);
    for (const x of [eyeX, eyeX + 3]) { p.rect(x, eyeY - 1, 1, 2, AP.BLACK); p.set(x, eyeY - 1, AP.WHITE); }
    return p;
}

// The crowd in the stands over a track `w` wide whose lanes start at `top`
// (trackPic), on their own to be shown over it, none by the finish post (at
// postX, its flag to its right): `frame` 0 sitting, a few with
// their arms up; 1 and 2 cheering, every other one of them jumping up a px
// with their arms in the air, by turns.
export function crowdPic(w: number, top: number, frame: number, postX: number) {
    const p = new Pic(w, top - 4);
    const crowd = [AP.FLAME, AP.SKY, AP.STRAW, AP.ORCHID, AP.LIME, AP.CREAM, AP.TAN, AP.ICE, AP.EMBER];
    let k = 0;
    for (let tier = 0; tier * 5 + 3 < top - 4; tier++) for (let x = 2 + tier * 2; x < w - 4; x += 4 + Math.floor(hash(x, tier) * 3)) {
        if (x > postX - 5 && x < postX + 9) continue;
        const c = crowd[Math.floor(hash(x, tier + 9) * crowd.length)], jumps = frame > 0 && (k++ + frame) % 2 == 0;
        const y = tier * 5 + 1 - (jumps ? 1 : 0), arms = frame > 0 ? jumps || hash(x, tier + 33) < 0.3 : hash(x, tier + 21) < 0.2;
        p.rect(x, y + 1, 3, 2, c);
        p.set(x + 1, y, AP.SAND);
        if (arms) { p.set(x - 1, y - 1, AP.SAND); p.set(x + 3, y - 1, AP.SAND); }
    }
    return p;
}

// The track, w x h: the stands along the top (their crowd's crowdPic, a rail
// in front of them), `lanes` lanes of mud from `top`, `lane` px each, chalked apart, a
// gate at the start of each (left of startX) and the chequered line at
// finishX, grass under them.
export function trackPic(w: number, h: number, top: number, lanes: number, lane: number, startX: number, finishX: number) {
    const p = new Pic(w, h), bottom = top + lanes * lane;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const n = hash(x + y * w, 5);
        let c: number;
        if (y < top - 4) c = (y % 5 == 4) ? AP.BARK : AP.SOOT;                                     // the stands' tiers
        else if (y < top - 1) c = y == top - 4 ? AP.WHITE : y == top - 3 ? AP.MIST : AP.STEEL;      // the rail
        else if (y < top) c = AP.FOREST;
        else if (y < bottom) {
            const k = (y - top) % lane;
            const odd = Math.floor((y - top) / lane) % 2;     // (every other lane the lighter for it)
            c = k == 0 ? (x % 4 < 2 ? AP.CREAM : AP.TAN) : n < 0.06 ? AP.UMBER : n < (odd ? 0.3 : 0.12) ? AP.TAN : AP.CLAY;
        }
        else if (y == bottom) c = AP.CREAM;
        else c = n < 0.08 ? AP.LEAF : n < 0.1 ? AP.GRASS : AP.FOREST;
        p.set(x, y, c);
    }
    // the rail's posts
    for (let x = 6; x < w; x += 24) p.rect(x, top - 4, 2, 4, AP.ASH);
    // the gates: a grey stall each, open to the right
    for (let i = 0; i < lanes; i++) {
        const y = top + i * lane;
        p.rect(0, y + 1, startX - 10, lane - 1, AP.SLATE);
        p.rect(0, y + 1, startX - 10, 1, AP.STEEL);
        p.rect(startX - 11, y + 1, 1, lane - 1, AP.IRON);
    }
    // the start (a chalk line) and the finish (chequered, black and white)
    p.rect(startX, top + 1, 1, lanes * lane - 1, AP.WHITE);
    for (let y = top + 1; y < bottom; y++) for (let x = finishX; x < finishX + 4; x++) p.set(x, y, (Math.floor(x / 2) + Math.floor(y / 2)) % 2 ? AP.BLACK : AP.WHITE);
    // the finish's post, a flag atop it
    p.rect(finishX + 1, 2, 1, top - 2, AP.IRON);
    p.rect(finishX + 2, 2, 5, 3, AP.RED);
    p.rect(finishX + 2, 4, 5, 1, AP.MAROON);
    return p;
}
