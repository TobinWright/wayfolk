import * as PIXI from "pixi.js";
import {
    Analytics as Snapshot, ANALYTICS_DAYS, AWAY_GAPS, BOUNCE_S, COHORT_WEEKS, GONE_AFTER_DAYS, IDLE_AFTER_MS, ONLINE_SAMPLE_MS,
    PLAYTIMES, SESSION_COUNTS, SESSION_LENGTHS,
} from "../../../../shared/Analytics";
import { STEPS } from "../../../../shared/Guide";
import { JOBS, SKILL_NAMES } from "../../../../shared/Heroes";
import { TASK_NAMES } from "../../../../shared/Tasks";
import { churnIcon, featuresIcon, overviewIcon, playersIcon, retentionIcon, socialIcon, timeIcon } from "../../art/AnalyticsIcons";
import { heroesIcon, wealthIcon } from "../../art/BoardIcons";
import { Constants } from "../../constants/Constants";
import { Event } from "../../constants/Events";
import { AP, R64 } from "../../constants/Palette";
import { IBC } from "../../Engine";
import { Panel } from "../../shared/Panel";
import { TitleBar } from "../../shared/ui/titlebar/TitleBar";
import { BaseComponent, ComponentType } from "../BaseComponent";
import { Chat } from "../chat/Chat";
import { fit } from "../heroroster/HeroRoster";

// The admin's Analytics (the user, 2026-10-29: "a comprehensive analytics
// component in the admin menu"), from the admin menu: a snapshot of the game
// from the server (shared/Analytics.ts, server managers/analytics), asked
// for as it opens and every REFRESH_MS while it's open. A tab a subject
// along the top, an icon each (the user, 2026-10-29: "make analytics tabs
// into icons") - Overview, Players, Play time, Retention, Heroes, Economy,
// Social, Features, Churn - each a row of numbers then charts. Each chart is
// one series in one colour; point at a bar or a row to read it exactly along
// the bottom.
//
// As big as the screen allows (the user, 2026-11-01: "a bigger window"), a
// tab taller than that scrolled with the wheel between the tabs and the line
// along the bottom. Staff are left out of what's recorded as they play (play
// time, retention, features, churn) unless Staff is switched on.

const TABS = [
    { name: "Overview", icon: overviewIcon },
    { name: "Players", icon: playersIcon },
    { name: "Play time", icon: timeIcon },
    { name: "Retention", icon: retentionIcon },
    { name: "Heroes", icon: heroesIcon },
    { name: "Economy", icon: wealthIcon },
    { name: "Social", icon: socialIcon },
    { name: "Features", icon: featuresIcon },
    { name: "Churn", icon: churnIcon },
];
const REFRESH_MS = 30 * 1000;
const EDGE = 6;
const TAB_W = 16, TAB_H = 14, TAB_GAP = 2;
const HEAD_H = EDGE + 18;       // (the tabs, above what scrolls)
const FOOT_H = 16;              // (the line along the bottom)
const TILE_H = 22, TILE_GAP = 4;
const ROW_H = 9;                // a row of a list
const CHART_H = 48;
const CELL_H = 10;              // a row of the retention grid
const SECTION_GAP = 6;
const BUTTON_H = 12;
const SCROLL_STEP = 24;
const MIN_W = 300, MAX_W = 560; // (its own px)
const BAR = R64.SKY, BAR_ON = AP.ICE;

// windows only staff open, or that open by themselves: left out of "not opened"
const NOT_FEATURES = new Set([
    ComponentType.MAP, ComponentType.TITLE, ComponentType.GOLD_DISPLAY, ComponentType.CHAT, ComponentType.CHOICE_PROMPT,
    ComponentType.MAIN_MENU, ComponentType.MORE_MENU, ComponentType.AWAY_SUMMARY, ComponentType.GUIDE, ComponentType.BLACKJACK_BUTTON, ComponentType.SLIME_RACE_BUTTON, ComponentType.ITEM_TOASTS,
    ComponentType.SCREEN_FX, ComponentType.LOOT_CHEST, ComponentType.DELIGHT, ComponentType.BOUNTY_BOX,
    ComponentType.NODE_EDITOR, ComponentType.MAP_EDITOR, ComponentType.ADMIN_MENU, ComponentType.ADMIN_PANEL, ComponentType.ANALYTICS,
    ComponentType.COSMETIC_EDITOR, ComponentType.DEMO_MODE,
]);

export class Analytics extends BaseComponent {

    public static SCALE = 2;
    public static INSET_X = 12;         // the window round it, in screen px
    public static INSET_Y = 28;

    private static last: Snapshot = null;     // (kept: open it again and it's there at once)

    private static tab = 0;         // (kept from one opening to the next)
    private static staff = false;   // (staff counted in what's recorded as they play)
    private W = MIN_W;              // (its own px, to fit the screen)
    private maxView = 200;          // (the most of a tab shown at once)
    private viewH = 0;
    private pageH = 0;
    private scroll = 0;
    private asking = false;
    private line = "";
    private lineTint: number = AP.ASH;
    private timer: any;
    private clock: any;
    private h = 0;

    public background: Panel;
    public titleBar: TitleBar;
    private content: PIXI.Container;
    private back = new PIXI.Graphics();
    private body = new PIXI.Container();
    private layer: PIXI.Container;          // (what's being drawn into: the header, or the page that scrolls)
    private inner: PIXI.Container;          // (the page, moved up as it scrolls)
    private bar = new PIXI.Graphics();      // (the scroll bar)
    private info: PIXI.BitmapText;
    private age: PIXI.BitmapText;
    private hover = new PIXI.Graphics();

