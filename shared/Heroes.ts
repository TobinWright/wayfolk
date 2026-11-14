// Heroes: the rules the client and server both use (DESIGN.md "Heroes").
// A hero is picked from premade heroes on a town's board and is fixed from
// then on (no renaming, no changing looks); they differ by stats, skills,
// job and traits. What they've trained (skills) matters most; what they were
// born with makes them about 20-40% better or worse at something.
//
// Ids are saved in heroes (the database's hero rows): never renumber an enum
// here or rename a trait or a board's id; add new ones at the end.

export enum Stat { STR, AGI, INT, VIT, LCK }
export const STAT_NAMES = ["Strength", "Agility", "Intellect", "Vitality", "Luck"];
export const STAT_SHORT = ["STR", "AGI", "INT", "VIT", "LCK"];

// only humans for now (the user's call); the others' tilts are in DESIGN.md
export enum Race { HUMAN }
export const RACES = [
    { name: "Human", tilt: [0, 0, 0, 0, 0], traits: 1 },     // traits: how many more than others they get
];

export enum Sex { MALE, FEMALE }

// the core skills, levels 1-SKILL_MAX, every hero has all of them: one each for the sites' activities
// (new ones go on the end: heroes are saved with their levels by Skill)
export enum Skill { MINING, WOODCUTTING, FORAGING, FISHING, HUNTING, SMITHING, WOODWORKING, ALCHEMY, COOKING, TAILORING, FIGHTING, SCOUTING, JEWELCRAFTING }
export const SKILL_NAMES = ["Mining", "Woodcutting", "Foraging", "Fishing", "Hunting", "Smithing", "Woodworking", "Alchemy", "Cooking", "Tailoring", "Fighting", "Scouting", "Jewelcrafting"];
// 60 for now (the user, 2026-11-03): past the last tier's 51, raised as tiers are added. XP still
// gathers past it, so raising it brings the levels it's worth at once
export const SKILL_MAX = 60;

// Skill XP (Claude's proposal, 2026-10-28, open to change): a skill's level
// comes from the XP put into it. Going up from a level takes 50 x level +
// 0.6 x level^3 (to the nearest 5): at a new hero's pace, level 2 in about
// two minutes, 10 in an hour and a half, 30 in two days, 50 in ten, 100 in
// about three months of one skill.
export function levelXp(level: number) {
    return Math.round((50 * level + 0.6 * level ** 3) / 5) * 5;
}
// the XP each level starts at (XP_AT[1]: 0)
export const XP_AT: number[] = [0, 0];
for (let l = 2; l <= SKILL_MAX; l++) XP_AT[l] = XP_AT[l - 1] + levelXp(l - 1);
export function levelAt(xp: number) {
    let level = 1;
    while (level < SKILL_MAX && xp >= XP_AT[level + 1]) level++;
    return level;
}

// The extended skills (the user, 2026-10-29): skills like the core ones,
// levels 1-100 on the same XP curve, but no hero starts out knowing any.
// Anyone can learn any of them, at an academy or out in the wild; once
// learned they're at level 1 and train like the rest. (They open things - an
// event's choice, a site's special action - rather than speed work.)
// Saved by their place here: never reorder, add new ones at the end.
export const EXTENDED = [
    "Acrobatics", "Anatomy", "Anthropology", "Appraising", "Astrology", "Artistry", "Balancing", "Bartering", "Blackmail", "Bluffing",
    "Boxing", "Brewing", "Calligraphy", "Camping", "Camouflage", "Cartography", "Cobbling", "Cryptography", "Dancing", "Demolition",
    "Detection", "Disarm Trap", "Diplomacy", "Disarm", "Disguise", "Enchanting", "Engineering", "Escape", "Farming", "Fencing",
    "First Aid", "Flirting", "Folklore", "Fortune Telling", "Gambling", "Healing Magic", "Hypnotism", "Impersonation", "Investigation", "Juggling",
    "Jumping", "Language", "Leatherworking", "Lip Reading", "Navigation", "Pickpocketing", "Research", "Riding", "Scribing", "Sculpting",
    "Seamanship", "Seduction", "Sleight of Hand", "Stealth", "Stonemasonry", "Storytelling", "Survival", "Swimming", "Taming", "Teaching",
    "Tracking", "Trapping", "Weaving", "Leadership",
];

