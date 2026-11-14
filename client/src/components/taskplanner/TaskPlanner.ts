import * as PIXI from "pixi.js";
import { MATERIALS } from "../../../../shared/Locations";
import { isDungeon, isTown, kindOf, placeName, WorldPlace } from "../../../../shared/Places";
import {
    AMOUNTS, anyEvent, craftLevel, craftMs, exploreMs, gatherLevel, gatherMs, gatherSkill, itemName, lookMs, RECIPES,
    SHIFT_MS, Task, TASK_NAMES, TaskKind, TIER_SKILL, todoMost,
} from "../../../../shared/Tasks";
import { Skill, SKILL_NAMES } from "../../../../shared/Heroes";
import { skillIcon } from "../../art/BoardIcons";
import { healRate } from "../../../../shared/Fights";
import { Step, stepDone } from "../../../../shared/Guide";
import { distancesFrom } from "../../../../shared/Travel";
import { conditionsAt, workPace, workSkillOf } from "../../../../shared/Conditions";
import { BOON_MS, eventDef, eventSkills, eventStage, eventStages, skillsText } from "../../../../shared/Events";
import { timeLeft } from "../../data/EventsData";
import { tentTexture } from "../../art/CampArt";
import { TASK_ICON, taskIcon } from "../../art/TaskIcons";
import { Constants } from "../../constants/Constants";
import { Event } from "../../constants/Events";
import { AP } from "../../constants/Palette";
import { HeroRow } from "../../data/HeroesData";
import { PartyRow } from "../../data/PartiesData";
import { IBC } from "../../Engine";
import { Panel } from "../../shared/Panel";
import { ScrollView } from "../../shared/ui/ScrollView";
import { TitleBar } from "../../shared/ui/titlebar/TitleBar";
import { BaseComponent, ComponentType } from "../BaseComponent";
import { Chat } from "../chat/Chat";
import { textWidth, Tip } from "../games/GameUI";
import { fit } from "../heroroster/HeroRoster";
import { itemTexture } from "../inventory/Item";
import { ItemInfo } from "../iteminfo/ItemInfo";
import { LocationInfo } from "../locationinfo/LocationInfo";
import { TaskAmount } from "../taskamount/TaskAmount";

// A hero's to-do list (the user, 2026-10-28), opened from their box in the
// roster or their window on the map; split down the middle. On the left the
// list in order - the first under way, with how far along it is - each
// moved up or down or taken off, and under it their backup task, done over
// and over when it runs out (a slot like the others; with nothing in it,
// resting). On the right everything they could be given, by tabs (Travel,
// Gather, Craft, Events, Misc - resting and adventuring; the user,
// 2026-10-28), each an icon with the name of the one picked or pointed at on the
// right (the user, 2026-10-28), and under them a row of the sorts of
// thing in the tab (places, materials, things made - weapons by their kind
// under them), picked by their icons, to show only those (the user, 2026-10-28) -
// Gather and Craft also by the skill they train and its levels, a row under
// that, highest they can do first (a player, via the user, 2026-11-02);
// a bubble each (the user, 2026-10-28):
// the place's sprite on the left, its name over how far it is in miles from
// where they'll be by then (the end of the list) - for gathering and
// crafting, the item's sprite (how many they have on it, if any) and name, over
// the place and how far - crafting, over what it needs and how many of each they
// have (the user, 2026-10-28). A place to
// travel to, here or on the list, has an "i" that opens it (LocationInfo; the
// user, 2026-10-28); a thing to craft, an "i" on its bottom right (on the
// list, by its buttons) that opens the item (ItemInfo; the user, 2026-10-28).
// Dragged over to the list, it goes on the end of it (how many: the kind's
// first amount); clicked, one with an amount opens a window to choose how
// many (TaskAmount; the user, 2026-10-28), one without goes straight on;
// dragged onto the backup slot, it's the backup task. The server carries the list out
// (HeroTasks); every change is sent whole. A formed party of yours (shared/Parties.ts)
// has one of its own, shown and changed here the same (openParty; what they could be
// given as for the first of your heroes in it); a hero of yours in it opens it. In
// someone else's, theirs is waiting, nothing on it under way.

interface Option {
    place: WorldPlace;          // (its sprite, but for an item's)
    item?: number;              // the item's sprite in place of the place's
    count?: number;             // how many they have of it, on the sprite's bottom right (none: not shown)
    icon?: PIXI.Texture;        // or this one (resting: a tent)
    top: string;                // the place's name, or the item's
    bottom: string;             // how far
    what?: string;              // on the right of the top line: what's done there (red when locked)
    note?: string;              // on the right of the bottom line
    warn?: boolean;             // (the note in red - with none, the bottom line: it can be given, but won't get far)
    task?: Task;
    locked?: boolean;           // (shown, but they can't be given it)
    sort?: string;              // what sort it is (a Category's)
    info?: number;              // an item an "i" on the bottom right opens (ItemInfo)
    skill?: Skill;              // gathering and crafting: the skill it trains, and the level it takes
    level?: number;
    tip?: string[];             // over it, pointed at
    bottomTip?: string[];       // over the bottom line's text, pointed at (only it)
    rows?: Row[];               // in place of top and bottom, as many lines as it takes (an event; the user, 2026-11-02)
}

// a line of a bubble's rows: its text and tint, and what's on its right
interface Row { text: string; tint: number; note?: string; noteTint?: number; icon?: PIXI.Texture; iconTip?: string; tip?: boolean; }

// an option's bubble's height (rows: a line each)
function bubbleH(o: Option) {
    return o.rows ? 4 + o.rows.length * TaskPlanner.LINE : TaskPlanner.SLOT;
}

// a line, broken into rows that fit (the first kept clear of its note, every one after it as wide;
// an icon on its left, the text after it)
function rows(text: string, tint: number, note?: string, noteTint?: number, icon?: PIXI.Texture, iconTip?: string): Row[] {
    const room = TaskPlanner.SPLIT - 4 - (PAD + ICON + PAD) - (note ? textWidth(note) + 6 : 0) - (icon ? TASK_ICON + 2 : 0);  // (past the sprite, to the bubble's right)
    return wrap(text, room).map((line, i) => i ? { text: line, tint } : { text: line, tint, note, noteTint, icon, iconTip });
}

// the tabs with a row of skills under the sorts, and a level's tier on it (1-10: 0, 11-20: 1 ...)
function hasSkills(tab: TaskKind) {
    return tab == TaskKind.GATHER || tab == TaskKind.CRAFT;
}
function tierOf(level: number) {
    return Math.floor((level - 1) / TIER_SKILL);
}
// (those they can do the highest level first, the best to train on; those they can't the lowest
// first, the next to open up; else in the order they're made in)
function byLevel(open: Option[], locked: Option[]) {
    open.sort((a, b) => b.level - a.level);
    locked.sort((a, b) => a.level - b.level);
}

