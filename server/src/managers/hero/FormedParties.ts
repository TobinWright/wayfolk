import { RowDataPacket, ResultSetHeader } from "mysql2";
import { IBS } from "../../app";
import { S2C } from "../../constants/Routes";
import { extLevel } from "../../../../shared/Heroes";
import { Invites, LEADERSHIP, leadWork, Mate, MateIs, PARTIES_MOST, PARTY_ASK_MS, PARTY_MOST, PartyAsk, partyName, PartyView } from "../../../../shared/Parties";
import { partyPower } from "../../../../shared/Locations";
import { HeroState, Task, todoMost } from "../../../../shared/Tasks";
import { Player } from "../player/Player";
import { Hero } from "./HeroManager";
import { HeroTasks } from "./HeroTasks";
import { Log } from "../../utils/Log";

// one in a formed party, as last seen loaded (to show them when they're not):
// h their id, o their player's, n their name, l looks, j job, on their player's name
interface Member { h: number; o: number; n: string; l: number[]; j: number; on: string; }

// an ask out, in memory only: o the player asked, on their name, h the hero, hn their name, e when it runs out (ms)
interface Ask { o: number; on: string; h: number; hn: string; e: number; }

// a formed party: o the player who made it (or was handed it), on their
// name, n its name, m who's in it in order, s its state (HeroState p to e, q,
// b, t: as a hero's), k its asks out, open public (its room filled by
// helpers); with, those together with it now (gather), helpers those alone at
// the same thing there filling its room (HeroParties.regroup), sat those told
// they're sitting out what's under way (none of them saved)
export interface Formed { id: number; o: number; on: string; n: string; m: Member[]; s: HeroState; k: Ask[]; open: boolean; with: Hero[]; helpers: Hero[]; sat: Set<number>; seen: string; dirty: boolean; }

// how long between asks from one player
const ASK_GAP_MS = 2000;

// Formed parties (shared/Parties.ts): every one loaded as the server starts
// (`hero_party`, a row each: its members and state as JSON) and saved as
// it changes (the state with the heroes, HeroTasks.saveAll). Each tick those
// in one who are loaded and where it is are with it (gather); HeroTasks works
// out the party for them, as one (advanceParty), and those still on the way
// by themselves. Who may ask a player's heroes in is `party_invites` (none:
// anyone). Told to those with a hero in one, as it changes (PARTY_LIST, PARTY_STATE).

export class FormedParties {

    public parties = new Map<number, Formed>();
    private invites = new Map<number, Invites>();
    private lastAsked = new Map<number, number>();

    constructor(private tasks: HeroTasks) { }

    private async query<T = RowDataPacket[]>(sql: string, args: any[] = []): Promise<T> {
        const conn = await IBS.db.getConnection();
        try {
            const [result] = await conn.query(sql, args);
            return result as any;
        } finally {
            conn.release();
        }
    }

    public async init() {
        await this.query(`CREATE TABLE IF NOT EXISTS hero_party (
            id INT AUTO_INCREMENT PRIMARY KEY,
            player_id INT NOT NULL,
            name VARCHAR(64) NOT NULL,
            members TEXT NOT NULL,
            state TEXT NOT NULL,
            asks TEXT NOT NULL,
            INDEX (player_id))`);
        try {
            // (public: its room filled by helpers)
            await this.query("ALTER TABLE hero_party ADD COLUMN open_spots TINYINT NOT NULL DEFAULT 0");
        } catch (e) {
            if ((e as any).errno != 1060) throw e;     // (already there)
        }
        await this.query(`CREATE TABLE IF NOT EXISTS party_invites (
            player_id INT PRIMARY KEY,
            invites TINYINT NOT NULL)`);
        for (const r of await this.query("SELECT id, player_id, name, members, state, open_spots FROM hero_party")) {
            const m: Member[] = JSON.parse(r.members);
            this.parties.set(r.id, { id: r.id, o: r.player_id, on: m.find((x) => x.o == r.player_id)?.on ?? "", n: r.name, m, s: JSON.parse(r.state), k: [], open: !!r.open_spots, with: [], helpers: [], sat: new Set(), seen: "", dirty: false });
        }
    }

    //#region who's where

    // the formed party a hero's in (none: null)
    public of(hero: Hero): Formed {
        const f = hero.s.g != null ? this.parties.get(hero.s.g) : null;
        return f?.m.some((m) => m.h == hero.id) ? f : null;
    }

