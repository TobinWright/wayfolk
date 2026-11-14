import * as PIXI from "pixi.js";
import { eventTitle } from "../../../../shared/Events";
import { Fight } from "../../../../shared/Fights";
import { PartyMember } from "../../../../shared/Parties";
import { placeName } from "../../../../shared/Places";
import { beastAt, beastName, SightKind, SightView } from "../../../../shared/Sights";
import { doingText } from "../../../../shared/Tasks";
import { maskSwearing } from "../../../../shared/ChatFilter";
import { Constants } from "../../constants/Constants";
import { Event } from "../../constants/Events";
import { AP } from "../../constants/Palette";
import { HeroRow } from "../../data/HeroesData";
import { IBC } from "../../Engine";
import { BaseComponent, ComponentType } from "../BaseComponent";
import { Chat, wrap } from "../chat/Chat";
import { fit } from "../heroroster/HeroRoster";
import { HeroStatus } from "../herostatus/HeroStatus";
import { HeroWindow } from "../herowindow/HeroWindow";
import { Map as GameMap } from "../map/Map";

// Demo mode, for showing the game on a stream (the user, 2026-11-03: "a demo
// mode maybe i can activate from the admin menu. it would show cool things on
// the map, switch between parties and their hero windows"): from the admin
// menu, a tour by itself until Escape. It only looks: the server's only told
// to send it every party and fight (server HeroDemo; the user: "it should have
// access to every party and cycle through each. yes, fighting needs to be
// shown"), and everyone's on the map while it runs.
//
// The tour goes round every party (over them their window; a while in, one of
// them's status beside it), those at something first, the events on now, the
// sights about (a merchant, a rare find, a beast, an opening), the places
// (the busiest first) and the whole map; whatever hasn't been shown longest
// next. Near enough at the same zoom it pans over, otherwise fades through
// black. A line along the bottom says who or what it is. Fights are in the mix
// (the user: "fights don't have to be first priority"): at its turn for one it
// goes to a party that's fought lately and not been shown for a while. A fight
// playing as a stop's time runs out is seen out, but not those after it (the
// user: stuck on "Fighting The Bone King", a party at a boss always having another).
//
// All but the map and those windows is hidden while it runs, whatever turns
// up (a stream shouldn't show whispers, mail, an ask or the admin menu), and
// players' names aren't shown, only their heroes'. The pointer's taken too,
// so nothing's opened by a slip. Space goes on to the next.
//
// General chat's last few lines show over the caption (the user, 2026-11-03:
// "just the text with a second black version of the text behind and offset
// for a shadow"), going after a while so a quiet chat isn't left up. Only
// what everyone in General sees, not notes to you, with swearing always masked.

type Spot = { x: number; y: number };

interface Stop {
    key: string;                // (what it's remembered as having been shown by)
    zoom: number;               // Camera.ZOOM_LEVELS' index
    ms: number;
    title: string;
    line: () => string;
    spot: () => Spot;           // where to look, map px (null: it's gone: on to the next)
    drift: number;              // map px it wanders round the spot, for something to happen
    party?: { leader: number; ids: number[]; others: boolean };
    fight?: Fight;              // (to play there)
}

type Kind = "party" | "fight" | "event" | "sight" | "place" | "wide";
type Option = { stop: Stop; weight: number };

export class DemoMode extends BaseComponent {