// a sort of thing under a tab: by its icon's name (art/TaskIcons), the
// options' sorts it has, or sorts of its own under it
export interface Category { name: string; icon: string; sorts?: string[]; kids?: Category[]; }
export function sortsOf(c: Category): string[] {
    return c.sorts ?? c.kids.flatMap(sortsOf);
}
export const CATEGORIES: { [tab: number]: Category[] } = {
    [TaskKind.TRAVEL]: [
        { name: "Towns", icon: "town", sorts: ["town"] },
        { name: "Dungeons", icon: "dungeon", sorts: ["dungeon"] },
        { name: "Gathering spots", icon: "wilds", sorts: ["wilds"] },
        { name: "Other places", icon: "other", sorts: ["other"] },
    ],
    [TaskKind.GATHER]: [
        { name: "Ore", icon: "ore", sorts: ["ore"] },
        { name: "Stone and gems", icon: "stone", sorts: ["stone"] },
        { name: "Wood", icon: "wood", sorts: ["wood"] },
        { name: "Beast parts", icon: "beast", sorts: ["beast"] },
        { name: "Herbs and plants", icon: "plant", sorts: ["plant"] },
        { name: "Fish", icon: "fish", sorts: ["fish"] },
        { name: "Arcane", icon: "arcane", sorts: ["arcane"] },
    ],
    [TaskKind.CRAFT]: [
        { name: "Worked materials", icon: "material", sorts: ["material"] },
        {
            name: "Weapons", icon: "weapon", kids: [
                { name: "Swords", icon: "sword", sorts: ["sword"] },
                { name: "Axes", icon: "axe", sorts: ["axe"] },
                { name: "Maces", icon: "mace", sorts: ["mace"] },
                { name: "Spears", icon: "spear", sorts: ["spear"] },
                { name: "Daggers", icon: "dagger", sorts: ["dagger"] },
                { name: "Bows", icon: "bow", sorts: ["bow"] },
                { name: "Staves", icon: "staff", sorts: ["staff"] },
            ],
        },
        { name: "Shields", icon: "shield", sorts: ["shield"] },
        { name: "Helms", icon: "helm", sorts: ["helm"] },
        { name: "Body armour", icon: "body", sorts: ["body"] },
        { name: "Gloves", icon: "gloves", sorts: ["gloves"] },
        { name: "Boots", icon: "feet", sorts: ["feet"] },
        { name: "Amulets", icon: "amulet", sorts: ["amulet"] },
        { name: "Rings", icon: "ring", sorts: ["ring"] },
        { name: "Potions", icon: "potion", sorts: ["potion"] },
        { name: "Meals", icon: "food", sorts: ["food"] },
        {
            name: "Tools", icon: "tool", kids: [
                {
                    name: "Gathering tools", icon: "gathertools", kids: [
                        { name: "Pickaxes", icon: "pickaxe", sorts: ["pickaxe"] },
                        { name: "Hatchets", icon: "hatchet", sorts: ["hatchet"] },
                        { name: "Sickles", icon: "sickle", sorts: ["sickle"] },
                        { name: "Fishing rods", icon: "rod", sorts: ["rod"] },
                        { name: "Hunting knives", icon: "knife", sorts: ["knife"] },
                    ],
                },
                {
                    name: "Crafting tools", icon: "crafttools", kids: [
                        { name: "Hammers", icon: "hammer", sorts: ["hammer"] },
                        { name: "Saws", icon: "saw", sorts: ["saw"] },
                        { name: "Mortars and pestles", icon: "mortar", sorts: ["mortar"] },
                        { name: "Pans", icon: "pan", sorts: ["pan"] },
                        { name: "Needles", icon: "needle", sorts: ["needle"] },
                        { name: "Jeweller's tools", icon: "loupe", sorts: ["loupe"] },
                    ],
                },
            ],
        },
    ],
};

const TILE = 16;                // map px a tile (world.json's tile)
const MILES = 1;                // miles a tile
const PLACE_PX = 32;            // a place's sprite (world.json's placeSize)
const ICON = 16;                // a sprite in a bubble (a place's at half size, an item's whole)
const PAD = 5;                  // either side of it
// a group's colour - a craft and what's put on for it -, round each of its slots (none lime: that's what's under way)
const GROUP_TINTS = [AP.SKY, AP.ORCHID, AP.AMBER, AP.PINK, AP.FOAM, AP.VIOLET, AP.OCHRE, AP.ICE];

export class TaskPlanner extends BaseComponent {

    public static SCALE = 2;
    public static W = 440;              // the planner, in its own px
    public static H = 268;              // (to the backup task's bottom)
    public static SPLIT = 211;          // the left side's width, and a slot's on either side (the right the same, past its scrollbar)
    public static RIGHT = TaskPlanner.SPLIT + 8;
    public static RIGHT_W = TaskPlanner.W - TaskPlanner.RIGHT - 2;
    public static LINE = 10;
    public static ROW = 26;             // a slot and the gap under it
    public static SLOT = TaskPlanner.ROW - 2;  // a thing on the list, or an option's bubble: two lines
    public static TOP_Y = 3;            // the two lines in a slot, centred in it (caps 7 px tall)
    public static BOTTOM_Y = 13;
    public static LIST_TOP = 13;        // the list's first slot, on the left
    public static VISIBLE = 8;          // slots of it seen at once (it scrolls, to todoMost: 10, a Supporter's 20; the user, 2026-10-28)
    public static LIST_W = TaskPlanner.SPLIT - 8;   // a slot on the left (its scrollbar's room past it)
    public static TAB_H = 14;           // a tab's square (2 px over a sort's)
    public static SORTS_Y = 16;         // the row of sorts under the tabs
    public static SQUARE = TASK_ICON + 2;  // a sort's
    public static SORTS_ROW = 14;       // (a line of them, and Gather's and Craft's levels on the line under)
    public static SKILLS_GAP = 5;       // (between All, the sorts and the skills after them)
    public static OPTIONS_TOP = 30;     // the options under it (Gather and Craft: under the levels)
    public static OPTIONS_H = TaskPlanner.H - TaskPlanner.OPTIONS_TOP;
    public static BACKUP_Y = TaskPlanner.H - TaskPlanner.SLOT;  // at the bottom (its heading over it)
    // the window round it, in screen px
    public static INSET_X = 12;
    public static INSET_Y = 28;         // (under the title bar)
    public static WIDTH = TaskPlanner.INSET_X * 2 + TaskPlanner.W * TaskPlanner.SCALE;
    public static HEIGHT = TaskPlanner.INSET_Y + TaskPlanner.H * TaskPlanner.SCALE + TaskPlanner.INSET_X;

    private heroId = -1;                // (a party's: the first of yours in it)
    private partyId: number = null;     // (a formed party's list, not a hero's)
    private bar: { g: PIXI.Graphics, task: Task, w: number, y: number } = null;     // the one under way's, filled as it goes
    private tab = TaskKind.TRAVEL;
    private options: Option[] = [];
    private bubbles: PIXI.Container[] = [];     // (an option's, by its place in options)
    private tabAt = new Map<TaskKind, PIXI.Container>();
    private optionsKey = "";            // (what the options were made for: rebuilt when it changes)
    private listKey = "";               // (which list of them that is: a different one starts at the top)
    private picked: { [tab: number]: Category[] } = {};    // a tab's sort picked, and those it's under (none: everything)
    private trained: { [heroTab: string]: { skill?: Skill; tier?: number } } = {};  // a hero's skill and tier picked on a tab (none: all)
    private drag: { option: Option; from: PIXI.Point; ghost?: PIXI.Container };
    private confirm = 0;                // a craft's group being taken off, asked about in its slot (0: none)

    public background: Panel;
    public titleBar: TitleBar;
    private content: PIXI.Container;
    private left: PIXI.Container;
    private tabs: PIXI.Container;
    private sorts: PIXI.Container;
    private tip: Tip;                   // (a sort's name over it)
    private list: ScrollView;
    private todo: ScrollView;           // the list's slots, on the left
    private todoKey = "";               // (the hero and how many on it, last drawn: one more, it scrolls to the end)
    private drop: PIXI.Graphics;        // (the list lit while something's dragged over it)

    private keys = (e: KeyboardEvent) => { if (e.key == "Escape" && !Chat.takes(e)) IBC.comp.destroy(this); };

    constructor() {
        super(ComponentType.TASK_PLANNER);
        this.create();
    }

    // a hero's list (one open at a time: opening another's shows theirs; in a party of yours, its)
    public static open(heroId: number, tab?: TaskKind) {
        const party = IBC.data.parties.led(heroId);
        if (party) return TaskPlanner.openParty(party.i, tab);
        const view = IBC.comp.getOrCreate(ComponentType.TASK_PLANNER) as TaskPlanner;
        view.bringToTop();
        if (tab != null) { view.tab = tab; view.optionsKey = ""; }
        view.show(heroId);
    }

    // a formed party of yours's list
    public static openParty(partyId: number, tab?: TaskKind) {
        const party = IBC.data.parties.get(partyId), lead = party?.m.find((m) => m[6] && IBC.data.heroes.get(m[0]));
        if (!party?.y || !lead) return;
        const view = IBC.comp.getOrCreate(ComponentType.TASK_PLANNER) as TaskPlanner;
        view.bringToTop();
        if (tab != null) { view.tab = tab; view.optionsKey = ""; }
        view.show(lead[0], partyId);
    }

