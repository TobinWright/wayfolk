import { Constants } from "./Constants";
import { worldSeasonAt } from "../../../shared/Seasons";
import { tilesetFile } from "../art/Seasonal";

export class Assets {

    public static MANIFEST = {
        bundles: [
            {
                name: "boot",
                assets: [
                    { name: "icon-guest", srcs: Constants.SYSTEM_PATH + "icons/guest.png" },
                    { name: "icon-email", srcs: Constants.SYSTEM_PATH + "icons/email.png" },
                    { name: "icon-google", srcs: Constants.SYSTEM_PATH + "icons/google.png" },
                    { name: "icon-move", srcs: Constants.SYSTEM_PATH + "icons/move.png" },
                    { name: "icon-cross", srcs: Constants.SYSTEM_PATH + "icons/cross.png" },
                    { name: "icon-cross-blue", srcs: Constants.SYSTEM_PATH + "icons/cross-blue.png" },
                    { name: "icon-arrow-left", srcs: Constants.SYSTEM_PATH + "icons/arrow-left.png" },
                    { name: "icon-arrow-right", srcs: Constants.SYSTEM_PATH + "icons/arrow-right.png" },
                    { name: "icon-arrow-down", srcs: Constants.SYSTEM_PATH + "icons/arrow-down.png" },
                    { name: "system-icons-skills", srcs: Constants.SYSTEM_PATH + "icons-skills.png" },
                    { name: "debug-sprite", srcs: Constants.SYSTEM_PATH + "debug-sprite.png" }, // DEBUG

                    { name: "json-tileset", srcs: Constants.JSON_PATH + "tileset.json" },
                    { name: "json-locations", srcs: Constants.JSON_PATH + "locations.json" },
                    { name: "font-pixel", srcs: Constants.FONTS_PATH + "PixelFont.xml" },
                    { name: "font-number", srcs: Constants.FONTS_PATH + "NumberFont.xml" },

                    { name: "map-world", srcs: Constants.JSON_PATH + "world.json" },
                    // (the season's: art/Seasonal; the map loads the next as the season turns)
                    { name: "map-tileset", srcs: Constants.IMAGES_PATH + "tilesets/" + tilesetFile(worldSeasonAt(Date.now()).k) },
                    { name: "map-places", srcs: Constants.IMAGES_PATH + "sprites/places.png" },

                    { name: "title-logo", srcs: Constants.COMP_PATH + "title/logo.png" },

                    { name: "recruit-frame", srcs: Constants.COMP_PATH + "recruit/frame.png" },
                    { name: "recruit-icon-refresh", srcs: Constants.COMP_PATH + "recruit/icon-refresh.png" },
                ]
            }
        ]
    }

}