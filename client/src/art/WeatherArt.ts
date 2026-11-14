import * as PIXI from "pixi.js";
import { darkness, moonlight, moonPhase, twilight } from "../../../shared/Weather";
import { worldSeasonAt, SeasonKind, SEASONS } from "../../../shared/Seasons";
import { AP } from "../constants/Palette";
import { Backdrop, backdropArt, hash, SCENE_H, SCENE_W } from "./Backdrops";

// Day and night, and rain (shared/Weather), drawn: the colour of the light
// at a time (everything is multiplied by it: white by day, red-gold at dusk
// and dawn, deep blue at night - lighter by a full moon, darker by a new one -, greyer in the rain), raindrops and their
// splashes, the shadow a storm cloud casts on the map, the glow of lit
// windows and campfires at night, and the stars over a hero window's land.
// The season (shared/Seasons.ts) tints the light a little, and in Winter the
// rain falls as snow.

// night's light by the moon (shared/Weather moonlight): a new moon's, a full moon's
const NEW_MOON = 0x353f70, FULL_MOON = 0x6878b4, DUSK = 0xff9858, RAIN = 0x8e98aa;

function mix(a: number, b: number, f: number) {
    let out = 0;
    for (const s of [16, 8, 0]) out |= Math.round(((a >> s) & 255) + (((b >> s) & 255) - ((a >> s) & 255)) * f) << s;
    return out;
}

function times(a: number, b: number) {
    let out = 0;
    for (const s of [16, 8, 0]) out |= Math.round(((a >> s) & 255) * ((b >> s) & 255) / 255) << s;
    return out;
}

// the light at a time (and how hard it's raining, 0 to 1), to multiply what's under it by
export function lightTint(now: number, rain = 0) {
    const night = mix(NEW_MOON, FULL_MOON, moonlight(now));
    let c = times(mix(0xffffff, night, darkness(now)), SEASONS[worldSeasonAt(now).k].light);
    c = times(c, mix(0xffffff, DUSK, twilight(now) * 0.8));
    return rain > 0 ? times(c, mix(0xffffff, RAIN, rain)) : c;
}

// a canvas w x h of [colour, alpha] (null none)
function texture(w: number, h: number, at: (x: number, y: number) => [number, number] | null, linear = false) {
    const canvas = document.createElement("canvas");
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext("2d"), img = ctx.createImageData(w, h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const p = at(x, y);
        if (!p) continue;
        const i = (y * w + x) * 4;
        img.data[i] = (p[0] >> 16) & 255; img.data[i + 1] = (p[0] >> 8) & 255; img.data[i + 2] = p[0] & 255; img.data[i + 3] = Math.round(p[1] * 255);
    }
    ctx.putImageData(img, 0, 0);
    return PIXI.Texture.from(canvas, linear ? { scaleMode: PIXI.SCALE_MODES.LINEAR } : undefined);
}

// a raindrop falling, 1 x 4, fainter at the top; and its splash, 3 x 2
let drop: PIXI.Texture, splash: PIXI.Texture;
export function dropTexture() {
    return drop ??= texture(1, 4, (x, y) => [y == 3 ? AP.FOAM : AP.ICE, 0.25 + y * 0.2]);
}
export function splashTexture() {
    return splash ??= texture(3, 2, (x, y) => (y == 0) != (x == 1) ? null : [AP.FOAM, 0.7]);
}

// in Winter, what falls is snow
export function snowing(now: number) {
    return worldSeasonAt(now).k == SeasonKind.WINTER;
}

// a snowflake on the map, falling or come to rest
let flake: PIXI.Texture;
export function flakeTexture() {
    return flake ??= texture(2, 2, (x, y) => [AP.WHITE, x == y ? 0.95 : 0.6]);
}

// a hero window's falling snow, near (bigger) or far (specks), tiled as the rain's streaks are
let snows: PIXI.Texture[] = [];
export function snowTexture(far: boolean) {
    const k = far ? 1 : 0, S = RAIN_TILE, n = far ? 12 : 7;
    if (snows[k]) return snows[k];
    const marks = new Set<number>();
    for (let i = 0; i < n; i++) {
        const x0 = Math.floor(hash(i, 170 + k) * S), y0 = Math.floor(hash(i, 180 + k) * S);
        marks.add(y0 * S + x0);
        if (!far) { marks.add(y0 * S + (x0 + 1) % S); marks.add(((y0 + 1) % S) * S + x0); }
    }
    return snows[k] = texture(S, S, (x, y) => marks.has(y * S + x) ? [far ? AP.MIST : AP.WHITE, far ? 0.5 : 0.85] : null);
}