    // whether a hero in it is where it is: at the same stop (it's not on a leg),
    // or on the same leg as far along (with it, as it went)
    public at(f: Formed, hero: Hero) {
        const a = f.s, b = hero.s;
        if (a.l > 0) return b.p == a.p && b.l == a.l && b.r[0] == a.r[0];
        return b.p == a.p && !(b.l > 0);
    }

    // where one on their way to it makes for: the stop it's at, or the end of the leg it's on
    public meetAt(f: Formed) {
        return f.s.l > 0 && f.s.r.length ? f.s.r[0] : f.s.p;
    }

    // those together with each party now (who's loaded: HeroParties.index); one
    // that's changed told to those in it (who's with it, on the way, not about)
    public gather() {
        for (const f of this.parties.values()) {
            this.lapse(f);
            f.with = [];
            for (const m of f.m) {
                const hero = this.tasks.parties.heroById(m.h), owner = hero && this.tasks.parties.ownerOf(hero);
                if (!hero || hero.s.g != f.id) continue;
                m.n = hero.d.n; m.l = hero.d.l; m.j = hero.d.j; m.on = owner?.record.displayName ?? m.on;
                if (m.o == f.o) f.on = m.on;
                if (this.at(f, hero)) f.with.push(hero);
            }
            const seen = f.m.map((m) => `${m.h}:${this.is(f, m)}:${m.n}:${m.l.join(".")}`).join(",") + `/${f.helpers.map((h) => h.id).join(",")}/${this.power(f)}`;
            if (seen != f.seen) { f.seen = seen; this.tell(f); }
        }
    }

    // the power of those with it and its helpers, as HeroTasks.deepest counts it
    public power(f: Formed) {
        return Math.round(partyPower([...f.with, ...f.helpers].map((h) => h.d)));
    }

    // asks not answered in time are off, as are those to someone who's signed out
    private lapse(f: Formed) {
        const now = Date.now();
        for (const a of f.k.slice()) {
            const them = IBS.players.getById(a.o);
            if (now < a.e && them?.online) continue;
            this.askOver(f, a, `${a.on} didn't answer for ${a.hn}`);
            if (them?.online) this.sendList(them).catch(Log.catch("Couldn't send a player's parties", { playerId: them.id }));
            this.tell(f);
        }
    }

    // an ask gone, its asker told why
    private askOver(f: Formed, ask: Ask, why: string) {
        f.k = f.k.filter((a) => a != ask);
        const asker = IBS.players.getById(f.o);
        if (asker?.online) this.refuse(asker, why);
    }

    private is(f: Formed, m: Member) {
        const hero = this.tasks.parties.heroById(m.h);
        return !hero || hero.s.g != f.id ? MateIs.AWAY : f.with.includes(hero) ? MateIs.WITH : MateIs.JOINING;
    }

    // the public party a hero alone is helping (none: null)
    // who leads it: the first in it who's with it (none with it: nobody)
    public leader(f: Formed): Hero {
        for (const m of f.m) { const h = f.with.find((x) => x.id == m.h); if (h) return h; }
        return null;
    }

    public helping(hero: Hero): Formed {
        for (const f of this.parties.values()) if (f.helpers.includes(hero)) return f;
        return null;
    }

    // the public parties, for HeroParties.regroup to fill (a private one's helpers let go)
    public open() {
        const open: Formed[] = [];
        for (const f of this.parties.values()) {
            if (f.open) open.push(f);
            else f.helpers = [];
        }
        return open;
    }

    // whether one in it, loaded, is still on their way to it (it sets off nowhere new till they're there)
    public awaited(f: Formed) {
        return f.m.some((m) => {
            const hero = this.tasks.parties.heroById(m.h);
            return hero && hero.s.g == f.id && !f.with.includes(hero);
        });
    }

    // the time a party's worked out to: as far as the furthest of its players
    // loaded have theirs worked out (signed in: now; away: till their heroes
    // stop); none loaded: null, it waits
    public until(f: Formed) {
        let until: number = null;
        const now = Date.now();
        for (const hero of f.with) {
            const p = this.tasks.parties.ownerOf(hero);
            if (p) until = Math.max(until ?? 0, p.online ? now : Math.min(now, p.awayUntil));
        }
        return until;
    }

