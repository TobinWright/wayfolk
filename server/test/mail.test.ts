import { test } from "node:test";
import assert from "node:assert/strict";
import { checkEnclosed, cleanNote, hasThings, letterProblem, NOTE_LONGEST } from "../../shared/Mail";
import { MATERIALS } from "../../shared/Locations";

// a letter as it's sent (shared/Mail.ts): its note made safe, what's in it checked against the stash

const A = MATERIALS[0].id;
const have = (id: number) => id == A ? 5 : 0;

test("a note: spaces as one, no control characters, cut to its longest", () => {
    assert.equal(cleanNote("  hello\n\tthere  "), "hello there");
    assert.equal(cleanNote("a\x00b\x7fc"), "abc");
    assert.equal(cleanNote("x".repeat(NOTE_LONGEST + 50)).length, NOTE_LONGEST);
    assert.equal(cleanNote(42), "");
    assert.equal(cleanNote(null), "");
});

test("what's put in: what they have, as a trade's offer is", () => {
    assert.deepEqual(checkEnclosed(10, [[A, 5]], have, 10), { g: 10, i: [[A, 5]] });
    assert.deepEqual(checkEnclosed(undefined, undefined, have, 0), { g: 0, i: [] });
    assert.equal(checkEnclosed(11, [], have, 10), null);
    assert.equal(checkEnclosed(0, [[A, 6]], have, 10), null);
    assert.equal(checkEnclosed(0, [[A, 1], [A, 1]], have, 10), null);
});

test("a letter needs a note or something in it", () => {
    assert.match(letterProblem("", { g: 0, i: [] }), /Write a note/);
    assert.equal(letterProblem("hi", { g: 0, i: [] }), "");
    assert.equal(letterProblem("", { g: 1, i: [] }), "");
    assert.equal(letterProblem("", { g: 0, i: [[A, 1]] }), "");
    assert.match(letterProblem("hi", null), /can't send/);
});

test("things still to take: gold or things, not once taken", () => {
    assert.ok(hasThings({ g: 1, o: [] }));
    assert.ok(hasThings({ g: 0, o: [[A, 1]] }));
    assert.ok(!hasThings({ g: 0, o: [] }));
    assert.ok(!hasThings({ g: 5, o: [], k: 1 }));
});
