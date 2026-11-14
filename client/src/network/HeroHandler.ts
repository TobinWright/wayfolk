import { AwaySummary } from "../components/awaysummary/AwaySummary";
import { ComponentType } from "../components/BaseComponent";
import { HeroChoice } from "../components/herochoice/HeroChoice";
import { HeroStatus } from "../components/herostatus/HeroStatus";
import { HeroWindow } from "../components/herowindow/HeroWindow";
import { Event } from "../constants/Events";
import { C2S, S2C } from "../constants/Routes";
import { IBC } from "../Engine";
import { Looks } from "../people/LookArt";
import { Slot, Task } from "../../../shared/Tasks";
import { JOURNAL_MOST, JournalEntry } from "../../../shared/Journal";
import { BaseHandler } from "./BaseHandler";
import { HeroRow } from "../data/HeroesData";
import { fought } from "../components/map/Wander";
import { Map as WorldMap } from "../components/map/Map";

export class HeroHandler extends BaseHandler {

    //#region === Outgoing ===

    // the hiring board: its offers come back as HERO_BOARD
    public board() {
        this.send({ r: C2S.HERO_BOARD });
    }

    // new offers now, for gold (HERO_BOARD back)
    public reroll() {
        if (this.hasTransaction(C2S.HERO_REROLL)) return;
        this.addTransaction(C2S.HERO_REROLL);
        this.send({ r: C2S.HERO_REROLL });
    }

    public hire(index: number) {
        if (this.hasTransaction(C2S.HERO_HIRE)) return;
        this.addTransaction(C2S.HERO_HIRE);
        this.send({ r: C2S.HERO_HIRE, i: index });
    }

    // a hero's to-do list and backup task (shared/Tasks.ts; null: none); a
    // task added, the map follows them (the user, 2026-11-03)
    public todo(heroId: number, q: Task[], b: Task) {
        const hero = IBC.data.heroes.get(heroId);
        if (hero && q.length > hero.s.q.length) (IBC.comp.getFirstByType(ComponentType.MAP) as WorldMap)?.follow(heroId);
        this.send({ r: C2S.HERO_TODO, h: heroId, q, b: b ?? null });
    }

    // tasks on the end of a hero's list - in a formed party of yours, on the
    // end of the party's (they're doing its: shared/Parties.ts); in someone
    // else's, their own, waiting till they're out of it
    public give(heroId: number, tasks: Task[]) {
        const party = IBC.data.parties.led(heroId), hero = IBC.data.heroes.get(heroId);
        if (party) return IBC.net.party.todo(party.i, [...party.s.q, ...tasks], party.s.b);
        if (hero) this.todo(heroId, [...hero.s.q, ...tasks], hero.s.b);
    }

    // one of the stash's things on a hero, in a slot (0: what's there taken off): HERO_GEAR back
    public equip(heroId: number, slot: Slot, id: number) {
        this.send({ r: C2S.HERO_EQUIP, h: heroId, s: slot, i: id });
    }

    // a hero let go, their gear back in the stash: HERO_DISMISSED back
    public dismiss(heroId: number) {
        this.send({ r: C2S.HERO_DISMISS, h: heroId });
    }

    // `outId` off the roster into the barracks, `inId` out of it onto the roster, either or both (0: none): HERO_SWAPPED or HERO_REFUSED back
    public swap(outId: number, inId: number) {
        if (this.hasTransaction(C2S.HERO_SWAP)) return;
        this.addTransaction(C2S.HERO_SWAP);
        this.send({ r: C2S.HERO_SWAP, o: outId, i: inId });
    }

    // a hero's cosmetics (shared/Wardrobe.ts): HERO_LOOKS back
    public looks(heroId: number, l: Looks) {
        this.send({ r: C2S.HERO_LOOKS, h: heroId, l });
    }

    // their status window's scene and pose (shared/Scenes.ts): HERO_SCENE back
    public scene(heroId: number, s: [number, number]) {
        this.send({ r: C2S.HERO_SCENE, h: heroId, s });
    }

