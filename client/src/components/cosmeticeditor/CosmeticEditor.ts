import * as PIXI from "pixi.js";
import { BACKDROP, Catalog, DYE_LOOKS, FREE, PACK_NAME_MOST, PART_NAMES, SUPPORTER, tierOf } from "../../../../shared/Wardrobe";
import { SCENE_H, SCENE_W } from "../../art/Backdrops";
import { Constants } from "../../constants/Constants";
import { Event } from "../../constants/Events";
import { AP, R64 } from "../../constants/Palette";
import { PART_COUNTS } from "../../data/CosmeticsData";
import { IBC } from "../../Engine";
import { Look, Looks } from "../../people/LookArt";
import { Panel } from "../../shared/Panel";
import { TitleBar } from "../../shared/ui/titlebar/TitleBar";
import { BaseComponent, ComponentType } from "../BaseComponent";
import { Chat } from "../chat/Chat";
import { fit } from "../heroroster/HeroRoster";
import { choiceColours, choiceName, isColour, personPart, tierCorner } from "../herocosmetics/HeroCosmetics";
import { sceneTexture } from "../herostatus/HeroStatus";

// The admin's Cosmetics editor (the user, 2026-10-28: "drag and drop to sort
// cosmetics between free, subscriber, and ones that can be purchased as parts
// of packs"), from the admin menu: a tab a part along the top, and under it a
// band for who its choices are for - Free, Supporter, then each pack - with
// the part's choices in them. Drag one into another band to move it; click
// some first to move them all at once (Esc lets go of them). On the dyes'
// tabs, "all three dyes" moves a dye in hair colour, clothes and trim
// together. New packs are named as they're made; click a pack's name to
// rename it, x to remove one with nothing in it. Nothing's kept till it's
// saved (shared/Wardrobe's Catalog, server managers/cosmetics), which
// everyone online is sent at once. The last tab, Backdrop, sorts the scenes a
// hero's status window can show (the user, 2026-10-29: "add status window
// backgrounds to cosmetic sorter"); "Where they are" is always everyone's, so isn't there.

const EDGE = 6;
const TAB_GAP = 8;
const BAND_HEAD = 11;           // a band's name line
const BAND_GAP = 4;
const SWATCH = 12, SWATCH_STEP = 14;
const FIGURE = 24, FIGURE_STEP = 28;
const SCENE_TW = 52, SCENE_TH = 24, SCENE_STEP_X = 56, SCENE_STEP_Y = 28;     // a backdrop: its middle, at half size
const DRAG_PX = 3;              // (screen px moved before a press is a drag)
const BUTTON_W = 44, BUTTON_H = 12;
const BASE: Looks = [0, 0, 1, 2, 3, 10, 14];   // who the hairstyles and outfits are shown on

interface Band { tier: number; x: number; y: number; w: number; h: number; }

export class CosmeticEditor extends BaseComponent {

    public static SCALE = 2;
    public static W = 300;              // in its own px
    public static INSET_X = 12;         // the window round it, in screen px
    public static INSET_Y = 28;

    private edit: Catalog;              // as sorted here (sent on Save)
    private look = 0;
    private together = true;            // (the dyes' tabs: all three moved as one)
    private picked = new Set<number>(); // (choices clicked, on this tab)
    private bands: Band[] = [];
    private saving = false;
    private line = "";
    private lineTint: number = AP.ASH;

    private press: { value: number, x: number, y: number } = null;
    private dragging: number[] = null;
    private over: Band = null;

    public background: Panel;
    public titleBar: TitleBar;
    private content: PIXI.Container;
    private back = new PIXI.Graphics();
    private body = new PIXI.Container();
    private highlight = new PIXI.Graphics();
    private info: PIXI.BitmapText;
    private ghost = new PIXI.Container();

    private keys = (e: KeyboardEvent) => {
        if (e.key != "Escape" || Chat.takes(e)) return;
        if (this.dragging || this.picked.size) this.letGo();
        else IBC.comp.destroy(this);
    };

    constructor() {
        super(ComponentType.COSMETIC_EDITOR);
        this.create();
    }

