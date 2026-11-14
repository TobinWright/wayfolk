import { test } from "node:test";
import assert from "node:assert/strict";
import { FEATURED_MOST, FeaturedHero } from "../../shared/Parties";
import { TaskKind } from "../../shared/Tasks";
import { HeroFeatured } from "../src/managers/hero/HeroFeatured";
import { HeroParties } from "../src/managers/hero/HeroParties";

// featured parties (HeroFeatured): up to FEATURED_MOST parties of two or more
// at their work, told everyone signed in as they change; one that breaks up
// is let go and another picked; heroes alone at their work make up the rest,
// giving way to a party

let next = 1;
function hero(place: number, k = TaskKind.GATHER): any {
    return { id: next++, d: { n: "", l: [], j: 0, v: [1] }, s: { p: place, r: [], w: { k, p: place, m: 1 }, t: 0 } };
}
function player(heroes: any[]): any {
    const got: any[] = [];
    return { id: next++, online: true, heroes, record: { displayName: "P" }, got, send: (m: any) => got.push(m) };
}
function step(parties: HeroParties, featured: HeroFeatured, players: any[]) {
    parties.regroup(players);
    featured.update(HeroFeatured.CHECK_MS, players);
}
const last = (p: any): FeaturedHero[][] => p.got[p.got.length - 1].l;

test("parties of two or more at their work are featured, at most FEATURED_MOST", () => {
    const players: any[] = [];
    for (let place = 0; place < FEATURED_MOST + 3; place++) players.push(player([hero(place), hero(place)]));
    players.push(player([hero(100)]));                                  // alone
    players.push(player([hero(101, TaskKind.REST), hero(101, TaskKind.REST)]));   // resting together
    const parties = new HeroParties(), featured = new HeroFeatured(parties);
    step(parties, featured, players);
    const l = last(players[0]);
    assert.equal(l.length, FEATURED_MOST);
    assert.ok(l.every((party) => party.length == 2 && party[0][2].p < 100));
    assert.ok(l.every((party) => party.every(([, d]) => !("v" in d))));     // (not what they've learned)
});

test("one that breaks up is let go and another featured; nobody's told twice the same", () => {
    const a = player([hero(1), hero(1)]), b = player([hero(2), hero(2)]);
    const parties = new HeroParties(), featured = new HeroFeatured(parties);
    step(parties, featured, [a, b]);
    assert.equal(last(a).length, 2);
    const told = a.got.length;
    step(parties, featured, [a, b]);
    assert.equal(a.got.length, told);
    a.heroes[1].s.w = { k: TaskKind.GATHER, p: 1, m: 2 };              // (something else: out of the party)
    step(parties, featured, [a, b]);
    const l = last(a);
    assert.deepEqual(l.filter((party) => party.length == 2).map((party) => party[0][2].p), [2]);
    assert.equal(l.filter((party) => party.length == 1).length, 2);   // (theirs, alone now)
});

test("too few parties: those alone at their work make up the rest, giving way to a party", () => {
    const solos: any[] = [];
    for (let place = 0; place < FEATURED_MOST + 2; place++) solos.push(player([hero(200 + place)]));
    const resting = player([hero(300, TaskKind.REST)]);
    const pair = player([hero(1), hero(2)]);
    const players = [...solos, resting, pair];
    const parties = new HeroParties(), featured = new HeroFeatured(parties);
    step(parties, featured, players);
    let l = last(solos[0]);
    assert.equal(l.length, FEATURED_MOST);
    assert.ok(l.every((party) => party.length == 1 && party[0][2].p != 300))   // (not resting);
    pair.heroes[1].s = { ...pair.heroes[1].s, p: 1, w: { ...pair.heroes[1].s.w, p: 1 } };   // (together now)
    step(parties, featured, players);
    l = last(solos[0]);
    assert.equal(l.length, FEATURED_MOST);
    assert.equal(l.filter((party) => party.length == 2).length, 1);
});

test("the fullest parties are featured first, a fuller one taking the place of the least full", () => {
    const pairs: any[] = [], full = (place: number) => player([hero(place), hero(place), hero(place), hero(place)]);
    for (let place = 0; place < FEATURED_MOST; place++) pairs.push(player([hero(place), hero(place)]));
    const fours = [full(400), full(401)];
    const parties = new HeroParties(), featured = new HeroFeatured(parties);
    step(parties, featured, [...pairs, ...fours]);
    let l = last(pairs[0]);
    assert.equal(l.length, FEATURED_MOST);
    assert.equal(l.filter((party) => party.length == 4).length, 2);

    const parties2 = new HeroParties(), featured2 = new HeroFeatured(parties2);
    step(parties2, featured2, pairs);
    assert.ok(last(pairs[0]).every((party) => party.length == 2));
    step(parties2, featured2, [...pairs, ...fours]);                    // (fuller ones turn up)
    l = last(pairs[0]);
    assert.equal(l.length, FEATURED_MOST);
    assert.equal(l.filter((party) => party.length == 4).length, 2);
});

test("a formed party is featured, not those in it alone, its members kept up with and let go when it stops", () => {
    const formed = (place: number) => { const h = hero(place); h.s.g = 1; return h; };
    const a = formed(1), b = formed(1), c = formed(1), solo = hero(2);
    const owner = player([a, b, c]), other = player([solo]);
    let members = [a, b, c];
    const parties = new HeroParties(), featured = new HeroFeatured(parties);
    parties.formed = (h) => members.includes(h) ? members : null;
    parties.formedGroups = () => members.length > 1 ? [members.slice()] : [];
    step(parties, featured, [owner, other]);
    const l = last(owner);
    assert.deepEqual(l.map((party) => party.length).sort(), [1, 3]);
    assert.ok(l.find((party) => party.length == 3).every(([id]) => [a.id, b.id, c.id].includes(id)));

    members = [a, b];                                                   // (one's left it)
    step(parties, featured, [owner, other]);
    assert.ok(last(owner).some((party) => party.length == 2));

    a.s.w = { k: TaskKind.REST };                                       // (the party's resting: not walking about)
    b.s.w = { k: TaskKind.REST };
    step(parties, featured, [owner, other]);
    assert.ok(!last(owner).some((party) => party.length > 1));
});

test("a featured party whose last member's gone is let go, and the check carries on", () => {
    const a = player([hero(1), hero(1)]), b = player([hero(2), hero(2)]);
    const parties = new HeroParties(), featured = new HeroFeatured(parties);
    parties.formed = (h) => h.s.g != null ? [h] : null;                 // (reads the hero, as FormedParties does)
    step(parties, featured, [a, b]);
    assert.equal(last(a).length, 2);
    a.heroes[0].s.w = { k: TaskKind.GATHER, p: 1, m: 2 };               // (one goes, then the other: nobody left in it)
    step(parties, featured, [a, b]);
    a.heroes[1].s.w = { k: TaskKind.GATHER, p: 1, m: 3 };
    step(parties, featured, [a, b]);
    const l = last(a);
    assert.ok(l.every((party) => party.length > 0));
    assert.deepEqual(l.filter((party) => party.length == 2).map((party) => party[0][2].p), [2]);
});
