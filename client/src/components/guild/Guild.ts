import * as PIXI from "pixi.js";
import { Presence } from "../../../../shared/Friends";
import { maskSwearing } from "../../../../shared/ChatFilter";
import {
    canEditNotice, canInvite, canKick, GUILD_COST, GUILD_LEVEL_MOST, GUILD_NAME_LONGEST, GuildMember, guildLevel, isLeader, levelPerk,
    guildCraftMul, hallRoom, takesLeft, levelStartXp, membersMost, MEMBERS_MOST, NOTICE_LONGEST, Rank, RANK_NAMES, TAG_LONGEST, goalText, GOAL_GOLD, GOAL_XP, ALL_GOALS_XP, guildXpMul, guildGoldMul,
} from "../../../../shared/Guilds";
import { DEED_NAMES } from "../../../../shared/Seasons";
import { Event } from "../../constants/Events";
import { AP } from "../../constants/Palette";
import { IBC } from "../../Engine";
import { Panel } from "../../shared/Panel";
import { Hint } from "../../shared/ui/Hint";
import { TextField } from "../../shared/ui/TextField";
import { TitleBar } from "../../shared/ui/titlebar/TitleBar";
import { BaseComponent, ComponentType } from "../BaseComponent";
import { Chat, wrap } from "../chat/Chat";
import { Mail } from "../mail/Mail";
import { itemName } from "../../../../shared/Tasks";
import { itemTexture } from "../inventory/Item";
import { ItemInfo } from "../iteminfo/ItemInfo";
import { text, textWidth } from "../games/GameUI";

// Guilds (shared/Guilds.ts), from the other menu (Guild). In none: founding
// one along the top (a name, a tag, GUILD_COST gold), then the invites to you
// (Join or No) and Find a guild - a search and the guilds it finds, the open
// ones with Join. In one: its tag and name, your rank, whether it's open, its
// notice (Edit, an officer's or the leader's), inviting by name (theirs too),
// the members - signed in, away or last seen, each by rank, with what you may
// do to them (the leader: Promote or Demote, Lead, Remove; an officer: Remove
// a member; Msg a friend) - and the invites out (Cancel); along the bottom
// Leave, and the leader's Open / Invite only and Close guild, each asked
// again first. The wheel scrolls the list. A window like the others (Panel
// and TitleBar); Escape or its cross closes it.
// In one, the list starts with the guild's level (a bar to the next, what it
// gives) and this week's goals (shared/Guilds.ts; the user, 2026-10-30): each
// a bar of how far the guild's got, and how much of it was yours.

type Confirm = { what: "kick" | "lead" | "leave" | "close"; id?: number } | null;

const RANK_TINTS = [AP.ASH, AP.SKY, AP.STRAW];

export class Guild extends BaseComponent {

    public static SCALE = 2;
    public static W = 250;              // the content, in its own px
    public static H = 240;
    public static LINE = 11;
    public static TOP_NONE = 50;        // the list's top, in no guild (under founding and the search)
    public static TOP_IN = 88;          // in one (under its notice and inviting)
    public static BAR_H = 13;           // the buttons along the bottom, in one
    public static INSET_X = 12;         // the window round it, in screen px
    public static INSET_Y = 28;
    public static WIDTH = Guild.INSET_X * 2 + Guild.W * Guild.SCALE;
    public static HEIGHT = Guild.INSET_Y + Guild.H * Guild.SCALE + Guild.INSET_X;

    public background: Panel;
    public titleBar: TitleBar;
    private content: PIXI.Container;
    private head: PIXI.Container;       // all above the list
    private list: PIXI.Container;
    private bar: PIXI.Container;
    private mask: PIXI.Graphics;
    private fieldLayer: PIXI.Container;

    private nameField: TextField;
    private tagField: TextField;
    private searchField: TextField;
    private inviteField: TextField;
    private noticeField: TextField;
    private fields: TextField[];

    private said = "";
    private saidTint: number = AP.ASH;
    private scroll = 0;
    private editing = false;            // the notice
    private confirming: Confirm = null;
    private inGuild = -1;               // (the guild drawn for: its id, -1 none)
    private tab: "guild" | "hall" = "guild";
    private dropping = false;           // something from the Inventory dragged over the window
    private putting = 0;                // the item let go over the hall, asking how many

    private keys = (e: KeyboardEvent) => this.onKey(e);
    private paste = (e: ClipboardEvent) => this.fields.find((f) => f.focused)?.paste(e.clipboardData?.getData("text") ?? "");

    constructor() {
        super(ComponentType.GUILD_WINDOW);
        this.create();
    }

