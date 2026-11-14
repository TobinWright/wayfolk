import * as PIXI from "pixi.js";
import { Constants, Role } from "../../constants/Constants";
import { Event } from "../../constants/Events";
import { IBC } from "../../Engine";
import { DomLayer, el, session, store } from "../../shared/dom/Dom";
import { GoogleButton } from "../../shared/dom/GoogleButton";
import { legalLinks } from "../../shared/Legal";
import { BaseComponent, ComponentType } from "../BaseComponent";
import { GuideBox } from "../guide/GuideBox";
import { HeroWindow } from "../herowindow/HeroWindow";
import { checkbox, field, passwordProblem } from "./AuthFields";

// The title screen (the user, 2026-10-29: sign-in from console8's): the logo
// over the world map, and under it a panel (HTML: shared/dom/Dom.ts) to
// play as a guest (this browser's, or a new one), sign in with Google, or
// sign in or make an account with an email and password - with Forgot
// password, the reset link's Choose a new password (?reset=), and the
// confirm link's (?confirm=). A browser that's remembered signs straight in
// (LS_REMEMBER). A guest saves theirs as an email or Google account in
// Settings (settings/SaveAccount), keeping everything.

// The game's version (alpha until release) and the day it was last changed
// (DD/MM/YY), in the bottom left (the user, 2026-10-31: like console8's). The
// last number goes up with every change players can see, the middle one (the
// last back to 0) with a big feature - a new system or window. Worked out from
// the work so far: 56 big features since the revival, 2 changes since the last.
export const VERSION = "v0.71.3 ALPHA [12/11/26]";

type Mode = "buttons" | "email" | "forgot" | "reset" | "waiting";

// the links in emails open the client with ?reset=<token> or ?confirm=<token> (server auth/Mailer)
const params = new URLSearchParams(location.search);
let resetToken = params.get("reset");
let confirmToken = params.get("confirm");

export class Title extends BaseComponent {

    public static LOGO_MARGIN = 16;     // (screen px either side, on a narrow screen)

    public logo: PIXI.Sprite;
    private layer: DomLayer;
    private version: HTMLElement;
    private google: GoogleButton = null;

    private mode: Mode = "buttons";
    private from: Mode = "buttons";     // (the panel the try in progress came from: back to it if it's refused)
    private waitingFor = "";            // (what "waiting" says)
    private creating = false;           // (the email form: making an account, not signing in)
    private error = "";                 // (shown in the panel till the next try)
    private info = "";                  // (good news shown in it: a confirm link worked)
    private forgotSent = false;
    private signingUp = false;          // (a new email account: told about its confirm link once in)

    constructor() {
        super(ComponentType.TITLE);

        this.create();
        this.resize();
        this.start();
    }

    public create() {
        super.create();

        this.logo = PIXI.Sprite.from(PIXI.Assets.get("title-logo"));
        this.logo.anchor.set(0.5);
        this.container.addChild(this.logo);

        this.layer = new DomLayer(false);
        this.layer.root.classList.add("title-layer");
        this.version = el("p", { cls: "title-version", text: VERSION });
        document.body.appendChild(this.version);

        IBC.events.register(Event.TITLE_SIGNED_IN, this.title_signedIn, this);
        IBC.events.register(Event.TITLE_REFUSED, (r: { why: string, text: string }) => this.title_refused(r.why, r.text), this);
        IBC.events.register(Event.TITLE_AUTH_OPTIONS, () => { if (this.mode == "buttons") this.render(); }, this);
        IBC.events.register(Event.TITLE_FORGOT_SENT, () => { this.forgotSent = true; if (this.mode == "forgot") this.render(); }, this);
        IBC.events.register(Event.TITLE_EMAIL_CONFIRMED, (email: string) => this.title_confirmed(email), this);
    }

    public destroy() {
        super.destroy();
        this.google?.destroy();
        this.layer.destroy();
        this.version.remove();
        IBC.events.unregisterAll(this);
    }

