import { CompositeTilemap } from "@pixi/tilemap";
import * as PIXI from "pixi.js";
import { worldSeasonAt } from "../../../../shared/Seasons";
import { PLACE_PICS } from "../../../../shared/Places";
import { tilesetFile } from "../../art/Seasonal";
import { IBC } from "../../Engine";
import { tentTexture } from "../../art/CampArt";
import { PLACE_KINDS } from "../../art/PlaceArt";
import { Constants } from "../../constants/Constants";
import { Event } from "../../constants/Events";
import { AP } from "../../constants/Palette";
import { Facing } from "../../people/AvatarArt";
import { personTexture, shadowTexture, sittingTexture } from "../../people/People";
import { BaseComponent, ComponentType } from "../BaseComponent";
import { Chat } from "../chat/Chat";
import { HeroWindow } from "../herowindow/HeroWindow";
import { LocationInfo } from "../locationinfo/LocationInfo";
import { Camera } from "./Camera";
import { FriendMarkers } from "./FriendMarkers";
import { PartyMarkers } from "./PartyMarkers";
import { FeaturedMarkers } from "./FeaturedMarkers";
import { facingOf, Glide, glideFace, heroWalk, partyIds, personAt, stationary, tentAt, wandering } from "./Wander";
import { Campfires, campNight } from "./Campfires";
import { Overheads } from "./Overheads";
import { Gains } from "./Gains";
import { MapDecor } from "./MapDecor";
import { displayFont } from "../../art/DisplayFont";
import { footWidth, placeShadowTexture, SHADOW_DX } from "../../art/PlaceShadows";
import { HeroRow } from "../../data/HeroesData";
import { MapMusic } from "./MapMusic";
import { MapSounds } from "./MapSounds";
import { MapWeather } from "./MapWeather";
import { MapLife } from "./MapLife";
import { MapSky } from "./MapSky";
import { MapLand } from "./MapLand";
import { MapLandmarks } from "./MapLandmarks";
import { EventBubbles } from "./EventBubbles";
import { EventMarkers } from "./EventMarkers";
import { EventScenes } from "./EventScenes";
import { MapSights } from "./MapSights";
import { EventSites } from "./EventSites";

// the world map as tools/render-world.js writes it (assets/json/world.json)
interface WorldJson {
    // (not "frames": Pixi's loader would take a JSON with frames for a spritesheet)
    w: number; h: number; tile: number; columns: number; animFrames: number;
    anim: number[]; // the animated tiles (their first frame; the others follow it in the sheet)
    placeSize: number;
    layers: { n: string; d: number[] }[]; // each layer's tiles as runs of [tile, count], -1 none
    places: { i: number; k: number; s: number; x: number; y: number; n: string }[]; // k: its kind (PLACE_KINDS), s: its sprite (PLACE_PICS)
}

export class Map extends BaseComponent {

    // tiles per side of a piece of the map (each its own tilemap, so pieces
    // off the screen aren't drawn)
    public static CHUNK = 32;
    public static FRAME_MS = 250;
    public static LABEL_SCALE = 2;      // screen px a px of a place's name
    public static FLAT_PICS: string[] = ["stones", "crater", "oasis"];    // places lying flat on the ground, with no shadow
    public static FEET = 6;             // map px under a node a hero stands
    public static BELOW = 6;            // map px under their feet a window under them starts (past the others at an event: EventScenes SPOTS)
    public static MARKER_SCALE = 0.5;   // a hero on the map, half their size in their window (the user, 2026-10-28)
    public static HEAD = 13;            // map px from a hero's feet up to the top of their head
    public static TENT_TOP = 7;         // map px from a resting hero's feet up to the top of their tent
    public static SIT_TOP = 11;         // to the top of the head of one sitting by a campfire
    public static SIDE = 6;           // map px apart heroes standing on the same node stand
    public static STEP_MS = 150;        // a walking frame
    public static PAN_SPEED = 800;      // screen px a second the keys move it
    public static CLICK_SLOP = 5;       // screen px the pointer can move between down and up and still be a click
    private static WALK = [1, 0, 2, 0];

    public camera: Camera;

    public world: WorldJson;
    public width: number = 0;
    public height: number = 0;
    public places: PIXI.Container;