// A skill's id over both sets, where one could be either (specialties): a
// core skill's Skill, an extended one's EXT + its place in EXTENDED.
export const EXT = 1000;
export function isExtended(id: number) {
    return id >= EXT;
}
export function skillName(id: number) {
    return isExtended(id) ? EXTENDED[id - EXT] : SKILL_NAMES[id];
}

// Specialties (the user, 2026-10-29): each hero is a natural at 1 or 2
// skills, core or extended (an even chance of each), rolled as they're made:
// they learn them SPECIALTY_XP times as fast. An extended one still has to be
// learned first.
export const SPECIALTY_XP = 1.5;
export function rollSpecialties(random: () => number = Math.random) {
    const n = random() < 0.5 ? 1 : 2, got: number[] = [];
    while (got.length < n) {
        const id = random() < 0.5 ? Math.floor(random() * SKILL_NAMES.length) : EXT + Math.floor(random() * EXTENDED.length);
        if (!got.includes(id)) got.push(id);
    }
    return got;
}
export function isSpecialty(h: HeroData, id: number) {
    return h.p?.includes(id) ?? false;
}

// each job a role in fights and 3 favoured skills (x1.1 at them, 25% more XP)
export enum Job { WARRIOR, RANGER, ROGUE, MAGE, CLERIC, DRUID, ARTISAN, BARD }
export const JOBS = [
    { name: "Warrior", role: "Tank", skills: [Skill.FIGHTING, Skill.MINING, Skill.SMITHING], does: "In a fight, draws the enemies' blows: three times as likely to be struck" },
    { name: "Ranger", role: "Ranged", skills: [Skill.HUNTING, Skill.SCOUTING, Skill.WOODCUTTING], does: "In a fight, stays further off: half as likely to be struck" },
    { name: "Rogue", role: "Striker", skills: [Skill.SCOUTING, Skill.FISHING, Skill.TAILORING], does: "In a fight, strikes true more often" },
    { name: "Mage", role: "Magic", skills: [Skill.ALCHEMY, Skill.FORAGING, Skill.TAILORING], does: "In a fight, strikes every enemy at once" },
    { name: "Cleric", role: "Healer", skills: [Skill.FIGHTING, Skill.COOKING, Skill.FORAGING], does: "In a fight, heals whoever's worst hurt, every other turn. Out of one, their party heals twice as fast" },
    { name: "Druid", role: "Nature", skills: [Skill.FORAGING, Skill.WOODCUTTING, Skill.FISHING], does: "In a fight, heals everyone a little, every third turn. Out of one, their party heals 1.5x as fast" },
    { name: "Artisan", role: "Crafter", skills: [Skill.SMITHING, Skill.WOODWORKING, Skill.JEWELCRAFTING], does: "In a fight, gets more out of their gear" },
    { name: "Bard", role: "Support", skills: [Skill.COOKING, Skill.WOODWORKING, Skill.SCOUTING], does: "In a fight, spurs everyone on their side on: more attack" },
];

