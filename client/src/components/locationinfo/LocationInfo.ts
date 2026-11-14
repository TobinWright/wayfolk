import * as PIXI from "pixi.js";
import { START_TOWNS, SKILL_NAMES } from "../../../../shared/Heroes";
import { danger, deepestLevel, levelsOf, materialsAt } from "../../../../shared/Locations";
import { BUSY_MS, isDungeon, isTown, kindOf, placeName, WorldPlace } from "../../../../shared/Places";
import { gatherSkill, TaskKind, todoMost } from "../../../../shared/Tasks";
import { distancesFrom } from "../../../../shared/Travel";
import { baneText, eventDef, EventView, isBossEvent } from "../../../../shared/Events";
import { townLevel, townLevelPoints, townRate, townStage, WIN_POINTS } from "../../../../shared/Towns";
import { beastName, KIND_NAMES, SightKind } from "../../../../shared/Sights";
import { SightInfo } from "../sightinfo/SightInfo";
import { timeLeft } from "../../data/EventsData";
import { darkness } from "../../../../shared/Weather";
import { FEET_Y, SCENE_H, SCENE_W } from "../../art/Backdrops";
import { infoIcon, SMALL_ICON } from "../../art/MenuIcons";
import { picTexture } from "../../people/People";
import { Constants, TerrainType } from "../../constants/Constants";
import { AP } from "../../constants/Palette";
import { Event } from "../../constants/Events";
import { IBC } from "../../Engine";
import { Panel } from "../../shared/Panel";
import { Hint } from "../../shared/ui/Hint";
import { TitleBar } from "../../shared/ui/titlebar/TitleBar";
import { BaseComponent, ComponentType } from "../BaseComponent";
import { Chat } from "../chat/Chat";
import { EventInfo } from "../eventinfo/EventInfo";
import { fit } from "../heroroster/HeroRoster";
import { landTextures } from "../herostatus/HeroStatus";
import { HeroWindow } from "../herowindow/HeroWindow";
import { itemTexture } from "../inventory/Item";
import { ItemInfo } from "../iteminfo/ItemInfo";
import { placeTexture } from "../taskplanner/TaskPlanner";

// A place on the map, in depth (the user, 2026-10-28: clicking a location
// opens it), Claude's layout. On the left, the place standing in its land
// (darker at night), its name and kind, the land, where its roads lead, and the heroes there now - yours, then the others'
// (the user, 2026-11-02; asked for as it opens and every BUSY_MS while it's
// open, S2C.EVENT_HERE) - each opening their status.
// On the right what's done there (odd jobs, the workshop, hiring, exploring,
// gathering), its levels - each one's danger, how deep your heroes reach,
// where new materials start -, the materials found there (from what level,
// by what skill, how many you have), and your heroes: how far each is, how
// deep they'd get, a Go to send them (travel on the end of their list).
// It keeps up as heroes move (HERO_STATE) and the clock turns.

export class LocationInfo extends BaseComponent {

    public static SCALE = 2;
    public static W = 380;              // in its own px
    public static H = 300;              // (a mine's nine materials, an event and three heroes)
    public static PAD = 4;
    public static LINE = 10;
    public static LEFT_W = 120;         // the left column
    public static RIGHT = LocationInfo.PAD + LocationInfo.LEFT_W + 8;
    public static RIGHT_W = LocationInfo.W - LocationInfo.RIGHT - LocationInfo.PAD;
    public static STAGE_H = 48;         // where it stands (as tall as a hero window's scene)
    public static DEPTH_H = 14;         // a level's cell
    public static MATERIAL_H = 19;      // a material's row: two lines by its sprite
    public static HERO_H = 16;          // a hero's row
    public static BUTTON_W = 46;        // its Travel / Join (the word with room either side)
    public static BUTTON_H = 14;
    // the window round it, in screen px
    public static INSET_X = 12;
    public static INSET_Y = 28;         // (under the title bar)
    public static WIDTH = LocationInfo.INSET_X * 2 + LocationInfo.W * LocationInfo.SCALE;
    public static HEIGHT = LocationInfo.INSET_Y + LocationInfo.H * LocationInfo.SCALE + LocationInfo.INSET_X;

    private place: WorldPlace;
    private drawn = "";                 // (what it was drawn from: redrawn when it changes)
    private minute = 0;                 // (redrawn each minute: an event's time left)
    private here: { p: number; l: [number, string][]; n: number } = null;  // the others' heroes here (S2C.EVENT_HERE)
    private asked = 0;                  // (when they were last asked for: again every BUSY_MS while it's open)
    private hereScroll = 0;             // (how far down the heroes here it's scrolled)
    private hereGrab: number = null;    // (dragging their bar: how far down the thumb it's held)
    private release = () => { this.hereGrab = null; };   // (let go anywhere: the bar may have been drawn again since)

