import * as PIXI from "pixi.js";
import { JOBS } from "../../../../shared/Heroes";
import { Mate, MateIs, PARTIES_MOST, PARTY_MOST } from "../../../../shared/Parties";
import { HeroState, itemName, TaskKind } from "../../../../shared/Tasks";
import { Event } from "../../constants/Events";
import { AP } from "../../constants/Palette";
import { PartyRow } from "../../data/PartiesData";
import { IBC } from "../../Engine";
import { Panel } from "../../shared/Panel";
import { Hint } from "../../shared/ui/Hint";
import { TitleBar } from "../../shared/ui/titlebar/TitleBar";
import { BaseComponent, ComponentType } from "../BaseComponent";
import { Chat } from "../chat/Chat";
import { text, textWidth } from "../games/GameUI";
import { HeroStatus } from "../herostatus/HeroStatus";
import { TaskPlanner } from "../taskplanner/TaskPlanner";

// Parties (shared/Parties.ts; the user, 2026-11-03: "players should be able
// to build parties and invite characters to their party"), from the main
// menu. Along the top, asking a character by name into a party of yours (Enter
// or Ask; into your first). Then each party you've a hero in (asks to you come
// up on the screen: PartyAskBox): what it's doing (its To Do, a party of
// yours), and who's in it - their job and what they do in a fight, whether
// they're with it, on the way or not about, and for each of yours Leave (back
// to their own list), each of anyone's in yours Kick (sent off) - who you've
// asked (the time they have left; Take back), and Disband; and whether
// it's private or public (its empty spots filled by helpers, listed). Last, a new
// party: your heroes in none picked, Make. A window like the others (Panel and
// TitleBar), its cards lit under the pointer, the wheel or its bar scrolling
// it; Escape or its cross closes it.

export class Parties extends BaseComponent {

    public static SCALE = 2;
    public static W = 240;              // the content, in its own px
    public static H = 250;
    public static TOP = 26;             // the list's top (under asking and what came of it)
    public static LINE = 11;
    public static HEAD = 12;            // a heading to what's under it
    public static ROW_H = 13;           // a one-line card and the gap under it
    public static MATE_H = 25;          // one in a party: their name and job, how they are
    public static LIST_W = Parties.W - 6;   // the cards, the bar right of them
    public static INSET_X = 12;         // the window round it, in screen px
    public static INSET_Y = 28;
    public static WIDTH = Parties.INSET_X * 2 + Parties.W * Parties.SCALE;
    public static HEIGHT = Parties.INSET_Y + Parties.H * Parties.SCALE + Parties.INSET_X;
    public static BLINK_MS = 500;

    public background: Panel;
    public titleBar: TitleBar;
    private content: PIXI.Container;
    private top: PIXI.Container;        // asking, what came of it
    private list: PIXI.Container;

    private typing = false;
    private draft = "";
    private blink = 0;
    private caret: PIXI.Graphics;
    private said = "";
    private saidTint: number = AP.ASH;
    private scroll = 0;                 // px of the list scrolled past
    private listH = 0;
    private bar: PIXI.Graphics;
    private grab: number = null;        // (dragging the bar: how far down the thumb it's held)
    private picked = new Set<number>(); // your heroes picked for a new party
    private disbanding: number = null;  // the party whose Disband was clicked (sure, or keep)
    private askTimes: [PIXI.BitmapText, number][] = [];     // the asks out shown: the time left, when they run out

    private keys = (e: KeyboardEvent) => this.onKey(e);
    private paste = (e: ClipboardEvent) => {
        if (!this.typing) return;
        this.draft = (this.draft + (e.clipboardData?.getData("text") ?? "").replace(/\s+/g, " ")).trim().slice(0, 64);
        this.drawTop();
    };

    constructor() {
        super(ComponentType.PARTIES);
        this.create();
    }

    // the window (one open at a time)
    public static open() {
        const view = IBC.comp.getOrCreate(ComponentType.PARTIES) as Parties;
        view.bringToTop();
        return view;
    }

