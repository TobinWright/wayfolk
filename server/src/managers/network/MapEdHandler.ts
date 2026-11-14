import { accessSync, constants, existsSync, readFileSync, renameSync, statSync, writeFileSync } from "fs";
import path from "path";
import {
    LAYOUT_PAD_X, LAYOUT_PAD_Y, MapPaint, MapPlace, PAINT_FIELDS, PAINT_MOST, PAINT_PART_MOST, PAINT_RIVER, PAINT_SNOW, PLACE_NAME_LONGEST, RIVER_UNPAINTED, UNPAINTED,
} from "../../../../shared/MapEdit";
import { PLACE_KINDS, PLACE_PICS, WorldPlace } from "../../../../shared/Places";
import { IBS } from "../../app";
import { NodeType, TerrainType } from "../../constants/Constants";
import { C2S, S2C } from "../../constants/Routes";
import { ENV } from "../../utils/Env";
import { Log } from "../../utils/Log";
import { NodeRecord } from "../database/NodeRecord";
import { Node, NodeFields } from "../node/Node";
import { Player } from "../player/Player";
import { heroesAt } from "./NoEdHandler";

// The map editor's messages (client components/mapeditor; shared/MapEdit.ts),
// taken one at a time in the order they came. The map's tiles and places are
// kept here as they're changed, and written a moment after the last change:
// world.json (what everyone loads), client/tools/world-paint.json (what was
// painted, for render-world.js) and the places into world-layout.ts's
// PLACES (each a line of its own, the comments between them kept). Off with
// MAP_EDITING=0 in .env (the live box: its files are the repo's, and a
// deploy pulls over them).

const CLIENT = path.join(process.cwd(), "..", "client");
const WORLD_FILE = path.join(CLIENT, "dist", "assets", "json", "world.json");
const PAINT_FILE = path.join(CLIENT, "tools", "world-paint.json");
const LAYOUT_FILE = path.join(CLIENT, "tools", "world-layout.ts");
const SAVE_MS = 1500;
const TILE_MOST = 65535;
const TERRAINS = Object.keys(TerrainType).length / 2;
// a new place's node, as tools/build-nodes.js makes them
const SETTLEMENTS = new Set(["village", "town", "castle", "cathedral", "fort", "manor", "farm", "chapel", "camp", "hut", "icecastle", "port", "pier"]);
const DUNGEONS = new Set(["cave", "mine", "lair", "ruins", "darktower", "crater", "pyramids", "steptemple", "altar", "volcano"]);
const BIG = new Set(["castle", "town", "cathedral", "icecastle", "port"]);
const LAYOUT_START = "export const PLACES: Place[] = [", LAYOUT_END = "];";
const NOT_MATCHED = "world-layout.ts's places aren't world.json's: run npm run world in client";

class Refusal extends Error { }
const refuse = (why: string): never => { throw new Refusal(why); };

// world-layout.ts's PLACES, line by line: a comment (as it is), or a place (by its id)
type LayoutLine = { text: string } | { id: number };

export class MapEdHandler {

    private world: any = null;              // world.json, its layers and terrain as they were read
    private layers: Int32Array[] = [];      // (each layer's tiles, as painted since)
    private terrain: Int32Array;
    private paint: Int16Array[] = [];       // (each of PAINT_FIELDS, UNPAINTED where it's not been)
    private saveTimer: ReturnType<typeof setTimeout> = null;
    private unsaved = false;
    private readAt = 0;                     // (world.json's time when it was read or written)
    private layout: { lines: LayoutLine[], before: string[], after: string[], eol: string, at: number } = null;     // (null: it isn't world.json's: places can't be changed)
    private layoutWhy = "";
    private layoutUnsaved = false;
    private queue: Promise<void> = Promise.resolve();

    public onMessage(player: Player, message: any) {
        if (!player.canEdit()) return;
        this.queue = this.queue.then(async () => {
            try {
                switch (message.r) {
                    case C2S.MAPED_OPEN: this.open(player); break;
                    case C2S.MAPED_PAINT: this.painted(player, message); break;
                    case C2S.MAPED_PLACE: await this.placed(player, message); break;
                }
            } catch (e) {
                if (!(e instanceof Refusal)) Log.error("Map editor", e);
                player.send({ r: S2C.MAPED_REFUSED, t: message.t, w: e instanceof Refusal ? e.message : "The server couldn't: see its log" });
            }
        });
    }

