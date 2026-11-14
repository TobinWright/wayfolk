import * as PIXI from "pixi.js";
import { maskSwearing } from "../../../../shared/ChatFilter";
import { JOBS, SKILL_NAMES } from "../../../../shared/Heroes";
import { Board, BOARD_TOP, boardName, boardSkill } from "../../../../shared/Leaderboards";
import { ABOUT_LONGEST, cleanAbout, PROFILE_GAP_MS, ProfileRank, ProfileView } from "../../../../shared/Profile";
import { Event } from "../../constants/Events";
import { AP, R64 } from "../../constants/Palette";
import { SMALL_ICON } from "../../art/MenuIcons";
import { IBC } from "../../Engine";
import { AVATAR_W, Facing } from "../../people/AvatarArt";
import { personTexture } from "../../people/People";
import { Panel } from "../../shared/Panel";
import { Hint } from "../../shared/ui/Hint";
import { TitleBar } from "../../shared/ui/titlebar/TitleBar";
import { BaseComponent, ComponentType } from "../BaseComponent";
import { Chat, wrap } from "../chat/Chat";
import { button, text, textWidth } from "../games/GameUI";
import { fit } from "../heroroster/HeroRoster";
import { HeroStatus } from "../herostatus/HeroStatus";
import { Mail } from "../mail/Mail";

// A player's profile (shared/Profile.ts; the user, 2026-11-02), opened from
// the menu by a name in the chat, from whose hero it is on someone else's
// hero's status, or yours from the other menu. Top to bottom: their name
// (crowned and in their colour, as in the chat), their guild and title, the
// month they started, what they wrote about themselves, how they've done
// (their heroes' levels, events, the card tables, titles), their best
// leaderboard ranks (pointed at: of how many, ranked by what, with which
// hero), and their heroes a row each across the window (head and
// shoulders, name, level, job, best skill; yours, clicked, open their
// status). Nothing private: not whether they're about, nor where their heroes
// are. Along the bottom Whisper or Add friend, and Send mail. A private one
// you can't see says so, and only that. Yours: clicking the box writes in it
// (Enter, Escape or clicking away saves it), and Private (only your friends
// see it), saved as it's clicked. The window's as tall as what's in it. Escape or its cross closes it.

