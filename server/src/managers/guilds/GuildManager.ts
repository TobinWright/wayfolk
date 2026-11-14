import { PoolConnection, RowDataPacket } from "mysql2/promise";
import { IBS } from "../../app";
import { isItem } from "../../../../shared/Market";
import { itemName } from "../../../../shared/Tasks";
import { S2C } from "../../constants/Routes";
import { CHAT_GAP_MS, CHAT_LONGEST, ChatLine, cleanChat, GUILD_CHANNEL, SAME_LINE_MS } from "../../../../shared/Chat";
import { chatRefusal } from "../../../../shared/ChatFilter";
import { Presence, Someone } from "../../../../shared/Friends";
import {
    ACTION_GAP_MS, guildCraftMul, HALL_AMOUNT_MOST, hallDay, HALL_LOG_MOST, HallLine, hallRoom, HallView, TAKES_A_DAY, takesLeft, BROWSE_SHOWN, canEditNotice, canInvite, canKick, cleanGuildName, cleanNotice, cleanTag, GUILD_COST, GUILD_KEPT,
    GUILD_NAME_LONGEST, GuildInvite, GuildMember, GuildRow, GuildState, GuildView, guildNameProblem, INVITE_DAYS, INVITES_MOST,
    isLeader, Rank, tagProblem,
    ALL_GOALS_XP, GOAL_GOLD, GOAL_XP, goalTarget, goalText, guildGoldMul, guildLevel, guildXpMul, levelPerk, membersMost, weekGoals, WeekView,
} from "../../../../shared/Guilds";
import { Deed, weekOf, weekStart } from "../../../../shared/Seasons";
import { Player } from "../player/Player";
import { Log } from "../../utils/Log";

// Guilds (shared/Guilds.ts). Every guild is kept in memory, loaded on
// starting, and changed there first, then saved: `guild` a row a guild,
// `guild_member` a row a player in one (their rank, `grade`), `guild_invite`
// the invites waiting. Whatever changes, the guild's view goes again to its
// members signed in (and the invites to whoever they're about); one signing
// in or out goes to the others as just that member. A guild's chat keeps its
// last GUILD_KEPT lines in memory (gone when the server restarts, as the
// channels' are), its lines numbered with the channels' so they're reported
// the same way (ChatManager.report). What happens in it - someone joining,
// leaving, promoted - is said in it from "Guild".
// Weekly goals (shared/Guilds.ts): what members' heroes do comes in as deeds
// (did, from SeasonManager), filling this week's goals (`guild_week`: a row
// a guild a week, with who gave what) and, met, giving the guild XP
// (`guild.xp`) and those who helped gold (paid at once if they're loaded,
// else as they next load: `guild_pay`). Saved every SAVE_MS; members signed
// in are sent how they're filling every SEND_MS while they change.

interface Member { id: number; name: string; rank: Rank; joined: number; seen: number; }
interface Invite { player: number; name: string; by: string; at: number; }
// a week's goals as kept: k the week, size the members it was set for, prog
// each goal's done (by place in weekGoals), done a bit each met, shares who
// gave what (player id: by place)
interface Week { k: number; size: number; prog: number[]; done: number; shares: Map<number, number[]>; }

class Guild {
    public members = new Map<number, Member>();
    public invites = new Map<number, Invite>();     // (the invited player's id)
    public lines: ChatLine[] = [];
    public xp = 0;
    public week: Week = null;
    public hall = new Map<number, number>();        // (item: how many)
    public hallLog: { p: number; line: HallLine }[] = [];
    public takes = { day: 0, by: new Map<number, number>() };
    constructor(public id: number, public name: string, public tag: string, public notice: string, public open: boolean, public created: number) { }

    public get level() { return guildLevel(this.xp); }

    public leader() {
        for (const m of this.members.values()) if (m.rank == Rank.LEADER) return m;
        return null;
    }
}

type Row = RowDataPacket & { [key: string]: any };

export class GuildManager {

    public static SAVE_MS = 10000;
    public static SEND_MS = 5000;

    private guilds = new Map<number, Guild>();
    private of = new Map<number, Guild>();                  // (player id: their guild)
    private lastActed = new Map<number, number>();          // (player id: when they last founded, invited, joined...)
    private working = new Set<number>();                    // (player ids with something under way)
    private lastSaid = new Map<number, { t: string; a: number }>();
    private hallTurns = new Map<number, Promise<unknown>>();    // (guild id: the last thing done in its hall, each waiting for the last)
    private weeksDirty = new Set<Guild>();          // (weeks to save)
    private weeksToSend = new Set<Guild>();         // (and to send to members signed in)

