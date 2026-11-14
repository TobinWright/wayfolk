import * as PIXI from "pixi.js";
import { IBC } from "../../Engine";
import { NodeType, TerrainType } from "../../constants/Constants";
import { Event } from "../../constants/Events";
import { AP, R64 } from "../../constants/Palette";
import { NodeJson, ND_Node } from "../../data/NodeData";
import { NewNode, NodesChange } from "../../network/NoEdHandler";
import { Panel } from "../../shared/Panel";
import { TextField } from "../../shared/ui/TextField";
import { TitleBar } from "../../shared/ui/titlebar/TitleBar";
import { BaseComponent, ComponentType } from "../BaseComponent";
import { Chat } from "../chat/Chat";
import { text, textWidth } from "../games/GameUI";
import { fit } from "../heroroster/HeroRoster";
import { Map as WorldMap } from "../map/Map";
import { NodeLayer, Overlay } from "./NodeLayer";
import { findProblems, Problem } from "./Problems";

// The node editor (admin menu, Nodes): the travel graph drawn over the map,
// edited by hand after tools/build-nodes.js (DESIGN.md "The travel graph").
// - Tools (keys 1-4): Select (click to pick), Add (a node where clicked,
//   linked to the one picked, so a road's laid click by click; on a link,
//   one put in it), Link (click another to link it to the one picked, again
//   to unlink; Shift goes on from it), Remove (a node or a link).
// - In any tool: drag a node to move it (to the middle of a tile; Shift: to
//   the px), Ctrl+click another to link or unlink it, Delete removes the one
//   picked, Esc lets go of it, Ctrl+Z / Ctrl+Y undo and redo, Ctrl+F finds.
// - The one picked is edited in the window, each change sent as it's made.
// - Problems: what's wrong with the graph (Problems.ts), stepped through.
// The server checks it all and keeps links both ways (server NoEdHandler);
// what each change did comes back, kept to undo.

enum Tool { SELECT, ADD, LINK, REMOVE }

const TOOLS = [
    { name: "Select", hint: "Click a node to pick it, drag one to move it (Shift: to the px)" },
    { name: "Add", hint: "Click the map for a node, linked to the one picked. Click a link to put one in it" },
    { name: "Link", hint: "Click a node to link it to the one picked (again: unlink). Shift: go on from it" },
    { name: "Remove", hint: "Click a node or a link to remove it. Places can only be moved" },
];

// the server's TerrainType, as build-nodes names a waypoint on it
const TERRAIN_NAMES: { [t: number]: string } = { 0: "Sea", 1: "Air", 2: "Grasslands", 3: "Tundra", 4: "Oasis", 5: "Steppe", 6: "Desert", 7: "Swamp", 8: "Marsh", 9: "Forest", 10: "Hills", 11: "Mountains" };
const TYPE_NAMES = ["Other", "Settlement", "Dungeon"];
const TERRAINS = Object.keys(TerrainType).length / 2;
const SIZE = [0, 100], LEVEL = [1, 300];     // (size: how far round it heroes walk about, map px)
const WAYPOINT_SIZE = 0;           // (heroes pass through, not walking about)

const W = 200;                          // in its own px
const EDGE = 4;
const ROW = 13;
const LABEL_W = 38;
const TOOL_W = 47, BUTTON_H = 12, SMALL_W = 36;
const UNDO_MOST = 200;
const MERGE_MS = 2000;                  // changes to the same field this near together are undone as one

// a change made, as it was before and after (null: not there)
interface Step { label: string; before: Map<number, NodeJson>; after: Map<number, NodeJson>; key?: string; at: number; }
// a change asked for, not back yet
interface Pending { kind: "do" | "undo" | "redo"; label: string; key?: string; value?: number; pick?: "added" | number; step?: Step; }
interface Press { sx: number; sy: number; node: ND_Node; link: [number, number]; shift: boolean; ctrl: boolean; }
type Field = "l" | "s" | "ty" | "te";

export class NodeEditor extends BaseComponent {

    public static SCALE = 2;
    public static INSET_X = 12;         // the window round it, in screen px
    public static INSET_Y = 28;

    private map: WorldMap;
    private layer: NodeLayer;
    private places: Set<number>;

    private tool = Tool.SELECT;
    private picked: number = null;
    private loaded = false;

    private undos: Step[] = [];
    private redos: Step[] = [];
    private pending = new Map<number, Pending>();

    private press: Press = null;
    private dragAt: { x: number, y: number } = null;
    private pointer: { x: number, y: number } = null;     // map px, while it's over the map
    private shift = false;

