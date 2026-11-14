import { Constants } from "../constants/Constants";
import { Event } from "../constants/Events";
import { C2S, S2C } from "../constants/Routes";
import { IBC } from "../Engine";
import { DomLayer, el, session, store } from "../shared/dom/Dom";
import { BaseHandler } from "./BaseHandler";

export class PlayerHandler extends BaseHandler {

    //#region === Outgoing ===

    // a new display name (shared/Names.ts; PLAYER_NAME or PLAYER_REFUSED back)
    public rename(n: string) {
        this.send({ r: C2S.PLAYER_RENAME, n });
    }

    // a first step done in the client (shared/Guide.ts StepDef.seen; PLAYER_GUIDE back if the server agrees)
    public guideSeen(s: number) {
        this.send({ r: C2S.PLAYER_GUIDE_SEEN, s });
    }

    // a guest's account saved with an email and password (PLAYER_ACCOUNT_SAVED or PLAYER_SAVE_REFUSED back)
    public saveWithEmail(email: string, password: string) {
        this.send({ r: C2S.PLAYER_SAVE_ACCOUNT, t: "email", l: email, p: password });
    }

    // ...or with Google (the ID token from Google's button)
    public saveWithGoogle(tok: string) {
        this.send({ r: C2S.PLAYER_SAVE_ACCOUNT, t: "google", tok });
    }

    // back to the title screen, this browser no longer remembered
    public signOut() {
        this.send({ r: C2S.PLAYER_SIGN_OUT, tok: store.get(Constants.LS_REMEMBER) ?? "", st: session.get(Constants.SS_SESSION) ?? "" });
    }

    // your email's confirm link sent again
    public resendConfirm() {
        this.send({ r: C2S.PLAYER_RESEND_CONFIRM });
    }

    // a copy of everything kept about you (PLAYER_EXPORT back: saved as a file)
    public exportData() {
        this.send({ r: C2S.PLAYER_EXPORT });
    }

    // your account erased (an email account's password with it; PLAYER_DELETED or PLAYER_DELETE_REFUSED back)
    public deleteAccount(password: string) {
        this.send({ r: C2S.PLAYER_DELETE, c: "DELETE", p: password });
    }

    // someone's profile, by their name (shared/Profile.ts; PLAYER_PROFILE or PLAYER_PROFILE_REFUSED back)
    public profile(name: string) {
        this.send({ r: C2S.PLAYER_PROFILE, n: name });
    }

    // yours: what you wrote about yourself, and whether it's private (PLAYER_PROFILE or PLAYER_PROFILE_REFUSED back)
    public setProfile(about: string, hidden: boolean) {
        this.send({ r: C2S.PLAYER_PROFILE_SET, a: about, v: hidden ? 1 : 0 });
    }

    //#endregion

    //#region === Incoming ===

    // the loot chest up now opened (PLAYER_CHEST_OPENED back)
    public openChest(i: number, beaten = false) {
        this.send({ r: C2S.PLAYER_CHEST_OPEN, i, ...(beaten ? { b: 1 } : {}) });
    }

    // an achievement done, as seen here (PLAYER_ACHIEVED back the first time)
    public achieve(a: string) {
        this.send({ r: C2S.PLAYER_ACHIEVE, a });
    }