    public async init() {
        await this.query(`CREATE TABLE IF NOT EXISTS guild (
            id INT AUTO_INCREMENT PRIMARY KEY,
            name VARCHAR(32) NOT NULL,
            tag VARCHAR(8) NOT NULL,
            notice VARCHAR(255) NOT NULL DEFAULT '',
            is_open TINYINT NOT NULL DEFAULT 1,
            created_at DATETIME NOT NULL,
            UNIQUE (name), UNIQUE (tag))`);
        await this.query(`CREATE TABLE IF NOT EXISTS guild_member (
            player_id INT NOT NULL PRIMARY KEY,
            guild_id INT NOT NULL,
            grade TINYINT NOT NULL,
            joined_at DATETIME NOT NULL,
            INDEX (guild_id))`);
        await this.query(`CREATE TABLE IF NOT EXISTS guild_invite (
            guild_id INT NOT NULL,
            player_id INT NOT NULL,
            by_id INT NOT NULL,
            at DATETIME NOT NULL,
            PRIMARY KEY (guild_id, player_id),
            INDEX (player_id))`);
        await this.query("DELETE FROM guild_invite WHERE at < ?", [this.inviteCutoff()]);
        try {
            await this.query("ALTER TABLE guild ADD COLUMN xp INT NOT NULL DEFAULT 0");
        } catch (e) {
            if ((e as any).errno != 1060) throw e;     // (already there)
        }
        await this.query(`CREATE TABLE IF NOT EXISTS guild_hall (
            guild_id INT NOT NULL PRIMARY KEY,
            items MEDIUMTEXT NOT NULL,
            log MEDIUMTEXT NOT NULL,
            takes TEXT NOT NULL)`);
        await this.query(`CREATE TABLE IF NOT EXISTS guild_week (
            guild_id INT NOT NULL,
            week INT NOT NULL,
            size INT NOT NULL,
            prog VARCHAR(255) NOT NULL,
            done TINYINT NOT NULL DEFAULT 0,
            shares MEDIUMTEXT NOT NULL,
            PRIMARY KEY (guild_id, week))`);
        await this.query(`CREATE TABLE IF NOT EXISTS guild_pay (
            id INT AUTO_INCREMENT PRIMARY KEY,
            player_id INT NOT NULL,
            gold INT NOT NULL,
            why VARCHAR(255) NOT NULL,
            INDEX (player_id))`);

        for (const r of await this.query("SELECT id, name, tag, notice, is_open, created_at, xp FROM guild")) {
            const guild = new Guild(r.id, r.name, r.tag, r.notice, !!r.is_open, new Date(r.created_at).getTime());
            guild.xp = r.xp ?? 0;
            this.guilds.set(r.id, guild);
        }
        for (const r of await this.query("SELECT guild_id, week, size, prog, done, shares FROM guild_week WHERE week = ?", [weekOf(Date.now())])) {
            const guild = this.guilds.get(r.guild_id);
            if (!guild) continue;
            try {
                const shares = new Map<number, number[]>(Object.entries(JSON.parse(r.shares)).map(([id, v]) => [Number(id), v as number[]]));
                guild.week = { k: r.week, size: r.size, prog: JSON.parse(r.prog), done: r.done, shares };
            } catch { }
        }
        setInterval(() => this.saveWeeks().catch(Log.catch("Couldn't save the guilds' weeks")), GuildManager.SAVE_MS);
        setInterval(() => this.sendWeeks(), GuildManager.SEND_MS);
        for (const r of await this.query(
            "SELECT m.player_id, m.guild_id, m.grade, m.joined_at, p.display_name, p.active_at FROM guild_member m JOIN player p ON p.id = m.player_id")) {
            const guild = this.guilds.get(r.guild_id);
            if (!guild) continue;
            guild.members.set(r.player_id, {
                id: r.player_id, name: r.display_name, rank: r.grade, joined: new Date(r.joined_at).getTime(), seen: new Date(r.active_at).getTime(),
            });
            this.of.set(r.player_id, guild);
        }
        for (const r of await this.query(
            `SELECT i.guild_id, i.player_id, i.at, p.display_name, b.display_name by_name FROM guild_invite i
             JOIN player p ON p.id = i.player_id LEFT JOIN player b ON b.id = i.by_id`))
            this.guilds.get(r.guild_id)?.invites.set(r.player_id, { player: r.player_id, name: r.display_name, by: r.by_name ?? "", at: new Date(r.at).getTime() });

        for (const r of await this.query("SELECT guild_id, items, log, takes FROM guild_hall")) {
            const guild = this.guilds.get(r.guild_id);
            if (!guild) continue;
            guild.hall = new Map(JSON.parse(r.items));
            guild.hallLog = JSON.parse(r.log);
            const t = JSON.parse(r.takes);
            guild.takes = { day: t.day, by: new Map(t.by) };
        }

        // (none left with nobody in it, nor without a leader)
        for (const guild of Array.from(this.guilds.values())) {
            if (!guild.members.size) await this.close(guild);
            else if (!guild.leader()) await this.setRank(guild, this.successor(guild, -1), Rank.LEADER);
        }
        Log.info("Guilds: " + this.guilds.size);
    }

    private async query<T = Row[]>(sql: string, args: any[] = []): Promise<T> {
        const conn = await IBS.db.getConnection();
        try {
            const [result] = await conn.query(sql, args);
            return result as any;
        } finally {
            conn.release();
        }
    }

    private async transaction(work: (conn: PoolConnection) => Promise<void>) {
        const conn = await IBS.db.getConnection();
        try {
            await conn.beginTransaction();
            await work(conn);
            await conn.commit();
        } catch (e) {
            await conn.rollback().catch(() => { });
            throw e;
        } finally {
            conn.release();
        }
    }

    private inviteCutoff() {
        return new Date(Date.now() - INVITE_DAYS * 24 * 60 * 60 * 1000);
    }

    // one thing of a player's at a time (`gap`: and not too soon after the last)
    public act(player: Player, work: () => Promise<void>, gap = true) {
        if (this.working.has(player.id)) return Promise.resolve();
        const now = Date.now();
        if (gap && now - (this.lastActed.get(player.id) ?? 0) < ACTION_GAP_MS) {
            this.refuse(player, "Wait a moment before trying again");
            return Promise.resolve();
        }
        if (gap) this.lastActed.set(player.id, now);
        this.working.add(player.id);
        return work().finally(() => this.working.delete(player.id));
    }