    private static PLAN: Kind[] = ["party", "fight", "party", "event", "party", "fight", "sight", "party", "place", "party", "wide"];
    private static FADE_MS = 500;
    private static PARTY_MS = 26 * 1000;
    private static FIGHT_MS = 12 * 1000;        // at a party for a fight
    private static AFTER_FIGHT_MS = 3 * 1000;   // stays this long after one's played
    private static FIGHT_STALE_MS = 60 * 1000;  // a fight this old's not gone to
    private static FIGHT_AGAIN_MS = 3 * 60 * 1000;  // nor one of a party shown this lately
    private static SHEET_FROM_MS = 8 * 1000;    // its status showing, from this far in
    private static SHEET_LEFT_MS = 6 * 1000;    // till this long before the end
    private static EVENT_MS = 16 * 1000;
    private static SIGHT_MS = 14 * 1000;
    private static PLACE_MS = 12 * 1000;
    private static WIDE_MS = 14 * 1000;
    private static EASE_MS = 500;               // the camera's lag behind where it's looking
    private static EDGE = 24;                   // screen px, what's on it from the screen's edges
    private static HINT_MS = 6 * 1000;
    private static SCALE = 2;                   // of the caption: size 32 text, whole pixels (a size on screen that isn't a multiple of 32 spoils the font)
    private static LINE = 9;                    // its own px
    private static URL = "playwayfolk.com";
    private static CHAT_ROWS = 6;
    private static CHAT_W = 300;                // its own px (as the chat's)
    private static CHAT_SCALE = 2;
    private static CHAT_LINE = 10;
    private static CHAT_SHADOW = 1;             // its own px, down and right
    private static CHAT_GAP = 8;                // screen px over the caption
    private static CHAT_LASTS_MS = 3 * 60 * 1000;
    private static CHAT_CHECK_MS = 1000;

    protected zBand = 2e9;

    private chat: PIXI.Container;
    private chatKey = "";
    private chatCheck = 0;
    private chatMeasure: PIXI.BitmapText;

    private curtain: PIXI.Graphics;
    private caption: PIXI.Container;
    private url: PIXI.Container;
    private hint: PIXI.Container;
    private said = "";

    private stop: Stop = null;
    private planAt = 0;
    private fade = 0;
    private fading: "in" | "out" | null = null;
    private time = 0;                           // ms into the stop
    private clock = 0;                          // ms since it started
    private next: Stop = null;                  // (going to, while fading out)
    private shown: { [key: string]: number } = {};
    private cam: Spot = null;
    private shift = 0;                          // screen px the view's moved over for the status
    private watched: HeroWindow = null;         // over someone else's party (your own have theirs)
    private pending = new Map<number, { fight: Fight; at: number }>();    // fights to go to, the latest of each hero
    private lastFight: Fight = null;            // (the one being seen out as the stop's time runs out)
    private sheetHero: number = null;
    private hidden = new Set<PIXI.DisplayObject>();
    private wasHidden = new Set<PIXI.DisplayObject>();  // (hidden already: left hidden after)
    private was: { zoom: number; x: number; y: number };

    private keys = (e: KeyboardEvent) => {
        if (Chat.takes(e)) return;
        if (e.key == "Escape") IBC.comp.destroy(this);
        else if (e.code == "Space") { e.preventDefault(); this.goOn(); }
    };

    constructor() {
        super(ComponentType.DEMO_MODE);
        this.create();
    }

    private get map() {
        return IBC.comp.getFirstByType(ComponentType.MAP) as GameMap;
    }

    public create() {
        super.create();
        const camera = this.map.camera;
        this.was = { zoom: camera.zoomIndex, x: camera.scrollX, y: camera.scrollY };
        this.map.follow(null);
        this.closeStatus();
        IBC.data.heroes.setDemo(true);
        IBC.net.admin.demo(true);
        IBC.events.register(Event.DEMO_FIGHT, (e: { h: number, f: Fight }) => this.onFight(e.h, e.f), this);
        IBC.events.register(Event.HERO_FIGHT, (e: { hero: { id: number }, fight: Fight }) => this.onFight(e.hero.id, e.fight), this);

        this.container.eventMode = "static";
        this.container.cursor = "none";
        this.container.on("pointerdown", (e: PIXI.FederatedPointerEvent) => e.stopPropagation());
        this.curtain = new PIXI.Graphics();
        this.curtain.eventMode = "none";
        this.caption = new PIXI.Container();
        this.caption.scale.set(DemoMode.SCALE);
        this.url = this.box([[DemoMode.URL, AP.STRAW]]);
        this.url.scale.set(DemoMode.SCALE);
        this.hint = this.box([["Esc: leave demo mode. Space: next", AP.ASH]], 1);
        this.hint.scale.set(1);
        this.chat = new PIXI.Container();
        this.chat.scale.set(DemoMode.CHAT_SCALE);
        this.chatMeasure = new PIXI.BitmapText("", { fontName: Constants.PIXEL_FONT, fontSize: 32 });
        this.container.addChild(this.caption, this.chat, this.url, this.hint, this.curtain);
        IBC.events.register(Event.CHAT_SAID, () => this.drawChat(), this);
        this.drawChat();
        window.addEventListener("keydown", this.keys);
        this.resize();
        this.leave(this.choose());
        this.hide();
    }