    // the logo's middle a third of the way down, the panel's two thirds (the
    // user, 2026-10-29), neither off the top nor the panel over the logo
    public resize() {
        const w = window.innerWidth, h = window.innerHeight;
        const texture = this.logo.texture;
        // (as big as it is, smaller on a narrow screen or a short one)
        const scale = Math.min(1, (w - Title.LOGO_MARGIN * 2) / texture.width, h * 0.3 / texture.height);
        this.logo.scale.set(scale);
        const logoH = texture.height * scale;
        const logoY = Math.max(12 + logoH / 2, h / 3);
        this.logo.position.set(Math.round(w / 2), Math.round(logoY));
        const panelH = this.layer.panel.offsetHeight;
        this.layer.root.style.paddingTop = Math.round(Math.max(logoY + logoH / 2 + 12, h * 2 / 3 - panelH / 2)) + "px";
    }

    // what shows first: a link from an email, this browser signing straight in, or the buttons
    private start() {
        if (confirmToken) {
            this.wait("Confirming your email...");
            IBC.net.title.confirmEmail(confirmToken);
            confirmToken = null;
            this.forgetLink();
            return;
        }
        if (resetToken) return this.show("reset");
        const resuming = !!session.get(Constants.SS_RESUME);
        session.remove(Constants.SS_RESUME);
        this.signInRemembered() || (resuming && this.signInSession()) || this.show("buttons");
    }

    // loaded again after the connection dropped (network/Reconnect), not
    // remembered: back in with this tab's session (whether it had one)
    private signInSession() {
        const tok = session.get(Constants.SS_SESSION);
        if (!tok) return false;
        this.wait("Signing back in...");
        IBC.net.title.signIn("session", { tok });
        return true;
    }

    // this browser's remembered: signing straight in (whether it was)
    private signInRemembered() {
        const remembered = store.get(Constants.LS_REMEMBER);
        if (!remembered) return false;
        this.wait("Signing in...");
        IBC.net.title.signIn("token", { tok: remembered });
        return true;
    }

    private show(mode: Mode) {
        this.mode = mode;
        this.error = "";
        this.forgotSent = false;
        this.render();
    }

    // a try sent: what's said meanwhile (and where it came from, for if it's refused)
    private wait(text: string) {
        if (this.mode != "waiting") this.from = this.mode;
        this.mode = "waiting";
        this.waitingFor = text;
        this.render();
    }

    // (a link's used up either way: off the address bar, so a reload doesn't use it again)
    private forgetLink() {
        if (location.search) history.replaceState(null, "", location.pathname);
    }

    //#region panels

    private render() {
        this.google?.destroy();
        this.google = null;
        switch (this.mode) {
            case "waiting": this.layer.show(el("p", { cls: "dom-text is-center", text: this.waitingFor })); break;
            case "buttons": this.layer.show(...this.buttons()); break;
            case "email": this.layer.show(this.emailForm()); break;
            case "forgot": this.layer.show(this.forgotForm()); break;
            case "reset": this.layer.show(this.resetForm()); break;
        }
        this.resize();      // (the panel's height changed: two thirds down again)
    }

    private messages() {
        return [
            this.info && el("p", { cls: "dom-info", text: this.info, attrs: { role: "status" } }),
            this.error && el("p", { cls: "dom-error", text: this.error, attrs: { role: "alert" } }),
        ];
    }

    // play as a guest, Google, or email
    private buttons() {
        const returning = !!store.get(Constants.LS_GUEST_LOGIN);
        const choices: HTMLElement[] = [
            el("button", { cls: "dom-choice", type: "button", text: "Email", on: { click: () => { this.info = ""; this.show("email"); } } }),
            el("button", {
                cls: "dom-choice", type: "button", text: returning ? "Continue as guest" : "Play as guest",
                on: { click: () => { this.clearMessages(); this.wait("Signing in..."); IBC.net.title.guest(); } },
            }),
        ];
        if (GoogleButton.clientId) {
            this.google = new GoogleButton((token) => {
                this.clearMessages();
                this.wait("Signing in...");
                IBC.net.title.signIn("google", { tok: token });
            }, "signin_with", 296);
            choices.push(this.google.element);
        }
        return [
            el("div", { cls: "dom-choices" }, ...choices),
            ...this.messages(),
            // (playing is agreeing to them; the browser storage is in the privacy policy)
            legalLinks(),
        ];
    }

