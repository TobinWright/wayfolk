import * as PIXI from "pixi.js";
import { Sfx } from "../../utils/Sfx";
import { Effects } from "../../utils/Effects";
import { worldSeasonAt } from "../../../../shared/Seasons";
import { IBC } from "../../Engine";
import { Backdrop, backdropArt, FEET_Y, SCENE_H, SCENE_W } from "../../art/Backdrops";
import { campTextures, FIRE_FRAMES, FIRE_X } from "../../art/CampArt";
import { CampLife } from "./CampLife";
import { AtWork, Site, WorkScene } from "./AtWork";
import { Delving, Hauling } from "./TaskWork";
import { eventStage, isLive } from "../../../../shared/Events";
import { gatherSkill, recipeOf, TaskKind } from "../../../../shared/Tasks";
import { gatherStation, stationOf } from "../../art/WorkArt";
import { lightTint, RAIN_TILE, snowing, snowTexture, starsTexture, streakTexture } from "../../art/WeatherArt";
import { darkness, rainAt } from "../../../../shared/Weather";
import { BEAT_MS, Blow, Fight, FIGHT_END_MS, FIGHT_IN_MS, FIGHT_MOST_MS, landOf } from "../../../../shared/Fights";
import { PARTY_MOST, PartyMember } from "../../../../shared/Parties";
import { enemyTexture } from "../../art/EnemyArt";
import { TerrainType } from "../../constants/Constants";
import { Event } from "../../constants/Events";
import { Job, Skill, SKILL_NAMES } from "../../../../shared/Heroes";
import { FeaturedParty, HeroRow } from "../../data/HeroesData";
import { AP } from "../../constants/Palette";
import { Constants } from "../../constants/Constants";
import { AVATAR_H, AVATAR_W, Facing } from "../../people/AvatarArt";
import { Looks } from "../../people/LookArt";
import { personTexture, picTexture, shadowTexture } from "../../people/People";
import { BaseComponent, ComponentType } from "../BaseComponent";
import type { Map } from "../map/Map";
import { HeroStatus } from "../herostatus/HeroStatus";
import { TaskPlanner } from "../taskplanner/TaskPlanner";

// A hero window (the user's design, DESIGN.md "Hero windows"): a side view,
// 10 x 3 tiles, of a party of heroes on their way - up to PARTY_MOST of
// Lithalia's people in a line walking the way the party's heading, the land
// they're crossing scrolling by behind them (art/Backdrops) and changing as
// it changes under them. It always follows over the party's marker on the
// map (the user, 2026-10-28: Map's markers), windows that would overlap
// stacked up over each other; clicking it opens its hero's to-do list. One
// of the party pointed at, their name and their player's show over their
// head; clicked, their status (HeroStatus; someone else's, HERO_VIEW). With
// the map zoomed right out, only its party's names show, stacked (setCompact).
// A level gone up at a skill rises over the hero who went up (pop). Resting, they make
// camp where they are (the user, 2026-10-28; art/CampArt): a tent, a fire
// flickering, the party round it. Day and night, and rain where their hero
// is (shared/Weather): the light's colour over it all, stars and the moon
// over the land at night, rain slanting down; the fire bright through it.
// A fight of their hero's (shared/Fights.ts, as the server sends it) plays
// back in it: the party stands, the enemies come in from the right, blow by
// blow each striker lunges, what it took (or healed) rising off whoever it
// hit, a health bar under everyone, the beaten fading; then Beaten if they lost.
// Its party (shared/Parties.ts, HERO_PARTY) is whoever's with their hero
// now, anyone's heroes, up to PARTY_MOST: two or more of yours in one share
// a window (the lowest id's; the others' hidden, regroup), its name saying
// how many are with them. Working where they are, they're at it in it: an
// event (the user, 2026-10-28), gathering, crafting, looking about on an
// adventure (AtWork), odd jobs, a dungeon run (TaskWork). Their party
// featured on the map (map/FeaturedMarkers), a pink star in its top right,
// "Featured Party" while pointed at.

export { PARTY_MOST };

// a fight playing: its turns, where it's got to, everyone's health now, who's reddened or lunging (ms left)
interface Playback {
    fight: Fight; beats: Blow[][]; sprites: PIXI.Sprite[]; time: number; beat: number; beatMs: number;
    hp: number[]; hit: number[]; lunge: number[]; numbers: { t: PIXI.Container, age: number, y: number }[]; ended: boolean;
    freeze: number;             // (ms held still: the last foe down, a beat)
    shake: number; shakeMs: number; shakeBy: number;     // (the window shaking: a crit, a kill)
}

// a heading: right, left, or standing still
export type Heading = 1 | -1 | 0;

export class HeroWindow extends BaseComponent {

    public static SCALE = 2;            // screen px a scene px
    public static BORDER = 2;           // scene px of frame round the scene
    public static GAP = 4;              // screen px between windows stacked up
    public static TAIL = 5;             // screen px of the point under it, down to the marker
    public static WALK_SPEED = 24;      // scene px a second
    public static STEP_MS = 150;        // a walking frame
    public static SPACING = 18;         // scene px between people in the line
    public static BACK = 14;            // scene px from the window's back edge to the last in line
    public static FADE_MS = 800;        // a backdrop changing into another
    public static COMPACT_ZOOM = 0.5;   // the map zoomed out this far or more: names only (setCompact)
    public static NAME_LINE = 5;        // scene px a name, stacked
    public static POP_MS = 3000;        // a level gone up, showing
    public static FIRE_MS = 140;        // a frame of the campfire
    public static GLOW_R = 14;          // scene px of the fire's glow
    public static RAIN_FALL = [70, 110];    // scene px a second the rain falls, far and near
    public static SNOW_PACE = 0.2;     // snow falls this much as quick as rain
    public static RAIN_SLANT = 0.5;     // across for every one down
    public static FIGHT_IN_MS = FIGHT_IN_MS;        // a fight: the enemies coming in (shared/Fights.ts playMs)
    public static BEAT_MS = BEAT_MS;                // a turn's blows (a Mage's at every enemy at once)
    public static FIGHT_MOST_MS = FIGHT_MOST_MS;    // the blows all in this at most (quicker turns)
    public static FIGHT_END_MS = FIGHT_END_MS;      // won or beaten showing, the enemies fading out
    public static LUNGE = 4;            // scene px a striker steps in
    public static LUNGE_MS = 200;
    public static HIT_MS = 150;         // the one struck, reddened
    public static PLUS_MS = 2400;       // how often a healer's + rises off one hurt
    public static NUMBER_MS = 800;      // what a blow took, rising
    public static FOE_X = 138;          // the first enemy's middle (the rest further in, FOE_GAP apart)
    public static FOE_GAP = 16;
    public static BAR_W = 12;           // a health bar, under the feet
    public static UNDERGROUND = 0xb0a49a;   // the light down a dungeon (torchlight, the same day or night)

