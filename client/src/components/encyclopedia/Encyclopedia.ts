import * as PIXI from "pixi.js";
import { EXTENDED, EXT, JOBS, Skill, SKILL_NAMES, STAT_NAMES, STAT_SHORT, TRAITS, isSpecialty, extLevel } from "../../../../shared/Heroes";
import { danger, DANGER, heroPower, levelsOf, materialOf, MATERIALS, materialsAt } from "../../../../shared/Locations";
import { MOMENTS } from "../../../../shared/Choices";
import { isDungeon, isTown, kindOf, placeName, WorldPlace } from "../../../../shared/Places";
import { ENEMIES, EnemyDef, enemiesAt, HP_A_POWER, NIGHT_DANGER, NIGHT_DROP, NIGHT_ROAD } from "../../../../shared/Fights";
import { BOSSES, EVENT_KINDS, EventKind, eventTitle, isLive } from "../../../../shared/Events";
import { growsTown } from "../../../../shared/Towns";
import {
    craftLevel, gatherLevel, gatherSkill, itemName, itemTier, itemWorth, QUALITY_MUL, QUALITY_NAMES, recipeOf, RECIPES, SKILL_STAT, TOOL_SKILL, wornPower,
} from "../../../../shared/Tasks";
import { heroesIcon, skillIcon, skillsIcon } from "../../art/BoardIcons";
import { enemyTexture } from "../../art/EnemyArt";
import { taskIcon } from "../../art/TaskIcons";
import { Event } from "../../constants/Events";
import { AP } from "../../constants/Palette";
import { IBC } from "../../Engine";
import { Panel } from "../../shared/Panel";
import { ScrollView } from "../../shared/ui/ScrollView";
import { TextField } from "../../shared/ui/TextField";
import { TitleBar } from "../../shared/ui/titlebar/TitleBar";
import { BaseComponent, ComponentType } from "../BaseComponent";
import { Chat } from "../chat/Chat";
import { EventInfo } from "../eventinfo/EventInfo";
import { text, textWidth } from "../games/GameUI";
import { fit } from "../heroroster/HeroRoster";
import { HeroStatus } from "../herostatus/HeroStatus";
import { itemTexture } from "../inventory/Item";
import { ItemInfo } from "../iteminfo/ItemInfo";
import { LocationInfo } from "../locationinfo/LocationInfo";
import { Map } from "../map/Map";
import { placeTexture } from "../taskplanner/TaskPlanner";

// The encyclopedia (the user, 2026-10-29: "every location, item, skill,
// beast, etc in the game; an entry should open its proper component"),
// Claude's layout, from the main menu. Along the top a tab each - Places,
// Items, Beasts, Skills, Heroes (jobs, traits and stats) and Events (their
// kinds and the bosses) -, under them a line to search the tab by. On the
// left the tab's entries, grouped, a row each; on the right the one picked:
// what it is and what it ties to, those clicked in turn. A place's page
// has an Open to its LocationInfo (the map to it), an item's to its ItemInfo
// (the user, 2026-11-02: picking one from the list shouldn't open them); a
// hero, an event on now opens theirs. Pointing at anything says more along
// the bottom.
// The tab and entry are kept from one opening to the next.

enum Tab { PLACES, ITEMS, BEASTS, SKILLS, HEROES, EVENTS }
const TABS = [
    { name: "Places", icon: () => taskIcon("town") },
    { name: "Items", icon: () => taskIcon("material") },
    { name: "Beasts", icon: () => taskIcon("beast") },
    { name: "Skills", icon: skillsIcon },
    { name: "Heroes", icon: heroesIcon },
    { name: "Events", icon: () => taskIcon("events") },
];

// a row on the left: its key (unique in its tab), group, name, a line under
// it, its icon (and the scale it's drawn at), and its page
interface Entry {
    key: string;
    group: string;
    name: string;
    sub: string;
    icon: PIXI.Texture;
    scale?: number;
    page: (y: number) => number;        // (draws it on the right from y; how tall it came to)
}

export class Encyclopedia extends BaseComponent {

    public static SCALE = 2;
    public static W = 400;              // in its own px
    public static H = 260;
    public static TAB_H = 14;
    public static TOP = 17;             // the search line, and the right's top
    public static LIST_Y = 31;
    public static LIST_W = 150;
    public static LIST_H = Encyclopedia.H - 12 - Encyclopedia.LIST_Y;
    public static RIGHT = Encyclopedia.LIST_W + 8;
    public static RIGHT_W = Encyclopedia.W - Encyclopedia.RIGHT;
    public static VIEW_H = Encyclopedia.H - 12 - Encyclopedia.TOP;
    public static ROW_H = 18;           // an entry: its name, a line under it
    public static GROUP_H = 12;
    public static LINE = 10;
    public static CELL = 18;            // an icon in a grid of them
    public static INSET_X = 12;         // the window round it, in screen px
    public static INSET_Y = 28;
    public static WIDTH = Encyclopedia.INSET_X * 2 + Encyclopedia.W * Encyclopedia.SCALE;
    public static HEIGHT = Encyclopedia.INSET_Y + Encyclopedia.H * Encyclopedia.SCALE + Encyclopedia.INSET_X;

    // (kept from one opening to the next)
    private static tab = Tab.PLACES;
    private static picked: string[] = TABS.map(() => "");

    public background: Panel;
    public titleBar: TitleBar;
    private content: PIXI.Container;
    private tabs = new PIXI.Container();
    private list: ScrollView;
    private right: ScrollView;
    private pageKey = "";               // (the page drawn: a different one starts at the top)
    private info: PIXI.BitmapText;
    private count: PIXI.BitmapText;
    private search: TextField;
    private entries: Entry[] = [];

    private keys = (e: KeyboardEvent) => this.onKey(e);
    private paste = (e: ClipboardEvent) => { if (this.search.focused) { this.search.paste(e.clipboardData?.getData("text") ?? ""); this.drawList(); } };