    //#region what's sent

    // their guild's tag, if they're in one (by their name in the chat)
    public tagOf(playerId: number) {
        return this.of.get(playerId)?.tag;
    }

    // "[TAG] Name" of their guild, if they're in one (on their profile)
    public guildOf(playerId: number) {
        const guild = this.of.get(playerId);
        return guild ? this.named(guild) : undefined;
    }

    //#region the guild hall (shared/Guilds.ts)

    // one thing at a time in a guild's hall: its row saved whole, so never two at once
    private inHall(guild: Guild, work: () => Promise<void>) {
        const next = (this.hallTurns.get(guild.id) ?? Promise.resolve()).then(work, work);
        const kept = next.catch(() => { });
        this.hallTurns.set(guild.id, kept);
        kept.then(() => { if (this.hallTurns.get(guild.id) == kept) this.hallTurns.delete(guild.id); });
        return next;
    }

    private hallArgs(guild: Guild) {
        return [JSON.stringify(Array.from(guild.hall)), JSON.stringify(guild.hallLog), JSON.stringify({ day: guild.takes.day, by: Array.from(guild.takes.by) })];
    }

    private saveHall(guild: Guild, conn?: PoolConnection): Promise<unknown> {
        const sql = "INSERT INTO guild_hall (guild_id, items, log, takes) VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE items = VALUES(items), log = VALUES(log), takes = VALUES(takes)";
        const args = [guild.id, ...this.hallArgs(guild)];
        return conn ? conn.query(sql, args) : this.query(sql, args);
    }

    // how many they've taken today
    private takenToday(guild: Guild, playerId: number) {
        const day = hallDay(Date.now());
        if (guild.takes.day != day) guild.takes = { day, by: new Map() };
        return guild.takes.by.get(playerId) ?? 0;
    }

    private hallView(guild: Guild, playerId: number): HallView {
        return { i: Array.from(guild.hall), l: guild.hallLog.map((x) => x.line).slice(-HALL_LOG_MOST).reverse(), y: this.takenToday(guild, playerId) };
    }

    public sendHall(player: Player) {
        const guild = this.of.get(player.id);
        if (guild) player.send({ r: S2C.GUILD_HALL, h: this.hallView(guild, player.id) });
    }

    // a number of something, into (1) or out of (-1) the hall and out of or into their
    // stash, all saved together or not at all
    private async moveHall(player: Player, guild: Guild, item: number, n: number, sign: 1 | -1) {
        const inv = player.inventory, had = guild.hall.get(item) ?? 0, left = had + sign * n;
        const set = (k: number) => { if (k > 0) guild.hall.set(item, k); else guild.hall.delete(item); };
        const log = { p: player.id, line: [player.record.displayName, sign > 0 ? 1 : 0, item, n, Date.now()] as HallLine };
        const was = guild.hallLog, taken = this.takenToday(guild, player.id);
        inv.adjustItem(item, -sign * n);
        set(left);
        guild.hallLog = [...was, log].slice(-HALL_LOG_MOST);
        if (sign < 0) guild.takes.by.set(player.id, taken + n);
        try {
            await this.transaction(async (conn) => {
                await this.saveHall(guild, conn);
                const stash = inv.getJSON();
                await conn.query("UPDATE inventory SET gold = ?, items = ? WHERE player_id = ?", [stash.g, JSON.stringify(stash.i), player.id]);
            });
        } catch (e) {
            Log.error("Guilds: couldn't change a hall", e, { playerId: player.id, guild: guild.id });
            inv.adjustItem(item, sign * n);
            set(had);
            guild.hallLog = was;
            if (sign < 0) guild.takes.by.set(player.id, taken);
            IBS.heroes.tasks.sendStash(player);
            this.refuse(player, "Couldn't do that - try again");
            return false;
        }
        IBS.heroes.tasks.sendStash(player);
        for (const id of guild.members.keys()) {
            const p = IBS.players.getById(id);
            if (p?.online) this.sendHall(p);
        }
        return true;
    }

    public async put(player: Player, item: any, n: any) {
        if (!isItem(item) || !Number.isInteger(n) || n < 1) return;
        if (player.record.isGuest()) return this.refuse(player, "Save your account first (Settings) - guests can't use the hall");
        const guild = this.of.get(player.id);
        if (!guild) return;
        await this.inHall(guild, async () => {
            if (this.of.get(player.id) != guild) return;
            if ((player.inventory.items.get(item)?.amount ?? 0) < n) return this.refuse(player, "You don't have that many");
            const had = guild.hall.get(item) ?? 0;
            if (!had && guild.hall.size >= hallRoom(guild.level)) return this.refuse(player, "The hall's full: level up the guild for more room");
            if (had + n > HALL_AMOUNT_MOST) return this.refuse(player, "The hall can't hold that many");
            if (await this.moveHall(player, guild, item, n, 1)) this.done(player, `Put ${n} ${itemName(item)} in the hall`);
        });
    }

    public async take(player: Player, item: any, n: any) {
        if (!isItem(item) || !Number.isInteger(n) || n < 1) return;
        if (player.record.isGuest()) return this.refuse(player, "Save your account first (Settings) - guests can't use the hall");
        const guild = this.of.get(player.id);
        if (!guild) return;
        await this.inHall(guild, async () => {
            const me = guild.members.get(player.id);
            if (!me) return;
            if ((guild.hall.get(item) ?? 0) < n) return this.refuse(player, "There aren't that many left");
            if (n > takesLeft(me.rank, this.takenToday(guild, player.id))) return this.refuse(player, `A member can take ${TAKES_A_DAY} things a day`);
            if (await this.moveHall(player, guild, item, n, -1)) this.done(player, `Took ${n} ${itemName(item)} from the hall`);
        });
    }

