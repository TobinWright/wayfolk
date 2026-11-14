import { ResultSetHeader, RowDataPacket } from "mysql2";
import { IBS } from "../../app";
import { S2C } from "../../constants/Routes";
import { Fight } from "../../../../shared/Fights";
import {
    BOARD, boardPeriod, EXT, EXTENDED, extLevel, fillSkills, gainExtXp, HeroData, heroSlots, heroPrice, barracksSlots, isExtended, learnExtended, OFFERS, periodEnd, rerollPrice, Skill, skillName, startTown, traitMul,
} from "../../../../shared/Heroes";
import { Journal, JournalKind, writeLine } from "../../../../shared/Journal";
import { placeName } from "../../../../shared/Places";
import { sceneOf } from "../../../../shared/Scenes";
import { Deed } from "../../../../shared/Seasons";
import { BACKDROP, owns, wearable } from "../../../../shared/Wardrobe";
import { HeroGenerator, LOOK_COUNTS } from "../../generators/HeroGenerator";
import {
    EXT_LEARN_MS, EXT_XP_SHARE, extFromWork, gainXp, itemName, newState, HeroState, recipeOf, Slot, SLOTS, slotsFor, SUPPLY_SLOTS, TaskKind, TWO_HANDED, unitXp,
} from "../../../../shared/Tasks";
import { InventoryRecord } from "../database/InventoryRecord";
import { Player } from "../player/Player";
import { HeroAway } from "./HeroAway";
import { HeroTasks } from "./HeroTasks";
import { Log } from "../../utils/Log";

// Heroes and the board they're hired from (DESIGN.md "Heroes"). A hero is a
// row of `hero` (its HeroData as JSON). Each player has their own offers on
// the board (`hero_board`, a row per player and board: the offers of the
// 4 hours they were made in, a hired one null), made the first time they look
// in those 4 hours. The first hire is free. A hero's `state` is where they
// are and their to-do list (shared/Tasks.ts), carried out by HeroTasks.

// (f: their last fight, till it's sent; a: their party's they fought in beside
// them, till they're sent - a party's runs often end together; never saved;
// j: their journal, shared/Journal.ts - loaded with their player's, not a friend's)
export interface Hero { id: number; d: HeroData; s: HeroState; f?: Fight; a?: Fight[]; j?: Journal; }
export interface Offer { d: HeroData; p: number; }    // a hero on a board and their price

export class HeroManager {

    public tasks = new HeroTasks();
    public away = new HeroAway();

    public async init() {
        const conn = await IBS.db.getConnection();
        await conn.query(`CREATE TABLE IF NOT EXISTS hero (
            id INT AUTO_INCREMENT PRIMARY KEY,
            player_id INT NOT NULL,
            created_at DATETIME NOT NULL,
            data TEXT NOT NULL,
            INDEX (player_id))`);
        try {
            await conn.query("ALTER TABLE hero ADD COLUMN state TEXT NULL");
        } catch (e) {
            if ((e as any).errno != 1060) throw e;     // (already there)
        }
        try {
            await conn.query("ALTER TABLE hero ADD COLUMN journal MEDIUMTEXT NULL");
        } catch (e) {
            if ((e as any).errno != 1060) throw e;
        }
        try {
            // (1: in the barracks, off the roster: swap)
            await conn.query("ALTER TABLE hero ADD COLUMN benched TINYINT NOT NULL DEFAULT 0");
        } catch (e) {
            if ((e as any).errno != 1060) throw e;
        }
        await conn.query(`CREATE TABLE IF NOT EXISTS hero_board (
            player_id INT NOT NULL,
            board VARCHAR(32) NOT NULL,
            period INT NOT NULL,
            offers TEXT NOT NULL,
            PRIMARY KEY (player_id, board))`);
        try {
            // (how many times they've been refreshed for gold in these 4 hours)
            await conn.query("ALTER TABLE hero_board ADD COLUMN rerolls INT NOT NULL DEFAULT 0");
        } catch (e) {
            if ((e as any).errno != 1060) throw e;
        }
        conn.release();
        await this.away.init();
        this.tasks.init();
        await this.tasks.formed.init();
    }

    // a player's heroes on the roster (as their friends and profile see them)
    public async load(playerId: number): Promise<Hero[]> {
        return (await this.loadAll(playerId)).heroes;
    }