    public create() {
        super.create();
        const { INSET_X, INSET_Y } = CosmeticEditor;
        this.edit = clone(IBC.data.cosmetics.catalog);

        this.container.eventMode = "static";
        this.container.on("pointerdown", (e: PIXI.FederatedPointerEvent) => e.stopPropagation());
        this.background = new Panel(this.container);
        this.titleBar = new TitleBar(this);
        this.titleBar.setPosition(4, 4);
        this.titleBar.setTitle("Cosmetics Editor");

        this.content = new PIXI.Container();
        this.content.scale.set(CosmeticEditor.SCALE);
        this.content.position.set(INSET_X, INSET_Y);
        this.ghost.eventMode = "none";
        this.highlight.eventMode = "none";
        this.content.addChild(this.back, this.body, this.highlight, this.ghost);
        this.container.addChild(this.content);

        window.addEventListener("keydown", this.keys);
        IBC.events.register(Event.GLOBAL_POINTER_MOVE, this.pointerMove, this);
        IBC.events.register(Event.GLOBAL_POINTER_UP, this.pointerUp, this);
        IBC.events.register(Event.COSMETIC_CATALOG, this.catalogCame, this);
        IBC.events.register(Event.COSMETIC_REFUSED, (why: string) => { this.saving = false; this.say(why, R64.SALMON); this.draw(); }, this);
        this.draw();
        const { width, height } = this.size();
        this.setPosition(Math.round((window.innerWidth - width) / 2), Math.max(8, Math.round((window.innerHeight - height) / 2)));
    }

    public destroy() {
        super.destroy();
        window.removeEventListener("keydown", this.keys);
        IBC.events.unregisterAll(this);
        this.titleBar.destroy();
        this.background.destroy();
        this.container.destroy({ children: true });
    }

    //#region === Sorting ===

    private get changes() {
        const was = IBC.data.cosmetics.catalog;
        let n = 0;
        PART_COUNTS.forEach((count, look) => { for (let v = 0; v < count; v++) if (tierOf(this.edit, look, v) != tierOf(was, look, v)) n++; });
        const packs = (c: Catalog) => c.p.map((p) => `${p.i}:${p.n}`).join("|");
        return n + (packs(this.edit) != packs(was) ? 1 : 0);
    }

    // the looks a move on this tab moves (the three dyes together, if so)
    private get moved() {
        return DYE_LOOKS.includes(this.look) && this.together ? DYE_LOOKS : [this.look];
    }

    private move(values: number[], tier: number) {
        for (const look of this.moved) for (const v of values) this.edit.t[look][v] = tier;
        this.letGo();
    }

    private letGo() {
        this.picked.clear();
        this.press = null;
        this.dragging = null;
        this.over = null;
        this.ghost.removeChildren().forEach((c) => c.destroy({ children: true }));
        this.draw();
    }

    // a pack's in nothing, on any tab
    private isEmpty(packId: number) {
        return !this.edit.t.some((tiers) => tiers.includes(packId));
    }

    private addPack() {
        const name = this.askName("New pack's name", "");
        if (!name) return;
        const i = Math.max(0, ...this.edit.p.map((p) => p.i), ...IBC.data.cosmetics.catalog.p.map((p) => p.i)) + 1;
        this.edit.p.push({ i, n: name });
        this.draw();
    }

    private renamePack(i: number) {
        const pack = this.edit.p.find((p) => p.i == i);
        const name = this.askName("Pack's name", pack.n);
        if (name) { pack.n = name; this.draw(); }
    }

    private removePack(i: number) {
        if (!this.isEmpty(i)) return this.say("Empty it first: move what's in it out, on every tab", R64.SALMON);
        this.edit.p = this.edit.p.filter((p) => p.i != i);
        this.draw();
    }

    private askName(question: string, was: string) {
        const name = (window.prompt(question, was) ?? "").trim().slice(0, PACK_NAME_MOST);
        if (name && this.edit.p.some((p) => p.n.toLowerCase() == name.toLowerCase() && p.n != was)) {
            this.say(`There's a pack called ${name} already`, R64.SALMON);
            return "";
        }
        return name;
    }

    private save() {
        if (this.saving || !this.changes) return;
        this.saving = true;
        this.say("Saving...");
        IBC.net.cosmetic.save(this.edit);
        this.draw();
    }

    private revert() {
        this.edit = clone(IBC.data.cosmetics.catalog);
        this.say("");
        this.letGo();
    }

    // a save (ours or another editor's) came back: ours in, or theirs taken if there's nothing of ours unsaved
    private catalogCame() {
        if (this.saving) {
            this.saving = false;
            this.edit = clone(IBC.data.cosmetics.catalog);
            this.say("Saved - everyone online has it", R64.LEAF);
        } else if (!this.changes) {
            this.edit = clone(IBC.data.cosmetics.catalog);
        } else this.say("Another editor saved: Revert to see theirs, or Save over it", AP.STRAW);
        this.draw();
    }

    //#endregion

    //#region === Dragging ===

