import { Log } from "./utils/Log";		// (first: it sets up Sentry before the rest load)
import * as http from "http";
import WebSocket, { Server } from "ws";
import { AccountManager } from "./managers/account/AccountManager";
import { AdminManager } from "./managers/admin/AdminManager";
import { AnalyticsManager } from "./managers/analytics/AnalyticsManager";
import { StatsPage } from "./managers/analytics/StatsPage";
import { FeedbackManager } from "./managers/feedback/FeedbackManager";
import { AdventurerManager } from "./managers/adventurer/AdventurerManager";
import { AuthConnection } from "./managers/auth/AuthConnection";
import { AuthManager } from "./managers/auth/AuthManager";
import { BillingManager } from "./managers/billing/BillingManager";
import { HeroManager } from "./managers/hero/HeroManager";
import { ChatManager } from "./managers/chat/ChatManager";
import { GuideManager } from "./managers/guide/GuideManager";
import { ChestManager } from "./managers/chests/ChestManager";
import { AchievementManager } from "./managers/achievements/AchievementManager";
import { BountyManager } from "./managers/bounties/BountyManager";
import { ProfileManager } from "./managers/profile/ProfileManager";
import { CosmeticManager } from "./managers/cosmetics/CosmeticManager";
import { FriendManager } from "./managers/friends/FriendManager";
import { GuildManager } from "./managers/guilds/GuildManager";
import { SeasonManager } from "./managers/seasons/SeasonManager";
import { GameManager } from "./managers/games/GameManager";
import { EventManager } from "./managers/events/EventManager";
import { SightManager } from "./managers/sights/SightManager";
import { LeaderboardManager } from "./managers/leaderboards/LeaderboardManager";
import { DatabaseManager } from "./managers/database/DatabaseManager";
import { InventoryManager } from "./managers/inventory/InventoryManager";
import { MarketManager } from "./managers/market/MarketManager";
import { MailManager } from "./managers/mail/MailManager";
import { NetworkManager } from "./managers/network/NetworkManager";
import { NodeManager } from "./managers/node/NodeManager";
import { PartyManager } from "./managers/party/PartyManager";
import { Player } from "./managers/player/Player";
import { PlayerManager } from "./managers/player/PlayerManager";
import { TradeManager } from "./managers/trade/TradeManager";
import { ENV } from "./utils/Env";
import { OLD_CLIENT, PROTOCOL } from "../../shared/Protocol";
import { GameTimer } from "./utils/GameTimer";
import { Guard } from "./utils/Guard";
const { performance } = require('perf_hooks');

export class Engine {

	public static SHUTDOWN_MS = 20 * 1000;		// (the most stopping may take, saving)

	public closing = false;		// (stopping: shutdown)
	private ready = false;		// (everything loaded, taking players)
	private started = Date.now();
	private http: http.Server;
	private server: Server;
	private alive = new WeakSet<WebSocket>();      // (answered the last ping)
	private stats = new StatsPage();

	public db: DatabaseManager;
	public net: NetworkManager;

	public auth: AuthManager;
	public players: PlayerManager;
	public inventories: InventoryManager;

	public parties: PartyManager;
	public adventurers: AdventurerManager;
	public heroes: HeroManager;
	public chat: ChatManager;
	public guide: GuideManager;
	public chests: ChestManager;
	public achievements: AchievementManager;
	public bounties: BountyManager;
	public profiles: ProfileManager;
	public friends: FriendManager;
	public guilds: GuildManager;
	public seasons: SeasonManager;
	public games: GameManager;
	public events: EventManager;
	public sights: SightManager;
	public leaderboards: LeaderboardManager;
	public billing: BillingManager;
	public cosmetics: CosmeticManager;
	public market: MarketManager;
	public trades: TradeManager;
	public mail: MailManager;
	public analytics: AnalyticsManager;
	public feedback: FeedbackManager;
	public admin: AdminManager;
	public account: AccountManager;

	public nodes: NodeManager;

	public deltaTime: number;
	private guard = new Guard("The game loop");

	constructor() {
		this.init();
	}