    private problems: Problem[] = [];
    private problemAt = -1;
    private found: { query: string, at: number } = null;

    private line = "";
    private lineTint: number = AP.ASH;

    public background: Panel;
    public titleBar: TitleBar;
    private content = new PIXI.Container();
    private back = new PIXI.Graphics();
    private body = new PIXI.Container();
    private fieldLayer = new PIXI.Container();
    private info: PIXI.BitmapText;
    private coords: PIXI.BitmapText;
    private h = 0;

    private nameField: TextField;
    private xField: TextField;
    private yField: TextField;
    private itemsField: TextField;
    private findField: TextField;
    private fields: TextField[];

    private keys = (e: KeyboardEvent) => this.onKey(e);
    private keyUp = (e: KeyboardEvent) => { if (e.key == "Shift") { this.shift = false; this.drawOverlay(); } };
    private paste = (e: ClipboardEvent) => this.fields.find((f) => f.focused)?.paste(e.clipboardData?.getData("text") ?? "");

    constructor() {
        super(ComponentType.NODE_EDITOR);
        this.create();
    }

    public create() {
        super.create();
        const { SCALE, INSET_X, INSET_Y } = NodeEditor;
        this.map = IBC.comp.getFirstByType(ComponentType.MAP) as WorldMap;
        this.places = new Set(this.map.world.places.map((p) => p.i));
        this.layer = new NodeLayer(this.map, this.places);

        this.container.eventMode = "static";
        this.container.on("pointerdown", (e: PIXI.FederatedPointerEvent) => { e.stopPropagation(); this.blurFields(); });
        this.background = new Panel(this.container);
        this.titleBar = new TitleBar(this);
        this.titleBar.setPosition(4, 4);
        this.titleBar.setTitle("Node Editor");

        this.content.scale.set(SCALE);
        this.content.position.set(INSET_X, INSET_Y);
        this.content.addChild(this.back, this.body, this.fieldLayer);
        this.container.addChild(this.content);

        const fieldW = W - LABEL_W - 4;
        const focus = (f: () => TextField) => () => this.blurFields(f());
        this.nameField = new TextField(fieldW, { max: 40, hint: "no name", onFocus: focus(() => this.nameField), onEnter: () => this.commit(this.nameField, true) });
        this.xField = new TextField(34, { max: 6, hint: "x", onFocus: focus(() => this.xField), onEnter: () => this.commit(this.xField, true) });
        this.yField = new TextField(34, { max: 6, hint: "y", onFocus: focus(() => this.yField), onEnter: () => this.commit(this.yField, true) });
        this.itemsField = new TextField(fieldW, { max: 500, hint: "[]", onFocus: focus(() => this.itemsField), onEnter: () => this.commit(this.itemsField, true) });
        this.findField = new TextField(fieldW, { max: 40, hint: "an id or a name, then Enter", onFocus: focus(() => this.findField), onEnter: (q) => this.find(q) });
        this.fields = [this.nameField, this.xField, this.yField, this.itemsField, this.findField];
        for (const f of this.fields) this.fieldLayer.addChild(f.container);

        window.addEventListener("keydown", this.keys, true);     // (first, so the map's keys see it's taken)
        window.addEventListener("keyup", this.keyUp);
        document.addEventListener("paste", this.paste);
        IBC.events.register(Event.MAP_POINTER_DOWN, this.mapDown, this);
        IBC.events.register(Event.GLOBAL_POINTER_MOVE, this.pointerMove, this);
        IBC.events.register(Event.GLOBAL_POINTER_UP, this.pointerUp, this);
        IBC.events.register(Event.NOED_NODE_LIST, this.listCame, this);
        IBC.events.register(Event.NOED_NODES_CHANGED, this.changed, this);
        IBC.events.register(Event.NOED_REFUSED, this.refused, this);

        // (always asked for again: another editor may have changed it since)
        this.loaded = IBC.data.nodes.init;
        IBC.net.noEd.getList();
        this.say(this.loaded ? "" : "Loading the nodes...");
        this.refresh();
        this.setPosition(16, 72);
    }

    public destroy() {
        super.destroy();
        window.removeEventListener("keydown", this.keys, true);
        window.removeEventListener("keyup", this.keyUp);
        document.removeEventListener("paste", this.paste);
        IBC.events.unregisterAll(this);
        this.layer.destroy();
        for (const f of this.fields) f.destroy();
        this.titleBar.destroy();
        this.background.destroy();
        this.container.destroy({ children: true });
    }

