import { IBS } from "../../app";

// The tables sign-in needs besides player itself (from console8's) - made on
// startup if they aren't there:
//   player_remember        "remember me" tokens (only a hash of each is kept)
//   player_session         session tokens: a tab not remembered signing back in
//                          after the connection drops (a hash of each)
//   password_reset         password reset links (a hash of each)
//   email_confirm          links that confirm an email is the player's (a hash of each)
// (the four kinds of token: the expired ones cleared on starting)
//   player_google          Google accounts and the player each signs in to
//   player_email_verified  emails a player has proven they own (a reset or
//                          confirm link that worked, or Google saying so)
const TABLES = [
    `CREATE TABLE IF NOT EXISTS player_remember (
        token_hash CHAR(64) NOT NULL PRIMARY KEY,
        player_id INT NOT NULL,
        created_at DATETIME NOT NULL,
        expires_at DATETIME NOT NULL,
        INDEX (player_id)
    )`,
    `DELETE FROM player_remember WHERE expires_at < NOW()`,
    `CREATE TABLE IF NOT EXISTS player_session (
        token_hash CHAR(64) NOT NULL PRIMARY KEY,
        player_id INT NOT NULL,
        created_at DATETIME NOT NULL,
        expires_at DATETIME NOT NULL,
        INDEX (player_id),
        INDEX (expires_at)
    )`,
    `DELETE FROM player_session WHERE expires_at < NOW()`,
    `CREATE TABLE IF NOT EXISTS password_reset (
        token_hash CHAR(64) NOT NULL PRIMARY KEY,
        player_id INT NOT NULL,
        email VARCHAR(254) NOT NULL,
        created_at DATETIME NOT NULL,
        expires_at DATETIME NOT NULL,
        used_at DATETIME NULL,
        INDEX (player_id)
    )`,
    `CREATE TABLE IF NOT EXISTS email_confirm (
        token_hash CHAR(64) NOT NULL PRIMARY KEY,
        player_id INT NOT NULL,
        email VARCHAR(254) NOT NULL,
        created_at DATETIME NOT NULL,
        expires_at DATETIME NOT NULL,
        used_at DATETIME NULL,
        INDEX (player_id)
    )`,
    `DELETE FROM password_reset WHERE expires_at < NOW()`,
    `DELETE FROM email_confirm WHERE expires_at < NOW()`,
    `CREATE TABLE IF NOT EXISTS player_google (
        sub VARCHAR(255) NOT NULL PRIMARY KEY,
        player_id INT NOT NULL,
        email VARCHAR(254) NULL,
        created_at DATETIME NOT NULL,
        INDEX (player_id),
        INDEX (email)
    )`,
    `CREATE TABLE IF NOT EXISTS player_email_verified (
        player_id INT NOT NULL,
        email VARCHAR(254) NOT NULL,
        verified_at DATETIME NOT NULL,
        PRIMARY KEY (player_id, email)
    )`,
];

export async function ensureAuthTables() {
    const conn = await IBS.db.getConnection();
    try {
        for (const table of TABLES) await conn.query(table);
    } finally {
        conn.release();
    }
}

// one query on a pooled connection
export async function query<T = any>(sql: string, values: any[] = []): Promise<T> {
    const conn = await IBS.db.getConnection();
    try {
        const [result] = await conn.query(sql, values);
        return result as T;
    } finally {
        conn.release();
    }
}