    private frame: number = 0;
    private frameTime: number = 0;
    private chunks: PIXI.Container[] = [];      // (the tilemaps, CHUNK x CHUNK tiles each)
    private decor = new MapDecor();             // (over them)
    private cells: Int32Array[];                // (each layer's tiles, row by row; -1 none)
    private sheet: PIXI.BaseTexture;
    private textures: PIXI.Texture[] = [];
    private tileSeason = worldSeasonAt(Date.now()).k;    // (the season the tiles are drawn for: art/Seasonal)
    private loadingSeason = false;

    public isPointerDown: boolean = false;
    public lastPointerX: number = 0;
    public lastPointerY: number = 0;
    public lastMapX: number = 0;
    public lastMapY: number = 0;
    private downAt: { x: number, y: number };   // where the pointer went down on it (a click opens a place)
    private label: PIXI.Container;      // the name of the place pointed at, over it
    private labelText: PIXI.BitmapText;
    private labelBox: PIXI.Graphics;
    private pointed: WorldJson["places"][number];
    private markers: PIXI.Container;    // your heroes where they are, each with their window over them (HeroWindow)
    private heroSprites: { [heroId: number]: { person: PIXI.Sprite, shadow: PIXI.Sprite, fire: PIXI.Sprite, glide: Glide } } = {};
    private weather: MapWeather;        // day and night, and rain, over it all but the names
    private music: MapMusic;            // a tune by day, another by night
    private sounds: MapSounds;          // waves, birds, crickets, wind, thunder... by what's in view
    private life: MapLife;              // wagons, ships, animals, smoke and the like (only for looks)
    private sky: MapSky;                // shooting stars, the northern lights, a red sky, dawn fog
    private land: MapLand;              // windmills, waves, gusts, lava, fields
    private landmarks: MapLandmarks;    // busy places, a boss's shadow, the champions' monuments
    private friendMarkers: FriendMarkers;   // friends' heroes (your favourites', and one found)
    private partyMarkers: PartyMarkers;     // the others in your heroes' parties, whoever's they are
    private featuredMarkers: FeaturedMarkers;   // the featured parties (anyone's, a few at a time)
    private campfires: Campfires;           // those resting at night round their party's fire
    private overheads: Overheads;           // what heroes are up to over their heads, and fights' puffs
    private gains: Gains;                   // what yours get rising off them, and their level-ups
    private eventMarkers: EventMarkers;     // stars where events' boons are
    private eventBubbles: EventBubbles;     // a bubble over each place where an event's on: its name and how far it's got
    private eventScenes: EventScenes;       // heroes at work at the events (and the bosses they fight)
    private sites: EventSites;              // what events show round their places: building going up, a fair, a won one's banner
    private sights: MapSights;             // what's turned up for a while (merchants, rare finds, beasts, openings) and bosses on the march
    private stepTime = 0;
    public following: number = null;    // the hero whose party it keeps in the middle (HeroRoster's eye), or none

    constructor() {
        super(ComponentType.MAP);

        this.create();
    }