    public background: Panel;
    public titleBar: TitleBar;
    private content: PIXI.Container;
    private sheet: PIXI.Container;
    private night: PIXI.Graphics;       // over the stage, by how dark it is
    private tip: PIXI.Container;        // (a word on what's pointed at, over the pointer)

    private keys = (e: KeyboardEvent) => { if (e.key == "Escape" && !Chat.takes(e)) IBC.comp.destroy(this); };

    constructor() {
        super(ComponentType.LOCATION_INFO);
        this.create();
    }

    // a place (one open at a time: clicking another shows it)
    public static open(place: WorldPlace) {
        const view = IBC.comp.getOrCreate(ComponentType.LOCATION_INFO) as LocationInfo;
        view.bringToTop();
        view.show(place);
    }

    public create() {
        super.create();
        const { WIDTH, HEIGHT, W, H } = LocationInfo;
        this.container.eventMode = "static";
        this.container.hitArea = new PIXI.Rectangle(0, 0, WIDTH, HEIGHT);
        this.container.on("pointerdown", (e: PIXI.FederatedPointerEvent) => e.stopPropagation());

        this.background = new Panel(this.container);
        this.background.setSize(WIDTH, HEIGHT);

        this.titleBar = new TitleBar(this);
        this.titleBar.setPosition(4, 4);
        this.titleBar.setSize(WIDTH - 8, 20);

        this.content = new PIXI.Container();
        this.content.scale.set(LocationInfo.SCALE);
        this.content.position.set(LocationInfo.INSET_X, LocationInfo.INSET_Y);
        this.container.addChild(this.content);

        // (the panel's middle lets the map through)
        this.content.addChild(new PIXI.Graphics().beginFill(AP.INK).drawRect(-4, -2, W + 8, H + 6).endFill());
        // down the middle
        const split = new PIXI.Graphics();
        split.beginFill(AP.BLACK).drawRect(LocationInfo.RIGHT - 5, 0, 1, H).endFill();
        split.beginFill(AP.IRON).drawRect(LocationInfo.RIGHT - 4, 0, 1, H).endFill();
        this.content.addChild(split);

        this.sheet = new PIXI.Container();
        this.content.addChild(this.sheet);
        this.tip = new PIXI.Container();
        this.tip.eventMode = "none";
        this.tip.visible = false;
        this.content.addChild(this.tip);

        window.addEventListener("keydown", this.keys);
        IBC.events.register(Event.HERO_STATE, () => this.draw(), this);
        IBC.events.register(Event.HERO_STASH, () => { this.drawn = ""; this.draw(); }, this);
        IBC.events.register(Event.EVENTS_CHANGED, () => this.draw(), this);
        IBC.events.register(Event.SIGHTS_CHANGED, () => this.draw(), this);
        window.addEventListener("pointerup", this.release);
        IBC.events.register(Event.EVENT_HERE, (here: LocationInfo["here"]) => {
            if (here.p != this.place?.i) return;
            this.here = here;
            this.drawn = "";
            this.draw();
        }, this);
        // opens right of the middle of the screen (the status opens left of it)
        this.setPosition(Math.min(window.innerWidth - WIDTH, Math.round((window.innerWidth - WIDTH) / 2) + 120), Math.max(0, Math.round((window.innerHeight - HEIGHT) / 2) - 20));
    }

    public destroy() {
        super.destroy();
        window.removeEventListener("keydown", this.keys);
        window.removeEventListener("pointerup", this.release);
        this.titleBar.destroy();
        this.titleBar = null;
        this.background.destroy();
        this.background = null;
        this.container.destroy({ children: true });
    }

    public show(place: WorldPlace) {
        if (place != this.place) { this.drawn = ""; this.here = null; this.asked = 0; this.hereScroll = 0; }
        this.place = place;
        this.draw();
    }

    public update(deltaTime: number) {
        if (!this.place || !this.night) return;
        const now = Date.now();
        if (now - this.asked >= BUSY_MS) { this.asked = now; IBC.net.event.here(this.place.i); }
        this.night.alpha = 0.55 * darkness(now);
        if (Math.floor(now / 60000) != this.minute) { this.minute = Math.floor(now / 60000); this.draw(); }
    }