    constructor() {
        super(ComponentType.ENCYCLOPEDIA);
        this.create();
    }

    // the window (one open at a time)
    public static open() {
        const view = IBC.comp.getOrCreate(ComponentType.ENCYCLOPEDIA) as Encyclopedia;
        view.bringToTop();
        return view;
    }

    public create() {
        super.create();
        const { W, H, WIDTH, HEIGHT, SCALE, TOP, LIST_Y, LIST_W, LIST_H, RIGHT, VIEW_H } = Encyclopedia;
        this.container.eventMode = "static";
        this.container.hitArea = new PIXI.Rectangle(0, 0, WIDTH, HEIGHT);
        this.container.on("pointerdown", (e: PIXI.FederatedPointerEvent) => { e.stopPropagation(); this.search.setFocused(false); });

        this.background = new Panel(this.container);
        this.background.setSize(WIDTH, HEIGHT);
        this.titleBar = new TitleBar(this);
        this.titleBar.setPosition(4, 4);
        this.titleBar.setSize(WIDTH - 8, 20);
        this.titleBar.setTitle("Encyclopedia");

        this.content = new PIXI.Container();
        this.content.scale.set(SCALE);
        this.content.position.set(Encyclopedia.INSET_X, Encyclopedia.INSET_Y);
        this.container.addChild(this.content);

        // (the panel's middle lets the map through)
        this.content.addChild(new PIXI.Graphics().beginFill(AP.INK).drawRect(-4, -2, W + 8, H + 6).endFill());
        this.content.addChild(this.tabs);
        // down the middle
        this.content.addChild(new PIXI.Graphics()
            .beginFill(AP.BLACK).drawRect(RIGHT - 5, TOP, 1, H - 12 - TOP).endFill()
            .beginFill(AP.IRON).drawRect(RIGHT - 4, TOP, 1, H - 12 - TOP).endFill());

        this.search = new TextField(LIST_W - 34, { max: 24, hint: "search", onEnter: () => this.search.setFocused(false) });
        this.search.container.position.set(0, TOP);
        this.content.addChild(this.search.container);
        this.count = text("", 0, TOP + 2, AP.STONE, this.content);

        this.list = new ScrollView(this.content, LIST_W, LIST_H);
        this.list.position(0, LIST_Y);
        this.list.container.hitArea = new PIXI.Rectangle(0, 0, LIST_W, LIST_H);
        this.right = new ScrollView(this.content, W - RIGHT, VIEW_H);
        this.right.position(RIGHT, TOP);
        this.right.container.hitArea = new PIXI.Rectangle(0, 0, W - RIGHT, VIEW_H);

        // the line along the bottom, saying more about what's pointed at
        this.content.addChild(new PIXI.Graphics().beginFill(AP.SHADOW).drawRect(0, H - 11, W, 10).endFill());
        this.info = text("", 4, H - 9, AP.ASH, this.content);

        window.addEventListener("keydown", this.keys);
        document.addEventListener("paste", this.paste);
        // (your heroes and the events on now are on the pages)
        IBC.events.register(Event.EVENTS_CHANGED, () => this.drawPage(), this);
        IBC.events.register(Event.HERO_STASH, () => this.drawPage(), this);
        // opens left of the middle of the screen, clear of the windows it opens (right of it)
        this.setPosition(Math.max(0, Math.round((window.innerWidth - WIDTH) / 2) - 160), Math.max(0, Math.round((window.innerHeight - HEIGHT) / 2)));
        this.pick(Encyclopedia.tab);
    }

    public destroy() {
        super.destroy();
        window.removeEventListener("keydown", this.keys);
        document.removeEventListener("paste", this.paste);
        this.search.destroy();
        this.list.destroy();
        this.right.destroy();
        this.titleBar.destroy();
        this.background.destroy();
        this.container.destroy({ children: true });
    }

    public update(deltaTime: number) {
        this.search.update(deltaTime);
    }

    private onKey(e: KeyboardEvent) {
        if (e.ctrlKey || e.metaKey || e.altKey) return;
        if (!this.search.focused) {
            if (e.key == "Escape" && !Chat.takes(e)) IBC.comp.destroy(this);
            return;
        }
        (e as any).chat = true;
        e.preventDefault();
        Chat.stop();
        this.search.key(e);
        this.drawList();
    }

    private say(said: string) {
        this.info.text = said;
        fit(this.info, Encyclopedia.W - 8);
    }

    //#region the tabs, the list

    // a tab, and the entry picked in it last (or one by its key)
    private pick(tab: Tab, key?: string) {
        if (tab != Encyclopedia.tab || key != undefined) this.search.set("");
        Encyclopedia.tab = tab;
        if (key != undefined) Encyclopedia.picked[tab] = key;
        this.entries = this.entriesOf(tab);
        this.drawTabs();
        this.drawList();
        this.drawPage();
        if (key != undefined) this.scrollToPicked();
    }

    private drawTabs() {
        const { W, TAB_H } = Encyclopedia;
        clear(this.tabs);
        const widths = TABS.map((t) => 4 + 10 + 3 + textWidth(t.name) + 5);
        const gap = Math.floor((W - widths.reduce((a, w) => a + w, 0)) / (TABS.length - 1));
        let x = 0;
        TABS.forEach((t, k) => {
            const on = k == Encyclopedia.tab, w = k == TABS.length - 1 ? W - x : widths[k];
            const tab = new PIXI.Container();
            tab.position.set(x, 0);
            const back = new PIXI.Graphics();
            const paint = (lit: boolean) => back.clear()
                .beginFill(on ? AP.STRAW : AP.BLACK).drawRect(0, 0, w, TAB_H).endFill()
                .beginFill(on || lit ? AP.IRON : AP.SLATE).drawRect(1, 1, w - 2, TAB_H - 2).endFill()
                .beginFill(on ? AP.STEEL : AP.IRON, on || lit ? 1 : 0.5).drawRect(1, 1, w - 2, 1).endFill();
            paint(false);
            tab.addChild(back);
            const icon = new PIXI.Sprite(t.icon());
            icon.position.set(4, 2);
            tab.addChild(icon);
            text(t.name, 17, 3, on ? AP.WHITE : AP.ASH, tab);
            this.hot(tab, new PIXI.Rectangle(0, 0, w, TAB_H), `${t.name}: ${this.entriesOf(k).length} entries`, () => { if (!on) this.pick(k); }, paint);
            this.tabs.addChild(tab);
            x += w + gap;
        });
    }

