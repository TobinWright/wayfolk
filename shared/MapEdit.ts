// The map editor (the user, 2026-10-31: "build me a robust map editor for the
// admin menu", "it should paint autotiles"): editors paint the world map's
// land, sea, snow, grounds, woods, hills, mountains and rivers over the map
// itself, its tiles chosen from what's painted round them as the map was
// built (client art/WorldAutotile). The editor works the tiles out and sends
// them (MAPED_PAINT): the server keeps them in world.json, and what was
// painted, corner by corner, in client/tools/world-paint.json, which
// tools/render-world.js puts over what it works out (so the next npm run
// world keeps it). Everyone online sees it as it's painted (MAPED_TILES).
// Client components/mapeditor; server managers/network/MapEdHandler.

// what's painted, as world-paint.json and a MapPaint's p name them (corners:
// land, ground, cover; tiles: snow, river)
export const PAINT_FIELDS = ["land", "snow", "ground", "cover", "river"];
export const PAINT_LAND = 0, PAINT_SNOW = 1, PAINT_GROUND = 2, PAINT_COVER = 3, PAINT_RIVER = 4;
// each field's highest value (river: its ways, TO_N...; -1 none)
export const PAINT_MOST = [1, 1, 3, 7, 15];
export const UNPAINTED = 255, RIVER_UNPAINTED = -2;

// numbers in one MapPaint's c, e and p together at most (the server takes 64 KB a message)
export const PAINT_PART_MOST = 9000;

// A place put on the map, moved, changed or taken off (MAPED_PLACE): the
// server changes world.json's places, world-layout.ts's PLACES and the
// place's node (moved with it; a new one's made, linked to the nearest; one
// taken off the map stays, as a waypoint) and tells everyone (MAPED_PLACES).
// The editor paints the ground under it as render-world.js has it (land
// under it, a clearing round it: Painter.settle).
export interface MapPlace { k: number; s: number; x: number; y: number; n: string; }   // (shared/Places WorldPlace's, but its id)
export const PLACE_NAME_LONGEST = 40;
// world.json's tiles are world-layout.ts's this far over and down (render-world.js PAD_X, PAD)
export const LAYOUT_PAD_X = 50, LAYOUT_PAD_Y = 16;

// tiles and corners painted, all as flat lists
export interface MapPaint {
    t: number;              // the token it's answered with
    c: number[];            // [layer, tile number (y * w + x), tile (-1 none)]...: the tiles as they are now
    e: number[];            // [tile number, TerrainType]...: what they are now
    p: number[];            // [field (PAINT_FIELDS), corner or tile number, value]...: what was painted
}