    private get on() {
        return ENV.MAP_EDITING != "0";
    }

    // why what's changed couldn't be saved ("": it could) - the folders the
    // map's files are written in not the server's to write in (the live
    // box's, root's; the server running as wayfolk) - so it's refused rather
    // than taken and lost
    private unwritable() {
        for (const file of [WORLD_FILE, PAINT_FILE, LAYOUT_FILE]) {
            try {
                accessSync(path.dirname(file), constants.W_OK);
            } catch {
                return `The server can't write ${path.basename(file)} (${path.dirname(file)} isn't its to write in): change the map on the dev box and deploy it`;
            }
        }
        return "";
    }
    private writable() {
        const why = this.unwritable();
        if (why) refuse(why);
    }

    // a word to everyone with the editor open (a save that didn't happen)
    private tell(why: string) {
        for (const p of IBS.players.online()) if (p.canEdit()) p.send({ r: S2C.MAPED_REFUSED, t: null, w: why });
    }

    private open(player: Player) {
        this.load();
        const { w, h } = this.world, off = this.on ? this.unwritable() : "";
        player.send({
            r: S2C.MAPED_WORLD,
            l: this.world.layers.map((l: any, i: number) => ({ n: l.n, d: runs(this.layers[i]) })),
            e: runs(this.terrain),
            p: this.world.places,
            w, h, o: this.on && !off ? 1 : 0, x: off, y: this.layout ? "" : this.layoutWhy,
        });
    }

    private painted(player: Player, m: MapPaint) {
        if (!this.on) refuse("Painting the map is off on this server (MAP_EDITING=0): paint it on the dev box and deploy it");
        this.writable();
        this.load();
        const { w, h } = this.world, tiles = w * h, corners = (w + 1) * (h + 1);
        const list = (a: any, by: number, what: string): number[] => {
            if (!Array.isArray(a) || a.length % by || a.some((v) => !Number.isInteger(v))) refuse(`Bad ${what}`);
            return a;
        };
        const c = list(m.c, 3, "tiles"), e = list(m.e, 2, "terrain"), p = list(m.p, 3, "painting");
        if (c.length + e.length + p.length > PAINT_PART_MOST) refuse("Too much at once");

        // checked, all of it, first
        for (let i = 0; i < c.length; i += 3)
            if (c[i] < 0 || c[i] >= this.layers.length || c[i + 1] < 0 || c[i + 1] >= tiles || c[i + 2] < -1 || c[i + 2] > TILE_MOST) refuse("A tile that isn't on the map");
        for (let i = 0; i < e.length; i += 2)
            if (e[i] < 0 || e[i] >= tiles || e[i + 1] < 0 || e[i + 1] >= TERRAINS) refuse("Bad terrain");
        for (let i = 0; i < p.length; i += 3) {
            const f = p[i], at = p[i + 1], v = p[i + 2];
            if (f < 0 || f >= PAINT_FIELDS.length) refuse("Painting something that isn't");
            const perTile = f == PAINT_SNOW || f == PAINT_RIVER;
            if (at < 0 || at >= (perTile ? tiles : corners)) refuse("Painting off the map");
            if (v < (f == PAINT_RIVER ? -1 : 0) || v > PAINT_MOST[f]) refuse(`Bad ${PAINT_FIELDS[f]}: ${v}`);
        }

        // then done
        for (let i = 0; i < c.length; i += 3) this.layers[c[i]][c[i + 1]] = c[i + 2];
        for (let i = 0; i < e.length; i += 2) this.terrain[e[i]] = e[i + 1];
        for (let i = 0; i < p.length; i += 3) this.paint[p[i]][p[i + 1]] = p[i + 2];
        player.send({ r: S2C.MAPED_PAINTED, t: m.t });
        if (!c.length && !e.length && !p.length) return;
        if (c.length || e.length) {
            const tell = { r: S2C.MAPED_TILES, c, e };
            for (const other of IBS.players.online()) if (other != player) other.send(tell);
        }
        this.later();
    }

