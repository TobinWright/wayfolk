import * as PIXI from "pixi.js";
import {
    ADMIN_BAN_DAYS, ADMIN_GOLD_MOST, ADMIN_ITEMS_MOST, ADMIN_SAY_LONGEST, ADMIN_SUPPORTER_DAYS, AdminNote, AdminPlayer, AdminPurchases, AdminReport, AdminRow,
    AdminStash, AdminTrade, BAN_FOREVER, BAN_REASON_LONGEST, LISTING_STATES, ROLE_NAMES,
} from "../../../../shared/Admin";
import { minutesText, REPORT_REASONS } from "../../../../shared/Chat";
import { EVENT_KINDS } from "../../../../shared/Events";
import { KIND_NAMES } from "../../../../shared/Sights";
import { MATERIALS } from "../../../../shared/Locations";
import { isItem, itemMatches, itemOrder } from "../../../../shared/Market";
import { itemName, RECIPES } from "../../../../shared/Tasks";
import { FEEDBACK_KINDS, FeedbackRow } from "../../../../shared/Feedback";
import { feedbackIcon, playersIcon, reportsIcon, serverIcon } from "../../art/AnalyticsIcons";
import { Constants, Role } from "../../constants/Constants";
import { Event } from "../../constants/Events";
import { AP, R64 } from "../../constants/Palette";
import { IBC } from "../../Engine";
import { Panel } from "../../shared/Panel";
import { TextField } from "../../shared/ui/TextField";
import { TitleBar } from "../../shared/ui/titlebar/TitleBar";
import { BaseComponent, ComponentType } from "../BaseComponent";
import { Chat } from "../chat/Chat";
import { fit } from "../heroroster/HeroRoster";

// The admin panel (the user, 2026-10-29: "build an admin panel for the
// admin menu"; shared/Admin.ts, server managers/admin), from the admin menu.
// Made like Analytics: a tab a subject along the top, an icon each.
//  - Players: find someone by name or #id (nothing: those signed in), pick
//    them to see their account; mute or unmute them, ban or unban them
//    (with why, which they're told), and (admins) give or take gold and
//    change their role. Banning, taking gold and changing a role ask
//    "Sure?" first. For support, a picked player's other views:
//    Stash (their gold and things; admins give or take things), Market
//    (what they've listed, sold and bought), Paid (admins: Supporter, their
//    Stripe subscription, the cosmetic packs; give Supporter days, give or
//    take packs) and Log (what staff have done to them, so nothing's given
//    twice).
//  - Reports: the open chat reports, picked to read the lines before; see
//    the player reported, or mark it dealt with.
//  - Server: a line in General to everyone; an event started.
// What's done or refused, and what's pointed at, along the bottom.

const TABS = [
    { name: "Players", icon: playersIcon },
    { name: "Reports", icon: reportsIcon },
    { name: "Server", icon: serverIcon },
    { name: "Feedback", icon: feedbackIcon },
];
const FEEDBACK_ROWS = 16;           // a page of feedback in the list
const EDGE = 6;
const TAB_W = 16, TAB_H = 14, TAB_GAP = 2;
const ROW_H = 10;
const LINE = 10;
const LIST_W = 110;
const BUTTON_H = 12;
const REPORTS_SHOWN = 16;           // a page of reports in the list
const MUTES: [string, number][] = [["1 hour", 60], ["1 day", 24 * 60], ["7 days", 7 * 24 * 60]];
const ROLE_TINTS = [AP.ASH, R64.LEAF, R64.SKY, AP.STRAW];
const VIEWS = ["Account", "Stash", "Market", "Paid", "Log"];
enum View { ACCOUNT, STASH, MARKET, PAID, LOG }
const VIEW_ROWS = 14;               // a page of a view's list
const STATE_TINTS = [R64.LEAF, AP.ASH, AP.STONE, R64.SALMON, AP.STONE];

// every thing the game knows, in the market's order (to give one by name)
const ALL_ITEMS = Array.from(new Set([...MATERIALS.map((m) => m.id), ...RECIPES.map((r) => r.id)]))
    .filter(isItem).sort((a, b) => itemOrder(a) - itemOrder(b));

export class AdminPanel extends BaseComponent {

    public static SCALE = 2;
    public static W = 340;              // in its own px
    public static INSET_X = 12;         // the window round it, in screen px
    public static INSET_Y = 28;

    // (kept from one opening to the next)
    private static tab = 0;
    private static found: AdminRow[] = [];
    private static query = "";
    private static picked: AdminPlayer = null;
    private static reports: AdminReport[] = [];
    private static reportsOpen = 0;
    private static report = 0;          // (the report picked, by number)
    private static page = 0;
    private static pickedId = 0;        // (set as they're picked, before their account comes)
    private static view = View.ACCOUNT;
    private static viewPage = 0;
    private static stash: AdminStash = null;
    private static trades: AdminTrade[] = null;
    private static purchases: AdminPurchases = null;
    private static notes: AdminNote[] = null;
    private static feedback: FeedbackRow[] = [];
    private static feedbackOpen = 0;
    private static feedbackPicked = 0;  // (by its number)
    private static feedbackPage = 0;

    private line = "";
    private lineTint: number = AP.ASH;
    private armed = "";                 // (an action that asks "Sure?", clicked once)
    private h = 0;

    public background: Panel;
    public titleBar: TitleBar;
    private content: PIXI.Container;
    private back = new PIXI.Graphics();
    private body = new PIXI.Container();
    private info: PIXI.BitmapText;
    private search: TextField;
    private goldField: TextField;
    private sayField: TextField;
    private itemField: TextField;
    private amountField: TextField;
    private banField: TextField;

    private keys = (e: KeyboardEvent) => this.onKey(e);
    private paste = (e: ClipboardEvent) => {
        const f = this.focused();
        if (f) f.paste(e.clipboardData?.getData("text") ?? "");
    };

    constructor() {
        super(ComponentType.ADMIN_PANEL);
        this.create();
    }

