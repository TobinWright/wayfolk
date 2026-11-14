import { createPool } from "mysql2";
import { Pool, PoolConnection } from "mysql2/promise";
import { ENV } from "../../utils/Env";
import { Log } from "../../utils/Log";

export class DatabaseManager {

	private HOST = ENV.DB_HOST ?? "localhost";
	private PORT = parseInt(ENV.DB_PORT ?? "3306", 10);
	private USER = ENV.DB_USER;
	private PASS = ENV.DB_PASS;
	private DB = ENV.DB_DATABASE ?? "game_wayfolk";

	private pool: Pool;
	private busy = 0;		// (connections asked for and not yet released: work under way)

	constructor() {
		this.pool = createPool({
			connectionLimit: 10,
			host: this.HOST,
			port: this.PORT,
			user: this.USER,
			password: this.PASS,
			database: this.DB
		}).promise();
	}

	// a pooled connection, counted as busy till it's released
	public async getConnection(): Promise<PoolConnection> {
		this.busy++;
		let conn: PoolConnection;
		try {
			conn = await this.pool.getConnection();
		} catch (e) {
			this.busy--;
			throw e;
		}
		const release = conn.release.bind(conn);
		let released = false;
		conn.release = () => {
			if (!released) { released = true; this.busy--; }
			release();
		};
		return conn;
	}

	// Shutting down: resolves once no connection has been in use for QUIET_MS
	// (so work that takes a few in a row - a market buy, a guild change -
	// finishes), or after maxMs whatever's still going.
	public async idle(maxMs: number) {
		const QUIET_MS = 250, STEP_MS = 25;
		const until = Date.now() + maxMs;
		let quiet = 0;
		while (quiet < QUIET_MS && Date.now() < until) {
			await new Promise((resolve) => setTimeout(resolve, STEP_MS));
			quiet = this.busy ? 0 : quiet + STEP_MS;
		}
		if (this.busy) Log.warn(`Shutdown: database connections still busy after ${maxMs}ms`, { busy: this.busy });
	}

	// for the health check: resolves if the database answers within ms
	public async ping(ms: number) {
		let timer: NodeJS.Timeout;
		const timeout = new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`no answer in ${ms}ms`)), ms); });
		try {
			await Promise.race([this.pool.query("SELECT 1"), timeout]);
		} finally {
			clearTimeout(timer);
		}
	}

	public async end() {
		await this.pool.end();
	}

}