// Traits (the user, 2026-10-29: "a full game's worth"), good (worth 1), bad
// (-1) or both (0), 1-2 a hero (humans one more). Each says what it does in
// `text` and does it by the fields under it, read where the thing they touch
// is worked out (traitMul, traitAdd, traitWork). Two of a `group` never roll
// together (Night Owl and Night Blind). `rare` ones are in the running only
// now and then on a level 1 board (RARE_CHANCE), always on higher ones. The
// numbers are Claude's proposal, open to change: mostly 10-20%, as DESIGN.md
// has it. (Ids are saved: never rename one; add new ones at the end.)
export interface TraitDef {
    name: string; text: string; worth: number; rare?: boolean; group?: string;
    stats?: number[];           // added to the rolled ones
    work?: number;              // x how quick at all work (gathering, crafting, events, dungeon runs, adventures)
    skills?: Skill[];           // ...and x `skill` at these
    skill?: number;
    craft?: number;             // x how quick at crafting
    travel?: number;            // x travel speed
    day?: number;               // x work and travel speed by day
    night?: number;             // ...and at night
    rain?: number;              // ...in the rain (in full in a downpour, less in a drizzle)
    sea?: number;               // x travel speed on a sea crossing
    storm?: number;             // x the chance of a storm at sea battering them
    xp?: number;                // x XP
    dayXp?: number;             // x XP by day
    nightXp?: number;           // ...and at night
    specialty?: number;         // their specialties learned this many times as fast (not SPECIALTY_XP)
    learn?: number;             // x the chance of picking up an extended skill
    gold?: number;              // x gold earned and found
    extra?: number;             // a chance one gathered brings another
    twin?: number;              // a chance one crafted makes two
    thrift?: number;            // a chance one crafted takes no materials
    fumble?: number;            // a chance one gathered or crafted comes to nothing
    find?: number;              // x finds on dungeon runs and adventures
    heal?: number;              // x how quick they heal
    road?: number;              // x the chance of a fight on the road
    attack?: number;            // x attack, defence and health in a fight
    defence?: number;
    health?: number;
    crit?: number;              // + the chance to strike true, and to dodge
    dodge?: number;
    nightFight?: number;        // x attack and defence fighting at night
    rainFight?: number;         // ...and in the rain
}
const S = Skill;
export const TRAITS: { [id: string]: TraitDef } = {
    strongback: { name: "Strong Back", text: "Carries more: 1 in 10 gathered brings another, and 15% more finds", worth: 1, extra: 0.1, find: 1.15 },
    nightowl: { name: "Night Owl", text: "Works and travels 15% quicker at night", worth: 1, group: "time", night: 1.15 },
    lucky: { name: "Lucky", text: "Luck +3", worth: 1, group: "luck", stats: [0, 0, 0, 0, 3] },
    lazy: { name: "Lazy", text: "Works 10% slower, heals twice as fast", worth: 0, group: "pace", work: 0.9, heal: 2 },
    greedy: { name: "Greedy", text: "20% more gold, 20% less XP", worth: 0, group: "gold", gold: 1.2, xp: 0.8 },
    fastlearner: { name: "Fast Learner", text: "20% more XP", worth: 1, group: "learn", xp: 1.2 },
    clumsy: { name: "Clumsy", text: "Fumbles 1 in 20 things gathered or crafted", worth: -1, group: "craft", fumble: 0.05 },
    // the time of day
    earlybird: { name: "Early Bird", text: "Works and travels 10% quicker by day", worth: 1, group: "time", day: 1.1 },
    nightblind: { name: "Night Blind", text: "Works and travels 15% slower at night, and fights 10% worse", worth: -1, group: "time", night: 0.85, nightFight: 0.9 },
    nocturnal: { name: "Nocturnal", text: "Works and travels 20% quicker at night, 10% slower by day", worth: 0, group: "time", night: 1.2, day: 0.9 },
    moontouched: { name: "Moon-Touched", text: "30% more XP at night", worth: 1, rare: true, group: "xptime", nightXp: 1.3 },
    sunblessed: { name: "Sun-Blessed", text: "20% more XP by day, and heals 25% quicker", worth: 1, rare: true, group: "xptime", dayXp: 1.2, heal: 1.25 },
    nightstalker: { name: "Night Stalker", text: "Fights 20% better at night", worth: 1, rare: true, group: "dark", nightFight: 1.2 },
    superstitious: { name: "Superstitious", text: "Fights 10% worse at night", worth: -1, group: "dark", nightFight: 0.9 },
    // the weather and the sea
    rainlover: { name: "Rain Lover", text: "Works and travels 15% quicker in the rain", worth: 1, group: "rain", rain: 1.15 },
    fairweather: { name: "Fair-Weather", text: "Works and travels 15% slower in the rain", worth: -1, group: "rain", rain: 0.85 },
    stormborn: { name: "Storm-Born", text: "Fights 15% better in the rain; storms at sea never batter them", worth: 1, rare: true, group: "sea", rainFight: 1.15, storm: 0 },
    sealegs: { name: "Sea Legs", text: "Crosses the sea 20% quicker, half as likely to be battered by a storm", worth: 1, group: "sea", sea: 1.2, storm: 0.5 },
    seasick: { name: "Seasick", text: "Crosses the sea 20% slower, twice as likely to be battered by a storm", worth: -1, group: "sea", sea: 0.8, storm: 2 },
    // at a skill
    greenthumb: { name: "Green Thumb", text: "Forages 15% quicker", worth: 1, skills: [S.FORAGING], skill: 1.15 },
    angler: { name: "Angler", text: "Fishes 15% quicker", worth: 1, skills: [S.FISHING], skill: 1.15 },
    stonehand: { name: "Stonehand", text: "Mines 15% quicker", worth: 1, skills: [S.MINING], skill: 1.15 },
    axearm: { name: "Axe Arm", text: "Cuts wood 15% quicker", worth: 1, skills: [S.WOODCUTTING], skill: 1.15 },
    keennose: { name: "Keen Nose", text: "Hunts 15% quicker", worth: 1, skills: [S.HUNTING], skill: 1.15 },
    forgeborn: { name: "Forge-Born", text: "Smiths 15% quicker", worth: 1, skills: [S.SMITHING], skill: 1.15 },
    whittler: { name: "Whittler", text: "Woodworks 15% quicker", worth: 1, skills: [S.WOODWORKING], skill: 1.15 },
    herbalist: { name: "Herbalist", text: "Alchemy 15% quicker", worth: 1, skills: [S.ALCHEMY], skill: 1.15 },
    gourmet: { name: "Gourmet", text: "Cooks 15% quicker", worth: 1, skills: [S.COOKING], skill: 1.15 },
    steadyhands: { name: "Steady Hands", text: "Tailoring and Jewelcrafting 10% quicker", worth: 1, skills: [S.TAILORING, S.JEWELCRAFTING], skill: 1.1 },
    pathfinder: { name: "Pathfinder", text: "Scouts 15% quicker: quicker dungeon runs and adventures", worth: 1, skills: [S.SCOUTING], skill: 1.15 },
    // at work
    hardworker: { name: "Hard Worker", text: "Works 10% quicker", worth: 1, group: "pace", work: 1.1 },
    distracted: { name: "Easily Distracted", text: "Works 10% slower", worth: -1, group: "pace", work: 0.9 },
    butterfingers: { name: "Butterfingers", text: "Crafts 10% slower", worth: -1, group: "craft", craft: 0.9 },
    perfectionist: { name: "Perfectionist", text: "Crafts 15% slower, but 1 in 8 crafted makes two", worth: 0, group: "craft", craft: 0.85, twin: 0.125 },
    thrifty: { name: "Thrifty", text: "1 in 10 things crafted takes no materials", worth: 1, thrift: 0.1 },
    haggler: { name: "Haggler", text: "15% more gold", worth: 1, group: "gold", gold: 1.15 },
    spendthrift: { name: "Spendthrift", text: "15% less gold", worth: -1, group: "gold", gold: 0.85 },
    treasurehunter: { name: "Treasure Hunter", text: "30% more finds on dungeon runs and adventures", worth: 1, rare: true, find: 1.3 },
    // learning
    slowlearner: { name: "Slow Learner", text: "15% less XP", worth: -1, group: "learn", xp: 0.85 },
    curious: { name: "Curious", text: "Picks up extended skills twice as often", worth: 1, learn: 2 },
    prodigy: { name: "Prodigy", text: "Learns their specialties twice as fast (not 1.5x)", worth: 1, rare: true, specialty: 2 },
    bookworm: { name: "Bookworm", text: "Intellect +3, Strength -1", worth: 0, group: "str", stats: [-1, 0, 3, 0, 0] },
    // the body
    brawny: { name: "Brawny", text: "Strength +2", worth: 1, group: "str", stats: [2, 0, 0, 0, 0] },
    frail: { name: "Frail", text: "Strength -2", worth: -1, group: "str", stats: [-2, 0, 0, 0, 0] },
    nimble: { name: "Nimble", text: "Agility +2", worth: 1, stats: [0, 2, 0, 0, 0] },
    hardy: { name: "Hardy", text: "Vitality +2, and heals 25% quicker", worth: 1, group: "vit", stats: [0, 0, 0, 2, 0], heal: 1.25 },
    sickly: { name: "Sickly", text: "Vitality -2, and heals 25% slower", worth: -1, group: "vit", stats: [0, 0, 0, -2, 0], heal: 0.75 },
    unlucky: { name: "Unlucky", text: "Luck -3", worth: -1, group: "luck", stats: [0, 0, 0, 0, -3] },
    // getting about
    wanderer: { name: "Wanderer", text: "Travels 10% quicker", worth: 1, group: "travel", travel: 1.1 },
    heavyfoot: { name: "Heavy-Footed", text: "Travels 10% slower", worth: -1, group: "travel", travel: 0.9 },
    restless: { name: "Restless", text: "Travels 15% quicker, works 5% slower", worth: 0, group: "travel", travel: 1.15, work: 0.95 },
    troublemagnet: { name: "Trouble Magnet", text: "Runs into twice as many fights on the road", worth: 0, group: "road", road: 2 },
    lightfoot: { name: "Light-Footed", text: "Runs into half as many fights on the road", worth: 1, group: "road", road: 0.5 },
    // fighting
    brave: { name: "Brave", text: "10% more attack", worth: 1, group: "nerve", attack: 1.1 },
    cowardly: { name: "Cowardly", text: "10% less attack, but dodges more", worth: 0, group: "nerve", attack: 0.9, dodge: 0.05 },
    berserker: { name: "Berserker", text: "25% more attack, 10% less defence", worth: 1, rare: true, group: "nerve", attack: 1.25, defence: 0.9 },
    thickskin: { name: "Thick-Skinned", text: "10% more defence", worth: 1, group: "skin", defence: 1.1 },
    glassjaw: { name: "Glass Jaw", text: "15% less health in a fight", worth: -1, group: "skin", health: 0.85 },
    sharpeye: { name: "Sharp Eye", text: "Strikes true more often", worth: 1, crit: 0.05 },
};

