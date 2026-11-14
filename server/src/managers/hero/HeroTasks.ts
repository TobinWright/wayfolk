import { readFileSync } from "fs";
import path from "path";
import { IBS } from "../../app";
import { LEAD_XP_SHARE, LEADERSHIP, leadWork } from "../../../../shared/Parties";
import { S2C } from "../../constants/Routes";
import { BEATEN_XP, enemyGroup, Fight, fight, heroFighter, healRate, tendMul, HURT_MOST, hurtAfter, landOf, nightDrops, NIGHT_ROAD, playMs, potionUsed, ROAD, ROAD_FIGHT, ROAD_XP_MS, roadLevel } from "../../../../shared/Fights";
import { EXT, EXTENDED, extLevel, HeroData, learnExtended, Skill, SKILL_NAMES, startTown, traitAdd, traitMul } from "../../../../shared/Heroes";
import { chance, CHOICE_MS, CHOICE_XP_MS, LEARN_CHANCE, MOMENT_MS, momentOf, openWays, ownPick, rollMoment, waySkill, Where } from "../../../../shared/Choices";
import { CONDITION_STEP, Conditions, conditionsAt, heroAt, STORM_HURT, stormChance, travelPace, workPace, workSkillOf } from "../../../../shared/Conditions";
import { isNight, rainAt, untilTurn } from "../../../../shared/Weather";
import { deepestLevel, materialOf, materialsAt } from "../../../../shared/Locations";
import { isDungeon, isTown, kindOf, placeName, WorldPlace } from "../../../../shared/Places";
import {
    ADVENTURE_FIND, ADVENTURE_RANGE, AMOUNTS, anyEvent, craftLevel, craftMs, EXPLORE_MS, exploreGold, exploreMs, gatherLevel, gatherMs, gatherSkill, HeroState, itemName, LOOK_MS, lookMs,
    LUCKY_MORE, LUCKY_ODDS, MEAL_MS, mealWork, PACE, Quality, recipeOf, rollQuality, SHIFT_MS, Slot, withQuality, shiftGold, Task, TaskKind, taskXp, todoMost, unitXp, worn,
} from "../../../../shared/Tasks";
import { distancesFrom, findPath, Graph, isSeaLeg, legLength, makeGraph, travelSpeed } from "../../../../shared/Travel";
import { boonAt, eventTitle, isBossEvent } from "../../../../shared/Events";
import { BEAST_GOLD, BEAST_POWER, BEAST_XP_MS, beastName, BEASTS, OPENING_LOOT, OPENING_RARE, RARE_FROM, rareMaterials, Sight } from "../../../../shared/Sights";
import { danger } from "../../../../shared/Locations";
import { ENEMIES, Fighter } from "../../../../shared/Fights";
import { doneText, foesText, JournalKind } from "../../../../shared/Journal";
import { isGear, Step } from "../../../../shared/Guide";
import { Deed } from "../../../../shared/Seasons";
import { InventoryRecord } from "../database/InventoryRecord";
import { PlayerRecord } from "../database/PlayerRecord";
import { Player } from "../player/Player";
import { Hero } from "./HeroManager";
import { HeroParties } from "./HeroParties";
import { HeroBusy } from "./HeroBusy";
import { HeroDemo } from "./HeroDemo";
import { HeroFeatured } from "./HeroFeatured";
import { Formed, FormedParties } from "./FormedParties";
import { Log } from "../../utils/Log";
import { Guard } from "../../utils/Guard";

type Row = [number, string, string];    // a hero to save: id, state, data

// who's doing it, together: a hero alone (s their own state), or a formed
// party's with it (s the party's, each of theirs set from it: mirror); owner,
// whose each is
interface Crew { s: HeroState; heroes: Hero[]; owner: (h: Hero) => Player; party?: Formed; }

function mean(list: number[]) {
    return list.reduce((sum, n) => sum + n, 0) / list.length;
}

// Heroes carrying out their to-do lists (shared/Tasks.ts): each in turn -
// going there first by the travel graph if it's somewhere else - and their
// backup task when the list runs out. Worked out as time goes by for the heroes
// of everyone signed in, and of those signed out for AWAY_MS after (or
// AWAY_PREMIUM_MS, subscribed as they sign out; the user, 2026-10-28), every
// AWAY_STEP_MS with nothing sent. One loaded again (signing in after that, or
// the server starting) is worked out from their saved state to now or to
// when they'd have stopped (catchUp). What they gather, make and earn goes in the player's
// inventory. The states of heroes that changed are saved every SAVE_MS, all
// of them in one statement (SAVE_ROWS at a time), and a player's all on
// signing out. Between saves only what's seen changing marks them: progress
// along a leg or into a unit is worked out again from `t` if the server stops.
// The time of day and the weather where they are count as they go
// (shared/Conditions.ts): they're worked out a CONDITION_STEP at a time, never
// across a dawn or dusk, by the clock as it was then (`clock`).

export class HeroTasks {

    public static AWAY_MS = 24 * 60 * 60 * 1000;
    public static AWAY_PREMIUM_MS = 72 * 60 * 60 * 1000;
    public static AWAY_STEP_MS = 5000;
    public static SAVE_MS = 10000;
    public static SAVE_ROWS = 500;

    public places = new Map<number, WorldPlace>();
    public parties = new HeroParties();
    public busy = new HeroBusy();          // how many heroes are at each place (S2C.EVENT_BUSY)
    public featured = new HeroFeatured(this.parties);  // the featured parties on the map (S2C.HERO_FEATURED)
    public demo = new HeroDemo(this.parties);          // what staff in demo mode are told (S2C.ADMIN_DEMO_PARTIES)
    public formed = new FormedParties(this);           // the parties players make (shared/Parties.ts)
    public graph: Graph;
    public mapPx = { w: 0, h: 0 };     // the map's size (world.json), none if it wasn't found
    public tile = 0;                    // a tile's size, map px (world.json)
    private saveTime = 0;
    private awayTime = 0;
    private clock = 0;                  // the time the hero being worked out has got to (ms)
    private guard = new Guard("A hero's tick");
    private catching = false;          // working out time gone by (catchUp): moments met then, they answer themselves

    // the map's places (the client's world.json) and the travel graph (the node table)
    public init() {
        const file = path.join(process.cwd(), "..", "client", "dist", "assets", "json", "world.json");
        try {
            const world = JSON.parse(readFileSync(file, "utf8"));
            for (const p of world.places) this.places.set(p.i, p);
            this.mapPx = { w: world.w * world.tile, h: world.h * world.tile };
            this.tile = world.tile;
        } catch (e) {
            Log.error("No world.json for heroes' places: " + file);
        }
        this.graph = makeGraph(IBS.nodes.getJSON());
        // (one in a formed party, with it, or helping a public one: their party's those with it and its helpers)
        this.parties.formed = (h) => {
            const f = this.formed.of(h), g = f?.with.includes(h) ? f : f ? null : this.formed.helping(h);
            return g ? [...g.with, ...g.helpers] : null;
        };
        this.parties.open = () => this.formed.open();
        this.parties.formedGroups = () => Array.from(this.formed.parties.values()).map((f) => [...f.with, ...f.helpers]).filter((m) => m.length > 1);
    }

    public nameOf = (id: number) => placeName(this.places.get(id));

    // where a hero starts: their start town, by its name on the map
    public startAt(h: HeroData) {
        const name = startTown(h);
        for (const p of this.places.values()) if (p.n == name) return p.i;
        return this.places.keys().next().value ?? 1;
    }

    //#region the list