    // the window (one open at a time); in no guild, the guilds asked for
    public static open() {
        const view = IBC.comp.getOrCreate(ComponentType.GUILD_WINDOW) as Guild;
        view.bringToTop();
        if (!IBC.data.guilds.guild) IBC.net.guild.browse(view.searchField.value.trim());
        return view;
    }

    // in a guild, the window under a point (for what's dragged from the Inventory)
    public static under(global: PIXI.IPointData) {
        const view = IBC.comp.getFirstByType(ComponentType.GUILD_WINDOW) as Guild;
        return view && IBC.data.guilds.guild && view.container.getBounds().contains(global.x, global.y) ? view : null;
    }

    // something dragged from the Inventory is over the window (or not): its hall
    public dragOver(over: boolean) {
        if (over == this.dropping) return;
        this.dropping = over;
        if (over) this.setTab("hall"); else this.drawList();
    }

    // something from your stash let go over the window: how many to put in?
    public offer(item: number) {
        this.dropping = false;
        this.bringToTop();
        this.putting = item;
        this.setTab("hall");
    }

    private setTab(tab: "guild" | "hall") {
        if (tab != this.tab) this.scroll = 0;
        this.tab = tab;
        if (tab == "hall") IBC.net.guild.hall();
        this.draw();
    }

    public create() {
        super.create();
        const { W, WIDTH, HEIGHT, SCALE } = Guild;
        this.container.eventMode = "static";
        this.container.hitArea = new PIXI.Rectangle(0, 0, WIDTH, HEIGHT);
        this.container.on("pointerdown", (e: PIXI.FederatedPointerEvent) => { e.stopPropagation(); this.unfocus(); });
        this.container.on("wheel", (e: PIXI.FederatedWheelEvent) => {
            e.stopPropagation();
            this.scroll += e.deltaY < 0 ? -Guild.LINE * 2 : Guild.LINE * 2;
            this.drawList();
        });

        this.background = new Panel(this.container);
        this.background.setSize(WIDTH, HEIGHT);
        this.titleBar = new TitleBar(this);
        this.titleBar.setPosition(4, 4);
        this.titleBar.setSize(WIDTH - 8, 20);
        this.titleBar.setTitle("Guild");

        this.content = new PIXI.Container();
        this.content.scale.set(SCALE);
        this.content.position.set(Guild.INSET_X, Guild.INSET_Y);
        this.container.addChild(this.content);
        this.head = new PIXI.Container();
        this.list = new PIXI.Container();
        this.bar = new PIXI.Container();
        this.mask = new PIXI.Graphics();
        this.list.mask = this.mask;
        this.fieldLayer = new PIXI.Container();
        this.content.addChild(this.mask, this.head, this.list, this.bar, this.fieldLayer);

        const focus = () => this.unfocus();
        this.nameField = new TextField(116, { max: GUILD_NAME_LONGEST, hint: "its name", onFocus: focus, onEnter: () => this.foundIt() });
        this.tagField = new TextField(32, { max: TAG_LONGEST, hint: "TAG", upper: true, onFocus: focus, onEnter: () => this.foundIt() });
        this.searchField = new TextField(W - 66, { max: GUILD_NAME_LONGEST, hint: "a guild's name or tag, then Enter", onFocus: focus, onEnter: (q) => IBC.net.guild.browse(q) });
        this.inviteField = new TextField(W - 70, {
            max: 64, hint: "a player's name, then Enter", onFocus: focus,
            onEnter: (name) => { if (name) IBC.net.guild.invite(name); this.inviteField.set(""); this.unfocus(); },
        });
        this.noticeField = new TextField(W - 52, { max: NOTICE_LONGEST, hint: "what your guild should know", onFocus: focus, onEnter: () => this.saveNotice() });
        this.fields = [this.nameField, this.tagField, this.searchField, this.inviteField, this.noticeField];
        for (const f of this.fields) this.fieldLayer.addChild(f.container);

        window.addEventListener("keydown", this.keys, true);     // (first, so the others see it's taken)
        document.addEventListener("paste", this.paste);
        IBC.events.register(Event.GUILD, () => this.draw(), this);
        IBC.events.register(Event.GUILD_LIST, () => this.drawList(), this);
        IBC.events.register(Event.HERO_STASH, () => { if (this.tab == "hall") this.drawList(); }, this);
        IBC.events.register(Event.GUILD_WEEK, () => this.drawList(), this);
        IBC.events.register(Event.FRIEND_LIST, () => this.drawList(), this);
        IBC.events.register(Event.GUILD_RESULT, (r: { text: string, ok: boolean }) => this.say(r.text, r.ok ? AP.LIME : AP.FLAME), this);
        IBC.events.register(Event.INVENTORY_GOLD_UPDATED, () => this.drawHead(), this);
        IBC.events.register(Event.MAP_POINTER_DOWN, () => this.unfocus(), this);
        IBC.events.register(Event.CHAT_TYPING, (on: boolean) => { if (on) this.unfocus(); }, this);
        IBC.events.register(Event.CHAT_FILTER, () => this.drawHead(), this);

        this.setPosition(Math.round((window.innerWidth - WIDTH) / 2), Math.round((window.innerHeight - HEIGHT) / 2));
        this.draw();
    }

