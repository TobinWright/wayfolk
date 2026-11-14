import { OAuth2Client } from "google-auth-library";
import { RowDataPacket } from "mysql2";
import { ENV } from "../../utils/Env";
import { PlayerRecord } from "../database/PlayerRecord";
import { query } from "./AuthTables";
import { AccountError } from "./EmailAccounts";
import { forgetAll } from "./Tokens";
import { Log } from "../../utils/Log";

// Google accounts (from console8): the client shows Google's "Sign in with
// Google" button, which hands it an ID token (a JWT signed by Google); the
// server checks it here with Google's library. Each Google account (its id,
// sub, which never changes) is linked to one player in player_google. Nothing
// works until GOOGLE_CLIENT_ID is set in server/.env (the OAuth client id from
// Google Cloud Console) - the client hides the button until the server says
// it's set (S2C.TITLE_AUTH_OPTIONS).
//
// Same email, same account: signing in with Google for an address that has
// an email account signs in to that account (once Google says the address is
// verified), and from then on both work. A player that's only ever used
// Google is account_type 'google' with the sub as its login; it gets an email
// password (becoming 'email') through a password reset link.

let client: OAuth2Client = null;

export interface GoogleAccount {
    sub: string;
    email: string;          // lowercased, or null
    emailVerified: boolean; // Google says the address is theirs
}

export function googleClientId(): string {
    return ENV.GOOGLE_CLIENT_ID || null;
}

// The Google account an ID token is for, or an AccountError if Google sign-in
// isn't set up or the token isn't good (forged, expired, or for another app).
export async function verifyGoogleToken(token: any): Promise<GoogleAccount> {
    const clientId = googleClientId();
    if (!clientId) throw new AccountError("Google sign-in isn't set up yet");
    if (typeof token != "string" || token.length > 4096) throw new AccountError("Couldn't sign in with Google");

    client ??= new OAuth2Client(clientId);
    let payload;
    try {
        const ticket = await client.verifyIdToken({ idToken: token, audience: clientId });
        payload = ticket.getPayload();
    } catch (error: any) {
        Log.warn("Google token rejected", { reason: error?.message ?? String(error) });
        throw new AccountError("Couldn't sign in with Google");
    }
    if (!payload?.sub) throw new AccountError("Couldn't sign in with Google");
    return {
        sub: payload.sub,
        email: typeof payload.email == "string" ? payload.email.trim().toLowerCase() : null,
        emailVerified: payload.email_verified === true,
    };
}

// the player this Google account signs in to, or null
export async function findGooglePlayer(sub: string): Promise<number> {
    const rows = await query<RowDataPacket[]>(`SELECT player_id FROM player_google WHERE sub = ?`, [sub]);
    return rows.length ? rows[0].player_id : null;
}

// the email of the Google account a player signs in with (the first linked), or null
export async function googleEmailOf(playerId: number): Promise<string> {
    const rows = await query<RowDataPacket[]>(`SELECT email FROM player_google WHERE player_id = ? ORDER BY created_at LIMIT 1`, [playerId]);
    return rows.length ? rows[0].email : null;
}

// a signed-in player's address and whether it's proven theirs, on their
// record for the client (Settings): an email account's login, a Google
// account's Google email, a guest's nothing
export async function fillEmail(record: PlayerRecord) {
    record.email = record.accountType == "email" ? record.login : record.accountType == "google" ? await googleEmailOf(record.id) : null;
    record.emailConfirmed = !!record.email && await isEmailVerified(record.id, record.email);
}

export async function linkGoogle(google: GoogleAccount, playerId: number) {
    await query(`INSERT INTO player_google (sub, player_id, email, created_at) VALUES (?, ?, ?, NOW())`,
        [google.sub, playerId, google.email]);
    if (google.email && google.emailVerified) await markEmailVerified(playerId, google.email);
}

// the email account (with a password) for this address, or null
export async function emailAccountFor(email: string): Promise<number> {
    const rows = await query<RowDataPacket[]>(`SELECT id FROM player WHERE account_type = 'email' AND login = ?`, [email]);
    return rows.length ? rows[0].id : null;
}

// the Google-only account (no password yet) for this address, or null
export async function googleOnlyAccountFor(email: string): Promise<number> {
    const rows = await query<RowDataPacket[]>(
        `SELECT g.player_id FROM player_google g JOIN player p ON p.id = g.player_id WHERE g.email = ? AND p.account_type = 'google'`, [email]);
    return rows.length ? rows[0].player_id : null;
}

export async function isEmailVerified(playerId: number, email: string) {
    const rows = await query<RowDataPacket[]>(`SELECT 1 FROM player_email_verified WHERE player_id = ? AND email = ?`, [playerId, email]);
    return rows.length > 0;
}

export async function markEmailVerified(playerId: number, email: string) {
    await query(`INSERT IGNORE INTO player_email_verified (player_id, email, verified_at) VALUES (?, ?, NOW())`, [playerId, email]);
}

// Google proved the address, but nobody ever proved it for this email
// account's password - someone could have signed up with another person's
// address. So the password is switched off (and every remembered browser
// signed out); the owner sets a new one with a reset link to that address.
export async function disablePassword(playerId: number) {
    await query(`UPDATE player SET password = '' WHERE id = ? AND account_type = 'email'`, [playerId]);
    await forgetAll(playerId);
}
