import { HeroData, Job, JOBS, Stat, traitAdd, traitMul } from "./Heroes";
import { danger, heroPower, levelsOf } from "./Locations";
import { baseItem, gearPower, HeroState, mealHeal, POTION_AT, potionOf, Slot, worn, wornPower, wornStats } from "./Tasks";

// Fights (the user, 2026-10-28: on dungeon runs and on the road; lost, no
// loot and hurt; worked out blow by blow; gear split into attack and
// defence). Only watched (DESIGN.md "Hero windows"): the server rolls each
// one (fight) and sends it, the hero's window plays it back blow by blow.
// A hero's power still says how deep they go; in a fight it splits into
// attack and defence - half their own power each, their weapon's on their
// attack, the rest of their gear's on their defence - and their health is by
// it too. Each job fights by its role. Enemies come by the kind of place (a
// dungeon) or the land (the road), a group of 1-4 whose power together is
// ENEMY_SHARE of their level's danger. The numbers are Claude's proposal,
// open to change.

//#region the land

// the kinds of land, by a travel node's terrain (the client's TerrainType:
// the sea and anything else, plains); the hero windows' backdrops are these
export type Land = "plains" | "forest" | "hills" | "mountains" | "desert" | "snow" | "swamp";
export function landOf(terrain: number): Land {
    switch (terrain) {
        case 3: return "snow";                      // tundra
        case 4: case 6: return "desert";            // oasis, desert
        case 7: case 8: return "swamp";             // swamp, marsh
        case 9: return "forest";
        case 10: return "hills";
        case 11: return "mountains";
    }
    return "plains";
}

//#endregion

//#region enemies

