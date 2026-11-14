import * as PIXI from "pixi.js";
import { SKILL_NAMES, STAT_NAMES } from "../../../../shared/Heroes";
import { materialOf } from "../../../../shared/Locations";
import { isTown, kindOf, placeName } from "../../../../shared/Places";
import {
    AMOUNTS, craftBaseMs, craftLevel, GATHER_MS, gatherLevel, gatherSkill, gearPower, itemName, itemTier, itemWorth,
    jewelBonus, recipeOf, RECIPES, SLOT_NAMES, slotsFor, Task, TaskKind, taskText, todoMost, TOOL_SKILL, toolRate,
    TWO_HANDED, hasQuality, LUCK_MUL_MOST, QUALITY_MUL, QUALITY_NAMES, qualityOdds, qualityOf, baseItem, potionOf, POTION_AT, SUPPLIES,
} from "../../../../shared/Tasks";
import { distancesFrom } from "../../../../shared/Travel";
import { Constants } from "../../constants/Constants";
import { Event } from "../../constants/Events";
import { AP } from "../../constants/Palette";
import { HeroRow } from "../../data/HeroesData";
import { IBC } from "../../Engine";
import { Panel } from "../../shared/Panel";
import { ScrollView } from "../../shared/ui/ScrollView";
import { TitleBar } from "../../shared/ui/titlebar/TitleBar";
import { BaseComponent, ComponentType } from "../BaseComponent";
import { Chat, wrap } from "../chat/Chat";
import { textWidth, Tip } from "../games/GameUI";
import { fit } from "../heroroster/HeroRoster";
import { itemTexture } from "../inventory/Item";
import { QUALITY_COLOURS } from "../../art/ItemArt";
import { duration, LocationInfo } from "../locationinfo/LocationInfo";
import { TaskAmount } from "../taskamount/TaskAmount";
import { distance } from "../taskplanner/TaskPlanner";

// An item in depth (the user, 2026-10-28: an "i" on a crafting slot in the
// to-do list opens it), Claude's layout. On the left its sprite, name, sort
// and tier, how many you have, what it's worth worn or used, the slot it goes
// in and who has it on. On the right (scrolling) what it's made from - each
// thing's sprite and how many you have of how many it takes - and by what
// skill and level, how long and how much XP; or, a material, where it's found
// (each kind of place from what level, the nearest one of them) and by what
// skill; then everything it goes into, and your heroes: their level at its
// skill, how long one takes them, whether they can. A thing it's made from or
// goes into opens in its place; a place opens its LocationInfo. Pointing at
// anything says more in a tooltip, and a line cut short shows the whole of it
// there (the user, 2026-11-03: "put some love into the item component. get rid
// of the info bar on the bottom, add tooltips to any text that overflows"):
// the sprite framed in its quality's colour with its tier in the corner, its
// name over two lines, the things it's made from and goes into in slots lit
// when pointed at, your heroes in striped rows. A back arrow on the title bar
// returns to the item shown before, scrolled where it was (the user, 2026-11-03:
// "item component needs a back button"), there once there's something to go back to.

export class ItemInfo extends BaseComponent {

    public static SCALE = 2;
    public static W = 360;              // in its own px
    public static H = 250;
    public static PAD = 4;
    public static LINE = 10;
    public static LEFT_W = 110;         // the left column
    public static RIGHT = ItemInfo.PAD + ItemInfo.LEFT_W + 8;
    public static RIGHT_W = ItemInfo.W - ItemInfo.RIGHT - ItemInfo.PAD;
    public static VIEW_H = ItemInfo.H;  // the right's scrolling view
    public static STAGE_H = 60;         // the sprite's frame
    public static ROW_H = 20;           // a thing it's made from: two lines by its sprite
    public static USE_H = 20;           // a thing it goes into: one line by its sprite
    public static HERO_H = 14;          // (a + To-do button tall)
    public static TIP_W = 150;          // a tooltip's lines, at most
    // the window round it, in screen px
    public static INSET_X = 12;
    public static INSET_Y = 28;         // (under the title bar)
    public static WIDTH = ItemInfo.INSET_X * 2 + ItemInfo.W * ItemInfo.SCALE;
    public static HEIGHT = ItemInfo.INSET_Y + ItemInfo.H * ItemInfo.SCALE + ItemInfo.INSET_X;

    private item = 0;
    private heroId = -1;                // the hero it was opened for (their nearest places; first among your heroes)
    private drawn = "";                 // (what it was drawn from: redrawn when it changes)
    private drawnItem = 0;              // (the item last drawn: still it, the right stays scrolled where it was)

    public background: Panel;
    public titleBar: TitleBar;
    private content: PIXI.Container;
    private sheet: PIXI.Container;
    private right: ScrollView;
    private tip: Tip;
    // what says more, and where the pointer was: a redraw under a tooltip shows the new one's
    private tipped: [PIXI.Container, string[]][] = [];
    private pointer: PIXI.Point = null;
    private back: PIXI.Container;
    private paintBack: (lit: boolean) => void;
    // the items shown before this one, the last the latest
    private history: { item: number, heroId: number, scroll: number }[] = [];

