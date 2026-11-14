import * as PIXI from "pixi.js";
import { MapPlace } from "../../../../shared/MapEdit";
import { PLACE_KINDS, PLACE_PICS } from "../../art/PlaceArt";
import { LAYERS, TileSet, TileSets, TO_E, TO_W } from "../../art/WorldAutotile";
import { Constants } from "../../constants/Constants";
import { Event } from "../../constants/Events";
import { AP, R64 } from "../../constants/Palette";
import { IBC } from "../../Engine";
import { Panel } from "../../shared/Panel";
import { TextField } from "../../shared/ui/TextField";
import { TitleBar } from "../../shared/ui/titlebar/TitleBar";
import { BaseComponent, ComponentType } from "../BaseComponent";
import { Chat } from "../chat/Chat";
import { text, textWidth } from "../games/GameUI";
import { fit } from "../heroroster/HeroRoster";
import { Map as WorldMap } from "../map/Map";
import { MapEditLayer } from "./MapEditLayer";
import { Brush, BRUSHES, FILL_MOST, Painter, Stroke } from "./Painter";

// The map editor (admin menu, Map; shared/MapEdit.ts): the world map's
// tiles painted over the map itself, autotiled as they're painted, and its
// places put, moved, changed and taken off.
// - Tools (keys 1-4): Paint (drag to paint with the brush), Fill (what's
//   joined to where it's clicked, that's the same, painted), Pick (the brush
//   for what's clicked; Alt+click in any tool), Places (click one to pick it,
//   drag it to move it; its name, kind and sprite in the window; a new one
//   put where it's clicked).
// - Brushes: land and sea, snow, grounds, woods, hills, mountains, rivers
//   (Painter's BRUSHES and their rules). [ and ] the brush's size, G the
//   grid, Delete takes the place picked off, Ctrl+Z / Ctrl+Y undo and redo,
//   Esc lets go (again: closes it).
// - Right-drag (or Space and drag) moves the map while painting.
// - Each stroke is sent as it's let go of; the map changes for everyone
//   online as it's painted. A place put or moved has the ground under it
//   made as the map's build makes it (Painter.settle). Places standing off
//   the land are pointed out.

enum Tool { PAINT, FILL, PICK, PLACES }

const TOOLS = [
    { name: "Paint", hint: "Drag to paint with the brush. Alt+click: pick the brush for what's there" },
    { name: "Fill", hint: "Click to paint all that's joined to it and the same (its land, ground or cover)" },
    { name: "Pick", hint: "Click the map for the brush that paints what's there" },
    { name: "Places", hint: "Click a place to pick it, drag it to move it. Delete takes it off the map" },
];

const W = 200;                          // in its own px
const EDGE = 4;
const ROW = 13;
const LABEL_W = 38;
const TOOL_W = 47, BUTTON_H = 12, SMALL_W = 36, WIDE_W = 92;
const SWATCH = 12, BRUSH_W = 98, BRUSH_H = 14;
const SIZE_MOST = 16;
const UNDO_MOST = 100;
const DAB_STEP = 0.4;                   // tiles between dabs along a drag

// something done, to undo: a stroke, or a place changed (and the ground under it)
interface Step {
    label: string;
    stroke?: Stroke;
    place?: { id: number, before: MapPlace, after: MapPlace };      // (null: not on the map)
}
// a place change asked for, not back yet
interface PlaceAsk { kind: "do" | "undo" | "redo"; step: Step; }

const kindName = (k: number) => PLACE_KINDS[k] ?? "";
const title = (s: string) => s ? s[0].toUpperCase() + s.slice(1) : s;

export class MapEditor extends BaseComponent {

    public static SCALE = 2;
    public static INSET_X = 12;
    public static INSET_Y = 28;

    private map: WorldMap;
    private layer: MapEditLayer;
    private painter: Painter = null;
    private sets: TileSets = null;
    private on = false;                 // (the server takes changes)
    private offWhy = "";                // (why it doesn't, when it doesn't)
    private placesWhy = "";             // (why places can't be changed: "" they can)

    private tool = Tool.PAINT;
    private brush: Brush = BRUSHES[1];
    private size = 3;
    private grid = false;

    private undos: Step[] = [];
    private redos: Step[] = [];
    private pending = new Set<number>();
    private placeAsks = new Map<number, PlaceAsk>();

    private down: { x: number, y: number } = null;      // tiles: where the stroke last dabbed
    private pointer: { x: number, y: number } = null;   // map px, while it's over the map
    private space = false;
    private offLand: { x: number, y: number, n: string }[] = [];
    private offAt = -1;

    // places
    private picked: number = null;      // the place picked's id
    private adding = false;             // the next click puts a new one
    private newKind = 0;
    private newPic = -1;                // (a sprite no place has; -1 none left)
    private press: { id: number, sx: number, sy: number } = null;
    private dragTo: { x: number, y: number } = null;    // the tile it's being dragged to

    private line = "Loading the map...";
    private lineTint: number = AP.ASH;

    public background: Panel;
    public titleBar: TitleBar;
    private content = new PIXI.Container();
    private back = new PIXI.Graphics();
    private body = new PIXI.Container();
    private fieldLayer = new PIXI.Container();
    private info: PIXI.BitmapText;
    private under: PIXI.BitmapText;
    private h = 0;
    private nameField: TextField;

