import * as PIXI from "pixi.js";
import { AP } from "../constants/Palette";

// The windows' frame (shared/Panel), drawn in code in Apollo colours (the
// user, 2026-11-01: "do numbers 2-7", windows that look made rather than
// plain boxes; it was panel.png, white lines round a black box): a bevelled
// steel rim, light on the top and left and dark on the bottom and right, an
// ink line round it, brass at the corners, and the dark glass inside. Its
// rim is 2 px, so a window's title bar (4 screen px in at scale 2) sits
// inside it. Panel cuts it into 8 x 8 corners, edges and middle, three
// times over (its CornerTypes: none of them in use, all drawn the same).

export const PANEL_TILE = 8;
const S = PANEL_TILE * 3;
export const PANEL_FILL = AP.INK;
const FILL_ALPHA = 238;

let texture: PIXI.Texture;
export function panelTexture(): PIXI.BaseTexture {
    if (texture) return texture.baseTexture;
    const canvas = document.createElement("canvas");
    canvas.width = S; canvas.height = S * 3;
    const ctx = canvas.getContext("2d"), img = ctx.createImageData(S, S * 3);
    for (let n = 0; n < 3; n++) for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
        const [c, a] = framePixel(x, y);
        if (c < 0) continue;
        const i = ((n * S + y) * S + x) * 4;
        img.data[i] = (c >> 16) & 255; img.data[i + 1] = (c >> 8) & 255; img.data[i + 2] = c & 255; img.data[i + 3] = a;
    }
    ctx.putImageData(img, 0, 0);
    texture = PIXI.Texture.from(canvas);
    texture.baseTexture.scaleMode = PIXI.SCALE_MODES.NEAREST;
    return texture.baseTexture;
}

// the HTML panels (the title screen's sign-in, shared/dom: main.css .dom-panel)
// framed the same: one 24 x 24 frame, as the --panel-frame CSS variable
// (border-image: panel-frame.png till it's set)
export function frameHtmlPanels() {
    const canvas = document.createElement("canvas");
    canvas.width = S; canvas.height = S;
    const ctx = canvas.getContext("2d"), img = ctx.createImageData(S, S);
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
        const [c, a] = framePixel(x, y);
        if (c < 0) continue;
        const i = (y * S + x) * 4;
        img.data[i] = (c >> 16) & 255; img.data[i + 1] = (c >> 8) & 255; img.data[i + 2] = c & 255; img.data[i + 3] = a;
    }
    ctx.putImageData(img, 0, 0);
    document.documentElement.style.setProperty("--panel-frame", `url(${canvas.toDataURL()})`);
}

// a pixel of the frame: its colour (-1 none) and alpha
function framePixel(x: number, y: number): [number, number] {
    const cx = Math.min(x, S - 1 - x), cy = Math.min(y, S - 1 - y), d = Math.min(cx, cy);
    const low = x > S - 1 - x && cx <= cy || y > S - 1 - y && cy <= cx;     // the bottom or right side
    // the corners: cut round, brass on them
    if (cx + cy < 1) return [-1, 0];
    if (cx + cy == 1) return [AP.INK, 255];
    if (cx == 1 && cy == 1) return [AP.STRAW, 255];
    if (cx + cy == 3 && cx > 0 && cy > 0 && d == 1) return [AP.OCHRE, 255];
    if (d == 0) return [low ? AP.STONE : AP.MIST, 255];
    if (d == 1) return [low ? AP.IRON : AP.STEEL, 255];
    return [PANEL_FILL, FILL_ALPHA];
}