    private local(e: PointerEvent) {
        return this.content.toLocal(new PIXI.Point(e.clientX, e.clientY));
    }

    private bandAt(x: number, y: number) {
        return this.bands.find((b) => x >= b.x && x < b.x + b.w && y >= b.y && y < b.y + b.h) ?? null;
    }

    private pressed(value: number, e: PIXI.FederatedPointerEvent) {
        if (this.saving) return;
        this.press = { value, x: e.clientX, y: e.clientY };
    }

    private pointerMove(e: PointerEvent) {
        if (!this.press) return;
        if (!this.dragging) {
            if (Math.abs(e.clientX - this.press.x) + Math.abs(e.clientY - this.press.y) < DRAG_PX) return;
            // a picked one takes the others picked with it
            this.dragging = this.picked.has(this.press.value) ? Array.from(this.picked) : [this.press.value];
            this.makeGhost();
            this.draw();        // (those dragged, faint where they were)
        }
        const p = this.local(e);
        this.ghost.position.set(Math.round(p.x) - 6, Math.round(p.y) - 6);
        const over = this.bandAt(p.x, p.y);
        if (over != this.over) {
            this.over = over;
            this.drawHighlight();
        }
    }

    private pointerUp(e: PointerEvent) {
        if (!this.press) return;
        const value = this.press.value;
        this.press = null;
        if (!this.dragging) {
            // a click: picked, or no longer
            if (this.picked.has(value)) this.picked.delete(value);
            else this.picked.add(value);
            return this.draw();
        }
        const p = this.local(e), band = this.bandAt(p.x, p.y), values = this.dragging;
        if (band) this.move(values, band.tier);
        else this.letGo();
    }

    // what's dragged, under the pointer: the one pressed, and how many in all
    private makeGhost() {
        const g = new PIXI.Graphics();
        this.ghost.addChild(g);
        const v = this.press.value, n = this.dragging.length;
        const { w, h } = this.tile(g, this.ghost, 0, 0, v, false, false);
        this.ghost.alpha = 0.85;
        if (n > 1) {
            const t = text(`${n}`, w + 2, h - 6, AP.WHITE, this.ghost);
            g.beginFill(AP.BLACK).drawRect(w, h - 8, Math.ceil(t.textWidth) + 4, 10).endFill();
        }
    }

    //#endregion

    //#region === Drawing ===

    private size() {
        const { W, SCALE, INSET_X, INSET_Y } = CosmeticEditor;
        return { width: INSET_X * 2 + W * SCALE, height: INSET_Y + this.h * SCALE + INSET_X };
    }

    private h = 0;

    private say(line: string, tint: number = AP.ASH) {
        this.line = line;
        this.lineTint = tint;
    }

    // the line along the bottom: what's pointed at, else what was said, else whether it's saved
    private showInfo(pointed?: string, tint?: number) {
        if (!this.info) return;
        const changes = this.changes;
        this.info.text = pointed ?? (this.line || (changes ? `${changes} change${changes == 1 ? "" : "s"}, not saved yet` : "All saved"));
        this.info.tint = pointed ? tint : this.line ? this.lineTint : changes ? AP.STRAW : AP.STONE;
        fit(this.info, CosmeticEditor.W - 8 - BUTTON_W * 2 - 12);
    }

