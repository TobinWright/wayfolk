import { achievementOf } from "../../../../shared/Achievements";
import { ChestLoot, ChestTier } from "../../../../shared/Chests";
import { ALL_STEPS } from "../../../../shared/Guide";
import { Skill, SKILL_NAMES } from "../../../../shared/Heroes";
import { MATERIALS } from "../../../../shared/Locations";
import { baseItem, gatherLevel, gatherSkill, itemName, Quality, QUALITY_NAMES, qualityOf, TaskKind, TIER_SKILL } from "../../../../shared/Tasks";
import { Event } from "../../constants/Events";
import { AP } from "../../constants/Palette";
import { HeroRow } from "../../data/HeroesData";
import { IBC } from "../../Engine";
import { Sfx } from "../../utils/Sfx";
import { BaseComponent, ComponentType } from "../BaseComponent";
import { GoldDisplay } from "../golddisplay/GoldDisplay";
import { ScreenFx } from "./ScreenFx";
import { Updates } from "../updates/Updates";
import { UPDATE_NOTES } from "../updates/UpdateNotes";
import { store } from "../../shared/dom/Dom";
import { Constants } from "../../constants/Constants";

// The moments that get a fuss made of them (the user, 2026-11-05: "Dopamine
// the shit out of this thing"), only for looks, through ScreenFx and Sfx:
//   A made thing of a quality: Fine a shimmer; Superior a banner; Masterwork
//     the screen lit, confetti and fireworks.
//   A level up: a banner, and what it opens up (a new tier's materials) or
//     when the next does.
//   A lucky gather: a golden banner.
//   An event won: its podium (ScreenFx.podium).
//   Achievements (shared/Achievements.ts): seen done here, said to the server
//     (it keeps them), a banner and a jingle as it says so; the gold ones a
//     shower of coins. Those already done as you sign in (from before there
//     were any) are said quietly, one banner for them all.
//   Anything clickable pressed: the faintest tick.
//   A big update not read yet (UpdateNotes big): the Updates window opened by
//     itself, once, after the away summary's shut (a new player: marked read).
// Always here once signed in, showing nothing of its own.

const GATHERING = [Skill.MINING, Skill.WOODCUTTING, Skill.FORAGING, Skill.FISHING, Skill.HUNTING];
const QUALITY_TINT = [AP.WHITE, AP.LEAF, AP.SKY, AP.STRAW];

export class Delight extends BaseComponent {

    private loaded = false;
    private updatesAt = 0;                  // (when to see about opening the Updates window: 0 not to)                 // (those done came with signing in: till then nothing's said)
    private asked = new Set<string>();      // (said to the server, waiting on it)
    private quiet = new Set<string>();      // (said as signing in: no banner each)
    private quietCount = 0;
    private quietAt = 0;
    // (a press on something clickable, as the pointer says: a tick)
    private press = () => { if ((IBC.pixi.renderer.events as any)?.cursor == "pointer") Sfx.tick(); };
    private crafting = new Map<number, number>();  // (what your heroes were making lately, and when: a quality one's theirs)

    constructor() {
        super(ComponentType.DELIGHT);
        this.create();
    }

    public create() {
        super.create();
        this.container.eventMode = "none";
        window.addEventListener("pointerdown", this.press, true);
        const on = (e: Event, f: (x: any) => void) => IBC.events.register(e, f, this);
        on(Event.INVENTORY_ITEM_ADDED, (gained: [number, number][]) => this.gained(gained));
        on(Event.INVENTORY_GOLD_UPDATED, () => this.gold());
        on(Event.HERO_STATE, (hero: HeroRow) => { if (hero.s.w?.k == TaskKind.CRAFT) this.crafting.set(hero.s.w.m, performance.now()); });
        on(Event.HERO_LEVEL, (e: { hero: HeroRow, skill: Skill }) => this.level(e.hero, e.skill));
        on(Event.HERO_LUCKY, (e: { hero: HeroRow, m: number, n: number }) => this.lucky(e.hero, e.m, e.n));
        on(Event.HERO_FIGHT, (e: { fight: { w: number } }) => { if (e.fight?.w) this.achieve("fight"); });
        on(Event.HERO_HIRED, () => this.heroes());
        on(Event.GUIDE, () => { if (IBC.data.player.guide == ALL_STEPS) this.achieve("steps"); });
        on(Event.CHEST_OPENED, (loot: ChestLoot) => this.chest(loot));
        on(Event.BOUNTY, () => { if (IBC.data.player.bounty?.w) this.achieve("bounty"); });
        on(Event.STREAK, (n: number) => { if (n >= 10) this.achieve("streak10"); });
        on(Event.EVENT_PAID, (m: any) => this.eventPaid(m));
        on(Event.ACHIEVEMENTS, () => this.catchUp());
        on(Event.ACHIEVED, (id: string) => this.achieved(id));
    }