    // sign in, or make a brand-new account
    private emailForm() {
        const email = field("Email", "email", "email", store.get(Constants.LS_EMAIL) ?? "", true);
        const password = field("Password", "password", this.creating ? "new-password" : "current-password");
        const again = field("Again", "password", "new-password");
        const remember = checkbox("Remember me", true);
        const tab = (label: string, create: boolean) => el("button", {
            cls: "dom-tab" + (this.creating == create ? " is-current" : ""), type: "button", text: label,
            on: { click: () => { if (this.creating != create) { this.creating = create; this.show("email"); } } },
        });
        return el("form", {
            cls: "dom-form", attrs: { novalidate: "" }, on: {
                submit: (e: SubmitEvent) => {
                    e.preventDefault();
                    const address = email.input.value.trim();
                    if (!address || !password.input.value) return this.fail("Enter your email and password");
                    if (this.creating) {
                        const problem = passwordProblem(password.input.value, again.input.value);
                        if (problem) return this.fail(problem);
                    }
                    store.set(Constants.LS_EMAIL, address);
                    this.clearMessages();
                    this.signingUp = this.creating;
                    const fields = { l: address, p: password.input.value, rm: remember.input.checked ? 1 : 0 };
                    this.wait(this.creating ? "Making your account..." : "Signing in...");
                    if (this.creating) IBC.net.title.signUp("email", fields);
                    else IBC.net.title.signIn("email", fields);
                }
            }
        },
            el("div", { cls: "dom-tabs" }, tab("Sign in", false), tab("New account", true)),
            email.label, password.label, this.creating && again.label,
            el("div", { cls: "dom-row" }, remember.label,
                !this.creating && el("button", { cls: "dom-link", type: "button", text: "Forgot password?", on: { click: () => this.show("forgot") } })),
            ...this.messages(),
            el("div", { cls: "dom-buttons" },
                el("button", { cls: "dom-button", type: "button", text: "Back", on: { click: () => this.show("buttons") } }),
                el("button", { cls: "dom-button is-primary", type: "submit", text: this.creating ? "Create" : "Sign in" })),
        );
    }

    // a reset link emailed, if the address has an account (the answer's the same either way)
    private forgotForm() {
        const email = field("Email", "email", "email", store.get(Constants.LS_EMAIL) ?? "", true);
        return el("form", {
            cls: "dom-form", attrs: { novalidate: "" }, on: {
                submit: (e: SubmitEvent) => {
                    e.preventDefault();
                    const address = email.input.value.trim();
                    if (!address) return this.fail("Enter your email");
                    store.set(Constants.LS_EMAIL, address);
                    this.error = "";
                    IBC.net.title.forgotPassword(address);
                }
            }
        },
            el("h2", { cls: "dom-title", text: "Forgot your password?" }),
            this.forgotSent
                ? el("p", { cls: "dom-text", text: `If there's an account for ${store.get(Constants.LS_EMAIL)}, we've emailed it a link to choose a new password. It works for an hour.` })
                : el("p", { cls: "dom-text", text: "Enter your account's email and we'll send you a link to choose a new password." }),
            !this.forgotSent && email.label,
            ...this.messages(),
            el("div", { cls: "dom-buttons" },
                el("button", { cls: "dom-button", type: "button", text: "Back", on: { click: () => { this.creating = false; this.show("email"); } } }),
                !this.forgotSent && el("button", { cls: "dom-button is-primary", type: "submit", text: "Send link" })),
        );
    }