    // a task as the client asked for it, checked and copied (null: not one a hero can be given)
    public check(t: any): Task {
        if (!t || typeof t != "object") return null;
        const k = t.k, place = this.places.get(t.p), amount = AMOUNTS[k];
        const n = amount ? Math.max(amount.least, Math.min(amount.most, Math.floor(Number(t.n)) || amount.first)) : undefined;
        switch (k) {
            case TaskKind.TRAVEL: return place ? { k, p: place.i } : null;
            case TaskKind.GATHER: {
                const material = materialOf(t.m);
                return place && material?.at.includes(kindOf(place)) ? { k, p: place.i, m: material.id, n } : null;
            }
            case TaskKind.CRAFT: {
                const recipe = recipeOf(t.m);
                return place && isTown(place) && recipe ? { k, p: place.i, m: recipe.id, n } : null;
            }
            // (earning gold and exploring with no place: the nearest, when it starts)
            case TaskKind.WORK: return t.p == null ? { k, n } : place && isTown(place) ? { k, p: place.i, n } : null;
            case TaskKind.REST: return { k, n };
            case TaskKind.EXPLORE: return t.p == null ? { k, n } : place && isDungeon(place) ? { k, p: place.i, n } : null;
            case TaskKind.ADVENTURE: return { k, n };
            // (an event on now, at that place: kept at till it's over, no amount)
            // (a marching boss's: wherever it's making for now)
            case TaskKind.EVENT: {
                if (t.m == null) return { k };      // (none named: the nearest on, when it starts)
                const e = IBS.events.liveOne(t.m);
                return e && (e.p == place?.i || e.r) ? { k, p: e.p, m: t.m } : null;
            }
        }
        return null;
    }

    // a task on a list as the client sent it, checked, with its group (null: not one)
    public taskOf(t: any) {
        return this.grouped(t, this.check(t));
    }

    // a checked task with the group it came with (a craft's g, or f, the one it's for): whole numbers over 0
    private grouped(t: any, task: Task) {
        if (!task) return null;
        if (Number.isSafeInteger(t.g) && t.g > 0) task.g = t.g;
        if (Number.isSafeInteger(t.f) && t.f > 0) task.f = t.f;
        return task;
    }

    // a new list and backup task (null: none) for one of their heroes;
    // what's under way carries on if it's still first (in a formed party:
    // their own list, waiting, what's under way the party's)
    public setTodo(player: Player, heroId: number, q: any, b: any) {
        const hero = player.heroes.find((h) => h.id == heroId);
        if (!hero || !Array.isArray(q)) return;
        const s = hero.s;
        const tasks = q.slice(0, todoMost(player.record.isPremium())).map((t: any) => this.taskOf(t)).filter((t: Task) => t);
        const backup = this.check(b) ?? undefined;
        if (backup) delete backup.n;
        const same = tasks.length ? JSON.stringify(tasks[0]) == JSON.stringify(s.q[0] ?? null)
            : !s.q.length && JSON.stringify(backup ?? null) == JSON.stringify(s.b ?? null);
        s.q = tasks;
        s.b = backup;
        if (!same && !this.formed.of(hero)) { s.w = null; s.d = 0; s.u = 0; s.a = s.e = undefined; }
        s.x = undefined;
        this.advance(player, hero, 0);
        player.heroesDirty.add(hero);
        this.send(player, hero);
        IBS.friends.heroSeen(player, hero);
        IBS.guide.check(player);
    }

    // the backup task, for ever (travelling: there, then resting); none: resting
    private fallback(s: HeroState): Task {
        const b = s.b;
        if (!b || (b.k == TaskKind.TRAVEL && b.p == s.p && !s.r.length)) return { k: TaskKind.REST, n: 0 };
        return { ...b, n: 0 };
    }

    // done with what's under way: on to the next
    private finish(s: HeroState) {
        if (s.q.length) s.q.shift();
        s.w = null;
        s.d = 0;
        s.u = 0;
        s.a = s.e = undefined;
    }

    // what's under way can't be done: dropped (a backup task that can't, resting instead)
    private drop(c: Crew, why: string) {
        const s = c.s;
        s.x = why;
        for (const h of c.heroes) IBS.heroes.note(c.owner(h), h, JournalKind.GAVE_UP, `Gave up: ${why}`);
        if (s.q.length) this.finish(s);
        else { s.w = { k: TaskKind.REST, n: 0 }; s.d = 0; s.u = 0; s.a = s.e = undefined; }
    }

    // adventuring: the place they're off to next, picked at random within
    // ADVENTURE_RANGE of where they are (none in reach: where they are)
    private stop(s: HeroState) {
        if (s.a == null) {
            const from = s.r.length ? s.r[0] : s.p, dist = distancesFrom(this.graph, from);
            const near = Array.from(this.places.keys()).filter((id) => id != from && dist.get(id) <= ADVENTURE_RANGE);
            s.a = near.length ? near[Math.floor(Math.random() * near.length)] : from;
        }
        return s.a;
    }

    // a task about to start, with the place it's done at: earning gold or
    // exploring with none, the nearest town or dungeon to where they are
    // (events with none named, the nearest on: none, a backup task rests till there is;
    // one on the list stays as it is, to be passed over)
    private placed(s: HeroState, task: Task): Task {
        if (anyEvent(task)) {
            const e = this.nearestEvent(s);
            return e ? { ...task, p: e.p, m: e.i } : s.q.length ? task : { k: TaskKind.REST, n: 0 };
        }
        if (task.p != null || (task.k != TaskKind.WORK && task.k != TaskKind.EXPLORE)) return task;
        const dist =distancesFrom(this.graph, s.r.length ? s.r[0] : s.p);
        const far = (p: WorldPlace) => dist.get(p.i) ?? Infinity;
        const fits = Array.from(this.places.values()).filter(task.k == TaskKind.WORK ? isTown : isDungeon);
        return { ...task, p: fits.reduce((a, b) => far(b) < far(a) ? b : a).i };
    }

    // the nearest event on that there's a way to (null: none)
    private nearestEvent(s: HeroState) {
        const dist = distancesFrom(this.graph, s.r.length ? s.r[0] : s.p);
        const near = IBS.events.live().filter((e) => dist.has(e.p));
        return near.length ? near.reduce((a, b) => dist.get(b.p) < dist.get(a.p) ? b : a) : null;
    }

    private pick<T>(list: T[]) {
        return list.length ? list[Math.floor(Math.random() * list.length)] : null;
    }

    // why they can't do it now ("": they can; `starting`, a unit of it)
    private cannot(player: Player, hero: Hero, w: Task, starting: boolean) {
        const place = this.places.get(w.p);
        if (w.k == TaskKind.GATHER) {
            // (as deep as their party gets, looked at as each one starts: one under way is finished whoever leaves)
            const skill = gatherSkill(w.m), takes = gatherLevel(w.m);
            if (hero.d.k[skill] < takes) return `${itemName(w.m)} takes ${SKILL_NAMES[skill]} ${takes}: ${hero.d.n} has ${hero.d.k[skill]}`;
            const material = materialOf(w.m), kind = kindOf(place);
            let level = this.deepest(kind, hero);
            // (just starting, not yet in with those already at it here: they are now)
            if (starting && material.level > level && hero.s.g == null) { this.parties.regroup(); level = this.deepest(kind, hero); }
            if (starting && material.level > level) return `${material.name} is found from floor ${material.level} in ${placeName(place)}: ${hero.d.n} only reaches floor ${level}`;
        }
        if (w.k == TaskKind.CRAFT) {
            const skill = recipeOf(w.m).skill, level = craftLevel(w.m);
            if (hero.d.k[skill] < level) return `${itemName(w.m)} takes ${SKILL_NAMES[skill]} ${level}: ${hero.d.n} has ${hero.d.k[skill]}`;
            for (const [id, n] of recipeOf(w.m).needs)
                if ((player.inventory.items.get(id)?.amount ?? 0) < n) return `Not enough ${itemName(id)} to craft ${itemName(w.m)}`;
        }
        return "";
    }