// where it's met (dungeon kinds, and "road:" a land for the road), from what
// level (none: the first), and how it leans: health, attack, defence, speed
// (1 an even share). Ids are only sent, never saved, but keep them in order.
// Night ones (the user, 2026-10-29: "different enemies come out at night,
// with rarer drops") are met only at night, alongside the others; each one
// beaten has a NIGHT_DROP chance of leaving one of its `drops` (material
// ids), whatever floor it was met on.
export interface EnemyDef { id: number; name: string; in: string[]; from?: number; m: [number, number, number, number]; night?: 1; drops?: number[]; }
export const ENEMIES: EnemyDef[] = [
    { id: 0, name: "Slime", in: ["cave", "road:swamp"], m: [1.4, 0.8, 0.8, 0.7] },
    { id: 1, name: "Bat", in: ["cave", "tower", "road:mountains"], m: [0.7, 0.9, 0.8, 1.4] },
    { id: 2, name: "Spider", in: ["cave", "ruins", "road:forest"], m: [0.8, 1.2, 0.8, 1.2] },
    { id: 3, name: "Wolf", in: ["lair", "road:plains", "road:forest", "road:hills"], m: [0.9, 1.1, 0.8, 1.3] },
    { id: 4, name: "Bear", in: ["lair", "road:forest"], from: 3, m: [1.5, 1.2, 1.0, 0.7] },
    { id: 5, name: "Goblin", in: ["ruins", "cave", "road:plains", "road:hills", "road:mountains"], m: [0.9, 1.0, 0.9, 1.0] },
    { id: 6, name: "Skeleton", in: ["ruins", "pyramids", "darktower"], m: [0.9, 1.0, 1.2, 0.9] },
    { id: 7, name: "Wisp", in: ["ruins", "darktower", "tower", "crater"], m: [0.6, 1.3, 0.7, 1.3] },
    { id: 8, name: "Snake", in: ["steptemple", "pyramids", "road:desert", "road:swamp"], m: [0.7, 1.2, 0.7, 1.3] },
    { id: 9, name: "Golem", in: ["crater", "icecastle", "tower", "steptemple"], from: 2, m: [1.6, 1.0, 1.4, 0.6] },
    { id: 10, name: "Imp", in: ["volcano", "darktower", "tower"], m: [0.8, 1.2, 0.8, 1.2] },
    { id: 11, name: "Frost Wolf", in: ["icecastle", "road:snow"], m: [1.0, 1.1, 0.9, 1.2] },
    { id: 12, name: "Scorpion", in: ["pyramids", "steptemple", "road:desert"], m: [1.0, 1.2, 1.2, 0.9] },
    { id: 13, name: "Magma Slime", in: ["volcano"], m: [1.4, 1.0, 0.9, 0.7] },
    { id: 14, name: "Mummy", in: ["pyramids"], from: 3, m: [1.3, 1.0, 1.0, 0.7] },
    { id: 15, name: "Drake", in: ["lair", "volcano", "crater"], from: 6, m: [1.4, 1.3, 1.2, 1.0] },
    { id: 16, name: "Ice Wisp", in: ["icecastle", "road:snow"], m: [0.6, 1.3, 0.7, 1.3] },
    // out at night
    { id: 17, name: "Ghost", in: ["ruins", "altar", "road:plains", "road:hills"], m: [0.7, 1.2, 1.1, 1.0], night: 1, drops: [40, 37] },                  // Cursed Ash, Runestone
    { id: 18, name: "Vampire Bat", in: ["cave", "tower", "road:mountains", "road:forest"], m: [0.8, 1.1, 0.8, 1.4], night: 1, drops: [25, 12] },          // Fang, Amethyst
    { id: 19, name: "Werewolf", in: ["lair", "road:forest", "road:plains", "road:hills"], from: 3, m: [1.3, 1.3, 0.9, 1.1], night: 1, drops: [26, 25] }, // Thick Scale, Fang
    { id: 20, name: "Wraith", in: ["darktower", "ruins", "pyramids", "road:swamp"], from: 4, m: [1.0, 1.3, 1.0, 1.0], night: 1, drops: [41, 38] },       // Shadow Essence, Relic Fragment
    { id: 21, name: "Moon Moth", in: ["steptemple", "road:forest", "road:swamp"], m: [0.7, 1.0, 0.7, 1.4], night: 1, drops: [47, 23] },                  // Silk, Golden Sap
    { id: 22, name: "Shade", in: ["pyramids", "crater", "volcano", "road:desert"], from: 2, m: [0.8, 1.3, 0.8, 1.2], night: 1, drops: [43, 31, 42] },    // Gold Leaf, Fire Opal, Void Shard
    { id: 23, name: "Frost Wraith", in: ["icecastle", "road:snow"], from: 2, m: [1.0, 1.2, 1.1, 1.0], night: 1, drops: [35, 34] },                       // Everfrost, Frost Crystal
    // met nowhere by chance: a roaming beast's look (shared/Sights.ts BEASTS)
    { id: 24, name: "Troll", in: [], m: [1.6, 1.2, 1.1, 0.7] },
];

// what's met at a kind of place (or "road:" a land) down to a level, the
// night ones too if `night`
export function enemiesAt(where: string, level: number, night = false) {
    return ENEMIES.filter((e) => e.in.includes(where) && (e.from ?? 1) <= level && (night || !e.night));
}

// at night a group is NIGHT_DANGER times as strong, a night enemy beaten
// leaves one of its drops NIGHT_DROP of the time, and a stop on the road
// brings a fight NIGHT_ROAD times as often
export const NIGHT_DANGER = 1.1, NIGHT_DROP = 0.3, NIGHT_ROAD = 1.5;

// what the night enemies beaten in a won fight left (material ids)
export function nightDrops(f: Fight, rng: () => number) {
    const got: number[] = [];
    if (!f.w) return got;
    for (const x of f.f) {
        const drops = x.s == 1 && x.e != null ? ENEMIES[x.e]?.drops : null;
        if (drops?.length && rng() < NIGHT_DROP) got.push(drops[Math.floor(rng() * drops.length)]);
    }
    return got;
}

