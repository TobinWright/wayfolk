import { ResultSetHeader, RowDataPacket } from "mysql2";
import { IBS } from "../../app";
import { S2C } from "../../constants/Routes";
import {
    BEAST_MS, BEAST_REACH, beastAt, beastName, BEASTS, FIND_CHANCE, FIND_MS, findFits, findPool, FINDS, isOn, KIND_NAMES, Lot, LOT_LEVEL, LOT_MOST, lotPrice, LOTS,
    MERCHANT_MS, MOST_OF, OPENING_MS, OPENINGS, rareMaterials, Sight, SIGHT_GAP_LEAST_MS, SIGHT_GAP_MOST_MS, SightKind, SightView,
} from "../../../../shared/Sights";
import { isTown, kindOf, PLACE_KINDS, WorldPlace } from "../../../../shared/Places";
import { distancesFrom, findPath, SEA_TERRAIN } from "../../../../shared/Travel";
import { itemName } from "../../../../shared/Tasks";
import { traitMul } from "../../../../shared/Heroes";
import { JournalKind } from "../../../../shared/Journal";
import { Hero } from "../hero/HeroManager";
import { Player } from "../player/Player";
import { Log } from "../../utils/Log";

// Things that turn up on the map for a while (shared/Sights.ts): a wandering
// merchant at a town, a rare find at a gathering place, a beast roaming the
// map, an opening (a dungeon of its own for a day). One turns up every
// SIGHT_GAP_LEAST_MS-SIGHT_GAP_MOST_MS, of a kind there's room for
// (MOST_OF), and goes when its time's up; each is said in the General chat.
// Kept in memory, saved (`world_sight`, a row each as JSON, with who's bought
// what from a merchant and which heroes have met a beast) every SAVE_MS, and
// what's changed sent to everyone signed in. HeroTasks asks it as heroes
// gather (a rare find), explore (an opening) and stop on the road (a beast).

const MERCHANTS = ["Zara the Peddler", "Old Tobias", "Mirelle of the Silk Road", "Hassan's Caravan", "The Tinker Brothers", "Madame Oddsworth", "Quill the Collector"];

interface Kept { sight: Sight; bought: Map<number, number[]>; met: Set<number>; }

export class SightManager {

    public static SAVE_MS = 10000;
    public static SEND_MS = 2000;

    private kept = new Map<number, Kept>();
    private dirty = new Set<number>();          // (ids to save)
    private gone: number[] = [];                // (ids to delete)
    private changed = false;                    // (to send everyone)
    private nextAt = 0;
    private saveTime = 0;
    private sendTime = 0;

    public async init() {
        const conn = await IBS.db.getConnection();
        try {
            await conn.query(`CREATE TABLE IF NOT EXISTS world_sight (
                id INT AUTO_INCREMENT PRIMARY KEY,
                data MEDIUMTEXT NOT NULL,
                ends BIGINT NOT NULL,
                INDEX (ends))`);
            const now = Date.now();
            await conn.query("DELETE FROM world_sight WHERE ends <= ?", [now]);
            const [rows] = await conn.query<RowDataPacket[]>("SELECT id, data FROM world_sight");
            for (const r of rows) {
                try {
                    const d = JSON.parse(r.data);
                    const sight: Sight = { ...d.s, i: r.id };
                    this.keep({ sight, bought: new Map(d.b ?? []), met: new Set(d.m ?? []) });
                } catch (e) {
                    Log.warn(`A sight that couldn't be read (${r.id})`);
                }
            }
        } finally {
            conn.release();
        }
        this.nextAt = Date.now() + 60000;
        Log.info(`Sights: ${this.kept.size} about`);
    }

    // one kept (an opening's place made a place while it's open)
    private keep(k: Kept) {
        this.kept.set(k.sight.i, k);
        if (k.sight.o) IBS.heroes.tasks.places.set(k.sight.o.i, k.sight.o);
    }

    //#region what's about

    public all(): Sight[] {
        return Array.from(this.kept.values(), (k) => k.sight);
    }

    private on(kind: SightKind, now = Date.now()) {
        return this.all().filter((s) => s.k == kind && isOn(s, now));
    }