    private keys = (e: KeyboardEvent) => { if (e.key == "Escape" && !Chat.takes(e)) IBC.comp.destroy(this); };

    constructor() {
        super(ComponentType.ITEM_INFO);
        this.create();
    }

    // an item (one open at a time: opening another shows it), for a hero if there's one in mind
    public static open(item: number, heroId: number = -1) {
        const view = IBC.comp.getOrCreate(ComponentType.ITEM_INFO) as ItemInfo;
        view.bringToTop();
        view.visit(item, heroId);
    }

    public create() {
        super.create();
        const { WIDTH, HEIGHT, W, H, RIGHT, VIEW_H } = ItemInfo;
        this.container.eventMode = "static";
        this.container.hitArea = new PIXI.Rectangle(0, 0, WIDTH, HEIGHT);
        this.container.on("pointerdown", (e: PIXI.FederatedPointerEvent) => e.stopPropagation());

        this.background = new Panel(this.container);
        this.background.setSize(WIDTH, HEIGHT);

        this.titleBar = new TitleBar(this);
        this.titleBar.setPosition(4, 4);
        this.titleBar.setSize(WIDTH - 8, 20);
        this.createBack();

        this.content = new PIXI.Container();
        this.content.scale.set(ItemInfo.SCALE);
        this.content.position.set(ItemInfo.INSET_X, ItemInfo.INSET_Y);
        this.container.addChild(this.content);

        // (the panel's middle lets the map through)
        this.content.addChild(new PIXI.Graphics().beginFill(AP.INK).drawRect(-4, -2, W + 8, H + 6).endFill());
        // down the middle
        const split = new PIXI.Graphics();
        split.beginFill(AP.BLACK).drawRect(RIGHT - 5, 0, 1, H).endFill();
        split.beginFill(AP.IRON).drawRect(RIGHT - 4, 0, 1, H).endFill();
        this.content.addChild(split);

        this.sheet = new PIXI.Container();
        this.content.addChild(this.sheet);
        // (its scrollbar out past the column, at the window's edge)
        const viewW = W - RIGHT + 3;
        this.right = new ScrollView(this.content, viewW, VIEW_H);
        this.right.position(RIGHT, 0);
        this.right.container.hitArea = new PIXI.Rectangle(0, 0, viewW, VIEW_H);
        this.right.container.on("wheel", () => { this.pointer = null; this.tip.hide(); });     // (what it was over has moved)
        this.tip = new Tip(this.content, W);     // (over both columns)

        window.addEventListener("keydown", this.keys);
        IBC.events.register(Event.HERO_STATE, () => this.draw(), this);
        IBC.events.register(Event.HERO_STASH, () => { this.drawn = ""; this.draw(); }, this);
        // opens right of the middle of the screen, like a place's
        this.setPosition(Math.min(window.innerWidth - WIDTH, Math.round((window.innerWidth - WIDTH) / 2) + 120), Math.max(0, Math.round((window.innerHeight - HEIGHT) / 2) - 20));
    }

    public destroy() {
        super.destroy();
        window.removeEventListener("keydown", this.keys);
        this.right.destroy();
        this.titleBar.destroy();
        this.titleBar = null;
        this.background.destroy();
        this.background = null;
        this.container.destroy({ children: true });
    }

    public show(item: number, heroId: number = this.heroId) {
        if (item != this.item) this.drawn = "";
        this.item = item;
        this.heroId = heroId;
        this.draw();
    }

    // an item from another, the one it's leaving to come back to
    private visit(item: number, heroId: number = this.heroId) {
        if (this.item && item != this.item) this.history.push({ item: this.item, heroId: this.heroId, scroll: this.right.scrollRatio });
        this.show(item, heroId);
        this.back.visible = this.history.length > 0;
    }

    private goBack() {
        const last = this.history.pop();
        if (!last) return;
        this.show(last.item, last.heroId);
        this.right.scrollTo(last.scroll);
        this.back.visible = this.history.length > 0;
    }