    // the time of day and the weather where a hero (or a party) is, now (by the clock they've got to)
    private conditions(s: HeroState): Conditions {
        const at = heroAt(this.graph, s);
        return conditionsAt(at.x, at.y, this.clock, at.sea);
    }

    // how much of `ms` to work out before looking at the time and weather again
    private step(ms: number) {
        return Math.min(ms, CONDITION_STEP, untilTurn(this.clock));
    }

    // gold by their traits (Haggler, Greedy...), the odd part rounded up now and then
    // (and their guild's perk: shared/Guilds.ts guildGoldMul)
    private gold(player: Player, h: HeroData, n: number) {
        return Math.floor(n * traitMul(h, "gold") * IBS.guilds.goldMul(player.id) + Math.random());
    }

    // one found, or now and then two (their traits: Strong Back, Treasure Hunter)
    private finds(h: HeroData) {
        return Math.random() < traitMul(h, "find") - 1 ? 2 : 1;
    }

    // (gathering and crafting quicker where an event's boon is, shared/Events.ts, and with a quick start, shared/Guide.ts)
    private unitMs(player: Player, hero: Hero, w: Task) {
        const boon = (b: "gather" | "craft") => boonAt(Array.from(IBS.events.events.values()), w.p, b, Date.now());
        switch (w.k) {
            case TaskKind.GATHER: return gatherMs(hero.d, w.m) / boon("gather") / IBS.guide.quick(player);
            case TaskKind.CRAFT: return craftMs(hero.d, w.m) / boon("craft") / IBS.events.townRate(w.p) / IBS.guide.quick(player) / IBS.guilds.craftMul(player.id);
            case TaskKind.EVENT: { const e = IBS.events.liveOne(w.m); return e ? IBS.events.unitMs(hero, e) : Infinity; }
            case TaskKind.WORK: return SHIFT_MS;
            case TaskKind.EXPLORE: return exploreMs(hero.d);
            case TaskKind.ADVENTURE: return lookMs(hero.d);
        }
        return Infinity;
    }

    // everyone in a hero's party (shared/Parties.ts), them included
    public partyOf(hero: Hero) {
        return this.parties.partyOf(hero);
    }

    // the deepest level of a kind of place a hero's party reaches
    private deepest(kind: string, hero: Hero) {
        return deepestLevel(kind, this.partyOf(hero).map((h) => h.d));
    }

    // a fight (shared/Fights.ts) against `foes` at `level`: a hero alone,
    // the rest of their party (none recovering) beside them - how hurt they
    // come out of it, beaten resting till they've healed (it's theirs: the
    // others help, and keep their health) - or a formed party's, none
    // recovering, each hurt by it and it theirs (fought), its helpers beside
    // them as the others beside one alone; kept to send, to everyone in it
    // (null: nobody there to fight)
    // (in the open, `rain` how hard it's raining)
    private battle(c: Crew, foes: Fighter[], level: number, rain = 0) {
        const lead = c.heroes.find((h) => !h.s.o);
        if (!foes.length || !lead) return null;
        const night = isNight(this.clock);
        const party = (c.party ? [...c.heroes, ...c.party.helpers] : [lead, ...this.partyOf(lead).filter((h) => h != lead)]).filter((h) => h == lead || !h.s.o);
        const owner = (h: Hero) => c.heroes.includes(h) ? c.owner(h) : this.parties.ownerOf(h);
        const f = fight(level, party.map((h) => heroFighter(h.id, h.d, h.s.h ?? 0, night, rain, this.potionFor(h, owner(h)))), foes);
        this.usedPotions(f, party, owner);
        const theirs = c.party ? party.filter((h) => c.heroes.includes(h)) : [lead];
        for (const h of theirs) {
            const hurt = f.w ? hurtAfter(f, h.id) : 1;
            h.s.h = hurt > 0 ? hurt : undefined;
            if (!f.w) h.s.o = 1;
            h.f = f;
        }
        for (const h of party) if (!theirs.includes(h)) (h.a ??= []).push(f);
        IBS.friends.fought(party, this.clock);
        for (const h of party) IBS.heroes.away.fought(h, !!f.w);
        if (f.w) for (const h of party) IBS.seasons.did(owner(h), Deed.FIGHT);
        return f;
    }

    // those a fight was theirs (battle): what it brings is theirs
    private fought(c: Crew, f: Fight) {
        return c.heroes.filter((h) => h.f == f);
    }

    // coming to a stop on the road (not a town): now and then something to fight
    // there, a few levels under the deepest they'd reach (more often at night,
    // and by their traits: a party, by the one of them most likely); won, gold
    // and Fighting XP, and what night beasts left
    private roadFight(c: Crew) {
        const s = c.s, place = this.places.get(s.p), able = c.heroes.filter((h) => !h.s.o);       // (no place: a bend in the road)
        if (!able.length) return false;
        const night = isNight(this.clock), chance = ROAD_FIGHT * Math.max(...able.map((h) => traitMul(h.d, "road"))) * (night ? NIGHT_ROAD : 1);
        if ((place && isTown(place)) || Math.random() >= chance) return false;
        const level = roadLevel(deepestLevel(ROAD, able.map((h) => h.d)), Math.random);
        const f = this.battle(c, enemyGroup(`${ROAD}:${landOf(this.graph.get(s.p)?.te)}`, level, Math.random, night), level, this.conditions(s).rain);
        if (!f) return false;
        const xp = f.w ? 1 : BEATEN_XP, near = place ? ` near ${placeName(place)}` : "";
        for (const hero of this.fought(c, f)) {
            const player = c.owner(hero);
            IBS.heroes.learn(player, hero, Skill.FIGHTING, Math.round(unitXp(hero.d, Skill.FIGHTING, ROAD_XP_MS, night) * xp));
            IBS.heroes.learnAround(player, hero, [[Skill.FIGHTING, ROAD_XP_MS]], TaskKind.TRAVEL, xp);
            const left = this.loot(player, f);
            IBS.heroes.note(player, hero, f.w ? JournalKind.WON : JournalKind.LOST, f.w ? `Fought off ${foesText(f)} on the road${near}${left}` : `Beaten by ${foesText(f)} on the road${near}`);
            if (f.w) { player.inventory.adjustGold(this.gold(player, hero.d, exploreGold(level, Math.random()))); player.stashChanged = true; }
        }
        return true;
    }