    // the walking frames in turn: a step, standing, the other step, standing
    private static WALK = [1, 0, 2, 0];

    public own: number;                 // the hero it's for
    public heroes: number[] = [];       // the ids of yours in it (none: merged into another of yours in their party)
    public members: Looks[] = [];
    private pluses: { t: PIXI.BitmapText, age: number, y: number }[] = [];
    private plusTime = 0;
    public memberIds: number[] = [];    // whose each of members is, leader first (anyone's)
    private memberNames: string[] = [];
    private memberOwners: string[] = [];    // (their players' names)
    private memberJobs: Job[] = [];
    private waitingParty: PartyMember[];    // (come during a fight: put in after it)
    private played: string[] = [];      // the last fights queued (one of a party's comes once for each of yours in it)
    public heading: Heading = 1;
    public backdrop: Backdrop;
    private backdropSeason = -1;          // (the season it was drawn for: art/Seasonal)
    public resting = false;

    private scene: PIXI.Container;
    private land: PIXI.Container;           // the backdrop now (and the one going, under it, while it fades)
    private strips: { sprite: PIXI.TilingSprite, pace: number }[] = [];
    private going: PIXI.Container;          // (its strips keep scrolling under the new one)
    private goingStrips: { sprite: PIXI.TilingSprite, pace: number }[] = [];
    private fade = 1;
    private people: PIXI.Container;
    private nameTag: PIXI.Container;        // its hero's name, top left
    private nameBox: PIXI.Graphics;
    private nameText: PIXI.BitmapText;
    private tag: PIXI.Container;            // over the one pointed at: their name and their player's
    private tagW = 0;
    private tagged = -1;                    // (which of members it's over; -1: none)
    private featured: PIXI.Container;      // their party's featured on the map: a star, top right
    private tail: PIXI.Graphics;            // its point down to the marker
    private body: PIXI.Container;           // the window (all but the names)
    private names: PIXI.Container;          // in its place zoomed right out: the party's names, stacked, and a point
    private namesTail: PIXI.Graphics;
    private compact = false;
    private namesW = 0;                     // (the names' box, scene px)
    private namesH = 0;
    private sprites: PIXI.Sprite[] = [];
    private scroll = 0;                     // scene px walked
    private stepTime = 0;
    private pops: { pop: PIXI.Container, age: number, w: number, over: number }[] = [];     // a level gone up, rising (over: whose head, or null for the middle)
    private camp: PIXI.Container;           // resting: the camp, between the land and the people
    private campBack: PIXI.Sprite;
    private fire: PIXI.Sprite;
    private glow: PIXI.Graphics;
    private fireTime = 0;
    private campLife: CampLife = null;      // camped: what they're up to
    private work: WorkScene = null;         // working where they are: at it
    private workBack: PIXI.Container;       // (what they're at, behind them)
    private workFront: PIXI.Container;      // (their tools and the chips, in front)
    private chatter: PIXI.Container;        // its speech bubbles and Zzz, over the light
    private shade: PIXI.Sprite;             // the light of the time of day (and the rain), multiplied over the scene
    private stars: PIXI.Sprite;             // at night, over the shade
    private skyKind: Backdrop;             // the land the stars are over (their moon in its phase)
    private rain: PIXI.TilingSprite[];      // far and near
    private rainFell = 0;                   // s of rain fallen
    private nightGlow = 1;                  // the fire glows brighter in the dark
    private fights: Fight[] = [];           // to play, the first playing
    private play: Playback = null;
    private foes: PIXI.Container;           // a fight's enemies (each a shadow and a sprite), beside the people
    private fx: PIXI.Container;             // a fight's health bars and numbers, over it all
    private bars: PIXI.Graphics;

    constructor() {
        super(ComponentType.HERO_WINDOW);
        this.create();
    }