    // their journal (shared/Journal.ts): HERO_JOURNAL back
    public journal(heroId: number) {
        this.send({ r: C2S.HERO_JOURNAL, h: heroId });
    }

    // the answer to a moment on the road (shared/Choices.ts; -1: let them pick): HERO_CHOSE back
    public choose(heroId: number, way: number) {
        this.send({ r: C2S.HERO_CHOICE, h: heroId, o: way });
    }

    // someone else's hero in a party with one of yours, for their status window: HERO_VIEW back
    public view(heroId: number) {
        this.send({ r: C2S.HERO_VIEW, h: heroId });
    }

    //#endregion

    //#region === Incoming ===

    public onMessage(message: any) {
        switch (message.r) {
            case S2C.HERO_BOARD:
                this.removeTransaction(C2S.HERO_REROLL);
                if (message.g != null) {
                    IBC.data.inventory.gold = message.g;
                    IBC.events.emit(Event.INVENTORY_GOLD_UPDATED);
                }
                IBC.events.emit(Event.HERO_BOARD, message);
                break;
            case S2C.HERO_HIRED: this.hired(message); break;
            case S2C.HERO_DISMISSED: this.dismissed(message.h); break;
            case S2C.HERO_SWAPPED: this.swapped(message); break;
            case S2C.HERO_AWAY: if (message.a) AwaySummary.open(message.a); break;
            case S2C.HERO_STATE: {
                const hero = IBC.data.heroes.setState(message.h, message.s);
                if (!hero) break;
                const up = IBC.data.heroes.setXp(hero, message.v);
                IBC.events.emit(Event.HERO_STATE, hero);
                for (const skill of up) IBC.events.emit(Event.HERO_LEVEL, { hero, skill });
                if (hero.s.c) HeroChoice.check();
                break;
            }
            // (comes before the state it left them in)
            case S2C.HERO_CHOSE: HeroChoice.chose(message.h, message.o, !!message.w, message.t); break;
            // (comes before the state it left them in)
            case S2C.HERO_FIGHT: {
                const hero = IBC.data.heroes.get(message.h);
                if (hero && message.f) { fought(message.f); IBC.events.emit(Event.HERO_FIGHT, { hero, fight: message.f }); }
                break;
            }
            // (who's with them now, anyone's heroes: shared/Parties.ts)
            case S2C.HERO_PARTY: {
                const hero = IBC.data.heroes.get(message.h);
                if (!hero || !Array.isArray(message.m)) break;
                hero.party = message.m;
                HeroWindow.regroup();
                IBC.events.emit(Event.HERO_PARTY, hero);
                break;
            }
            // (the featured parties on the map, anyone's: shared/Parties.ts)
            case S2C.HERO_FEATURED:
                if (Array.isArray(message.l)) IBC.data.heroes.setFeatured(message.l);
                break;
            // (what they wear changes their power, stats and speed: as a new state)
            case S2C.HERO_GEAR: {
                const hero = IBC.data.heroes.own(message.h);
                if (!hero) break;
                hero.d.g = message.g;
                IBC.events.emit(Event.HERO_STATE, hero);
                break;
            }
            // (in their party too, till the server sends the party again)
            case S2C.HERO_LOOKS: {
                const hero = IBC.data.heroes.own(message.h);
                if (!hero) break;
                hero.d.l = message.l;
                for (const m of hero.party ?? []) if (m[0] == hero.id) m[2] = message.l;
                HeroWindow.regroup();
                IBC.events.emit(Event.HERO_STATE, hero);
                break;
            }
            case S2C.HERO_SCENE: {
                const hero = IBC.data.heroes.own(message.h);
                if (!hero) break;
                if (message.s[0] || message.s[1]) hero.d.sc = message.s; else delete hero.d.sc;
                IBC.events.emit(Event.HERO_STATE, hero);
                break;
            }
            case S2C.HERO_JOURNAL: {
                const hero = IBC.data.heroes.get(message.h);
                if (!hero || !Array.isArray(message.j)) break;
                hero.journal = message.j;
                IBC.events.emit(Event.HERO_JOURNAL, hero);
                break;
            }
            // (one not asked for yet: left for when it is; the last one counted again: in its place)
            case S2C.HERO_JOURNAL_LINE: {
                const hero = IBC.data.heroes.get(message.h), j = hero?.journal, e: JournalEntry = message.e;
                if (!j || !e) break;
                const last = j[j.length - 1];
                if (last && last[1] == e[1] && last[2] == e[2] && (e[3] ?? 1) > 1) j[j.length - 1] = e;
                else j.push(e);
                if (j.length > JOURNAL_MOST) j.splice(0, j.length - JOURNAL_MOST);
                IBC.events.emit(Event.HERO_JOURNAL, hero);
                break;
            }
            // (someone else's, asked for from their window: their status)
            case S2C.HERO_VIEW:
                if (Array.isArray(message.h)) HeroStatus.open(IBC.data.heroes.setViewed(message.h).id);
                break;
            case S2C.HERO_LUCKY: {
                const hero = IBC.data.heroes.get(message.h);
                if (hero) IBC.events.emit(Event.HERO_LUCKY, { hero, m: message.m, n: message.n });
                break;
            }
            case S2C.HERO_STASH: {
                const gained = IBC.data.inventory.apply(message);
                IBC.events.emit(Event.INVENTORY_GOLD_UPDATED);
                if (gained.length && !message.q) IBC.events.emit(Event.INVENTORY_ITEM_ADDED, gained);
                IBC.events.emit(Event.HERO_STASH);
                break;
            }
            case S2C.HERO_REFUSED:
                this.removeTransaction(C2S.HERO_HIRE);
                this.removeTransaction(C2S.HERO_REROLL);
                this.removeTransaction(C2S.HERO_SWAP);
                IBC.events.emit(Event.HERO_REFUSED, message.w);
                break;
        }
    }

