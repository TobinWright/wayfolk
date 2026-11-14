import { ACCOUNT_BANNED } from "../../../shared/Admin";
import { OLD_CLIENT } from "../../../shared/Protocol";
import { Constants } from "../constants/Constants";
import { DomLayer, el, session } from "../shared/dom/Dom";

// The connection's gone (NetworkManager): a panel over everything saying so,
// trying again by itself - sooner at first, then every MOST_MS at most - till
// the server answers, then the page loaded again, signing back in (the
// "remember me" token, or this tab's session: Title.start). Closed by the
// server restarting (SERVER_RESTARTING, server Engine.shutdown) it says
// that; still down after DOWN_MS it says it's down for maintenance. Signed
// in somewhere else (SIGNED_IN_ELSEWHERE) it doesn't try: it offers to play here.
// The server on another version of the messages (OLD_CLIENT, shared/Protocol.ts:
// it was updated) - the page loaded again once, by itself, to get the new
// game and sign back in; still not matching after that (an old copy kept by
// the browser), a panel asking them to refresh, rather than every message
// read wrong.

export class Reconnect {

    public static SIGNED_IN_ELSEWHERE = 4001;   // (the server's close codes: server Player)
    public static SERVER_RESTARTING = 4002;
    public static ACCOUNT_DELETED = 4003;       // (PLAYER_DELETED says so first: network/PlayerHandler)
    public static OLD_CLIENT = OLD_CLIENT;      // 4004
    public static ACCOUNT_BANNED = ACCOUNT_BANNED;  // 4005 (signing back in says why: Title)

    public static FIRST_MS = 1000;
    public static MOST_MS = 30 * 1000;
    public static DOWN_MS = 45 * 1000;          // (not back after this long: "down for maintenance")

    private layer: DomLayer = null;
    private tries = 0;
    private since = 0;                          // (when it was lost)
    private restarting = false;                 // (the server said it was restarting)
    private newVersion = false;                 // (showing "a new version is out": nothing else drawn over it)
    private everConnected = false;
    private nextAt = 0;                         // (when it tries again: 0, trying now)
    private timer: number = null;
    private probe: WebSocket = null;

    constructor() {
        window.addEventListener("online", () => { if (this.layer && !this.probe) this.tryNow(); });
    }

    // the connection closed: why (its close code), and whether it had been open
    public lost(code: number, wasConnected: boolean) {
        if (this.layer) return;
        if (code == Reconnect.ACCOUNT_DELETED) return location.reload();       // (nothing to reconnect to)
        if (code == Reconnect.ACCOUNT_BANNED) {
            session.set(Constants.SS_RESUME, "1");
            return location.reload();
        }
        if (code == Reconnect.OLD_CLIENT && this.reloadForVersion()) return;
        this.layer = new DomLayer(true);
        this.layer.root.classList.add("connection-layer");
        if (code == Reconnect.SIGNED_IN_ELSEWHERE) return this.showElsewhere();
        if (code == Reconnect.OLD_CLIENT) return this.showNewVersion();
        this.restarting = code == Reconnect.SERVER_RESTARTING;
        this.everConnected = wasConnected;
        this.since = Date.now();
        window.setInterval(() => this.render(), 1000);     // (the countdown; gone with the page)
        // (restarting: it takes a moment to be back)
        this.wait(this.restarting ? 2000 : wasConnected ? 500 : Reconnect.FIRST_MS);
    }

    // another go in a while (longer each time, a little random so everyone's don't all land at once)
    private wait(ms: number) {
        this.nextAt = Date.now() + ms;
        this.timer = window.setTimeout(() => this.tryNow(), ms);
        this.render();
    }

    private nextWait() {
        const ms = Math.min(Reconnect.MOST_MS, Reconnect.FIRST_MS * 2 ** this.tries);
        return Math.round(ms * (0.75 + Math.random() * 0.5));
    }

