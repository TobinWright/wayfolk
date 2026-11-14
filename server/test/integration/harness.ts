// The integration tests' harness (npm run test:integration): a fresh test
// database made from schema/, a real server (build/) started against it on
// its own port, players driven over the WebSocket as the client would, a
// stand-in for Stripe's API, and the database read straight to check what
// was saved. The dev server and database are never touched.
//
//   const world = await World.start();
//   const a = await world.guest();          // a new guest, signed in
//   await world.give(a, { gold: 500 });     // by an admin, through the game
//   ...
//   await world.stop();

import { ChildProcess, fork } from "child_process";
import { readFileSync, writeFileSync, mkdirSync } from "fs";
import * as http from "http";
import * as path from "path";
import WebSocket from "ws";
import { createConnection, Connection, RowDataPacket } from "mysql2/promise";
import { C2S, S2C } from "../../../shared/Routes";
import { PROTOCOL } from "../../../shared/Protocol";

const SERVER = path.join(__dirname, "..", "..", "..", "..");       // (build-test/server/test/integration -> server/)
export const DATABASE = "game_wayfolk_test";
export const PORT = 5391;
export const STRIPE_PORT = 5392;
export const STATS_KEY = "stats-key-for-tests";       // (the phone page's: server analytics/StatsPage)
export const WEBHOOK_SECRET = "whsec_integration_tests";
export const PRICE = "price_integration_tests";
const ENV_FILE = path.join(SERVER, "build-test", "integration.env");

// server/.env, read as the server reads it (utils/Env.ts): the database's login
function devEnv() {
    const out: { [key: string]: string } = {};
    for (const line of readFileSync(path.join(SERVER, ".env"), "utf8").split(/\r?\n/)) {
        const m = /^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/.exec(line);
        if (m) out[m[1]] = m[2];
    }
    return out;
}

export const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// waits for `check` to be true (polled), or throws after ms
export async function until(check: () => boolean | Promise<boolean>, what: string, ms = 10000) {
    const end = Date.now() + ms;
    while (Date.now() < end) {
        if (await check()) return;
        await sleep(50);
    }
    throw new Error(`timed out waiting for ${what}`);
}

//#region Stripe's stand-in

// What the server asks Stripe for, answered from `subscriptions` and
// `charges`, every call kept in `calls` (method and path).
export class FakeStripe {

    public calls: string[] = [];
    public subscriptions: { id: string, customer: string, status: string }[] = [];
    public charges = new Map<string, string>();     // (charge id: customer id)
    private server: http.Server;

    public start() {
        this.server = http.createServer((req, res) => {
            const url = new URL(req.url ?? "/", "http://x");
            this.calls.push(`${req.method} ${url.pathname}`);
            const reply = (body: object, code = 200) => {
                res.writeHead(code, { "Content-Type": "application/json" });
                res.end(JSON.stringify(body));
            };
            req.resume();
            req.on("end", () => {
                let m: RegExpExecArray;
                if ((m = /^\/v1\/prices\/(.+)$/.exec(url.pathname)))
                    return reply({ id: m[1], object: "price", currency: "usd", unit_amount: 499, recurring: { interval: "month" } });
                if ((m = /^\/v1\/charges\/(.+)$/.exec(url.pathname)))
                    return reply({ id: m[1], object: "charge", customer: this.charges.get(m[1]) ?? null });
                if (url.pathname == "/v1/subscriptions" && req.method == "GET") {
                    const customer = url.searchParams.get("customer");
                    return reply({ object: "list", has_more: false, data: this.subscriptions.filter((s) => s.customer == customer && s.status == "active") });
                }
                if ((m = /^\/v1\/subscriptions\/(.+)$/.exec(url.pathname)) && req.method == "DELETE") {
                    const s = this.subscriptions.find((x) => x.id == m[1]);
                    if (s) s.status = "canceled";
                    return reply({ id: m[1], object: "subscription", status: "canceled" });
                }
                if ((m = /^\/v1\/customers\/(.+)$/.exec(url.pathname)) && req.method == "DELETE")
                    return reply({ id: m[1], object: "customer", deleted: true });
                reply({ error: { type: "invalid_request_error", message: "not in the stand-in" } }, 404);
            });
        });
        return new Promise<void>((resolve) => this.server.listen(STRIPE_PORT, "127.0.0.1", resolve));
    }