    //#endregion

    //#region in and out

    // a hero in: what they were at waits (the first on their list, less what's
    // done of it) till they're out again; they make for it (joining)
    private join(f: Formed, hero: Hero, player: Player) {
        const s = hero.s, first = s.q[0];
        if (s.w && first && s.w.k == first.k && first.n && s.d > 0) s.q[0] = { ...first, n: Math.max(1, first.n - s.d) };
        s.g = f.id;
        s.w = null; s.d = 0; s.u = 0; s.a = s.e = s.x = undefined;
        f.m.push({ h: hero.id, o: player.id, n: hero.d.n, l: hero.d.l, j: hero.d.j, on: player.record.displayName });
        f.k = f.k.filter((a) => !(a.o == player.id && a.h == hero.id));
        player.heroesDirty.add(hero);
        if (player.online) this.tasks.send(player, hero);
        IBS.friends.heroSeen(player, hero);
    }

    // a hero out of their party (loaded: on with their own list); its player
    // left with none of theirs in it, it's handed to the next one's, and with
    // nobody, it's gone
    private part(f: Formed, heroId: number) {
        f.m = f.m.filter((m) => m.h != heroId);
        const hero = this.tasks.parties.heroById(heroId);
        if (hero && hero.s.g == f.id) {
            this.loose(hero);
            const owner = this.tasks.parties.ownerOf(hero);
            if (owner) {
                owner.heroesDirty.add(hero);
                if (owner.online) this.tasks.send(owner, hero);
                IBS.friends.heroSeen(owner, hero);
            }
        }
        f.with = f.with.filter((h) => h.id != heroId);
        if (!f.m.some((m) => m.o == f.o) && f.m.length) { f.o = f.m[0].o; f.on = f.m[0].on; }
    }

    // out of a party (or in one that's gone): their own list again, from where they are
    public loose(hero: Hero) {
        const s = hero.s;
        s.g = undefined;
        s.w = null; s.d = 0; s.u = 0; s.a = s.e = undefined;
    }

    // saved, told, and gone if there's nobody in it
    private async settle(f: Formed, tell: Player[] = []) {
        const players = this.players(f);
        if (!f.m.length) {
            this.parties.delete(f.id);
            await this.query("DELETE FROM hero_party WHERE id = ?", [f.id]);
        } else await this.save(f);
        for (const p of new Set([...players, ...tell])) this.sendList(p);
    }

    //#endregion

    //#region asked for (C2S.PARTY_*)

    private refuse(player: Player, why: string) {
        player.send({ r: S2C.PARTY_REFUSED, w: why });
    }

    private done(player: Player, what: string) {
        player.send({ r: S2C.PARTY_DONE, w: what });
    }

    // a party of theirs, by its id (none: null, and they're told)
    private mine(player: Player, id: any) {
        const f = this.parties.get(id);
        if (f && f.o == player.id) return f;
        this.refuse(player, "That's not a party of yours");
        return null;
    }

    // one of their heroes, in no party (none: null, and they're told why)
    private free(player: Player, heroId: any) {
        const hero = player.heroes.find((h) => h.id == heroId);
        if (!hero) { this.refuse(player, "That's not a hero of yours"); return null; }
        if (this.of(hero)) { this.refuse(player, `${hero.d.n} is in a party already`); return null; }
        return hero;
    }

    public async make(player: Player, heroIds: any, name: any) {
        if (!Array.isArray(heroIds) || !heroIds.length) return;
        if (Array.from(this.parties.values()).filter((f) => f.o == player.id).length >= PARTIES_MOST) return this.refuse(player, `You have ${PARTIES_MOST} parties, the most there can be`);
        const ids = Array.from(new Set(heroIds)).slice(0, PARTY_MOST), heroes: Hero[] = [];
        for (const id of ids) {
            const hero = this.free(player, id);
            if (!hero) return;
            heroes.push(hero);
        }
        const lead = heroes[0].s, n = partyName(name) || `${heroes[0].d.n}'s Party`;
        // (where the first of them is: on a leg, it goes on to its end)
        const s: HeroState = { p: lead.p, r: lead.l > 0 && lead.r.length ? [lead.r[0]] : [], l: lead.l > 0 ? lead.l : 0, q: [], d: 0, u: 0, t: Date.now() };
        const result = await this.query<ResultSetHeader>("INSERT INTO hero_party (player_id, name, members, state, asks) VALUES (?, ?, '[]', ?, '[]')", [player.id, n, JSON.stringify(s)]);
        const f: Formed = { id: result.insertId, o: player.id, on: player.record.displayName, n, m: [], s, k: [], open: false, with: [], helpers: [], sat: new Set(), seen: "", dirty: false };
        this.parties.set(f.id, f);
        // (still theirs and free: a hire or a move while it was saved)
        for (const hero of heroes) if (player.heroes.includes(hero) && !this.of(hero)) this.join(f, hero, player);
        Log.info(`Party made: ${n} (${f.id}) by ${player.record.displayName}`);
        await this.settle(f, [player]);
    }

