import { RowDataPacket } from "mysql2";

export interface INode extends RowDataPacket {
    id: number;
    data: string;
}