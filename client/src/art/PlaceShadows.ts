import * as PIXI from "pixi.js";
import { AP } from "../constants/Palette";

// The shadows the places cast on the ground (the user, 2026-11-01: "do
// numbers 2-7", the places standing on the map rather than lying on it): a
// soft oval under each, as wide as its sprite's foot (the widest of its
// bottom FOOT rows, read off places.png), a darker middle and a lighter
// rim, a little to the right (the light's from the top left).

const FOOT = 5;                 // rows from the bottom looked at
const SHADOW_H = 6;
export const SHADOW_DX = 1;     // map px to the right
const INNER = 72, OUTER = 34;   // alphas

const feet = new Map<number, number>();
let pixels: Uint8ClampedArray, sheetW = 0;

// how wide a place sprite's foot is (its pic's index in places.png; `size` its square)
export function footWidth(sheet: PIXI.BaseTexture, pic: number, size: number): number {
    let w = feet.get(pic);
    if (w != null) return w;
    if (!pixels) {
        const img = (sheet.resource as any)?.source as CanvasImageSource & { width: number; height: number };
        if (!img) return size * 0.7;
        const canvas = document.createElement("canvas");
        canvas.width = sheetW = img.width; canvas.height = img.height;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0);
        pixels = ctx.getImageData(0, 0, img.width, img.height).data;
    }
    let left = size, right = -1;
    for (let y = size - FOOT; y < size; y++) for (let x = 0; x < size; x++)
        if (pixels[(y * sheetW + pic * size + x) * 4 + 3] > 0) { left = Math.min(left, x); right = Math.max(right, x); }
    w = right < left ? 0 : right - left + 1;
    feet.set(pic, w);
    return w;
}

const textures = new Map<number, PIXI.Texture>();
export function placeShadowTexture(width: number): PIXI.Texture {
    const w = Math.max(6, Math.round(width) + 4);
    let t = textures.get(w);
    if (t) return t;
    const canvas = document.createElement("canvas");
    canvas.width = w; canvas.height = SHADOW_H;
    const ctx = canvas.getContext("2d"), img = ctx.createImageData(w, SHADOW_H);
    const cx = w / 2, cy = SHADOW_H / 2, c = AP.BLACK;
    for (let y = 0; y < SHADOW_H; y++) for (let x = 0; x < w; x++) {
        const d = Math.hypot((x + 0.5 - cx) / cx, (y + 0.5 - cy) / cy);
        if (d > 1) continue;
        const i = (y * w + x) * 4;
        img.data[i] = (c >> 16) & 255; img.data[i + 1] = (c >> 8) & 255; img.data[i + 2] = c & 255;
        img.data[i + 3] = d < 0.7 ? INNER : OUTER;
    }
    ctx.putImageData(img, 0, 0);
    textures.set(w, t = PIXI.Texture.from(canvas));
    t.baseTexture.scaleMode = PIXI.SCALE_MODES.NEAREST;
    return t;
}
