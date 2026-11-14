// A player's display name (player.display_name): what others see in the chat,
// at the game tables, on the leaderboards and in their friends list, and what
// a friend's asked by. Changed from Settings (the user, 2026-10-28). The
// rules here are Claude's: letters, digits and a few marks, with single
// spaces between, no two players with the same one (the database's
// collation decides what counts as the same: ignoring case).

export const NAME_SHORTEST = 3;
export const NAME_LONGEST = 20;
export const RENAME_GAP_MS = 5000;      // the least time between one player's changes

import { chatRefusal, maskSwearing } from "./ChatFilter";

// what someone typed, as a name could be: spaces tidied
export function cleanName(name: any) {
    if (typeof name != "string") return "";
    return name.replace(/\s+/g, " ").trim().slice(0, NAME_LONGEST);
}

// what's wrong with it (a cleaned name), or "" if nothing
export function nameProblem(name: string) {
    if (name.length < NAME_SHORTEST) return `At least ${NAME_SHORTEST} characters`;
    if (name.length > NAME_LONGEST) return `At most ${NAME_LONGEST} characters`;
    if (!/^[A-Za-z0-9 _.'-]+$/.test(name)) return "Only letters, digits, spaces and _ . ' -";
    if (!/[A-Za-z]/.test(name)) return "At least one letter";
    if (chatRefusal(name) || maskSwearing(name) != name) return "That name isn't allowed";     // (shared/ChatFilter.ts)
    return "";
}
