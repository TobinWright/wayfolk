import { HeroData, Skill, SKILL_NAMES } from "./Heroes";
import { danger, materialsAt, levelsOf, MATERIALS } from "./Locations";
import { DUNGEON_KINDS, kindOf, placeName, TOWN_KINDS, WorldPlace } from "./Places";
import { Graph, legLength } from "./Travel";
import { gatherSkill, workRate } from "./Tasks";
import { worldSeasonAt } from "./Seasons";

// Dynamic events (the user, 2026-10-28: "dynamic events players can join to
// work towards a community goal, a world boss, rebuilding a town, upgrading
// something"). The user's picks: heroes take part only by going there and
// working (no hand-ins); events start on their own at random places; one won
// leaves a boon at its place for a while; rewards go by share, with a floor.
// The kinds, names and numbers here are Claude's proposal, open to change.
//
// An event is at one place, for a while (`e`), with a goal (`g`) everyone's
// heroes work towards together (`d`). A hero joins it by an Event task on
// their to-do list (shared/Tasks.ts TaskKind.EVENT: `p` the place, `m` the
// event's id; no amount - they keep at it till it's over). There, each unit
// of work takes UNIT_MS at x1 (quicker by the skill they use for it: a
// Rebuild's or an Upgrade's its stage's, eventStages; else the best
// of the kind's) and adds a point. A boss's are bouts: a fight against it
// (shared/Fights.ts), its health shared, the points what each bout took off
// it, weighed by the level they meet it at so every hero's bout counts about
// the same at its best.
//
// Won (the goal met in time): everyone who gave gets BASE_GOLD and
// GOLD_A_POINT a point; the TOP givers a rare find too; and the place has
// the kind's boon for BOON_MS. Out of time: nothing more (the XP they earned
// working stays). Kinds and boss ids are saved: add new ones at the end.

export enum EventKind { BOSS, REBUILD, UPGRADE, RESTORE, FESTIVAL, MARCH }

// what a boon does at its place: crafting quicker, more XP for what's done
// there, gathering quicker, or exploring finding twice as much
export type Boon = "craft" | "xp" | "gather" | "loot";
export const BOON_RATE = 1.25;      // craft and gather: work x1.25; xp: x1.25 XP
export const BOON_LOOT = 2;         // loot: finds and gold x2

export interface EventDef {
    kind: EventKind;
    name: string;               // the kind's name ("World boss")
    kinds: string[];            // the kinds of place it comes to
    skills: Skill[];            // the skills a hero works on it with (the best of theirs; null: by the place, RESTORE; staged: its stages')
    stages?: Stage[];           // worked through in turn, one skill each (UPGRADE: STAGES_UPGRADE of these, by its id)
    hours: number;              // how long it's on
    boon: Boon;
    boonText: string;
}

// a stage of a staged event: the one skill it's worked with, and what's being done ("Clearing the rubble")
export interface Stage { skill: Skill; name: string; }

