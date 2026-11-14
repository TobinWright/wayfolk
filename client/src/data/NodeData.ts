import { NodeType, TerrainType } from "../constants/Constants";

// The travel graph's nodes as the node editor has them (NOED_NODE_LIST,
// then each change the server makes: NOED_NODES_CHANGED).

// a node as it's sent, both ways
export interface NodeJson { i: number; x: number; y: number; n: string; s: number; l: number; ty: number; te: number; r: string; e: number[]; }

export class NodeData {

    public nodes: ND_Node[] = [];
    public init: boolean = false;
    private byId = new Map<number, ND_Node>();

    public load(json: NodeJson[]) {
        this.nodes = [];
        this.byId.clear();
        for (const n of json) this.set(n);
        this.init = true;
    }

    // as the server has it now (new, or changed)
    public set(json: NodeJson) {
        const node = this.byId.get(json.i);
        if (node) {
            node.update(json);
            return node;
        }
        const newNode = new ND_Node(json);
        this.nodes.push(newNode);
        this.byId.set(newNode.id, newNode);
        return newNode;
    }

    public remove(id: number) {
        const node = this.byId.get(id);
        if (!node) return;
        this.byId.delete(id);
        this.nodes.splice(this.nodes.indexOf(node), 1);
    }

    public getById(id: number) {
        return this.byId.get(id) ?? null;
    }

    // how many links there are (each counted once)
    public linkCount() {
        let n = 0;
        for (const node of this.nodes) for (const e of node.edges) if (e > node.id || !this.byId.get(e)?.edges.includes(node.id)) n++;
        return n;
    }

}

export class ND_Node {

    public id: number;
    public x: number;
    public y: number;
    public name: string;
    public size: number;
    public level: number;
    public type: NodeType;
    public terrain: TerrainType;
    public resources: string;
    public edges: number[] = [];

    constructor(json: NodeJson) {
        this.update(json);
    }

    public update(json: NodeJson) {
        this.id = json.i;
        this.name = json.n ?? "";
        this.x = json.x;
        this.y = json.y;
        this.size = json.s;
        this.level = json.l;
        this.type = json.ty;
        this.terrain = json.te;
        this.resources = json.r ?? "[]";
        this.edges = [...(json.e ?? [])];
    }

    public toJSON(): NodeJson {
        return { i: this.id, x: this.x, y: this.y, n: this.name, s: this.size, l: this.level, ty: this.type, te: this.terrain, r: this.resources, e: [...this.edges] };
    }

}
