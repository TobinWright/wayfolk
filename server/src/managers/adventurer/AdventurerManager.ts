import { IBS } from "../../app";
import { Race, Sex } from "../../constants/Constants";
import { NameGenerator } from "../../generators/NameGenerator";
import { Utils } from "../../utils/Utils";
import { AdventurerRecord } from "../database/AdventurerRecord";
import { Inventory } from "../inventory/Inventory";
import { Adventurer } from "./Adventurer";
import { Roster } from "./Roster";
import { Log } from "../../utils/Log";

export class AdventurerManager {

    private adventurers: Map<number, Adventurer> = new Map();

    public async init() {
        const records = await AdventurerRecord.GetActive();
        for (let i = 0; i < records.length; i++) {
            const inventory = await IBS.inventories.retrieve(records[i].playerId);
            this.create(records[i], inventory);
        }
        Log.info("Adventurers loaded", { count: this.adventurers.size });
    }

    public async generateNew(playerId: number, sex: Sex): Promise<Adventurer> {
        const name = NameGenerator.getCharacterName(sex);
        const race = Race.HUMAN;
        const record = await AdventurerRecord.Insert(playerId, race, sex, name, "[]", "[]");
        const inventory = await IBS.inventories.retrieve(playerId);
        const adventurer = this.create(record, inventory);
        return adventurer;
    }

    public async refreshAndLoad(playerId: number, inventory: Inventory): Promise<Roster> {
        const roster: Roster = new Roster();

        // get all adventurer ids owned by player
        const ids = await AdventurerRecord.GetIdsByPlayerId(playerId);
        if (ids.length == 0) return roster;

        // update sleep on active adventurers,
        // load records of inactive
        const promises = [];
        for (let i = 0; i < ids.length; i++) {
            const adventurer = this.getById(ids[i]);
            if (adventurer) {
                adventurer.setActiveUntil(Utils.getActiveUntil());
                roster.add(adventurer);
            } else {
                promises.push(AdventurerRecord.Load(ids[i]));
            }
        }

        // if records, load and create adventurers
        if (promises.length > 0) {
            const records = await Promise.all(promises);
            for (let i = 0; i < records.length; i++) {
                const adventurer = this.create(records[i], inventory);
                roster.add(adventurer);
            }
        }

        return roster;
    }

    public removeById(id: number) {
        this.adventurers.delete(id);
    }

    public getById(id: number) {
        return this.adventurers.get(id);
    }

    public getByPlayerId(playerId: number) {
        var adventurers = [];
        for (const [key, value] of this.adventurers.entries())
            if (value.playerId == playerId)
                adventurers.push(value);
        return adventurers;
    }

    private create(record: AdventurerRecord, inventory: Inventory) {
        const adventurer = new Adventurer(record);
        adventurer.inventory = inventory;
        adventurer.setActiveUntil(Utils.getActiveUntil());
        this.adventurers.set(record.id, adventurer);

        return adventurer;
    }

}