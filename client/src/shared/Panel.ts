import * as PIXI from "pixi.js";
import { ImageUtils } from "../utils/ImageUtils";
import { panelTexture } from "../art/PanelArt";

export enum CornerType {
    DEFAULT, LOOPED, ROUND
}

export class Panel {

    private parent: PIXI.Container;
    private textures: PIXI.Texture[];

    public container: PIXI.Container;
    public tl: PIXI.Sprite;
    public tr: PIXI.Sprite;
    public bl: PIXI.Sprite;
    public br: PIXI.Sprite;
    public l: PIXI.TilingSprite;
    public r: PIXI.TilingSprite;
    public t: PIXI.TilingSprite;
    public b: PIXI.TilingSprite;
    public c: PIXI.TilingSprite;

    public tlType: CornerType = CornerType.DEFAULT;
    public trType: CornerType = CornerType.DEFAULT;
    public blType: CornerType = CornerType.DEFAULT;
    public brType: CornerType = CornerType.DEFAULT;

    public width: number = 200;
    public height: number = 100;
    public scale: number = 2;

    constructor(parent: PIXI.Container) {
        this.parent = parent;

        this.create();
        this.reconstruct();
        this.popIn();
    }

    // its window popping in as it opens (the user, 2026-11-01: game feel):
    // growing from a little smaller round its middle and fading in, POP_MS.
    // (Round the middle by the window's pivot, so where it's put isn't touched)
    public static POP_MS = 140;
    private popIn() {
        const win = this.parent;
        if (win.scale.x != 1 || win.scale.y != 1) return;
        let t = 0;
        const step = () => {
            t += PIXI.Ticker.shared.deltaMS;
            const f = Math.min(1, t / Panel.POP_MS), s = 0.92 + 0.08 * (1 - Math.pow(1 - f, 3));
            if (win.destroyed || f >= 1) {
                PIXI.Ticker.shared.remove(step);
                if (!win.destroyed) { win.scale.set(1); win.pivot.set(0); win.alpha = 1; }
                return;
            }
            win.scale.set(s);
            win.pivot.set(this.width / 2 * (1 - 1 / s), this.height / 2 * (1 - 1 / s));
            win.alpha = Math.min(1, f * 1.5);
        };
        step();
        PIXI.Ticker.shared.add(step);
    }

    private create() {
        const texture = panelTexture();
        this.textures = ImageUtils.createTextureFrames(texture, 8, 8);

        this.container = new PIXI.Container();
        this.container.eventMode = "static";
        this.parent.addChild(this.container);

        this.tl = this.container.addChild(new PIXI.Sprite());
        this.tr = this.container.addChild(new PIXI.Sprite());
        this.bl = this.container.addChild(new PIXI.Sprite());
        this.br = this.container.addChild(new PIXI.Sprite());

        // edge textures: 1, 3, 5, 7
        this.l = this.container.addChild(new PIXI.TilingSprite(this.textures[3]));
        this.r = this.container.addChild(new PIXI.TilingSprite(this.textures[5]));
        this.t = this.container.addChild(new PIXI.TilingSprite(this.textures[1]));
        this.b = this.container.addChild(new PIXI.TilingSprite(this.textures[7]));
        this.c = this.container.addChild(new PIXI.TilingSprite(this.textures[4]));
    }

    public destroy() {
        this.container.destroy();
        this.container = null;
    }

    public update(deltaTime: number) {
    }

    public setPosition(x: number, y: number) {
        this.container.x = x;
        this.container.y = y;
    }

    public setSize(width: number, height: number) {
        this.width = width;
        this.height = height;
        this.reconstruct();
    }

    public setScale(scale: number) {
        this.scale = scale;
        this.reconstruct();
    }

    public setCorners(tl?: CornerType, tr?: CornerType, bl?: CornerType, br?: CornerType) {
        this.tlType = tl || this.tlType;
        this.trType = tr || this.trType;
        this.blType = bl || this.blType;
        this.brType = br || this.brType;
        this.reconstruct();
    }

    private reconstruct() {
        // set corner textures
        this.tl.texture = this.getCornerTexture(0, this.tlType);
        this.tr.texture = this.getCornerTexture(1, this.trType);
        this.bl.texture = this.getCornerTexture(2, this.blType);
        this.br.texture = this.getCornerTexture(3, this.brType);

        // set scale
        this.tl.scale.set(this.scale);
        this.tr.scale.set(this.scale);
        this.bl.scale.set(this.scale);
        this.br.scale.set(this.scale);

        this.l.tileScale.set(this.scale);// scale.set(this.scale);
        this.r.tileScale.set(this.scale);
        this.t.tileScale.set(this.scale);
        this.b.tileScale.set(this.scale);
        this.c.tileScale.set(this.scale);

        // set position
        const dim = 8 * this.scale;

        this.tl.x = 0;
        this.tl.y = 0;
        this.tr.x = this.width - dim;
        this.tr.y = 0;
        this.bl.x = 0;
        this.bl.y = this.height - dim;
        this.br.x = this.width - dim;
        this.br.y = this.height - dim;

        this.l.x = 0;
        this.l.y = dim;
        this.r.x = this.width - dim;
        this.r.y = dim;
        this.t.x = dim;
        this.t.y = 0;
        this.b.x = dim;
        this.b.y = this.height - dim;
        this.c.x = dim;
        this.c.y = dim;

        // set size
        this.l.width = dim;
        this.l.height = this.height - (dim * 2);
        this.r.width = dim;
        this.r.height = this.height - (dim * 2);
        this.t.width = this.width - (dim * 2);
        this.t.height = dim;
        this.b.width = this.width - (dim * 2);
        this.b.height = dim;
        this.c.width = this.width - (dim * 2);
        this.c.height = this.height - (dim * 2);
    }

    private getCornerTexture(corner: number, type: CornerType) {
        let index = 0;
        switch (type) {
            case CornerType.DEFAULT:
                switch (corner) {
                    case 0: index = 0; break;
                    case 1: index = 2; break;
                    case 2: index = 6; break;
                    case 3: index = 8; break;
                }
                break;

            case CornerType.LOOPED:
                switch (corner) {
                    case 0: index = 9; break;
                    case 1: index = 11; break;
                    case 2: index = 15; break;
                    case 3: index = 17; break;
                }
                break;

            case CornerType.ROUND:
                switch (corner) {
                    case 0: index = 18; break;
                    case 1: index = 20; break;
                    case 2: index = 24; break;
                    case 3: index = 26; break;
                }
                break;
        }
        return this.textures[index];
    }

}