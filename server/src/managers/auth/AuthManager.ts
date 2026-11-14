import { AuthConnection } from "./AuthConnection";
import { ensureAuthTables } from "./AuthTables";
import { Log } from "../../utils/Log";

// Connections not signed in yet, and what keeps them in check: how many are
// open (all told, and from each address), how many accounts an address may
// make and how often it may get a sign-in wrong (per WINDOW_MS), and one
// sign-in at a time for each player.

export class AuthManager {

	public static MAX_PENDING = 500;
	public static MAX_PENDING_PER_IP = 10;
	public static TIMEOUT_MS = 10 * 60 * 1000;      // (to sign in, from connecting: time enough to fill in a form)
	public static WINDOW_MS = 60 * 60 * 1000;
	public static SIGN_UPS_PER_IP = 10;             // (per window)
	public static FAILS_PER_IP = 30;                // (per window)

	private connections: AuthConnection[];
	private signUps = new Map<string, number[]>();  // (address: when it made each account)
	private fails = new Map<string, number[]>();    // (address: when it got each sign-in wrong)
	private signingIn = new Set<number>();          // (player ids)

	constructor() {
		this.connections = [];
		ensureAuthTables().catch(Log.catch("Couldn't make the sign-in tables"));
		setInterval(() => {
			for (const map of [this.signUps, this.fails])
				for (const ip of [...map.keys()]) this.recent(map, ip);
		}, 10 * 60 * 1000);
	}

	public addConnection(connection: AuthConnection) {
		this.connections.push(connection);
		this.debug();
	}

	public removeConnection(connection: AuthConnection) {
		for (var i = this.connections.length - 1; i >= 0; i--)
			if (this.connections[i] == connection)
				this.connections.splice(i, 1);
		this.debug();
	}

	public canConnect(ip: string) {
		return this.connections.length < AuthManager.MAX_PENDING
			&& this.connections.filter((c) => c.ip == ip).length < AuthManager.MAX_PENDING_PER_IP;
	}

	//#region === Limits ===

	public canSignUp(ip: string) {
		return this.recent(this.signUps, ip) < AuthManager.SIGN_UPS_PER_IP;
	}

	public signedUp(ip: string) {
		this.note(this.signUps, ip);
	}

	public canTry(ip: string) {
		return this.recent(this.fails, ip) < AuthManager.FAILS_PER_IP;
	}

	public failed(ip: string) {
		this.note(this.fails, ip);
	}

	// one at a time for a player: false if they're signing in already
	public lock(playerId: number) {
		if (this.signingIn.has(playerId)) return false;
		this.signingIn.add(playerId);
		return true;
	}

	public unlock(playerId: number) {
		this.signingIn.delete(playerId);
	}

	// how many in the window (those older dropped)
	private recent(map: Map<string, number[]>, ip: string) {
		const since = Date.now() - AuthManager.WINDOW_MS;
		const times = (map.get(ip) ?? []).filter((t) => t > since);
		if (times.length) map.set(ip, times);
		else map.delete(ip);
		return times.length;
	}

	private note(map: Map<string, number[]>, ip: string) {
		this.recent(map, ip);
		map.set(ip, [...(map.get(ip) ?? []), Date.now()]);
	}

	//#endregion

	private debug() {
		Log.debug("Auth connections", { count: this.connections.length });
	}

}
