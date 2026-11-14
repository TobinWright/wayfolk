import { ResultSetHeader, RowDataPacket } from "mysql2";
import { IBS } from "../../app";
import { S2C } from "../../constants/Routes";
import { CHAT_GAP_MS, cleanChat } from "../../../../shared/Chat";
import {
    ASK_DAYS, ASK_GAP_MS, ASKS_MOST, BLOCKS_MOST, favouritesMost, FriendInfo, FriendList, FRIENDS_MOST, Presence, Someone, Whisper, WHISPER_KEPT,
} from "../../../../shared/Friends";
import { itemName, TaskKind } from "../../../../shared/Tasks";
import { Hero } from "../hero/HeroManager";
import { Player } from "../player/Player";

// Friends (shared/Friends.ts). `friend` holds a row a pair (the lower id
// first, a favourite flag for each side), `friend_ask` the asks waiting,
// `player_block` who's blocked whom, `whisper` the last WHISPER_KEPT between
// each pair. A loaded player keeps their Social (who their friends are, which
// are favourites, who they've blocked), changed here as it changes. Whatever
// changes, the whole list goes again to those it's about who are signed in.
// A favourite's heroes are sent to those watching (signed in with them as a
// favourite) only when one sets off, gets there, starts something else,
// meets a moment on the road or has to rest (heroSeen), and who fought
// (fought); with nobody watching nothing goes.

export class Social {
    public friends = new Map<number, boolean>();     // (friend's player id: a favourite of theirs)
    public blocks = new Set<number>();
}

type Row = RowDataPacket & { [key: string]: any };

export class FriendManager {

    public static FIGHT_LATE_MS = 10000;    // a fight further back than this isn't told

    private lastAsked = new Map<number, number>();          // (player id: when they last asked someone)
    private lastWhispered = new Map<number, number>();
    private seen = new Map<number, string>();               // (hero id: what watchers were last sent of them)