    public async create() {
        super.create();

        this.world = PIXI.Assets.get("map-world");
        this.width = this.world.w * this.world.tile;
        this.height = this.world.h * this.world.tile;
        this.createTiles(PIXI.Assets.get("map-tileset").baseTexture);
        this.createPlaces();
        this.makeDecor();

        // managers
        this.camera = new Camera(this);

        // event listeners
        this.container.eventMode = "static";
        this.container.hitArea = new PIXI.Rectangle(0, 0, this.width, this.height);
        this.container.on("wheel", (e: PIXI.FederatedWheelEvent) => {
            if (IBC.comp.getFirstByType(ComponentType.TITLE)) return;

            if (e.deltaY < 0) this.camera.zoomIn(e);
            else if (e.deltaY > 0) this.camera.zoomOut(e);
        });
        this.container.on("pointerdown", (e: PIXI.FederatedPointerEvent) => {
            this.isPointerDown = true;
            this.lastPointerX = e.x;
            this.lastPointerY = e.y;
            this.downAt = { x: e.x, y: e.y };

            IBC.events.emit(Event.MAP_POINTER_DOWN, e);
        });
        this.container.on("pointerup", (e: PIXI.FederatedPointerEvent) => {
            IBC.events.emit(Event.MAP_POINTER_UP, e);
            // a click, not a drag, on a place opens it (LocationInfo)
            const down = this.downAt;
            this.downAt = null;
            if (!down || Math.hypot(e.x - down.x, e.y - down.y) > Map.CLICK_SLOP) return;
            // (not while the node or map editor's open: a click there is theirs)
            if (this.editing()) return;
            // (a hero standing there first: their status, the user, 2026-11-02)
            const hero = this.heroAt(e.global);
            if (hero != null) { HeroWindow.openStatus(hero); return; }
            const place = this.placeAt(e.x, e.y);
            if (place) LocationInfo.open(place);
        });
        // pointing at a place names it (not one with a hero in front of it)
        this.container.on("pointermove", (e: PIXI.FederatedPointerEvent) => {
            const hero = this.heroAt(e.global);
            this.point(hero == null ? this.placeAt(e.x, e.y) : null);
            this.container.cursor = hero != null || this.pointed ? "pointer" : "default";
        });
        this.container.on("pointerout", () => this.point(null));
        IBC.events.register(Event.GLOBAL_POINTER_UP, (e: PointerEvent) => {
            this.isPointerDown = false;
        }, this);
        IBC.events.register(Event.GLOBAL_POINTER_MOVE, (e: PointerEvent) => {
            if (!this.isPointerDown || IBC.comp.getFirstByType(ComponentType.TITLE)) return;
            // dragging it lets go of who it follows (not a click's wobble)
            if (this.following != null) {
                if (this.downAt && Math.hypot(e.x - this.downAt.x, e.y - this.downAt.y) <= Map.CLICK_SLOP) return;
                this.follow(null);
            }
            this.camera.move(this.lastPointerX - e.x, this.lastPointerY - e.y);
            this.lastPointerX = e.x;
            this.lastPointerY = e.y;
        }, this);

        // WASD and the arrow keys move it (update), not while the chat's typing
        window.addEventListener("keydown", this.keyDown);
        window.addEventListener("keyup", this.keyUp);
        window.addEventListener("blur", this.letGo);
        IBC.events.register(Event.CHAT_TYPING, (on: boolean) => { if (on) this.letGo(); }, this);

        // set camera (on Rockbarrow, the town everyone starts in)
        const start = this.world.places.find((p) => p.n == "Rockbarrow") ?? { x: this.world.w / 2, y: this.world.h / 2 };
        this.camera.setZoom(2);
        this.camera.centerOn((start.x + 0.5) * this.world.tile, (start.y + 1) * this.world.tile);
    }

    // under the title screen, the map drifting slowly round Rockbarrow in a
    // figure of eight, from it and back (the user, 2026-11-01: "do numbers
    // 2-7", a title screen that moves): DRIFT tiles across and down, a loop
    // every DRIFT_MS
    public static DRIFT = { x: 24, y: 10 };
    public static DRIFT_MS = 6 * 60 * 1000;
    private driftTime = 0;
    private drift(deltaTime: number) {
        this.driftTime += deltaTime;
        const start = this.world.places.find((p) => p.n == "Rockbarrow") ?? { x: this.world.w / 2, y: this.world.h / 2 };
        const a = this.driftTime / Map.DRIFT_MS * Math.PI * 2, tile = this.world.tile;
        this.camera.centerOn((start.x + 0.5 + Map.DRIFT.x * Math.sin(a)) * tile, (start.y + 1 + Map.DRIFT.y * Math.sin(2 * a)) * tile);
    }

    // the map's layers, in pieces of CHUNK x CHUNK tiles; animated tiles
    // (the water) step through their frames on the GPU (update)
    // (from `sheet`, the season's tileset; any made before replaced, under everything else)
    private createTiles(sheet: PIXI.BaseTexture) {
        const { w, h } = this.world;
        for (const c of this.chunks) c.destroy();
        this.chunks = [];
        this.sheet = sheet;
        this.textures = [];
        this.cells ??= this.world.layers.map((layer) => {
            const cells = new Int32Array(w * h);
            for (let k = 0, at = 0; k < layer.d.length; k += 2) cells.fill(layer.d[k], at, at += layer.d[k + 1]);
            return cells;
        });
        for (let cy = 0; cy < h; cy += Map.CHUNK) for (let cx = 0; cx < w; cx += Map.CHUNK) {
            const tilemap = this.chunk(cx, cy);
            this.container.addChildAt(tilemap, this.chunks.length);
            this.chunks.push(tilemap);
        }
        this.makeDecor();
    }

