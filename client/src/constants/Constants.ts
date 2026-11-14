import { PROTOCOL } from "../../../shared/Protocol";

export class Constants {

    public static SERVER_PROTOCOL = location.protocol == "https:" ? "wss://" : "ws://";     // (from an https page, only wss is let through)
    public static SERVER_IP = __SERVER_IP__;        // (given at build time: client/webpack.config.js)
    public static SERVER_PORT = __SERVER_PORT__;
    public static SERVER_PATH = __SERVER_PATH__;    // ("/", or where the proxy passes it on: "/ws")
    // (with the messages' version: a server built from other Routes closes it, shared/Protocol.ts)
    public static SERVER_ADDRESS = Constants.SERVER_PROTOCOL + Constants.SERVER_IP + ":" + Constants.SERVER_PORT + Constants.SERVER_PATH + "?v=" + encodeURIComponent(PROTOCOL);


    public static JSON_PATH = "assets/json/";
    public static COMP_PATH = "assets/components/";
    public static FONTS_PATH = "assets/fonts/";
    public static AUDIO_PATH = "assets/audio/";
    public static SYSTEM_PATH = "assets/system/";
    public static IMAGES_PATH = "assets/images/";

    // the other menu's Discord (the user, 2026-11-01: Lithalia's server for now, till Wayfolk has its own; it never runs out)
    public static DISCORD_INVITE = "https://discord.gg/hTYfP4NGRR";

    public static PIXEL_FONT = "PixelFont";
    public static NUMBER_FONT = "NumberFont";

    // local storage
    public static LS_GUEST_LOGIN = "wf_guestLogin";
    public static LS_GUEST_PASSWORD = "wf_guestPassword";
    public static LS_REMEMBER = "wf_remember";    // ("remember me": signs this browser straight in, server auth/Tokens)
    public static LS_EMAIL = "wf_email";          // (the last email typed on the title screen)
    public static LS_SOUND = "wf_sound";          // (utils/Sound)
    public static LS_EFFECTS = "wf_effects";      // (reduce flashing and shaking: utils/Effects)
    public static LS_CHAT_SWEARING = "wf_chatSwearing";     // ("shown" or "hidden": data/ChatData)
    public static LS_UPDATES_SEEN = "wf_updatesSeen";     // (the newest patch note read: components/updates)
    public static LS_HERO_SORT = "wf_heroSort";   // (how the Heroes window sorts them: components/adventurers)

    // session storage (this tab's)
    public static SS_SESSION = "wf_session";      // (not remembered: this tab's session token, to sign back in after the connection drops)
    public static SS_RESUME = "wf_resume";        // (the page loaded again by network/Reconnect: sign back in with it)
    public static SS_VERSION_RELOAD = "wf_version_reload";  // (loaded again for a new version once already: network/Reconnect)

    public static RECRUIT_FREE_LOCATION = 1; // Rockbarrow

}

export enum Role {
    PLAYER, MODERATOR, EDITOR, ADMIN
}

export enum AccountType {
    EMAIL, GUEST
}

export enum NodeType {
    OTHER, SETTLEMENT, DUNGEON
}

export enum TerrainType {
    WATER, AIR, GRASSLANDS, TUNDRA, OASIS, STEPPE, DESERT, SWAMP, MARSH, FOREST, HILLS, MOUNTAINS
}

export enum Race {
    HUMAN, ELVEN, DWARVEN, DAEMON
}

export enum Sex {
    MALE, FEMALE
}