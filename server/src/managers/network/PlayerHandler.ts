import { IBS } from "../../app";
import { C2S, S2C } from "../../constants/Routes";
import { AccountError, checkNewAccount, normalizeEmail, sendConfirmEmail } from "../auth/EmailAccounts";
import { emailAccountFor, fillEmail, findGooglePlayer, GoogleAccount, linkGoogle, verifyGoogleToken } from "../auth/GoogleAccounts";
import { count, tooMany } from "../auth/Throttle";
import { forget, forgetSession, remember } from "../auth/Tokens";
import { PlayerRecord } from "../database/PlayerRecord";
import { Player } from "../player/Player";
import { Log } from "../../utils/Log";

const SAVE_FAILS = 10, SAVE_WINDOW = 10 * 60 * 1000;      // (each failure says whether an email's taken - so not too many)
const CONFIRMS = 3, CONFIRM_WINDOW = 60 * 60 * 1000;      // confirm links sent again

export class PlayerHandler {

    private saving = new Set<number>();     // (player ids: one save at a time)

    public onMessage(player: Player, message: any) {
        switch (message.r) {
            case C2S.PLAYER_RENAME: IBS.players.rename(player, message.n).catch((error) => {
                Log.error("Couldn't rename", error, { playerId: player.id });
                player.send({ r: S2C.PLAYER_REFUSED, w: "Couldn't change it" });
            }); break;
            case C2S.PLAYER_GUIDE_SEEN: IBS.guide.seen(player, message.s); break;
            case C2S.PLAYER_CHEST_OPEN: IBS.chests.open(player, message.i, message.b); break;
            case C2S.PLAYER_ACHIEVE: IBS.achievements.achieve(player, message.a); break;
            case C2S.PLAYER_SAVE_ACCOUNT: this.saveAccount(player, message); break;
            case C2S.PLAYER_SIGN_OUT: this.signOut(player, message); break;
            case C2S.PLAYER_RESEND_CONFIRM: this.resendConfirm(player); break;
            case C2S.PLAYER_EXPORT: IBS.account.exportData(player).catch(Log.catch("Couldn't export a player's data", { playerId: player.id })); break;
            case C2S.PLAYER_DELETE: IBS.account.remove(player, message).catch((error) => {
                Log.error("Couldn't delete a player", error, { playerId: player.id });
                player.send({ r: S2C.PLAYER_DELETE_REFUSED, w: "Couldn't delete your account - try again" });
            }); break;
            case C2S.PLAYER_PROFILE: IBS.profiles.send(player, message.n).catch(Log.catch("Couldn't send a profile", { playerId: player.id })); break;
            case C2S.PLAYER_PROFILE_SET: IBS.profiles.set(player, message.a, message.v).catch((error) => {
                Log.error("Couldn't save a profile", error, { playerId: player.id });
                player.send({ r: S2C.PLAYER_PROFILE_REFUSED, w: "Couldn't save it - try again" });
            }); break;
        }
    }

    // A guest saves their account with an email and password, or with
    // Google (t: "google", tok: the ID token): the same player becomes that
    // kind of account, keeping everything they have (the title screen only
    // makes new accounts). This browser is remembered for the new account.
    private saveAccount(player: Player, message: any) {
        if (player.record.accountType != "guest" || this.saving.has(player.id)) return;
        if (tooMany("save:" + player.id, SAVE_FAILS, SAVE_WINDOW)) {
            player.send({ r: S2C.PLAYER_SAVE_REFUSED, e: "Too many tries. Wait a few minutes and try again." });
            return;
        }
        this.saving.add(player.id);
        const google = message.t === "google";
        this.newLogin(message)
            .then(async ({ login, hash, googleAccount }) => {
                const type = google ? "google" : "email";
                if (!(await PlayerRecord.UpgradeGuest(player.id, type, login, hash))) throw new AccountError("Couldn't save your account. Try again.");
                if (googleAccount) await linkGoogle(googleAccount, player.id);
                else sendConfirmEmail(player.id, login);
                player.record.accountType = type;
                player.record.login = login;
                await fillEmail(player.record);
                Log.info(`Guest ${player.id} saved as a${google ? " Google" : "n email"} account`);
                player.send({ r: S2C.PLAYER_ACCOUNT_SAVED, player: player.record.getJSON(), rt: await remember(player.id) });
            })
            .catch((error) => {
                count("save:" + player.id);
                if (error instanceof AccountError) Log.info("Account not saved", { playerId: player.id, reason: error.message }); else Log.error("Couldn't save an account", error, { playerId: player.id });
                player.send({ r: S2C.PLAYER_SAVE_REFUSED, e: error instanceof AccountError ? error.message : "Couldn't save your account. Try again." });
            })
            .finally(() => this.saving.delete(player.id));
    }

    // what a guest saving their account will sign in with: an email that
    // isn't taken and its password's hash, or a Google account that doesn't
    // have its own player yet (two accounts can't be merged)
    private async newLogin(message: any): Promise<{ login: string, hash: string, googleAccount?: GoogleAccount }> {
        if (message.t === "google") {
            const googleAccount = await verifyGoogleToken(message.tok);
            if (await findGooglePlayer(googleAccount.sub) !== null) throw new AccountError("That Google account already has its own Wayfolk account");
            if (googleAccount.email && await emailAccountFor(googleAccount.email) !== null)
                throw new AccountError("That Google account's email already has its own Wayfolk account");
            return { login: googleAccount.sub, hash: "", googleAccount };
        }
        const email = normalizeEmail(message.l);
        return { login: email, hash: await checkNewAccount(email, message.p) };
    }

    // signing out: this browser's remember-me token and this tab's session stop working, and the
    // client goes back to the title screen
    private signOut(player: Player, message: any) {
        Promise.all([forget(message.tok), forgetSession(message.st)])
            .catch(Log.catch("Couldn't forget a sign-in token", { playerId: player.id }))
            .finally(() => player.send({ r: S2C.PLAYER_SIGNED_OUT }));
    }

    // an email account's confirm link sent again (not yet confirmed)
    private resendConfirm(player: Player) {
        const { accountType, email, emailConfirmed } = player.record;
        if (accountType != "email" || !email || emailConfirmed) return;
        if (tooMany("confirm:" + player.id, CONFIRMS, CONFIRM_WINDOW)) {
            player.send({ r: S2C.PLAYER_SAVE_REFUSED, e: "A link was sent a few times already. Check your inbox (and spam), or try later." });
            return;
        }
        count("confirm:" + player.id);
        sendConfirmEmail(player.id, email);
        player.send({ r: S2C.PLAYER_CONFIRM_SENT, e: email });
    }

}