    public create() {
        super.create();
        const { W, H, WIDTH, HEIGHT, SCALE, TOP } = Parties;
        this.container.eventMode = "static";
        this.container.hitArea = new PIXI.Rectangle(0, 0, WIDTH, HEIGHT);
        this.container.on("pointerdown", (e: PIXI.FederatedPointerEvent) => { e.stopPropagation(); this.setTyping(false); });
        this.container.on("wheel", (e: PIXI.FederatedWheelEvent) => {
            e.stopPropagation();
            this.scroll += e.deltaY < 0 ? -Parties.LINE * 2 : Parties.LINE * 2;
            this.placeList();
        });

        this.background = new Panel(this.container);
        this.background.setSize(WIDTH, HEIGHT);
        this.titleBar = new TitleBar(this);
        this.titleBar.setPosition(4, 4);
        this.titleBar.setSize(WIDTH - 8, 20);
        this.titleBar.setTitle("Parties");

        this.content = new PIXI.Container();
        this.content.scale.set(SCALE);
        this.content.position.set(Parties.INSET_X, Parties.INSET_Y);
        this.container.addChild(this.content);
        this.top = new PIXI.Container();
        this.list = new PIXI.Container();
        const mask = new PIXI.Graphics().beginFill(0xffffff).drawRect(0, TOP, W, H - TOP).endFill();
        this.list.mask = mask;
        this.caret = new PIXI.Graphics().beginFill(AP.WHITE).drawRect(0, 0, 1, 8).endFill();
        this.bar = new PIXI.Graphics();
        this.content.addChild(new PIXI.Graphics().beginFill(AP.INK).drawRect(-4, -2, W + 8, H + 4).endFill());
        this.content.addChild(mask, this.top, this.list, this.bar);
        // the bar dragged by its thumb, or the thumb jumped to where the track's pressed
        this.bar.eventMode = "static";
        this.bar.cursor = "pointer";
        this.bar.on("pointerdown", (e: PIXI.FederatedPointerEvent) => {
            e.stopPropagation();
            if (this.listH <= H - TOP) return;
            const y = this.content.toLocal(e.global).y - TOP;
            const { thumb, at } = this.thumb();
            this.grab = y >= at && y < at + thumb ? y - at : thumb / 2;
            this.dragTo(y);
        });
        this.bar.on("globalpointermove", (e: PIXI.FederatedPointerEvent) => { if (this.grab != null) this.dragTo(this.content.toLocal(e.global).y - TOP); });
        this.bar.on("pointerup", () => this.grab = null);
        this.bar.on("pointerupoutside", () => this.grab = null);

        window.addEventListener("keydown", this.keys, true);     // (first, so the others see it's taken)
        document.addEventListener("paste", this.paste);
        IBC.events.register(Event.PARTY_LIST, () => this.draw(), this);
        IBC.events.register(Event.PARTY_STATE, () => this.drawList(), this);
        IBC.events.register(Event.HERO_STATE, () => this.drawList(), this);
        IBC.events.register(Event.HERO_HIRED, () => this.drawList(), this);
        IBC.events.register(Event.HERO_DISMISSED, () => this.drawList(), this);
        IBC.events.register(Event.HERO_SWAPPED, () => this.drawList(), this);
        IBC.events.register(Event.PARTY_SAID, (said: { text: string, ok: boolean }) => this.say(said.text, said.ok ? AP.LIME : AP.FLAME), this);
        IBC.events.register(Event.MAP_POINTER_DOWN, () => this.setTyping(false), this);
        IBC.events.register(Event.CHAT_TYPING, (on: boolean) => { if (on) this.setTyping(false); }, this);

        this.setPosition(Math.round((window.innerWidth - WIDTH) / 2), Math.round((window.innerHeight - HEIGHT) / 2));
        this.draw();
    }

    public destroy() {
        super.destroy();
        window.removeEventListener("keydown", this.keys, true);
        document.removeEventListener("paste", this.paste);
        this.typing = false;
        this.titleBar.destroy();
        this.background.destroy();
        this.container.destroy({ children: true });
    }

