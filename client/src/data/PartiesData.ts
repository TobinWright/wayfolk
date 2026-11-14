import { deepestAt, deepestLevel, heroPower } from "../../../shared/Locations";
import { Invites, MateIs, PARTY_MOST, partyKey, PartyAsk, PartyView } from "../../../shared/Parties";
import { HeroState, TaskKind } from "../../../shared/Tasks";
import { HeroRow } from "./HeroesData";

// a formed party as the server last sent it (shared/Parties.ts PartyView), `at`
// when its state came (on from there, as a hero's: HeroesData)
export interface PartyRow extends PartyView { at: number; }

// your formed parties, the asks to you, and who may ask your heroes in (S2C.PARTY_LIST, PARTY_STATE)
export class PartiesData {

    public list: PartyRow[] = [];
    public asks: PartyAsk[] = [];
    public invites = Invites.ANYONE;

    public setList(l: PartyView[], a: PartyAsk[], v: Invites) {
        this.list = (l ?? []).map((p) => ({ ...p, at: Date.now() }));
        this.asks = a ?? [];
        this.invites = v ?? Invites.ANYONE;
    }

    public setState(id: number, s: HeroState) {
        const p = this.get(id);
        if (!p) return null;
        p.s = s;
        p.at = Date.now();
        return p;
    }

    public get(id: number) {
        return this.list.find((p) => p.i == id) ?? null;
    }

    // the party one of your heroes is in (none: null)
    public of(heroId: number) {
        return this.list.find((p) => p.m.some((m) => m[0] == heroId && m[6])) ?? null;
    }

    // the party one of your heroes is in, if it's yours to set its list (none: null)
    public led(heroId: number) {
        const p = this.of(heroId);
        return p?.y ? p : null;
    }

    // how deep one of your heroes gets at a kind of place now: with their party, as deep as it does; else alone
    public deepest(kind: string, hero: HeroRow) {
        const p = this.of(hero.id);
        return p?.m.some((m) => m[0] == hero.id && m[5] == MateIs.WITH) ? deepestAt(kind, p.w) : deepestLevel(kind, [hero.d]);
    }

    // how deep what's put on their list would go: on their party's, if it's yours (give), as deep as it does; else alone
    public listDeepest(kind: string, hero: HeroRow) {
        const p = this.led(hero.id);
        return p ? deepestAt(kind, Math.max(p.w, heroPower(hero.d))) : deepestLevel(kind, [hero.d]);
    }

    // how deep gathering a material at a place would go on their list: as listDeepest; on
    // their own list, in with those of your heroes already at it there (HeroParties)
    public gatherDeepest(kind: string, hero: HeroRow, placeId: number, material: number, heroes: HeroRow[]) {
        // (by whether they're in one, not their s.g: a party's list is shown with its state, which has none)
        if (this.of(hero.id)) return this.listDeepest(kind, hero);
        const key = `${placeId}:${TaskKind.GATHER}:${material}`, at = heroes.filter((o) => o.id != hero.id && partyKey(o.s) == key);
        return deepestLevel(kind, [hero, ...at].slice(0, PARTY_MOST).map((o) => o.d));
    }

}