    // a player's heroes, on the roster and in the barracks (with their
    // journals: the player's own, loading them to work)
    public async loadAll(playerId: number, journals = false): Promise<{ heroes: Hero[]; barracks: Hero[] }> {
        const conn = await IBS.db.getConnection();
        const [rows] = await conn.query<RowDataPacket[]>(`SELECT id, created_at, data, state, benched${journals ? ", journal" : ""} FROM hero WHERE player_id = ? ORDER BY id`, [playerId]);
        conn.release();
        const heroes: Hero[] = [], barracks: Hero[] = [];
        for (const r of rows) {
            const d: HeroData = fillSkills(JSON.parse(r.data));
            const hero: Hero = { id: r.id, d, s: r.state ? JSON.parse(r.state) : newState(this.tasks.startAt(d)) };
            if (journals) hero.j = r.journal ? JSON.parse(r.journal) : this.newJournal(hero, new Date(r.created_at).getTime());
            (r.benched ? barracks : heroes).push(hero);
        }
        return { heroes, barracks };
    }

    // one of theirs, on the roster or in the barracks
    public own(player: Player, heroId: number) {
        return player.heroes.find((h) => h.id == heroId) ?? player.barracks.find((h) => h.id == heroId);
    }

    // a journal begun: their joining you (one from before journals: when they did),
    // and where they are now and their town already seen
    private newJournal(hero: Hero, at: number): Journal {
        const j: Journal = { e: [], w: [] };
        writeLine(j, JournalKind.JOINED, `Joined your company in ${startTown(hero.d)}`, at || Date.now());
        for (const p of [hero.s.p, this.tasks.startAt(hero.d)]) if (!j.w.includes(p)) j.w.push(p);
        return j;
    }

    //#region the journal (shared/Journal.ts)

    // a line in a hero's journal, sent if their player's here to see it
    public note(player: Player, hero: Hero, kind: JournalKind, text: string) {
        if (!hero.j || !text) return;
        const e = writeLine(hero.j, kind, text, Date.now());
        player.journalsDirty.add(hero);
        if (player.online) player.send({ r: S2C.HERO_JOURNAL_LINE, h: hero.id, e });
    }

    // XP into a skill, core or extended (EXT + its place; one they don't know
    // gets none): a level gone up, in their journal
    // (their guild's perk on top: shared/Guilds.ts guildXpMul; a level gone up, a deed: shared/Seasons.ts)
    public learn(player: Player, hero: Hero, skill: number, xp: number) {
        xp = Math.round(xp * IBS.guilds.xpMul(player.id));
        const up = isExtended(skill) ? gainExtXp(hero.d, skill - EXT, xp) : gainXp(hero.d, skill, xp);
        if (up) {
            this.note(player, hero, JournalKind.LEVEL, `Reached ${skillName(skill)} ${up}`);
            IBS.seasons.did(player, Deed.LEVEL);
        }
    }

    // a unit of work done at core skills (`work`, as taskXp; `kind`, the
    // task's, for a dungeon run's or an adventure's own): the related extended
    // skills they know get a share of its XP (times `scale`, as the core skills
    // had), and now and then they pick up one they don't (shared/Tasks.ts extFromWork)
    public learnAround(player: Player, hero: Hero, work: [Skill, number][], kind: TaskKind, scale: number) {
        const unknown: number[] = [];
        for (const [e, ms] of extFromWork(work, kind)) {
            if (extLevel(hero.d, e)) this.learn(player, hero, EXT + e, Math.round(unitXp(hero.d, EXT + e, ms) * EXT_XP_SHARE * scale));
            else unknown.push(e);
        }
        const all = work.reduce((n, [, ms]) => n + ms, 0);
        if (!unknown.length || Math.random() >= all / EXT_LEARN_MS * traitMul(hero.d, "learn")) return;
        const e = unknown[Math.floor(Math.random() * unknown.length)];
        if (learnExtended(hero.d, e)) this.note(player, hero, JournalKind.LEVEL, `Picked up ${EXTENDED[e]}`);
    }

    // come to a place: the first time, in their journal (bends in the road aren't places)
    public arrived(player: Player, hero: Hero, placeId: number) {
        const place = this.tasks.places.get(placeId);
        if (!place || !hero.j || hero.j.w.includes(placeId)) return;
        hero.j.w.push(placeId);
        this.note(player, hero, JournalKind.PLACE, `Set foot in ${placeName(place)} for the first time`);
    }

    public sendJournal(player: Player, heroId: number) {
        const hero = player.heroes.find((h) => h.id == heroId);
        if (hero?.j) player.send({ r: S2C.HERO_JOURNAL, h: hero.id, j: hero.j.e });
    }