	private init() {
		// a throw nothing caught, or a rejection nothing handled: the server's
		// state is no longer known, so it's reported, everyone saved, and the
		// process exits (the process manager starts it again; see README.md, Running it live)
		process.on("uncaughtException", (error) => this.onFatal("Uncaught exception", error));
		process.on("unhandledRejection", (error) => this.onFatal("Unhandled rejection", error));

		setTimeout(async () => {
			this.db = new DatabaseManager();
			this.net = new NetworkManager();

			this.auth = new AuthManager();
			this.players = new PlayerManager();
			this.inventories = new InventoryManager();

			this.parties = new PartyManager();
			this.adventurers = new AdventurerManager();
			this.heroes = new HeroManager();
			this.chat = new ChatManager();
			this.guide = new GuideManager();
			this.chests = new ChestManager();
			this.achievements = new AchievementManager();
			this.bounties = new BountyManager();
			this.profiles = new ProfileManager();
			this.friends = new FriendManager();
			this.guilds = new GuildManager();
			this.seasons = new SeasonManager();
			this.games = new GameManager();
			this.events = new EventManager();
			this.sights = new SightManager();
			this.leaderboards = new LeaderboardManager();
			this.billing = new BillingManager();
			this.cosmetics = new CosmeticManager();
			this.market = new MarketManager();
			this.trades = new TradeManager();
			this.mail = new MailManager();
			this.analytics = new AnalyticsManager();
			this.feedback = new FeedbackManager();
			this.admin = new AdminManager();
			this.account = new AccountManager();
			this.nodes = new NodeManager();

			await this.cosmetics.init();		// (before heroes are made for the boards: from the free looks)
			await this.nodes.init();
			await this.adventurers.init();
			await this.heroes.init();
			await this.sights.init();		// (after the places, before players load: an opening's a place their heroes may be at)
			await this.events.init();		// (after the places, before players load: they may be owed for one)
			await this.friends.init();
			await this.guilds.init();
			await this.seasons.init();		// (after the guilds: a season ending gives their members titles)
			await this.chat.init();
			await this.analytics.init();		// (before players load: a session left open by a crash closed)
			await this.feedback.init();
			await this.admin.init();
			await this.guide.init();
			await this.chests.init();
			await this.achievements.init();
			await this.profiles.init();
			await this.games.init();		// (before players load: it gives back the antes of a round the server stopped in)
			await this.trades.init();
			await this.mail.init();
			await this.market.init();		// (before players load: they may be owed for sales)
			await this.players.loadAway();
			await this.leaderboards.init();		// (after everyone working away is loaded)

			// the WebSocket, and beside it on the same port plain HTTP for
			// what needs it - Stripe's webhook
			this.http = http.createServer(this.onHttp.bind(this));
			this.server = new Server({ server: this.http, maxPayload: 64 * 1024 });
			this.http.listen(parseInt(ENV.PORT ?? "5301", 10));
			this.server.on("connection", (ws: WebSocket, req) => {
				ws.on("error", () => { });      // (a bad frame: it closes; unheard, it'd throw)
				if (this.closing) {
					ws.close(Player.SERVER_RESTARTING, "Server restarting");
					return;
				}
				// a client built from other Routes would read every message wrong: told to refresh instead (shared/Protocol.ts)
				if (this.versionOf(req) != PROTOCOL) {
					ws.close(OLD_CLIENT, "Refresh for the new version");
					return;
				}
				this.alive.add(ws);
				ws.on("pong", () => this.alive.add(ws));
				const ip = this.addressOf(req);
				if (!this.auth.canConnect(ip)) {
					ws.terminate();
					return;
				}
				this.auth.addConnection(
					new AuthConnection(ws, ip)
				);
			});
			setInterval(this.heartbeat.bind(this), 30 * 1000);

			// stopped (a deploy, Ctrl+C, the console closed, nodemon restarting): saved first
			for (const signal of ["SIGTERM", "SIGINT", "SIGHUP", "SIGUSR2"] as NodeJS.Signals[]) {
				try {
					process.on(signal, () => this.shutdown(signal));
				} catch (e) { }		// (one this platform hasn't got)
			}
			// (Windows has no SIGTERM: pm2 there, and the integration tests, send "shutdown" over IPC instead)
			process.on("message", (message) => { if (message == "shutdown") this.shutdown("shutdown message"); });
			new GameTimer(this.update.bind(this));
			this.ready = true;
			Log.info("Server ready", { port: parseInt(ENV.PORT ?? "5301", 10) });
		}, 1000);
	}

	// GET .../health: for an uptime check. 200 when the server's taking
	// players and the database answers; 503 while starting, stopping, or
	// with the database down.
	//
	// POST .../stripe/webhook (behind a proxy it may keep a prefix): read the
	// body exactly as sent (Stripe's signature is over those bytes), 200 once
	// handled, else 400 so Stripe tries again.
	//
	// GET .../stats/...: the Analytics on a phone (StatsPage). Anything else is a 404.
	private onHttp(req: http.IncomingMessage, res: http.ServerResponse) {
		const path = (req.url ?? "").split("?")[0];
		if (req.method == "GET" && path.endsWith("/health")) {
			this.health(res);
			return;
		}
		if (this.stats.handle(req, res, this.addressOf(req))) return;
		if (req.method != "POST" || !path.endsWith("/stripe/webhook")) {
			res.writeHead(404);
			res.end();
			return;
		}
		// (stopping: Stripe sends it again later)
		if (this.closing) {
			res.writeHead(503);
			res.end();
			return;
		}
		const chunks: Buffer[] = [];
		let size = 0;
		req.on("data", (chunk: Buffer) => {
			size += chunk.length;
			if (size > 1024 * 1024) req.destroy();		// (no webhook is near this)
			else chunks.push(chunk);
		});
		req.on("error", () => { });
		req.on("end", () => {
			this.billing.webhook(Buffer.concat(chunks), req.headers["stripe-signature"] as string).then(() => {
				res.writeHead(200);
				res.end();
			}).catch((error) => {
				Log.warn("Stripe webhook refused", { reason: error?.message ?? String(error) });
				res.writeHead(400);
				res.end();
			});
		});
	}

