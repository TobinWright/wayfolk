// Counts things (wrong passwords for an email, reset emails, failed account
// saves...) per key over a sliding window, so the auth code can say "too
// many, wait". In memory, so per server process and forgotten on restart:
// enough to stop someone guessing passwords in a loop. (From console8; the
// per-address limits are AuthManager's.)

const hits = new Map<string, number[]>(); // key -> times (ms), oldest first
const LONGEST = 24 * 60 * 60 * 1000;      // the longest window anyone uses

// whether key has reached `limit` within the last `window` ms
export function tooMany(key: string, limit: number, window: number) {
    return recent(key, window).length >= limit;
}

// one more for key
export function count(key: string) {
    const list = hits.get(key) ?? [];
    list.push(Date.now());
    hits.set(key, list);
    if (hits.size > 10000) prune();
}

function recent(key: string, window: number) {
    const since = Date.now() - window;
    return (hits.get(key) ?? []).filter((t) => t > since);
}

// forgets anything older than any window
function prune() {
    const since = Date.now() - LONGEST;
    for (const [key, list] of hits) {
        const kept = list.filter((t) => t > since);
        if (kept.length) hits.set(key, kept);
        else hits.delete(key);
    }
}