    //#endregion

    // their guild's perk for crafting (shared/Guilds.ts guildCraftMul)
    public craftMul(playerId: number) {
        const guild = this.of.get(playerId);
        return guild ? guildCraftMul(guild.level) : 1;
    }

    // whether two players are in the same guild (mail goes to guildmates)
    public together(a: number, b: number) {
        const guild = this.of.get(a);
        return !!guild && guild == this.of.get(b);
    }

    private presenceOf(id: number) {
        const loaded = IBS.players.getById(id);
        return !loaded ? Presence.OFFLINE : loaded.online ? Presence.ONLINE : Presence.AWAY;
    }

    private memberView(m: Member): GuildMember {
        const p = this.presenceOf(m.id);
        return { i: m.id, n: m.name, k: m.rank, p, s: p == Presence.ONLINE ? Date.now() : m.seen, j: m.joined };
    }

    private view(guild: Guild, viewer: number): GuildView {
        const view: GuildView = {
            i: guild.id, n: guild.name, t: guild.tag, m: guild.notice, o: guild.open ? 1 : 0, c: guild.created,
            l: Array.from(guild.members.values(), (m) => this.memberView(m)),
            x: guild.xp, w: this.weekView(guild, viewer),
        };
        if (canInvite(guild.members.get(viewer)?.rank ?? Rank.MEMBER))
            view.v = Array.from(guild.invites.values(), (i): Someone => ({ i: i.player, n: i.name, a: i.at }));
        return view;
    }

    // the invites to them still standing, the newest first
    private invitesTo(playerId: number): GuildInvite[] {
        const cutoff = this.inviteCutoff().getTime(), out: GuildInvite[] = [];
        for (const guild of this.guilds.values()) {
            const invite = guild.invites.get(playerId);
            if (invite && invite.at > cutoff) out.push({ g: guild.id, n: guild.name, t: guild.tag, c: guild.members.size, b: invite.by, a: invite.at });
        }
        return out.sort((a, b) => b.a - a.a);
    }

    public state(player: Player): GuildState {
        const guild = this.of.get(player.id);
        return { g: guild ? this.view(guild, player.id) : null, i: guild ? [] : this.invitesTo(player.id) };
    }

    // their state again, if they're signed in
    private sendTo(playerId: number) {
        const player = IBS.players.getById(playerId);
        if (player?.online) player.send({ r: S2C.GUILD, s: this.state(player) });
    }

    // the guild again, to each of its members signed in
    private sendGuild(guild: Guild) {
        for (const id of guild.members.keys()) this.sendTo(id);
    }

    private refuse(player: Player, why: string) {
        player.send({ r: S2C.GUILD_REFUSED, w: why });
    }

    private done(player: Player, what: string) {
        player.send({ r: S2C.GUILD_DONE, w: what });
    }

    // a line in the guild's chat from "Guild", about what happened in it
    private tell(guild: Guild, text: string) {
        this.keep(guild, { c: GUILD_CHANNEL, n: "Guild", t: text.slice(0, CHAT_LONGEST * 2), a: Date.now(), e: 1 });
    }

    private named(guild: Guild) {
        return `[${guild.tag}] ${guild.name}`;
    }

    //#endregion

    //#region founding, finding and joining

    public async found(player: Player, name: any, tag: any) {
        if (this.of.has(player.id)) return this.refuse(player, "You're in a guild already: leave it first");
        name = cleanGuildName(name);
        tag = cleanTag(tag);
        const problem = guildNameProblem(name) || tagProblem(tag);
        if (problem) return this.refuse(player, problem);
        const inv = player.inventory;
        if (inv.gold < GUILD_COST) return this.refuse(player, `Founding a guild costs ${GUILD_COST}g`);
        const taken = this.taken(name, tag);
        if (taken) return this.refuse(player, taken);

        inv.adjustGold(-GUILD_COST);
        const now = Date.now();
        let id = 0;
        try {
            await this.transaction(async (conn) => {
                const [result] = await conn.query<any>("INSERT INTO guild (name, tag, notice, is_open, created_at) VALUES (?, ?, '', 1, ?)", [name, tag, new Date(now)]);
                id = result.insertId;
                await conn.query("INSERT INTO guild_member (player_id, guild_id, grade, joined_at) VALUES (?, ?, ?, ?)", [player.id, id, Rank.LEADER, new Date(now)]);
                const stash = inv.getJSON();
                await conn.query("UPDATE inventory SET gold = ?, items = ? WHERE player_id = ?", [stash.g, JSON.stringify(stash.i), player.id]);
            });
        } catch (e) {
            inv.adjustGold(GUILD_COST);
            if ((e as any).errno == 1062) return this.refuse(player, "That name or tag is taken");     // (one the same but for case, say)
            throw e;
        }

        const guild = new Guild(id, name, tag, "", true, now);
        this.guilds.set(id, guild);
        this.addToGuild(guild, player, Rank.LEADER, now);
        await this.dropInvites(player.id);
        Log.info(`Guild: ${player.record.displayName} founded ${this.named(guild)}`);
        IBS.heroes.tasks.sendStash(player);
        this.sendTo(player.id);
        this.done(player, `You founded ${this.named(guild)}`);
        this.tell(guild, `${player.record.displayName} founded the guild`);
    }