    public update(deltaTime: number) {
        if (this.typing) {
            this.blink += deltaTime;
            this.caret.visible = Math.floor(this.blink / Parties.BLINK_MS) % 2 == 0;
        }
        for (const [t, e] of this.askTimes) t.text = secsLeft(e);
    }

    //#region typing a name

    // the party asking by name asks into: your first (none of yours: null)
    private asking() {
        return IBC.data.parties.list.find((p) => p.y) ?? null;
    }

    private setTyping(on: boolean) {
        if (on && !this.asking()) on = false;
        if (on == this.typing) return;
        this.typing = on;
        this.blink = 0;
        if (on) Chat.stop();
        this.drawTop();
    }

    private onKey(e: KeyboardEvent) {
        if (e.ctrlKey || e.metaKey || e.altKey) return;
        if (!this.typing) {
            if (e.key == "Escape" && !Chat.takes(e)) IBC.comp.destroy(this);
            return;
        }
        (e as any).chat = true;
        e.preventDefault();
        if (e.key == "Enter") this.send();
        else if (e.key == "Escape") this.setTyping(false);
        else if (e.key == "Backspace") { this.draft = this.draft.slice(0, -1); this.drawTop(); }
        else if (e.key.length == 1 && this.draft.length < 64) { this.draft += e.key; this.drawTop(); }
        this.blink = 0;
    }

    // ask the name typed into the party it's for
    private send() {
        const name = this.draft.trim(), party = this.asking();
        if (name && party) IBC.net.party.ask(party.i, name);
        this.draft = "";
        if (this.typing) this.setTyping(false);
        else this.drawTop();
    }

    private say(text: string, tint: number) {
        this.said = text;
        this.saidTint = tint;
        this.drawTop();
    }

    //#endregion

    //#region drawing

    private draw() {
        this.drawTop();
        this.drawList();
    }

    // asking a character by name into a party of yours (Enter or Ask), and what came of the last ask
    private drawTop() {
        const { W } = Parties, party = this.asking();
        this.top.removeChildren().forEach((c) => { if (c != this.caret) c.destroy({ children: true }); });
        const w = this.buttons(this.top, 0, [["Ask", () => this.send(), GO]], W, 11) - 2;
        const field = new PIXI.Graphics();
        field.beginFill(this.typing ? AP.STEEL : AP.BLACK).drawRect(0, 0, w, 11).endFill();
        field.beginFill(this.typing ? AP.SLATE : AP.INK).drawRect(1, 1, w - 2, 9).endFill();
        field.eventMode = "static";
        field.cursor = party ? "text" : "default";
        field.on("pointerdown", (e: PIXI.FederatedPointerEvent) => { e.stopPropagation(); this.setTyping(true); });
        this.top.addChild(field);
        if (this.typing || this.draft) {
            let shown = this.draft;
            while (shown && textWidth(shown) > w - 8) shown = shown.slice(1);
            const t = text(shown, 3, 2, AP.WHITE, this.top);
            if (this.typing) {
                this.caret.position.set(3 + (shown ? Math.ceil(t.textWidth) + 1 : 0), 1.5);
                this.caret.visible = true;
                this.top.addChild(this.caret);
            }
        } else {
            text(this.fit(party ? "Ask a character..." : "Make a party to ask others in", w - 6), 3, 2, AP.STEEL, this.top);
        }
        if (this.said) text(this.fit(this.said, W), 0, 14, this.saidTint, this.top);
    }