    // the back arrow, at the title bar's left (in screen px, like its close button at the right)
    private createBack() {
        const S = 16;
        this.back = new PIXI.Container();
        this.back.position.set(3, 2);
        this.back.visible = false;
        const box = new PIXI.Graphics();
        this.paintBack = (lit) => box.clear()
            .beginFill(TitleBar.LIGHT, lit ? 1 : 0).drawRect(0, 0, S, S).endFill()
            .beginFill(TitleBar.TEXT)
            .drawRect(3, 7, 2, 2).drawRect(5, 5, 2, 6).drawRect(7, 3, 2, 10).drawRect(9, 6, 4, 4)
            .endFill();
        this.paintBack(false);
        this.back.addChild(box);
        const tipLines = () => wrap(`Back to ${itemName(this.history[this.history.length - 1].item)}`, ItemInfo.TIP_W, ItemInfo.TIP_W, (l) => textWidth(l));
        this.back.eventMode = "static";
        this.back.cursor = "pointer";
        this.back.hitArea = new PIXI.Rectangle(0, 0, S, S);
        this.back.on("pointerover", (e: PIXI.FederatedPointerEvent) => { this.paintBack(true); this.tip.show(tipLines(), e); });
        this.back.on("pointermove", (e: PIXI.FederatedPointerEvent) => this.tip.move(e));
        this.back.on("pointerout", () => { this.paintBack(false); this.tip.hide(); });
        this.back.on("pointertap", (e: PIXI.FederatedPointerEvent) => {
            this.goBack();
            // (still over it, it says where it goes now; gone, it's unlit for when it's back)
            if (this.back.visible) this.tip.show(tipLines(), e);
            else this.paintBack(false);
        });
        this.titleBar.container.addChild(this.back);
    }

    // your heroes, the one it was opened for first
    private get heroes() {
        const all = IBC.data.heroes.heroes;
        const mine = all.find((h) => h.id == this.heroId);
        return mine ? [mine, ...all.filter((h) => h != mine)] : all;
    }

    private draw() {
        const id = this.item;
        if (!id) return;
        const heroes = this.heroes;
        // (state comes often: redrawn only when something shown has changed)
        const key = JSON.stringify([id, heroes.map((h) => [h.id, h.s.p, h.s.r, h.s.q, h.d.k, h.d.g])]);
        if (key == this.drawn) return;
        const same = id == this.drawnItem;
        this.drawn = key;
        this.drawnItem = id;
        this.titleBar.setTitle(itemName(id));
        const tipShown = this.pointer != null;
        this.sheet.removeChildren().forEach((c) => c.destroy({ children: true }));
        this.right.content.removeChildren().forEach((c) => c.destroy({ children: true }));
        this.tipped = [];
        this.tip.hide();
        this.drawLeft(id, heroes);
        const h = this.drawRight(id, heroes);
        this.right.setContentHeight(Math.max(h, 1));
        if (!same) this.right.scrollTo(0);     // (kept where it was when only your heroes changed)
        if (tipShown && same) this.retip();
        else this.pointer = null;
    }

    //#region the left: the item, how many you have, what it's worth, who has it on

