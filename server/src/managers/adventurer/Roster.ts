import { Adventurer } from "./Adventurer";

export class Roster {

    public adventurers: Adventurer[] = [];

    public add(adventurer: Adventurer) {
        this.adventurers.push(adventurer);
    }

    public remove(adventurer: Adventurer) {
        for (let i = 0; i < this.adventurers.length; i++) {
            if (this.adventurers[i] == adventurer) {
                this.adventurers.splice(i, 1);
                break;
            }
        }
    }

    public getAdventurersJSON() {
        const json = [];
        for (let i = 0; i < this.adventurers.length; i++)
            json.push(this.adventurers[i].getJSON());
        return json;
    }

    public getPartiesJSON() {
        const json = [];
        for (let i = 0; i < this.adventurers.length; i++)
            json.push(this.adventurers[i].party.getJSON());
        return json;
    }

}