    // is the place an opening's (a dungeon of its own while it's open)
    public isOpening(place: number) {
        return this.on(SightKind.OPENING).some((s) => s.p == place);
    }

    // what goes to a player: a merchant's with how many of each lot they've bought
    public views(player: Player): SightView[] {
        return Array.from(this.kept.values(), (k) => {
            const view: SightView = { ...k.sight };
            const mine = k.bought.get(player.id);
            if (mine) view.b = mine;
            return view;
        });
    }

    //#endregion

    //#region turning up and going

    // a new one of a kind (any there's room for, at random); null if none fits
    public async start(kind?: SightKind) {
        const now = Date.now();
        const kinds = kind != null ? [kind] : [SightKind.MERCHANT, SightKind.FIND, SightKind.BEAST, SightKind.OPENING]
            .filter((k) => this.on(k, now).length < MOST_OF[k]).sort(() => Math.random() - 0.5);
        for (const k of kinds) {
            const sight = this.make(k, now);
            if (!sight) continue;
            const conn = await IBS.db.getConnection();
            try {
                const [result] = await conn.query<ResultSetHeader>("INSERT INTO world_sight (data, ends) VALUES ('{}', ?)", [sight.e]);
                sight.i = result.insertId;
            } finally {
                conn.release();
            }
            this.keep({ sight, bought: new Map(), met: new Set() });
            this.dirty.add(sight.i);
            this.changed = true;
            IBS.chat.event(this.saying(sight));
            Log.info(`Sight: ${KIND_NAMES[sight.k]}, ${sight.n} (${sight.i})`);
            return sight;
        }
        return null;
    }

    // said as it turns up
    private saying(s: Sight) {
        const where = s.p != null ? IBS.heroes.tasks.nameOf(s.p) : "";
        switch (s.k) {
            case SightKind.MERCHANT: return `${s.n}, a wandering merchant, has set up a stall in ${where} for an hour! Send a hero there to buy`;
            case SightKind.FIND: return `${FINDS[s.v].name} at ${where}! Heroes gathering there may find something rare (2 hours)`;
            case SightKind.BEAST: return `${beastName(s)} is roaming the land! Heroes on the road near it will have to fight it`;
            case SightKind.OPENING: return `${OPENINGS[s.v].what}: ${s.n}, for a day! Explore it for twice the finds`;
        }
        return s.n;
    }