    // why a name or tag can't be had ("": it can)
    private taken(name: string, tag: string) {
        for (const g of this.guilds.values()) {
            if (g.name.toLowerCase() == name.toLowerCase()) return `There's a guild called ${g.name} already`;
            if (g.tag == tag) return `${tag} is ${g.name}'s tag`;
        }
        return "";
    }

    public browse(player: Player, q: any) {
        const search = typeof q == "string" ? q.trim().toLowerCase().slice(0, GUILD_NAME_LONGEST) : "";
        const rows: GuildRow[] = [];
        for (const g of this.guilds.values()) {
            if (search && !g.name.toLowerCase().includes(search) && !g.tag.toLowerCase().includes(search)) continue;
            rows.push({ i: g.id, n: g.name, t: g.tag, c: g.members.size, o: g.open ? 1 : 0, l: g.leader()?.name ?? "", m: membersMost(g.level) });
        }
        rows.sort((a, b) => b.o - a.o || b.c - a.c || a.n.localeCompare(b.n));
        player.send({ r: S2C.GUILD_LIST, l: rows.slice(0, BROWSE_SHOWN) });
    }

    public async join(player: Player, guildId: any) {
        const guild = this.guilds.get(guildId);
        if (!guild) return this.refuse(player, "That guild's gone");
        if (!guild.open) return this.refuse(player, `${guild.name} takes members by invite only`);
        await this.enter(player, guild);
    }

    public async answer(player: Player, guildId: any, yes: any) {
        const guild = this.guilds.get(guildId), invite = guild?.invites.get(player.id);
        if (!invite || invite.at < this.inviteCutoff().getTime()) return this.sendTo(player.id);
        if (!yes) {
            guild.invites.delete(player.id);
            await this.query("DELETE FROM guild_invite WHERE guild_id = ? AND player_id = ?", [guild.id, player.id]);
            this.sendTo(player.id);
            return this.sendGuild(guild);
        }
        await this.enter(player, guild);
    }

    // into a guild as a member, if there's room
    private async enter(player: Player, guild: Guild) {
        if (this.of.has(player.id)) return this.refuse(player, "You're in a guild already: leave it first");
        if (guild.members.size >= membersMost(guild.level)) return this.refuse(player, `${guild.name} is full (${membersMost(guild.level)} members)`);
        const now = Date.now();
        this.addToGuild(guild, player, Rank.MEMBER, now);
        await this.query("INSERT INTO guild_member (player_id, guild_id, grade, joined_at) VALUES (?, ?, ?, ?)", [player.id, guild.id, Rank.MEMBER, new Date(now)]);
        await this.dropInvites(player.id);
        this.sendGuild(guild);
        this.done(player, `You joined ${this.named(guild)}`);
        this.tell(guild, `${player.record.displayName} joined the guild`);
    }

    private addToGuild(guild: Guild, player: Player, rank: Rank, at: number) {
        guild.members.set(player.id, { id: player.id, name: player.record.displayName, rank, joined: at, seen: at });
        this.of.set(player.id, guild);
    }

    // in a guild now: every invite to them gone (those guilds' officers told)
    private async dropInvites(playerId: number) {
        const from: Guild[] = [];
        for (const g of this.guilds.values()) if (g.invites.delete(playerId)) from.push(g);
        if (!from.length) return;
        await this.query("DELETE FROM guild_invite WHERE player_id = ?", [playerId]);
        for (const g of from) this.sendGuild(g);
    }

    //#endregion

    //#region inviting

    public async invite(player: Player, name: any) {
        const guild = this.of.get(player.id), me = guild?.members.get(player.id);
        if (!me) return this.refuse(player, "You're not in a guild");
        if (!canInvite(me.rank)) return this.refuse(player, "Only officers and the leader invite players");
        if (typeof name != "string" || !(name = name.trim()) || name.length > 64) return;
        if (guild.members.size >= membersMost(guild.level)) return this.refuse(player, `The guild is full (${membersMost(guild.level)} members)`);
        if (guild.invites.size >= INVITES_MOST) return this.refuse(player, `The guild has ${INVITES_MOST} invites out: take one back first`);

        const found = await this.query("SELECT id, display_name FROM player WHERE display_name = ? LIMIT 2", [name]);
        if (!found.length) return this.refuse(player, `No one's called ${name}`);
        if (found.length > 1) return this.refuse(player, `More than one player's called ${name}`);
        const them: number = found[0].id, theirName: string = found[0].display_name;
        if (them == player.id) return this.refuse(player, "That's you");
        const theirs = this.of.get(them);
        if (theirs == guild) return this.refuse(player, `${theirName} is in the guild already`);
        if (theirs) return this.refuse(player, `${theirName} is in a guild already`);
        if (guild.invites.has(them)) return this.refuse(player, `${theirName} has been invited already`);

        // (one who's blocked you is invited all the same, as far as you can tell; they never see it)
        const blocked = (await this.query("SELECT 1 FROM player_block WHERE player_id = ? AND blocked_id = ?", [them, player.id])).length > 0;
        if (!this.guilds.has(guild.id) || this.of.get(player.id) != guild) return;      // (gone, or left, meanwhile)
        if (!blocked) {
            const now = Date.now();
            guild.invites.set(them, { player: them, name: theirName, by: player.record.displayName, at: now });
            await this.query("REPLACE INTO guild_invite (guild_id, player_id, by_id, at) VALUES (?, ?, ?, ?)", [guild.id, them, player.id, new Date(now)]);
            const invited = IBS.players.getById(them);
            if (invited?.online) {
                this.sendTo(them);
                IBS.chat.note(invited, `${player.record.displayName} invited you to join ${this.named(guild)} (Guild, in the menu)`);
            }
        }
        this.done(player, `Invited ${theirName}`);
        this.sendGuild(guild);
    }