    // the entries matching the search, under their groups' headings
    private drawList() {
        const { LIST_W, ROW_H, GROUP_H } = Encyclopedia;
        const q = this.search.value.trim().toLowerCase();
        const shown = this.entries.filter((e) => !q || e.name.toLowerCase().includes(q) || e.sub.toLowerCase().includes(q) || e.group.toLowerCase().includes(q));
        this.count.text = `${shown.length}`;
        this.count.x = LIST_W - 4 - textWidth(this.count.text);
        const parent = this.list.content, picked = Encyclopedia.picked[Encyclopedia.tab];
        clear(parent);
        let y = 0, group = "";
        for (const e of shown) {
            if (e.group != group) {
                group = e.group;
                heading(group, 0, y + 2, LIST_W - 4, parent);
                y += GROUP_H;
            }
            const row = new PIXI.Container();
            row.position.set(0, y);
            const on = e.key == picked, w = LIST_W - 8;
            const back = new PIXI.Graphics();
            const paint = (lit: boolean) => back.clear().beginFill(on ? AP.IRON : AP.SLATE, on || lit ? 1 : 0).drawRect(0, 0, w, ROW_H - 1).endFill();
            paint(false);
            row.addChild(back);
            const icon = new PIXI.Sprite(e.icon);
            icon.anchor.set(0.5);
            icon.scale.set(e.scale ?? 1);
            icon.position.set(9, 9);
            row.addChild(icon);
            fit(text(e.name, 19, 1, on ? AP.WHITE : AP.MIST, row), w - 21);
            fit(text(e.sub, 19, 9, AP.STONE, row), w - 21);
            this.hot(row, new PIXI.Rectangle(0, 0, w, ROW_H - 1), `${e.name}: ${e.sub}`, () => this.choose(e), paint);
            parent.addChild(row);
            y += ROW_H;
        }
        if (!shown.length) text("Nothing matches", 4, 4, AP.IRON, parent);
        this.list.setContentHeight(Math.max(y, 1));
        if (this.list.scrollRatio && y <= Encyclopedia.LIST_H) this.list.scrollTo(0);
    }

    // an entry clicked: its page
    private choose(e: Entry) {
        Encyclopedia.picked[Encyclopedia.tab] = e.key;
        this.drawList();
        this.drawPage();
    }

    // the list to the picked entry (picked from another's page)
    private scrollToPicked() {
        const { ROW_H, GROUP_H, LIST_H } = Encyclopedia;
        const at = this.entries.findIndex((e) => e.key == Encyclopedia.picked[Encyclopedia.tab]);
        if (at < 0) return;
        const groups = new Set(this.entries.slice(0, at + 1).map((e) => e.group)).size;
        const y = at * ROW_H + groups * GROUP_H, most = this.list.scrollContainerHeight - LIST_H;
        this.list.scrollTo(most > 0 ? Math.max(0, y - LIST_H / 2) / most : 0);
    }

    // the picked entry's page (the first, if none's been)
    private drawPage() {
        const tab = Encyclopedia.tab;
        let e = this.entries.find((e) => e.key == Encyclopedia.picked[tab]);
        if (!e) { e = this.entries[0]; Encyclopedia.picked[tab] = e?.key ?? ""; }
        // (redrawn with every delivery to the stash or event change: only another page starts at the top)
        const pageKey = `${tab} ${e?.key}`, scrolled = pageKey == this.pageKey ? this.right.scrollPx : 0;
        this.pageKey = pageKey;
        clear(this.right.content);
        this.say("");
        const h = e ? e.page(0) : 0;
        this.right.setContentHeight(Math.max(h, 1));
        this.right.scrollToPx(scrolled);
    }

    //#endregion

    //#region the entries

    private entriesOf(tab: Tab): Entry[] {
        switch (tab) {
            case Tab.PLACES: return this.places();
            case Tab.ITEMS: return this.items();
            case Tab.BEASTS: return this.beasts();
            case Tab.SKILLS: return this.skills();
            case Tab.HEROES: return this.heroInfo();
            case Tab.EVENTS: return this.events();
        }
    }

    private places(): Entry[] {
        const order = ["Towns", "Dungeons", "Gathering places", "Road stops"];
        return Array.from(IBC.data.heroes.places.values())
            .map((p) => ({ p, group: order[placeSort(p)] }))
            .sort((a, b) => placeSort(a.p) - placeSort(b.p) || placeName(a.p).localeCompare(placeName(b.p)))
            .map(({ p, group }) => ({
                key: `${p.i}`, group, name: placeName(p), sub: `${kindName(kindOf(p))}, ${levelsOf(kindOf(p))} floors`,
                icon: placeTexture(p), scale: 0.5, page: (y: number) => this.placePage(p, y),
            }));
    }

    private items(): Entry[] {
        const gathered = [...MATERIALS].sort((a, b) => a.type.localeCompare(b.type) || a.level - b.level).map((m) => ({
            key: `${m.id}`, group: "Gathered", name: m.name, sub: `${title(m.type)}, ${SKILL_NAMES[gatherSkill(m.id)]} ${gatherLevel(m.id)}`,
            icon: itemTexture(m.id), page: (y: number) => this.itemPage(m.id, y),
        }));
        const made = RECIPES.map((r) => ({
            key: `${r.id}`, group: madeGroup(r.type), name: r.name, sub: `${SKILL_NAMES[r.skill]} ${craftLevel(r.id)}${itemWorth(r.id) ? `, ${itemWorth(r.id)}` : ""}`,
            icon: itemTexture(r.id), page: (y: number) => this.itemPage(r.id, y),
        }));
        const groups = ["Worked materials", "Weapons", "Armour", "Jewellery", "Tools", "Potions", "Meals"];
        return [...gathered, ...made.sort((a, b) => groups.indexOf(a.group) - groups.indexOf(b.group))];
    }