    private keys = (e: KeyboardEvent) => this.onKey(e);
    private keyUp = (e: KeyboardEvent) => { if (e.code == "Space") this.space = false; };
    private noMenu = (e: MouseEvent) => e.preventDefault();
    private paste = (e: ClipboardEvent) => { if (this.nameField.focused) this.nameField.paste(e.clipboardData?.getData("text") ?? ""); };

    constructor() {
        super(ComponentType.MAP_EDITOR);
        this.create();
    }

    public create() {
        super.create();
        const { SCALE, INSET_X, INSET_Y } = MapEditor;
        this.map = IBC.comp.getFirstByType(ComponentType.MAP) as WorldMap;
        this.layer = new MapEditLayer(this.map);

        this.container.eventMode = "static";
        this.container.on("pointerdown", (e: PIXI.FederatedPointerEvent) => { e.stopPropagation(); this.letGoOfName(); });
        this.background = new Panel(this.container);
        this.titleBar = new TitleBar(this);
        this.titleBar.setPosition(4, 4);
        this.titleBar.setTitle("Map Editor");
        this.content.scale.set(SCALE);
        this.content.position.set(INSET_X, INSET_Y);
        this.content.addChild(this.back, this.body, this.fieldLayer);
        this.container.addChild(this.content);
        this.nameField = new TextField(W - LABEL_W - 4, { max: 40, hint: "no name", onEnter: () => this.letGoOfName() });
        this.fieldLayer.addChild(this.nameField.container);

        window.addEventListener("keydown", this.keys, true);     // (first, so the map's keys see it's taken)
        window.addEventListener("keyup", this.keyUp);
        document.addEventListener("contextmenu", this.noMenu);
        document.addEventListener("paste", this.paste);
        IBC.events.register(Event.MAP_POINTER_DOWN, this.mapDown, this);
        IBC.events.register(Event.GLOBAL_POINTER_MOVE, this.pointerMove, this);
        IBC.events.register(Event.GLOBAL_POINTER_UP, this.pointerUp, this);
        IBC.events.register(Event.MAPED_WORLD, this.worldCame, this);
        IBC.events.register(Event.MAPED_PAINTED, this.painted, this);
        IBC.events.register(Event.MAPED_REFUSED, this.refused, this);
        IBC.events.register(Event.MAPED_TILES, this.othersPainted, this);
        IBC.events.register(Event.MAPED_PLACED, this.placed, this);
        IBC.events.register(Event.MAPED_PLACES, this.placesChanged, this);

        // the tiles' numbers (render-world.js), then the map as the server has it
        PIXI.Assets.load(Constants.JSON_PATH + "world-sets.json").then((sets: TileSets) => {
            if (this.container.destroyed) return;
            this.sets = sets;
            IBC.net.mapEd.open();
        }).catch(() => this.say("No world-sets.json: run npm run world in client", R64.SALMON));
        this.draw();
        this.setPosition(16, 72);
    }

    public destroy() {
        // (a stroke under way sent first)
        if (this.painter?.painting) this.endStroke();
        super.destroy();
        window.removeEventListener("keydown", this.keys, true);
        window.removeEventListener("keyup", this.keyUp);
        document.removeEventListener("contextmenu", this.noMenu);
        document.removeEventListener("paste", this.paste);
        IBC.events.unregisterAll(this);
        this.layer.destroy();
        this.nameField.destroy();
        this.titleBar.destroy();
        this.background.destroy();
        this.container.destroy({ children: true });
    }

    public update(deltaTime: number) {
        // (what's painted while dragging, put on the map once a frame)
        if (this.painter?.painting) this.painter.retile();
        this.nameField.update(deltaTime);
        this.layer.update();
    }

    private get loaded() {
        return this.painter != null;
    }

    //#region === What comes back ===

    private worldCame() {
        const world = IBC.net.mapEd.world;
        if (!this.sets || !world) return;
        if (this.map.world.layers.map((l) => l.n).join() != LAYERS.join()) {
            this.say("This map's cover is painted tree by tree (npm run world -- --painted): it can't be painted here", R64.SALMON);
            return this.draw();
        }
        this.painter = new Painter(this.map, this.sets, world.terrain);
        this.on = world.on;
        this.offWhy = world.offWhy;
        this.placesWhy = world.placesWhy;
        this.undos = [];
        this.redos = [];
        this.pending.clear();
        this.placeAsks.clear();
        this.say(this.on ? "" : this.offWhy, this.on ? AP.ASH : AP.STRAW);
        this.placesChanged();
    }

    private painted(token: number) {
        if (!this.pending.delete(token)) return;
        this.showInfo();
    }

    private refused({ t: token, w: why }: { t: number, w: string }) {
        const ask = this.placeAsks.get(token);
        if (ask) {
            // (a place change not done: what's to undo or redo stays so)
            this.placeAsks.delete(token);
            if (ask.kind == "undo") this.undos.push(ask.step);
            if (ask.kind == "redo") this.redos.push(ask.step);
            this.say(why, R64.SALMON);
            return this.draw();
        }
        if (token != null && !this.pending.delete(token)) return;
        this.say(why, R64.SALMON);
        // (what the server has, again: what's on the map may not be)
        if (token != null) {
            this.pending.clear();
            IBC.net.mapEd.open();
        }
        this.draw();
    }

