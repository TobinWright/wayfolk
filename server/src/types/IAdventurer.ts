import { RowDataPacket } from "mysql2";
import { Race, Sex } from "../constants/Constants";

export interface IAdventurer extends RowDataPacket {
    id: number;
    player_id: number;
    active_until: Date;
    race: Race;
    sex: Sex;
    name: string;
    talents: string;
    skills: string;
}