export class Constants {

    public static GUEST_SECONDS_TO_EXPIRY = 604800;
    public static ADVENTURER_TTL = 12 * 60 * 60 * 1000; // 12 hours

    public static RECRUIT_OPTION_TTL = 30 * 60 * 1000; // 30 minutes
    public static RECRUIT_FREE_LOCATION = 1; // Rockbarrow

    public static JSON_PATH = "../client/dist/assets/json/";

}

export enum Role {
    PLAYER, MODERATOR, EDITOR, ADMIN
}

export enum NodeType {
    OTHER, SETTLEMENT, DUNGEON
}

export enum TerrainType {
    WATER, AIR, GRASSLANDS, TUNDRA, OASIS, STEPPE, DESERT, SWAMP, MARSH, FOREST, HILLS, MOUNTAINS
}

// (the heroes rules, shared with the client)
export { Race, Sex } from "../../../shared/Heroes";