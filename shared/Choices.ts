import { EXT, EXTENDED, extLevel, HeroData, isExtended, SKILL_NAMES, skillName, Stat, STAT_NAMES, TRAITS } from "./Heroes";
import { wornStats } from "./Tasks";

// Choices on the road (the user, 2026-10-30: "small choices that come up
// during play"; Claude's moments and numbers, open to change). Now and then
// on an adventure or a dungeon run a hero comes to a moment - a rope bridge,
// a trapped merchant, a chest too neat to trust - with a few ways through it.
// Each way is tested by a stat, a core skill or an extended skill (a known
// one: that's what extended skills open), or is sure; some are open only to
// heroes with a trait. Signed in, you have CHOICE_MS to pick (the hero works
// on meanwhile); signed out, or out of time, they pick for themselves
// (`ownPick`). What came of it goes in their journal and the away summary.

// where a moment can happen (bits)
export enum Where { ADVENTURE = 1, DUNGEON = 2 }

// what came of a way through: `t` said in the journal; the rest by the
// place's level, as a dungeon run's finds are
export interface Outcome {
    t: string;
    g?: number;         // gold, this many times a run's (less than 0: lost)
    f?: number;         // things found at the place
    h?: number;         // hurt, of their health (less than 0: healed)
    y?: number;         // minutes held up
}

export interface WayDef {
    n: string;          // on its button ("Cross it")
    stat?: Stat;        // what's tested (neither: sure)
    skill?: string;     // a core or extended skill, by name (an extended one: only for heroes who know it)
    trait?: string[];   // only for heroes with one of these (and TRAIT_EDGE likelier)
    learns?: string;    // done, a chance (LEARN_CHANCE) of picking up this extended skill
    win: Outcome;
    lose?: Outcome;     // (a sure way has none)
}

// saved by id (a moment waiting on an answer, HeroState.c), its ways by
// their place: never renumber either, add new ones at the end
export interface MomentDef { id: number; n: string; t: string; at: Where; night?: boolean; o: WayDef[]; }

const A = Where.ADVENTURE, D = Where.DUNGEON;