    private drawList() {
        const { HEAD, ROW_H } = Parties, data = IBC.data.parties;
        this.list.removeChildren().forEach((c) => c.destroy({ children: true }));
        this.askTimes = [];
        let y = 0;

        for (const p of data.list) {
            y = this.party(p, y);
            y += 9;
        }

        // a new one, of your heroes in none
        const free = this.free(), mine = data.list.filter((p) => p.y).length;
        this.heading("NEW PARTY", y);
        y += HEAD;
        for (const id of Array.from(this.picked)) if (!free.some((h) => h.id == id)) this.picked.delete(id);
        if (mine >= PARTIES_MOST) {
            const row = this.card(y, ROW_H - 1);
            text(`You have ${PARTIES_MOST} parties, the most there can be`, 4, 2, AP.ASH, row);
            y += ROW_H;
        } else if (!free.length) {
            const row = this.card(y, ROW_H - 1);
            text("Your heroes are all in parties", 4, 2, AP.ASH, row);
            y += ROW_H;
        } else {
            const chipsY = 14;
            const row = this.card(y, 0);
            text("Choose party:", 4, 3, AP.ASH, row);
            let h = this.chips(row, chipsY, free.map((hero) => [hero.d.n, () => {
                if (this.picked.has(hero.id)) this.picked.delete(hero.id);
                else if (this.picked.size < PARTY_MOST) this.picked.add(hero.id);
                this.drawList();
            }, this.picked.has(hero.id) ? GO : PLAIN, `${hero.d.n}, ${jobText(hero.d.j)}`]));
            this.buttons(row, chipsY + h + 1, [["Make party", () => {
                if (!this.picked.size) return this.say("Pick a hero or more for it first", AP.FLAME);
                IBC.net.party.make(Array.from(this.picked));
                this.picked.clear();
            }, this.picked.size ? GO : PLAIN]]);
            h = chipsY + h + 15;
            this.paintCard(row, h);
            y += h + 2;
        }

        this.listH = y;
        this.placeList();
    }


    // a party: its name and how many, what it's doing, who's in it and who's asked
    private party(p: PartyRow, y: number) {
        const { HEAD, ROW_H, MATE_H, LIST_W } = Parties;
        this.heading(p.y ? p.n : `${p.n}  (${p.o}'s)`, y, `${p.m.length}/${PARTY_MOST}`);
        y += HEAD;

        // (one solid block behind all its rows, sized once they're laid out)
        const start = y, block = new PIXI.Graphics();
        this.list.addChild(block);
        y += 3;

        // a line of a party of yours's To Do, private or public (its room filled by helpers, or
        // left empty) and Disband, or which it is, not yours; under it, what it's doing
        const next = p.s.q.length > 1 ? `then ${p.s.q.length - 1} more on its list` : !p.s.q.length && p.s.b ? "over and over (its backup task)" : "";
        const top = this.card(y, 0);
        if (p.y) {
            this.button(top, 4, 0, "To Do", () => TaskPlanner.openParty(p.i), GO);
            if (this.disbanding == p.i) this.buttons(top, 0, [
                ["Disband", () => { this.disbanding = null; IBC.net.party.disband(p.i); }, STOP],
                ["Keep", () => { this.disbanding = null; this.drawList(); }],
            ]);
            else this.buttons(top, 0, [
                ["Private", () => IBC.net.party.open(p.i, false), p.f ? PLAIN : GO, "Private: its empty spots stay empty - nobody but its own"],
                ["Public", () => IBC.net.party.open(p.i, true), p.f ? GO : PLAIN, "Public: heroes alone at the same thing where it is fight beside it in its empty spots, on their own lists"],
                ["Disband", () => { this.disbanding = p.i; this.drawList(); }, STOP],
            ]);
        } else {
            const t = text(p.f ? "Public: helpers fill its empty spots" : "Private: its empty spots stay empty", 4, 2, AP.ASH, top);
            t.eventMode = "static";
            Hint.on(t, "Public: heroes alone at the same thing where it is fight beside it in its empty spots, on their own lists. Private: nobody but its own");
        }
        text(this.fit(doing(p), LIST_W - 8), 4, 14, AP.WHITE, top);
        if (next) text(this.fit(next, LIST_W - 8), 4, 24, AP.STONE, top);
        y += next ? 38 : 28;
        if (p.dn) {
            const lead = text(this.fit(p.d ? `Led by ${p.dn}: +${p.d}% work` : `Led by ${p.dn}: Leadership comes as they work`, LIST_W - 8), 4, next ? 34 : 24, AP.STRAW, top);
            lead.eventMode = "static";
            Hint.on(lead, "The first in a party leads it. Working with others beside them, they learn Leadership, and everyone works quicker as it goes up. Only the leader trains it");
            y += 10;
        }

        for (const m of p.m) {
            this.mate(p, m, y);
            y += MATE_H;
        }
        // (a public one's helpers: heroes alone at the same thing there, fighting beside it)
        for (const [, name, owner, job] of p.x ?? []) {
            const row = this.card(y, 0);
            const t = text(this.fit(`Helping: ${name}, ${jobText(job)}  -  ${owner}'s`, LIST_W - 8), 4, 2, AP.STEEL, row);
            t.eventMode = "static";
            Hint.on(t, "On their own list at the same thing here: they fight beside the party till their task changes or it moves on");
            y += ROW_H;
        }
        if (p.y) {
            for (const [player, name, , heroName, ends] of p.k ?? []) {
                const row = this.card(y, 0);
                const x = this.buttons(row, 0, [["Take back", () => IBC.net.party.unask(p.i, player)]]) - 18;
                text(this.fit(`Asked ${heroName}, ${name}'s`, x - 8), 4, 2, AP.ASH, row);
                this.askTimes.push([text(secsLeft(ends), x, 2, AP.STONE, row), ends]);
                y += ROW_H;
            }
        }
        y += 2;
        block.beginFill(AP.SHADOW).drawRect(0, start, LIST_W, y - start).endFill();
        return y;
    }

