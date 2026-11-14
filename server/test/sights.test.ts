import { test } from "node:test";
import assert from "node:assert/strict";
import { beastAt, lotPrice, Sight, SightKind } from "../../shared/Sights";
import { boonAt, BOON_RATE, EventKind, marchAt, MARCH_HALT, marchTarget, WorldEvent } from "../../shared/Events";
import { makeGraph } from "../../shared/Travel";

// what turns up on the map (shared/Sights.ts) and bosses on the march
// (shared/Events.ts MARCH): where each is comes from its start and the clock,
// so the server (meeting heroes) and the map (drawing it) agree

// a straight road east: 0 -(100)- 1 -(100)- 2 -(100)- 3
const graph = makeGraph([
    { i: 0, x: 0, y: 0, n: "", te: 1, e: [1] },
    { i: 1, x: 100, y: 0, n: "", te: 1, e: [0, 2] },
    { i: 2, x: 200, y: 0, n: "", te: 1, e: [1, 3] },
    { i: 3, x: 300, y: 0, n: "", te: 1, e: [2] },
]);

test("a flier crosses in a straight line from its start to its end", () => {
    const s: Sight = { i: 1, k: SightKind.BEAST, v: 0, n: "Ashwing", s: 1000, e: 2000, a: [0, 50, 400, 150] };
    assert.deepEqual(beastAt(s, graph, 1000), { x: 0, y: 50, face: 1 });
    assert.deepEqual(beastAt(s, graph, 1500), { x: 200, y: 100, face: 1 });
    assert.equal(beastAt(s, graph, 999), null);
    assert.equal(beastAt(s, graph, 2000), null);
});

test("a walker goes out along its road for the first half and home for the second", () => {
    const s: Sight = { i: 2, k: SightKind.BEAST, v: 1, n: "Mossback", s: 0, e: 1000, r: [0, 1, 2, 3] };
    assert.equal(beastAt(s, graph, 0).x, 0);
    assert.equal(beastAt(s, graph, 250).x, 150);
    assert.equal(beastAt(s, graph, 250).face, 1);
    assert.equal(Math.round(beastAt(s, graph, 499).x), 299);
    assert.equal(beastAt(s, graph, 750).x, 150);
    assert.equal(beastAt(s, graph, 750).face, -1);
});

test("a marching boss halts at each place, then walks on to the next, its place the one it's making for", () => {
    // from 0 to 3, halting at 0, 2 and 3: two legs of 1000ms each
    const e: WorldEvent = { i: 1, k: EventKind.MARCH, p: 0, n: "", s: 0, e: 2000, g: 10, d: 0, w: 0, r: [0, 1, 2, 3], h: [0, 2, 3] };
    const halted = marchAt(e, graph, 100);
    assert.equal(halted.halted, true);
    assert.equal(halted.p, 0);
    assert.equal(halted.x, 0);
    // halfway along the first leg's walk: halfway from 0 to 2
    const walking = marchAt(e, graph, 1000 * (MARCH_HALT + (1 - MARCH_HALT) / 2));
    assert.equal(walking.halted, false);
    assert.equal(walking.p, 2);
    assert.equal(Math.round(walking.x), 100);
    // at the second place, then on to the town
    assert.equal(marchAt(e, graph, 1100).p, 2);
    assert.equal(marchAt(e, graph, 1999).p, 3);
    assert.equal(marchAt(e, graph, 5000).p, 3);
    assert.equal(marchTarget(e), 3);
});

test("a marching boss that reached its town leaves a bane there: its boon the other way", () => {
    const reached: WorldEvent = { i: 2, k: EventKind.MARCH, p: 3, n: "", s: 0, e: 10, g: 10, d: 2, w: 3, u: 5000 };
    assert.equal(boonAt([reached], 3, "craft", 100), 1 / BOON_RATE);
    assert.equal(boonAt([reached], 3, "craft", 6000), 1);
    assert.equal(boonAt([{ ...reached, w: 1 }], 3, "craft", 100), BOON_RATE);
});

test("a merchant's prices go up with how deep it's found, in fives", () => {
    assert.ok(lotPrice(12, 0) > lotPrice(6, 1) - 50);
    assert.equal(lotPrice(10, 0) % 5, 0);
    assert.ok(lotPrice(10, 1) >= lotPrice(10, 0));
});