    public create() {
        super.create();
        const B = HeroWindow.BORDER, W = SCENE_W + B * 2, H = SCENE_H + B * 2;
        this.container.scale.set(HeroWindow.SCALE);

        // the frame: an outer and an inner line round the scene
        const frame = new PIXI.Graphics();
        frame.beginFill(AP.BLACK).drawRect(0, 0, W, H).endFill();
        frame.beginFill(AP.IRON).drawRect(1, 1, W - 2, H - 2).endFill();
        this.body = new PIXI.Container();
        this.container.addChild(this.body);
        this.body.addChild(frame);

        this.scene = new PIXI.Container();
        this.scene.position.set(B, B);
        const mask = new PIXI.Graphics().beginFill(0xffffff).drawRect(B, B, SCENE_W, SCENE_H).endFill();
        this.body.addChild(mask);
        this.scene.mask = mask;
        this.body.addChild(this.scene);

        this.land = new PIXI.Container();
        this.people = new PIXI.Container();
        this.camp = new PIXI.Container();
        this.camp.visible = false;
        this.glow = new PIXI.Graphics();
        this.campBack = new PIXI.Sprite();
        this.fire = new PIXI.Sprite();
        this.camp.addChild(this.campBack);
        // the rain and the light over the land and the party; the stars and the fire bright through it
        this.rain = [true, false].map((far) => new PIXI.TilingSprite(streakTexture(far), SCENE_W, SCENE_H));
        this.shade = new PIXI.Sprite(PIXI.Texture.WHITE);
        this.shade.width = SCENE_W;
        this.shade.height = SCENE_H;
        this.shade.blendMode = PIXI.BLEND_MODES.MULTIPLY;
        this.stars = new PIXI.Sprite();
        this.glow.blendMode = PIXI.BLEND_MODES.ADD;
        this.glow.visible = this.fire.visible = false;
        this.foes = new PIXI.Container();
        this.chatter = new PIXI.Container();
        this.fx = new PIXI.Container();
        this.workBack = new PIXI.Container();
        this.workFront = new PIXI.Container();
        this.bars = new PIXI.Graphics();
        this.fx.addChild(this.bars);
        this.scene.addChild(this.land, this.camp, this.rain[0], this.workBack, this.people, this.workFront, this.foes, this.rain[1], this.shade, this.stars, this.glow, this.fire, this.chatter, this.fx);
        // (what's over the party never takes a click, else it falls to the window's to-do list, not the hero under it)
        [this.workFront, this.foes, this.rain[1], this.shade, this.stars, this.glow, this.fire, this.chatter, this.fx].forEach((o) => o.eventMode = "none");

        this.nameTag = new PIXI.Container();
        this.nameTag.position.set(B + 2, B + 2);
        this.nameBox = new PIXI.Graphics();
        this.nameText = new PIXI.BitmapText("", { fontName: Constants.PIXEL_FONT, fontSize: 16, tint: AP.WHITE });
        this.nameText.position.set(2, 1);
        this.nameTag.addChild(this.nameBox, this.nameText);
        this.nameTag.visible = false;
        this.nameTag.eventMode = "none";
        this.body.addChild(this.nameTag);

        this.tag = new PIXI.Container();
        this.tag.eventMode = "none";
        this.tag.visible = false;
        this.body.addChild(this.tag);

        // their party featured on the map (map/FeaturedMarkers): a pink star top
        // right, "Featured Party" in a box under it while pointed at
        this.featured = new PIXI.Container();
        this.featured.position.set(W - B - 6, B + 5);
        this.featured.visible = false;
        const points = [0, -4, 1, -1, 4, -1, 1.5, 1, 2.5, 4, 0, 2, -2.5, 4, -1.5, 1, -4, -1, -1, -1];
        this.featured.addChild(new PIXI.Graphics()
            .beginFill(AP.BLACK).drawPolygon(points.map((v) => v * 1.3)).endFill()
            .beginFill(AP.PINK).drawPolygon(points).endFill());
        const tip = new PIXI.Container(), tipText = new PIXI.BitmapText("Featured Party", { fontName: Constants.PIXEL_FONT, fontSize: 16, tint: AP.PINK });
        const tipW = Math.ceil(tipText.textWidth) + 4;
        tipText.position.set(2, 1);
        tip.addChild(new PIXI.Graphics()
            .beginFill(AP.BLACK).drawRect(0, 0, tipW, 7).endFill()
            .beginFill(AP.SHADOW).drawRect(1, 1, tipW - 2, 5).endFill(), tipText);
        tip.position.set(4 - tipW, 6);
        tip.visible = false;
        this.featured.addChild(tip);
        this.featured.eventMode = "static";
        this.featured.hitArea = new PIXI.Rectangle(-6, -6, 12, 12);
        this.featured.on("pointerover", () => tip.visible = true);
        this.featured.on("pointerout", () => tip.visible = false);
        this.body.addChild(this.featured);

        // the point under it, down to the marker (its middle at x 0 once placed)
        this.tail = new PIXI.Graphics();
        const T = HeroWindow.TAIL / HeroWindow.SCALE + 1;
        this.tail.beginFill(AP.BLACK).drawPolygon([-T - 1, -1, T + 1, -1, 0, T]).endFill();
        this.tail.beginFill(AP.IRON).drawPolygon([-T + 1, -1, T - 1, -1, 0, T - 2]).endFill();
        this.tail.position.set(W / 2, H);
        this.body.addChild(this.tail);

        // zoomed right out: only its party's names (setCompact)
        this.names = new PIXI.Container();
        this.names.visible = false;
        this.container.addChild(this.names);

        // (so dragging over it doesn't move the map under it); clicking opens the to-do list
        this.container.eventMode = "static";
        this.container.cursor = "pointer";
        this.container.hitArea = new PIXI.Rectangle(0, 0, W, H);
        this.container.on("pointerdown", (e: PIXI.FederatedPointerEvent) => e.stopPropagation());
        this.container.on("pointertap", () => { if (this.heroes.length) TaskPlanner.open(this.heroes[0]); });

        IBC.events.register(Event.HERO_LEVEL, (e: { hero: HeroRow, skill: Skill }) => {
            if (this.heroes.includes(e.hero.id)) this.pop(`${SKILL_NAMES[e.skill]} ${e.hero.d.k[e.skill]}!`, AP.STRAW, e.hero.id);
        }, this);
        IBC.events.register(Event.HERO_FIGHT, (e: { hero: HeroRow, fight: Fight }) => {
            if (this.heroes.includes(e.hero.id)) this.addFight(e.fight);
        }, this);

        this.setBackdrop("plains");
        this.resize();
    }

    // a level gone up: its text rising over the hero's head (over: their id;
    // without, over the party's middle) and fading (POP_MS)
    public pop(text: string, tint: number = AP.STRAW, over: number = null) {
        // in a box like the name's
        const pop = new PIXI.Container();
        const t = new PIXI.BitmapText(text, { fontName: Constants.PIXEL_FONT, fontSize: 16, tint });
        const w = Math.ceil(t.textWidth) + 4;
        t.position.set(2 - Math.floor(w / 2), 1);
        pop.addChild(new PIXI.Graphics()
            .beginFill(AP.BLACK).drawRect(-Math.floor(w / 2), 0, w, 7).endFill()
            .beginFill(AP.SHADOW).drawRect(1 - Math.floor(w / 2), 1, w - 2, 5).endFill(), t);
        pop.eventMode = "none";
        this.body.addChild(pop);
        this.pops.push({ pop, age: 0, w, over });
        this.placePops();
    }

    private placePops() {
        const B = HeroWindow.BORDER;
        this.pops.forEach((p, i) => {
            const t = p.age / HeroWindow.POP_MS;
            // (stacked over any newer ones over the same head)
            const above = this.pops.slice(i + 1).filter((q) => q.over == p.over).length;
            const sprite = p.over == null ? null : this.sprites[this.memberIds.indexOf(p.over)];
            let x = SCENE_W / 2, y = 14;
            if (sprite?.visible && sprite.texture?.height > 1) {
                x = Math.min(SCENE_W - Math.ceil(p.w / 2), Math.max(Math.ceil(p.w / 2), Math.round(sprite.x - sprite.pivot.x)));
                y = Math.max(1, Math.round(sprite.y - sprite.height) - 6);
            }
            p.pop.position.set(B + x, Math.round(B + y - 6 * t - above * 8));
            p.pop.alpha = t < 0.7 ? 1 : (1 - t) / 0.3;
        });
    }

    public destroy() {
        super.destroy();
        this.container.destroy({ children: true });
    }

    // who's in it, leader first
    public setMembers(members: Looks[]) {
        this.members = members.slice(0, PARTY_MOST);
        this.people.removeChildren().forEach((c) => c.destroy());
        this.sprites = [];
        for (let i = 0; i < this.members.length; i++) {
            const shadow = new PIXI.Sprite(shadowTexture());
            shadow.anchor.set(0.5, 0.5);
            shadow.eventMode = "none";
            const sprite = new PIXI.Sprite();
            sprite.anchor.set(0.5, 1);
            // pointed at, their name and their player's over them; clicked, their status
            sprite.eventMode = "static";
            sprite.cursor = "pointer";
            sprite.on("pointerover", () => this.showTag(i));
            sprite.on("pointerout", () => { if (this.tagged == i) this.showTag(-1); });
            sprite.on("pointertap", (e: PIXI.FederatedPointerEvent) => { e.stopPropagation(); HeroWindow.openStatus(this.memberIds[i]); });
            this.people.addChild(shadow, sprite);
            this.sprites.push(sprite);
        }
        this.showTag(-1);
        if (this.resting) this.startCampLife(); else if (this.work) this.startWork(this.work.site); else this.placePeople();
    }