    private keys = (e: KeyboardEvent) => {
        if (e.key == "Escape" && !Chat.takes(e)) IBC.comp.destroy(this);
    };

    constructor() {
        super(ComponentType.ANALYTICS);
        this.create();
    }

    public create() {
        super.create();
        const { INSET_X, INSET_Y } = Analytics;

        this.container.eventMode = "static";
        this.container.on("pointerdown", (e: PIXI.FederatedPointerEvent) => e.stopPropagation());
        this.container.on("wheel", (e: PIXI.FederatedWheelEvent) => {
            e.stopPropagation();
            this.scrollBy(e.deltaY < 0 ? -SCROLL_STEP : SCROLL_STEP);
        });
        this.background = new Panel(this.container);
        this.titleBar = new TitleBar(this);
        this.titleBar.setPosition(4, 4);
        this.titleBar.setTitle("Analytics");

        this.content = new PIXI.Container();
        this.content.scale.set(Analytics.SCALE);
        this.content.position.set(INSET_X, INSET_Y);
        this.content.addChild(this.back, this.body);
        this.container.addChild(this.content);

        window.addEventListener("keydown", this.keys);
        IBC.events.register(Event.ANALYTICS, (a: Snapshot) => {
            Analytics.last = a;
            this.asking = false;
            this.say("");
            this.draw();
        }, this);
        IBC.events.register(Event.ANALYTICS_REFUSED, (why: string) => {
            this.asking = false;
            this.say(why, R64.SALMON);
            this.draw();
        }, this);
        this.timer = setInterval(() => this.ask(), REFRESH_MS);
        this.clock = setInterval(() => this.showAge(), 1000);
        this.fitScreen();
        this.ask();
        this.draw();
        this.centre();
    }

    public destroy() {
        super.destroy();
        clearInterval(this.timer);
        clearInterval(this.clock);
        window.removeEventListener("keydown", this.keys);
        IBC.events.unregisterAll(this);
        this.titleBar.destroy();
        this.background.destroy();
        this.container.destroy({ children: true });
    }

    public resize() {
        this.fitScreen();
        this.draw();
        this.centre();
    }

    private ask() {
        if (this.asking) return;
        this.asking = true;
        IBC.net.analytics.get(Analytics.staff);
        this.showAge();
    }

    //#region === Drawing ===

    // as wide and tall as the screen allows, within MIN_W and MAX_W
    private fitScreen() {
        const { SCALE, INSET_X, INSET_Y } = Analytics;
        this.W = Math.max(MIN_W, Math.min(MAX_W, Math.floor((window.innerWidth - 16 - INSET_X * 2) / SCALE)));
        this.maxView = Math.max(80, Math.floor((window.innerHeight - 16 - INSET_Y - INSET_X) / SCALE) - HEAD_H - FOOT_H - 8);
    }

    private centre() {
        const { width, height } = this.size();
        this.setPosition(Math.max(0, Math.round((window.innerWidth - width) / 2)), Math.max(8, Math.round((window.innerHeight - height) / 2)));
    }

    private size() {
        const { SCALE, INSET_X, INSET_Y } = Analytics;
        return { width: INSET_X * 2 + this.W * SCALE, height: INSET_Y + this.h * SCALE + INSET_X };
    }

    private say(line: string, tint: number = AP.ASH) {
        this.line = line;
        this.lineTint = tint;
    }

    // the line along the bottom: what's pointed at, else what was said, else a hint
    private showInfo(pointed?: string) {
        if (!this.info) return;
        this.info.text = pointed ?? (this.line || (this.pageH > this.viewH ? "Point at a bar or a row to read it - scroll for more" : "Point at a bar or a row to read it"));
        this.info.tint = pointed ? AP.WHITE : this.line ? this.lineTint : AP.STONE;
        fit(this.info, this.W - 8);
    }

    private showAge() {
        if (!this.age) return;
        const a = Analytics.last;
        this.age.text = this.asking ? "Updating..." : a ? `Updated ${ago(Date.now() - a.at)} ago` : "";
        this.age.x = this.ageRight - Math.ceil(this.age.textWidth);
    }
    private ageRight = 0;

    private scrollBy(dy: number) {
        const most = Math.max(0, this.pageH - this.viewH);
        const to = Math.max(0, Math.min(most, this.scroll + dy));
        if (to == this.scroll || !this.inner) return;
        this.scroll = to;
        this.inner.y = -to;
        this.hover.clear();
        this.showInfo();
        this.paintBar();
    }

    private paintBar() {
        this.bar.clear();
        if (this.pageH <= this.viewH) return;
        const x = this.W + 1, h = Math.max(8, Math.round(this.viewH * this.viewH / this.pageH));
        const y = HEAD_H + Math.round((this.viewH - h) * this.scroll / (this.pageH - this.viewH));
        this.bar.beginFill(AP.SHADOW).drawRect(x, HEAD_H, 2, this.viewH).endFill()
            .beginFill(AP.STEEL).drawRect(x, y, 2, h).endFill();
    }