// a rare trait's chance of being in the running for a hero on a level 1 board
export const RARE_CHANCE = 0.15;

type MulKey = "work" | "craft" | "travel" | "sea" | "storm" | "xp" | "learn" | "gold" | "find" | "heal" | "road"
    | "attack" | "defence" | "health" | "day" | "night" | "rain" | "dayXp" | "nightXp" | "nightFight" | "rainFight";
type AddKey = "extra" | "twin" | "thrift" | "fumble" | "crit" | "dodge";

// a hero's traits' `key`s multiplied together (1: none has it)
export function traitMul(h: HeroData, key: MulKey) {
    let m = 1;
    for (const t of h.t) m *= TRAITS[t]?.[key] ?? 1;
    return m;
}
// ...or added up (0: none)
export function traitAdd(h: HeroData, key: AddKey) {
    let n = 0;
    for (const t of h.t) n += TRAITS[t]?.[key] ?? 0;
    return n;
}

// x how quick at a skill from their traits: at all work, at the skill, at crafting
export const CRAFT_SKILLS = [Skill.SMITHING, Skill.WOODWORKING, Skill.ALCHEMY, Skill.COOKING, Skill.TAILORING, Skill.JEWELCRAFTING];
export function traitWork(h: HeroData, skill: Skill) {
    let m = 1;
    for (const id of h.t) {
        const t = TRAITS[id];
        if (!t) continue;
        m *= t.work ?? 1;
        if (t.skills?.includes(skill)) m *= t.skill ?? 1;
        if (t.craft && CRAFT_SKILLS.includes(skill)) m *= t.craft;
    }
    return m;
}