    public destroy() {
        window.removeEventListener("keydown", this.keys);
        this.dropWatched();
        this.closeStatus();
        IBC.net.admin.demo(false);
        IBC.data.heroes.setDemo(false);
        this.hidden.forEach((c) => { if (!c.destroyed && !this.wasHidden.has(c)) c.visible = true; });
        const camera = this.map.camera;
        camera.setZoom(this.was.zoom);
        camera.scrollX = this.was.x;
        camera.scrollY = this.was.y;
        camera.enforceBounds();
        super.destroy();
        this.chatMeasure.destroy();
        this.container.destroy({ children: true });
    }

    private closeStatus() {
        const open = IBC.comp.getFirstByType(ComponentType.HERO_STATUS);
        if (open) IBC.comp.destroy(open);
    }

    public resize() {
        const w = window.innerWidth, h = window.innerHeight;
        this.container.hitArea = new PIXI.Rectangle(0, 0, w, h);
        this.curtain.clear().beginFill(AP.BLACK).drawRect(0, 0, w, h).endFill();
        this.curtain.alpha = this.fade;
        this.url.position.set(w - DemoMode.EDGE - this.url.width, h - DemoMode.EDGE - this.url.height);
        this.hint.position.set(DemoMode.EDGE, DemoMode.EDGE);
        this.placeCaption();
    }

    public update(deltaTime: number) {
        this.hide();
        this.clock += deltaTime;
        this.hint.visible = this.clock < DemoMode.HINT_MS;
        this.time += deltaTime;
        if ((this.chatCheck += deltaTime) >= DemoMode.CHAT_CHECK_MS) { this.chatCheck = 0; this.drawChat(); }

        if (this.fading == "out") {
            this.fade = Math.min(1, this.fade + deltaTime / DemoMode.FADE_MS);
            if (this.fade == 1) { this.begin(this.next); this.fading = "in"; }
        } else if (this.fading == "in") {
            this.fade = Math.max(0, this.fade - deltaTime / DemoMode.FADE_MS);
            if (this.fade == 0) this.fading = null;
        } else if (!this.stop.spot()) {
            this.goOn();
        } else {
            this.seeOutFight();
            if (this.time >= this.stop.ms) this.goOn();
        }
        this.curtain.alpha = this.fade;
        if (!this.stop) return;
        if (this.watched) {
            const party = this.partyNow(this.stop.party.leader);
            if (party) this.watched.keepUp(party.party);
        }

        this.showSheet();
        this.moveCamera(deltaTime);
        this.say();
    }

    //#region the tour

    private goOn() {
        if (this.fading == "out") return;
        this.leave(this.choose());
    }

    // a fight just had: played if the party's being watched and there's time left, otherwise kept for the fight's turn
    private onFight(hero: number, fight: Fight) {
        const stop = this.stop;
        if (stop?.party?.ids.includes(hero) && !this.fading && this.time < stop.ms - DemoMode.AFTER_FIGHT_MS) this.windowOf(stop.party.leader)?.addFight(fight);
        else this.pending.set(hero, { fight, at: this.clock });
    }

