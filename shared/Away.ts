import { EXT, extXp, heroXp, HeroData } from "./Heroes";

// The away summary (the user, 2026-10-29): what a player's heroes did while
// they were signed out, shown as they sign in. The server takes a snapshot as
// they sign out (gold, the stash, each hero's skills) and counts their fights
// meanwhile; signing in, the snapshot is held up against how things are now.

// away less than this: nothing told
export const AWAY_LEAST_MS = 5 * 60 * 1000;

// as they signed out (saved: player_away)
export interface AwaySnap {
    at: number;                                 // when (ms)
    g: number;                                  // gold
    i: [number, number][];                      // the stash, [item id, amount]
    h: { [hero: number]: AwayStart };
}

export interface AwayStart {
    k: number[];                                // skill levels, by Skill
    v: number[];                                // skill XP, by Skill
    e?: [number, number, number][];             // extended skills known: [place in EXTENDED, level, XP] (none: a snapshot from before, not compared)
    w: number;                                  // fights won since
    l: number;                                  // fights lost since
    c?: string[];                               // the last AWAY_CHOICES moments on the road since, as said in their journal (shared/Choices.ts)
    cn?: number;                                // ...and how many there were
}

// moments on the road kept to tell, a hero
export const AWAY_CHOICES = 3;

// one hero's time away
export interface AwayHero {
    i: number;                                  // hero id
    x: number;                                  // XP gained, all skills
    k: [number, number, number][];              // levels gone up: [skill id (an extended one's EXT + its place), from (0: picked up meanwhile), to]
    w: number;                                  // fights won
    l: number;                                  // fights lost
    c?: string[];                               // the last moments on the road, as in their journal (none: no moments)
    cn?: number;                                // ...and how many there were
}

// sent as they sign in (S2C.HERO_AWAY)
export interface AwaySummary {
    t: number;                                  // how long they were away (ms)
    s: number;                                  // their heroes stopped this long after they left (0: still working)
    g: number;                                  // gold gained (or lost)
    i: [number, number][];                      // the stash's changes, [item id, amount] (more first, then less)
    h: AwayHero[];                              // their heroes (those hired since, left out)
}

export function awayStart(h: HeroData): AwayStart {
    return { k: h.k.slice(), v: heroXp(h).slice(), e: (h.e ?? []).map(([e, level]) => [e, level, extXp(h, e)]), w: 0, l: 0 };
}

// how things are now against the snapshot (null: nothing happened)
export function awaySummary(snap: AwaySnap, now: number, stoppedAt: number, gold: number, stash: Map<number, number>,
    heroes: { id: number; d: HeroData }[]): AwaySummary {
    const before = new Map(snap.i);
    const items: [number, number][] = [];
    const ids = Array.from(before.keys()).concat(Array.from(stash.keys()).filter((id) => !before.has(id)));
    for (const id of ids) {
        const n = (stash.get(id) ?? 0) - (before.get(id) ?? 0);
        if (n) items.push([id, n]);
    }
    items.sort((a, b) => b[1] - a[1]);
    const h: AwayHero[] = [];
    for (const hero of heroes) {
        const start = snap.h[hero.id];
        if (!start) continue;
        const v = heroXp(hero.d);
        let x = 0;
        const k: [number, number, number][] = [];
        v.forEach((xp, skill) => {
            x += Math.max(0, xp - (start.v[skill] ?? xp));
            const from = start.k[skill] ?? hero.d.k[skill];
            if (hero.d.k[skill] > from) k.push([skill, from, hero.d.k[skill]]);
        });
        if (start.e) for (const [e, level] of hero.d.e ?? []) {
            const was = start.e.find(([p]) => p == e);
            x += Math.max(0, extXp(hero.d, e) - (was?.[2] ?? 0));
            if (level > (was?.[1] ?? 0)) k.push([EXT + e, was?.[1] ?? 0, level]);
        }
        const row: AwayHero = { i: hero.id, x: Math.round(x), k, w: start.w, l: start.l };
        if (start.c?.length) { row.c = start.c; row.cn = start.cn ?? start.c.length; }
        h.push(row);
    }
    const g = gold - snap.g;
    const t = now - snap.at;
    if (!g && !items.length && !h.some((a) => a.x || a.w || a.l || a.cn)) return null;
    return { t, s: stoppedAt < now ? Math.max(0, stoppedAt - snap.at) : 0, g, i: items, h };
}
