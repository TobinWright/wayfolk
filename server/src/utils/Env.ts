import { readFileSync } from "fs";

// The server's settings, from server/.env (copy .env.example; never committed),
// or the file ENV_FILE names (the integration tests' server, test/integration)
export const ENV: { [key: string]: string } = {};
export let ENV_MISSING = false;		// (Log says so once it's set up)
try {
	for (const line of readFileSync(process.env.ENV_FILE || ".env", "utf8").split(/\r?\n/)) {
		const m = /^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/.exec(line);
		if (m) ENV[m[1]] = m[2];
	}
} catch (e) {
	ENV_MISSING = true;
}