    // who's in its hero's party now, leader first (as the server says: HERO_PARTY);
    // during a fight, put in once it's played
    public setParty(party: PartyMember[]) {
        if (this.play) { this.waitingParty = party; return; }
        this.waitingParty = null;
        this.memberIds = party.map((m) => m[0]);
        this.memberNames = party.map((m) => m[1]);
        this.memberOwners = party.map((m) => m[3] || IBC.data.player.name);
        this.memberJobs = party.map((m) => m[4]);
        this.setMembers(party.map((m) => m[2]));
        const name = IBC.data.heroes.seen(this.own)?.d.n ?? "";
        this.setName(party.length > 1 ? `${name} +${party.length - 1}` : name);
        if (this.compact) this.drawNames();
    }

    // the name in its top left corner, in a box (none: no tag)
    public setName(name: string) {
        this.nameText.text = name;
        this.nameTag.visible = !!name;
        const w = Math.ceil(this.nameText.textWidth) + 4;
        this.nameBox.clear();
        this.nameBox.beginFill(AP.BLACK).drawRect(0, 0, w, 7).endFill();
        this.nameBox.beginFill(AP.SHADOW).drawRect(1, 1, w - 2, 5).endFill();
    }

    // the one pointed at (their place in members; -1: none): their name, and
    // under it their player's, in a box like the name's, over their head
    private showTag(i: number) {
        this.tagged = i;
        this.tag.removeChildren().forEach((c) => c.destroy());
        this.tag.visible = i >= 0 && i < this.memberNames.length;
        if (!this.tag.visible) return;
        const name = new PIXI.BitmapText(this.memberNames[i], { fontName: Constants.PIXEL_FONT, fontSize: 16, tint: AP.WHITE });
        const owner = new PIXI.BitmapText(this.memberOwners[i] ?? "", { fontName: Constants.PIXEL_FONT, fontSize: 16, tint: AP.ASH });
        name.position.set(2, 1);
        owner.position.set(2, 1 + HeroWindow.NAME_LINE);
        const w = Math.ceil(Math.max(name.textWidth, owner.textWidth)) + 4, h = HeroWindow.NAME_LINE * 2 + 2;
        this.tag.addChild(new PIXI.Graphics()
            .beginFill(AP.BLACK).drawRect(0, 0, w, h).endFill()
            .beginFill(AP.SHADOW).drawRect(1, 1, w - 2, h - 2).endFill(), name, owner);
        this.tagW = w;
        this.placeTag();
    }

    // (over their head as they move, kept in the window)
    private placeTag() {
        const sprite = this.sprites[this.tagged];
        if (!sprite) return;
        const B = HeroWindow.BORDER, h = HeroWindow.NAME_LINE * 2 + 2;
        const x = Math.round(sprite.x - sprite.pivot.x - this.tagW / 2), y = Math.round(sprite.y - sprite.height) - h - 1;
        this.tag.position.set(B + Math.min(SCENE_W - this.tagW, Math.max(0, x)), B + Math.max(0, y));
    }

    // a hero's status, from their window: yours as it is, someone else's once the server sends them (HERO_VIEW)
    public static openStatus(id: number) {
        if (IBC.data.heroes.get(id)) HeroStatus.open(id);
        else if (id != null) IBC.net.hero.view(id);
    }

    // zoomed right out (the user, 2026-10-28): not the window, only its
    // party's names, one over another, in a box with a point down to the marker
    public setCompact(on: boolean) {
        if (on == this.compact) return;
        this.compact = on;
        this.body.visible = !on;
        this.names.visible = on;
        if (on) this.drawNames();
        const { w, h } = this.size();
        this.container.hitArea = new PIXI.Rectangle(0, 0, w / HeroWindow.SCALE, h / HeroWindow.SCALE);
    }

    private drawNames() {
        this.names.removeChildren().forEach((c) => c.destroy());
        const texts = this.memberNames.map((name, i) => {
            const t = new PIXI.BitmapText(name, { fontName: Constants.PIXEL_FONT, fontSize: 16, tint: AP.WHITE });
            t.position.set(2, 1 + i * HeroWindow.NAME_LINE);
            return t;
        });
        const w = Math.ceil(Math.max(0, ...texts.map((t) => t.textWidth))) + 4, h = texts.length * HeroWindow.NAME_LINE + 2;
        const box = new PIXI.Graphics();
        box.beginFill(AP.BLACK).drawRect(0, 0, w, h).endFill();
        box.beginFill(AP.SHADOW).drawRect(1, 1, w - 2, h - 2).endFill();
        this.namesTail = new PIXI.Graphics().beginFill(AP.BLACK).drawPolygon([w / 2 - 2, h, w / 2 + 2, h, w / 2, h + 2]).endFill();
        this.names.addChild(box, this.namesTail, ...texts);
        this.namesW = w;
        this.namesH = h;
    }

    // its size on the screen, the point under it left out
    public size() {
        const S = HeroWindow.SCALE, B = HeroWindow.BORDER;
        return this.compact ? { w: this.namesW * S, h: this.namesH * S } : { w: (SCENE_W + B * 2) * S, h: (SCENE_H + B * 2) * S };
    }

    public setHeading(heading: Heading) {
        this.heading = heading;
        this.placePeople();
    }

    // the land they're crossing; a change fades in over the old
    // (and again as the season turns: art/Seasonal)
    public setBackdrop(kind: Backdrop) {
        const season = worldSeasonAt(Date.now()).k;
        if (kind == this.backdrop && season == this.backdropSeason) return;
        const first = !this.backdrop;
        this.backdrop = kind;
        this.backdropSeason = season;
        if (this.going) this.going.destroy({ children: true });
        this.going = null;
        this.going = first ? null : this.land.children[this.land.children.length - 1] as PIXI.Container;
        this.goingStrips = first ? [] : this.strips;

        const art = backdropArt(kind, season);
        const layer = new PIXI.Container();
        layer.addChild(new PIXI.Sprite(picTexture(art.sky)));
        this.strips = art.strips.map((s) => {
            const sprite = new PIXI.TilingSprite(picTexture(s.pic), SCENE_W, SCENE_H);
            layer.addChild(sprite);
            return { sprite, pace: s.pace };
        });
        this.land.addChild(layer);
        this.campBack.texture = campTextures(kind).back;
        this.skyKind = kind;
        this.stars.texture = starsTexture(kind);
        this.fade = first ? 1 : 0;
        layer.alpha = this.fade;
        this.scrollStrips();
    }

