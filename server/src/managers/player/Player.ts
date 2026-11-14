import WebSocket from "ws";
import { ACCOUNT_BANNED } from "../../../../shared/Admin";
import { AwaySnap } from "../../../../shared/Away";
import { IBS } from "../../app";
import { Role } from "../../constants/Constants";
import { Roster } from "../adventurer/Roster";
import { Social } from "../friends/FriendManager";
import { Hero } from "../hero/HeroManager";
import { PlayerRecord } from "../database/PlayerRecord";
import { Inventory } from "../inventory/Inventory";
import { PlayerSubs } from "./PlayerSubs";
import { Log } from "../../utils/Log";

// A player the server has loaded: signed in (a connection), or signed out
// with their heroes still working until `awayUntil` (HeroTasks.awayFor; the
// user, 2026-10-28), with nothing sent to them meanwhile.

export class Player {

	public static SIGNED_IN_ELSEWHERE = 4001;	// (close codes the client acts on: network/Reconnect)
	public static SERVER_RESTARTING = 4002;
	public static ACCOUNT_DELETED = 4003;
	public static ACCOUNT_BANNED = ACCOUNT_BANNED;	// 4005

	private ws: WebSocket = null;

	public id: number;
	public record: PlayerRecord;
	public inventory: Inventory;
	public roster: Roster;
	public heroes: Hero[] = [];
	public barracks: Hero[] = [];    // (off the roster, not working: HeroManager.swap)
	public social: Social;           // friends and blocks (FriendManager)
	public awayUntil = 0;            // (signed out: when their heroes stop)
	public deleting = false;         // (their account's being deleted: what they send is ignored, AccountManager)
	public hiring = false;           // (a hire under way)
	public stashChanged = false;     // (heroes added to the inventory: to send)
	public stashDirty = false;       // (and to save)
	public heroesDirty = new Set<Hero>();   // (heroes whose state changed: to save)
	public journalsDirty = new Set<Hero>(); // (heroes with a line written in their journal: to save)
	public packs: number[] = [];     // (the cosmetic packs they own: CosmeticManager, loaded with signing in)
	public eventRewards: { n: string; g: number; i: number }[] = [];  // (paid for events while they were away: told as they sign in)
	public marketNotes: any[] = [];   // (what sold and what came back from the market while they were away: told as they sign in)
	public guildNotes: string[] = [];   // (gold for guild goals met while they weren't loaded: told as they sign in)
	public season: { titles: string[]; scenes: number[]; title: string } = null;   // (what they've earned in seasons: SeasonManager, loaded with signing in)
	public away: AwaySnap = null;     // (signed out: how things were as they left, for the away summary; HeroAway)
	public subs: PlayerSubs;

	constructor(id: number) {
		this.id = id;
		this.subs = new PlayerSubs(this);
	}

	public get online() {
		return this.ws != null;
	}

	// signed in on this connection
	public attach(ws: WebSocket) {
		this.ws = ws;
		IBS.analytics.track.signedIn(this);		// (before awayUntil's cleared: when their heroes stopped)
		this.awayUntil = 0;

		// (only while it's still theirs: kick may have taken it from them)
		ws.on("close", () => {
			if (this.ws == ws) this.detach();
		});

		ws.on("message", (msg: any) => {
			if (this.ws == ws) IBS.net.onMessage(this, msg);
		});
	}

	// signed out: their connection closed, or they signed in elsewhere (kick)
	public detach() {
		const ws = this.ws;
		if (!ws) return;
		Log.info(`Disconnected: ${this.record.displayName} (${this.record.id})`);
		ws.removeAllListeners();
		ws.on("error", () => { });      // (it may yet report one: unheard, that'd throw)
		this.ws = null;
		this.subs.removeAll();
		IBS.analytics.track.signedOut(this);
		IBS.games.leave(this);
		IBS.trades.leave(this);
		IBS.players.signedOut(this);
	}

	// signed in again elsewhere: this connection's signed out and closed
	public kick() {
		const ws = this.ws;
		this.detach();
		ws?.close(Player.SIGNED_IN_ELSEWHERE, "Signed in elsewhere");
	}

	// banned (AdminManager.ban): signed out and closed with ACCOUNT_BANNED (the
	// client loads the page again, and is told why as it tries to sign back in)
	public closeForBan() {
		const ws = this.ws;
		this.detach();
		ws?.close(Player.ACCOUNT_BANNED, "Banned");
	}

	// the server's stopping: the connection closed with SERVER_RESTARTING (the
	// client tries again till it's back), with none of signing out's doing -
	// PlayerManager.shutdown saves them
	public closeForShutdown() {
		const ws = this.ws;
		if (!ws) return;
		ws.removeAllListeners();
		ws.on("error", () => { });
		this.ws = null;
		ws.close(Player.SERVER_RESTARTING, "Server restarting");
	}

	// Their account's being deleted (AccountManager): the connection closed
	// with `code`, with none of signing out's doing (nothing's saved). If
	// deleting failed part way, SERVER_RESTARTING: the client signs back in,
	// loading them fresh from what's saved.
	public closeForDelete(code: number) {
		const ws = this.ws;
		if (!ws) return;
		ws.removeAllListeners();
		ws.on("error", () => { });
		this.ws = null;
		this.subs.removeAll();
		ws.close(code, code == Player.ACCOUNT_DELETED ? "Account deleted" : "Try again");
	}

	public update() {
		this.subs.update();
	}

	// (signed out: nothing)
	public send(data: any) {
		if (this.ws) this.ws.send(JSON.stringify(data));
	}

	//#region === Access Levels ===

	public canEdit() {
		return this.record.role >= Role.EDITOR;
	}

	//#endregion

}