    private drawLeft(id: number, heroes: HeroRow[]) {
        const { PAD, LINE, LEFT_W, STAGE_H, H } = ItemInfo;
        const x = PAD, w = LEFT_W, recipe = recipeOf(id), material = materialOf(id), tier = itemTier(id);
        const q = recipe ? qualityOf(id) : 0;

        // the sprite, three times over, in a frame its quality's colour: a wall behind it, a floor and its shadow
        const frame = new PIXI.Graphics();
        frame.beginFill(AP.BLACK).drawRect(x, 0, w, STAGE_H).endFill();
        frame.beginFill(q ? QUALITY_COLOURS[q] : AP.IRON).drawRect(x + 1, 1, w - 2, STAGE_H - 2).endFill();
        frame.beginFill(AP.BLACK).drawRect(x + 2, 2, w - 4, STAGE_H - 4).endFill();
        frame.beginFill(AP.SHADOW).drawRect(x + 3, 3, w - 6, STAGE_H - 6).endFill();
        frame.beginFill(AP.SLATE).drawRect(x + 3, 3, w - 6, 33).endFill();
        frame.beginFill(AP.IRON).drawRect(x + 3, 36, w - 6, 1).endFill();
        frame.beginFill(AP.BLACK, 0.45).drawEllipse(x + Math.round(w / 2), STAGE_H - 10, 18, 3).endFill();
        this.sheet.addChild(frame);
        const sprite = new PIXI.Sprite(itemTexture(id));
        sprite.scale.set(3);
        sprite.anchor.set(0.5);
        sprite.position.set(x + Math.round(w / 2), Math.round(STAGE_H / 2));
        this.sheet.addChild(sprite);
        // its tier in the corner
        const badge = new PIXI.Container();
        badge.position.set(x + 3, 3);
        const label = this.text(`T${tier}`, 2, 1, AP.STRAW, badge);
        badge.addChildAt(new PIXI.Graphics().beginFill(AP.BLACK).drawRect(0, 0, Math.ceil(label.textWidth) + 4, 9).endFill(), 0);
        this.tipOn(badge, [`Tier ${tier}`, material ? "A tier every 3 floors down it's found" : `Made by ${craftLevelText(id)} or better (10 levels a tier)`],
            new PIXI.Rectangle(0, 0, Math.ceil(label.textWidth) + 4, 9));
        this.sheet.addChild(badge);

        // its name, over two lines if it takes them (the rest cut, the whole of it pointed at)
        let y = STAGE_H + 4;
        const name = itemName(id), lines = wrap(name, w, w, (s) => textWidth(s)), cut = lines.length > 2;
        for (const l of cut ? [lines[0], lines.slice(1).join(" ")] : lines) {
            const t = fit(this.text(l, x, y, AP.WHITE, this.sheet), w);
            if (cut) this.tipOn(t, [name], this.area(t));
            y += LINE;
        }
        // (a made thing's skill and level are under what it's made from; the user, 2026-11-03)
        const sort = recipe ? sortName(recipe.type) : material ? `${title(material.type)} (gathered), tier ${tier}` : "Something";
        this.line(sort, x, y, recipe ? AP.FOAM : AP.ICE, this.sheet, w, recipe
            ? `${sortName(recipe.type)}, tier ${tier}: made in any town's workshop`
            : `Tier ${tier}: a tier every 3 floors down it's found; things made from it take ${craftLevelText(id)}`); y += LINE;
        const have = IBC.data.inventory.items.get(id)?.amount ?? 0;
        // (at the bottom of the column; the user, 2026-10-28)
        const bottom = H - LINE;
        this.line(`You have ${have}`, x, bottom, have ? AP.LIME : AP.IRON, this.sheet, w, `${have} in your stash`); y += 3;

        // what it's worth, worn or used
        if (recipe) {
            const power = gearPower(id), jewel = jewelBonus(id), skill = TOOL_SKILL[recipe.type];
            const worth = itemWorth(id);
            if (worth) {
                const more = power ? `Worn, it adds ${Math.round(power * 10) / 10} to a hero's power in a fight`
                    : jewel ? `Worn, it adds ${jewel[1]} ${STAT_NAMES[jewel[0]]}`
                    : recipe.type == "potion" ? (potionOf(id)?.heal ? `In a hero's Potion slot: drunk once a fight, when they're under ${Math.round(POTION_AT * 100)}% of their health`
                        : potionOf(id)?.fire ? "In a hero's Potion slot: thrown at every enemy as a fight starts" : "In a hero's Potion slot: drunk as every fight starts")
                    : recipe.type == "food" ? "In a hero's Food slot: one eaten an hour as they work, from the stash"
                        : `Carried, ${SKILL_NAMES[skill]} goes x${Math.round(toolRate(tier, 0, qualityOf(id)) * 1000) / 1000} quicker at tier ${tier} work or below (halved a tier for work past it)`;
                this.line(worth, x, y, AP.SAND, this.sheet, w, more); y += LINE;
            }
            if (q) { this.line(QUALITY_NAMES[q], x, y, QUALITY_COLOURS[q], this.sheet, w, `${QUALITY_NAMES[q]}: worth ${Math.round((QUALITY_MUL[q] - 1) * 100)}% more than a Normal one`); y += LINE; }
            const slots = slotsFor(recipe.type);
            if (slots.length) {
                const tool = skill != null || SUPPLIES.includes(recipe.type);
                const where = `${tool ? "Carried" : "Worn"}: ${SLOT_NAMES[slots[0]]}${TWO_HANDED.includes(recipe.type) ? " (2 hands)" : ""}`;
                this.line(where, x, y, AP.STONE, this.sheet, w,
                    TWO_HANDED.includes(recipe.type) ? "Two-handed: worn, it takes the shield's slot as well" : `Goes in a hero's ${SLOT_NAMES[slots[0]].toLowerCase()} slot${slots.length > 1 ? " (they have two)" : ""}`);
                y += LINE + 3;

                const on = heroes.filter((h) => (h.d.g ?? []).includes(id)).map((h) => h.d.n);
                this.heading(tool ? "Carried by" : "Worn by", x, y, w + 8, this.sheet); y += LINE + 1;
                if (!on.length) { this.text("none of yours", x + 4, y, AP.IRON, this.sheet); y += LINE; }
                // (clear of "You have": what doesn't fit is "and n more", them all pointed at)
                const room = Math.max(1, Math.floor((bottom - 3 - y) / LINE)), shown = on.length > room ? room - 1 : room;
                for (const n of on.slice(0, shown)) { this.line(n, x + 4, y, AP.MIST, this.sheet, w - 4); y += LINE; }
                if (on.length > shown) this.line(`and ${on.length - shown} more`, x + 4, y, AP.STONE, this.sheet, w - 4, on.slice(shown).join(", "));
            }
        }
    }

    //#endregion

    //#region the right: what it's made from or where it's found, what it goes into, your heroes

    // (returns how tall it came to)
    private drawRight(id: number, heroes: HeroRow[]) {
        const recipe = recipeOf(id), material = materialOf(id);
        let y = 0;
        if (recipe) y = this.drawRecipe(id, y);
        if (material) y = this.drawFound(id, heroes, y);
        y = this.drawUses(id, y);
        if (recipe || material) y = this.drawHeroes(id, heroes, y);
        return y;
    }