    public destroy() {
        super.destroy();
        window.removeEventListener("keydown", this.keys, true);
        document.removeEventListener("paste", this.paste);
        for (const f of this.fields) f.destroy();
        this.titleBar.destroy();
        this.background.destroy();
        this.container.destroy({ children: true });
    }

    public update(deltaTime: number) {
        for (const f of this.fields) f.update(deltaTime);
    }

    //#region keys

    private unfocus(but?: TextField) {
        for (const f of this.fields) if (f != but) f.setFocused(false);
    }

    private onKey(e: KeyboardEvent) {
        if (e.ctrlKey || e.metaKey || e.altKey) return;
        const field = this.fields.find((f) => f.focused && f.container.visible);
        if (!field) {
            if (e.key == "Escape" && !Chat.takes(e)) IBC.comp.destroy(this);
            return;
        }
        (e as any).chat = true;
        e.preventDefault();
        if (e.key == "Tab" && (field == this.nameField || field == this.tagField)) {
            const next = field == this.nameField ? this.tagField : this.nameField;
            field.setFocused(false);
            next.setFocused(true);
            return;
        }
        if (e.key == "Escape" && field == this.noticeField) { this.editing = false; this.draw(); return; }
        Chat.stop();
        field.key(e);
    }

    //#endregion

    //#region doing things

    private foundIt() {
        const name = this.nameField.value.trim(), tag = this.tagField.value.trim();
        if (!name) return this.say("Give your guild a name", AP.FLAME);
        if (!tag) return this.say("Give your guild a tag (2 to 4 letters)", AP.FLAME);
        if (IBC.data.inventory.gold < GUILD_COST) return this.say(`Founding a guild costs ${GUILD_COST}g`, AP.FLAME);
        IBC.net.guild.found(name, tag);
        this.unfocus();
    }

    private saveNotice() {
        IBC.net.guild.notice(this.noticeField.value.trim());
        this.editing = false;
        this.unfocus();
        this.draw();
    }

    private say(said: string, tint: number) {
        this.said = said;
        this.saidTint = tint;
        this.drawHead();
    }

    private confirm(c: Confirm) {
        this.confirming = c;
        this.drawList();
        this.drawBar();
    }

    //#endregion

    //#region drawing

    private draw() {
        const guild = IBC.data.guilds.guild, id = guild?.i ?? -1;
        if (id != this.inGuild) {
            // (into or out of one: a fresh start)
            if (this.inGuild >= 0 && id < 0) IBC.net.guild.browse(this.searchField.value.trim());
            this.inGuild = id;
            this.scroll = 0;
            this.editing = false;
            this.confirming = null;
            this.tab = "guild";
            this.putting = 0;
            this.unfocus();
        }
        this.drawHead();
        this.drawList();
        this.drawBar();
    }

    private top() {
        return IBC.data.guilds.guild ? Guild.TOP_IN : Guild.TOP_NONE;
    }

    private bottom() {
        return IBC.data.guilds.guild ? Guild.H - Guild.BAR_H : Guild.H;
    }

    private clear(c: PIXI.Container) {
        c.removeChildren().forEach((x) => x.destroy({ children: true }));
    }

    private place(f: TextField, x: number, y: number, shown: boolean) {
        f.container.visible = shown;
        f.container.position.set(x, y);
    }

