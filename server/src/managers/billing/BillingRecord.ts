import { ResultSetHeader, RowDataPacket } from "mysql2";
import { IBS } from "../../app";

const TABLES = [`
    CREATE TABLE IF NOT EXISTS player_stripe_customer (
        player_id INT NOT NULL PRIMARY KEY,
        stripe_customer_id VARCHAR(64) NOT NULL,
        UNIQUE KEY (stripe_customer_id)
    )`, `
    CREATE TABLE IF NOT EXISTS player_subscription (
        player_id INT NOT NULL PRIMARY KEY,
        subscription_id VARCHAR(64) NOT NULL,
        status VARCHAR(24) NOT NULL,
        renews TINYINT NOT NULL,
        until DATETIME NOT NULL,
        updated_at DATETIME NOT NULL
    )`, `
    CREATE TABLE IF NOT EXISTS stripe_event (
        event_id VARCHAR(64) NOT NULL PRIMARY KEY,
        type VARCHAR(64) NOT NULL,
        created_at DATETIME NOT NULL
    )`,
];

// What Stripe has told us (managers/billing): each player's Stripe customer
// (subscription events only name the customer), their subscription (and
// player.premium_until with it, what the rest of the server goes by), and
// the webhook events already handled (Stripe can send one more than once).
export class BillingRecord {

    // makes the tables if they aren't there yet (and player.name_color, a Supporter's pick)
    public static async ensureTables() {
        const conn = await IBS.db.getConnection();
        try {
            for (const table of TABLES) await conn.query(table);
            try {
                await conn.query("ALTER TABLE player ADD COLUMN name_color TINYINT NOT NULL DEFAULT 0");
            } catch (e) {
                if ((e as any).errno != 1060) throw e;     // (already there)
            }
        } finally {
            conn.release();
        }
    }

    private static async query<T extends RowDataPacket[] | ResultSetHeader>(sql: string, values: any[]): Promise<T> {
        const conn = await IBS.db.getConnection();
        try {
            const [result] = await conn.query<T>(sql, values);
            return result;
        } finally {
            conn.release();
        }
    }

    public static async customerOf(playerId: number): Promise<string> {
        const rows = await this.query<RowDataPacket[]>(`SELECT stripe_customer_id FROM player_stripe_customer WHERE player_id = ?`, [playerId]);
        return rows[0]?.stripe_customer_id ?? null;
    }

    public static async playerOfCustomer(customerId: string): Promise<number> {
        const rows = await this.query<RowDataPacket[]>(`SELECT player_id FROM player_stripe_customer WHERE stripe_customer_id = ?`, [customerId]);
        return rows[0]?.player_id ?? null;
    }

    public static async setCustomer(playerId: number, customerId: string) {
        await this.query<ResultSetHeader>(`INSERT IGNORE INTO player_stripe_customer (player_id, stripe_customer_id) VALUES (?, ?)`, [playerId, customerId]);
    }

    // true if their subscription will renew (paid up and not cancelled)
    public static async renews(playerId: number): Promise<boolean> {
        const rows = await this.query<RowDataPacket[]>(`SELECT renews FROM player_subscription WHERE player_id = ?`, [playerId]);
        return rows[0]?.renews == 1;
    }

    // their subscription, and premium until `until` (ms)
    public static async setSubscription(playerId: number, subscriptionId: string, status: string, renews: boolean, until: number) {
        const at = Math.floor(until / 1000);
        await this.query<ResultSetHeader>(
            `INSERT INTO player_subscription (player_id, subscription_id, status, renews, until, updated_at) VALUES (?, ?, ?, ?, FROM_UNIXTIME(?), NOW())
             ON DUPLICATE KEY UPDATE subscription_id = VALUES(subscription_id), status = VALUES(status), renews = VALUES(renews), until = VALUES(until), updated_at = NOW()`,
            [playerId, subscriptionId, status, renews ? 1 : 0, at]);
        await this.query<ResultSetHeader>(`UPDATE player SET premium_until = FROM_UNIXTIME(?) WHERE id = ?`, [at, playerId]);
    }

    public static async handled(eventId: string) {
        const rows = await this.query<RowDataPacket[]>(`SELECT event_id FROM stripe_event WHERE event_id = ?`, [eventId]);
        return rows.length > 0;
    }

    // only once it's been fully handled - marking it first and failing part
    // way would lose the grant, as Stripe's retry would be skipped
    public static async markHandled(eventId: string, type: string) {
        await this.query<ResultSetHeader>(`INSERT IGNORE INTO stripe_event (event_id, type, created_at) VALUES (?, ?, NOW())`, [eventId, type]);
    }

}