    public async add(player: Player, id: any, heroId: any) {
        const f = this.mine(player, id), hero = f && this.free(player, heroId);
        if (!hero) return;
        if (f.m.length >= PARTY_MOST) return this.refuse(player, `A party has ${PARTY_MOST} at most`);
        this.join(f, hero, player);
        await this.settle(f);
    }

    // a hero asked in, by their name: their player, signed in, has PARTY_ASK_MS
    // to say yes - as they allow (Invites), never one who's blocked either of
    // you (as far as you can tell, they're not taking asks). One of your own
    // just comes in.
    public async ask(player: Player, id: any, name: any) {
        const f = this.mine(player, id);
        if (!f || typeof name != "string" || !(name = name.trim()) || name.length > 64) return;
        const now = Date.now();
        if (now - (this.lastAsked.get(player.id) ?? 0) < ASK_GAP_MS) return this.refuse(player, "Wait a moment before asking again");
        this.lastAsked.set(player.id, now);
        if (f.m.length + f.k.length >= PARTY_MOST) return this.refuse(player, `A party has ${PARTY_MOST} at most, asked or in`);
        const found = await this.query(`SELECT h.id, h.player_id, p.display_name, JSON_UNQUOTE(JSON_EXTRACT(h.data, '$.n')) AS hero_name
            FROM hero h JOIN player p ON p.id = h.player_id
            WHERE LOWER(JSON_UNQUOTE(JSON_EXTRACT(h.data, '$.n'))) = LOWER(?) AND h.benched = 0 LIMIT 2`, [name]);
        if (!found.length) return this.refuse(player, `No character's called ${name}`);
        if (found.length > 1) return this.refuse(player, `More than one character's called ${name}`);
        const them: number = found[0].player_id, theirs: string = found[0].display_name, h: number = found[0].id, hn: string = found[0].hero_name;
        if (them == player.id) return this.add(player, f.id, h);
        if (f.k.some((a) => a.o == them)) return this.refuse(player, `You've asked ${theirs} already`);
        const allows = await this.invitesOf(them);
        const friendly = async () => IBS.guilds.together(player.id, them) || await IBS.friends.areFriends(player.id, them);
        if (allows == Invites.NOBODY || (allows == Invites.FRIENDS && !(await friendly()))
            || await IBS.friends.hasBlocked(them, player.id) || await IBS.friends.hasBlocked(player.id, them))
            return this.refuse(player, `${theirs} isn't taking party asks${allows == Invites.FRIENDS ? " from you" : ""}`);
        const asked = IBS.players.getById(them);
        if (!asked?.online) return this.refuse(player, `${theirs} isn't signed in`);
        const hero = asked.heroes.find((x) => x.id == h);
        if (hero && this.of(hero)) return this.refuse(player, `${hn} is in a party already`);
        if (!this.parties.has(f.id) || f.m.length + f.k.length >= PARTY_MOST || f.k.some((a) => a.o == them)) return;
        f.k.push({ o: them, on: theirs, h, hn, e: Date.now() + PARTY_ASK_MS });
        this.done(player, `Asked ${theirs} for ${hn}: ${PARTY_ASK_MS / 1000}s to answer`);
        await this.settle(f, [asked]);
    }

    public async unask(player: Player, id: any, them: any) {
        const f = this.mine(player, id);
        if (!f || !f.k.some((a) => a.o == them)) return;
        f.k = f.k.filter((a) => a.o != them);
        const asked = IBS.players.getById(them);
        await this.settle(f, asked?.online ? [asked] : []);
    }

