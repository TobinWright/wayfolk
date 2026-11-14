import { IBS } from "../../app";
import { Task } from "../../constants/Tasks";
import { Publisher } from "../../pubsub/Publisher";
import { Adventurer } from "../adventurer/Adventurer";

export class Party {

    public x: number;
    public y: number;
    public task: Task;
    public adventurers: Adventurer[] = [];

    public pub: Publisher = new Publisher("Party");

    public update() {
        // TODO: ai to control task and
    }

    public addAdventurer(adventurer: Adventurer) {
        adventurer.party = this;
        this.adventurers.push(adventurer);
    }

    public removeAdventurer(adventurer: Adventurer) {
        adventurer.party = null;
        for (let i = 0; i < this.adventurers.length; i++) {
            if (this.adventurers[i] == adventurer) {
                this.adventurers.splice(i, 1);
                break;
            }
        }
        if (this.adventurers.length == 0)
            IBS.parties.remove(this);
    }

    public isFull() {
        return this.adventurers.length >= 6;
    }

    public getJSON() {
        return {};
    }

}