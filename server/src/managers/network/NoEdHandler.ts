import { RowDataPacket } from "mysql2";
import { makeGraph } from "../../../../shared/Travel";
import { IBS } from "../../app";
import { NodeType, TerrainType } from "../../constants/Constants";
import { C2S, S2C } from "../../constants/Routes";
import { NodeRecord } from "../database/NodeRecord";
import { Node, NodeFields } from "../node/Node";
import { Player } from "../player/Player";
import { Log } from "../../utils/Log";

// The node editor's messages (client components/nodeeditor). Taken one at a
// time in the order they came (each waits on the database), each checked
// whole before anything's changed, and each answered: the nodes it changed
// (NOED_NODES_CHANGED, its token back), or why not (NOED_REFUSED). Links are
// kept both ways. After a change the heroes' graph is made again, and a
// moment later everyone online is sent it (NOED_GRAPH).

const NAME_LONGEST = 40;
const ITEMS_LONGEST = 500;
const SIZE = [0, 100], LEVEL = [1, 300];     // (size: how far round it heroes walk about, map px)
const TYPES = Object.keys(NodeType).length / 2, TERRAINS = Object.keys(TerrainType).length / 2;
const BATCH_MOST = 1000;
const LINKS_MOST = 32;
const GRAPH_SEND_MS = 1500;

class Refusal extends Error { }
const refuse = (why: string): never => { throw new Refusal(why); };

export class NoEdHandler {

    private queue: Promise<void> = Promise.resolve();
    private graphTimer: ReturnType<typeof setTimeout> = null;

    public onMessage(player: Player, message: any) {
        if (!player.canEdit()) return;
        this.queue = this.queue.then(async () => {
            try {
                await this.handle(player, message);
            } catch (e) {
                if (!(e instanceof Refusal)) Log.error("Node editor", e);
                player.send({ r: S2C.NOED_REFUSED, t: message.t, w: e instanceof Refusal ? e.message : "The server couldn't: see its log" });
            }
        });
    }

    private async handle(player: Player, message: any) {
        switch (message.r) {
            case C2S.NOED_NODE_LIST: this.list(player); break;
            case C2S.NOED_NODE_ADD: await this.add(player, message); break;
            case C2S.NOED_NODE_REMOVE: await this.remove(player, message); break;
            case C2S.NOED_NODE_PUT: await this.put(player, message); break;
        }
    }

    private list(player: Player) {
        player.send({
            r: S2C.NOED_NODE_LIST,
            n: IBS.nodes.getJSON()
        });
    }

    // a new node at (x, y), linked to those in e; on the link u it splits (that link gone)
    private async add(player: Player, message: any) {
        const sent: any = { n: "", s: 6, l: 1, ty: NodeType.OTHER, te: TerrainType.GRASSLANDS, r: "[]" };
        for (const k of ["x", "y", "n", "s", "l", "ty", "te"]) if (message[k] != null) sent[k] = message[k];
        const fields = this.fields(sent, true);
        const links = this.ids(message.e ?? [], "links").map((id) => this.node(id));
        if (links.length > LINKS_MOST) refuse("Too many links");
        let split: Node[] = null;
        if (message.u != null) {
            split = this.ids(message.u, "the link split").map((id) => this.node(id));
            if (split.length != 2 || !split[0].edges.includes(split[1].id)) refuse("Those two aren't linked");
        }

        const record = await NodeRecord.Insert(JSON.stringify({ ...fields, edges: [] }));
        const node = IBS.nodes.addFromRecord(record);
        const changed = new Set<Node>([node]);
        if (split) {
            IBS.nodes.unlink(split[0], split[1]);
            split.forEach((n) => changed.add(n));
        }
        for (const other of links) {
            IBS.nodes.link(node, other);
            changed.add(other);
        }
        this.changed(player, message.t, changed, [], node.id);
    }

    private async remove(player: Player, message: any) {
        const nodes = this.ids(message.i, "the nodes").map((id) => this.node(id));
        if (!nodes.length) refuse("No nodes to remove");
        await this.canRemove(nodes);
        const changed = await this.removeAll(nodes);
        this.changed(player, message.t, changed, nodes.map((n) => n.id));
    }

    // nodes as they're sent (partial: those fields; whole: one removed brought
    // back, with its id), their links as sent; and those in d removed
    private async put(player: Player, message: any) {
        if (!Array.isArray(message.n)) refuse("No nodes");
        const removing = this.ids(message.d ?? [], "the nodes removed").map((id) => this.node(id));
        if (message.n.length + removing.length > BATCH_MOST) refuse("Too many at once");

        // checked, all of it, first
        const plans: { id: number, node: Node, fields: Partial<NodeFields>, links: number[] }[] = [];
        const seen = new Set<number>();
        for (const json of message.n) {
            if (!json || typeof json != "object") refuse("A node that isn't one");
            const id = json.i;
            if (!Number.isInteger(id) || id < 1) refuse("A node without an id");
            if (seen.has(id)) refuse(`#${id} twice`);
            seen.add(id);
            if (removing.some((n) => n.id == id)) refuse(`#${id} both changed and removed`);
            const node = IBS.nodes.getById(id);
            plans.push({ id, node, fields: this.fields(json, !node), links: json.e == null ? null : this.ids(json.e, `#${id}'s links`) });
        }
        const there = (id: number) => (IBS.nodes.getById(id) || seen.has(id)) && !removing.some((n) => n.id == id);
        for (const p of plans) {
            if (!p.links) continue;
            if (p.links.length > LINKS_MOST) refuse(`#${p.id} has too many links`);
            for (const id of p.links) if (!there(id)) refuse(`#${p.id} is linked to #${id}, which isn't there`);
        }
        await this.canRemove(removing);

        // then done
        const changed = new Set<Node>();
        for (const p of plans) {
            if (p.node) continue;
            const record = await NodeRecord.Insert(JSON.stringify({ ...p.fields, edges: [] }), p.id);
            p.node = IBS.nodes.addFromRecord(record);
        }
        for (const p of plans) {
            p.node.set(p.fields);
            changed.add(p.node);
        }
        (await this.removeAll(removing)).forEach((n) => changed.add(n));
        for (const p of plans) if (p.links) IBS.nodes.setLinks(p.node, p.links).forEach((n) => changed.add(n));
        this.changed(player, message.t, changed, removing.map((n) => n.id));
    }