    public onMessage(message: any) {
        switch (message.r) {
            case S2C.PLAYER_NAME:
                IBC.data.player.name = message.n;
                IBC.events.emit(Event.PLAYER_NAME);
                break;
            case S2C.PLAYER_GUIDE:
                IBC.data.player.guide = message.d;
                IBC.data.player.guideAt = message.a ?? [];
                IBC.events.emit(Event.GUIDE, message.s);
                break;
            case S2C.PLAYER_CHEST:
                IBC.data.player.chest = message.i ? { i: message.i, t: message.t, until: performance.now() + (message.e ?? 0), d: message.d } : null;
                IBC.events.emit(Event.CHEST);
                break;
            case S2C.PLAYER_DAILY:
                IBC.data.player.daily = { s: message.s ?? 0, t: message.t ?? 0 };
                IBC.events.emit(Event.DAILY);
                break;
            case S2C.PLAYER_CHEST_MIMIC: IBC.events.emit(Event.CHEST_MIMIC, { i: message.i, n: message.n, e: message.e }); break;
            case S2C.PLAYER_ACHIEVEMENTS:
                IBC.data.player.achievements = new Map((message.l ?? []).map(([a, t]: [string, number]) => [a, t]));
                IBC.events.emit(Event.ACHIEVEMENTS);
                break;
            case S2C.PLAYER_ACHIEVED:
                IBC.data.player.achievements.set(message.a, message.t);
                IBC.events.emit(Event.ACHIEVED, message.a);
                break;
            case S2C.PLAYER_BOUNTY:
                IBC.data.player.bounty = message.b ? { m: message.b.m, n: message.b.n, d: message.b.d, until: performance.now() + message.b.e, w: message.b.w } : null;
                IBC.events.emit(Event.BOUNTY);
                break;
            case S2C.PLAYER_CHEST_OPENED:
                if (IBC.data.player.chest?.i == message.i) IBC.data.player.chest = null;
                IBC.events.emit(Event.CHEST_OPENED, message.l);
                break;
            case S2C.PLAYER_REFUSED: IBC.events.emit(Event.PLAYER_REFUSED, message.w); break;
            case S2C.PLAYER_ACCOUNT_SAVED: this.accountSaved(message); break;
            case S2C.PLAYER_SAVE_REFUSED: IBC.events.emit(Event.PLAYER_SAVE_REFUSED, message.e); break;
            case S2C.PLAYER_CONFIRM_SENT: IBC.events.emit(Event.PLAYER_CONFIRM_SENT, message.e); break;
            case S2C.PLAYER_SIGNED_OUT:
                store.remove(Constants.LS_REMEMBER);
                session.remove(Constants.SS_SESSION);
                IBC.net.leaving = true;
                location.reload();
                break;
            case S2C.PLAYER_EXPORT: this.saveExport(message.d); break;
            case S2C.PLAYER_DELETED: this.deleted(); break;
            case S2C.PLAYER_DELETE_REFUSED: IBC.events.emit(Event.PLAYER_DELETE_REFUSED, message.w); break;
            case S2C.PLAYER_PROFILE: IBC.events.emit(Event.PLAYER_PROFILE, message.p); break;
            case S2C.PLAYER_PROFILE_REFUSED: IBC.events.emit(Event.PLAYER_PROFILE_REFUSED, message.w); break;
        }
    }

    // your data, saved by the browser as a JSON file
    private saveExport(data: any) {
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const day = new Date().toISOString().slice(0, 10);
        const a = el("a", { attrs: { href: url, download: `wayfolk-data-${day}.json` } });
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 60 * 1000);
        IBC.events.emit(Event.PLAYER_EXPORTED);
    }

    // your account's gone: nothing of it left in this browser, and the
    // connection's closing (not "lost": nothing to reconnect to)
    private deleted() {
        for (const key of [Constants.LS_REMEMBER, Constants.LS_GUEST_LOGIN, Constants.LS_GUEST_PASSWORD, Constants.LS_EMAIL]) store.remove(key);
        session.remove(Constants.SS_SESSION);
        session.remove(Constants.SS_RESUME);
        IBC.net.leaving = true;
        IBC.events.emit(Event.PLAYER_DELETED);
        const layer = new DomLayer(true);
        layer.root.classList.add("connection-layer");
        layer.show(
            el("h2", { cls: "dom-title", text: "Your account is deleted" }),
            el("p", { cls: "dom-text", text: "Everything in it has been erased. Thanks for playing." }),
            el("div", { cls: "dom-buttons is-center" },
                el("button", { cls: "dom-button is-primary", type: "button", text: "Back to the start", on: { click: () => location.reload() } })),
        );
    }

    // the guest login's no use now (the account signs in with the email or
    // Google), and this browser's remembered for the account instead
    private accountSaved(message: any) {
        const guide = IBC.data.player.guide;
        IBC.data.player.load(message.player);
        IBC.data.player.guide = guide;
        store.remove(Constants.LS_GUEST_LOGIN);
        store.remove(Constants.LS_GUEST_PASSWORD);
        if (message.rt) store.set(Constants.LS_REMEMBER, message.rt);
        IBC.data.chat.note(IBC.data.player.type == "google"
            ? "Your account is saved - sign in with Google on any device"
            : `Your account is saved - sign in with ${IBC.data.player.email} on any device. We've emailed you a link to confirm it.`);
        IBC.events.emit(Event.PLAYER_ACCOUNT_SAVED);
    }

    //#endregion

}