    // one in a party: name, job and what they do in a fight, whose (not yours), how they are; Leave or Kick
    private mate(p: PartyRow, m: Mate, y: number) {
        const { LIST_W } = Parties;
        const [id, name, , owner, job, is, yours] = m;
        const row = this.card(y, 0);
        const tint = is == MateIs.WITH ? AP.LIME : is == MateIs.JOINING ? AP.AMBER : AP.IRON;
        row.addChild(new PIXI.Graphics().beginFill(tint).drawRect(4, 4, 4, 2).drawRect(5, 3, 2, 4).endFill());
        const buttons: [string, () => void, Tone?][] = [];
        if (yours) buttons.push(["Status", () => HeroStatus.open(id)], ["Leave",() => IBC.net.party.leave(id), STOP]);
        else if (p.y) buttons.push(["Kick", () => IBC.net.party.kick(p.i, id), STOP]);
        const right = this.buttons(row, 0, buttons);
        const n = text(this.fit(name, right - 16), 11, 2, is == MateIs.AWAY ? AP.ASH : AP.WHITE, row);
        const own = IBC.data.heroes.get(id);
        const how = is == MateIs.JOINING ? "on the way" : is == MateIs.AWAY ? "not about" : own?.s.o ? "healing" : own?.s.y ? "held up" : "";
        if (how) text(this.fit(how, right - 18 - n.textWidth), 15 + Math.ceil(n.textWidth), 2, is == MateIs.WITH ? AP.FLAME : AP.STONE, row);
        const line = `${jobText(job)}${yours ? "" : `  -  ${owner}'s`}`;
        const t = text(this.fit(line, LIST_W - 15), 11, 13, AP.STEEL, row);
        t.eventMode = "static";
        Hint.on(t, roleText(job));
    }

    // your heroes in no party
    private free() {
        return IBC.data.heroes.heroes.filter((h) => !IBC.data.parties.of(h.id) && h.s.g == null);
    }

    // a section's name, a rule running from it to the right edge (or to `right` on the right)
    private heading(label: string, y: number, right = "") {
        const { LIST_W } = Parties;
        const l = text(this.fit(label, LIST_W - 40), 0, y + 1, AP.STONE, this.list);
        const x = Math.ceil(l.textWidth) + 4;
        let end = LIST_W;
        if (right) {
            const t = text(right, 0, y + 1, AP.STONE, this.list);
            t.x = LIST_W - Math.ceil(t.textWidth);
            end = t.x - 4;
        }
        this.list.addChild(new PIXI.Graphics().beginFill(AP.IRON).drawRect(x, y + 4, end - x, 1).endFill());
    }

