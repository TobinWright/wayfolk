// The chat's word filter (the user, 2026-10-29: "implement chat safety"; the
// lists are Claude's proposal, open to change). Two kinds:
// - REFUSED: slurs, and telling someone to kill themselves. A line with one is
//   never said (the server refuses it: chatRefusal), in the channels and in
//   whispers alike.
// - SWEARING: said, but shown with asterisks to anyone who has "Hide swearing"
//   on in Settings (on to start with; maskSwearing, in the client).
// Text is matched as it'd be read: lower case, look-alike characters as the
// letters they stand for (0 o, 1 i, 3 e, 4 a, 5 s, @ a, $ s...), a letter
// typed again and again as one ("fuuuck"), and letters spaced or dotted out
// ("n i g g e r", "k.y.s") joined up.

const LEET: { [c: string]: string } = { "0": "o", "1": "i", "!": "i", "|": "i", "3": "e", "4": "a", "@": "a", "5": "s", "$": "s", "7": "t", "8": "b", "9": "g" };

// a word as it'd be read: lower case, look-alikes as letters, nothing else
function read(word: string) {
    let out = "";
    for (const ch of word.toLowerCase()) {
        const c = LEET[ch] ?? ch;
        if (c >= "a" && c <= "z") out += c;
    }
    return out;
}

// a root as a pattern each of its letters may be typed more than once in
const stretch = (root: string) => root.split("").map((c) => `${c}+`).join("");

// a root matched as a whole word, with the endings it takes
function whole(roots: string[], endings = "s|es|z|ed|er|ers|ing|y") {
    return new RegExp(`^(${roots.map(stretch).join("|")})(${endings})?$`);
}

// a root matched anywhere in a word ("bullshit", "motherfucker")
function inside(roots: string[]) {
    return new RegExp(`(${roots.map(stretch).join("|")})`);
}

// (each letter may be typed again and again, so "nigger" is never "Niger")
const SLURS = whole(["nigger", "nigga", "faggot", "fag", "kike", "spic", "chink", "gook", "wetback", "beaner", "raghead", "towelhead", "tranny", "paki"], "s|es|z");
const SLURS_INSIDE = inside(["nigger", "nigga", "faggot"]);
const RUN_SLURS = inside(["nigger", "nigga", "faggot", "fag", "kike", "spic", "chink", "gook", "paki"]);     // (in letters spaced out)
const HURT_YOURSELF = [/\bkys\b/, /\bkill (your ?self|yo ?self|urself|ur self)\b/, /\bneck (your ?self|urself)\b/];

const SWEARS_WHOLE = whole(["cunt", "twat", "dick", "cock", "prick", "pussy", "whore", "slut", "wanker", "bastard", "retard", "bollocks", "bellend", "tits"], "s|es|ed|ing|y|ty");
const SWEARS_INSIDE = inside(["fuck", "shit", "bitch", "asshole", "motherf", "dickhead", "cocksucker", "jackass", "dumbass"]);

// the words of a line, as read, with single letters spaced or dotted out
// joined into one; and those runs ("a f a g" is "afag")
function words(text: string) {
    const raw = text.split(/[^A-Za-z0-9@$!|]+/).map(read).filter((w) => w);
    const out: string[] = [], runs: string[] = [];
    let run = "";
    const end = () => { if (run) { out.push(run); if (run.length > 2) runs.push(run); run = ""; } };
    for (const w of raw) {
        if (w.length == 1) { run += w; continue; }
        end();
        out.push(w);
    }
    end();
    return { out, runs };
}

// why a line can't be said ("": it can)
export function chatRefusal(text: string) {
    const { out, runs } = words(text);
    if (out.some((w) => SLURS.test(w) || SLURS_INSIDE.test(w)) || runs.some((r) => RUN_SLURS.test(r))) return "Slurs aren't allowed in the chat";
    const said = out.join(" ");
    if (HURT_YOURSELF.some((p) => p.test(said))) return "Telling people to hurt themselves isn't allowed";
    return "";
}

// a word read as swearing
function swearing(word: string) {
    const w = read(word);
    return !!w && (SWEARS_WHOLE.test(w) || SWEARS_INSIDE.test(w));
}

// the line with each swear word's letters but the first as asterisks
export function maskSwearing(text: string) {
    return text.replace(/[A-Za-z0-9@$!|]*[A-Za-z0-9@$]/g, (word) => swearing(word) ? word[0] + "*".repeat(word.length - 1) : word);
}