    // what it takes: each thing's sprite, name, how many you have of how many; then by what, how long
    private drawRecipe(id: number, y: number) {
        const { RIGHT_W, ROW_H, LINE } = ItemInfo;
        const r = recipeOf(id), parent = this.right.content;
        this.heading("Made from", 0, y, RIGHT_W, parent); y += 12;
        const colW = Math.floor((RIGHT_W - 12) / 2);
        r.needs.forEach(([need, n], i) => {
            const have = IBC.data.inventory.items.get(need)?.amount ?? 0, m = materialOf(need);
            const row = this.itemRow(need, (i % 2) * (colW + 4), y + Math.floor(i / 2) * ROW_H, colW, parent,
                `${itemName(need)}: it takes ${n}, you have ${have}${m ? `; gathered by ${SKILL_NAMES[gatherSkill(need)]} from floor ${m.level}` : "; crafted"} (click for more)`);
            const count = this.text(`${have}/${n}`, 0, 1, have >= n ? AP.LIME : AP.FLAME, row);
            count.x = colW - Math.ceil(count.textWidth);
            fit(this.text(m ? `${SKILL_NAMES[gatherSkill(need)]}, fl ${m.level}+` : "crafted", 21, 10, AP.STONE, row), colW - 21);
        });
        y += Math.ceil(r.needs.length / 2) * ROW_H + 1;
        this.line(`${SKILL_NAMES[r.skill]} Level ${craftLevel(id)}`, 0, y, AP.FOAM, parent, RIGHT_W - 8,
            `Made by ${SKILL_NAMES[r.skill]} ${craftLevel(id)} or better (10 levels a tier)`);
        y += LINE;
        const base = craftBaseMs(r.id);
        this.line(`${duration(base / 1000)} each at x1, ${base / 2000} XP`, 0, y, AP.STONE, parent, RIGHT_W - 8,
            "Quicker by the skill, its stat, a job that favours it and a crafting tool; 25% more XP at a job's skills");
        y += LINE;
        if (hasQuality(r)) y = this.drawQuality(y + 5);
        return y + 5;
    }

    // the odds of each quality as a table (the user, 2026-11-03: "make the quality line into an intuitive
    // table"): a row a quality, its name in its colour and what it's worth; a column how far over the
    // level it takes the crafter is (at Luck 10), Luck's share under it
    private drawQuality(y: number) {
        const { RIGHT_W, LINE } = ItemInfo, parent = this.right.content, w = RIGHT_W - 8;
        const OVER = [0, 10, 25, 50], nameW = 64, worthW = 30, colW = Math.floor((w - nameW - worthW) / OVER.length);
        const odds = OVER.map((o) => {
            const [f, s, m] = qualityOdds(o, 10).map((p) => Math.round(p * 100));
            return [100 - f - s - m, f, s, m];
        });
        // (right-aligned against x)
        const cell = (text: string, x: number, y: number, tint: number, more: string) => {
            const t = this.line(text, 0, y, tint, parent, null, more);
            t.x = x - Math.ceil(t.textWidth);
        };
        const colX = (i: number) => nameW + worthW + (i + 1) * colW;

        this.line("Quality", 0, y, AP.STRAW, parent, nameW, "What comes out of each one made: the more the crafter is over the level it takes, the better");
        cell("Worth", nameW + worthW, y, AP.STONE, "What it sells for and adds, against a Normal one");
        OVER.forEach((o, i) => cell(o ? `+${o}` : "At lv", colX(i), y, AP.STONE,
            o ? `Made by a crafter ${o} levels over the level it takes` : "Made by a crafter at the level it takes"));
        y += LINE;
        parent.addChild(new PIXI.Graphics()
            .beginFill(AP.IRON).drawRect(0, y - 2, w, 1).endFill()
            .beginFill(AP.BLACK).drawRect(0, y - 1, w, 1).endFill());

        QUALITY_NAMES.forEach((name, q) => {
            if (q % 2) parent.addChild(new PIXI.Graphics().beginFill(AP.SHADOW).drawRect(0, y - 1, w, LINE).endFill());
            const tint = q ? QUALITY_COLOURS[q] : AP.MIST;
            this.line(name, 2, y, tint, parent, nameW - 2);
            cell(`x${QUALITY_MUL[q]}`, nameW + worthW, y, q ? AP.SAND : AP.STONE,
                q ? `${name}: worth ${Math.round((QUALITY_MUL[q] - 1) * 100)}% more than a Normal one` : "Normal: worth what it says");
            OVER.forEach((o, i) => cell(`${odds[i][q]}%`, colX(i), y, q ? AP.MIST : AP.STONE,
                `${odds[i][q]}% ${name} ${o ? `${o} levels over` : "at its level"}`));
            y += LINE;
        });
        this.line(`Luck raises them, up to x${LUCK_MUL_MOST} at Luck 40`, 0, y + 2, AP.STONE, parent, w,
            "Each point of Luck over 10 adds 2% to the odds of Fine, Superior and Masterwork (and under 10 takes it away)");
        return y + 2 + LINE;
    }

