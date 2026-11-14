import { PARTY_MOST, partyKey, PartyMember } from "../../../../shared/Parties";
import { S2C } from "../../constants/Routes";
import { Player } from "../player/Player";
import { Hero } from "./HeroManager";
import type { Formed } from "./FormedParties";

interface Party { key: string; members: Hero[]; }

// Heroes in parties (shared/Parties.ts): worked out again each moment from
// what everyone loaded is doing (regroup) - signed in or working away -
// whoever's at the same place doing the same thing, up to PARTY_MOST a
// party. One whose task changes or who sets off is out at once; one coming
// joins the fullest party with room, else starts their own; two that would
// fit in one become one. Parties keep their order (who was there first
// leads), so they don't shuffle. Kept in memory only: after a restart
// they form again from heroes' states. One in a formed party (FormedParties)
// is never in one of these: their party's those with it (formed). A public
// formed party's room is filled by those alone at the same thing where it is
// (its helpers, taken out of these), those who were first kept.

export class HeroParties {

    private of = new Map<Hero, Party>();
    private owner = new Map<Hero, Player>();
    private sent = new Map<Hero, string>();     // (what each one's owner was last told of their party)
    private byId = new Map<number, Hero>();
    public formed: (hero: Hero) => Hero[] = () => null;    // (a formed party's, with it or helping: those with it and its helpers; FormedParties)
    public open: () => Formed[] = () => [];                 // (the public formed parties, to fill)
    public formedGroups: () => Hero[][] = () => [];         // (the formed parties of two or more together now, each with its helpers)

    // whose a loaded hero is (null: none loaded now)
    public ownerOf(hero: Hero): Player {
        return this.owner.get(hero) ?? null;
    }

    // a loaded hero, by their id (none: null)
    public heroById(id: number): Hero {
        return this.byId.get(id) ?? null;
    }

    // everyone in a hero's party, them included (alone: just them)
    public partyOf(hero: Hero): Hero[] {
        return this.formed(hero) ?? this.of.get(hero)?.members ?? [hero];
    }

    // the parties there are now, of two or more, each its members (kept as they change)
    public groups(): Hero[][] {
        return Array.from(new Set(this.of.values())).filter((p) => p.members.length > 1).map((p) => p.members);
    }

    // who's loaded, and whose (before regroup: formed parties gather by it)
    public index(players: Player[]) {
        this.byId.clear();
        for (const player of players) for (const hero of player.heroes) { this.byId.set(hero.id, hero); this.owner.set(hero, player); }
        for (const hero of Array.from(this.owner.keys())) if (this.byId.get(hero.id) != hero) { this.owner.delete(hero); this.sent.delete(hero); }
    }

    // (with `players`: who's loaded first, as index)
    public regroup(players?: Player[]) {
        if (players) this.index(players);
        const loaded = new Set<Hero>(this.byId.values());

        // out: let go, no longer doing what their party is
        for (const [hero, party] of Array.from(this.of)) {
            if (loaded.has(hero) && partyKey(hero.s) == party.key) continue;
            party.members.splice(party.members.indexOf(hero), 1);
            this.of.delete(hero);
        }

        // the parties there are, by what they're doing; two that fit in one become one
        const byKey = new Map<string, Party[]>();
        for (const party of new Set(this.of.values())) {
            const same = byKey.get(party.key) ?? [];
            const into = same.find((p) => p.members.length + party.members.length <= PARTY_MOST);
            if (into) { into.members.push(...party.members); for (const h of party.members) this.of.set(h, into); }
            else { same.push(party); byKey.set(party.key, same); }
        }

        // in: the fullest party with room, else one of their own
        for (const hero of loaded) {
            const key = partyKey(hero.s);
            if (!key || this.of.has(hero)) continue;
            const same = byKey.get(key) ?? [];
            let party = same.filter((p) => p.members.length < PARTY_MOST).sort((a, b) => b.members.length - a.members.length)[0];
            if (!party) { party = { key, members: [] }; same.push(party); byKey.set(key, same); }
            party.members.push(hero);
            this.of.set(hero, party);
        }

        // the public formed parties' room: those alone at the same thing where it is (not on the way)
        for (const f of this.open()) {
            const key = f.with.length ? partyKey(f.s) : null, room = PARTY_MOST - f.with.length;
            const helpers = key ? f.helpers.filter((h) => loaded.has(h) && partyKey(h.s) == key) : [];
            for (const party of key ? byKey.get(key) ?? [] : []) for (const h of party.members) if (!helpers.includes(h)) helpers.push(h);
            f.helpers = helpers.slice(0, Math.max(0, room));
            for (const h of f.helpers) {
                const party = this.of.get(h);
                if (party) { party.members.splice(party.members.indexOf(h), 1); this.of.delete(h); }
            }
        }
    }

    // each hero of theirs whose party (or how one in it looks) changed since they were told: who's in it now
    public send(player: Player) {
        for (const hero of player.heroes) {
            const members = this.partyOf(hero), seen = members.map((h) => `${h.id}:${h.d.l.join(".")}`).join(",");
            if (this.sent.get(hero) == seen) continue;
            this.sent.set(hero, seen);
            const m = members.map((h): PartyMember => [h.id, h.d.n, h.d.l, this.owner.get(h)?.record.displayName ?? "", h.d.j]);
            player.send({ r: S2C.HERO_PARTY, h: hero.id, m });
        }
    }

    // a hero someone else has, in a party with one of the player's or loaded
    // (a place's window lists those there, S2C.EVENT_HERE) and neither of
    // them blocking the other (null: none such): as sent (S2C.HERO_VIEW), for
    // their status window
    public view(player: Player, heroId: number) {
        for (const mine of player.heroes) {
            const hero = this.partyOf(mine).find((h) => h.id == heroId && !player.heroes.includes(h));
            if (hero) return [hero.id, hero.d, hero.s, this.owner.get(hero)?.record.displayName ?? ""];
        }
        for (const [hero, owner] of this.owner) {
            if (hero.id != heroId || owner == player || player.social?.blocks.has(owner.id) || owner.social?.blocks.has(player.id)) continue;
            return [hero.id, hero.d, hero.s, owner.record.displayName];
        }
        return null;
    }

    // (signing in: told again)
    public forget(player: Player) {
        for (const hero of player.heroes) this.sent.delete(hero);
    }

}
