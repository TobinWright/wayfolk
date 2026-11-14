import { el } from "./Dom";

// Google's own "Sign in with Google" button (Google Identity Services - its
// look is Google's, as their branding rules ask; from console8). Pressing it
// and choosing an account hands onToken an ID token, which the server checks
// (server auth/GoogleAccounts). Shows nothing until the server says Google
// sign-in is set up (S2C.TITLE_AUTH_OPTIONS: clientId); Google's script is
// only loaded then.

let script: Promise<void> = null;
let initializedFor: string = null;
// the button on screen and its onToken - Google calls back once per page, so
// this says where its token goes, and a button that's gone gets nothing
let active: { owner: GoogleButton, onToken: (token: string) => void } = null;

function loadScript(): Promise<void> {
    script ??= new Promise<void>((resolve, reject) => {
        const tag = document.createElement("script");
        tag.src = "https://accounts.google.com/gsi/client";
        tag.async = true;
        tag.onload = () => resolve();
        tag.onerror = () => { script = null; reject(); };
        document.head.appendChild(tag);
    });
    return script;
}

export class GoogleButton {

    public static clientId: string = null;      // (null: no Google sign-in)

    public element: HTMLDivElement;
    private live = true;

    // (null: no Google sign-in - check GoogleButton.clientId first)
    constructor(onToken: (token: string) => void, text: "signin_with" | "continue_with" | "signup_with", width = 260) {
        const clientId = GoogleButton.clientId;
        this.element = el("div", { cls: "dom-google" });
        if (!clientId) return;
        active = { owner: this, onToken };
        const host = el("div");
        this.element.append(host);
        loadScript().then(() => {
            if (!this.live) return;
            const google = (window as any).google;
            if (initializedFor != clientId) {
                google.accounts.id.initialize({ client_id: clientId, callback: (response: any) => active?.onToken(response.credential) });
                initializedFor = clientId;
            }
            google.accounts.id.renderButton(host, { theme: "filled_black", size: "large", shape: "rectangular", text, width });
        }).catch(() => {
            if (this.live) this.element.replaceChildren(el("p", { cls: "dom-error", text: "Couldn't load Google sign-in" }));
        });
    }

    public destroy() {
        this.live = false;
        if (active?.owner === this) active = null;
    }

}
