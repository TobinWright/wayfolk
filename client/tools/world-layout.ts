// The world map's layout, read by eye off the reference picture
// (reference/world-ref.png: one 16px cell of it is one tile), in tile
// coordinates (x right, y down; the map is 192 x 144). The land, the
// desert and the snowy island come from the picture's colours; what it
// draws in ink (forests, mountains, the swamp, places) is here.
// render-world.js builds the map from both.

export type Pt = [number, number];

export type AreaKind = "forest" | "pines" | "dead" | "mountains" | "hills" | "swamp" | "ash";
export interface Area { kind: AreaKind; pts: Pt[]; }

export const AREAS: Area[] = [
    // the north-west: a range with a forest under it, pines along the coast
    { kind: "mountains", pts: [[26, 48], [30, 43], [37, 41], [45, 40], [51, 42], [50, 47], [44, 50], [38, 52], [31, 52]] },
    { kind: "forest", pts: [[22, 47], [28, 45], [36, 48], [44, 52], [46, 56], [40, 59], [30, 60], [23, 57]] },
    { kind: "forest", pts: [[17, 61], [22, 61], [28, 64], [27, 69], [20, 70], [17, 66]] },
    { kind: "pines", pts: [[30, 38], [38, 35], [48, 33], [56, 29], [60, 24], [63, 22], [65, 26], [63, 31], [57, 35], [48, 37], [38, 39]] },
    // the volcano on the north cape
    { kind: "ash", pts: [[66, 19], [72, 14], [78, 19], [77, 24], [67, 24]] },
    { kind: "pines", pts: [[77, 23], [81, 22], [85, 26], [84, 30], [79, 30]] },
    // the middle: a band of forest, the great central range
    { kind: "forest", pts: [[54, 58], [58, 53], [66, 50], [74, 53], [80, 58], [80, 62], [72, 58], [64, 56], [57, 61]] },
    { kind: "mountains", pts: [[82, 48], [90, 47], [98, 51], [106, 55], [110, 60], [118, 62], [124, 66], [128, 72], [124, 78], [118, 80], [110, 76], [104, 72], [98, 68], [92, 63], [86, 58], [82, 54]] },
    { kind: "pines", pts: [[105, 47], [115, 45], [125, 47], [135, 46], [138, 49], [132, 52], [124, 55], [114, 56], [107, 53]] },
    { kind: "forest", pts: [[92, 76], [97, 73], [103, 80], [109, 88], [111, 97], [106, 100], [100, 92], [94, 84]] },
    { kind: "forest", pts: [[81, 101], [90, 99], [99, 101], [103, 106], [101, 114], [92, 114], [84, 112], [81, 106]] },
    // round the lake
    { kind: "forest", pts: [[114, 80], [119, 78], [121, 86], [120, 96], [117, 102], [114, 96]] },
    { kind: "forest", pts: [[149, 59], [160, 58], [166, 62], [168, 72], [166, 84], [168, 100], [160, 100], [152, 92], [146, 84], [143, 74], [146, 64]] },
    { kind: "mountains", pts: [[133, 97], [140, 94], [146, 88], [155, 90], [151, 99], [149, 105], [140, 105], [134, 102]] },
    { kind: "hills", pts: [[108, 104], [115, 103], [121, 106], [119, 110], [111, 110]] },
    { kind: "forest", pts: [[118, 116], [124, 115], [126, 122], [124, 128], [119, 127]] },
    // the dead swamp in the south-east
    { kind: "swamp", pts: [[149, 102], [161, 101], [172, 103], [174, 108], [165, 114], [156, 120], [146, 126], [134, 126], [132, 119], [141, 112]] },
    { kind: "dead", pts: [[150, 104], [160, 103], [170, 104], [172, 108], [164, 112], [155, 118], [146, 124], [136, 124], [134, 119], [142, 113]] },
    // the southern peninsula
    { kind: "forest", pts: [[62, 93], [67, 91], [69, 96], [66, 99], [62, 98]] },
    { kind: "forest", pts: [[55, 104], [61, 102], [64, 107], [62, 114], [56, 112]] },
    { kind: "forest", pts: [[66, 111], [73, 108], [79, 111], [78, 116], [72, 114], [68, 120], [66, 130], [62, 127], [63, 118]] },
    // the desert island's woods
    { kind: "forest", pts: [[21, 88], [28, 85], [36, 86], [41, 90], [40, 96], [33, 99], [24, 97], [20, 93]] },
    { kind: "forest", pts: [[26, 108], [31, 103], [37, 103], [38, 107], [32, 112], [27, 112]] },
    { kind: "forest", pts: [[9, 104], [14, 105], [16, 112], [15, 119], [11, 120], [8, 112]] },
    { kind: "forest", pts: [[16, 119], [22, 117], [27, 120], [24, 126], [18, 127]] },
    // the snowy island's pines (drawn snowy there)
    { kind: "pines", pts: [[121, 27], [127, 25], [134, 27], [133, 31], [124, 31]] },
    { kind: "pines", pts: [[139, 24], [146, 23], [152, 24], [151, 27], [140, 27]] },
    { kind: "pines", pts: [[162, 29], [168, 28], [171, 31], [169, 34], [163, 34]] },
    { kind: "pines", pts: [[150, 36], [157, 35], [162, 37], [160, 41], [151, 41]] },
];