    public stop() {
        return new Promise<void>((resolve) => this.server ? this.server.close(() => resolve()) : resolve());
    }

}

//#endregion

//#region a player

let nextAddress = 1;

// A connection to the server, as the client makes one. Every message that
// comes is kept (`seen`); `next` waits for one of a route.
export class Bot {

    public ws: WebSocket;
    public seen: any[] = [];
    public closed: number = null;       // (the close code, once closed)
    public id = 0;
    public name = "";
    public login = "";
    public password = "";
    public email = "";                  // (saved with one: world.player; signed in again with it)
    public gold = 0;                   // (as last told: HERO_STASH, GAME_GOLD)
    public items = new Map<number, number>();
    public signedIn: any = null;        // (TITLE_SIGNED_IN as it came)
    public keep = true;                 // (false: messages not kept in seen - a load test's thousands of chat lines)
    private waiting: { route: number, check: (m: any) => boolean, resolve: (m: any) => void }[] = [];

    // (each from an address of its own, as the proxy would say: TRUST_PROXY=1, so sign-up limits don't bite)
    constructor(readonly address = `10.9.${Math.floor(nextAddress / 250)}.${(nextAddress++ % 250) + 1}`) { }

    public connect() {
        return new Promise<void>((resolve, reject) => {
            this.ws = new WebSocket(`ws://127.0.0.1:${PORT}/?v=${PROTOCOL}`, { headers: { "X-Forwarded-For": this.address } });
            this.ws.on("message", (data) => this.heard(JSON.parse(String(data))));
            this.ws.on("close", (code) => this.closed = code);
            this.ws.on("open", () => resolve());
            this.ws.on("error", reject);
        });
    }

    private heard(m: any) {
        if (this.keep) this.seen.push(m);
        if (m.r == S2C.HERO_STASH) {
            this.gold = m.g;
            for (const [id, n] of m.i) this.items.set(id, n);
        }
        if (m.r == S2C.GAME_GOLD) this.gold = m.g;
        for (const w of this.waiting.slice())
            if (w.route == m.r && w.check(m)) {
                this.waiting.splice(this.waiting.indexOf(w), 1);
                w.resolve(m);
            }
    }

    public send(route: C2S, fields: object = {}) {
        this.ws.send(JSON.stringify({ r: route, ...fields }));
    }

    // the next message of a route from now (one matching `check`)
    public next(route: S2C, check: (m: any) => boolean = () => true, ms = 10000): Promise<any> {
        return new Promise((resolve, reject) => {
            const w = { route, check, resolve };
            this.waiting.push(w);
            setTimeout(() => {
                const i = this.waiting.indexOf(w);
                if (i < 0) return;
                this.waiting.splice(i, 1);
                reject(new Error(`${this.name || "a bot"}: no ${S2C[route]} in ${ms}ms (last heard: ${this.seen.slice(-6).map((m) => S2C[m.r] + (m.w ? ` "${m.w}"` : "")).join(", ")})`));
            }, ms);
        });
    }

    // a message and the answer to it: the first of `routes` to come
    public ask(route: C2S, fields: object, ...routes: S2C[]): Promise<any> {
        const answer = Promise.race(routes.map((r) => this.next(r)));
        this.send(route, fields);
        return answer;
    }

    // what they were sent of a route since connecting
    public all(route: S2C) {
        return this.seen.filter((m) => m.r == route);
    }

    // signed in: TITLE_SIGNED_IN (or the refusal, thrown)
    public async signIn(fields: object, route = C2S.TITLE_SIGN_IN) {
        const m = await this.ask(route, fields, S2C.TITLE_SIGNED_IN, S2C.TITLE_REFUSED);
        if (m.r == S2C.TITLE_REFUSED) throw new Refused(m.w, m.e);
        this.signedIn = m;
        this.id = m.player.id;
        this.name = m.player.name;
        this.gold = m.inventory.g;
        this.items = new Map(m.inventory.i);
        return m;
    }