    private draw() {
        const place = this.place;
        if (!place) return;
        const heroes = IBC.data.heroes.heroes;
        // (state comes often: redrawn only when something shown has changed)
        const key = JSON.stringify([place.i, heroes.map((h) => [h.id, h.s.p, h.s.r, h.s.q.length, h.s.w?.k, h.d.k]), IBC.data.events.list.filter((e) => e.p == place.i), IBC.data.sights.at(place.i).map((s) => s.i), Math.floor(Date.now() / 60000)]);
        if (key == this.drawn) return;
        this.drawn = key;
        this.titleBar.setTitle(placeName(place));
        this.sheet.removeChildren().forEach((c) => c.destroy({ children: true }));
        this.hideTip();     // (what was pointed at may be gone)
        this.drawLeft(place);
        this.drawRight(place);
        this.update(0);
    }

    //#region the left: the place, its land and sky, and what's round it

    private drawLeft(place: WorldPlace) {
        const { PAD, LINE, LEFT_W, STAGE_H } = LocationInfo;
        const x = PAD, w = LEFT_W, kind = kindOf(place);
        const graph = IBC.data.heroes.graph, node = graph.get(place.i);
        this.drawStage(place, x, 0, w);

        let y = STAGE_H + 5;
        fit(this.text(placeName(place), x, y, AP.WHITE, this.sheet), w); y += LINE;
        const what = isTown(place) ? "Town" : isDungeon(place) ? "Dungeon" : materialsAt(kind, levelsOf(kind)).length ? "Gathering place" : "Road stop";
        fit(this.text(`${title(kind)} (${what})`, x, y, AP.ICE, this.sheet), w); y += LINE;
        fit(this.text(landName(node?.te), x, y, AP.SAND, this.sheet), w); y += LINE + 3;

        // where its roads lead (the nearest dungeon taken off, the user, 2026-11-02)
        const roads = roadsFrom(place.i);
        this.text("Roads", x, y, AP.STONE, this.sheet); y += LINE;
        if (!roads.length) { this.text("none: off the roads", x + 4, y, AP.IRON, this.sheet); y += LINE; }
        // (leaving room for the heroes here under them)
        for (const [p] of roads.slice(0, Math.max(1, Math.floor((LocationInfo.H - y) / LINE) - 3))) {
            // (the direction right-aligned in a column as wide as "NW", the name after it)
            const m = this.text(compass(place, p), 0, y, AP.AMBER, this.sheet);
            m.x = x + 4 + 11 - Math.ceil(m.textWidth);
            fit(this.text(`${placeName(p)}`, x + 4 + 11 + 4, y, AP.MIST, this.sheet), w - 19);
            y += LINE;
        }
        this.drawHere(place, x, y + 3, w);
    }

    // the heroes here now, not on their way: yours (as you have them), then
    // the others' (S2C.EVENT_HERE), a name a line, clicked opening their
    // status; the wheel or its bar scrolls them in what's left of the column
    private drawHere(place: WorldPlace, x: number, y: number, w: number) {
        const { LINE, H } = LocationInfo;
        const mine = IBC.data.heroes.heroes.filter((h) => !h.s.r.length && h.s.p == place.i).map((h): [number, string] => [h.id, h.d.n]);
        const rows = [...mine, ...(this.here?.l ?? [])];
        const n = mine.length + (this.here?.n ?? 0), more = n - rows.length;
        this.text(`Heroes here (${n})`, x, y, AP.STONE, this.sheet); y += LINE;
        if (!n) { this.text("none", x + 4, y, AP.IRON, this.sheet); return; }

        const top = y, room = H - top, listH = (rows.length + (more ? 1 : 0)) * LINE;
        const box = new PIXI.Container(), list = new PIXI.Container();
        const mask = new PIXI.Graphics().beginFill(0xffffff).drawRect(x, top - 1, w, room + 1).endFill();
        list.position.set(x, top);
        list.mask = mask;
        box.addChild(mask, list);
        this.sheet.addChild(box);
        rows.forEach(([id, name], i) => {
            const tint = i < mine.length ? AP.STRAW : AP.MIST;      // (yours stand out)
            const t = this.text(name, 4, i * LINE, tint, list);
            fit(t, w - 10);
            const hit = new PIXI.Container();
            hit.eventMode = "static";
            hit.cursor = "pointer";
            hit.hitArea = new PIXI.Rectangle(0, i * LINE - 1, w - 6, LINE);
            hit.on("pointerover", () => t.tint = AP.LIME);
            hit.on("pointerout", () => t.tint = tint);
            hit.on("pointertap", () => HeroWindow.openStatus(id));
            list.addChild(hit);
        });
        if (more > 0) this.text(`and ${more} more`, 4, rows.length * LINE, AP.IRON, list);
        if (listH <= room) { this.hereScroll = 0; return; }

        // the bar on the right: the thumb dragged, or jumped to where the track's pressed
        const bar = new PIXI.Graphics();
        box.addChild(bar);
        const thumb = () => {
            const len = Math.max(8, Math.round(room * room / listH));
            return { len, at: Math.round((room - len) * this.hereScroll / (listH - room)) };
        };
        const placeList = () => {
            this.hereScroll = Math.max(0, Math.min(this.hereScroll, listH - room));
            list.y = top - this.hereScroll;
            const { len, at } = thumb();
            bar.clear();
            bar.beginFill(AP.SHADOW).drawRect(x + w - 2, top, 2, room).endFill();
            bar.beginFill(AP.STONE).drawRect(x + w - 2, top + at, 2, len).endFill();
        };
        const dragTo = (e: PIXI.FederatedPointerEvent) => {
            const { len } = thumb();
            this.hereScroll = (this.sheet.toLocal(e.global).y - top - this.hereGrab) / (room - len) * (listH - room);
            placeList();
        };
        box.eventMode = "static";
        box.hitArea = new PIXI.Rectangle(x, top, w, room);
        box.on("wheel", (e: PIXI.FederatedWheelEvent) => {
            e.stopPropagation();
            this.hereScroll += e.deltaY < 0 ? -3 * LINE : 3 * LINE;
            placeList();
        });
        bar.eventMode = "static";
        bar.cursor = "pointer";
        bar.hitArea = new PIXI.Rectangle(x + w - 6, top, 6, room);
        bar.on("pointerdown", (e: PIXI.FederatedPointerEvent) => {
            e.stopPropagation();
            const py = this.sheet.toLocal(e.global).y - top, { len, at } = thumb();
            this.hereGrab = py >= at && py < at + len ? py - at : len / 2;
            dragTo(e);
        });
        bar.on("globalpointermove", (e: PIXI.FederatedPointerEvent) => { if (this.hereGrab != null) dragTo(e); });
        placeList();
    }

