import { createHash, randomBytes } from "crypto";
import { ResultSetHeader, RowDataPacket } from "mysql2";
import { query } from "./AuthTables";

// Random tokens a player holds instead of a password: "remember me" (kept in
// the browser, signs them straight back in), password reset links and email
// confirm links (sent by email). Only a SHA-256 hash of each is stored, so a
// copy of the database can't be used to sign in. (From console8.)

const REMEMBER_DAYS = 30;       // since it was last used
const RESET_MINUTES = 60;
const CONFIRM_DAYS = 7;

function newToken() {
    return randomBytes(32).toString("hex");
}

function hash(token: string) {
    return createHash("sha256").update(token).digest("hex");
}

function looksLikeToken(token: any) {
    return typeof token == "string" && token.length >= 20 && token.length <= 100;
}

//#region === Remember me ===

// a new "remember me" token for a player - give it to their browser
export async function remember(playerId: number): Promise<string> {
    const token = newToken();
    await query(`INSERT INTO player_remember (token_hash, player_id, created_at, expires_at)
        VALUES (?, ?, NOW(), NOW() + INTERVAL ? DAY)`, [hash(token), playerId, REMEMBER_DAYS]);
    return token;
}

// The player a remember token signs in, or null if it's unknown or expired.
// Using it pushes its expiry back.
export async function rememberedPlayer(token: any): Promise<number> {
    if (!looksLikeToken(token)) return null;
    const rows = await query<RowDataPacket[]>(
        `SELECT player_id FROM player_remember WHERE token_hash = ? AND expires_at > NOW()`, [hash(token)]);
    if (rows.length == 0) return null;
    await query(`UPDATE player_remember SET expires_at = NOW() + INTERVAL ? DAY WHERE token_hash = ?`, [REMEMBER_DAYS, hash(token)]);
    return rows[0].player_id;
}

// signing out: that browser's token stops working
export async function forget(token: any) {
    if (looksLikeToken(token)) await query(`DELETE FROM player_remember WHERE token_hash = ?`, [hash(token)]);
}

// every browser remembered for a player stops working (e.g. their password changed)
export async function forgetAll(playerId: number) {
    await query(`DELETE FROM player_remember WHERE player_id = ?`, [playerId]);
    await query(`DELETE FROM player_session WHERE player_id = ?`, [playerId]);
}

//#endregion

//#region === Sessions ===

// A session token: given to a tab that signed in without "remember me" (kept
// in sessionStorage, gone with the tab), so it can sign back in after the
// connection drops or the server restarts. SESSION_HOURS since last used.

const SESSION_HOURS = 12;

export async function newSession(playerId: number): Promise<string> {
    const token = newToken();
    await query(`INSERT INTO player_session (token_hash, player_id, created_at, expires_at)
        VALUES (?, ?, NOW(), NOW() + INTERVAL ? HOUR)`, [hash(token), playerId, SESSION_HOURS]);
    return token;
}

// the player a session token signs in (null: unknown or expired); using it pushes its expiry back
export async function sessionPlayer(token: any): Promise<number> {
    if (!looksLikeToken(token)) return null;
    const rows = await query<RowDataPacket[]>(
        `SELECT player_id FROM player_session WHERE token_hash = ? AND expires_at > NOW()`, [hash(token)]);
    if (rows.length == 0) return null;
    await query(`UPDATE player_session SET expires_at = NOW() + INTERVAL ? HOUR WHERE token_hash = ?`, [SESSION_HOURS, hash(token)]);
    return rows[0].player_id;
}

export async function forgetSession(token: any) {
    if (looksLikeToken(token)) await query(`DELETE FROM player_session WHERE token_hash = ?`, [hash(token)]);
}

//#endregion

//#region === Links by email ===

// a new link token for a player's email in `table` (older unused ones stop working)
async function newLinkToken(table: string, playerId: number, email: string, interval: string): Promise<string> {
    const token = newToken();
    await query(`UPDATE ${table} SET used_at = NOW() WHERE player_id = ? AND used_at IS NULL`, [playerId]);
    await query(`INSERT INTO ${table} (token_hash, player_id, email, created_at, expires_at)
        VALUES (?, ?, ?, NOW(), NOW() + INTERVAL ${interval})`, [hash(token), playerId, email]);
    return token;
}

// Uses up a link token: the player and email it was sent for, or null if
// it's unknown, expired or already used. Only one use ever wins.
async function useLinkToken(table: string, token: any): Promise<{ playerId: number, email: string }> {
    if (!looksLikeToken(token)) return null;
    const rows = await query<RowDataPacket[]>(
        `SELECT player_id, email FROM ${table} WHERE token_hash = ? AND used_at IS NULL AND expires_at > NOW()`, [hash(token)]);
    if (rows.length == 0) return null;
    const result = await query<ResultSetHeader>(
        `UPDATE ${table} SET used_at = NOW() WHERE token_hash = ? AND used_at IS NULL`, [hash(token)]);
    if (result.affectedRows != 1) return null;
    return { playerId: rows[0].player_id, email: rows[0].email };
}

// password reset links (an hour)
export const newResetToken = (playerId: number, email: string) => newLinkToken("password_reset", playerId, email, `${RESET_MINUTES} MINUTE`);
export const useResetToken = (token: any) => useLinkToken("password_reset", token);

// email confirm links (a week)
export const newConfirmToken = (playerId: number, email: string) => newLinkToken("email_confirm", playerId, email, `${CONFIRM_DAYS} DAY`);
export const useConfirmToken = (token: any) => useLinkToken("email_confirm", token);

//#endregion
