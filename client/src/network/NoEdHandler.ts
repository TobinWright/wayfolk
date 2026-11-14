import { makeGraph } from "../../../shared/Travel";
import { Event } from "../constants/Events";
import { C2S, S2C } from "../constants/Routes";
import { NodeJson } from "../data/NodeData";
import { IBC } from "../Engine";
import { BaseHandler } from "./BaseHandler";

// The node editor's messages (server managers/network/NoEdHandler). Each
// change asked for has a token; what the server did with it comes back with
// it, as the nodes before and after (for undoing), or why not.

// what a change did: each node it touched as it was and as it is (null: not there)
export interface NodesChange {
    t: number;                          // the token it was asked with (none: another editor's)
    before: Map<number, NodeJson>;
    after: Map<number, NodeJson>;
    added: number;                      // a node added, its id
}

export interface NewNode { x: number; y: number; e?: number[]; u?: [number, number]; n?: string; s?: number; ty?: number; te?: number; }

export class NoEdHandler extends BaseHandler {

    private token = 0;

    //#region === Outgoing ===

    public getList() {
        this.send({ r: C2S.NOED_NODE_LIST });
    }

    // each returns its token
    public add(node: NewNode) {
        const t = ++this.token;
        this.send({ r: C2S.NOED_NODE_ADD, t, ...node });
        return t;
    }

    public remove(ids: number[]) {
        const t = ++this.token;
        this.send({ r: C2S.NOED_NODE_REMOVE, t, i: ids });
        return t;
    }

    // nodes made as sent (partial: just those fields; whole: one removed, back), and those in `removed` removed
    public put(nodes: Partial<NodeJson>[], removed: number[] = []) {
        const t = ++this.token;
        this.send({ r: C2S.NOED_NODE_PUT, t, n: nodes, d: removed });
        return t;
    }

    //#endregion

    //#region === Incoming ===

    public onMessage(message: any) {
        switch (message.r) {
            case S2C.NOED_NODE_LIST: this.list(message); break;
            case S2C.NOED_NODES_CHANGED: this.changed(message); break;
            case S2C.NOED_REFUSED: IBC.events.emit(Event.NOED_REFUSED, { t: message.t, w: message.w }); break;
            case S2C.NOED_GRAPH: IBC.data.heroes.graph = makeGraph(message.n ?? []); break;
        }
    }

    private list(message: any) {
        IBC.data.nodes.load(message.n);
        IBC.events.emit(Event.NOED_NODE_LIST);
    }

    private changed(message: any) {
        const nodes = IBC.data.nodes;
        // (another editor's, before ours have come: nothing to change yet)
        if (!nodes.init) return;
        const change: NodesChange = { t: message.t, before: new Map(), after: new Map(), added: message.a };
        for (const json of message.n as NodeJson[]) {
            change.before.set(json.i, nodes.getById(json.i)?.toJSON() ?? null);
            change.after.set(json.i, json);
        }
        for (const id of message.d as number[]) {
            change.before.set(id, nodes.getById(id)?.toJSON() ?? null);
            change.after.set(id, null);
        }
        for (const json of message.n) nodes.set(json);
        for (const id of message.d) nodes.remove(id);
        IBC.events.emit(Event.NOED_NODES_CHANGED, change);
    }

    //#endregion

}