    public create() {
        super.create();
        const { WIDTH, HEIGHT, SPLIT, H, RIGHT, RIGHT_W, OPTIONS_TOP, OPTIONS_H } = TaskPlanner;
        this.container.eventMode = "static";
        this.container.hitArea = new PIXI.Rectangle(0, 0, WIDTH, HEIGHT);
        this.container.on("pointerdown", (e: PIXI.FederatedPointerEvent) => e.stopPropagation());

        this.background = new Panel(this.container);
        this.background.setSize(WIDTH, HEIGHT);

        this.titleBar = new TitleBar(this);
        this.titleBar.setPosition(4, 4);
        this.titleBar.setSize(WIDTH - 8, 20);

        this.content = new PIXI.Container();
        this.content.scale.set(TaskPlanner.SCALE);
        this.content.position.set(TaskPlanner.INSET_X, TaskPlanner.INSET_Y);
        this.container.addChild(this.content);

        // (the panel's middle lets the map through)
        this.content.addChild(new PIXI.Graphics().beginFill(AP.INK).drawRect(-4, -2, TaskPlanner.W + 8, H + 6).endFill());

        // down the middle
        const split = new PIXI.Graphics();
        split.beginFill(AP.BLACK).drawRect(SPLIT + 3, 0, 1, H).endFill();
        split.beginFill(AP.IRON).drawRect(SPLIT + 4, 0, 1, H).endFill();
        this.content.addChild(split);

        this.left = new PIXI.Container();
        this.tabs = new PIXI.Container();
        this.tabs.position.set(RIGHT, 0);
        this.sorts = new PIXI.Container();
        this.sorts.position.set(RIGHT, TaskPlanner.SORTS_Y);
        this.drop = new PIXI.Graphics();
        this.drop.visible = false;
        this.content.addChild(this.left, this.tabs, this.sorts);
        const { VISIBLE, ROW, LIST_TOP } = TaskPlanner;
        this.todo = new ScrollView(this.content, SPLIT, VISIBLE * ROW);
        this.todo.position(0, LIST_TOP);
        this.todo.container.hitArea = new PIXI.Rectangle(0, 0, SPLIT, VISIBLE * ROW);
        this.content.addChild(this.drop);

        this.list = new ScrollView(this.content, RIGHT_W, OPTIONS_H);
        this.list.position(RIGHT, OPTIONS_TOP);
        this.list.container.hitArea = new PIXI.Rectangle(0, 0, RIGHT_W, OPTIONS_H);
        this.tip = new Tip(this.content, TaskPlanner.W);     // (over the options)

        // dragging a bubble
        this.container.on("globalpointermove", (e: PIXI.FederatedPointerEvent) => this.dragMove(e));
        this.container.on("pointerup", (e: PIXI.FederatedPointerEvent) => this.dragEnd(e));
        this.container.on("pointerupoutside", (e: PIXI.FederatedPointerEvent) => this.dragEnd(e));

        window.addEventListener("keydown", this.keys);
        IBC.events.register(Event.HERO_STATE, (hero: HeroRow) => { if (hero.id == this.heroId) this.draw(); }, this);
        IBC.events.register(Event.HERO_DISMISSED, (h: HeroRow) => { if (h.id == this.heroId) IBC.comp.destroy(this); }, this);
        IBC.events.register(Event.PARTY_STATE, (p: PartyRow) => { if (p.i == this.partyId) this.draw(); }, this);
        IBC.events.register(Event.PARTY_LIST, () => { if (this.partyId != null || this.hero?.s.g != null) { this.optionsKey = ""; this.draw(); } }, this);
        IBC.events.register(Event.HERO_STASH, () => { this.optionsKey = ""; this.draw(); }, this);
        IBC.events.register(Event.EVENTS_CHANGED, () => { this.optionsKey = ""; this.draw(); }, this);
        this.setPosition(Math.round((window.innerWidth - WIDTH) / 2), Math.round((window.innerHeight - HEIGHT) / 2));
    }

    public destroy() {
        super.destroy();
        window.removeEventListener("keydown", this.keys);
        this.list.destroy();
        this.todo.destroy();
        this.titleBar.destroy();
        this.titleBar = null;
        this.background.destroy();
        this.background = null;
        this.container.destroy({ children: true });
    }

    // the hero whose list it is; a party's, the first of yours in it with the party's state
    // (none: null - gone, or no longer yours to set)
    private get hero(): HeroRow {
        const hero = IBC.data.heroes.get(this.heroId);
        if (this.partyId == null || !hero) return hero;
        const party = IBC.data.parties.get(this.partyId);
        return party?.y && party.m.some((m) => m[0] == hero.id) ? { ...hero, s: party.s, at: party.at } : null;
    }

    // a formed party's list being shown: the party (none: a hero's)
    private get party() {
        return this.partyId == null ? null : IBC.data.parties.get(this.partyId);
    }

    public show(heroId: number, partyId: number = null) {
        if (heroId != this.heroId || partyId != this.partyId) this.optionsKey = "";
        this.heroId = heroId;
        this.partyId = partyId;
        this.draw();
    }

    // where on screen the guide (GuideBox) points for a step giving them a task of `kind`:
    // its tab, then (gathering, adventuring) the option to pick; null: nothing here
    public guideTarget(kind: TaskKind) {
        if (kind == null) return null;
        const tab = kind == TaskKind.ADVENTURE ? TaskKind.REST : kind;
        if (this.tab != tab) return this.tabAt.get(tab)?.getBounds() ?? null;
        if (kind != TaskKind.GATHER && kind != TaskKind.ADVENTURE) return null;
        const i = this.options.findIndex((o) => o.task?.k == kind);
        return i < 0 || !this.bubbles[i] || this.bubbles[i].destroyed ? null : this.bubbles[i].getBounds();
    }

    private draw() {
        const hero = this.hero;
        if (!hero) { IBC.comp.destroy(this); return; }
        this.titleBar.setTitle(this.party ? `${this.party.n}: To Do` : `${hero.d.n}: To Do${hero.s.g != null ? " (waiting)" : ""}`);
        this.drawLeft(hero);
        this.drawTabs();
        this.drawOptions(hero);
    }

    // a change to the list or backup task, sent whole (it comes back as the hero's state)
    private send(q: Task[], b: Task = this.hero.s.b) {
        if (this.partyId != null) IBC.net.party.todo(this.partyId, q, b);
        else IBC.net.hero.todo(this.heroId, q, b);
    }

    //#region the left: the list and the backup task

    private drawLeft(hero: HeroRow) {
        const { SPLIT, ROW, SLOT, VISIBLE, LIST_W, BACKUP_Y, TOP_Y, BOTTOM_Y } = TaskPlanner;
        this.left.removeChildren().forEach((c) => c.destroy({ children: true }));
        const slots = this.todo.content;
        slots.removeChildren().forEach((c) => c.destroy({ children: true }));
        this.bar = null;
        const s = hero.s, waiting = this.partyId == null && s.g != null;
        this.text("To do", 2, 2, AP.WHITE, this.left);
        const count = this.text(`${s.q.length}/${todoMost(IBC.data.premium.active)}`, 0, 2, s.q.length >= todoMost(IBC.data.premium.active) ? AP.STRAW : AP.STONE, this.left);
        count.x = SPLIT - 2 - Math.ceil(count.textWidth);
        if (s.q.length) this.button("Clear list", 32, -1, 40, true, this.left, () => this.send([]));

        // the list, scrolling; in the first empty slot, why the last thing was dropped (empty
        // slots to fill the view, and one past the last)
        const W = LIST_W, q = s.q;
        // a craft and what's put on for it, a colour each (the user, 2026-10-28): by the order they're first on the list
        const groups: number[] = [];
        for (const t of q) { const g = t.g ?? t.f; if (g && !groups.includes(g)) groups.push(g); }
        const tint = (t: Task) => { const g = t.g ?? t.f; return g ? GROUP_TINTS[groups.indexOf(g) % GROUP_TINTS.length] : null; };
        const heads = new Map<number, Task>();
        for (const t of q) if (t.g) heads.set(t.g, t);
        if (!heads.has(this.confirm)) this.confirm = 0;
        let y = 0;
        q.forEach((task, i) => {
            const move = (to: number) => { const list = q.slice(); [list[i], list[to]] = [list[to], list[i]]; this.send(list); };
            const members = task.g ? q.filter((t) => t.f == task.g).length : 0;
            // taking off a craft with things put on for it: asked first, in its slot, whether they go too
            if (task.g && task.g == this.confirm) {
                this.confirmSlot(task, members, tint(task), y, slots);
                y += ROW;
                return;
            }
            const head = task.f ? heads.get(task.f) : null;
            const row = this.slot(hero, task, `${i + 1}. `, i == 0 && !waiting, y, slots, tint(task), head ? `for ${head.n ? `${head.n} ` : ""}${itemName(head.m)}` : null);
            this.iconButton("up", W - 32, 8, i > 0, row, () => move(i - 1));
            this.iconButton("down", W - 22, 8, i < q.length - 1, row, () => move(i + 1));
            this.iconButton("off", W - 12, 8, true, row, () => {
                if (members) { this.confirm = task.g; this.draw(); }
                else this.send(q.filter((_, k) => k != i));
            });
            const place = task.k == TaskKind.TRAVEL ? IBC.data.heroes.places.get(task.p) : null;
            if (place) this.iconButton("info", W - 42, 8, true, row, () => LocationInfo.open(place));
            if (task.k == TaskKind.CRAFT) this.iconButton("info", W - 42, 8, true, row, () => ItemInfo.open(task.m, this.heroId));
            y += ROW;
        });
        const shown = Math.min(todoMost(IBC.data.premium.active), Math.max(VISIBLE, s.q.length + 1));
        for (let i = s.q.length; i < shown; i++) {
            slots.addChild(new PIXI.Graphics().beginFill(AP.SHADOW).drawRect(0, y, W, SLOT).endFill());
            if (i == s.q.length && s.x) wrap(s.x, W - 10).slice(0, 2).forEach((line, k) => fit(this.text(line, 5, y + (k ? BOTTOM_Y : TOP_Y), AP.FLAME, slots), W - 10));
            y += ROW;
        }
        this.todo.setContentHeight(shown * ROW);
        this.todo.scrollbar.visible = shown > VISIBLE;
        // (kept where it was scrolled to, but when more's put on the end: down to it)
        const key = `${hero.id} ${s.q.length}`, [was, had] = this.todoKey.split(" ").map(Number);
        if (was != hero.id) this.todo.scrollTo(0);
        else if (s.q.length > had) this.todo.scrollTo(1);
        this.todoKey = key;

        // the backup task: a slot like the others (dragged to from the right); none, resting
        this.text("Backup Task", 2, BACKUP_Y - 11, AP.WHITE, this.left);
        if (s.b) {
            const row = this.slot(hero, s.b, "", !s.q.length && !waiting, BACKUP_Y, this.left);
            this.iconButton("off", W - 12, 8, true, row, () => this.send(s.q, null));
        } else {
            this.left.addChild(new PIXI.Graphics().beginFill(AP.SHADOW).drawRect(0, BACKUP_Y, W, SLOT).endFill());
            this.text("Rest", 5, BACKUP_Y + 8, AP.ASH, this.left);
        }
    }