    private beasts(): Entry[] {
        return [...ENEMIES].sort((a, b) => a.name.localeCompare(b.name)).map((e) => ({
            key: `${e.id}`, group: "Beasts", name: e.name, sub: `${e.night ? "Out at night, met" : "Met"} ${e.from ? `from floor ${e.from}` : "from the first floor"}, ${e.in.length} kinds of place`,
            icon: enemyTexture(e.id), scale: 0.5, page: (y: number) => this.beastPage(e, y),
        }));
    }

    private skills(): Entry[] {
        const core = SKILL_NAMES.map((name, k) => ({
            key: `${k}`, group: "Core skills", name, sub: `Leans on ${STAT_NAMES[SKILL_STAT[k]]}`,
            icon: skillIcon(k), page: (y: number) => this.skillPage(k, y),
        })).sort((a, b) => a.name.localeCompare(b.name));
        const extended = EXTENDED.map((name, k) => ({
            key: `${EXT + k}`, group: "Extended skills", name, sub: "Learned, then trained",
            icon: skillsIcon(), page: (y: number) => this.skillPage(EXT + k, y),
        })).sort((a, b) => a.name.localeCompare(b.name));
        return [...core, ...extended];
    }

    private heroInfo(): Entry[] {
        const jobs = JOBS.map((j, k) => ({
            key: `j${k}`, group: "Jobs", name: j.name, sub: `${j.role}: ${j.skills.map((s) => SKILL_NAMES[s]).join(", ")}`,
            icon: heroesIcon(), page: (y: number) => this.jobPage(k, y),
        }));
        const traits = Object.entries(TRAITS).map(([id, t]) => ({
            key: `t${id}`, group: "Traits", name: t.name, sub: t.text,
            icon: taskIcon("misc"), page: (y: number) => this.traitPage(id, y),
        }));
        const stats = STAT_NAMES.map((name, k) => ({
            key: `s${k}`, group: "Stats", name, sub: `${STAT_SHORT[k]}: ${SKILL_STAT.filter((s) => s == k).length} skills lean on it`,
            icon: taskIcon("other"), page: (y: number) => this.statPage(k, y),
        }));
        const guides = [{
            key: "gpower", group: "Guides", name: "Power", sub: "How a hero's power is worked out",
            icon: skillIcon(Skill.FIGHTING), page: (y: number) => this.powerPage(y),
        }];
        return [...guides, ...jobs, ...traits, ...stats];
    }

    private events(): Entry[] {
        const kinds = EVENT_KINDS.map((d) => ({
            key: `k${d.kind}`, group: "Kinds of event", name: d.name, sub: d.boonText,
            icon: taskIcon("events"), page: (y: number) => this.eventPage(d.kind, y),
        }));
        const bosses = BOSSES.map((b) => ({
            key: `b${b.id}`, group: "World bosses", name: b.name, sub: `A great ${ENEMIES[b.e]?.name.toLowerCase()}, at ${b.in.map(kindName).join(", ").toLowerCase()}`,
            icon: enemyTexture(b.e), scale: 0.5, page: (y: number) => this.bossPage(b.id, y),
        }));
        return [...kinds, ...bosses];
    }

    //#endregion

    //#region the pages

    private placePage(p: WorldPlace, y: number) {
        const kind = kindOf(p), parent = this.right.content;
        y = this.top(placeTexture(p), 1, placeName(p), `${kindName(kind)} (${placeSort(p) == 0 ? "Town" : placeSort(p) == 1 ? "Dungeon" : placeSort(p) == 2 ? "Gathering place" : "Road stop"})`, y);
        y = this.para(`${levelsOf(kind)} floors deep, each more dangerous than the last.${isTown(p) ? " There's work, a workshop and hiring here." : ""}${isDungeon(p) ? " It can be explored for gold and finds." : ""}`, y);
        y = this.action("Open", y, `${placeName(p)} in depth, the map to it`, () => openPlace(p));

        const found = materialsAt(kind, levelsOf(kind));
        y = this.section(`Materials (${found.length})`, y);
        y = found.length ? this.itemGrid(found.map((m) => m.id), y, (id) => `${itemName(id)}: from floor ${materialOf(id).level}, by ${SKILL_NAMES[gatherSkill(id)]}`) : this.none("nothing to gather", y);

        if (isDungeon(p)) {
            const met = enemiesAt(kind, levelsOf(kind), true);
            y = this.section(`Beasts met here (${met.length})`, y);
            y = this.grid(met.map((e) => ({ tex: enemyTexture(e.id), scale: 0.5, more: `${e.name}${e.night ? ", at night" : ""}${e.from ? `, from floor ${e.from}` : ""} (click for more)`, tap: () => this.pick(Tab.BEASTS, `${e.id}`) })), y);
        }
        return this.eventsOn((e) => e.p == p.i, y);
    }