    // the stop's nearly up with a fight on: held till that one's played, those after it not waited for
    private seeOutFight() {
        const party = this.stop.party, end = this.stop.ms - DemoMode.AFTER_FIGHT_MS;
        if (!party || this.time < end) return;
        const win = this.windowOf(party.leader), fight = win?.fighting;
        if (!fight) return;
        if (!this.lastFight) { this.lastFight = fight; win.dropNextFights(); }
        if (fight == this.lastFight) this.time = end;
    }

    private fightHere() {
        return !!this.stop.party && !!this.windowOf(this.stop.party.leader)?.fighting;
    }

    // a party with a fight not long had, not shown lately, what's waited longest (null: none)
    private toFight(): Stop {
        const stops = this.parties().map((o) => o.stop);
        let best: Stop = null;
        this.pending.forEach(({ fight, at }, hero) => {
            if (this.clock - at > DemoMode.FIGHT_STALE_MS) { this.pending.delete(hero); return; }
            const stop = stops.find((s) => s.party.ids.includes(hero)), shown = stop && this.shown[stop.key];
            if (!stop || (shown && this.clock - shown < DemoMode.FIGHT_AGAIN_MS)) return;
            if (!best || (shown ?? 0) < (this.shown[best.key] ?? 0)) best = { ...stop, ms: DemoMode.FIGHT_MS, fight };
        });
        if (best) for (const id of best.party.ids) this.pending.delete(id);
        return best;
    }

    private windowOf(leader: number) {
        return (IBC.comp.getAllByType(ComponentType.HERO_WINDOW) as HeroWindow[]).find((w) => w.heroes[0] == leader);
    }

    // someone else's party, as the server last said, by its leader
    private partyNow(leader: number) {
        return IBC.data.heroes.demo?.find((f) => f.party[0]?.[0] == leader);
    }

    // to the next, over by a pan if it's near enough at the same zoom, otherwise through black
    private leave(next: Stop) {
        const here = this.stop?.spot(), there = next.spot();
        if (here && there && next.zoom == this.stop.zoom
            && Math.hypot(there.x - here.x, there.y - here.y) * this.map.camera.getZoom() < window.innerWidth * 0.8) {
            this.begin(next, false);
            return;
        }
        this.next = next;
        this.fading = "out";
    }

    private begin(stop: Stop, cut = true) {
        this.dropWatched();
        this.stop = stop;
        this.time = 0;
        this.lastFight = null;
        this.sheetHero = null;
        this.shown[stop.key] = this.clock + 1;
        this.map.camera.setZoom(stop.zoom);
        if (cut) this.cam = null;
        if (stop.party?.others) {
            const party = this.partyNow(stop.party.leader);
            if (party) this.watched = HeroWindow.forParty(party);
        }
        if (stop.fight) this.windowOf(stop.party.leader)?.addFight(stop.fight);
    }

    private dropWatched() {
        if (this.watched) IBC.comp.destroy(this.watched);
        this.watched = null;
    }

    // what's next by the plan (a kind with nothing to show passed over; the
    // whole map's always there), what's waited longest of its kind
    private choose(): Stop {
        for (let i = 0; i < DemoMode.PLAN.length; i++) {
            const kind = DemoMode.PLAN[this.planAt];
            this.planAt = (this.planAt + 1) % DemoMode.PLAN.length;
            const stop = this.pick(this.optionsOf(kind));
            if (stop && stop.key != this.stop?.key) return stop;
        }
        return this.wide();
    }

    private pick(options: Option[]) {
        return options
            .map((o) => ({ ...o, roll: Math.random() }))
            .sort((a, b) => (this.shown[a.stop.key] ?? 0) - (this.shown[b.stop.key] ?? 0) || b.weight - a.weight || a.roll - b.roll)[0]?.stop;
    }

    private optionsOf(kind: Kind): Option[] {
        switch (kind) {
            case "party": return this.parties();
            case "fight": { const stop = this.toFight(); return stop ? [{ stop, weight: 0 }] : []; }
            case "event": return this.events();
            case "sight": return this.sights();
            case "place": return this.places();
            case "wide": return [{ stop: this.wide(), weight: 0 }];
        }
    }