    // from a reset link: a new password, which signs you in
    private resetForm() {
        const password = field("Password", "password", "new-password", "", true);
        const again = field("Again", "password", "new-password");
        const remember = checkbox("Remember me", true);
        return el("form", {
            cls: "dom-form", attrs: { novalidate: "" }, on: {
                submit: (e: SubmitEvent) => {
                    e.preventDefault();
                    const problem = passwordProblem(password.input.value, again.input.value);
                    if (problem) return this.fail(problem);
                    this.clearMessages();
                    this.wait("Saving your password...");
                    IBC.net.title.signIn("reset", { tok: resetToken, p: password.input.value, rm: remember.input.checked ? 1 : 0 });
                }
            }
        },
            el("h2", { cls: "dom-title", text: "Choose a new password" }),
            password.label, again.label, remember.label,
            ...this.messages(),
            el("div", { cls: "dom-buttons" },
                el("button", { cls: "dom-button", type: "button", text: "Cancel", on: { click: () => { this.dropReset(); this.show("buttons"); } } }),
                el("button", { cls: "dom-button is-primary", type: "submit", text: "Save" })),
        );
    }

    private dropReset() {
        resetToken = null;
        this.forgetLink();
    }

    // why that didn't do, in the panel as it is (a form keeps what's typed)
    private fail(text: string) {
        this.error = text;
        const line = el("p", { cls: "dom-error", text, attrs: { role: "alert" } });
        const old = this.layer.panel.querySelector(".dom-error");
        if (old) old.replaceWith(line);
        else this.layer.panel.querySelector(".dom-buttons")?.before(line);
    }

    private clearMessages() {
        this.error = "";
        this.info = "";
    }

    //#endregion

    //#region events

    // back to the panel the try came from, saying why (a login this browser
    // kept that's no use, or a link that's used up: to the buttons)
    private title_refused(why: string, text: string) {
        this.signingUp = false;
        if (why == "reset") this.dropReset();
        // (a confirm link that didn't work: said, then on as usual)
        if (why == "confirm") {
            this.mode = this.from;
            if (store.get(Constants.LS_REMEMBER)) {
                IBC.net.title.notes.push(text);
                this.signInRemembered();
                return;
            }
        }
        this.mode = why == "token" || why == "session" || why == "guest" || why == "reset" || why == "confirm" || why == "banned" ? "buttons" : this.from;
        this.forgotSent = false;
        // (a remembered browser, or a session, that has to sign in again: no need to say why)
        this.error = why == "token" || why == "session" ? "" : text;
        this.render();
    }

    private title_confirmed(email: string) {
        const news = `Your email ${email} is confirmed - thanks!`;
        if (store.get(Constants.LS_REMEMBER)) {
            IBC.net.title.notes.push(news);
            this.signInRemembered();
            return;
        }
        this.info = news;
        this.show("buttons");
    }

    private title_signedIn() {
        this.forgetLink();
        if (this.signingUp && IBC.data.player.email)
            IBC.data.chat.note(`Welcome! We've emailed ${IBC.data.player.email} a link to confirm it's yours.`);
        IBC.comp.create(ComponentType.MAIN_MENU);
        IBC.comp.create(ComponentType.MORE_MENU);
        if (IBC.data.player.role >= Role.EDITOR)
            IBC.comp.create(ComponentType.ADMIN_MENU);
        IBC.comp.create(ComponentType.BLACKJACK_BUTTON);
        IBC.comp.create(ComponentType.SLIME_RACE_BUTTON);
        IBC.comp.create(ComponentType.GOLD_DISPLAY);
        HeroWindow.showHeroes();
        IBC.comp.create(ComponentType.HERO_ROSTER);
        GuideBox.start();
        IBC.comp.create(ComponentType.ITEM_TOASTS);
        IBC.comp.create(ComponentType.SCREEN_FX);
        IBC.comp.create(ComponentType.LOOT_CHEST);
        IBC.comp.create(ComponentType.DELIGHT);
        IBC.comp.create(ComponentType.BOUNTY_BOX);
        IBC.comp.create(ComponentType.CHAT);
        GuideBox.welcome();
        IBC.comp.destroy(this);
    }

    //#endregion

}