    // where a material's found: each kind of place from what level, and the nearest of them
    private drawFound(id: number, heroes: HeroRow[], y: number) {
        const { RIGHT_W, LINE } = ItemInfo;
        const m = materialOf(id), parent = this.right.content, data = IBC.data.heroes;
        this.heading("Found at", 0, y, RIGHT_W, parent); y += 12;
        const hero = heroes[0], from = hero ? (hero.s.r.length ? hero.s.r[hero.s.r.length - 1] : hero.s.p) : null;
        const dist = from != null ? distancesFrom(data.graph, from) : null;
        for (const kind of m.at) {
            this.line(`${kindName(kind)}, from floor ${m.level}`, 4, y, AP.WHITE, parent, 100,
                `Found at every ${kindName(kind).toLowerCase()} from floor ${m.level} down`);
            const places = Array.from(data.places.values()).filter((p) => kindOf(p) == kind);
            const near = dist ? places.filter((p) => dist.has(p.i)).sort((a, b) => dist.get(a.i) - dist.get(b.i))[0] : places[0];
            if (near) {
                this.line(`${placeName(near)}${dist ? `, ${miles(dist.get(near.i))}` : ""}`, 108, y, AP.MIST, parent, RIGHT_W - 116,
                    `${dist ? `The nearest to ${hero.d.n}: ` : ""}${placeName(near)}${dist ? `, ${distance(dist.get(near.i))}` : ""} (click to open it)`,
                    () => LocationInfo.open(near));
            }
            y += LINE;
        }
        this.line(`Gathered by ${SKILL_NAMES[gatherSkill(id)]} ${gatherLevel(id)}: ${duration(GATHER_MS / 1000)} each at x1, ${GATHER_MS / 2000} XP`, 0, y + 2, AP.STONE, parent, RIGHT_W - 8,
            "Quicker by the skill, its stat, a job that favours it and a gathering tool; as deep as a hero can handle");
        return y + LINE + 7;
    }

    // everything it goes into, two columns: the sprite and name
    private drawUses(id: number, y: number) {
        const { RIGHT_W, USE_H } = ItemInfo;
        const uses = RECIPES.filter((r) => r.needs.some(([need]) => need == id)), parent = this.right.content;
        this.heading(`Used in (${uses.length})`, 0, y, RIGHT_W, parent); y += 12;
        if (!uses.length) { this.text("nothing yet", 4, y, AP.IRON, parent); return y + 14; }
        const colW = Math.floor((RIGHT_W - 12) / 2);
        uses.forEach((r, i) => {
            const n = r.needs.find(([need]) => need == id)[1];
            const row = this.itemRow(r.id, (i % 2) * (colW + 4), y + Math.floor(i / 2) * USE_H, colW, parent,
                `${r.name}: takes ${n}; by ${SKILL_NAMES[r.skill]} ${craftLevel(r.id)}${itemWorth(r.id) ? `, ${itemWorth(r.id)}` : ""} (click for more)`, 5, colW - 35);
            const x = this.text(`x${n}`, 0, 5, AP.STONE, row);
            x.x = colW - Math.ceil(x.textWidth);
        });
        return y + Math.ceil(uses.length / 2) * USE_H + 4;
    }

    // a row a hero: their name, their level at its skill (red under what it takes), + To-do
    private drawHeroes(id: number, heroes: HeroRow[], y: number) {
        const { RIGHT_W, HERO_H } = ItemInfo;
        const recipe = recipeOf(id), m = materialOf(id), parent = this.right.content;
        const skill = recipe ? recipe.skill : gatherSkill(id);
        this.heading("Your heroes", 0, y, RIGHT_W, parent); y += 12;
        if (!heroes.length) { this.text("None yet: hire one from the main menu", 4, y, AP.IRON, parent); return y + 12; }
        heroes.forEach((hero, i) => {
            const h = hero.d, level = h.k[skill];
            // (every other row striped; the hero it was opened for marked at its edge)
            const back = new PIXI.Graphics();
            if (i % 2 == 0) back.beginFill(AP.SHADOW).drawRect(0, y - 1, RIGHT_W - 6, HERO_H).endFill();
            if (hero.id == this.heroId) back.beginFill(AP.STRAW).drawRect(0, y - 1, 2, HERO_H).endFill();
            parent.addChild(back);
            // crafting: their level against what it takes; gathering: how deep they reach where it's found
            let can: boolean, why: string;
            if (recipe) {
                can = level >= craftLevel(id);
                why = can ? `${h.n} can craft it` : `${h.n} needs ${SKILL_NAMES[skill]} ${craftLevel(id)} (has ${level})`;
            } else {
                const reach = Math.max(...m.at.map((kind) => IBC.data.parties.listDeepest(kind, hero))), takes = gatherLevel(id);
                const who = IBC.data.parties.led(hero.id) ? `${h.n}'s party` : h.n;
                can = level >= takes && reach >= m.level;
                why = level < takes ? `${h.n} needs ${SKILL_NAMES[skill]} ${takes} (has ${level})`
                    : can ? `${who} reaches floor ${reach}, deep enough` : `${who} reaches floor ${reach}; it's found from ${m.level} (more power, or gear)`;
            }
            // + To-do: its window, how many (TaskAmount: a craft with what it takes first), where they'll be
            // by the end of their list (the user, 2026-10-28)
            const task = can ? this.taskFor(hero, id) : null, full = hero.s.q.length >= todoMost(IBC.data.premium.active);
            const on = !!task && !full;
            const where = task ? `${task.k == TaskKind.CRAFT ? "in" : "at"} ${IBC.data.heroes.nameOf(task.p)}` : "";
            const button = this.button("+ To-do", 0, y, 0, on, parent,
                on ? `Choose how many for ${h.n}'s to-do list: ${taskText(task, IBC.data.heroes.nameOf)}` : full ? `${h.n}'s to-do list is full`
                    : !can ? why : recipe ? `No town by road for ${h.n}` : `Nowhere by road ${h.n} reaches it`,
                () => TaskAmount.open(hero.id, task, itemTexture(id), where));
            // (the button on the right, past the scrollbar's room, the level up against it; the name fills the rest)
            button.button.x = RIGHT_W - 8 - button.w;
            const lv = this.line(`${SKILL_NAMES[skill]} ${level}`, 0, y + 2, can ? AP.LIME : AP.FLAME, parent, null, why);
            lv.x = button.button.x - 4 - Math.ceil(lv.textWidth);
            this.line(h.n, 5, y + 2, hero.id == this.heroId ? AP.WHITE : AP.MIST, parent, lv.x - 6 - 5);
            y += HERO_H;
        });
        return y + 2;
    }

