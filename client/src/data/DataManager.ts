import { ChatData } from "./ChatData";
import { CosmeticsData } from "./CosmeticsData";
import { EventsData } from "./EventsData";
import { SightsData } from "./SightsData";
import { FriendsData } from "./FriendsData";
import { GuildData } from "./GuildData";
import { HeroesData } from "./HeroesData";
import { InventoryData } from "./InventoryData";
import { LocationData } from "./LocationData";
import { NodeData } from "./NodeData";
import { PartiesData } from "./PartiesData";
import { PlayerData } from "./PlayerData";
import { PremiumData } from "./PremiumData";
import { RecruitData } from "./RecruitData";
import { SeasonData } from "./SeasonData";

export class DataManager {

    public player: PlayerData = new PlayerData();
    public premium: PremiumData = new PremiumData();
    public cosmetics: CosmeticsData = new CosmeticsData();
    public heroes: HeroesData = new HeroesData();
    public chat: ChatData = new ChatData();
    public events: EventsData = new EventsData();
    public sights: SightsData = new SightsData();
    public friends: FriendsData = new FriendsData();
    public parties: PartiesData = new PartiesData();
    public guilds: GuildData = new GuildData();
    public inventory: InventoryData = new InventoryData();
    public locations: LocationData = new LocationData();
    public nodes: NodeData = new NodeData();
    public recruits: RecruitData = new RecruitData();
    public season: SeasonData = new SeasonData();

}