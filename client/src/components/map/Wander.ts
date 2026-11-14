import * as PIXI from "pixi.js";
import { PartyMember } from "../../../../shared/Parties";
import { TravelNode } from "../../../../shared/Travel";
import { Fight, playMs } from "../../../../shared/Fights";
import { Task, TaskKind } from "../../../../shared/Tasks";
import { hash } from "../../art/Backdrops";
import { HeroRow } from "../../data/HeroesData";
import { IBC } from "../../Engine";
import { Facing } from "../../people/AvatarArt";

// Heroes walking about a place while they work there (the user, 2026-10-30:
// a node's size is the area a hero walks around in while doing a task, kept
// to where they can walk by whoever places it; only for looks). Where one
// is comes from a seed and the clock alone, so everyone watching sees the
// same: a party (shared/Parties.ts) walks one path, its leader's (the first
// of its members, as the server orders them), each member at their own spot
// in a loose group round it; one alone walks their own. Each leg they stand a
// while, then walk to the next spot. Glide eases a marker over when where
// it should be jumps (arriving, joining a party, a new leader).
// They don't walk at a task done in one spot (crafting, working a shift: the
// user, 2026-10-30), standing at a spot of their own (a party round its
// leader's), nor while a fight of theirs plays (as HeroWindow plays it),
// standing where it found them.

export const LEG_MS = 9000;         // a stand and a walk
export const WALK_SPEED = 6;        // map px a second (travelling: shared/Travel TRAVEL_SPEED 8)
export const WALK_MOST = 0.8;       // of a leg at most walking (quicker over a long way)
export const GLIDE_SPEED = 24;      // map px a second, easing over to where they should be
export const JUMP = 3;              // map px where they should be moving in a frame that's a jump
// a party's spots round its path, by their place in it (the leader on it)
export const GROUP: [number, number][] = [[0, 0], [-7, 2], [7, 2], [0, 5]];
const GROUP_REACH = 7;              // map px the group spreads from the path

// where one stands: x, y map px; face -1 left, 1 right, 0 towards you; fy
// -1 up (away), 1 down, where that's more the way than across, else 0; walking
export interface Stand { x: number; y: number; face: number; fy?: number; walking: boolean; }

// fy for going (dx, dy): up or down where that's more the way than across
function upDown(dx: number, dy: number) {
    return Math.abs(dy) >= 1 && Math.abs(dy) > Math.abs(dx) ? Math.sign(dy) : 0;
}

// a person's facing for where they stand (`otherwise` facing neither way)
export function facingOf(at: { face: number; fy?: number }, otherwise: Facing = Facing.DOWN) {
    return at.fy < 0 ? Facing.UP : at.fy > 0 ? Facing.DOWN : at.face > 0 ? Facing.RIGHT : at.face < 0 ? Facing.LEFT : otherwise;
}

// which way one eased over (Glide.to) is facing: the way it's sliding, else as it's due
export function glideFace(g: { gliding: boolean; mx: number; my: number }, due: { face: number; fy?: number }) {
    if (!g.gliding || Math.hypot(g.mx, g.my) <= 0.05) return { face: due.face, fy: due.fy ?? 0 };
    return Math.abs(g.my) > Math.abs(g.mx) ? { face: 0, fy: Math.sign(g.my) } : { face: Math.sign(g.mx), fy: 0 };
}

// the k-th spot of a seed's walk, in a circle `r` round (cx, cy)
function spot(seed: number, k: number, cx: number, cy: number, r: number) {
    if (r <= 0) return { x: cx, y: cy };
    const d = r * Math.sqrt(hash(k, seed * 3 + 1)), a = 2 * Math.PI * hash(k, seed * 3 + 2);
    return { x: cx + Math.cos(a) * d, y: cy + Math.sin(a) * d };
}

// where a seed's walk round a node has got to `now`
export function walkAt(seed: number, node: TravelNode, now: number, reach = 0): Stand {
    const r = Math.max(0, (node.s ?? 0) - reach);
    const t = now + hash(seed, 7) * LEG_MS, k = Math.floor(t / LEG_MS), into = t - k * LEG_MS;
    const a = spot(seed, k, node.x, node.y, r), b = spot(seed, k + 1, node.x, node.y, r);
    const way = Math.hypot(b.x - a.x, b.y - a.y), walkMs = Math.min(LEG_MS * WALK_MOST, way / WALK_SPEED * 1000);
    const from = LEG_MS - walkMs;
    if (into < from || way < 0.5) {
        // standing: facing the way they came
        const before = spot(seed, k - 1, node.x, node.y, r);
        return { x: a.x, y: a.y, face: Math.abs(a.x - before.x) < 1 ? 0 : Math.sign(a.x - before.x), fy: upDown(a.x - before.x, a.y - before.y), walking: false };
    }
    const f = (into - from) / walkMs;
    return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f, face: Math.abs(b.x - a.x) < 1 ? 0 : Math.sign(b.x - a.x), fy: upDown(b.x - a.x, b.y - a.y), walking: true };
}

// a task done in one spot, not walking about
export function stationary(task: Task) {
    return task?.k == TaskKind.CRAFT || task?.k == TaskKind.WORK;
}

// fights playing: each hero in one, from when to when (ms)
const fighting = new Map<number, { from: number; until: number }>();