// a storm cloud's shadow: round, thinning out to nothing at its edge (smooth: it's scaled up a lot)
let cloud: PIXI.Texture;
export function cloudTexture() {
    const S = 64;
    return cloud ??= texture(S, S, (x, y) => {
        const d = Math.hypot(x + 0.5 - S / 2, y + 0.5 - S / 2) / (S / 2);
        return d >= 1 ? null : [0xffffff, Math.min(1, (1 - d) / 0.45)];
    }, true);
}

// a glow (lamplight, a campfire), GLOW_R map px round: rings of light, fainter out
export const GLOW_R = 20;
let glow: PIXI.Texture;
export function glowTexture() {
    const S = GLOW_R * 2;
    return glow ??= texture(S, S, (x, y) => {
        const d = Math.hypot(x + 0.5 - GLOW_R, y + 0.5 - GLOW_R) / GLOW_R;
        // the rings meet dithered
        const ring = d + (((x + y) & 1) ? 0.04 : -0.04);
        return ring >= 1 ? null : [0xffffff, ring < 0.3 ? 0.55 : ring < 0.6 ? 0.32 : 0.14];
    });
}

// the rain in a hero window: streaks slanting with the wind, a tile that
// repeats (two at once, near and far, at their own pace)
export const RAIN_TILE = 32;
let streaks: PIXI.Texture[] = [];
export function streakTexture(far: boolean) {
    const k = far ? 1 : 0, S = RAIN_TILE, n = far ? 9 : 6, long = far ? 3 : 5;
    if (streaks[k]) return streaks[k];
    const marks = new Set<number>();
    for (let i = 0; i < n; i++) {
        const x0 = Math.floor(hash(i, 70 + k) * S), y0 = Math.floor(hash(i, 80 + k) * S);
        for (let j = 0; j < long; j++) marks.add(((y0 + j) % S) * S + ((x0 - Math.floor(j / 2)) % S + S) % S);
    }
    return streaks[k] = texture(S, S, (x, y) => marks.has(y * S + x) ? [far ? AP.ASH : AP.FOAM, far ? 0.35 : 0.55] : null);
}

// the night sky over a backdrop: stars, and the moon in its phase now
// (shared/Weather moonPhase: none at a new moon), only up where its strips
// never reach (they scroll by under them)
const stars = new Map<string, PIXI.Texture>();
export function starsTexture(kind: Backdrop, now = Date.now()) {
    const phase = Math.round(moonPhase(now) * 8) % 8, key = kind + phase;
    let t = stars.get(key);
    if (t) return t;
    // (lit: x past the line from its dark edge, k: 1 none to -1 all; waxing lit on the right)
    const k = Math.cos(Math.PI * (phase <= 4 ? phase : 8 - phase) / 4), waxing = phase < 4;
    const art = backdropArt(kind);
    let top = SCENE_H;
    for (const { pic } of art.strips) for (let x = 0; x < pic.w; x++) for (let y = 0; y < top; y++)
        if (pic.get(x, y) >= 0) { top = y; break; }
    const sky = top - 2;
    const MOON_X = 128, MOON_Y = 6, MOON_R = 3.5;
    t = texture(SCENE_W, SCENE_H, (x, y) => {
        if (y >= sky) return null;
        // the moon, if there's room for it
        if (sky > MOON_Y + MOON_R) {
            const u = (x + 0.5 - MOON_X) / MOON_R, v = (y + 0.5 - MOON_Y) / MOON_R, d = Math.hypot(u, v);
            if (d <= 1 && (waxing ? u : -u) >= k * Math.sqrt(Math.max(0, 1 - v * v))) return [AP.CREAM, 1];
            if (d <= 1) return [AP.NAVY, 0.35];
            if (d <= 1 + 1.5 / MOON_R) return null;
        }
        const h = hash(y * SCENE_W + x, 90);
        if (h < 0.006) return [AP.WHITE, 0.9];
        if (h < 0.02) return [AP.FOAM, 0.5];
        return null;
    });
    stars.set(key, t);
    return t;
}
