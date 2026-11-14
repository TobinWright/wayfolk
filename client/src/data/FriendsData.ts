import { FriendInfo, FriendList, Whisper } from "../../../shared/Friends";
import { HeroRow } from "./HeroesData";

// Friends (shared/Friends.ts): the list as the server last sent it, the
// whispers (yours and theirs, oldest first; notes made here too, such as an
// ask come in), your favourites' heroes (moved along their legs as yours
// are), and the friend last found on the map (their heroes, once).
export interface FriendHero { owner: number; row: HeroRow; }

export class FriendsData {

    public static MOST = 200;               // whispers kept

    public list: FriendList = { f: [], i: [], o: [], b: [] };
    public whispers: (Whisper & { s?: number })[] = [];     // (s: a note, not a whisper)
    public to = -1;                         // the friend whispers go to (-1: none picked)
    private heroes = new Map<number, HeroRow[]>();          // (a favourite's player id: their heroes)
    private found: { owner: number, rows: HeroRow[] } = null;

    public load(list: FriendList, whispers: Whisper[], heroes: { o: number, h: any[] }[]) {
        this.list = list ?? this.list;
        this.whispers = (whispers ?? []).slice(-FriendsData.MOST);
        this.heroes.clear();
        for (const f of heroes ?? []) this.setHeroes(f.o, f.h);
        const last = this.whispers[this.whispers.length - 1];
        this.to = last && this.friend(last.w) ? last.w : -1;
        for (const s of this.list.i) this.note(s.i, s.n, "asks to be your friend (Friends, in the menu)");
    }

    // the list again; the asks come in since, as notes
    public setList(list: FriendList) {
        const had = new Set(this.list.i.map((s) => s.i));
        this.list = list;
        for (const s of list.i) if (!had.has(s.i)) this.note(s.i, s.n, "asks to be your friend (Friends, in the menu)");
        if (!this.friend(this.to)) this.to = -1;
        for (const id of Array.from(this.heroes.keys())) if (!this.friend(id)?.f) this.heroes.delete(id);
        if (this.found && !this.friend(this.found.owner)) this.found = null;
        // (a favourite's heroes come just before the list saying they're one)
        if (this.found && this.friend(this.found.owner)?.f) { this.heroes.set(this.found.owner, this.found.rows); this.found = null; }
    }

    public setPresence(info: FriendInfo) {
        const i = this.list.f.findIndex((f) => f.i == info.i);
        if (i >= 0) this.list.f[i] = info;
    }

    public friend(id: number) {
        return this.list.f.find((f) => f.i == id);
    }

    public favourites() {
        return this.list.f.filter((f) => f.f).length;
    }

    // (by their id, if it's known: they may have changed their name)
    public isBlocked(name: string, id?: number) {
        return this.list.b.some((b) => id ? b.i == id : b.n == name);
    }

    //#region whispers

    public add(w: Whisper & { s?: number }) {
        this.whispers.push(w);
        if (this.whispers.length > FriendsData.MOST) this.whispers.shift();
        if (!w.m && !w.s && this.to < 0) this.to = w.w;
    }

    private note(id: number, name: string, text: string) {
        this.add({ i: 0, w: id, n: name, m: 0, t: text, a: Date.now(), u: 1, s: 1 });
    }

    public unseen() {
        return this.whispers.some((w) => w.u);
    }

    public seeAll() {
        for (const w of this.whispers) delete w.u;
    }

    //#endregion

    //#region their heroes

    private toRows(rows: any[]): HeroRow[] {
        return (rows ?? []).map((r) => ({ id: r[0], d: r[1], s: r[2], at: Date.now() }));
    }

    // all a friend's heroes: a favourite's kept up, anyone else's for now (found)
    public setHeroes(owner: number, rows: any[]) {
        if (this.friend(owner)?.f) this.heroes.set(owner, this.toRows(rows));
        else this.found = { owner, rows: this.toRows(rows) };
    }

    public setHero(owner: number, row: any) {
        const theirs = this.heroes.get(owner);
        if (!theirs) return;
        const [hero] = this.toRows([row]), i = theirs.findIndex((h) => h.id == hero.id);
        if (i >= 0) theirs[i] = hero;
        else theirs.push(hero);
    }

    public gone(owner: number) {
        this.heroes.delete(owner);
        if (this.found?.owner == owner) this.found = null;
    }

    public heroesOf(owner: number) {
        return this.heroes.get(owner) ?? (this.found?.owner == owner ? this.found.rows : []);
    }

    // every friend's hero to draw on the map
    public all(): FriendHero[] {
        const all: FriendHero[] = [];
        this.heroes.forEach((rows, owner) => rows.forEach((row) => all.push({ owner, row })));
        if (this.found && !this.heroes.has(this.found.owner)) this.found.rows.forEach((row) => all.push({ owner: this.found.owner, row }));
        return all;
    }

    //#endregion

}
