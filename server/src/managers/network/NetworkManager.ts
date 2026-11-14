import { IBS } from "../../app";
import { C2S } from "../../constants/Routes";
import { Player } from "../player/Player";
import { AdminHandler } from "./AdminHandler";
import { AdventurerHandler } from "./AdventurerHandler";
import { AnalyticsHandler } from "./AnalyticsHandler";
import { ChatHandler } from "./ChatHandler";
import { CosmeticHandler } from "./CosmeticHandler";
import { FeedbackHandler } from "./FeedbackHandler";
import { FriendHandler } from "./FriendHandler";
import { PartyHandler } from "./PartyHandler";
import { GuildHandler } from "./GuildHandler";
import { GameHandler } from "./GameHandler";
import { HeroHandler } from "./HeroHandler";
import { LeaderboardHandler } from "./LeaderboardHandler";
import { EventHandler } from "./EventHandler";
import { MarketHandler } from "./MarketHandler";
import { MailHandler } from "./MailHandler";
import { MapEdHandler } from "./MapEdHandler";
import { NoEdHandler } from "./NoEdHandler";
import { PlayerHandler } from "./PlayerHandler";
import { PremiumHandler } from "./PremiumHandler";
import { SeasonHandler } from "./SeasonHandler";
import { TradeHandler } from "./TradeHandler";
import { Log } from "../../utils/Log";

export class NetworkManager {

    private adventurer: AdventurerHandler = new AdventurerHandler();
    private hero: HeroHandler = new HeroHandler();
    private chat: ChatHandler = new ChatHandler();
    private friend: FriendHandler = new FriendHandler();
    private party: PartyHandler = new PartyHandler();
    private game: GameHandler = new GameHandler();
    private leaderboard: LeaderboardHandler = new LeaderboardHandler();
    private event: EventHandler = new EventHandler();
    public noEd: NoEdHandler = new NoEdHandler();
    public mapEd: MapEdHandler = new MapEdHandler();
    private premium: PremiumHandler = new PremiumHandler();
    private season: SeasonHandler = new SeasonHandler();
    private cosmetic: CosmeticHandler = new CosmeticHandler();
    private player: PlayerHandler = new PlayerHandler();
    private market: MarketHandler = new MarketHandler();
    private guild: GuildHandler = new GuildHandler();
    private analytics: AnalyticsHandler = new AnalyticsHandler();
    private feedback: FeedbackHandler = new FeedbackHandler();
    private trade: TradeHandler = new TradeHandler();
    private mail: MailHandler = new MailHandler();
    private admin: AdminHandler = new AdminHandler();

    // Every player's messages, however they're used: a bucket of MESSAGES_BURST
    // that fills at MESSAGES_A_SECOND. Past it what they send is dropped
    // unread (a modified client flooding the market, trades or the database),
    // and noted at most once a minute. Far above anything the game sends;
    // staff are left out (the node editor's undo held down).
    public static MESSAGES_BURST = 100;
    public static MESSAGES_A_SECOND = 20;
    private buckets = new WeakMap<Player, { left: number; at: number; dropped: number; told: number }>();

    public onMessage(player: Player, msg: any) {
        if (IBS.closing) return;        // (the server's stopping: nothing new started - Engine.shutdown)
        if (player.deleting) return;    // (their account's going: AccountManager)
        if (!this.allowed(player)) return;
        let message: any;
        try {
            message = JSON.parse(msg);
        } catch (e) {
            return;
        }
        const route = C2S[message?.r];
        if (typeof route != "string") return;
        IBS.analytics.track.used(player, route);
        try {
            this.route(route, player, message);
        } catch (e) {
            Log.error("Message error", e, { route, playerId: player.id });
        }
    }

    // whether one more message from them is taken (the bucket above)
    private allowed(player: Player) {
        if (player.canEdit()) return true;
        const now = Date.now();
        let b = this.buckets.get(player);
        if (!b) this.buckets.set(player, b = { left: NetworkManager.MESSAGES_BURST, at: now, dropped: 0, told: 0 });
        b.left = Math.min(NetworkManager.MESSAGES_BURST, b.left + (now - b.at) / 1000 * NetworkManager.MESSAGES_A_SECOND);
        b.at = now;
        if (b.left >= 1) {
            b.left--;
            return true;
        }
        b.dropped++;
        if (now - b.told >= 60 * 1000) {
            Log.warn("Too many messages: dropping", { playerId: player.id, dropped: b.dropped });
            b.told = now;
            b.dropped = 0;
        }
        return false;
    }

    private route(route: string, player: Player, message: any) {
        switch (route.substring(0, 3)) {
            case "ADV": this.adventurer.onMessage(player, message); break;
            case "HER": this.hero.onMessage(player, message); break;
            case "CHA": this.chat.onMessage(player, message); break;
            case "FRI": case "WHI": this.friend.onMessage(player, message); break;
            case "GAM": this.game.onMessage(player, message); break;
            case "LEA": this.leaderboard.onMessage(player, message); break;
            case "EVE": this.event.onMessage(player, message); break;
            case "NOE": this.noEd.onMessage(player, message); break;
            case "MAP": this.mapEd.onMessage(player, message); break;
            case "PRE": this.premium.onMessage(player, message); break;
            case "COS": this.cosmetic.onMessage(player, message); break;
            case "PLA": this.player.onMessage(player, message); break;
            case "MAR": this.market.onMessage(player, message); break;
            case "GUI": this.guild.onMessage(player, message); break;
            case "ANA": this.analytics.onMessage(player, message); break;
            case "FEE": this.feedback.onMessage(player, message); break;
            case "TRA": this.trade.onMessage(player, message); break;
            case "MAI": this.mail.onMessage(player, message); break;
            case "ADM": this.admin.onMessage(player, message); break;
            case "SEA": this.season.onMessage(player, message); break;
            case "PAR": this.party.onMessage(player, message); break;
        }
    }

}