    // a card along the list at y, lit under the pointer (h 0: painted after, paintCard); what's on it goes in it
    private card(y: number, h: number) {
        const row = new PIXI.Container();
        row.y = y;
        const back = new PIXI.Graphics();
        row.addChild(back);
        row.eventMode = "static";
        this.list.addChild(row);
        if (h) this.paintCard(row, h);
        return row;
    }

    private paintCard(row: PIXI.Container, h: number) {
        const back = row.getChildAt(0) as PIXI.Graphics;
        const paint = (lit: boolean) => back.clear()
            .beginFill(lit ? AP.SLATE : AP.SHADOW).drawRect(0, 0, Parties.LIST_W, h).endFill()
            .beginFill(lit ? AP.IRON : AP.SLATE).drawRect(0, h - 1, Parties.LIST_W, 1).endFill();
        paint(false);
        row.removeAllListeners("pointerenter");
        row.removeAllListeners("pointerleave");
        row.on("pointerenter", () => paint(true));
        row.on("pointerleave", () => paint(false));
    }

    // a name and, after it, dimmer, whose (cut to fit `room`)
    private text2(parent: PIXI.Container, a: string, b: string, x: number, y: number, room: number) {
        const t = text(this.fit(a, room), x, y, AP.WHITE, parent);
        const bx = x + Math.ceil(t.textWidth) + 5;
        if (room - (bx - x) > textWidth("...") + 4) text(this.fit(b, room - (bx - x)), bx, y, AP.STONE, parent);
    }

    // buttons along the right of a row, the last rightmost (ending at right), h tall; where the first starts
    private buttons(parent: PIXI.Container, y: number, buttons: [string, () => void, Tone?, string?][], right = Parties.LIST_W - 4, h = 12) {
        let x = right;
        for (const [label, act, tone, hint] of buttons.slice().reverse()) {
            x -= textWidth(label) + 6;
            const b = this.button(parent, x, y, label, act, tone, h);
            if (hint) Hint.on(b, hint);
            x -= 2;
        }
        return x;
    }

    // buttons left to right from x, on as many lines as it takes to `right`; how tall they came to
    private chips(parent: PIXI.Container, y: number, chips: [string, () => void, Tone?, string?][], left = 4, right = Parties.LIST_W - 4) {
        let x = left, line = 0;
        for (const [label, act, tone, hint] of chips) {
            const w = textWidth(label) + 6;
            if (x + w > right && x > left) { x = left; line++; }
            const b = this.button(parent, x, y + line * 13, label, act, tone);
            if (hint) Hint.on(b, hint);
            x += w + 2;
        }
        return (line + 1) * 13;
    }

    private button(parent: PIXI.Container, x: number, y: number, label: string, act: () => void, [dark, lit]: Tone = PLAIN, h = 12) {
        const w = textWidth(label) + 6;
        const button = new PIXI.Container();
        button.position.set(x, y);
        const back = new PIXI.Graphics();
        const paint = (on: boolean) => back.clear()
            .beginFill(AP.BLACK).drawRect(0, 0, w, h).endFill()
            .beginFill(on ? lit : dark).drawRect(1, 1, w - 2, h - 2).endFill();
        paint(false);
        button.addChild(back);
        text(label, 3, Math.floor((h - 9) / 2) + 1, AP.WHITE, button);
        button.eventMode = "static";
        button.cursor = "pointer";
        button.hitArea = new PIXI.Rectangle(0, 0, w, h);
        button.on("pointerover", () => paint(true));
        button.on("pointerout", () => paint(false));
        button.on("pointerdown", (e: PIXI.FederatedPointerEvent) => e.stopPropagation());
        button.on("pointertap", act);
        parent.addChild(button);
        return button;
    }