    //#endregion

    // a hero as sent: [id, data, state]
    public row(hero: Hero) {
        return [hero.id, hero.d, hero.s];
    }

    // the player's offers now, made if they're from an older 4 hours (or
    // `fresh`: refreshed for gold), and how many times they've been refreshed in these
    private async offers(player: Player, fresh = false): Promise<{ offers: Offer[]; rerolls: number }> {
        const board = BOARD;
        const period = boardPeriod(Date.now());
        const conn = await IBS.db.getConnection();
        const [rows] = await conn.query<RowDataPacket[]>("SELECT period, offers, rerolls FROM hero_board WHERE player_id = ? AND board = ?", [player.id, board.id]);
        let offers: Offer[];
        const now = rows.length && rows[0].period == period;
        let rerolls = now ? rows[0].rerolls : 0;
        if (now && !fresh) {
            offers = JSON.parse(rows[0].offers);
            for (const o of offers) {
                if (!o) continue;                               // (a hired one: null)
                // (one rolled with extended skills, before they were only learned: without them, priced again)
                const old = !o.d.p || o.d.e?.length;
                fillSkills(o.d);
                if (old) { o.d.e = []; o.p = heroPrice(o.d, board.level); }
            }
        } else {
            offers = Array.from({ length: OFFERS }, () => {
                const d = HeroGenerator.make(board);
                return { d, p: heroPrice(d, board.level) };
            });
            if (fresh) rerolls++;
            await conn.query("REPLACE INTO hero_board (player_id, board, period, offers, rerolls) VALUES (?, ?, ?, ?, ?)",
                [player.id, board.id, period, JSON.stringify(offers), rerolls]);
        }
        conn.release();
        return { offers, rerolls };
    }

    private isFree(player: Player) {
        return player.heroes.length == 0 && player.barracks.length == 0;
    }

    public async sendBoard(player: Player, board?: { offers: Offer[]; rerolls: number }, gold?: number) {
        const { offers, rerolls } = board ?? await this.offers(player);
        player.send({
            r: S2C.HERO_BOARD, e: periodEnd(boardPeriod(Date.now())) - Date.now(),
            o: offers, f: this.isFree(player) ? 1 : 0, c: rerollPrice(rerolls), g: gold,
        });
    }

    // new offers now, for gold (rerollPrice: more with each in the same 4 hours)
    public async reroll(player: Player) {
        if (player.hiring) return;
        player.hiring = true;
        try {
            const price = rerollPrice((await this.offers(player)).rerolls);
            if (player.inventory.gold < price) {
                player.send({ r: S2C.HERO_REFUSED, w: "Not enough gold" });
                return;
            }
            const board = await this.offers(player, true);
            player.inventory.adjustGold(-price);
            await InventoryRecord.UpdateGold(player.id, player.inventory.gold);
            Log.info(`Hiring board refreshed by ${player.record.displayName} for ${price}g`);
            await this.sendBoard(player, board, player.inventory.gold);
        } finally {
            player.hiring = false;
        }
    }

    public async hire(player: Player, index: number) {
        if (!Number.isInteger(index) || index < 0 || index >= OFFERS) return;
        if (player.hiring) return;
        player.hiring = true;
        try {
            const { offers } = await this.offers(player);
            const offer = offers[index];
            const price = this.isFree(player) ? 0 : offer?.p;
            // (the roster full: into the barracks, if there's room)
            const premium = player.record.isPremium(), benched = player.heroes.length >= heroSlots(premium);
            let why = "";
            if (!offer) why = "They've already been hired";
            else if (benched && player.barracks.length >= barracksSlots(premium)) why = "Your roster and barracks are full";
            else if (player.inventory.gold < price) why = "Not enough gold";
            if (why) {
                player.send({ r: S2C.HERO_REFUSED, w: why });
                return;
            }

            const state = newState(this.tasks.startAt(offer.d));
            const journal = this.newJournal({ id: 0, d: offer.d, s: state }, Date.now());
            const conn = await IBS.db.getConnection();
            const [result] = await conn.query<ResultSetHeader>("INSERT INTO hero (player_id, created_at, data, state, journal, benched) VALUES (?, ?, ?, ?, ?, ?)",
                [player.id, new Date(), JSON.stringify(offer.d), JSON.stringify(state), JSON.stringify(journal), benched ? 1 : 0]);
            offers[index] = null;
            await conn.query("UPDATE hero_board SET offers = ? WHERE player_id = ? AND board = ?", [JSON.stringify(offers), player.id, BOARD.id]);
            conn.release();
            if (price > 0) {
                player.inventory.adjustGold(-price);
                await InventoryRecord.UpdateGold(player.id, player.inventory.gold);
            }

            const hero: Hero = { id: result.insertId, d: offer.d, s: state, j: journal };
            if (benched) player.barracks.push(hero);
            else {
                player.heroes.push(hero);
                IBS.friends.heroSeen(player, hero);
            }
            Log.info(`Hired: ${offer.d.n} (${hero.id}) by ${player.record.displayName} for ${price}g${benched ? ", into the barracks" : ""}`);
            player.send({ r: S2C.HERO_HIRED, h: this.row(hero), g: player.inventory.gold, ...(benched && { b: 1 }) });
            IBS.guide.check(player);
            await this.sendBoard(player);
        } finally {
            player.hiring = false;
        }
    }

