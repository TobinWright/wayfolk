import { ResultSetHeader } from "mysql2";
import { IBS } from "../../app";
import { Race, Sex } from "../../constants/Constants";
import { IAdventurer } from "../../types/IAdventurer";
import { Utils } from "../../utils/Utils";

export class AdventurerRecord {

    public id: number;
    public playerId: number;
    public activeUntil: Date;

    public race: Race;
    public sex: Sex;
    public name: string;
    public talents: string;
    public skills: string;

    constructor(data?: IAdventurer) {
        this.id = data?.id;
        this.playerId = data?.player_id;
        this.activeUntil = data?.active_until;

        this.race = data?.race;
        this.sex = data?.sex;
        this.name = data?.name;
        this.talents = data?.talents;
        this.skills = data?.skills;
    }

    public static async Insert(playerId: number, race: Race, sex: Sex, name: string, talents: string, skills: string): Promise<AdventurerRecord> {
        const activeUntil = Utils.getActiveUntil();
        const conn = await IBS.db.getConnection();
        const [result] = await conn.query<ResultSetHeader>(
            "INSERT INTO adventurer (player_id, active_until, race, sex, name, talents, skills) VALUES (?, ?, ?, ?, ?, ?, ?)",
            [playerId, activeUntil, race, sex, name, skills, talents]
        );
        conn.release();

        const record = new AdventurerRecord();
        record.id = result.insertId;
        record.playerId = playerId;
        record.activeUntil = activeUntil;
        record.race = race;
        record.sex = sex;
        record.name = name;
        record.talents = talents;
        record.skills = skills;
        return record;
    }

    public static async Load(adventurerId: number): Promise<AdventurerRecord> {
        const conn = await IBS.db.getConnection();
        const [records] = await conn.query<IAdventurer[]>("SELECT * FROM adventurer WHERE id = ?", [adventurerId]);
        conn.release();
        return new AdventurerRecord(records[0]);
    }

    public static async Delete(adventurerId: number) {
        const conn = await IBS.db.getConnection();
        const [result] = await conn.query<ResultSetHeader>("DELETE FROM adventurer WHERE id = ?", [adventurerId]);
        conn.release();
    }

    public static async GetActive(): Promise<AdventurerRecord[]> {
        const conn = await IBS.db.getConnection();
        const [records] = await conn.query<IAdventurer[]>(
            "SELECT * FROM adventurer WHERE active_until > ?",
            [new Date()]
        );
        conn.release();

        const active = [];
        for (let i = 0; i < records.length; i++)
            active.push(new AdventurerRecord(records[i]));
        return active;
    }

    public static async GetIdsByPlayerId(playerId: number): Promise<number[]> {
        const conn = await IBS.db.getConnection();
        const [records] = await conn.query<IAdventurer[]>("SELECT id FROM adventurer WHERE player_id = ?", [playerId]);
        conn.release();

        return records.map(r => r.id);
    }

}