    public update(deltaTime: number) {
        for (const f of this.fields) f.update(deltaTime);
        this.layer.update();
    }

    //#region === Picking and finding ===

    private get pickedNode() {
        return this.picked != null ? IBC.data.nodes.getById(this.picked) : null;
    }

    private pick(id: number) {
        this.blurFields();
        this.picked = id != null && IBC.data.nodes.getById(id) ? id : null;
        this.refresh();
    }

    private goTo(x: number, y: number) {
        this.map.follow(null);
        this.map.camera.centerOn(x, y);
    }

    // by id ("12", "#12") or name; Enter again: the next one called that
    private find(query: string) {
        query = query.trim();
        if (!query) return;
        const nodes = IBC.data.nodes.nodes;
        const id = /^#?(\d+)$/.exec(query);
        const matches = id ? nodes.filter((n) => n.id == +id[1]) : nodes.filter((n) => n.name.toLowerCase().includes(query.toLowerCase())).sort((a, b) => a.id - b.id);
        if (!matches.length) {
            this.say(`No node ${id ? "#" + id[1] : "called " + query}`, R64.SALMON);
            return this.draw();
        }
        const at = this.found?.query == query ? (this.found.at + 1) % matches.length : 0;
        this.found = { query, at };
        const n = matches[at];
        this.say(matches.length > 1 ? `${at + 1} of ${matches.length} called that (Enter: the next)` : "");
        this.goTo(n.x, n.y);
        this.picked = n.id;
        this.refresh();
    }

    private nextProblem() {
        if (!this.problems.length) return;
        this.problemAt = (this.problemAt + 1) % this.problems.length;
        const p = this.problems[this.problemAt];
        this.say(`${this.problemAt + 1}/${this.problems.length}: ${p.text}`, R64.SALMON);
        this.goTo(p.x, p.y);
        if (p.id != null) this.pick(p.id);
        else this.draw();
    }

    //#endregion

    //#region === Changing ===

    // a change sent: kept to undo once it's done
    private ask(token: number, p: Pending) {
        this.pending.set(token, p);
        this.draw();
    }

    private put(nodes: Partial<NodeJson>[], label: string, more: Partial<Pending> = {}) {
        this.ask(IBC.net.noEd.put(nodes), { kind: "do", label, ...more });
    }

    private addNode(at: { x: number, y: number }, split: [number, number]) {
        const from = split ? null : this.pickedNode;
        const like = from ?? (split ? IBC.data.nodes.getById(split[0]) : null);
        const te = like?.terrain ?? TerrainType.GRASSLANDS;
        const node: NewNode = { x: at.x, y: at.y, e: split ?? (from ? [from.id] : []), n: TERRAIN_NAMES[te] ?? "", s: WAYPOINT_SIZE, ty: NodeType.OTHER, te };
        if (split) node.u = split;
        const label = split ? `Put a node between #${split[0]} and #${split[1]}` : from ? `Added a node after #${from.id}` : "Added a node";
        this.ask(IBC.net.noEd.add(node), { kind: "do", label, pick: "added" });
    }

    private removeNodes(ids: number[]) {
        if (!ids.length) return;
        this.ask(IBC.net.noEd.remove(ids), { kind: "do", label: `Removed ${ids.length == 1 ? "#" + ids[0] : ids.length + " nodes"}` });
    }

    // linked if they aren't (either way), unlinked if they are; `then`: picked after
    private toggleLink(a: number, b: number, then?: number) {
        const A = IBC.data.nodes.getById(a), B = IBC.data.nodes.getById(b);
        if (!A || !B || a == b) return;
        const on = A.edges.includes(b) || B.edges.includes(a);
        if (on) this.put([{ i: a, e: A.edges.filter((e) => e != b) }, { i: b, e: B.edges.filter((e) => e != a) }], `Unlinked #${a} and #${b}`, { pick: then });
        else this.put([{ i: a, e: [...A.edges, b] }], `Linked #${a} and #${b}`, { pick: then });
    }

    // a link that goes one way (a's to b) made both ways
    private fixLink(a: number, b: number) {
        const A = IBC.data.nodes.getById(a);
        if (A) this.put([{ i: a, e: A.edges.includes(b) ? A.edges : [...A.edges, b] }], `Made #${a} to #${b} both ways`);
    }

