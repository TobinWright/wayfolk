import * as PIXI from "pixi.js";
import { FEET_Y, SCENE_H, SCENE_W } from "../../art/Backdrops";
import { cartTexture, crateTexture, passageStrips, stackTexture } from "../../art/WorkArt";
import { AP } from "../../constants/Palette";
import { AVATAR_TOP, Facing } from "../../people/AvatarArt";
import { Looks } from "../../people/LookArt";
import { personTexture } from "../../people/People";
import { Site, WorkScene } from "./AtWork";

// The tasks in a hero window that aren't at something (AtWork has those):
// odd jobs (TaskKind.WORK) - the party hauling crates from a stack on the
// left to a cart on the right, one each over their head, and back for the
// next, each at their own point in it -; and a dungeon run (EXPLORE) - down
// in it, walking on along a passage, torches on its brick walls going by,
// no sky over them (the window keeps them walking: `walks`).

const WALK = [1, 0, 2, 0];      // (as HeroWindow's: its frames in turn, a frame STEP_MS, WALK_SPEED scene px a second)
const STEP_MS = 150, WALK_SPEED = 24;

export class Hauling implements WorkScene {

    public static STACK_X = 16;         // the stack's middle
    public static CART_X = 140;         // the cart's
    public static FROM = 30;            // where they stand, taking one off the stack
    public static TO = 122;             // and putting it on the cart
    public static PAUSE_MS = 700;       // at either end
    public static HEAD = 16 + AVATAR_TOP - 1;   // scene px up from their feet a crate sits

    private crates: PIXI.Sprite[] = [];
    private walkMs = (Hauling.TO - Hauling.FROM) / WALK_SPEED * 1000;
    private cycle = 2 * (this.walkMs + Hauling.PAUSE_MS);

    constructor(public site: Site, private members: Looks[], private sprites: PIXI.Sprite[], private shadows: PIXI.Sprite[],
        private back: PIXI.Container, private front: PIXI.Container) {
        const H = Hauling, stack = new PIXI.Sprite(stackTexture()), cart = new PIXI.Sprite(cartTexture());
        stack.anchor.set(0.5, 1); cart.anchor.set(0.5, 1);
        stack.position.set(H.STACK_X, FEET_Y + 1); cart.position.set(H.CART_X, FEET_Y + 1);
        back.addChild(stack, cart);
        this.crates = members.map(() => {
            const c = new PIXI.Sprite(crateTexture());
            c.anchor.set(0.5, 1);
            front.addChild(c);
            return c;
        });
    }

    // where each is in their round: taking one off the stack, carrying it
    // over, putting it on the cart, walking back for the next
    public update(deltaTime: number) {
        const H = Hauling, now = Date.now(), n = this.members.length;
        this.members.forEach((looks, i) => {
            const sprite = this.sprites[i], shadow = this.shadows[i], crate = this.crates[i];
            if (sprite.destroyed) return;
            const t = (now + i * this.cycle / n) % this.cycle, P = H.PAUSE_MS, walk = this.walkMs;
            let x: number, facing: Facing, moving = true, carrying: boolean;
            if (t < P) { x = H.FROM; facing = Facing.LEFT; moving = false; carrying = t > P / 2; }
            else if (t < P + walk) { x = H.FROM + (H.TO - H.FROM) * (t - P) / walk; facing = Facing.RIGHT; carrying = true; }
            else if (t < 2 * P + walk) { x = H.TO; facing = Facing.RIGHT; moving = false; carrying = t < P * 1.5 + walk; }
            else { x = H.TO - (H.TO - H.FROM) * (t - 2 * P - walk) / walk; facing = Facing.LEFT; carrying = false; }
            x = Math.round(x);
            const frame = moving ? WALK[(Math.floor(now / STEP_MS) + i) % WALK.length] : 0;
            sprite.visible = shadow.visible = true;
            sprite.texture = personTexture(looks, facing, frame);
            sprite.position.set(x, FEET_Y + 1);
            shadow.position.set(x, FEET_Y);
            // (bobbing with their steps)
            crate.visible = carrying;
            crate.position.set(x, FEET_Y + 1 - H.HEAD + (frame ? 1 : 0));
        });
    }

    public destroy() {
        this.back.removeChildren().forEach((c) => c.destroy());
        this.front.removeChildren().forEach((c) => c.destroy());
        this.crates = [];
    }

}

export class Delving implements WorkScene {

    public static TORCH = [32, 16];     // a torch's flame in the wall's strip (art/WorkArt passageArt)
    public static GLOW_R = 10;
    public static FLICKER_MS = 140;

    public walks = true;
    public underground = true;
    private strips: { sprite: PIXI.TilingSprite, pace: number }[] = [];
    private glow = new PIXI.Graphics();
    private scroll = 0;
    private wallW: number;

    constructor(public site: Site, private back: PIXI.Container) {
        // (dark behind it all, over the land they went down from)
        const dark = new PIXI.Sprite(PIXI.Texture.WHITE);
        dark.width = SCENE_W; dark.height = SCENE_H; dark.tint = AP.BLACK;
        back.addChild(dark);
        const strips = passageStrips();
        this.wallW = strips[0].texture.width;
        this.strips = strips.map((s) => {
            const sprite = new PIXI.TilingSprite(s.texture, SCENE_W, SCENE_H);
            back.addChild(sprite);
            return { sprite, pace: s.pace };
        });
        this.glow.blendMode = PIXI.BLEND_MODES.ADD;
        back.addChild(this.glow);
    }

    // walking on (right), the walls going by; the torches' glow flickering on them
    public update(deltaTime: number) {
        const D = Delving;
        this.scroll += WALK_SPEED * deltaTime / 1000;
        for (const s of this.strips) s.sprite.tilePosition.x = -Math.floor(this.scroll * s.pace);
        const pace = this.strips[0].pace, f = Math.floor(Date.now() / D.FLICKER_MS), r = D.GLOW_R + (f % 3) - 1;
        const first = ((D.TORCH[0] - Math.floor(this.scroll * pace)) % this.wallW + this.wallW) % this.wallW;
        this.glow.clear();
        for (let x = first - this.wallW; x < SCENE_W + D.GLOW_R; x += this.wallW) {
            this.glow.beginFill(AP.AMBER, 0.14).drawCircle(x, D.TORCH[1], r).endFill();
            this.glow.beginFill(AP.STRAW, 0.12).drawCircle(x, D.TORCH[1], r * 0.5).endFill();
        }
    }

    public destroy() {
        this.back.removeChildren().forEach((c) => c.destroy());
        this.strips = [];
    }

}