    // Coming to a stop on the road near a roaming beast (shared/Sights.ts) they
    // haven't met: a hard fight with it (a hero alone, or a formed party
    // together, none of them to meet it again), at the deepest level they'd
    // reach in a lair, it BEAST_POWER times that level's danger (drawn big).
    // Won: BEAST_GOLD runs' gold, one or two of what it leaves, and
    // BEAST_XP_MS of Fighting XP, each; beaten, hurt and resting as ever. True if they met one
    private beastFight(c: Crew) {
        const able = c.heroes.filter((h) => !h.s.o);
        let sight: Sight = null;
        for (const h of able) if ((sight = IBS.sights.meet(h, c.s.p, this.clock))) break;
        if (!sight) return false;
        for (const h of able) IBS.sights.met(sight, h);
        const def = BEASTS[sight.v], night = isNight(this.clock);
        const level = Math.max(1, deepestLevel("lair", able.map((h) => h.d))), p = danger(level) * BEAST_POWER, [hp, at, df, sp] = ENEMIES[def.e].m;
        const mx = Math.max(1, Math.round(10 * p * hp));
        const foe: Fighter = { n: beastName(sight), e: def.e, s: 1, g: 1, mx, hp: mx, at: p / 2 * at, df: p / 2 * df, sp, cr: 0.05, dg: 0.03 };
        const f = this.battle(c.party ? c : { ...c, heroes: [able[0]] }, [foe], level, this.conditions(c.s).rain);
        if (!f) return false;
        const xp = f.w ? 1 : BEATEN_XP;
        for (const hero of this.fought(c, f)) {
            const player = c.owner(hero);
            IBS.heroes.learn(player, hero, Skill.FIGHTING, Math.round(unitXp(hero.d, Skill.FIGHTING, BEAST_XP_MS, night) * xp));
            if (!f.w) {
                IBS.heroes.note(player, hero, JournalKind.LOST, `Beaten by ${beastName(sight)} on the road`);
                continue;
            }
            let gold = 0;
            for (let k = 0; k < BEAST_GOLD; k++) gold += exploreGold(level, Math.random());
            gold = this.gold(player, hero.d, gold);
            player.inventory.adjustGold(gold);
            const got = Array.from({ length: Math.random() < 0.5 ? 2 : 1 }, () => this.pick(def.drops));
            for (const id of got) player.inventory.adjustItem(id, 1);
            player.stashChanged = true;
            IBS.heroes.note(player, hero, JournalKind.WON, `Beat ${beastName(sight)} on the road! It left ${got.map(itemName).join(" and ")} (+${gold}g)`);
        }
        return true;
    }

    // what night beasts beaten left, into the inventory: as said in the journal (" - they left Fang")
    private loot(player: Player, f: Fight) {
        const got = nightDrops(f, Math.random);
        for (const id of got) player.inventory.adjustItem(id, 1);
        if (got.length) player.stashChanged = true;
        return got.length ? ` - they left ${got.map(itemName).join(", ")}` : "";
    }

    // the end of a sea crossing: in a storm, now and then battered by it
    // (hurt; too hurt to go on, resting where they land till they've healed)
    private seaStorm(player: Player, hero: Hero, from: number, to: number) {
        const a = this.graph.get(from), b = this.graph.get(to);
        const rain = Math.max(rainAt(a.x, a.y, this.clock), rainAt(b.x, b.y, this.clock));
        if (!rain || Math.random() >= stormChance(hero.d, rain)) return;
        const s = hero.s;
        s.h = Math.min(1, (s.h ?? 0) + STORM_HURT);
        if (s.h >= 1) s.o = 1;
        const place = this.places.get(to) ?? this.places.get(from);
        IBS.heroes.note(player, hero, JournalKind.WEATHER, `Battered by a storm at sea${place ? ` off ${placeName(place)}` : ""}`);
    }

    // the potion in a hero's Potion slot, if its owner's stash has one (0: none)
    public potionFor(hero: Hero, owner: Player) {
        const id = worn(hero.d, Slot.POTION);
        return id && (owner?.inventory.items.get(id)?.amount ?? 0) > 0 ? id : 0;
    }

    // those in a fight who used up their potion: one out of its owner's stash
    public usedPotions(f: Fight, party: Hero[], owner: (h: Hero) => Player) {
        for (const h of party) {
            const p = owner(h), id = worn(h.d, Slot.POTION);
            if (!p || !id || !potionUsed(f, h.id)) continue;
            p.inventory.adjustItem(id, -1);
            p.stashChanged = true;
        }
    }

    // Eating as they work (shared/Tasks.ts MEAL_MS): fed, how much quicker
    // they work; not, the next meal of the kind in their Food slot out of the
    // stash, if there's one (s.m the meal, s.n how long it has left)
    private fed(player: Player, hero: Hero) {
        const s = hero.s;
        if (!(s.n > 0)) {
            const id = worn(hero.d, Slot.FOOD);
            if (!id || (player.inventory.items.get(id)?.amount ?? 0) < 1) { s.m = s.n = undefined; return 1; }
            player.inventory.adjustItem(id, -1);
            player.stashChanged = true;
            s.m = id;
            s.n = MEAL_MS;
        }
        return mealWork(s.m);
    }
    private eat(hero: Hero, ms: number) {
        const s = hero.s;
        if (s.n > 0) s.n -= ms;
    }

    // a formed party's leader, working with at least one other beside them (shared/Parties.ts Leadership; null: none)
    private leadOf(c: Crew, workers: Hero[]) {
        if (!c.party || workers.length < 2) return null;
        const lead = this.formed.leader(c.party);
        return workers.includes(lead) ? lead : null;
    }

    // a unit's work led, `beside` others with them: learned the first time, then trained
    private led(player: Player, hero: Hero, unit: number, beside: number) {
        if (learnExtended(hero.d, LEADERSHIP)) IBS.heroes.note(player, hero, JournalKind.LEVEL, `Picked up ${EXTENDED[LEADERSHIP]}`);
        IBS.heroes.learn(player, hero, EXT + LEADERSHIP, Math.round(unitXp(hero.d, EXT + LEADERSHIP, unit) * LEAD_XP_SHARE * beside));
    }

    // those hurt, tended by any healer in their party (shared/Fights.ts tendMul), a word to
    // the client as that changes (it runs their health bars on); true if it did
    private tend(heroes: Hero[]) {
        let changed = false;
        for (const h of heroes) {
            const mul = h.s.h ? tendMul(this.partyOf(h).map((m) => m.d)) : 1, z = mul > 1 ? mul : undefined;
            if (h.s.z != z) { h.s.z = z; changed = true; }
        }
        return changed;
    }

    // hurt healing as time goes by (quicker resting, fed, by their traits and a healer with them)
    private heal(hero: Hero, ms: number, resting = false) {
        const s = hero.s;
        if (!s.h) return;
        s.h -= ms * healRate(hero.d, s, resting);
        if (s.h <= 0) s.h = undefined;
    }