export const EVENT_KINDS: EventDef[] = [
    {
        kind: EventKind.BOSS, name: "World boss", kinds: DUNGEON_KINDS, skills: [Skill.FIGHTING], hours: 4,
        boon: "loot", boonText: "Exploring here finds twice as much",
    },
    {
        kind: EventKind.REBUILD, name: "Rebuilding", kinds: TOWN_KINDS, skills: [Skill.MINING, Skill.WOODWORKING, Skill.SMITHING], hours: 6,
        stages: [
            { skill: Skill.MINING, name: "Clearing the rubble" },
            { skill: Skill.WOODWORKING, name: "Raising the timbers" },
            { skill: Skill.SMITHING, name: "The ironwork" },
        ],
        boon: "craft", boonText: "Crafting here is 25% quicker",
    },
    {
        kind: EventKind.UPGRADE, name: "Upgrading", kinds: TOWN_KINDS,
        skills: [Skill.SMITHING, Skill.WOODWORKING, Skill.TAILORING, Skill.JEWELCRAFTING, Skill.ALCHEMY, Skill.COOKING], hours: 6,
        stages: [
            { skill: Skill.WOODWORKING, name: "Raising the frame" },
            { skill: Skill.SMITHING, name: "The ironwork" },
            { skill: Skill.TAILORING, name: "The hangings" },
            { skill: Skill.JEWELCRAFTING, name: "The fittings" },
            { skill: Skill.ALCHEMY, name: "Paints and glazes" },
            { skill: Skill.COOKING, name: "The opening feast" },
        ],
        boon: "xp", boonText: "25% more XP for work done here",
    },
    {
        kind: EventKind.RESTORE, name: "Restoring", kinds: [], skills: null, hours: 5,
        boon: "gather", boonText: "Gathering here is 25% quicker",
    },
    // (the season's own, FESTIVALS: shared/Seasons.ts; the user, 2026-10-30)
    {
        kind: EventKind.FESTIVAL, name: "Festival", kinds: TOWN_KINDS,
        skills: [Skill.FORAGING, Skill.WOODWORKING, Skill.COOKING, Skill.SCOUTING, Skill.FIGHTING, Skill.ALCHEMY, Skill.WOODCUTTING, Skill.TAILORING], hours: 6,
        boon: "xp", boonText: "25% more XP for work done here",
    },
    // a world boss marching from its dungeon on a town (the user, 2026-10-31): below, "Marching";
    // stopped in time, the town it was marching on has the boon; not, the bane (BANE_MS)
    {
        kind: EventKind.MARCH, name: "Boss on the march", kinds: DUNGEON_KINDS, skills: [Skill.FIGHTING], hours: 4,
        boon: "craft", boonText: "Crafting here is 25% quicker",
    },
];

// Each season's festival (by SeasonKind, shared/Seasons.ts): its name, short
// name and three stages, worked through in turn as a Rebuild's are. At most
// one on at once; it's the season's as it started.
export const FESTIVALS: { name: string; title: string; stages: Stage[] }[] = [
    { name: "the Spring Fair", title: "The Spring Fair", stages: [
        { skill: Skill.FORAGING, name: "Gathering the flowers" }, { skill: Skill.WOODWORKING, name: "Building the stalls" }, { skill: Skill.COOKING, name: "The fair's food" },
    ] },
    { name: "the Midsummer Games", title: "Midsummer Games", stages: [
        { skill: Skill.SCOUTING, name: "Marking out the courses" }, { skill: Skill.FIGHTING, name: "The tourney" }, { skill: Skill.COOKING, name: "The midsummer feast" },
    ] },
    { name: "the Harvest Festival", title: "Harvest Festival", stages: [
        { skill: Skill.FORAGING, name: "Bringing in the harvest" }, { skill: Skill.ALCHEMY, name: "Pressing the cider" }, { skill: Skill.COOKING, name: "Baking the harvest loaves" },
    ] },
    { name: "the Winter Feast", title: "The Winter Feast", stages: [
        { skill: Skill.WOODCUTTING, name: "Cutting the yule logs" }, { skill: Skill.TAILORING, name: "Hanging the garlands" }, { skill: Skill.COOKING, name: "The winter feast" },
    ] },
];
export function festivalOf(e: WorldEvent) {
    return FESTIVALS[worldSeasonAt(e.s).k];
}