    private itemPage(id: number, y: number) {
        const recipe = recipeOf(id), m = materialOf(id);
        const sort = recipe ? `${title(recipe.type)}, by ${SKILL_NAMES[recipe.skill]} ${craftLevel(id)}` : `${title(m.type)}, by ${SKILL_NAMES[gatherSkill(id)]} ${gatherLevel(id)}`;
        y = this.top(itemTexture(id), 2, itemName(id), `${sort}, tier ${itemTier(id)}`, y);
        const have = IBC.data.inventory.items.get(id)?.amount ?? 0;
        y = this.lineOf(`You have ${have}`, y, have ? AP.LIME : AP.IRON);
        if (itemWorth(id)) y = this.lineOf(`Worth: ${itemWorth(id)}`, y, AP.SAND);
        y = this.action("Open", y, `${itemName(id)} in depth: making it, finding it, who can`, () => ItemInfo.open(id));

        if (recipe) {
            y = this.section("Made from", y);
            y = this.itemGrid(recipe.needs.map(([n]) => n), y, (n) => `${itemName(n)}: takes ${recipe.needs.find(([k]) => k == n)[1]}`);
        }
        if (m) {
            y = this.section("Found at", y);
            for (const kind of m.at) {
                const places = Array.from(IBC.data.heroes.places.values()).filter((p) => kindOf(p) == kind);
                y = this.lineOf(`${kindName(kind)}, from floor ${m.level}`, y, AP.WHITE);
                y = places.length ? this.placeLinks(places, y) : this.none("none on the map", y);
            }
        }
        const uses = RECIPES.filter((r) => r.needs.some(([n]) => n == id));
        y = this.section(`Used in (${uses.length})`, y);
        return uses.length ? this.itemGrid(uses.map((r) => r.id), y) : this.none("nothing yet", y);
    }

    private beastPage(e: EnemyDef, y: number) {
        y = this.top(enemyTexture(e.id), 1, e.name, `A beast${e.night ? " of the night" : ""}, met ${e.from ? `from floor ${e.from}` : "from the first floor"} down`, y);
        if (e.night) {
            y = this.para(`It only comes out at night, when fights are ${Math.round((NIGHT_DANGER - 1) * 100)}% harder and come ${NIGHT_ROAD}x as often on the road. Beaten, it leaves something behind ${Math.round(NIGHT_DROP * 100)}% of the time, whatever floor it's met on.`, y);
            y = this.section("It may leave", y);
            y = this.itemGrid(e.drops ?? [], y);
        }
        y = this.section("How it fights", y);
        ["Health", "Attack", "Defence", "Speed"].forEach((name, k) => { y = this.bar(name, e.m[k], y); });

        const dungeons = e.in.filter((w) => !w.startsWith("road:")), roads = e.in.filter((w) => w.startsWith("road:")).map((w) => w.slice(5));
        y = this.section("Met at", y);
        for (const kind of dungeons) {
            y = this.lineOf(kindName(kind), y, AP.WHITE);
            const places = Array.from(IBC.data.heroes.places.values()).filter((p) => kindOf(p) == kind);
            y = places.length ? this.placeLinks(places, y) : this.none("none on the map", y);
        }
        if (roads.length) y = this.lineOf(`On the road through ${roads.join(", ")}`, y, AP.WHITE);
        const bosses = BOSSES.filter((b) => b.e == e.id);
        if (bosses.length) {
            y = this.section("World bosses like it", y);
            for (const b of bosses) y = this.link(b.name, y, "A world boss (click for more)", () => this.pick(Tab.EVENTS, `b${b.id}`));
        }
        return y;
    }

    private skillPage(id: number, y: number) {
        const extended = id >= EXT, name = extended ? EXTENDED[id - EXT] : SKILL_NAMES[id];
        y = this.top(extended ? skillsIcon() : skillIcon(id), 2, name, extended ? "An extended skill" : `A core skill, leaning on ${STAT_NAMES[SKILL_STAT[id]]}`, y);
        if (extended) {
            if (name == "Leadership") y = this.para("Only a party's leader learns and trains it, working with others beside them. Everyone in the party works quicker as it goes up.", y);
            else y = this.para("No hero starts out knowing it. Any hero can learn it, at an academy or out in the wild (now and then, doing related work, or doing well at a moment on the road); then it goes from level 1 to 100 like the core skills. Extended skills open things: a way through a moment on the road, an event's choice, a site's special action.", y);
            // (moments on the road: shared/Choices.ts)
            const ways = MOMENTS.flatMap((m) => m.o.filter((w) => w.skill == name).map((w) => `${m.n}: ${w.n}`));
            const taught = MOMENTS.flatMap((m) => m.o.filter((w) => w.learns == name).map((w) => `${m.n}: ${w.n}`));
            y = this.section("Opens on the road", y);
            if (!ways.length) y = this.none("nothing yet", y);
            for (const w of ways) y = this.para(w, y);
            if (taught.length) {
                y = this.section("Picked up doing well at", y);
                for (const w of taught) y = this.para(w, y);
            }
        } else {
            y = this.para(SKILL_ABOUT[id], y);
            const jobs = JOBS.map((j, k) => ({ j, k })).filter(({ j }) => j.skills.includes(id));
            y = this.section("Favoured by", y);
            if (!jobs.length) y = this.none("no job", y);
            for (const { j, k } of jobs) y = this.link(`${j.name} (${j.role})`, y, `${j.name}s work it x1.1 and learn it 25% faster (click for more)`, () => this.pick(Tab.HEROES, `j${k}`));
            const tool = Object.keys(TOOL_SKILL).find((t) => TOOL_SKILL[t] == id);
            if (tool) {
                const tools = RECIPES.filter((r) => r.type == tool).map((r) => r.id);
                y = this.section("Its tools", y);
                y = this.itemGrid(tools, y);
            }
            const gathered = MATERIALS.filter((m) => gatherSkill(m.id) == id).map((m) => m.id);
            if (gathered.length) { y = this.section(`Gathers (${gathered.length})`, y); y = this.itemGrid(gathered, y); }
            const made = RECIPES.filter((r) => r.skill == id).map((r) => r.id);
            if (made.length) { y = this.section(`Makes (${made.length})`, y); y = this.itemGrid(made, y); }
        }
        // your heroes at it
        y = this.section("Your heroes", y);
        const heroes = IBC.data.heroes.heroes;
        if (!heroes.length) return this.none("none yet", y);
        for (const hero of heroes) {
            const h = hero.d, level = extended ? extLevel(h, id - EXT) : h.k[id], special = isSpecialty(h, id);
            const said = `${h.n}: ${level ? `level ${level}` : "not learned"}${special ? ", a specialty (learns it 1.5x as fast)" : ""}`;
            y = this.link(`${h.n}${special ? " *" : ""}  ${level ? `lv ${level}` : "-"}`, y, `${said} (click for their status)`, () => HeroStatus.open(hero.id));
        }
        return y;
    }