    // resting: camped where they are, round the fire (art/CampArt)
    public setResting(on: boolean) {
        if (on == this.resting) return;
        this.resting = on;
        this.camp.visible = this.glow.visible = this.fire.visible = on;
        // the flames stay bright over the light of the time of day, and the party's in front of
        // them (the user, 2026-11-03), so camped they're over that light too, tinted by it (weather)
        this.scene.removeChildren();
        this.scene.addChild(...(on
            ? [this.land, this.camp, this.rain[0], this.workBack, this.workFront, this.foes, this.shade, this.stars, this.fire, this.people, this.rain[1], this.glow, this.chatter, this.fx]
            : [this.land, this.camp, this.rain[0], this.workBack, this.people, this.workFront, this.foes, this.rain[1], this.shade, this.stars, this.glow, this.fire, this.chatter, this.fx]));
        if (!on) for (const lit of [...this.sprites, this.rain[1]]) lit.tint = 0xffffff;
        this.campLife?.destroy();
        this.campLife = null;
        if (on) this.startCampLife(); else this.placePeople();
    }

    // camped: what they get up to round the camp (CampLife)
    private startCampLife() {
        this.campLife?.destroy();
        const shadows = this.sprites.map((_, i) => this.people.children[i * 2] as PIXI.Sprite);
        this.campLife = new CampLife(this.members, this.sprites, shadows, this.chatter);
    }

    // the line near the back of the window (the side away from where they're
    // heading; standing, they face right), the leader at its front
    private placePeople() {
        const n = this.members.length, facing = this.heading < 0 ? Facing.LEFT : Facing.RIGHT;
        const front = this.heading < 0 ? -1 : 1, back = this.heading < 0 ? SCENE_W - HeroWindow.BACK : HeroWindow.BACK;
        // (camped, CampLife has them; at work, its scene - unless it walks them)
        if (this.campLife || (this.work && !this.work.walks)) return;
        for (let i = 0; i < n; i++) {
            const x = back + front * (n - 1 - i) * HeroWindow.SPACING, face = facing;
            const sprite = this.sprites[i], shadow = this.people.children[i * 2] as PIXI.Sprite;
            sprite.visible = shadow.visible = true;
            sprite.position.set(x, FEET_Y + 1);
            shadow.position.set(x, FEET_Y);
            // each a step behind the one in front, so they don't walk in step
            const frame = this.heading == 0 ? 0 : HeroWindow.WALK[(Math.floor(this.stepTime / HeroWindow.STEP_MS) + i) % HeroWindow.WALK.length];
            sprite.texture = personTexture(this.members[i], face, frame);
        }
    }

    // what their hero's at where they are (not on the way there, camped or fighting), or null
    private workOn(hero: HeroRow): Site {
        const s = hero.s, w = s.w;
        if (!w || s.r.length || IBC.data.heroes.resting(hero) || (w.p != null && w.p != s.p)) return null;
        switch (w.k) {
            case TaskKind.EVENT: {
                const e = IBC.data.events.get(w.m);
                return e && isLive(e, Date.now()) ? { key: `event ${e.i} ${eventStage(e)}`, e } : null;     // (a new stage: its new skill)
            }
            case TaskKind.GATHER: return { key: `gather ${w.m}`, skill: gatherSkill(w.m), station: gatherStation(w.m) };
            case TaskKind.CRAFT: {
                const skill = recipeOf(w.m)?.skill;
                return skill == null ? null : { key: `craft ${skill}`, skill, station: stationOf(skill) };
            }
            case TaskKind.ADVENTURE: return { key: "look", skill: Skill.SCOUTING };
            case TaskKind.WORK: return { key: "haul", haul: true };
            case TaskKind.EXPLORE: return { key: "delve", delve: true };
        }
        return null;
    }

    // at work, or done with it (back in their line)
    private setWork(site: Site) {
        if ((this.work?.site.key ?? null) == (site?.key ?? null)) return;
        if (site) this.startWork(site);
        else { this.work.destroy(); this.work = null; this.placePeople(); }
    }

    private startWork(site: Site) {
        this.work?.destroy();
        const shadows = this.sprites.map((_, i) => this.people.children[i * 2] as PIXI.Sprite);
        this.work = site.delve ? new Delving(site, this.workBack)
            : site.haul ? new Hauling(site, this.members, this.sprites, shadows, this.workBack, this.workFront)
            : new AtWork(site, this.members, this.memberIds, this.memberJobs, this.sprites, shadows, this.workBack, this.workFront);
        this.placePeople();
    }

    private scrollStrips() {
        for (const s of [...this.strips, ...this.goingStrips]) s.sprite.tilePosition.x = -Math.floor(this.scroll * s.pace);
    }

    public update(deltaTime: number) {
        // walking the way their hero is, through the land under them
        // (in a fight they stand, out of camp, till it's played)
        if (!this.play && this.fights.length) this.startFight(this.fights[0]);
        this.featured.visible = IBC.data.heroes.featured.some((f) => f.rows.some((r) => this.heroes.includes(r.id)));
        const hero = IBC.data.heroes.seen(this.heroes[0]);
        if (hero) {
            // (down a dungeon, walking on through it; a fight at the end of a run fought down there)
            // (always walking right, the party behind the leader on the left, whichever way they go on the map - the user, 2026-10-31)
            const heading: Heading = this.play ? 0 : this.work?.walks || IBC.data.heroes.position(hero).moving ? 1 : 0;
            if (heading != this.heading) this.setHeading(heading);
            this.setBackdrop(HeroWindow.backdropOf(IBC.data.heroes.nodeOf(hero)?.te));
            this.setResting(!this.play && IBC.data.heroes.resting(hero));
            this.setWork(!this.play ? this.workOn(hero) : this.work?.underground ? this.work.site : null);
            this.weather(deltaTime, IBC.data.heroes.position(hero));
        }
        if (this.play) this.playFight(deltaTime);
        else this.tended(deltaTime);
        if (this.resting) this.flicker(deltaTime);
        this.campLife?.update(deltaTime);
        if (!this.play) this.work?.update(deltaTime);
        if (this.heading != 0) {
            this.scroll += this.heading * HeroWindow.WALK_SPEED * deltaTime / 1000;
            const was = Math.floor(this.stepTime / HeroWindow.STEP_MS);
            this.stepTime += deltaTime;
            if (Math.floor(this.stepTime / HeroWindow.STEP_MS) != was) this.placePeople();
            this.scrollStrips();
        }
        if (this.pops.length) {
            for (const p of this.pops) p.age += deltaTime;
            while (this.pops.length && this.pops[0].age >= HeroWindow.POP_MS) this.pops.shift().pop.destroy({ children: true });
            this.placePops();
        }
        if (this.tagged >= 0) this.placeTag();
        if (this.fade < 1) {
            this.fade = Math.min(1, this.fade + deltaTime / HeroWindow.FADE_MS);
            this.land.children[this.land.children.length - 1].alpha = this.fade;
            if (this.fade == 1 && this.going) { this.going.destroy({ children: true }); this.going = null; this.goingStrips = []; }
        }
    }