// rivers, from their springs to where they meet water
export const RIVERS: Pt[][] = [
    // the lake out to the southern bay, so its port reaches the sea
    [[132, 101], [127, 102], [124, 104], [124, 108], [118, 110], [112, 113], [104, 114]],
    // from the central range north to the coast
    [[108, 57], [107, 52], [105, 47], [104, 43]],
    // from the north-west range down to the inner sea
    [[41, 53], [42, 58], [44, 62]],
];

// the places drawn on the map, by kind; each its own sprite (places.png):
// its kind's, or `pic`, one of shared/Places.ts's PLACE_VARIANTS, for the second
// or third of a kind; and its name, shown over it on the map
export type PlaceKind = "village" | "town" | "castle" | "cathedral" | "fort" | "manor" | "farm" | "chapel" | "temple" | "steptemple" |
    "tower" | "darktower" | "watchtower" | "cave" | "mine" | "camp" | "hut" | "lair" | "ruins" | "stones" | "pyramids" | "crater" |
    "bigtree" | "signpost" | "icecastle" | "port" | "pier" | "bridge" | "altar" | "shrine" | "volcano" | "oasis";
// (id: its id in world.json and the travel graph, for a place added after the
// graph's waypoints were numbered; none: its place in this list, from 1)
export interface Place { kind: PlaceKind; x: number; y: number; name?: string; pic?: string; id?: number; }

