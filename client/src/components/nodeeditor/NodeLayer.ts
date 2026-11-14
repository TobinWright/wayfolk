import * as PIXI from "pixi.js";
import { IBC } from "../../Engine";
import { Constants, NodeType } from "../../constants/Constants";
import { AP, R64 } from "../../constants/Palette";
import { ND_Node } from "../../data/NodeData";
import { Map } from "../map/Map";

// The node editor's drawing over the map: the links, the nodes (by what they
// are and how big), and over them what's picked, pointed at, dragged, or
// about to be made. Sizes are in screen px, the same at any zoom. It also
// finds what's under a point (nodeAt, linkAt).

// what's going on, drawn over the rest
export interface Overlay {
    hover?: number;                     // a node pointed at
    hoverLink?: [number, number];       // a link pointed at
    hoverTint?: number;
    drag?: { id: number, x: number, y: number };
    line?: { x1: number, y1: number, x2: number, y2: number, tint: number };   // a link about to be made or undone
    dot?: { x: number, y: number };     // a node about to be made
}

const LINK_W = 2, PICKED_LINK_W = 3;
const HIT_NODE = 8;                     // screen px round a node it's still pointed at
const HIT_LINK = 5;

export class NodeLayer {

    public container = new PIXI.Container();
    private links = new PIXI.Graphics();
    private dots = new PIXI.Graphics();
    private over = new PIXI.Graphics();
    private pickedLabel = new PIXI.Container();
    private hoverLabel = new PIXI.Container();
    private zoom = 0;
    private picked: number = null;

    constructor(private map: Map, private places: Set<number>) {
        this.container.eventMode = "none";
        this.container.addChild(this.links, this.dots, this.over, this.pickedLabel, this.hoverLabel);
        map.container.addChild(this.container);
    }

    public destroy() {
        this.container.destroy({ children: true });
    }

    private get nodes() {
        return IBC.data.nodes;
    }

    // the radius its dot's drawn at, in screen px (its size is the area round it: drawn as it is, map px)
    private radius(n: ND_Node) {
        return this.places.has(n.id) ? 6 : 4;
    }

    private tint(n: ND_Node) {
        if (n.type == NodeType.SETTLEMENT) return AP.AMBER;
        if (n.type == NodeType.DUNGEON) return R64.CORAL;
        return this.places.has(n.id) ? AP.SKY : AP.MIST;
    }

    // (again if the zoom's changed: widths are in screen px)
    public update() {
        if (this.map.camera.getZoom() != this.zoom) this.draw(this.picked);
    }

    public draw(picked: number) {
        this.picked = picked;
        this.zoom = this.map.camera.getZoom();
        const z = 1 / this.zoom;
        const g = this.links.clear(), d = this.dots.clear();

        // the links, once each; one way only, red with an arrow
        for (const n of this.nodes.nodes) for (const e of n.edges) {
            const o = this.nodes.getById(e);
            if (!o) continue;
            const both = o.edges.includes(n.id);
            if (both && e < n.id) continue;
            const lit = n.id == picked || e == picked;
            g.lineStyle((lit ? PICKED_LINK_W : LINK_W) * z, !both ? R64.SALMON : lit ? R64.LEMON : AP.WHITE, lit || !both ? 1 : 0.55);
            g.moveTo(n.x, n.y).lineTo(o.x, o.y);
            if (!both) this.arrow(g, n.x, n.y, o.x, o.y, this.radius(o) * z, R64.SALMON);
        }

        // the areas heroes walk about in (their size), under the dots; the one picked lit
        for (const n of this.nodes.nodes) {
            if (n.size <= 0) continue;
            const lit = n.id == picked;
            d.lineStyle(1 * z, lit ? R64.LEMON : this.tint(n), lit ? 0.9 : 0.5).beginFill(this.tint(n), lit ? 0.18 : 0.08).drawCircle(n.x, n.y, n.size).endFill();
        }

        // the nodes
        for (const n of this.nodes.nodes) {
            const r = this.radius(n) * z;
            d.lineStyle(1 * z, AP.BLACK).beginFill(this.tint(n)).drawCircle(n.x, n.y, r).endFill();
        }

        clear(this.pickedLabel);
        const p = picked != null ? this.nodes.getById(picked) : null;
        if (p) {
            d.lineStyle(2 * z, R64.LEMON).drawCircle(p.x, p.y, (this.radius(p) + 3) * z);
            this.label(p, R64.LEMON, this.pickedLabel);
        }
    }

