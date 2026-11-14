import { Engine } from "../Engine";
import { ErrorReporting } from "../utils/ErrorReporting";
import { IdGenerator } from "../utils/IdGenerator";
import { BaseComponent, ComponentType } from "./BaseComponent";
import { AdminMenu } from "./adminmenu/AdminMenu";
import { AdminPanel } from "./adminpanel/AdminPanel";
import { DemoMode } from "./demomode/DemoMode";
import { Analytics } from "./analytics/Analytics";
import { CosmeticEditor } from "./cosmeticeditor/CosmeticEditor";
import { Adventurers } from "./adventurers/Adventurers";
import { Chat } from "./chat/Chat";
import { Friends } from "./friends/Friends";
import { Parties } from "./parties/Parties";
import { Guild } from "./guild/Guild";
import { ChoicePrompt } from "./choiceprompt/ChoicePrompt";
import { GoldDisplay } from "./golddisplay/GoldDisplay";
import { HeroWindow } from "./herowindow/HeroWindow";
import { HeroBoard } from "./heroboard/HeroBoard";
import { HeroRoster } from "./heroroster/HeroRoster";
import { Inventory } from "./inventory/Inventory";
import { MainMenu } from "./mainmenu/MainMenu";
import { Map } from "./map/Map";
import { NodeEditor } from "./nodeeditor/NodeEditor";
import { MapEditor } from "./mapeditor/MapEditor";
import { GameButton } from "./games/GameButton";
import { RingMenu } from "./ringmenu/RingMenu";
import { TaskPlanner } from "./taskplanner/TaskPlanner";
import { HeroStatus } from "./herostatus/HeroStatus";
import { HeroCosmetics } from "./herocosmetics/HeroCosmetics";
import { HeroJournal } from "./herojournal/HeroJournal";
import { HeroChoice } from "./herochoice/HeroChoice";
import { Feedback } from "./feedback/Feedback";
import { MoreMenu } from "./moremenu/MoreMenu";
import { Updates } from "./updates/Updates";
import { ItemInfo } from "./iteminfo/ItemInfo";
import { ItemToasts } from "./itemtoasts/ItemToasts";
import { ScreenFx } from "./fx/ScreenFx";
import { Delight } from "./fx/Delight";
import { BountyBox } from "./bountybox/BountyBox";
import { Achievements } from "./achievements/Achievements";
import { LootChest } from "./lootchest/LootChest";
import { TaskAmount } from "./taskamount/TaskAmount";
import { LocationInfo } from "./locationinfo/LocationInfo";
import { Title } from "./title/Title";
import { Games } from "./games/Games";
import { Game } from "../../../shared/Games";
import { GameRooms } from "./games/GameRooms";
import { Blackjack } from "./games/blackjack/Blackjack";
import { SlimeRace } from "./games/race/SlimeRace";
import { Leaderboards } from "./leaderboards/Leaderboards";
import { Premium } from "./premium/Premium";
import { EventInfo } from "./eventinfo/EventInfo";
import { SightInfo } from "./sightinfo/SightInfo";
import { EventsWindow } from "./events/EventsWindow";
import { Settings } from "./settings/Settings";
import { Market } from "./market/Market";
import { Trade } from "./trade/Trade";
import { Mail } from "./mail/Mail";
import { TradeAsk } from "./trade/TradeAsk";
import { PartyAskBox } from "./parties/PartyAskBox";
import { AwaySummary } from "./awaysummary/AwaySummary";
import { GuideBox } from "./guide/GuideBox";
import { Encyclopedia } from "./encyclopedia/Encyclopedia";
import { Profile } from "./profile/Profile";

export class ComponentManager {

    private engine: Engine;

