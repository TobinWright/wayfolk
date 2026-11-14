import { HeroData, Skill, SKILL_NAMES, traitMul } from "./Heroes";
import { gatherSkill, recipeOf, Task, TaskKind } from "./Tasks";
import { Graph, isSeaLeg, legLength } from "./Travel";
import { isNight, rainAt, Storm, storms } from "./Weather";
import { worldSeasonAt, SeasonKind, seasonPace, SEASON_PACE, SEASONS } from "./Seasons";

// The time of day and the weather making a difference (the user, 2026-10-29:
// "make the weather and day/night matter"). Both are worked out from the
// clock (shared/Weather.ts), so both sides know them without anything sent:
// - rain helps foraging and fishing (RAIN_HELPS more in a downpour) and slows
//   travel (RAIN_SLOWS);
// - traits that care about the time of day or the rain (Night Owl, Rain
//   Lover...: shared/Heroes.ts) work and travel quicker or slower;
// - night brings its own enemies, with rarer drops, and more of them on the
//   road (shared/Fights.ts NIGHT_*);
// - a storm can batter heroes crossing the sea (STORM_RISK);
// - the season (shared/Seasons.ts, 2026-10-30): its skills work quicker, and
//   Summer's dry roads and Winter's snow change travel.
// The server works heroes out a CONDITION_STEP at a time (never across a
// dawn or dusk), going by the time and weather where they are at the start of
// each. The numbers are Claude's proposal, open to change.

export interface Conditions {
    night: boolean;
    rain: number;           // 0 dry to 1 pouring
    sea?: boolean;          // on a sea crossing
    season?: SeasonKind;    // (none: no season's difference)
}

export const RAIN_SLOWS = 0.3;                          // travel x0.7 in a downpour
export const RAIN_HELPS = 0.25;                         // ...and these skills x1.25
export const RAIN_SKILLS = [Skill.FORAGING, Skill.FISHING];
export const STORM_RISK = 0.3;                          // a sea crossing in a downpour: the chance of being battered
export const STORM_HURT = 0.35;                         // ...and how much of their health it takes
export const CONDITION_STEP = 60000;

// a hero's place on the map (map px): at their node, or along the leg they're on
export function heroAt(graph: Graph, s: { p: number, r: number[], l: number }) {
    const from = graph.get(s.p), to = s.r.length ? graph.get(s.r[0]) : null;
    if (!from) return { x: 0, y: 0, sea: false };
    if (!to) return { x: from.x, y: from.y, sea: false };
    const leg = legLength(from, to), t = leg ? Math.min(1, s.l / leg) : 0;
    return { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t, sea: isSeaLeg(from, to) };
}

export function conditionsAt(x: number, y: number, now: number, sea = false, under: Storm[] = storms(now)): Conditions {
    return { night: isNight(now), rain: rainAt(x, y, now, under), sea, season: worldSeasonAt(now).k };
}

// their traits for the time of day and the rain (in full in a downpour)
function moodPace(h: HeroData, c: Conditions) {
    return traitMul(h, c.night ? "night" : "day") * (1 + (traitMul(h, "rain") - 1) * c.rain);
}

// the skill a task's work is done with, for the weather (-1: none in particular: a shift, an event)
export function workSkillOf(w: Task) {
    switch (w?.k) {
        case TaskKind.GATHER: return gatherSkill(w.m);
        case TaskKind.CRAFT: return recipeOf(w.m)?.skill ?? -1;
        case TaskKind.EXPLORE: case TaskKind.ADVENTURE: return Skill.SCOUTING;
    }
    return -1;
}

// x how quick at work now: `skill` the one it's done with (-1: none of them, a shift or an event)
export function workPace(h: HeroData, c: Conditions, skill: number) {
    return moodPace(h, c) * (RAIN_SKILLS.includes(skill) ? 1 + RAIN_HELPS * c.rain : 1) * (c.season != null ? seasonPace(c.season, skill) : 1);
}

// x how quick on the road now
export function travelPace(h: HeroData, c: Conditions) {
    return moodPace(h, c) * (1 - RAIN_SLOWS * c.rain) * (c.sea ? traitMul(h, "sea") : 1) * (c.season != null ? SEASONS[c.season].travel : 1);
}

// the chance a sea crossing ends battered by a storm, by how hard it's raining
export function stormChance(h: HeroData, rain: number) {
    return STORM_RISK * rain * traitMul(h, "storm");
}

// how hard it's raining, in a word
export function rainWord(rain: number) {
    return rain <= 0.02 ? "dry" : rain < 0.35 ? "drizzling" : rain < 0.7 ? "raining" : "pouring";
}

// what the time and weather make of them now, in a few words ("Night, raining:
// works x1.15, travels x0.81"), and a longer say on why
export function conditionsText(h: HeroData, c: Conditions, skill: number) {
    const work = workPace(h, c, skill), travel = travelPace(h, c);
    const head = `${c.night ? "Night" : "Day"}, ${rainWord(c.rain)}${c.sea ? ", at sea" : ""}`;
    const x = (n: number) => `x${n.toFixed(2)}`;
    const why = [
        head,
        `Works ${x(work)} now, travels ${x(travel)}`,
        ...(c.rain > 0.02 ? [`Rain: travel up to ${Math.round(RAIN_SLOWS * 100)}% slower, Foraging and Fishing up to ${Math.round(RAIN_HELPS * 100)}% quicker`] : []),
        ...(c.night ? ["Night: other beasts about, with rarer drops"] : []),
        ...(c.sea && c.rain > 0.02 ? ["A storm at sea may batter them"] : []),
        ...(c.season != null ? [`${SEASONS[c.season].name}: ${SEASONS[c.season].skills.map((s) => SKILL_NAMES[s]).join(", ")} ${Math.round((SEASON_PACE - 1) * 100)}% quicker; ${SEASONS[c.season].more}`] : []),
    ];
    return { short: `${head}: works ${x(work)}, travels ${x(travel)}`, long: why.join("\n"), work, travel };
}