// the bosses (ids saved: add new ones at the end): e the enemy they look like
// (shared/Fights.ts ENEMIES), drawn bigger; where they come
export interface BossDef { id: number; name: string; e: number; in: string[]; }
export const BOSSES: BossDef[] = [
    { id: 0, name: "Old Grizzle", e: 4, in: ["lair"] },
    { id: 1, name: "The Bone King", e: 6, in: ["ruins", "pyramids", "darktower"] },
    { id: 2, name: "Glimmerqueen", e: 2, in: ["cave", "ruins"] },
    { id: 3, name: "The Ember Wyrm", e: 15, in: ["volcano", "crater", "lair"] },
    { id: 4, name: "Rimefang", e: 11, in: ["icecastle"] },
    { id: 5, name: "The Sand Tyrant", e: 12, in: ["pyramids", "steptemple"] },
    { id: 6, name: "The Stone Colossus", e: 9, in: ["crater", "tower", "steptemple", "icecastle"] },
    { id: 7, name: "Goblin Warlord Grak", e: 5, in: ["cave", "ruins"] },
    { id: 8, name: "The Pharaoh Unwrapped", e: 14, in: ["pyramids"] },
    { id: 9, name: "Cinderhorn", e: 10, in: ["volcano", "darktower", "tower"] },
];

// what's built or upgraded in a town (by a roll), and what's put right at a
// gathering place, each with its short name (eventTitle: a map bubble's, so
// kept to what fits one, at most W_MOST less its padding: 122px in the pixel font)
const REBUILDS: [string, string][] = [
    ["the storm-wrecked mill", "The Mill Rebuild"], ["the burnt granary", "The Granary Rebuild"], ["the fallen bridge", "The Bridge Rebuild"],
    ["the flooded docks", "The Docks Rebuild"], ["the town walls", "The Walls Rebuild"],
];
const UPGRADES: [string, string][] = [
    ["a guildhall", "The Guildhall Raising"], ["a bigger market", "The Market Expansion"], ["a new forge", "The New Forge"],
    ["a scholars' library", "The Library Raising"], ["a grand inn", "The Grand Inn"],
];
const RESTORES: { [kind: string]: [string, string] } = {
    mine: ["Clear the cave-in at #", "The Cave-in"], camp: ["Replant the burnt woods at #", "The Replanting"],
    farm: ["Drive the blight from #", "The Blight"], oasis: ["Dig out the silted #", "The Silted Spring"],
    altar: ["Cleanse the defiled #", "The Defiled Altar"], bigtree: ["Heal the withering #", "The Withering Tree"],
};

// an event as kept and sent: i its id, k its kind, p its place, n its name,
// b the boss (BOSS), s when it started, e when it ends (ms), g the goal and d
// how far it's got (points), w 0 on, 1 won, 2 out of time, 3 a MARCH's boss
// reached its town; u when a won one's boon (a reached one's bane) ends; a
// MARCH's r the travel graph's nodes from its dungeon to the town and h where
// it halts on the way (places, by their index in r: the first and last too)
export interface WorldEvent { i: number; k: EventKind; p: number; n: string; b?: number; s: number; e: number; g: number; d: number; w: number; u?: number; r?: number[]; h?: number[]; }

// and as sent to a player: m their points, t the top givers [name, points,
// 1 a Supporter (their tag, a Premium perk)], c how many heroes are working on it now
export interface EventView extends WorldEvent { m?: number; t?: [string, number, number?][]; c?: number; }

// and one over, in the events window's log (EVENT_PAST): x when it ended, c
// how many players gave, t the top givers (as EventView's, and the rare find
// each got, won), m your points, y the gold you got and f your rare find
export interface PastEvent extends WorldEvent { x: number; c: number; t: [string, number, number?, number?][]; m?: number; y?: number; f?: number; }
export const PAST_MOST = 30;               // in the log

// when one over ended: won, as its boon started; else out of time
export function endedAt(e: WorldEvent) {
    return e.w == 1 && e.u != null ? e.u - BOON_MS : e.e;
}

export function eventDef(kind: EventKind) {
    return EVENT_KINDS[kind];
}

// whether a kind of event can come to a place (RESTORE: one with materials and a line for it)
export function eventFits(kind: EventKind, place: WorldPlace) {
    const k = kindOf(place);
    if (kind == EventKind.RESTORE) return !!RESTORES[k] && materialsAt(k, levelsOf(k)).length > 0;
    if (kind == EventKind.BOSS || kind == EventKind.MARCH) return BOSSES.some((b) => b.in.includes(k));
    return eventDef(kind).kinds.includes(k);
}