    private parties() {
        const heroes = IBC.data.heroes, options: Option[] = [];
        for (const { party, rows } of heroes.demo ?? []) {
            const leader = party[0]?.[0];
            // (those with any of yours come with yours)
            if (leader == null || !heroes.graph.has(rows[0].s.p) || party.some((m) => heroes.get(m[0]) || IBC.data.friends.isBlocked(m[3]))) continue;
            options.push({ stop: this.partyStop(leader, party, true), weight: DemoMode.weightOf(rows[0], party) });
        }
        for (const hero of heroes.heroes) {
            const party = hero.party ?? [[hero.id, hero.d.n, hero.d.l, "", hero.d.j] as PartyMember];
            // (yours in one party share the window of the lowest id: HeroWindow.regroup)
            if (Math.min(hero.id, ...party.map((m) => m[0]).filter((id) => heroes.get(id))) != hero.id) continue;
            options.push({ stop: this.partyStop(hero.id, party, false), weight: DemoMode.weightOf(hero, party) });
        }
        return options;
    }

    // those at something before those resting, the fullest first (all gone round before any's again)
    private static weightOf(row: HeroRow, party: PartyMember[]) {
        return party.length + (IBC.data.heroes.resting(row) ? 0 : 100);
    }

    private partyStop(leader: number, members: PartyMember[], others: boolean): Stop {
        const heroes = IBC.data.heroes;
        return {
            key: `party ${leader}`, zoom: 3, ms: DemoMode.PARTY_MS, drift: 0,
            title: members.map((m) => m[1]).join(", "),
            party: { leader, ids: members.map((m) => m[0]), others },
            line: () => {
                const fight = this.windowOf(leader)?.fighting;
                if (fight) return `Fighting ${Array.from(new Set(fight.f.filter((f) => f.s == 1).map((f) => f.n))).join(", ")}`;
                const row = heroes.seen(leader);
                return row ? doingText(row.s, heroes.nameOf, (id) => IBC.data.events.named(id)) : "";
            },
            spot: () => {
                if (others && !this.partyNow(leader)) return null;
                const at = this.map.heroSpot(leader);
                if (!at) return null;
                // (the party and the window over them in the middle)
                return { x: at.x, y: at.y + GameMap.FEET - GameMap.HEAD / 2 - (this.windowOf(leader)?.size().h ?? 0) / 2 / this.map.camera.getZoom() };
            },
        };
    }

    private events(): Option[] {
        const events = IBC.data.events;
        return events.live().map((e) => ({
            weight: events.busy.get(e.p) ?? 0,
            stop: {
                key: `event ${e.i}`, zoom: 2, ms: DemoMode.EVENT_MS, drift: 14, title: eventTitle(e),
                line: () => this.busyLine(e.p),
                spot: () => this.placeSpot(e.p),
            },
        }));
    }

    private sights(): Option[] {
        return IBC.data.sights.on().map((s) => ({
            weight: s.k == SightKind.BEAST ? 1 : 0,
            stop: {
                key: `sight ${s.i}`, zoom: 2, ms: DemoMode.SIGHT_MS, drift: s.k == SightKind.BEAST ? 0 : 14,
                title: s.k == SightKind.BEAST ? beastName(s) : s.n || DemoMode.sightWord(s),
                line: () => DemoMode.sightWord(s) + (s.p != null ? `, at ${IBC.data.heroes.nameOf(s.p)}` : ""),
                spot: () => {
                    if (s.k == SightKind.BEAST) return beastAt(s, IBC.data.heroes.graph, Date.now());
                    if (s.o) return this.placeAt(s.o);
                    return s.p != null ? this.placeSpot(s.p) : null;
                },
            },
        })).filter((o) => o.stop.spot());
    }