// a fight come in (S2C.HERO_FIGHT): everyone in it stands still while it plays
export function fought(fight: Fight) {
    const now = Date.now(), ms = playMs(fight);
    for (const f of fight.f) {
        if (f.h == null) continue;
        const was = fighting.get(f.h);
        fighting.set(f.h, was && was.until > now ? { from: was.from, until: Math.max(was.until, now + ms) } : { from: now, until: now + ms });
    }
}

// a favourite's heroes who've fought (FRIEND_FOUGHT: no fight to play, so
// for FRIEND_FIGHT_MS), but those whose fight's already playing (yours)
export const FRIEND_FIGHT_MS = 5000;
export function foughtFor(ids: number[], ms = FRIEND_FIGHT_MS) {
    const now = Date.now();
    for (const id of ids ?? []) if (!((fighting.get(id)?.until ?? 0) > now)) fighting.set(id, { from: now, until: now + ms });
}

// whether a hero's in a fight that's playing
export function inFight(id: number, now = Date.now()) {
    return (fighting.get(id)?.until ?? 0) > now;
}

// when the fight any of `ids` is in started (null: none playing)
function fightFrom(ids: number[], now: number) {
    let from: number = null;
    for (const id of ids) {
        const f = fighting.get(id);
        if (!f) continue;
        if (f.until <= now) { fighting.delete(id); continue; }
        from = from == null ? f.from : Math.min(from, f.from);
    }
    return from;
}

// a hero's walk at a node: their party's (the leader's path, their spot in
// the group) if they're in one with others, else their own; `still` (at a
// task done in one spot), standing at their walk's first spot
export function heroWalk(heroId: number, party: PartyMember[], node: TravelNode, now: number, still = false): Stand {
    const k = party ? party.findIndex((m) => m[0] == heroId) : -1, alone = k < 0 || party.length < 2;
    const seed = alone ? heroId : party[0][0], reach = alone ? 0 : GROUP_REACH;
    const from = fightFrom(alone ? [heroId] : party.map((m) => m[0]), now);
    let s: Stand;
    if (still) {
        const at = spot(seed, 0, node.x, node.y, Math.max(0, (node.s ?? 0) - reach));
        s = { x: at.x, y: at.y, face: 0, walking: false };
    } else if (from != null) s = { ...walkAt(seed, node, from, reach), walking: false };
    else s = walkAt(seed, node, now, reach);
    if (alone) return s;
    const [dx, dy] = GROUP[k % GROUP.length];
    return { ...s, x: s.x + dx, y: s.y + dy };
}

// the party of one of your heroes that has `heroId` in it (anyone's), if any
export function partyWith(heroId: number): PartyMember[] {
    for (const h of IBC.data.heroes.heroes) if (h.party?.length > 1 && h.party.some((m) => m[0] == heroId)) return h.party;
    return null;
}

// the ids of a hero's party, them included, as one of yours has it (alone: just them)
export function partyIds(heroId: number): number[] {
    const yours = IBC.data.heroes.seen(heroId)?.party ?? partyWith(heroId);
    return yours?.length > 1 && yours.some((m) => m[0] == heroId) ? yours.map((m) => m[0]) : [heroId];
}

// a resting hero's tent: a spot of their own in the place's circle
export function tentAt(heroId: number, node: TravelNode) {
    return spot(heroId, 0, node.x, node.y, node.s ?? 0);
}

// whether a hero's walking about where they are (not on the way, resting or at an event's work)
export function wandering(hero: HeroRow, resting: boolean) {
    return !hero.s.r.length && !hero.s.o && !resting && hero.s.w?.k != TaskKind.EVENT;
}

// the frontmost of some markers' people under a point on the screen (the
// user, 2026-11-02: clicking one on the map opens their status), and how far
// in front it is (its zIndex), or null
export function personAt(markers: { [heroId: number]: { person: PIXI.Sprite } }, global: PIXI.IPointData) {
    let found: { id: number, z: number } = null;
    for (const id in markers) {
        const person = markers[id].person;
        if (!person.worldVisible || !person.getBounds().contains(global.x, global.y)) continue;
        if (!found || person.zIndex > found.z) found = { id: Number(id), z: person.zIndex };
    }
    return found;
}

// a marker shown where it should be, eased over when that jumps
export class Glide {

    public x: number = null;
    public y: number = null;
    private tx = 0;
    private ty = 0;
    private ox = 0;
    private oy = 0;

    // shown right there, not eased (a tent's pitched where it is)
    public set(x: number, y: number) {
        this.x = this.tx = x;
        this.y = this.ty = y;
        this.ox = this.oy = 0;
    }

    // where it's shown now, `dt` ms on, it being due at (tx, ty); moving: how it's going (0 0 still)
    public to(tx: number, ty: number, dt: number) {
        if (this.x == null || Math.hypot(tx - this.tx, ty - this.ty) > JUMP) {
            if (this.x != null) { this.ox = this.x - tx; this.oy = this.y - ty; }
        }
        this.tx = tx; this.ty = ty;
        const off = Math.hypot(this.ox, this.oy), step = GLIDE_SPEED * dt / 1000;
        let mx = 0, my = 0;
        if (off > 0) {
            const k = off <= step ? 0 : (off - step) / off;
            mx = this.ox * (k - 1); my = this.oy * (k - 1);
            this.ox *= k; this.oy *= k;
        }
        this.x = tx + this.ox; this.y = ty + this.oy;
        return { x: this.x, y: this.y, gliding: off > 0, mx, my };
    }

}
