import { IDLE_AFTER_MS } from "../../../shared/Analytics";
import { ComponentType } from "../components/BaseComponent";
import { Event } from "../constants/Events";
import { C2S, S2C } from "../constants/Routes";
import { IBC } from "../Engine";
import { BaseHandler } from "./BaseHandler";

// windows that open by themselves, not by choice: not counted as opened
const UNCHOSEN = new Set([
    ComponentType.MAP, ComponentType.TITLE, ComponentType.GOLD_DISPLAY, ComponentType.CHAT, ComponentType.CHOICE_PROMPT,
    ComponentType.MAIN_MENU, ComponentType.MORE_MENU, ComponentType.AWAY_SUMMARY, ComponentType.GUIDE, ComponentType.BLACKJACK_BUTTON, ComponentType.SLIME_RACE_BUTTON, ComponentType.ITEM_TOASTS,
    ComponentType.SCREEN_FX, ComponentType.LOOT_CHEST, ComponentType.DELIGHT, ComponentType.BOUNTY_BOX,
]);
const CHECK_MS = 10 * 1000;

// where they came from, read as the page loads (before anything tidies the address)
const SOURCE = sourceOf();

export class AnalyticsHandler extends BaseHandler {

    // What's recorded as they play (shared/Analytics.ts; server
    // analytics/Tracker): as they sign in, their device and where they came
    // from; whether they're playing or idle (the tab hidden, or nothing
    // pressed for IDLE_AFTER_MS) as it changes; and each window they open.
    private tracking = false;
    private on = true;
    private lastInput = Date.now();

    //#region === Outgoing ===

    // an editor's snapshot of the game (shared/Analytics.ts; ANALYTICS or ANALYTICS_REFUSED back), staff counted or not
    public get(staff: boolean) {
        this.send({ r: C2S.ANALYTICS_GET, ...(staff ? { s: 1 } : {}) });
    }

    // signed in (TitleHandler): a new session on the server, playing
    public signedIn() {
        this.send({ r: C2S.ANALYTICS_HELLO, d: deviceOf(), s: SOURCE });
        this.on = true;
        this.lastInput = Date.now();
        if (!this.tracking) {
            this.tracking = true;
            const input = () => {
                this.lastInput = Date.now();
                if (!this.on) this.check();
            };
            for (const type of ["pointerdown", "pointermove", "keydown", "wheel", "touchstart"]) window.addEventListener(type, input, { passive: true });
            document.addEventListener("visibilitychange", () => this.check());
            setInterval(() => this.check(), CHECK_MS);
        }
        this.check();
    }

    private check() {
        const on = !document.hidden && Date.now() - this.lastInput < IDLE_AFTER_MS;
        if (on == this.on) return;
        this.on = on;
        this.send({ r: C2S.ANALYTICS_PRESENCE, a: on ? 1 : 0 });
    }

    // a window opened (ComponentManager)
    public opened(type: ComponentType) {
        if (!this.tracking || UNCHOSEN.has(type) || ComponentType[type] == null || IBC.comp.getFirstByType(ComponentType.DEMO_MODE)) return;
        this.send({ r: C2S.ANALYTICS_OPENED, w: ComponentType[type] });
    }

    //#endregion

    //#region === Incoming ===

    public onMessage(message: any) {
        switch (message.r) {
            case S2C.ANALYTICS: IBC.events.emit(Event.ANALYTICS, message.a); break;
            case S2C.ANALYTICS_REFUSED: IBC.events.emit(Event.ANALYTICS_REFUSED, message.w); break;
        }
    }

    //#endregion

}

export function deviceOf() {
    const coarse = window.matchMedia?.("(pointer: coarse)").matches;
    if (!coarse) return "desktop";
    return Math.min(screen.width, screen.height) < 600 ? "phone" : "tablet";
}

// ?utm_source= or ?ref= if the link had one, else the site that linked here, else "direct"
function sourceOf() {
    try {
        const params = new URLSearchParams(location.search);
        const tagged = params.get("utm_source") || params.get("ref");
        if (tagged) return tagged.toLowerCase().slice(0, 32);
        if (document.referrer) {
            const host = new URL(document.referrer).hostname.replace(/^www\./, "");
            if (host && host != location.hostname.replace(/^www\./, "")) return host.slice(0, 32);
        }
    } catch (e) { }
    return "direct";
}
