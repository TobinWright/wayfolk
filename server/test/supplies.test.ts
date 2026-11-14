import { test } from "node:test";
import assert from "node:assert/strict";
import { fight, Fighter, potionUsed } from "../../shared/Fights";
import { MATERIALS } from "../../shared/Locations";
import { gatherSkill, hasQuality, itemTier, mealWork, POTION_AT, POTIONS, RECIPES, recipeOf, Slot, slotsFor } from "../../shared/Tasks";
import { Skill } from "../../shared/Heroes";

// potions and meals (shared/Tasks.ts POTIONS, MEAL_MS), and the content they come from

function seeded(seed: number) {
    return () => {
        seed = (seed + 0x6d2b79f5) >>> 0;
        let t = seed;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

const fighter = (n: string, s: number, power: number, extra: Partial<Fighter> = {}): Fighter =>
    ({ n, s, mx: power * 10, hp: power * 10, at: power, df: power, sp: 10, cr: 0.1, dg: 0.05, ...extra });

const HEALING = 128, FIREPOWDER = 114, MIGHT = 132;

test("a healing potion is drunk once, only when they're low, and counts as used", () => {
    for (let seed = 1; seed <= 200; seed++) {
        const f = fight(3, [fighter("Ana", 0, 10, { h: 1, pt: HEALING })], [fighter("Ogre", 1, 14)], seeded(seed));
        const drinks = f.b.filter((b) => b.p);
        assert.ok(drinks.length <= 1);
        for (const d of drinks) {
            assert.equal(d.a, 0);
            assert.equal(d.t, 0);
            assert.equal(d.h, 1);
        }
        assert.equal(potionUsed(f, 1), drinks.length == 1);
    }
});

test("a hero who's never low enough keeps their healing potion", () => {
    const f = fight(1, [fighter("Ana", 0, 50, { h: 1, pt: HEALING })], [fighter("Rat", 1, 1)], seeded(3));
    assert.ok(f.w);
    assert.ok(!f.b.some((b) => b.p));
    assert.ok(!potionUsed(f, 1));
    assert.ok(POTION_AT > 0 && POTION_AT < 1);
});

test("Firepowder hits every enemy before anyone else moves", () => {
    const enemies = [fighter("Wolf", 1, 5), fighter("Wolf", 1, 5), fighter("Wolf", 1, 5)];
    const f = fight(2, [fighter("Ana", 0, 10, { h: 1, pt: FIREPOWDER })], enemies, seeded(7));
    const first = f.b.slice(0, 3);
    assert.deepEqual(first.map((b) => [b.a, b.t, b.p]), [[0, 1, 1], [0, 2, 1], [0, 3, 1]]);
    assert.ok(first.every((b) => b.d > 0 && !b.m));
    assert.ok(potionUsed(f, 1));
});

test("a draught is used up by every fight; a hero with none uses nothing", () => {
    const f = fight(1, [fighter("Ana", 0, 10, { h: 1, pt: MIGHT }), fighter("Bo", 0, 10, { h: 2 })], [fighter("Rat", 1, 3)], seeded(9));
    assert.ok(potionUsed(f, 1));
    assert.ok(!potionUsed(f, 2));
});

test("every potion has an effect, and potions and meals go in their own slots and never roll a quality", () => {
    for (const r of RECIPES.filter((r) => r.type == "potion")) {
        assert.ok(POTIONS[r.id], `${r.name} does nothing`);
        assert.deepEqual(slotsFor(r.type), [Slot.POTION]);
        assert.ok(!hasQuality(r));
    }
    for (const r of RECIPES.filter((r) => r.type == "food")) {
        assert.deepEqual(slotsFor(r.type), [Slot.FOOD]);
        assert.ok(!hasQuality(r));
        assert.ok(mealWork(r.id) > 1);
    }
    assert.ok(mealWork(150) > mealWork(139), "a better meal does more");
});

test("every material gathered goes into something, and every skill has something to do", () => {
    const used = new Set(RECIPES.flatMap((r) => r.needs.map(([id]) => id)));
    for (const m of MATERIALS) assert.ok(used.has(m.id), `${m.name} goes into nothing`);
    const gathered = new Set<Skill>(MATERIALS.map((m) => gatherSkill(m.id)));
    for (const s of [Skill.MINING, Skill.WOODCUTTING, Skill.FORAGING, Skill.FISHING, Skill.HUNTING]) assert.ok(gathered.has(s));
    const crafted = new Set<Skill>(RECIPES.map((r) => r.skill));
    for (const s of [Skill.SMITHING, Skill.WOODWORKING, Skill.ALCHEMY, Skill.COOKING, Skill.TAILORING, Skill.JEWELCRAFTING]) assert.ok(crafted.has(s));
    // (and every recipe's needs are things that exist)
    for (const r of RECIPES) for (const [id] of r.needs) assert.ok(MATERIALS.some((m) => m.id == id) || recipeOf(id), `${r.name} needs ${id}`);
    assert.ok(itemTier(131) > itemTier(127));
});