    private draw() {
        this.body.removeChildren().forEach((c) => { if (c != this.bar) c.destroy({ children: true }); });
        this.info = this.age = null;
        this.layer = this.body;
        const W = this.W;
        const g = new PIXI.Graphics();
        this.body.addChild(g);

        // the tabs, then Staff and Refresh
        // (an icon each, framed gold when picked, lit when pointed at; its name beside them)
        let x = 0;
        const ty = EDGE - 3;
        TABS.forEach((t, k) => {
            const on = k == Analytics.tab, tx = x;
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
            const area = this.hit(tx, ty, TAB_W, TAB_H, on ? null : () => { Analytics.tab = k; this.scroll = 0; this.draw(); }, t.name);
            area.on("pointerover", () => { paint(true); icon.alpha = 1; });
            area.on("pointerout", () => { paint(false); icon.alpha = on ? 1 : 0.75; });
            x += TAB_W + TAB_GAP;
        });
        text(TABS[Analytics.tab].name, x + 4, EDGE, AP.WHITE, this.body);
        let right = this.button(g, "Refresh", W, EDGE - 2, !this.asking, () => this.ask(), "Ask for the numbers again (they come every 30 seconds)");
        right = this.button(g, Analytics.staff ? "Staff in" : "Staff out", right - 4, EDGE - 2, true, () => {
            Analytics.staff = !Analytics.staff;
            this.asking = false;
            this.ask();
            this.draw();
        }, Analytics.staff ? "Staff are counted in play time, retention, features and churn: click to leave them out"
            : "Staff are left out of play time, retention, features and churn: click to count them");
        this.ageRight = right - 6;
        this.age = text("", 0, EDGE, AP.STEEL, this.body);
        this.showAge();

        // the tab, in a page that scrolls
        const page = new PIXI.Container();
        page.y = HEAD_H;
        this.inner = new PIXI.Container();
        const pg = new PIXI.Graphics();
        this.hover = new PIXI.Graphics();
        this.hover.eventMode = "none";
        this.inner.addChild(pg);
        page.addChild(this.inner);
        this.body.addChild(page);
        this.layer = this.inner;

        let y = 0;
        const a = Analytics.last;
        if (!a) {
            text(this.line || "Gathering the numbers...", 4, y, this.line ? this.lineTint : AP.ASH, this.layer);
            y += 20;
        } else {
            switch (Analytics.tab) {
                case 0: y = this.overview(pg, a, y); break;
                case 1: y = this.players(pg, a, y); break;
                case 2: y = this.playTime(pg, a, y); break;
                case 3: y = this.retention(pg, a, y); break;
                case 4: y = this.heroes(pg, a, y); break;
                case 5: y = this.economy(pg, a, y); break;
                case 6: y = this.social(pg, a, y); break;
                case 7: y = this.features(pg, a, y); break;
                case 8: y = this.churn(pg, a, y); break;
            }
        }
        this.inner.addChild(this.hover);
        this.pageH = y;
        this.viewH = Math.min(y, this.maxView);
        this.scroll = Math.max(0, Math.min(this.scroll, this.pageH - this.viewH));
        this.inner.y = -this.scroll;
        const mask = new PIXI.Graphics().beginFill(0xffffff).drawRect(-4, 0, W + 8, this.viewH).endFill();
        page.addChild(mask);
        page.mask = mask;
        this.layer = this.body;
        this.body.addChild(this.bar);
        this.paintBar();

        // what's pointed at, along the bottom
        y = HEAD_H + this.viewH + 2;
        g.beginFill(AP.SLATE).drawRect(0, y, W, 1).endFill();
        this.info = text("", 4, y + 4, AP.STONE, this.body);
        this.showInfo();
        y += FOOT_H - 2;

        this.h = y;
        this.back.clear().beginFill(AP.INK).drawRect(-4, -2, W + 8, this.h + 6).endFill();
        const { width, height } = this.size();
        this.background.setSize(width, height);
        this.titleBar.setSize(width - 8, 20);
        this.container.hitArea = new PIXI.Rectangle(0, 0, width, height);
    }

    //#endregion

    //#region === Tabs ===

    private overview(g: PIXI.Graphics, a: Snapshot, y: number) {
        const s = a.server, p = a.players, t = a.time;
        y = this.tiles(g, y, [
            ["Online now", num(s.online), `${num(s.loaded)} loaded with away heroes`],
            ["Peak online", num(s.peak), `since the server started, ${ago(a.at - s.peakAt)} ago`],
            ["Played today", num(t.today), `players signed in today (${num(t.wau)} this week, ${num(t.mau)} this month)`],
            ["New 24h", num(p.new1), `${num(p.new7)} this week, ${num(p.new30)} this month`],
            ["Stickiness", t.mau ? pct(t.today, t.mau) : "-", "today's players of this month's: how many come back daily (20%+ is good)"],
        ]);
        y = this.tiles(g, y, [
            ["Players", num(p.total), `${num(p.guest)} guests, ${num(p.email)} email, ${num(p.google)} Google`],
            ["Heroes", num(a.heroes.total), `${(a.heroes.total / Math.max(1, p.total)).toFixed(1)} a player`],
            ["Supporters", num(p.premium), `${pct(p.premium, p.total)} of players, ${num(p.subs)} subscribed`],
            ["Session", t.sessions7 ? dur(t.medianSession) : "-", `the median sign-in lasts this long (the last 7 days; mean ${dur(t.meanSession)})`],
            ["Gold held", short(a.economy.gold), `${num(a.economy.gold)} gold in every stash`],
        ]);

        // who's been signed in over the last day (-1: the server wasn't up)
        const samples = s.day.map((n) => Math.max(0, n));
        const n = s.day.length, step = ONLINE_SAMPLE_MS / 60000;
        y = this.columns(g, y, "Signed in, the last 24 hours", samples, (k) => s.day[k] < 0 ? "The server wasn't up yet" : `${minutesAgo((n - 1 - k) * step)}: ${num(s.day[k])} signed in`, "24h ago", "now");

        const half = (this.W - 8) / 2;
        const left = this.columns(g, y, `Players a day, ${ANALYTICS_DAYS} days`, t.dau, (k) => `${dayName(ANALYTICS_DAYS - 1 - k)}: ${num(t.dau[k])} played`, `${ANALYTICS_DAYS}d ago`, "today", CHART_H, 0, half);
        const right = this.columns(g, y, `New players a day, ${ANALYTICS_DAYS} days`, p.signups, (k) => `${dayName(ANALYTICS_DAYS - 1 - k)}: ${num(p.signups[k])} new`, `${ANALYTICS_DAYS}d ago`, "today", CHART_H, half + 8, half);
        y = Math.max(left, right);

        text(`Server up ${ago(s.up)}  -  ${num(s.heap)} MB in use  -  ${num(s.lag)} ms lag  -  ${num(a.social.reportsOpen)} chat report${a.social.reportsOpen == 1 ? "" : "s"} open  -  ${num(a.feedback.open)} feedback open`, 4, y, AP.ASH, this.layer);
        return y + 12;
    }