    // the time of day and the rain where they are (at, map px): the light over
    // it all, the stars out as it darkens (not through the rain), the rain falling
    // (down a dungeon: none of it, only torchlight)
    private weather(deltaTime: number, at: { x: number, y: number }) {
        const now = Date.now(), under = !!this.work?.underground;
        const wet = under ? 0 : rainAt(at.x, at.y, now), dark = under ? 0 : darkness(now);
        const light = under ? HeroWindow.UNDERGROUND : lightTint(now, wet * 0.7);
        this.shade.tint = light;
        if (this.resting) for (const lit of [...this.sprites, this.rain[1]]) lit.tint = light;
        this.stars.alpha = dark * (1 - wet);
        if (this.skyKind && dark > 0) this.stars.texture = starsTexture(this.skyKind, now);     // (the moon's phase)
        this.stars.visible = this.stars.alpha > 0;
        // (in Winter, snow: slower, drifting from side to side)
        const snow = snowing(now);
        this.rainFell += deltaTime / 1000 * (snow ? HeroWindow.SNOW_PACE : 1);
        this.rain.forEach((r, i) => {
            r.visible = wet > 0;
            r.alpha = Math.min(1, wet * 1.5);
            const want = snow ? snowTexture(i == 0) : streakTexture(i == 0);
            if (r.texture != want) r.texture = want;
            // falling, slanting with the wind, and passing by as they walk
            const down = this.rainFell * HeroWindow.RAIN_FALL[i];
            const across = snow ? Math.sin(this.rainFell * 2 + i) * 3 : -down * HeroWindow.RAIN_SLANT;
            r.tilePosition.set(Math.floor((across - this.scroll * (i ? 1 : 0.6)) % RAIN_TILE), Math.floor(down % RAIN_TILE));
        });
        this.nightGlow = 1 + dark * 0.7;
    }

    // the campfire's flames through their frames, its glow swelling and dimming with them
    private flicker(deltaTime: number) {
        const was = Math.floor(this.fireTime / HeroWindow.FIRE_MS);
        this.fireTime += deltaTime;
        const f = Math.floor(this.fireTime / HeroWindow.FIRE_MS);
        if (f == was && this.fire.texture != PIXI.Texture.EMPTY) return;
        const frames = campTextures(this.backdrop).fire;
        this.fire.texture = frames[f % FIRE_FRAMES];
        const r = HeroWindow.GLOW_R + (f % 3) - 1;
        this.glow.clear();
        this.glow.beginFill(AP.AMBER, 0.12 * this.nightGlow).drawCircle(FIRE_X, FEET_Y - 4, r).endFill();
        this.glow.beginFill(AP.STRAW, 0.12 * this.nightGlow).drawCircle(FIRE_X, FEET_Y - 4, r * 0.55).endFill();
    }

    // the backdrop for a kind of land (the node's terrain: shared/Fights.ts landOf, as the road's enemies are)
    public static backdropOf(terrain: TerrainType): Backdrop {
        return landOf(terrain);
    }

    //#region a fight played back

    // its blows in turns (a turn: one striker's blows, a Mage's at every enemy,
    // a Druid's healing everyone), the enemies standing in, everyone's health as it starts
    private startFight(fight: Fight) {
        for (const p of this.pluses.splice(0)) p.t.destroy();
        // (at work: back in their line for it, at it again after; down a dungeon, they fight there)
        if (this.work && !this.work.underground) this.setWork(null);
        const beats: Blow[][] = [];
        for (const blow of fight.b) {
            const last = beats[beats.length - 1];
            if (last && last[0].a == blow.a) last.push(blow); else beats.push([blow]);
        }
        const sprites: PIXI.Sprite[] = fight.f.map((f) => {
            if (f.h != null) return this.sprites[this.memberIds.indexOf(f.h)] ?? null;
            const sprite = new PIXI.Sprite(enemyTexture(f.e)), shadow = new PIXI.Sprite(shadowTexture());
            if (f.g) { sprite.scale.set(1.5); shadow.scale.set(1.5); }     // (an event's boss)
            sprite.anchor.set(0.5, 1);
            shadow.anchor.set(0.5, 0.5);
            this.foes.addChild(shadow, sprite);
            return sprite;
        });
        this.play = {
            fight, beats, sprites, time: 0, beat: 0, hp: fight.f.map((f) => f.hp), hit: fight.f.map(() => 0), lunge: fight.f.map(() => 0),
            beatMs: Math.min(HeroWindow.BEAT_MS, HeroWindow.FIGHT_MOST_MS / Math.max(1, beats.length)), numbers: [], ended: false,
            freeze: 0, shake: 0, shakeMs: 1, shakeBy: 0,
        };
        this.setHeading(0);
        this.setResting(false);
    }

    // where one in the fight stands: a hero where they are in the line, an enemy in from the right
    private fighterX(i: number) {
        const play = this.play, f = play.fight.f[i];
        if (f.s == 0) return play.sprites[i]?.x ?? HeroWindow.BACK;
        const k = play.fight.f.slice(0, i).filter((x) => x.s == 1).length;
        return HeroWindow.FOE_X - k * HeroWindow.FOE_GAP;
    }