export const MOMENTS: MomentDef[] = [
    {
        id: 1, n: "The Rope Bridge", t: "A frayed rope bridge sways over a deep ravine.", at: A, o: [
            { n: "Cross it", stat: Stat.AGI, learns: "Balancing", win: { t: "Crossed a swaying rope bridge" }, lose: { t: "Slipped on a rope bridge and hauled themselves up, hurt", h: 0.15, y: 10 } },
            { n: "Walk it like a beam", skill: "Balancing", win: { t: "Strolled over a swaying rope bridge" }, lose: { t: "Lost their footing on a rope bridge", h: 0.1, y: 5 } },
            { n: "Tumble across", skill: "Acrobatics", win: { t: "Flipped across a rope bridge" }, lose: { t: "Tumbled off a rope bridge into the brambles", h: 0.15 } },
            { n: "Go round (+20 min)", win: { t: "Went the long way round a ravine", y: 20 } },
        ],
    },
    {
        id: 2, n: "The Trapped Merchant", t: "A merchant's cart lies overturned, the merchant pinned beneath it.", at: A, o: [
            { n: "Lift the cart", stat: Stat.STR, skill: "Fighting", win: { t: "Lifted a cart off a merchant, who paid them well", g: 3 }, lose: { t: "Strained themselves lifting a cart off a merchant", h: 0.1, y: 10 } },
            { n: "Bargain first", stat: Stat.INT, learns: "Diplomacy", win: { t: "Struck a fine bargain to free a trapped merchant", g: 5, y: 10 }, lose: { t: "Haggled with a trapped merchant and got nothing for it", y: 15 } },
            { n: "Talk them round", skill: "Diplomacy", win: { t: "Freed a merchant and talked them into a reward", g: 6 }, lose: { t: "Freed a merchant, who paid them in thanks", g: 1 } },
            { n: "Trade for wares", skill: "Bartering", win: { t: "Freed a merchant and traded for their wares", f: 2 }, lose: { t: "Freed a merchant, whose wares were broken", y: 10 } },
            { n: "Pass by", win: { t: "Passed an overturned cart by" } },
        ],
    },
    {
        id: 3, n: "The Flooded Ford", t: "The river has burst its banks over the ford.", at: A, o: [
            { n: "Wade across", stat: Stat.VIT, learns: "Swimming", win: { t: "Waded a flooded ford" }, lose: { t: "Swept off their feet at a flooded ford", h: 0.15, y: 15 } },
            { n: "Swim it", skill: "Swimming", win: { t: "Swam a flooded river" }, lose: { t: "Washed downstream swimming a flooded river", h: 0.1, y: 10 } },
            { n: "Find the shallows", skill: "Survival", win: { t: "Found the shallows of a flooded river" }, lose: { t: "Searched a flooded river for shallows in vain", y: 15 } },
            { n: "Wait (+30 min)", win: { t: "Waited for a flooded river to drop", y: 30 } },
        ],
    },
    {
        id: 4, n: "Fresh Tracks", t: "Fresh tracks lead off the path into the brush.", at: A, o: [
            { n: "Follow them", stat: Stat.AGI, skill: "Scouting", learns: "Tracking", win: { t: "Followed tracks to a hidden cache", f: 1, g: 1 }, lose: { t: "Followed tracks in circles", y: 15 } },
            { n: "Read the tracks", skill: "Tracking", win: { t: "Tracked a beast to its den and what it hoarded", f: 2 }, lose: { t: "Lost a trail in the brush", y: 10 } },
            { n: "Set a snare", skill: "Trapping", win: { t: "Snared what made the tracks", f: 2, y: 10 }, lose: { t: "Set a snare that caught nothing", y: 15 } },
            { n: "Keep to the path", win: { t: "Kept to the path past some tracks" } },
        ],
    },
    {
        id: 5, n: "The Wayside Shrine", t: "A mossy shrine stands by the road, its inscription worn.", at: A, o: [
            { n: "Leave an offering", stat: Stat.LCK, win: { t: "Left an offering at a shrine and found coins by it", g: 3 }, lose: { t: "Left an offering at a shrine; nothing came of it", g: -1 } },
            { n: "Decipher it", stat: Stat.INT, learns: "Language", win: { t: "Deciphered a shrine and found what it hid", g: 2 }, lose: { t: "Puzzled over a shrine's inscription", y: 10 } },
            { n: "Recall its tale", skill: "Folklore", win: { t: "Knew a shrine's tale and found its hidden hoard", g: 2, f: 1 }, lose: { t: "Couldn't place a shrine's tale", y: 5 } },
            { n: "Read the old words", skill: "Language", win: { t: "Read a shrine's inscription and found what it hid", g: 3 }, lose: { t: "Read a shrine's inscription; it was a prayer", y: 5 } },
            { n: "Walk on", win: { t: "Walked on past a wayside shrine" } },
        ],
    },
    {
        id: 6, n: "The Wounded Traveller", t: "A traveller sits by the road nursing a bad wound.", at: A, o: [
            { n: "Help them along", stat: Stat.VIT, learns: "First Aid", win: { t: "Helped a wounded traveller to safety; they paid in thanks", g: 2, y: 15 }, lose: { t: "Helped a wounded traveller along, slowly", y: 25 } },
            { n: "Bind the wound", skill: "First Aid", win: { t: "Bound a traveller's wound; they paid in thanks", g: 3 }, lose: { t: "Bound a traveller's wound as best they could", y: 10 } },
            { n: "Heal them", skill: "Healing Magic", win: { t: "Healed a traveller, who gave them a keepsake", g: 3, f: 1 }, lose: { t: "Tried to heal a traveller and tired themselves", h: 0.1 } },
            { n: "Leave them", win: { t: "Left a wounded traveller by the road" } },
        ],
    },
    {
        id: 7, n: "Bandits!", t: "Bandits block the road and demand a toll.", at: A, o: [
            { n: "Fight them", stat: Stat.STR, skill: "Fighting", win: { t: "Saw off bandits and took their purse", g: 4 }, lose: { t: "Beaten by bandits and robbed", h: 0.25, g: -2 } },
            { n: "Stare them down", stat: Stat.STR, trait: ["brave", "berserker"], win: { t: "Stared down a band of bandits" }, lose: { t: "Tried to stare down bandits; they laughed and took the toll", g: -2 } },
            { n: "Talk them out of it", skill: "Diplomacy", win: { t: "Talked bandits out of their toll" }, lose: { t: "Talked to bandits, then paid them", g: -1 } },
            { n: "Bluff", skill: "Bluffing", win: { t: "Bluffed bandits into paying them instead", g: 2 }, lose: { t: "Called on a bluff by bandits", g: -2, h: 0.1 } },
            { n: "Run for it", stat: Stat.AGI, learns: "Escape", win: { t: "Outran a band of bandits" }, lose: { t: "Caught running from bandits", g: -2, h: 0.1 } },
            { n: "Pay the toll", win: { t: "Paid bandits their toll", g: -2 } },
        ],
    },
    {
        id: 8, n: "Lost in the Fog", t: "A thick fog rolls in and the path is lost.", at: A, o: [
            { n: "Press on", stat: Stat.INT, skill: "Scouting", learns: "Navigation", win: { t: "Found their way through a thick fog" }, lose: { t: "Wandered lost in a fog", y: 25 } },
            { n: "Steer by the land", skill: "Navigation", win: { t: "Steered through a fog by the lie of the land" }, lose: { t: "Steered wrong in a fog", y: 15 } },
            { n: "Mark the way", skill: "Cartography", win: { t: "Marked a way through a fog" }, lose: { t: "Got their map wrong in a fog", y: 15 } },
            { n: "Wait (+25 min)", win: { t: "Waited out a fog", y: 25 } },
        ],
    },
    {
        id: 9, n: "Dicing Soldiers", t: "Soldiers camped by the road are dicing for coin.", at: A, o: [
            { n: "Join in", stat: Stat.LCK, learns: "Gambling", win: { t: "Diced with soldiers and won", g: 3 }, lose: { t: "Diced with soldiers and lost", g: -2 } },
            { n: "Play them properly", skill: "Gambling", win: { t: "Fleeced a camp of dicing soldiers", g: 5 }, lose: { t: "Lost at dice to soldiers", g: -2 } },
            { n: "Tell them a tale", skill: "Storytelling", win: { t: "Told soldiers a tale for their coin", g: 2 }, lose: { t: "Told soldiers a tale; they yawned", y: 10 } },
            { n: "Walk on", win: { t: "Walked past some dicing soldiers" } },
        ],
    },
    {
        id: 10, n: "Night Falls", t: "Night has fallen far from any shelter.", at: A, night: true, o: [
            { n: "Push on in the dark", stat: Stat.VIT, learns: "Survival", win: { t: "Pushed on through the night" }, lose: { t: "Stumbled about in the dark", h: 0.1, y: 15 } },
            { n: "Make a snug camp", skill: "Camping", win: { t: "Made a snug camp and rested well", h: -0.3 }, lose: { t: "Made a cold, damp camp", y: 10 } },
            { n: "Live off the land", skill: "Survival", win: { t: "Lived off the land for the night", h: -0.15, f: 1 }, lose: { t: "Went hungry in the night", y: 10 } },
            { n: "Rough it (+15 min)", win: { t: "Slept rough under the stars", y: 15 } },
        ],
    },
    {
        id: 11, n: "The Locked Chest", t: "A locked chest sits in an alcove, too neat to trust.", at: D, o: [
            { n: "Force it", stat: Stat.STR, learns: "Demolition", win: { t: "Forced open a chest", f: 2 }, lose: { t: "Caught by a trapped chest", h: 0.15 } },
            { n: "Disarm the trap", skill: "Disarm Trap", win: { t: "Disarmed a trapped chest and emptied it", f: 2, g: 2 }, lose: { t: "Set off a chest's trap disarming it", h: 0.1 } },
            { n: "Pick the lock", skill: "Sleight of Hand", win: { t: "Picked a chest's lock", f: 2 }, lose: { t: "Couldn't pick a chest's lock", y: 10 } },
            { n: "Find the false bottom", trait: ["treasurehunter"], win: { t: "Found the false bottom of a chest", f: 3 } },
            { n: "Leave it", win: { t: "Left a suspicious chest alone" } },
        ],
    },
    {
        id: 12, n: "The Sleeping Beast", t: "Something large sleeps across the passage.", at: D, o: [
            { n: "Sneak past", stat: Stat.AGI, learns: "Stealth", win: { t: "Sneaked past a sleeping beast" }, lose: { t: "Woke a sleeping beast and fled, mauled", h: 0.2 } },
            { n: "Creep by unseen", skill: "Stealth", win: { t: "Crept by a sleeping beast to what it guarded", f: 1 }, lose: { t: "Woke a sleeping beast creeping by", h: 0.15 } },
            { n: "Calm it", skill: "Taming", win: { t: "Calmed a beast and took what it guarded", f: 2 }, lose: { t: "Tried to calm a beast; it bit", h: 0.15 } },
            { n: "Strike first", stat: Stat.STR, skill: "Fighting", win: { t: "Slew a sleeping beast", f: 2, g: 2 }, lose: { t: "Struck at a sleeping beast and came off worst", h: 0.3 } },
            { n: "Turn back (+20 min)", win: { t: "Turned back from a sleeping beast", y: 20 } },
        ],
    },
    {
        id: 13, n: "The Loose Flagstone", t: "A flagstone clicks underfoot. Something whirrs in the walls.", at: D, o: [
            { n: "Jump clear", stat: Stat.AGI, learns: "Jumping", win: { t: "Jumped clear of a dart trap" }, lose: { t: "Caught by a dart trap", h: 0.2 } },
            { n: "Spot the mechanism", skill: "Detection", win: { t: "Spotted a trap and what its maker hid", g: 2 }, lose: { t: "Caught by a dart trap looking for its workings", h: 0.15 } },
            { n: "Disarm it", skill: "Disarm Trap", win: { t: "Disarmed a dart trap and took its makings", f: 1 }, lose: { t: "Caught by a dart trap disarming it", h: 0.1 } },
            { n: "Freeze and hope", stat: Stat.LCK, win: { t: "Froze, and a dart trap missed" }, lose: { t: "Froze, and a dart trap didn't miss", h: 0.2 } },
        ],
    },
    {
        id: 14, n: "The Groaning Ceiling", t: "The ceiling groans and dust trickles down.", at: D, o: [
            { n: "Dash through", stat: Stat.AGI, learns: "Escape", win: { t: "Dashed through a collapsing passage" }, lose: { t: "Caught under falling rock", h: 0.25 } },
            { n: "Shore it up", skill: "Engineering", win: { t: "Shored up a passage and found ore behind it", f: 1, y: 5 }, lose: { t: "Shored up a passage, just", y: 15 } },
            { n: "Dig a way round", skill: "Mining", stat: Stat.STR, win: { t: "Dug round a collapsing passage, finding ore", f: 1, y: 10 }, lose: { t: "Dug round a collapsing passage, slowly", y: 25 } },
            { n: "Slip out", skill: "Escape", win: { t: "Slipped out of a collapsing passage" }, lose: { t: "Caught by falling rock slipping out", h: 0.15 } },
            { n: "Go back (+25 min)", win: { t: "Went back the long way from a groaning ceiling", y: 25 } },
        ],
    },
    {
        id: 15, n: "The Fork", t: "The tunnel forks. A faint draught comes from one way.", at: D, o: [
            { n: "Follow the draught", stat: Stat.INT, learns: "Cartography", win: { t: "Followed a draught to a hidden room", g: 2 }, lose: { t: "Followed a draught to a dead end", y: 15 } },
            { n: "Map it", skill: "Cartography", win: { t: "Mapped a fork and found a hidden room", g: 2, f: 1 }, lose: { t: "Mapped a fork wrong", y: 10 } },
            { n: "Scout ahead", skill: "Scouting", win: { t: "Scouted a fork to a hidden room", g: 2 }, lose: { t: "Scouted both ways of a fork", y: 15 } },
            { n: "Take the wide way (+15 min)", win: { t: "Took the wide way at a fork", y: 15 } },
        ],
    },
    {
        id: 16, n: "Whispers", t: "Whispers echo from a side chamber.", at: D, o: [
            { n: "Listen closely", stat: Stat.INT, learns: "Folklore", win: { t: "Heard in the whispers where a hoard lay", g: 3 }, lose: { t: "Lured by whispers into a side chamber, and scared", h: 0.1, y: 10 } },
            { n: "Know the old tale", skill: "Folklore", win: { t: "Knew the tale behind the whispers and its hoard", g: 2, f: 1 }, lose: { t: "Couldn't place the tale behind the whispers", y: 5 } },
            { n: "Read their lips", skill: "Lip Reading", win: { t: "Read the lips of whisperers in the dark and robbed them", g: 4 }, lose: { t: "Couldn't make out whisperers in the dark", y: 5 } },
            { n: "Ignore them", win: { t: "Ignored whispers in the dark" } },
        ],
    },
    {
        id: 17, n: "The Fallen Adventurer", t: "A fallen adventurer's pack lies beside their bones.", at: D, o: [
            { n: "Search the pack", stat: Stat.LCK, win: { t: "Searched a fallen adventurer's pack", f: 1, g: 2 }, lose: { t: "Bitten by a snake in a fallen adventurer's pack", h: 0.15 } },
            { n: "Read their notes", skill: "Research", win: { t: "Read a fallen adventurer's notes and found their stash", f: 2, g: 2 }, lose: { t: "Couldn't make sense of a fallen adventurer's notes", y: 10 } },
            { n: "Tell how they died", skill: "Anatomy", win: { t: "Saw how an adventurer died and dodged the same fate", f: 1 }, lose: { t: "Puzzled over an adventurer's bones", y: 10 } },
            { n: "Bury them (+10 min)", win: { t: "Buried a fallen adventurer", y: 10 } },
        ],
    },
];