    // a number field of the one picked stepped (from what was last asked, if that's not back yet)
    private step(field: Field, by: number) {
        const n = this.pickedNode;
        if (!n) return;
        const key = `${field}:${n.id}`;
        const asked = Array.from(this.pending.values()).reverse().find((p) => p.key == key);
        const now = asked ? asked.value : field == "l" ? n.level : field == "s" ? n.size : field == "ty" ? n.type : n.terrain;
        const [lo, hi] = field == "l" ? LEVEL : field == "s" ? SIZE : field == "ty" ? [0, TYPE_NAMES.length - 1] : [0, TERRAINS - 1];
        let value = now + by;
        if (field == "ty" || field == "te") value = lo + (((value - lo) % (hi - lo + 1)) + (hi - lo + 1)) % (hi - lo + 1);
        else value = Math.max(lo, Math.min(hi, value));
        if (value == now) return;
        const names = { l: "level", s: "size", ty: "type", te: "terrain" };
        this.put([{ i: n.id, [field]: value }], `Set #${n.id}'s ${names[field]}`, { key, value });
    }

    // a field typed in, sent if it's changed; `done`: let go of it too
    private commit(field: TextField, done = false) {
        if (done) field.setFocused(false);
        const n = this.pickedNode;
        if (!n || field == this.findField) return;
        const v = field.value.trim();
        if (field == this.nameField && v != n.name) this.put([{ i: n.id, n: v }], `Renamed #${n.id}`);
        if (field == this.itemsField && v != n.resources) this.put([{ i: n.id, r: v }], `Set #${n.id}'s items`);
        if (field == this.xField || field == this.yField) {
            const isX = field == this.xField, num = Number(v), was = isX ? n.x : n.y;
            if (!v || !Number.isFinite(num)) {
                this.say(`${isX ? "X" : "Y"} has to be a number`, R64.SALMON);
                field.set(`${was}`);
            } else if (Math.round(num) != was) this.put([{ i: n.id, [isX ? "x" : "y"]: Math.round(num) }], `Moved #${n.id}`);
        }
        this.draw();
    }

    // the fields (but one) let go of, what's typed in them sent
    private blurFields(but?: TextField) {
        for (const f of this.fields) if (f != but && f.focused) {
            f.setFocused(false);
            this.commit(f);
        }
    }

    private undo() {
        if (this.pending.size) { this.say("Wait for the last change to be done", AP.STRAW); return this.draw(); }
        const step = this.undos.pop();
        if (step) this.ask(this.restore(step.before), { kind: "undo", label: step.label, step });
    }

    private redo() {
        if (this.pending.size) { this.say("Wait for the last change to be done", AP.STRAW); return this.draw(); }
        const step = this.redos.pop();
        if (step) this.ask(this.restore(step.after), { kind: "redo", label: step.label, step });
    }

    // the nodes made as they were in `state` (those null in it removed); its token
    private restore(state: Map<number, NodeJson>) {
        const nodes: NodeJson[] = [], removed: number[] = [];
        state.forEach((json, id) => {
            if (json) nodes.push(json);
            else if (IBC.data.nodes.getById(id)) removed.push(id);
        });
        return IBC.net.noEd.put(nodes, removed);
    }

    // a change done: kept to undo (with the last, if that was to the same field just now)
    private record(step: Step) {
        const last = this.undos[this.undos.length - 1];
        if (step.key && last?.key == step.key && step.at - last.at < MERGE_MS) {
            step.before.forEach((json, id) => { if (!last.before.has(id)) last.before.set(id, json); });
            step.after.forEach((json, id) => last.after.set(id, json));
            last.at = step.at;
        } else {
            this.undos.push(step);
            if (this.undos.length > UNDO_MOST) this.undos.shift();
        }
        this.redos = [];
    }

    //#endregion

    //#region === What comes back ===

    private listCame() {
        this.loaded = true;
        if (this.line == "Loading the nodes...") this.say("");
        if (this.picked != null && !IBC.data.nodes.getById(this.picked)) this.picked = null;
        this.refresh();
    }

    private changed(c: NodesChange) {
        const p = c.t != null ? this.pending.get(c.t) : null;
        if (p) {
            this.pending.delete(c.t);
            if (p.kind == "do") {
                this.record({ label: p.label, before: c.before, after: c.after, key: p.key, at: Date.now() });
                this.say(p.label);
            } else {
                (p.kind == "undo" ? this.redos : this.undos).push(p.step);
                this.say(`${p.kind == "undo" ? "Undid" : "Redid"}: ${p.label}`);
            }
            if (p.pick == "added" && c.added != null) this.picked = c.added;
            else if (typeof p.pick == "number") this.picked = p.pick;
        } else if (c.t == null) {
            // (another editor's: what would be undone may not be so any more)
            this.undos = [];
            this.redos = [];
            this.say("Another editor changed the nodes (nothing to undo now)", AP.STRAW);
        }
        if (this.picked != null && !IBC.data.nodes.getById(this.picked)) this.picked = null;
        this.refresh();
    }

