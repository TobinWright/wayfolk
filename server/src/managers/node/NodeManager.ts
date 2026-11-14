import { NodeRecord } from "../database/NodeRecord";
import { Node } from "./Node";

export class NodeManager {

    private nodes: Node[] = [];

    public async init() {
        const records = await NodeRecord.GetAll();
        this.nodes = records.map(r => new Node(r));
    }

    public all() {
        return this.nodes;
    }

    public addFromRecord(record: NodeRecord) {
        const newNode = new Node(record);
        this.nodes.push(newNode);
        return newNode;
    }

    public remove(node: Node) {
        for (var i = this.nodes.length - 1; i >= 0; i--)
            if (this.nodes[i] == node)
                this.nodes.splice(i, 1);
    }

    public getById(id: number) {
        for (var i = 0; i < this.nodes.length; i++)
            if (this.nodes[i].id == id)
                return this.nodes[i];
        return null;
    }

    // a link both ways (each end listing the other)
    public link(a: Node, b: Node) {
        if (a == b) return;
        if (!a.edges.includes(b.id)) a.edges.push(b.id);
        if (!b.edges.includes(a.id)) b.edges.push(a.id);
    }

    public unlink(a: Node, b: Node) {
        a.edges = a.edges.filter((e) => e != b.id);
        b.edges = b.edges.filter((e) => e != a.id);
    }

    // a node's links made `want`, the other ends' too; the nodes changed (it among them)
    public setLinks(node: Node, want: number[]) {
        const changed = new Set<Node>([node]);
        const next = new Set(want.filter((id) => id != node.id));
        for (const id of node.edges) {
            const other = this.getById(id);
            if (next.has(id)) continue;
            if (other) { this.unlink(node, other); changed.add(other); }
            else node.edges = node.edges.filter((e) => e != id);     // (to one gone)
        }
        for (const id of next) {
            const other = this.getById(id);
            if (!other || (node.edges.includes(id) && other.edges.includes(node.id))) continue;
            this.link(node, other);
            changed.add(other);
        }
        return changed;
    }

    public getJSON() {
        const json = [];
        for (let i = 0; i < this.nodes.length; i++)
            json.push(this.nodes[i].getJSON());
        return json;
    }

}