    private later() {
        clearTimeout(this.saveTimer);
        this.unsaved = true;
        this.saveTimer = setTimeout(() => this.save(), SAVE_MS);
    }

    //#region places

    // a place put on the map (id 0: a new one; one there before: put back),
    // changed, or taken off it (a null); its node with it
    private async placed(player: Player, m: { t: number, i: number, a: MapPlace }) {
        if (!this.on) refuse("Changing the map is off on this server (MAP_EDITING=0): change it on the dev box and deploy it");
        this.writable();
        this.load();
        if (!this.layout) refuse(this.layoutWhy);
        const places: WorldPlace[] = this.world.places;
        if (!Number.isInteger(m.i) || m.i < 0) refuse("Bad id");
        const at = m.i ? places.findIndex((p) => p.i == m.i) : -1;
        const changed = new Set<Node>();
        let id = m.i;

        if (m.a == null) {
            if (at < 0) refuse(`There's no place #${m.i}`);
            const place = places[at];
            const event = IBS.events.live().find((e: any) => e.p == place.i || (Array.isArray(e.r) && e.r.includes(place.i)));
            if (event) refuse(`An event's on at ${place.n || "it"}: take it off once that's over`);
            const why = await heroesAt(new Set([place.i]));
            if (why) refuse(why);
            places.splice(at, 1);
            this.layout.lines = this.layout.lines.filter((l) => !("id" in l) || l.id != place.i);
            IBS.heroes.tasks.places.delete(place.i);
            // (its node stays, a waypoint now, as plain as one)
            const node = IBS.nodes.getById(place.i);
            if (node) {
                node.set({ type: NodeType.OTHER, size: 6 });
                changed.add(node);
            }
        } else {
            const a = this.checked(m.a, m.i), kind = PLACE_KINDS[a.k], was = at >= 0 ? { ...places[at] } : null;
            if (at >= 0) Object.assign(places[at], a);
            else {
                if (m.i && IBS.heroes.tasks.places.has(m.i)) refuse(`#${m.i} is taken`);
                id ||= this.newId();
                places.push({ i: id, ...a });
                this.layout.lines.push({ id });
            }
            IBS.heroes.tasks.places.set(id, places.find((p) => p.i == id));
            // its node: on it, named for it (a new one made, linked to the
            // nearest); what it is and how big as its kind has them, if that's
            // new (not undoing what's been set in the node editor)
            const tile = this.world.tile, x = Math.round((a.x + 0.5) * tile), y = Math.round((a.y + 0.5) * tile);
            const fields: Partial<NodeFields> = { x, y };
            const kindNew = !was || was.k != a.k;
            if (!was || was.n != a.n || kindNew && !a.n) fields.name = a.n || kind[0].toUpperCase() + kind.slice(1);
            if (kindNew) {
                fields.type = SETTLEMENTS.has(kind) ? NodeType.SETTLEMENT : DUNGEONS.has(kind) ? NodeType.DUNGEON : NodeType.OTHER;
                fields.size = BIG.has(kind) ? 16 : 12;
            }
            let node = IBS.nodes.getById(id);
            if (node) node.set(fields);
            else {
                const record = await NodeRecord.Insert(JSON.stringify({ ...fields, level: 1, terrain: this.terrain[a.y * this.world.w + a.x], resources: "[]", edges: [] }), id);
                node = IBS.nodes.addFromRecord(record);
                const near = IBS.nodes.all().filter((n) => n != node).sort((p, q) => Math.hypot(p.x - x, p.y - y) - Math.hypot(q.x - x, q.y - y))[0];
                if (near) {
                    IBS.nodes.link(node, near);
                    changed.add(near);
                }
            }
            changed.add(node);
        }

        player.send({ r: S2C.MAPED_PLACED, t: m.t, i: id });
        const tell = { r: S2C.MAPED_PLACES, l: places };
        for (const p of IBS.players.online()) p.send(tell);
        if (changed.size) IBS.net.noEd.changed(null, null, changed, []);
        this.layoutUnsaved = true;
        this.later();
    }