    // the little things lying about the open ground, over the tiles (MapDecor)
    private makeDecor() {
        if (!this.life) return;
        if (!this.decor.container.parent) this.container.addChildAt(this.decor.container, this.chunks.length);
        const layers: { [name: string]: Int32Array } = {};
        this.world.layers.forEach((l, i) => layers[l.n] = this.cells[i]);
        this.decor.make(this.world.w, this.world.h, layers, this.life.terrain, this.world.places, this.tileSeason);
    }

    // the piece of the map from (cx, cy), its tiles as they are now
    private chunk(cx: number, cy: number) {
        const { w, h, tile, animFrames } = this.world;
        const anim = new Set(this.world.anim);
        const tilemap = new CompositeTilemap([this.sheet]);
        for (const cells of this.cells)
            for (let y = cy; y < Math.min(h, cy + Map.CHUNK); y++) for (let x = cx; x < Math.min(w, cx + Map.CHUNK); x++) {
                const t = cells[y * w + x];
                if (t < 0) continue;
                tilemap.tile(this.texture(t), x * tile, y * tile, anim.has(t) ? { animX: tile, animCountX: animFrames } : undefined);
            }
        tilemap.cullable = true;
        return tilemap;
    }

    // tiles changed (the map editor's, or another editor's as they paint:
    // [layer, tile number, tile]...); the pieces they're in made again
    public setTiles(changes: ArrayLike<number>) {
        const { w } = this.world, across = Math.ceil(w / Map.CHUNK), touched = new Set<number>();
        for (let i = 0; i + 2 < changes.length; i += 3) {
            const cells = this.cells?.[changes[i]], k = changes[i + 1];
            if (!cells || k < 0 || k >= cells.length) continue;
            cells[k] = changes[i + 2];
            touched.add(Math.floor(Math.floor(k / w) / Map.CHUNK) * across + Math.floor((k % w) / Map.CHUNK));
        }
        touched.forEach((n) => {
            const old = this.chunks[n];
            if (!old) return;
            const tilemap = this.chunk((n % across) * Map.CHUNK, Math.floor(n / across) * Map.CHUNK);
            // (where the old one was: under everything else, in order)
            this.container.addChildAt(tilemap, this.container.getChildIndex(old));
            old.destroy();
            this.chunks[n] = tilemap;
        });
        if (touched.size) this.makeDecor();
    }

    // every tile on each layer (the server's, as the map editor opens)
    public setLayers(layers: Int32Array[]) {
        this.cells = layers;
        this.createTiles(this.sheet);
    }

    public get tileLayers() {
        return this.cells;
    }

    // a tile of the season's tileset (its first frame, if it's animated)
    public texture(t: number) {
        const { tile, columns } = this.world;
        return this.textures[t] ??= new PIXI.Texture(this.sheet, new PIXI.Rectangle((t % columns) * tile, Math.floor(t / columns) * tile, tile, tile));
    }

    // the season turned while they play: its tileset loaded, the tiles made again from it
    private checkSeason() {
        const season = worldSeasonAt(Date.now()).k;
        if (season == this.tileSeason || this.loadingSeason) return;
        this.loadingSeason = true;
        PIXI.Assets.load(Constants.IMAGES_PATH + "tilesets/" + tilesetFile(season)).then((texture: PIXI.Texture) => {
            this.tileSeason = season;
            this.createTiles(texture.baseTexture);
        }).catch((e) => console.warn("Couldn't load the season's tileset", e)).finally(() => this.loadingSeason = false);
    }

