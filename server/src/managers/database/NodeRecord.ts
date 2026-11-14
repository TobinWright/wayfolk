import { ResultSetHeader } from "mysql2";
import { IBS } from "../../app";
import { INode } from "../../types/INode";

// A row of the node table: its id and its fields as JSON (managers/node/Node).

export class NodeRecord {

    public static DEFAULT_RADIUS = 10;

    public id: number;
    public data: string;

    constructor(data?: INode) {
        if (!data) return;
        this.id = data.id;
        this.data = data.data;
    }

    public async update() {
        const conn = await IBS.db.getConnection();
        try {
            await conn.query<ResultSetHeader>("UPDATE node SET data = ? WHERE id = ?", [this.data, this.id]);
        } finally {
            conn.release();
        }
    }

    // a new row (`id`: with that id, a node removed brought back; none: the next)
    public static async Insert(data: string, id?: number): Promise<NodeRecord> {
        const conn = await IBS.db.getConnection();
        let result: ResultSetHeader;
        try {
            [result] = id != null
                ? await conn.query<ResultSetHeader>("INSERT INTO node (id, data) VALUES (?, ?)", [id, data])
                : await conn.query<ResultSetHeader>("INSERT INTO node (data) VALUES (?)", [data]);
        } finally {
            conn.release();
        }

        const record = new NodeRecord();
        record.id = id ?? result.insertId;
        record.data = data;
        return record;
    }

    public static async Delete(nodeId: number) {
        const conn = await IBS.db.getConnection();
        try {
            await conn.query<ResultSetHeader>("DELETE FROM node WHERE id = ?", [nodeId]);
        } finally {
            conn.release();
        }
    }

    public static async GetAll(): Promise<NodeRecord[]> {
        const conn = await IBS.db.getConnection();
        const [records] = await conn.query<INode[]>("SELECT * FROM node");
        conn.release();

        return records.map(n => new NodeRecord(n));
    }

}