    private jobPage(k: number, y: number) {
        const j = JOBS[k];
        y = this.top(heroesIcon(), 2, j.name, `Fights as: ${j.role}`, y);
        y = this.para(`${j.does}.`, y);
        y = this.para("A hero's job is rolled as they're hired. They work their job's three skills 10% quicker and learn them 25% faster.", y);
        y = this.section("Favoured skills", y);
        for (const s of j.skills) y = this.link(SKILL_NAMES[s], y, `${SKILL_NAMES[s]} (click for more)`, () => this.pick(Tab.SKILLS, `${s}`));
        return this.yourHeroes((h) => h.j == k, y);
    }

    private traitPage(id: string, y: number) {
        const t = TRAITS[id];
        y = this.top(taskIcon("misc"), 2, t.name, t.worth > 0 ? "A good trait" : t.worth < 0 ? "A bad trait" : "A mixed trait", y);
        y = this.para(`${t.text}.${t.rare ? " Rare: seldom seen on the hiring board." : ""}`, y);
        if (t.stats) y = this.lineOf(t.stats.map((n, k) => n ? `${n > 0 ? "+" : ""}${n} ${STAT_SHORT[k]}` : "").filter((s) => s).join(", "), y, AP.SAND);
        return this.yourHeroes((h) => h.t.includes(id), y);
    }

    // how power is worked out (a player asked, 2026-11-07), its numbers the game's own
    // (shared/Locations.ts heroPower, Tasks.ts gearPower, Fights.ts heroAttack...)
    private powerPage(y: number) {
        const fighters = JOBS.filter((j) => j.skills.includes(Skill.FIGHTING)).map((j) => `${j.name}s`).join(" and ");
        y = this.top(skillIcon(Skill.FIGHTING), 2, "Power", "How strong a hero is in a fight", y);
        y = this.para("A party's power is its heroes' added together. It decides how deep the party can go, and how its fights go.", y);
        y = this.section("A hero's own power", y);
        y = this.lineOf(`Starts at ${DANGER}, multiplied by:`, y, AP.WHITE);
        y = this.lineOf("Fighting: +3% a level over 1", y, AP.MIST);
        y = this.lineOf("Avg of STR, AGI, VIT: +2% a point over 10", y, AP.MIST);
        y = this.lineOf(`Job: x1.1 for ${fighters}`, y, AP.MIST);
        y = this.para("Rings and amulets count, by the stats they add.", y);
        y = this.section("Gear adds", y);
        y = this.lineOf("Each piece is a share of a full set:", y, AP.WHITE);
        y = this.lineOf("Weapon 3/10, two-handed 5/10", y, AP.MIST);
        y = this.lineOf("Body armour, shield: 2/10 each", y, AP.MIST);
        y = this.lineOf("Helm, gloves, boots: 1/10 each", y, AP.MIST);
        y = this.lineOf("A full set adds, by tier (1-6):", y, AP.WHITE);
        y = this.lineOf([1, 2, 3, 4, 5, 6].map((t) => `+${Math.round(danger(t) / 2)}`).join("  "), y, AP.SAND);
        y = this.lineOf(QUALITY_NAMES.slice(1).map((q, k) => `${q} x${QUALITY_MUL[k + 1]}`).join(", "), y, AP.SAND);
        y = this.section("How deep it goes", y);
        y = this.lineOf("Party power each floor needs:", y, AP.WHITE);
        y = this.lineOf([1, 3, 5, 8, 12].map((f) => `${f}: ${Math.round(danger(f))}`).join("   "), y, AP.SAND);
        y = this.section("In a fight", y);
        y = this.lineOf("Attack: half own power + weapon", y, AP.MIST);
        y = this.lineOf("Defence: half own power + other gear", y, AP.MIST);
        y = this.lineOf(`Health: ${HP_A_POWER} x (own power + other gear)`, y, AP.MIST);
        y = this.para("Rangers hit 10% harder, Warriors defend 25% better, an Artisan's gear counts 25% more. Vitality adds 2% health a point over 10. Some traits change these too.", y);
        y = this.section("Your heroes", y);
        const heroes = IBC.data.heroes.heroes;
        if (!heroes.length) return this.none("none yet", y);
        for (const hero of heroes) {
            const h = hero.d, all = Math.round(heroPower(h)), gear = Math.round(wornPower(h));
            y = this.link(`${h.n}  ${all} (${all - gear} own + ${gear} gear)`, y, `${h.n}: power ${all} (click for their status)`, () => HeroStatus.open(hero.id));
        }
        return y;
    }

    private statPage(k: number, y: number) {
        y = this.top(taskIcon("other"), 2, STAT_NAMES[k], STAT_SHORT[k], y);
        y = this.para(`Rolled as a hero's hired, about 10. Each point over 10 makes the skills leaning on it 2% quicker${k == 0 || k == 1 || k == 3 ? ", and adds to their power in a fight" : ""}. Jewellery adds to it.`, y);
        y = this.section("Skills leaning on it", y);
        SKILL_STAT.forEach((s, skill) => { if (s == k) y = this.link(SKILL_NAMES[skill], y, `${SKILL_NAMES[skill]} (click for more)`, () => this.pick(Tab.SKILLS, `${skill}`)); });
        return y;
    }

