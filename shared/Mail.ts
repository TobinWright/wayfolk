import { checkOffer, isEmpty, Offer } from "./Trade";

// Mail (the user, 2026-10-30: "mail, or trading with someone who's signed
// out... sending a friend or guildmate gold or items while they're away";
// the rules and numbers are Claude's proposal, open to change). A letter goes
// to a friend or guildmate by name, signed in or not: a note (NOTE_LONGEST,
// held to the chat's filter), and up to OFFER_MOST different things from your
// stash and some gold (a trade's offer, checkOffer). They leave your stash as
// it's sent and wait in the letter until it's opened and Taken. A mailbox
// holds INBOX_MOST letters (those sent back to you aside). Letters last
// LETTER_DAYS; then one whose things weren't taken goes back to its sender,
// and any other's thrown away. The one it's to can Send back what's in it
// too. One who's blocked you is sent to as far as you can tell: they never
// see it, and it comes back as it runs out. A letter sent back never runs out.
// No postage. The server is managers/mail/MailManager.ts.

export const NOTE_LONGEST = 200;           // characters in a letter's note
export const INBOX_MOST = 50;              // letters in a mailbox (those sent back aside)
export const LETTER_DAYS = 30;
export const LETTER_MS = LETTER_DAYS * 24 * 60 * 60 * 1000;
export const SEND_GAP_MS = 3000;           // between letters of yours

// a letter as its reader sees it (MAIL_LIST): i its id, f who it's from ("":
// a former player), p their player id (0: a former player's), t the note, g
// gold, o things [item id, how many], a when it was sent (ms), e when it runs
// out (0: never), u 1 unread, k 1 what was in it taken, b 1 sent back to you
export interface Letter {
    i: number;
    f: string;
    p: number;
    t: string;
    g: number;
    o: [number, number][];
    a: number;
    e: number;
    u?: number;
    k?: number;
    b?: number;
}

// a note as sent: its spaces as one, no control characters, cut to NOTE_LONGEST
export function cleanNote(text: any) {
    if (typeof text != "string") return "";
    return text.replace(/\s+/g, " ").replace(/[\x00-\x1f\x7f]/g, "").trim().slice(0, NOTE_LONGEST);
}

// what's put in a letter, made safe against what you have: null if it isn't something you could send
export function checkEnclosed(gold: any, items: any, have: (id: number) => number, haveGold: number): Offer {
    return checkOffer({ g: gold ?? 0, i: items ?? [] }, have, haveGold);
}

// whether a letter has things or gold in it still to take
export function hasThings(l: { g: number; o: [number, number][]; k?: number }) {
    return !l.k && !isEmpty({ g: l.g, i: l.o });
}

// why a letter can't be sent as it is ("" it can)
export function letterProblem(note: string, enclosed: Offer) {
    if (!enclosed) return "You can't send that";
    if (!note && isEmpty(enclosed)) return "Write a note, or put things or gold in";
    return "";
}