    public create() {
        super.create();
        const { INSET_X, INSET_Y } = AdminPanel;

        this.container.eventMode = "static";
        this.container.on("pointerdown", (e: PIXI.FederatedPointerEvent) => { e.stopPropagation(); this.unfocus(); });
        this.background = new Panel(this.container);
        this.titleBar = new TitleBar(this);
        this.titleBar.setPosition(4, 4);
        this.titleBar.setTitle("Admin");

        this.content = new PIXI.Container();
        this.content.scale.set(AdminPanel.SCALE);
        this.content.position.set(INSET_X, INSET_Y);
        this.content.addChild(this.back, this.body);
        this.container.addChild(this.content);

        const focus = (f: () => TextField) => () => { this.unfocus(); f().setFocused(true); };
        this.search = new TextField(100, { max: 40, hint: "name or #id", onEnter: (v) => this.find(v), onFocus: focus(() => this.search) });
        this.search.set(AdminPanel.query);
        this.goldField = new TextField(56, { max: 8, hint: "gold", onEnter: () => this.sendGold(1), onFocus: focus(() => this.goldField) });
        this.sayField = new TextField(100, { max: ADMIN_SAY_LONGEST, hint: "say something to everyone", onEnter: () => this.announce(), onFocus: focus(() => this.sayField) });
        this.itemField = new TextField(100, { max: 40, hint: "thing's name or #id", onEnter: () => this.sendItem(1), onFocus: focus(() => this.itemField) });
        this.amountField = new TextField(40, { max: 6, hint: "how many", onEnter: () => this.sendItem(1), onFocus: focus(() => this.amountField) });
        this.banField = new TextField(100, { max: BAN_REASON_LONGEST, hint: "why they're banned (they're told)", onFocus: focus(() => this.banField) });

        window.addEventListener("keydown", this.keys);
        document.addEventListener("paste", this.paste);
        IBC.events.register(Event.ADMIN_FOUND, (m: { l: AdminRow[]; q: string }) => {
            AdminPanel.found = m.l;
            AdminPanel.query = m.q;
            this.draw();
        }, this);
        IBC.events.register(Event.ADMIN_PLAYER, (p: AdminPlayer) => {
            if (p.i != AdminPanel.pickedId) return;     // (one picked before, still coming)
            AdminPanel.picked = p;
            const row = AdminPanel.found.find((r) => r.i == p.i);
            if (row) { row.n = p.n; row.r = p.r; row.o = p.o == 1 ? 1 : 0; }
            this.draw();
        }, this);
        IBC.events.register(Event.ADMIN_REPORTS, (m: { l: AdminReport[]; n: number }) => {
            AdminPanel.reports = m.l;
            AdminPanel.reportsOpen = m.n;
            AdminPanel.page = Math.min(AdminPanel.page, Math.max(0, Math.ceil(m.l.length / REPORTS_SHOWN) - 1));
            this.draw();
        }, this);
        IBC.events.register(Event.ADMIN_FEEDBACK, (m: { l: FeedbackRow[]; n: number }) => {
            AdminPanel.feedback = m.l;
            AdminPanel.feedbackOpen = m.n;
            AdminPanel.feedbackPage = Math.min(AdminPanel.feedbackPage, Math.max(0, Math.ceil(m.l.length / FEEDBACK_ROWS) - 1));
            this.draw();
        }, this);
        IBC.events.register(Event.ADMIN_DONE, (w: string) => {
            if (w.startsWith("Announced")) this.sayField.set("");
            if (/^(Gave|Took) .* gold/.test(w)) this.goldField.set("");
            else if (/^(Gave|Took)/.test(w)) this.amountField.set("");
            if (/ (un)?banned/.test(w)) this.banField.set("");
            this.say(w, R64.LEAF);
            if (AdminPanel.view == View.LOG && AdminPanel.picked) IBC.net.admin.log(AdminPanel.picked.i);
        }, this);
        IBC.events.register(Event.ADMIN_REFUSED, (w: string) => this.say(w, R64.SALMON), this);
        // (a view's data, kept only for the one picked)
        const theirs = (i: number) => i == AdminPanel.pickedId;
        IBC.events.register(Event.ADMIN_STASH, (s: AdminStash) => { if (theirs(s.i)) { AdminPanel.stash = s; this.draw(); } }, this);
        IBC.events.register(Event.ADMIN_MARKET, (m: { i: number; l: AdminTrade[] }) => { if (theirs(m.i)) { AdminPanel.trades = m.l; this.draw(); } }, this);
        IBC.events.register(Event.ADMIN_PURCHASES, (p: AdminPurchases) => { if (theirs(p.i)) { AdminPanel.purchases = p; this.draw(); } }, this);
        IBC.events.register(Event.ADMIN_LOG, (m: { i: number; l: AdminNote[] }) => { if (theirs(m.i)) { AdminPanel.notes = m.l; this.draw(); } }, this);

        IBC.net.admin.find(AdminPanel.query);
        IBC.net.admin.reports();
        IBC.net.admin.feedback();
        if (AdminPanel.pickedId) {
            IBC.net.admin.player(AdminPanel.pickedId);
            this.askView();
        }
        this.draw();
        const { width, height } = this.size();
        this.setPosition(Math.round((window.innerWidth - width) / 2), Math.max(8, Math.round((window.innerHeight - height) / 2)));
    }

    public destroy() {
        super.destroy();
        window.removeEventListener("keydown", this.keys);
        document.removeEventListener("paste", this.paste);
        IBC.events.unregisterAll(this);
        for (const f of this.fields()) { f.container.parent?.removeChild(f.container); f.destroy(); }
        this.titleBar.destroy();
        this.background.destroy();
        this.container.destroy({ children: true });
    }

    public update(deltaTime: number) {
        for (const f of this.fields()) f.update(deltaTime);
    }

    //#region === Typing ===

    private fields() {
        return [this.search, this.goldField, this.sayField, this.itemField, this.amountField, this.banField];
    }

    private focused() {
        return this.fields().find((f) => f.focused && f.container.parent);
    }

    private unfocus() {
        for (const f of this.fields()) f.setFocused(false);
    }

    private onKey(e: KeyboardEvent) {
        if (e.ctrlKey || e.metaKey || e.altKey) return;
        const f = this.focused();
        if (!f) {
            if (e.key == "Escape" && !Chat.takes(e)) IBC.comp.destroy(this);
            return;
        }
        (e as any).chat = true;
        e.preventDefault();
        Chat.stop();
        if ((f == this.goldField || f == this.amountField) && e.key.length == 1 && !/\d/.test(e.key)) return;
        f.key(e);
    }

    //#endregion

    //#region === Doing ===

    private find(q: string) {
        this.search.set(q);
        this.search.setFocused(false);
        IBC.net.admin.find(q);
    }