// a new event's name (and boss), by a roll 0-1 (a MARCH: `place` its dungeon, `target` the town)
export function eventName(kind: EventKind, place: WorldPlace, roll: number, target?: WorldPlace): { n: string; b?: number } {
    const name = placeName(place), k = kindOf(place);
    const pick = <T>(list: T[]) => list[Math.floor(roll * list.length) % list.length];
    switch (kind) {
        case EventKind.BOSS: {
            const boss = pick(BOSSES.filter((b) => b.in.includes(k)));
            return { n: `${boss.name} at ${name}`, b: boss.id };
        }
        case EventKind.REBUILD: return { n: `Rebuild ${pick(REBUILDS)[0]} of ${name}` };
        case EventKind.UPGRADE: return { n: `Raise ${pick(UPGRADES)[0]} in ${name}` };
        case EventKind.RESTORE: return { n: (RESTORES[k]?.[0] ?? "Restore #").replace("#", name) };
        case EventKind.FESTIVAL: {
            const f = FESTIVALS[worldSeasonAt(Date.now()).k];
            return { n: `Hold ${f.name} in ${name}` };
        }
        case EventKind.MARCH: {
            const boss = pick(BOSSES.filter((b) => b.in.includes(k)));
            return { n: `Stop ${boss.name} marching on ${placeName(target)}`, b: boss.id };
        }
    }
}

// a boss fought in bouts (BOSS, MARCH)
export function isBossEvent(e: { k: EventKind }) {
    return e?.k == EventKind.BOSS || e?.k == EventKind.MARCH;
}

// its short name, for the map's bubble and its window's title (the boss's
// name, or what's being done: "The Mill Rebuild"), found from its name `n`
// (what it says it's doing), so events saved before these came have one too
export function eventTitle(e: WorldEvent) {
    const find = (list: [string, string][]) => list.find(([what]) => e.n.includes(what))?.[1];
    switch (e.k) {
        case EventKind.BOSS: case EventKind.MARCH: return BOSSES.find((b) => b.id == e.b)?.name ?? eventDef(e.k).name;
        case EventKind.REBUILD: return find(REBUILDS) ?? "The Rebuild";
        case EventKind.UPGRADE: return find(UPGRADES) ?? "The Upgrade";
        case EventKind.RESTORE: return find(Object.values(RESTORES).map(([line, title]) => [line.replace(" #", ""), title])) ?? "The Restoring";
        case EventKind.FESTIVAL: return festivalOf(e).title;
    }
}

// Stages (the user, 2026-10-28: heroes switching jobs at an event now and
// then). A Rebuild or an Upgrade is worked through in stages of one skill
// each, by how far it's got (equal parts of its goal): everyone on it moves
// to the next skill together as a stage is done, so each specialist has a
// stage to lead. Working a stage with a weak skill is slower, but never
// slower than STAGE_FLOOR of their pace with their best of its stages' skills.
export const STAGES_UPGRADE = 3;        // an Upgrade's, picked from its six by its id (the feast, if picked, last)
export const STAGE_FLOOR = 0.5;

// a staged event's stages in order (null: it's not staged)
export function eventStages(e: WorldEvent): Stage[] {
    if (e.k == EventKind.FESTIVAL) return festivalOf(e).stages;
    const all = eventDef(e.k).stages;
    if (!all) return null;
    if (e.k != EventKind.UPGRADE) return all;
    let seed = Math.imul(e.i, 2654435761) >>> 0;
    const roll = () => (seed = (Math.imul(seed, 1103515245) + 12345) >>> 0) / 4294967296;
    const pool = all.slice(), picked: Stage[] = [];
    while (picked.length < STAGES_UPGRADE && pool.length) picked.push(pool.splice(Math.floor(roll() * pool.length), 1)[0]);
    const feast = (s: Stage) => s.skill == Skill.COOKING ? 1 : 0;
    return picked.sort((a, b) => feast(a) - feast(b));
}