    // a task in a slot, two lines (the one under way lit, with how far along it is); in a group, its
    // colour round it, and a task put on for a craft, what it's for on the right of the second line
    private slot(hero: HeroRow, task: Task, number: string, now: boolean, y: number, parent: PIXI.Container, group: number = null, forText: string = null) {
        const { SLOT, TOP_Y, BOTTOM_Y } = TaskPlanner, SPLIT = TaskPlanner.LIST_W;
        const row = new PIXI.Container();
        row.position.set(0, y);
        const back = new PIXI.Graphics();
        back.beginFill(group ?? AP.BLACK).drawRect(0, 0, SPLIT, SLOT).endFill();
        back.beginFill(now ? AP.IRON : AP.SLATE).drawRect(1, 1, SPLIT - 2, SLOT - 2).endFill();
        if (now) back.beginFill(AP.LIME).drawRect(1, 1, 2, SLOT - 2).endFill();
        row.addChild(back);

        // (the nearest town, dungeon or event, once under way: the one picked)
        const [title, where] = this.lines(now && task.p == null && hero.s.w?.k == task.k && hero.s.w.p != null ? { ...task, p: hero.s.w.p, m: task.m ?? hero.s.w.m } : task);
        const room = SPLIT - (task.k == TaskKind.TRAVEL || task.k == TaskKind.CRAFT ? 50 : 40);    // (clear of its buttons)
        fit(this.text(number + title, 5, where ? TOP_Y : 8, AP.WHITE, row), room);  // (one line: centred)
        let whereRoom = room;
        if (forText) {
            const f = fit(this.text(forText, 0, BOTTOM_Y, group ?? AP.STRAW, row), Math.floor(room / 2));
            f.x = 5 + room - Math.ceil(f.textWidth);
            whereRoom = f.x - 4 - 5;
        }
        if (where) fit(this.text(where, 5, BOTTOM_Y, AP.STONE, row), whereRoom);

        // (filled as it goes, every frame: update)
        if (now && hero.s.w && taskProgress(hero, task) != null) {
            row.addChild(new PIXI.Graphics().beginFill(AP.SHADOW).drawRect(5, SLOT - 3, SPLIT - 44, 1).endFill());
            this.bar = { g: new PIXI.Graphics(), task, w: SPLIT - 44, y: SLOT - 3 };
            row.addChild(this.bar.g);
            this.fillBar();
        }
        parent.addChild(row);
        return row;
    }

    // a task on two lines: what, and where (none for resting; a backup task's has no amount: over and over)
    private lines(task: Task): [string, string] {
        const name = IBC.data.heroes.nameOf(task.p), n = task.n, some = n ? `${n} ` : "";
        switch (task.k) {
            case TaskKind.TRAVEL: return ["Travel", `to ${name}`];
            case TaskKind.GATHER: return [`Gather ${some}${itemName(task.m)}`, `at ${name}`];
            case TaskKind.CRAFT: return [`Craft ${some}${itemName(task.m)}`, `in ${name}`];
            case TaskKind.WORK: return [n ? `Work ${n} shift${n == 1 ? "" : "s"}` : "Work", task.p == null ? "in the nearest town" : `in ${name}`];
            case TaskKind.EXPLORE: return [n ? `Explore ${n} time${n == 1 ? "" : "s"}` : "Explore", task.p == null ? "the nearest dungeon" : name];
            case TaskKind.ADVENTURE: return [n ? `Adventure to ${n} place${n == 1 ? "" : "s"}` : "Adventure", "anywhere nearby"];
            case TaskKind.REST: return [n ? `Rest ${n} min` : "Rest", ""];
            case TaskKind.EVENT:
                if (anyEvent(task)) return ["Events", "the nearest one on"];
                return [IBC.data.events.get(task.m)?.n ?? "An event (over)", `at ${name}, till it's over`];
        }
        return ["?", ""];
    }

    // a craft being taken off that has tasks put on for it: whether they go too (All), only it does (Just it), or neither (Keep)
    private confirmSlot(task: Task, members: number, group: number, y: number, parent: PIXI.Container) {
        const { SLOT } = TaskPlanner, W = TaskPlanner.LIST_W, hero = this.hero, q = hero.s.q;
        const row = new PIXI.Container();
        row.position.set(0, y);
        const back = new PIXI.Graphics();
        back.beginFill(group ?? AP.BLACK).drawRect(0, 0, W, SLOT).endFill();
        back.beginFill(AP.SHADOW).drawRect(1, 1, W - 2, SLOT - 2).endFill();
        row.addChild(back);
        parent.addChild(row);
        const done = (list: Task[]) => { this.confirm = 0; this.send(list); };
        const keep = this.button("Keep", 0, 5, 0, true, row, () => { this.confirm = 0; this.draw(); });
        keep.x = W - 4 - keep.width;
        const just = this.button("Just it", 0, 5, 0, true, row, () => done(q.filter((t) => t != task)));
        just.x = keep.x - 3 - just.width;
        const all = this.button("All", 0, 5, 0, true, row, () => done(q.filter((t) => t != task && t.f != task.g)));
        all.x = just.x - 3 - all.width;
        fit(this.text(`Take off ${itemName(task.m)}:`, 5, TaskPlanner.TOP_Y, AP.WHITE, row), all.x - 10);
        fit(this.text(`its ${members} task${members == 1 ? "" : "s"} too?`, 5, TaskPlanner.BOTTOM_Y, group ?? AP.STRAW, row), all.x - 10);
    }

    public update(deltaTime: number) {
        if (this.bar && !this.bar.g.destroyed) this.fillBar();
    }

    private fillBar() {
        const hero = this.hero, b = this.bar;
        const done = hero ? taskProgress(hero, b.task) : null;
        b.g.clear();
        if (done) b.g.beginFill(progressTint(hero)).drawRect(5, b.y, b.w * done, 1).endFill();
    }


    //#endregion

    //#region the right: everything they could be given

