import { RowDataPacket } from "mysql2";
import { Role } from "../constants/Constants";

export interface IPlayer extends RowDataPacket {
    id: number;
    created_at: number;
    active_at: number;
    premium_until: number;
    account_type: string;
    role: Role;
    login: string;
    password: string;
    display_name: string;
    name_color: number;
    chat_muted_until: number;
    guide: number;
    guide_at: any;
    banned_until: number;
    ban_reason: string;
}