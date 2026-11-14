import { test } from "node:test";
import assert from "node:assert/strict";
import { handRank, handValue, oddsText, RACE_EDGE, raceAt, raceOdds } from "../../shared/Games";

// blackjack hands (shared/Games.ts): a card 0-51, rank card % 13 (0 an ace, 10-12 faces)

const ACE = 0, TWO = 1, FIVE = 4, NINE = 8, TEN = 9, KING = 12;

test("cards count their pips, faces ten", () => {
    assert.equal(handValue([TWO, FIVE]), 2 + 5);
    assert.equal(handValue([TEN, KING]), 20);
    assert.equal(handValue([KING + 13, KING + 26]), 20);       // (other suits)
});

test("an ace is 11 unless that busts the hand", () => {
    assert.equal(handValue([ACE, NINE]), 20);
    assert.equal(handValue([ACE, NINE, FIVE]), 15);
    assert.equal(handValue([ACE, ACE]), 12);
    assert.equal(handValue([ACE, ACE, ACE, ACE, KING]), 14);
});

test("a blackjack beats 21 made of more cards; over 21 is bust", () => {
    assert.equal(handRank([ACE, KING]), 22);
    assert.equal(handRank([FIVE, FIVE + 13, ACE]), 21);
    assert.equal(handRank([KING, KING + 13, TWO]), -1);
    assert.ok(handRank([ACE, KING]) > handRank([FIVE, FIVE + 13, ACE]));
});

// slime racing's odds and runs

test("odds pay back less than fair by the house's edge, in tenths", () => {
    assert.equal(raceOdds(0.5), 18);                // (fair 2x, 10% off)
    assert.equal(raceOdds(0.1), 90);
    for (const chance of [0.05, 0.13, 0.2, 0.37, 0.6]) assert.ok(raceOdds(chance) / 10 * chance <= 1 - RACE_EDGE + 1e-9);
    assert.equal(raceOdds(0.99), 11);               // (never under 1.1x)
    assert.equal(oddsText(45), "4.5x");
    assert.equal(oddsText(110), "11.0x");
});

test("a slime's run goes from the start to the line through its stretches", () => {
    const keys = [100, 300, 600, 1000], time = 4000;
    assert.equal(raceAt(keys, time, 0), 0);
    assert.equal(raceAt(keys, time, 1000), 0.1);
    assert.equal(raceAt(keys, time, 1500), 0.2);
    assert.equal(raceAt(keys, time, 4000), 1);
    assert.equal(raceAt(keys, time, 9000), 1);
});