    // an ask to them answered, which ends it: the hero asked in, or no (0)
    public async answer(player: Player, id: any, heroId: any) {
        const f = this.parties.get(id), ask = f?.k.find((a) => a.o == player.id);
        if (!ask) return this.sendList(player);
        if (heroId && ask.h != heroId) return this.refuse(player, "They asked for another of your heroes");
        const hero = heroId ? this.free(player, heroId) : null;
        if (!heroId) this.askOver(f, ask, `${ask.on} said no for ${ask.hn}`);
        else if (!hero) this.askOver(f, ask, `${ask.hn} can't join just now`);
        else if (f.m.length >= PARTY_MOST) {
            this.refuse(player, `${f.n} is full`);
            this.askOver(f, ask, `${f.n} is full`);
        } else {
            this.join(f, hero, player);
            Log.info(`Party joined: ${hero.d.n} (${hero.id}) of ${player.record.displayName} into ${f.n} (${f.id})`);
        }
        await this.settle(f, [player]);
    }

    // a hero of theirs pulled out of their party
    public async leave(player: Player, heroId: any) {
        const hero = player.heroes.find((h) => h.id == heroId), f = hero && this.of(hero);
        if (!f) return;
        this.part(f, hero.id);
        await this.settle(f, [player]);
    }

    public async kick(player: Player, id: any, heroId: any) {
        const f = this.mine(player, id);
        if (!f || !f.m.some((m) => m.h == heroId)) return;
        const them = f.m.find((m) => m.h == heroId).o;
        this.part(f, heroId);
        const out = IBS.players.getById(them);
        await this.settle(f, out?.online ? [out] : []);
    }

    public async disband(player: Player, id: any) {
        const f = this.mine(player, id);
        if (!f) return;
        const players = this.players(f);
        for (const m of f.m.slice()) this.part(f, m.h);
        f.k = [];
        Log.info(`Party disbanded: ${f.n} (${f.id}) by ${player.record.displayName}`);
        await this.settle(f, players);
    }

    // a new list and backup task, as a hero's (HeroTasks.setTodo): what's under way carries on if it's still first
    public async todo(player: Player, id: any, q: any, b: any) {
        const f = this.mine(player, id);
        if (!f || !Array.isArray(q)) return;
        const s = f.s;
        const tasks = q.slice(0, todoMost(player.record.isPremium())).map((t: any) => this.tasks.taskOf(t)).filter((t: Task) => t);
        const backup = this.tasks.check(b) ?? undefined;
        if (backup) delete backup.n;
        const same = tasks.length ? JSON.stringify(tasks[0]) == JSON.stringify(s.q[0] ?? null)
            : !s.q.length && JSON.stringify(backup ?? null) == JSON.stringify(s.b ?? null);
        s.q = tasks;
        s.b = backup;
        if (!same) { s.w = null; s.d = 0; s.u = 0; s.a = s.e = undefined; f.sat.clear(); }
        s.x = undefined;
        f.dirty = true;
        this.tasks.advanceParty(f, 0);
        this.sendState(f);
    }

    // public (its room filled by helpers) or private (left empty: its helpers let go at once)
    public async setOpen(player: Player, id: any, open: any) {
        const f = this.mine(player, id);
        if (!f || !!open == f.open) return;
        f.open = !!open;
        if (!f.open) f.helpers = [];
        await this.settle(f);
    }

    public async rename(player: Player, id: any, name: any) {
        const f = this.mine(player, id), n = partyName(name);
        if (!f || !n || n == f.n) return;
        f.n = n;
        await this.settle(f);
    }

    //#endregion

    //#region who may ask

    public async invitesOf(playerId: number): Promise<Invites> {
        if (this.invites.has(playerId)) return this.invites.get(playerId);
        const rows = await this.query("SELECT invites FROM party_invites WHERE player_id = ?", [playerId]);
        const v = rows.length ? rows[0].invites : Invites.ANYONE;
        this.invites.set(playerId, v);
        return v;
    }

    public async setInvites(player: Player, v: any) {
        if (!Object.values(Invites).includes(v) || typeof v != "number") return;
        this.invites.set(player.id, v);
        await this.query("REPLACE INTO party_invites (player_id, invites) VALUES (?, ?)", [player.id, v]);
        await this.sendList(player);
    }

    //#endregion

