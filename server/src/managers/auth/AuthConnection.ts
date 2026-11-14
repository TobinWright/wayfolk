import { randomUUID as uuid } from "crypto";
import { banText } from "../../../../shared/Admin";
import WebSocket from "ws";
import { IBS } from "../../app";
import { C2S, S2C } from "../../constants/Routes";
import { NameGenerator } from "../../generators/NameGenerator";
import { IPlayer } from "../../types/IPlayer";
import { InventoryRecord } from "../database/InventoryRecord";
import { PlayerRecord } from "../database/PlayerRecord";
import { CosmeticRecord } from "../cosmetics/CosmeticRecord";
import { AuthManager } from "./AuthManager";
import { query } from "./AuthTables";
import { AccountError, checkNewAccount, checkPassword, hashPassword, normalizeEmail, sendConfirmEmail } from "./EmailAccounts";
import {
	disablePassword, emailAccountFor, fillEmail, findGooglePlayer, googleClientId, googleOnlyAccountFor, isEmailVerified, linkGoogle,
	markEmailVerified, verifyGoogleToken,
} from "./GoogleAccounts";
import { publicLink, sendMail } from "./Mailer";
import { count, tooMany } from "./Throttle";
import { forgetAll, newResetToken, newSession, remember, rememberedPlayer, sessionPlayer, useConfirmToken, useResetToken } from "./Tokens";
import { Log } from "../../utils/Log";
const bcrypt = require("bcrypt");

// (compared against when there's no such login, so it takes as long as a wrong password)
const NO_HASH = bcrypt.hashSync(uuid(), 10);

// wrong passwords for one email, and reset emails asked for (per address and per email)
const FAILS_PER_EMAIL = 6;
const FAIL_WINDOW = 10 * 60 * 1000;
const RESETS_PER_ADDRESS = 5;
const RESETS_PER_EMAIL = 3;
const RESET_WINDOW = 60 * 60 * 1000;

const PASSWORD_OFF = "Signed in with Google. Your email password was switched off to keep your account safe - use Forgot password to set a new one.";

// A connection that hasn't signed in yet (sign-in from console8's). It takes
// one attempt at a time - sign in or up as a guest, with an email, with
// Google, with a "remember me" token, or with a password reset link - and once
// one works it's the player's (Player.attach). Anything they should be told
// comes back as TITLE_REFUSED { w: code, e: text }. It also sends password
// reset links (TITLE_FORGOT_PASSWORD) and takes email confirm links
// (TITLE_CONFIRM_EMAIL).
export class AuthConnection {

	private ws: WebSocket;
	public ip: string;

	private busy = false;           // (signing in or up: one at a time)
	private rememberMe = false;     // (the attempt asked for a "remember me" token)
	private needsSession = false;   // (a session token to give if not remembered: not when it signed in with a token)
	private notice: string = null;  // (something to tell them once they're in)
	private timeout: NodeJS.Timeout;

	private boundClose: any;
	private boundMessage: any;

	constructor(ws: WebSocket, ip: string) {
		this.ws = ws;
		this.ip = ip;

		this.addEventListeners();
		this.timeout = setTimeout(() => this.ws.terminate(), AuthManager.TIMEOUT_MS);
		// which sign-ins the title screen can offer
		this.send({ r: S2C.TITLE_AUTH_OPTIONS, g: googleClientId() });
	}

	public send(data: any) {
		if (this.ws.readyState == WebSocket.OPEN) this.ws.send(JSON.stringify(data));
	}

	// not signed in: why (a code the client acts on) and what to tell them
	private refuse(why: string, text: string) {
		this.send({ r: S2C.TITLE_REFUSED, w: why, e: text });
		return -1;
	}

	//#region === Events ===

	private addEventListeners() {
		this.boundClose = this.onClose.bind(this);
		this.boundMessage = this.onMessage.bind(this);

		this.ws.on("close", this.boundClose);
		this.ws.on("message", this.boundMessage);
	}

	private removeEventListeners() {
		this.ws.off("close", this.boundClose);
		this.ws.off("message", this.boundMessage);
	}