    private players(g: PIXI.Graphics, a: Snapshot, y: number) {
        const p = a.players;
        y = this.tiles(g, y, [
            ["Active 7d", num(p.active7), `${pct(p.active7, p.total)} of players`],
            ["Active 30d", num(p.active30), `${pct(p.active30, p.total)} of players`],
            ["Staff", num(p.staff), "moderators, editors and admins"],
            ["Muted", num(p.muted), "muted in chat now"],
        ]);
        const names = ["Day 1", "Day 7", "Day 30"];
        y = this.tiles(g, y, p.retention.map(([back, of], k) =>
            [`Back ${names[k].toLowerCase()}`, of ? pct(back, of) : "-", `${num(back)} of ${num(of)} seen ${names[k] == "Day 1" ? "a day" : names[k] == "Day 7" ? "a week" : "a month"} after starting`] as [string, string, string]).concat([
            ["Guests", pct(p.guest, p.total), `${num(p.guest)} haven't saved an account`],
        ]));

        y = this.columns(g, y, `Last seen, by day (${ANALYTICS_DAYS} days)`, p.lastSeen, (k) => `${dayName(ANALYTICS_DAYS - 1 - k)}: ${num(p.lastSeen[k])} last seen`, `${ANALYTICS_DAYS}d ago`, "today");

        // the first steps, as a funnel: of those with the guide
        const with_ = p.guide[STEPS.length];
        y = this.rows(g, y, `First steps (of ${num(with_)} with the guide)`, STEPS.map((step, k) => [step.name, p.guide[k]]),
            (v) => pct(v, with_), (name, v) => `${name}: ${num(v)} players, ${pct(v, with_)}`);
        return y;
    }

    // how long they play, how much of it idle, and how long they stay away
    private playTime(g: PIXI.Graphics, a: Snapshot, y: number) {
        const t = a.time, half = (this.W - 8) / 2;
        if (!t.since) return this.nothingYet(y, "Nothing recorded yet: play time is recorded from each sign-in on.");
        y = this.tiles(g, y, [
            ["Median session", dur(t.medianSession), `half of sign-ins last longer (the last 7 days, ${num(t.sessions7)} of them)`],
            ["Mean session", dur(t.meanSession), "the average sign-in, the last 7 days"],
            ["A day", `${num(t.dailyMinutes)}m`, "minutes signed in a day, by those who played that day"],
            ["Sign-ins a day", t.perDay.toFixed(1), "by those who played that day"],
            ["Playing", pct(t.busyShare, 1), `of the time signed in they were playing: the rest idle (tab hidden, or nothing pressed for ${IDLE_AFTER_MS / 60000} minutes)`],
        ]);
        y = this.tiles(g, y, [
            ["Away (median)", t.returns ? dur(t.medianGap) : "-", `between sign-ins (mean ${dur(t.meanGap)}), ${num(t.returns)} returns the last 7 days`],
            ["Heroes stopped", t.returns ? pct(t.stalledReturns, t.returns) : "-", `of returns came after their heroes had stopped working (away past the limit): ${num(t.stalledReturns)}`],
            ["Stopped time", pct(t.stalledShare, 1), "of all the time away, their heroes had stopped"],
            ["First sessions", num(t.firsts), "new players' first sign-ins, the last 30 days"],
            ["Came back", t.firsts ? pct(t.secondShare, 1) : "-", `of new players signed in a second time (of those who started a day or more ago); first session median ${dur(t.medianFirst)}`],
        ]);

        const days = (k: number) => dayName(ANALYTICS_DAYS - 1 - k);
        const left = this.columns(g, y, "Hours signed in a day", t.played, (k) => `${days(k)}: ${t.played[k]} hours signed in`, `${ANALYTICS_DAYS}d ago`, "today", CHART_H, 0, half);
        const right = this.columns(g, y, "Hours actively playing a day", t.busy, (k) => `${days(k)}: ${t.busy[k]} hours playing (${pct(t.busy[k], t.played[k])})`, `${ANALYTICS_DAYS}d ago`, "today", CHART_H, half + 8, half);
        y = Math.max(left, right);

        const sessions = t.lengths.reduce((s, v) => s + v, 0);
        const lengths = this.rows(g, y, "Session lengths, 7 days", SESSION_LENGTHS.map((b, k) => [b.name, t.lengths[k]]), num,
            (n, v) => `${n}: ${num(v)} sign-ins, ${pct(v, sessions)}`, 4, half - 4);
        const gaps = this.rows(g, y, "Time away before coming back", AWAY_GAPS.map((b, k) => [b.name, t.gaps[k]]), num,
            (n, v) => `Away ${n}: ${num(v)} returns, ${pct(v, t.returns)}`, 4 + half + 4, half - 4);
        y = Math.max(lengths, gaps);

        // by the hour of the day, in this computer's time
        const offset = Math.round(-new Date().getTimezoneOffset() / 60);
        const local = Array.from({ length: 24 }, (_, h) => t.byHour[((h - offset) % 24 + 24) % 24]);
        y = this.columns(g, y, "Minutes played by hour of day, 7 days (your time)", local, (h) => `${h}:00-${h}:59: ${num(local[h])} minutes signed in`, "0:00", "23:00");

        const players = t.devices.reduce((s, d) => s + d[1], 0), comers = t.sources.reduce((s, d) => s + d[1], 0);
        const devices = this.rows(g, y, "Devices, 30 days", t.devices.map(([d, n]) => [cap(d), n]), num, (n, v) => `${n}: ${num(v)} players, ${pct(v, players)}`, 4, half - 4);
        const sources = this.rows(g, y, "Where new players came from, 30 days", t.sources.map(([s, n]) => [s, n]), num, (n, v) => `${n}: ${num(v)} new players, ${pct(v, comers)}`, 4 + half + 4, half - 4);
        y = Math.max(devices, sources);
        text(`Recorded since ${dateName(t.since)}. Sources: add ?ref=name to a link you share to see it here.`, 4, y, AP.STEEL, this.layer);
        return y + 12;
    }

