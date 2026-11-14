import { AP } from "../constants/Palette";
import { hash, Pic } from "./Backdrops";

// The blackjack table's pictures (components/games/blackjack), a px each a
// px of the table, shown twice the size as the map is: the felt, the seats'
// circles, the cards and where they go.

// the suits' pips, 5 x 5: spades, hearts, diamonds, clubs
const SUITS = [
    ["..#..", ".###.", "#####", "..#..", ".###."],
    [".#.#.", "#####", "#####", ".###.", "..#.."],
    ["..#..", ".###.", "#####", ".###.", "..#.."],
    [".###.", ".###.", "#####", "#.#.#", "..#.."],
];

// the table, w x h: a half oval of felt hung from the dealer's edge (its middle
// at (w / 2, top), its radii w / 2 and ry), rimmed in wood, a line round where
// the bets go (radii lineRx and lineRy), the chip rack on the dealer's left and the
// shoe on their right, the floor in the corners
export function feltPic(w: number, h: number, top: number, ry: number, lineRx: number, lineRy: number) {
    const p = new Pic(w, h), cx = w / 2, rx = w / 2;
    // how many px in from the oval's edge (x, y) is, up to `most` (-1 outside)
    const depth = (x: number, y: number, most: number) => {
        let k = -1;
        while (k < most) {
            const dx = (x + 0.5 - cx) / (rx - k - 1), dy = (y + 0.5 - top) / (ry - k - 1);
            if (dx * dx + dy * dy > 1) break;
            k++;
        }
        return k;
    };
    const inLine = (x: number, y: number, k: number) => {
        const dx = (x + 0.5 - cx) / (lineRx - k), dy = (y + 0.5 - top) / (lineRy - k);
        return dx * dx + dy * dy <= 1;
    };
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const k = depth(x, y, 9), n = hash(x + y * w, 7);
        let c: number;
        if (k < 0) c = (y % 8 == 7) ? AP.WINE : ((x + Math.floor(y / 8) * 37) % 41 == 0) ? AP.WINE : n < 0.06 ? AP.PLUM : AP.SOOT;     // the floor's boards
        else if (k == 0 || k == 5) c = AP.BLACK;
        else if (k < 5) c = n < 0.12 ? AP.BARK : [AP.UMBER, AP.CLAY, AP.UMBER, AP.BARK][k - 1];          // the rim, its grain
        else if (k == 6) c = AP.PINE;
        else if (k == 7) c = (x + y) % 2 ? AP.PINE : AP.FOREST;
        else c = n < 0.015 ? AP.PINE : AP.FOREST;
        if (k >= 6 && inLine(x, y, 0) && !inLine(x, y, 1)) c = AP.LEAF;
        p.set(x, y, c);
    }
    // the dealer's edge
    p.rect(0, 0, w, 1, AP.CLAY);
    p.rect(0, 1, w, 1, AP.UMBER);
    p.rect(0, 2, w, 1, AP.BARK);
    p.rect(0, 3, w, 1, AP.BLACK);
    for (let x = 0; x < w; x++) if (hash(x, 3) < 0.15) p.set(x, 1, AP.BARK);
    // the chip rack: a column of each colour, its chips edge on
    const rackX = cx - 72;
    p.rect(rackX, 4, 24, 11, AP.BLACK);
    p.rect(rackX + 1, 4, 22, 10, AP.BARK);
    [[AP.RED, AP.MAROON], [AP.SKY, AP.COBALT], [AP.STRAW, AP.OCHRE], [AP.WHITE, AP.STONE], [AP.VIOLET, AP.GRAPE], [AP.GRASS, AP.LEAF]].forEach(([face, side], i) => {
        const x = rackX + 2 + i * 4, height = 4 + Math.floor(hash(i, 11) * 5);
        for (let y = 13 - height; y < 13; y++) p.rect(x, y, 3, 1, (y % 2) ? face : side);
        p.set(x + 1, 13 - height, AP.WHITE);
    });
    p.rect(rackX + 1, 13, 22, 1, AP.UMBER);
    // the shoe: a box of cards, the next one's back showing at its mouth
    const shoeX = cx + 50;
    p.rect(shoeX, 4, 20, 14, AP.BLACK);
    p.rect(shoeX + 1, 4, 18, 12, AP.OXBLOOD);
    p.rect(shoeX + 1, 4, 18, 1, AP.RUST);
    p.rect(shoeX + 1, 15, 18, 1, AP.SOOT);
    p.rect(shoeX + 3, 6, 14, 6, AP.BLACK);
    p.rect(shoeX + 4, 7, 12, 4, AP.RED);
    for (let x = 0; x < 12; x += 2) p.set(shoeX + 4 + x + 1, 8, AP.MAROON), p.set(shoeX + 4 + x, 9, AP.MAROON);
    p.rect(shoeX + 4, 11, 12, 1, AP.WHITE);
    p.rect(shoeX + 4, 12, 12, 1, AP.MIST);
    p.rect(shoeX + 2, 17, 18, 1, AP.PINE);     // (its shadow)
    return p;
}

// a seat's circle, `r` round: a ring of `ring` (`thick` px), dark felt inside
export function ringPic(r: number, ring: number, thick = 1) {
    const size = r * 2 + 1, p = new Pic(size, size);
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
        const d = Math.hypot(x + 0.5 - size / 2, y + 0.5 - size / 2);
        if (d <= r + 0.5) p.set(x, y, d > r + 0.5 - thick ? ring : d > r - thick - 0.5 ? AP.BLACK : AP.PINE);
    }
    return p;
}

// a card, w x h, its corners cut: c's suit's pip in its bottom right (its rank's
// printed over it, top left); face down (c < 0) its red back, a white border round a lattice
export function cardPic(c: number, w: number, h: number) {
    const p = new Pic(w, h);
    p.rect(0, 0, w, h, AP.BLACK);
    if (c < 0) {
        p.rect(1, 1, w - 2, h - 2, AP.WHITE);
        p.rect(2, 2, w - 4, h - 4, AP.RED);
        for (let y = 2; y < h - 2; y++) for (let x = 2; x < w - 2; x++) if ((x + y) % 4 == 0 || (x - y + 64) % 4 == 0) p.set(x, y, AP.MAROON);
    }
    else {
        const suit = Math.floor(c / 13), ink = suit == 1 || suit == 2 ? AP.RED : AP.BLACK;
        p.rect(1, 1, w - 2, h - 2, AP.WHITE);
        p.rect(w - 2, 2, 1, h - 3, AP.MIST);
        p.rect(2, h - 2, w - 3, 1, AP.MIST);
        SUITS[suit].forEach((row, y) => row.split("").forEach((ch, x) => { if (ch == "#") p.set(w - 7 + x, h - 7 + y, ink); }));
    }
    for (const [x, y] of [[0, 0], [w - 1, 0], [0, h - 1], [w - 1, h - 1]]) p.p[y * w + x] = -1;
    return p;
}

// where a card goes, w x h: an outline on the felt, its corners cut
export function spotPic(w: number, h: number) {
    const p = new Pic(w, h);
    p.rect(0, 0, w, h, AP.LEAF);
    p.rect(1, 1, w - 2, h - 2, AP.PINE);
    for (let y = 2; y < h - 2; y += 2) for (let x = 2 + (y / 2) % 2; x < w - 2; x += 2) p.set(x, y, AP.FOREST);
    for (const [x, y] of [[0, 0], [w - 1, 0], [0, h - 1], [w - 1, h - 1]]) p.p[y * w + x] = -1;
    return p;
}