    //#region checking

    private node(id: number) {
        return IBS.nodes.getById(id) ?? refuse(`There's no node #${id}`);
    }

    // a list of ids, each once
    private ids(list: any, what: string): number[] {
        if (!Array.isArray(list) || list.some((id) => !Number.isInteger(id) || id < 1)) refuse(`Bad ids for ${what}`);
        return Array.from(new Set<number>(list));
    }

    // the fields sent ({ n, x, y, s, l, ty, te, r }) checked; `whole`: all of them wanted
    private fields(json: any, whole: boolean): Partial<NodeFields> {
        const f: Partial<NodeFields> = {};
        const has = (k: string) => {
            if (json[k] != null) return true;
            if (whole) refuse(`A new node needs its ${k}`);
            return false;
        };
        const int = (k: string, lo: number, hi: number) => {
            const v = json[k];
            if (typeof v != "number" || !Number.isFinite(v)) refuse(`Bad ${k}: ${v}`);
            return Math.min(hi, Math.max(lo, Math.round(v)));
        };
        const { w, h } = IBS.heroes.tasks.mapPx;
        if (has("x")) f.x = int("x", 0, w ? w - 1 : 100000);
        if (has("y")) f.y = int("y", 0, h ? h - 1 : 100000);
        if (has("s")) f.size = int("s", SIZE[0], SIZE[1]);
        if (has("l")) f.level = int("l", LEVEL[0], LEVEL[1]);
        if (has("ty")) f.type = int("ty", 0, TYPES - 1);
        if (has("te")) f.terrain = int("te", 0, TERRAINS - 1);
        if (has("n")) {
            if (typeof json.n != "string") refuse("Bad name");
            f.name = json.n.replace(/\s+/g, " ").trim().slice(0, NAME_LONGEST);
        }
        if (has("r")) {
            if (typeof json.r != "string" || json.r.length > ITEMS_LONGEST) refuse("Bad items");
            f.resources = json.r;
        }
        return f;
    }

    // why not, if they can't go: a place on the map, or where a hero is or is going
    private async canRemove(nodes: Node[]) {
        if (!nodes.length) return;
        for (const n of nodes)
            if (IBS.heroes.tasks.places.has(n.id)) refuse(`#${n.id} ${n.name} is a place on the map: move it, don't remove it`);
        const why = await heroesAt(new Set(nodes.map((n) => n.id)));
        if (why) refuse(why);
    }

    //#endregion

    //#region changing

    // gone, their links with them; the nodes they were linked to (changed)
    private async removeAll(nodes: Node[]) {
        const changed = new Set<Node>();
        for (const node of nodes) {
            for (const id of [...node.edges]) {
                const other = IBS.nodes.getById(id);
                if (!other) continue;
                IBS.nodes.unlink(node, other);
                changed.add(other);
            }
            await NodeRecord.Delete(node.id);
            IBS.nodes.remove(node);
        }
        nodes.forEach((n) => changed.delete(n));
        return changed;
    }

    // saved, told to the editor (with their token; none: the map editor's)
    // and any other editor online; the heroes' graph made again
    public changed(player: Player, token: any, nodes: Set<Node>, removed: number[], added?: number) {
        nodes.forEach((n) => n.save());
        const n = Array.from(nodes, (node) => node.getJSON());
        player?.send({ r: S2C.NOED_NODES_CHANGED, t: token, n, d: removed, a: added });
        for (const other of IBS.players.online())
            if (other != player && other.canEdit()) other.send({ r: S2C.NOED_NODES_CHANGED, n, d: removed });

        IBS.heroes.tasks.graph = makeGraph(IBS.nodes.getJSON());
        clearTimeout(this.graphTimer);
        this.graphTimer = setTimeout(() => {
            const graph = { r: S2C.NOED_GRAPH, n: IBS.nodes.getJSON() };
            for (const p of IBS.players.online()) p.send(graph);
        }, GRAPH_SEND_MS);
    }

    //#endregion

}

// why not, if heroes use the nodes: a hero (signed in or out) at one, or on
// the way through it; "" none
export async function heroesAt(ids: Set<number>) {
    const uses = (s: any) => s && (ids.has(s.p) || (Array.isArray(s.r) && s.r.some((id: number) => ids.has(id))));
    const loaded = new Set<number>();
    for (const player of IBS.players.all()) {
        loaded.add(player.id);
        const hero = [...player.heroes, ...player.barracks].find((h) => uses(h.s));
        if (hero) return `${hero.d.n} is at or on the way through it`;
    }
    // (those not loaded, as last saved)
    const conn = await IBS.db.getConnection();
    let rows: RowDataPacket[];
    try {
        [rows] = await conn.query<RowDataPacket[]>("SELECT player_id, state FROM hero WHERE state IS NOT NULL");
    } finally {
        conn.release();
    }
    for (const row of rows) {
        if (loaded.has(row.player_id)) continue;
        let s: any;
        try { s = JSON.parse(row.state); } catch { continue; }
        if (uses(s)) return "A hero (signed out) is at or on the way through it";
    }
    return "";
}