    // it standing in its land, the sky over it darkening at night, in a frame
    private drawStage(place: WorldPlace, x: number, y: number, w: number) {
        const H = LocationInfo.STAGE_H;
        const frame = new PIXI.Graphics();
        frame.beginFill(AP.BLACK).drawRect(x, y, w, H + 2).endFill();
        frame.beginFill(AP.IRON).drawRect(x + 1, y + 1, w - 2, H).endFill();
        this.sheet.addChild(frame);

        const stage = new PIXI.Container();
        stage.position.set(x + 2, y + 1);
        const sw = w - 4, sh = H - 1;
        const mask = new PIXI.Graphics().beginFill(0xffffff).drawRect(x + 2, y + 1, sw, sh).endFill();
        this.sheet.addChild(mask, stage);
        stage.mask = mask;

        const land = landTextures(HeroWindow.backdropOf(IBC.data.heroes.graph.get(place.i)?.te));
        const off = -Math.round((SCENE_W - sw) / 2), top = sh - SCENE_H;
        const sky = new PIXI.Sprite(land.sky);
        sky.position.set(off, top);
        stage.addChild(sky);
        for (const texture of land.strips) {
            const strip = new PIXI.TilingSprite(texture, sw, SCENE_H);
            strip.position.set(0, top);
            strip.tilePosition.x = off;
            stage.addChild(strip);
        }
        const sprite = new PIXI.Sprite(placeTexture(place));
        sprite.anchor.set(0.5, 1);
        sprite.position.set(Math.round(sw / 2), top + FEET_Y + 3);
        stage.addChild(sprite);
        this.night = new PIXI.Graphics().beginFill(AP.MIDNIGHT).drawRect(0, 0, sw, sh).endFill();
        stage.addChild(this.night);
    }

    //#endregion

    //#region the right: what's done there, its levels, its materials, your heroes

