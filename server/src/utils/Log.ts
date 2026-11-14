import * as Sentry from "@sentry/node";
import { ENV, ENV_MISSING } from "./Env";

// The server's log. Every line has a time, a level and a message, plus any
// fields given (ids, counts, the error). LOG_FORMAT=json writes one JSON
// object per line, for a log collector to read; otherwise a readable line.
// Errors and fatals also go to Sentry when SENTRY_DSN is set.
//
//   Log.info("Market: listed", { playerId, item, price });
//   Log.error("Couldn't save a node", error, { nodeId });
//   promise.catch(Log.catch("Hero board"));

type Level = "debug" | "info" | "warn" | "error" | "fatal";
type Fields = { [key: string]: unknown };

const LEVELS: Level[] = ["debug", "info", "warn", "error", "fatal"];
const JSON_FORMAT = ENV.LOG_FORMAT == "json";
const MIN_LEVEL = Math.max(0, LEVELS.indexOf((ENV.LOG_LEVEL ?? "info") as Level));

const SENTRY = !!ENV.SENTRY_DSN;
if (SENTRY) {
	Sentry.init({
		dsn: ENV.SENTRY_DSN,
		environment: ENV.SENTRY_ENVIRONMENT || "development",
		release: ENV.SENTRY_RELEASE || undefined,
		// (app.ts handles these itself: reports, saves everyone, then exits)
		integrations: (defaults) => defaults.filter((i) => i.name != "OnUncaughtException" && i.name != "OnUnhandledRejection"),
	});
}

// an error as plain fields: what JSON.stringify would otherwise write as {}
function errorFields(error: unknown): Fields {
	if (error instanceof Error) {
		const e = error as Error & { code?: unknown };
		return { name: e.name, message: e.message, code: e.code, stack: e.stack };
	}
	return { message: String(error) };
}

function write(level: Level, message: string, error?: unknown, fields?: Fields) {
	if (LEVELS.indexOf(level) < MIN_LEVEL) return;
	const out = level == "error" || level == "fatal" ? console.error : console.log;
	if (JSON_FORMAT) {
		const line: Fields = { time: new Date().toISOString(), level, message, ...fields };
		if (error !== undefined) line.error = errorFields(error);
		out(JSON.stringify(line));
	} else {
		const time = new Date().toTimeString().slice(0, 8);
		const extra = fields && Object.keys(fields).length ? " " + JSON.stringify(fields) : "";
		const why = error === undefined ? "" : "\n  " + (error instanceof Error ? error.stack ?? error.message : String(error));
		out(`${time} ${level.toUpperCase().padEnd(5)} ${message}${extra}${why}`);
	}
	if (SENTRY && (level == "error" || level == "fatal")) {
		const context = { level, extra: { message, ...fields } };
		if (error instanceof Error) Sentry.captureException(error, context);
		else Sentry.captureMessage(error === undefined ? message : `${message}: ${String(error)}`, context);
	}
}

export const Log = {
	debug: (message: string, fields?: Fields) => write("debug", message, undefined, fields),
	info: (message: string, fields?: Fields) => write("info", message, undefined, fields),
	warn: (message: string, fields?: Fields) => write("warn", message, undefined, fields),
	error: (message: string, error?: unknown, fields?: Fields) => write("error", message, error, fields),
	fatal: (message: string, error?: unknown, fields?: Fields) => write("fatal", message, error, fields),

	// for a promise's .catch: logged (and reported) as an error under this name
	catch: (message: string, fields?: Fields) => (error: unknown) => write("error", message, error, fields),

	// before exiting: lets Sentry finish sending what's queued
	flush: async (ms = 2000) => {
		if (SENTRY) await Sentry.flush(ms).catch(() => false);
	},
};

if (ENV_MISSING) Log.warn("No server/.env: copy .env.example and fill it in");