    // a grid of weekly cohorts: of those who started each week, how many played each week after
    private retention(g: PIXI.Graphics, a: Snapshot, y: number) {
        const c = a.cohorts, p = a.players;
        if (!c.length) return this.nothingYet(y, "Nothing recorded yet: retention is counted for players who start from now on.");
        // week 1 and week 4, over every cohort old enough
        const share = (week: number) => {
            let back = 0, of = 0;
            for (const r of c) if (r.weeks.length > week + 1 || (r.weeks.length > week && Date.now() - r.start > (week + 1) * 7 * 86400000)) { back += r.weeks[week]; of += r.size; }
            return of ? pct(back, of) : "-";
        };
        y = this.tiles(g, y, [
            ["Back day 1", p.retention[0][1] ? pct(...p.retention[0]) : "-", "seen a day or more after starting (every player ever)"],
            ["Back day 7", p.retention[1][1] ? pct(...p.retention[1]) : "-", "seen a week or more after starting"],
            ["Week 1", share(1), "of those who started, played in their second week (every cohort old enough)"],
            ["Week 4", share(4), "played in their fifth week"],
            ["Started", num(c.reduce((s, r) => s + r.size, 0)), `in the last ${COHORT_WEEKS} weeks`],
        ]);
        y = this.grid(g, y, "Played each week after starting, by the week they started", c);
        text("Week 0 is the week they started. Darker means fewer came back.", 4, y, AP.STEEL, this.layer);
        return y + 12;
    }

    private heroes(g: PIXI.Graphics, a: Snapshot, y: number) {
        const h = a.heroes, half = (this.W - 8) / 2;
        y = this.tiles(g, y, [
            ["Heroes", num(h.total), "hired, in every roster"],
            ["Per player", (h.total / Math.max(1, a.players.total)).toFixed(1), `${num(h.rosters[0] ?? 0)} players have none`],
            ["Hurt", num(h.hurt), `${pct(h.hurt, h.total)} of heroes`],
            ["Working", num(h.total - (h.doing[TASK_NAMES.length] ?? 0)), "not idle or resting"],
            ["Idle", pct(h.doing[TASK_NAMES.length] ?? 0, h.total), `${num(h.doing[TASK_NAMES.length] ?? 0)} heroes with nothing to do or resting`],
        ]);

        const doing: [string, number][] = TASK_NAMES.map((n, k) => [n, h.doing[k]] as [string, number]).concat([["Idle / resting", h.doing[TASK_NAMES.length]]]);
        const left = this.rows(g, y, "What they're doing", doing, num, (n, v) => `${n}: ${num(v)} heroes, ${pct(v, h.total)}`, 4, half - 4);
        const right = this.rows(g, y, "Jobs", JOBS.map((j, k) => [j.name, h.jobs[k]]), num, (n, v) => `${n}: ${num(v)} heroes, ${pct(v, h.total)}`, 4 + half + 4, half - 4);
        y = Math.max(left, right);

        // two columns: the skills beside where they are and roster sizes; the best beside their levels
        const skills = this.rows(g, y, "Average skill level", SKILL_NAMES.map((n, k) => [n, h.skills[k]]), (v) => v.toFixed(1), (n, v) => `${n}: level ${v.toFixed(1)} on average`, 4, half - 4);
        const places = this.rows(g, y, "Where they are most", h.places, num, (n, v) => `${n}: ${num(v)} heroes`, 4 + half + 4, half - 4);
        const rosters = this.columns(g, places, "Players by roster size", h.rosters, (k) => `${k} hero${k == 1 ? "" : "es"}: ${num(h.rosters[k])} players`, "0", `${h.rosters.length - 1}`, 24, 4 + half + 4, half - 4);
        y = Math.max(skills, rosters);

        const top = this.rows(g, y, "Highest total level", h.top.map(([n, who, l]) => [`${n} (${who})`, l]), num, (n, v) => `${n}: total level ${num(v)}`, 4, half - 4);
        const levels = this.columns(g, y, "Heroes by total level", h.levels, (k) => `Total level ${k * 10}-${k * 10 + 9}: ${num(h.levels[k])} heroes`, "0", `${h.levels.length * 10}`, 40, 4 + half + 4, half - 4);
        return Math.max(top, levels);
    }

