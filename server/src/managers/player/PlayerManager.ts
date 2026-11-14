import { cleanName, nameProblem, RENAME_GAP_MS } from "../../../../shared/Names";
import { IBS } from "../../app";
import { S2C } from "../../constants/Routes";
import { PlayerRecord } from "../database/PlayerRecord";
import { Player } from "./Player";
import { Log } from "../../utils/Log";

// Every player loaded: those signed in, and those signed out whose heroes
// are still working (Player.awayUntil). On starting, those who were about
// within the longest heroes work away are loaded again (load).

export class PlayerManager {

	private players: Player[] = [];
	private leaving = new Map<number, Promise<void>>();     // (player id: their last save, under way)
	private lastRenamed = new Map<number, number>();         // (player id: when they last tried a new name)

	public update() {
		for (var i = 0; i < this.players.length; i++)
			this.players[i].update();
	}

	public add(player: Player) {
		this.players.push(player);
		this.debug();
	}

	public remove(player: Player) {
		for (var i = this.players.length - 1; i >= 0; i--)
			if (this.players[i].id == player.id)
				this.players.splice(i, 1);
		this.debug();
	}

	public getById(id: number) {
		for (var i = 0; i < this.players.length; i++)
			if (this.players[i].id == id)
				return this.players[i];
		return null;
	}

	// once a player who's let go is saved (to change what's saved of them after)
	public settled(id: number) {
		return this.leaving.get(id) ?? Promise.resolve();
	}

	// everyone loaded, signed in or not
	public all() {
		return this.players;
	}

	public online() {
		return this.players.filter((p) => p.online);
	}

	public sendAll(data: any) {
		for (var i = 0; i < this.players.length; i++)
			this.players[i].send(data);
	}

	// a new display name (shared/Names.ts), no one else's: told to them, their
	// friends' lists and the events' givers (the chat's lines said keep the old)
	public async rename(player: Player, name: any) {
		const refuse = (why: string) => player.send({ r: S2C.PLAYER_REFUSED, w: why });
		name = cleanName(name);
		const problem = nameProblem(name);
		if (problem) return refuse(problem);
		if (name == player.record.displayName) return refuse("That's your name already");
		const now = Date.now();
		if (now - (this.lastRenamed.get(player.id) ?? 0) < RENAME_GAP_MS) return refuse("Wait a moment before trying again");
		this.lastRenamed.set(player.id, now);
		if (!(await PlayerRecord.Rename(player.id, name))) return refuse(`Someone's called ${name} already`);
		Log.info(`Renamed: ${player.record.displayName} (${player.id}) to ${name}`);
		player.record.displayName = name;
		player.send({ r: S2C.PLAYER_NAME, n: name });
		IBS.events.renamed(player);
		IBS.market.renamed(player);
		IBS.guilds.renamed(player);
		await IBS.friends.renamed(player);
	}

	// a player loaded from the database, their heroes worked out to now (or
	// as far as they work away) - signing in, or on starting
	public async load(playerId: number) {
		await this.leaving.get(playerId);
		const player = new Player(playerId);
		player.record = await PlayerRecord.Load(playerId);
		player.inventory = await IBS.inventories.retrieve(playerId);
		({ heroes: player.heroes, barracks: player.barracks } = await IBS.heroes.loadAll(playerId, true));
		player.social = await IBS.friends.load(playerId);
		player.away = await IBS.heroes.away.load(playerId);    // (before what's owed is paid, so it's in the summary)
		await IBS.events.payOwed(player);
		await IBS.market.payOwed(player);
		await IBS.guilds.payOwed(player);
		player.awayUntil = new Date(player.record.activeAt).getTime() + IBS.heroes.tasks.awayFor(player);
		await IBS.heroes.tasks.catchUp(player);
		return player;
	}

	// on starting: everyone whose heroes are still working away
	public async loadAway() {
		for (const id of await PlayerRecord.ActiveSince(Date.now() - IBS.heroes.tasks.awayMost())) {
			if (this.getById(id)) continue;
			const player = await this.load(id);
			if (player.awayUntil > Date.now() && player.heroes.length) this.add(player);
		}
		Log.info("Players Away: " + this.players.length);
	}

	// they've gone: saved, their heroes working on till awayUntil (none: gone now)
	public signedOut(player: Player) {
		const now = Date.now();
		player.awayUntil = now + IBS.heroes.tasks.awayFor(player);
		IBS.heroes.away.take(player);
		PlayerRecord.Touch([player.id], now).catch(Log.catch("Couldn't save last seen", { playerId: player.id }));
		if (!player.heroes.length) this.letGo(player);
		else {
			IBS.heroes.tasks.save(player).catch(Log.catch("Couldn't save a player's heroes", { playerId: player.id }));
			IBS.friends.presence(player);
			IBS.guilds.presence(player);
		}
		this.debug();
	}

	// signed out and their heroes done working: saved and let go
	public letGo(player: Player) {
		this.remove(player);
		if (!player.online) { IBS.friends.presence(player); IBS.guilds.presence(player); }
		const saved = IBS.heroes.tasks.save(player).catch(Log.catch("Couldn't save a player's heroes", { playerId: player.id }))
			.then(() => { if (this.leaving.get(player.id) == saved) this.leaving.delete(player.id); });
		this.leaving.set(player.id, saved);
	}

	// their account's being deleted (AccountManager): let go with nothing saved
	public drop(player: Player) {
		this.remove(player);
		this.lastRenamed.delete(player.id);
		IBS.analytics.track.drop(player.id);
	}

	// The server's stopping (Engine.shutdown): everyone signed in closed and
	// given an away summary, then everyone loaded saved as signing out would
	// (their heroes work away from now when it starts again), and the saves of
	// those already leaving waited for.
	public async shutdown() {
		const online = this.online();
		for (const player of online) {
			player.closeForShutdown();
			IBS.heroes.away.take(player);
		}
		if (online.length) await PlayerRecord.Touch(online.map((p) => p.id), Date.now());
		for (const player of this.players.slice()) {
			try {
				await IBS.heroes.tasks.save(player);
			} catch (e) {
				Log.error("Shutdown: couldn't save a player", e, { playerId: player.id });
			}
		}
		await Promise.all(this.leaving.values());
		Log.info(`Shutdown: saved ${this.players.length} players (${online.length} signed in)`);
	}

	private debug() {
		Log.info(`Players Online: ${this.online().length} (loaded ${this.players.length})`);
	}

}