    // the tabs, an icon each (like the sorts under them, a little bigger); on the right
    // the name of the one picked or pointed at
    private drawTabs() {
        const { TAB_H } = TaskPlanner;
        this.tabs.removeChildren().forEach((c) => c.destroy({ children: true }));
        const kinds = [TaskKind.TRAVEL, TaskKind.GATHER, TaskKind.CRAFT, TaskKind.EVENT, TaskKind.REST];
        const label = this.text("", 0, 4, AP.WHITE, this.tabs);
        const named = (name: string) => { label.text = name; fit(label, TaskPlanner.RIGHT_W - label.x); };      // (kept inside the window)
        const resting = () => named(tabName(this.tab));

        const pad = (TAB_H - TASK_ICON) / 2;
        let x = 0;
        for (const kind of kinds) {
            const on = kind == this.tab;
            const tab = new PIXI.Container();
            tab.position.set(x, 0);
            x += TAB_H + 1;
            const back = new PIXI.Graphics();
            back.beginFill(on ? AP.LIME : AP.BLACK).drawRect(0, 0, TAB_H, TAB_H).endFill();
            back.beginFill(on ? AP.IRON : AP.SLATE).drawRect(1, 1, TAB_H - 2, TAB_H - 2).endFill();
            tab.addChild(back);
            const icon = new PIXI.Sprite(taskIcon(tabIcon(kind)));
            icon.position.set(pad, pad);
            tab.addChild(icon);
            this.clickable(tab, TAB_H, TAB_H, () => { if (!on) { this.tab = kind; this.optionsKey = ""; this.draw(); } });
            tab.on("pointerover", () => named(tabName(kind)));
            tab.on("pointerout", resting);
            this.tabs.addChild(tab);
            this.tabAt.set(kind, tab);
        }
        label.x = x + 3;
        resting();
    }

    // the tab's sorts under it, an icon each (dim with nothing of it); first "all" (and, under a
    // sort with sorts of its own, "back" before it); a tooltip with its name over each (the user, 2026-11-02).
    // Gather and Craft: after a gap the skills they train, the same (dim with nothing of it at the levels
    // shown; picked again, all of them), round onto the next line at the edge (the user, 2026-11-02), and on the line under them the
    // levels they take, a tier at a time by < and > (any - to begin with, and left as it is when a skill's
    // picked: the user, 2026-11-02 -, 1-10, 11-20 ...) (a player, via the user, 2026-11-02: "tiers for like 11-20 skill, and also by skill. Some
    // times I just want to train hunting"; the user, 2026-11-02: on the sorts' line, the levels under it).
    // Kept for each hero and tab. Where the options start, under them.
    private drawSorts(hero: HeroRow, all: Option[], typed: Option[]) {
        const { SQUARE, SORTS_Y, SORTS_ROW, SKILLS_GAP, RIGHT_W } = TaskPlanner;
        this.sorts.removeChildren().forEach((c) => c.destroy({ children: true }));
        this.tip.hide();
        const roots = CATEGORIES[this.tab];
        if (!roots) return SORTS_Y;     // (no sorts: the options straight under the tabs; the user, 2026-11-02)
        const picked = this.picked[this.tab] ?? [];
        // the level shown: under the last picked if it has sorts of its own, else the one it's in
        const last = picked[picked.length - 1];
        const depth = last?.kids ? picked.length : picked.length - 1;   // (how many picked are over the level)
        const above = picked.slice(0, Math.max(0, depth));
        const level = above.length ? above[above.length - 1].kids : roots;
        const on = picked.length > above.length ? last : null;
        // (one choice across the sorts and skills: All, a sort or a skill - the user, 2026-11-02;
        // a skill picked goes back to the top sorts, a sort picked lets the skill go)
        const key = `${hero.id} ${this.tab}`, trained = this.trained[key] ?? {};
        const pick = (chain: Category[]) => { this.picked[this.tab] = chain; this.trained[key] = { tier: trained.tier }; this.optionsKey = ""; this.draw(); };
        const allName = above.length ? `All ${above[above.length - 1].name.toLowerCase()}` : "All";

        let x = 0, y = 0;
        const button = (texture: PIXI.Texture, name: string, lit: boolean, has: boolean, tap: () => void) => {
            if (x + SQUARE > RIGHT_W) { x = 0; y += SORTS_ROW; }     // (past the edge, on the next line)
            const b = this.square(texture, x, y, lit, has, this.sorts, tap);
            x += SQUARE + 1;
            b.on("pointerover", (e: PIXI.FederatedPointerEvent) => this.tip.show([name], e));
            b.on("pointermove", (e: PIXI.FederatedPointerEvent) => this.tip.move(e));
            b.on("pointerout", () => this.tip.hide());
        };
        if (above.length) button(taskIcon("back"), "Back", false, true, () => pick(above.slice(0, -1)));
        button(taskIcon("all"), allName, !on && trained.skill == null, true, () => pick(above));
        if (hasSkills(this.tab)) x += SKILLS_GAP - 1;   // (Gather and Craft: All on its own, apart from the sorts and the skills; the user, 2026-11-02)
        for (const c of level) {
            const sorts = sortsOf(c);
            button(taskIcon(c.icon), c.name, c == on, all.some((o) => sorts.includes(o.sort)), () => pick(c == on ? above : [...above, c]));
        }
        if (!hasSkills(this.tab)) return SORTS_Y + SORTS_ROW;

        const top = Math.max(0, ...all.map((o) => tierOf(o.level)));
        const train = (skill: Skill, tier: number) => {
            if (skill != null) this.picked[this.tab] = [];
            this.trained[key] = { skill, tier }; this.optionsKey = ""; this.draw();
        };
        const atTier = typed.filter((o) => trained.tier == null || tierOf(o.level) == trained.tier);
        const skills = Array.from(new Set(all.map((o) => o.skill))).sort((a, b) => a - b);
        x += SKILLS_GAP - 1;
        for (const s of skills) {
            button(skillIcon(s), SKILL_NAMES[s], s == trained.skill, atTier.some((o) => o.skill == s),
                () => train(s == trained.skill ? null : s, trained.tier));
        }

        // (round and round: any, then each tier up to the highest there is)
        y += SORTS_ROW;
        const next = trained.tier == null ? 0 : trained.tier >= top ? null : trained.tier + 1;
        const back = trained.tier == null ? top : trained.tier == 0 ? null : trained.tier - 1;
        this.iconButton("left", 0, y + 2, true, this.sorts, () => train(trained.skill, back));
        const levels = trained.tier == null ? "Any level" : `Level ${trained.tier * TIER_SKILL + 1}-${(trained.tier + 1) * TIER_SKILL}`;
        const t = this.text(levels, 12, y + 3, AP.WHITE, this.sorts);
        this.iconButton("right", 15 + Math.ceil(t.textWidth), y + 2, true, this.sorts, () => train(trained.skill, next));
        return SORTS_Y + y + SORTS_ROW;
    }

    // where they'll be when what's added now starts: the end of the list (else where they're going, or are)
    private startPlace(hero: HeroRow) {
        const s = hero.s;
        let at = s.r.length ? s.r[s.r.length - 1] : s.p;
        for (const task of s.q) if (task.p != null) at = task.p;     // (resting and adventuring: unknown, so no move)
        return at;
    }

    private drawOptions(hero: HeroRow) {
        const start = this.startPlace(hero), full = hero.s.q.length >= todoMost(IBC.data.premium.active);
        const picked = this.picked[this.tab] ?? [];
        const key = `${hero.id} ${this.tab} ${start} ${full} ${picked.map((c) => c.name).join("/")}`;
        if (key == this.optionsKey) return;
        this.optionsKey = key;
        const all = this.makeOptions(hero, start);
        const sort = picked[picked.length - 1], sorts = sort ? sortsOf(sort) : null;
        const typed = sorts ? all.filter((o) => sorts.includes(o.sort)) : all;
        const top = this.drawSorts(hero, all, typed), h = TaskPlanner.H - top;
        const on = hasSkills(this.tab) ? this.trained[`${hero.id} ${this.tab}`] ?? {} : {};
        // (rebuilt with every delivery to the stash, party or event change: stays scrolled where it was)
        const listKey = `${hero.id} ${this.partyId} ${this.tab} ${picked.map((c) => c.name).join("/")} ${on.skill} ${on.tier}`;
        const scrolled = listKey == this.listKey ? this.list.scrollPx : 0;
        this.listKey = listKey;
        this.options = typed.filter((o) => (on.skill == null || o.skill == on.skill) && (on.tier == null || tierOf(o.level) == on.tier));
        this.list.position(TaskPlanner.RIGHT, top);
        this.list.setViewHeight(h);
        this.list.container.hitArea = new PIXI.Rectangle(0, 0, TaskPlanner.RIGHT_W, h);

        const { SPLIT, SLOT, ROW } = TaskPlanner;
        const content = this.list.content;
        content.removeChildren().forEach((c) => c.destroy({ children: true }));
        if (this.tab == TaskKind.EVENT && !this.options.length) this.text("No events are on right now: new ones start every so often.", 4, 4, AP.STONE, content);
        else if (!this.options.length) this.text("Nothing here yet.", 4, 4, AP.STONE, content);
        this.bubbles = [];
        let y = 0;
        this.options.forEach((option) => {
            // (a full list greys them, but they can still be dragged to the backup slot)
            const bubble = this.bubble(option, !option.locked && !full), bh = bubbleH(option);
            bubble.position.set(0, y);
            y += bh + ROW - SLOT;
            if (!option.locked) {
                this.clickable(bubble, SPLIT, bh, () => { });
                bubble.on("pointerdown", (e: PIXI.FederatedPointerEvent) => { this.drag = { option, from: e.global.clone() }; });
            }
            // (all of it in a tooltip, pointed at: for what doesn't fit; the user, 2026-11-02)
            if (option.tip) {
                bubble.eventMode = "static";
                bubble.hitArea = new PIXI.Rectangle(0, 0, SPLIT, bh);
                bubble.on("pointerover", (e: PIXI.FederatedPointerEvent) => this.tip.show(option.tip, e));
                bubble.on("pointermove", (e: PIXI.FederatedPointerEvent) => this.tip.move(e));
                bubble.on("pointerout", () => this.tip.hide());
                bubble.on("pointerdown", () => this.tip.hide());
            }
            // a place to travel to: an "i" on the right opens it (the user, 2026-10-28)
            if (option.task?.k == TaskKind.TRAVEL) this.iconButton("info", SPLIT - 13, 8, true, bubble, () => LocationInfo.open(option.place));
            // a thing to craft: an "i" on the bottom right opens it (the user, 2026-10-28)
            if (option.info) this.iconButton("info", SPLIT - 12, SLOT - 11, true, bubble, () => ItemInfo.open(option.info, this.heroId));
            content.addChild(bubble);
            this.bubbles.push(bubble);
        });
        this.list.setContentHeight(Math.max(y, 1));
        this.list.scrollToPx(scrolled);
    }