    private economy(g: PIXI.Graphics, a: Snapshot, y: number) {
        const e = a.economy, half = (this.W - 8) / 2;
        y = this.tiles(g, y, [
            ["Gold held", short(e.gold), `${num(e.gold)} gold in every stash`],
            ["Median stash", short(e.goldMedian), `${num(e.goldMedian)} gold: half have less`],
            ["On the market", num(e.listings), `listings, worth ${num(e.listed)} gold`],
            ["Sales 7d", num(e.sales7), `${num(e.gold7)} gold changed hands this week`],
        ]);
        y = this.tiles(g, y, [
            ["Sales ever", num(e.sales), `${num(e.goldAll)} gold in all`],
            ["Blackjack", num(e.bjPlayers), `players, ${num(e.bjHands)} hands`],
            ["House edge", short(-e.bjNet), e.bjNet > 0 ? `players are ${num(e.bjNet)} gold up` : `players are ${num(-e.bjNet)} gold down`],
            ["Avg stash", short(Math.round(e.gold / Math.max(1, a.players.total))), "gold a player"],
        ]);
        const left = this.rows(g, y, "Most gold", e.rich, short, (n, v) => `${n}: ${num(v)} gold`, 4, half - 4);
        const right = this.rows(g, y, "Most held, every stash", e.items, short, (n, v) => `${n}: ${num(v)} held`, 4 + half + 4, half - 4);
        y = Math.max(left, right);
        y = this.rows(g, y, "Sold most on the market, 30 days", e.topSold, short, (n, v) => `${n}: ${num(v)} sold`);
        return y;
    }

    private social(g: PIXI.Graphics, a: Snapshot, y: number) {
        const s = a.social;
        y = this.tiles(g, y, [
            ["Guilds", num(s.guilds), `${num(s.guildMembers)} members`],
            ["In a guild", pct(s.guildMembers, a.players.total), "of players"],
            ["Friendships", num(s.friendships), `${num(s.asks)} asks waiting`],
            ["Whispers 7d", num(s.whispers7), "sent this week"],
        ]);
        y = this.tiles(g, y, [
            ["Reports open", num(s.reportsOpen), `${num(s.reports)} chat reports ever`],
            ["Events on", num(s.eventsOn), `${num(s.events)} events ever`],
            ["Events won", s.eventsWon + s.eventsLost ? pct(s.eventsWon, s.eventsWon + s.eventsLost) : "-", `${num(s.eventsWon)} won, ${num(s.eventsLost)} lost`],
            ["Event givers", num(s.eventGivers), `${pct(s.eventGivers, a.players.total)} of players have given`],
        ]);
        y = this.rows(g, y, "Events", [["Won", s.eventsWon], ["Lost", s.eventsLost], ["On now", s.eventsOn]], num, (n, v) => `${n}: ${num(v)} events`);
        return y;
    }

    // which windows are opened and what's done, by how many of the week's players
    private features(g: PIXI.Graphics, a: Snapshot, y: number) {
        const f = a.features, half = (this.W - 8) / 2, of = f.players7;
        if (!f.windows.length && !f.actions.length) return this.nothingYet(y, "Nothing recorded yet: what players open and do is counted from now on.");
        const opened = new Set(f.windows.map((w) => w[0]));
        const never = Object.keys(ComponentType).filter((k) => isNaN(Number(k)) && !opened.has(k) && !NOT_FEATURES.has((ComponentType as any)[k]));
        y = this.tiles(g, y, [
            ["Players 7d", num(of), "did anything at all in the last 7 days"],
            ["Top window", f.windows[0] ? pretty(f.windows[0][0]) : "-", f.windows[0] ? `opened by ${pct(f.windows[0][2], of)} of the week's players` : "none opened"],
            ["Windows used", num(f.windows.length), `${num(never.length)} never opened this week`],
            ["Actions used", num(f.actions.length), "kinds of thing done this week"],
        ]);
        const windows = this.rows(g, y, "Windows opened, by players", f.windows.map(([w, , n]) => [pretty(w), n]), (v) => pct(v, of),
            (n, v, k) => `${n}: opened by ${num(v)} players (${pct(v, of)}), ${num(f.windows[k][1])} times`, 4, half - 4);
        const actions = this.rows(g, y, "Things done, by players", f.actions.slice(0, 40).map(([r, , n]) => [pretty(r), n]), (v) => pct(v, of),
            (n, v, k) => `${n}: done by ${num(v)} players (${pct(v, of)}), ${num(f.actions[k][1])} times`, 4 + half + 4, half - 4);
        y = Math.max(windows, actions);
        if (never.length) {
            text("Never opened this week", 4, y, AP.MIST, this.layer);
            const t = text(never.map(pretty).join(", "), 4, y + 11, AP.ASH, this.layer);
            t.maxWidth = this.W - 8;
            y += 11 + Math.ceil(t.textHeight) + SECTION_GAP;
        }
        return y;
    }