const BY_ID = new Map(MOMENTS.map((m) => [m.id, m]));
export function momentOf(id: number) {
    return BY_ID.get(id);
}

// skills by name, core or extended, to their ids (EXT + place); checked as this loads (a typo throws)
function skillId(name: string) {
    const core = SKILL_NAMES.indexOf(name);
    if (core >= 0) return core;
    const e = EXTENDED.indexOf(name);
    if (e < 0) throw new Error(`No skill "${name}"`);
    return EXT + e;
}
const SKILL_IDS = new Map<WayDef, number>();
for (const m of MOMENTS) for (const w of m.o) {
    if (w.skill) SKILL_IDS.set(w, skillId(w.skill));
    if (w.learns && !isExtended(skillId(w.learns))) throw new Error(`"${w.learns}" isn't an extended skill`);
    for (const t of w.trait ?? []) if (!TRAITS[t]) throw new Error(`No trait "${t}"`);
}
export function waySkill(w: WayDef) {
    return SKILL_IDS.get(w);                    // (none: no skill tested)
}

// a moment about once in this much adventuring or dungeon-running at x1 (a unit's chance: its time at x1 over this)
export const MOMENT_MS = 60 * 60 * 1000;
// how long you have to pick, signed in
export const CHOICE_MS = 90 * 1000;
// XP into the skill tested: this much time's worth at x1 (half if it went wrong)
export const CHOICE_XP_MS = 10 * 60 * 1000;
// a way done that `learns` something: the chance they pick it up (x their traits')
export const LEARN_CHANCE = 0.2;
// a trait's own way: this much likelier
export const TRAIT_EDGE = 0.15;
// left to themselves they take the likeliest tested way if it's this likely (else a sure one)
export const BOLD = 0.6;