    private eventPage(kind: EventKind, y: number) {
        const d = EVENT_KINDS.find((d) => d.kind == kind);
        y = this.top(taskIcon("events"), 2, d.name, `${d.hours} hours to meet its goal`, y);
        y = this.para("Starts on its own at a place now and then. Heroes take part by going there and working; everyone who gave gets gold by their share, the top three a rare find, and the place a boon for a day.", y);
        y = this.lineOf(`Its boon: ${d.boonText}`, y, AP.SAND);
        if (growsTown(kind)) y = this.lineOf("Won, the town also grows for good", y, AP.SAND);
        y = this.section("Comes to", y);
        y = this.para(d.kinds.length ? d.kinds.map(kindName).join(", ") : "Gathering places: mines, camps, farms, oases, altars, great trees", y);
        y = this.section(d.stages ? "Its stages" : "Worked with", y);
        if (d.stages) for (const s of d.stages) y = this.link(`${s.name}: ${SKILL_NAMES[s.skill]}`, y, `${SKILL_NAMES[s.skill]} (click for more)`, () => this.pick(Tab.SKILLS, `${s.skill}`));
        else if (d.skills) for (const s of d.skills) y = this.link(SKILL_NAMES[s], y, `${SKILL_NAMES[s]} (click for more)`, () => this.pick(Tab.SKILLS, `${s}`));
        else y = this.para("The place's own gathering skill", y);
        if (kind == EventKind.BOSS) {
            y = this.section("The bosses", y);
            for (const b of BOSSES) y = this.link(b.name, y, "A world boss (click for more)", () => this.pick(Tab.EVENTS, `b${b.id}`));
        }
        return this.eventsOn((e) => e.k == kind, y);
    }

    private bossPage(id: number, y: number) {
        const b = BOSSES.find((b) => b.id == id), e = ENEMIES[b.e];
        y = this.top(enemyTexture(b.e), 1, b.name, "A world boss", y);
        y = this.para("Comes to a dungeon as a world boss event. Every hero there fights it in bouts, its health shared; won, the dungeon finds twice as much for a day.", y);
        y = this.link(`Looks like a great ${e.name.toLowerCase()}`, y, `${e.name} (click for more)`, () => this.pick(Tab.BEASTS, `${e.id}`));
        y = this.section("Comes to", y);
        for (const kind of b.in) {
            y = this.lineOf(kindName(kind), y, AP.WHITE);
            const places = Array.from(IBC.data.heroes.places.values()).filter((p) => kindOf(p) == kind);
            y = places.length ? this.placeLinks(places, y) : this.none("none on the map", y);
        }
        return this.eventsOn((ev) => ev.k == EventKind.BOSS && ev.b == id, y);
    }

    // the events on now that `which`, each opening its window
    private eventsOn(which: (e: { k: EventKind; p: number; b?: number }) => boolean, y: number) {
        const on = IBC.data.events.list.filter((e) => isLive(e, Date.now()) && which(e));
        if (!on.length) return y;
        y = this.section("On now", y);
        for (const e of on) y = this.link(`${eventTitle(e)} at ${IBC.data.heroes.nameOf(e.p)}`, y, "Click for the event", () => EventInfo.open(e.i));
        return y;
    }

    // your heroes `who`, each opening their status
    private yourHeroes(who: (h: { j: number; t: string[] }) => boolean, y: number) {
        const heroes = IBC.data.heroes.heroes.filter((h) => who(h.d));
        y = this.section(`Your heroes (${heroes.length})`, y);
        if (!heroes.length) return this.none("none", y);
        for (const hero of heroes) y = this.link(hero.d.n, y, `${hero.d.n} (click for their status)`, () => HeroStatus.open(hero.id));
        return y;
    }

    //#endregion

    //#region bits of a page

    // its picture in a frame, its name and what it is
    private top(tex: PIXI.Texture, scale: number, name: string, what: string, y: number) {
        const parent = this.right.content, F = 40, w = Encyclopedia.RIGHT_W - 8;
        parent.addChild(new PIXI.Graphics()
            .beginFill(AP.BLACK).drawRect(0, y, F, F).endFill()
            .beginFill(AP.SLATE).drawRect(1, y + 1, F - 2, F - 2).endFill());
        const sprite = new PIXI.Sprite(tex);
        sprite.anchor.set(0.5);
        sprite.scale.set(scale);
        sprite.position.set(F / 2, y + F / 2);
        parent.addChild(sprite);
        fit(text(name, F + 6, y + 10, AP.WHITE, parent), w - F - 6);
        fit(text(what, F + 6, y + 21, AP.ICE, parent), w - F - 6);
        return y + F + 5;
    }

    private section(name: string, y: number) {
        heading(name, 0, y + 3, Encyclopedia.RIGHT_W - 4, this.right.content);
        return y + 14;
    }

    private lineOf(said: string, y: number, tint: number) {
        fit(text(said, 4, y, tint, this.right.content), Encyclopedia.RIGHT_W - 16);
        return y + Encyclopedia.LINE;
    }

    private none(said: string, y: number) {
        return this.lineOf(said, y, AP.IRON);
    }

    // words wrapped to the page
    private para(said: string, y: number) {
        const most = Encyclopedia.RIGHT_W - 16;
        let line = "";
        for (const word of said.split(" ")) {
            const next = line ? `${line} ${word}` : word;
            if (textWidth(next) > most && line) { y = this.lineOf(line, y, AP.MIST); line = word; }
            else line = next;
        }
        if (line) y = this.lineOf(line, y, AP.MIST);
        return y + 3;
    }

    // a line that's clicked
    private link(said: string, y: number, more: string, tap: () => void) {
        const t = fit(text(said, 4, y, AP.FOAM, this.right.content), Encyclopedia.RIGHT_W - 16);
        t.eventMode = "static";
        this.hot(t, new PIXI.Rectangle(-1, -1, Math.ceil(t.textWidth) + 2, 9), more, tap, (lit) => { t.tint = lit ? AP.WHITE : AP.FOAM; });
        return y + Encyclopedia.LINE;
    }

    // a button opening its own window
    private action(label: string, y: number, more: string, tap: () => void) {
        const b = new PIXI.Container(), w = textWidth(label) + 10;
        b.position.set(4, y);
        const back = new PIXI.Graphics();
        const paint = (lit: boolean) => back.clear()
            .beginFill(AP.BLACK).drawRect(0, 0, w, 12).endFill()
            .beginFill(lit ? AP.GRASS : AP.LEAF).drawRect(1, 1, w - 2, 10).endFill();
        paint(false);
        b.addChild(back);
        text(label, 5, 2, AP.WHITE, b);
        this.hot(b, new PIXI.Rectangle(0, 0, w, 12), more, tap, paint);
        this.right.content.addChild(b);
        return y + 16;
    }