    private refused({ t: token, w: why }: { t: number, w: string }) {
        const p = this.pending.get(token);
        if (!p) return;
        this.pending.delete(token);
        if (p.kind == "undo") this.undos.push(p.step);
        if (p.kind == "redo") this.redos.push(p.step);
        this.say(why, R64.SALMON);
        this.refresh();
    }

    //#endregion

    //#region === The map ===

    private mapPos(sx: number, sy: number) {
        const z = this.map.camera.getZoom();
        return { x: (sx + this.map.camera.scrollX) / z, y: (sy + this.map.camera.scrollY) / z };
    }

    // to the middle of the tile it's on (free: to the px)
    private snap(p: { x: number, y: number }, free: boolean) {
        if (free) return { x: Math.round(p.x), y: Math.round(p.y) };
        const t = this.map.world.tile;
        return { x: Math.floor(p.x / t) * t + t / 2, y: Math.floor(p.y / t) * t + t / 2 };
    }

    private mapDown(e: PIXI.FederatedPointerEvent) {
        if (e.button != 0 || !this.loaded) return;
        this.blurFields();
        const p = this.mapPos(e.x, e.y);
        const node = this.layer.nodeAt(p.x, p.y);
        this.press = { sx: e.x, sy: e.y, node, link: node ? null : this.layer.linkAt(p.x, p.y), shift: e.shiftKey, ctrl: e.ctrlKey || e.metaKey };
        // (a node pressed is dragged, not the map)
        if (node && this.tool != Tool.REMOVE) {
            this.map.isPointerDown = false;
            this.map.follow(null);
        }
    }

    private pointerMove(e: PointerEvent) {
        this.shift = e.shiftKey;
        const press = this.press;
        if (press?.node && this.tool != Tool.REMOVE) {
            if (this.dragAt || Math.hypot(e.clientX - press.sx, e.clientY - press.sy) > WorldMap.CLICK_SLOP)
                this.dragAt = this.snap(this.mapPos(e.clientX, e.clientY), e.shiftKey);
        }
        const overMap = this.dragAt || !this.container.getBounds().contains(e.clientX, e.clientY);
        this.pointer = overMap ? this.mapPos(e.clientX, e.clientY) : null;
        if (this.coords) this.coords.text = this.pointer ? `${Math.floor(this.pointer.x)}, ${Math.floor(this.pointer.y)}` : "";
        this.drawOverlay();
    }

    private pointerUp(e: PointerEvent) {
        const press = this.press;
        if (!press) return;
        this.press = null;
        if (this.dragAt) {
            const at = this.dragAt, n = press.node;
            this.dragAt = null;
            if (IBC.data.nodes.getById(n.id) && (at.x != n.x || at.y != n.y)) {
                this.picked = n.id;
                this.put([{ i: n.id, x: at.x, y: at.y }], `Moved #${n.id}`);
                this.refresh();
            } else this.drawOverlay();
            return;
        }
        // (the map dragged, not clicked)
        if (Math.hypot(e.clientX - press.sx, e.clientY - press.sy) > WorldMap.CLICK_SLOP) return;
        this.click(press, this.mapPos(press.sx, press.sy));
    }

    private click(press: Press, p: { x: number, y: number }) {
        const { node, link } = press;
        if (press.ctrl && node && this.picked != null && node.id != this.picked) return this.toggleLink(this.picked, node.id);
        switch (this.tool) {
            case Tool.SELECT:
                this.pick(node?.id ?? null);
                break;
            case Tool.ADD:
                if (node) return this.pick(node.id);
                this.addNode(this.snap(p, press.shift), link);
                break;
            case Tool.LINK:
                if (!node || node.id == this.picked) return this.pick(null);
                if (this.picked == null) return this.pick(node.id);
                this.toggleLink(this.picked, node.id, press.shift ? node.id : undefined);
                break;
            case Tool.REMOVE:
                if (node) this.removeNodes([node.id]);
                else if (link) this.toggleLink(link[0], link[1]);
                break;
        }
    }

