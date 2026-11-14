import * as PIXI from "pixi.js";
import { text, textWidth } from "../components/games/GameUI";
import { AP } from "../constants/Palette";
import { el } from "./dom/Dom";

// The legal pages and the credits (client/dist/legal, beside index.html): linked from the
// title screen, Settings and Premium, and from Stripe's checkout (server
// BillingManager legalUrl).

export type LegalPage = "terms" | "privacy" | "refunds" | "credits";

export const LEGAL_NAMES: { [page in LegalPage]: string } = { terms: "Terms", privacy: "Privacy", refunds: "Refunds", credits: "Credits" };

export function legalUrl(page: LegalPage) {
    return `legal/${page}.html`;
}

// in a new tab, so the game stays as it is
export function openLegal(page: LegalPage) {
    window.open(legalUrl(page), "_blank", "noopener");
}

// HTML links, for the DOM panels (the title screen)
export function legalLinks(pages: LegalPage[] = ["terms", "privacy", "refunds", "credits"]) {
    const links: (Node | string)[] = [];
    pages.forEach((page, k) => {
        if (k) links.push(" · ");
        links.push(el("a", { cls: "dom-link", text: LEGAL_NAMES[page], attrs: { href: legalUrl(page), target: "_blank", rel: "noopener" } }));
    });
    return el("p", { cls: "dom-hint is-center dom-legal" }, ...links);
}

// The same in the game's own text, at (x, y) in `parent`, each one lime and
// clicked opening its page: `lead` before them in grey. Returns its width.
export function legalText(parent: PIXI.Container, x: number, y: number, pages: LegalPage[], lead = "") {
    let at = x;
    if (lead) {
        text(lead, at, y, AP.STONE, parent);
        at += textWidth(lead) + 4;
    }
    pages.forEach((page, k) => {
        if (k) {
            parent.addChild(new PIXI.Graphics().beginFill(AP.STONE).drawRect(at, y + 3, 1, 1).endFill());     // (the font has no ·)
            at += 1 + 4;
        }
        const name = LEGAL_NAMES[page];
        const link = new PIXI.Container();
        link.position.set(at, y);
        const t = text(name, 0, 0, AP.LIME, link);
        link.eventMode = "static";
        link.cursor = "pointer";
        link.hitArea = new PIXI.Rectangle(-1, -1, textWidth(name) + 2, 10);
        link.on("pointerdown", (e: PIXI.FederatedPointerEvent) => e.stopPropagation());
        link.on("pointerover", () => t.tint = AP.PALE);
        link.on("pointerout", () => t.tint = AP.LIME);
        link.on("pointertap", () => openLegal(page));
        parent.addChild(link);
        at += textWidth(name) + 4;
    });
    return at - 4 - x;
}