    // how a beast leans: a bar out of twice an even share
    private bar(name: string, n: number, y: number) {
        const parent = this.right.content, x = 50, w = 100;
        text(name, 4, y, AP.STONE, parent);
        parent.addChild(new PIXI.Graphics()
            .beginFill(AP.BLACK).drawRect(x, y, w, 7).endFill()
            .beginFill(n >= 1.2 ? AP.LIME : n <= 0.8 ? AP.FLAME : AP.AMBER).drawRect(x + 1, y + 1, Math.round((w - 2) * Math.min(1, n / 2)), 5).endFill()
            .beginFill(AP.MIST).drawRect(x + w / 2, y, 1, 7).endFill());
        text(`x${n}`, x + w + 4, y, AP.MIST, parent);
        return y + Encyclopedia.LINE;
    }

    // places, each a link to its own page
    private placeLinks(places: WorldPlace[], y: number) {
        return this.grid(places.sort((a, b) => placeName(a).localeCompare(placeName(b)))
            .map((p) => ({ tex: placeTexture(p), scale: 0.5, more: `${placeName(p)} (click to open it)`, tap: () => openPlace(p) })), y);
    }

    // items, each opening its ItemInfo
    private itemGrid(ids: number[], y: number, more: (id: number) => string = itemName) {
        return this.grid(ids.map((id) => ({ tex: itemTexture(id), scale: 1, more: `${more(id)} (click for more)`, tap: () => ItemInfo.open(id) })), y);
    }

    private grid(cells: { tex: PIXI.Texture, scale: number, more: string, tap: () => void }[], y: number) {
        const { CELL, RIGHT_W } = Encyclopedia, across = Math.floor((RIGHT_W - 12) / CELL), parent = this.right.content;
        cells.forEach((c, k) => {
            const cell = new PIXI.Container();
            cell.position.set(4 + (k % across) * CELL, y + Math.floor(k / across) * CELL);
            const back = new PIXI.Graphics();
            const paint = (lit: boolean) => back.clear()
                .beginFill(AP.BLACK).drawRect(0, 0, CELL - 1, CELL - 1).endFill()
                .beginFill(lit ? AP.IRON : AP.SLATE).drawRect(1, 1, CELL - 3, CELL - 3).endFill();
            paint(false);
            cell.addChild(back);
            const sprite = new PIXI.Sprite(c.tex);
            sprite.anchor.set(0.5);
            sprite.scale.set(c.scale);
            sprite.position.set((CELL - 1) / 2, (CELL - 1) / 2);
            cell.addChild(sprite);
            this.hot(cell, new PIXI.Rectangle(0, 0, CELL - 1, CELL - 1), c.more, c.tap, paint);
            parent.addChild(cell);
        });
        return y + Math.ceil(cells.length / across) * CELL + 3;
    }

    // something pointed at (saying more along the bottom, lit) and clicked
    private hot(c: PIXI.Container, hit: PIXI.Rectangle, more: string, tap: () => void, paint: (lit: boolean) => void) {
        c.eventMode = "static";
        c.cursor = "pointer";
        c.hitArea = hit;
        c.on("pointerover", () => { paint(true); this.say(more); });
        c.on("pointerout", () => { paint(false); this.say(""); });
        c.on("pointertap", tap);
    }

    //#endregion

}

// what each core skill does, by Skill
const SKILL_ABOUT = [
    "Gathers ore, stone and gems at mines, caves and the like.",
    "Gathers wood at woodcutters' camps and great trees.",
    "Gathers plants and the like at farms, oases, altars and dark towers.",
    "Fishing: nothing is caught with it yet.",
    "Gathers hides, fangs and scales from beasts at lairs.",
    "Works ore into bars, and makes metal weapons, armour and tools.",
    "Works wood and stone, and makes bows, staves, shields and tools.",
    "Brews potions.",
    "Cooks: an Upgrading event's opening feast is worked with it.",
    "Works hides and cloth, and makes hoods, tunics, gloves and boots.",
    "A hero's power in a fight: how deep a party goes, and how fights on the road and down a dungeon go.",
    "Exploring a dungeon, or looking for adventure, goes quicker.",
    "Makes rings and amulets that add to a stat.",
];

// towns, dungeons, gathering places, the rest (as LocationInfo calls them)
function placeSort(p: WorldPlace) {
    const kind = kindOf(p);
    if (isTown(p)) return 0;
    if (isDungeon(p)) return 1;
    return materialsAt(kind, levelsOf(kind)).length ? 2 : 3;
}

// a place opened, the map to it
function openPlace(p: WorldPlace) {
    LocationInfo.open(p);
    const map = IBC.comp.getFirstByType(ComponentType.MAP) as Map;
    if (map) map.camera.centerOn((p.x + 0.5) * map.world.tile, (p.y + 0.5) * map.world.tile);
}

function madeGroup(type: string) {
    if (type == "material") return "Worked materials";
    if (type == "potion") return "Potions";
    if (type == "food") return "Meals";
    if (type == "ring" || type == "amulet") return "Jewellery";
    if (TOOL_SKILL[type] != null) return "Tools";
    if (["sword", "axe", "mace", "spear", "dagger", "bow", "staff"].includes(type)) return "Weapons";
    return "Armour";
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

// a heading with a rule from it to the end of w
function heading(said: string, x: number, y: number, w: number, parent: PIXI.Container) {
    const t = text(said, x, y, AP.STRAW, parent);
    const from = x + Math.ceil(t.textWidth) + 4;
    parent.addChild(new PIXI.Graphics().beginFill(AP.IRON).drawRect(from, y + 3, x + w - 8 - from, 1).endFill());
}

function clear(c: PIXI.Container) {
    c.removeChildren().forEach((child) => child.destroy({ children: true }));
}