// the power of a level's enemies together (a share of its danger), split
// over a group of 1-2 (levels 1-2), 1-3 (3-5) or 1-4; a share each of
// ENEMY_SPLIT, so a bigger group is about as hard as a small one
export const ENEMY_SHARE = 1, ENEMY_SPLIT = 0.77;
export function enemyGroup(where: string, level: number, rng: () => number, night = false): Fighter[] {
    const kinds = enemiesAt(where, level, night);
    if (!kinds.length) return [];
    const most = level < 3 ? 2 : level < 6 ? 3 : 4, n = 1 + Math.floor(rng() * most);
    const each = danger(level) * ENEMY_SHARE * (night ? NIGHT_DANGER : 1) / Math.pow(n, ENEMY_SPLIT);
    return Array.from({ length: n }, () => {
        const e = kinds[Math.floor(rng() * kinds.length)], p = each * (0.9 + 0.2 * rng()), [hp, at, df, sp] = e.m;
        const mx = Math.max(1, Math.round(HP_A_POWER * p * hp));
        return { n: e.name, e: e.id, s: 1, mx, hp: mx, at: p / 2 * at, df: p / 2 * df, sp, cr: 0.05, dg: 0.03 };
    });
}

// the road's levels: the kind "road" (levelsOf: DEFAULT_LEVELS), met one to
// three under the deepest the hero reaches there, so the road's mostly won
export const ROAD = "road";
export function roadLevel(deepest: number, rng: () => number) {
    return Math.max(1, Math.min(levelsOf(ROAD), deepest - Math.floor(rng() * 3)));
}

// met on the road: a ROAD_FIGHT chance on coming to a stop on the way (not a
// town; NIGHT_ROAD times that at night, and by their traits: Trouble Magnet); won, the gold a dungeon run's level brings (exploreGold) and
// ROAD_XP_MS's worth of Fighting XP (taskXp). Beaten, here or down a dungeon,
// nothing found and half the XP
export const ROAD_FIGHT = 0.1, ROAD_XP_MS = 40000, BEATEN_XP = 0.5;

//#endregion

//#region heroes in a fight

// their gear's attack (their weapon) and defence (the rest: armour and shield)
export function wornAttack(h: HeroData) {
    return gearPower(worn(h, Slot.WEAPON));
}
export function wornDefence(h: HeroData) {
    return wornPower(h) - wornAttack(h);
}

// their power from themselves alone (their Fighting, stats and job)
export function ownPower(h: HeroData) {
    return heroPower(h) - wornPower(h);
}

// (an Artisan's gear counts a quarter more)
function gearShare(h: HeroData) {
    return h.j == Job.ARTISAN ? 1.25 : 1;
}

// half their own power and their weapon's (a Ranger's a tenth more; and their traits': Brave...)
export function heroAttack(h: HeroData) {
    return (ownPower(h) / 2 + wornAttack(h) * gearShare(h)) * (h.j == Job.RANGER ? 1.1 : 1) * traitMul(h, "attack");
}

// half their own power and the rest of their gear's (a Warrior's a quarter more; and their traits')
export function heroDefence(h: HeroData) {
    return (ownPower(h) / 2 + wornDefence(h) * gearShare(h)) * (h.j == Job.WARRIOR ? 1.25 : 1) * traitMul(h, "defence");
}

// health: HP_A_POWER a point of their own power and their defence's gear, more by Vitality
export const HP_A_POWER = 10;
export function heroHealth(h: HeroData) {
    const s = wornStats(h);
    return Math.max(1, Math.round(HP_A_POWER * (ownPower(h) + wornDefence(h) * gearShare(h)) * (1 + 0.02 * (s[Stat.VIT] - 10)) * traitMul(h, "health")));
}

