import { Publisher } from "../../pubsub/Publisher";
import { InventoryRecord } from "../database/InventoryRecord";
import { InventoryManager } from "./InventoryManager";
import { Item } from "./Item";

export class Inventory {

    private manager: InventoryManager;
    private record: InventoryRecord;

    public pub: Publisher;
    public id: number;
    public playerId: number;

    public gold: number;
    public items: Map<number, Item> = new Map();
    public changed = new Set<number>();     // (item ids adjusted since last sent)

    constructor(manager: InventoryManager, record: InventoryRecord) {
        this.manager = manager;
        this.record = record;

        this.pub = new Publisher("Inventory");
        this.id = record.id;
        this.playerId = record.playerId;

        this.gold = record.gold;
        const items = JSON.parse(record.items);
        for (let i = 0; i < items.length; i++)
            this.items.set(items[i][0], new Item(items[i]));
    }

    public adjustItem(itemId: number, amount: number) {
        this.changed.add(itemId);
        const item = this.items.get(itemId);
        if (item) {
            item.amount += amount;
            if (item.amount <= 0)
                this.items.delete(itemId);
        } else {
            if (amount > 0)
                this.items.set(itemId, new Item([itemId, amount]));
        }
    }

    public adjustGold(amount: number) {
        this.gold += amount;

        this.pub.emit("i-g", this.gold);
    }

    public hasItem(itemId: number) {
        return this.items.get(itemId) != undefined;
    }

    // the items adjusted since last time, [[item id, amount]] (0: none left)
    public takeChanged() {
        const out = Array.from(this.changed, id => [id, this.items.get(id)?.amount ?? 0]);
        this.changed.clear();
        return out;
    }

    public getJSON() {
        return {
            g: this.gold,
            i: Array.from(this.items.values()).map(i => i.getJSON())
        }
    }

}