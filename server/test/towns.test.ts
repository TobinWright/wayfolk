import { test } from "node:test";
import assert from "node:assert/strict";
import { EventKind } from "../../shared/Events";
import { builtBy, growsTown, townLevel, townLevelPoints, townPart, townRate, townStage, WIN_POINTS } from "../../shared/Towns";

// towns growing for good (shared/Towns.ts)

const wins = (n: number) => n * WIN_POINTS;

test("each level takes one win more than the last, and there's room for years", () => {
    assert.equal(townLevel(0), 1);
    assert.equal(townLevel(wins(1) - 1), 1);
    assert.equal(townLevel(wins(1)), 2);
    assert.equal(townLevel(wins(3)), 3);
    assert.equal(townLevel(wins(10)), 5);
    assert.equal(townLevel(wins(45)), 10);
    assert.equal(townLevel(wins(190)), 20);
    assert.equal(townLevel(wins(1225)), 50);
});

test("a level is reached at exactly its points, however high", () => {
    for (let level = 1; level <= 2000; level++) {
        assert.equal(townLevel(townLevelPoints(level)), level);
        if (level > 1) assert.equal(townLevel(townLevelPoints(level) - 1), level - 1);
    }
});

test("how far into a level, what it gives and what it's called", () => {
    assert.equal(townPart(townLevelPoints(7)), 0);
    assert.ok(townPart(townLevelPoints(8) - 1) < 1);
    assert.equal(townRate(0), 1);
    assert.ok(Math.abs(townRate(townLevelPoints(21)) - 1.1) < 1e-9);
    assert.equal(townStage(1), "Humble");
    assert.equal(townStage(9), "Busy");
    assert.equal(townStage(10), "Thriving");
    assert.equal(townStage(100000), "Eternal");
});

test("town events grow a town, and rebuilds and upgrades leave something standing", () => {
    assert.ok(growsTown(EventKind.REBUILD) && growsTown(EventKind.UPGRADE) && growsTown(EventKind.FESTIVAL) && growsTown(EventKind.MARCH));
    assert.ok(!growsTown(EventKind.BOSS) && !growsTown(EventKind.RESTORE));
    assert.equal(builtBy({ k: EventKind.UPGRADE, n: "Raise a new forge in Glassmere" }), "New Forge");
    assert.equal(builtBy({ k: EventKind.REBUILD, n: "Rebuild the town walls of Glassmere" }), "Walls Rebuild");
    assert.equal(builtBy({ k: EventKind.FESTIVAL, n: "Anything" }), "");
});
