// Games (the user, 2026-10-28: "a games component... icons for the games,
// the first one being blackjack"): from the main menu, a window of the games'
// icons; a game's opens its rooms (blackjack: tables, how many sit at each),
// and a room opens to watch - its own chat on the left, the table on the
// right. The rooms' names and chat limits are Claude's proposal, open to
// change. A game's place in GAMES is sent: add new ones at the end.

export const GAMES = ["Blackjack", "Slime Race"];
export enum Game { BLACKJACK, SLIME_RACE }

// Blackjack is played against the other players (the user, 2026-10-28): each
// sitting pays the table's ante into a pot. A table for each ante (the
// user's) always has nobody sitting: sitting at the last opens another, and
// the spare ones nobody's in go. A room's name is one from ROOM_NAMES at
// random that no other room has (the user's; the names are Claude's).
export const BJ_ANTES = [5, 25, 50, 100, 1000];
export const ROOM_NAMES = [
    "Copper Corner", "The Lucky Boar", "Silver Stag", "The Wanderer", "Dragon's Hoard", "Gold Crown",
    "The Rusty Tankard", "The Gilded Goose", "Fool's Fortune", "The Crooked Die", "The Last Coin", "The Sleeping Giant",
    "Ravenrest", "The Drowned Rat", "The Iron Kettle", "The Merry Widow", "The Prancing Mule", "Thieves' Den",
    "The Golden Hind", "The Broken Wheel", "Moonwell", "The Black Lantern", "The Salty Gull", "The Weary Knight",
    "The Green Man", "The Howling Wolf", "The Painted Lady", "The Three Crowns", "The Jolly Miller", "Smuggler's Rest",
    "The Hollow Oak", "The Red Hart", "The Tipsy Toad", "The King's Ransom", "The Wishing Well", "The Hanged Man",
    "Lantern Hall", "The Brass Monkey", "The Bent Nail", "Starfall", "The Laughing Fox", "The Pearl Divers",
    "The Ox and Plough", "The Sly Badger", "The Shepherd's Crook", "Dicer's Hollow", "The Wandering Bard", "The Old Mill",
    "The Ember", "Highcrest", "The Blue Boar", "The Slippery Eel", "The Velvet Purse", "The Ace of Cups",
    "The Hound and Hare", "The Hidden Vault", "The Cracked Bell", "The Winter Rose", "The Silver Spoon", "Kingsway",
];
export const BJ_SEATS = 5;
export const ROOM_KEPT = 50;            // lines a room's chat keeps, sent on coming in

// A round (the user, 2026-10-28): it starts with one player sitting or more,
// BJ_NEXT_MS after the last one ended (or someone sat at an idle table). Each
// sitting as it starts pays the ante into the pot and is dealt in; anyone
// sitting down after waits for the next. Two cards each and the dealer two
// (one face down); in seat order each hits or stands (BJ_TURN_MS, then they
// stand); then the dealer turns theirs up and draws to BJ_DEALER_STANDS.
// The best hand not bust takes the pot (a blackjack - 21 in two cards - beats
// any other 21), players tied for it split it (what doesn't split evenly is
// lost); if the dealer's is as good as the best, or everyone's bust, the house
// keeps it. Getting up mid-round leaves your ante in the pot. The timings are
// Claude's proposal.
export enum BjPhase { IDLE, NEXT, PLAY, DEALER, DONE }
export const BJ_NEXT_MS = 5000;
export const BJ_TURN_MS = 20000;
export const BJ_DEALER_MS = 800;        // between the dealer's cards
export const BJ_DONE_MS = 6000;         // the hands and who won, shown
export const BJ_DEALER_STANDS = 17;
export const BJ_SEAT_GAP_MS = 2000;     // between sitting down and getting up, at least (Claude's)
export const BJ_AWAY_TURNS = 2;        // turns in a row run out before they're stood up (away; the user's)

// a card 0-51: its rank card % 13 (0 an ace, 1-9 two to ten, 10-12 jack, queen, king), its suit
// card / 13 (spades, hearts, diamonds, clubs); -1 face down
export const RANKS = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];

// what a hand's worth: aces 1, or 11 when that doesn't bust it
export function handValue(cards: number[]) {
    let total = 0, ace = false;
    for (const c of cards) {
        const r = c % 13;
        total += r >= 9 ? 10 : r + 1;
        if (r == 0) ace = true;
    }
    return ace && total + 10 <= 21 ? total + 10 : total;
}

// how good a hand is, to compare: -1 bust, 22 a blackjack, else its value
export function handRank(cards: number[]) {
    const v = handValue(cards);
    return v > 21 ? -1 : v == 21 && cards.length == 2 ? 22 : v;
}

// a room in a game's list: i its id, n its name, a its ante, p how many sit, s seats, w how many watch (not sitting)
export interface RoomInfo { i: number; n: string; a: number; p: number; s: number; w: number; }

