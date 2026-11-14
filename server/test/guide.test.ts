import { test } from "node:test";
import assert from "node:assert/strict";
import { ALL_STEPS, QUICK_START, QUICK_START_MS, quickStart, Step } from "../../shared/Guide";

// the quick start (shared/Guide.ts): quicker from the first hire, till the steps are done or an hour's up

test("the quick start runs from the first hire till the steps are done", () => {
    const now = 1_000_000_000;
    const started = 1 << Step.HIRE;
    assert.equal(quickStart(started, now - 60_000, now), QUICK_START);
    assert.equal(quickStart(ALL_STEPS, now - 60_000, now), 1);
});

test("the quick start can't be kept: an hour at most, and none without a hire time", () => {
    const now = 1_000_000_000;
    const started = 1 << Step.HIRE;
    assert.equal(quickStart(started, now - QUICK_START_MS, now), 1);
    assert.equal(quickStart(started, now - QUICK_START_MS + 1, now), QUICK_START);
    assert.equal(quickStart(started, 0, now), 1);
});