    // another editor's strokes: they're on the map, the corners read again from it
    private othersPainted() {
        if (!this.painter) return;
        if (this.painter.painting) this.endStroke();
        this.painter.reread();
        if (this.undos.length || this.redos.length) this.say("Another editor painted the map (nothing to undo now)", AP.STRAW);
        this.undos = [];
        this.redos = [];
        this.findOffLand();
        this.draw();
    }

    // a place change done: the ground under it painted (done), or as it was (undone, redone)
    private placed({ t: token, i: id }: { t: number, i: number }) {
        const ask = this.placeAsks.get(token);
        if (!ask) return;
        this.placeAsks.delete(token);
        const step = ask.step, p = step.place;
        p.id = id;
        if (ask.kind == "do") {
            step.stroke = this.ground(p.before, p.after, step.label);
            this.push(this.undos, step);
            this.redos = [];
            if (p.after && !p.before) this.picked = id;
            this.say(step.label);
        } else {
            const done = step.stroke && this.painter.restore(step.label, ask.kind == "undo" ? step.stroke.before : step.stroke.after);
            if (done) this.send(done);
            this.push(ask.kind == "undo" ? this.redos : this.undos, step);
            this.say(`${ask.kind == "undo" ? "Undid" : "Redid"}: ${step.label}`);
        }
        this.findOffLand();
        this.draw();
    }

    // the map's places changed (anyone's): what's picked still there, a sprite still free for a new one
    private placesChanged() {
        if (this.picked != null && !this.placeOf(this.picked)) this.picked = null;
        const free = this.freePics();
        if (!free.includes(this.newPic)) this.newPic = free[0] ?? -1;
        this.findOffLand();
        this.drawPlaces();
        this.draw();
    }

    //#endregion

    //#region === Painting ===

    private mapPos(sx: number, sy: number) {
        const z = this.map.camera.getZoom();
        return { x: (sx + this.map.camera.scrollX) / z, y: (sy + this.map.camera.scrollY) / z };
    }

    // in tiles (a corner where they're whole)
    private tilePos(p: { x: number, y: number }) {
        const t = this.map.world.tile;
        return { x: p.x / t, y: p.y / t };
    }

    private mapDown(e: PIXI.FederatedPointerEvent) {
        // (right or middle, or Space held: the map's moved, not painted)
        if (e.button != 0 || this.space || !this.loaded) return;
        this.letGoOfName();
        const at = this.tilePos(this.mapPos(e.x, e.y));
        const tool = e.altKey ? Tool.PICK : this.tool;
        if (tool == Tool.PLACES) return this.placesDown(e, at);
        this.map.isPointerDown = false;
        this.map.follow(null);
        if (tool == Tool.PICK) return this.pick(at);
        if (!this.on) {
            this.say(this.offWhy, R64.SALMON);
            return this.draw();
        }
        if (tool == Tool.FILL) return this.fill(at);
        this.painter.begin(`Painted ${this.brush.name.toLowerCase()}`);
        this.down = at;
        this.painter.dab(this.brush, at.x, at.y, this.size);
    }

    private pointerMove(e: PointerEvent) {
        const over = this.painter?.painting || this.press || !this.container.getBounds().contains(e.clientX, e.clientY);
        this.pointer = over ? this.mapPos(e.clientX, e.clientY) : null;
        if (this.painter?.painting && this.pointer) {
            // dabs all along the way from the last, so a quick drag leaves no gaps
            const at = this.tilePos(this.pointer), from = this.down;
            const steps = Math.max(1, Math.ceil(Math.hypot(at.x - from.x, at.y - from.y) / DAB_STEP));
            for (let s = 1; s <= steps; s++) this.painter.dab(this.brush, from.x + (at.x - from.x) * s / steps, from.y + (at.y - from.y) * s / steps, this.size);
            this.down = at;
        }
        if (this.press && (this.dragTo || Math.hypot(e.clientX - this.press.sx, e.clientY - this.press.sy) > WorldMap.CLICK_SLOP)) this.dragTo = this.tileUnder(this.pointer);
        this.drawOverlay();
        this.drawPlaces();
        this.drawUnder();
    }

    private pointerUp() {
        if (this.painter?.painting) this.endStroke();
        if (this.press) this.placesUp();
    }

    private endStroke() {
        this.down = null;
        const stroke = this.painter.end();
        if (!stroke) return;
        this.push(this.undos, { label: stroke.label, stroke });
        this.redos = [];
        this.send(stroke);
        this.say("");
        this.findOffLand();
        this.draw();
    }

    private push(list: Step[], step: Step) {
        list.push(step);
        if (list.length > UNDO_MOST) list.shift();
    }

    private send(stroke: Stroke) {
        for (const part of this.painter.parts(stroke)) this.pending.add(IBC.net.mapEd.paint(part));
    }