    // over the map: what's pointed at, dragged, or about to be made
    private drawOverlay() {
        const o: Overlay = {};
        if (this.dragAt && this.press?.node) {
            o.drag = { id: this.press.node.id, ...this.dragAt };
            return this.layer.drawOverlay(o);
        }
        const p = this.pointer;
        if (!p || !this.loaded) return this.layer.drawOverlay(o);
        const node = this.layer.nodeAt(p.x, p.y);
        const link = node ? null : this.layer.linkAt(p.x, p.y);
        const picked = this.pickedNode;
        o.hover = node?.id;
        if (this.tool == Tool.ADD && !node) {
            const at = this.snap(p, this.shift);
            o.dot = at;
            if (link) { o.hoverLink = link; o.hoverTint = R64.LEMON; }
            else if (picked) o.line = { x1: picked.x, y1: picked.y, x2: at.x, y2: at.y, tint: R64.LEMON };
        } else if (this.tool == Tool.LINK && picked && node && node.id != picked.id) {
            const on = picked.edges.includes(node.id) || node.edges.includes(picked.id);
            o.hoverTint = on ? R64.SALMON : R64.LEAF;
            o.line = { x1: picked.x, y1: picked.y, x2: node.x, y2: node.y, tint: o.hoverTint };
        } else if (this.tool == Tool.REMOVE) {
            o.hoverTint = R64.SALMON;
            if (link) o.hoverLink = link;
        }
        this.layer.drawOverlay(o);
    }

    //#endregion

    //#region === Keys ===

    private onKey(e: KeyboardEvent) {
        const field = this.fields.find((f) => f.focused);
        if (field) {
            if (e.ctrlKey || e.metaKey || e.altKey) return;
            (e as any).chat = true;
            e.preventDefault();
            if (e.key == "Escape") {
                field.setFocused(false);
                this.refresh();         // (back as it was)
                return;
            }
            Chat.stop();
            field.key(e);
            return;
        }
        if (Chat.takes(e)) return;
        const ctrl = e.ctrlKey || e.metaKey;
        if (ctrl && e.code == "KeyZ") { e.preventDefault(); return e.shiftKey ? this.redo() : this.undo(); }
        if (ctrl && e.code == "KeyY") { e.preventDefault(); return this.redo(); }
        if (ctrl && e.code == "KeyF") { e.preventDefault(); this.blurFields(this.findField); this.findField.setFocused(true); return; }
        if (ctrl || e.altKey) return;
        if (e.key == "Shift") { this.shift = true; this.drawOverlay(); return; }
        const tool = ["1", "2", "3", "4"].indexOf(e.key);
        if (tool >= 0) return this.setTool(tool);
        if (e.key == "Escape") {
            if (this.dragAt) { this.dragAt = null; this.press = null; this.drawOverlay(); }
            else if (this.picked != null) this.pick(null);
            else IBC.comp.destroy(this);
            return;
        }
        if (e.key == "Delete" && this.picked != null) {
            e.preventDefault();
            this.removeNodes([this.picked]);
        }
    }

    private setTool(tool: Tool) {
        this.tool = tool;
        this.say("");
        this.refresh();
    }

    //#endregion

    //#region === Drawing ===

    private say(line: string, tint: number = AP.ASH) {
        this.line = line;
        this.lineTint = tint;
    }

    // all of it again: the map's layer, the problems, the window
    private refresh() {
        if (this.loaded) {
            const world = this.map.world;
            this.problems = findProblems(IBC.data.nodes, world.places, world.tile);
            if (this.problemAt >= this.problems.length) this.problemAt = -1;
        }
        this.layer.draw(this.picked);
        this.drawOverlay();
        this.draw();
    }

    private size() {
        const { SCALE, INSET_X, INSET_Y } = NodeEditor;
        return { width: INSET_X * 2 + W * SCALE, height: INSET_Y + this.h * SCALE + INSET_X };
    }

    // the line along the bottom: what's pointed at, else what was said, else whether it's all saved
    private showInfo(pointed?: string, tint?: number) {
        if (!this.info) return;
        const busy = this.pending.size;
        this.info.text = pointed ?? (this.line || (busy ? "Saving..." : "All saved"));
        this.info.tint = pointed ? tint : this.line ? this.lineTint : busy ? AP.STRAW : AP.STONE;
        fit(this.info, W - 8 - SMALL_W * 2 - 8);
    }

