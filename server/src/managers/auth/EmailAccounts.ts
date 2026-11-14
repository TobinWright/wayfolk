import { RowDataPacket } from "mysql2";
import { query } from "./AuthTables";
import { publicLink, sendMail } from "./Mailer";
import { newConfirmToken } from "./Tokens";
import { Log } from "../../utils/Log";
const bcrypt = require("bcrypt");

// What email accounts share between signing up (AuthConnection, on the title
// screen) and a guest saving their account with an email (network
// PlayerHandler, from Settings): the rules for an email and password, and
// whether an email's taken. An email account is a player row of account_type
// 'email', with the lowercased email as its login and a bcrypt hash.

// something about signing in or an account the player should be told -
// code: a tag the client acts on ("guest": forget this browser's guest login,
// "token": forget its remember-me token, "reset": the reset link's used up)
export class AccountError {
    constructor(public message: string, public code?: string) { }
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const EMAIL_MAX = 254;
export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 72; // bcrypt ignores anything past 72 bytes

export function normalizeEmail(value: any) {
    return typeof value == "string" ? value.trim().toLowerCase() : "";
}

// Checks a new account's email (normalized) and password, and that nobody
// has the email yet - throws an AccountError if not. Returns the password's hash.
export async function checkNewAccount(email: string, password: any): Promise<string> {
    if (!EMAIL.test(email) || email.length > EMAIL_MAX) throw new AccountError("That doesn't look like an email address");
    checkPassword(password);

    const rows = await query<RowDataPacket[]>(`SELECT id FROM player WHERE account_type = 'email' AND login = ?`, [email]);
    if (rows.length > 0) throw new AccountError("There's already an account with that email");
    // a Google account with this address (and no password yet) - it gets one
    // with a reset link, not a second account
    const google = await query<RowDataPacket[]>(
        `SELECT g.player_id FROM player_google g JOIN player p ON p.id = g.player_id WHERE g.email = ? AND p.account_type = 'google'`, [email]);
    if (google.length > 0) throw new AccountError("There's already an account with that email - sign in with Google");
    return hashPassword(password);
}

// throws an AccountError if a new password isn't allowed
export function checkPassword(password: any) {
    if (typeof password != "string" || password.length < PASSWORD_MIN || Buffer.byteLength(password) > PASSWORD_MAX)
        throw new AccountError(`Use a password of ${PASSWORD_MIN} to ${PASSWORD_MAX} characters`);
}

export function hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, 10);
}

// Emails a link that proves the address is the player's (PUBLIC_URL?confirm=).
// Playing doesn't wait for it; a confirmed address keeps its password if
// Google is later used for it (GoogleAccounts disablePassword). Never throws.
export function sendConfirmEmail(playerId: number, email: string) {
    (async () => {
        const link = publicLink({ confirm: await newConfirmToken(playerId, email) });
        await sendMail(email, "Confirm your Wayfolk email",
            `Welcome to Wayfolk!\n\nTo confirm this is your email, open this link within a week:\n${link}\n\nIf you didn't make a Wayfolk account, you can ignore this email.`);
        Log.info("Confirm link sent", { playerId });
    })().catch(Log.catch("Couldn't send a confirm link"));
}