    // a place as sent, checked: a kind, a sprite no other place has, on the map, not on another
    private checked(a: any, id: number): MapPlace {
        if (!a || typeof a != "object") refuse("A place that isn't one");
        const int = (v: any, lo: number, hi: number, what: string) => Number.isInteger(v) && v >= lo && v <= hi ? v as number : refuse(`Bad ${what}`);
        const k = int(a.k, 0, PLACE_KINDS.length - 1, "kind"), s = int(a.s, 0, PLACE_PICS.length - 1, "sprite");
        const x = int(a.x, 0, this.world.w - 1, "x"), y = int(a.y, 0, this.world.h - 1, "y");
        if (typeof a.n != "string") refuse("Bad name");
        const n = a.n.replace(/\s+/g, " ").replace(/["\\]/g, "").trim().slice(0, PLACE_NAME_LONGEST);
        for (const p of this.world.places as WorldPlace[]) {
            if (p.i == id) continue;
            if (p.s == s) refuse(`${p.n || "Another place"} has that sprite: every place has its own`);
            if (p.x == x && p.y == y) refuse(`${p.n || "Another place"} is there`);
        }
        return { k, s, x, y, n };
    }

    // after every node and place there is
    private newId() {
        let most = 0;
        for (const n of IBS.nodes.all()) most = Math.max(most, n.id);
        for (const id of IBS.heroes.tasks.places.keys()) most = Math.max(most, id);
        return most + 1;
    }

    // world-layout.ts's PLACES, each line matched with world.json's places in
    // turn (none, and why not, if they don't match)
    private readLayout() {
        this.layout = null;
        let text: string;
        try {
            text = readFileSync(LAYOUT_FILE, "utf8");
        } catch (e) {
            this.layoutWhy = "The server can't read world-layout.ts: " + LAYOUT_FILE;
            return;
        }
        const all = text.split(/\r?\n/), start = all.indexOf(LAYOUT_START), end = all.indexOf(LAYOUT_END, start);
        if (start < 0 || end < 0) {
            this.layoutWhy = "world-layout.ts has no PLACES list the server can read";
            return;
        }
        const places: WorldPlace[] = this.world.places, lines: LayoutLine[] = [];
        let n = 0;
        for (const line of all.slice(start + 1, end)) {
            const kind = /^\s*\{ kind: "(\w+)", x: (\d+), y: (\d+)/.exec(line);
            if (!kind) {
                if (line.trim() && !line.trim().startsWith("//")) {
                    this.layoutWhy = "A line in world-layout.ts's PLACES the server can't read: " + line.trim();
                    return;
                }
                lines.push({ text: line });
                continue;
            }
            const p = places[n++];
            if (!p || PLACE_KINDS[p.k] != kind[1] || p.x - LAYOUT_PAD_X != +kind[2] || p.y - LAYOUT_PAD_Y != +kind[3]) {
                this.layoutWhy = NOT_MATCHED;
                return;
            }
            lines.push({ id: p.i });
        }
        if (n != places.length) {
            this.layoutWhy = NOT_MATCHED;
            return;
        }
        this.layout = { lines, before: all.slice(0, start + 1), after: all.slice(end), eol: text.includes("\r\n") ? "\r\n" : "\n", at: statSync(LAYOUT_FILE).mtimeMs };
    }

    // PLACES written again from world.json's places (an id said where it isn't its place in the list, from 1)
    private writeLayout() {
        const places = new Map<number, WorldPlace>((this.world.places as WorldPlace[]).map((p) => [p.i, p]));
        let n = 0;
        const body = this.layout.lines.map((l) => {
            if (!("id" in l)) return l.text;
            const p = places.get(l.id), kind = PLACE_KINDS[p.k], pic = PLACE_PICS[p.s];
            let line = `    { kind: "${kind}", x: ${p.x - LAYOUT_PAD_X}, y: ${p.y - LAYOUT_PAD_Y}`;
            if (p.n) line += `, name: ${JSON.stringify(p.n)}`;
            if (pic != kind) line += `, pic: "${pic}"`;
            if (p.i != ++n) line += `, id: ${p.i}`;
            return line + " },";
        });
        write(LAYOUT_FILE, [...this.layout.before, ...body, ...this.layout.after].join(this.layout.eol));
        this.layout.at = statSync(LAYOUT_FILE).mtimeMs;
    }

    //#endregion

    // world.json, world-paint.json and world-layout.ts, the first time they're wanted
    private load() {
        if (this.world) return;
        let world: any;
        try {
            world = JSON.parse(readFileSync(WORLD_FILE, "utf8"));
        } catch (e) {
            refuse("The server can't read world.json: " + WORLD_FILE);
        }
        const { w, h } = world, tiles = w * h, corners = (w + 1) * (h + 1);
        this.layers = world.layers.map((l: any) => unruns(l.d, tiles));
        this.terrain = unruns(world.terrain, tiles);
        this.paint = PAINT_FIELDS.map((f, i) => new Int16Array(i == PAINT_SNOW || i == PAINT_RIVER ? tiles : corners).fill(i == PAINT_RIVER ? RIVER_UNPAINTED : UNPAINTED));
        if (existsSync(PAINT_FILE)) {
            try {
                const painted = JSON.parse(readFileSync(PAINT_FILE, "utf8"));
                if (painted.w == w && painted.h == h) PAINT_FIELDS.forEach((f, i) => { if (painted[f]) this.paint[i] = Int16Array.from(unruns(painted[f], this.paint[i].length)); });
                else Log.warn("world-paint.json is for another size of map: started again", { file: PAINT_FILE });
            } catch (e) {
                Log.error("Map editor: can't read world-paint.json", e);
            }
        }
        this.world = world;
        this.readAt = statSync(WORLD_FILE).mtimeMs;
        this.readLayout();
    }

    // written now, if there's anything not yet (the server stopping: Engine.shutdown)
    public save() {
        clearTimeout(this.saveTimer);
        this.saveTimer = null;
        if (!this.unsaved) return;
        this.unsaved = false;
        try {
            const painted: any = { w: this.world.w, h: this.world.h };
            PAINT_FIELDS.forEach((f, i) => painted[f] = runs(this.paint[i]));
            write(PAINT_FILE, JSON.stringify(painted));
            // (built again since it was read - npm run world -, or its places
            // changed by hand: the new ones kept, read again, not written over)
            if (statSync(WORLD_FILE).mtimeMs != this.readAt || this.layoutUnsaved && statSync(LAYOUT_FILE).mtimeMs != this.layout.at) {
                Log.warn("Map editor: world.json or world-layout.ts changed while the map was being edited: those kept (what's painted is in world-paint.json, for the next build; places changed since are lost)");
                this.tell("world.json or world-layout.ts changed on the server while you edited: those kept, what's painted is in world-paint.json for the next npm run world; reload the page");
                this.world = null;
                this.layoutUnsaved = false;
                return;
            }
            this.world.layers = this.world.layers.map((l: any, i: number) => ({ n: l.n, d: runs(this.layers[i]) }));
            this.world.terrain = runs(this.terrain);
            write(WORLD_FILE, JSON.stringify(this.world));
            this.readAt = statSync(WORLD_FILE).mtimeMs;
            if (this.layoutUnsaved) this.writeLayout();
            this.layoutUnsaved = false;
            Log.info("Map editor: the map saved");
        } catch (e) {
            Log.error("Map editor: couldn't save the map", e);
            this.tell("The map couldn't be saved (" + (e as Error).message + "): what you've changed since the last save isn't kept");
        }
    }

}

// as runs of [value, count]
function runs(a: ArrayLike<number>) {
    const out: number[] = [];
    for (let k = 0; k < a.length;) {
        let n = 1;
        while (k + n < a.length && a[k + n] == a[k]) n++;
        out.push(a[k], n);
        k += n;
    }
    return out;
}

function unruns(d: number[], size: number) {
    const a = new Int32Array(size);
    for (let k = 0, at = 0; k < d.length; k += 2) a.fill(d[k], at, at += d[k + 1]);
    return a;
}

// (beside it first, then over it, so it's never half written)
function write(file: string, text: string) {
    writeFileSync(file + ".tmp", text);
    renameSync(file + ".tmp", file);
}