    public async uninvite(player: Player, id: any) {
        const guild = this.of.get(player.id), me = guild?.members.get(player.id);
        if (!me || !canInvite(me.rank) || !guild.invites.delete(id)) return;
        await this.query("DELETE FROM guild_invite WHERE guild_id = ? AND player_id = ?", [guild.id, id]);
        this.sendGuild(guild);
        this.sendTo(id);
    }

    //#endregion

    //#region leaving, kicking, ranks

    public async leave(player: Player) {
        const guild = this.of.get(player.id), me = guild?.members.get(player.id);
        if (!me) return;
        if (guild.members.size == 1 && guild.hall.size) return this.refuse(player, "You're the last: take what's in the hall first");
        await this.removeMember(guild, me);
        this.sendTo(player.id);
        this.done(player, `You left ${this.named(guild)}`);
        if (!this.guilds.has(guild.id)) return;
        this.tell(guild, `${me.name} left the guild`);
    }

    public async kick(player: Player, id: any) {
        const guild = this.of.get(player.id), me = guild?.members.get(player.id), them = guild?.members.get(id);
        if (!me || !them || them == me) return;
        if (!canKick(me.rank, them.rank)) return this.refuse(player, "You can't remove them");
        await this.removeMember(guild, them);
        this.sendTo(them.id);
        const kicked = IBS.players.getById(them.id);
        if (kicked?.online) IBS.chat.note(kicked, `You were removed from ${this.named(guild)}`, true);
        this.tell(guild, `${them.name} was removed from the guild by ${me.name}`);
    }

    // out of it: the leader going hands it on; the last one out closes it
    private async removeMember(guild: Guild, m: Member) {
        guild.members.delete(m.id);
        this.of.delete(m.id);
        await this.query("DELETE FROM guild_member WHERE player_id = ?", [m.id]);
        if (!guild.members.size) return this.close(guild);
        if (m.rank == Rank.LEADER) {
            const next = this.successor(guild, -1);
            await this.setRank(guild, next, Rank.LEADER);
            this.tell(guild, `${next.name} leads the guild now`);
        }
        this.sendGuild(guild);
    }

    // who leads after the leader: the longest-serving officer, else member (not `but`)
    private successor(guild: Guild, but: number) {
        const left = Array.from(guild.members.values()).filter((m) => m.id != but);
        left.sort((a, b) => b.rank - a.rank || a.joined - b.joined);
        return left[0];
    }

    private async setRank(guild: Guild, m: Member, rank: Rank) {
        m.rank = rank;
        await this.query("UPDATE guild_member SET grade = ? WHERE player_id = ?", [rank, m.id]);
    }

    // the leader's: a member made an officer, or an officer a member again
    public async rank(player: Player, id: any, k: any) {
        const guild = this.of.get(player.id), me = guild?.members.get(player.id), them = guild?.members.get(id);
        if (!me || !them || them == me || !isLeader(me.rank)) return;
        if (k != Rank.MEMBER && k != Rank.OFFICER || them.rank == k) return;
        await this.setRank(guild, them, k);
        this.sendGuild(guild);
        this.tell(guild, k == Rank.OFFICER ? `${them.name} is an officer now` : `${them.name} is a member again`);
    }

    // the leader's: the lead to someone else, the leader an officer after
    public async lead(player: Player, id: any) {
        const guild = this.of.get(player.id), me = guild?.members.get(player.id), them = guild?.members.get(id);
        if (!me || !them || them == me || !isLeader(me.rank)) return;
        await this.setRank(guild, them, Rank.LEADER);
        await this.setRank(guild, me, Rank.OFFICER);
        this.sendGuild(guild);
        this.tell(guild, `${me.name} handed the lead to ${them.name}`);
    }

    public async disband(player: Player) {
        const guild = this.of.get(player.id), me = guild?.members.get(player.id);
        if (!me || !isLeader(me.rank)) return;
        if (guild.hall.size) return this.refuse(player, "Empty the guild hall first");
        const members = Array.from(guild.members.keys()), invited = Array.from(guild.invites.keys());
        Log.info(`Guild: ${player.record.displayName} closed ${this.named(guild)}`);
        await this.close(guild);
        for (const id of members) {
            this.sendTo(id);
            const them = IBS.players.getById(id);
            if (them?.online && id != player.id) IBS.chat.note(them, `${me.name} closed ${this.named(guild)}`, true);
        }
        for (const id of invited) this.sendTo(id);
        this.done(player, `You closed ${this.named(guild)}`);
    }

    // gone, all of it
    private async close(guild: Guild) {
        this.guilds.delete(guild.id);
        this.weeksDirty.delete(guild);
        this.weeksToSend.delete(guild);
        for (const id of guild.members.keys()) this.of.delete(id);
        guild.members.clear();
        await this.transaction(async (conn) => {
            await conn.query("DELETE FROM guild_member WHERE guild_id = ?", [guild.id]);
            await conn.query("DELETE FROM guild_invite WHERE guild_id = ?", [guild.id]);
            await conn.query("DELETE FROM guild WHERE id = ?", [guild.id]);
            await conn.query("DELETE FROM guild_week WHERE guild_id = ?", [guild.id]);
            await conn.query("DELETE FROM guild_hall WHERE guild_id = ?", [guild.id]);
        });
    }

