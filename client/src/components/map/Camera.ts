import * as PIXI from "pixi.js";
import { Map } from "./Map";

export class Camera {

    // whole multiples, so the map's pixels stay square (0.5 to see all of it)
    public static ZOOM_LEVELS = [0.5, 1, 2, 3, 4];

    private map: Map;

    public scrollX: number = 0;
    public scrollY: number = 0;
    public zoomIndex = 0;

    constructor(map: Map) {
        this.map = map;
    }

    // puts (x, y) on the map in the middle of the window
    public centerOn(x: number, y: number) {
        this.scrollX = x * this.getZoom() - window.innerWidth / 2;
        this.scrollY = y * this.getZoom() - window.innerHeight / 2;
        this.enforceBounds();
    }

    public zoomIn(e: PIXI.FederatedWheelEvent) {
        let zoomIndex = this.zoomIndex;
        zoomIndex++;
        if (zoomIndex >= Camera.ZOOM_LEVELS.length)
            zoomIndex = Camera.ZOOM_LEVELS.length - 1;
        this.setZoom(zoomIndex, e);
    }

    public zoomOut(e: PIXI.FederatedWheelEvent) {
        let zoomIndex = this.zoomIndex;
        zoomIndex--;
        if (zoomIndex < 0)
            zoomIndex = 0;
        this.setZoom(zoomIndex, e);
    }

    public setZoom(index: number, e?: PIXI.FederatedWheelEvent) {
        if (this.zoomIndex == index) return;
        this.zoomIndex = index;

        // keep the point of the map under the mouse where it is
        if (e) {
            const mouseX = e.clientX;
            const mouseY = e.clientY;
            const oldScale = this.map.container.scale.x;
            const newScale = Camera.ZOOM_LEVELS[index];
            this.scrollX = (mouseX + this.scrollX) / oldScale * newScale - mouseX;
            this.scrollY = (mouseY + this.scrollY) / oldScale * newScale - mouseY;
        }

        this.map.container.scale.set(this.getZoom());
        this.enforceBounds();
    }

    public getZoom() {
        return Camera.ZOOM_LEVELS[this.zoomIndex];
    }

    public move(x: number, y: number) {
        this.scrollX += x;
        this.scrollY += y;
        this.enforceBounds();
    }

    // keeps the view on the map (a map smaller than the window sits in its middle)
    public enforceBounds() {
        const width = this.map.width * this.getZoom();
        const height = this.map.height * this.getZoom();
        this.scrollX = width < window.innerWidth ? (width - window.innerWidth) / 2 : Math.max(0, Math.min(this.scrollX, width - window.innerWidth));
        this.scrollY = height < window.innerHeight ? (height - window.innerHeight) / 2 : Math.max(0, Math.min(this.scrollY, height - window.innerHeight));
    }

}