// how many times as fast they learn their specialties
export function specialtyXp(h: HeroData) {
    return Math.max(SPECIALTY_XP, ...h.t.map((t) => TRAITS[t]?.specialty ?? 0));
}

// `n` traits for a new hero off a board of `level`: none two of a group
export function rollTraits(n: number, level: number, random: () => number = Math.random) {
    const pool = Object.keys(TRAITS).filter((t) => !TRAITS[t].rare || level > 1 || random() < RARE_CHANCE);
    const got: string[] = [], groups = new Set<string>();
    while (got.length < n && pool.length) {
        const t = pool.splice(Math.floor(random() * pool.length), 1)[0], group = TRAITS[t].group;
        if (group && groups.has(group)) continue;
        if (group) groups.add(group);
        got.push(t);
    }
    return got;
}

// a hero as saved and sent
export interface HeroData {
    n: string;              // name
    x: Sex;
    r: Race;
    j: Job;
    s: number[];            // the stats as rolled, by Stat
    k: number[];            // the core skills' levels, by Skill
    v?: number[];           // the XP in them, by Skill (none: the least for their levels, as hired)
    e: [number, number, number?][];  // the extended skills learned: [its place in EXTENDED, level, XP (none: the least for the level)]
    p?: number[];           // their specialties, by skill id (EXT; none: from before them, given some by fillSkills)
    t: string[];            // traits
    l: number[];            // looks (Lithalia's: hair, outfit, skin, eyes, three dyes)
    o?: number;             // the town they start from: its place in START_TOWNS (none: Rockbarrow, hired before there were three)
    g?: number[];           // what they wear and carry: item ids by Slot (shared/Tasks.ts; 0 or none: nothing)
    sc?: [number, number];  // their status window's scene and pose (shared/Scenes.ts; none: the land, pacing)
}