    private drawHead() {
        const { W } = Guild, guild = IBC.data.guilds.guild;
        this.clear(this.head);
        for (const f of this.fields) this.place(f, 0, 0, false);
        if (!guild) {
            text("FOUND A GUILD", 0, 0, AP.STONE, this.head);
            const cost = text(`costs ${GUILD_COST}g`, 0, 0, IBC.data.inventory.gold >= GUILD_COST ? AP.STRAW : AP.FLAME, this.head);
            cost.x = W - Math.ceil(cost.textWidth);
            // Name [....] Tag [..] Found, the name taking what room is left
            const nameX = textWidth("Name") + 4, foundX = W - textWidth("Found") - 6, tagW = 34;
            const tagX = foundX - 6 - tagW, tagLabelX = tagX - 4 - textWidth("Tag");
            text("Name", 0, 13, AP.ASH, this.head);
            this.nameField.resize(tagLabelX - 6 - nameX);
            this.place(this.nameField, nameX, 11, true);
            text("Tag", tagLabelX, 13, AP.ASH, this.head);
            this.tagField.resize(tagW);
            this.place(this.tagField, tagX, 11, true);
            this.button("Found", foundX, 12, this.head, () => this.foundIt());
            if (this.said) text(this.said, 0, 24, this.saidTint, this.head);
            const findX = textWidth("Find") + 4, searchX = W - textWidth("Search") - 6;
            text("Find", 0, 38, AP.ASH, this.head);
            this.searchField.resize(searchX - 6 - findX);
            this.place(this.searchField, findX, 36, true);
            this.button("Search", searchX, 37, this.head, () => IBC.net.guild.browse(this.searchField.value.trim()));
        } else {
            const me = IBC.data.guilds.rankOf(IBC.data.player.id) as Rank;
            const tag = text(`[${guild.t}]`, 0, 0, AP.STRAW, this.head);
            text(guild.n, Math.ceil(tag.textWidth) + 4, 0, AP.WHITE, this.head);
            const count = text(`${guild.l.length}/${membersMost(guildLevel(guild.x ?? 0))} members`, 0, 0, AP.STONE, this.head);
            count.x = W - Math.ceil(count.textWidth);
            const founded = new Date(guild.c).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
            const you = text(`You: ${RANK_NAMES[me]}`, 0, 10, RANK_TINTS[me], this.head);
            text(guild.o ? "- open to all" : "- by invite only", Math.ceil(you.textWidth) + 4, 10, AP.STONE, this.head);
            const since = text(`founded ${founded}`, 0, 10, AP.IRON, this.head);
            since.x = W - Math.ceil(since.textWidth);

            // the notice, or editing it
            const noticeY = 22, box = new PIXI.Graphics();
            box.beginFill(AP.BLACK).drawRect(0, noticeY, W, 29).endFill().beginFill(AP.SHADOW).drawRect(1, noticeY + 1, W - 2, 27).endFill();
            this.head.addChild(box);
            if (this.editing) {
                this.noticeField.resize(W - textWidth("Cancel") - 18);
                this.place(this.noticeField, 3, noticeY + 3, true);
                this.button("Save", W - textWidth("Save") - 9, noticeY + 4, this.head, () => this.saveNotice());
                this.button("Cancel", W - textWidth("Cancel") - 9, noticeY + 16, this.head, () => { this.editing = false; this.unfocus(); this.draw(); });
                text("Enter to save, Escape to leave it", 4, noticeY + 17, AP.IRON, this.head);
            } else {
                const notice = IBC.data.chat.hideSwearing ? maskSwearing(guild.m) : guild.m, room = W - (canEditNotice(me) ? 34 : 8);
                const lines = guild.m ? wrap(notice, room, room, (s) => textWidth(s)).slice(0, 3) : [];
                if (!lines.length) text(canEditNotice(me) ? "No notice yet" : "No notice", 4, noticeY + 3, AP.IRON, this.head);
                lines.forEach((l, k) => text(l, 4, noticeY + 3 + k * 8, AP.SAND, this.head));
                if (canEditNotice(me)) this.button("Edit", W - textWidth("Edit") - 9, noticeY + 3, this.head, () => {
                    this.editing = true;
                    this.noticeField.set(guild.m);
                    this.draw();
                    this.unfocus(this.noticeField);
                    this.noticeField.setFocused(true);
                });
            }

            if (canInvite(me)) {
                const inviteX = textWidth("Invite") + 4, free = membersMost(guildLevel(guild.x ?? 0)) - guild.l.length;
                text("Invite", 0, 56, AP.ASH, this.head);
                const room = text(free ? `${free} free` : "full", 0, 56, free ? AP.STONE : AP.FLAME, this.head);
                room.x = W - Math.ceil(room.textWidth);
                this.inviteField.resize(room.x - 6 - inviteX);
                this.place(this.inviteField, inviteX, 54, true);
            }
            if (this.said) text(this.said, 0, canInvite(me) ? 66 : 56, this.saidTint, this.head);
            const gx = this.button("Guild", 0, 77, this.head, () => this.setTab("guild"), this.tab == "guild");
            this.button("Hall", gx + 2, 77, this.head, () => this.setTab("hall"), this.tab == "hall");
        }
        for (const f of this.fields) if (!f.container.visible) f.setFocused(false);
        this.mask.clear().beginFill(0xffffff).drawRect(0, this.top(), W, this.bottom() - this.top()).endFill();
    }

