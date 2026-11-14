import { createHash, timingSafeEqual } from "crypto";
import { readFileSync } from "fs";
import * as http from "http";
import * as path from "path";
import { AWAY_GAPS, IDLE_AFTER_MS, PLAYTIMES, SESSION_COUNTS, SESSION_LENGTHS, GONE_AFTER_DAYS, BOUNCE_S } from "../../../../shared/Analytics";
import { CHANNELS } from "../../../../shared/Chat";
import { FEEDBACK_KINDS } from "../../../../shared/Feedback";
import { STEPS } from "../../../../shared/Guide";
import { JOBS, SKILL_NAMES } from "../../../../shared/Heroes";
import { TASK_NAMES } from "../../../../shared/Tasks";
import { IBS } from "../../app";
import { ENV } from "../../utils/Env";
import { Log } from "../../utils/Log";

// The Analytics on a phone (the user, 2026-11-01: "a mobile analytics
// page"): GET .../stats/ is a plain page (server/stats: its HTML, script and
// style - no inline script, for the site's CSP) that asks .../stats/data for
// the same snapshot as the admin's window (AnalyticsManager.build), with
// the names the window has built in alongside. The data needs STATS_KEY
// (.env) as `Authorization: Bearer <key>`; unset, it's all a 404. A wrong
// key BAD_MOST times from one address locks it out for LOCK_MS. A snapshot's
// kept CACHE_MS (a page left open on several phones asks once).
// .../stats/chat (the same key): what's said in General, Trade and Help,
// the lines the server keeps (ChatManager), to read only.

const FILES: { [name: string]: string } = {
    "": "text/html; charset=utf-8",
    "stats.js": "text/javascript; charset=utf-8",
    "stats.css": "text/css; charset=utf-8",
};
const DIR = path.resolve(__dirname, "..", "..", "..", "..", "..", "stats");     // (build/server/src/managers/analytics: server/stats)
const CACHE_MS = 10 * 1000;
const BAD_MOST = 5;
const LOCK_MS = 15 * 60 * 1000;

const LABELS = {
    steps: STEPS.map((s) => s.name),
    lengths: SESSION_LENGTHS.map((b) => b.name),
    gaps: AWAY_GAPS.map((b) => b.name),
    playtimes: PLAYTIMES.map((b) => b.name),
    sessionCounts: SESSION_COUNTS.map((b) => b.name),
    tasks: TASK_NAMES,
    jobs: JOBS.map((j) => j.name),
    skills: SKILL_NAMES,
    idleMinutes: IDLE_AFTER_MS / 60000,
    goneDays: GONE_AFTER_DAYS,
    bounceMinutes: BOUNCE_S / 60,
    feedbackKinds: FEEDBACK_KINDS,
};

export class StatsPage {

    private bad = new Map<string, { n: number; until: number }>();     // (address: wrong keys)
    private cache = new Map<boolean, { at: number; json: Promise<string> }>();   // (staff counted: the last snapshot)

    // .../stats/... (anything else isn't ours: false)
    public handle(req: http.IncomingMessage, res: http.ServerResponse, ip: string) {
        const m = /\/stats(?:\/(.*))?$/.exec((req.url ?? "").split("?")[0]);
        if (!m || req.method != "GET") return false;
        const key = ENV.STATS_KEY ?? "";
        if (!key) return this.end(res, 404);
        const name = m[1] ?? "";
        if (m[1] == null) {             // (/stats: to /stats/, so the page's own files are found beside it)
            res.writeHead(301, { Location: `${(req.url ?? "").split("?")[0]}/` });
            res.end();
            return true;
        }
        if (name == "data") {
            this.data(req, res, ip, key);
            return true;
        }
        if (name == "chat") {
            this.chat(req, res, ip, key);
            return true;
        }
        if (!(name in FILES)) return this.end(res, 404);
        try {
            const body = readFileSync(path.join(DIR, name || "index.html"));
            res.writeHead(200, { "Content-Type": FILES[name], "Cache-Control": "no-cache" });
            res.end(body);
        } catch (e) {
            Log.error("Stats page: couldn't read a file", e, { name });
            this.end(res, 500);
        }
        return true;
    }

    // whether the key's right (if not, answered)
    private allowed(req: http.IncomingMessage, res: http.ServerResponse, ip: string, key: string) {
        const now = Date.now();
        const bad = this.bad.get(ip);
        if (bad && bad.until > now) return !this.end(res, 429);
        const given = /^Bearer (.+)$/.exec(String(req.headers.authorization ?? ""))?.[1] ?? "";
        if (!same(given, key)) {
            const n = (bad && !bad.until ? bad.n : 0) + 1;     // (a lock over: counted afresh)
            this.bad.set(ip, { n, until: n >= BAD_MOST ? now + LOCK_MS : 0 });
            if (n >= BAD_MOST) Log.warn("Stats page: locked out after wrong keys", { ip });
            return !this.end(res, 401);
        }
        this.bad.delete(ip);
        return true;
    }

    private chat(req: http.IncomingMessage, res: http.ServerResponse, ip: string, key: string) {
        if (!this.allowed(req, res, ip, key)) return;
        const lines = IBS.chat.channelLines().map((kept) => kept.map((l) => ({ n: l.n, t: l.t, a: l.a, g: l.g, e: l.e })));
        res.writeHead(200, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
        res.end(JSON.stringify({ at: Date.now(), channels: CHANNELS, lines }));
    }

    private data(req: http.IncomingMessage, res: http.ServerResponse, ip: string, key: string) {
        if (!this.allowed(req, res, ip, key)) return;
        const now = Date.now();
        const staff = new URL(req.url ?? "/", "http://x").searchParams.get("staff") == "1";
        let cached = this.cache.get(staff);
        if (!cached || now - cached.at > CACHE_MS) {
            cached = { at: now, json: IBS.analytics.build(staff).then((a) => JSON.stringify({ a, labels: LABELS })) };
            this.cache.set(staff, cached);
            cached.json.catch(() => this.cache.delete(staff));
        }
        cached.json.then((json) => {
            res.writeHead(200, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
            res.end(json);
        }).catch((e) => {
            Log.error("Stats page: couldn't make the analytics", e);
            this.end(res, 500);
        });
    }

    private end(res: http.ServerResponse, code: number) {
        res.writeHead(code, { "Cache-Control": "no-store" });
        res.end();
        return true;
    }

}

// the key, compared in the same time whatever it is
function same(given: string, key: string) {
    const a = createHash("sha256").update(given).digest(), b = createHash("sha256").update(key).digest();
    return timingSafeEqual(a, b) && given.length > 0;
}