    private draw() {
        this.body.removeChildren().forEach((c) => c.destroy({ children: true }));
        for (const f of this.fields) f.container.visible = false;
        this.info = null;
        this.coords = null;
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

        if (!this.loaded) {
            text("Loading...", 4, y, AP.STONE, this.body);
            y += ROW;
        } else y = this.drawPicked(y);

        // finding, the problems, how many
        g.beginFill(AP.SLATE).drawRect(0, y, W, 1).endFill();
        y += 5;
        this.labelRow("Find", y);
        this.place(this.findField, LABEL_W, y);
        y += ROW + 1;
        if (this.loaded) {
            const count = this.problems.length;
            if (count) {
                const t = text(`${count} problem${count == 1 ? "" : "s"}: show ${this.problemAt >= 0 ? "the next" : "the first"} >`, 4, y + 1, R64.SALMON, this.body);
                this.hit(2, y - 1, Math.ceil(t.textWidth) + 6, 11, () => this.nextProblem(), "Pick it and go to it");
            } else text("No problems", 4, y + 1, R64.LEAF, this.body);
            y += ROW;
            const nodes = IBC.data.nodes;
            text(`${nodes.nodes.length} nodes, ${nodes.linkCount()} links`, 4, y, AP.STONE, this.body);
            this.coords = text(this.pointer ? `${Math.floor(this.pointer.x)}, ${Math.floor(this.pointer.y)}` : "", W - 56, y, AP.STEEL, this.body);
            y += ROW;
        }

        // what's said, and Undo / Redo
        this.info = text("", 4, y + 2, AP.ASH, this.body);
        this.showInfo();
        const quiet = this.pending.size == 0;
        const lastUndo = this.undos[this.undos.length - 1], lastRedo = this.redos[this.redos.length - 1];
        this.button(g, "Undo", W - 4 - SMALL_W * 2 - 3, y, quiet && !!lastUndo, () => this.undo(), lastUndo && `Undo: ${lastUndo.label} (Ctrl+Z)`);
        this.button(g, "Redo", W - 4 - SMALL_W, y, quiet && !!lastRedo, () => this.redo(), lastRedo && `Redo: ${lastRedo.label} (Ctrl+Y)`);
        y += BUTTON_H + EDGE;

        // the window round it all, as tall as it's come to
        this.h = y;
        this.back.clear().beginFill(AP.INK).drawRect(-4, -2, W + 8, this.h + 6).endFill();
        const { width, height } = this.size();
        this.background.setSize(width, height);
        this.titleBar.setSize(width - 8, 20);
        this.container.hitArea = new PIXI.Rectangle(0, 0, width, height);
    }

    // the one picked: what it is, its fields, its links
    private drawPicked(y: number) {
        const n = this.pickedNode;
        if (!n) {
            text("Nothing picked", 4, y, AP.STONE, this.body);
            text("Click a node on the map", 4, y + 10, AP.IRON, this.body);
            return y + 24;
        }
        const place = this.places.has(n.id);
        const head = text(`#${n.id}`, 4, y, R64.LEMON, this.body);
        text(place ? "a place on the map" : "a waypoint", 8 + Math.ceil(head.textWidth), y, place ? AP.SKY : AP.STONE, this.body);
        const go = text("Go to", 0, y, R64.LEMON, this.body);
        go.x = W - 4 - Math.ceil(go.textWidth);
        this.hit(go.x - 2, y - 2, Math.ceil(go.textWidth) + 4, 11, () => this.goTo(n.x, n.y), "Put it in the middle of the screen");
        y += ROW;

        this.labelRow("Name", y);
        this.place(this.nameField, LABEL_W, y, n.name);
        y += ROW;
        this.labelRow("Where", y);
        this.place(this.xField, LABEL_W, y, `${n.x}`);
        this.place(this.yField, LABEL_W + 38, y, `${n.y}`);
        const tile = this.map.world.tile;
        text(`tile ${Math.floor(n.x / tile)}, ${Math.floor(n.y / tile)}`, LABEL_W + 78, y + 2, AP.IRON, this.body);
        y += ROW;
        y = this.spinner("Level", y, `${n.level}`, "l", "Shift+click: 10 at a time");
        y = this.spinner("Size", y, `${n.size}`, "s", "How far round it heroes walk about while working here, map px (16 a tile). Shift+click: 10 at a time");
        y = this.spinner("Type", y, TYPE_NAMES[n.type] ?? `${n.type}`, "ty");
        y = this.spinner("Terrain", y, TERRAIN_NAMES[n.terrain] ?? `${n.terrain}`, "te", "The land the fights on the road by it are on");
        this.labelRow("Items", y);
        this.place(this.itemsField, LABEL_W, y, n.resources);
        y += ROW + 2;

        // its links (and any to it that it doesn't have): each to go to, unlink, or (one way) fix
        const nodes = IBC.data.nodes;
        const ends = new Set<number>(n.edges);
        for (const other of nodes.nodes) if (other.edges.includes(n.id)) ends.add(other.id);
        text(`Links (${ends.size})`, 4, y, AP.MIST, this.body);
        if (!ends.size) text("none: Link (3) to make some", 50, y, AP.IRON, this.body);
        y += 11;
        for (const id of Array.from(ends)) {
            const other = nodes.getById(id);
            const both = n.edges.includes(id) && !!other?.edges.includes(n.id);
            const name = text(`#${id} ${other ? other.name : "(not there)"}`, 8, y, both ? AP.WHITE : R64.SALMON, this.body);
            fit(name, 100);
            if (other) {
                this.hit(6, y - 1, 104, 10, () => { this.goTo(other.x, other.y); this.pick(id); }, `Pick #${id} and go to it`);
                text(`${Math.round(Math.hypot(other.x - n.x, other.y - n.y))}px`, 112, y, AP.STEEL, this.body);
                if (!both) {
                    const fix = text("fix", W - 24, y, R64.SALMON, this.body);
                    const [a, b] = n.edges.includes(id) ? [n.id, id] : [id, n.id];
                    this.hit(fix.x - 2, y - 1, Math.ceil(fix.textWidth) + 4, 10, () => this.fixLink(a, b), "It goes one way only: make it go both ways");
                }
            }
            const x = text("x", W - 8, y, R64.SALMON, this.body);
            const unlink = other ? () => this.toggleLink(n.id, id) : () => this.put([{ i: n.id, e: n.edges.filter((e) => e != id) }], `Unlinked #${n.id} from #${id}`);
            this.hit(x.x - 3, y - 1, 10, 10, unlink, "Unlink");
            y += 10;
        }
        return y + 4;
    }