    private draw() {
        this.body.removeChildren().forEach((c) => c.destroy({ children: true }));
        this.info = null;
        this.bands = [];
        const W = CosmeticEditor.W;
        const g = new PIXI.Graphics();
        this.body.addChild(g);

        // the tabs
        let x = 4;
        PART_NAMES.forEach((name, look) => {
            const on = look == this.look;
            const t = text(name, x, EDGE, on ? AP.WHITE : AP.STONE, this.body);
            const w = Math.ceil(t.textWidth);
            if (on) g.beginFill(R64.LEMON).drawRect(x, EDGE + 9, w, 1).endFill();
            this.hit(x - 3, EDGE - 3, w + 6, 14, () => { this.look = look; this.picked.clear(); this.draw(); });
            x += w + TAB_GAP;
        });
        let y = EDGE + 16;

        // the dyes' tabs: all three together or not; and what to do
        if (DYE_LOOKS.includes(this.look)) {
            const box = text(this.together ? "[x]" : "[ ]", 4, y, R64.LEMON, this.body);
            const t = text("Move a dye in hair colour, clothes and trim together", 6 + Math.ceil(box.textWidth), y, AP.MIST, this.body);
            this.hit(1, y - 2, Math.ceil(box.textWidth + t.textWidth) + 8, 12, () => { this.together = !this.together; this.draw(); });
            y += 13;
        }
        text("Drag into a band to move; click some first to move them together", 4, y, AP.STONE, this.body);
        y += 14;

        // a band for each of who they're for
        const tiers = [FREE, SUPPORTER, ...this.edit.p.map((p) => p.i)];
        for (const tier of tiers) y = this.band(g, tier, y) + BAND_GAP;

        // a new pack
        const add = text("+ New pack", 6, y + 1, R64.LEMON, this.body);
        this.hit(2, y - 2, Math.ceil(add.textWidth) + 8, 13, () => this.addPack());
        y += 16;

        // what's said, and Revert / Save
        const changes = this.changes;
        this.info = text("", 4, y + 2, AP.ASH, this.body);
        this.showInfo();
        this.button(g, "Revert", W - 4 - BUTTON_W * 2 - 4, y, changes > 0 && !this.saving, () => this.revert());
        this.button(g, "Save", W - 4 - BUTTON_W, y, changes > 0 && !this.saving, () => this.save());
        y += BUTTON_H + EDGE;

        // the window round it all, as tall as it's come to
        this.h = y;
        this.back.clear().beginFill(AP.INK).drawRect(-4, -2, W + 8, this.h + 6).endFill();
        const { width, height } = this.size();
        this.background.setSize(width, height);
        this.titleBar.setSize(width - 8, 20);
        this.container.hitArea = new PIXI.Rectangle(0, 0, width, height);
        this.drawHighlight();
    }

    // a band: its name (a pack's to rename, and to remove if empty), and its choices on this tab
    private band(g: PIXI.Graphics, tier: number, top: number) {
        const W = CosmeticEditor.W, look = this.look;
        const values = [];
        // (a backdrop from 1: "Where they are" is always everyone's)
        for (let v = look == BACKDROP ? 1 : 0; v < PART_COUNTS[look]; v++) if (tierOf(this.edit, look, v) == tier) values.push(v);
        const { w: tw, h: th, stepX, stepY } = tileSize(look);
        const across = Math.floor((W - 12) / stepX);
        const rows = Math.max(1, Math.ceil(values.length / across));
        const h = BAND_HEAD + rows * stepY + 4;
        this.bands.push({ tier, x: 0, y: top, w: W, h });

        g.beginFill(AP.SHADOW).drawRect(0, top, W, h).endFill();
        g.beginFill(tier == FREE ? AP.STONE : tier == SUPPORTER ? AP.AMBER : AP.SKY).drawRect(0, top, 2, h).endFill();
        const pack = this.edit.p.find((p) => p.i == tier);
        const name = tier == FREE ? "Free - everyone" : tier == SUPPORTER ? "Supporter - Premium" : `${pack.n} pack`;
        const title = text(name, 6, top + 2, tier == FREE ? AP.MIST : tier == SUPPORTER ? AP.STRAW : AP.ICE, this.body);
        const count = text(`${values.length}`, 10 + Math.ceil(title.textWidth), top + 2, AP.STEEL, this.body);
        if (pack) {
            this.hit(4, top, Math.ceil(title.textWidth) + 4, BAND_HEAD, () => this.renamePack(tier), "Click to rename");
            if (this.isEmpty(tier)) {
                const x = text("x", W - 9, top + 2, R64.SALMON, this.body);
                this.hit(x.x - 3, top, 11, BAND_HEAD, () => this.removePack(tier));
            }
        }
        if (!values.length) text("(drop here)", 16 + Math.ceil(title.textWidth + count.textWidth), top + 2, AP.IRON, this.body);

        values.forEach((v, k) => {
            const x = 6 + (k % across) * stepX, y = top + BAND_HEAD + Math.floor(k / across) * stepY + 1;
            const dragged = this.dragging?.includes(v);
            this.tile(g, this.body, x, y, v, this.picked.has(v), dragged);
            const area = this.hit(x - 1, y - 1, tw + 2, th + 2, null, choiceName(look, v));
            area.on("pointerdown", (e: PIXI.FederatedPointerEvent) => this.pressed(v, e));
        });
        return top + h;
    }

