// First steps (the user, 2026-10-29: "a guided start", a checklist, not to be
// skipped; the steps, hints and rewards are Claude's proposal, open to change).
// A new player's first things to do, in a box under the roster: the first not
// done yet shown with a hint, and the button it needs pulsing. They can be done
// in any order; each pays a little gold as it's done, enough between them for a
// second hero. Gone once all are done. Saved as one number (player.guide), a bit
// a step: a step's place here is saved, add new ones at the end. When each was
// done is kept too (player.guide_at, ms by Step), for the Analytics.

import { recipeOf, slotsFor, SUPPLIES } from "./Tasks";

export enum Step { HIRE, GATHER, LOOK, CRAFT, EQUIP, ADVENTURE, BACKUP, SECOND }

// g: its gold; i: an item with it ([id, amount]); seen: done by the client
// saying so (opening a window: C2S.GUIDE_SEEN), the server checking it could be
export interface StepDef { s: Step; name: string; hint: string; g: number; i?: [number, number]; seen?: boolean; }

export const STEPS: StepDef[] = [
    { s: Step.HIRE, name: "Hire your first hero", g: 20, hint: "Pick one on the Hiring board: your first hero is free. (Hiring is in the menu, bottom right.)" },
    { s: Step.GATHER, name: "Give them a job", g: 25, hint: "In their to-do list (click their box above), pick something in the Gather tab and press + To-do." },
    { s: Step.LOOK, name: "Check your inventory", g: 15, seen: true, hint: "Open your Inventory (in the menu, bottom right) to see the items your hero has collected." },
    { s: Step.CRAFT, name: "Make some gear", g: 35, hint: "In the to-do list's Craft tab, pick something to wear or carry, like a Bronze Dagger." },
    { s: Step.EQUIP, name: "Equip it", g: 25, hint: "Open your hero's status (the right of their box), and drag what they made from the Inventory onto its slot." },
    { s: Step.ADVENTURE, name: "Go adventuring", g: 30, hint: "From the to-do list's Misc tab, send them adventuring." },
    { s: Step.BACKUP, name: "Set a backup task", g: 30, hint: "Drag a task onto the Backup Task slot under the list. They do it when the list runs out, even while you're offline" },
    // (a Bronze Pickaxe: MAKE_IDS + its place in MAKES x MAKE_TIERS, shared/Tasks.ts)
    { s: Step.SECOND, name: "Hire a second hero", g: 25, i: [740, 1], hint: "Your rewards should cover one: Hiring, in the menu." },
];

export const ALL_STEPS = STEPS.reduce((all, d) => all | (1 << d.s), 0);

// A quick start (the user, 2026-11-02, the first players' numbers: most left a
// minute in, waiting on their first ore): gathering and crafting QUICK_START
// times quicker till the steps are all done, for QUICK_START_MS at most after
// the first hire (`hiredAt`: when, 0 if not known), so it can't be kept
export const QUICK_START = 10;
export const QUICK_START_MS = 60 * 60 * 1000;
export function quickStart(done: number, hiredAt: number, now = Date.now()) {
    return done != ALL_STEPS && hiredAt > 0 && now - hiredAt < QUICK_START_MS ? QUICK_START : 1;
}

// what makes the Craft step: a thing that's worn or carried (not a material)
export function isGear(id: number) {
    const type = recipeOf(id)?.type;
    return !!type && slotsFor(type).length > 0 && !SUPPLIES.includes(type);
}

export function stepDone(done: number, s: Step) {
    return (done & (1 << s)) != 0;
}

// the first step not done yet (null: all done)
export function nextStep(done: number) {
    return STEPS.find((d) => !stepDone(done, d.s)) ?? null;
}

export function stepsDone(done: number) {
    return STEPS.filter((d) => stepDone(done, d.s)).length;
}
