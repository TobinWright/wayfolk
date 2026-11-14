import { Log } from "./Log";

// A part of the game loop that throws is skipped, and the loop goes on
// without it: one broken hero or manager mustn't stop the game for everyone
// (a throw nothing caught saves everyone and restarts the server, app.ts,
// where it would only throw again on the same state). Logged (and reported)
// once an hour at most for each key, not every tick it goes on throwing.
//
//   guard.run(hero.id, () => this.advance(player, hero, deltaTime), { playerId });

export class Guard {

	public static QUIET_MS = 60 * 60 * 1000;

	private logged = new Map<string, number>();     // key: when it was last logged

	constructor(private what: string) { }

	// fn run: false if it threw
	public run(key: string | number, fn: () => void, fields?: { [key: string]: unknown }) {
		try {
			fn();
			return true;
		} catch (e) {
			const now = Date.now();
			const k = String(key);
			if (now - (this.logged.get(k) ?? -Infinity) >= Guard.QUIET_MS) {
				this.logged.set(k, now);
				Log.error(`${this.what} threw: skipped`, e, { key, ...fields });
			}
			return false;
		}
	}

}