    // one gathered, made, worked, explored or looked about: into the
    // inventory, and XP into the skills it took (a dungeon run: `run`, its
    // level and the fight at the bottom, beaten finding nothing and learning half as much)
    // (an event's unit: its own, EventManager.work; an event's boon at the place: more XP, or twice the finds exploring;
    // their traits: fumbling one now and then, finding or making more, gold)
    private produce(player: Player, hero: Hero, w: Task, run: { level: number, f: Fight } = null) {
        const inv = player.inventory, h = hero.d;
        if (w.k == TaskKind.EVENT) {
            const e = IBS.events.liveOne(w.m);
            if (e) IBS.events.work(player, hero, e);
            return;
        }
        const events = Array.from(IBS.events.events.values()), now = Date.now(), night = isNight(this.clock);
        let xp = boonAt(events, w.p, "xp", now) * IBS.events.townRate(w.p);
        const fumbled = (w.k == TaskKind.GATHER || w.k == TaskKind.CRAFT) && Math.random() < traitAdd(h, "fumble");
        if (fumbled) xp *= 0.5;
        if (w.k == TaskKind.EXPLORE && run) {
            const kind = kindOf(this.places.get(w.p)), { level, f } = run;
            if (f && !f.w) {
                xp *= BEATEN_XP;
                IBS.heroes.note(player, hero, JournalKind.LOST, `Beaten by ${foesText(f)} on floor ${level} of ${this.nameOf(w.p)}`);
            }
            else {
                this.moment(player, hero, Where.DUNGEON, w.p, level, EXPLORE_MS);
                IBS.seasons.did(player, Deed.EXPLORE);
                // (an opening: twice the finds and gold, and now and then a rare find; shared/Sights.ts)
                const opening = IBS.sights.openingAt(w.p);
                const loot = boonAt(events, w.p, "loot", now) * (opening ? OPENING_LOOT : 1);
                for (let k = 0; k < loot * PACE; k++) {
                    const found = this.pick(materialsAt(kind, level));
                    if (found) inv.adjustItem(found.id, this.finds(h));
                    inv.adjustGold(this.gold(player, h, exploreGold(level, Math.random())));
                }
                if (opening && Math.random() < OPENING_RARE) {
                    const rare = this.pick(rareMaterials(RARE_FROM));
                    if (rare) {
                        inv.adjustItem(rare.id, 1);
                        IBS.heroes.note(player, hero, JournalKind.DONE, `Found ${rare.name} deep in ${opening.n}!`);
                    }
                }
                const left = f ? this.loot(player, f) : "";
                if (left) IBS.heroes.note(player, hero, JournalKind.WON, `Night beasts on floor ${level} of ${this.nameOf(w.p)}${left}`);
            }
        }
        for (const [skill, ms] of taskXp(w)) IBS.heroes.learn(player, hero, skill, Math.round(unitXp(h, skill, ms, night) * xp));
        IBS.heroes.learnAround(player, hero, taskXp(w), w.k, xp);
        if (w.k == TaskKind.ADVENTURE) {
            // (an opening they'd made for that's closed since: looking about where it was finds nothing)
            const there = this.places.get(hero.s.a), kind = there ? kindOf(there) : "";
            for (let k = 0; k < PACE; k++) {
                const found = Math.random() < ADVENTURE_FIND ? this.pick(materialsAt(kind, this.deepest(kind, hero))) : null;
                if (found) inv.adjustItem(found.id, this.finds(h));
                inv.adjustGold(this.gold(player, h, 1 + Math.floor(Math.random() * 3)));
            }
            this.moment(player, hero, Where.ADVENTURE, hero.s.a, this.deepest(kind, hero), LOOK_MS);
            IBS.seasons.did(player, Deed.EXPLORE);
            hero.s.a = undefined;       // (on to the next)
            IBS.guide.did(player, Step.ADVENTURE);
        }
        if (w.k == TaskKind.GATHER && !fumbled) {
            let n = Math.random() < traitAdd(h, "extra") ? 2 : 1;
            // (a lucky one: more with it, told them with a flash: shared/Tasks.ts LUCKY_ODDS)
            if (Math.random() < 1 / LUCKY_ODDS) {
                n += LUCKY_MORE;
                IBS.analytics.track.used(player, "LUCKY_GATHER");
                if (player.online) player.send({ r: S2C.HERO_LUCKY, h: hero.id, m: w.m, n: LUCKY_MORE });
            }
            inv.adjustItem(w.m, n);
            IBS.bounties.gathered(player, w.m, n);
            IBS.seasons.did(player, Deed.GATHER, n);
            IBS.sights.gathered(player, hero, w.p);
        }
        if (w.k == TaskKind.CRAFT && !fumbled) {
            if (Math.random() >= traitAdd(h, "thrift")) for (const [id, n] of recipeOf(w.m).needs) inv.adjustItem(id, -n);
            // (each one made rolls its quality, shared/Tasks.ts rollQuality; a Superior or better one's noted)
            for (let k = Math.random() < traitAdd(h, "twin") ? 2 : 1; k > 0; k--) {
                const q = rollQuality(h, w.m, Math.random()), made = withQuality(w.m, q);
                inv.adjustItem(made, 1);
                IBS.seasons.did(player, Deed.CRAFT);
                if (q >= Quality.FINE) IBS.seasons.did(player, Deed.FINE);
                if (q >= Quality.SUPERIOR) IBS.heroes.note(player, hero, JournalKind.DONE, `Made a ${itemName(made)}!`);
            }
            if (isGear(w.m)) IBS.guide.did(player, Step.CRAFT);
        }
        if (w.k == TaskKind.WORK) {
            inv.adjustGold(Math.round(shiftGold(hero.d) * IBS.guilds.goldMul(player.id)));
            IBS.seasons.did(player, Deed.WORK);
        }
        player.stashChanged = true;
    }

    //#endregion

    //#region moments on the road (shared/Choices.ts)

    // a dungeon run won or a place looked about (`baseMs` its time at x1): now
    // and then a moment, at `placeId` and `level`. Signed in, it waits on
    // your answer (they work on meanwhile); else they pick for themselves
    private moment(player: Player, hero: Hero, at: Where, placeId: number, level: number, baseMs: number) {
        const s = hero.s;
        if (s.c || Math.random() >= baseMs / MOMENT_MS) return;
        const m = rollMoment(at, isNight(this.clock));
        if (!m) return;
        s.c = { m: m.id, o: openWays(hero.d, m), p: placeId, l: level, t: Date.now() + CHOICE_MS };
        if (this.catching || !player.online) this.choose(player, hero, -1);
    }

    // your answer to a hero's moment (-1, or one not open to them: they pick)
    public answer(player: Player, heroId: number, way: any) {
        const hero = player.heroes.find((h) => h.id == heroId);
        if (!hero?.s.c) return;
        this.clock = Date.now();
        this.choose(player, hero, Number.isInteger(way) ? way : -1);
        this.send(player, hero);
        if (player.stashChanged) {
            player.stashChanged = false;
            player.stashDirty = true;
            this.sendStash(player);
        }
    }

    // the moment waiting on them, answered (`pick` the way, by its place; not
    // one open to them: their own pick) and what came of it: gold, finds,
    // hurt or rest, time held up, XP into the skill it tested, now and then
    // an extended skill picked up; in their journal and the away summary
    private choose(player: Player, hero: Hero, pick: number) {
        const s = hero.s, c = s.c, h = hero.d;
        s.c = undefined;
        player.heroesDirty.add(hero);
        const m = c && momentOf(c.m);
        if (!m || !c.o.length) return;
        const by = c.o.includes(pick) ? pick : ownPick(h, m, c.o), way = m.o[by];
        const won = Math.random() < chance(h, way), out = won ? way.win : way.lose ?? way.win;
        const inv = player.inventory, got: string[] = [];
        const runs = (times: number) => {
            let n = 0;
            for (let k = 0; k < times; k++) n += exploreGold(c.l, Math.random());
            return n;
        };
        if (out.g > 0) {
            const n = this.gold(player, h, runs(out.g));
            inv.adjustGold(n);
            got.push(`+${n}g`);
        }
        if (out.g < 0) {
            const n = Math.min(inv.gold, runs(-out.g));
            if (n > 0) { inv.adjustGold(-n); got.push(`-${n}g`); }
        }
        if (out.f) {
            const at = this.places.get(c.p), kind = at ? kindOf(at) : "", found = new Map<number, number>();
            for (let k = 0; k < out.f; k++) {
                const one = this.pick(materialsAt(kind, c.l));
                if (one) found.set(one.id, (found.get(one.id) ?? 0) + this.finds(h));
            }
            for (const [id, n] of found) { inv.adjustItem(id, n); got.push(`${itemName(id)}${n > 1 ? ` x${n}` : ""}`); }
        }
        if (got.length) player.stashChanged = true;
        if (out.h) {
            s.h = Math.max(0, Math.min(1, (s.h ?? 0) + out.h)) || undefined;
            if (s.h >= 1) s.o = 1;
        }
        if (out.y) s.v = s.y = (s.y ?? 0) + out.y * 60000;

        const line = `${out.t}${got.length ? ` (${got.join(", ")})` : ""}`;
        IBS.heroes.note(player, hero, JournalKind.CHOICE, line);
        IBS.heroes.away.chose(player, hero, line);
        const skill = waySkill(way);
        if (skill != null) IBS.heroes.learn(player, hero, skill, Math.round(unitXp(h, skill, CHOICE_XP_MS, isNight(this.clock)) * (won ? 1 : 0.5)));
        if (won && way.learns && Math.random() < LEARN_CHANCE * traitMul(h, "learn") && learnExtended(h, EXTENDED.indexOf(way.learns)))
            IBS.heroes.note(player, hero, JournalKind.LEVEL, `Picked up ${way.learns}`);
        if (player.online) player.send({ r: S2C.HERO_CHOSE, h: hero.id, m: m.id, o: by, w: won ? 1 : 0, t: line });
    }