	// who's connecting: behind a proxy (TRUST_PROXY=1) the address it saw,
	// the last in X-Forwarded-For (any before it the client could have sent)
	private addressOf(req: http.IncomingMessage) {
		const forwarded = ENV.TRUST_PROXY == "1" ? String(req.headers["x-forwarded-for"] ?? "").split(",").pop().trim() : "";
		return forwarded || req.socket.remoteAddress || "?";
	}

	// the messages' version the client sent as it connected (`?v=` in its address), "" none
	private versionOf(req: http.IncomingMessage) {
		try {
			return new URL(req.url ?? "/", "http://x").searchParams.get("v") ?? "";
		} catch {
			return "";
		}
	}

	// every connection pinged: those that didn't answer the last are dropped
	// (gone without closing - wifi lost, a laptop shut - they'd seem signed in)
	private heartbeat() {
		for (const ws of this.server.clients) {
			if (!this.alive.has(ws)) {
				ws.terminate();
				continue;
			}
			this.alive.delete(ws);
			ws.ping();
		}
	}

	private health(res: http.ServerResponse) {
		const reply = (code: number, body: object) => {
			res.writeHead(code, { "Content-Type": "application/json", "Cache-Control": "no-store" });
			res.end(JSON.stringify(body));
		};
		if (this.closing) return reply(503, { status: "stopping" });
		if (!this.ready) return reply(503, { status: "starting" });
		this.db.ping(2000).then(() => reply(200, {
			status: "ok",
			uptime: Math.round((Date.now() - this.started) / 1000),
			online: this.players.online().length,
		})).catch((error) => {
			Log.warn("Health check: database not answering", { reason: error?.message ?? String(error) });
			reply(503, { status: "database down" });
		});
	}

	private onFatal(kind: string, error: unknown) {
		Log.fatal(`${kind} - saving and stopping`, error);
		if (this.closing) return;		// (already stopping: let the saves finish)
		if (this.ready) this.shutdown(kind, 1);
		else this.exit(1);		// (still loading: nothing to save yet)
	}

	// out, once Sentry's sent what it has
	private exit(code: number) {
		Log.flush().finally(() => process.exit(code));
	}

	// Stopping, with nothing lost: no new connections, messages or game time
	// from here; the work under way (a market buy, a game's ante, a guild
	// change) let finish; everyone's connection closed as "server restarting"
	// (the client tries again till it's back); everyone loaded and the events
	// saved; then out. A second signal, or SHUTDOWN_MS gone by, stops it at once.
	// (code: what it exits with once saved - 1 after a crash, so the process
	// manager sees it failed)
	private async shutdown(signal: string, code = 0) {
		if (this.closing) {
			Log.warn(`Shutdown: ${signal} again - stopping now, without waiting for the saves`);
			this.exit(1);
			return;
		}
		this.closing = true;
		Log.info(`Shutdown: ${signal} - saving, then stopping...`);
		setTimeout(() => {
			Log.error(`Shutdown: still not done after ${Engine.SHUTDOWN_MS}ms - stopping anyway`);
			this.exit(1);
		}, Engine.SHUTDOWN_MS).unref();
		try {
			this.http.close();
			await this.db.idle(Engine.SHUTDOWN_MS / 2);
			await this.players.shutdown();
			await this.heroes.tasks.formed.saveAll();		// (the parties players made: as their heroes were saved)
			await this.analytics.track.shutdown();
			for (const ws of this.server.clients) ws.close(Player.SERVER_RESTARTING, "Server restarting");
			await this.events.save();
			await this.sights.save();
			await this.guilds.save();
			await this.seasons.save();
			this.net.mapEd.save();
			await this.db.end();
			Log.info("Shutdown: saved. Bye.");
			this.exit(code);
		} catch (e) {
			Log.error("Shutdown: error while saving", e);
			this.exit(1);
		}
	}

	private update(deltaTime: number) {
		if (this.closing) return;
		this.deltaTime = deltaTime;
		// (each on its own: one throwing doesn't stop the rest, utils/Guard)
		if (this.heroes) this.guard.run("heroes", () => this.heroes.tasks.update(deltaTime));
		if (this.games) this.guard.run("games", () => this.games.update(deltaTime));
		if (this.events) this.guard.run("events", () => this.events.update(deltaTime));
		if (this.sights) this.guard.run("sights", () => this.sights.update(deltaTime));
		if (this.market) this.guard.run("market", () => this.market.update(deltaTime));
		if (this.trades) this.guard.run("trades", () => this.trades.update(deltaTime));
		if (this.mail) this.guard.run("mail", () => this.mail.update(deltaTime));
		if (this.chests) this.guard.run("chests", () => this.chests.update(deltaTime));
		if (this.bounties) this.guard.run("bounties", () => this.bounties.update(deltaTime));
	}

}

export const IBS = new Engine();
