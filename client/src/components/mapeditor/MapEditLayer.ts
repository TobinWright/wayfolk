import * as PIXI from "pixi.js";
import { AP, R64 } from "../../constants/Palette";
import { Map } from "../map/Map";

// The map editor's drawing over the map: the brush where it'd paint, the
// places picked or being moved, and the tiles' edges (the grid). Lines are
// in screen px, the same at any zoom.

export class MapEditLayer {

    public container = new PIXI.Container();
    private gridLines = new PIXI.Graphics();
    private brush = new PIXI.Graphics();
    private placeLines = new PIXI.Graphics();
    private zoom = 0;
    private last: { at: { x: number, y: number }, size: number, tile: number, fill: boolean } = null;
    private lastPlaces: { picked: { x: number, y: number }, to: { x: number, y: number, ok: boolean } } = null;

    constructor(private map: Map) {
        this.container.eventMode = "none";
        this.gridLines.visible = false;
        this.container.addChild(this.gridLines, this.brush, this.placeLines);
        map.container.addChild(this.container);
    }

    public destroy() {
        this.container.destroy({ children: true });
    }

    // (again if the zoom's changed)
    public update() {
        if (this.map.camera.getZoom() == this.zoom) return;
        this.zoom = this.map.camera.getZoom();
        if (this.gridLines.visible) this.drawGrid();
        if (this.last) this.drawBrush(this.last.at, this.last.size, this.last.tile, this.last.fill);
        if (this.lastPlaces) this.drawPlaces(this.lastPlaces.picked, this.lastPlaces.to);
    }

    public setGrid(on: boolean) {
        this.gridLines.visible = on;
        if (on) this.drawGrid();
    }

    private drawGrid() {
        const { w, h, tile } = this.map.world, z = 1 / this.map.camera.getZoom();
        const g = this.gridLines.clear().lineStyle(1 * z, AP.BLACK, 0.25);
        for (let x = 0; x <= w; x++) g.moveTo(x * tile, 0).lineTo(x * tile, h * tile);
        for (let y = 0; y <= h; y++) g.moveTo(0, y * tile).lineTo(w * tile, y * tile);
    }

    // the brush at `at` (tiles; none: not shown): the corners it'd paint
    // round it (size 1: the nearest), or for a fill, a cross on the one picked
    public drawBrush(at: { x: number, y: number }, size: number, tile: number, fill: boolean) {
        this.last = at ? { at, size, tile, fill } : null;
        const g = this.brush.clear();
        if (!at) return;
        const z = 1 / this.map.camera.getZoom();
        const cx = Math.round(at.x) * tile, cy = Math.round(at.y) * tile;
        if (fill) {
            const s = 5 * z;
            g.lineStyle(2 * z, R64.LEMON).moveTo(cx - s, cy - s).lineTo(cx + s, cy + s).moveTo(cx + s, cy - s).lineTo(cx - s, cy + s);
            return;
        }
        if (size <= 1) {
            g.lineStyle(1 * z, AP.BLACK).beginFill(R64.LEMON).drawCircle(cx, cy, 3 * z).endFill();
            return;
        }
        g.lineStyle(2 * z, AP.BLACK, 0.6).drawCircle(at.x * tile, at.y * tile, (size / 2) * tile);
        g.lineStyle(1 * z, R64.LEMON).drawCircle(at.x * tile, at.y * tile, (size / 2) * tile);
    }

    // places: the one picked, boxed; where one's being moved or put (its tile,
    // and its sprite's box over it), and whether it can go there
    public drawPlaces(picked: { x: number, y: number }, to: { x: number, y: number, ok: boolean }) {
        this.lastPlaces = { picked, to };
        const g = this.placeLines.clear(), z = 1 / this.map.camera.getZoom();
        const { tile, placeSize: size } = this.map.world;
        const box = (p: { x: number, y: number }, tint: number) => {
            const left = (p.x + 0.5) * tile - size / 2, bottom = (p.y + 1) * tile + 4;
            g.lineStyle(2 * z, AP.BLACK, 0.6).drawRect(left, bottom - size, size, size);
            g.lineStyle(1 * z, tint).drawRect(left, bottom - size, size, size);
        };
        if (picked) box(picked, R64.LEMON);
        if (to) {
            g.lineStyle(0).beginFill(to.ok ? R64.LEAF : R64.SALMON, 0.35).drawRect(to.x * tile, to.y * tile, tile, tile).endFill();
            box(to, to.ok ? R64.LEAF : R64.SALMON);
        }
    }

}