    // a sprite for each place, standing on the bottom of its tile
    private createPlaces() {
        this.places = new PIXI.Container();
        this.placeSprites();
        this.container.addChild(this.places);

        // (under the heroes: the weather's lights are made first, for the life's to go in)
        this.weather = new MapWeather(this);
        this.life = new MapLife(this, this.weather);
        this.container.addChildAt(this.life.sea, this.container.getChildIndex(this.places));
        this.container.addChild(this.life.ground);
        this.land = new MapLand(this, this.life);
        this.sky = new MapSky(this, this.life, this.weather);
        this.landmarks = new MapLandmarks(this.life);
        this.container.addChild(this.landmarks.container);
        this.sites = new EventSites(this.world.places as any, (x, y) => this.life.at(x, y) != 0);
        this.container.addChild(this.sites.container);

        this.markers = new PIXI.Container();
        this.markers.eventMode = "none";
        this.markers.sortableChildren = true;
        this.container.addChild(this.markers);

        this.container.addChild(this.life.air);
        this.container.addChild(this.sky.layer);
        this.sights = new MapSights(this);
        this.container.addChild(this.sights.container);
        this.music = new MapMusic();
        this.sounds = new MapSounds(this, this.life, this.weather);
        this.campfires = new Campfires(this.markers, this.weather);
        this.overheads = new Overheads(this.markers);
        this.gains = new Gains();
        this.friendMarkers = new FriendMarkers(this.markers, this.weather, this.campfires, this.overheads);
        this.partyMarkers = new PartyMarkers(this.markers, this.overheads);
        this.featuredMarkers = new FeaturedMarkers();
        this.eventMarkers = new EventMarkers(this.world.tile, this.world.placeSize);
        this.eventBubbles = new EventBubbles(this.world.tile, this.world.placeSize);
        this.eventScenes = new EventScenes(this.markers, (place) => IBC.data.heroes.graph.get(place));
        this.drawEvents();
        IBC.events.register(Event.EVENTS_CHANGED, this.drawEvents, this);
        IBC.events.register(Event.TITLE_SIGNED_IN, this.drawEvents, this);
        this.container.addChild(...this.weather.layers());
        this.container.addChild(this.gains.container);
        this.container.addChild(this.eventBubbles.container);
        // the boons' stars under the heroes (the user, 2026-11-02), still pointed at through them (the markers take no pointer)
        this.container.addChildAt(this.eventMarkers.container, this.container.getChildIndex(this.markers));
        this.container.addChild(this.featuredMarkers.figures, this.featuredMarkers.labels);

        this.label = new PIXI.Container();
        this.label.eventMode = "none";
        this.labelBox = new PIXI.Graphics();
        this.labelText = new PIXI.BitmapText("", { fontName: displayFont(), fontSize: 32 });
        this.label.addChild(this.labelBox, this.labelText);
        this.label.visible = false;
        this.container.addChild(this.label);
    }

    private drawEvents() {
        this.eventMarkers.draw(this.world.places);
        this.eventBubbles.draw(this.world.places);
        this.eventScenes.draw(this.world.places);
    }

    // each place's sprite, standing on the bottom of its tile (any there before gone)
    private placeSprites() {
        const sheet: PIXI.BaseTexture = PIXI.Assets.get("map-places").baseTexture;
        const size = this.world.placeSize, tile = this.world.tile;
        this.places.removeChildren().forEach((c) => c.destroy());
        // (their shadows first, under them all: art/PlaceShadows; none for those
        // lying flat on the ground, the user, 2026-11-01)
        for (const place of this.world.places) {
            if (Map.FLAT_PICS.includes(PLACE_PICS[place.s])) continue;
            const shadow = new PIXI.Sprite(placeShadowTexture(footWidth(sheet, place.s, size)));
            shadow.anchor.set(0.5, 0.5);
            shadow.position.set((place.x + 0.5) * tile + SHADOW_DX, (place.y + 1) * tile + 3);
            this.places.addChild(shadow);
        }
        for (const place of this.world.places) {
            const sprite = new PIXI.Sprite(new PIXI.Texture(sheet, new PIXI.Rectangle(place.s * size, 0, size, size)));
            sprite.anchor.set(0.5, 1);
            sprite.position.set((place.x + 0.5) * tile, (place.y + 1) * tile + 4);
            this.places.addChild(sprite);
        }
    }

    // the map's places changed (the map editor's, as an editor changes them)
    public setPlaces(places: WorldJson["places"]) {
        this.world.places = places;
        this.placeSprites();
        this.point(null);
        this.drawEvents();
        IBC.events.emit(Event.MAPED_PLACES);
    }

    // the place whose sprite is under a point on the screen
    public placeAt(screenX: number, screenY: number) {
        if (IBC.comp.getFirstByType(ComponentType.TITLE)) return null;
        const { x, y } = this.getPointerPos(screenX, screenY);
        const tile = this.world.tile, size = this.world.placeSize;
        return this.world.places.find((p) => {
            const left = (p.x + 0.5) * tile - size / 2, bottom = (p.y + 1) * tile + 4;
            return x >= left && x < left + size && y >= bottom - size && y < bottom;
        }) ?? null;
    }