    private static sightWord(s: SightView) {
        switch (s.k) {
            case SightKind.MERCHANT: return "A wandering merchant";
            case SightKind.FIND: return "A rare find";
            case SightKind.BEAST: return "Roaming the land";
            case SightKind.OPENING: return "An opening, for a day";
        }
        return "";
    }

    private places() {
        const options: Option[] = [];
        IBC.data.heroes.places.forEach((p) => {
            if (!p.n) return;
            options.push({
                weight: IBC.data.events.busy.get(p.i) ?? 0,
                stop: {
                    key: `place ${p.i}`, zoom: 2, ms: DemoMode.PLACE_MS, drift: 18, title: placeName(p),
                    line: () => this.busyLine(p.i),
                    spot: () => this.placeSpot(p.i),
                },
            });
        });
        return options;
    }

    private wide(): Stop {
        return {
            key: "wide", zoom: 0, ms: DemoMode.WIDE_MS, drift: 60, title: "The world of Wayfolk", line: () => "",
            spot: () => ({ x: this.map.width / 2, y: this.map.height / 2 }),
        };
    }

    // the place's name, if the title isn't it, and how many heroes are there
    private busyLine(place: number) {
        const busy = IBC.data.events.busy.get(place) ?? 0, name = IBC.data.heroes.nameOf(place);
        const heroes = busy ? `${busy} hero${busy == 1 ? "" : "es"} here` : "";
        return name == this.stop?.title ? heroes : [name, heroes].filter((t) => t).join(" - ");
    }

    private placeSpot(id: number) {
        const p = IBC.data.heroes.places.get(id);
        return p ? this.placeAt(p) : null;
    }

    private placeAt(p: { x: number; y: number }): Spot {
        const tile = this.map.world.tile;
        return { x: (p.x + 0.5) * tile, y: (p.y + 1) * tile };
    }

    //#endregion

    // everything but the map, the heroes' windows and this hidden, as it comes
    private hide() {
        const keep = new Set<PIXI.DisplayObject>([this.map.container, this.container]);
        for (const w of IBC.comp.getAllByType(ComponentType.HERO_WINDOW)) keep.add(w.container);
        const status = IBC.comp.getFirstByType(ComponentType.HERO_STATUS);
        if (status) keep.add(status.container);
        for (const c of IBC.pixi.stage.children) {
            if (keep.has(c)) continue;
            if (!this.hidden.has(c)) {
                this.hidden.add(c);
                if (!c.visible) this.wasHidden.add(c);
            }
            c.visible = false;
        }
    }

    // a while into a party's stop, one of them's status beside them (with room for it)
    private showSheet() {
        const { stop, time } = this, party = stop.party;
        const on = !!party && !this.fading && !this.fightHere() && time >= DemoMode.SHEET_FROM_MS && time < stop.ms - DemoMode.SHEET_LEFT_MS
            && window.innerWidth >= HeroStatus.WIDTH + 400;
        if (on && this.sheetHero == null) {
            this.sheetHero = party.ids[Math.floor(Math.random() * party.ids.length)];
            HeroWindow.openStatus(this.sheetHero);
        }
        const status = IBC.comp.getFirstByType(ComponentType.HERO_STATUS) as HeroStatus;
        if (!status) return;
        status.container.visible = on && status.showing == this.sheetHero;
        status.setPosition(DemoMode.EDGE, Math.max(0, Math.round((window.innerHeight - HeroStatus.HEIGHT) / 2)));
    }

    private moveCamera(deltaTime: number) {
        const at = this.stop.spot();
        if (!at) return;
        const { drift } = this.stop, t = this.time;
        const to = { x: at.x + drift * Math.sin(t / 5000), y: at.y + drift * 0.6 * Math.sin(t / 3100) };
        const ease = 1 - Math.exp(-deltaTime / DemoMode.EASE_MS);
        this.cam = this.cam ? { x: this.cam.x + (to.x - this.cam.x) * ease, y: this.cam.y + (to.y - this.cam.y) * ease } : to;
        const status = IBC.comp.getFirstByType(ComponentType.HERO_STATUS);
        this.shift += ((status?.container.visible ? (HeroStatus.WIDTH + DemoMode.EDGE) / 2 : 0) - this.shift) * ease;
        this.map.camera.centerOn(this.cam.x - this.shift / this.map.camera.getZoom(), this.cam.y);
    }

