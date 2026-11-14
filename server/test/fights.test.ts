import { test } from "node:test";
import assert from "node:assert/strict";
import { blow, fight, Fighter, healRate, ROUNDS, TEND_CLERIC, TEND_DRUID, tendMul } from "../../shared/Fights";
import { Job } from "../../shared/Heroes";

// fights (shared/Fights.ts): worked out blow by blow from a random number source

// a repeatable random number source (mulberry32)
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

test("a fight leaves the fighters it was given as they were", () => {
    const heroes = [fighter("Ana", 0, 10, { h: 1 })], enemies = [fighter("Wolf", 1, 8)];
    const before = JSON.stringify([heroes, enemies]);
    fight(1, heroes, enemies, seeded(1));
    assert.equal(JSON.stringify([heroes, enemies]), before);
});

test("nobody ends below 0 health or above their most, and the winner is the side left standing", () => {
    for (let seed = 1; seed <= 300; seed++) {
        const heroes = [fighter("Ana", 0, 8 + seed % 7, { h: 1 }), fighter("Bo", 0, 6, { h: 2 })];
        const enemies = [fighter("Wolf", 1, 5 + seed % 11), fighter("Bat", 1, 4)];
        const f = fight(3, heroes, enemies, seeded(seed));
        f.o.forEach((hp, i) => {
            assert.ok(hp >= 0, `seed ${seed}: below 0`);
            assert.ok(hp <= f.f[i].mx, `seed ${seed}: over their most`);
        });
        const standing = (side: number) => f.f.some((x, i) => x.s == side && f.o[i] > 0);
        assert.equal(f.w, standing(0) && !standing(1), `seed ${seed}`);
        for (const b of f.b) assert.ok(b.d >= 0 && Number.isInteger(b.d), `seed ${seed}: a blow of ${b.d}`);
    }
});

test("the same random numbers give the same fight", () => {
    const run = () => fight(2, [fighter("Ana", 0, 9, { h: 1 })], [fighter("Wolf", 1, 9)], seeded(42));
    assert.deepEqual(run(), run());
});

test("a fight that can't be won ends after ROUNDS, lost", () => {
    const wall = fighter("Wall", 1, 1, { mx: 1e9, hp: 1e9, at: 0, df: 1e6 });
    const f = fight(1, [fighter("Ana", 0, 5, { h: 1 })], [wall], seeded(7));
    assert.equal(f.w, false);
    assert.ok(f.b.length <= ROUNDS * 2);
});

test("a stronger blow takes more, and a better-armoured target less", () => {
    const target = fighter("Wolf", 1, 10);
    assert.ok(blow(20, target) > blow(10, target));
    assert.ok(blow(10, { ...target, df: 40 }) < blow(10, target));
    assert.ok(blow(10, target) > 0);
});

test("a healer in a party heals everyone quicker out of a fight, the best of them, not adding up", () => {
    const of = (...jobs: Job[]) => tendMul(jobs.map((j) => ({ j } as any)));
    assert.equal(of(Job.WARRIOR, Job.ROGUE), 1);
    assert.equal(of(Job.WARRIOR, Job.DRUID), TEND_DRUID);
    assert.equal(of(Job.WARRIOR, Job.CLERIC, Job.DRUID), TEND_CLERIC);
    assert.equal(of(Job.CLERIC, Job.CLERIC), TEND_CLERIC);
    assert.equal(of(Job.CLERIC), TEND_CLERIC);
    const hero = { j: Job.WARRIOR, t: [] } as any, state = (z?: number) => ({ z } as any);
    assert.equal(healRate(hero, state(TEND_CLERIC), true), healRate(hero, state(), true) * TEND_CLERIC);
});
