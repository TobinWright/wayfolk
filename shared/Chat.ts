// Chat (the user, 2026-10-28: a chat in the bottom left, switching between
// channels). The channels and limits here are Claude's proposal, open to
// change. A channel's place in CHANNELS is sent: add new ones at the end.

export const CHANNELS = ["General", "Trade", "Help"];
export const CHAT_LONGEST = 160;        // characters a line
export const CHAT_KEPT = 50;            // lines a channel the server keeps, sent on signing in
export const CHAT_GAP_MS = 1000;        // the least time between one player's lines
export const SAME_LINE_MS = 30000;      // the same line again before this: refused

// a line as sent: c its channel, n who said it, t what, a when (ms), p if
// they were subscribed as they said it, 1 + their NAME_COLORS (a crown by
// their name, in it); e 1 the server's, about an event (shared/Events.ts): n is "Event";
// i the player who said it and k the line's own number (to block or report them by);
// g their guild's tag (shared/Guilds.ts), if they're in one; h the title they show (shared/Seasons.ts), if any;
// v the event it's about, if it's about one (clicking its box goes there: EventNotices);
// r 1 what you got for one (made by the client; its box stays longer)
export interface ChatLine { c: number; n: string; t: string; a: number; p?: number; e?: number; i?: number; k?: number; g?: string; h?: string; v?: number; r?: number; }

// a guild's own chat (shared/Guilds.ts): its lines' c, after the channels; only its members see them
export const GUILD_CHANNEL = CHANNELS.length;

// Chat safety (the user, 2026-10-29: "implement chat safety"; the limits and
// numbers are Claude's proposal, open to change). The word filter: ChatFilter.ts.
// Clicking a name in the chat: Whisper (a friend), Add friend, Block or Report.
// A report is of one line, for one of REPORT_REASONS, kept for moderators with
// the lines before it. REPORTS_TO_MUTE players (accounts REPORTER_AGE_MS old
// at least) reporting the same player within REPORT_WINDOW_MS mutes them for
// AUTO_MUTE_MS, with nobody having to be about. Moderators: /mute, /unmute,
// /reports and /done (MOD_COMMANDS). Muted, nothing's said in the channels
// (whispers to friends still are).
export const REPORT_REASONS = ["Harassment", "Hate speech", "Spam", "Scam", "Something else"];
export const REPORTS_AN_HOUR = 10;              // a player's reports an hour, most
export const REPORTS_TO_MUTE = 3;
export const REPORT_WINDOW_MS = 60 * 60 * 1000;
export const REPORTER_AGE_MS = 24 * 60 * 60 * 1000;
export const AUTO_MUTE_MS = 30 * 60 * 1000;
export const MUTE_MOST_MIN = 30 * 24 * 60;      // the longest a moderator mutes for (minutes)
export const CONTEXT_LINES = 10;                // the lines before a reported one kept with it
export const MOD_COMMANDS = [
    "/mute name minutes (reason) - mute someone in the chat",
    "/unmute name",
    "/reports - the last open reports",
    "/done number - a report dealt with",
];

// "2h 5m", "30m" (a mute's time left)
export function minutesText(ms: number) {
    const m = Math.max(1, Math.ceil(ms / 60000)), h = Math.floor(m / 60), d = Math.floor(h / 24);
    if (d) return `${d}d${h % 24 ? ` ${h % 24}h` : ""}`;
    if (h) return `${h}h${m % 60 ? ` ${m % 60}m` : ""}`;
    return `${m}m`;
}

// the colours a Supporter's name can be in the chat and at the game tables
// (the user, 2026-10-28, a Premium perk), picked in the Premium window; the
// first the one they start with. Their place here is saved (player.name_color):
// add new ones at the end (the client's tints: components/chat/Chat NAME_TINTS)
export const NAME_COLORS = ["Gold", "Straw", "Ember", "Pink", "Orchid", "Foam", "Pale", "Ice"];

// what someone typed, as it can be said (empty: nothing to say)
export function cleanChat(text: any) {
    if (typeof text != "string") return "";
    return text.replace(/\s+/g, " ").replace(/[\x00-\x1f\x7f]/g, "").trim().slice(0, CHAT_LONGEST);     // (line breaks and tabs spaces first, not lost)
}