    private playFight(deltaTime: number) {
        const H = HeroWindow, play = this.play, f = play.fight.f;
        // (shaking: the whole window, a scene px or two, easing off)
        play.shake = Math.max(0, play.shake - deltaTime);
        const by = play.shake > 0 && !Effects.reduced() ? Math.round(play.shakeBy * play.shake / play.shakeMs) : 0;
        this.container.pivot.set(by ? (Math.random() < 0.5 ? -by : by) : 0, by ? (Math.random() < 0.5 ? -1 : 0) : 0);
        // (the last foe down: held a beat, everything still)
        if (play.freeze > 0) { play.freeze -= deltaTime; this.drawFx(0, 1); return; }
        play.time += deltaTime;
        const t = play.time - H.FIGHT_IN_MS;

        // each turn's blows as its time comes; then won or beaten, the enemies fading
        while (t >= play.beat * play.beatMs && play.beat < play.beats.length) {
            for (const blow of play.beats[play.beat]) this.strike(blow);
            play.beat++;
        }
        const over = t - play.beats.length * play.beatMs - 300;
        if (!play.ended && over >= 0) {
            play.ended = true;
            // (a bout against an event's boss: what it took off it, or Beaten if they fell)
            const fell = play.fight.o[0] <= 0;
            if (play.fight.x != null && !play.fight.w) this.pop(fell ? "Beaten" : `-${Math.round(play.fight.x)} to the boss`, fell ? AP.FLAME : AP.STRAW);
            else if (!play.fight.w) this.pop("Beaten", AP.FLAME);     // (a win says nothing: the user didn't want "Won!" over it)
        }
        if (play.ended && over >= H.FIGHT_END_MS) { this.endFight(); return; }

        // the enemies coming in from past the right edge; strikers lunging, the struck reddened, the fallen faded
        const come = Math.min(1, play.time / H.FIGHT_IN_MS), fade = play.ended ? Math.max(0, 1 - over / H.FIGHT_END_MS) : 1;
        f.forEach((x, i) => {
            const sprite = play.sprites[i];
            if (!sprite) return;
            play.hit[i] = Math.max(0, play.hit[i] - deltaTime);
            play.lunge[i] = Math.max(0, play.lunge[i] - deltaTime);
            const step = Math.round(H.LUNGE * Math.sin(Math.PI * play.lunge[i] / H.LUNGE_MS));
            const down = play.hp[i] <= 0;
            sprite.tint = play.hit[i] > 0 ? 0xff7070 : 0xffffff;
            if (x.s == 1) {
                const at = Math.round(this.fighterX(i) + (1 - come) * 40);
                sprite.position.set(at - step, FEET_Y + 1);
                const shadow = this.foes.getChildAt(this.foes.getChildIndex(sprite) - 1) as PIXI.Sprite;
                shadow.position.set(at, FEET_Y);
                sprite.alpha = shadow.alpha = (down ? 0.25 : 1) * fade;
            } else {
                sprite.alpha = down ? 0.4 : 1;
                sprite.pivot.x = -step;
            }
        });
        this.drawFx(deltaTime, fade);
    }

    // out of a fight, a healer's seeing to them (shared/Fights.ts tendMul): now and then a green + rising off each one hurt
    private tended(deltaTime: number) {
        const H = HeroWindow;
        for (const p of this.pluses) {
            p.age += deltaTime;
            p.t.y = Math.round(p.y - 8 * p.age / H.NUMBER_MS);
            p.t.alpha = Math.max(0, 1 - p.age / H.NUMBER_MS);
        }
        while (this.pluses.length && this.pluses[0].age >= H.NUMBER_MS) this.pluses.shift().t.destroy();
        if ((this.plusTime += deltaTime) < H.PLUS_MS) return;
        this.plusTime = 0;
        this.memberIds.forEach((id, i) => {
            const s = IBC.data.heroes.seen(id)?.s, sprite = this.sprites[i];
            if (!s?.h || !s.z || !sprite) return;
            const t = new PIXI.BitmapText("+", { fontName: Constants.PIXEL_FONT, fontSize: 16, tint: AP.LIME }), y = FEET_Y - 28;
            t.position.set(Math.round(sprite.x - t.textWidth / 2), y);
            this.fx.addChild(t);
            this.pluses.push({ t, age: 0, y });
        });
    }

    // a blow landing: the striker steps in, the one struck reddens, the number rises off them
    private strike(blow: Blow) {
        const play = this.play, target = play.fight.f[blow.t];
        play.lunge[blow.a] = HeroWindow.LUNGE_MS;
        let text = `${blow.d}`, tint = AP.WHITE;
        if (blow.m) { text = "miss"; tint = AP.ASH; }
        else if (blow.h) { play.hp[blow.t] = Math.min(target.mx, play.hp[blow.t] + blow.d); text = `+${blow.d}`; tint = blow.p ? AP.PINK : AP.LIME; }
        else {
            const was = play.hp[blow.t];
            play.hp[blow.t] = Math.max(0, play.hp[blow.t] - blow.d);
            play.hit[blow.t] = HeroWindow.HIT_MS;
            if (blow.c) { text += "!"; tint = AP.STRAW; }
            if (blow.p) tint = AP.EMBER;        // (Firepowder thrown)
            // (juice, the user 2026-11-05: a crit shakes it; the last of the other side down shakes it more and holds a beat)
            const seen = this.container.worldVisible;
            const side = target.s, standing = play.fight.f.filter((x, i) => x.s == side && play.hp[i] > 0).length;
            if (was > 0 && play.hp[blow.t] <= 0 && standing == 0) {
                play.freeze = 320;
                play.shake = play.shakeMs = 300;
                play.shakeBy = 2;
                if (seen) Sfx.kill();
            } else if (blow.c) {
                play.shake = play.shakeMs = 180;
                play.shakeBy = 1;
                if (seen) Sfx.hit(true);
            } else if (seen) Sfx.hit(false);
        }
        // on a plate like the name's, so it reads over the sky (a crit twice as big)
        const big = !!blow.c && !blow.m && !blow.h, size = big ? 32 : 16, plate = big ? 13 : 7;
        const label = new PIXI.BitmapText(text, { fontName: Constants.PIXEL_FONT, fontSize: size, tint }), w = Math.ceil(label.textWidth) + 4;
        label.position.set(2, 1);
        const t = new PIXI.Container();
        t.addChild(new PIXI.Graphics().beginFill(big ? AP.STRAW : AP.BLACK).drawRect(0, 0, w, plate).endFill().beginFill(AP.SHADOW).drawRect(1, 1, w - 2, plate - 2).endFill(), label);
        const y = FEET_Y - 28 - (big ? 6 : 0);
        t.position.set(Math.round(this.fighterX(blow.t) - w / 2), y);
        this.fx.addChild(t);
        play.numbers.push({ t, age: 0, y });
    }