    private make(k: SightKind, now: number): Sight {
        const tasks = IBS.heroes.tasks, places = Array.from(tasks.places.values()), graph = tasks.graph;
        const pick = <T>(list: T[]) => list.length ? list[Math.floor(Math.random() * list.length)] : null;
        const onRoads = (p: WorldPlace) => graph.get(p.i)?.e.length > 0 && !this.isOpening(p.i);
        const taken = new Set(this.on(k, now).map((s) => s.p));
        switch (k) {
            case SightKind.MERCHANT: {
                const town = pick(places.filter((p) => isTown(p) && onRoads(p) && !taken.has(p.i)));
                if (!town) return null;
                const pool = rareMaterials(LOT_LEVEL).sort(() => Math.random() - 0.5).slice(0, LOTS);
                const l: Lot[] = pool.map((m) => [m.id, lotPrice(m.level, Math.random()), LOT_MOST[0] + Math.floor(Math.random() * (LOT_MOST[1] - LOT_MOST[0] + 1))]);
                const n = pick(MERCHANTS.filter((name) => !this.on(k, now).some((s) => s.n == name)));
                if (!n) return null;
                return { i: 0, k, v: 0, n, s: now, e: now + MERCHANT_MS, p: town.i, l };
            }
            case SightKind.FIND: {
                const v = Math.floor(Math.random() * FINDS.length);
                const place = pick(places.filter((p) => findFits(v, kindOf(p)) && onRoads(p) && !taken.has(p.i)));
                if (!place) return null;
                return { i: 0, k, v, n: FINDS[v].name, s: now, e: now + FIND_MS, p: place.i };
            }
            case SightKind.BEAST: {
                const v = Math.floor(Math.random() * BEASTS.length), def = BEASTS[v];
                const n = pick(def.names.filter((name) => !this.on(k, now).some((s) => s.n == name)));
                if (!n) return null;
                const sight: Sight = { i: 0, k, v, n, s: now, e: now + BEAST_MS };
                if (def.flies) {
                    // across the map from one side to the other, a little way off its edges
                    const { w, h } = tasks.mapPx, left = Math.random() < 0.5, y = () => Math.round(h * (0.15 + 0.7 * Math.random()));
                    sight.a = left ? [-40, y(), w + 40, y()] : [w + 40, y(), -40, y()];
                    return w ? sight : null;
                }
                // along the roads from a town to a place 40-100 miles off (and back)
                for (let tries = 0; tries < 20; tries++) {
                    const from = pick(places.filter((p) => isTown(p) && onRoads(p)));
                    if (!from) return null;
                    const dist = distancesFrom(graph, from.i);
                    const to = pick(places.filter((p) => p.i != from.i && (dist.get(p.i) ?? 0) >= 40 * 16 && dist.get(p.i) <= 100 * 16));
                    const way = to && findPath(graph, from.i, to.i);
                    if (!way || way.some((id) => graph.get(id)?.te == SEA_TERRAIN)) continue;
                    sight.r = [from.i, ...way];
                    return sight;
                }
                return null;
            }
            case SightKind.OPENING: {
                // at a bend in the road on land, not a place
                const tile = tasks.tile, v = Math.floor(Math.random() * OPENINGS.length), def = OPENINGS[v];
                const node = pick(Array.from(graph.values()).filter((n) => !tasks.places.has(n.i) && n.e.length > 0 && n.te != SEA_TERRAIN));
                const n = pick(def.names.filter((name) => !this.all().some((s) => s.n == name)));
                if (!node || !n || !tile) return null;
                const kind = PLACE_KINDS.indexOf(def.kind as any);
                const o: WorldPlace = { i: node.i, k: kind, s: kind, x: Math.round(node.x / tile - 0.5), y: Math.round(node.y / tile - 0.5), n };
                return { i: 0, k, v, n, s: now, e: now + OPENING_MS, p: node.i, o };
            }
        }
        return null;
    }

    // its time's up: gone (an opening's place with it; heroes on their way there give it up, HeroTasks)
    private end(id: number) {
        const k = this.kept.get(id);
        if (!k) return;
        this.kept.delete(id);
        this.dirty.delete(id);
        this.gone.push(id);
        this.changed = true;
        const s = k.sight;
        if (s.o && IBS.heroes.tasks.places.get(s.o.i) == s.o) {
            IBS.heroes.tasks.places.delete(s.o.i);
            IBS.chat.event(`${s.n} has closed again`);
        }
        if (s.k == SightKind.MERCHANT) IBS.chat.event(`${s.n} has packed up and left ${IBS.heroes.tasks.nameOf(s.p)}`);
        if (s.k == SightKind.BEAST) IBS.chat.event(`${beastName(s)} has gone back to its lair`);
    }

    //#endregion

    //#region heroes and players

    // A rare find where a hero just gathered one: a FIND_CHANCE (more by
    // their traits: Strong Back, Treasure Hunter) of one of its materials
    // too, into the inventory and their journal
    public gathered(player: Player, hero: Hero, place: number) {
        for (const s of this.on(SightKind.FIND)) {
            if (s.p != place || Math.random() >= FIND_CHANCE * traitMul(hero.d, "find")) continue;
            const pool = findPool(s);
            if (!pool.length) continue;
            const m = pool[Math.floor(Math.random() * pool.length)];
            player.inventory.adjustItem(m.id, 1);
            player.stashChanged = true;
            IBS.heroes.note(player, hero, JournalKind.DONE, `Found ${m.name} by ${s.n.toLowerCase()} at ${IBS.heroes.tasks.nameOf(place)}!`);
        }
    }

    // the opening a place is (none: null)
    public openingAt(place: number) {
        return this.on(SightKind.OPENING).find((s) => s.p == place) ?? null;
    }