    private pick(id: number) {
        this.armed = "";
        if (id != AdminPanel.pickedId) {
            AdminPanel.pickedId = id;
            AdminPanel.picked = null;
            AdminPanel.stash = AdminPanel.trades = AdminPanel.purchases = AdminPanel.notes = null;
            AdminPanel.viewPage = 0;
            this.draw();
        }
        IBC.net.admin.player(id);
        this.askView(id);
    }

    private openView(v: View) {
        AdminPanel.view = v;
        AdminPanel.viewPage = 0;
        this.armed = "";
        this.unfocus();
        this.askView();
        this.draw();
    }

    // the picked player's data for the view open
    private askView(id = AdminPanel.pickedId) {
        if (!id) return;
        const a = IBC.net.admin;
        switch (AdminPanel.view) {
            case View.STASH: a.stash(id); break;
            case View.MARKET: a.market(id); break;
            case View.PAID: if (IBC.data.player.role >= Role.ADMIN) a.purchases(id); break;
            case View.LOG: a.log(id); break;
        }
    }

    // give (1) or take (-1) the thing typed, as many as typed
    private sendItem(sign: number) {
        const p = AdminPanel.picked;
        if (!p) return;
        const found = findItem(this.itemField.value);
        if (typeof found == "string") return this.say(found, R64.SALMON);
        const n = Number(this.amountField.value);
        if (!(n > 0)) return this.say("Type how many first", R64.SALMON);
        if (n > ADMIN_ITEMS_MOST) return this.say(`${num(ADMIN_ITEMS_MOST)} at most`, R64.SALMON);
        this.itemField.set(itemName(found));
        this.unfocus();
        IBC.net.admin.item(p.i, found, sign * n);
    }

    // give (1) or take (-1) what's typed
    private sendGold(sign: number) {
        const p = AdminPanel.picked, g = Number(this.goldField.value);
        if (!p || !(g > 0)) return this.say("Type how much gold first", R64.SALMON);
        if (g > ADMIN_GOLD_MOST) return this.say(`${num(ADMIN_GOLD_MOST)} gold at most`, R64.SALMON);
        this.goldField.setFocused(false);
        IBC.net.admin.gold(p.i, sign * g);
    }

    private announce() {
        const t = this.sayField.value.trim();
        if (!t) return this.say("Type what to say first", R64.SALMON);
        this.sayField.setFocused(false);
        IBC.net.admin.say(t);
    }

    // clicked once, it asks "Sure?"; clicked again, it's done
    private sendBan(d: number) {
        const p = AdminPanel.picked;
        if (!p) return;
        IBC.net.admin.ban(p.i, d, this.banField.value.trim());
        this.banField.setFocused(false);
    }

    private sure(key: string, then: () => void) {
        if (this.armed == key) { this.armed = ""; then(); }
        else this.armed = key;
        this.draw();
    }

    //#endregion

    //#region === Drawing ===

    private size() {
        const { W, SCALE, INSET_X, INSET_Y } = AdminPanel;
        return { width: INSET_X * 2 + W * SCALE, height: INSET_Y + this.h * SCALE + INSET_X };
    }

    private say(line: string, tint: number = AP.ASH) {
        this.line = line;
        this.lineTint = tint;
        this.showInfo();
    }

    private showInfo(pointed?: string) {
        if (!this.info) return;
        this.info.text = pointed ?? (this.line || "Point at something to read about it");
        this.info.tint = pointed ? AP.WHITE : this.line ? this.lineTint : AP.STONE;
        fit(this.info, AdminPanel.W - 8);
    }

    private draw() {
        // (the fields are kept: taken out before the rest goes)
        for (const f of this.fields()) f.container.parent?.removeChild(f.container);
        this.body.removeChildren().forEach((c) => c.destroy({ children: true }));
        this.info = null;
        const W = AdminPanel.W;
        const g = new PIXI.Graphics();
        this.body.addChild(g);

        // the tabs
        let x = 0;
        const ty = EDGE - 3;
        TABS.forEach((t, k) => {
            const on = k == AdminPanel.tab, tx = x;
            const back = new PIXI.Graphics();
            const paint = (lit: boolean) => back.clear()
                .beginFill(on ? AP.STRAW : AP.BLACK).drawRect(tx, ty, TAB_W, TAB_H).endFill()
                .beginFill(on || lit ? AP.IRON : AP.SLATE).drawRect(tx + 1, ty + 1, TAB_W - 2, TAB_H - 2).endFill()
                .beginFill(on ? AP.STEEL : AP.IRON, on || lit ? 1 : 0.5).drawRect(tx + 1, ty + 1, TAB_W - 2, 1).endFill();
            paint(false);
            const icon = new PIXI.Sprite(t.icon());
            icon.position.set(tx + 3, ty + 2);
            icon.alpha = on ? 1 : 0.75;
            icon.eventMode = "none";
            this.body.addChild(back, icon);
            const more = k == 1 ? `Reports: ${AdminPanel.reportsOpen} open` : k == 3 ? `Feedback: ${AdminPanel.feedbackOpen} open` : t.name;
            const area = this.hit(tx, ty, TAB_W, TAB_H, on ? null : () => this.openTab(k), more);
            area.on("pointerover", () => { paint(true); icon.alpha = 1; });
            area.on("pointerout", () => { paint(false); icon.alpha = on ? 1 : 0.75; });
            x += TAB_W + TAB_GAP;
        });
        text(TABS[AdminPanel.tab].name, x + 4, EDGE, AP.WHITE, this.body);
        // (a red count on Reports' and Feedback's tabs while any are open)
        for (const [tab, open] of [[1, AdminPanel.reportsOpen], [3, AdminPanel.feedbackOpen]]) {
            if (!open) continue;
            const n = String(Math.min(99, open)), nx = tab * (TAB_W + TAB_GAP) + TAB_W - 5;
            const badge = new PIXI.Graphics().beginFill(AP.RED).drawRect(nx - 1, ty - 2, n.length * 4 + 3, 7).endFill();
            badge.eventMode = "none";
            this.body.addChild(badge);
            text(n, nx + 1, ty - 1, AP.WHITE, this.body, 16);
        }
        let y = EDGE + 18;

        switch (AdminPanel.tab) {
            case 0: y = this.players(g, y); break;
            case 1: y = this.reportsTab(g, y); break;
            case 2: y = this.server(g, y); break;
            case 3: y = this.feedbackTab(g, y); break;
        }

        // what's pointed at, done or refused, along the bottom
        y += 2;
        g.beginFill(AP.SLATE).drawRect(0, y, W, 1).endFill();
        this.info = text("", 4, y + 4, AP.STONE, this.body);
        this.showInfo();
        y += 14;

        this.h = y;
        this.back.clear().beginFill(AP.INK).drawRect(-4, -2, W + 8, this.h + 6).endFill();
        const { width, height } = this.size();
        this.background.setSize(width, height);
        this.titleBar.setSize(width - 8, 20);
        this.container.hitArea = new PIXI.Rectangle(0, 0, width, height);
    }