    private drawRight(place: WorldPlace) {
        const { RIGHT, RIGHT_W, LINE } = LocationInfo;
        const kind = kindOf(place);
        let y = 0;

        // what's done there
        this.heading("Here", RIGHT, y, RIGHT_W); y += 12;
        const things: [string, number][] = [];
        if (isTown(place)) {
            things.push(["Odd jobs for gold", AP.STRAW]);
            // (what it makes isn't listed: that's the to-do list's Craft tab; the user, 2026-10-28)
            things.push(["Crafting Workshop", AP.FOAM]);
        }
        if (START_TOWNS.includes(place.n)) things.push(["Hired heroes start out here", AP.ICE]);
        if (isDungeon(place)) things.push(["Explorable", AP.ORCHID]);
        const found = materialsAt(kind, levelsOf(kind));
        // (floors wherever the Floors cells show: a dungeon, or anywhere with materials)
        if (isDungeon(place) || found.length) { const n = levelsOf(kind); things.push([`${n} floor${n == 1 ? "" : "s"}`, AP.FOAM]); }
        if (found.length) things.push([`${found.length} material${found.length == 1 ? "" : "s"}`, AP.LIME]);
        // a won event's boon, while it lasts (shared/Events.ts)
        const boon = IBC.data.events.boonAt(place.i);
        if (boon) things.unshift([`${eventDef(boon.k).boonText} (${timeLeft(boon.u - Date.now())})`, AP.LIME]);
        // where a marching boss laid it waste, its bane
        const bane = IBC.data.events.baneAt(place.i);
        if (bane) things.unshift([`${baneText(bane)} (${timeLeft(bane.u - Date.now())})`, AP.FLAME]);
        for (const [t, tint] of things) { fit(this.text(t, RIGHT + 4, y, tint, this.sheet), RIGHT_W - 4); y += LINE; }
        // how it's grown for good (shared/Towns.ts): pointed at, how far to the next and what's been built
        if (isTown(place)) {
            const [, points, built] = IBC.data.events.town(place.i), level = townLevel(points), rate = townRate(points);
            const grown = fit(this.text(`${townStage(level)}: level ${level}${rate > 1 ? ` (+${Math.round((rate - 1) * 1000) / 10}%)` : ""}`, RIGHT + 4, y, AP.STRAW, this.sheet), RIGHT_W - 4);
            grown.eventMode = "static";
            const left = Math.ceil((townLevelPoints(level + 1) - points) / WIN_POINTS);
            Hint.on(grown, [
                "Towns grow for good as players win events here.",
                `${left} more event${left == 1 ? "" : "s"} won to reach level ${level + 1}.`,
                "Each level: crafting 0.5% quicker and 0.5% more XP for work done here.",
                ...(built.length ? [`Built here: ${built.map(([what, n]) => n > 1 ? `${what} x${n}` : what).join(", ")}`] : []),
            ].join(" "));
            y += LINE;
        }
        // what's turned up here for a while (shared/Sights.ts), an "i" after it
        // so it looks clickable (the user, 2026-11-02): pointed at, lit; clicked, its window
        for (const s of IBC.data.sights.at(place.i)) {
            const row = new PIXI.Container();
            row.position.set(RIGHT + 4, y);
            const t = fit(this.text(`${KIND_NAMES[s.k]}: ${s.k == SightKind.BEAST ? beastName(s) : s.n} (${timeLeft(s.e - Date.now())})`, 0, 0, AP.ORCHID, row), RIGHT_W - 4 - SMALL_ICON - 4);
            const i = new PIXI.Sprite(picTexture(infoIcon()));
            i.position.set(Math.ceil(t.textWidth) + 3, -1);
            row.addChild(i);
            row.eventMode = "static";
            row.hitArea = new PIXI.Rectangle(-1, -2, Math.ceil(t.textWidth) + 3 + SMALL_ICON + 2, LINE);
            row.cursor = "pointer";
            Hint.on(row, "Click for more");
            row.on("pointerover", () => { t.tint = AP.PINK; i.tint = 0xd0e8ff; });
            row.on("pointerout", () => { t.tint = AP.ORCHID; i.tint = 0xffffff; });
            row.on("pointertap", () => SightInfo.open(s.i));
            this.sheet.addChild(row);
            y += LINE;
        }
        y += 3;

        const event = IBC.data.events.liveAt(place.i);
        if (event) y = this.drawEvent(place, event, y);

        if (isDungeon(place) || found.length) y = this.drawDepths(place, y);
        if (found.length) y = this.drawMaterials(place, y);
        this.drawHeroes(place, y);
    }

    // the event on here (shared/Events.ts): its name and kind, how far it's got as a
    // bar, the time left, your points and the top givers; your heroes Join it below
    private drawEvent(place: WorldPlace, e: EventView, y: number) {
        const { RIGHT, RIGHT_W, LINE } = LocationInfo, def = eventDef(e.k), left = timeLeft(e.e - Date.now());
        this.heading(def.name, RIGHT, y, RIGHT_W); y += 12;
        const name = fit(this.text(e.n, RIGHT + 4, y, AP.STRAW, this.sheet), RIGHT_W - 4);
        name.eventMode = "static";
        name.hitArea = new PIXI.Rectangle(-1, -1, Math.max(20, Math.ceil(name.textWidth) + 2), LINE - 1);
        name.cursor = "pointer";
        name.on("pointertap", () => EventInfo.open(e.i));
        Hint.on(name, "Click for the event, to join it");
        y += LINE;
        const part = Math.min(1, e.d / e.g), barW = RIGHT_W - 70;
        const bar = new PIXI.Graphics();
        bar.beginFill(AP.BLACK).drawRect(RIGHT + 4, y, barW, 7).endFill();
        bar.beginFill(AP.SHADOW).drawRect(RIGHT + 5, y + 1, barW - 2, 5).endFill();
        bar.beginFill(isBossEvent(e) ? AP.FLAME : AP.LIME).drawRect(RIGHT + 5, y + 1, Math.round((barW - 2) * part), 5).endFill();
        this.sheet.addChild(bar);
        fit(this.text(`${Math.floor(part * 100)}%, ${left}`, RIGHT + barW + 8, y - 1, AP.WHITE, this.sheet), RIGHT_W - barW - 8);
        y += LINE;
        const top = (e.t ?? []).map(([n, p]) => `${n} ${Math.round(p)}`).join(", ");
        fit(this.text(`${e.m ? `You: ${Math.round(e.m)}` : "You: nothing yet"}${top ? ` - Top: ${top}` : ""}`, RIGHT + 4, y, AP.ASH, this.sheet), RIGHT_W - 4);
        return y + LINE + 3;
    }

