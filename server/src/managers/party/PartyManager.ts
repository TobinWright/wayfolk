import { Task } from "../../constants/Tasks";
import { Adventurer } from "../adventurer/Adventurer";
import { Party } from "./Party";

export class PartyManager {

    private parties: Party[] = [];

    public update() {
        for (let i = 0; i < this.parties.length; i++)
            this.parties[i].update();
    }

    public joinOrCreate(adventurer: Adventurer) {
        let found = false;
        const parties = this.getByPosAndTask(adventurer.x, adventurer.y, adventurer.task);
        for (let i = 0; i < parties.length; i++) {
            if (parties[i].isFull()) continue;
            parties[i].addAdventurer(adventurer);
            found = true;
            break;
        }

        if (!found) {
            const party = this.create(adventurer.x, adventurer.y, adventurer.task);
            party.addAdventurer(adventurer);
        }
    }

    private create(x: number, y: number, task: Task) {
        const party = new Party();
        party.x = x;
        party.y = y;
        party.task = task;
        this.parties.push(party);
        return party;
    }

    public remove(party: Party) {
        for (let i = 0; i < this.parties.length; i++) {
            if (this.parties[i] == party) {
                this.parties.splice(i, 1);
                break;
            }
        }
    }

    private getByPosAndTask(x: number, y: number, task: Task) {
        const parties = [];
        for (let i = 0; i < this.parties.length; i++)
            if (this.parties[i].x == x &&
                this.parties[i].y == y &&
                this.parties[i].task == task)
                parties.push(this.parties[i]);
        return parties;
    }

}