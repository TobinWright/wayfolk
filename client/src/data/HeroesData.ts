import * as PIXI from "pixi.js";
import { HeroData, levelAt } from "../../../shared/Heroes";
import { JournalEntry } from "../../../shared/Journal";
import { placeName, WorldPlace } from "../../../shared/Places";
import { HeroState, TaskKind } from "../../../shared/Tasks";
import { FeaturedHero, PartyMember } from "../../../shared/Parties";
import { Graph, isSeaLeg, legLength, makeGraph, travelSpeed } from "../../../shared/Travel";
import { conditionsAt, travelPace } from "../../../shared/Conditions";

// how far along their leg a hero's marker has been moved, and when to (by the
// time of day and the weather as it goes, as the server moves them); started
// again when a new state comes (at)
interface Along { at: number; t: number; l: number; }
const STEP_MS = 1000;

// your heroes, as the server sends them ([id, HeroData, HeroState] rows);
// `at`: when their state came (they're moved along a leg from then on)
// (party: who's with them now, them included - HERO_PARTY; none yet: alone)
// (journal: their journal, oldest first - HERO_JOURNAL, asked for as it's first opened; none yet: not asked)
// (owner: someone else's hero viewed, their player's name - HERO_VIEW)
export interface HeroRow { id: number; d: HeroData; s: HeroState; at: number; party?: PartyMember[]; journal?: JournalEntry[]; owner?: string; }

// a featured party on the map (S2C.HERO_FEATURED): who's in it, leader first, as
// a party's members are, and their heroes (anyone's, drawn but not opened, but in demo mode)
export interface FeaturedParty { party: PartyMember[]; rows: HeroRow[]; }

export class HeroesData {

    public heroes: HeroRow[] = [];
    public barracks: HeroRow[] = [];               // (off the roster, not working: shared/Heroes.ts barracksSlots)
    public featured: FeaturedParty[] = [];
    public demo: FeaturedParty[] = null;            // every party, in demo mode (S2C.ADMIN_DEMO_PARTIES; null: not in it)
    public demoRows: HeroRow[] = [];
    private demoById = new Map<number, HeroRow>();
    private others = new Map<number, HeroRow>();     // (someone else's, viewed)
    private along = new WeakMap<HeroRow, Along>();
    public graph: Graph = new Map();
    public places = new Map<number, WorldPlace>();

    public load(json: any, nodes: any, barracks: any) {
        this.heroes = (json ?? []).map((row: any) => this.toRow(row));
        this.barracks = (barracks ?? []).map((row: any) => this.toRow(row));
        this.graph = makeGraph(nodes ?? []);
        for (const p of PIXI.Assets.get("map-world").places) this.places.set(p.i, p);
    }

    public add(row: any) {
        const hero = this.toRow(row);
        this.heroes.push(hero);
        return hero;
    }

    // one let go (S2C.HERO_DISMISSED), off the roster or out of the barracks: them as they were (none such: null)
    public remove(id: number) {
        const hero = this.get(id) ?? this.benched(id);
        for (const list of [this.heroes, this.barracks]) if (list.includes(hero)) list.splice(list.indexOf(hero), 1);
        return hero ?? null;
    }

    // one hired into the barracks, or sent there (S2C.HERO_SWAPPED: as the server has them now)
    public bench(row: any) {
        const hero = this.toRow(row);
        this.barracks.push(hero);
        this.barracks.sort((a, b) => a.id - b.id);
        return hero;
    }

    // one in the barracks (none such: undefined)
    public benched(id: number) {
        return this.barracks.find((h) => h.id == id);
    }

    // on the roster or in the barracks
    public own(id: number) {
        return this.get(id) ?? this.benched(id);
    }

    public all() {
        return [...this.heroes, ...this.barracks];
    }

    // the featured parties as the server sent them ([[FeaturedHero]], leader first)
    public setFeatured(parties: FeaturedHero[][]) {
        this.featured = this.toParties(parties);
    }

    // into demo mode (with none yet), or out (false)
    public setDemo(on: boolean) {
        this.demo = on ? [] : null;
        this.demoRows = [];
        this.demoById.clear();
    }

