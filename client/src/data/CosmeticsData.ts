import { Access, Catalog, catalogCounts, defaultCatalog } from "../../../shared/Wardrobe";
import { LOOK_COUNTS } from "../people/LookArt";
import { IBC } from "../Engine";

// how many of each part the catalog sorts: the looks, then the status backdrops (shared/Wardrobe's BACKDROP)
export const PART_COUNTS = catalogCounts(LOOK_COUNTS);

// who each cosmetic is for, and the packs you own (server managers/cosmetics; S2C.COSMETIC_CATALOG)
export class CosmeticsData {

    public catalog: Catalog = defaultCatalog(PART_COUNTS);
    public packs: number[] = [];

    public load(message: any) {
        this.catalog = message.c;
        this.packs = message.o ?? [];
    }

    public get access(): Access {
        return { premium: IBC.data.premium.active, packs: this.packs, earned: IBC.data.season.state.b };
    }

}