    // a beast within BEAST_REACH of a node at `when` that a hero hasn't met
    // yet (none: null), marked met
    public meet(hero: Hero, node: number, when: number) {
        const at = IBS.heroes.tasks.graph.get(node);
        if (!at) return null;
        for (const k of this.kept.values()) {
            const s = k.sight, there = beastAt(s, IBS.heroes.tasks.graph, when);
            if (!there || k.met.has(hero.id) || Math.hypot(there.x - at.x, there.y - at.y) > BEAST_REACH) continue;
            k.met.add(hero.id);
            this.dirty.add(s.i);
            return s;
        }
        return null;
    }

    // (met with another: a formed party's all met it, and won't again)
    public met(s: Sight, hero: Hero) {
        const k = this.kept.get(s.i);
        if (!k || k.met.has(hero.id)) return;
        k.met.add(hero.id);
        this.dirty.add(s.i);
    }

    // buying from a wandering merchant: a hero of theirs standing in its town,
    // no more than the lot's most for them, gold enough
    public buy(player: Player, message: any) {
        const k = this.kept.get(Number(message.i)), s = k?.sight, lot = Number(message.k), n = Math.floor(Number(message.n));
        const refuse = (why: string) => player.send({ r: S2C.EVENT_REFUSED, w: why });
        if (!s || s.k != SightKind.MERCHANT || !isOn(s, Date.now())) return refuse("The merchant has gone");
        if (!Number.isInteger(lot) || !s.l?.[lot]) return refuse("That's not on the stall");
        const [item, price, most] = s.l[lot], bought = k.bought.get(player.id) ?? s.l.map(() => 0);
        if (!(n >= 1) || bought[lot] + n > most) return refuse(`You can buy ${most - bought[lot]} more of those`);
        if (!player.heroes.some((h) => h.s.p == s.p && !h.s.r.length))
            return refuse(`Send a hero to ${IBS.heroes.tasks.nameOf(s.p)} to buy from ${s.n}`);
        const cost = price * n;
        if (player.inventory.gold < cost) return refuse(`That's ${cost}g: you have ${player.inventory.gold}g`);
        player.inventory.adjustGold(-cost);
        player.inventory.adjustItem(item, n);
        player.stashChanged = true;
        bought[lot] += n;
        k.bought.set(player.id, bought);
        this.dirty.add(s.i);
        player.send({ r: S2C.EVENT_BOUGHT, w: `Bought ${itemName(item)}${n > 1 ? ` x${n}` : ""} for ${cost}g` });
        player.send({ r: S2C.EVENT_SIGHTS, l: this.views(player) });
        Log.info(`Bought from a merchant`, { playerId: player.id, item, n, cost });
    }

    //#endregion

    //#region time going by

    public update(deltaTime: number) {
        const now = Date.now();
        for (const k of Array.from(this.kept.values())) if (now >= k.sight.e) this.end(k.sight.i);
        if (now >= this.nextAt && IBS.heroes.tasks.places.size) {
            this.nextAt = now + SIGHT_GAP_LEAST_MS + Math.random() * (SIGHT_GAP_MOST_MS - SIGHT_GAP_LEAST_MS);
            this.start().catch(Log.catch("Couldn't start a sight"));
        }
        if ((this.sendTime += deltaTime) >= SightManager.SEND_MS) {
            this.sendTime = 0;
            if (this.changed) {
                this.changed = false;
                for (const p of IBS.players.online()) p.send({ r: S2C.EVENT_SIGHTS, l: this.views(p) });
            }
        }
        if ((this.saveTime += deltaTime) >= SightManager.SAVE_MS) {
            this.saveTime = 0;
            this.save().catch(Log.catch("Couldn't save the sights"));
        }
    }

    // (also as the server stops)
    public async save() {
        if (!this.dirty.size && !this.gone.length) return;
        const ids = Array.from(this.dirty), gone = this.gone.splice(0);
        this.dirty.clear();
        const conn = await IBS.db.getConnection();
        try {
            for (const id of ids) {
                const k = this.kept.get(id);
                if (!k) continue;
                const data = JSON.stringify({ s: k.sight, b: Array.from(k.bought), m: Array.from(k.met) });
                await conn.query("UPDATE world_sight SET data = ?, ends = ? WHERE id = ?", [data, k.sight.e, id]);
            }
            if (gone.length) await conn.query("DELETE FROM world_sight WHERE id IN (?)", [gone]);
        } finally {
            conn.release();
        }
    }

    //#endregion

}