// a hero's stats: as rolled, with their race's tilt and their traits'
export function heroStats(h: HeroData) {
    const s = h.s.map((v, i) => v + (RACES[h.r]?.tilt[i] ?? 0));
    for (const t of h.t) TRAITS[t]?.stats?.forEach((v, i) => s[i] += v);
    return s;
}

// a hero's XP by skill (made from their levels if they have none yet)
export function heroXp(h: HeroData) {
    return h.v ?? (h.v = h.k.map((l) => XP_AT[l]));
}

// a hero saved before a skill was added gets it at level 1, and one from
// before specialties some (the same ones every load: rolled from their name)
export function fillSkills(h: HeroData) {
    while (h.k.length < SKILL_NAMES.length) h.k.push(1);
    if (h.v) while (h.v.length < h.k.length) h.v.push(XP_AT[1]);
    h.e ??= [];
    if (!h.p) {
        let seed = 7;
        for (const c of h.n) seed = (seed * 31 + c.charCodeAt(0)) >>> 0;
        h.p = rollSpecialties(() => ((seed = (Math.imul(seed, 1103515245) + 12345) >>> 0) >>> 8) / (1 << 24));
    }
    return h;
}

// how far into their level they are at a skill (0-1; at the most, 1)
export function levelPart(h: HeroData, skill: Skill) {
    const level = h.k[skill];
    if (level >= SKILL_MAX) return 1;
    return Math.max(0, Math.min(1, (heroXp(h)[skill] - XP_AT[level]) / levelXp(level)));
}

// an extended skill's level (0: not learned)
export function extLevel(h: HeroData, e: number) {
    return h.e.find(([x]) => x == e)?.[1] ?? 0;
}

// learns an extended skill, at level 1 (false: they knew it already)
export function learnExtended(h: HeroData, e: number) {
    if (!(e >= 0 && e < EXTENDED.length) || extLevel(h, e)) return false;
    h.e.push([e, 1, XP_AT[1]]);
    return true;
}

// XP into an extended skill they know (as gainXp is for a core one): the
// new level if it went up, else 0
export function gainExtXp(h: HeroData, e: number, xp: number) {
    const known = h.e.find(([x]) => x == e);
    if (!known) return 0;
    const was = known[1];
    known[2] = (known[2] ?? XP_AT[was]) + xp;
    known[1] = Math.max(was, Math.min(SKILL_MAX, levelAt(known[2])));
    return known[1] > was ? known[1] : 0;
}