    //#endregion

    //#region time going by

    // works out `ms` more of what a hero's doing; true if what's seen of it
    // changed (where they are on a leg isn't: the client moves them along it
    // itself). In a formed party: with it, the party does (advanceParty); on
    // their way to it, getting there (joining)
    public advance(player: Player, hero: Hero, ms: number) {
        const f = this.formed.of(hero);
        let changed = false;
        // (in a party that's gone, or that let them go while they weren't loaded: their own list again)
        if (hero.s.g != null && !f) { this.formed.loose(hero); changed = true; }
        if (f) {
            if (this.formed.at(f, hero)) { hero.s.t = Date.now(); return false; }
            return this.joining(player, hero, f, ms);
        }
        return this.run({ s: hero.s, heroes: [hero], owner: () => player }, ms) || changed;
    }

    // on their way to their formed party: where it is, then waiting there,
    // resting, till it's with them (their own list waits meanwhile)
    private joining(player: Player, hero: Hero, f: Formed, ms: number) {
        const s = hero.s, q = s.q, b = s.b, meet = this.formed.meetAt(f);
        const going = s.w?.k == TaskKind.TRAVEL && s.w.p == meet, there = s.w?.k == TaskKind.REST && s.p == meet && !s.r.length;
        if (!going && !there) { s.w = null; s.d = 0; s.u = 0; s.a = s.e = undefined; }
        s.q = [{ k: TaskKind.TRAVEL, p: meet }];
        s.b = undefined;
        try {
            return this.run({ s, heroes: [hero], owner: () => player }, ms);
        } finally {
            s.q = q;
            s.b = b;
        }
    }

    // a formed party's with it worked out to as far as its players loaded
    // have theirs (FormedParties.until); none loaded, it waits, nothing owed
    private stepParty(f: Formed) {
        const until = this.formed.until(f);
        if (until == null) { f.s.t = Date.now(); return; }
        this.advanceParty(f, Math.max(0, until - (f.s.t ?? until)));
    }

    // `ms` more of a formed party's with it: what changed saved and told
    // (their heroes' states, and the party's); true if it did
    public advanceParty(f: Formed, ms: number) {
        if (!f.with.length) return false;
        if (!this.run({ s: f.s, heroes: f.with, owner: (h) => this.parties.ownerOf(h), party: f }, ms)) return false;
        f.dirty = true;
        for (const h of f.with) {
            const p = this.parties.ownerOf(h);
            p.heroesDirty.add(h);
            if (p.online) this.send(p, h);
            IBS.friends.heroSeen(p, h);
        }
        this.formed.sendState(f);
        return true;
    }

    // a formed party's state on each with it (where they are and what's under way, theirs to show and save)
    private mirror(c: Crew) {
        if (!c.party) return;
        const s = c.s;
        for (const h of c.heroes) {
            const m = h.s;
            m.p = s.p; m.r = s.r.slice(); m.l = s.l; m.w = s.w && { ...s.w }; m.d = s.d; m.u = s.u; m.a = s.a; m.e = s.e; m.t = s.t;
        }
    }

    // one of what's under way done, by each working at it (a dungeon run:
    // one fight at its bottom, theirs together)
    private complete(c: Crew, workers: Hero[], w: Task) {
        const s = c.s;
        let run: { level: number, f: Fight } = null;
        if (w.k == TaskKind.EXPLORE) {
            // (as deep as the party got as the run started, or deeper with more joining: never shallower for any leaving)
            const kind = kindOf(this.places.get(w.p)), level = Math.max(s.e ?? 0, this.deepest(kind, c.heroes[0]));
            s.e = undefined;
            run = { level, f: this.battle({ ...c, heroes: workers }, enemyGroup(kind, level, Math.random, isNight(this.clock)), level) };
        }
        this.mirror(c);
        for (const hero of workers) {
            const player = c.owner(hero);
            // (two of theirs crafting out of the one stash: the next only if there's still enough)
            if (w.k == TaskKind.CRAFT && hero != workers[0] && this.cannot(player, hero, w, false)) continue;
            this.produce(player, hero, w, run);
        }
        s.a = undefined;        // (adventuring: on to the next)
    }