    private openTab(k: number) {
        AdminPanel.tab = k;
        this.armed = "";
        this.unfocus();
        if (k == 1) IBC.net.admin.reports();
        if (k == 3) IBC.net.admin.feedback();
        this.draw();
    }

    //#endregion

    //#region === Players ===

    private players(g: PIXI.Graphics, y: number) {
        const W = AdminPanel.W;
        // the search, Find and Online
        const bw = 36;
        this.search.resize(W - 8 - (bw + 4) * 2);
        this.place(this.search, 4, y);
        this.button(g, "Find", W - 4 - bw * 2 - 4, y - 1, bw, true, () => this.find(this.search.value.trim()), "Find players by any part of their name, or #id");
        this.button(g, "Online", W - 4 - bw, y - 1, bw, true, () => this.find(""), "Everyone signed in now");
        y += 16;

        // the list, on the left
        const top = y, q = AdminPanel.query, rows = AdminPanel.found;
        fit(text(q ? `Found for "${q}"` : "Signed in now", 4, y, AP.MIST, this.body), LIST_W - 4);
        y += 11;
        if (!rows.length) text(q ? "Nobody's called that" : "Nobody", 4, y, AP.IRON, this.body);
        for (const r of rows) {
            const on = r.i == AdminPanel.pickedId, ry = y;
            if (on) g.beginFill(AP.SLATE).drawRect(2, ry - 1, LIST_W, ROW_H).endFill();
            g.beginFill(r.o ? R64.LEAF : AP.IRON).drawRect(5, ry + 3, 2, 2).endFill();
            fit(text(r.n, 10, ry, on ? AP.WHITE : AP.ASH, this.body), LIST_W - 22);
            if (r.r) {
                const tag = text(ROLE_NAMES[r.r][0], 0, ry, ROLE_TINTS[r.r], this.body);
                tag.x = LIST_W - Math.ceil(tag.textWidth);
            }
            this.hit(2, ry - 1, LIST_W, ROW_H, () => this.pick(r.i),
                `${r.n} (#${r.i}), ${ROLE_NAMES[r.r]}: ${r.o ? "signed in" : `last seen ${ago(Date.now() - r.a)} ago`}`);
            y += ROW_H;
        }
        const left = Math.max(y, top + 11 + ROW_H * 6) + 4;

        // their account, on the right
        g.beginFill(AP.SLATE).drawRect(LIST_W + 6, top, 1, left - top - 4).endFill();
        const right = this.account(g, LIST_W + 12, top, W - LIST_W - 16);
        return Math.max(left, right);
    }

