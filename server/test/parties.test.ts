import { test } from "node:test";
import assert from "node:assert/strict";
import { TaskKind } from "../../shared/Tasks";
import { LEADERSHIP, leadWork } from "../../shared/Parties";
import { deepestAt, deepestLevel, heroPower, partyPower } from "../../shared/Locations";
import { HeroParties } from "../src/managers/hero/HeroParties";

// someone else's hero asked for (HeroParties.view): only one in a party with
// one of yours, and never one of your own

let next = 1;
function hero(place: number, k = TaskKind.GATHER): any {
    return { id: next++, d: { n: "", l: [], j: 0, v: [1] }, s: { p: place, r: [], w: { k, p: place, m: 1 }, t: 0 } };
}
function player(name: string, heroes: any[]): any {
    return { id: next++, online: true, heroes, record: { displayName: name }, send: () => { } };
}

test("a hero in a party with one of yours, or anyone's loaded, can be viewed, with their player's name, unless one's blocked the other", () => {
    const a = player("A", [hero(1)]), b = player("B", [hero(1)]), c = player("C", [hero(2)]);
    const parties = new HeroParties();
    parties.regroup([a, b, c]);
    const seen = parties.view(a, b.heroes[0].id);
    assert.equal(seen[0], b.heroes[0].id);
    assert.equal(seen[1], b.heroes[0].d);
    assert.equal(seen[3], "B");
    assert.equal(parties.view(a, c.heroes[0].id)[3], "C");        // (elsewhere, but loaded: a place's window lists them)
    assert.equal(parties.view(a, a.heroes[0].id), null);          // (your own: you have them)
    assert.equal(parties.view(a, 12345), null);                   // (not loaded)
    b.heroes[0].s.w = { k: TaskKind.GATHER, p: 1, m: 2 };          // (something else: out of the party, still loaded)
    parties.regroup([a, b, c]);
    assert.equal(parties.view(a, b.heroes[0].id)[3], "B");
    (a as any).social = { blocks: new Set([b.id]) };               // (blocked: out of the party, so not seen)
    assert.equal(parties.view(a, b.heroes[0].id), null);
});

// how deep a party goes: by its power together, as sent to the client (PartyView w, rounded)
test("three heroes together reach deeper than any of them alone, by the power sent or by their data", () => {
    const d = (): any => ({ n: "", x: 0, r: 0, j: 0, t: [], s: [10, 10, 10, 10, 10, 10], k: new Array(20).fill(1), l: [], g: [] });
    const three = [d(), d(), d()], sent = Math.round(partyPower(three));
    assert.equal(deepestAt("mine", heroPower(three[0])), deepestLevel("mine", [three[0]]));
    assert.equal(deepestAt("mine", sent), deepestLevel("mine", three));
    assert.ok(deepestAt("mine", sent) > deepestLevel("mine", [three[0]]));
});

test("Leadership: nothing till it's learned, then more a level", () => {
    assert.equal(leadWork(0), 1);
    assert.ok(Math.abs(leadWork(1) - 1.02) < 1e-9);
    assert.ok(Math.abs(leadWork(60) - 1.138) < 1e-9);
    assert.ok(LEADERSHIP >= 0);
});
