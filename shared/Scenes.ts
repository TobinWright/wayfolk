// What a hero's status window shows behind them (the user, 2026-10-29): the
// land they're in, or a backdrop picked from the scenes below, and what
// they're doing in it. Kept on the hero (HeroData.sc: [scene, pose]; none:
// the land, pacing). The art is the client's (art/StatusScenes.ts), in this order.

export const SCENES = [
    "Where they are", "Meadow", "Castle hall", "Tavern", "Starry night", "Sunset beach", "Crystal cave",
    "Library", "Volcano", "Blossom grove", "Dungeon", "Snowy village", "Sky islands", "Autumn woods", "Moonlit lake", "Throne room",
    // (earned, not sorted: one for each kind of season, SEASON_SCENES; shared/Seasons.ts)
    "Spring fair", "Midsummer night", "Harvest moon", "Winter's eve",
    // (more, the user, 2026-11-01: a Supporter's till sorted, shared/Wardrobe NEWER_FROM)
    "Coral reef", "Desert oasis", "Mushroom forest", "Graveyard",
] as const;

// each kind of season's backdrop (by SeasonKind), earned taking part in one (shared/Seasons.ts)
export const SEASON_SCENES = [16, 17, 18, 19];

export const POSES = [
    "Pacing", "Standing", "Looking about", "Running", "Hopping", "Dancing", "Wandering", "Sleeping", "Spinning",
] as const;

// a scene picked, checked (anything out of range: the land, pacing)
export function sceneOf(sc: unknown): [number, number] {
    const ok = (v: unknown, n: number) => Number.isInteger(v) && (v as number) >= 0 && (v as number) < n ? v as number : 0;
    return Array.isArray(sc) ? [ok(sc[0], SCENES.length), ok(sc[1], POSES.length)] : [0, 0];
}