// a hero as they go into a fight, `hurt` of their health gone (0-1); at
// `night` or in the rain (`rain`, 0-1) their traits for it count (Night
// Stalker, Storm-Born...); `potion` the one in their Potion slot, if the
// stash has one (a draught's lift counts from the start; drinking a healing
// one and throwing Firepowder are the fight's: fight)
export function heroFighter(id: number, h: HeroData, hurt = 0, night = false, rain = 0, potion = 0): Fighter {
    const s = wornStats(h), mx = heroHealth(h), p = potion ? potionOf(potion) : null;
    const mood = (night ? traitMul(h, "nightFight") : 1) * (1 + (traitMul(h, "rainFight") - 1) * rain);
    const f: Fighter = {
        n: h.n, h: id, s: 0, r: h.j, mx, hp: Math.max(1, Math.round(mx * (1 - hurt))),
        at: heroAttack(h) * mood * (1 + (p?.attack ?? 0)), df: heroDefence(h) * mood * (1 + (p?.defence ?? 0)),
        sp: (1 + 0.02 * (s[Stat.AGI] - 10)) * (1 + (p?.speed ?? 0)),
        cr: Math.max(0, 0.05 + 0.01 * (s[Stat.LCK] - 10) + (h.j == Job.ROGUE ? 0.15 : 0) + traitAdd(h, "crit") + (p?.crit ?? 0)),
        dg: Math.max(0, Math.min(0.3, 0.03 + 0.01 * (s[Stat.AGI] - 10) + traitAdd(h, "dodge"))),
    };
    if (p) f.pt = baseItem(potion);
    return f;
}

// whether a hero used up their potion in a fight: a draught or elixir as it
// started, a healing one if they drank it, Firepowder if they threw it
export function potionUsed(fight: Fight, heroId: number) {
    const i = fight.f.findIndex((x) => x.h == heroId), p = i < 0 ? null : potionOf(fight.f[i].pt ?? 0);
    if (!p) return false;
    return p.heal || p.fire ? fight.b.some((b) => b.p && b.a == i) : true;
}

// how they fight, by their job's role (JOBS): the Warrior (tank) draws the
// enemies' blows, the Ranger (ranged) is seldom reached, the Rogue (striker)
// strikes true more, the Mage hits every enemy (at MAGE_SPLASH, one alone in full), the Cleric
// heals whoever's worst hurt every other turn, the Druid heals everyone every
// third, the Bard spurs everyone on their side (BARD_SPUR more attack), and
// the Artisan's gear counts for more
export const MAGE_SPLASH = 0.6, BARD_SPUR = 0.1, HEAL_AT = 0.7;
export function roleOf(f: Fighter) {
    return f.r == null ? "" : JOBS[f.r]?.role ?? "";
}

//#endregion

//#region a fight, blow by blow

// one in a fight, as it starts: n its name, h a hero's id or e an enemy's
// kind, s its side (0 the heroes, 1 the enemies), r a hero's job; health (mx
// at most, hp now), attack, defence, speed, the chance to strike true (cr) and to dodge (dg);
// g 1 an event's boss (drawn bigger); pt the potion a hero carries in (Tasks POTIONS)
export interface Fighter {
    n: string; h?: number; e?: number; s: number; r?: number; g?: 1; pt?: number;
    mx: number; hp: number; at: number; df: number; sp: number; cr: number; dg: number;
}

// a blow: a who struck, t at whom, d how much (health taken, or given back:
// h), c struck true, m missed (dodged), p with their potion (drunk: a heal on
// themselves; thrown: Firepowder, as the fight starts)
export interface Blow { a: number; t: number; d: number; c?: 1; m?: 1; h?: 1; p?: 1; }

// a fight: l its level, f who was in it as it started (the heroes first), b
// the blows in order, w won (the heroes' side), o what each was left with;
// x a bout against an event's boss (shared/Events.ts): the points it took off it
export interface Fight { l: number; f: Fighter[]; b: Blow[]; w: boolean; o: number[]; x?: number; }