    // the hero whose marker is frontmost under a point on the screen: yours,
    // friends', your parties' others' or a featured party's; otherwise null
    private heroAt(global: PIXI.IPointData) {
        if (IBC.comp.getFirstByType(ComponentType.TITLE)) return null;
        const found = [personAt(this.heroSprites, global), this.friendMarkers.heroAt(global), this.partyMarkers.heroAt(global), this.featuredMarkers.heroAt(global)]
            .filter((f) => f).sort((a, b) => b.z - a.z)[0];
        return found?.id ?? null;
    }

    // its name in a box over it (an unnamed place by its kind: "Cave")
    private point(place: WorldJson["places"][number]) {
        if (place == this.pointed) return;
        this.pointed = place;
        this.label.visible = !!place;
        this.container.cursor = place ? "pointer" : "default";
        if (!place) return;
        const kind = PLACE_KINDS[place.k] ?? "";
        // (and how many heroes are there, anyone's: S2C.EVENT_BUSY)
        const busy = IBC.data.events.busy.get(place.i) ?? 0;
        this.labelText.text = (place.n || kind.charAt(0).toUpperCase() + kind.slice(1)) + (busy ? ` - ${busy} hero${busy == 1 ? "" : "es"}` : "");
        const w = Math.ceil(this.labelText.textWidth) + 6;
        this.labelBox.clear();
        this.labelBox.beginFill(AP.BLACK).drawRect(-w / 2, -12, w, 12).endFill();
        this.labelBox.beginFill(AP.SHADOW).drawRect(-w / 2 + 1, -11, w - 2, 10).endFill();
        this.labelText.position.set(Math.round(-w / 2 + 3), -10);
        this.labelText.tint = AP.CREAM;
        const tile = this.world.tile;
        this.label.position.set((place.x + 0.5) * tile, (place.y + 1) * tile + 4 - this.world.placeSize);
    }

    // the keys that move the map held down (by e.code: where WASD are on any keyboard), and which way each goes
    private static PAN_KEYS: { [code: string]: [number, number] } = {
        KeyW: [0, -1], KeyA: [-1, 0], KeyS: [0, 1], KeyD: [1, 0],
        ArrowUp: [0, -1], ArrowLeft: [-1, 0], ArrowDown: [0, 1], ArrowRight: [1, 0],
    };
    private held = new Set<string>();
    private keyDown = (e: KeyboardEvent) => {
        if (!Map.PAN_KEYS[e.code] || Chat.takes(e) || e.ctrlKey || e.metaKey || e.altKey) return;
        if (IBC.comp.getFirstByType(ComponentType.TITLE)) return;
        this.held.add(e.code);
        e.preventDefault();
    };
    private keyUp = (e: KeyboardEvent) => this.held.delete(e.code);
    private letGo = () => this.held.clear();

    public destroy() {
        super.destroy();
        window.removeEventListener("keydown", this.keyDown);
        window.removeEventListener("keyup", this.keyUp);
        window.removeEventListener("blur", this.letGo);
        this.gains?.destroy();

        // TODO: complete in case i decide to remove map
        // for some reason (eg. switch to fullscreen game)
    }

    // the node or map editor's open (a click on the map is theirs)
    private editing() {
        return !!(IBC.comp.getFirstByType(ComponentType.NODE_EDITOR) || IBC.comp.getFirstByType(ComponentType.MAP_EDITOR));
    }

