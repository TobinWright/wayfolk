import { FEATURED_MOST, FEATURED_MS, FeaturedHero, partyKey } from "../../../../shared/Parties";
import { TaskKind } from "../../../../shared/Tasks";
import { S2C } from "../../constants/Routes";
import { Player } from "../player/Player";
import { Hero } from "./HeroManager";
import { HeroParties } from "./HeroParties";

interface Featured { members: Hero[]; until: number; }

// Featured parties (the user, 2026-11-01: "a featured parties, that shows
// 5-10 random parties on the map at a time"): up to FEATURED_MOST of the
// parties there are (shared/Parties.ts, two or more, anyone's, formed ones
// too), the fullest first (the user, 2026-11-03: "it should be prioritizing
// fullest parties"), at random among those as full, a fuller one taking the
// place of the least full once they're all taken; walking about at their
// work - not at an event's (they stand at its scene) nor resting. Each is
// featured a while (FEATURED_MS, give or take), or till it breaks up, then
// another is picked. Too few parties (the user,
// 2026-11-01: "let a single hero working alone be featured when there aren't
// enough real parties"): heroes alone at their work make up the rest, each
// giving way to a party as there's one. Whenever who's featured (or where,
// at what, how they look) changes, everyone signed in is told
// (S2C.HERO_FEATURED); one signing in is told as they do.

export class HeroFeatured {

    public static CHECK_MS = 2000;

    private time = HeroFeatured.CHECK_MS;
    private featured: Featured[] = [];
    private rows: FeaturedHero[][] = [];
    private key = "";
    private told = new Set<number>();       // (players told the parties as they are)

    constructor(private parties: HeroParties) { }

    public update(deltaTime: number, players: Player[]) {
        if ((this.time += deltaTime) >= HeroFeatured.CHECK_MS) {
            this.time = 0;
            this.pick(players);
            const rows = this.featured.map((f) => f.members.map((h): FeaturedHero => {
                const { v, ...d } = h.d;
                return [h.id, d, h.s, this.parties.ownerOf(h)?.record.displayName ?? ""];
            }));
            const key = JSON.stringify(rows.map((party) => party.map(([id, d, s]) => [id, d.l, s.p, s.r, s.w?.k, s.w?.m, !!s.c, !!s.o])));
            if (key != this.key) { this.rows = rows; this.key = key; this.told.clear(); }
        }
        for (const player of players) {
            if (!player.online || this.told.has(player.id)) continue;
            this.told.add(player.id);
            player.send({ r: S2C.HERO_FEATURED, l: this.rows });
        }
    }

    // those no longer together (or alone), or featured long enough, let go; the rest filled at random
    private pick(players: Player[]) {
        const now = Date.now();
        // (who's in each now, a formed party's changing as they come and go; two become one: the first kept)
        const taken = new Set<Hero>();
        this.featured = this.featured.filter((f) => {
            if (!f.members.length) return false;    // (their party's own list: everyone's gone from it)
            const members = this.parties.partyOf(f.members[0]);
            if (f.until <= now || !this.still(f.members, members) || !HeroFeatured.walking(f.members[0]) || members.some((h) => taken.has(h))) return false;
            f.members = members;
            for (const h of members) taken.add(h);
            return true;
        });
        const left = [...this.parties.groups(), ...this.parties.formedGroups()].filter((m) => !m.some((h) => taken.has(h)) && HeroFeatured.walking(m[0]));
        this.fill(left, now);
        if (this.featured.length < FEATURED_MOST) {
            const featured = new Set(this.featured.flatMap((f) => f.members));
            this.fill(players.flatMap((p) => p.heroes)
                .filter((h) => !featured.has(h) && this.parties.partyOf(h).length == 1 && HeroFeatured.walking(h))
                .map((h) => [h]), now);
        }
    }

    private fill(left: Hero[][], now: number) {
        while (left.length) {
            // (the fullest there are, one of them at random; all taken, in place of the least full, if it's fuller)
            const most = Math.max(...left.map((m) => m.length)), fullest = left.filter((m) => m.length == most);
            if (this.featured.length >= FEATURED_MOST) {
                const least = this.featured.reduce((a, b) => b.members.length < a.members.length ? b : a);
                if (least.members.length >= most) break;
                this.featured.splice(this.featured.indexOf(least), 1);
            }
            const members = fullest[Math.floor(Math.random() * fullest.length)];
            left.splice(left.indexOf(members), 1);
            // (half as long to twice: they don't all change at once)
            this.featured.push({ members, until: now + FEATURED_MS * (0.5 + Math.random() * 1.5) });
        }
    }

    // a party still together, or one alone still loaded and alone
    private still(was: Hero[], now: Hero[]) {
        return !!this.parties.ownerOf(was[0]) && (was.length > 1 ? now.length > 1 : now.length == 1);
    }

    // walking about at their place at their work (as a party all do the same; in a formed one, as any)
    private static walking(hero: Hero) {
        const k = hero.s.w?.k;
        return partyKey({ ...hero.s, g: undefined }) != null && k != TaskKind.EVENT && k != TaskKind.REST;
    }

    // (signing in: told again)
    public forget(player: Player) {
        this.told.delete(player.id);
    }

}
