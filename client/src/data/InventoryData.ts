export class InventoryData {

    public gold: number;
    public items: Map<number, ID_Item> = new Map();

    public load(json: any) {
        this.gold = json.g;
        this.items.clear();
        for (let i = 0; i < json.i.length; i++)
            this.items.set(json.i[i][0], new ID_Item(json.i[i]));
    }

    // gold, and only the items that changed ([[item id, amount]], 0: none left);
    // what there's more of than before ([[item id, how many more]])
    public apply(json: any) {
        this.gold = json.g;
        const gained: [number, number][] = [];
        for (const [id, amount] of json.i) {
            const more = amount - (this.items.get(id)?.amount ?? 0);
            if (more > 0) gained.push([id, more]);
            if (amount > 0) this.items.set(id, new ID_Item([id, amount]));
            else this.items.delete(id);
        }
        return gained;
    }

}

export class ID_Item {

    public id: number;
    public amount: number;

    constructor(json: any) {
        this.id = json[0];
        this.amount = json[1];
    }

}