    public drawOverlay(o: Overlay) {
        const z = 1 / this.map.camera.getZoom();
        const g = this.over.clear();
        clear(this.hoverLabel);

        if (o.hoverLink) {
            const [a, b] = o.hoverLink.map((id) => this.nodes.getById(id));
            if (a && b) g.lineStyle(PICKED_LINK_W * z, o.hoverTint ?? AP.WHITE).moveTo(a.x, a.y).lineTo(b.x, b.y);
        }
        if (o.drag) {
            const n = this.nodes.getById(o.drag.id);
            if (n) {
                g.lineStyle(LINK_W * z, R64.LEMON, 0.9);
                for (const e of n.edges) {
                    const other = this.nodes.getById(e);
                    if (other) g.moveTo(o.drag.x, o.drag.y).lineTo(other.x, other.y);
                }
                g.lineStyle(1 * z, AP.BLACK).beginFill(R64.LEMON).drawCircle(o.drag.x, o.drag.y, this.radius(n) * z).endFill();
                g.lineStyle(0).beginFill(AP.BLACK, 0.5).drawCircle(n.x, n.y, this.radius(n) * z).endFill();
            }
        }
        if (o.line) g.lineStyle(PICKED_LINK_W * z, o.line.tint, 0.9).moveTo(o.line.x1, o.line.y1).lineTo(o.line.x2, o.line.y2);
        if (o.dot) g.lineStyle(1 * z, AP.BLACK).beginFill(R64.LEMON, 0.8).drawCircle(o.dot.x, o.dot.y, 3 * z).endFill();
        const h = o.hover != null ? this.nodes.getById(o.hover) : null;
        if (h) {
            g.lineStyle(2 * z, o.hoverTint ?? AP.WHITE).drawCircle(h.x, h.y, (this.radius(h) + 2) * z);
            if (h.id != this.picked) this.label(h, o.hoverTint ?? AP.WHITE, this.hoverLabel);
        }
    }

    // its id and name in a box over it, the same size at any zoom
    private label(n: ND_Node, tint: number, into: PIXI.Container) {
        const box = new PIXI.Container();
        const t = new PIXI.BitmapText(`#${n.id} ${n.name}`.trim(), { fontName: Constants.PIXEL_FONT, fontSize: 32 });
        t.tint = tint;
        const w = Math.ceil(t.textWidth) + 6;
        const back = new PIXI.Graphics()
            .beginFill(AP.BLACK).drawRect(-w / 2, -12, w, 12).endFill()
            .beginFill(AP.SHADOW).drawRect(-w / 2 + 1, -11, w - 2, 10).endFill();
        t.position.set(Math.round(-w / 2 + 3), -10);
        box.addChild(back, t);
        box.scale.set(Map.LABEL_SCALE / this.map.camera.getZoom());
        box.position.set(n.x, n.y - (this.radius(n) + 4) / this.map.camera.getZoom());
        into.addChild(box);
    }

    private arrow(g: PIXI.Graphics, x1: number, y1: number, x2: number, y2: number, back: number, tint: number) {
        const len = Math.hypot(x2 - x1, y2 - y1);
        if (!len) return;
        const ux = (x2 - x1) / len, uy = (y2 - y1) / len, z = 1 / this.zoom, s = 6 * z;
        const tx = x2 - ux * back, ty = y2 - uy * back;
        g.lineStyle(0).beginFill(tint)
            .drawPolygon([tx, ty, tx - ux * s - uy * s * 0.6, ty - uy * s + ux * s * 0.6, tx - ux * s + uy * s * 0.6, ty - uy * s - ux * s * 0.6])
            .endFill();
    }

    //#region === Finding ===

    // the node under (x, y) in map px, nearest first; null none
    public nodeAt(x: number, y: number): ND_Node {
        const z = 1 / this.map.camera.getZoom();
        let best: ND_Node = null, bestD = Infinity;
        for (const n of this.nodes.nodes) {
            const d = Math.hypot(n.x - x, n.y - y);
            if (d <= Math.max(this.radius(n), HIT_NODE) * z && d < bestD) { best = n; bestD = d; }
        }
        return best;
    }

    // the link under (x, y), its two ends; null none
    public linkAt(x: number, y: number): [number, number] {
        const reach = HIT_LINK / this.map.camera.getZoom();
        let best: [number, number] = null, bestD = reach;
        for (const n of this.nodes.nodes) for (const e of n.edges) {
            const o = this.nodes.getById(e);
            if (!o || (e < n.id && o.edges.includes(n.id))) continue;
            const d = toSegment(x, y, n.x, n.y, o.x, o.y);
            if (d <= bestD) { best = [n.id, e]; bestD = d; }
        }
        return best;
    }

    //#endregion

}

function clear(c: PIXI.Container) {
    c.removeChildren().forEach((child) => child.destroy({ children: true }));
}

// how far (x, y) is from the line from (x1, y1) to (x2, y2)
export function toSegment(x: number, y: number, x1: number, y1: number, x2: number, y2: number) {
    const dx = x2 - x1, dy = y2 - y1, len2 = dx * dx + dy * dy;
    const t = len2 ? Math.max(0, Math.min(1, ((x - x1) * dx + (y - y1) * dy) / len2)) : 0;
    return Math.hypot(x - (x1 + t * dx), y - (y1 + t * dy));
}