// the stage it's at (0 on), by how far it's got (null: it's not staged)
export function eventStage(e: WorldEvent) {
    const stages = eventStages(e);
    return stages ? Math.min(stages.length - 1, Math.floor(stages.length * e.d / e.g)) : null;
}

// a hero's pace on it (x1: a unit in UNIT_MS): by the skill they work it with now, or STAGE_FLOOR of their best of its stages'
export function eventRate(h: HeroData, e: WorldEvent, place: WorldPlace) {
    const rate = workRate(h, bestSkill(h.k, eventSkills(e, place))), stages = eventStages(e);
    return stages ? Math.max(rate, STAGE_FLOOR * Math.max(...stages.map((s) => workRate(h, s.skill)))) : rate;
}

// the skills a hero can work on it with now: a staged one's, its stage's;
// a RESTORE's, the place's gathering skill
export function eventSkills(event: WorldEvent, place: WorldPlace) {
    const stage = eventStage(event);
    if (stage != null) return [eventStages(event)[stage].skill];
    const skills = eventDef(event.k).skills;
    if (skills) return skills;
    const k = kindOf(place), found = materialsAt(k, levelsOf(k));
    return [found.length ? gatherSkill(found[0].id) : Skill.MINING];
}

// the one of them a hero's best at (by level; the first if even)
export function bestSkill(levels: number[], skills: Skill[]) {
    return skills.reduce((a, b) => levels[b] > levels[a] ? b : a);
}

export function skillsText(skills: Skill[]) {
    return skills.map((s) => SKILL_NAMES[s]).join(", ");
}

//#region the numbers

export const EVENTS_MOST = 3;               // on at once
export const GAP_LEAST_MS = 20 * 60000;     // between one starting and the next: 20-60 min
export const GAP_MOST_MS = 60 * 60000;
export const UNIT_MS = 60000;               // a unit of work (a boss's bout) at x1: a point
export const GOAL_A_PLAYER = 40;            // points to the goal for each player about as it starts
export const GOAL_PLAYERS_LEAST = 3;        // (counting at least this many)
export const BASE_GOLD = 25;                // won: for everyone who gave
export const GOLD_A_POINT = 3;
export const TOP = 3;                       // the top givers, a rare find each
export const RARE_LEVEL = 9;                // rare finds: a material found this deep or more
export const BOON_MS = 24 * 60 * 60000;

// a goal for so many players about (signed in, or their heroes working away)
export function eventGoal(players: number) {
    return GOAL_A_PLAYER * Math.max(GOAL_PLAYERS_LEAST, players);
}

// A boss bout: the boss meets a hero at the deepest level they'd reach
// there, its defence a group of enemies' at that level, its blows BOSS_HIT
// of theirs (so a hero lasts the bout's 30 rounds, 30-50% hurt, then
// patches up: shared/Fights.ts HURT_MOST). Its points: the health it took
// off, weighed by the level's danger, about one a bout at any level
// (simulated with the party damage formula, 2026-10-28: a new hero of any
// job ~0.9-1, a Fighting 30 Artisan ~1.7, Fighting 60 ~1.1)
export const BOSS_HIT = 0.1, BOUT_DAMAGE = 25;
export function boutPoints(damage: number, level: number) {
    return damage / (danger(level) * BOUT_DAMAGE);
}
// and the other way: the boss's health at a level, for a fight (its whole and what's left)
export function bossHealth(points: number, level: number) {
    return Math.max(1, Math.round(points * danger(level) * BOUT_DAMAGE));
}

// the materials a top giver's rare find is picked from
export function rareFinds() {
    return MATERIALS.filter((m) => m.level >= RARE_LEVEL);
}

// won, what a player who gave `points` gets (the top givers a rare find too: the server rolls it)
export function rewardGold(points: number) {
    return BASE_GOLD + Math.round(GOLD_A_POINT * points);
}