    public close() {
        if (this.closed !== null || !this.ws) return Promise.resolve();
        return new Promise<void>((resolve) => {
            this.ws.once("close", () => resolve());
            this.ws.close();
        });
    }

}

export class Refused extends Error {
    constructor(readonly why: string, text: string) {
        super(`refused (${why}): ${text}`);
    }
}

//#endregion

//#region the world: database, server, players

export class World {

    public db: Connection;
    public stripe = new FakeStripe();
    public logs: string[] = [];
    private server: ChildProcess = null;
    private exited: Promise<number>;
    private bots: Bot[] = [];
    private staff: Bot = null;

    // a fresh database from schema/, Stripe's stand-in, and the server on them
    public static async start() {
        const world = new World();
        await world.makeDatabase();
        await world.stripe.start();
        await world.startServer();
        return world;
    }

    private async makeDatabase() {
        const e = devEnv();
        const login = { host: e.DB_HOST || "localhost", port: Number(e.DB_PORT || 3306), user: e.DB_USER, password: e.DB_PASS };
        const root = await createConnection({ ...login, multipleStatements: true });
        await root.query(`DROP DATABASE IF EXISTS ${DATABASE}`);
        await root.query(`CREATE DATABASE ${DATABASE} CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci`);
        await root.query(`USE ${DATABASE}`);
        await root.query(readFileSync(path.join(SERVER, "schema", "schema.sql"), "utf8"));
        await root.query(readFileSync(path.join(SERVER, "schema", "seed.sql"), "utf8"));
        await root.end();
        this.db = await createConnection({ ...login, database: DATABASE });

        mkdirSync(path.dirname(ENV_FILE), { recursive: true });
        writeFileSync(ENV_FILE, [
            `DB_HOST=${login.host}`, `DB_PORT=${login.port}`, `DB_USER=${login.user}`, `DB_PASS=${login.password}`, `DB_DATABASE=${DATABASE}`,
            `PORT=${PORT}`, `TRUST_PROXY=1`, `PUBLIC_URL=http://localhost/wayfolk-tests/`,
            `STRIPE_SECRET_KEY=sk_test_integration`, `STRIPE_WEBHOOK_SECRET=${WEBHOOK_SECRET}`, `STRIPE_PRICE_PREMIUM=${PRICE}`,
            `STRIPE_API_URL=http://127.0.0.1:${STRIPE_PORT}`, `LOG_LEVEL=info`, `STATS_KEY=${STATS_KEY}`,
        ].join("\n"));
    }

    // the server (build/, made by tsc first), ready once it says so
    public async startServer() {
        const start = this.logs.length;
        this.server = fork(path.join(SERVER, "build", "server", "src", "app.js"), [], {
            cwd: SERVER, env: { ...process.env, ENV_FILE }, stdio: ["ignore", "pipe", "pipe", "ipc"],
        });
        const read = (data: Buffer) => this.logs.push(...String(data).split(/\r?\n/).filter((l) => l));
        this.server.stdout.on("data", read);
        this.server.stderr.on("data", read);
        this.exited = new Promise((resolve) => this.server.once("exit", (code) => resolve(code ?? -1)));
        await until(() => this.logs.slice(start).some((l) => l.includes("Server ready")), "the server to start", 30000);
    }

    // stopped as a deploy stops it (saving everyone), resolving with its exit code
    public async stopServer() {
        if (!this.server) return 0;
        this.server.send("shutdown");
        const code = await this.exited;
        this.server = null;
        return code;
    }

    public async stop() {
        for (const bot of this.bots) await bot.close();
        await this.stopServer();
        await this.stripe.stop();
        await this.db.end();
    }

    // log lines since `from` matching a pattern
    public logged(pattern: RegExp, from = 0) {
        return this.logs.slice(from).filter((l) => pattern.test(l));
    }