    private fill(at: { x: number, y: number }) {
        if (this.brush.kind == "river" || this.brush.kind == "unriver") {
            this.say("Rivers can't be filled: paint them along where they run", AP.STRAW);
            return this.draw();
        }
        const f = this.painter.f, i = Math.round(at.x), j = Math.round(at.y);
        if (i < 0 || j < 0 || i > f.w || j > f.h) return;
        const got = this.painter.fillFrom(this.brush, j * (f.w + 1) + i);
        if (!got) {
            this.say(`Too much to fill (over ${FILL_MOST} corners): paint some of it first`, R64.SALMON);
            return this.draw();
        }
        this.painter.begin(`Filled ${this.brush.name.toLowerCase()}`);
        this.painter.apply(this.brush, got.corners, got.tiles);
        this.endStroke();
        this.showInfo();
    }

    private pick(at: { x: number, y: number }) {
        this.brush = this.painter.brushAt(at.x, at.y);
        this.say(`Picked ${this.brush.name.toLowerCase()}`);
        this.draw();
    }

    private undo() {
        if (this.painter?.painting || this.placeAsks.size) return;
        const step = this.undos.pop();
        if (!step) return;
        if (step.place) return this.askPlace(step.place.id, step.place.before, { kind: "undo", step });
        const done = this.painter.restore(step.label, step.stroke.before);
        if (done) this.send(done);
        this.redos.push(step);
        this.say(`Undid: ${step.label}`);
        this.findOffLand();
        this.draw();
    }

    private redo() {
        if (this.painter?.painting || this.placeAsks.size) return;
        const step = this.redos.pop();
        if (!step) return;
        if (step.place) return this.askPlace(step.place.id, step.place.after, { kind: "redo", step });
        const done = this.painter.restore(step.label, step.stroke.after);
        if (done) this.send(done);
        this.undos.push(step);
        this.say(`Redid: ${step.label}`);
        this.findOffLand();
        this.draw();
    }

    // the places standing where it isn't all land (but piers, out on the water)
    private findOffLand() {
        const f = this.painter?.f;
        if (!f) return;
        const pier = PLACE_KINDS.indexOf("pier"), VW = f.w + 1;
        this.offLand = this.map.world.places.filter((p) => p.k != pier &&
            [p.y * VW + p.x, p.y * VW + p.x + 1, (p.y + 1) * VW + p.x, (p.y + 1) * VW + p.x + 1].some((k) => !f.land[k]))
            .map((p) => ({ x: p.x, y: p.y, n: p.n || "A place" }));
        if (this.offAt >= this.offLand.length) this.offAt = -1;
    }

    private nextOffLand() {
        if (!this.offLand.length) return;
        this.offAt = (this.offAt + 1) % this.offLand.length;
        const p = this.offLand[this.offAt];
        this.goTo(p.x, p.y);
        this.say(`${this.offAt + 1}/${this.offLand.length}: ${p.n} isn't on the land`, R64.SALMON);
        this.draw();
    }

    private goTo(x: number, y: number) {
        const t = this.map.world.tile;
        this.map.follow(null);
        this.map.camera.centerOn((x + 0.5) * t, (y + 0.5) * t);
    }

    //#endregion

    //#region === Places ===

    private placeOf(id: number): MapPlace {
        const p = this.map.world.places.find((q) => q.i == id);
        return p ? { k: p.k, s: p.s, x: p.x, y: p.y, n: p.n } : null;
    }

    // the sprites no place has
    private freePics() {
        const used = new Set(this.map.world.places.map((p) => p.s));
        return PLACE_PICS.map((_, s) => s).filter((s) => !used.has(s));
    }

    private tileUnder(p: { x: number, y: number }) {
        if (!p) return null;
        const t = this.map.world.tile, { w, h } = this.map.world;
        return { x: Math.max(0, Math.min(w - 1, Math.floor(p.x / t))), y: Math.max(0, Math.min(h - 1, Math.floor(p.y / t))) };
    }

    // whether a place (but `id`) is on tile (x, y)
    private taken(x: number, y: number, id: number) {
        return this.map.world.places.some((p) => p.i != id && p.x == x && p.y == y);
    }

    private canChangePlaces() {
        const why = !this.on ? this.offWhy : this.placesWhy;
        if (why) {
            this.say(why, R64.SALMON);
            this.draw();
        }
        return !why;
    }

    private placesDown(e: PIXI.FederatedPointerEvent, at: { x: number, y: number }) {
        if (this.adding) {
            this.map.isPointerDown = false;
            const to = this.tileUnder(this.mapPos(e.x, e.y));
            if (!this.canChangePlaces()) return;
            if (this.taken(to.x, to.y, null)) {
                this.say("There's a place there already", R64.SALMON);
                return this.draw();
            }
            this.adding = false;
            this.changePlace(0, { k: this.newKind, s: this.newPic, x: to.x, y: to.y, n: "" }, `Put a new ${kindName(this.newKind)} on the map`);
            return;
        }
        const place = this.map.placeAt(e.x, e.y);
        if (!place) {
            // (the map moved, as ever)
            if (this.picked != null) { this.picked = null; this.drawPlaces(); this.draw(); }
            return;
        }
        this.map.isPointerDown = false;
        this.map.follow(null);
        this.picked = place.i;
        this.press = { id: place.i, sx: e.x, sy: e.y };
        this.drawPlaces();
        this.draw();
    }