    public destroy() {
        super.destroy();
        window.removeEventListener("pointerdown", this.press, true);
        this.container.destroy({ children: true });
    }

    public update() {
        if (!this.updatesAt || performance.now() < this.updatesAt) return;
        if (IBC.comp.getFirstByType(ComponentType.AWAY_SUMMARY) || IBC.comp.getFirstByType(ComponentType.TITLE)) return;
        this.updatesAt = 0;
        Updates.open();
    }

    //#region achievements

    // one seen done: said, if it's not had (or asked) already
    public achieve(id: string, quiet = false) {
        if (!this.loaded || IBC.data.player.achievements.has(id) || this.asked.has(id) || !achievementOf(id)) return;
        this.asked.add(id);
        if (quiet) this.quiet.add(id);
        IBC.net.player.achieve(id);
    }

    // (with signing in: those clearly done already, said quietly)
    private catchUp() {
        this.loaded = true;
        if (!IBC.data.heroes.heroes.length) store.set(Constants.LS_UPDATES_SEEN, UPDATE_NOTES[0].version);
        else if (UPDATE_NOTES.some((n) => n.big && Updates.isNew(n.version))) this.updatesAt = performance.now() + 2500;
        this.asked.clear();
        this.heroes(true);
        this.gold(true);
        this.piles(true);
        if (IBC.data.player.guide == ALL_STEPS) this.achieve("steps", true);
        if (IBC.data.player.daily.s >= 3) this.achieve("daily3", true);
        if (IBC.data.player.daily.s >= 7) this.achieve("daily7", true);
        for (const h of IBC.data.heroes.heroes) for (const level of h.d.k) this.levels(level, true);
    }

    private achieved(id: string) {
        this.asked.delete(id);
        const a = achievementOf(id);
        if (!a) return;
        if (this.quiet.delete(id)) {
            // (all those said as signing in: one banner, a moment after the last)
            this.quietCount++;
            const at = this.quietAt = performance.now();
            setTimeout(() => {
                if (this.quietAt != at) return;
                ScreenFx.banner(this.quietCount == 1 ? `Achievement: ${a.name}` : `${this.quietCount} achievements!`, this.quietCount == 1 ? a.text : "For what you've done already - see them in Achievements", AP.ORCHID, 3200);
                Sfx.achievement();
                this.quietCount = 0;
            }, 600);
            return;
        }
        ScreenFx.banner(`Achievement: ${a.name}`, a.text, AP.ORCHID, 3000);
        Sfx.achievement();
        ScreenFx.confetti(window.innerWidth / 2, ScreenFx.TOP + 30, 50);
        if (id.startsWith("gold")) this.coinShower(id == "gold10k" ? 90 : id == "gold1k" ? 60 : 35);
    }

    private heroes(quiet = false) {
        const n = IBC.data.heroes.heroes.length;
        if (n >= 1) this.achieve("hire", quiet);
        if (n >= 3) this.achieve("heroes3", quiet);
    }

    private gold(quiet = false) {
        const g = IBC.data.inventory.gold ?? 0;
        if (g >= 100) this.achieve("gold100", quiet);
        if (g >= 1000) this.achieve("gold1k", quiet);
        if (g >= 10000) this.achieve("gold10k", quiet);
    }

    private piles(quiet = false) {
        const most = Math.max(0, ...Array.from(IBC.data.inventory.items.values()).map((i) => i.amount));
        if (most >= 100) this.achieve("pile100", quiet);
        if (most >= 1000) this.achieve("pile1k", quiet);
    }

    private levels(level: number, quiet = false) {
        if (level >= 10) this.achieve("level10", quiet);
        if (level >= 25) this.achieve("level25", quiet);
        if (level >= 50) this.achieve("level50", quiet);
    }

    // coins falling from the gold, all across the top
    private coinShower(n: number) {
        const gold = IBC.comp.getFirstByType(ComponentType.GOLD_DISPLAY) as GoldDisplay;
        const x = gold ? gold.container.x + GoldDisplay.WIDTH * GoldDisplay.SCALE - 8 : window.innerWidth - 40;
        for (let i = 0; i < 6; i++) setTimeout(() => {
            ScreenFx.coins(x, 40, Math.round(n / 6));
            ScreenFx.burst(Math.random() * window.innerWidth, -10, { n: Math.round(n / 4), colors: [AP.AMBER, AP.STRAW, AP.WHITE], speed: 60, up: -40, fall: 500, ms: 1600, size: 2 });
            Sfx.coin();
        }, i * 160);
    }

    //#endregion

    //#region the moments