// a moment waiting on an answer (HeroState.c)
export interface Pending {
    m: number;          // the moment's id
    o: number[];        // the ways open to them, by place
    p: number;          // where: the place it happened at (what's found is its)
    l: number;          // ...and the level
    t: number;          // when they pick for themselves if you haven't (ms)
}

// a moment for somewhere, picked at random (night ones only at night)
export function rollMoment(at: Where, night: boolean, random: () => number = Math.random) {
    const fits = MOMENTS.filter((m) => (m.at & at) && (!m.night || night));
    return fits[Math.floor(random() * fits.length)];
}

// is this way open to them? (an extended skill they know, a trait they have)
export function isOpen(h: HeroData, w: WayDef) {
    const skill = waySkill(w);
    if (skill != null && isExtended(skill) && !extLevel(h, skill - EXT)) return false;
    if (w.trait && !w.trait.some((t) => h.t.includes(t))) return false;
    return true;
}

// the ways open to a hero, by place
export function openWays(h: HeroData, m: MomentDef) {
    return m.o.map((w, i) => isOpen(h, w) ? i : -1).filter((i) => i >= 0);
}

export function isSure(w: WayDef) {
    return w.stat == null && !w.skill;
}

// The chance a way goes well (sure: 1). From 45%: 3% a point of its stat
// over or under 10 (with what they wear), half a percent a level of its core
// skill over 1; knowing its extended skill 20% and half a percent a level;
// their own trait's way TRAIT_EDGE; a point of Luck over 10 1%. Between 5% and 95%.
export function chance(h: HeroData, w: WayDef) {
    if (isSure(w)) return 1;
    const stats = wornStats(h);
    let p = 0.45;
    if (w.stat != null) p += 0.03 * (stats[w.stat] - 10);
    const skill = waySkill(w);
    if (skill != null) {
        if (isExtended(skill)) p += 0.2 + 0.005 * (extLevel(h, skill - EXT) - 1);
        else p += 0.005 * (h.k[skill] - 1);
    }
    if (w.trait) p += TRAIT_EDGE;
    if (w.stat != Stat.LCK) p += 0.01 * (stats[Stat.LCK] - 10);
    return Math.max(0.05, Math.min(0.95, p));
}