    private account(g: PIXI.Graphics, x: number, y: number, w: number) {
        const p = AdminPanel.picked;
        if (!p) {
            text(AdminPanel.pickedId ? "Looking them up.." : "Pick a player to see their account", x, y, AP.IRON, this.body);
            return y + LINE;
        }
        const name = fit(text(p.n, x, y, AP.WHITE, this.body), w - 30);
        text(`#${p.i}`, x + Math.ceil(name.textWidth) + 4, y, AP.STEEL, this.body);
        y += LINE + 2;

        // the views: Account, Stash, Market, Paid, Log
        const admin = IBC.data.player.role >= Role.ADMIN, vw = Math.floor((w - (VIEWS.length - 1) * 3) / VIEWS.length);
        const viewInfo = ["Their account: mute, gold, role", "Their gold and things" + (admin ? "; give or take things" : ""),
            "What they've listed, sold and bought", admin ? "Supporter, their subscription, cosmetic packs" : "Purchases are for admins",
            "What staff have done to them"];
        VIEWS.forEach((v, k) => {
            const on = AdminPanel.view == k;
            this.button(g, v, x + k * (vw + 3), y, vw, !on && (k != View.PAID || admin), () => this.openView(k), viewInfo[k], false, on);
        });
        y += BUTTON_H + 6;
        switch (AdminPanel.view) {
            case View.STASH: return this.stashView(g, x, y, w);
            case View.MARKET: return this.marketView(g, x, y, w);
            case View.PAID: return this.paidView(g, x, y, w);
            case View.LOG: return this.logView(g, x, y, w);
        }

        const now = Date.now(), me = IBC.data.player, self = p.i == me.id;
        const lines: [string, number, string?][] = [
            [`${ROLE_NAMES[p.r]}, ${p.t} account`, ROLE_TINTS[p.r]],
            [p.o == 1 ? "Signed in now" : p.o == 2 ? `Away, heroes working (${ago(now - p.a)})` : `Last seen ${ago(now - p.a)} ago`, p.o == 1 ? R64.LEAF : AP.ASH],
            [`Joined ${day(p.c)} (${ago(now - p.c)} ago)`, AP.ASH],
            [`${num(p.g)} gold, ${p.h} hero${p.h == 1 ? "" : "es"}${p.k ? `, guild [${p.k}]` : ""}`, AP.ASH],
            [p.p > now ? `Supporter until ${day(p.p)}` : "Not a Supporter", p.p > now ? AP.STRAW : AP.STONE],
            [p.m > now ? `Muted for ${minutesText(p.m - now)} more` : "Not muted", p.m > now ? R64.SALMON : AP.STONE],
            [p.b ? `${p.b >= BAN_FOREVER ? "Banned for good" : `Banned until ${day(p.b)}`}${p.bw ? `: ${p.bw}` : ""}` : "Not banned",
                p.b ? R64.SALMON : AP.STONE, p.bw ? `Why: ${p.bw}` : undefined],
            [`${p.rp} open report${p.rp == 1 ? "" : "s"} of them`, p.rp ? R64.SALMON : AP.STONE, p.rp ? "See them on the Reports tab" : undefined],
        ];
        if (p.e) lines.splice(1, 0, [p.e, AP.STEEL]);
        for (const [t, tint, more] of lines) {
            fit(text(t, x, y, tint, this.body), w);
            if (more) this.hit(x, y, w, LINE, null, more);
            y += LINE;
        }
        y += 4;

        // muting
        const staff = p.r >= Role.MODERATOR;
        text("Chat", x, y + 2, AP.MIST, this.body);
        let bx = x + 26;
        const bw = Math.floor((w - 26 - 3 * 3) / 4);
        for (const [label, minutes] of MUTES) {
            this.button(g, label, bx, y, bw, !staff, () => IBC.net.admin.mute(p.i, minutes), staff ? "Staff can't be muted" : `Mute ${p.n} in the chat for ${label}`);
            bx += bw + 3;
        }
        this.button(g, "Unmute", bx, y, bw, p.m > now, () => IBC.net.admin.mute(p.i, 0), `Let ${p.n} talk in the chat again`);
        y += BUTTON_H + 4;

        // banning: why (told to them), then how long - each asks "Sure?"
        text("Ban", x, y + 2, AP.MIST, this.body);
        this.banField.resize(w - 26);
        this.place(this.banField, x + 26, y + 1);
        y += BUTTON_H + 3;
        bx = x + 26;
        const nw = Math.floor((w - 26 - ADMIN_BAN_DAYS.length * 3) / (ADMIN_BAN_DAYS.length + 1));
        for (const d of ADMIN_BAN_DAYS) {
            const key = `ban${d}`, label = d ? `${d} day${d == 1 ? "" : "s"}` : "Forever";
            this.button(g, this.armed == key ? "Sure?" : label, bx, y, nw, !staff && !self, () => this.sure(key, () => this.sendBan(d)),
                staff ? "Staff can't be banned" : `Ban ${p.n} ${d ? `for ${label}` : "for good"}: signed out, their heroes stop, and they can't sign in till it ends`,
                this.armed == key);
            bx += nw + 3;
        }
        this.button(g, this.armed == "unban" ? "Sure?" : "Unban", bx, y, nw, p.b > 0, () => this.sure("unban", () => IBC.net.admin.ban(p.i, -1, "")),
            `Let ${p.n} sign in again`, this.armed == "unban");
        y += BUTTON_H + 4;

        // gold and roles: admins
        this.goldField.container.visible = admin;
        if (!admin) {
            text("Gold and roles are for admins", x, y + 2, AP.IRON, this.body);
            return y + LINE + 4;
        }
        text("Gold", x, y + 2, AP.MIST, this.body);
        this.place(this.goldField, x + 26, y + 1);
        bx = x + 26 + 56 + 4;
        const gw = Math.floor((x + w - bx - 3) / 2);
        this.button(g, "Give", bx, y, gw, true, () => this.sendGold(1), `Give ${p.n} the gold typed`);
        this.button(g, this.armed == "take" ? "Sure?" : "Take", bx + gw + 3, y, gw, true,
            () => this.sure("take", () => this.sendGold(-1)), `Take the gold typed from ${p.n} (not below none)`, this.armed == "take");
        y += BUTTON_H + 4;

        text("Role", x, y + 2, AP.MIST, this.body);
        bx = x + 26;
        ROLE_NAMES.forEach((role, k) => {
            const key = `role${k}`, on = p.r == k;
            this.button(g, this.armed == key ? "Sure?" : k == Role.MODERATOR ? "Mod" : role, bx, y, bw, !self && !on,
                () => this.sure(key, () => IBC.net.admin.role(p.i, k)),
                self ? "You can't change your own role" : on ? `${p.n} is ${article(role)} ${role}` : `Make ${p.n} ${article(role)} ${role}`,
                this.armed == key, on);
            bx += bw + 3;
        });
        return y + BUTTON_H + 4;
    }

    // a view's list, a page at a time: each row drawn by `row` at (x, y)
    private paged<T>(g: PIXI.Graphics, x: number, y: number, w: number, all: T[], none: string, row: (r: T, y: number) => void, rowH = ROW_H) {
        if (!all) return text("Looking..", x, y, AP.IRON, this.body), y + LINE;
        if (!all.length) return text(none, x, y, AP.IRON, this.body), y + LINE;
        const pages = Math.ceil(all.length / VIEW_ROWS), page = Math.min(AdminPanel.viewPage, pages - 1);
        for (const r of all.slice(page * VIEW_ROWS, (page + 1) * VIEW_ROWS)) {
            row(r, y);
            y += rowH;
        }
        if (pages > 1) {
            y += 2;
            this.button(g, "<", x, y, 16, page > 0, () => { AdminPanel.viewPage = page - 1; this.draw(); });
            text(`${page + 1} / ${pages}`, x + 22, y + 2, AP.STEEL, this.body);
            this.button(g, ">", x + w - 16, y, 16, page < pages - 1, () => { AdminPanel.viewPage = page + 1; this.draw(); });
            y += BUTTON_H;
        }
        return y + 4;
    }

    // their gold and things; admins give or take things by name
    private stashView(g: PIXI.Graphics, x: number, y: number, w: number) {
        const s = AdminPanel.stash, p = AdminPanel.picked, admin = IBC.data.player.role >= Role.ADMIN;
        if (admin) {
            const bw = 30, fw = w - 40 - 4 - (bw + 3) * 2 - 4;
            this.itemField.resize(fw);
            this.place(this.itemField, x, y + 1);
            this.place(this.amountField, x + fw + 4, y + 1);
            const bx = x + fw + 4 + 40 + 4;
            this.button(g, "Give", bx, y, bw, true, () => this.sendItem(1), `Give ${p.n} the thing typed, as many as typed`);
            this.button(g, this.armed == "takeItem" ? "Sure?" : "Take", bx + bw + 3, y, bw, true,
                () => this.sure("takeItem", () => this.sendItem(-1)), `Take the thing typed from ${p.n} (not below none)`, this.armed == "takeItem");
            y += BUTTON_H + 6;
        }
        if (s) {
            const kinds = s.l.length;
            text(`${num(s.g)} gold, ${kinds} kind${kinds == 1 ? "" : "s"} of thing`, x, y, AP.MIST, this.body);
            y += LINE + 2;
        }
        const rows = s ? s.l.slice().sort((a, b) => itemOrder(a[0]) - itemOrder(b[0])) : null;
        return this.paged(g, x, y, w, rows, "Nothing in their stash", ([id, n], ry) => {
            fit(text(itemName(id), x, ry, AP.ASH, this.body), w - 44);
            const amount = text(num(n), 0, ry, AP.WHITE, this.body);
            amount.x = x + w - Math.ceil(amount.textWidth);
            this.hit(x, ry - 1, w, ROW_H, admin ? () => { this.itemField.set(itemName(id)); this.draw(); } : null,
                `${num(n)} ${itemName(id)} (#${id})${admin ? ": click to give or take it" : ""}`);
        });
    }

