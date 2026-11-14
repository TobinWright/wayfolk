import { el } from "../../shared/dom/Dom";

// The fields the sign-in forms share (the title screen's, Settings' Save
// account): HTML (shared/dom/Dom.ts), so password managers fill them.

// the server's rules too (server auth/EmailAccounts)
export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 72;

// a labelled text field
export function field(name: string, type: "email" | "password" | "text", autocomplete: string, value = "", autofocus = false) {
    const input = el("input", {
        cls: "dom-input", type, value,
        attrs: { autocomplete, spellcheck: "false", autocapitalize: "off", maxlength: type == "email" ? "254" : "200", ...(autofocus ? { autofocus: "" } : {}) },
    });
    const label = el("label", { cls: "dom-field" }, el("span", { text: name }), input);
    return { label, input };
}

// a box ticked or not, and what it's for
export function checkbox(name: string, checked: boolean) {
    const input = el("input", { type: "checkbox", checked });
    const label = el("label", { cls: "dom-check" }, input, el("span", { text: name }));
    return { label, input };
}

// what's wrong with a new password typed twice ("": nothing)
export function passwordProblem(password: string, again: string) {
    if (password.length < PASSWORD_MIN || password.length > PASSWORD_MAX) return `Use a password of ${PASSWORD_MIN} to ${PASSWORD_MAX} characters`;
    if (password != again) return "The passwords don't match";
    return "";
}