    //#region gone

    // a hero let go (HeroManager.dismiss): out of their party
    public async dismissed(hero: Hero) {
        const f = this.parties.get(hero.s.g);
        if (!f?.m.some((m) => m.h == hero.id)) return;
        this.part(f, hero.id);
        await this.settle(f);
    }

    // an account being deleted (AccountManager): their heroes out of every
    // party, their asks gone, theirs handed on (or gone with nobody left)
    public async forget(player: Player) {
        for (const f of Array.from(this.parties.values())) {
            const had = f.m.some((m) => m.o == player.id) || f.k.some((a) => a.o == player.id) || f.o == player.id;
            if (!had) continue;
            for (const m of f.m.filter((m) => m.o == player.id)) this.part(f, m.h);
            f.k = f.k.filter((a) => a.o != player.id);
            if (f.o == player.id) f.k = [];         // (asks for a party nobody's left of: gone)
            await this.settle(f);
        }
        this.invites.delete(player.id);
    }

    //#endregion

    //#region telling and saving

    // the players with a hero in it, loaded and signed in, and who it's asked
    private players(f: Formed) {
        const ids = new Set([f.o, ...f.m.map((m) => m.o), ...f.k.map((a) => a.o)]);
        return Array.from(ids, (id) => IBS.players.getById(id)).filter((p) => p?.online);
    }

    private tell(f: Formed) {
        for (const p of this.players(f)) this.sendList(p).catch(Log.catch("Couldn't send a player's parties", { playerId: p.id }));
    }

    // a party as they see it
    private view(f: Formed, player: Player): PartyView {
        const m = f.m.map((x): Mate => [x.h, x.n, x.l, x.on, x.j, this.is(f, x), x.o == player.id ? 1 : 0]);
        const v: PartyView = { i: f.id, n: f.n, o: f.on, m, s: this.stateOf(f), w: this.power(f) };
        if (f.o == player.id) { v.y = 1; v.k = f.k.map((a) => [a.o, a.on, a.h, a.hn, a.e]); }
        if (f.open) v.f = 1;
        const lead = f.with.length > 1 ? this.leader(f) : null;
        if (lead) { v.d = Math.round((leadWork(extLevel(lead.d, LEADERSHIP)) - 1) * 1000) / 10; v.dn = lead.d.n; }
        if (f.helpers.length) v.x = f.helpers.map((h) => [h.id, h.d.n, this.tasks.parties.ownerOf(h)?.record.displayName ?? "", h.d.j]);
        return v;
    }

    private stateOf(f: Formed): HeroState {
        const { p, r, l, q, b, w, d, u, a, e, t } = f.s;
        return { p, r, l, q, b, w, d, u, a, e, t };
    }

    // their parties, the asks to them and who may ask, whole
    public async sendList(player: Player) {
        if (!player.online) return;
        const l: PartyView[] = [], a: PartyAsk[] = [];
        for (const f of this.parties.values()) {
            if (f.o == player.id || f.m.some((m) => m.o == player.id)) l.push(this.view(f, player));
            const ask = f.k.find((x) => x.o == player.id);
            if (ask) a.push({ i: f.id, n: f.n, o: f.on, m: this.view(f, player).m, h: ask.h, e: ask.e });
        }
        player.send({ r: S2C.PARTY_LIST, l, a, v: await this.invitesOf(player.id) });
    }

    // its state, changed, to those with a hero in it
    public sendState(f: Formed) {
        const ids = new Set([f.o, ...f.m.map((m) => m.o)]);
        const s = this.stateOf(f);
        for (const id of ids) {
            const p = IBS.players.getById(id);
            if (p?.online) p.send({ r: S2C.PARTY_STATE, i: f.id, s });
        }
    }

    private async save(f: Formed) {
        f.dirty = false;
        await this.query("UPDATE hero_party SET player_id = ?, name = ?, members = ?, state = ?, open_spots = ? WHERE id = ?",
            [f.o, f.n, JSON.stringify(f.m), JSON.stringify(this.stateOf(f)), f.open ? 1 : 0, f.id]);
    }

    // those whose state changed (with the heroes: HeroTasks.saveAll)
    public async saveAll() {
        for (const f of Array.from(this.parties.values())) if (f.dirty && this.parties.has(f.id)) await this.save(f);
    }

    //#endregion

}
