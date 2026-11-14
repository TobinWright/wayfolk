import * as PIXI from "pixi.js";
import { Pic } from "../art/Backdrops";
import { AVATAR_H, AVATAR_W, avatarColors, avatarRows } from "./AvatarArt";
import { Looks } from "./LookArt";

// Textures of people and pictures, made once and kept.

const people = new Map<string, PIXI.Texture>();
let shadow: PIXI.Texture;

// a canvas of colours (-1 none) w across
function canvasOf(w: number, h: number, colorAt: (x: number, y: number) => number, alpha = 255) {
    const canvas = document.createElement("canvas");
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext("2d");
    const img = ctx.createImageData(w, h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const c = colorAt(x, y);
        if (c < 0) continue;
        const i = (y * w + x) * 4;
        img.data[i] = (c >> 16) & 255; img.data[i + 1] = (c >> 8) & 255; img.data[i + 2] = c & 255; img.data[i + 3] = alpha;
    }
    ctx.putImageData(img, 0, 0);
    return canvas;
}

// a person in their looks facing a way (AvatarArt Facing), in a frame (0 standing, 1 and 2 a step on either foot)
export function personTexture(looks: Looks, facing: number, frame: number): PIXI.Texture {
    const key = `${looks.join(",")}|${facing}|${frame}`;
    let texture = people.get(key);
    if (!texture) {
        const rows = avatarRows(looks, facing, frame), colors = avatarColors(looks);
        texture = PIXI.Texture.from(canvasOf(AVATAR_W, AVATAR_H, (x, y) => colors[rows[y][x]] ?? -1));
        people.set(key, texture);
    }
    return texture;
}

// a person sitting on the ground (by a campfire on the map): standing, their
// legs from the knees down cut off (AvatarArt LEGS_AT 25), so they sit SIT_DROP px lower
export const SIT_DROP = 5;
const sitting = new Map<string, PIXI.Texture>();
export function sittingTexture(looks: Looks, facing: number): PIXI.Texture {
    const key = `${looks.join(",")}|${facing}`;
    let texture = sitting.get(key);
    if (!texture) {
        const standing = personTexture(looks, facing, 0);
        texture = new PIXI.Texture(standing.baseTexture, new PIXI.Rectangle(0, 0, AVATAR_W, AVATAR_H - SIT_DROP));
        sitting.set(key, texture);
    }
    return texture;
}

// the soft shadow under a person's feet, 12 x 3
export function shadowTexture(): PIXI.Texture {
    return shadow ??= PIXI.Texture.from(canvasOf(12, 3, (x, y) => (y == 1 || (x > 0 && x < 11)) ? 0x090a14 : -1, 90));
}

export function picTexture(pic: Pic): PIXI.Texture {
    return PIXI.Texture.from(canvasOf(pic.w, pic.h, (x, y) => pic.p[y * pic.w + x]));
}