    // the task making or gathering it, from where they'll be at the end of their list: crafting in the
    // nearest town, gathering at the nearest place it's found that they reach deep enough (null: none by road)
    private taskFor(hero: HeroRow, id: number): Task {
        const data = IBC.data.heroes, s = hero.s, m = materialOf(id);
        let at = s.r.length ? s.r[s.r.length - 1] : s.p;
        for (const task of s.q) if (task.p != null) at = task.p;
        const dist = distancesFrom(data.graph, at);
        const near = Array.from(data.places.values()).filter((p) => dist.has(p.i)).sort((a, b) => dist.get(a.i) - dist.get(b.i));
        const place = m ? near.find((p) => m.at.includes(kindOf(p)) && IBC.data.parties.listDeepest(kindOf(p), hero) >= m.level) : near.find((p) => isTown(p));
        if (!place) return null;
        const k = m ? TaskKind.GATHER : TaskKind.CRAFT;
        return { k, p: place.i, m: m ? id : baseItem(id), n: AMOUNTS[k]?.first };     // (a Fine one: made as any, its quality rolled)
    }

    //#endregion

    //#region bits

    // a button at least w wide, wider to keep its label inside it with 4 px either side
    private button(label: string, x: number, y: number, w: number, on: boolean, parent: PIXI.Container, more: string, tap: () => void) {
        const button = new PIXI.Container();
        button.position.set(x, y);
        const t = this.text(label, 0, 2, on ? AP.WHITE : AP.STONE, button);
        w = Math.max(w, Math.ceil(t.textWidth) + 8);
        const box = new PIXI.Graphics();
        const paint = (over: boolean) => box.clear()
            .beginFill(AP.BLACK).drawRect(0, 0, w, 12).endFill()
            .beginFill(!on ? AP.IRON : over ? AP.GRASS : AP.LEAF).drawRect(1, 1, w - 2, 10).endFill()
            .beginFill(!on ? AP.STEEL : over ? AP.LIME : AP.GRASS).drawRect(1, 1, w - 2, 1).endFill();     // (lit along its top)
        paint(false);
        button.addChildAt(box, 0);
        t.x = Math.round((w - t.textWidth) / 2);
        this.tipOn(button, [more], new PIXI.Rectangle(0, 0, w, 12));
        button.on("pointerover", () => paint(on));
        button.on("pointerout", () => paint(false));
        if (on) {
            button.cursor = "pointer";
            button.on("pointertap", () => { this.pointer = null; this.tip.hide(); tap(); });
        }
        parent.addChild(button);
        return { button, w };
    }

    private text(text: string, x: number, y: number, tint: number, parent: PIXI.Container) {
        const t = new PIXI.BitmapText(text, { fontName: Constants.PIXEL_FONT, fontSize: 32 });
        t.tint = tint;
        t.position.set(x, y);
        t.eventMode = "none";
        parent.addChild(t);
        return t;
    }

    // a line kept inside w (cut short, the whole of it in a tooltip), saying more in one while it's
    // pointed at (and, with a tap, clicked)
    private line(text: string, x: number, y: number, tint: number, parent: PIXI.Container, w?: number, more?: string, tap?: () => void) {
        const t = this.text(text, x, y, tint, parent);
        const cut = w != null && t.textWidth > w;
        if (cut) fit(t, w);
        const says = [cut ? text : null, more].filter((s) => s);
        if (says.length) {
            this.tipOn(t, says, this.area(t));
            if (tap) { t.cursor = "pointer"; t.on("pointertap", () => { this.pointer = null; this.tip.hide(); tap(); }); }
        }
        return t;
    }