    // works out `ms` more of what a crew's doing (a hero alone, or a formed
    // party's with it); true if what's seen of it changed
    private run(c: Crew, ms: number) {
        const s = c.s, all = c.heroes;
        let changed = false, looked = false;
        this.clock = s.t ?? Date.now();
        for (let guard = 0; guard < 50000; guard++) {
            if (this.tend(all)) changed = true;     // (each go round: hurt in a fight just now, or a healer come or gone)
            // beaten (or too hurt to go down), resting where they are till
            // they've healed, or held up by a moment on the road: that long
            // first, then on with it (a party waiting on any of them, the rest resting)
            const held = all.filter((h) => h.s.o || h.s.y);
            if (held.length) {
                const left = (h: Hero) => h.s.o ? (h.s.h ?? 0) / healRate(h.d, h.s, true) : h.s.y;
                const step = Math.min(ms, ...held.map(left));
                let over = false;
                for (const h of all) {
                    const hs = h.s;
                    if (hs.o) {
                        if (left(h) <= step) { hs.h = hs.o = undefined; over = true; }
                        else this.heal(h, step, true);
                    } else if (hs.y) {
                        if (hs.y <= step) { this.heal(h, hs.y); hs.y = hs.v = undefined; over = true; }
                        else { hs.y -= step; this.heal(h, step); }
                    } else this.heal(h, step, true);
                }
                ms -= step;
                this.clock += step;
                if (over) { changed = true; continue; }
                break;
            }
            // (resting for want of an event, as a backup task: one's on now; looked for once a go, whatever comes of it)
            if (!looked && s.w?.k == TaskKind.REST && !s.w.n && !s.q.length && anyEvent(s.b)) {
                looked = true;
                if (this.nearestEvent(s)) s.w = null;
            }
            if (!s.w) {
                s.w = this.placed(s, s.q[0] ?? this.fallback(s)); s.d = 0; s.u = 0; changed = true;
                c.party?.sat.clear();
                const e = s.w.k == TaskKind.EVENT ? IBS.events.liveOne(s.w.m) : null;
                if (e) for (const h of all) IBS.heroes.note(c.owner(h), h, JournalKind.EVENT, `Joined ${eventTitle(e)} in ${this.nameOf(e.p)}`);
            }
            // (a marching boss's event: wherever it's making for now)
            if (s.w.k == TaskKind.EVENT) { const e = IBS.events.liveOne(s.w.m); if (e && e.p != s.w.p) { s.w.p = e.p; changed = true; } }
            const w = s.w, target = w.k == TaskKind.REST ? null : w.k == TaskKind.ADVENTURE ? this.stop(s) : w.p;

            // exploring or gathering at an opening that's closed (shared/Sights.ts): given up
            if ((w.k == TaskKind.EXPLORE || w.k == TaskKind.GATHER) && w.p != null && !this.places.get(w.p)) {
                this.drop(c, "It has closed again");
                changed = true;
                continue;
            }

            // events with none named, on the list, and none on: passed over
            if (anyEvent(w)) {
                this.drop(c, "No events are on right now");
                changed = true;
                continue;
            }

            // an event that's over (won or out of time): done with it (a backup task's, gone,
            // but for one with none named: on to the next)
            if (w.k == TaskKind.EVENT && !IBS.events.liveOne(w.m)) {
                if (s.q.length) this.finish(s);
                else { if (!anyEvent(s.b)) s.b = undefined; s.w = null; s.d = 0; s.u = 0; }
                changed = true;
                continue;
            }

            // getting there: the leg under way finished first, then the shortest way from there
            if (target != null && target != (s.r.length ? s.r[s.r.length - 1] : s.p)) {
                const from = s.l > 0 && s.r.length ? s.r[0] : s.p;
                const way = findPath(this.graph, from, target);
                if (!way) { this.drop(c, `No way to ${this.nameOf(target)}`); changed = true; continue; }
                s.r = from == s.p ? way : [from, ...way];
                changed = true;
            } else if (target == null && s.r.length) {
                s.r = s.l > 0 ? [s.r[0]] : [];
            }
            // (a step at a time: quicker or slower by the time of day and the weather; a party at the slowest one's pace)
            if (s.r.length) {
                // (a party: setting off nowhere new while one of them's on the way to it, resting meanwhile)
                if (c.party && !(s.l > 0) && this.formed.awaited(c.party)) {
                    for (const h of all) this.heal(h, ms, true);
                    this.clock += ms;
                    break;
                }
                const from = s.p, to = s.r[0], leg = legLength(this.graph.get(from), this.graph.get(to)), cond = this.conditions(s);
                const v = Math.min(...all.map((h) => travelSpeed(h.d) / 1000 * travelPace(h.d, cond))), need = (leg - s.l) / v, step = this.step(ms);
                if (step < need) {
                    s.l += step * v;
                    for (const h of all) this.heal(h, step);
                    ms -= step; this.clock += step;
                    if (ms <= 0) break;
                    continue;
                }
                ms -= need;
                this.clock += need;
                for (const h of all) this.heal(h, need);
                s.p = s.r.shift();
                s.l = 0;
                changed = true;
                this.mirror(c);
                for (const h of all) IBS.heroes.arrived(c.owner(h), h, s.p);
                if (isSeaLeg(this.graph.get(from), this.graph.get(to))) for (const h of all) this.seaStorm(c.owner(h), h, from, to);
                // (a fight there: standing there while it plays, not walking on: held up)
                if (this.beastFight(c) || this.roadFight(c)) for (const h of all) if (h.f && !h.s.o) h.s.v = h.s.y = (h.s.y ?? 0) + playMs(h.f);
                continue;
            }

            // there: doing it
            if (w.k == TaskKind.TRAVEL) { this.finish(s); changed = true; continue; }
            if (w.k == TaskKind.REST) {
                const need = w.n ? w.n * 60000 - s.u : Infinity;
                const minute = Math.floor(s.u / 60000);
                if (ms < need) {
                    s.u += ms;
                    for (const h of all) this.heal(h, ms, true);
                    if (w.n && Math.floor(s.u / 60000) != minute) changed = true;
                    break;
                }
                ms -= need;
                this.clock += need;
                for (const h of all) this.heal(h, need, true);
                this.finish(s);
                changed = true;
                continue;
            }
            // (those who can't: in a party, sitting it out, told once; none can, given up)
            const why = all.map((h) => this.cannot(c.owner(h), h, w, s.u == 0)), workers = all.filter((_, i) => !why[i]);
            // (a party short of one still on their way to it: waiting for them, resting meanwhile)
            if (!workers.length && c.party && this.formed.awaited(c.party)) {
                for (const h of all) this.heal(h, ms, true);
                this.clock += ms;
                break;
            }
            if (!workers.length) { this.drop(c, why[0]); changed = true; continue; }
            if (c.party) all.forEach((h, i) => {
                if (!why[i] || c.party.sat.has(h.id)) return;
                c.party.sat.add(h.id);
                IBS.heroes.note(c.owner(h), h, JournalKind.GAVE_UP, `Sitting this one out: ${why[i]}`);
            });
            const fights = w.k == TaskKind.EXPLORE || (w.k == TaskKind.EVENT && isBossEvent(IBS.events.liveOne(w.m)));
            if (fights && s.u == 0) {
                const hurt = workers.filter((h) => (h.s.h ?? 0) > HURT_MOST);
                if (hurt.length) { for (const h of hurt) h.s.o = h.s.h; changed = true; continue; }
            }
            if (w.k == TaskKind.EXPLORE && s.u == 0 && s.e == null) s.e = this.deepest(kindOf(this.places.get(w.p)), all[0]);
            // (s.u: how far into it, at their pace without the time and weather; those a step at a time;
            // a party's at their pace and time for one together, each fed or not)
            const cond = this.conditions(s), skill = workSkillOf(w);
            const lead = this.leadOf(c, workers);
            const pace = mean(workers.map((h) => workPace(h.d, cond, skill) * this.fed(c.owner(h), h))) * (lead ? leadWork(extLevel(lead.d, LEADERSHIP)) : 1);
            const unit = mean(workers.map((h) => this.unitMs(c.owner(h), h, w)));
            const need = (unit - s.u) / pace, step = Math.min(this.step(ms), ...workers.filter((h) => h.s.n > 0).map((h) => h.s.n));
            if (step < need) {
                s.u += step * pace;
                for (const h of all) this.heal(h, step);
                for (const h of workers) this.eat(h, step);
                ms -= step; this.clock += step;
                if (ms <= 0) break;
                continue;
            }
            ms -= need;
            this.clock += need;
            for (const h of all) this.heal(h, need);
            for (const h of workers) this.eat(h, need);
            s.u = 0;
            this.complete(c, workers, w);
            if (lead) this.led(c.owner(lead), lead, unit, workers.length - 1);
            s.d++;
            changed = true;
            if (w.n && s.d >= w.n) {
                for (const h of all) IBS.heroes.note(c.owner(h), h, JournalKind.DONE, doneText(w, this.nameOf));
                this.finish(s);
            }
        }
        s.t = Date.now();
        this.mirror(c);
        return changed;
    }

    // off the roster into the barracks (HeroManager.swap): a moment waiting on
    // you answered for you, out of their formed party, fights not yet sent
    // forgotten; their state then as it stays till they're called up (s.t: when)
    public async benched(player: Player, hero: Hero) {
        if (hero.s.c) { this.clock = Date.now(); this.choose(player, hero, -1); }
        await this.formed.dismissed(hero);
        hero.f = hero.a = undefined;
        hero.s.t = Date.now();
        player.heroesDirty.delete(hero);
    }

    // back on the roster: healed as if resting all the while (done healing,
    // their rest for it's over), and on from now, nothing else gone by
    public calledUp(hero: Hero) {
        const s = hero.s, now = Date.now();
        this.heal(hero, Math.max(0, now - (s.t ?? now)), true);
        if (!s.h) { s.o = undefined; s.z = undefined; }
        s.t = now;
    }

    // how long a player's heroes work on after they sign out
    public awayFor(player: Player) {
        return player.record.isPremium() ? HeroTasks.AWAY_PREMIUM_MS : HeroTasks.AWAY_MS;
    }

    public awayMost() {
        return Math.max(HeroTasks.AWAY_MS, HeroTasks.AWAY_PREMIUM_MS);
    }

