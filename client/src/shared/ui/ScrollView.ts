import * as PIXI from "pixi.js";

export class ScrollView {
    public container: PIXI.Container;
    public content: PIXI.Container;
    public maskRect: PIXI.Graphics;
    public scrollbar: PIXI.Graphics;
    public scrollContainerHeight: number;
    public viewHeight: number;
    public scrollRatio: number = 0;

    private _onMove: (e: MouseEvent) => void;
    private _onUp: () => void;
    private _dragOffsetY: number = 0;

    constructor(parent: PIXI.Container, width: number, height: number) {
        this.viewHeight = height;

        this.container = new PIXI.Container();
        parent.addChild(this.container);

        this.maskRect = new PIXI.Graphics();
        this.maskRect.beginFill(0x000000).drawRect(0, 0, width, height).endFill();
        this.container.addChild(this.maskRect);

        this.content = new PIXI.Container();
        this.content.mask = this.maskRect;
        this.container.addChild(this.content);

        this.scrollbar = new PIXI.Graphics();
        this.scrollbar.beginFill(0x888888).drawRect(0, 0, 6, 40).endFill();
        this.scrollbar.x = width - 6;
        this.container.addChild(this.scrollbar);

        // Bind listeners
        this._onMove = this.onMove.bind(this);
        this._onUp = this.onUp.bind(this);

        this.setupInteractions();
    }

    public destroy() {
        this.container.removeAllListeners();

        this.scrollbar.removeAllListeners();
        this.scrollbar.interactive = false;
        this.scrollbar.cursor = null;

        window.removeEventListener("mousemove", this._onMove);
        window.removeEventListener("mouseup", this._onUp);

        this.content.destroy({ children: true });
        this.maskRect.destroy();
        this.scrollbar.destroy();
        this.container.destroy();

        // Clear references
        this.content = null!;
        this.maskRect = null!;
        this.scrollbar = null!;
        this.container = null!;
        this._onMove = null!;
        this._onUp = null!;
    }

    public position(x: number, y: number) {
        this.container.position.set(x, y);
    }

    // (call setContentHeight after, to fit the scrollbar to it)
    public setViewHeight(h: number) {
        this.viewHeight = h;
        this.maskRect.clear().beginFill(0x000000).drawRect(0, 0, this.scrollbar.x + 6, h).endFill();
    }

    public setContentHeight(h: number) {
        this.scrollContainerHeight = h;
        const visibleRatio = Math.min(1, this.viewHeight / this.scrollContainerHeight);
        this.scrollbar.height = visibleRatio * this.viewHeight;
        this.updateScrollPosition();
    }

    public scrollTo(ratio: number) {
        this.scrollRatio = Math.max(0, Math.min(1, ratio));
        this.updateScrollPosition();
    }

    // how far down it's scrolled, and back to that: for content redrawn, which may now be
    // taller or shorter (call setContentHeight first); a ratio would land somewhere else
    public get scrollPx() {
        return -this.content.y;
    }

    public scrollToPx(px: number) {
        const maxScroll = Math.max(0, this.scrollContainerHeight - this.viewHeight);
        this.scrollTo(maxScroll ? px / maxScroll : 0);
    }

    private updateScrollPosition() {
        const maxScroll = Math.max(0, this.scrollContainerHeight - this.viewHeight);
        this.content.y = -this.scrollRatio * maxScroll;
        const scrollbarMaxY = this.viewHeight - this.scrollbar.height;
        this.scrollbar.y = this.scrollRatio * scrollbarMaxY;
    }

    private setupInteractions() {
        this.container.eventMode = "static";
        this.container.on("wheel", (e: WheelEvent) => {
            const delta = e.deltaY / (this.container.worldTransform.d || 1);    // (screen px, in the view's own)
            const maxScroll = Math.max(0, this.scrollContainerHeight - this.viewHeight);
            if (!maxScroll) return;     // (it all fits: nothing to scroll, and no dividing by 0)
            const newY = this.content.y - delta;
            this.scrollRatio = Math.max(0, Math.min(1, -newY / maxScroll));
            this.updateScrollPosition();
        });

        this.scrollbar.interactive = true;
        this.scrollbar.cursor = "pointer";
        this.scrollbar.on("pointerdown", this.onScrollbarDown, this);
    }

    // (in the view's own px, not the screen's: it may be drawn scaled, like the task planner's at 2x)
    private onScrollbarDown(event: PIXI.FederatedPointerEvent) {
        this._dragOffsetY = this.container.toLocal(event.global).y - this.scrollbar.y;
        window.addEventListener("mousemove", this._onMove);
        window.addEventListener("mouseup", this._onUp);
    }

    private onMove(moveEvent: MouseEvent) {
        const localY = this.container.toLocal(new PIXI.Point(moveEvent.clientX, moveEvent.clientY)).y - this._dragOffsetY;
        const scrollbarMaxY = this.viewHeight - this.scrollbar.height;
        const newY = Math.max(0, Math.min(scrollbarMaxY, localY));
        this.scrollRatio = newY / scrollbarMaxY || 0;
        this.updateScrollPosition();
    }

    private onUp() {
        window.removeEventListener("mousemove", this._onMove);
        window.removeEventListener("mouseup", this._onUp);
    }
}