// how long a fight takes to play (as the hero windows play it): the enemies
// coming in, a turn at a time (a turn: one striker's blows in a row), the
// turns all in FIGHT_MOST_MS at most, then won or beaten showing. A hero on
// the road stands where they fought that long (HeroTasks: held up, s.y)
export const FIGHT_IN_MS = 700, BEAT_MS = 450, FIGHT_MOST_MS = 14000, FIGHT_END_MS = 2200;
export function playMs(fight: Fight) {
    let turns = 0, last: number = null;
    for (const b of fight.b) { if (b.a !== last) turns++; last = b.a; }
    return FIGHT_IN_MS + turns * Math.min(BEAT_MS, FIGHT_MOST_MS / Math.max(1, turns)) + FIGHT_END_MS;
}

export const ROUNDS = 30;       // and the heroes fall back, beaten

// how much a blow takes: STRIKE half its attack, less on one whose defence is
// more than their own attack (armoured, a Warrior, a Golem) and more on one
// whose is less (by GUARD, kept to GUARD_MOST either way), a tenth or so
// either way, struck true FIRM more. In line with the attack, and the
// defence against the one struck's own, so a party's blows add up as its
// power does (four of 10 against one of 40 about even)
export const STRIKE = 5, FIRM = 1.6, GUARD = 0.5, GUARD_MOST = 0.4;
export function blow(at: number, target: Fighter) {
    const guard = Math.pow(target.at / Math.max(0.01, target.df), GUARD);
    return STRIKE * at / 2 * Math.max(1 - GUARD_MOST, Math.min(1 + GUARD_MOST, guard));
}

export function fight(level: number, heroes: Fighter[], enemies: Fighter[], rng: () => number = Math.random): Fight {
    const start = [...heroes, ...enemies];
    const f = start.map((x) => ({ ...x })), b: Blow[] = [], turns = f.map(() => 0);
    const alive = (side: number) => f.map((_, i) => i).filter((i) => f[i].s == side && f[i].hp > 0);
    const spur = (side: number) => 1 + BARD_SPUR * alive(side).filter((i) => f[i].r == Job.BARD).length;

    const strike = (a: number, t: number, share: number) => {
        const x = f[a], y = f[t];
        if (rng() < y.dg) { b.push({ a, t, d: 0, m: 1 }); return; }
        const firm = rng() < x.cr, at = x.at * spur(x.s);
        const d = Math.max(1, Math.round(blow(at, y) * (0.85 + 0.3 * rng()) * share * (firm ? FIRM : 1)));
        y.hp = Math.max(0, y.hp - d);
        b.push(firm ? { a, t, d, c: 1 } : { a, t, d });
    };
    const heal = (a: number, t: number, share: number) => {
        const y = f[t], d = Math.min(y.mx - y.hp, Math.max(1, Math.round(STRIKE * f[a].at * share * (0.85 + 0.3 * rng()))));
        y.hp += d;
        b.push({ a, t, d, h: 1 });
    };
    // whom an enemy goes for: the Warrior three times as likely, the Ranger half as
    const pick = (foes: number[]) => {
        const weight = (i: number) => f[i].r == Job.WARRIOR ? 3 : f[i].r == Job.RANGER ? 0.5 : 1;
        let roll = rng() * foes.reduce((sum, i) => sum + weight(i), 0);
        for (const i of foes) if ((roll -= weight(i)) < 0) return i;
        return foes[foes.length - 1];
    };

    // Firepowder and the like, thrown at every enemy as it starts (never dodged)
    f.forEach((x, i) => {
        const fire = potionOf(x.pt ?? 0)?.fire;
        if (!fire) return;
        for (const t of alive(1 - x.s)) {
            const d = Math.max(1, Math.round(blow(x.at, f[t]) * fire * (0.85 + 0.3 * rng())));
            f[t].hp = Math.max(0, f[t].hp - d);
            b.push({ a: i, t, d, p: 1 });
        }
    });
    const drunk = f.map(() => false);

    for (let round = 0; round < ROUNDS && alive(0).length && alive(1).length; round++) {
        const order = f.map((_, i) => i).filter((i) => f[i].hp > 0)
            .map((i) => [i, f[i].sp * (0.8 + 0.4 * rng())]).sort((p, q) => q[1] - p[1]).map((p) => p[0]);
        for (const i of order) {
            const x = f[i];
            if (x.hp <= 0) continue;
            const foes = alive(1 - x.s), friends = alive(x.s), turn = turns[i]++;
            if (!foes.length) break;
            const hurt = friends.filter((j) => f[j].hp < f[j].mx * HEAL_AT);
            const potion = potionOf(x.pt ?? 0)?.heal;
            if (potion && !drunk[i] && x.hp < x.mx * POTION_AT) {
                // a healing potion, drunk once (their turn)
                drunk[i] = true;
                const d = Math.min(x.mx - x.hp, Math.max(1, Math.round(x.mx * potion)));
                x.hp += d;
                b.push({ a: i, t: i, d, h: 1, p: 1 });
            } else if (x.r == Job.CLERIC && turn % 2 == 0 && hurt.length) {
                heal(i, hurt.reduce((p, q) => f[q].hp / f[q].mx < f[p].hp / f[p].mx ? q : p), 1.2);
            } else if (x.r == Job.DRUID && turn % 3 == 2 && hurt.length) {
                for (const j of friends) if (f[j].hp < f[j].mx) heal(i, j, 0.6);
            } else if (x.r == Job.MAGE) {
                for (const j of foes) strike(i, j, foes.length > 1 ? MAGE_SPLASH : 1);
            } else {
                // heroes finish off the weakest; enemies go for whoever draws them
                strike(i, x.s == 0 ? foes.reduce((p, q) => f[q].hp < f[p].hp ? q : p) : pick(foes), 1);
            }
        }
    }
    return { l: level, f: start, b, w: alive(1).length == 0 && alive(0).length > 0, o: f.map((x) => x.hp) };
}

