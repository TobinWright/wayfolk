import * as PIXI from "pixi.js";
import { Constants } from "../constants/Constants";

// The display font (the user, 2026-11-01: "do numbers 2-7", a second, bolder
// font for titles): the game's PixelFont made bold, each glyph drawn again a
// pixel to the right of itself and a pixel wider, made from PixelFont as it
// loads (so it has every character PixelFont has, and follows it if it
// changes). For the windows' titles (TitleBar) and the map's place names.

export const DISPLAY_FONT = "DisplayFont";

// its name, made the first time it's asked for
export function displayFont(): string {
    if (PIXI.BitmapFont.available[DISPLAY_FONT]) return DISPLAY_FONT;
    const src = PIXI.BitmapFont.available[Constants.PIXEL_FONT];
    if (!src) return Constants.PIXEL_FONT;

    // the glyphs' pixels, off PixelFont's page
    const page = Object.values(src.pageTextures)[0]?.baseTexture;
    const img = (page?.resource as any)?.source as CanvasImageSource & { width: number; height: number };
    if (!img) return Constants.PIXEL_FONT;
    const read = document.createElement("canvas");
    read.width = img.width; read.height = img.height;
    const rctx = read.getContext("2d");
    rctx.drawImage(img, 0, 0);
    const from = rctx.getImageData(0, 0, img.width, img.height).data, at = (x: number, y: number) => from[(y * img.width + x) * 4 + 3];

    // laid out in rows on a page of their own, a pixel apart
    const ids = Object.keys(src.chars).map(Number), PAGE = 256;
    let x = 1, y = 1, rowH = 0;
    const spots = ids.map((id) => {
        const f = src.chars[id].texture.frame, w = f.width + 1, h = f.height;
        if (x + w + 1 > PAGE) { x = 1; y += rowH + 1; rowH = 0; }
        const spot = { id, x, y, w, h, f };
        x += w + 1; rowH = Math.max(rowH, h);
        return spot;
    });
    const canvas = document.createElement("canvas");
    canvas.width = PAGE; canvas.height = PAGE;
    const ctx = canvas.getContext("2d"), out = ctx.createImageData(PAGE, PAGE);
    for (const s of spots) for (let dy = 0; dy < s.h; dy++) for (let dx = 0; dx < s.w; dx++) {
        const sx = s.f.x + dx, sy = s.f.y + dy;
        const a = Math.max(dx < s.f.width ? at(sx, sy) : 0, dx > 0 ? at(sx - 1, sy) : 0);
        if (!a) continue;
        const i = ((s.y + dy) * PAGE + s.x + dx) * 4;
        out.data[i] = out.data[i + 1] = out.data[i + 2] = 255; out.data[i + 3] = a;
    }
    ctx.putImageData(out, 0, 0);
    const texture = PIXI.Texture.from(canvas);
    texture.baseTexture.scaleMode = PIXI.SCALE_MODES.NEAREST;

    const data = new PIXI.BitmapFontData();
    data.info = [{ face: DISPLAY_FONT, size: src.size }];
    data.common = [{ lineHeight: src.lineHeight }];
    data.page = [{ id: 0, file: "" }];
    data.char = spots.map((s) => {
        const c = src.chars[s.id];
        return { id: s.id, page: 0, x: s.x, y: s.y, width: s.w, height: s.h, xoffset: c.xOffset, yoffset: c.yOffset, xadvance: c.xAdvance + 1 };
    });
    data.kerning = [];
    data.distanceField = [];
    PIXI.BitmapFont.available[DISPLAY_FONT] = new PIXI.BitmapFont(data, [texture], true);
    return DISPLAY_FONT;
}