    public update(deltaTime: number) {
        // (what's clickable on the map keeps its clicks from the map: not from an editor)
        this.sights.container.interactiveChildren = this.eventBubbles.container.interactiveChildren = !this.editing();
        this.checkSeason();
        // the water's frame (one for every tilemap)
        this.frameTime += deltaTime;
        if (this.frameTime >= Map.FRAME_MS) {
            this.frameTime %= Map.FRAME_MS;
            this.frame = (this.frame + 1) % this.world.animFrames;
            (IBC.pixi.renderer.plugins as any).tilemap.tileAnim[0] = this.frame;
        }

        if (this.held.size) {
            this.follow(null);
            let dx = 0, dy = 0;
            this.held.forEach((code) => { dx += Map.PAN_KEYS[code][0]; dy += Map.PAN_KEYS[code][1]; });
            const step = Map.PAN_SPEED * deltaTime / 1000 / (dx && dy ? Math.SQRT2 : 1);
            this.camera.move(Math.sign(dx) * step, Math.sign(dy) * step);
        }
        if (this.following != null) {
            const at = this.markerSpot(this.following);
            if (at) this.camera.centerOn(at.x, at.y + Map.FEET - Map.HEAD / 2);
            else this.follow(null);
        }
        if (IBC.comp.getFirstByType(ComponentType.TITLE)) this.drift(deltaTime);
        this.container.x = -Math.floor(this.camera.scrollX);
        this.container.y = -Math.floor(this.camera.scrollY);
        // the label the same size on the screen at any zoom
        this.label.scale.set(Map.LABEL_SCALE / this.camera.getZoom());
        this.eventBubbles.update(deltaTime, Map.LABEL_SCALE / this.camera.getZoom(), this.camera.getZoom(), this.camera.zoomIndex == 0, this.world.places);

        this.stepTime += deltaTime;
        this.life.update(deltaTime);
        this.land.update(deltaTime);
        this.landmarks.update(deltaTime);
        this.sky.update(deltaTime);
        this.sites.update(deltaTime);
        this.sights.update(deltaTime);
        this.weather.update(deltaTime);
        this.sounds.update(deltaTime);
        this.music.update();
        this.updateMarkers(deltaTime);
        this.eventScenes.update(deltaTime, this.world.places, (id) => { const at = this.markerSpot(id); return at && { x: at.x, y: at.y + Map.FEET }; });
        HeroWindow.placeAll(this);
    }

    // keeps a hero's party in the middle as they go (null: stops)
    public follow(heroId: number) {
        if (heroId == this.following) return;
        this.following = heroId;
        IBC.events.emit(Event.MAP_FOLLOW, heroId);
    }

    // where it is in map px: on its node, or along the leg it's on; heroes
    // standing on the same node side by side
    private markerSpot(heroId: number) {
        const heroes = IBC.data.heroes, hero = heroes.get(heroId);
        if (!hero) return null;
        const at = heroes.position(hero);
        if (!at.moving) {
            // (not one held up on their way, standing where they stopped)
            const here = heroes.heroes.filter((h) => !h.s.r.length && h.s.p == hero.s.p), k = here.indexOf(hero);
            if (k >= 0) at.x += (k - (here.length - 1) / 2) * Map.SIDE;
        }
        return at;
    }

    // where one of yours, or anyone's in demo mode, is: map px
    public heroSpot(heroId: number) {
        const heroes = IBC.data.heroes, row = heroes.seen(heroId);
        return this.markerSpot(heroId) ?? (row ? heroes.position(row) : null);
    }

    // where a hero of yours is drawn, due now: walking about where they work
    // (their party with them: Wander), their tent (at night, by their party's
    // campfire: sitting), or on their way (or at an event's work:
    // markerSpot); eased over when that jumps
    private drawnAt(hero: HeroRow, m: { glide: Glide }, resting: boolean, deltaTime: number): { x: number; y: number; face: number; fy?: number; walking: boolean; sitting?: boolean; z?: number } {
        const heroes = IBC.data.heroes, node = heroes.graph.get(hero.s.p), now = Date.now();
        if (node && resting && (!hero.s.r.length || hero.s.o)) {
            if (campNight(now)) {
                const seat = this.campfires.seat(hero.id, partyIds(hero.id), node);
                m.glide.set(seat.x, seat.y);
                return { x: seat.x, y: seat.y, face: seat.face, fy: 0, walking: false, sitting: true, z: seat.z };
            }
            const tent = tentAt(hero.id, node);
            m.glide.set(tent.x, tent.y);
            return { x: tent.x, y: tent.y, face: 0, fy: 0, walking: false };
        }
        const due = node && wandering(hero, resting) ? heroWalk(hero.id, hero.party, node, now, stationary(hero.s.w)) : (({ x, y, dx, dy, moving }) => ({ x, y, face: dx, fy: dy, walking: moving }))(this.markerSpot(hero.id));
        const g = m.glide.to(due.x, due.y, deltaTime);
        const sliding = g.gliding && Math.hypot(g.mx, g.my) > 0.01;
        return { x: g.x, y: g.y, ...glideFace(g, due), walking: due.walking || sliding };
    }