    private drawList() {
        const { W, LINE } = Guild, data = IBC.data.guilds, guild = data.guild;
        this.clear(this.list);
        let y = 0;
        const header = (t: string) => { text(t, 0, y + 2, AP.STONE, this.list); y += LINE; };

        if (!guild) {
            if (data.state.i.length) {
                header("INVITES TO YOU");
                for (const inv of data.state.i) {
                    const tag = text(`[${inv.t}]`, 4, y + 2, AP.STRAW, this.list);
                    const name = text(inv.n, 8 + Math.ceil(tag.textWidth), y + 2, AP.WHITE, this.list);
                    text(`${inv.c}/${MEMBERS_MOST}, from ${inv.b}`, 12 + Math.ceil(tag.textWidth + name.textWidth), y + 2, AP.STONE, this.list);
                    this.buttons(y, [["Join", () => IBC.net.guild.answer(inv.g, true)], ["No", () => IBC.net.guild.answer(inv.g, false)]]);
                    y += LINE;
                }
                y += 3;
            }
            header("GUILDS");
            if (!data.found.length) { text("None found: found the first one above!", 4, y + 2, AP.IRON, this.list); y += LINE; }
            for (const row of data.found) {
                const tag = text(`[${row.t}]`, 4, y + 2, AP.STRAW, this.list);
                const name = text(row.n, 8 + Math.ceil(tag.textWidth), y + 2, AP.WHITE, this.list);
                const most = row.m ?? MEMBERS_MOST, full = row.c >= most;
                const about = text(`${row.c}/${most}  ${row.o ? "open" : "invite only"}`, 12 + Math.ceil(tag.textWidth + name.textWidth), y + 2, row.o && !full ? AP.LIME : AP.STONE, this.list);
                about.eventMode = "static";
                Hint.on(about, `Led by ${row.l || "nobody"}`);
                if (row.o && !full) this.buttons(y, [["Join", () => IBC.net.guild.join(row.i)]]);
                y += LINE;
            }
        } else {
            const meId = IBC.data.player.id, me = data.rankOf(meId) as Rank;
            if (this.tab == "hall") {
                y = this.drawHall(y, me);
                const room = this.bottom() - this.top();
                this.scroll = Math.max(0, Math.min(this.scroll, y - room));
                this.list.y = this.top() - this.scroll;
                return;
            }
            y = this.drawGoals(y);
            header("MEMBERS");
            const order = (m: GuildMember) => -m.k * 10 + (2 - m.p);
            for (const m of guild.l.slice().sort((a, b) => order(a) - order(b) || a.n.localeCompare(b.n))) {
                this.memberRow(m, me, m.i == meId, y);
                y += LINE;
            }
            if (guild.v?.length) {
                y += 3;
                header("INVITED");
                for (const s of guild.v) {
                    const name = text(s.n, 4, y + 2, AP.ASH, this.list);
                    text(ago(s.a), 8 + Math.ceil(name.textWidth), y + 2, AP.IRON, this.list);
                    this.buttons(y, [["Cancel", () => IBC.net.guild.uninvite(s.i)]]);
                    y += LINE;
                }
            }
        }

        const top = this.top(), room = this.bottom() - top;
        this.scroll = Math.max(0, Math.min(this.scroll, y - room));
        this.list.y = top - this.scroll;
    }

