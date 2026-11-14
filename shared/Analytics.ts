// The admin's Analytics window (the user, 2026-10-29: "a comprehensive
// analytics component in the admin menu"): a snapshot of the game, made by
// the server when asked (C2S.ANALYTICS_GET, S2C.ANALYTICS; server
// managers/analytics). Kept short: the numbers only, the client names them.
//
// Play time, retention, features and churn (the user, 2026-11-01: "track
// everything I need to make this game a success, that includes idling time")
// come from what the server records as they play (server
// managers/analytics/Tracker): a row a sign-in (play_session) - how long,
// how much of it at the screen, how long they'd been away, and how much of
// that their heroes had stopped - and how often each window's opened and
// each thing's done, a player a day (feature_use).

import { FeedbackRow } from "./Feedback";

export const ANALYTICS_DAYS = 30;          // the daily charts' length
export const ONLINE_SAMPLE_MS = 10 * 60 * 1000;
export const ONLINE_SAMPLES = 24 * 6;       // (a day of them)
export const COHORT_WEEKS = 8;              // the retention grid: weeks started, and weeks after

// Signed in but not playing: the tab hidden, or nothing pressed for this
// long (the client says which as it changes: C2S.ANALYTICS_PRESENCE)
export const IDLE_AFTER_MS = 2 * 60 * 1000;

// Seen in a window, not a thing done (feature_use's feature: the rest are routes)
export const WINDOW_MARK = "w:";

// The charts' buckets: up to `to` (seconds, or a count), named
export interface Bucket { to: number; name: string; }
const M = 60, H = 60 * M, D = 24 * H;
export const SESSION_LENGTHS: Bucket[] = [
    { to: M, name: "Under 1m" }, { to: 5 * M, name: "1-5m" }, { to: 15 * M, name: "5-15m" }, { to: 30 * M, name: "15-30m" },
    { to: H, name: "30-60m" }, { to: 2 * H, name: "1-2h" }, { to: 4 * H, name: "2-4h" }, { to: Infinity, name: "4h+" },
];
export const AWAY_GAPS: Bucket[] = [
    { to: 15 * M, name: "Under 15m" }, { to: H, name: "15m-1h" }, { to: 4 * H, name: "1-4h" }, { to: 8 * H, name: "4-8h" },
    { to: D, name: "8-24h" }, { to: 3 * D, name: "1-3d" }, { to: 7 * D, name: "3-7d" }, { to: Infinity, name: "7d+" },
];
export const PLAYTIMES: Bucket[] = [
    { to: 5 * M, name: "Under 5m" }, { to: 30 * M, name: "5-30m" }, { to: 2 * H, name: "30m-2h" }, { to: 6 * H, name: "2-6h" },
    { to: D, name: "6-24h" }, { to: Infinity, name: "1d+" },
];
export const SESSION_COUNTS: Bucket[] = [
    { to: 2, name: "1" }, { to: 3, name: "2" }, { to: 4, name: "3" }, { to: 6, name: "4-5" }, { to: 11, name: "6-10" }, { to: Infinity, name: "11+" },
];
export const GONE_AFTER_DAYS = 7;       // not seen this long: gone (churned)
export const BOUNCE_S = 5 * M;          // played less than this in all: bounced

// which bucket `v` falls in (under its `to`; the last takes the rest)
export function bucketOf(v: number, buckets: Bucket[]) {
    const k = buckets.findIndex((b) => v < b.to);
    return k < 0 ? buckets.length - 1 : k;
}

