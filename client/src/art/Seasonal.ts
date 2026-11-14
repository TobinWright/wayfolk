import { AP } from "../constants/Palette";
import { SeasonKind } from "../../../shared/Seasons";

// The land in each season (the user, 2026-10-30: "both" - the world map's
// tiles and the hero windows' backdrops). Everything's drawn in Summer's
// colours; a season recolours a picture by what's in it (its role): grass
// and hills, broadleaf trees, pines, rock, rivers, the swamp.
//   Spring: flowers in the grass, blossom on the broadleaf trees.
//   Summer: as drawn.
//   Autumn: broadleaf trees orange, red and gold; grass gone golden at the
//           tips, fallen leaves in it.
//   Winter: grass and hills under snow, broadleaf trees frosted, snow on the
//           tops of pines and rock, rivers frozen, the swamp frosted.
// Used by the backdrops (art/Backdrops) and the world map's tool
// (tools/render-world.js: a tileset for each season but Summer's).

// the world map's tileset for a season (tools/render-world.js writes them; Summer's is as drawn)
export function tilesetFile(season: SeasonKind) {
    return ["world-spring.png", "world.png", "world-autumn.png", "world-winter.png"][season] ?? "world.png";
}

export type Role = "turf" | "leaves" | "pines" | "rock" | "river" | "swamp";

// a picture as Backdrops' Pic and the map tool's tiles both are: w x h colours (-1 none)
export interface Pixels { w: number; h: number; p: number[]; }

// a number for (x, y, salt), the same every time
function noise(x: number, y: number, salt: number) {
    let h = (x * 374761393 + y * 668265263 + salt * 2147483647) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

type Swap = { [colour: number]: number };

// each season's colours swapped outright, by role
const SWAPS: { [k in SeasonKind]?: { [r in Role]?: Swap } } = {
    [SeasonKind.SPRING]: {
        leaves: { [AP.GRASS]: AP.LIME },
    },
    [SeasonKind.AUTUMN]: {
        turf: { [AP.LIME]: AP.STRAW, [AP.PALE]: AP.CREAM, [AP.PINK]: AP.AMBER },
        leaves: { [AP.GRASS]: AP.AMBER, [AP.LEAF]: AP.EMBER, [AP.FOREST]: AP.RUST, [AP.PINE]: AP.OXBLOOD, [AP.LIME]: AP.STRAW },
        swamp: { [AP.LIME]: AP.STRAW, [AP.LEAF]: AP.OCHRE, [AP.GRASS]: AP.AMBER },
    },
    [SeasonKind.WINTER]: {
        turf: {
            [AP.GRASS]: AP.MIST, [AP.LIME]: AP.WHITE, [AP.PALE]: AP.WHITE, [AP.LEAF]: AP.ASH, [AP.FOREST]: AP.STONE, [AP.PINE]: AP.STEEL,
            [AP.PINK]: AP.MIST, [AP.STRAW]: AP.MIST,
        },
        leaves: { [AP.GRASS]: AP.WHITE, [AP.LIME]: AP.WHITE, [AP.LEAF]: AP.MIST, [AP.FOREST]: AP.ASH, [AP.PINE]: AP.STONE },
        river: { [AP.COBALT]: AP.ICE, [AP.SKY]: AP.FOAM, [AP.LEAF]: AP.ASH, [AP.SAND]: AP.MIST },
        swamp: { [AP.LIME]: AP.ASH, [AP.LEAF]: AP.STONE, [AP.FOREST]: AP.STEEL, [AP.GRASS]: AP.MIST },
    },
};

// whether a role looks any different in a season
export function changes(season: SeasonKind, role: Role) {
    if (season == SeasonKind.SUMMER) return false;
    if (season == SeasonKind.SPRING) return role == "turf" || role == "leaves";
    if (season == SeasonKind.AUTUMN) return role == "turf" || role == "leaves" || role == "swamp";
    return true;
}

// a picture recoloured for a season (in place); `salt` keeps one picture's
// speckles from lining up with another's
export function recolour<P extends Pixels>(pic: P, season: SeasonKind, role: Role, salt = 0): P {
    if (!changes(season, role)) return pic;
    const { w, h, p } = pic, swap = SWAPS[season]?.[role] ?? {};
    const was = p.slice();
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const i = y * w + x, c = was[i];
        if (c < 0) continue;
        const r = noise(x, y, salt);
        let out = swap[c] ?? c;
        // (clusters of a few pixels, so the speckles read as leaves and petals rather than noise)
        const clump = noise(x >> 1, y >> 1, salt + 7);
        if (season == SeasonKind.SPRING) {
            if (role == "turf" && c == AP.GRASS && r < 0.012) out = [AP.PINK, AP.WHITE, AP.STRAW][Math.floor(clump * 3)];
            if (role == "leaves" && c == AP.LEAF && clump < 0.28) out = r < 0.75 ? AP.PINK : AP.WHITE;
        } else if (season == SeasonKind.AUTUMN) {
            if (role == "turf" && c == AP.GRASS && r < 0.018) out = [AP.EMBER, AP.AMBER, AP.FLAME][Math.floor(clump * 3)];
            if (role == "leaves" && c == AP.LEAF) out = clump < 0.2 ? AP.FLAME : clump < 0.35 ? AP.AMBER : clump < 0.42 ? AP.RED : AP.EMBER;
        } else if (season == SeasonKind.WINTER) {
            // snow settled on whatever has nothing over it
            const open = y > 0 && was[i - w] < 0;
            if (open && (role == "leaves" || role == "pines" || role == "rock")) out = AP.WHITE;
            else if (open && (role == "turf" || role == "swamp") && c != AP.SAND && c != AP.TAN) out = AP.WHITE;
            else if (role == "pines" && y > 1 && was[i - 2 * w] < 0 && r < 0.6) out = AP.MIST;
        }
        p[i] = out;
    }
    return pic;
}