// what a hero's left with after a fight (0-1 of their health gone)
export function hurtAfter(fight: Fight, heroId: number) {
    const i = fight.f.findIndex((x) => x.h == heroId);
    return i < 0 ? 0 : 1 - fight.o[i] / fight.f[i].mx;
}

// "2 Wolves", "a Goblin and a Bat": who they fought
export function foesText(fight: Fight) {
    const count = new Map<string, number>();
    for (const x of fight.f) if (x.s == 1) count.set(x.n, (count.get(x.n) ?? 0) + 1);
    const parts = Array.from(count, ([n, k]) => k == 1 ? `${/^[AEIOU]/.test(n) ? "an" : "a"} ${n}` : `${k} ${n.endsWith("f") ? n.slice(0, -1) + "ves" : n + "s"}`);
    return parts.length > 1 ? `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}` : parts[0] ?? "nobody";
}

//#endregion

//#region getting over it

// hurt heals as time goes by: all of it in HEAL_MS doing anything, in
// HEAL_REST_MS resting. Beaten (HeroState.o), they rest where they are till
// it's healed; and they don't go down a dungeon more than HURT_MOST hurt,
// resting first
export const HEAL_MS = 20 * 60000, HEAL_REST_MS = 5 * 60000, HURT_MOST = 0.3;

// how much of their health comes back a ms (quicker resting, fed, and by their traits)
export function healRate(h: HeroData, s: HeroState, resting: boolean) {
    return traitMul(h, "heal") * (s.n > 0 ? mealHeal(s.m) : 1) * (s.z ?? 1) / (resting ? HEAL_REST_MS : HEAL_MS);
}

// a healer tending those with them out of a fight, themself too (the user,
// 2026-11-03, a player's feedback: "making the cleric heal the tank seems
// impossible", "can we make clerics heal outside battle?"): everyone in a
// party with a Cleric heals TEND_CLERIC x as fast, with a Druid TEND_DRUID x;
// the best of them, not adding up
export const TEND_CLERIC = 2, TEND_DRUID = 1.5;
export function tendMul(party: HeroData[]) {
    return party.some((h) => h.j == Job.CLERIC) ? TEND_CLERIC : party.some((h) => h.j == Job.DRUID) ? TEND_DRUID : 1;
}

//#endregion