    public ids: IdGenerator = new IdGenerator();
    public zIndices: IdGenerator = new IdGenerator();
    public components: BaseComponent[] = [];
    private updateErrors = new Set<string>();   // (each told of once)
    private fading = new globalThis.Map<BaseComponent, number>();  // (windows just opened, fading in: when)
    public static FADE_MS = 140;
    // the windows that fade in as they open (the user, 2026-11-05: windows felt like they just appeared)
    public static FADES = new Set<ComponentType>([
        ComponentType.ADVENTURERS, ComponentType.INVENTORY, ComponentType.HERO_BOARD, ComponentType.TASK_PLANNER, ComponentType.HERO_STATUS,
        ComponentType.FRIENDS, ComponentType.LOCATION_INFO, ComponentType.TASK_AMOUNT, ComponentType.GAMES, ComponentType.GAME_ROOMS,
        ComponentType.BLACKJACK, ComponentType.LEADERBOARDS, ComponentType.PREMIUM, ComponentType.EVENT_INFO, ComponentType.HERO_COSMETICS,
        ComponentType.SETTINGS, ComponentType.MARKET, ComponentType.AWAY_SUMMARY, ComponentType.GUILD_WINDOW, ComponentType.ENCYCLOPEDIA,
        ComponentType.HERO_JOURNAL, ComponentType.TRADE_ASK, ComponentType.TRADE, ComponentType.MAIL, ComponentType.EVENTS,
        ComponentType.SIGHT_INFO, ComponentType.FEEDBACK, ComponentType.UPDATES, ComponentType.PROFILE, ComponentType.SLIME_RACE,
        ComponentType.PARTIES, ComponentType.ACHIEVEMENTS,
    ]);

    constructor(engine: Engine) {
        this.engine = engine;
    }

    public update(deltaTime: number) {
        const now = performance.now();
        this.fading.forEach((at, component) => {
            if (!component.container) return;
            const k = (now - at) / ComponentManager.FADE_MS;
            component.container.alpha = Math.min(1, Math.max(0.05, k));
            if (k >= 1) this.fading.delete(component);
        });
        for (let i = 0; i < this.components.length; i++) {
            const component = this.components[i];
            // (one throwing is told of once and skipped, not everything stopped)
            try {
                component.update(deltaTime);
            } catch (error) {
                const key = `${component.type}: ${error}`;
                if (this.updateErrors.has(key)) continue;
                this.updateErrors.add(key);
                ErrorReporting.report(error, { component: component.type });
            }
        }
    }

