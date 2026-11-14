import * as PIXI from "pixi.js";
import { SeasonKind } from "../../../../shared/Seasons";
import { hash } from "../../art/Backdrops";
import { AUTUMN_DECOR, Decor, decorTexture, DESERT_DECOR, GRASS_DECOR, HILL_DECOR, SNOW_DECOR } from "../../art/DecorArt";

// Little things lying about the open ground (the user, 2026-11-01: "do
// numbers 2-7", so the wide grass and snow aren't bare), only for looks:
// pebbles, tufts, flowers, mushrooms, bushes and stumps on the grass (leaves
// and dry tufts in Autumn); drifts, snowy rocks, twigs and tracks in the snow
// (the snowy island all year, everywhere in Winter); cacti, bones and pebbles
// in the desert. Only on a tile of open land with open land on its four
// sides (no sea, woods, rivers or other ground) and clear of the places, one
// in about DENSITY of those, from the tile alone, so everyone sees the same. Made
// again when the season or the tiles change (Map).

const TILE = 16;
const DENSITY = 0.26;
const SIDES = [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]];
const PLACE_CLEAR = 2;                  // tiles round a place left bare
// world.json's terrain (the server's TerrainType)
const TUNDRA = 3, DESERT = 6, HILLS = 10;
const GROUND_OK = new Set([2, TUNDRA, DESERT, HILLS]);

// a number 0-1 from a tile and a salt (hashed twice: once, neighbouring tiles' come out bunched)
function rand(k: number, salt: number) {
    return hash((hash(k, salt) * 4294967296) | 0, salt + 1);
}

export class MapDecor {

    public container = new PIXI.Container();

    constructor() {
        this.container.eventMode = "none";
        this.container.interactiveChildren = false;
    }

    // `layers`: the map's tile layers, by name (each a tile per cell, -1 none)
    public make(w: number, h: number, layers: { [name: string]: Int32Array }, terrain: Uint8Array, places: { x: number; y: number }[], season: SeasonKind) {
        for (const c of this.container.removeChildren()) c.destroy();
        const { land, ground } = layers, over = ["sea", "shallows", "river", "cover", "cover2"].map((n) => layers[n]).filter(Boolean);
        if (!land) return;
        const clear = new Uint8Array(w * h);
        for (const p of places) for (let y = p.y - PLACE_CLEAR - 1; y <= p.y + PLACE_CLEAR; y++) for (let x = p.x - PLACE_CLEAR; x <= p.x + PLACE_CLEAR; x++)
            if (x >= 0 && y >= 0 && x < w && y < h) clear[y * w + x] = 1;
        // open: land, nothing over it, on other ground (the desert's sand...) as the tile is or isn't
        const open = (x: number, y: number, g: boolean) => {
            const k = y * w + x;
            return land[k] >= 0 && over.every((l) => l[k] < 0) && (ground?.[k] >= 0) == g;
        };
        for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
            const k = y * w + x;
            if (clear[k] || rand(k, 911) >= DENSITY || !GROUND_OK.has(terrain[k])) continue;
            const g = ground?.[k] >= 0;
            if (!SIDES.every(([dx, dy]) => open(x + dx, y + dy, g))) continue;
            const kinds = this.kinds(terrain[k], season), kind: Decor = kinds[Math.floor(rand(k, 912) * kinds.length)];
            const sprite = new PIXI.Sprite(decorTexture(kind));
            sprite.anchor.set(0.5, 1);
            sprite.position.set(x * TILE + 3 + Math.floor(rand(k, 913) * (TILE - 6)), y * TILE + 5 + Math.floor(rand(k, 914) * (TILE - 6)));
            if (rand(k, 915) < 0.5) sprite.scale.x = -1;
            sprite.cullable = true;
            this.container.addChild(sprite);
        }
    }

    private kinds(terrain: number, season: SeasonKind): Decor[] {
        if (terrain == DESERT) return DESERT_DECOR;
        if (terrain == TUNDRA || season == SeasonKind.WINTER) return SNOW_DECOR;
        if (terrain == HILLS) return HILL_DECOR;
        return season == SeasonKind.AUTUMN ? AUTUMN_DECOR : GRASS_DECOR;
    }

}