    // a cell a level, a gem where a new material starts; pointed at, the power it takes (and what's first found there) (the user, 2026-11-02)
    private drawDepths(place: WorldPlace, y: number) {
        const { RIGHT, RIGHT_W, DEPTH_H } = LocationInfo;
        const kind = kindOf(place), levels = levelsOf(kind);
        this.heading("Floors", RIGHT, y, RIGHT_W); y += 12;
        const cellW = Math.floor(RIGHT_W / levels);
        for (let level = 1; level <= levels; level++) {
            const cell = new PIXI.Container();
            cell.position.set(RIGHT + (level - 1) * cellW, y);
            const back = new PIXI.Graphics();
            back.beginFill(AP.BLACK).drawRect(0, 0, cellW - 1, DEPTH_H).endFill();
            back.beginFill(AP.SLATE).drawRect(1, 1, cellW - 3, DEPTH_H - 2).endFill();
            const starts = firstAt(kind, level);
            cell.addChild(back);
            if (starts.length) {
                const c = Math.floor((cellW - 1) / 2) + 1;
                back.beginFill(AP.ICE).drawPolygon([c - 2, 2, c + 2, 2, c, 4]).endFill();
            }
            cell.eventMode = "static";
            cell.hitArea = new PIXI.Rectangle(0, 0, cellW - 1, DEPTH_H);
            Hint.on(cell, [`Req Power - ${Math.round(danger(level))}`, ...(starts.length ? [`Start finding ${starts.map((m) => m.name).join(", ")}`] : [])].join("\n"));
            const n = this.text(`${level}`, 0, 5, AP.WHITE, cell);
            n.x = Math.round((cellW - 1 - n.textWidth) / 2);
            this.sheet.addChild(cell);
        }
        return y + DEPTH_H + 4;
    }

    // its materials in two columns, shallowest first: the sprite, the name, by what skill, from what floor
    // (a click opens it in ItemInfo)
    private drawMaterials(place: WorldPlace, y: number) {
        const { RIGHT, RIGHT_W, MATERIAL_H } = LocationInfo;
        const kind = kindOf(place);
        const materials = [...materialsAt(kind, levelsOf(kind))].sort((a, b) => a.level - b.level);
        this.heading("Materials", RIGHT, y, RIGHT_W); y += 11;
        const colW = Math.floor((RIGHT_W - 4) / 2), rows = Math.ceil(materials.length / 2);
        materials.forEach((m, i) => {
            const row = new PIXI.Container();
            row.position.set(RIGHT + Math.floor(i / rows) * (colW + 4), y + (i % rows) * MATERIAL_H);
            const icon = new PIXI.Sprite(itemTexture(m.id));
            icon.position.set(0, 1);
            row.addChild(icon);
            fit(this.text(m.name, 18, 1, AP.WHITE, row), colW - 18);
            const lv = this.text(`fl ${m.level}+`, 0, 10, AP.SAND, row);
            lv.x = colW - Math.ceil(lv.textWidth);
            fit(this.text(`${SKILL_NAMES[gatherSkill(m.id)]}`, 18, 10, AP.STONE, row), lv.x - 4 - 18);
            row.eventMode = "static";
            row.hitArea = new PIXI.Rectangle(0, 0, colW, MATERIAL_H);
            row.cursor = "pointer";
            row.on("pointertap", () => ItemInfo.open(m.id));
            this.sheet.addChild(row);
        });
        return y + rows * MATERIAL_H + 2;
    }

