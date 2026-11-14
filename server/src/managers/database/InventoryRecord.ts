import { ResultSetHeader } from "mysql2";
import { IBS } from "../../app";
import { IInventory } from "../../types/IInventory";

export class InventoryRecord {

    // database
    public id: number;
    public playerId: number;
    public gold: number = 0;
    public items: string = "[]";

    public getJSON() {
        return {
            id: this.id,
        };
    }

    public static async Insert(playerId: number): Promise<number> {
        const conn = await IBS.db.getConnection();
        const [result] = await conn.query<ResultSetHeader>(
            "INSERT INTO inventory (player_id, gold, items) VALUES (?, ?, ?)",
            [playerId, 0, "[]"]
        );
        conn.release();
        return result.insertId;
    }

    public static async Load(playerId: number): Promise<InventoryRecord> {
        const conn = await IBS.db.getConnection();
        const [records] = await conn.query<IInventory[]>(
            "SELECT * FROM inventory WHERE player_id = ?",
            [playerId],
        );
        conn.release();

        const record = new InventoryRecord();
        record.id = records[0].id;
        record.playerId = records[0].player_id;
        record.gold = records[0].gold;
        record.items = records[0].items;
        return record;
    }


    public static async UpdateGold(playerId: number, gold: number) {
        const conn = await IBS.db.getConnection();
        await conn.query("UPDATE inventory SET gold = ? WHERE player_id = ?", [gold, playerId]);
        conn.release();
    }

    // gold and items both ([[item id, amount]] as JSON)
    public static async Update(playerId: number, gold: number, items: string) {
        const conn = await IBS.db.getConnection();
        await conn.query("UPDATE inventory SET gold = ?, items = ? WHERE player_id = ?", [gold, items, playerId]);
        conn.release();
    }

}