export const PLACES: Place[] = [
    // the north-west
    { kind: "village", x: 23, y: 35, name: "Rockbarrow", pic: "rockbarrow" },
    { kind: "cave", x: 36, y: 52, name: "Hollowjaw Cavern" },
    { kind: "fort", x: 48, y: 45, name: "Fort Martale" },
    { kind: "camp", x: 47, y: 60, name: "Fellwood Camp", pic: "loggingcamp" },
    { kind: "village", x: 19, y: 58, name: "Thornbury" },
    { kind: "manor", x: 31, y: 69, name: "Ashgrove Hall" },
    // the north
    { kind: "volcano", x: 72, y: 18, name: "Mount Cinderhorn" },
    { kind: "temple", x: 71, y: 23, name: "Ancient Forge of Flame" },
    { kind: "town", x: 71, y: 41, name: "Dawnhill" },
    { kind: "lair", x: 84, y: 34, name: "Gnawbone Lair" },
    { kind: "farm", x: 100, y: 42, name: "Barleywick Farm" },
    { kind: "darktower", x: 138, y: 43, name: "Etophsis Tower" },
    // the middle
    { kind: "hut", x: 82, y: 51, name: "Witchbrook Hut" },
    { kind: "mine", x: 98, y: 64, name: "Dragontooth Mines" },
    { kind: "bigtree", x: 113, y: 58, name: "Kingsroot" },
    { kind: "crater", x: 140, y: 61, name: "The Starfall" },
    { kind: "signpost", x: 148, y: 53, name: "Wanderer's Cross" },
    { kind: "manor", x: 158, y: 57, name: "Vellacourt Estate", pic: "estate" },
    { kind: "chapel", x: 133, y: 69, name: "Saint Orrin's Chapel" },
    { kind: "camp", x: 114, y: 80, name: "Bramblewatch Camp" },
    // the lake and the east
    { kind: "town", x: 153, y: 82, name: "Luminmoor", pic: "lumintown" },
    { kind: "port", x: 120, y: 91, name: "Glassmere" },
    { kind: "pier", x: 123, y: 91, name: "Glassmere Quay" },
    { kind: "castle", x: 129, y: 105, name: "Castle Varrow" },
    { kind: "bridge", x: 124, y: 106, name: "Ebondun Bridge" },
    { kind: "mine", x: 149, y: 96, name: "Emberlet Mines", pic: "embermine" },
    { kind: "ruins", x: 172, y: 106, name: "Ruins of Hesk" },
    { kind: "altar", x: 148, y: 122, name: "Blackened Altar" },
    { kind: "watchtower", x: 126, y: 129, name: "Gravenwatch" },
    // the southern peninsula
    { kind: "tower", x: 71, y: 84, name: "Lanternspire" },
    { kind: "ruins", x: 57, y: 100, name: "Mossgate Ruins", pic: "overgrownruins" },
    { kind: "cathedral", x: 71, y: 104, name: "Highvault Cathedral" },
    { kind: "fort", x: 85, y: 99, name: "Stakewall", pic: "palisade" },
    { kind: "shrine", x: 91, y: 118, name: "Shrine of the Weeping Maid" },
    { kind: "farm", x: 43, y: 126, name: "Cobbleby Orchard", pic: "orchard" },
    { kind: "manor", x: 57, y: 135, name: "Gullhaven", pic: "gullhaven" },
    // the desert island
    { kind: "steptemple", x: 34, y: 84, name: "Sunstair Temple" },
    { kind: "chapel", x: 30, y: 96, name: "Saltwell Chapel", pic: "desertchapel" },
    { kind: "pyramids", x: 16, y: 102, name: "Tombs of the Sand Kings" },
    { kind: "stones", x: 41, y: 101, name: "The Whispering Stones" },
    { kind: "oasis", x: 22, y: 110, name: "Palmglass Oasis" },
    { kind: "hut", x: 7, y: 110, name: "Nomad's Rest", pic: "tent" },
    { kind: "camp", x: 29, y: 118, name: "Redsand Camp", pic: "desertcamp" },
    { kind: "cave", x: 15, y: 130, name: "Duneworm Hollow", pic: "sandcave" },
    // the snowy island
    { kind: "chapel", x: 118, y: 27, name: "Frostmere Kirk", pic: "stavechurch" },
    { kind: "farm", x: 130, y: 22, name: "Woolhollow", pic: "sheepfarm" },
    { kind: "castle", x: 159, y: 25, name: "Castle Hrimfell", pic: "snowcastle" },
    { kind: "village", x: 144, y: 34, name: "Skaldholm", pic: "snowvillage" },
    { kind: "icecastle", x: 170, y: 41, name: "The Rime Citadel" },
    // the start towns' gathering places (the user, 2026-10-31: "every starter
    // town needs the basic gather items nearby"), numbered after the graph's
    // waypoints (its nodes 50-163)
    { kind: "mine", x: 38, y: 40, name: "Copperdell Mine", pic: "coppermine", id: 164 },
    { kind: "pier", x: 27, y: 32, name: "Saltspray Jetty", pic: "jetty", id: 165 },
    { kind: "farm", x: 19, y: 44, name: "Hearthfield Croft", pic: "croft", id: 166 },
    { kind: "mine", x: 50, y: 134, name: "Tinmouth Mine", pic: "tinmine", id: 167 },
    { kind: "pier", x: 61, y: 138, name: "Gullhaven Wharf", pic: "wharf", id: 168 },
    { kind: "camp", x: 64, y: 124, name: "Thornwood Camp", pic: "huntcamp", id: 169 },
];