    //#region the caption

    private say() {
        const title = this.stop.title, line = this.stop.line(), key = `${title}\n${line}`;
        if (key == this.said) return;
        this.said = key;
        this.caption.removeChildren().forEach((c) => c.destroy({ children: true }));
        this.caption.addChild(this.box(line ? [[title, AP.WHITE], [line, AP.ASH]] : [[title, AP.WHITE]]));
        this.placeCaption();
    }

    private placeCaption() {
        this.caption.position.set(DemoMode.EDGE, window.innerHeight - DemoMode.EDGE - this.caption.height);
        this.placeChat();
    }

    // its bottom on the caption's top
    private placeChat() {
        this.chat.position.set(DemoMode.EDGE, this.caption.y - DemoMode.CHAT_GAP - this.chat.height);
    }

    // General's last lines, wrapped: only the text, each piece of it over itself in black, offset
    private drawChat() {
        const { CHAT_W, CHAT_LINE, CHAT_ROWS, CHAT_SHADOW, CHAT_LASTS_MS } = DemoMode, now = Date.now();
        const measure = (s: string) => { this.chatMeasure.text = s; return Math.ceil(this.chatMeasure.textWidth); };
        const rows: [number, string, number][][] = [];
        for (const line of IBC.data.chat.lines) {
            if (line.c != 0 || now - line.a >= CHAT_LASTS_MS || IBC.data.friends.isBlocked(line.n, line.i)) continue;
            const name = `${line.n}:`, nameW = measure(name) + 4, tint = line.e ? AP.STRAW : line.p ? Chat.nameTint(line.p) : AP.SKY;
            const [first, ...more] = wrap(maskSwearing(line.t), CHAT_W - nameW, CHAT_W, measure);
            const text = line.e ? AP.SAND : AP.WHITE;
            rows.push([[0, name, tint], [nameW, first, text]]);
            for (const row of more) rows.push([[0, row, text]]);
        }
        const shown = rows.slice(-CHAT_ROWS), key = JSON.stringify(shown);
        if (key == this.chatKey) return;
        this.chatKey = key;
        this.chat.removeChildren().forEach((c) => c.destroy());
        shown.forEach((pieces, i) => {
            for (const [x, text, tint] of pieces) {
                for (const [dx, dy, color] of [[CHAT_SHADOW, CHAT_SHADOW, AP.BLACK], [0, 0, tint]]) {
                    const t = new PIXI.BitmapText(text, { fontName: Constants.PIXEL_FONT, fontSize: 32, tint: color });
                    t.position.set(x + dx, i * CHAT_LINE + dy);
                    this.chat.addChild(t);
                }
            }
        });
        this.placeChat();
    }

    // lines of text in a box
    private box(lines: [string, number][], scale = DemoMode.SCALE) {
        const room = window.innerWidth * 0.6 / scale;
        const texts = lines.map(([text, tint], i) => {
            const t = new PIXI.BitmapText(text, { fontName: Constants.PIXEL_FONT, fontSize: 32, tint });
            fit(t, room);
            t.position.set(4, 3 + i * DemoMode.LINE);
            return t;
        });
        const w = Math.ceil(Math.max(0, ...texts.map((t) => t.textWidth))) + 8, h = lines.length * DemoMode.LINE + 4;
        const box = new PIXI.Container();
        box.addChild(new PIXI.Graphics()
            .beginFill(AP.BLACK).drawRect(0, 0, w, h).endFill()
            .beginFill(AP.SHADOW).drawRect(1, 1, w - 2, h - 2).endFill(), ...texts);
        return box;
    }

    //#endregion

}
