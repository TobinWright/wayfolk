import { Constants } from "../constants/Constants";
import { Event } from "../constants/Events";
import { C2S, S2C } from "../constants/Routes";
import { IBC } from "../Engine";
import { session, store } from "../shared/dom/Dom";
import { GoogleButton } from "../shared/dom/GoogleButton";
import { ErrorReporting } from "../utils/ErrorReporting";
import { BaseHandler } from "./BaseHandler";

// Signing in, before you're in (server AuthConnection): as a guest (this
// browser's login, kept in localStorage), with an email and password, with
// Google, with this browser's "remember me" token, or with a password reset
// link; making a new guest or email account; reset and confirm links.
export class TitleHandler extends BaseHandler {

    public notes: string[] = [];        // (for the chat once you're in: the server's notice, a confirm link's news)

    //#region === Outgoing ===

    // { t: "guest", l, p } / "email" { l, p, rm } / "google" { tok } / "token" { tok } / "reset" { tok, p, rm }
    public signIn(type: string, fields: any) {
        if (this.isBusy()) return;
        this.addTransaction(C2S.TITLE_SIGN_IN);
        this.send({ r: C2S.TITLE_SIGN_IN, t: type, ...fields });
    }

    // a new account: { t: "guest" } or { t: "email", l, p, rm }
    public signUp(type: string, fields: any = {}) {
        if (this.isBusy()) return;
        this.addTransaction(C2S.TITLE_SIGN_UP);
        this.send({ r: C2S.TITLE_SIGN_UP, t: type, ...fields });
    }

    // this browser's guest account, or a new one the first time
    public guest() {
        const login = store.get(Constants.LS_GUEST_LOGIN);
        const password = store.get(Constants.LS_GUEST_PASSWORD);
        if (!login || !password) this.signUp("guest");
        else this.signIn("guest", { l: login, p: password });
    }

    public forgotPassword(email: string) {
        this.send({ r: C2S.TITLE_FORGOT_PASSWORD, l: email });
    }

    public confirmEmail(tok: string) {
        this.send({ r: C2S.TITLE_CONFIRM_EMAIL, tok });
    }

    //#endregion

    //#region === Incoming ===

    public onMessage(message: any) {
        switch (message.r) {
            case S2C.TITLE_AUTH_OPTIONS:
                GoogleButton.clientId = typeof message.g == "string" ? message.g : null;
                IBC.events.emit(Event.TITLE_AUTH_OPTIONS);
                break;
            case S2C.TITLE_GUEST_CREDENTIALS: this.guestCredentials(message); break;
            case S2C.TITLE_SIGNED_IN: this.signedIn(message); break;
            case S2C.TITLE_REFUSED: this.refused(message); break;
            case S2C.TITLE_FORGOT_SENT: IBC.events.emit(Event.TITLE_FORGOT_SENT); break;
            case S2C.TITLE_EMAIL_CONFIRMED: IBC.events.emit(Event.TITLE_EMAIL_CONFIRMED, message.e); break;
        }
    }

    private refused(message: any) {
        this.removeTransaction(C2S.TITLE_SIGN_IN);
        this.removeTransaction(C2S.TITLE_SIGN_UP);
        // a login this browser keeps that doesn't work any more: forgotten
        if (message.w == "guest") {
            store.remove(Constants.LS_GUEST_LOGIN);
            store.remove(Constants.LS_GUEST_PASSWORD);
        }
        if (message.w == "token") store.remove(Constants.LS_REMEMBER);
        if (message.w == "session") session.remove(Constants.SS_SESSION);
        IBC.events.emit(Event.TITLE_REFUSED, { why: message.w, text: message.e ?? "Couldn't sign in. Try again." });
    }

    private guestCredentials(message: any) {
        store.set(Constants.LS_GUEST_LOGIN, message.l);
        store.set(Constants.LS_GUEST_PASSWORD, message.p);
    }

    private signedIn(message: any) {
        this.removeTransaction(C2S.TITLE_SIGN_IN);
        this.removeTransaction(C2S.TITLE_SIGN_UP);
        if (message.rt) store.set(Constants.LS_REMEMBER, message.rt);
        if (message.st) session.set(Constants.SS_SESSION, message.st);
        if (message.n) this.notes.push(message.n);

        // load data
        IBC.data.player.load(message.player);
        ErrorReporting.setPlayer(IBC.data.player.id, IBC.data.player.name);
        IBC.data.player.guide = message.guide ?? 0;
        IBC.data.player.guideAt = message.guideAt ?? [];
        IBC.data.heroes.load(message.heroes, message.nodes, message.barracks);
        IBC.data.chat.load(message.chat);
        IBC.data.events.load(message.events);
        IBC.data.events.loadTowns(message.towns);
        IBC.data.sights.load(message.sights);
        IBC.data.friends.load(message.friends, message.whispers, message.friendHeroes);
        IBC.data.guilds.load(message.guild);
        const invites = IBC.data.guilds.state.i.length;
        if (invites) IBC.data.chat.note(`${invites == 1 ? "A guild has" : `${invites} guilds have`} invited you to join (Guild, in the menu)`);
        for (const note of this.notes.splice(0)) IBC.data.chat.note(note);
        IBC.data.inventory.load(message.inventory);
        IBC.net.analytics.signedIn();

        IBC.events.emit(Event.TITLE_SIGNED_IN);
        IBC.events.emit(Event.INVENTORY_GOLD_UPDATED);
    }

    //#endregion

}
