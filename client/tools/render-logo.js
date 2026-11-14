// The title screen's logo (npm run logo): "WAYFOLK" in chunky pixel letters
// on a banner that follows them, in the Apollo palette, writing
// dist/assets/components/title/logo.png. Each letter is drawn below as rows
// of # (filled) and . (empty); the letters sit on a gentle arch, and the O
// carries a gold compass mark.

const { Canvas } = require("./canvas");

const GLYPHS = {
    W: [
        "###.........###",
        "###.........###",
        "###.........###",
        "###.........###",
        "###...###...###",
        "###...###...###",
        "###...###...###",
        "###..#####..###",
        "###.###.###.###",
        "#######.#######",
        ".#####...#####.",
        "..###.....###..",
    ],
    A: [
        "....####....",
        "...######...",
        "..###..###..",
        "..###..###..",
        ".###....###.",
        ".###....###.",
        "###......###",
        "############",
        "############",
        "###......###",
        "###......###",
        "###......###",
    ],
    Y: [
        "###.......###",
        "###.......###",
        ".###.....###.",
        ".###.....###.",
        "..###...###..",
        "...#######...",
        "....#####....",
        ".....###.....",
        ".....###.....",
        ".....###.....",
        ".....###.....",
        ".....###.....",
    ],
    F: [
        "##########",
        "##########",
        "###.......",
        "###.......",
        "###.......",
        "########..",
        "########..",
        "###.......",
        "###.......",
        "###.......",
        "###.......",
        "###.......",
    ],
    O: [
        "...######...",
        "..########..",
        ".###....###.",
        "###......###",
        "###......###",
        "###......###",
        "###......###",
        "###......###",
        "###......###",
        ".###....###.",
        "..########..",
        "...######...",
    ],
    L: [
        "###.......",
        "###.......",
        "###.......",
        "###.......",
        "###.......",
        "###.......",
        "###.......",
        "###.......",
        "###.......",
        "###.......",
        "##########",
        "##########",
    ],
    K: [
        "###.....###.",
        "###....###..",
        "###...###...",
        "###..###....",
        "###.###.....",
        "######......",
        "#######.....",
        "###..###....",
        "###...###...",
        "###....###..",
        "###.....###.",
        "###......###",
    ],
};

const WORD = "WAYFOLK";
const GAP = 2;          // (px between letters)
const ARCH = 3;         // (px the middle letters rise)
const PAD = 9;          // (px round the letters for the banner and its edges)
const SCALE = 8;        // (screen px a logo px)

const C = {
    cream: 0xe7d5b3, light: 0xebede9, tan: 0xd7b594,
    plum: 0x241527, purple: 0x402751, violet: 0x7a367b, night: 0x1e1d39,
    black: 0x090a14, gold: 0xde9e41,
};

// the letters' mask, on the arch
const widths = [...WORD].map((ch) => GLYPHS[ch][0].length);
const wordW = widths.reduce((a, b) => a + b, 0) + GAP * (WORD.length - 1);
const glyphH = GLYPHS.W.length;
const W = wordW + PAD * 2, H = glyphH + ARCH + PAD * 2;
const mask = new Uint8Array(W * H);
const at = (x, y) => x >= 0 && y >= 0 && x < W && y < H && mask[y * W + x] == 1;
let mark = null;
let x0 = PAD;
[...WORD].forEach((ch, i) => {
    const centre = x0 + widths[i] / 2, t = (centre - W / 2) / (wordW / 2);
    const y0 = PAD + Math.round(ARCH * t * t);
    GLYPHS[ch].forEach((row, y) => [...row].forEach((c, x) => { if (c == "#") mask[(y0 + y) * W + x0 + x] = 1; }));
    if (ch == "O") mark = { x: x0 + 4, y: y0 + 4 };    // (the 4x4 hole's middle)
    x0 += widths[i] + GAP;
});

// the pixels within r of a letter (a round brush)
function near(r) {
    const out = new Uint8Array(W * H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        if (!at(x, y)) continue;
        for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++)
            if (dx * dx + dy * dy <= (r + 0.5) * (r + 0.5) && x + dx >= 0 && y + dy >= 0 && x + dx < W && y + dy < H) out[(y + dy) * W + x + dx] = 1;
    }
    return out;
}

const canvas = new Canvas(W, H);
const fill = (m, colour) => { for (let i = 0; i < m.length; i++) if (m[i]) canvas.px[i] = colour; };

// the banner: dark edge, cream rim, dark edge, purple (lit along its top, shaded along its bottom)
fill(near(8), C.black);
fill(near(7), C.tan);
fill(near(6), C.plum);
const banner = near(5);
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x;
    if (!banner[i]) continue;
    canvas.px[i] = !banner[i - W] ? C.violet : !banner[i + W] ? C.night : C.purple;
}

// the letters: a drop shadow, a dark outline, then cream (lit on top, shaded underneath)
const shadow = near(1);
for (let y = H - 1; y >= 2; y--) for (let x = W - 1; x >= 1; x--) if (shadow[(y - 2) * W + x - 1]) canvas.px[y * W + x] = C.night;
fill(near(1), C.plum);
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (!at(x, y)) continue;
    canvas.px[y * W + x] = !at(x, y - 1) ? C.light : !at(x, y + 1) ? C.tan : C.cream;
}

// the compass mark in the O
if (mark) {
    [".##.", "####", "####", ".##."].forEach((row, y) => [...row].forEach((c, x) => { if (c == "#") canvas.set(mark.x + x, mark.y + y, C.gold); }));
}

canvas.save("dist/assets/components/title/logo.png", SCALE);
