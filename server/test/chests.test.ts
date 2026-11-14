import { test } from "node:test";
import assert from "node:assert/strict";
import { CHEST_AMOUNT, CHEST_GOLD, CHEST_ODDS, CHEST_STACKS, chestMaterials, chestTier, ChestTier, dailyTier, dayOf, lootText, nextStreak, rollChest } from "../../shared/Chests";
import { HeroData, Skill } from "../../shared/Heroes";
import { materialOf } from "../../shared/Locations";
import { gatherLevel, gatherSkill } from "../../shared/Tasks";

// loot chests (shared/Chests.ts): what's in one, kept to what the heroes can gather

const hero = (levels: Partial<Record<Skill, number>> = {}) => {
    const k = new Array(13).fill(1);
    for (const [s, l] of Object.entries(levels)) k[Number(s)] = l;
    return { k } as unknown as HeroData;
};

// a roll that goes round the numbers given
const rolls = (...r: number[]) => { let i = 0; return () => r[i++ % r.length]; };

test("a chest's tier goes by its odds", () => {
    assert.equal(chestTier(0), ChestTier.WOODEN);
    assert.equal(chestTier(CHEST_ODDS[0] - 0.001), ChestTier.WOODEN);
    assert.equal(chestTier(CHEST_ODDS[0]), ChestTier.SILVER);
    assert.equal(chestTier(0.999), ChestTier.GOLDEN);
    assert.ok(Math.abs(CHEST_ODDS.reduce((a, b) => a + b, 0) - 1) < 1e-9);
});

test("a new hero's chest holds only first-level materials, gold and amounts in range", () => {
    const heroes = [hero()];
    for (let i = 0; i < 300; i++) {
        for (const t of [ChestTier.WOODEN, ChestTier.SILVER]) {
            const loot = rollChest(t, heroes);
            assert.ok(loot.g >= CHEST_GOLD[t][0] && loot.g <= CHEST_GOLD[t][1], `gold ${loot.g}`);
            assert.equal(loot.m.length, CHEST_STACKS[t]);
            for (const [id, n] of loot.m) {
                assert.equal(gatherLevel(id), 1, `${materialOf(id).name} is past level 1`);
                assert.ok(n >= CHEST_AMOUNT[t][0] && n <= CHEST_AMOUNT[t][1]);
            }
            assert.equal(new Set(loot.m.map(([id]) => id)).size, loot.m.length, "no material twice");
        }
    }
});

test("a golden chest's last stack is from a tier deeper than they can gather", () => {
    const loot = rollChest(ChestTier.GOLDEN, [hero()], rolls(0.5, 0.3, 0.7));
    assert.equal(loot.m.length, 3);
    const [id] = loot.m[2];
    assert.ok(gatherLevel(id) > 1, "deeper than level 1");
    assert.ok(gatherLevel(id) <= 11);
});

test("what can be found goes by the best of the heroes in each skill", () => {
    const miner = hero({ [Skill.MINING]: 11 });
    const can = chestMaterials([hero(), miner]);
    assert.ok(can.includes(3), "Iron Ore, mining level 11");
    assert.ok(!can.includes(17) || gatherLevel(17) <= 1, "not Oak Log: woodcutting's still 1");
    for (const id of can) assert.ok(gatherLevel(id) <= (gatherSkill(id) == Skill.MINING ? 11 : 1));
});

test("what was in it, said in a line", () => {
    assert.equal(lootText({ t: ChestTier.WOODEN, g: 12, m: [[1, 4], [45, 6]] }), "+12 gold, 4 Copper Ore, 6 Flax");
});

test("a daily streak goes up a day at a time, and starts again after a day missed", () => {
    assert.equal(nextStreak(100, 0, 0), 1, "the first");
    assert.equal(nextStreak(100, 99, 4), 5, "the day after");
    assert.equal(nextStreak(100, 100, 5), 5, "the same day: as it was");
    assert.equal(nextStreak(100, 97, 6), 1, "a day missed: from 1");
    assert.equal(dailyTier(1), ChestTier.WOODEN);
    assert.equal(dailyTier(3), ChestTier.SILVER);
    assert.equal(dailyTier(7), ChestTier.GOLDEN);
    assert.equal(dayOf(86400000 * 3 + 5), 3);
});