    // the hall (shared/Guilds.ts): what its level gives, what's in it and who's put in or taken what
    private drawHall(y: number, me: Rank) {
        const { LINE } = Guild, data = IBC.data.guilds, guild = data.guild, hall = data.hall, level = guildLevel(guild.x ?? 0);
        const header = (t: string) => { text(t, 0, y + 2, AP.STONE, this.list); y += LINE; };
        const craft = guildCraftMul(level);
        text(craft > 1 ? `Crafting +${Math.round((craft - 1) * 100)}% for every member's heroes` : "Crafting quickens at guild level 3", 0, y + 2, craft > 1 ? AP.LIME : AP.IRON, this.list);
        y += LINE + 2;

        const things = hall?.i ?? [], room = hallRoom(level), left = takesLeft(me, hall?.y ?? 0);
        header(`STORAGE  ${things.length}/${room}`);
        if (this.putting) {
            const have = IBC.data.inventory.items.get(this.putting)?.amount ?? 0;
            text(`Put in ${itemName(this.putting)}?`, 4, y + 2, AP.STRAW, this.list);
            const put = (n: number) => { IBC.net.guild.put(this.putting, n); this.putting = 0; this.drawList(); };
            const offers: [string, () => void][] = [];
            if (have >= 1) offers.push(["1", () => put(1)]);
            if (have >= 10) offers.push(["10", () => put(10)]);
            if (have > 1) offers.push([`All ${have}`, () => put(have)]);
            offers.push(["Cancel", () => { this.putting = 0; this.drawList(); }]);
            this.buttons(y, offers);
            y += LINE + 1;
        }
        const lit = this.dropping;
        text(lit ? "Let go to put it in the hall" : "Drag things here from your Inventory", 4, y + 2, lit ? AP.LIME : AP.IRON, this.list);
        y += LINE;
        if (left != Infinity) { text(`You can take ${left} more today`, 4, y + 2, AP.ASH, this.list); y += LINE; }
        for (const [id, n] of things) {
            const sprite = new PIXI.Sprite(itemTexture(id));
            sprite.position.set(0, y - 1);
            sprite.eventMode = "static";
            sprite.cursor = "pointer";
            sprite.on("pointertap", () => ItemInfo.open(id));
            this.list.addChild(sprite);
            const row = text(`${itemName(id)}  x${n.toLocaleString("en-US")}`, 18, y + 4, AP.WHITE, this.list);
            row.eventMode = "static";
            Hint.on(row, itemName(id));
            const most = Math.min(n, left), offers: [string, () => void][] = [];
            if (most >= 1) offers.push(["1", () => IBC.net.guild.take(id, 1)]);
            if (most >= 10) offers.push(["10", () => IBC.net.guild.take(id, 10)]);
            if (most > 1) offers.push([most == n ? "All" : `${most}`, () => IBC.net.guild.take(id, most)]);
            this.buttons(y + 3, offers);
            y += 16;
        }
        if (hall?.l.length) {
            y += 3;
            header("LATELY");
            for (const [who, put, id, n, at] of hall.l) {
                text(`${who} ${put ? "put in" : "took"} ${n} ${itemName(id)}, ${ago(at)}`, 4, y + 2, AP.ASH, this.list);
                y += LINE;
            }
        }
        return y;
    }

    // the guild's level and this week's goals, from y; where they end
    private drawGoals(y: number) {
        const { W, LINE } = Guild, guild = IBC.data.guilds.guild, xp = guild.x ?? 0, level = guildLevel(xp);
        const bar = (x: number, by: number, w: number, part: number, tint: number) => {
            const g = new PIXI.Graphics().beginFill(AP.BLACK).drawRect(x, by, w, 5).endFill().beginFill(AP.SHADOW).drawRect(x + 1, by + 1, w - 2, 3).endFill();
            if (part > 0) g.beginFill(tint).drawRect(x + 1, by + 1, Math.max(1, Math.round((w - 2) * Math.min(1, part))), 3).endFill();
            this.list.addChild(g);
        };
        const hinted = (by: number, more: string) => {
            const zone = new PIXI.Container();
            zone.eventMode = "static";
            zone.hitArea = new PIXI.Rectangle(0, by, W, LINE);
            Hint.on(zone, more);
            this.list.addChild(zone);
        };

        // the level: a bar to the next, and what the next gives
        const top = level >= GUILD_LEVEL_MOST, from = levelStartXp(level), to = levelStartXp(level + 1);
        const lv = text(`LEVEL ${level}`, 0, y + 2, AP.STRAW, this.list);
        const next = top ? "the top level" : `${xp - from}/${to - from} XP`;
        const nextText = text(next, 0, y + 2, AP.STONE, this.list);
        nextText.x = W - Math.ceil(nextText.textWidth);
        bar(Math.ceil(lv.textWidth) + 6, y + 4, nextText.x - Math.ceil(lv.textWidth) - 12, top ? 1 : (xp - from) / (to - from), AP.STRAW);
        const now = [guildXpMul(level) > 1 ? `+${Math.round((guildXpMul(level) - 1) * 100)}% XP` : "", guildGoldMul(level) > 1 ? `+${Math.round((guildGoldMul(level) - 1) * 100)}% gold from work` : "", `${membersMost(level)} members`].filter((s) => s);
        hinted(y, `The guild's level ${level}: ${now.join(", ")} for every member's heroes.${top ? "" : ` Level ${level + 1} at ${to} XP: ${levelPerk(level + 1) || "on the way to more"}`}. Goals met give XP`);
        y += LINE;

        // this week's goals
        const w = guild.w;
        if (!w) return y + 3;
        const left = Math.max(0, w.e - Date.now()), days = Math.floor(left / 86400000), hours = Math.floor(left / 3600000) % 24;
        text("THIS WEEK'S GOALS", 0, y + 2, AP.STONE, this.list);
        const ends = text(`${days ? `${days}d ` : ""}${hours}h left`, 0, y + 2, AP.IRON, this.list);
        ends.x = W - Math.ceil(ends.textWidth);
        hinted(y, `The same goals for every guild, new each Monday. Filled by members' heroes doing their usual work. Each met: +${GOAL_XP} guild XP and ${GOAL_GOLD}g to everyone who helped; all three: +${ALL_GOALS_XP} XP more`);
        y += LINE;
        w.g.forEach(([deed, target, done, mine], i) => {
            const met = (w.d & (1 << i)) != 0;
            const label = text(goalText(deed, target), 4, y + 2, met ? AP.LIME : AP.WHITE, this.list);
            const count = text(met ? "Met!" : `${done.toLocaleString("en-US")}/${target.toLocaleString("en-US")}`, 0, y + 2, met ? AP.LIME : AP.ASH, this.list);
            count.x = W - Math.ceil(count.textWidth);
            const barX = Math.max(Math.ceil(label.textWidth) + 10, 118);
            bar(barX, y + 4, count.x - barX - 6, done / target, met ? AP.LIME : AP.SKY);
            hinted(y, `${DEED_NAMES[deed]}: ${done.toLocaleString("en-US")} of ${target.toLocaleString("en-US")}, ${mine.toLocaleString("en-US")} of them yours${met ? ". Met: everyone who helped was paid" : ""}`);
            y += LINE;
        });
        return y + 3;
    }

