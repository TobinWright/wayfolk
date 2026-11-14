import { test } from "node:test";
import assert from "node:assert/strict";
import { checkOffer, GOLD_MOST, isEmpty, emptyOffer, OFFER_MOST } from "../../shared/Trade";
import { MATERIALS } from "../../shared/Locations";

// an offer in a trade (shared/Trade.ts checkOffer): made safe against what the player has

const A = MATERIALS[0].id, B = MATERIALS[1].id;
const stash = new Map([[A, 10], [B, 3]]);
const have = (id: number) => stash.get(id) ?? 0;

test("an offer of what they have is taken as it is", () => {
    assert.deepEqual(checkOffer({ g: 50, i: [[A, 10], [B, 1]] }, have, 100), { g: 50, i: [[A, 10], [B, 1]] });
    assert.deepEqual(checkOffer({ i: [] }, have, 0), { g: 0, i: [] });
});

test("gold they haven't got, negative or not whole is refused", () => {
    assert.equal(checkOffer({ g: 101, i: [] }, have, 100), null);
    assert.equal(checkOffer({ g: -1, i: [] }, have, 100), null);
    assert.equal(checkOffer({ g: 1.5, i: [] }, have, 100), null);
    assert.equal(checkOffer({ g: "5", i: [] }, have, 100), null);
    assert.equal(checkOffer({ g: GOLD_MOST + 1, i: [] }, have, GOLD_MOST * 2), null);
});

test("more of a thing than they have, none, or a part is refused", () => {
    assert.equal(checkOffer({ g: 0, i: [[A, 11]] }, have, 0), null);
    assert.equal(checkOffer({ g: 0, i: [[A, 0]] }, have, 0), null);
    assert.equal(checkOffer({ g: 0, i: [[A, -2]] }, have, 0), null);
    assert.equal(checkOffer({ g: 0, i: [[A, 0.5]] }, have, 0), null);
});

test("the same thing twice is refused (it'd count the stash twice)", () => {
    assert.equal(checkOffer({ g: 0, i: [[B, 2], [B, 2]] }, have, 0), null);
});

test("things the game doesn't know, too many things, or not an offer at all are refused", () => {
    assert.equal(checkOffer({ g: 0, i: [[-5, 1]] }, () => 99, 0), null);
    assert.equal(checkOffer({ g: 0, i: Array.from({ length: OFFER_MOST + 1 }, (_, k) => [MATERIALS[k].id, 1]) }, () => 99, 0), null);
    assert.equal(checkOffer(null, have, 0), null);
    assert.equal(checkOffer("offer", have, 0), null);
    assert.equal(checkOffer({ g: 0, i: "A" }, have, 0), null);
    assert.equal(checkOffer({ g: 0, i: [A, 1] }, have, 0), null);
});

test("an empty offer is empty", () => {
    assert.ok(isEmpty(emptyOffer()));
    assert.ok(!isEmpty({ g: 1, i: [] }));
    assert.ok(!isEmpty({ g: 0, i: [[A, 1]] }));
});
