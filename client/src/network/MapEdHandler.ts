import { MapPaint, MapPlace } from "../../../shared/MapEdit";
import { ComponentType } from "../components/BaseComponent";
import { Map as WorldMap } from "../components/map/Map";
import { Event } from "../constants/Events";
import { C2S, S2C } from "../constants/Routes";
import { IBC } from "../Engine";
import { BaseHandler } from "./BaseHandler";

// The map editor's messages (server managers/network/MapEdHandler;
// shared/MapEdit.ts). What another editor paints comes to everyone online
// and goes straight onto their map.

// (offWhy: why the map can't be changed, when it can't; placesWhy: why places can't be, "" they can)
export interface MapWorld { layers: Int32Array[]; terrain: Int32Array; on: boolean; offWhy: string; placesWhy: string; }

export class MapEdHandler extends BaseHandler {

    private token = 0;
    public world: MapWorld = null;          // the last MAPED_WORLD

    //#region === Outgoing ===

    public open() {
        this.send({ r: C2S.MAPED_OPEN });
    }

    // its token
    public paint(part: Omit<MapPaint, "t">) {
        const t = ++this.token;
        this.send({ r: C2S.MAPED_PAINT, t, ...part });
        return t;
    }

    // a place put on the map (id 0: a new one), changed, or taken off it (null); its token
    public place(id: number, place: MapPlace) {
        const t = ++this.token;
        this.send({ r: C2S.MAPED_PLACE, t, i: id, a: place });
        return t;
    }

    //#endregion

    //#region === Incoming ===

    public onMessage(message: any) {
        switch (message.r) {
            case S2C.MAPED_WORLD: this.came(message); break;
            case S2C.MAPED_PAINTED: IBC.events.emit(Event.MAPED_PAINTED, message.t); break;
            case S2C.MAPED_REFUSED: IBC.events.emit(Event.MAPED_REFUSED, { t: message.t, w: message.w }); break;
            case S2C.MAPED_TILES: this.tiles(message); break;
            case S2C.MAPED_PLACED: IBC.events.emit(Event.MAPED_PLACED, { t: message.t, i: message.i }); break;
            case S2C.MAPED_PLACES: (IBC.comp.getFirstByType(ComponentType.MAP) as WorldMap)?.setPlaces(message.l); break;
        }
    }

    private came(message: any) {
        const map = IBC.comp.getFirstByType(ComponentType.MAP) as WorldMap;
        if (!map) return;
        const size = map.world.w * map.world.h;
        const unruns = (d: number[]) => {
            const a = new Int32Array(size);
            for (let k = 0, at = 0; k < d.length; k += 2) a.fill(d[k], at, at += d[k + 1]);
            return a;
        };
        // (in the map's order of layers, by name)
        const names = map.world.layers.map((l) => l.n);
        const sent = new Map<string, number[]>((message.l as { n: string, d: number[] }[]).map((l) => [l.n, l.d]));
        if (message.w != map.world.w || message.h != map.world.h || names.some((n) => !sent.has(n))) {
            IBC.events.emit(Event.MAPED_REFUSED, { t: null, w: "The server's map isn't this one: reload the page" });
            return;
        }
        const layers = names.map((n) => unruns(sent.get(n)));
        map.setLayers(layers);
        map.setPlaces(message.p);
        this.world = { layers, terrain: unruns(message.e), on: message.o == 1, offWhy: message.x || "Changing the map is off on this server (MAP_EDITING=0)", placesWhy: message.y ?? "" };
        IBC.events.emit(Event.MAPED_WORLD);
    }

    private tiles(message: any) {
        const map = IBC.comp.getFirstByType(ComponentType.MAP) as WorldMap;
        if (!map) return;
        map.setTiles(message.c);
        if (this.world) for (let i = 0; i + 1 < message.e.length; i += 2) this.world.terrain[message.e[i]] = message.e[i + 1];
        IBC.events.emit(Event.MAPED_TILES, message.c);
    }

    //#endregion

}