    //#endregion

    //#region the notice, open or not

    public async notice(player: Player, text: any) {
        const guild = this.of.get(player.id), me = guild?.members.get(player.id);
        if (!me || !canEditNotice(me.rank)) return;
        const m = cleanNotice(text);
        if (m == guild.notice) return;
        const why = chatRefusal(m);
        if (why) return this.refuse(player, why);
        guild.notice = m;
        await this.query("UPDATE guild SET notice = ? WHERE id = ?", [m, guild.id]);
        this.sendGuild(guild);
        this.tell(guild, m ? `${me.name} changed the notice` : `${me.name} took the notice down`);
    }

    public async setOpen(player: Player, open: any) {
        const guild = this.of.get(player.id), me = guild?.members.get(player.id);
        if (!me || !isLeader(me.rank) || guild.open == !!open) return;
        guild.open = !!open;
        await this.query("UPDATE guild SET is_open = ? WHERE id = ?", [guild.open ? 1 : 0, guild.id]);
        this.sendGuild(guild);
        this.tell(guild, guild.open ? "The guild is open to all now" : "The guild takes members by invite only now");
    }

    //#endregion

    //#region its chat

    public say(player: Player, text: any) {
        const guild = this.of.get(player.id);
        const t = cleanChat(text);
        if (!t) return;
        if (t.startsWith("/")) return IBS.chat.say(player, 0, t);       // (a moderator's command)
        if (!guild) return IBS.chat.note(player, "You're not in a guild", true);
        const now = Date.now(), last = this.lastSaid.get(player.id);
        if (now - (last?.a ?? 0) < CHAT_GAP_MS) return;
        const why = IBS.chat.refusal(player, t, true) || (last && last.t == t && now - last.a < SAME_LINE_MS ? "You just said that" : "");
        if (why) return IBS.chat.note(player, why, true);
        this.lastSaid.set(player.id, { t, a: now });

        const line: ChatLine = { c: GUILD_CHANNEL, n: player.record.displayName, t, a: now, i: player.id, k: IBS.chat.nextNumber(), g: guild.tag };
        const mark = player.record.chatMark();
        if (mark) line.p = mark;
        this.keep(guild, line);
    }

    private keep(guild: Guild, line: ChatLine) {
        guild.lines.push(line);
        if (guild.lines.length > GUILD_KEPT) guild.lines.shift();
        for (const id of guild.members.keys()) {
            const p = IBS.players.getById(id);
            if (p?.online && (!line.i || !p.social?.blocks.has(line.i))) p.send({ r: S2C.GUILD_SAID, l: line });
        }
    }

    // the lines of their guild's chat kept (signing in; a report of one)
    public linesOf(playerId: number) {
        return this.of.get(playerId)?.lines ?? [];
    }

    //#endregion

    //#region signing in and out, names

    // signing in, out, and their heroes stopping: to the others signed in
    public presence(player: Player) {
        const guild = this.of.get(player.id), m = guild?.members.get(player.id);
        if (!m) return;
        if (!player.online) m.seen = Date.now();
        const message = { r: S2C.GUILD_MEMBER, m: this.memberView(m) };
        for (const id of guild.members.keys()) {
            if (id == player.id) continue;
            const other = IBS.players.getById(id);
            if (other?.online) other.send(message);
        }
    }

    // An account being deleted (AccountManager): out of their guild as if
    // they'd left (the lead handed on, the last one out closing it), their
    // invites gone, and their lines out of every guild's chat. Their rows go
    // with the rest of the account.
    public async forget(player: Player) {
        const guild = this.of.get(player.id), me = guild?.members.get(player.id);
        if (me) {
            await this.removeMember(guild, me);
            if (this.guilds.has(guild.id)) this.tell(guild, `${me.name} left the guild`);
        }
        for (const g of this.guilds.values()) {
            g.lines = g.lines.filter((l) => l.i != player.id);
            if (g.hallLog.some((l) => l.p == player.id)) {
                g.hallLog = g.hallLog.filter((l) => l.p != player.id);
                await this.saveHall(g);
            }
            if (g.invites.delete(player.id)) this.sendGuild(g);
        }
        for (const map of [this.lastActed, this.lastSaid]) map.delete(player.id);
    }

    // a player's new name, in their guild's list and the invites they've had or sent
    public renamed(player: Player) {
        const name = player.record.displayName, guild = this.of.get(player.id), m = guild?.members.get(player.id);
        if (m) m.name = name;
        if (guild) for (const l of guild.hallLog) if (l.p == player.id) l.line[0] = name;
        for (const g of this.guilds.values()) {
            const invite = g.invites.get(player.id);
            if (invite) invite.name = name;
            if (invite || g == guild) this.sendGuild(g);
        }
    }

    //#endregion

    //#region weekly goals and levels (shared/Guilds.ts)

    // this week's goals, made as its first deed comes in (or it's looked at)
    private weekOf(guild: Guild) {
        const k = weekOf(Date.now());
        if (guild.week?.k != k) guild.week = { k, size: guild.members.size, prog: weekGoals(k).map(() => 0), done: 0, shares: new Map() };
        return guild.week;
    }

