import { IBS } from "../../app";
import { Task } from "../../constants/Tasks";
import { Publisher } from "../../pubsub/Publisher";
import { AdventurerRecord } from "../database/AdventurerRecord";
import { Inventory } from "../inventory/Inventory";
import { Party } from "../party/Party";

export class Adventurer {

    private record: AdventurerRecord;

    public inventory: Inventory;
    public party: Party;
    public pub: Publisher;

    public id: number;
    public playerId: number;

    public name: string;
    public task: Task = Task.RESTING;
    public x: number;
    public y: number;

    constructor(record: AdventurerRecord) {
        this.record = record;

        this.create();
        IBS.parties.joinOrCreate(this);
    }

    private create() {
        this.id = this.record.id;
        this.playerId = this.record.playerId;

        this.name = this.record.name;

        this.pub = new Publisher("Adventurer [" + this.name + "]");
    }

    public setActiveUntil(activeUntil: Date) {
        this.record.activeUntil = activeUntil;
    }

    public getJSON() {
        return {
            aId: this.id,
            pId: this.playerId,

            n: this.name
        };
    }

}