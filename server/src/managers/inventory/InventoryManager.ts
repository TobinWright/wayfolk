import { IBS } from "../../app";
import { InventoryRecord } from "../database/InventoryRecord";
import { Inventory } from "./Inventory";

export class InventoryManager {

    private inventories: Map<number, Inventory> = new Map();

    public async retrieve(playerId: number): Promise<Inventory> {
        // check cache
        if (this.inventories.has(playerId))
            return this.inventories.get(playerId);

        // check for active players inventory
        const player = IBS.players.getById(playerId);
        if (player && player.inventory)
            return player.inventory;

        // check for active adventurers inventory
        const adventurers = IBS.adventurers.getByPlayerId(playerId);
        if (adventurers[0] && adventurers[0].inventory)
            return adventurers[0].inventory;

        // if no player and no adventurers, load from database
        const record = await InventoryRecord.Load(playerId);
        return new Inventory(this, record);
    }

    public getById(inventoryId: number) {
        return this.inventories.get(inventoryId);
    }

}