    // into the stash: a thing made of a quality (one of your heroes crafting it), and piles
    private gained(gained: [number, number][]) {
        this.piles();
        const now = performance.now(), making = new Set(IBC.data.heroes.heroes.map((h) => h.s.w).filter((w) => w?.k == TaskKind.CRAFT).map((w) => w.m));
        this.crafting.forEach((at, m) => { if (now - at < 15000) making.add(m); else this.crafting.delete(m); });
        let best = Quality.NORMAL, bestId = 0;
        for (const [id] of gained) {
            const q = qualityOf(id);
            if (q > best && making.has(baseItem(id))) { best = q; bestId = id; }
        }
        if (best == Quality.NORMAL) return;
        this.achieve(["", "fine", "superior", "masterwork"][best]);
        Sfx.quality(best);
        const tint = QUALITY_TINT[best], x = window.innerWidth - 120, y = 260;
        if (best == Quality.FINE) {
            ScreenFx.sparkle(x, y, 16, [tint, AP.WHITE]);
            return;
        }
        ScreenFx.banner(`${QUALITY_NAMES[best]}!`, itemName(bestId), tint, best == Quality.MASTERWORK ? 3600 : 2600);
        ScreenFx.sparkle(window.innerWidth / 2, ScreenFx.TOP + 30, 24, [tint, AP.WHITE]);
        if (best == Quality.MASTERWORK) {
            ScreenFx.flash(AP.STRAW, 700, 0.45);
            ScreenFx.confetti(window.innerWidth / 2, ScreenFx.TOP + 30, 100);
            for (let i = 0; i < 3; i++) setTimeout(() => ScreenFx.fireworks(window.innerWidth * (0.25 + 0.25 * i), 180 + (i % 2) * 60), 300 + i * 350);
        }
    }

    // a level: its banner, and what it opens up
    private level(hero: HeroRow, skill: Skill) {
        const level = hero.d.k[skill];
        if (level == null) return;
        this.levels(level);
        let sub = hero.d.n;
        if (GATHERING.includes(skill)) {
            const now = MATERIALS.filter((m) => gatherSkill(m.id) == skill && gatherLevel(m.id) == level).map((m) => m.name);
            if (now.length && level > 1) sub = `Now they can gather ${list(now)}`;
            else sub = `${hero.d.n} - new things at ${nextTier(level)}`;
        } else if (skill != Skill.FIGHTING && skill != Skill.SCOUTING) {
            sub = (level - 1) % TIER_SKILL == 0 && level > 1 ? `Tier ${Math.floor((level - 1) / TIER_SKILL) + 1} recipes unlocked!` : `${hero.d.n} - new recipes at ${nextTier(level)}`;
        }
        const big = (level - 1) % TIER_SKILL == 0 && level > 1;
        ScreenFx.banner(`${SKILL_NAMES[skill]} ${level}!`, sub, AP.STRAW, big ? 3400 : 2600);
        Sfx.levelUp();
        if (big) {
            ScreenFx.flash(AP.STRAW, 500, 0.3);
            ScreenFx.fireworks(window.innerWidth / 2, 170);
        }
    }

    private lucky(hero: HeroRow, m: number, n: number) {
        this.achieve("lucky");
        ScreenFx.banner("Lucky!", `${hero.d.n.split(" ")[0]} found ${n} more ${itemName(m)}`, AP.STRAW, 2200);
        Sfx.lucky();
        ScreenFx.sparkle(window.innerWidth / 2, ScreenFx.TOP + 30, 20, [AP.STRAW, AP.WHITE, AP.AMBER]);
    }

    private chest(loot: ChestLoot) {
        this.achieve("chest");
        if (loot.x) this.achieve("mimic");
        else if (loot.t == ChestTier.GOLDEN) this.achieve("golden");
        if ((loot.d ?? 0) >= 3) this.achieve("daily3");
        if ((loot.d ?? 0) >= 7) this.achieve("daily7");
        if (loot.t == ChestTier.GOLDEN || loot.x) ScreenFx.flash(AP.STRAW, 600, 0.35);
    }

    private eventPaid(m: { n: string, g: number, t?: [string, number][], k?: number }) {
        this.achieve("event");
        if (m.k >= 1 && m.k <= 3) this.achieve("eventtop");
        if (m.t?.length) ScreenFx.podium(m.n, m.t, m.k ?? 0, m.g);
    }

    //#endregion

}

// "Iron Ore", "Iron Ore and Oak Log", "Iron Ore, Oak Log and Wool"
function list(names: string[]) {
    return names.length <= 1 ? names.join("") : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

// the next level a tier opens at
function nextTier(level: number) {
    return 1 + TIER_SKILL * (Math.floor((level - 1) / TIER_SKILL) + 1);
}