    // a member: how they are, their rank, and what you may do to them
    private memberRow(m: GuildMember, me: Rank, mine: boolean, y: number) {
        const how = m.p == Presence.ONLINE ? "online" : m.p == Presence.AWAY ? "away, heroes working" : `seen ${ago(m.s)}`;
        const joined = new Date(m.j).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

        // the buttons first, along the right: what's left of the row is theirs
        let room = Guild.W;
        const c = this.confirming, asking = !!c && c.id == m.i && (c.what == "kick" || c.what == "lead");
        if (asking) {
            room = this.buttons(y, [
                [c.what == "kick" ? "Remove" : "Make leader", () => { this.confirming = null; c.what == "kick" ? IBC.net.guild.kick(m.i) : IBC.net.guild.lead(m.i); }],
                ["Keep", () => this.confirm(null)],
            ]);
            // (asked by the row, if their name leaves room)
            const ask = c.what == "kick" ? "Sure?" : "You'll be an officer:", askX = room - textWidth(ask) - 2;
            if (askX > 14 + textWidth(m.n)) {
                text(ask, askX, y + 2, AP.FLAME, this.list);
                room = askX;
            }
        } else if (!mine) {
            const buttons: [string, () => void][] = [["Mail", () => Mail.writeTo(m.n)]];
            if (IBC.data.friends.friend(m.i)) buttons.push(["Msg", () => Chat.whisperTo(m.i)]);
            if (isLeader(me)) {
                buttons.push(m.k == Rank.OFFICER ? ["Demote", () => IBC.net.guild.rank(m.i, Rank.MEMBER)] : ["Promote", () => IBC.net.guild.rank(m.i, Rank.OFFICER)]);
                buttons.push(["Lead", () => this.confirm({ what: "lead", id: m.i })]);
            }
            if (canKick(me, m.k)) buttons.push(["x", () => this.confirm({ what: "kick", id: m.i })]);
            room = this.buttons(y, buttons);
        }

        // how they are, their name and rank, and (if there's room) when they were seen; all of it hovered
        const tint = m.p == Presence.ONLINE ? AP.LIME : m.p == Presence.AWAY ? AP.AMBER : AP.IRON;
        this.list.addChild(new PIXI.Graphics().beginFill(tint).drawRect(0, y + 4, 3, 3).endFill());
        const name = text(m.n, 6, y + 2, mine ? AP.LIME : m.p == Presence.OFFLINE ? AP.ASH : AP.WHITE, this.list);
        let x = 10 + Math.ceil(name.textWidth);
        if (!asking || x + textWidth(RANK_NAMES[m.k]) < room - 2) {
            const rank = text(RANK_NAMES[m.k], x, y + 2, RANK_TINTS[m.k], this.list);
            x += Math.ceil(rank.textWidth) + 4;
        }
        const short = m.p == Presence.AWAY ? "away" : how;
        if (x + textWidth(short) < room - 2) text(short, x, y + 2, AP.IRON, this.list);
        const zone = new PIXI.Container();
        zone.eventMode = "static";
        zone.hitArea = new PIXI.Rectangle(0, y, Math.max(0, room - 2), Guild.LINE);
        Hint.on(zone, `${m.n}, ${RANK_NAMES[m.k].toLowerCase()}: ${how}. Joined ${joined}`);
        this.list.addChild(zone);
    }