    private placesUp() {
        const press = this.press, to = this.dragTo;
        this.press = null;
        this.dragTo = null;
        const p = this.placeOf(press.id);
        this.drawPlaces();
        if (!to || !p || (to.x == p.x && to.y == p.y)) return;
        if (!this.canChangePlaces()) return;
        if (this.taken(to.x, to.y, press.id)) {
            this.say("There's a place there already", R64.SALMON);
            return this.draw();
        }
        this.changePlace(press.id, { ...p, x: to.x, y: to.y }, `Moved ${p.n || title(kindName(p.k))}`);
    }

    // a place made as `after` (0: a new one; null: taken off), once the server's done it
    private changePlace(id: number, after: MapPlace, label: string) {
        if (this.placeAsks.size) {
            this.say("Wait for the last change to be done", AP.STRAW);
            return this.draw();
        }
        this.askPlace(id, after, { kind: "do", step: { label, place: { id, before: id ? this.placeOf(id) : null, after } } });
    }

    private askPlace(id: number, as: MapPlace, ask: PlaceAsk) {
        this.placeAsks.set(IBC.net.mapEd.place(id, as), ask);
        this.say("Saving...", AP.STRAW);
        this.draw();
    }

    // the ground a place has moved off kept, and the ground under where it's come to made (a stroke, sent)
    private ground(from: MapPlace, to: MapPlace, label: string) {
        const moved = !from || !to || from.x != to.x || from.y != to.y || from.k != to.k;
        if (!moved) return null;
        this.painter.begin(label);
        if (from) this.painter.pin(from.x, from.y, kindName(from.k));
        if (to) this.painter.settle(to.x, to.y, kindName(to.k));
        const stroke = this.painter.end();
        if (stroke) this.send(stroke);
        return stroke;
    }

    private letGoOfName() {
        if (!this.nameField.focused) return;
        this.nameField.setFocused(false);
        const p = this.picked != null ? this.placeOf(this.picked) : null, name = this.nameField.value.replace(/\s+/g, " ").trim();
        if (p && name != p.n && this.canChangePlaces()) this.changePlace(this.picked, { ...p, n: name }, name ? `Named it ${name}` : `Took ${p.n}'s name off`);
    }

    private takeOff() {
        const p = this.picked != null ? this.placeOf(this.picked) : null;
        if (!p || !this.canChangePlaces()) return;
        this.changePlace(this.picked, null, `Took ${p.n || title(kindName(p.k))} off the map`);
    }

    // the picked one's kind or sprite stepped (or the new one's), by `by`
    private stepKind(by: number) {
        const p = this.picked != null ? this.placeOf(this.picked) : null;
        const k = ((p ? p.k : this.newKind) + by + PLACE_KINDS.length) % PLACE_KINDS.length;
        if (!p) { this.newKind = k; return this.draw(); }
        if (this.canChangePlaces()) this.changePlace(this.picked, { ...p, k }, `Made ${p.n || "it"} a ${kindName(k)}`);
    }

    private stepPic(by: number) {
        const p = this.picked != null ? this.placeOf(this.picked) : null;
        const pics = p ? [p.s, ...this.freePics()].sort((a, b) => a - b) : this.freePics();
        if (!pics.length) return;
        const at = pics.indexOf(p ? p.s : this.newPic), s = pics[(Math.max(0, at) + by + pics.length) % pics.length];
        if (!p) {
            this.newPic = s;
            // (a kind's own sprite: that kind)
            const kind = PLACE_KINDS.indexOf(PLACE_PICS[s] as any);
            if (kind >= 0) this.newKind = kind;
            return this.draw();
        }
        if (s != p.s && this.canChangePlaces()) this.changePlace(this.picked, { ...p, s }, `Gave ${p.n || "it"} the ${PLACE_PICS[s]} sprite`);
    }

    //#endregion

    //#region === Keys ===

    private onKey(e: KeyboardEvent) {
        if (this.nameField.focused) {
            if (e.ctrlKey || e.metaKey || e.altKey) return;
            (e as any).chat = true;
            e.preventDefault();
            if (e.key == "Escape") {
                this.nameField.setFocused(false);
                return this.draw();         // (back as it was)
            }
            Chat.stop();
            this.nameField.key(e);
            return;
        }
        if (Chat.takes(e)) return;
        const ctrl = e.ctrlKey || e.metaKey;
        if (ctrl && e.code == "KeyZ") { e.preventDefault(); return e.shiftKey ? this.redo() : this.undo(); }
        if (ctrl && e.code == "KeyY") { e.preventDefault(); return this.redo(); }
        if (ctrl || e.altKey) return;
        if (e.code == "Space") { this.space = true; e.preventDefault(); return; }
        const tool = ["1", "2", "3", "4"].indexOf(e.key);
        if (tool >= 0) return this.setTool(tool);
        if (e.key == "[" || e.key == "]") return this.setSize(this.size + (e.key == "]" ? 1 : -1));
        if (e.code == "KeyG") { this.grid = !this.grid; this.layer.setGrid(this.grid); return this.draw(); }
        if (e.key == "Delete" && this.tool == Tool.PLACES) { e.preventDefault(); return this.takeOff(); }
        if (e.key == "Escape") {
            if (this.painter?.painting) this.endStroke();
            else if (this.adding) { this.adding = false; this.draw(); }
            else if (this.picked != null) { this.picked = null; this.drawPlaces(); this.draw(); }
            else IBC.comp.destroy(this);
        }
    }

