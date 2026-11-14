import { ItemId } from "../../constants/Items";

export class Item {

    public id: ItemId;
    public amount: number;

    constructor(data: number[]) {
        this.id = data[0];
        this.amount = data[1];
    }

    public getJSON() {
        return [this.id, this.amount];
    }

}