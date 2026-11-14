import { IBS } from "../../app";
import { S2C } from "../../constants/Routes";
import { Access, Catalog, catalogCounts, cleanCatalog, defaultCatalog } from "../../../../shared/Wardrobe";
import { LOOK_COUNTS } from "../../generators/HeroGenerator";
import { Player } from "../player/Player";
import { CosmeticRecord } from "./CosmeticRecord";

const PARTS = catalogCounts(LOOK_COUNTS);     // (the looks, then the status backdrops)

// Who each cosmetic is for (IBS.cosmetics; shared/Wardrobe's Catalog):
// everyone, a Supporter, or those who own a pack it's in. Sorted by an
// editor in the client's Cosmetics editor (C2S.COSMETIC_SAVE), which sends
// the whole catalog; everyone online is sent it again (S2C.COSMETIC_CATALOG).
// A pack someone owns can't be taken away - only emptied.
export class CosmeticManager {

    public catalog: Catalog;

    public async init() {
        await CosmeticRecord.ensureTables();
        const { packs, tiers } = await CosmeticRecord.load();
        const raw = defaultCatalog(PARTS);
        raw.p = packs;
        for (const [look, value, tier] of tiers) if (raw.t[look] && value < raw.t[look].length) raw.t[look][value] = tier;
        this.catalog = cleanCatalog(raw, PARTS);
    }

    public access(player: Player): Access {
        return { premium: player.record.isPremium(), packs: player.packs, earned: IBS.seasons.earned(player) };
    }

    // { c: catalog, o: the packs they own }
    public send(player: Player) {
        player.send({ r: S2C.COSMETIC_CATALOG, c: this.catalog, o: player.packs });
    }

    // C2S.COSMETIC_SAVE: an editor's sorting, in place of what was
    public async save(player: Player, raw: any) {
        if (!player.canEdit()) return;
        const catalog = cleanCatalog(raw, PARTS);
        if (!catalog) return this.refuse(player, "That isn't a catalog");
        const gone = this.catalog.p.filter((p) => !catalog.p.some((q) => q.i == p.i));
        const owners = await CosmeticRecord.owners(gone.map((p) => p.i));
        for (const pack of gone) {
            const n = owners.get(pack.i);
            if (n) return this.refuse(player, `${n} player${n == 1 ? " owns" : "s own"} the ${pack.n} pack - empty it instead`);
        }
        await CosmeticRecord.save(catalog);
        this.catalog = catalog;
        for (const p of IBS.players.online()) this.send(p);
    }

    public refuse(player: Player, why: string) {
        player.send({ r: S2C.COSMETIC_REFUSED, w: why });
    }

}
