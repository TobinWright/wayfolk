import { Event } from "../../constants/Events";
import { IBC } from "../../Engine";
import { DomLayer, el } from "../../shared/dom/Dom";
import { legalUrl } from "../../shared/Legal";
import { field } from "../title/AuthFields";

// Delete account, from Settings (the privacy policy's right to erasure):
// what goes, then DELETE typed (and an email account's password) to be sure.
// The server erases it all (server managers/account) and says so
// (PLAYER_DELETED: network/PlayerHandler shows that it's gone). HTML over
// the game (shared/dom/Dom.ts); Escape, Cancel or a click outside closes it.

export class DeleteAccount {

    private static current: DeleteAccount = null;

    private layer: DomLayer;
    private error: HTMLParagraphElement;
    private deleteButton: HTMLButtonElement;
    private keys = (e: KeyboardEvent) => { if (e.key == "Escape") { e.stopPropagation(); this.close(); } };

    public static isOpen() {
        return !!DeleteAccount.current;
    }

    public static open() {
        if (DeleteAccount.current) return;
        DeleteAccount.current = new DeleteAccount();
    }

    public static close() {
        DeleteAccount.current?.close();
    }

    constructor() {
        this.layer = new DomLayer(true);
        this.layer.root.addEventListener("pointerdown", (e) => { if (e.target == this.layer.root) this.close(); });
        this.layer.root.addEventListener("keydown", this.keys);
        this.render();

        IBC.events.register(Event.PLAYER_DELETE_REFUSED, (why: string) => this.fail(why), this);
        IBC.events.register(Event.NETWORK_DISCONNECTED, () => this.close(), this);
        IBC.events.register(Event.PLAYER_DELETED, () => this.close(), this);
    }

    private render() {
        const player = IBC.data.player, premium = IBC.data.premium;
        const needsPassword = player.type == "email";
        const password = field("Password", "password", "current-password", "", true);
        const confirm = field("Type DELETE", "text", "off", "", !needsPassword);
        this.error = el("p", { cls: "dom-error", attrs: { role: "alert" }, hidden: true });
        this.deleteButton = el("button", { cls: "dom-button is-danger", type: "submit", text: "Delete forever" });

        const form = el("form", {
            cls: "dom-form", attrs: { novalidate: "" }, on: {
                submit: (e: SubmitEvent) => {
                    e.preventDefault();
                    if (needsPassword && !password.input.value) return this.fail("Enter your password");
                    if (confirm.input.value.trim().toUpperCase() != "DELETE") return this.fail("Type DELETE to confirm");
                    this.busy(true);
                    IBC.net.player.deleteAccount(needsPassword ? password.input.value : "");
                }
            }
        },
            needsPassword && password.label, confirm.label,
            this.error,
            el("div", { cls: "dom-buttons" },
                el("button", { cls: "dom-button", type: "button", text: "Cancel", on: { click: () => this.close() } }),
                this.deleteButton),
        );

        const who = player.type == "guest" ? "This guest account" : `${player.name}'s account`;
        this.layer.show(
            el("h2", { cls: "dom-title", text: "Delete your account?" }),
            el("p", { cls: "dom-text", text: `${who} and everything in it - heroes, gold, items, friends, whispers, your guild place and market listings - is erased for good. It can't be undone.` }),
            (premium.renews || premium.active) && el("p", { cls: "dom-text", text: "Your Supporter subscription is cancelled straight away. Time left this month isn't refunded (see the refund policy)." }),
            el("p", { cls: "dom-hint" }, "Want a copy first? Use Download my data in Settings. ",
                el("a", { cls: "dom-link", text: "Privacy policy", attrs: { href: legalUrl("privacy"), target: "_blank", rel: "noopener" } })),
            form,
        );
    }

    private busy(on: boolean) {
        this.deleteButton.disabled = on;
        this.deleteButton.textContent = on ? "Deleting..." : "Delete forever";
        if (on) this.error.hidden = true;
    }

    private fail(text: string) {
        this.busy(false);
        this.error.textContent = text;
        this.error.hidden = false;
    }

    private close() {
        if (DeleteAccount.current != this) return;
        DeleteAccount.current = null;
        this.layer.destroy();
        IBC.events.unregisterAll(this);
    }

}