    public async init() {
        await this.query(`CREATE TABLE IF NOT EXISTS friend (
            a_id INT NOT NULL,
            b_id INT NOT NULL,
            since DATETIME NOT NULL,
            a_fav TINYINT NOT NULL DEFAULT 0,
            b_fav TINYINT NOT NULL DEFAULT 0,
            PRIMARY KEY (a_id, b_id),
            INDEX (b_id))`);
        await this.query(`CREATE TABLE IF NOT EXISTS friend_ask (
            from_id INT NOT NULL,
            to_id INT NOT NULL,
            at DATETIME NOT NULL,
            PRIMARY KEY (from_id, to_id),
            INDEX (to_id))`);
        await this.query(`CREATE TABLE IF NOT EXISTS player_block (
            player_id INT NOT NULL,
            blocked_id INT NOT NULL,
            at DATETIME NOT NULL,
            PRIMARY KEY (player_id, blocked_id))`);
        await this.query(`CREATE TABLE IF NOT EXISTS whisper (
            id INT AUTO_INCREMENT PRIMARY KEY,
            from_id INT NOT NULL,
            to_id INT NOT NULL,
            at DATETIME NOT NULL,
            text VARCHAR(255) NOT NULL,
            seen TINYINT NOT NULL DEFAULT 0,
            INDEX (from_id, to_id),
            INDEX (to_id, seen))`);
        await this.query("DELETE FROM friend_ask WHERE at < ?", [this.askCutoff()]);
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

    private askCutoff() {
        return new Date(Date.now() - ASK_DAYS * 24 * 60 * 60 * 1000);
    }

    // a pair as `friend` keeps it: the lower id first
    private pair(a: number, b: number) {
        return a < b ? [a, b] : [b, a];
    }

    //#region who's who

    // as a player's loaded
    public async load(playerId: number) {
        const social = new Social();
        for (const r of await this.query("SELECT a_id, b_id, a_fav, b_fav FROM friend WHERE a_id = ? OR b_id = ?", [playerId, playerId]))
            social.friends.set(r.a_id == playerId ? r.b_id : r.a_id, !!(r.a_id == playerId ? r.a_fav : r.b_fav));
        for (const r of await this.query("SELECT blocked_id FROM player_block WHERE player_id = ?", [playerId]))
            social.blocks.add(r.blocked_id);
        return social;
    }

    // a player's Social if they're loaded (whatever changes is kept in it too)
    private socialOf(playerId: number) {
        return IBS.players.getById(playerId)?.social;
    }

    // whether two players are friends (loaded or not: a party ask checks it, FormedParties)
    public areFriends(a: number, b: number) {
        return this.isFriend(a, b);
    }

    private async isFriend(a: number, b: number) {
        const known = this.socialOf(a);
        if (known) return known.friends.has(b);
        const [x, y] = this.pair(a, b);
        return (await this.query("SELECT 1 FROM friend WHERE a_id = ? AND b_id = ?", [x, y])).length > 0;
    }

    private async friendCount(playerId: number) {
        const known = this.socialOf(playerId);
        if (known) return known.friends.size;
        return (await this.query("SELECT COUNT(*) n FROM friend WHERE a_id = ? OR b_id = ?", [playerId, playerId]))[0].n;
    }

    // `who` has blocked `whom` (loaded or not: mail checks it too)
    public async hasBlocked(who: number, whom: number) {
        const known = this.socialOf(who);
        if (known) return known.blocks.has(whom);
        return (await this.query("SELECT 1 FROM player_block WHERE player_id = ? AND blocked_id = ?", [who, whom])).length > 0;
    }

    private async nameOf(playerId: number): Promise<string> {
        const known = IBS.players.getById(playerId);
        if (known) return known.record.displayName;
        return (await this.query("SELECT display_name FROM player WHERE id = ?", [playerId]))[0]?.display_name ?? "";
    }

    //#endregion

    //#region the list

    // what one of their heroes is doing, in a few words
    private doing(hero: Hero) {
        const s = hero.s, w = s.w, name = hero.d.n.split(" ")[0], at = IBS.heroes.tasks.nameOf;
        if (s.r.length) return `${name}: on the way to ${at(s.r[s.r.length - 1])}`;
        switch (w?.k) {
            case TaskKind.GATHER: return `${name}: gathering ${itemName(w.m)} at ${at(s.p)}`;
            case TaskKind.CRAFT: return `${name}: crafting ${itemName(w.m)} at ${at(s.p)}`;
            case TaskKind.WORK: return `${name}: working at ${at(s.p)}`;
            case TaskKind.EXPLORE: return `${name}: exploring ${at(s.p)}`;
            case TaskKind.ADVENTURE: return `${name}: adventuring near ${at(s.p)}`;
        }
        return `${name}: resting at ${at(s.p)}`;
    }

    // a friend as `viewer` sees them (lastSeen: their active_at, if they're not loaded)
    private info(viewer: number, friendId: number, name: string, lastSeen: number): FriendInfo {
        const loaded = IBS.players.getById(friendId);
        const p = !loaded ? Presence.OFFLINE : loaded.online ? Presence.ONLINE : Presence.AWAY;
        const info: FriendInfo = { i: friendId, n: name, p, s: loaded?.online ? Date.now() : lastSeen };
        if (p == Presence.AWAY) info.u = loaded.awayUntil;
        if (this.socialOf(viewer)?.friends.get(friendId)) info.f = 1;
        if (loaded) info.a = loaded.heroes.map((h) => this.doing(h));
        return info;
    }

    public async list(player: Player): Promise<FriendList> {
        const social = player.social, cutoff = this.askCutoff();
        const ids = Array.from(social.friends.keys());
        const friends = ids.length ? await this.query("SELECT id, display_name, active_at FROM player WHERE id IN (?)", [ids]) : [];
        const someone = (r: Row): Someone => ({ i: r.id, n: r.display_name, a: new Date(r.at).getTime() });
        const asksIn = await this.query(
            "SELECT p.id, p.display_name, a.at FROM friend_ask a JOIN player p ON p.id = a.from_id WHERE a.to_id = ? AND a.at > ? ORDER BY a.at",
            [player.id, cutoff]);
        const asksOut = await this.query(
            "SELECT p.id, p.display_name, a.at FROM friend_ask a JOIN player p ON p.id = a.to_id WHERE a.from_id = ? AND a.at > ? ORDER BY a.at",
            [player.id, cutoff]);
        const blocked = await this.query(
            "SELECT p.id, p.display_name, b.at FROM player_block b JOIN player p ON p.id = b.blocked_id WHERE b.player_id = ? ORDER BY p.display_name",
            [player.id]);
        return {
            f: friends.map((r) => this.info(player.id, r.id, r.display_name, new Date(r.active_at).getTime())),
            i: asksIn.filter((r) => !social.blocks.has(r.id)).map(someone),
            o: asksOut.map(someone),
            b: blocked.map(someone),
        };
    }

    // An account being deleted (AccountManager): out of the friends and
    // blocks of everyone loaded (those watching its heroes told they're gone).
    // Its rows go with the rest of the account; then `tell` sends everyone it
    // touched their list again.
    public async forget(player: Player) {
        const id = player.id, touched = new Set<number>();
        for (const r of await this.query("SELECT a_id, b_id FROM friend WHERE a_id = ? OR b_id = ?", [id, id])) touched.add(r.a_id == id ? r.b_id : r.a_id);
        for (const r of await this.query("SELECT from_id, to_id FROM friend_ask WHERE from_id = ? OR to_id = ?", [id, id])) touched.add(r.from_id == id ? r.to_id : r.from_id);
        for (const r of await this.query("SELECT player_id FROM player_block WHERE blocked_id = ?", [id])) touched.add(r.player_id);
        for (const other of touched) {
            const social = this.socialOf(other);
            if (social?.friends.get(id)) IBS.players.getById(other).send({ r: S2C.FRIEND_GONE, o: id });
            social?.friends.delete(id);
            social?.blocks.delete(id);
        }
        for (const map of [this.lastAsked, this.lastWhispered]) map.delete(id);
        for (const hero of player.heroes) this.seen.delete(hero.id);
        const tell = Array.from(touched);
        return () => this.sendList(...tell);
    }

    // a player's new name, in their friends' lists
    public async renamed(player: Player) {
        if (player.social) await this.sendList(...Array.from(player.social.friends.keys()));
    }

    // the list again, to each of them signed in
    private async sendList(...playerIds: number[]) {
        for (const id of playerIds) {
            const player = IBS.players.getById(id);
            if (player?.online && player.social) player.send({ r: S2C.FRIEND_LIST, l: await this.list(player) });
        }
    }

    private refuse(player: Player, why: string) {
        player.send({ r: S2C.FRIEND_REFUSED, w: why });
    }

    private done(player: Player, what: string) {
        player.send({ r: S2C.FRIEND_DONE, w: what });
    }

    //#endregion

    //#region asking, answering, removing, blocking

    public async ask(player: Player, name: any) {
        if (typeof name != "string" || !(name = name.trim()) || name.length > 64) return;
        const now = Date.now();
        if (now - (this.lastAsked.get(player.id) ?? 0) < ASK_GAP_MS) return this.refuse(player, "Wait a moment before asking again");
        this.lastAsked.set(player.id, now);

        const found = await this.query("SELECT id, display_name FROM player WHERE display_name = ? LIMIT 2", [name]);
        if (!found.length) return this.refuse(player, `No one's called ${name}`);
        if (found.length > 1) return this.refuse(player, `More than one player's called ${name}`);
        const them = found[0].id, theirName = found[0].display_name;
        const social = player.social;
        if (them == player.id) return this.refuse(player, "That's you");
        if (social.friends.has(them)) return this.refuse(player, `You and ${theirName} are friends already`);
        if (social.blocks.has(them)) return this.refuse(player, `You've blocked ${theirName}`);
        if (social.friends.size >= FRIENDS_MOST) return this.refuse(player, `You have ${FRIENDS_MOST} friends, the most there can be`);

        // they've asked you: friends now
        if ((await this.query("SELECT 1 FROM friend_ask WHERE from_id = ? AND to_id = ? AND at > ?", [them, player.id, this.askCutoff()])).length)
            return this.befriend(player.id, them);

        const out = (await this.query("SELECT COUNT(*) n FROM friend_ask WHERE from_id = ? AND at > ?", [player.id, this.askCutoff()]))[0].n;
        if (out >= ASKS_MOST) return this.refuse(player, `You have ${ASKS_MOST} asks waiting: cancel one first`);
        // (one who's blocked you is asked all the same, as far as you can tell; they never see it)
        await this.query("REPLACE INTO friend_ask (from_id, to_id, at) VALUES (?, ?, ?)", [player.id, them, new Date()]);
        this.done(player, `Asked ${theirName}`);
        await this.sendList(player.id, them);
    }

    public async answer(player: Player, fromId: any, yes: any) {
        if (!Number.isInteger(fromId)) return;
        const asked = await this.query("SELECT 1 FROM friend_ask WHERE from_id = ? AND to_id = ? AND at > ?", [fromId, player.id, this.askCutoff()]);
        if (!asked.length) return this.sendList(player.id);
        if (!yes) {
            await this.query("DELETE FROM friend_ask WHERE from_id = ? AND to_id = ?", [fromId, player.id]);
            return this.sendList(player.id, fromId);
        }
        if (player.social.friends.size >= FRIENDS_MOST) return this.refuse(player, `You have ${FRIENDS_MOST} friends, the most there can be`);
        if (await this.friendCount(fromId) >= FRIENDS_MOST) return this.refuse(player, `They have ${FRIENDS_MOST} friends, the most there can be`);
        if (player.social.blocks.has(fromId)) return this.refuse(player, "You've blocked them: unblock them first");
        await this.befriend(fromId, player.id);
    }

    private async befriend(a: number, b: number) {
        const [x, y] = this.pair(a, b);
        await this.query("INSERT IGNORE INTO friend (a_id, b_id, since) VALUES (?, ?, ?)", [x, y, new Date()]);
        await this.query("DELETE FROM friend_ask WHERE (from_id = ? AND to_id = ?) OR (from_id = ? AND to_id = ?)", [a, b, b, a]);
        this.socialOf(a)?.friends.set(b, false);
        this.socialOf(b)?.friends.set(a, false);
        for (const [me, them] of [[a, b], [b, a]]) {
            const player = IBS.players.getById(me);
            if (player) this.done(player, `You and ${await this.nameOf(them)} are friends`);
        }
        await this.sendList(a, b);
    }

    public async cancel(player: Player, toId: any) {
        if (!Number.isInteger(toId)) return;
        await this.query("DELETE FROM friend_ask WHERE from_id = ? AND to_id = ?", [player.id, toId]);
        await this.sendList(player.id, toId);
    }

    public async remove(player: Player, id: any) {
        if (!Number.isInteger(id) || !player.social.friends.has(id)) return;
        await this.unfriend(player.id, id);
        await this.sendList(player.id, id);
    }

    // no longer friends: each one watching the other's heroes has them taken off
    private async unfriend(a: number, b: number) {
        const [x, y] = this.pair(a, b);
        await this.query("DELETE FROM friend WHERE a_id = ? AND b_id = ?", [x, y]);
        for (const [me, them] of [[a, b], [b, a]]) {
            const player = IBS.players.getById(me);
            if (player?.social?.friends.get(them)) player.send({ r: S2C.FRIEND_GONE, o: them });
            player?.social?.friends.delete(them);
        }
    }

    public async favourite(player: Player, id: any, on: any) {
        const social = player.social;
        if (!Number.isInteger(id) || !social.friends.has(id) || social.friends.get(id) == !!on) return;
        const most = favouritesMost(player.record.isPremium());
        if (on && Array.from(social.friends.values()).filter((f) => f).length >= most)
            return this.refuse(player, `Up to ${most} favourites: take one off first`);
        const [x, y] = this.pair(player.id, id);
        await this.query(`UPDATE friend SET ${x == player.id ? "a_fav" : "b_fav"} = ? WHERE a_id = ? AND b_id = ?`, [on ? 1 : 0, x, y]);
        social.friends.set(id, !!on);
        if (on) await this.sendHeroes(player, id);
        else player.send({ r: S2C.FRIEND_GONE, o: id });
        await this.sendList(player.id);
    }

    public async block(player: Player, id: any) {
        const social = player.social;
        if (!Number.isInteger(id) || id == player.id || social.blocks.has(id)) return;
        if (social.blocks.size >= BLOCKS_MOST) return this.refuse(player, `You've blocked ${BLOCKS_MOST} players, the most there can be`);
        if (!(await this.query("SELECT 1 FROM player WHERE id = ?", [id])).length) return;
        await this.query("INSERT IGNORE INTO player_block (player_id, blocked_id, at) VALUES (?, ?, ?)", [player.id, id, new Date()]);
        social.blocks.add(id);
        if (social.friends.has(id)) await this.unfriend(player.id, id);
        await this.query("DELETE FROM friend_ask WHERE (from_id = ? AND to_id = ?) OR (from_id = ? AND to_id = ?)", [player.id, id, id, player.id]);
        await this.sendList(player.id, id);
    }

    public async unblock(player: Player, id: any) {
        if (!Number.isInteger(id) || !player.social.blocks.has(id)) return;
        await this.query("DELETE FROM player_block WHERE player_id = ? AND blocked_id = ?", [player.id, id]);
        player.social.blocks.delete(id);
        await this.sendList(player.id);
    }

    //#endregion

    //#region their heroes

    // a hero as a friend has them: their data but what they've learned
    private heroRow(hero: Hero) {
        const { v, ...d } = hero.d;
        return [hero.id, d, hero.s];
    }

    // all of a friend's heroes, where they are (or were, if they've stopped), to `player` once
    private async sendHeroes(player: Player, friendId: number) {
        const heroes = IBS.players.getById(friendId)?.heroes ?? await IBS.heroes.load(friendId);
        player.send({ r: S2C.FRIEND_HEROES, o: friendId, h: heroes.map((h) => this.heroRow(h)) });
    }

    public async find(player: Player, id: any) {
        if (!Number.isInteger(id) || !player.social.friends.has(id)) return;
        await this.sendHeroes(player, id);
    }

    // those signed in with `owner` as a favourite
    private watchers(owner: Player) {
        const watching: Player[] = [];
        if (!owner.social) return watching;
        for (const id of owner.social.friends.keys()) {
            const w = IBS.players.getById(id);
            if (w?.online && w.social?.friends.get(owner.id)) watching.push(w);
        }
        return watching;
    }

    // a hero's state changed: to those watching, if they set off, got there or started something else
    public heroSeen(owner: Player, hero: Hero) {
        const s = hero.s, key = JSON.stringify([s.p, s.r, s.w?.k, s.w?.p, s.w?.m, !!s.c, !!s.o]);
        if (this.seen.get(hero.id) == key) return;
        this.seen.set(hero.id, key);
        const watching = this.watchers(owner);
        if (!watching.length) return;
        const message = { r: S2C.FRIEND_HERO, o: owner.id, h: this.heroRow(hero) };
        for (const w of watching) w.send(message);
    }

    // a fight (HeroTasks battle) at `at`: to those watching any of the heroes in
    // it, for a puff over them on the map (not one worked out long after, signing in)
    public fought(heroes: Hero[], at: number) {
        if (Date.now() - at > FriendManager.FIGHT_LATE_MS) return;
        const ids = heroes.map((h) => h.id), told = new Set<Player>();
        for (const h of heroes) {
            const owner = IBS.heroes.tasks.parties.ownerOf(h);
            if (owner) for (const w of this.watchers(owner)) told.add(w);
        }
        told.forEach((w) => w.send({ r: S2C.FRIEND_FOUGHT, h: ids }));
    }

    // signing in, out, and their heroes stopping: to their friends signed in
    public presence(player: Player) {
        if (!player.social) return;
        const seen = Date.now();
        for (const id of player.social.friends.keys()) {
            const friend = IBS.players.getById(id);
            if (friend?.online) friend.send({ r: S2C.FRIEND_PRESENCE, f: this.info(id, player.id, player.record.displayName, seen) });
        }
    }

    // what comes with signing in: the list, the last whispers, the favourites' heroes
    public async signIn(player: Player) {
        const heroes: { o: number, h: any[] }[] = [];
        for (const [id, fav] of player.social.friends) {
            if (!fav) continue;
            const theirs = IBS.players.getById(id)?.heroes ?? await IBS.heroes.load(id);
            heroes.push({ o: id, h: theirs.map((h) => this.heroRow(h)) });
        }
        return { friends: await this.list(player), whispers: await this.recentWhispers(player), friendHeroes: heroes };
    }

    //#endregion

    //#region whispers

    public async whisper(player: Player, toId: any, text: any) {
        const t = cleanChat(text);
        if (!t || !Number.isInteger(toId)) return;
        if (!player.social.friends.has(toId)) return this.refuse(player, "Whispers go to friends only");
        const why = IBS.chat.refusal(player, t, false);     // (the muted still whisper to friends)
        if (why) return IBS.chat.note(player, why, true);
        const now = Date.now();
        if (now - (this.lastWhispered.get(player.id) ?? 0) < CHAT_GAP_MS) return;
        this.lastWhispered.set(player.id, now);

        const result = await this.query<ResultSetHeader>("INSERT INTO whisper (from_id, to_id, at, text) VALUES (?, ?, ?, ?)", [player.id, toId, new Date(now), t]);
        const between = "((from_id = ? AND to_id = ?) OR (from_id = ? AND to_id = ?))", pair = [player.id, toId, toId, player.id];
        const oldest = await this.query(`SELECT id FROM whisper WHERE ${between} ORDER BY id DESC LIMIT 1 OFFSET ?`, [...pair, WHISPER_KEPT]);
        if (oldest.length) await this.query(`DELETE FROM whisper WHERE ${between} AND id <= ?`, [...pair, oldest[0].id]);

        player.send({ r: S2C.WHISPER_SAID, l: { i: result.insertId, w: toId, n: await this.nameOf(toId), m: 1, t, a: now } as Whisper });
        const them = IBS.players.getById(toId);
        if (them?.online) them.send({ r: S2C.WHISPER_SAID, l: { i: result.insertId, w: player.id, n: player.record.displayName, m: 0, t, a: now, u: 1 } as Whisper });
    }

    public async seenWhispers(player: Player) {
        await this.query("UPDATE whisper SET seen = 1 WHERE to_id = ? AND seen = 0", [player.id]);
    }

    // the last whispers to and from them, oldest first (but those from anyone they've blocked)
    private async recentWhispers(player: Player): Promise<Whisper[]> {
        const rows = await this.query(
            `SELECT w.id, w.from_id, w.to_id, w.at, w.text, w.seen, p.display_name FROM whisper w
             JOIN player p ON p.id = IF(w.from_id = ?, w.to_id, w.from_id)
             WHERE w.from_id = ? OR w.to_id = ? ORDER BY w.id DESC LIMIT ?`,
            [player.id, player.id, player.id, WHISPER_KEPT * 2]);
        return rows.reverse().map((r) => {
            const mine = r.from_id == player.id, other = mine ? r.to_id : r.from_id;
            const w: Whisper = { i: r.id, w: other, n: r.display_name, m: mine ? 1 : 0, t: r.text, a: new Date(r.at).getTime() };
            if (!mine && !r.seen) w.u = 1;
            return w;
        }).filter((w) => !player.social.blocks.has(w.w));
    }

    //#endregion

}