    private setTool(tool: Tool) {
        this.tool = tool;
        this.adding = false;
        this.say("");
        this.drawOverlay();
        this.drawPlaces();
        this.draw();
    }

    private setSize(size: number) {
        this.size = Math.max(1, Math.min(SIZE_MOST, size));
        this.drawOverlay();
        this.draw();
    }

    //#endregion

    //#region === Drawing ===

    private say(line: string, tint: number = AP.ASH) {
        this.line = line;
        this.lineTint = tint;
    }

    private drawOverlay() {
        const tile = this.map.world.tile;
        const showing = this.pointer && this.loaded && this.tool != Tool.PICK && this.tool != Tool.PLACES;
        this.layer.drawBrush(showing ? this.tilePos(this.pointer) : null, this.brush.kind == "river" ? 1 : this.size, tile, this.tool == Tool.FILL);
    }

    // the place picked, and where one's being dragged or put
    private drawPlaces() {
        if (this.tool != Tool.PLACES) return this.layer.drawPlaces(null, null);
        const picked = this.picked != null ? this.placeOf(this.picked) : null;
        const to = this.dragTo ?? (this.adding ? this.tileUnder(this.pointer) : null);
        this.layer.drawPlaces(picked, to && { ...to, ok: !this.taken(to.x, to.y, this.press?.id) });
    }

    // what's under the pointer, along the bottom
    private drawUnder() {
        if (!this.under) return;
        if (!this.pointer || !this.loaded) { this.under.text = ""; return; }
        const at = this.tilePos(this.pointer);
        this.under.text = `${Math.floor(at.x)}, ${Math.floor(at.y)}: ${this.painter.describe(at.x, at.y)}`;
        fit(this.under, W - 8);
    }

    // the line along the bottom: what's pointed at, else what was said, else whether it's all saved
    private showInfo(pointed?: string, tint?: number) {
        if (!this.info) return;
        const busy = this.pending.size + this.placeAsks.size;
        this.info.text = pointed ?? (this.line || (busy ? "Saving..." : "All saved"));
        this.info.tint = pointed ? tint : this.line ? this.lineTint : busy ? AP.STRAW : AP.STONE;
        fit(this.info, W - 8 - SMALL_W * 2 - 8);
    }

    private windowSize() {
        const { SCALE, INSET_X, INSET_Y } = MapEditor;
        return { width: INSET_X * 2 + W * SCALE, height: INSET_Y + this.h * SCALE + INSET_X };
    }

    private draw() {
        this.body.removeChildren().forEach((c) => c.destroy({ children: true }));
        this.nameField.container.visible = false;
        this.info = null;
        this.under = null;
        const g = new PIXI.Graphics();
        this.body.addChild(g);
        let y = EDGE;

        // the tools
        TOOLS.forEach((t, k) => {
            const x = 2 + k * (TOOL_W + 2), on = k == this.tool;
            g.beginFill(on ? R64.LEMON : AP.IRON).drawRect(x, y, TOOL_W, BUTTON_H).endFill();
            g.beginFill(on ? AP.WHITE : AP.STEEL).drawRect(x, y, TOOL_W, 1).endFill();
            const label = text(`${k + 1} ${t.name}`, 0, y + 2, on ? AP.BLACK : AP.WHITE, this.body);
            label.x = Math.round(x + (TOOL_W - label.textWidth) / 2);
            this.hit(x, y, TOOL_W, BUTTON_H, () => this.setTool(k), `${t.name} (key ${k + 1})`);
        });
        y += BUTTON_H + 4;
        y = this.wrap(TOOLS[this.tool].hint, 4, y, AP.STONE) + 3;
        g.beginFill(AP.SLATE).drawRect(0, y, W, 1).endFill();
        y += 5;

        y = this.tool == Tool.PLACES ? this.drawPlacesPanel(g, y) : this.drawBrushes(g, y);
        g.beginFill(AP.SLATE).drawRect(0, y, W, 1).endFill();
        y += 5;

        // places off the land, what's under the pointer
        if (this.loaded) {
            const count = this.offLand.length;
            if (count) {
                const t = text(`${count} place${count == 1 ? "" : "s"} off the land: show ${this.offAt >= 0 ? "the next" : "the first"} >`, 4, y + 1, R64.SALMON, this.body);
                this.hit(2, y - 1, Math.ceil(t.textWidth) + 6, 11, () => this.nextOffLand(), "Go to it");
            } else text("Every place on the land", 4, y + 1, R64.LEAF, this.body);
            y += ROW;
            this.under = text("", 4, y, AP.STEEL, this.body);
            this.drawUnder();
            y += ROW;
        }

        // what's said, and Undo / Redo
        this.info = text("", 4, y + 2, AP.ASH, this.body);
        this.showInfo();
        const quiet = this.placeAsks.size == 0;
        const lastUndo = this.undos[this.undos.length - 1], lastRedo = this.redos[this.redos.length - 1];
        this.button(g, "Undo", W - 4 - SMALL_W * 2 - 3, y, SMALL_W, quiet && !!lastUndo, () => this.undo(), lastUndo && `Undo: ${lastUndo.label} (Ctrl+Z)`);
        this.button(g, "Redo", W - 4 - SMALL_W, y, SMALL_W, quiet && !!lastRedo, () => this.redo(), lastRedo && `Redo: ${lastRedo.label} (Ctrl+Y)`);
        y += BUTTON_H + EDGE;

        // the window round it all, as tall as it's come to
        this.h = y;
        this.back.clear().beginFill(AP.INK).drawRect(-4, -2, W + 8, this.h + 6).endFill();
        const { width, height } = this.windowSize();
        this.background.setSize(width, height);
        this.titleBar.setSize(width - 8, 20);
        this.container.hitArea = new PIXI.Rectangle(0, 0, width, height);
    }