    // parties new or changed, and those gone by their leaders; the rest as they
    // are, moved along from when they came. Each hero knows their party: they walk with it
    public updateDemo(changed: FeaturedHero[][], gone: number[]) {
        const parties = this.toParties(changed), out = new Set(gone);
        for (const f of parties) out.add(f.party[0]?.[0]);
        this.demo = this.demo.filter((f) => !out.has(f.party[0]?.[0])).concat(parties);
        this.demoRows = this.demo.flatMap((f) => {
            for (const row of f.rows) row.party = f.party;
            return f.rows;
        });
        this.demoById = new Map(this.demoRows.map((row) => [row.id, row]));
    }

    private toParties(parties: FeaturedHero[][]): FeaturedParty[] {
        return parties.map((heroes) => ({
            party: heroes.map(([id, d, , owner]): PartyMember => [id, d.n, d.l, owner, d.j]),
            rows: heroes.map((row) => this.toRow(row)),
        }));
    }

    public get(id: number) {
        return this.heroes.find((h) => h.id == id);
    }

    // yours, or anyone's in demo mode (none such: undefined)
    public seen(id: number) {
        return this.get(id) ?? this.demoById.get(id);
    }

    // someone else's hero, as the server last sent them (S2C.HERO_VIEW: for their status window)
    public viewed(id: number) {
        return this.others.get(id);
    }

    public setViewed(row: any) {
        const hero = this.toRow(row);
        hero.owner = row[3] ?? "";
        this.others.set(hero.id, hero);
        return hero;
    }

    public setState(id: number, state: HeroState) {
        const hero = this.get(id);
        if (!hero) return null;
        hero.s = state;
        hero.at = Date.now();
        return hero;
    }

    // their skills' XP (HeroData.v), the levels from it; the skills that went up
    public setXp(hero: HeroRow, xp: number[]) {
        if (!Array.isArray(xp)) return [];
        hero.d.v = xp;
        const up: number[] = [];
        xp.forEach((v, skill) => {
            const level = levelAt(v);
            if (level > hero.d.k[skill]) { hero.d.k[skill] = level; up.push(skill); }
        });
        return up;
    }

    public nameOf = (id: number) => placeName(this.places.get(id));

    // where they are on the map now (map px), and which way they're going
    // (dx: 1 right, -1 left, 0 standing; dy: 1 down, -1 up, where that's
    // more the way than across, else 0; moving) - along the leg they're on, from
    // where the server last had them, at their speed (quicker or slower by the
    // time of day and the weather there, a second at a time)
    public position(hero: HeroRow) {
        const s = hero.s, from = this.graph.get(s.p);
        if (!from) return { x: 0, y: 0, dx: 0, dy: 0, moving: false };
        const to = s.r.length ? this.graph.get(s.r[0]) : null;
        if (!to || s.o) return { x: from.x, y: from.y, dx: 0, dy: 0, moving: false };     // (recovering from a fight: where they fought)
        const leg = legLength(from, to), sea = isSeaLeg(from, to), speed = travelSpeed(hero.d) / 1000, now = Date.now();
        let a = this.along.get(hero);
        // (held up a while first - a fight there playing, a moment's outcome: standing till it's over)
        if (!a || a.at != hero.at) this.along.set(hero, a = { at: hero.at, t: hero.at + (s.y ?? 0), l: s.l });
        const held = a.t > now;
        while (a.t < now && a.l < leg) {
            const dt = Math.min(now - a.t, STEP_MS), f = leg ? a.l / leg : 1;
            const c = conditionsAt(from.x + (to.x - from.x) * f, from.y + (to.y - from.y) * f, a.t, sea);
            a.l += speed * travelPace(hero.d, c) * dt;
            a.t += dt;
        }
        a.t = Math.max(a.t, now);
        const along = Math.min(leg, a.l);
        const t = leg ? along / leg : 1;
        const wx = to.x - from.x, wy = to.y - from.y;
        return { x: from.x + wx * t, y: from.y + wy * t, dx: Math.sign(wx), dy: Math.abs(wy) > Math.abs(wx) ? Math.sign(wy) : 0, moving: !held };
    }

    // resting where they are (nothing else to do, told to, or recovering from a fight): camped (art/CampArt)
    public resting(hero: HeroRow) {
        return !!hero.s.o || (!hero.s.r.length && (!hero.s.w || hero.s.w.k == TaskKind.REST));
    }

    // the node they're on or heading to
    public nodeOf(hero: HeroRow) {
        return this.graph.get(hero.s.r.length ? hero.s.r[0] : hero.s.p);
    }

    private toRow(row: any): HeroRow {
        return { id: row[0], d: row[1], s: row[2], at: Date.now() };
    }

}