    // a hero let go (the user, 2026-11-02; the Heroes window's Dismiss): out of
    // the roster at once (their party forms again without them: HeroParties.regroup),
    // their row deleted, then what they wear and carry back in the stash. Never
    // the last: the first hire is free while you have none (isFree)
    // (one in the barracks too; never the last on the roster either)
    public async dismiss(player: Player, heroId: number) {
        const hero = this.own(player, heroId);
        const list = player.heroes.includes(hero) ? player.heroes : player.barracks;
        if (!hero || (list == player.heroes && player.heroes.length <= 1)) return;
        list.splice(list.indexOf(hero), 1);
        player.heroesDirty.delete(hero);
        player.journalsDirty.delete(hero);
        const conn = await IBS.db.getConnection();
        try {
            await conn.query("DELETE FROM hero WHERE id = ? AND player_id = ?", [hero.id, player.id]);
        } catch (e) {
            // (still theirs: back where they were, nothing given back)
            list.push(hero);
            list.sort((a, b) => a.id - b.id);
            throw e;
        } finally {
            conn.release();
        }

        // (the Potion and Food slots hold a kind: nothing of it left the stash)
        const g = hero.d.g ?? [];
        for (let s = 0; s < g.length; s++) if (g[s] && !SUPPLY_SLOTS.includes(s)) player.inventory.adjustItem(g[s], 1);
        player.stashDirty = true;
        this.tasks.sendStash(player, true);
        Log.info(`Dismissed: ${hero.d.n} (${hero.id}) by ${player.record.displayName}`);
        await this.tasks.formed.dismissed(hero);
        player.send({ r: S2C.HERO_DISMISSED, h: hero.id });
    }

    // heroes into and out of the barracks (shared/Heroes.ts barracksSlots):
    // `outId` off the roster into it, `inId` out of it onto the roster, either
    // or both (a swap, one for one: always room, even over the slots after a
    // Supporter's lapsed). Never the last off the roster. One going in stops
    // where they are (a moment waiting on you answered for you, out of their
    // formed party), their list kept; one coming out picks up from there,
    // healed as if resting meanwhile (HeroTasks.benched, calledUp)
    public async swap(player: Player, outId: any, inId: any) {
        const out = outId ? player.heroes.find((h) => h.id == outId) : null;
        const into = inId ? player.barracks.find((h) => h.id == inId) : null;
        if ((outId && !out) || (inId && !into) || (!out && !into) || player.hiring) return;
        const premium = player.record.isPremium();
        let why = "";
        if (out && !into && player.heroes.length <= 1) why = "Keep at least one hero on the roster";
        else if (out && !into && player.barracks.length >= barracksSlots(premium)) why = "The barracks is full";
        else if (into && !out && player.heroes.length >= heroSlots(premium)) why = "Your roster is full";
        if (why) {
            player.send({ r: S2C.HERO_REFUSED, w: why });
            return;
        }

        player.hiring = true;      // (one change to the roster at a time)
        try {
            if (out) {
                await this.tasks.benched(player, out);
                player.heroes.splice(player.heroes.indexOf(out), 1);
                player.barracks.push(out);
                player.barracks.sort((a, b) => a.id - b.id);
            }
            if (into) {
                this.tasks.calledUp(into);
                player.barracks.splice(player.barracks.indexOf(into), 1);
                player.heroes.push(into);
                player.heroes.sort((a, b) => a.id - b.id);
            }
            const conn = await IBS.db.getConnection();
            try {
                if (out) await conn.query("UPDATE hero SET benched = 1, state = ? WHERE id = ? AND player_id = ?", [JSON.stringify(out.s), out.id, player.id]);
                if (into) await conn.query("UPDATE hero SET benched = 0, state = ? WHERE id = ? AND player_id = ?", [JSON.stringify(into.s), into.id, player.id]);
            } finally {
                conn.release();
            }
            if (into) IBS.friends.heroSeen(player, into);
            Log.info(`Barracks: ${out ? `${out.d.n} (${out.id}) in` : ""}${out && into ? ", " : ""}${into ? `${into.d.n} (${into.id}) out` : ""} by ${player.record.displayName}`);
            player.send({ r: S2C.HERO_SWAPPED, ...(out && { o: this.row(out) }), ...(into && { i: this.row(into) }) });
            IBS.guide.check(player);
        } finally {
            player.hiring = false;
        }
    }