    // a line's hitbox: its words, and a little over
    private area(t: PIXI.BitmapText) {
        return new PIXI.Rectangle(-1, -1, Math.max(20, Math.ceil(t.textWidth) + 2), ItemInfo.LINE - 1);
    }

    // pointing at it says more (each a paragraph, in lines that fit), in a box over the pointer
    private tipOn(it: PIXI.Container, says: string[], area: PIXI.Rectangle) {
        const lines = says.flatMap((s) => wrap(s, ItemInfo.TIP_W, ItemInfo.TIP_W, (l) => textWidth(l)));
        it.eventMode = "static";
        it.hitArea = area;
        it.on("pointerover", (e: PIXI.FederatedPointerEvent) => { this.pointer = e.global.clone(); this.tip.show(lines, e); });
        it.on("pointermove", (e: PIXI.FederatedPointerEvent) => { this.pointer = e.global.clone(); this.tip.move(e); });
        it.on("pointerout", () => { this.pointer = null; this.tip.hide(); });
        this.tipped.push([it, lines]);
    }

    // after a redraw under a tooltip: the tooltip of what's under the pointer now
    private retip() {
        const at = this.tipped.find(([it]) => { const p = it.toLocal(this.pointer); return (it.hitArea as PIXI.Rectangle).contains(p.x, p.y); });
        if (at) this.tip.show(at[1], { global: this.pointer } as PIXI.FederatedPointerEvent);
        else this.pointer = null;
    }

    // an item's sprite in its slot and its name (in nameW), lit while pointed at, clicked to show it in this one's place
    private itemRow(id: number, x: number, y: number, w: number, parent: PIXI.Container, more: string, nameY: number = 1, nameW: number = w - 47) {
        const row = new PIXI.Container();
        row.position.set(x, y);
        const lit = new PIXI.Graphics().beginFill(AP.SLATE).drawRect(-2, -1, w + 3, 20).endFill();
        lit.visible = false;
        row.addChild(lit);
        row.addChild(new PIXI.Graphics().beginFill(AP.BLACK).drawRect(0, 0, 18, 18).endFill().beginFill(AP.SHADOW).drawRect(1, 1, 16, 16).endFill());
        const icon = new PIXI.Sprite(itemTexture(id));     // (centred in its slot, whatever its size)
        icon.position.set(Math.floor((18 - icon.width) / 2), Math.floor((18 - icon.height) / 2));     // (whole px)
        row.addChild(icon);
        fit(this.text(itemName(id), 21, nameY, AP.WHITE, row), nameW);
        this.tipOn(row, [more], new PIXI.Rectangle(-2, -1, w + 3, 20));
        row.cursor = "pointer";
        row.on("pointerover", () => lit.visible = true);
        row.on("pointerout", () => lit.visible = false);
        row.on("pointertap", () => { this.pointer = null; this.tip.hide(); this.visit(id); });
        parent.addChild(row);
        return row;
    }

    // a heading with a rule from it to the end of the column
    private heading(text: string, x: number, y: number, w: number, parent: PIXI.Container) {
        const t = this.text(text, x, y, AP.STRAW, parent);
        const from = x + Math.ceil(t.textWidth) + 4;
        parent.addChild(new PIXI.Graphics()
            .beginFill(AP.IRON).drawRect(from, y + 3, x + w - 8 - from, 1).endFill()
            .beginFill(AP.BLACK).drawRect(from, y + 4, x + w - 8 - from, 1).endFill());
    }

    //#endregion

}

// "Smithing 11" for a made thing, else what its tier would take
function craftLevelText(id: number) {
    const r = recipeOf(id);
    return r ? `${SKILL_NAMES[r.skill]} ${craftLevel(id)}` : `level ${craftLevel(id)} at a skill (things made from it)`;
}

// a sort of made thing, as the to-do list's Craft tab calls it
function sortName(type: string) {
    const names: { [type: string]: string } = {
        material: "Worked material", body: "Body armour", gloves: "Gloves", feet: "Boots", rod: "Fishing rod",
        knife: "Hunting knife", mortar: "Mortar and pestle", loupe: "Jeweller's tools", staff: "Staff",
    };
    return names[type] ?? title(type);
}

function kindName(kind: string) {
    const names: { [kind: string]: string } = {
        bigtree: "Great tree", darktower: "Dark tower", icecastle: "Ice castle", steptemple: "Step temple",
        camp: "Woodcutters' camp", stones: "Standing stones",
    };
    return names[kind] ?? title(kind);
}

function title(s: string) {
    return s.charAt(0).toUpperCase() + s.slice(1);
}

// "12 mi" (a tile a mile)
function miles(px: number) {
    if (!px) return "here";
    return `${Math.max(1, Math.round(px / 16))} mi`;
}