    // of those who started since sessions were recorded: who left, and where
    private churn(g: PIXI.Graphics, a: Snapshot, y: number) {
        const c = a.churn, half = (this.W - 8) / 2;
        if (!c.started) return this.nothingYet(y, "Nothing recorded yet: churn is counted for players who start from now on.");
        const kept = c.old - c.gone;
        y = this.tiles(g, y, [
            ["Started", num(c.started), "since play was first recorded"],
            ["Gone", c.old ? pct(c.gone, c.old) : "-", `${num(c.gone)} of the ${num(c.old)} who started ${GONE_AFTER_DAYS}+ days ago haven't been seen for ${GONE_AFTER_DAYS} days`],
            ["Bounced", pct(c.bounced, c.started), `${num(c.bounced)} played under ${BOUNCE_S / 60} minutes in all and left`],
            ["1st session, gone", c.gone ? dur(c.firstGone) : "-", "the median first session of those who left"],
            ["1st session, kept", kept ? dur(c.firstKept) : "-", "and of those who stayed"],
        ]);
        const steps: [string, number][] = STEPS.map((s, k) => [s.name, c.stoppedAt[k]] as [string, number]).concat([["Did every step", c.stoppedAt[STEPS.length]]]);
        const stopped = this.rows(g, y, "Where the gone stopped (first step not done)", steps, num, (n, v) => `${n}: ${num(v)} left before this, ${pct(v, c.gone)}`, 4, half - 4);
        const heroes = this.columns(g, y, "Heroes the gone had", c.heroes, (k) => `${k} hero${k == 1 ? "" : "es"}: ${num(c.heroes[k] ?? 0)} gone, ${pct(c.heroes[k] ?? 0, c.gone)}`, "0", `${Math.max(0, c.heroes.length - 1)}`, 40, 4 + half + 4, half - 4);
        y = Math.max(stopped, heroes);
        const gone = this.rows(g, y, "How long the gone played in all", PLAYTIMES.map((b, k) => [b.name, c.playtime[k]]), num, (n, v) => `${n}: ${num(v)} gone, ${pct(v, c.gone)}`, 4, half - 4);
        const stayed = this.rows(g, y, "And those who stayed", PLAYTIMES.map((b, k) => [b.name, c.playtimeKept[k]]), num, (n, v) => `${n}: ${num(v)} stayed, ${pct(v, kept)}`, 4 + half + 4, half - 4);
        y = Math.max(gone, stayed);
        y = this.rows(g, y, "Times the gone signed in", SESSION_COUNTS.map((b, k) => [b.name, c.sessions[k]]), num, (n, v) => `${n} time${n == "1" ? "" : "s"}: ${num(v)} gone, ${pct(v, c.gone)}`, 4, half - 4);
        return y;
    }

    private nothingYet(y: number, why: string) {
        const t = text(why, 4, y, AP.ASH, this.layer);
        t.maxWidth = this.W - 8;
        return y + Math.ceil(t.textHeight) + 8;
    }

    //#endregion

    //#region === Pieces ===

    // a row of numbers: a name, the number big, and more said when pointed at
    private tiles(g: PIXI.Graphics, y: number, tiles: [string, string, string][]) {
        const W = this.W, n = tiles.length;
        const w = (W - TILE_GAP * (n - 1)) / n;
        tiles.forEach(([name, value, more], k) => {
            const x = Math.round(k * (w + TILE_GAP));
            g.beginFill(AP.SHADOW).drawRect(x, y, Math.floor(w), TILE_H).endFill();
            fit(text(name, x + 4, y + 2, AP.STONE, this.layer), w - 8);
            fit(text(value, x + 4, y + 12, AP.WHITE, this.layer), w - 8);
            this.hit(x, y, Math.floor(w), TILE_H, null, `${name}: ${more}`);
        });
        return y + TILE_H + TILE_GAP;
    }

    // a column chart, from the bottom, the tallest at the top; pointed at, a column says what it is
    private columns(g: PIXI.Graphics, y: number, title: string, values: number[], say: (k: number) => string, from: string, to: string, h = CHART_H, left = 0, W = this.W) {
        const top = Math.max(1, ...values);
        fit(text(title, left + 4, y, AP.MIST, this.layer), W - 40);
        const max = text(short(top), 0, y, AP.STEEL, this.layer);
        max.x = left + W - 4 - Math.ceil(max.textWidth);
        y += 11;
        g.beginFill(AP.SHADOW).drawRect(left, y, W, h).endFill();
        g.beginFill(AP.SLATE).drawRect(left, y + h - 1, W, 1).drawRect(left, y, W, 1).endFill();   // (the baseline, and the line the tallest reaches)
        const n = Math.max(1, values.length), slot = (W - 4) / n;
        const gap = slot >= 4 ? 1 : 0, bw = Math.max(1, Math.min(24, Math.floor(slot) - gap));
        values.forEach((v, k) => {
            const sx = Math.round(left + 2 + k * slot), x = sx + Math.floor((Math.floor(slot) - gap - bw) / 2);
            const bh = v > 0 ? Math.max(1, Math.round((h - 3) * v / top)) : 0;
            if (bh) g.beginFill(BAR).drawRect(x, y + h - 1 - bh, bw, bh).endFill();
            const area = this.hit(sx, y, Math.max(1, Math.ceil(slot)), h, null, say(k));
            area.on("pointerover", () => { if (bh) this.hover.clear().beginFill(BAR_ON).drawRect(x, y + h - 1 - bh, bw, bh).endFill(); });
            area.on("pointerout", () => this.hover.clear());
        });
        y += h + 2;
        text(from, left + 2, y, AP.STEEL, this.layer);
        const end = text(to, 0, y, AP.STEEL, this.layer);
        end.x = left + W - 2 - Math.ceil(end.textWidth);
        return y + 10 + SECTION_GAP;
    }