//#endregion

//#region boons in effect

// is it on (not over, not won, in time)
export function isLive(e: WorldEvent, now: number) {
    return e.w == 0 && now < e.e;
}

// the boon in effect at a place (won, till u), as a rate for work there of
// that sort (1: none); where a marching boss reached its town, the bane (its
// boon the other way) till u
export function boonAt(events: WorldEvent[], place: number, boon: Boon, now: number) {
    for (const e of events) {
        if (e.p != place || (e.u ?? 0) <= now || eventDef(e.k).boon != boon) continue;
        if (e.w == 1) return boon == "loot" ? BOON_LOOT : BOON_RATE;
        if (e.w == 3) return 1 / (boon == "loot" ? BOON_LOOT : BOON_RATE);
    }
    return 1;
}

// what a reached one's bane does ("Crafting here is 20% slower": the boon's rate the other way)
export function baneText(e: WorldEvent) {
    return `${eventDef(e.k).boonText.split(" is ")[0]} is 20% slower`;
}

//#endregion

//#region marching (MARCH: the user, 2026-10-31: "world bosses that move: one
// marches toward a town over a few hours, and players have to stop it before
// it gets there")
//
// Its way (r) from its dungeon to the town is split at the places on it (h),
// each leg an equal part of its time: it halts at a place for MARCH_HALT of
// the leg, then walks on to the next. Its place (p) is where it's halted, or
// walking, the next (heroes on it go there to meet it). Not beaten by the
// time it gets there, it lays the town waste: the bane for BANE_MS.

export const MARCH_HALT = 0.6;
export const MARCH_MILES = [60, 160];       // how far its way is, in tiles (a tile a mile)
export const MARCH_STOPS = 3;               // places on the way at least (its dungeon and the town counted)
export const BANE_MS = 12 * 3600000;

// where it is (map px), which way it faces, whether it's halted, and the place it's at or making for (`p`)
export function marchAt(e: WorldEvent, graph: Graph, now: number): { x: number, y: number, face: number, halted: boolean, p: number } {
    const r = e.r ?? [], h = e.h ?? [];
    if (!r.length || h.length < 2) return null;
    const node = (k: number) => graph.get(r[k]);
    const t = Math.max(0, Math.min(1, (now - e.s) / Math.max(1, e.e - e.s)));
    const legs = h.length - 1;
    if (t >= 1) { const n = node(h[legs]); return n && { x: n.x, y: n.y, face: 1, halted: true, p: r[h[legs]] }; }
    const at = Math.min(legs - 1, Math.floor(t * legs)), into = t * legs - at;
    if (into < MARCH_HALT) {
        const n = node(h[at]), next = node(h[at + 1]);
        return n && { x: n.x, y: n.y, face: next && next.x < n.x ? -1 : 1, halted: true, p: r[h[at]] };
    }
    // walking the nodes from one halt to the next, at an even pace
    const f = (into - MARCH_HALT) / (1 - MARCH_HALT), path = r.slice(h[at], h[at + 1] + 1).map((id) => graph.get(id)).filter((n) => n);
    const total = path.slice(1).reduce((sum, n, k) => sum + legLength(path[k], n), 0);
    let along = f * total;
    for (let k = 1; k < path.length; k++) {
        const a = path[k - 1], b = path[k], leg = legLength(a, b);
        if (along <= leg || k == path.length - 1) {
            const g = leg ? Math.min(1, along / leg) : 0;
            return { x: a.x + (b.x - a.x) * g, y: a.y + (b.y - a.y) * g, face: b.x < a.x ? -1 : 1, halted: false, p: r[h[at + 1]] };
        }
        along -= leg;
    }
    const n = node(h[at + 1]);
    return n && { x: n.x, y: n.y, face: 1, halted: false, p: r[h[at + 1]] };
}

// the town it's marching on
export function marchTarget(e: WorldEvent) {
    return e.r?.[e.r.length - 1];
}

//#endregion