    // what they've listed, sold and bought, newest first
    private marketView(g: PIXI.Graphics, x: number, y: number, w: number) {
        const now = Date.now();
        return this.paged(g, x, y, w, AdminPanel.trades, "Nothing on the market yet", (t, ry) => {
            const what = `${num(t.n)} ${itemName(t.m)}`;
            let line: string, tint: number, more: string;
            if (t.k == 0) {
                line = `Listed ${what} at ${num(t.g)}g`;
                tint = STATE_TINTS[t.s] ?? AP.ASH;
                more = `Listing #${t.id}, ${day(t.a)}: ${LISTING_STATES[t.s] ?? "?"}${t.l ? `, ${num(t.l)} left` : ""}`;
            } else if (t.k == 1) {
                line = `Sold ${what} to ${t.w}, ${num(t.g)}g`;
                tint = AP.STRAW;
                more = `${day(t.a)}: sold to ${t.w} for ${num(t.g)} gold${t.p ? "" : " (not paid to them yet: as they next sign in)"}`;
            } else {
                line = `Bought ${what} from ${t.w}, ${num(t.g)}g`;
                tint = R64.SKY;
                more = `${day(t.a)}: bought from ${t.w} for ${num(t.g)} gold`;
            }
            fit(text(line, x, ry, tint, this.body), w - 30);
            const when = text(ago(now - t.a), 0, ry, AP.STEEL, this.body);
            when.x = x + w - Math.ceil(when.textWidth);
            this.hit(x, ry - 1, w, ROW_H, null, more);
        });
    }

    // admins: Supporter, their Stripe subscription, and the cosmetic packs
    private paidView(g: PIXI.Graphics, x: number, y: number, w: number) {
        const b = AdminPanel.purchases, p = AdminPanel.picked, now = Date.now();
        if (IBC.data.player.role < Role.ADMIN) return text("Purchases are for admins", x, y, AP.IRON, this.body), y + LINE;
        if (!b) return text("Looking..", x, y, AP.IRON, this.body), y + LINE;

        // Supporter, and days of it given
        fit(text(b.u > now ? `Supporter till ${day(b.u)} (${ago(b.u - now)} more)` : "Not a Supporter", x, y, b.u > now ? AP.STRAW : AP.STONE, this.body), w);
        y += LINE + 2;
        text("Give", x, y + 2, AP.MIST, this.body);
        const dw = Math.floor((w - 26 - 3 * (ADMIN_SUPPORTER_DAYS.length - 1)) / ADMIN_SUPPORTER_DAYS.length);
        ADMIN_SUPPORTER_DAYS.forEach((d, k) => {
            const key = `days${d}`;
            this.button(g, this.armed == key ? "Sure?" : `${d} days`, x + 26 + k * (dw + 3), y, dw, true,
                () => this.sure(key, () => IBC.net.admin.supporter(p.i, d)),
                `Give ${p.n} ${d} days of Supporter, on top of what they have (a change to a Stripe subscription they have sets it again)`, this.armed == key);
        });
        y += BUTTON_H + 6;

        // their subscription, from Stripe's webhook
        text("Subscription", x, y, AP.MIST, this.body);
        y += LINE;
        const s = b.s;
        const lines: [string, number][] = s ? [
            [`${s.t}${s.r ? ", renews" : ", doesn't renew"}`, s.t == "active" || s.t == "trialing" ? R64.LEAF : R64.SALMON],
            [`Paid till ${day(s.u)}, changed ${ago(now - s.a)} ago`, AP.ASH],
        ] : [["None", AP.STONE]];
        for (const [t, tint] of lines) {
            fit(text(t, x, y, tint, this.body), w);
            y += LINE;
        }
        if (b.c) {
            fit(text(b.c, x, y + 2, AP.STEEL, this.body), w - 48);
            this.button(g, "Stripe", x + w - 44, y, 44, true,
                () => window.open(`https://dashboard.stripe.com/customers/${encodeURIComponent(b.c)}`, "_blank", "noopener"),
                "Their payments and refunds, in the Stripe Dashboard");
            y += BUTTON_H + 2;
        } else {
            text("Never been to Stripe's checkout", x, y, AP.STONE, this.body);
            y += LINE;
        }
        y += 4;

        // the cosmetic packs: given or taken
        text("Cosmetic packs", x, y, AP.MIST, this.body);
        y += LINE;
        return this.paged(g, x, y, w, b.k, "No packs made yet (the Cosmetics editor)", ([id, n, got], ry) => {
            fit(text(n, x, ry + 2, got ? AP.WHITE : AP.STONE, this.body), w - 84);
            if (got) text(day(got), x + w - 80, ry + 2, AP.STEEL, this.body);
            const key = `pack${id}`;
            this.button(g, got ? (this.armed == key ? "Sure?" : "Take") : "Give", x + w - 30, ry, 30, true,
                got ? () => this.sure(key, () => IBC.net.admin.pack(p.i, id, 0)) : () => IBC.net.admin.pack(p.i, id, 1),
                got ? `${p.n} got the ${n} pack ${day(got)}: take it back` : `Give ${p.n} the ${n} pack`, this.armed == key);
        }, BUTTON_H + 2);
    }

    // what staff have done to them, newest first
    private logView(g: PIXI.Graphics, x: number, y: number, w: number) {
        const now = Date.now();
        return this.paged(g, x, y, w, AdminPanel.notes, "Staff haven't done anything to them", (n, ry) => {
            fit(text(n.w, x, ry, AP.ASH, this.body), w - 34);
            const when = text(ago(now - n.a), 0, ry, AP.STEEL, this.body);
            when.x = x + w - Math.ceil(when.textWidth);
            this.hit(x, ry - 1, w, ROW_H, null, `${day(n.a)}, by ${n.by}: ${n.w}`);
        });
    }

    //#endregion

    //#region === Reports ===