// an extended skill's XP, and how far into its level they are (0-1)
export function extXp(h: HeroData, e: number) {
    const known = h.e.find(([x]) => x == e);
    return known ? known[2] ?? XP_AT[known[1]] : 0;
}
export function extLevelPart(h: HeroData, e: number) {
    const level = extLevel(h, e);
    if (!level) return 0;
    if (level >= SKILL_MAX) return 1;
    return Math.max(0, Math.min(1, (extXp(h, e) - XP_AT[level]) / levelXp(level)));
}

// The one hiring board, open from the main menu wherever you are (the user,
// 2026-10-27; it was a board per town). Each player has their own offers on
// it, new ones every REFRESH_MS (the same 4 hours for everyone); each offer
// starts from one of START_TOWNS. A higher `level` rolls better heroes and
// costs more. Its id is saved (hero_board rows).
export interface BoardDef { id: string; level: number; }
export const BOARD: BoardDef = { id: "global", level: 1 };
export const OFFERS = 3;                    // offers on the board
export const REFRESH_MS = 4 * 60 * 60 * 1000;
export const HERO_SLOTS = 3;                // the roster at first (more unlocked over time); the first hire is free
export const HERO_SLOTS_PREMIUM = 5;        // a Supporter's (the user, 2026-10-28, a Premium perk); one lapsing keeps theirs, hiring no more till under 3

export function heroSlots(premium: boolean) {
    return premium ? HERO_SLOTS_PREMIUM : HERO_SLOTS;
}

// the barracks (the user, 2026-11-06: "store up to 5/10 characters in a barracks
// ... and swap them out with active players any time"): heroes off the roster,
// waiting where they were with their to-do lists kept, healing as if resting;
// called up again any time. A Supporter's holds more; one lapsing keeps everyone
// in it, sending no more there till under 5
export const BARRACKS_SLOTS = 5;
export const BARRACKS_SLOTS_PREMIUM = 10;

export function barracksSlots(premium: boolean) {
    return premium ? BARRACKS_SLOTS_PREMIUM : BARRACKS_SLOTS;
}

// where a hero can start from, by the places' names on the map (saved by
// their place here, in HeroData.o: never reorder, add new ones at the end)
export const START_TOWNS = ["Rockbarrow", "Luminmoor", "Gullhaven"];
export function startTown(h: HeroData) {
    return START_TOWNS[h.o ?? 0];
}

// the 4 hours a time is in, and when they end
export function boardPeriod(now: number) {
    return Math.floor(now / REFRESH_MS);
}
export function periodEnd(period: number) {
    return (period + 1) * REFRESH_MS;
}

// New offers before the 4 hours are up, for gold (the user, 2026-11-03: "a
// refresh button (for gold)"): REROLL_PRICE, doubling with each in the same
// 4 hours (Claude's numbers), so it's for a hero you're after, not a slot machine
export const REROLL_PRICE = 50;
export function rerollPrice(rerolls: number) {
    return REROLL_PRICE * 2 ** Math.min(rerolls, 10);
}

// A hire's price, by how well the hero rolled (the user's call): about 100g
// for an ordinary one, 50 for a poor one, up to 300 for a fine one (10 more
// a specialty); a higher level board more.
export const PRICE_LEAST = 50, PRICE_MOST = 300;
export function heroPrice(h: HeroData, level: number) {
    const stats = h.s.reduce((sum, v) => sum + v - 10, 0);
    const skills = h.k.reduce((sum, v) => sum + v - 1, 0);
    const traits = h.t.reduce((sum, t) => sum + (TRAITS[t]?.worth ?? 0), 0);
    const worth = 100 + stats * 6 + skills * 5 + (h.p?.length ?? 0) * 10 + traits * 20;
    const price = Math.round(worth * (1 + (level - 1) * 0.5) / 5) * 5;
    return Math.max(PRICE_LEAST, Math.min(PRICE_MOST * level, price));
}