    // a choice: a swatch, a little one of someone in it, or a backdrop's middle; framed white if picked, faint while dragged
    private tile(g: PIXI.Graphics, parent: PIXI.Container, x: number, y: number, v: number, picked: boolean, dragged: boolean) {
        const look = this.look, colours = choiceColours(look);
        const { w, h } = tileSize(look), size = w;
        g.beginFill(picked ? AP.WHITE : R64.INK, dragged ? 0.3 : 1).drawRect(x - 1, y - 1, w + 2, h + 2).endFill();
        if (look == BACKDROP) {
            // (drawn after the frame: a sprite in its own masked container)
            const view = new PIXI.Container();
            const pic = new PIXI.Sprite(sceneTexture(v));
            pic.scale.set(0.5);
            pic.position.set(-Math.round((SCENE_W / 2 - w) / 2), h - SCENE_H / 2);
            const mask = new PIXI.Graphics().beginFill(0xffffff).drawRect(0, 0, w, h).endFill();
            view.addChild(pic, mask);
            pic.mask = mask;
            view.position.set(x, y);
            view.alpha = dragged ? 0.3 : 1;
            view.eventMode = "none";
            parent.addChild(view);
        } else if (colours) {
            const [shade, main] = colours[v];
            g.beginFill(main, dragged ? 0.3 : 1).drawRect(x, y, size, size).endFill();
            g.beginFill(shade, dragged ? 0.3 : 1).drawRect(x, y + size - 3, size, 3).endFill();
        } else {
            g.beginFill(R64.SPRUCE, dragged ? 0.3 : 1).drawRect(x, y, size, size).endFill();
            const looks = [...BASE];
            looks[look] = v;
            const who = new PIXI.Sprite(personPart(looks, look == Look.HEAD ? 3 : 8, FIGURE));
            who.position.set(x + 4, y);
            who.alpha = dragged ? 0.3 : 1;
            who.eventMode = "none";
            parent.addChild(who);
        }
        // (the ghost's: who it's for now, as the hero's window shows it)
        // (over whatever was drawn last, so a backdrop doesn't hide it)
        if (parent == this.ghost) tierCorner(g, x + size, y, tierOf(this.edit, look, v), parent.children[parent.children.length - 1] as PIXI.Container);
        return { w, h };
    }

    // the band under what's dragged
    private drawHighlight() {
        this.highlight.clear();
        const b = this.over;
        if (!b || !this.dragging) return;
        this.highlight.beginFill(R64.LEMON, 0.18).drawRect(b.x, b.y, b.w, b.h).endFill()
            .beginFill(R64.LEMON).drawRect(b.x, b.y, b.w, 1).drawRect(b.x, b.y + b.h - 1, b.w, 1).endFill();
    }

    // somewhere to click (or press: `on` null), saying what it is along the bottom while it's pointed at
    private hit(x: number, y: number, w: number, h: number, on: () => void, more?: string) {
        const area = new PIXI.Container();
        area.eventMode = "static";
        area.cursor = "pointer";
        area.hitArea = new PIXI.Rectangle(x, y, w, h);
        if (on) area.on("pointertap", on);
        if (more) {
            area.on("pointerover", () => { if (!this.dragging) this.showInfo(more, AP.WHITE); });
            area.on("pointerout", () => this.showInfo());
        }
        this.body.addChild(area);
        return area;
    }

    private button(g: PIXI.Graphics, label: string, x: number, y: number, can: boolean, on: () => void) {
        g.beginFill(can ? AP.IRON : AP.SLATE).drawRect(x, y, BUTTON_W, BUTTON_H).endFill();
        g.beginFill(can ? AP.STEEL : AP.IRON).drawRect(x, y, BUTTON_W, 1).endFill();
        const t = text(label, 0, y + 2, can ? AP.WHITE : AP.STONE, this.body);
        t.x = Math.round(x + (BUTTON_W - t.textWidth) / 2);
        if (can) this.hit(x, y, BUTTON_W, BUTTON_H, on);
    }

    //#endregion

}

// a part's tiles: their size, and how far apart
function tileSize(look: number) {
    if (look == BACKDROP) return { w: SCENE_TW, h: SCENE_TH, stepX: SCENE_STEP_X, stepY: SCENE_STEP_Y };
    const colour = isColour(look), size = colour ? SWATCH : FIGURE, step = colour ? SWATCH_STEP : FIGURE_STEP;
    return { w: size, h: size, stepX: step, stepY: step };
}

function clone(catalog: Catalog): Catalog {
    return { t: catalog.t.map((tiers) => [...tiers]), p: catalog.p.map((p) => ({ ...p })) };
}

function text(text: string, x: number, y: number, tint: number, parent: PIXI.Container) {
    const t = new PIXI.BitmapText(text, { fontName: Constants.PIXEL_FONT, fontSize: 32 });
    t.tint = tint;
    t.position.set(Math.round(x), Math.round(y));
    t.eventMode = "none";
    parent.addChild(t);
    return t;
}

