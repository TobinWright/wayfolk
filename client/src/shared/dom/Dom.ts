// HTML over the canvas, for what needs real form fields - the title screen's
// sign-in and Settings' Save account (password managers, phone keyboards,
// pasting, and Google's own button all want them). Styled like the game's
// windows: the panel frame and the game's own font (dist/css/main.css,
// .dom-*; the font is tools/build-webfont.js's).

type Child = Node | string | null | undefined | false;

export interface Props {
    cls?: string;
    text?: string;
    attrs?: { [name: string]: string };
    on?: { [event: string]: (e: any) => void };
    [prop: string]: any;            // anything else set on the element (type, value, checked...)
}

// an element with its class, attributes, handlers and children
export function el<K extends keyof HTMLElementTagNameMap>(tag: K, props: Props = {}, ...children: Child[]): HTMLElementTagNameMap[K] {
    const element = document.createElement(tag);
    const { cls, text, attrs, on, ...rest } = props;
    if (cls) element.className = cls;
    if (text != null) element.textContent = text;
    for (const [name, value] of Object.entries(attrs ?? {})) element.setAttribute(name, value);
    for (const [event, handler] of Object.entries(on ?? {})) element.addEventListener(event, handler);
    Object.assign(element, rest);
    for (const child of children) if (child) element.append(child);
    return element;
}

// A layer over the whole canvas holding one panel. Keys pressed in it are
// marked taken (as the chat's are: Chat.takes), so the windows' shortcuts
// leave them be. modal: dims what's behind and takes the pointer.
export class DomLayer {

    public root: HTMLDivElement;
    public panel: HTMLDivElement;

    constructor(modal: boolean) {
        this.panel = el("div", { cls: "dom-panel" });
        this.root = el("div", { cls: "dom-layer" + (modal ? " is-modal" : "") }, this.panel);
        this.root.addEventListener("keydown", (e) => (e as any).chat = true);
        // (the canvas under it shouldn't see presses on the panel)
        for (const type of ["pointerdown", "wheel"]) this.panel.addEventListener(type, (e) => e.stopPropagation());
        document.body.appendChild(this.root);
    }

    // what's in the panel, all of it
    public show(...children: Child[]) {
        this.panel.replaceChildren(...children.filter((c) => c) as (Node | string)[]);
        this.panel.querySelector<HTMLElement>("[autofocus]")?.focus();
    }

    public destroy() {
        this.root.remove();
    }

}

// localStorage that may not be there (private windows, blocked storage)
export const store = {
    get(key: string) {
        try { return localStorage.getItem(key); } catch (e) { return null; }
    },
    set(key: string, value: string) {
        try { localStorage.setItem(key, value); } catch (e) { }
    },
    remove(key: string) {
        try { localStorage.removeItem(key); } catch (e) { }
    },
};

// sessionStorage the same way (this tab's, gone when it's closed)
export const session = {
    get(key: string) {
        try { return sessionStorage.getItem(key); } catch (e) { return null; }
    },
    set(key: string, value: string) {
        try { sessionStorage.setItem(key, value); } catch (e) { }
    },
    remove(key: string) {
        try { sessionStorage.removeItem(key); } catch (e) { }
    },
};

// a text field focused: what's typed is for it
export function typingInField() {
    const active = document.activeElement;
    return active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement;
}