    // their heroes worked out to now, or to awayUntil if that's gone by
    // (signing in, loading them, and signed out every AWAY_STEP_MS); the
    // whole inventory goes with signing in
    public catchUp(player: Player) {
        const until = Math.min(Date.now(), player.awayUntil || Infinity);
        this.catching = true;
        try {
            for (const hero of player.heroes) {
                // (one left waiting as they signed out: they pick)
                if (hero.s.c) { this.clock = hero.s.t ?? Date.now(); this.choose(player, hero, -1); }
                if (this.advance(player, hero, Math.max(0, until - (hero.s.t ?? until)))) {
                    player.heroesDirty.add(hero);
                    IBS.friends.heroSeen(player, hero);
                }
            }
        } finally {
            this.catching = false;
        }
        for (const hero of player.heroes) hero.f = hero.a = undefined;     // (gone by: nobody saw it)
        this.parties.forget(player);        // (signing in: told their parties again)
        this.busy.forget(player);           // (and how busy the places are)
        this.featured.forget(player);       // (and the featured parties)
        this.demo.forget(player);
        player.inventory.changed.clear();
        if (player.stashChanged) { player.stashChanged = false; player.stashDirty = true; }
    }

    public update(deltaTime: number) {
        const save = (this.saveTime += deltaTime) >= HeroTasks.SAVE_MS;
        if (save) this.saveTime = 0;
        const away = (this.awayTime += deltaTime) >= HeroTasks.AWAY_STEP_MS;
        if (away) this.awayTime = 0;
        // (who's with whom, from what everyone loaded is doing now: formed parties first)
        this.parties.index(IBS.players.all());
        this.formed.gather();
        this.parties.regroup();
        this.busy.update(deltaTime, IBS.players.all());
        this.featured.update(deltaTime, IBS.players.all());
        this.demo.update(deltaTime, IBS.players.all());
        // (each formed party as one, those with it skipped after; each player, and
        // each hero, on their own: one throwing is skipped, not everyone, utils/Guard)
        for (const f of Array.from(this.formed.parties.values())) this.guard.run(`party ${f.id}`, () => this.stepParty(f));
        for (const player of IBS.players.all().slice()) {
            if (!player.online) {
                if (away) this.guard.run(`away ${player.id}`, () => this.stepAway(player));
                continue;
            }
            for (const hero of player.heroes) this.guard.run(hero.id, () => {
                // (a moment you've not answered in time: they pick)
                const late = hero.s.c && Date.now() >= hero.s.c.t;
                if (late) { this.clock = Date.now(); this.choose(player, hero, -1); }
                if (this.advance(player, hero, deltaTime) || late) {
                    player.heroesDirty.add(hero);
                    this.send(player, hero);
                    IBS.friends.heroSeen(player, hero);
                }
                // (theirs, or one of their party's they fought in)
                for (const f of hero.a ?? []) player.send({ r: S2C.HERO_FIGHT, h: hero.id, f });
                if (hero.f) player.send({ r: S2C.HERO_FIGHT, h: hero.id, f: hero.f });
                this.toldFights(hero);
            }, { playerId: player.id });
            this.guard.run(`player ${player.id}`, () => {
                this.parties.send(player);
                if (player.stashChanged) {
                    player.stashChanged = false;
                    player.stashDirty = true;
                    this.sendStash(player);
                }
            });
        }
        if (save) this.saveAll().catch(Log.catch("Couldn't save the heroes"));
    }

    // what they fought since last time, to demo mode, and done with
    private toldFights(hero: Hero) {
        for (const f of hero.a ?? []) this.demo.fought(hero, f);
        if (hero.f) this.demo.fought(hero, hero.f);
        hero.f = hero.a = undefined;
    }

    // signed out: worked out (nothing sent: nobody's watching but demo mode); at awayUntil
    // saved and let go
    private stepAway(player: Player) {
        this.catchUp(player);
        for (const hero of player.heroes) this.toldFights(hero);
        if (Date.now() >= player.awayUntil) IBS.players.letGo(player);
    }

    //#endregion

    //#region sending and saving

    public send(player: Player, hero: Hero) {
        player.send({ r: S2C.HERO_STATE, h: hero.id, s: hero.s, v: hero.d.v });
    }

    // gold and the items that changed (`quiet`: only moved on or off a hero, nothing to tell them of)
    public sendStash(player: Player, quiet = false) {
        player.send({ r: S2C.HERO_STASH, g: player.inventory.gold, i: player.inventory.takeChanged(), ...(quiet && { q: 1 }) });
    }

    private async saveStash(player: Player) {
        const inv = player.inventory.getJSON();
        await InventoryRecord.Update(player.id, inv.g, JSON.stringify(inv.i));
    }

    // [id, state as JSON, data as JSON] of heroes, written as they are now (the data for their skills' XP)
    private rows(heroes: Iterable<Hero>): Row[] {
        return Array.from(heroes, (h): Row => [h.id, JSON.stringify(h.s), JSON.stringify(h.d)]);
    }

    // heroes' states and data in as few statements as it takes
    private async saveStates(rows: Row[]) {
        if (!rows.length) return;
        const conn = await IBS.db.getConnection();
        try {
            for (let i = 0; i < rows.length; i += HeroTasks.SAVE_ROWS) {
                const some = rows.slice(i, i + HeroTasks.SAVE_ROWS);
                const cases = some.map(() => "WHEN ? THEN ?").join(" ");
                await conn.query(`UPDATE hero SET state = CASE id ${cases} END, data = CASE id ${cases} END WHERE id IN (?)`,
                    [...([] as (number | string)[]).concat(...some.map((r) => [r[0], r[1]]), ...some.map((r) => [r[0], r[2]])), some.map((r) => r[0])]);
            }
        } finally {
            conn.release();
        }
    }

    // [id, journal as JSON] of heroes with lines written, and the dirty set cleared
    private journalRows(player: Player): [number, string][] {
        const rows = Array.from(player.journalsDirty, (h): [number, string] => [h.id, JSON.stringify(h.j)]);
        player.journalsDirty.clear();
        return rows;
    }

    // heroes' journals (shared/Journal.ts), as saveStates does their states
    private async saveJournals(rows: [number, string][]) {
        if (!rows.length) return;
        const conn = await IBS.db.getConnection();
        try {
            for (let i = 0; i < rows.length; i += HeroTasks.SAVE_ROWS) {
                const some = rows.slice(i, i + HeroTasks.SAVE_ROWS);
                await conn.query(`UPDATE hero SET journal = CASE id ${some.map(() => "WHEN ? THEN ?").join(" ")} END WHERE id IN (?)`,
                    [...([] as (number | string)[]).concat(...some), some.map((r) => r[0])]);
            }
        } finally {
            conn.release();
        }
    }

    // the heroes of everyone loaded that changed, and inventories added to;
    // those signed in seen now (so a restart knows when their heroes stop)
    private async saveAll() {
        const rows: Row[] = [];
        const journals: [number, string][] = [];
        const stashes: Player[] = [];
        for (const player of IBS.players.all()) {
            rows.push(...this.rows(player.heroesDirty));
            player.heroesDirty.clear();
            journals.push(...this.journalRows(player));
            if (player.stashDirty) { player.stashDirty = false; stashes.push(player); }
        }
        await this.saveStates(rows);
        await this.saveJournals(journals);
        for (const player of stashes) await this.saveStash(player);
        await this.formed.saveAll();
        await PlayerRecord.Touch(IBS.players.online().map((p) => p.id), Date.now());
    }

    // as they sign out, and stop working away: all their heroes' states, the
    // inventory if they've added to it, and the away summary's snapshot
    public async save(player: Player) {
        // (those in the barracks changed too: their gear or looks)
        const rows = this.rows(new Set([...player.heroes, ...player.heroesDirty]));
        player.heroesDirty.clear();
        // (changed since the last tick too: an admin's gift or an event's reward just before they went)
        if (player.stashDirty || player.stashChanged) { player.stashDirty = player.stashChanged = false; await this.saveStash(player); }
        await this.saveStates(rows);
        await this.saveJournals(this.journalRows(player));
        await IBS.heroes.away.save(player);
    }

    //#endregion

}
