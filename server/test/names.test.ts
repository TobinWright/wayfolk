import { test } from "node:test";
import assert from "node:assert/strict";
import { cleanName, NAME_LONGEST, nameProblem } from "../../shared/Names";
import { CHAT_LONGEST, cleanChat } from "../../shared/Chat";
import { chatRefusal, maskSwearing } from "../../shared/ChatFilter";

// display names and chat lines (shared/Names.ts, Chat.ts, ChatFilter.ts)

test("names are tidied and kept to NAME_LONGEST", () => {
    assert.equal(cleanName("  Sir   Reginald  "), "Sir Reginald");
    assert.equal(cleanName("x".repeat(50)).length, NAME_LONGEST);
    assert.equal(cleanName(undefined), "");
    assert.equal(cleanName({ name: "Ana" }), "");
});

test("odd, empty or rude names are refused", () => {
    assert.equal(nameProblem("Ana"), "");
    assert.equal(nameProblem("O'Brien-2"), "");
    assert.notEqual(nameProblem("Al"), "");
    assert.notEqual(nameProblem("1234"), "");
    assert.notEqual(nameProblem("Ana<b>"), "");
    assert.notEqual(nameProblem("Ana​Bel"), "");      // (an invisible space)
    assert.notEqual(nameProblem("shithead"), "");
});

test("chat lines lose control characters and are kept to CHAT_LONGEST", () => {
    assert.equal(cleanChat("hi\u0000 there\n\tfriend"), "hi there friend");
    assert.equal(cleanChat("a".repeat(500)).length, CHAT_LONGEST);
    assert.equal(cleanChat(12), "");
});

test("swearing is masked and slurs or self-harm urging refused", () => {
    assert.equal(maskSwearing("well shit"), "well s***");
    assert.equal(maskSwearing("a classic assessment"), "a classic assessment");
    assert.notEqual(chatRefusal("go kill yourself"), "");
    assert.equal(chatRefusal("this skill is killing me"), "");
});