    // an option's bubble: the place's sprite (or the item's) on the left, its name over how far
    private bubble(option: Option, can: boolean) {
        const { TOP_Y, BOTTOM_Y, LINE } = TaskPlanner;
        const w = TaskPlanner.SPLIT, SLOT = bubbleH(option);
        const bubble = new PIXI.Container();
        const back = new PIXI.Graphics();
        back.beginFill(AP.BLACK).drawRoundedRect(0, 0, w, SLOT, 4).endFill();
        back.beginFill(can ? AP.SLATE : AP.SHADOW).drawRoundedRect(1, 1, w - 2, SLOT - 2, 3).endFill();
        bubble.addChild(back);

        const icon = new PIXI.Sprite(option.icon ?? (option.item ? itemTexture(option.item) : placeTexture(option.place)));
        if (!option.item && !option.icon) icon.scale.set(ICON / PLACE_PX);  // (a px on screen a px of the sprite, the planner being drawn at 2x)
        icon.position.set(PAD, option.rows ? (TaskPlanner.SLOT - ICON) / 2 : (SLOT - ICON) / 2);  // (rows: by the first two)
        if (!can) icon.alpha = 0.5;
        bubble.addChild(icon);
        // how many they have, on the sprite's bottom right (over a shadow, to read on any sprite)
        if (option.count > 0) {
            const nx = PAD + ICON + 1, ny = (SLOT - ICON) / 2 + ICON - 6;
            const shadow = this.text(`${option.count}`, 0, ny + 1, AP.BLACK, bubble);
            shadow.x = nx + 1 - Math.ceil(shadow.textWidth);
            this.text(`${option.count}`, shadow.x - 1, ny, can ? AP.WHITE : AP.STONE, bubble);
        }

        // a line: its text from after the sprite, what's on its right kept clear of it
        const x = PAD + ICON + PAD;
        const line = (y: number, left: string, leftTint: number, right: string, rightTint: number, end: number = w - 4, from = x) => {
            let room = end - from;
            if (right) {
                const r = this.text(right, 0, y, rightTint, bubble);
                r.x = end - Math.ceil(r.textWidth);
                room = r.x - 6 - from;
            }
            return fit(this.text(left, from, y, leftTint, bubble), room);
        };
        if (option.rows) {
            option.rows.forEach((r, i) => {
                const y = TOP_Y + i * LINE;
                if (r.icon) {
                    const s = new PIXI.Sprite(r.icon);
                    s.position.set(x, y - 2);
                    if (!can) s.alpha = 0.5;
                    bubble.addChild(s);
                    // (what it is, pointed at: the skill's name; the user, 2026-11-02)
                    if (r.iconTip) this.tip.zone(x, y - 2, TASK_ICON, TASK_ICON, [r.iconTip], bubble);
                }
                line(y, r.text, can ? r.tint : AP.STONE, r.note, can ? r.noteTint : AP.STONE, w - 4, r.icon ? x + TASK_ICON + 2 : x);
                // (its text in a tooltip, pointed at: the event's name, kept to one line; the user, 2026-11-02)
                if (r.tip) this.tip.zone(x, y - 2, w - 4 - x, LINE, [r.text], bubble);
            });
            return bubble;
        }
        // (nothing under it: one line, centred)
        const one = !option.bottom && !option.note;
        line(one ? 8 : TOP_Y, option.top, can ? AP.WHITE : AP.STONE, option.what, option.locked ? AP.FLAME : can ? AP.SAND : AP.STONE);
        if (one) return bubble;
        const bottom = line(BOTTOM_Y, option.bottom, option.warn && !option.note ? AP.FLAME : AP.STONE, option.note, option.warn ? AP.FLAME : AP.ASH,
            option.info ? w - 15 : w - 4);  // (clear of its "i")
        // (a tooltip over just that text: a craft's ingredients; the user, 2026-11-02)
        if (option.bottomTip) {
            bottom.eventMode = "static";
            if (!option.locked) bottom.cursor = "pointer";     // (the bubble's own, it still being one to click)
            bottom.hitArea = new PIXI.Rectangle(0, 0, Math.ceil(bottom.textWidth), LINE);
            bottom.on("pointerover", (e: PIXI.FederatedPointerEvent) => this.tip.show(option.bottomTip, e));
            bottom.on("pointermove", (e: PIXI.FederatedPointerEvent) => this.tip.move(e));
            bottom.on("pointerout", () => this.tip.hide());
            bottom.on("pointerdown", () => this.tip.hide());
        }
        return bubble;
    }

    // a bubble dragged: after a few px it's picked up and follows the pointer
    private dragMove(e: PIXI.FederatedPointerEvent) {
        const d = this.drag;
        if (!d) return;
        if (!d.ghost) {
            if (Math.hypot(e.global.x - d.from.x, e.global.y - d.from.y) < 4) return;
            d.ghost = this.bubble(d.option, true);
            d.ghost.alpha = 0.85;
            d.ghost.eventMode = "none";
            this.content.addChild(d.ghost);
        }
        const at = this.content.toLocal(e.global);
        d.ghost.position.set(at.x - 10, at.y - bubbleH(d.option) / 2);
        const { SPLIT, ROW } = TaskPlanner;
        const over = this.dropOn(at), { LIST_TOP, BACKUP_Y } = TaskPlanner;
        this.drop.clear().lineStyle(1, AP.LIME);
        if (over == "list") this.drop.drawRect(0.5, LIST_TOP - 0.5, SPLIT - 1, TaskPlanner.VISIBLE * ROW - 1);
        if (over == "backup") this.drop.drawRect(0.5, BACKUP_Y - 0.5, SPLIT - 1, TaskPlanner.SLOT + 1);
        this.drop.visible = !!over;
    }

    // let go: on the list (or not dragged, just clicked) it's added; on the backup slot, it's the backup task
    private dragEnd(e: PIXI.FederatedPointerEvent) {
        const d = this.drag;
        if (!d) return;
        this.drag = null;
        this.drop.visible = false;
        const at = this.content.toLocal(e.global);
        let over = this.dropOn(at);
        if (d.ghost) d.ghost.destroy({ children: true });
        else if (e.type == "pointerupoutside") return;
        else over = "list";
        // (on the list, dropped or clicked alike: one with an amount, its window; the user, 2026-10-28)
        if (over == "list" && d.option.task && AMOUNTS[d.option.task.k]) this.choose(d.option);
        else if (over == "list") this.add(d.option);
        if (over == "backup" && this.hero && d.option.task) this.send(this.hero.s.q, { ...d.option.task });
    }