    // a row a hero: here (or how far), how deep they'd get (with their party, if with it), Travel
    private drawHeroes(place: WorldPlace, y: number) {
        const { RIGHT, RIGHT_W, HERO_H, BUTTON_W, H } = LocationInfo;
        const data = IBC.data.heroes, kind = kindOf(place);
        this.heading("Your heroes", RIGHT, y, RIGHT_W); y += 12;
        if (!data.heroes.length) { this.text("None yet: hire one from the main menu", RIGHT + 4, y, AP.IRON, this.sheet); return; }
        for (const hero of data.heroes) {
            if (y + HERO_H > H) break;
            const s = hero.s, from = s.r.length ? s.r[0] : s.p;
            const here = !s.r.length && s.p == place.i, going = s.r.length && s.r[s.r.length - 1] == place.i;
            const px = distancesFrom(data.graph, from).get(place.i);

            // right to left from the button: the floor (their party's power, with it; else their own), the distance against it, the name in what's left
            let right = RIGHT + RIGHT_W - BUTTON_W - 4;
            if (isDungeon(place) || materialsAt(kind, levelsOf(kind)).length > 0) {
                const deepest = IBC.data.parties.deepest(kind, hero), fl = this.text(`fl ${deepest}`, 0, y + 3, AP.STRAW, this.sheet);
                fl.x = right - Math.ceil(fl.textWidth);
                this.tipOn(fl, deepest > deepestLevel(kind, [hero.d]) ? "Deepest floor with their party" : "Deepest floor solo", new PIXI.Rectangle(-1, -1, Math.ceil(fl.textWidth) + 2, 9));
                right = fl.x - 6;
            }
            let where: string, tint: number;
            if (here) { where = "here now"; tint = AP.LIME; }
            else if (going) { where = `on the way, ${miles(px)}`; tint = AP.GRASS; }
            else if (px == null) { where = "no road there"; tint = AP.FLAME; }
            else { where = miles(px); tint = AP.SAND; }
            const far = this.text(where, 0, y + 3, tint, this.sheet);
            far.x = right - Math.ceil(far.textWidth);
            fit(this.text(hero.d.n, RIGHT + 4, y + 3, AP.WHITE, this.sheet), far.x - 6 - (RIGHT + 4));

            const full = s.q.length >= todoMost(IBC.data.premium.active);
            // an event on here: Join, it on the end of their list (kept at till it's over)
            const event = IBC.data.events.liveAt(place.i);
            if (event) {
                const joined = s.q.some((t) => t.k == TaskKind.EVENT && t.m == event.i) || (s.w?.k == TaskKind.EVENT && s.w.m == event.i);
                const can = !joined && px != null && !full;
                this.button("Join", RIGHT + RIGHT_W - BUTTON_W, y, BUTTON_W, can,
                    () => IBC.net.hero.give(hero.id, [{ k: TaskKind.EVENT, p: place.i, m: event.i }]));
                y += HERO_H;
                continue;
            }
            // an opening (shared/Sights.ts): Explore, runs of it on the end of their list
            const opening = IBC.data.sights.on(SightKind.OPENING).find((o) => o.p == place.i);
            if (opening) {
                const exploring = s.q.some((t) => t.k == TaskKind.EXPLORE && t.p == place.i) || (s.w?.k == TaskKind.EXPLORE && s.w.p == place.i);
                this.button("Explore", RIGHT + RIGHT_W - BUTTON_W, y, BUTTON_W, !exploring && px != null && !full,
                    () => IBC.net.hero.give(hero.id, [{ k: TaskKind.EXPLORE, p: place.i, n: SightInfo.EXPLORE_RUNS }]));
                y += HERO_H;
                continue;
            }
            const can = !here && !going && px != null && !full;
            this.button("Travel", RIGHT + RIGHT_W - BUTTON_W, y, BUTTON_W, can,
                () => IBC.net.hero.give(hero.id, [{ k: TaskKind.TRAVEL, p: place.i }]));
            y += HERO_H;
        }
    }

    //#endregion

    //#region bits

    // pointing at it says what it is, in a box over the pointer (as the inventory's names are)
    private tipOn(it: PIXI.Container, text: string, area: PIXI.Rectangle) {
        it.eventMode = "static";
        it.hitArea = area;
        it.on("pointerover", (e: PIXI.FederatedPointerEvent) => this.showTip(text, e));
        it.on("pointermove", (e: PIXI.FederatedPointerEvent) => this.moveTip(e));
        it.on("pointerout", () => this.hideTip());
    }

    private showTip(text: string, e: PIXI.FederatedPointerEvent) {
        this.tip.removeChildren().forEach((c) => c.destroy({ children: true }));
        const back = new PIXI.Graphics();
        this.tip.addChild(back);
        const t = this.text(text, 3, 2, AP.WHITE, this.tip);
        const w = Math.ceil(t.textWidth) + 6;
        back.beginFill(AP.BLACK).drawRect(0, 0, w, 11).endFill().beginFill(AP.SHADOW).drawRect(1, 1, w - 2, 9).endFill();
        this.tip.visible = true;
        this.moveTip(e);
    }