    public create(type: ComponentType) {
        let newComponent: BaseComponent;
        switch (type) {
            case ComponentType.MAP: newComponent = new Map(); break;
            case ComponentType.TITLE: newComponent = new Title(); break;
            case ComponentType.GOLD_DISPLAY: newComponent = new GoldDisplay(); break;
            case ComponentType.CHAT: newComponent = new Chat(); break;
            case ComponentType.CHOICE_PROMPT: newComponent = new ChoicePrompt(); break;
            case ComponentType.ADVENTURERS: newComponent = new Adventurers(); break;
            case ComponentType.INVENTORY: newComponent = new Inventory(); break;
            case ComponentType.NODE_EDITOR: newComponent = new NodeEditor(); break;
            case ComponentType.MAP_EDITOR: newComponent = new MapEditor(); break;
            case ComponentType.BLACKJACK_BUTTON: newComponent = new GameButton(type, Game.BLACKJACK, 3); break;
            case ComponentType.SLIME_RACE_BUTTON: newComponent = new GameButton(type, Game.SLIME_RACE, 4); break;
            case ComponentType.MAIN_MENU: newComponent = new MainMenu(); break;
            case ComponentType.ADMIN_MENU: newComponent = new AdminMenu(); break;
            case ComponentType.HERO_WINDOW: newComponent = new HeroWindow(); break;
            case ComponentType.RING_MENU: newComponent = new RingMenu(); break;
            case ComponentType.HERO_BOARD: newComponent = new HeroBoard(); break;
            case ComponentType.HERO_ROSTER: newComponent = new HeroRoster(); break;
            case ComponentType.TASK_PLANNER: newComponent = new TaskPlanner(); break;
            case ComponentType.HERO_STATUS: newComponent = new HeroStatus(); break;
            case ComponentType.FRIENDS: newComponent = new Friends(); break;
            case ComponentType.PARTIES: newComponent = new Parties(); break;
            case ComponentType.PARTY_ASK: newComponent = new PartyAskBox(); break;
            case ComponentType.LOCATION_INFO: newComponent = new LocationInfo(); break;
            case ComponentType.HERO_COSMETICS: newComponent = new HeroCosmetics(); break;
            case ComponentType.COSMETIC_EDITOR: newComponent = new CosmeticEditor(); break;
            case ComponentType.ITEM_INFO: newComponent = new ItemInfo(); break;
            case ComponentType.TASK_AMOUNT: newComponent = new TaskAmount(); break;
            case ComponentType.GAMES: newComponent = new Games(); break;
            case ComponentType.GAME_ROOMS: newComponent = new GameRooms(); break;
            case ComponentType.BLACKJACK: newComponent = new Blackjack(); break;
            case ComponentType.SLIME_RACE: newComponent = new SlimeRace(); break;
            case ComponentType.LEADERBOARDS: newComponent = new Leaderboards(); break;
            case ComponentType.PREMIUM: newComponent = new Premium(); break;
            case ComponentType.EVENT_INFO: newComponent = new EventInfo(); break;
            case ComponentType.EVENTS: newComponent = new EventsWindow(); break;
            case ComponentType.SIGHT_INFO: newComponent = new SightInfo(); break;
            case ComponentType.SETTINGS: newComponent = new Settings(); break;
            case ComponentType.MARKET: newComponent = new Market(); break;
            case ComponentType.AWAY_SUMMARY: newComponent = new AwaySummary(); break;
            case ComponentType.GUIDE: newComponent = new GuideBox(); break;
            case ComponentType.ITEM_TOASTS: newComponent = new ItemToasts(); break;
            case ComponentType.SCREEN_FX: newComponent = new ScreenFx(); break;
            case ComponentType.DELIGHT: newComponent = new Delight(); break;
            case ComponentType.BOUNTY_BOX: newComponent = new BountyBox(); break;
            case ComponentType.ACHIEVEMENTS: newComponent = new Achievements(); break;
            case ComponentType.LOOT_CHEST: newComponent = new LootChest(); break;
            case ComponentType.GUILD_WINDOW: newComponent = new Guild(); break;
            case ComponentType.ENCYCLOPEDIA: newComponent = new Encyclopedia(); break;
            case ComponentType.HERO_JOURNAL: newComponent = new HeroJournal(); break;
            case ComponentType.ANALYTICS: newComponent = new Analytics(); break;
            case ComponentType.TRADE_ASK: newComponent = new TradeAsk(); break;
            case ComponentType.TRADE: newComponent = new Trade(); break;
            case ComponentType.MAIL: newComponent = new Mail(); break;
            case ComponentType.ADMIN_PANEL: newComponent = new AdminPanel(); break;
            case ComponentType.DEMO_MODE: newComponent = new DemoMode(); break;
            case ComponentType.HERO_CHOICE: newComponent = new HeroChoice(); break;
            case ComponentType.FEEDBACK: newComponent = new Feedback(); break;
            case ComponentType.MORE_MENU: newComponent = new MoreMenu(); break;
            case ComponentType.UPDATES: newComponent = new Updates(); break;
            case ComponentType.PROFILE: newComponent = new Profile(); break;
        }
        this.components.push(newComponent);
        this.engine.net?.analytics?.opened(type);
        if (ComponentManager.FADES.has(type)) {
            this.fading.set(newComponent, performance.now());
            if (newComponent.container) newComponent.container.alpha = 0.05;
        }
        return newComponent;
    }

    public destroy(component: BaseComponent) {
        this.fading.delete(component);
        for (let i = 0; i < this.components.length; i++) {
            if (this.components[i] == component) {
                const comp = this.components.splice(i, 1)[0];
                comp.destroy();
                break;
            }
        }
    }

    public resize() {
        for (let i = 0; i < this.components.length; i++)
            this.components[i].resize();
    }

    public getOrCreate(type: ComponentType) {
        let comp = this.getFirstByType(type);
        if (!comp) comp = this.create(type);
        return comp;
    }

    public getFirstByType(type: ComponentType) {
        for (let i = 0; i < this.components.length; i++)
            if (this.components[i].type == type)
                return this.components[i];
        return null;
    }

    public getAllByType(type: ComponentType) {
        const comp = [];
        for (let i = 0; i < this.components.length; i++)
            if (this.components[i].type == type)
                comp.push(this.components[i]);
        return comp;
    }

    public getById(id: number) {
        for (let i = 0; i < this.components.length; i++)
            if (this.components[i].id == id)
                return this.components[i];
        return null;
    }

}