    // what a dragged bubble would go into: the list (anywhere on the left over it), the backup slot (anywhere under it)
    private dropOn(at: PIXI.IPointData): "list" | "backup" {
        if (at.x < 0 || at.x >= TaskPlanner.SPLIT || at.y < 0 || at.y >= TaskPlanner.H) return null;
        return at.y >= TaskPlanner.BACKUP_Y - 11 ? "backup" : "list";
    }

    // clicked, one with an amount: a window of its own to choose how many, "Name: Craft Bronze Sword" (TaskAmount; the user, 2026-10-28)
    private choose(option: Option) {
        const hero = this.hero;
        if (!hero || hero.s.q.length >= todoMost(IBC.data.premium.active)) return;
        const icon = option.icon ?? itemTexture(option.item);
        TaskAmount.open(this.heroId, { ...option.task }, icon, this.lines(option.task)[1]);
    }

    // on the end of the list, one with no amount (travel)
    private add(option: Option) {
        const hero = this.hero;
        if (!hero || !option.task || hero.s.q.length >= todoMost(IBC.data.premium.active)) return;
        this.send([...hero.s.q, { ...option.task }]);
    }

    private makeOptions(hero: HeroRow, start: number): Option[] {
        const heroes = IBC.data.heroes, h = hero.d;
        const dist = distancesFrom(heroes.graph, start);
        const places = Array.from(heroes.places.values()).filter((p) => dist.has(p.i)).sort((a, b) => dist.get(a.i) - dist.get(b.i));
        const towns = places.filter((p) => isTown(p));
        const at = (p: WorldPlace, more: Partial<Option>): Option => ({ place: p, top: placeName(p), bottom: distance(dist.get(p.i)), ...more });
        // an item first: its name over the place's and how far
        const item = (p: WorldPlace, id: number, more: Partial<Option>): Option =>
            at(p, { item: id, top: itemName(id), bottom: `${placeName(p)} - ${distance(dist.get(p.i))}`, ...more });

        switch (this.tab) {
            case TaskKind.TRAVEL:
                return places.filter((p) => p.i != start).map((p) => at(p, { sort: placeSort(p), task: { k: TaskKind.TRAVEL, p: p.i } }));

            // one a material (the user, 2026-10-28): at the nearest place it's found that isn't too
            // deep for them, else the nearest (locked); under it the skill level it takes, in place
            // of the place (red, and locked, till they have it)
            case TaskKind.GATHER: {
                const open: Option[] = [], locked: Option[] = [];
                for (const m of MATERIALS) {
                    const found = places.filter((p) => m.at.includes(kindOf(p)));
                    if (!found.length) continue;
                    const reach = (p: WorldPlace) => IBC.data.parties.gatherDeepest(kindOf(p), hero, p.i, m.id, heroes.heroes);
                    const p = found.find((p) => m.level <= reach(p)) ?? found[0];
                    const deep = m.level > reach(p);
                    // (how deep they do get, and what would take them further; the user, 2026-11-05)
                    const tip = deep ? [`Found from floor ${m.level}`, ...(this.partyId != null
                        ? [`This party reaches floor ${reach(p)}`, "More heroes with it go deeper"]
                        : [`${h.n} reaches floor ${reach(p)}`, "A party can go deeper"])] : undefined;
                    const skill = gatherSkill(m.id), level = gatherLevel(m.id), low = h.k[skill] < level;
                    (deep || low ? locked : open).push(item(p, m.id, {
                        what: deep ? `too deep: fl ${m.level}` : null, tip, count: this.have(m.id), locked: deep || low, sort: m.type,
                        bottom: `${SKILL_NAMES[skill]} ${level}`, warn: low, skill, level,
                        task: deep || low ? null : { k: TaskKind.GATHER, p: p.i, m: m.id },
                    }));
                }
                byLevel(open, locked);
                // (a new player's first gather: the nearest first, the one the guide points at)
                if (!stepDone(IBC.data.player.guide, Step.GATHER)) open.sort((a, b) => dist.get(a.place.i) - dist.get(b.place.i));
                return [...open, ...locked];
            }

            // (under the item, what it needs and how many of each they have, "1/10 Copper Ore", in
            // place of the town; the user, 2026-10-28)
            case TaskKind.CRAFT: {
                const town = towns[0];
                if (!town) return [];
                // (on the right what it's worth, or the skill level it takes - shown, but not
                // given, till they have it - by its tier; DESIGN.md "Equipment")
                const open: Option[] = [], locked: Option[] = [];
                for (const r of RECIPES) {
                    const enough = r.needs.every(([id, n]) => this.have(id) >= n), level = craftLevel(r.id), low = h.k[r.skill] < level;
                    const needs = r.needs.map(([id, n]) => `${n} ${itemName(id)}`).join(", ");
                    (low ? locked : open).push(item(town, r.id, {
                        // (its name the whole top line; the user, 2026-11-01), what it takes under it, "3 Wool, 4 Leather",
                        // and the same in a tooltip over it, for a long list (2026-11-02)
                        bottom: needs, bottomTip: [needs], locked: low,
                        count: this.have(r.id), warn: low || !enough, sort: r.type, skill: r.skill, level,
                        task: low ? null : { k: TaskKind.CRAFT, p: town.i, m: r.id }, info: r.id,
                    }));
                }
                byLevel(open, locked);
                return [...open, ...locked];
            }

            // the events on (shared/Events.ts), nearest first, a few at most so each as tall as it
            // takes (the user, 2026-11-02): its name, one line (in a tooltip too); its kind and how far
            // it's got; the time left and the heroes on it; the place and how far; the skill it's worked
            // with now, by its icon (a staged one's stage); what doing it wins. Joined, kept at till it's over
            case TaskKind.EVENT: {
                const now = Date.now();
                return IBC.data.events.live().filter((e) => dist.has(e.p)).sort((a, b) => dist.get(a.p) - dist.get(b.p)).map((e) => {
                    const p = heroes.places.get(e.p), def = eventDef(e.k), stage = eventStage(e), c = e.c ?? 0;
                    const hours = Math.round(BOON_MS / 3600000), boonLasts = `${hours} hour${hours == 1 ? "" : "s"}`;  // (how long the boon's on)
                    const skills = eventSkills(e, p), work = stage != null ? eventStages(e)[stage].name : skillsText(skills);
                    return at(p, {
                        top: e.n,
                        rows: [
                            { text: e.n, tint: AP.WHITE, tip: true },
                            ...rows(def.name, AP.STRAW, `${Math.floor(100 * e.d / e.g)}% done`, AP.SAND),
                            ...rows(`${timeLeft(e.e - now)} left`, AP.ASH, `${c} hero${c == 1 ? "" : "es"}`, AP.ASH),
                            ...rows(`${placeName(p)} - ${distance(dist.get(p.i))}`, AP.STONE),
                            ...rows(work, AP.WHITE, null, null, skillIcon(skills[0]), SKILL_NAMES[skills[0]]),
                            ...rows(`Completion Rewards: ${def.boonText} for ${boonLasts}`, AP.LIME),
                        ],
                        task: { k: TaskKind.EVENT, p: e.p, m: e.i },
                    });
                });
            }

            // Misc: resting, adventuring and events with none named (shared/Tasks.ts anyEvent), an icon
            // each and what it's for under it (earning gold and exploring taken off: too vague, and
            // too like adventuring; the user, 2026-10-28)
            case TaskKind.REST: {
                const here = heroes.places.get(start);
                if (!here) return [];
                return [
                    at(here, { top: "Rest", bottom: "Heal up where you are", icon: tentTexture(), task: { k: TaskKind.REST } }),
                    at(here, { top: "Adventure", bottom: "Roam nearby for finds", icon: taskIcon("adventure"), task: { k: TaskKind.ADVENTURE } }),
                    at(here, {
                        top: "Events", bottom: "Help at the nearest event", icon: taskIcon("events"), task: { k: TaskKind.EVENT },
                        tip: ["Stays till that event is over.", "As a Backup Task, moves on to the next", "one, and rests while none are on."],
                    }),
                ];
            }
        }
        return [];
    }

    private have(id: number) {
        return IBC.data.inventory.items.get(id)?.amount ?? 0;
    }

    //#endregion

    //#region bits

    private text(text: string, x: number, y: number, tint: number, parent: PIXI.Container) {
        const t = new PIXI.BitmapText(text, { fontName: Constants.PIXEL_FONT, fontSize: 32 });
        t.tint = tint;
        t.position.set(x, y);
        t.eventMode = "none";
        parent.addChild(t);
        return t;
    }