    // s, cut short with "..." to be no wider than room
    private fit(s: string, room: number) {
        if (textWidth(s) <= room) return s;
        while (s && textWidth(s + "...") > room) s = s.slice(0, -1);
        return s + "...";
    }

    //#endregion

    //#region scrolling

    // the bar's thumb: its length, and how far down the list's top it is
    private thumb() {
        const room = Parties.H - Parties.TOP;
        const thumb = Math.max(12, Math.round(room * room / this.listH));
        return { thumb, at: Math.round((room - thumb) * this.scroll / (this.listH - room)) };
    }

    // scrolled so the thumb's grabbed point is y down the list's top
    private dragTo(y: number) {
        const room = Parties.H - Parties.TOP, { thumb } = this.thumb();
        this.scroll = (y - this.grab) / (room - thumb) * (this.listH - room);
        this.placeList();
    }

    // the list where it's scrolled to, its bar on the right (a strip wider than it takes the pointer)
    private placeList() {
        const { W, H, TOP } = Parties, room = H - TOP;
        this.scroll = Math.max(0, Math.min(this.scroll, this.listH - room));
        this.list.y = TOP - this.scroll;
        this.bar.clear();
        this.bar.hitArea = this.listH > room ? new PIXI.Rectangle(W - 6, TOP, 6, room) : new PIXI.Rectangle(0, 0, 0, 0);
        if (this.listH <= room) return;
        const { thumb, at } = this.thumb();
        this.bar.beginFill(AP.SHADOW).drawRect(W - 3, TOP, 2, room).endFill();
        this.bar.beginFill(AP.STONE).drawRect(W - 3, TOP + at, 2, thumb).endFill();
    }

    //#endregion

}

// a button's colours: as it is, and lit
type Tone = [number, number];
const PLAIN: Tone = [AP.SLATE, AP.IRON], GO: Tone = [AP.FOREST, AP.LEAF], STOP: Tone = [AP.MAROON, AP.RED];

// the time an ask has left
function secsLeft(ends: number) {
    return `${Math.max(0, Math.ceil((ends - Date.now()) / 1000))}s`;
}

// "Cleric (Healer)"
function jobText(job: number) {
    const j = JOBS[job];
    return j ? `${j.name} (${j.role})` : "";
}

// what each job does beside others (shared/Heroes.ts JOBS)
function roleText(job: number) {
    return `${jobText(job)}: ${JOBS[job]?.does ?? "fights"}`;
}

// what a party's doing now, in a line (as the server has it: travelling there, at it, resting)
function doing(p: PartyRow) {
    const s: HeroState = p.s, w = s.w, name = (id: number) => IBC.data.heroes.nameOf(id);
    const of = w?.n ? ` (${s.d}/${w.n})` : "";
    if (s.r.length && !(s.l > 0) && p.m.some((m) => m[5] == MateIs.JOINING)) return "Waiting for the others to get here";
    if (!w) return "Starting on its list";
    if (s.r.length && w.k != TaskKind.REST) return `On the way to ${name(w.k == TaskKind.ADVENTURE ? s.a ?? s.r[s.r.length - 1] : w.p ?? s.r[s.r.length - 1])}`;
    switch (w.k) {
        case TaskKind.TRAVEL: return `Arriving at ${name(w.p)}`;
        case TaskKind.GATHER: return `Gathering ${itemName(w.m)} at ${name(w.p)}${of}`;
        case TaskKind.CRAFT: return `Crafting ${itemName(w.m)} in ${name(w.p)}${of}`;
        case TaskKind.WORK: return `Working in ${name(w.p)}${of}`;
        case TaskKind.EXPLORE: return `Exploring ${name(w.p)}${of}`;
        case TaskKind.ADVENTURE: return `Adventuring${of}`;
        case TaskKind.EVENT: return `At ${IBC.data.events.get(w.m)?.n ?? "an event"}`;
        case TaskKind.REST: return p.m.some((m) => m[5] == MateIs.JOINING) ? "Waiting for the others to get here" : w.n ? `Resting${of}` : "Resting (nothing on its list)";
    }
    return "";
}