    // one of the stash's things on a hero, in a slot it goes in (id 0: what's
    // there taken off); what it replaces goes back to the stash, and a two-handed
    // weapon and a shield take each other off (DESIGN.md "Equipment")
    // (one in the barracks too, for their gear to go to the others on the roster)
    public equip(player: Player, heroId: number, slot: number, id: number) {
        const hero = this.own(player, heroId);
        if (!hero || !Number.isInteger(slot) || slot < 0 || slot >= SLOTS || !Number.isInteger(id)) return;
        const inv = player.inventory, g = hero.d.g ?? (hero.d.g = []);
        // (the Potion and Food slots hold a kind: nothing leaves the stash till it's used)
        const supply = SUPPLY_SLOTS.includes(slot);
        const takeOff = (s: Slot) => { if (g[s]) { if (!SUPPLY_SLOTS.includes(s)) inv.adjustItem(g[s], 1); if (!id) this.note(player, hero, JournalKind.GEAR, `Took off ${itemName(g[s])}`); g[s] = 0; } };
        if (id) {
            const type = recipeOf(id)?.type;
            if (!type || !slotsFor(type).includes(slot) || (inv.items.get(id)?.amount ?? 0) < 1) return;
            if (!supply) inv.adjustItem(id, -1);
            takeOff(slot);
            if (slot == Slot.WEAPON && TWO_HANDED.includes(type)) takeOff(Slot.SHIELD);
            if (slot == Slot.SHIELD && TWO_HANDED.includes(recipeOf(g[Slot.WEAPON])?.type)) takeOff(Slot.WEAPON);
            g[slot] = id;
            this.note(player, hero, JournalKind.GEAR, `Put on ${itemName(id)}`);
        } else takeOff(slot);
        while (g.length && !g[g.length - 1]) g.pop();
        for (let s = 0; s < g.length; s++) g[s] = g[s] || 0;
        player.heroesDirty.add(hero);
        player.stashDirty = true;
        this.tasks.sendStash(player, true);
        player.send({ r: S2C.HERO_GEAR, h: hero.id, g });
        IBS.guide.check(player);
    }

    // a hero's cosmetics (shared/Wardrobe): a part they can't have left as it was
    // (their party's windows, anyone's, are told with the party: HeroParties.send)
    public setLooks(player: Player, heroId: number, looks: any) {
        const hero = this.own(player, heroId);
        if (!hero) return;
        const l = wearable(looks, hero.d.l, LOOK_COUNTS, IBS.cosmetics.catalog, IBS.cosmetics.access(player));
        if (l.join() == hero.d.l.join()) return;
        hero.d.l = l;
        player.heroesDirty.add(hero);
        player.send({ r: S2C.HERO_LOOKS, h: hero.id, l });
    }

    // what their status window shows behind them, and what they do in it (shared/Scenes);
    // a backdrop that isn't theirs to pick (the catalog's BACKDROP) left as it was
    public setScene(player: Player, heroId: number, sc: any) {
        const hero = this.own(player, heroId);
        if (!hero) return;
        const s = sceneOf(sc), was = sceneOf(hero.d.sc);
        if (s[0] != was[0] && !owns(IBS.cosmetics.catalog, BACKDROP, s[0], IBS.cosmetics.access(player))) s[0] = was[0];
        if (s.join() == was.join()) return;
        if (s[0] || s[1]) hero.d.sc = s; else delete hero.d.sc;
        player.heroesDirty.add(hero);
        player.send({ r: S2C.HERO_SCENE, h: hero.id, s });
    }

}