    public async query<T = RowDataPacket[]>(sql: string, args: any[] = []): Promise<T> {
        const [rows] = await this.db.query(sql, args);
        return rows as any;
    }

    // a connection, not signed in yet
    public async connect(address?: string) {
        const bot = new Bot(address);
        await bot.connect();
        await until(() => bot.all(S2C.TITLE_AUTH_OPTIONS).length > 0, "the title screen's options");
        this.bots.push(bot);
        return bot;
    }

    // a brand-new guest, signed in
    public async guest() {
        const bot = await this.connect();
        const credentials = bot.next(S2C.TITLE_GUEST_CREDENTIALS);
        await bot.signIn({ t: "guest" }, C2S.TITLE_SIGN_UP);
        const c = await credentials;
        bot.login = c.l;
        bot.password = c.p;
        return bot;
    }

    // a new player with a saved (email) account: a guest saved, as guests can't
    // trade, use the market or send things in mail
    public async player() {
        const bot = await this.guest();
        const email = `player${bot.id}@example.com`;
        const saved = await bot.ask(C2S.PLAYER_SAVE_ACCOUNT, { t: "email", l: email, p: bot.password }, S2C.PLAYER_ACCOUNT_SAVED, S2C.PLAYER_SAVE_REFUSED);
        if (saved.r != S2C.PLAYER_ACCOUNT_SAVED) throw new Error(`couldn't save the account: ${saved.e}`);
        bot.email = email;
        return bot;
    }

    // the same player signed in again on a new connection (the old one closed first)
    public async again(bot: Bot) {
        await bot.close();
        const fresh = await this.connect(bot.address);
        fresh.login = bot.login;
        fresh.password = bot.password;
        fresh.email = bot.email;
        await fresh.signIn(bot.email ? { t: "email", l: bot.email, p: bot.password } : { t: "guest", l: bot.login, p: bot.password });
        return fresh;
    }

    // gone, and let go by the server (no heroes: saved and dropped at once)
    public async signOut(bot: Bot) {
        await bot.close();
        await sleep(300);
    }

    // an admin of the test world (made once: a guest given the role, signed in again)
    public async admin() {
        if (this.staff?.closed === null) return this.staff;
        if (this.staff) return this.staff = await this.again(this.staff);       // (closed by a restart)
        const bot = await this.guest();
        await this.signOut(bot);
        await this.query("UPDATE player SET role = 3 WHERE id = ?", [bot.id]);
        return this.staff = await this.again(bot);
    }

    // gold and things given to a player by an admin, through the game (as staff would)
    public async give(to: Bot, what: { gold?: number, items?: [number, number][] }) {
        const admin = await this.admin();
        const told = to.all(S2C.HERO_STASH).length;
        if (what.gold) {
            const done = admin.ask(C2S.ADMIN_GOLD, { i: to.id, g: what.gold }, S2C.ADMIN_DONE, S2C.ADMIN_REFUSED);
            if ((await done).r != S2C.ADMIN_DONE) throw new Error("admin gold refused");
        }
        for (const [item, n] of what.items ?? []) {
            const done = await admin.ask(C2S.ADMIN_ITEM, { i: to.id, m: item, n }, S2C.ADMIN_DONE, S2C.ADMIN_REFUSED);
            if (done.r != S2C.ADMIN_DONE) throw new Error("admin item refused: " + done.w);
        }
        // (signed in: sent their stash on the next tick)
        if (to.closed === null && to.ws) await until(() => to.all(S2C.HERO_STASH).length > told, "the gift to reach them");
    }

    // a player's stash as saved: gold and [item, amount] (none left dropped)
    public async stash(id: number) {
        const [r] = await this.query("SELECT gold, items FROM inventory WHERE player_id = ?", [id]);
        const items = new Map<number, number>((JSON.parse(r.items) as [number, number][]).filter(([, n]) => n > 0));
        return { gold: Number(r.gold), items };
    }

}

//#endregion
