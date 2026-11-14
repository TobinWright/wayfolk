import type * as SentryModule from "@sentry/browser";

// Errors in players' browsers, sent to Sentry: anything thrown that nothing
// caught, and promises rejected with nothing to handle them (Sentry hooks
// window.onerror and unhandledrejection itself). Off unless the build is given
// SENTRY_DSN (client/webpack.config.js: --env SENTRY_DSN=...).
//
// Sentry is only loaded when the build has a DSN: without one, the check on
// __SENTRY_DSN__ below is always false, so webpack leaves Sentry out of
// bundle.js altogether.
//
// The DSN is public by design (it can only send events, not read them).
// Use a separate Sentry project from the server's, so the two don't mix.
export class ErrorReporting {

    public static ENVIRONMENT = location.hostname == "localhost" ? "development" : "production";
    public static RELEASE = __RELEASE__;      // (the git commit it was built from, unless the build was given RELEASE)

    private static sentry: typeof SentryModule;
    private static player: { id: string, username: string };      // (signed in before Sentry loaded)

    public static init() {
        // (__SENTRY_DSN__ itself, not a copy: webpack can only drop the import when it sees the constant here)
        if (!__SENTRY_DSN__) return;
        import("@sentry/browser").then(Sentry => {
            Sentry.init({
                dsn: __SENTRY_DSN__,
                environment: ErrorReporting.ENVIRONMENT,
                release: ErrorReporting.RELEASE || undefined,
                // (errors only: no performance tracing or session replays)
                tracesSampleRate: 0,
            });
            if (ErrorReporting.player) Sentry.setUser(ErrorReporting.player);
            ErrorReporting.sentry = Sentry;
        });
    }

    // which player hit it, once signed in
    public static setPlayer(id: number, name: string) {
        ErrorReporting.player = { id: String(id), username: name };
        if (ErrorReporting.sentry) ErrorReporting.sentry.setUser(ErrorReporting.player);
    }

    // for errors caught but still worth knowing about
    public static report(error: unknown, context?: { [key: string]: unknown }) {
        console.error(error);
        if (ErrorReporting.sentry) ErrorReporting.sentry.captureException(error, context ? { extra: context } : undefined);
    }

}
