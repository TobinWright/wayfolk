import { FeaturedHero } from "../../../../shared/Parties";
import { Fight } from "../../../../shared/Fights";
import { S2C } from "../../constants/Routes";
import { Player } from "../player/Player";
import { Hero } from "./HeroManager";
import { HeroParties } from "./HeroParties";

// What staff in demo mode are told (the user, 2026-11-03, of its tour: "it
// should have access to every party and cycle through each. yes, fighting
// needs to be shown"): every party of every hero loaded (those signed in, and
// those signed out till they're let go; alone, a party of one), all at first
// and after that only those that changed or went (the user: "is there a better
// way to build it so the whole list isn't resent?"; the client works out the
// rest, as it does for your own), and every fight as it's fought. Those of anyone who's blocked them,
// or they've blocked, left out. Sent only while they're watching (S2C.ADMIN_DEMO_PARTIES,
// S2C.ADMIN_DEMO_FIGHT), so it costs nothing otherwise.

export class HeroDemo {

    public static CHECK_MS = 2000;

    private watching = new Map<Player, Map<number, string>>();  // (what each was last told: a party's leader, a key of it)
    private time = 0;
    private told = new WeakSet<Fight>();            // (a party's fight comes by each of them: once)

    constructor(private parties: HeroParties) { }

    public set(player: Player, on: boolean) {
        if (on) { this.watching.set(player, new Map()); this.time = HeroDemo.CHECK_MS; }
        else this.watching.delete(player);
    }

    // (signing in: not till they ask again)
    public forget(player: Player) {
        this.watching.delete(player);
    }

    public update(deltaTime: number, players: Player[]) {
        if (!this.watching.size || (this.time += deltaTime) < HeroDemo.CHECK_MS) return;
        this.time = 0;
        const all = this.all(players);
        const keys = new Map(all.map((party) => [party, HeroDemo.keyOf(party)] as [Hero[], string]));
        for (const [player, was] of Array.from(this.watching)) {
            if (!player.online || !player.canEdit()) { this.watching.delete(player); continue; }
            const now = new Map<number, string>(), changed: FeaturedHero[][] = [];
            for (const party of all) {
                if (!party.every((h) => this.allowed(player, h))) continue;
                const leader = party[0].id, key = keys.get(party);
                now.set(leader, key);
                if (was.get(leader) != key) changed.push(party.map((h) => this.row(h)));
            }
            const gone = Array.from(was.keys()).filter((leader) => !now.has(leader));
            this.watching.set(player, now);
            if (changed.length || gone.length) player.send({ r: S2C.ADMIN_DEMO_PARTIES, u: changed, g: gone });
        }
    }

    // what they're told again for: who's in it, how they look, what they're at
    // and where (held up on the road: where they've got to is told again too)
    private static keyOf(party: Hero[]) {
        return JSON.stringify(party.map((h) => [h.id, h.d.l, h.s.p, h.s.r, h.s.w?.k, h.s.w?.m, h.s.w?.p, !!h.s.c, !!h.s.o, h.s.y ?? 0]));
    }

    // a fight just had: to those watching, once
    public fought(hero: Hero, fight: Fight) {
        if (!this.watching.size || this.told.has(fight)) return;
        this.told.add(fight);
        for (const player of this.watching.keys()) {
            if (player.online && this.allowed(player, hero)) player.send({ r: S2C.ADMIN_DEMO_FIGHT, h: hero.id, f: fight });
        }
    }

    // every party once
    private all(players: Player[]) {
        const seen = new Set<Hero>(), parties: Hero[][] = [];
        for (const player of players) for (const hero of player.heroes) {
            if (seen.has(hero)) continue;
            const party = this.parties.partyOf(hero);
            for (const h of party) seen.add(h);
            seen.add(hero);
            parties.push(party);
        }
        return parties;
    }

    private allowed(player: Player, hero: Hero) {
        const owner = this.parties.ownerOf(hero);
        return !!owner && (owner == player || !(player.social?.blocks.has(owner.id) || owner.social?.blocks.has(player.id)));
    }

    private row(hero: Hero): FeaturedHero {
        const { v, ...d } = hero.d;
        return [hero.id, d, hero.s, this.parties.ownerOf(hero)?.record.displayName ?? ""];
    }

}