    // (kept inside the window)
    private moveTip(e: PIXI.FederatedPointerEvent) {
        if (!this.tip.visible) return;
        const p = this.content.toLocal(e.global);
        this.tip.position.set(Math.round(Math.max(0, Math.min(p.x + 4, LocationInfo.W - this.tip.width))), Math.round(Math.max(0, p.y - 13)));
    }

    private hideTip() {
        if (this.tip) this.tip.visible = false;
    }

    private text(text: string, x: number, y: number, tint: number, parent: PIXI.Container) {
        const t = new PIXI.BitmapText(text, { fontName: Constants.PIXEL_FONT, fontSize: 32 });
        t.tint = tint;
        t.position.set(x, y);
        t.eventMode = "none";
        parent.addChild(t);
        return t;
    }

    // a heading with a rule from it to the end of the column
    private heading(text: string, x: number, y: number, w: number) {
        const t = this.text(text, x, y, AP.STRAW, this.sheet);
        const from = x + Math.ceil(t.textWidth) + 4;
        this.sheet.addChild(new PIXI.Graphics().beginFill(AP.IRON).drawRect(from, y + 3, x + w - from, 1).endFill());
    }

    private button(label: string, x: number, y: number, w: number, on: boolean, tap: () => void) {
        const h = LocationInfo.BUTTON_H, button = new PIXI.Container();
        button.position.set(x, y);
        const box = new PIXI.Graphics();
        const paint = (over: boolean) => box.clear()
            .beginFill(AP.BLACK).drawRect(0, 0, w, h).endFill()
            .beginFill(!on ? AP.IRON : over ? AP.GRASS : AP.LEAF).drawRect(1, 1, w - 2, h - 2).endFill();
        paint(false);
        button.addChild(box);
        const t = this.text(label, 0, Math.floor((h - 7) / 2), on ? AP.WHITE : AP.STONE, button);
        fit(t, w - 4);     // (never past its sides)
        t.x = Math.round((w - t.textWidth) / 2);
        button.eventMode = "static";
        button.hitArea = new PIXI.Rectangle(0, 0, w, h);
        button.on("pointerover", () => paint(true));
        button.on("pointerout", () => paint(false));
        if (on) {
            button.cursor = "pointer";
            button.on("pointertap", tap);
        }
        this.sheet.addChild(button);
    }

    //#endregion

}

// the places its roads lead to first (past the bends between), nearest first:
// the shortest ways out, not going on past a place
function roadsFrom(id: number): [WorldPlace, number][] {
    const { graph, places } = IBC.data.heroes;
    const dist = new Map<number, number>([[id, 0]]), open = new Set<number>([id]), done = new Set<number>();
    const out: [WorldPlace, number][] = [];
    while (open.size) {
        let at = -1, best = Infinity;
        open.forEach((n) => { if (dist.get(n) < best) { best = dist.get(n); at = n; } });
        open.delete(at);
        done.add(at);
        if (at != id && places.has(at)) { out.push([places.get(at), best]); continue; }
        const node = graph.get(at);
        for (const next of node?.e ?? []) {
            const other = graph.get(next);
            if (!other || done.has(next)) continue;
            const d = best + Math.hypot(other.x - node.x, other.y - node.y);
            if (d < (dist.get(next) ?? Infinity)) { dist.set(next, d); open.add(next); }
        }
    }
    return out;
}

// the materials that are first found at a level
function firstAt(kind: string, level: number) {
    return materialsAt(kind, level).filter((m) => m.level == level);
}


function title(kind: string) {
    return kind.charAt(0).toUpperCase() + kind.slice(1);
}

function landName(terrain: TerrainType) {
    const name = TerrainType[terrain ?? TerrainType.GRASSLANDS] ?? "GRASSLANDS";
    return name.charAt(0) + name.slice(1).toLowerCase();
}

// "12 mi" (a tile a mile)
export function miles(px: number) {
    if (!px) return "here";
    return `${Math.max(1, Math.round(px / 16))} mi`;
}

// "1m 20s", "45s", "1h 5m"
export function duration(seconds: number) {
    const s = Math.round(seconds);
    if (s < 60) return `${s}s`;
    const m = Math.floor(s / 60);
    return m < 60 ? `${m}m${s % 60 ? ` ${s % 60}s` : ""}` : `${Math.floor(m / 60)}h ${m % 60}m`;
}

// which way another place lies from one, as the crow flies: N, NE, E... (the map's y runs down, south)
function compass(from: WorldPlace, to: WorldPlace) {
    const turn = Math.atan2(to.x - from.x, from.y - to.y) / (Math.PI / 4);
    return ["N", "NE", "E", "SE", "S", "SW", "W", "NW"][(Math.round(turn) + 8) % 8];
}