	private onClose() {
		Log.debug("Disconnected before signing in", { ip: this.ip });
		clearTimeout(this.timeout);
		this.removeEventListeners();
		IBS.auth.removeConnection(this);
	}

	private onMessage(data: any) {
		if (IBS.closing) return;		// (the server's stopping: Engine.shutdown)
		let message: any;
		try {
			message = JSON.parse(data);
		} catch (e) {
			return;
		}
		if (this.busy || typeof message != "object" || !message) return;
		switch (message.r) {
			case C2S.TITLE_SIGN_IN: this.attempt(message, () => this.signIn(message)); break;
			case C2S.TITLE_SIGN_UP: this.attempt(message, () => this.signUp(message)); break;
			case C2S.TITLE_FORGOT_PASSWORD: this.forgotPassword(message); break;
			case C2S.TITLE_CONFIRM_EMAIL: this.confirmEmail(message); break;
		}
	}

	// signing in or up, then on in as them (refused: still here to try again)
	private async attempt(message: any, work: () => Promise<number>) {
		this.busy = true;
		this.rememberMe = message.rm === 1 && message.t != "guest" && message.t != "token";
		this.needsSession = message.t != "token" && message.t != "session";
		this.notice = null;
		try {
			const playerId = await work();
			if (playerId > 0) await this.loadAccount(playerId);
		} catch (e) {
			IBS.auth.failed(this.ip);
			if (e instanceof AccountError) {
				Log.info("Sign in/up refused", { ip: this.ip, reason: e.message });
				this.refuse(e.code ?? "account", e.message);
			} else {
				Log.error("Sign in error", e, { ip: this.ip });
				this.refuse("account", "Couldn't sign in. Try again.");
			}
		} finally {
			this.busy = false;
		}
	}

	//#endregion

	//#region === Sign In ===

	private async signIn(message: any): Promise<number> {
		if (!IBS.auth.canTry(this.ip)) return this.refuse("wait", "Too many tries. Wait a while, then try again.");
		switch (message.t) {
			case "guest": return this.signInGuest(message);
			case "email": return this.signInEmail(message);
			case "google": return this.signInGoogle(message);
			case "token": return this.signInToken(message);
			case "session": return this.signInSession(message);
			case "reset": return this.signInReset(message);
			default: return this.refuse("type", "That way of signing in isn't open");
		}
	}

	// This browser's guest login: { l, p }. If it doesn't work any more (the
	// account was saved as an email or Google account, or is gone), the client
	// is told so (code "guest") and forgets it, so Guest makes a new one.
	private async signInGuest(message: any): Promise<number> {
		const login = message.l;
		const password = message.p;
		if (typeof login != "string" || typeof password != "string" || login.length > 64 || password.length > 72)
			throw new AccountError("This guest account couldn't be signed in", "guest");

		const records = await query<IPlayer[]>("SELECT id, password FROM player WHERE account_type = 'guest' AND login = ?", [login]);
		const passMatch = await bcrypt.compare(password, records.length ? records[0].password : NO_HASH);
		if (!records.length || !passMatch)
			throw new AccountError("This browser's guest account isn't here any more. Press Guest to start a new one.", "guest");
		return records[0].id;
	}

	// email and password: { l: email, p: password }
	private async signInEmail(message: any): Promise<number> {
		const email = normalizeEmail(message.l);
		const password = message.p;
		if (!email || typeof password != "string" || !password) throw new AccountError("Enter your email and password", "credentials");
		if (email.length > 254 || password.length > 200) throw new AccountError("Wrong email or password", "credentials");
		if (tooMany("email:" + email, FAILS_PER_EMAIL, FAIL_WINDOW))
			throw new AccountError("Too many tries for this email. Wait a few minutes and try again.", "wait");

		const rows = await query<IPlayer[]>(`SELECT id, password FROM player WHERE account_type = 'email' AND login = ?`, [email]);
		// the same answer, taking the same time, either way - so it doesn't say
		// which emails have accounts. (A password switched off is '' - nothing matches it.)
		const hash = rows.length && rows[0].password ? rows[0].password : null;
		const matches = await bcrypt.compare(password, hash ?? NO_HASH);
		if (!hash || !matches) {
			count("email:" + email);
			throw new AccountError("Wrong email or password", "credentials");
		}
		return rows[0].id;
	}

