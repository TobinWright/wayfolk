import { RowDataPacket } from "mysql2";

export interface IInventory extends RowDataPacket {
    id: number;
    player_id: number;
    gold: number;
    items: string;
}