// how bold they are left to themselves: Brave and Berserker less careful, Cowardly more
export function boldness(h: HeroData) {
    let bold = BOLD;
    if (h.t.includes("brave") || h.t.includes("berserker")) bold -= 0.1;
    if (h.t.includes("cowardly")) bold += 0.15;
    return bold;
}

// what they pick left to themselves, of the ways open (by place): the
// likeliest tested way if it's likely enough (boldness), else the first sure one
export function ownPick(h: HeroData, m: MomentDef, open: number[]) {
    let best = -1, bestP = 0;
    for (const i of open) {
        const w = m.o[i];
        if (isSure(w)) continue;
        const p = chance(h, w);
        if (p > bestP) { best = i; bestP = p; }
    }
    const sure = open.find((i) => isSure(m.o[i]));
    if (best >= 0 && (bestP >= boldness(h) || sure == null)) return best;
    return sure ?? open[0];
}

// what's tested, said ("Agility", "Fighting and Strength", "Balancing 3", "Brave")
export function testText(h: HeroData, w: WayDef) {
    const parts: string[] = [];
    const skill = waySkill(w);
    if (skill != null) parts.push(isExtended(skill) ? `${skillName(skill)} ${extLevel(h, skill - EXT)}` : skillName(skill));
    if (w.stat != null) parts.push(STAT_NAMES[w.stat]);
    if (w.trait) {
        const t = w.trait.find((t) => h.t.includes(t)) ?? w.trait[0];
        parts.push(TRAITS[t].name);
    }
    return parts.length ? parts.join(" and ") : "Sure";
}

// what an outcome brings, said short ("+gold +finds", "hurt +10m"; "": nothing)
export function outcomeText(o: Outcome) {
    const parts: string[] = [];
    if (o.g > 0) parts.push("+gold");
    if (o.f) parts.push("+finds");
    if (o.h < 0) parts.push("+rest");
    if (o.g < 0) parts.push("-gold");
    if (o.h > 0) parts.push("hurt");
    if (o.y) parts.push(`+${o.y}m`);
    return parts.join(" ");
}