	// Google: { tok: the ID token from Google's button }. A Google account
	// already linked signs in to its player. Otherwise, if Google vouches for
	// an address that has an email account, the two become one account (if
	// nobody ever proved that email account's address, its password is
	// switched off - see disablePassword). Otherwise it's a brand-new account.
	// (A guest saves theirs with Google from Settings instead.)
	private async signInGoogle(message: any): Promise<number> {
		this.rememberMe = true;
		const google = await verifyGoogleToken(message.tok);
		const linked = await findGooglePlayer(google.sub);
		if (linked !== null) return linked;

		if (google.email && google.emailVerified) {
			const emailAccount = await emailAccountFor(google.email);
			if (emailAccount !== null) {
				const proven = await isEmailVerified(emailAccount, google.email);
				await linkGoogle(google, emailAccount);
				if (!proven) {
					await disablePassword(emailAccount);
					this.notice = PASSWORD_OFF;
				}
				Log.info(`Google account linked to email account ${emailAccount}${proven ? "" : " (password switched off)"}`);
				return emailAccount;
			}
		}

		this.checkSignUp();
		const playerId = await this.createAccount("google", google.sub, "", await this.freeName());
		await linkGoogle(google, playerId);
		return playerId;
	}

	// "remember me": { tok } - the token this browser was given. If it's
	// expired or unknown, the client is told (code "token") and forgets it.
	private async signInToken(message: any): Promise<number> {
		const playerId = await rememberedPlayer(message.tok);
		if (playerId === null) throw new AccountError("Please sign in again", "token");
		return playerId;
	}

	// this tab's session (Tokens newSession): { tok }, signing back in after
	// the connection dropped. Expired or unknown: told (code "session").
	private async signInSession(message: any): Promise<number> {
		const playerId = await sessionPlayer(message.tok);
		if (playerId === null) throw new AccountError("Please sign in again", "session");
		return playerId;
	}

	// A password reset link: { tok, p: the new password }. Sets the password
	// (an account that's only used Google so far gets one, becoming an email
	// account too), proves the address, signs out every remembered browser,
	// and signs in.
	private async signInReset(message: any): Promise<number> {
		checkPassword(message.p);
		const reset = await useResetToken(message.tok);
		if (!reset) throw new AccountError("That reset link has expired or was already used. Ask for a new one.", "reset");

		const hash = await hashPassword(message.p);
		const rows = await query<IPlayer[]>(`SELECT account_type FROM player WHERE id = ?`, [reset.playerId]);
		if (rows.length == 0) throw new Error("reset for a missing player " + reset.playerId);
		if (rows[0].account_type == "google") {
			if (await emailAccountFor(reset.email) !== null) throw new AccountError("There's already an account with that email", "reset");
			await query(`UPDATE player SET account_type = 'email', login = ?, password = ? WHERE id = ? AND account_type = 'google'`, [reset.email, hash, reset.playerId]);
		} else {
			await query(`UPDATE player SET password = ? WHERE id = ? AND account_type = 'email'`, [hash, reset.playerId]);
		}
		await markEmailVerified(reset.playerId, reset.email);
		await forgetAll(reset.playerId);
		// (still loaded, working away: their record's type and login may have changed)
		const loaded = IBS.players.getById(reset.playerId);
		if (loaded) {
			loaded.record.accountType = rows[0].account_type == "google" ? "email" : rows[0].account_type;
			if (rows[0].account_type == "google") loaded.record.login = reset.email;
		}
		Log.info("Password reset", { playerId: reset.playerId });
		return reset.playerId;
	}

	//#endregion

	//#region === Links by email ===

