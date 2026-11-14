import { Event } from "../../constants/Events";
import { IBC } from "../../Engine";
import { DomLayer, el } from "../../shared/dom/Dom";
import { GoogleButton } from "../../shared/dom/GoogleButton";
import { field, passwordProblem } from "../title/AuthFields";

// Save account, from Settings (guests only; the user, 2026-10-29): a guest's
// account saved as an email account (an email and a password) or a Google
// account, keeping everything - heroes, gold, the lot (server PlayerHandler
// saveAccount). HTML over the game (shared/dom/Dom.ts); Escape, Cancel or a
// click outside closes it.

export class SaveAccount {

    private static current: SaveAccount = null;

    private layer: DomLayer;
    private google: GoogleButton = null;
    private error: HTMLParagraphElement;
    private saveButton: HTMLButtonElement;
    private keys = (e: KeyboardEvent) => { if (e.key == "Escape") { e.stopPropagation(); this.close(); } };

    public static isOpen() {
        return !!SaveAccount.current;
    }

    public static open() {
        if (SaveAccount.current || IBC.data.player.type != "guest") return;
        SaveAccount.current = new SaveAccount();
    }

    public static close() {
        SaveAccount.current?.close();
    }

    constructor() {
        this.layer = new DomLayer(true);
        this.layer.root.addEventListener("pointerdown", (e) => { if (e.target == this.layer.root) this.close(); });
        this.layer.root.addEventListener("keydown", this.keys);
        this.render();

        IBC.events.register(Event.PLAYER_ACCOUNT_SAVED, () => this.close(), this);
        IBC.events.register(Event.PLAYER_SAVE_REFUSED, (why: string) => this.fail(why), this);
        IBC.events.register(Event.NETWORK_DISCONNECTED, () => this.close(), this);
    }

    private render() {
        const email = field("Email", "email", "email", "", true);
        const password = field("Password", "password", "new-password");
        const again = field("Again", "password", "new-password");
        this.error = el("p", { cls: "dom-error", attrs: { role: "alert" }, hidden: true });
        this.saveButton = el("button", { cls: "dom-button is-primary", type: "submit", text: "Save" });

        if (GoogleButton.clientId) this.google = new GoogleButton((token) => {
            this.busy(true);
            IBC.net.player.saveWithGoogle(token);
        }, "continue_with", 296);

        const form = el("form", {
            cls: "dom-form", attrs: { novalidate: "" }, on: {
                submit: (e: SubmitEvent) => {
                    e.preventDefault();
                    const address = email.input.value.trim();
                    if (!address) return this.fail("Enter your email");
                    const problem = passwordProblem(password.input.value, again.input.value);
                    if (problem) return this.fail(problem);
                    this.busy(true);
                    IBC.net.player.saveWithEmail(address, password.input.value);
                }
            }
        },
            email.label, password.label, again.label,
            this.error,
            el("div", { cls: "dom-buttons" },
                el("button", { cls: "dom-button", type: "button", text: "Cancel", on: { click: () => this.close() } }),
                this.saveButton),
        );

        this.layer.show(
            el("h2", { cls: "dom-title", text: "Save your account" }),
            el("p", { cls: "dom-text", text: "Keep your heroes, gold and everything else, and sign in on any device." }),
            this.google && el("div", { cls: "dom-choices" }, this.google.element),
            this.google && el("p", { cls: "dom-or", text: "or with an email" }),
            form,
        );
    }

    private busy(on: boolean) {
        this.saveButton.disabled = on;
        this.saveButton.textContent = on ? "Saving..." : "Save";
        if (on) this.error.hidden = true;
    }

    private fail(text: string) {
        this.busy(false);
        this.error.textContent = text;
        this.error.hidden = false;
    }

    private close() {
        if (SaveAccount.current != this) return;
        SaveAccount.current = null;
        this.google?.destroy();
        this.layer.destroy();
        IBC.events.unregisterAll(this);
    }

}