    private weekView(guild: Guild, viewer: number): WeekView {
        const w = this.weekOf(guild), mine = w.shares.get(viewer) ?? [];
        return {
            k: w.k, e: weekStart(w.k + 1), d: w.done,
            g: weekGoals(w.k).map((deed, i) => [deed, goalTarget(deed, w.size), Math.floor(w.prog[i]), Math.floor(mine[i] ?? 0)]),
        };
    }

    // something a member's hero did (SeasonManager.did): towards this week's goal of that kind, if there is one
    public did(player: Player, deed: Deed, n: number) {
        const guild = this.of.get(player.id);
        if (!guild) return;
        const w = this.weekOf(guild), i = weekGoals(w.k).indexOf(deed);
        if (i < 0 || w.done & (1 << i)) return;
        const target = goalTarget(deed, w.size), add = Math.min(n, target - w.prog[i]);
        w.prog[i] += add;
        const mine = w.shares.get(player.id) ?? weekGoals(w.k).map(() => 0);
        mine[i] += add;
        w.shares.set(player.id, mine);
        this.weeksDirty.add(guild);
        this.weeksToSend.add(guild);
        if (w.prog[i] >= target) this.met(guild, w, i).catch(Log.catch("Couldn't finish a guild goal", { guild: guild.id }));
    }

    // a goal met: the guild's XP (all of them: more), those who helped paid, said in its chat
    private async met(guild: Guild, w: Week, i: number) {
        w.done |= 1 << i;
        const all = weekGoals(w.k).every((_, k) => w.done & (1 << k));
        const was = guild.level, gain = GOAL_XP + (all ? ALL_GOALS_XP : 0);
        guild.xp += gain;
        this.weeksDirty.add(guild);
        const deed = weekGoals(w.k)[i], what = goalText(deed, goalTarget(deed, w.size));
        const helped = Array.from(w.shares).filter(([, v]) => v[i] > 0).map(([id]) => id);
        await this.query("UPDATE guild SET xp = ? WHERE id = ?", [guild.xp, guild.id]);
        for (const id of helped) await this.pay(id, GOAL_GOLD, `for helping ${guild.name}: ${what.toLowerCase()}`);
        this.tell(guild, `Goal met: ${what}! +${gain} guild XP${all ? " (every goal this week)" : ""}, ${GOAL_GOLD}g to each of the ${helped.length} who helped`);
        if (guild.level > was) {
            const perk = levelPerk(guild.level);
            this.tell(guild, `The guild is level ${guild.level}!${perk ? ` Now: ${perk}` : ""}`);
        }
        this.sendGuild(guild);
    }

    // gold to a member: into their stash if they're loaded, else owed (payOwed)
    private async pay(playerId: number, gold: number, why: string) {
        const p = IBS.players.getById(playerId);
        if (p) {
            p.inventory.adjustGold(gold);
            p.stashChanged = true;
            if (p.online) IBS.chat.note(p, `+${gold}g ${why}`);
        } else await this.query("INSERT INTO guild_pay (player_id, gold, why) VALUES (?, ?, ?)", [playerId, gold, why.slice(0, 255)]);
    }

    // loading (PlayerManager.load): what they're owed from goals met while
    // they weren't loaded, into their stash, and told as they sign in
    public async payOwed(player: Player) {
        let owed: Row[] = [];
        // (taken off and saved in their stash together: a crash between can't lose it or pay it twice)
        await this.transaction(async (conn) => {
            [owed] = await conn.query<Row[]>("SELECT id, gold, why FROM guild_pay WHERE player_id = ? FOR UPDATE", [player.id]);
            if (!owed.length) return;
            await conn.query("DELETE FROM guild_pay WHERE id IN (?)", [owed.map((r) => r.id)]);
            for (const r of owed) player.inventory.adjustGold(r.gold);
            const stash = player.inventory.getJSON();
            await conn.query("UPDATE inventory SET gold = ?, items = ? WHERE player_id = ?", [stash.g, JSON.stringify(stash.i), player.id]);
        });
        for (const r of owed) player.guildNotes.push(`+${r.gold}g ${r.why}`);
    }

    private async saveWeeks() {
        if (!this.weeksDirty.size) return;
        const rows = Array.from(this.weeksDirty, (g) => [g.id, g.week.k, g.week.size, JSON.stringify(g.week.prog), g.week.done, JSON.stringify(Object.fromEntries(g.week.shares))]);
        this.weeksDirty.clear();
        await this.query(
            "INSERT INTO guild_week (guild_id, week, size, prog, done, shares) VALUES ? ON DUPLICATE KEY UPDATE size = VALUES(size), prog = VALUES(prog), done = VALUES(done), shares = VALUES(shares)",
            [rows]);
    }

    // (the server stopping: Engine.shutdown)
    public save() {
        return this.saveWeeks();
    }

    private sendWeeks() {
        for (const guild of this.weeksToSend) {
            for (const id of guild.members.keys()) {
                const p = IBS.players.getById(id);
                if (p?.online) p.send({ r: S2C.GUILD_WEEK, w: this.weekView(guild, id), x: guild.xp });
            }
        }
        this.weeksToSend.clear();
    }

    // its perks for a member's heroes: x their XP, x their gold from work
    public xpMul(playerId: number) {
        const guild = this.of.get(playerId);
        return guild ? guildXpMul(guild.level) : 1;
    }
    public goldMul(playerId: number) {
        const guild = this.of.get(playerId);
        return guild ? guildGoldMul(guild.level) : 1;
    }

    // "[TAG] Name" (null: none)
    public nameOf(guildId: number) {
        const g = this.guilds.get(guildId);
        return g ? this.named(g) : null;
    }

    //#endregion

}