	// { l: email } - if it's an account's (with a password, or only Google so
	// far), a reset link is emailed to it. The answer's the same either way,
	// so it doesn't say which emails have accounts.
	private forgotPassword(message: any) {
		const email = normalizeEmail(message.l);
		if (!email || email.length > 254) return;
		if (tooMany("reset:" + this.ip, RESETS_PER_ADDRESS, RESET_WINDOW) || tooMany("reset:" + email, RESETS_PER_EMAIL, RESET_WINDOW)) {
			this.refuse("wait", "Too many reset emails asked for. Try again later.");
			return;
		}
		count("reset:" + this.ip);
		count("reset:" + email);
		this.send({ r: S2C.TITLE_FORGOT_SENT });

		(async () => {
			const playerId = (await emailAccountFor(email)) ?? (await googleOnlyAccountFor(email));
			if (playerId === null) return;
			const link = publicLink({ reset: await newResetToken(playerId, email) });
			await sendMail(email, "Reset your Wayfolk password",
				`Someone asked to reset the password for your Wayfolk account.\n\nTo choose a new password, open this link within an hour:\n${link}\n\nIf it wasn't you, you can ignore this email - nothing has changed.`);
			Log.info("Password reset link sent", { playerId });
		})().catch(Log.catch("Couldn't send a password reset"));
	}

	// { tok } from a confirm link: that email's proven the player's
	private confirmEmail(message: any) {
		if (!IBS.auth.canTry(this.ip)) {
			this.refuse("wait", "Too many tries. Wait a while, then try again.");
			return;
		}
		this.busy = true;
		(async () => {
			const confirm = await useConfirmToken(message.tok);
			if (!confirm) {
				IBS.auth.failed(this.ip);
				this.refuse("confirm", "That confirm link has expired or was already used.");
				return;
			}
			await markEmailVerified(confirm.playerId, confirm.email);
			const loaded = IBS.players.getById(confirm.playerId);
			if (loaded && loaded.record.email == confirm.email) loaded.record.emailConfirmed = true;
			Log.info("Email confirmed", { playerId: confirm.playerId });
			this.send({ r: S2C.TITLE_EMAIL_CONFIRMED, e: confirm.email });
		})().catch((error) => {
			Log.error("Couldn't confirm an email", error);
			this.refuse("confirm", "Couldn't confirm your email. Try again.");
		}).finally(() => this.busy = false);
	}

	//#endregion

	//#region === Sign Up ===

	private async signUp(message: any): Promise<number> {
		this.checkSignUp();
		switch (message.t) {
			case "guest": return this.signUpGuest();
			case "email": return this.signUpEmail(message);
			default: return this.refuse("type", "That way of signing up isn't open");
		}
	}

	// an address that's made too many accounts lately can't make more for a while
	private checkSignUp() {
		if (!IBS.auth.canSignUp(this.ip)) throw new AccountError("Too many new accounts from here. Try again later.", "wait");
	}

	// a new guest: their login and display name told apart (one's half of signing in)
	private async signUpGuest(): Promise<number> {
		const login = await this.freeName();
		const displayName = await this.freeName();
		const password = uuid().split("-")[4];
		const hash = await bcrypt.hash(password, 10); // 10 -> salt rounds
		const playerId = await this.createAccount("guest", login, hash, displayName);

		// send guest credentials
		this.send({
			r: S2C.TITLE_GUEST_CREDENTIALS,
			l: login,
			p: password
		});

		return playerId;
	}

	// a brand-new email account: { l: email, p: password } (a guest turns
	// their own account into one from Settings instead - network PlayerHandler)
	private async signUpEmail(message: any): Promise<number> {
		const email = normalizeEmail(message.l);
		const hash = await checkNewAccount(email, message.p);
		const playerId = await this.createAccount("email", email, hash, await this.freeName());
		sendConfirmEmail(playerId, email);
		return playerId;
	}

	// a name nobody has as a login or display name
	private async freeName() {
		for (let i = 0; i < 20; i++) {
			const name = NameGenerator.getName();
			if (!await PlayerRecord.NameTaken(name)) return name;
		}
		throw new Error("No free guest name");
	}

	//#endregion

	//#region === Create ===

	private async createAccount(type: string, login: string, password: string, displayName: string): Promise<number> {
		const playerId = await PlayerRecord.Insert(type, login, password, displayName);
		await InventoryRecord.Insert(playerId);
		IBS.auth.signedUp(this.ip);
		return playerId;
	}

	//#endregion

	//#region === Load ===

