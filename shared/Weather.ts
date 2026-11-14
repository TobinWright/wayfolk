// Day and night, and rain (the user, 2026-10-28: "day night (10 minutes
// each) and rain"; 2026-10-31: a day and night 10 minutes together). Both are worked out from the clock alone, the same for
// everyone everywhere without the server sending anything: day and night
// take turns from the start of 1970, and the storms are picked by a number
// for each stretch of time (STORM_SLOT_MS), so every player sees the same
// storm in the same place. What they do to heroes (work, travel, fights,
// storms at sea) is in shared/Conditions.ts.

export const DAY_MS = 5 * 60000;
export const NIGHT_MS = 5 * 60000;
export const CYCLE_MS = DAY_MS + NIGHT_MS;
export const TWILIGHT_MS = 45000;           // dusk and dawn, half each side of the change

// how far into the day and night (0 the dawn, DAY_MS the dusk)
export function cycleAt(now: number) {
    return ((now % CYCLE_MS) + CYCLE_MS) % CYCLE_MS;
}

export function isNight(now: number) {
    return cycleAt(now) >= DAY_MS;
}

// The world's clock (the user, 2026-10-31: "Spring 20, 1PM" by the gold): a
// day and night is a day of 24 hours (CLOCK_HOUR_MS each), dawn at 6AM and
// dusk at 6PM, turning at midnight. The days of the season: shared/Seasons.ts worldSeasonAt.
export const CLOCK_HOUR_MS = CYCLE_MS / 24;
export const DAWN_HOUR = 6;

// the clock's time at `now`: its days start at midnight, where the cycle's start at dawn
export function clockTime(now: number) {
    return now + DAWN_HOUR * CLOCK_HOUR_MS;
}

// the hour (0 midnight to 23) at `now`
export function clockHour(now: number) {
    return Math.floor(cycleAt(clockTime(now)) / CLOCK_HOUR_MS);
}

// an hour as the clock shows it ("1PM", "12AM")
export function hourText(hour: number) {
    return `${(hour + 11) % 12 + 1}${hour < 12 ? "AM" : "PM"}`;
}

// ms until the next dawn or dusk
export function untilTurn(now: number) {
    const t = cycleAt(now);
    return t < DAY_MS ? DAY_MS - t : CYCLE_MS - t;
}

// how dark it is: 0 by day, 1 at night, between through dusk and dawn
export function darkness(now: number) {
    const t = cycleAt(now), half = TWILIGHT_MS / 2;
    const ramp = (off: number) => Math.min(1, Math.max(0, (off + half) / TWILIGHT_MS));
    // the half of the cycle round the dusk; the rest round the dawn
    if (t >= DAY_MS / 2 && t < DAY_MS + NIGHT_MS / 2) return ramp(t - DAY_MS);
    return 1 - ramp(t >= DAY_MS ? t - CYCLE_MS : t);
}

// how much of a sunset (or sunrise) glow: 1 right at the change, 0 a half twilight from it
export function twilight(now: number) {
    const t = cycleAt(now), half = TWILIGHT_MS / 2;
    const off = Math.min(Math.abs(t - DAY_MS), t, CYCLE_MS - t);
    return Math.max(0, 1 - off / half);
}

// The rain: storms drifting across the world with the wind. Each STORM_SLOT_MS
// a few start (up to STORM_MOST), somewhere at random, each a round patch of
// rain that grows in, drifts, and dies away over its life. Map px.
export const WORLD_W = 292 * 16, WORLD_H = 176 * 16;
export const STORM_SLOT_MS = 15 * 60000;
export const STORM_MOST = 6;
export const STORM_MS = [6 * 60000, 20 * 60000];   // a storm's life
export const STORM_R = [14 * 16, 40 * 16];        // its radius (map px)
export const STORM_DRIFT = [0.5, 2.5];             // map px a second
export const STORM_EDGE = 0.35;                    // how much of its radius thins out to nothing

export interface Storm {
    id: number;
    x: number; y: number; r: number;   // where it is now, how big
    strength: number;                  // 0 to 1: growing in, dying away
}

// a number for (x, salt), the same every time (as art/Backdrops' hash)
function hash(x: number, salt = 0) {
    let h = (x * 374761393 + salt * 668265263) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

const between = ([a, b]: number[], f: number) => a + (b - a) * f;

// the storms under way now (one started in a slot can run into the next ones)
export function storms(now: number): Storm[] {
    const out: Storm[] = [];
    const slot = Math.floor(now / STORM_SLOT_MS), back = Math.ceil(STORM_MS[1] / STORM_SLOT_MS);
    for (let s = slot - back; s <= slot; s++) {
        // 0 to STORM_MOST
        const n = Math.floor(hash(s, 1) * (STORM_MOST + 1));
        for (let i = 0; i < n; i++) {
            const salt = 10 + i * 10, f = (k: number) => hash(s, salt + k);
            const start = s * STORM_SLOT_MS + f(0) * STORM_SLOT_MS, life = between(STORM_MS, f(1));
            const age = now - start;
            if (age < 0 || age >= life) continue;
            // the wind blows mostly from the west
            const angle = (f(2) - 0.5) * Math.PI * 0.8 + (f(3) < 0.2 ? Math.PI : 0), speed = between(STORM_DRIFT, f(4));
            const fade = Math.min(1, age / 60000, (life - age) / 60000);
            out.push({
                id: s * STORM_MOST + i,
                x: f(5) * WORLD_W + Math.cos(angle) * speed * age / 1000,
                y: f(6) * WORLD_H + Math.sin(angle) * speed * age / 1000,
                r: between(STORM_R, f(7)),
                strength: fade * (0.6 + 0.4 * f(8)),
            });
        }
    }
    return out;
}

// how hard it's raining at (x, y) in map px: 0 dry to 1 pouring
export function rainAt(x: number, y: number, now: number, under = storms(now)) {
    let most = 0;
    for (const s of under) {
        const d = Math.hypot(x - s.x, y - s.y) / s.r;
        if (d >= 1) continue;
        const edge = Math.min(1, (1 - d) / STORM_EDGE);
        most = Math.max(most, s.strength * edge);
    }
    return most;
}

// The moon (the user, 2026-10-31: moon phases that change the night's
// brightness over a few real days): new to full and back every MOON_MS, from
// the clock alone. A full moon's night is lighter (client/src/art/WeatherArt
// lightTint); a new moon's darkest.
export const MOON_MS = 4 * 24 * 3600000;

// how far through its phases, 0 new, 0.5 full, to 1 new again
export function moonPhase(now: number) {
    return ((now % MOON_MS) + MOON_MS) % MOON_MS / MOON_MS;
}

// how much of it's lit, 0 new to 1 full
export function moonlight(now: number) {
    return (1 - Math.cos(moonPhase(now) * Math.PI * 2)) / 2;
}

// its name, as the eight phases are called
export function moonName(now: number) {
    return ["New moon", "Waxing crescent", "First quarter", "Waxing gibbous", "Full moon", "Waning gibbous", "Last quarter", "Waning crescent"][Math.round(moonPhase(now) * 8) % 8];
}