    // a list, a bar a row: its name, a bar as long as its share of the longest, and its value
    private rows(g: PIXI.Graphics, y: number, title: string, rows: [string, number][], show: (v: number) => string, say: (name: string, v: number, k: number) => string, x = 4, w = this.W - 8) {
        fit(text(title, x, y, AP.MIST, this.layer), w);
        y += 11;
        if (!rows.length) {
            text("Nothing yet", x, y, AP.IRON, this.layer);
            return y + ROW_H + SECTION_GAP;
        }
        const top = Math.max(1, ...rows.map((r) => r[1]));
        const nameW = Math.round(w * 0.45), valueW = 30, barW = w - nameW - valueW - 4;
        rows.forEach(([name, v], k) => {
            fit(text(name, x, y, AP.ASH, this.layer), nameW - 2);
            const bx = x + nameW, len = v > 0 ? Math.max(1, Math.round(barW * v / top)) : 0, by = y;
            g.beginFill(AP.SHADOW).drawRect(bx, y + 1, barW, ROW_H - 3).endFill();
            if (len) g.beginFill(BAR).drawRect(bx, y + 1, len, ROW_H - 3).endFill();
            const value = fit(text(show(v), 0, y, AP.WHITE, this.layer), valueW);
            value.x = x + w - Math.ceil(value.textWidth);
            const area = this.hit(x, y, w, ROW_H, null, say(name, v, k));
            area.on("pointerover", () => { if (len) this.hover.clear().beginFill(BAR_ON).drawRect(bx, by + 1, len, ROW_H - 3).endFill(); });
            area.on("pointerout", () => this.hover.clear());
            y += ROW_H;
        });
        return y + SECTION_GAP;
    }

    // the retention grid: a row a cohort (when they started, how many), a
    // cell a week after, lit by the share who played that week
    private grid(g: PIXI.Graphics, y: number, title: string, cohorts: Snapshot["cohorts"]) {
        const W = this.W, labelW = 56, sizeW = 28, cellW = Math.floor((W - labelW - sizeW) / COHORT_WEEKS);
        text(title, 4, y, AP.MIST, this.layer);
        y += 11;
        text("Started", 4, y, AP.STEEL, this.layer);
        text("Players", labelW, y, AP.STEEL, this.layer);
        for (let k = 0; k < COHORT_WEEKS; k++) text(`Wk ${k}`, labelW + sizeW + k * cellW + 2, y, AP.STEEL, this.layer);
        y += CELL_H;
        for (const c of cohorts) {
            const label = dateName(c.start);
            text(label, 4, y + 1, AP.ASH, this.layer);
            text(num(c.size), labelW, y + 1, AP.WHITE, this.layer);
            for (let k = 0; k < COHORT_WEEKS; k++) {
                const x = labelW + sizeW + k * cellW;
                g.beginFill(AP.SHADOW).drawRect(x, y, cellW - 1, CELL_H - 1).endFill();
                if (k >= c.weeks.length) continue;
                const share = c.size ? c.weeks[k] / c.size : 0;
                if (share > 0) g.beginFill(BAR, 0.15 + 0.85 * share).drawRect(x, y, cellW - 1, CELL_H - 1).endFill();
                fit(text(c.size ? pct(c.weeks[k], c.size) : "-", x + 2, y + 1, share > 0.6 ? AP.INK : AP.WHITE, this.layer), cellW - 3);
                this.hit(x, y, cellW - 1, CELL_H - 1, null,
                    `Started from ${label}: ${num(c.weeks[k])} of ${num(c.size)} played in week ${k}${k == c.weeks.length - 1 && k > 0 ? " (not over yet)" : ""}`);
            }
            y += CELL_H;
        }
        return y + SECTION_GAP;
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
        this.layer.addChild(area);
        return area;
    }

    // a button ending at `right`, as wide as its label; returns where it starts
    private button(g: PIXI.Graphics, label: string, right: number, y: number, can: boolean, on: () => void, more?: string) {
        const t = text(label, 0, y + 2, can ? AP.WHITE : AP.STONE, this.body);
        const w = Math.ceil(t.textWidth) + 10, x = right - w;
        g.beginFill(can ? AP.IRON : AP.SLATE).drawRect(x, y, w, BUTTON_H).endFill();
        g.beginFill(can ? AP.STEEL : AP.IRON).drawRect(x, y, w, 1).endFill();
        t.x = Math.round(x + (w - t.textWidth) / 2);
        if (can) this.hit(x, y, w, BUTTON_H, on, more);
        return x;
    }

    //#endregion

}

function text(text: string, x: number, y: number, tint: number, parent: PIXI.Container) {
    const t = new PIXI.BitmapText(text, { fontName: Constants.PIXEL_FONT, fontSize: 32 });
    t.tint = tint;
    t.position.set(Math.round(x), Math.round(y));
    t.eventMode = "none";
    parent.addChild(t);
    return t;
}

function num(n: number) {
    return Math.round(n).toLocaleString("en-US");
}

// 1,234,567 as 1.2M
function short(n: number) {
    const a = Math.abs(n), sign = n < 0 ? "-" : "";
    if (a >= 1e9) return sign + (a / 1e9).toFixed(1) + "B";
    if (a >= 1e6) return sign + (a / 1e6).toFixed(1) + "M";
    if (a >= 1e4) return sign + (a / 1e3).toFixed(1) + "k";
    return Number.isInteger(n) ? num(n) : String(Math.round(n * 10) / 10);
}

function pct(part: number, whole: number) {
    if (!whole) return "0%";
    const p = part / whole * 100;
    return (p > 0 && p < 10 ? p.toFixed(1) : Math.round(p)) + "%";
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

// seconds, as ago does
function dur(seconds: number) {
    return ago(seconds * 1000);
}

function minutesAgo(minutes: number) {
    if (minutes < 1) return "Now";
    return `${ago(minutes * 60000)} ago`;
}

// a day back from today: "Today", "Yesterday", else "Mon 26 Oct"
function dayName(back: number) {
    if (back == 0) return "Today";
    if (back == 1) return "Yesterday";
    const d = new Date(Date.now() - back * 24 * 60 * 60 * 1000);
    return d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
}

// "26 Oct"
function dateName(ms: number) {
    return new Date(ms).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

function cap(s: string) {
    return s.charAt(0).toUpperCase() + s.slice(1);
}

// HERO_QUEUE as Hero queue
function pretty(name: string) {
    return cap(name.toLowerCase().replace(/_/g, " "));
}