// a room as its watchers see it: its ante, who sits in each seat (null: empty), how many watch (not sitting), and the
// round: r its phase, t ms left (till it starts, on the turn, till the next), u whose turn (seat, -1 none),
// h each seat's hand (null: not in it), d the dealer's, p the pot, o what each seat won (DONE)
export interface RoomState {
    g: number; i: number; n: string; a: number; s: (string | null)[]; w: number;
    r: BjPhase; t: number; u: number; h: (number[] | null)[]; d: number[]; p: number; o: number[];
}

// a player's blackjack (the user, 2026-10-28): n their name, h hands played, b the biggest pot they won, w what
// they've won less what they've paid in (under 0: lost)
export interface BjStats { n: string; h: number; b: number; w: number; }

// a line said in a room: n who said it, t what, a when (ms), p if they're subscribed, 1 + their name's colour (shared/Chat NAME_COLORS); s 1 if it's the table's
// own (who sat down or got up, who won, what the house kept: no n, shown grey)
export interface RoomLine { n: string; t: string; a: number; p?: number; s?: number; }

// Slime racing (the user, 2026-11-02: "players bet on a slime, with odds, like
// horse racing, and then they view it out"): a track for each stake, always
// there, racing while anyone's watching or has a bet on. RACE_SLIMES slimes a
// race, each with a strength nobody sees; its chance of winning is its share
// of them all, and its odds that less the house's RACE_EDGE (a gold sink, as
// blackjack's dealer is). While betting's open (RACE_BET_MS) each watching may
// put the track's stake on one slime (and switch to another, free); then the
// race (its winner in about RACE_WIN_MS) and the results (RACE_DONE_MS). A
// winning bet pays the stake times the odds. The server picks how they finish
// and how each runs there (RaceState k), so everyone sees the same race.
// Fixed odds over a pool, the numbers and the names are Claude's, open to change.
export enum RacePhase { IDLE, BETTING, RUNNING, DONE }
export const RACE_STAKES = [5, 25, 50, 100, 1000];
export const RACE_TRACKS = ["Puddle Lane", "Mossy Meadow", "Gooey Gulch", "Ooze Downs", "The Golden Glob"];
export const RACE_SLIMES = 6;
export const RACE_COLORS = 8;           // (the slimes' colours, drawn by the client: RaceArt)
export const RACE_EDGE = 0.1;
export const RACE_BET_MS = 25000;
export const RACE_WIN_MS = 13000;
export const RACE_DONE_MS = 8000;
export const RACE_KEYS = 8;             // a slime's run, in this many stretches
export const SLIME_NAMES = [
    "Gloop", "Wobbles", "Sir Squish", "Jellybean", "Blorp", "Goober", "Pudding", "Sludge Runner",
    "Bouncy Bob", "Mr. Jiggles", "Drip", "Puddles", "Gelatina", "Oozy Suzy", "Splat", "Gumdrop",
    "Lord Gloopington", "Quiver", "Slick Rick", "Bubbles", "Muck", "Wiggles", "Big Blob", "Little Blob",
    "Slurp", "Glimmer", "Sticky Vicky", "Moss Gob", "Thunder Goo", "Plop", "Smudge", "Gooseberry",
    "Squelch", "Dewdrop", "Captain Ooze", "Marmalade", "Speedy Gel", "Wibble", "Noodle", "Glop Royale",
];

// what odds (tenths: 45 pays 4.5 times the stake) a slime of `chance` (0 to 1) gets: the house's edge taken, rounded down
export function raceOdds(chance: number) {
    return Math.max(11, Math.min(999, Math.floor((1 - RACE_EDGE) / chance * 10)));
}

// odds (tenths) as shown: "4.5x"
export function oddsText(odds: number) {
    return `${Math.floor(odds / 10)}.${odds % 10}x`;
}

// a slime in a race: n its name, c its colour, o its odds (tenths)
export interface RaceSlime { n: string; c: number; o: number; }

// a track as its watchers see it: its stake, how many watch, and the race: r its phase, t ms left in it, l the
// slimes, b the bets ([who, which slime]), x ms since it started (RUNNING, DONE), k each slime's run (its way along
// in thousandths at the end of each of RACE_KEYS even stretches of its time) and f its time (ms), o the slimes in the
// order they finished and p what each bet won ([who, gold]) (DONE)
export interface RaceState {
    g: number; i: number; n: string; a: number; w: number;
    r: RacePhase; t: number; l: RaceSlime[]; b: [string, number][]; x: number; k: number[][]; f: number[]; o: number[]; p: [string, number][];
}

// how far along a slime is (0 to 1) `ms` into the race, its run `keys` and time `time` (RaceState k, f)
export function raceAt(keys: number[], time: number, ms: number) {
    if (ms <= 0) return 0;
    if (ms >= time) return 1;
    const at = ms / time * keys.length, k = Math.floor(at), from = k ? keys[k - 1] : 0;
    return (from + (keys[k] - from) * (at - k)) / 1000;
}