    // the brushes, each with a tile it paints; its size, the grid
    private drawBrushes(g: PIXI.Graphics, y: number) {
        BRUSHES.forEach((b, n) => {
            const x = 2 + (n % 2) * (BRUSH_W + 2), by = y + Math.floor(n / 2) * BRUSH_H, on = b == this.brush;
            if (on) g.beginFill(AP.SLATE).drawRect(x, by, BRUSH_W, BRUSH_H - 1).endFill().lineStyle(1, R64.LEMON).drawRect(x + 0.5, by + 0.5, BRUSH_W - 1, BRUSH_H - 2).lineStyle(0);
            this.swatch(b, x + 1, by + 0.5, g);
            text(b.name, x + SWATCH + 5, by + 3, on ? R64.LEMON : AP.WHITE, this.body);
            this.hit(x, by, BRUSH_W, BRUSH_H - 1, () => { this.brush = b; this.say(""); this.draw(); }, b.hint);
        });
        y += Math.ceil(BRUSHES.length / 2) * BRUSH_H + 3;
        y = this.wrap(this.brush.hint, 4, y, AP.STONE) + 3;

        text("Size", 4, y + 2, AP.STONE, this.body);
        const left = text("<", 32, y + 2, R64.LEMON, this.body);
        const v = text(this.brush.kind == "river" ? "1" : `${this.size}`, 0, y + 2, AP.WHITE, this.body);
        v.x = Math.round(48 - v.textWidth / 2);
        const right = text(">", 60, y + 2, R64.LEMON, this.body);
        this.hit(left.x - 3, y, 10, 11, () => this.setSize(this.size - 1), "Smaller (key [)");
        this.hit(right.x - 3, y, 10, 11, () => this.setSize(this.size + 1), "Bigger (key ])");
        const grid = text(`Grid: ${this.grid ? "on" : "off"}`, 0, y + 2, this.grid ? R64.LEMON : AP.MIST, this.body);
        grid.x = W - 4 - Math.ceil(grid.textWidth);
        this.hit(grid.x - 2, y, Math.ceil(grid.textWidth) + 4, 11, () => { this.grid = !this.grid; this.layer.setGrid(this.grid); this.draw(); }, "The tiles' edges over the map (key G)");
        return y + ROW + 2;
    }

    // the place picked (its name, kind and sprite), or a new one to put
    private drawPlacesPanel(g: PIXI.Graphics, y: number) {
        if (this.placesWhy) {
            y = this.wrap(this.placesWhy, 4, y, R64.SALMON);
            return y + 4;
        }
        const p = this.picked != null ? this.placeOf(this.picked) : null;
        if (p) {
            const head = text(`#${this.picked}`, 4, y, R64.LEMON, this.body);
            text(`at ${p.x}, ${p.y}`, 8 + Math.ceil(head.textWidth), y, AP.STONE, this.body);
            const go = text("Go to", 0, y, R64.LEMON, this.body);
            go.x = W - 4 - Math.ceil(go.textWidth);
            this.hit(go.x - 2, y - 2, Math.ceil(go.textWidth) + 4, 11, () => this.goTo(p.x, p.y), "Put it in the middle of the screen");
            y += ROW;
            text("Name", 4, y + 2, AP.STONE, this.body);
            this.nameField.container.position.set(LABEL_W, y);
            this.nameField.container.visible = true;
            if (!this.nameField.focused) this.nameField.set(p.n);
            y += ROW;
        } else {
            text("New place", 4, y, AP.MIST, this.body);
            text("(or click one on the map)", 52, y, AP.IRON, this.body);
            y += ROW;
        }
        y = this.spinner("Kind", y, title(kindName(p ? p.k : this.newKind)), (by) => this.stepKind(by), "What it is: what heroes can do there");
        const s = p ? p.s : this.newPic;
        y = this.spinner("Sprite", y, s >= 0 ? PLACE_PICS[s] : "none left", (by) => this.stepPic(by), "Its picture on the map: one no other place has");
        // its sprite, as it's drawn on the map
        if (s >= 0) {
            const size = this.map.world.placeSize, sheet: PIXI.BaseTexture = PIXI.Assets.get("map-places").baseTexture;
            const sprite = new PIXI.Sprite(new PIXI.Texture(sheet, new PIXI.Rectangle(s * size, 0, size, size)));
            sprite.position.set(W - 4 - size, y - ROW * 2 - 2);
            g.beginFill(AP.SHADOW).drawRect(sprite.x - 1, sprite.y - 1, size + 2, size + 2).endFill();
            this.body.addChild(sprite);
        }
        y += 4;
        if (p) {
            this.button(g, "Take it off the map", 4, y, WIDE_W, true, () => this.takeOff(), "Its node stays, a waypoint (key Delete)");
        } else if (s >= 0) {
            this.button(g, this.adding ? "Click the map..." : "Put one on the map", 4, y, WIDE_W, !this.adding, () => { this.adding = true; this.say(""); this.draw(); }, "Then click where it goes (Esc: not)");
        } else this.wrap("Every sprite's taken: draw another in art/PlaceArt (PLACE_VARIANTS)", 4, y, AP.STRAW);
        return y + BUTTON_H + 6;
    }

