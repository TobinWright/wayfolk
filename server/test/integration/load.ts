// The load test (npm run test:load in server/; README.md, Running it live, Tests): a fresh
// test world (harness: its own database and server, nothing of the dev
// one's touched), --bots guests signing up together, each hiring their free
// hero (so heroes are working, as they would be), then for --seconds doing
// what players do - the market, the hiring board, leaderboards, the card
// tables, chat - about --rate things a second each. It reports how long the
// server took to answer, how many asks went unanswered, connections lost,
// and its health at the end. A guide, not a promise: the live box
// and its database are another machine.
//
//   npm run test:load -- --bots 300 --seconds 120 --rate 0.5

import { C2S, S2C } from "../../../shared/Routes";
import { Game } from "../../../shared/Games";
import { Board } from "../../../shared/Leaderboards";
import { CHAT_GAP_MS } from "../../../shared/Chat";
import { Bot, PORT, sleep, World } from "./harness";
import * as http from "http";
import { monitorEventLoopDelay } from "perf_hooks";

function option(name: string, fallback: number) {
    const at = process.argv.indexOf(`--${name}`);
    return at > 0 ? Number(process.argv[at + 1]) : fallback;
}

const BOTS = option("bots", 100);
const SECONDS = option("seconds", 60);
const RATE = option("rate", 0.5);
const SIGN_UPS_AT_ONCE = 20;            // (bcrypt's slow on purpose: a crowd at the door, not all in one instant)

// what a bot does, and the answer it waits for
const ASKS: [string, C2S, () => object, S2C[]][] = [
    ["market list", C2S.MARKET_LIST, () => ({ t: "", q: "" }), [S2C.MARKET_LIST]],
    ["market mine", C2S.MARKET_MINE, () => ({}), [S2C.MARKET_MINE]],
    ["hiring board", C2S.HERO_BOARD, () => ({}), [S2C.HERO_BOARD]],
    ["leaderboard", C2S.LEADER_BOARD, () => ({ b: [Board.LEVEL, Board.WEALTH, Board.BLACKJACK][Math.floor(Math.random() * 3)] }), [S2C.LEADER_BOARD]],
    ["card rooms", C2S.GAME_ROOMS, () => ({ g: Game.BLACKJACK }), [S2C.GAME_ROOMS]],
    ["guild search", C2S.GUILD_BROWSE, () => ({ q: "" }), [S2C.GUILD_LIST]],
];
const CHAT_EVERY_S = option("chat", 60);     // (a line in General about this often each: it goes to everyone, so it's what grows fastest)
let lines = 0;

const times = new Map<string, number[]>();
let unanswered = 0;
const missed = new Map<string, number>();     // (unanswered, by what was asked)

function note(what: string, ms: number) {
    if (!times.has(what)) times.set(what, []);
    times.get(what).push(ms);
}

async function timed<T>(what: string, work: () => Promise<T>) {
    const start = performance.now();
    try {
        const result = await work();
        note(what, performance.now() - start);
        return result;
    } catch (e) {
        unanswered++;
        missed.set(what, (missed.get(what) ?? 0) + 1);
        return null;
    }
}

function percentile(sorted: number[], p: number) {
    return sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))] : NaN;
}

function health(): Promise<any> {
    return new Promise((resolve) => {
        http.get({ host: "127.0.0.1", port: PORT, path: "/health" }, (res) => {
            let body = "";
            res.on("data", (c) => body += c);
            res.on("end", () => { try { resolve({ code: res.statusCode, ...JSON.parse(body) }); } catch { resolve({ code: res.statusCode }); } });
        }).on("error", (e) => resolve({ error: e.message }));
    });
}

async function play(bot: Bot, until: number) {
    let chatted = 0;
    while (Date.now() < until && bot.closed === null) {
        await sleep((Math.random() * 2 / RATE) * 1000);
        // (CHAT_GAP_MS apart at least, as the client keeps them: closer, the server drops it unsaid)
        if (Math.random() < 1 / (CHAT_EVERY_S * RATE) && Date.now() - chatted > CHAT_GAP_MS) {
            chatted = Date.now();
            // (its own line back, or a note it was refused: not anyone else's)
            const t = `load test line ${lines++}`;
            await timed("chat", () => {
                const back = Promise.race([bot.next(S2C.CHAT_SAID, (m) => m.l.t == t), bot.next(S2C.CHAT_NOTE)]);
                bot.send(C2S.CHAT_SAY, { c: 0, t });
                return back;
            });
            continue;
        }
        const [what, route, fields, answers] = ASKS[Math.floor(Math.random() * ASKS.length)];
        await timed(what, () => bot.ask(route, fields(), ...answers));
    }
}

async function main() {
    console.log(`[load] ${BOTS} bots, ${SECONDS}s, ~${RATE} asks a second each: making the test world...`);
    const world = await World.start();
    let failed = 0;
    try {
        const bots: Bot[] = [];
        const started = Date.now();
        for (let i = 0; i < BOTS; i += SIGN_UPS_AT_ONCE) {
            const some = await Promise.all(Array.from({ length: Math.min(SIGN_UPS_AT_ONCE, BOTS - i) }, () => timed("sign up", () => world.guest())));
            bots.push(...some.filter((b) => b));
        }
        console.log(`[load] ${bots.length} signed up in ${((Date.now() - started) / 1000).toFixed(1)}s; hiring their free heroes...`);
        await Promise.all(bots.map(async (bot) => {
            await timed("hiring board", () => bot.ask(C2S.HERO_BOARD, {}, S2C.HERO_BOARD));
            await timed("hire", () => bot.ask(C2S.HERO_HIRE, { i: 0 }, S2C.HERO_HIRED, S2C.HERO_REFUSED));
        }));

        console.log(`[load] playing for ${SECONDS}s...`);
        for (const bot of bots) bot.keep = false;
        const end = Date.now() + SECONDS * 1000;
        const lag = monitorEventLoopDelay({ resolution: 20 });
        lag.enable();
        await Promise.all(bots.map((bot) => play(bot, end)));
        lag.disable();
        const lost = bots.filter((b) => b.closed !== null).length;
        const h = await health();

        console.log(`\n[load] what                 answers   p50 ms   p95 ms   p99 ms   max ms`);
        for (const [what, list] of [...times.entries()].sort()) {
            const s = list.sort((a, b) => a - b);
            const row = [percentile(s, 0.5), percentile(s, 0.95), percentile(s, 0.99), s[s.length - 1]].map((n) => n.toFixed(0).padStart(8));
            console.log(`[load] ${what.padEnd(20)} ${String(s.length).padStart(7)} ${row.join(" ")}`);
        }
        console.log(`[load] unanswered in 10s: ${unanswered}${missed.size ? ` (${[...missed].map(([w, n]) => `${w} ${n}`).join(", ")})` : ""}; connections lost: ${lost}; health: ${JSON.stringify(h)}`);
        // (the bots' own process held up: past a few tens of ms, the times above are the bots', not the server's)
        console.log(`[load] the bots' process held up: p99 ${(lag.percentile(99) / 1e6).toFixed(0)}ms, max ${(lag.max / 1e6).toFixed(0)}ms`);
        const errors = world.logged(/ERROR|FATAL/);
        console.log(`[load] server errors logged: ${errors.length}${errors.length ? "\n  " + errors.slice(0, 5).join("\n  ") : ""}`);
        failed = unanswered + lost + errors.length;
    } finally {
        await world.stop();
    }
    process.exit(failed ? 1 : 0);
}

main().catch((e) => {
    console.error("[load]", e);
    process.exit(1);
});
