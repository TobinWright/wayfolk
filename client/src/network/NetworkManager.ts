import { Engine } from "../Engine";
import { Constants } from "../constants/Constants";
import { Event } from "../constants/Events";
import { C2S, S2C } from "../constants/Routes";
import { Utils } from "../utils/Utils";
import { AdventurerHandler } from "./AdventurerHandler";
import { AdminHandler } from "./AdminHandler";
import { AnalyticsHandler } from "./AnalyticsHandler";
import { ChatHandler } from "./ChatHandler";
import { CosmeticHandler } from "./CosmeticHandler";
import { EventHandler } from "./EventHandler";
import { FriendHandler } from "./FriendHandler";
import { PartyHandler } from "./PartyHandler";
import { GameHandler } from "./GameHandler";
import { GuildHandler } from "./GuildHandler";
import { HeroHandler } from "./HeroHandler";
import { LeaderboardHandler } from "./LeaderboardHandler";
import { MarketHandler } from "./MarketHandler";
import { NoEdHandler } from "./NoEdHandler";
import { MapEdHandler } from "./MapEdHandler";
import { PlayerHandler } from "./PlayerHandler";
import { PremiumHandler } from "./PremiumHandler";
import { Reconnect } from "./Reconnect";
import { TitleHandler } from "./TitleHandler";
import { TradeHandler } from "./TradeHandler";
import { MailHandler } from "./MailHandler";
import { SeasonHandler } from "./SeasonHandler";
import { FeedbackHandler } from "./FeedbackHandler";

export class NetworkManager {

    private engine: Engine;
    private client: WebSocket;
    private transactions: C2S[] = [];

    public connected = false;           // the socket's open
    public wasConnected = false;        // (it has been: lost since, it's "Disconnected", not "Offline")
    public leaving = false;             // (the page is going: its socket closing isn't the connection lost)
    private reconnect = new Reconnect();

    public title: TitleHandler;
    public adventurer: AdventurerHandler;
    public hero: HeroHandler;
    public chat: ChatHandler;
    public event: EventHandler;
    public friend: FriendHandler;
    public party: PartyHandler;
    public game: GameHandler;
    public leaderboard: LeaderboardHandler;
    public noEd: NoEdHandler;
    public mapEd: MapEdHandler;
    public premium: PremiumHandler;
    public cosmetic: CosmeticHandler;
    public player: PlayerHandler;
    public market: MarketHandler;
    public guild: GuildHandler;
    public analytics: AnalyticsHandler;
    public trade: TradeHandler;
    public mail: MailHandler;
    public admin: AdminHandler;
    public season: SeasonHandler;
    public feedback: FeedbackHandler;

    constructor(engine: Engine) {
        this.engine = engine;

        this.title = new TitleHandler();
        this.adventurer = new AdventurerHandler();
        this.hero = new HeroHandler();
        this.chat = new ChatHandler();
        this.event = new EventHandler();
        this.friend = new FriendHandler();
        this.party = new PartyHandler();
        this.game = new GameHandler();
        this.leaderboard = new LeaderboardHandler();
        this.noEd = new NoEdHandler();
        this.mapEd = new MapEdHandler();
        this.premium = new PremiumHandler();
        this.cosmetic = new CosmeticHandler();
        this.player = new PlayerHandler();
        this.market = new MarketHandler();
        this.guild = new GuildHandler();
        this.analytics = new AnalyticsHandler();
        this.trade = new TradeHandler();
        this.mail = new MailHandler();
        this.admin = new AdminHandler();
        this.season = new SeasonHandler();
        this.feedback = new FeedbackHandler();
    }

    public connectToServer() {
        this.client = new WebSocket(Constants.SERVER_ADDRESS);
        this.client.onopen = (event: any) => {
            console.log("Server: Connected...");
            this.connected = this.wasConnected = true;
            this.engine.events.emit(Event.NETWORK_CONNECTED);
        };
        this.client.onclose = (event: CloseEvent) => {
            console.log(`Server: Disconnected (${event.code})...`);
            this.connected = false;
            if (this.leaving) return;
            this.trade.lost();
            this.party.lost();
            this.engine.events.emit(Event.NETWORK_DISCONNECTED);
            this.reconnect.lost(event.code, this.wasConnected);
        };
        window.addEventListener("pagehide", () => this.leaving = true);
        this.client.onmessage = (event: any) => {
            var message = JSON.parse(event.data);
            Reconnect.matched();
            Utils.logMessage(message);

            switch (S2C[message.r].substring(0, 3)) {
                case "TIT": this.title.onMessage(message); break;
                case "ADV": this.adventurer.onMessage(message); break;
                case "HER": this.hero.onMessage(message); break;
                case "CHA": this.chat.onMessage(message); break;
                case "EVE": this.event.onMessage(message); break;
                case "FRI": case "WHI": this.friend.onMessage(message); break;
                case "GAM": this.game.onMessage(message); break;
                case "LEA": this.leaderboard.onMessage(message); break;
                case "NOE": this.noEd.onMessage(message); break;
                case "MAP": this.mapEd.onMessage(message); break;
                case "PRE": this.premium.onMessage(message); break;
                case "COS": this.cosmetic.onMessage(message); break;
                case "PLA": this.player.onMessage(message); break;
                case "MAR": this.market.onMessage(message); break;
                case "GUI": this.guild.onMessage(message); break;
                case "ANA": this.analytics.onMessage(message); break;
                case "TRA": this.trade.onMessage(message); break;
                case "MAI": this.mail.onMessage(message); break;
                case "ADM": this.admin.onMessage(message); break;
                case "SEA": this.season.onMessage(message); break;
                case "FEE": this.feedback.onMessage(message); break;
                case "PAR": this.party.onMessage(message); break;
            }
        };
    }

    public addTransaction(type: C2S) {
        this.transactions.push(type);
        console.log("Added Transaction: " + C2S[type]);
    }

    public removeTransaction(type: C2S) {
        for (var i = 0; i < this.transactions.length; i++) {
            if (this.transactions[i] == type) {
                this.transactions.splice(i, 1);
                console.log("Removed Transaction: " + C2S[type]);
                break;
            }
        }
    }

    public hasTransaction(type: C2S) {
        for (var i = 0; i < this.transactions.length; i++)
            if (this.transactions[i] == type)
                return true;
        return false;
    }

    public isBusy() {
        return this.transactions.length > 0;
    }

    public send(data: any) {
        if (!this.client) return;
        this.client.send(JSON.stringify(data));
    }

}