    private reportsTab(g: PIXI.Graphics, y: number) {
        const W = AdminPanel.W, all = AdminPanel.reports, open = AdminPanel.reportsOpen;
        text(open ? `${open} open${open > all.length ? ` (the newest ${all.length} here)` : ""}` : "No open reports", 4, y + 2, open ? AP.MIST : AP.IRON, this.body);
        this.button(g, "Refresh", W - 4 - 44, y, 44, true, () => IBC.net.admin.reports());
        y += BUTTON_H + 6;
        if (!all.length) return y;

        // the list, a page at a time, on the left
        const top = y, pages = Math.ceil(all.length / REPORTS_SHOWN), page = AdminPanel.page;
        let picked = all.find((r) => r.i == AdminPanel.report);
        if (!picked) AdminPanel.report = (picked = all[0]).i;
        for (const r of all.slice(page * REPORTS_SHOWN, (page + 1) * REPORTS_SHOWN)) {
            const on = r == picked, ry = y;
            if (on) g.beginFill(AP.SLATE).drawRect(2, ry - 1, LIST_W, ROW_H).endFill();
            const n = text(`#${r.i}`, 4, ry, AP.STEEL, this.body);
            fit(text(r.of, 4 + Math.max(22, Math.ceil(n.textWidth) + 4), ry, on ? AP.WHITE : AP.ASH, this.body), LIST_W - 30);
            this.hit(2, ry - 1, LIST_W, ROW_H, () => { AdminPanel.report = r.i; this.draw(); }, `#${r.i}: ${r.of}, ${REPORT_REASONS[r.w]}, ${ago(Date.now() - r.a)} ago`);
            y += ROW_H;
        }
        if (pages > 1) {
            y += 2;
            this.button(g, "<", 4, y, 16, page > 0, () => { AdminPanel.page--; this.draw(); });
            text(`${page + 1} / ${pages}`, 26, y + 2, AP.STEEL, this.body);
            this.button(g, ">", LIST_W - 16, y, 16, page < pages - 1, () => { AdminPanel.page++; this.draw(); });
            y += BUTTON_H;
        }
        const left = y + 4;

        // the one picked, on the right: who, why, and the lines before
        const x = LIST_W + 12, w = W - LIST_W - 16;
        g.beginFill(AP.SLATE).drawRect(LIST_W + 6, top, 1, left - top - 4).endFill();
        let ry = top;
        fit(text(`#${picked.i}: ${picked.of}, ${REPORT_REASONS[picked.w]}`, x, ry, AP.WHITE, this.body), w);
        ry += LINE;
        fit(text(`Reported by ${picked.by}, ${ago(Date.now() - picked.a)} ago`, x, ry, AP.ASH, this.body), w);
        ry += LINE + 2;
        const said = picked.x.split("\n");
        g.beginFill(AP.SHADOW).drawRect(x - 2, ry - 2, w + 2, said.length * 9 + 3).endFill();
        said.forEach((l, k) => {
            const last = k == said.length - 1;
            fit(text(l, x, ry, last ? R64.SALMON : AP.STONE, this.body), w - 2);
            this.hit(x, ry, w, 9, null, l);
            ry += 9;
        });
        ry += 6;
        const bw = Math.floor((w - 4) / 2);
        this.button(g, "See player", x, ry, bw, true, () => { AdminPanel.tab = 0; this.pick(picked.oi); this.draw(); }, `${picked.of}'s account, to mute them`);
        this.button(g, "Done", x + bw + 4, ry, bw, true, () => IBC.net.admin.reportDone(picked.i), "Mark it dealt with");
        ry += BUTTON_H + 4;
        return Math.max(left, ry);
    }

    //#endregion

    //#region === Feedback ===

    // what players wrote (shared/Feedback.ts): the open ones down the left,
    // the one picked on the right, its words wrapped; see who wrote it, or
    // mark it dealt with
    private feedbackTab(g: PIXI.Graphics, y: number) {
        const W = AdminPanel.W, all = AdminPanel.feedback, open = AdminPanel.feedbackOpen;
        text(open ? `${open} open${open > all.length ? ` (the newest ${all.length} here)` : ""}` : "No open feedback", 4, y + 2, open ? AP.MIST : AP.IRON, this.body);
        this.button(g, "Refresh", W - 4 - 44, y, 44, true, () => IBC.net.admin.feedback());
        y += BUTTON_H + 6;
        if (!all.length) return y;

        const top = y, pages = Math.ceil(all.length / FEEDBACK_ROWS), page = AdminPanel.feedbackPage;
        let picked = all.find((f) => f.i == AdminPanel.feedbackPicked);
        if (!picked) AdminPanel.feedbackPicked = (picked = all[0]).i;
        for (const f of all.slice(page * FEEDBACK_ROWS, (page + 1) * FEEDBACK_ROWS)) {
            const on = f == picked, ry = y;
            if (on) g.beginFill(AP.SLATE).drawRect(2, ry - 1, LIST_W, ROW_H).endFill();
            const kind = text(FEEDBACK_KINDS[f.k] ?? "?", 4, ry, f.k == 0 ? R64.SALMON : f.k == 1 ? R64.SKY : AP.STEEL, this.body);
            fit(text(f.by, 4 + Math.max(24, Math.ceil(kind.textWidth) + 4), ry, on ? AP.WHITE : AP.ASH, this.body), LIST_W - 30);
            this.hit(2, ry - 1, LIST_W, ROW_H, () => { AdminPanel.feedbackPicked = f.i; this.draw(); }, `#${f.i}: ${FEEDBACK_KINDS[f.k]} from ${f.by}, ${ago(Date.now() - f.a)} ago`);
            y += ROW_H;
        }
        if (pages > 1) {
            y += 2;
            this.button(g, "<", 4, y, 16, page > 0, () => { AdminPanel.feedbackPage--; this.draw(); });
            text(`${page + 1} / ${pages}`, 26, y + 2, AP.STEEL, this.body);
            this.button(g, ">", LIST_W - 16, y, 16, page < pages - 1, () => { AdminPanel.feedbackPage++; this.draw(); });
            y += BUTTON_H;
        }
        const left = y + 4;

        const x = LIST_W + 12, w = W - LIST_W - 16;
        g.beginFill(AP.SLATE).drawRect(LIST_W + 6, top, 1, left - top - 4).endFill();
        let ry = top;
        fit(text(`#${picked.i}: ${FEEDBACK_KINDS[picked.k]} from ${picked.by}`, x, ry, AP.WHITE, this.body), w);
        ry += LINE;
        fit(text(`${ago(Date.now() - picked.a)} ago${picked.d ? `, ${picked.d}` : ""}${picked.v ? `, ${picked.v}` : ""}`, x, ry, AP.ASH, this.body), w);
        ry += LINE + 2;
        const said = text(picked.t, x, ry, AP.MIST, this.body);
        said.maxWidth = w - 2;
        const h = Math.ceil(said.textHeight) + 3;
        g.beginFill(AP.SHADOW).drawRect(x - 2, ry - 2, w + 2, h + 1).endFill();
        ry += h + 4;
        const bw = Math.floor((w - 4) / 2);
        this.button(g, "See player", x, ry, bw, true, () => { AdminPanel.tab = 0; this.pick(picked.bi); this.draw(); }, `${picked.by}'s account`);
        this.button(g, "Done", x + bw + 4, ry, bw, true, () => IBC.net.admin.feedbackDone(picked.i), "Mark it dealt with");
        ry += BUTTON_H + 4;
        return Math.max(left, ry);
    }