    // a label, and < value > to step it
    private spinner(label: string, y: number, value: string, step: (by: number) => void, more?: string) {
        text(label, 4, y + 2, AP.STONE, this.body);
        const left = text("<", LABEL_W + 2, y + 2, R64.LEMON, this.body);
        const v = text(value, 0, y + 2, AP.WHITE, this.body);
        v.x = Math.round(LABEL_W + 46 - v.textWidth / 2);
        const right = text(">", LABEL_W + 88, y + 2, R64.LEMON, this.body);
        this.hit(left.x - 3, y, 10, 11, () => step(-1), more);
        this.hit(right.x - 3, y, 10, 11, () => step(1), more);
        return y + ROW;
    }

    // a tile the brush paints, small (taking off: crossed out)
    private swatch(b: Brush, x: number, y: number, g: PIXI.Graphics) {
        const S = this.sets;
        g.beginFill(AP.BLACK).drawRect(x - 1, y - 1, SWATCH + 2, SWATCH + 2).endFill();
        if (!S) return;
        const full = (set: string) => (S[set] as TileSet).full[0];
        const tiles = b.kind == "sea" ? [S.SEA[0]] : b.kind == "snow" ? [S.SNOW[0]]
            : b.kind == "river" ? [S.GRASS[0], S.RIVER[TO_E | TO_W]]
            : b.kind == "ground" && b.value ? [S.GRASS[0], full(["", "DESERT", "SWAMP", "ASH"][b.value])]
            : b.kind == "cover" && b.value ? [S.GRASS[0], full(["", "FOREST", "PINES", "SNOW_PINES", "DEAD", "HILLS", "MOUNTAINS", "PEAKS"][b.value])]
            : [S.GRASS[0]];
        for (const t of tiles) {
            const s = new PIXI.Sprite(this.map.texture(t));
            s.width = s.height = SWATCH;
            s.position.set(x, y);
            this.body.addChild(s);
        }
        if (b.kind == "unriver" || (b.kind == "ground" || b.kind == "cover") && !b.value) {
            const cross = new PIXI.Graphics().lineStyle(1.5, R64.SALMON).moveTo(x + 2, y + 2).lineTo(x + SWATCH - 2, y + SWATCH - 2).moveTo(x + SWATCH - 2, y + 2).lineTo(x + 2, y + SWATCH - 2);
            this.body.addChild(cross);
        }
    }

    // `line` across the window, wrapped; the y under it
    private wrap(line: string, x: number, y: number, tint: number) {
        let row = "";
        for (const word of line.split(" ")) {
            const next = row ? `${row} ${word}` : word;
            if (row && textWidth(next) > W - x * 2) {
                text(row, x, y, tint, this.body);
                y += 9;
                row = word;
            } else row = next;
        }
        if (row) {
            text(row, x, y, tint, this.body);
            y += 9;
        }
        return y;
    }

    // somewhere to click, saying what it is along the bottom while it's pointed at
    private hit(x: number, y: number, w: number, h: number, on: () => void, more?: string) {
        const area = new PIXI.Container();
        area.eventMode = "static";
        area.cursor = "pointer";
        area.hitArea = new PIXI.Rectangle(x, y, w, h);
        area.on("pointertap", on);
        if (more) {
            area.on("pointerover", () => this.showInfo(more, AP.WHITE));
            area.on("pointerout", () => this.showInfo());
        }
        this.body.addChild(area);
        return area;
    }

    private button(g: PIXI.Graphics, label: string, x: number, y: number, w: number, can: boolean, on: () => void, more?: string) {
        g.beginFill(can ? AP.IRON : AP.SLATE).drawRect(x, y, w, BUTTON_H).endFill();
        g.beginFill(can ? AP.STEEL : AP.IRON).drawRect(x, y, w, 1).endFill();
        const t = text(label, 0, y + 2, can ? AP.WHITE : AP.STONE, this.body);
        t.x = Math.round(x + (w - t.textWidth) / 2);
        if (can) this.hit(x, y, w, BUTTON_H, on, more);
    }

    //#endregion

}