    // health bars under everyone in it, and the numbers rising and going
    private drawFx(deltaTime: number, fade: number) {
        const play = this.play, W = HeroWindow.BAR_W, bars = this.bars;
        bars.clear();
        bars.alpha = fade;
        play.fight.f.forEach((x, i) => {
            if (!play.sprites[i]) return;
            const left = Math.round(this.fighterX(i) - W / 2), full = Math.ceil(W * play.hp[i] / x.mx);
            bars.beginFill(AP.BLACK).drawRect(left - 1, FEET_Y + 2, W + 2, 3).endFill();
            if (full > 0) bars.beginFill(x.s == 0 ? AP.LIME : AP.FLAME).drawRect(left, FEET_Y + 3, full, 1).endFill();
        });
        for (const n of play.numbers) {
            n.age += deltaTime;
            const k = n.age / HeroWindow.NUMBER_MS;
            n.t.y = Math.round(n.y - 6 * k);
            n.t.alpha = k < 0.6 ? 1 : Math.max(0, (1 - k) / 0.4);
        }
        while (play.numbers.length && play.numbers[0].age >= HeroWindow.NUMBER_MS) play.numbers.shift().t.destroy({ children: true });
    }

    // played: the enemies gone, the party back to what they're doing (camped, if beaten)
    private endFight() {
        this.container.pivot.set(0, 0);
        for (const sprite of this.sprites) { sprite.alpha = 1; sprite.tint = 0xffffff; sprite.pivot.x = 0; }
        this.foes.removeChildren().forEach((c) => c.destroy());
        for (const n of this.play.numbers) n.t.destroy({ children: true });
        this.bars.clear();
        this.play = null;
        this.fights.shift();
        if (this.waitingParty) this.setParty(this.waitingParty);
    }

    //#endregion

    // every window over its marker (Map.markerAt), its point down to it; the
    // lowest on the screen first, one that would overlap another moved up
    // over it (its point hidden). At an event's place (Map.belowAt) it goes
    // under the heroes there instead, its point up to them, so the event's
    // marker shows (the user, 2026-10-28): those first, the highest first,
    // one that would overlap another moved down under it
    public static placeAll(map: Map) {
        const compact = map.camera.getZoom() <= HeroWindow.COMPACT_ZOOM;
        const tail = compact ? 2 * HeroWindow.SCALE : HeroWindow.TAIL, gap = compact ? 1 : HeroWindow.GAP;
        const all = (IBC.comp.getAllByType(ComponentType.HERO_WINDOW) as HeroWindow[]).filter((w) => w.heroes.length);
        const below = all.map((w) => ({ w, at: map.belowAt(w.heroes[0]), under: true }))
            .filter((o) => o.at)
            .sort((a, b) => a.at.y - b.at.y || a.w.heroes[0] - b.w.heroes[0]);
        const over = all.filter((w) => !below.some((o) => o.w == w))
            .map((w) => ({ w, at: map.markerAt(w.heroes[0]), under: false }))
            .filter((o) => o.at)
            .sort((a, b) => b.at.y - a.at.y || a.w.heroes[0] - b.w.heroes[0]);
        const placed: PIXI.Rectangle[] = [];
        for (const { w, at, under } of [...below, ...over]) {
            w.setCompact(compact);
            const { w: W, h: H } = w.size();
            const r = new PIXI.Rectangle(Math.round(at.x - W / 2), Math.round(under ? at.y + tail : at.y - H - tail), W, H);
            let pushed = false;
            for (let moved = true; moved;) {
                moved = false;
                for (const o of placed) if (r.x < o.right && r.right > o.x && r.y < o.bottom && r.bottom > o.y) {
                    r.y = under ? o.bottom + gap : o.y - H - gap;
                    moved = pushed = true;
                }
            }
            placed.push(r);
            w.setPosition(r.x, r.y);
            w.pointUp(under);
            w.tail.visible = !pushed;
            if (w.namesTail) w.namesTail.visible = !pushed;
        }
    }

    // its point down to its marker over it, or up to it under it
    private pointUp(up: boolean) {
        this.tail.scale.y = up ? -1 : 1;
        this.tail.y = up ? 0 : SCENE_H + HeroWindow.BORDER * 2;
        if (this.namesTail) { this.namesTail.scale.y = up ? -1 : 1; this.namesTail.y = up ? this.namesH : 0; }
    }

    // a window for a hero you have (alone till the server says who's with them)
    public static forHero(hero: HeroRow) {
        const w = IBC.comp.create(ComponentType.HERO_WINDOW) as HeroWindow;
        w.own = hero.id;
        w.heroes = [hero.id];
        w.setParty(hero.party ?? [[hero.id, hero.d.n, hero.d.l, "", hero.d.j]]);
        w.setHeading(0);
        HeroWindow.regroup();
        return w;
    }

    // a window over anyone's party (demo mode only: others don't see theirs),
    // by what the server sends of them; regroup leaves it be
    public static forParty(party: FeaturedParty) {
        const w = IBC.comp.create(ComponentType.HERO_WINDOW) as HeroWindow;
        w.own = party.party[0][0];
        w.heroes = [w.own];
        w.setParty(party.party);
        w.setHeading(0);
        return w;
    }

    // who's in it now, if that's changed
    public keepUp(party: PartyMember[]) {
        if (party.map((m) => m[0]).join() != this.memberIds.join()) this.setParty(party);
    }

    // a fight to play, once (the fight playing, or next: null none)
    public addFight(fight: Fight) {
        const seen = `${fight.l}:${fight.b.length}:${fight.o.join(",")}`;
        if (this.played.includes(seen) || this.fights.length >= 3) return;
        this.played = [...this.played.slice(-7), seen];
        this.fights.push(fight);
    }

    // those waiting to play gone, the one playing left to finish
    public dropNextFights() {
        this.fights.length = this.play ? 1 : 0;
    }

    public get fighting() {
        return this.play?.fight ?? this.fights[0] ?? null;
    }

    // a hero's party changed: each window shows its hero's; yours in one party
    // share the window of the lowest id among them, the others hidden
    public static regroup() {
        for (const w of IBC.comp.getAllByType(ComponentType.HERO_WINDOW) as HeroWindow[]) {
            const hero = IBC.data.heroes.get(w.own);
            if (!hero) continue;
            const party = hero.party ?? [[hero.id, hero.d.n, hero.d.l, "", hero.d.j]];
            const mine = party.map((m) => m[0]).filter((id) => IBC.data.heroes.get(id));
            const merged = Math.min(hero.id, ...mine) != hero.id;
            w.heroes = merged ? [] : [hero.id, ...mine.filter((id) => id != hero.id)];
            w.container.visible = !merged;
            // (again if who's in it, or how one of them looks, changed)
            const was = JSON.stringify(w.memberIds.map((id, i) => [id, w.members[i]]));
            if (!merged && JSON.stringify(party.map((m) => [m[0], m[2]])) != was) w.setParty(party);
        }
    }

    // a window for each of your heroes (as you sign in)
    public static showHeroes() {
        for (const hero of IBC.data.heroes.heroes) HeroWindow.forHero(hero);
    }

}
