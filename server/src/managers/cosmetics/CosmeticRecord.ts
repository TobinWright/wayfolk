import { ResultSetHeader, RowDataPacket } from "mysql2";
import { IBS } from "../../app";
import { Catalog, Pack } from "../../../../shared/Wardrobe";

const TABLES = [`
    CREATE TABLE IF NOT EXISTS cosmetic_pack (
        id INT NOT NULL PRIMARY KEY,
        name VARCHAR(32) NOT NULL,
        sort INT NOT NULL DEFAULT 0
    )`, `
    CREATE TABLE IF NOT EXISTS cosmetic_tier (
        look TINYINT NOT NULL,
        value INT NOT NULL,
        tier INT NOT NULL,
        PRIMARY KEY (look, value)
    )`, `
    CREATE TABLE IF NOT EXISTS player_cosmetic_pack (
        player_id INT NOT NULL,
        pack_id INT NOT NULL,
        got_at DATETIME NOT NULL,
        PRIMARY KEY (player_id, pack_id)
    )`,
];

// The cosmetics' catalog (managers/cosmetics, shared/Wardrobe): the packs,
// who each choice is for (cosmetic_tier.tier: 0 everyone, -1 a Supporter,
// else a pack's id), and the packs each player owns (none are sold yet:
// a row put in by hand gives one).
export class CosmeticRecord {

    public static async ensureTables() {
        const conn = await IBS.db.getConnection();
        try {
            for (const table of TABLES) await conn.query(table);
        } finally {
            conn.release();
        }
    }

    private static async query<T extends RowDataPacket[] | ResultSetHeader>(sql: string, values: any[] = []): Promise<T> {
        const conn = await IBS.db.getConnection();
        try {
            const [result] = await conn.query<T>(sql, values);
            return result;
        } finally {
            conn.release();
        }
    }

    // what's saved: the packs, and the choices sorted (null: never sorted)
    public static async load(): Promise<{ packs: Pack[], tiers: [number, number, number][] }> {
        const packs = await this.query<RowDataPacket[]>("SELECT id, name FROM cosmetic_pack ORDER BY sort, id");
        const tiers = await this.query<RowDataPacket[]>("SELECT look, value, tier FROM cosmetic_tier");
        return { packs: packs.map((p) => ({ i: p.id, n: p.name })), tiers: tiers.map((t) => [t.look, t.value, t.tier]) };
    }

    // the whole catalog, in place of what was
    public static async save(catalog: Catalog) {
        const conn = await IBS.db.getConnection();
        try {
            await conn.beginTransaction();
            await conn.query("DELETE FROM cosmetic_pack");
            if (catalog.p.length) await conn.query("INSERT INTO cosmetic_pack (id, name, sort) VALUES ?", [catalog.p.map((p, k) => [p.i, p.n, k])]);
            await conn.query("DELETE FROM cosmetic_tier");
            const rows = catalog.t.flatMap((tiers, look) => tiers.map((tier, value) => [look, value, tier]));
            if (rows.length) await conn.query("INSERT INTO cosmetic_tier (look, value, tier) VALUES ?", [rows]);
            await conn.commit();
        } catch (e) {
            await conn.rollback();
            throw e;
        } finally {
            conn.release();
        }
    }

    public static async packsOf(playerId: number): Promise<number[]> {
        const rows = await this.query<RowDataPacket[]>("SELECT pack_id FROM player_cosmetic_pack WHERE player_id = ?", [playerId]);
        return rows.map((r) => r.pack_id);
    }

    // how many players own each of these packs (those nobody owns left out)
    public static async owners(packIds: number[]): Promise<Map<number, number>> {
        const owners = new Map<number, number>();
        if (!packIds.length) return owners;
        const rows = await this.query<RowDataPacket[]>("SELECT pack_id, COUNT(*) AS n FROM player_cosmetic_pack WHERE pack_id IN (?) GROUP BY pack_id", [packIds]);
        for (const r of rows) owners.set(r.pack_id, Number(r.n));
        return owners;
    }

}
