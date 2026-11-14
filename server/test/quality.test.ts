import { test } from "node:test";
import assert from "node:assert/strict";
import { baseItem, Quality, QUALITY_STEP, qualityOdds, qualityOf, withQuality, RECIPES } from "../../shared/Tasks";

// quality (shared/Tasks.ts): a Fine or better thing is its Normal one's id + QUALITY_STEP a quality

test("a thing's quality and its Normal one come back from its id", () => {
    const id = RECIPES[0].id;
    assert.ok(id < QUALITY_STEP);
    for (const q of [Quality.NORMAL, Quality.FINE, Quality.SUPERIOR, Quality.MASTERWORK]) {
        const made = withQuality(id, q);
        assert.equal(qualityOf(made), q);
        assert.equal(baseItem(made), id);
    }
});

test("an id past the qualities is read as Normal", () => {
    assert.equal(qualityOf(9 * QUALITY_STEP + 1), Quality.NORMAL);
    assert.equal(qualityOf(-1), Quality.NORMAL);
});

test("the odds are chances, better with levels and Luck, never all of them", () => {
    for (const over of [-20, 0, 10, 50, 500]) for (const luck of [0, 10, 40, 200]) {
        const odds = qualityOdds(over, luck);
        assert.equal(odds.length, 3);
        for (const p of odds) assert.ok(p >= 0 && p <= 1);
        assert.ok(odds.reduce((a, b) => a + b, 0) < 1, `over ${over}, luck ${luck}`);
    }
    assert.ok(qualityOdds(50, 10)[0] > qualityOdds(0, 10)[0]);
    assert.ok(qualityOdds(0, 30)[0] > qualityOdds(0, 10)[0]);
});
