import { materialOf } from "../../../../shared/Locations";
import { isTown, kindOf, WorldPlace } from "../../../../shared/Places";
import { AMOUNTS, gatherLevel, gatherSkill, itemName, recipeOf, Task, TaskKind } from "../../../../shared/Tasks";
import { distancesFrom } from "../../../../shared/Travel";
import { HeroRow } from "../../data/HeroesData";
import { IBC } from "../../Engine";

// A craft put on a hero's list brings what it takes with it (the user,
// 2026-10-28): for each thing short - against the stash, after what's
// already on their list gathers, makes and uses up - a material is gathered
// first at the nearest place it's found that they reach deep enough, a
// worked one (a bar, a plank) crafted first in the nearest town, what that
// takes in turn before it; then the craft itself in the nearest town to where
// they'll be by then. Each from where the one before leaves them; amounts past
// a kind's most split into more than one.

export interface Plan {
    tasks: Task[];          // the tasks to put on the end of their list, the craft last
    short: string[];        // what can't be got: nowhere by road they reach deep enough, or too low a skill to gather it
}

export function planCraft(hero: HeroRow, m: number, n: number): Plan {
    const data = IBC.data.heroes, s = hero.s, h = hero.d;
    const tasks: Task[] = [], short: string[] = [];

    // what there'll be by the end of their list
    const stock = new Map<number, number>();
    IBC.data.inventory.items.forEach((item, id) => stock.set(id, item.amount));
    const add = (id: number, k: number) => stock.set(id, (stock.get(id) ?? 0) + k);
    s.q.forEach((t, i) => {
        const left = (t.n ?? 0) - (i == 0 && s.w ? s.d : 0);      // (the one under way: what's still to do)
        if (left <= 0) return;
        if (t.k == TaskKind.GATHER) add(t.m, left);
        if (t.k == TaskKind.CRAFT) { for (const [id, k] of recipeOf(t.m)?.needs ?? []) add(id, -k * left); add(t.m, left); }
    });

    // where they'll be then
    let at = s.r.length ? s.r[s.r.length - 1] : s.p;
    for (const t of s.q) if (t.p != null) at = t.p;

    const nearest = (ok: (p: WorldPlace) => boolean) => {
        const dist = distancesFrom(data.graph, at);
        let best: WorldPlace = null;
        data.places.forEach((p) => { if (dist.has(p.i) && ok(p) && (!best || dist.get(p.i) < dist.get(best.i))) best = p; });
        return best;
    };
    // a task for so many, split by the kind's most
    const push = (k: TaskKind, p: WorldPlace, id: number, count: number) => {
        const most = AMOUNTS[k].most;
        for (let left = count; left > 0; left -= most) tasks.push({ k, p: p.i, m: id, n: Math.min(most, left) });
        at = p.i;
    };
    const craft = (id: number, count: number) => {
        for (const [need, k] of recipeOf(id).needs) get(need, k * count);
        const town = nearest((p) => isTown(p));
        if (town) push(TaskKind.CRAFT, town, id, count);
    };
    // so many of a thing to be had, gathered or made first if there's not enough
    const get = (id: number, count: number) => {
        const lack = count - Math.max(0, stock.get(id) ?? 0);
        if (lack > 0) {
            const material = materialOf(id);
            if (material) {
                const skilled = h.k[gatherSkill(id)] >= gatherLevel(id);
                const place = skilled ? nearest((p) => material.at.includes(kindOf(p)) && IBC.data.parties.listDeepest(kindOf(p), hero) >= material.level) : null;
                if (place) push(TaskKind.GATHER, place, id, lack);
                else short.push(itemName(id));
            } else if (recipeOf(id)) craft(id, lack);
            add(id, lack);
        }
        add(id, -count);
    };

    craft(m, n);
    // (grouped: the craft last, g; the rest, f, for it - a new group, unless nothing's needed first)
    if (tasks.length > 1) {
        const g = Math.floor(Math.random() * 1e9) + 1;
        tasks.forEach((t, i) => { if (i == tasks.length - 1) t.g = g; else t.f = g; });
    }
    return { tasks, short };
}
