// Feedback (the user, 2026-11-01: "add a feedback button and component to
// the menu"): a player writes what's wrong or what they'd like, from the
// main menu's Feedback (client components/feedback), and staff read it on
// the admin panel's Feedback tab and the phone page (server
// managers/feedback). Its kind, the words, the client's version and device.

export const FEEDBACK_KINDS = ["Bug", "Idea", "Other"];
export const FEEDBACK_SHORTEST = 5;             // characters, at least
export const FEEDBACK_LONGEST = 1000;
export const FEEDBACK_GAP_MS = 60 * 1000;       // between one player's
export const FEEDBACK_DAY_MOST = 10;            // a player's in a day
export const FEEDBACK_SHOWN = 50;               // the open ones staff are sent, newest first

// one, as staff see it (ADMIN_FEEDBACK)
export interface FeedbackRow {
    i: number;          // its number
    k: number;          // FEEDBACK_KINDS
    t: string;          // the words
    by: string;         // who (their name now)
    bi: number;         // (their id)
    a: number;          // when (ms)
    v: string;          // the client's version
    d: string;          // their device ("desktop", "tablet", "phone")
}

// the words as kept: spaces and line breaks tidied, nothing unprintable, cut to FEEDBACK_LONGEST
export function cleanFeedback(text: any) {
    if (typeof text != "string") return "";
    return text.replace(/\r\n?/g, "\n").replace(/[\x00-\x09\x0b-\x1f\x7f]/g, "").replace(/[ \t]+/g, " ")
        .replace(/\n{3,}/g, "\n\n").trim().slice(0, FEEDBACK_LONGEST);
}