    // (the roster full: into the barracks, nothing on the map)
    private hired(message: any) {
        this.removeTransaction(C2S.HERO_HIRE);
        IBC.data.inventory.gold = message.g;
        IBC.events.emit(Event.INVENTORY_GOLD_UPDATED);
        if (message.b) {
            IBC.data.heroes.bench(message.h);
            IBC.events.emit(Event.HERO_BARRACKS);
            return;
        }
        const hero = IBC.data.heroes.add(message.h);
        HeroWindow.forHero(hero);
        IBC.events.emit(Event.HERO_HIRED, hero);
    }

    // gone: their window on the map, and the windows open on them (each closes on HERO_DISMISSED)
    private dismissed(heroId: number) {
        const hero = IBC.data.heroes.remove(heroId);
        if (!hero) return;
        for (const w of IBC.comp.getAllByType(ComponentType.HERO_WINDOW) as HeroWindow[]) if (w.own == hero.id) IBC.comp.destroy(w);
        HeroWindow.regroup();
        IBC.events.emit(Event.HERO_DISMISSED, hero);
        HeroChoice.check();
    }

    // into the barracks (gone from the map, their windows closed, as if let go) and out of it (on the map)
    private swapped(message: any) {
        this.removeTransaction(C2S.HERO_SWAP);
        const data = IBC.data.heroes;
        let out: HeroRow = null, into: HeroRow = null;
        if (message.o) {
            this.dismissed(message.o[0]);
            out = data.bench(message.o);
        }
        if (message.i) {
            data.remove(message.i[0]);
            into = data.add(message.i);
            data.heroes.sort((a, b) => a.id - b.id);
            HeroWindow.forHero(into);
            HeroWindow.regroup();
        }
        IBC.events.emit(Event.HERO_BARRACKS);
        IBC.events.emit(Event.HERO_SWAPPED, { out, into });
    }

    //#endregion

}