    // along the bottom: Leave, and the leader's Open / Invite only and Close guild
    private drawBar() {
        const { W, H, BAR_H } = Guild, guild = IBC.data.guilds.guild;
        this.clear(this.bar);
        if (!guild) return;
        const y = H - BAR_H + 4, me = IBC.data.guilds.rankOf(IBC.data.player.id) as Rank, c = this.confirming;
        this.bar.addChild(new PIXI.Graphics().beginFill(AP.BLACK).drawRect(0, H - BAR_H + 1, W, 1).endFill());
        if (c?.what == "leave" || c?.what == "close") {
            const alone = guild.l.length == 1, next = this.successor(), ask = c.what == "close" ? "Close the guild for good? Everyone's put out of it"
                : alone ? "Leave? You're the last: the guild closes" : isLeader(me) && next ? `Leave? ${next.n} will lead` : "Leave the guild?";
            text(ask, 0, y + 1, AP.FLAME, this.bar);
            let x = W;
            for (const [label, act] of [["No", () => this.confirm(null)], ["Yes", () => {
                this.confirming = null;
                if (c.what == "close") IBC.net.guild.disband(); else IBC.net.guild.leave();
            }]] as [string, () => void][]) {
                x -= textWidth(label) + 8;
                this.button(label, x, y, this.bar, act);
            }
            return;
        }
        this.button("Leave", 0, y, this.bar, () => this.confirm({ what: "leave" }));
        if (!isLeader(me)) return;
        const open = guild.o ? "Make it invite only" : "Open it to all";
        this.button(open, textWidth("Leave") + 10, y, this.bar, () => IBC.net.guild.setOpen(!guild.o));
        this.button("Close guild", W - textWidth("Close guild") - 6, y, this.bar, () => this.confirm({ what: "close" }));
    }

    // who'd lead after you (as the server picks: the longest-serving officer, else member)
    private successor() {
        const guild = IBC.data.guilds.guild, meId = IBC.data.player.id;
        return guild?.l.filter((m) => m.i != meId).sort((a, b) => b.k - a.k || a.j - b.j)[0];
    }

    // buttons along the right of a list row, the last rightmost; where the first starts
    private buttons(y: number, buttons: [string, () => void][]) {
        let x = Guild.W;
        for (const [label, act] of buttons.slice().reverse()) {
            x -= textWidth(label) + 6;
            this.button(label, x, y + 1, this.list, act);
            x -= 2;
        }
        return x;
    }

    // a button at (x, y); its width
    private button(label: string, x: number, y: number, parent: PIXI.Container, act: () => void, on = false) {
        const w = textWidth(label) + 6, b = new PIXI.Container();
        b.position.set(x, y);
        const back = new PIXI.Graphics();
        const paint = (lit: boolean) => back.clear()
            .beginFill(AP.BLACK).drawRect(0, 0, w, 9).endFill()
            .beginFill(lit || on ? AP.IRON : AP.SLATE).drawRect(1, 1, w - 2, 7).endFill();
        paint(false);
        b.addChild(back);
        text(label, 3, 1, AP.WHITE, b);
        b.eventMode = "static";
        b.cursor = "pointer";
        b.hitArea = new PIXI.Rectangle(0, 0, w, 9);
        b.on("pointerover", () => paint(true));
        b.on("pointerout", () => paint(false));
        b.on("pointerdown", (e: PIXI.FederatedPointerEvent) => { e.stopPropagation(); this.unfocus(); });
        b.on("pointertap", act);
        parent.addChild(b);
        return w;
    }

    //#endregion

}

// how long ago, in a word or two
function ago(at: number) {
    const s = Math.max(0, (Date.now() - at) / 1000);
    if (s < 60) return "just now";
    if (s < 3600) return `${Math.floor(s / 60)}m ago`;
    if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
    return `${Math.floor(s / 86400)}d ago`;
}