    private clickable(target: PIXI.Container, w: number, h: number, tap: (e: PIXI.FederatedPointerEvent) => void) {
        target.eventMode = "static";
        target.cursor = "pointer";
        target.hitArea = new PIXI.Rectangle(0, 0, w, h);
        target.on("pointertap", tap);
    }

    private button(label: string, x: number, y: number, w: number, on: boolean, parent: PIXI.Container, tap: (e: PIXI.FederatedPointerEvent) => void) {
        const button = new PIXI.Container();
        button.position.set(x, y);
        const t = this.text(label, 0, 3, on ? AP.WHITE : AP.STONE, button);
        w = Math.max(w, Math.ceil(t.textWidth) + 8);
        const box = new PIXI.Graphics();
        box.beginFill(AP.BLACK).drawRect(0, 0, w, 13).endFill();
        box.beginFill(on ? AP.LEAF : AP.IRON).drawRect(1, 1, w - 2, 11).endFill();
        button.addChildAt(box, 0);
        t.x = Math.round((w - t.textWidth) / 2);
        if (on) this.clickable(button, w, 13, tap);
        parent.addChild(button);
        return button;
    }

    // a sort's square button: lit when picked, its icon dim when there's nothing of it
    private square(texture: PIXI.Texture, x: number, y: number, lit: boolean, has: boolean, parent: PIXI.Container, tap: () => void) {
        const S = TaskPlanner.SQUARE;
        const b = new PIXI.Container();
        b.position.set(x, y);
        const back = new PIXI.Graphics();
        back.beginFill(lit ? AP.LIME : AP.BLACK).drawRect(0, 0, S, S).endFill();
        back.beginFill(lit ? AP.IRON : has ? AP.SLATE : AP.SHADOW).drawRect(1, 1, S - 2, S - 2).endFill();
        b.addChild(back);
        const sprite = new PIXI.Sprite(texture);
        sprite.position.set(1, 1);
        if (!has) sprite.alpha = 0.35;
        b.addChild(sprite);
        this.clickable(b, S, S, tap);
        parent.addChild(b);
        return b;
    }

    // a small square button with an arrow up, down, left or right, a cross, or an "i"
    private iconButton(icon: "up" | "down" | "left" | "right" | "off" | "info", x: number, y: number, on: boolean, parent: PIXI.Container, tap: () => void) {
        const b = new PIXI.Graphics();
        b.position.set(x, y);
        b.beginFill(AP.BLACK).drawRect(0, 0, 9, 9).endFill();
        b.beginFill(on ? (icon == "off" ? AP.MAROON : AP.SHADOW) : AP.SLATE).drawRect(1, 1, 7, 7).endFill();
        const ink = on ? AP.WHITE : AP.IRON;
        if (icon == "up") b.beginFill(ink).drawPolygon([4.5, 2.5, 7, 6, 2, 6]).endFill();
        if (icon == "down") b.beginFill(ink).drawPolygon([2, 3, 7, 3, 4.5, 6.5]).endFill();
        if (icon == "left") b.beginFill(ink).drawPolygon([2.5, 4.5, 6, 2, 6, 7]).endFill();
        if (icon == "right") b.beginFill(ink).drawPolygon([6.5, 4.5, 3, 2, 3, 7]).endFill();
        if (icon == "off") for (let k = 0; k < 4; k++) b.beginFill(ink).drawRect(2.5 + k, 2.5 + k, 1, 1).drawRect(5.5 - k, 2.5 + k, 1, 1).endFill();
        if (icon == "info") b.beginFill(ink).drawRect(4, 2, 1, 1).drawRect(4, 4, 1, 3).endFill();
        parent.addChild(b);
        if (on) {
            this.clickable(b, 9, 9, (e) => { e.stopPropagation(); tap(); });
            b.on("pointerdown", (e: PIXI.FederatedPointerEvent) => e.stopPropagation());   // (not a bubble picked up)
        }
    }

    //#endregion

}

// how far, in miles (map px in)
export function distance(px: number) {
    if (!px) return "here";
    const miles = Math.max(1, Math.round((px / TILE) * MILES));
    return `${miles} mile${miles == 1 ? "" : "s"} away`;
}

// a place's sprite, off the map's sheet of them
const placeTextures = new Map<number, PIXI.Texture>();
export function placeTexture(place: WorldPlace) {
    let texture = placeTextures.get(place.s);
    if (!texture) {
        const sheet: PIXI.BaseTexture = PIXI.Assets.get("map-places").baseTexture;
        texture = new PIXI.Texture(sheet, new PIXI.Rectangle(place.s * PLACE_PX, 0, PLACE_PX, PLACE_PX));
        placeTextures.set(place.s, texture);
    }
    return texture;
}

// words broken into lines that fit a width
function wrap(text: string, width: number) {
    const measure = new PIXI.BitmapText("", { fontName: Constants.PIXEL_FONT, fontSize: 32 });
    const lines: string[] = [];
    let line = "";
    for (const word of text.split(" ")) {
        measure.text = line ? `${line} ${word}` : word;
        if (line && measure.textWidth > width) { lines.push(line); line = word; }
        else line = measure.text;
    }
    if (line) lines.push(line);
    measure.destroy();
    return lines;
}

// how far into the one they're on now (0-1; null: there's no telling, travelling): s.u as the
// server last worked it out, and on from there at their pace (the time, weather and an event's
// boon and a quick start, as the server goes); a timed rest, the whole of it. The bar in their roster box too.
// Recovering from a fight or held up, how far through that instead (heldProgress)
export function taskProgress(hero: HeroRow, task: Task) {
    const held = heldProgress(hero);
    if (held != null) return held;
    const s = hero.s, h = hero.d, w = s.w;
    if (s.r.length || !w || !task) return null;
    if (task.k == TaskKind.REST && !task.n) return null;
    const place = w.p ?? task.p;
    const each = task.k == TaskKind.GATHER ? gatherMs(h, task.m) / IBC.data.events.rate(place, "gather") / IBC.data.player.quick()
        : task.k == TaskKind.CRAFT ? craftMs(h, task.m) / IBC.data.events.rate(place, "craft") / IBC.data.player.quick() / IBC.data.guilds.craftRate()
        : task.k == TaskKind.WORK ? SHIFT_MS : task.k == TaskKind.REST ? task.n * 60000
        : task.k == TaskKind.EXPLORE ? exploreMs(h) : task.k == TaskKind.ADVENTURE ? lookMs(h) : 0;
    if (!each) return null;
    let u = s.u;
    if (!s.o && !s.y) {
        const since = Math.max(0, Date.now() - s.t);
        u += task.k == TaskKind.REST ? since : since * workPace(h, conditionsNow(hero), workSkillOf(w));
    }
    return Math.min(1, u / each);
}

// how far through what's holding them (0-1; null: nothing is): healing from a fight (s.o, how
// hurt they were as it started; healing on from s.h as the server does) or held up on the road
// (s.y left of s.v) (the user, 2026-11-01: "recovering from a fight or any kind of being held
// action should show the bar below of how far along it is")
export function heldProgress(hero: HeroRow) {
    const s = hero.s, since = Math.max(0, Date.now() - s.t);
    if (s.o) return Math.min(1, Math.max(0, 1 - Math.max(0, (s.h ?? 0) - since * healRate(hero.d, s, true)) / s.o));
    if (s.y) return Math.min(1, Math.max(0, 1 - Math.max(0, s.y - since) / Math.max(s.v ?? s.y, s.y)));
    return null;
}

// the bar's colour: lime at work, flame healing, straw held up
export function progressTint(hero: HeroRow) {
    return hero.s.o ? AP.FLAME : hero.s.y ? AP.STRAW : AP.LIME;
}

// the time of day and the weather where they are now
function conditionsNow(hero: HeroRow) {
    const at = IBC.data.heroes.graph.get(hero.s.p);
    return conditionsAt(at?.x ?? 0, at?.y ?? 0, Date.now());
}

// a tab's name: its kind's, but resting's, which is everything else (the user, 2026-10-28)
function tabName(kind: TaskKind) {
    return kind == TaskKind.REST ? "Misc" : TASK_NAMES[kind];
}

// a tab's icon (art/TaskIcons)
function tabIcon(kind: TaskKind) {
    return ["travel", "gather", "craft", "", "events", "misc"][kind];
}

// the sort a place is, on the Travel tab: a town, a dungeon, somewhere things are gathered, or anywhere else
function placeSort(place: WorldPlace) {
    if (isTown(place)) return "town";
    if (isDungeon(place)) return "dungeon";
    const kind = kindOf(place);
    return MATERIALS.some((m) => m.at.includes(kind)) ? "wilds" : "other";
}