    // A connection to see if it's back: it is once the server says something
    // (it greets each new one), and then the page loads again and signs in.
    private tryNow() {
        window.clearTimeout(this.timer);
        if (this.probe) return;
        this.nextAt = 0;
        this.render();
        const probe = this.probe = new WebSocket(Constants.SERVER_ADDRESS);
        probe.onmessage = () => {
            probe.onclose = probe.onmessage = null;
            probe.close();
            session.set(Constants.SS_RESUME, "1");
            location.reload();
        };
        probe.onclose = (e: CloseEvent) => {
            this.probe = null;
            if (e.code == Reconnect.OLD_CLIENT) { if (!this.reloadForVersion()) this.showNewVersion(); return; }
            this.tries++;
            this.wait(this.nextWait());
        };
    }

    // The server's on a new version: loaded again to get it, signing back in -
    // once (false: it was already, and the browser must still have the old one)
    public reloadForVersion() {
        if (session.get(Constants.SS_VERSION_RELOAD)) return false;
        session.set(Constants.SS_VERSION_RELOAD, "1");
        session.set(Constants.SS_RESUME, "1");
        location.reload();
        return true;
    }

    // (the server spoke to us: we're on its version, so a later mismatch may reload again)
    public static matched() {
        session.remove(Constants.SS_VERSION_RELOAD);
    }

    //#region panels

    private render() {
        if (!this.layer || this.newVersion) return;
        const down = Date.now() - this.since >= Reconnect.DOWN_MS;
        const title = !navigator.onLine ? "You're offline"
            : down ? "The server is down for maintenance"
                : this.restarting ? "The server is restarting"
                    : this.everConnected ? "Connection lost" : "Can't reach the server";
        const text = !navigator.onLine ? "Check your internet connection. We'll reconnect as soon as it's back."
            : down ? "It should be back soon. Leave this tab open and we'll sign you back in when it is - your heroes keep working meanwhile."
                : this.restarting ? "We're updating the game. You'll be signed back in in a moment."
                    : "Reconnecting you...";
        const secs = Math.ceil((this.nextAt - Date.now()) / 1000);
        const status = this.nextAt == 0 || secs <= 0 ? "Reconnecting..." : `Trying again in ${secs}s`;
        this.layer.show(
            el("h2", { cls: "dom-title", text: title }),
            el("p", { cls: "dom-text", text }),
            el("p", { cls: "dom-hint", text: status, attrs: { role: "status" } }),
            el("div", { cls: "dom-buttons is-center" },
                el("button", {
                    cls: "dom-button is-primary", type: "button", text: "Try now", disabled: this.nextAt == 0,
                    on: { click: () => this.tryNow() },
                })),
        );
    }

    // (no trying: nothing will match till the page is the new one)
    private showNewVersion() {
        window.clearTimeout(this.timer);
        this.newVersion = true;
        this.layer.show(
            el("h2", { cls: "dom-title", text: "A new version is out" }),
            el("p", { cls: "dom-text", text: "The game was updated. Refresh the page to play the new version - your heroes kept working meanwhile." }),
            el("p", { cls: "dom-hint", text: "If this keeps coming back, do a hard refresh (Ctrl+Shift+R, or Cmd+Shift+R on a Mac)." }),
            el("div", { cls: "dom-buttons is-center" },
                el("button", {
                    cls: "dom-button is-primary", type: "button", text: "Refresh",
                    on: { click: () => { session.remove(Constants.SS_VERSION_RELOAD); session.set(Constants.SS_RESUME, "1"); location.reload(); } },
                })),
        );
    }

    // (no trying: that'd take it back from the other one, which would try back)
    private showElsewhere() {
        this.layer.show(
            el("h2", { cls: "dom-title", text: "Signed in somewhere else" }),
            el("p", { cls: "dom-text", text: "You signed in on another tab or device, so this one was signed out." }),
            el("div", { cls: "dom-buttons is-center" },
                el("button", {
                    cls: "dom-button is-primary", type: "button", text: "Play here",
                    on: { click: () => { session.set(Constants.SS_RESUME, "1"); location.reload(); } },
                })),
        );
    }

    //#endregion

}