    private updateMarkers(deltaTime: number) {
        const frame = Map.WALK[Math.floor(this.stepTime / Map.STEP_MS) % Map.WALK.length], zoom = this.camera.getZoom();
        for (const hero of IBC.data.heroes.heroes) {
            let m = this.heroSprites[hero.id];
            if (!m) {
                m = this.heroSprites[hero.id] = { person: new PIXI.Sprite(), shadow: new PIXI.Sprite(shadowTexture()), fire: this.weather.glow(AP.AMBER), glide: new Glide() };
                m.person.anchor.set(0.5, 1);
                m.shadow.anchor.set(0.5, 0.5);
                m.person.scale.set(Map.MARKER_SCALE);
                m.shadow.scale.set(Map.MARKER_SCALE);
                this.markers.addChild(m.shadow, m.person);
            }
            // resting: a little tent (the user, 2026-10-28)
            const resting = IBC.data.heroes.resting(hero);
            const at = this.drawnAt(hero, m, resting, deltaTime);
            const x = Math.round(at.x), y = Math.round(at.y) + Map.FEET, tent = resting && !at.sitting;
            m.person.texture = tent ? tentTexture() : at.sitting ? sittingTexture(hero.d.l, facingOf(at)) : personTexture(hero.d.l, facingOf(at, this.eventScenes.facing(hero) ?? Facing.DOWN), at.walking ? frame : 0);
            m.shadow.visible = !tent;
            // their tent's fire glowing at night (art/CampArt tentTexture)
            m.fire.visible = tent;
            m.fire.alpha = MapWeather.fireAlpha();
            m.fire.scale.set(Map.MARKER_SCALE * (1 + 0.05 * Math.sin(this.stepTime / 90)));
            m.fire.position.set(x + 2.5, y - 2);
            m.person.position.set(x, y + 1);
            m.shadow.position.set(x, y);
            m.person.zIndex = m.shadow.zIndex = at.z ?? y;
            const top = y - (tent ? Map.TENT_TOP : at.sitting ? Map.SIT_TOP : Map.HEAD);
            this.gains.mark(hero.id, x, top - this.overheads.mark(hero, resting, x, top, y, zoom), y);
        }
        this.gains.update(deltaTime, zoom);
        this.partyMarkers.update(frame, deltaTime, zoom);
        this.featuredMarkers.update(frame, deltaTime, zoom);
        this.friendMarkers.update(frame, this.stepTime, deltaTime, zoom);
        this.campfires.update(deltaTime);
        this.overheads.update(deltaTime);
        this.eventMarkers.update(this.stepTime);
    }

    // the top of a hero's marker on the screen (their window goes over it)
    public markerAt(heroId: number) {
        const at = this.heroSpot(heroId);
        if (!at) return null;
        const zoom = this.camera.getZoom(), head = IBC.data.heroes.resting(IBC.data.heroes.seen(heroId)) ? (campNight() ? Map.SIT_TOP : Map.TENT_TOP) : Map.HEAD;
        return { x: Math.round(at.x) * zoom + this.container.x, y: (Math.round(at.y) + Map.FEET - head) * zoom + this.container.y };
    }

    // standing at a place with an event on (its marker and bubble over it):
    // the bottom of the heroes working it on the screen (their window goes
    // under them, so it doesn't hide the marker); otherwise null
    public belowAt(heroId: number) {
        const hero = IBC.data.heroes.get(heroId);
        if (!hero || hero.s.r.length || !IBC.data.events.live().some((e) => e.p == hero.s.p)) return null;
        const at = this.markerSpot(heroId);
        if (!at) return null;
        const zoom = this.camera.getZoom();
        return { x: Math.round(at.x) * zoom + this.container.x, y: (Math.round(at.y) + Map.FEET + Map.BELOW) * zoom + this.container.y };
    }

    public resize() {
        if (this.camera) this.camera.enforceBounds();
    }

    public getPointerPos(pointerX: number, pointerY: number) {
        return {
            x: Math.floor((pointerX + this.camera.scrollX) / this.camera.getZoom()),
            y: Math.floor((pointerY + this.camera.scrollY) / this.camera.getZoom())
        }
    }

}