    //#endregion

    //#region === Server ===

    private server(g: PIXI.Graphics, y: number) {
        const W = AdminPanel.W;
        text("Announce, in General chat to everyone", 4, y, AP.MIST, this.body);
        y += 12;
        this.sayField.resize(W - 8 - 56 - 4);
        this.place(this.sayField, 4, y + 1);
        this.button(g, "Announce", W - 4 - 56, y, 56, true, () => this.announce(), "Said from \"Announcement\", marked as the events' lines are");
        y += BUTTON_H + 10;

        text("Start an event", 4, y, AP.MIST, this.body);
        y += 12;
        const kinds: [string, number, string][] = [["Any", -1, "Any kind, somewhere it fits"]];
        EVENT_KINDS.forEach((d) => kinds.push([d.name, d.kind, `${d.name}: ${d.hours} hours, somewhere it fits with none on`]));
        const bw = Math.floor((W - 8 - (kinds.length - 1) * 3) / kinds.length);
        kinds.forEach(([name, k, more], n) => this.button(g, name, 4 + n * (bw + 3), y, bw, true, () => IBC.net.admin.event(k), more));
        y += BUTTON_H + 4;
        text("Its goal goes by how many players are about", 4, y, AP.STONE, this.body);
        y += LINE + 6;

        // something to turn up on the map for a while (shared/Sights.ts)
        text("Something turns up", 4, y, AP.MIST, this.body);
        y += 12;
        const sights: [string, number, string][] = [["Any", -1, "Any kind there's room for"]];
        KIND_NAMES.forEach((name, k) => sights.push([name, k, `${name}, somewhere it fits`]));
        const sw = Math.floor((W - 8 - (sights.length - 1) * 3) / sights.length);
        sights.forEach(([name, k, more], n) => this.button(g, name, 4 + n * (sw + 3), y, sw, true, () => IBC.net.admin.sight(k), more));
        y += BUTTON_H + 4;
        return y + 4;
    }

    //#endregion

    //#region === Pieces ===

    private place(f: TextField, x: number, y: number) {
        f.container.position.set(x, y);
        this.body.addChild(f.container);
    }

    // somewhere to point at (and click, if `on`), saying what it is along the bottom
    private hit(x: number, y: number, w: number, h: number, on: () => void, more?: string) {
        const area = new PIXI.Container();
        area.eventMode = "static";
        area.hitArea = new PIXI.Rectangle(x, y, w, h);
        if (on) {
            area.cursor = "pointer";
            area.on("pointertap", on);
        }
        if (more) {
            area.on("pointerover", () => this.showInfo(more));
            area.on("pointerout", () => this.showInfo());
        }
        this.body.addChild(area);
        return area;
    }

    // `warn`: asking "Sure?"; `on`: the one that's so now (framed gold)
    private button(g: PIXI.Graphics, label: string, x: number, y: number, w: number, can: boolean, click: () => void, more?: string, warn = false, on = false) {
        if (on) g.beginFill(AP.STRAW).drawRect(x - 1, y - 1, w + 2, BUTTON_H + 2).endFill();
        g.beginFill(warn ? AP.MAROON : can ? AP.IRON : AP.SLATE).drawRect(x, y, w, BUTTON_H).endFill();
        g.beginFill(warn ? AP.RED : can ? AP.STEEL : AP.IRON).drawRect(x, y, w, 1).endFill();
        const t = fit(text(label, 0, y + 2, can || on ? AP.WHITE : AP.STONE, this.body), w - 4);
        t.x = Math.round(x + (w - t.textWidth) / 2);
        this.hit(x, y, w, BUTTON_H, can ? click : null, more);
    }

    //#endregion

}

function text(text: string, x: number, y: number, tint: number, parent: PIXI.Container, size = 32) {
    const t = new PIXI.BitmapText(text, { fontName: Constants.PIXEL_FONT, fontSize: size });
    t.tint = tint;
    t.position.set(Math.round(x), Math.round(y));
    t.eventMode = "none";
    parent.addChild(t);
    return t;
}

function num(n: number) {
    return Math.round(n).toLocaleString("en-US");
}

function article(word: string) {
    return /^[AEIOU]/.test(word) ? "an" : "a";
}

// how long, roughly: 45s, 12m, 3h 20m, 2d 4h
function ago(ms: number) {
    const s = Math.max(0, Math.floor(ms / 1000));
    if (s < 60) return `${s}s`;
    const m = Math.floor(s / 60);
    if (m < 60) return `${m}m`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ${m % 60}m`;
    return `${Math.floor(h / 24)}d ${h % 24}h`;
}

// "26 Oct 2026"
function day(ms: number) {
    return new Date(ms).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

// the thing typed: by #id, its whole name, or the only one whose name has
// the words typed - else why not
function findItem(typed: string): number | string {
    const q = typed.trim().toLowerCase();
    if (!q) return "Type a thing's name first";
    if (/^#\d+$/.test(q)) return isItem(Number(q.slice(1))) ? Number(q.slice(1)) : "There's no such thing";
    const whole = ALL_ITEMS.find((id) => itemName(id).toLowerCase() == q);
    if (whole) return whole;
    const found = ALL_ITEMS.filter((id) => itemMatches(id, q));
    if (found.length == 1) return found[0];
    if (!found.length) return "Nothing's called that";
    return `Which? ${found.slice(0, 4).map(itemName).join(", ")}${found.length > 4 ? `, and ${found.length - 4} more` : ""}`;
}