    private labelRow(label: string, y: number) {
        text(label, 4, y + 2, AP.STONE, this.body);
    }

    // < value > for a number field of the one picked
    private spinner(label: string, y: number, value: string, field: Field, more?: string) {
        this.labelRow(label, y);
        const left = text("<", LABEL_W + 2, y + 2, R64.LEMON, this.body);
        const v = text(value, 0, y + 2, AP.WHITE, this.body);
        v.x = Math.round(LABEL_W + 40 - v.textWidth / 2);
        const right = text(">", LABEL_W + 76, y + 2, R64.LEMON, this.body);
        const by = (e: PIXI.FederatedPointerEvent) => ((field == "l" || field == "s") && e.shiftKey ? 10 : 1);
        this.hit(left.x - 3, y, 10, 11, null, more).on("pointertap", (e: PIXI.FederatedPointerEvent) => this.step(field, -by(e)));
        this.hit(right.x - 3, y, 10, 11, null, more).on("pointertap", (e: PIXI.FederatedPointerEvent) => this.step(field, by(e)));
        return y + ROW;
    }

    // a field shown at (x, y), with `value` in it unless it's being typed in
    private place(f: TextField, x: number, y: number, value?: string) {
        f.container.position.set(x, y);
        f.container.visible = true;
        if (value != null && !f.focused) f.set(value);
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

    // somewhere to click (or press: `on` null), saying what it is along the bottom while it's pointed at
    private hit(x: number, y: number, w: number, h: number, on: () => void, more?: string) {
        const area = new PIXI.Container();
        area.eventMode = "static";
        area.cursor = "pointer";
        area.hitArea = new PIXI.Rectangle(x, y, w, h);
        if (on) area.on("pointertap", on);
        if (more) {
            area.on("pointerover", () => this.showInfo(more, AP.WHITE));
            area.on("pointerout", () => this.showInfo());
        }
        this.body.addChild(area);
        return area;
    }

    private button(g: PIXI.Graphics, label: string, x: number, y: number, can: boolean, on: () => void, more?: string) {
        g.beginFill(can ? AP.IRON : AP.SLATE).drawRect(x, y, SMALL_W, BUTTON_H).endFill();
        g.beginFill(can ? AP.STEEL : AP.IRON).drawRect(x, y, SMALL_W, 1).endFill();
        const t = text(label, 0, y + 2, can ? AP.WHITE : AP.STONE, this.body);
        t.x = Math.round(x + (SMALL_W - t.textWidth) / 2);
        if (can) this.hit(x, y, SMALL_W, BUTTON_H, on, more);
    }

    //#endregion

}