const LINE = 9;
const ABOUT_LINES = 4;
const BLINK_MS = 500;
const HERO_H = 21;                      // a hero's row
const FACE_Y = 5, FACE_H = HERO_H - 2;  // (the part of them shown: head and shoulders)
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export class Profile extends BaseComponent {

    public static SCALE = 2;
    public static W = 232;              // the content, in its own px (its height: what's in it)
    public static INSET_X = 12;
    public static INSET_Y = 28;
    public static WIDTH = Profile.INSET_X * 2 + Profile.W * Profile.SCALE;

    private asked = "";                 // (whose was asked for: their name, lower case)
    private view: ProfileView = null;
    private draft = "";                 // (yours: what's written, and Private, as they are here)
    private hidden = false;
    private focused = false;
    private saving = false;             // (a save sent, not yet answered)
    private wanted = false;             // (a change to save, as soon as the server will take it)
    private lastSent = -Infinity;
    private friending = false;          // (Add friend clicked: what came of it said here)
    private said = "";
    private saidTint: number = AP.ASH;
    private blink = 0;

    public background: Panel;
    public titleBar: TitleBar;
    private content: PIXI.Container;
    private back = new PIXI.Graphics();
    private body: PIXI.Container;
    private caret = new PIXI.Graphics().beginFill(AP.WHITE).drawRect(0, 0, 1, 8).endFill();

    private keys = (e: KeyboardEvent) => this.onKey(e);
    private paste = (e: ClipboardEvent) => {
        if (!this.focused) return;
        e.preventDefault();
        this.write(e.clipboardData?.getData("text") ?? "");
    };

    constructor() {
        super(ComponentType.PROFILE);
        this.create();
    }

    // someone's profile, by their name (one open at a time: opening another's shows theirs)
    public static open(name: string) {
        const view = IBC.comp.getOrCreate(ComponentType.PROFILE) as Profile;
        view.bringToTop();
        view.show(name);
        return view;
    }

    // yours
    public static mine() {
        return Profile.open(IBC.data.player.name);
    }

    public create() {
        super.create();
        const { WIDTH, SCALE, INSET_X, INSET_Y } = Profile;
        this.container.eventMode = "static";
        this.container.on("pointerdown", (e: PIXI.FederatedPointerEvent) => { e.stopPropagation(); this.focus(false); });

        this.background = new Panel(this.container);
        this.titleBar = new TitleBar(this);
        this.titleBar.setPosition(4, 4);
        this.titleBar.setSize(WIDTH - 8, 20);
        this.titleBar.setTitle("Profile");

        this.content = new PIXI.Container();
        this.content.scale.set(SCALE);
        this.content.position.set(INSET_X, INSET_Y);
        this.container.addChild(this.content);
        this.body = new PIXI.Container();
        this.content.addChild(this.back, this.body);

        window.addEventListener("keydown", this.keys, true);     // (first, so the others see it's taken)
        document.addEventListener("paste", this.paste);
        IBC.events.register(Event.PLAYER_PROFILE, (view: ProfileView) => this.onView(view), this);
        IBC.events.register(Event.PLAYER_PROFILE_REFUSED, (why: string) => {
            this.saving = this.wanted = false;
            this.say(why, R64.SALMON);
        }, this);
        IBC.events.register(Event.FRIEND_SAID, (said: { text: string, ok: boolean }) => {
            if (!this.friending) return;
            this.friending = false;
            this.say(said.text, said.ok ? R64.LEAF : R64.SALMON);
        }, this);
        IBC.events.register(Event.FRIEND_LIST, () => this.draw(), this);
        IBC.events.register(Event.CHAT_FILTER, () => this.draw(), this);
        IBC.events.register(Event.CHAT_TYPING, (on: boolean) => { if (on) this.focus(false); }, this);
        IBC.events.register(Event.MAP_POINTER_DOWN, () => this.focus(false), this);

        this.setPosition(Math.max(0, Math.round((window.innerWidth - WIDTH) / 2)), Math.max(0, Math.round(window.innerHeight / 2) - 280));
    }

    public destroy() {
        // (closed with a change not yet sent: sent as it closes)
        if (this.changed() && !this.saving) IBC.net.player.setProfile(cleanAbout(this.draft), this.hidden);
        super.destroy();
        window.removeEventListener("keydown", this.keys, true);
        document.removeEventListener("paste", this.paste);
        IBC.events.unregisterAll(this);
        this.caret.destroy();
        this.titleBar.destroy();
        this.background.destroy();
        this.container.destroy({ children: true });
    }

    public update(deltaTime: number) {
        if (this.wanted) this.trySave();
        if (!this.focused) return;
        this.blink += deltaTime;
        this.caret.visible = Math.floor(this.blink / BLINK_MS) % 2 == 0;
    }

    private show(name: string) {
        if (this.view && this.view.n.toLowerCase() == name.toLowerCase()) return;
        this.asked = name.toLowerCase();
        this.view = null;
        this.focused = this.saving = this.wanted = this.friending = false;
        this.said = "";
        this.titleBar.setTitle(name);
        IBC.net.player.profile(name);
        this.draw();
    }

    private onView(view: ProfileView) {
        if (view.n.toLowerCase() != this.asked && !(view.m && this.view?.m)) return;
        // (yours, saved: what's here kept, being as new or newer)
        if (view.m && !this.view?.m) { this.draft = view.a ?? ""; this.hidden = !!view.v; }
        this.asked = view.n.toLowerCase();
        this.view = view;
        this.titleBar.setTitle(view.m ? "Your profile" : view.n);
        this.saving = false;
        this.draw();
    }

    //#region keys

    private focus(on: boolean) {
        if (on && !this.view?.m) return;
        if (on == this.focused) return;
        this.focused = on;
        this.blink = 0;
        if (on) Chat.stop();
        else this.save();       // (done writing: saved)
        this.draw();
    }

    private onKey(e: KeyboardEvent) {
        if (!this.focused) {
            if (e.key == "Escape" && !Chat.takes(e)) {
                (e as any).chat = true;
                e.preventDefault();
                IBC.comp.destroy(this);
            }
            return;
        }
        if (e.ctrlKey || e.metaKey || e.altKey) return;     // (Ctrl+V: the paste event)
        (e as any).chat = true;
        e.preventDefault();
        if (e.key == "Escape" || e.key == "Enter") return this.focus(false);
        if (e.key == "Backspace") {
            this.draft = this.draft.slice(0, -1);
            this.blink = 0;
            return this.draw();
        }
        if (e.key.length == 1) this.write(e.key);
    }

    private write(more: string) {
        this.draft = (this.draft + more.replace(/\s+/g, " ")).slice(0, ABOUT_LONGEST);
        this.blink = 0;
        if (this.said) this.said = "";
        this.draw();
    }

    //#endregion

    private changed() {
        const v = this.view;
        return !!v?.m && (cleanAbout(this.draft) != (v.a ?? "") || this.hidden != !!v.v);
    }

    // what's here saved: now, or once the last save's answered and PROFILE_GAP_MS has passed (update)
    private save() {
        this.wanted = true;
        this.trySave();
    }

    private trySave() {
        if (!this.changed()) { this.wanted = false; return; }
        if (this.saving || performance.now() - this.lastSent < PROFILE_GAP_MS) return;
        this.wanted = false;
        this.saving = true;
        this.lastSent = performance.now();
        IBC.net.player.setProfile(cleanAbout(this.draft), this.hidden);
    }

    private say(what: string, tint: number = AP.ASH) {
        this.said = what;
        this.saidTint = tint;
        this.draw();
    }

    // the window made `h` tall (its content's px), kept on the screen
    private fitTo(h: number) {
        const { WIDTH, W, SCALE, INSET_X, INSET_Y } = Profile, height = INSET_Y + h * SCALE + INSET_X;
        this.background.setSize(WIDTH, height);
        this.container.hitArea = new PIXI.Rectangle(0, 0, WIDTH, height);
        this.back.clear().beginFill(AP.INK).drawRect(-4, -2, W + 8, h + 6).endFill();
        this.container.y = Math.max(0, Math.min(this.container.y, window.innerHeight - height));
    }

    // each part under the last, the window as tall as they come to
    private draw() {
        const { W } = Profile, v = this.view;
        this.caret.parent?.removeChild(this.caret);
        this.body.removeChildren().forEach((c) => c.destroy({ children: true }));
        if (!v) {
            fit(text(this.said || "Looking for them...", 2, 2, this.said ? this.saidTint : AP.STONE, this.body), W - 4);
            return this.fitTo(14);
        }
        const g = new PIXI.Graphics();
        this.body.addChild(g);

        // their name, crowned and in their colour as in the chat
        let x = 2;
        if (v.p) { Chat.crown(x, 1, this.body); x += SMALL_ICON + 2; }
        fit(text(v.n, x, 2, v.p ? Chat.nameTint(v.p) : v.m ? AP.LIME : AP.SKY, this.body), W - 2 - x);
        // their guild and title
        let y = 13;
        if (v.g || v.h) {
            const guild = v.g ? text(v.g, 2, y, AP.ASH, this.body) : null;
            if (v.h) fit(text(v.h, guild ? 2 + Math.ceil(guild.textWidth) + 6 : 2, y, AP.STRAW, this.body), W - 4 - (guild ? Math.ceil(guild.textWidth) + 6 : 0));
            y += 11;
        }

        // private, and not yours to see: only that
        if (v.x) {
            g.beginFill(AP.SLATE).drawRect(0, y + 2, W, 1).endFill();
            text(`${v.n} keeps their profile private.`, 2, y + 8, AP.ASH, this.body);
            text("Only their friends can see it.", 2, y + 8 + LINE + 2, AP.STONE, this.body);
            return this.fitTo(this.drawActions(v, y + 34));
        }

        if (v.c) { text(`Playing since ${monthText(v.c)}`, 2, y, AP.STONE, this.body); y += 12; }
        y = this.drawAbout(v, g, y);
        y = this.drawStats(v, g, y);
        y = this.drawRanks(v, g, y);
        y = this.drawHeroes(v, y);
        this.fitTo(v.m ? this.drawMine(g, y) : this.drawActions(v, y));
    }

    // a part's name, over it
    private heading(label: string, y: number) {
        text(label, 2, y, AP.MIST, this.body);
        return y + 10;
    }

    // what they wrote about themselves, in a box (yours, clicked: written in); under it
    private drawAbout(v: ProfileView, g: PIXI.Graphics, y: number) {
        const { W } = Profile, h = ABOUT_LINES * LINE + 4;
        if (v.m) {
            const count = text(`${this.draft.length} / ${ABOUT_LONGEST}`, 0, y, AP.STEEL, this.body);
            count.x = W - 2 - Math.ceil(count.textWidth);
        }
        y = this.heading("About", y);
        g.beginFill(AP.BLACK).drawRect(0, y, W, h).endFill()
            .beginFill(this.focused ? AP.SLATE : AP.SHADOW).drawRect(1, y + 1, W - 2, h - 2).endFill();
        if (v.m) {
            const box = new PIXI.Container();
            box.eventMode = "static";
            box.cursor = "text";
            box.hitArea = new PIXI.Rectangle(0, y, W, h);
            box.on("pointerdown", (e: PIXI.FederatedPointerEvent) => { e.stopPropagation(); this.focus(true); });
            this.body.addChild(box);
        }
        const room = W - 8, lines = (s: string) => wrap(s, room, room, (t) => textWidth(t));
        const words = v.m ? this.draft : IBC.data.chat.hideSwearing ? maskSwearing(v.a ?? "") : v.a ?? "";
        if (!words && !this.focused) {
            lines(v.m ? "Click here to write a little about yourself." : "Nothing written yet.")
                .forEach((l, k) => text(l, 3, y + 3 + k * LINE, AP.IRON, this.body));
            return y + h + 6;
        }
        const all = lines(words), shown = this.focused ? all.slice(-ABOUT_LINES) : all.slice(0, ABOUT_LINES);
        shown.forEach((l, k) => text(l, 3, y + 3 + k * LINE, AP.WHITE, this.body));
        if (this.focused) {
            const last = shown[shown.length - 1] ?? "";
            this.caret.position.set(3 + (last ? textWidth(last) + 1 : 0), y + 2.5 + (shown.length - 1) * LINE);
            this.caret.visible = true;
            this.body.addChild(this.caret);
        }
        return y + h + 6;
    }

    // how they've done, in two columns; under it
    private drawStats(v: ProfileView, g: PIXI.Graphics, y: number) {
        const { W } = Profile, s = v.s;
        if (!s) return y;
        y = this.heading("Stats", y);
        const rows: [string, number][] = [
            ["Heroes' levels", s.l], ["Events joined", s.e], ["Event points", s.q],
            ["Hands of cards", s.h], ["Biggest pot", s.b], ["Season titles", s.t],
        ];
        const colW = Math.floor((W - 4) / 2);
        rows.forEach(([label, n], k) => {
            const x = k < 3 ? 0 : W - colW, ry = y + (k % 3) * 10;
            g.beginFill(AP.SHADOW).drawRect(x, ry, colW, 9).endFill();
            text(label, x + 3, ry + 1, AP.STONE, this.body);
            const t = text(n.toLocaleString(), 0, ry + 1, n ? AP.WHITE : AP.IRON, this.body);
            t.x = x + colW - 3 - Math.ceil(t.textWidth);
        });
        return y + 30 + 6;
    }

    // their best ranks on the leaderboards (in the top BOARD_TOP), side by side, each fitted to its share; under it
    private drawRanks(v: ProfileView, g: PIXI.Graphics, y: number) {
        const { W } = Profile, ranks = v.s?.r;
        if (!ranks) return y;
        y = this.heading("Best leaderboard ranks", y);
        if (!ranks.length) {
            fit(text(`Not in the top ${BOARD_TOP} of any leaderboard yet`, 2, y + 1, AP.IRON, this.body), W - 4);
            return y + 9 + 6;
        }
        const gap = 3, w = Math.floor((W - gap * (ranks.length - 1)) / ranks.length);
        ranks.forEach((r, k) => {
            const [board, rank] = r, x = k * (w + gap);
            const chip = new PIXI.Container();
            chip.position.set(x, y);
            const back = new PIXI.Graphics();
            const paint = (lit: boolean) => back.clear().beginFill(lit ? AP.SLATE : AP.SHADOW).drawRect(0, 0, w, 9).endFill();
            paint(false);
            chip.addChild(back);
            const n = text(`#${rank}`, 3, 1, rank <= 3 ? AP.STRAW : AP.WHITE, chip);
            const nw = Math.ceil(n.textWidth) + 4;
            fit(text(`in ${boardName(board)}`, 3 + nw, 1, AP.STONE, chip), w - 6 - nw);
            chip.eventMode = "static";
            chip.hitArea = new PIXI.Rectangle(0, 0, w, 9);
            chip.on("pointerover", () => paint(true));
            chip.on("pointerout", () => paint(false));
            Hint.on(chip, rankHint(r));
            this.body.addChild(chip);
        });
        return y + 9 + 6;
    }

    // their heroes, a row each across the window: head and shoulders, name and
    // level, job and best skill (yours, clicked: their status); under them
    private drawHeroes(v: ProfileView, y: number) {
        const { W } = Profile, heroes = v.e ?? [];
        y = this.heading("Heroes", y);
        if (!heroes.length) { text("No heroes yet.", 3, y + 1, AP.IRON, this.body); return y + 9 + 8; }
        heroes.forEach(([id, name, job, looks, level, skill, skillLevel]) => {
            const row = new PIXI.Container();
            row.position.set(0, y);
            const back = new PIXI.Graphics();
            const paint = (lit: boolean) => back.clear().beginFill(AP.BLACK).drawRect(0, 0, W, HERO_H).endFill()
                .beginFill(lit ? AP.SLATE : AP.SHADOW).drawRect(1, 1, W - 2, HERO_H - 2).endFill();
            paint(false);
            row.addChild(back);
            const whole = personTexture(looks, Facing.DOWN, 0);
            const face = new PIXI.Sprite(new PIXI.Texture(whole.baseTexture, new PIXI.Rectangle(0, FACE_Y, AVATAR_W, FACE_H)));
            face.position.set(3, 1);
            row.addChild(face);
            const x = 3 + AVATAR_W + 4, right = W - 4;
            const lv = text(`Level ${level}`, 0, 2, AP.STRAW, row);
            lv.x = right - Math.ceil(lv.textWidth);
            fit(text(name, x, 2, AP.WHITE, row), lv.x - 6 - x);
            const best = text(`Best: ${SKILL_NAMES[skill] ?? ""} ${skillLevel}`, 0, 11, AP.STONE, row);
            best.x = right - Math.ceil(best.textWidth);
            fit(text(JOBS[job]?.name ?? "", x, 11, AP.ASH, row), best.x - 6 - x);
            if (v.m) {
                row.eventMode = "static";
                row.cursor = "pointer";
                row.hitArea = new PIXI.Rectangle(0, 0, W, HERO_H);
                row.on("pointerover", () => paint(true));
                row.on("pointerout", () => paint(false));
                row.on("pointerdown", (e: PIXI.FederatedPointerEvent) => e.stopPropagation());
                row.on("pointertap", () => HeroStatus.open(id));
            }
            this.body.addChild(row);
            y += HERO_H + 2;
        });
        return y + 6;
    }

    // yours: Private (saved as it's clicked), and anything that couldn't be saved; the bottom
    private drawMine(g: PIXI.Graphics, y: number) {
        const { W } = Profile, label = "Private: friends only";
        g.beginFill(AP.BLACK).drawRect(2, y, 9, 9).endFill().beginFill(this.hidden ? AP.STRAW : AP.SHADOW).drawRect(3, y + 1, 7, 7).endFill();
        if (this.hidden) g.beginFill(AP.INK).drawRect(5, y + 3, 3, 3).endFill();
        text(label, 15, y + 1, this.hidden ? AP.WHITE : AP.ASH, this.body);
        const toggle = new PIXI.Container();
        toggle.eventMode = "static";
        toggle.cursor = "pointer";
        toggle.hitArea = new PIXI.Rectangle(0, y - 1, 15 + textWidth(label) + 2, 11);
        toggle.on("pointerdown", (e: PIXI.FederatedPointerEvent) => e.stopPropagation());
        toggle.on("pointertap", () => { this.hidden = !this.hidden; this.said = ""; this.save(); this.draw(); });
        this.body.addChild(toggle);

        if (!this.said) return y + 12;
        fit(text(this.said, 2, y + 12, this.saidTint, this.body), W - 4);
        return y + 21;
    }

    // someone else's: Whisper (a friend) or Add friend, Send mail (a friend or guildmate), and what's said back; the bottom
    private drawActions(v: ProfileView, y: number) {
        const friends = IBC.data.friends;
        let x = 2;
        if (friends.friend(v.i)) x += button("Whisper", x, y, this.body, () => Chat.whisperTo(v.i)) + 4;
        else if (friends.list.o.some((o) => o.i == v.i)) x += Math.ceil(text("Asked to be friends", x, y + 1, AP.STONE, this.body).textWidth) + 8;
        else if (!friends.isBlocked(v.n, v.i)) x += button("Add friend", x, y, this.body, () => { this.friending = true; IBC.net.friend.ask(v.n); }) + 4;
        if (friends.friend(v.i) || IBC.data.guilds.rankOf(v.i) >= 0) button("Send mail", x, y, this.body, () => Mail.writeTo(v.n));
        if (this.said) fit(text(this.said, 2, y + 12, this.saidTint, this.body), Profile.W - 4);
        return y + 21;
    }

}

// a rank's tip: where they stand and of how many, what the board ranks by, and on a heroes' board which hero
function rankHint([board, rank, of, hero]: ProfileRank) {
    const skill = boardSkill(board);
    const by = board == Board.LEVEL ? "Heroes ranked by total level"
        : skill >= 0 ? `Heroes ranked by ${SKILL_NAMES[skill]} XP`
        : board == Board.EVENTS ? "Players ranked by event points"
        : board == Board.SEASON ? "Players ranked by this season's points" : "";
    const lines = [`#${rank} of ${of.toLocaleString()} on the ${boardName(board)} leaderboard`];
    if (by) lines.push(by);
    if (hero) lines.push(`With ${hero}`);
    return lines.join("\n");
}

// "Nov 2026"
function monthText(ms: number) {
    const d = new Date(ms);
    return `${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}
