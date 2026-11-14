import { NodeType, TerrainType } from "../../constants/Constants";
import { NodeRecord } from "../database/NodeRecord";
import { Log } from "../../utils/Log";

// A node of the travel graph (DESIGN.md "The travel graph"): where it is in
// map px, what it is, and the nodes it's linked to. Links go both ways: each
// end lists the other (NodeManager.link).

export interface NodeFields {
    name: string;
    x: number;
    y: number;
    size: number;
    level: number;
    type: NodeType;
    terrain: TerrainType;
    resources: string;
}

export class Node {

    private record: NodeRecord;

    public id: number;
    public x: number = 0;
    public y: number = 0;
    public name: string = "";
    public size: number = NodeRecord.DEFAULT_RADIUS;
    public level: number = 1;
    public type: NodeType = NodeType.OTHER;
    public terrain: TerrainType = TerrainType.WATER;
    public resources: string = "[]";
    public edges: number[] = [];

    constructor(record: NodeRecord) {
        this.record = record;

        this.load();
    }

    private load() {
        this.id = this.record.id;

        const json = JSON.parse(this.record.data);
        this.x = json.x ?? 0;
        this.y = json.y ?? 0;

        this.name = json.name ?? "";
        this.size = json.size ?? NodeRecord.DEFAULT_RADIUS;
        this.level = json.level ?? 1;
        this.type = json.type ?? NodeType.OTHER;
        this.terrain = json.terrain ?? TerrainType.WATER;
        this.resources = json.resources ?? "[]";

        this.edges = Array.isArray(json.edges) ? json.edges.filter((e: any) => Number.isInteger(e) && e != this.id) : [];
    }

    // as kept in its row
    public data() {
        return JSON.stringify({
            name: this.name,
            x: this.x,
            y: this.y,
            size: this.size,
            level: this.level,
            type: this.type,
            terrain: this.terrain,
            resources: this.resources,
            edges: this.edges
        });
    }

    public save() {
        this.record.data = this.data();
        this.record.update().catch(Log.catch("Node not saved", { nodeId: this.id }));
    }

    public set(fields: Partial<NodeFields>) {
        Object.assign(this, fields);
    }

    public getJSON() {
        return {
            i: this.id,
            x: this.x,
            y: this.y,
            n: this.name,
            s: this.size,
            l: this.level,
            ty: this.type,
            te: this.terrain,
            r: this.resources,
            e: this.edges
        }
    }

}
