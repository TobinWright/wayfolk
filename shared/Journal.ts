import { Fight } from "./Fights";
import { itemName, Task, TaskKind } from "./Tasks";

// A hero's journal (the user, 2026-10-29: "a character journal type thing
// that players can read to see whats happened to their character"): a line
// for each thing worth telling that happened to them - joining you, a level
// gone up, a fight on the road won or lost, a dungeon run lost, a place seen
// for the first time, a to-do done or given up on, gear put on, an event
// joined, a storm at sea. Written by the server as it happens (signed out too), kept with the
// hero (`hero.journal`, the last JOURNAL_MOST lines) and read in their
// Journal window (client components/herojournal), opened from their status.

// (CHOICE: a moment on the road and what came of it, shared/Choices.ts)
export enum JournalKind { JOINED, LEVEL, WON, LOST, PLACE, DONE, GAVE_UP, GEAR, EVENT, WEATHER, CHOICE }

// a line: when (ms), what kind, what happened, and how many times in a row (none: once)
export type JournalEntry = [number, JournalKind, string, number?];

// as saved: the lines, oldest first, and the places they've been (for "for the first time")
export interface Journal { e: JournalEntry[]; w: number[]; }

export const JOURNAL_MOST = 200;

// a line written now; the same as the last one (the same fight lost again)
// counted on it instead. The line written (or counted on)
export function writeLine(j: Journal, kind: JournalKind, text: string, at: number): JournalEntry {
    const last = j.e[j.e.length - 1];
    if (last && last[1] == kind && last[2] == text) {
        last[0] = at;
        last[3] = (last[3] ?? 1) + 1;
        return last;
    }
    const line: JournalEntry = [at, kind, text];
    j.e.push(line);
    if (j.e.length > JOURNAL_MOST) j.e.splice(0, j.e.length - JOURNAL_MOST);
    return line;
}

// who they fought: "a Wolf", "3 Wolves", "a Goblin and 2 Bats"
export function foesText(f: Fight) {
    const counts = new Map<string, number>();
    for (const x of f.f) if (x.s == 1) counts.set(x.n, (counts.get(x.n) ?? 0) + 1);
    const parts = Array.from(counts, ([name, n]) => n == 1 ? `${/^[aeiou]/i.test(name) ? "an" : "a"} ${name}` : `${n} ${plural(name)}`);
    if (parts.length <= 1) return parts[0] ?? "something";
    return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}

function plural(name: string) {
    if (/[^aeiou]y$/i.test(name)) return name.slice(0, -1) + "ies";
    if (/(s|x|ch|sh)$/i.test(name)) return name + "es";
    if (/f$/i.test(name)) return name.slice(0, -1) + "ves";
    return name + "s";
}

// a to-do done, said (none: one not worth a line - travelling, resting, an event's)
export function doneText(t: Task, placeName: (id: number) => string) {
    const n = t.n ?? 0, times = n > 1 ? ` x${n}` : "";
    switch (t.k) {
        case TaskKind.GATHER: return `Gathered ${itemName(t.m)}${times} at ${placeName(t.p)}`;
        case TaskKind.CRAFT: return `Crafted ${itemName(t.m)}${times} in ${placeName(t.p)}`;
        case TaskKind.WORK: return `Worked ${n} shift${n == 1 ? "" : "s"} in ${placeName(t.p)}`;
        case TaskKind.EXPLORE: return `Explored ${placeName(t.p)}${n > 1 ? ` ${n} times` : ""}`;
        case TaskKind.ADVENTURE: return `Went adventuring to ${n} place${n == 1 ? "" : "s"}`;
    }
    return "";
}