	// (banned: refused whichever way they signed in - AdminManager.ban)
	private async loadAccount(playerId: number) {
		const [ban] = await query<IPlayer[]>("SELECT banned_until, ban_reason FROM player WHERE id = ?", [playerId]);
		if (ban && Number(ban.banned_until) > Date.now()) {
			Log.info("Sign in refused: banned", { playerId, ip: this.ip });
			this.refuse("banned", banText(Number(ban.banned_until), ban.ban_reason));
			return;
		}
		if (!IBS.auth.lock(playerId)) {
			this.refuse("busy", "Signing in already. Try again in a moment.");
			return;
		}
		try {
			await this.enter(playerId);
		} finally {
			IBS.auth.unlock(playerId);
		}
	}

	// signed in: theirs from here (Player.attach)
	private async enter(playerId: number) {
		const rememberToken = this.rememberMe ? await remember(playerId) : null;
		// (not remembered: a session for this tab, to sign back in if the connection drops)
		const sessionToken = rememberToken || !this.needsSession ? null : await newSession(playerId);
		Log.info("Signed in", { playerId, ip: this.ip });
		clearTimeout(this.timeout);
		IBS.auth.removeConnection(this);
		this.removeEventListeners();

		// signed in elsewhere: that's signed out (it may let them go: loaded again here)
		IBS.players.getById(playerId)?.kick();
		let player = IBS.players.getById(playerId);

		// still loaded (their heroes working away) or loaded now
		if (player) IBS.heroes.tasks.catchUp(player);
		else IBS.players.add(player = await IBS.players.load(playerId));
		player.roster ??= await IBS.adventurers.refreshAndLoad(playerId, player.inventory);
		await fillEmail(player.record);
		const social = await IBS.friends.signIn(player);
		player.packs = await CosmeticRecord.packsOf(playerId);
		await IBS.seasons.signIn(player);		// (before attaching: sent with the rest after)
		await IBS.guide.signIn(player);
		await IBS.chests.signIn(player);
		await IBS.achievements.signIn(player);
		const away = IBS.heroes.away.summary(player);      // (before attach clears awayUntil)
		player.attach(this.ws);

		// gone while they loaded: signed out again, as if it had closed after
		if (this.ws.readyState != WebSocket.OPEN) {
			player.detach();
			return;
		}

		PlayerRecord.Touch([playerId], Date.now()).catch(Log.catch("Couldn't save last seen", { playerId }));
		player.send({
			r: S2C.TITLE_SIGNED_IN,
			player: player.record.getJSON(),
			inventory: player.inventory.getJSON(),
			adventurers: player.roster.getAdventurersJSON(),
			heroes: player.heroes.map((h) => IBS.heroes.row(h)),
			barracks: player.barracks.map((h) => IBS.heroes.row(h)),
			chat: IBS.chat.recent(player),
			guild: IBS.guilds.state(player),
			nodes: IBS.nodes.getJSON(),
			events: IBS.events.views(player),
			towns: IBS.events.townRows(),
			sights: IBS.sights.views(player),
			guide: player.record.guide ?? 0,
			guideAt: player.record.guideAt,
			...(rememberToken ? { rt: rememberToken } : {}),
			...(sessionToken ? { st: sessionToken } : {}),
			...(this.notice ? { n: this.notice } : {}),
			...social,
			// parties: roster.getPartiesJSON()
		});
		IBS.friends.presence(player);
		IBS.guilds.presence(player);
		for (const reward of player.eventRewards.splice(0)) player.send({ r: S2C.EVENT_REWARD, ...reward });
		for (const note of player.marketNotes.splice(0)) player.send(note);
		for (const note of player.guildNotes.splice(0)) IBS.chat.note(player, note);
		IBS.chests.resend(player);
		IBS.bounties.signIn(player);
		IBS.achievements.send(player);
		IBS.mail.signedIn(player).catch(Log.catch("Couldn't count a player's mail", { playerId }));
		IBS.seasons.send(player);
		if (away) player.send({ r: S2C.HERO_AWAY, a: away });
		IBS.billing.sendStore(player);
		IBS.cosmetics.send(player);
		IBS.games.send(player);
		IBS.heroes.tasks.formed.sendList(player).catch(Log.catch("Couldn't send a player's parties", { playerId }));
	}

	//#endregion

}
