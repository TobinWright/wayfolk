import { test } from "node:test";
import assert from "node:assert/strict";
import { DayRow, historySummary, LISTINGS_MOST, LISTINGS_PREMIUM, listingProblem, listingsMost, orderMatches, orderProblem, ordersMost, ORDERS_MOST, ORDERS_PREMIUM, PRICE_MOST, TOTAL_MOST, isItem } from "../../shared/Market";
import { MATERIALS } from "../../shared/Locations";
import { RECIPES, QUALITY_STEP } from "../../shared/Tasks";

// listing on the market (shared/Market.ts): what's refused before any gold or item moves

test("a listing within the rules is fine", () => {
    assert.equal(listingProblem(5, 100, 5), "");
    assert.equal(listingProblem(1, PRICE_MOST, 1), "");
});

test("a listing of nothing, or of more than they have, is refused", () => {
    assert.notEqual(listingProblem(0, 100, 5), "");
    assert.notEqual(listingProblem(-1, 100, 5), "");
    assert.notEqual(listingProblem(1.5, 100, 5), "");
    assert.notEqual(listingProblem(6, 100, 5), "");
});

test("a price that's not a whole number of gold, or too high, is refused", () => {
    assert.notEqual(listingProblem(1, 0, 5), "");
    assert.notEqual(listingProblem(1, -5, 5), "");
    assert.notEqual(listingProblem(1, 2.5, 5), "");
    assert.notEqual(listingProblem(1, NaN, 5), "");
    assert.notEqual(listingProblem(1, PRICE_MOST + 1, 5), "");
});

test("a listing worth more than TOTAL_MOST altogether is refused", () => {
    const amount = Math.floor(TOTAL_MOST / PRICE_MOST) + 1;
    assert.notEqual(listingProblem(amount, PRICE_MOST, amount), "");
});

test("a Supporter lists more at once", () => {
    assert.equal(listingsMost(false), LISTINGS_MOST);
    assert.equal(listingsMost(true), LISTINGS_PREMIUM);
});

test("only things the game knows can be listed", () => {
    assert.ok(isItem(MATERIALS[0].id));
    assert.ok(isItem(RECIPES[0].id));
    assert.ok(!isItem(-1));
    assert.ok(!isItem(1.5));
    assert.ok(!isItem(NaN));
    assert.ok(!isItem(99 * QUALITY_STEP + 1));
});

// buy orders: refused before any gold moves; matched best first

test("an order needs a whole amount, a price within the rules and the gold to set aside", () => {
    assert.equal(orderProblem(10, 5, 50), "");
    assert.notEqual(orderProblem(0, 5, 50), "");
    assert.notEqual(orderProblem(2.5, 5, 50), "");
    assert.notEqual(orderProblem(10, 0, 50), "");
    assert.notEqual(orderProblem(10, PRICE_MOST + 1, Infinity), "");
    assert.notEqual(orderProblem(10, 5, 49), "one gold short");
    const amount = Math.floor(TOTAL_MOST / PRICE_MOST) + 1;
    assert.notEqual(orderProblem(amount, PRICE_MOST, Infinity), "");
});

test("a Supporter posts more orders at once", () => {
    assert.equal(ordersMost(false), ORDERS_MOST);
    assert.equal(ordersMost(true), ORDERS_PREMIUM);
});

test("an order buys what's listed at its price or less, cheapest first; a listing sells to orders at its price or more, highest first", () => {
    const offers = [{ id: 1, price: 8, ends: 3 }, { id: 2, price: 5, ends: 2 }, { id: 3, price: 12, ends: 1 }, { id: 4, price: 5, ends: 1 }];
    assert.deepEqual(orderMatches(offers, 8, true).map((o) => o.id), [4, 2, 1], "the cheapest, the soonest to end first among equals");
    assert.deepEqual(orderMatches(offers, 8, false).map((o) => o.id), [3, 1]);
    assert.deepEqual(orderMatches(offers, 4, true), []);
});

test("price history: how many sold, the average and the range over the days", () => {
    const days: DayRow[] = [[0, 10, 100, 8, 12], [1, 30, 360, 11, 13]];
    assert.deepEqual(historySummary(days), { n: 40, average: 12, low: 8, high: 13 });
    assert.deepEqual(historySummary([]), { n: 0, average: 0, low: 0, high: 0 });
});