export interface Analytics {
    at: number;                 // when it was made (ms)
    staff: boolean;             // staff counted in play time, retention, features and churn
    server: {
        up: number;             // ms since it started
        heap: number;           // MB in use
        lag: number;            // the event loop's delay, ms (99th percentile, since the last snapshot)
        online: number;         // signed in now
        loaded: number;         // in memory: signed in, or away with heroes working
        peak: number;           // the most signed in at once since it started
        peakAt: number;         // (ms)
        day: number[];          // signed in, every ONLINE_SAMPLE_MS over the last day, oldest first (-1: the server wasn't up)
    };
    players: {
        total: number;
        guest: number; email: number; google: number;
        staff: number;          // moderators, editors and admins
        premium: number;        // Supporters now
        subs: number;           // paying for it by subscription (Stripe, active)
        muted: number;          // muted in chat now
        new1: number; new7: number; new30: number;
        active1: number; active7: number; active30: number;
        signups: number[];      // a day each, the last ANALYTICS_DAYS, oldest first (today last)
        lastSeen: number[];     // how many were last seen each of those days
        retention: [number, number][];  // [returned, of those old enough] for 1, 7 and 30 days after they started
        guide: number[];        // how many have done each first step (shared/Guide.ts STEPS); guide[STEPS.length]: those with the guide at all
    };
    // (all from play_session; seconds unless said)
    time: {
        since: number;          // when the first was recorded (ms; 0: none yet)
        dau: number[];          // players who played, a day each, the last ANALYTICS_DAYS, oldest first
        played: number[];       // hours signed in, a day each
        busy: number[];         // of them, hours actively playing
        today: number; wau: number; mau: number;     // players who played today, the last 7 and 30 days
        sessions7: number;      // sign-ins the last 7 days
        meanSession: number; medianSession: number;  // (the last 7 days)
        lengths: number[];      // sessions by length (SESSION_LENGTHS), the last 7 days
        busyShare: number;      // of the time signed in, the share actively playing (0-1), the last 7 days
        dailyMinutes: number;   // minutes signed in a day, by those who played that day (the last 7 days)
        perDay: number;         // sign-ins a day, by those who played that day
        returns: number;        // sign-ins after time away, the last 7 days
        gaps: number[];         // them by how long away (AWAY_GAPS)
        meanGap: number; medianGap: number;
        stalledShare: number;   // of the time away, the share after their heroes stopped (away too long)
        stalledReturns: number; // returns that came after their heroes had stopped
        byHour: number[];       // minutes signed in by the hour of the day (UTC, 0-23), the last 7 days
        devices: [string, number][];    // players by device, the last 30 days
        sources: [string, number][];    // new players by where they came from, the last 30 days
        firsts: number;         // first sessions the last 30 days
        medianFirst: number;    // their median length
        secondShare: number;    // of them, the share who came back for a second (0-1)
    };
    // weekly cohorts by when they started (since sessions were recorded), oldest first
    cohorts: { start: number; size: number; weeks: number[] }[];   // weeks[k]: how many played in week k after starting (k 0: their first)
    features: {
        players7: number;       // players who did anything the last 7 days
        windows: [string, number, number][];    // window (ComponentType's name), opened, by how many players - the last 7 days
        actions: [string, number, number][];    // route's name, sent, by how many players
    };
    // those who started since sessions were recorded and GONE_AFTER_DAYS ago or more
    churn: {
        old: number;            // started that long ago
        gone: number;           // of them, not seen in GONE_AFTER_DAYS
        bounced: number;        // of everyone started since, those who played under BOUNCE_S in all (and aren't on now)
        started: number;        // (everyone started since)
        playtime: number[];     // the gone by how long they played in all (PLAYTIMES)
        playtimeKept: number[]; // those who stayed, likewise
        sessions: number[];     // the gone by how many times they signed in (SESSION_COUNTS)
        stoppedAt: number[];    // the gone by the first step they hadn't done (STEPS order; [STEPS.length]: all done)
        heroes: number[];       // the gone by how many heroes they had (heroes[n])
        firstGone: number;      // the gone's median first session (seconds)
        firstKept: number;      // and those who stayed
    };
    heroes: {
        total: number;
        rosters: number[];      // players by how many heroes they have (rosters[n])
        jobs: number[];         // by Job
        skills: number[];       // the average level, by Skill
        levels: number[];       // heroes by total core level, in tens (levels[k]: k*10 to k*10+9)
        doing: number[];        // by TaskKind; doing[TASK_NAMES.length]: idle (nothing, resting)
        hurt: number;           // hurt at all
        places: [string, number][];     // where they are most (name, heroes)
        top: [string, string, number][];  // the highest: name, their player's, total core level
    };
    economy: {
        gold: number;           // in every stash
        goldMedian: number;
        rich: [string, number][];       // the most gold: player's name, gold
        items: [string, number][];      // the most held: item's name, amount in every stash
        listings: number;       // on the market now
        listed: number;         // their worth, at their prices
        sales7: number; gold7: number;  // sales the last 7 days, and the gold that changed hands
        sales: number; goldAll: number;
        topSold: [string, number][];    // the items sold most (by amount), the last 30 days
        bjPlayers: number; bjHands: number; bjNet: number;  // blackjack: players, hands, what they've won less paid in all
    };
    // what players have written (shared/Feedback.ts)
    feedback: {
        open: number;           // not dealt with yet
        week: number;           // sent the last 7 days
        recent: FeedbackRow[];  // the open ones, newest first
    };
    social: {
        guilds: number; guildMembers: number;
        friendships: number; asks: number;
        whispers7: number;
        reportsOpen: number; reports: number;
        events: number; eventsWon: number; eventsLost: number; eventsOn: number;
        eventGivers: number;    // players who've given to an event
    };
}
