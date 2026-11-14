import { test } from "node:test";
import assert from "node:assert/strict";
import {
    canKick, cleanGuildName, cleanTag, GOAL_LEAST_MEMBERS, GOALS, GOALS_A_WEEK, goalTarget, GUILD_LEVEL_MOST,
    guildCraftMul, guildLevel, guildNameProblem, hallRoom, levelPerk, levelStartXp, Rank, TAKES_A_DAY, tagProblem, takesLeft, weekGoals,
} from "../../shared/Guilds";

// guilds (shared/Guilds.ts): who may kick whom, levels, the week's goals, names

test("the leader kicks anyone but a leader; an officer only members; a member nobody", () => {
    assert.ok(canKick(Rank.LEADER, Rank.OFFICER));
    assert.ok(canKick(Rank.LEADER, Rank.MEMBER));
    assert.ok(!canKick(Rank.LEADER, Rank.LEADER));
    assert.ok(canKick(Rank.OFFICER, Rank.MEMBER));
    assert.ok(!canKick(Rank.OFFICER, Rank.OFFICER));
    assert.ok(!canKick(Rank.OFFICER, Rank.LEADER));
    assert.ok(!canKick(Rank.MEMBER, Rank.MEMBER));
});

test("a guild's level follows its XP, from 1 to GUILD_LEVEL_MOST", () => {
    assert.equal(guildLevel(0), 1);
    for (let level = 2; level <= GUILD_LEVEL_MOST; level++) {
        assert.equal(guildLevel(levelStartXp(level) - 1), level - 1);
        assert.equal(guildLevel(levelStartXp(level)), level);
    }
    assert.equal(guildLevel(Number.MAX_SAFE_INTEGER), GUILD_LEVEL_MOST);
});

test("a week has GOALS_A_WEEK different goals, the same each time it's asked", () => {
    for (let week = 0; week < 200; week++) {
        const goals = weekGoals(week);
        assert.equal(goals.length, GOALS_A_WEEK);
        assert.equal(new Set(goals).size, GOALS_A_WEEK);
        for (const g of goals) assert.ok(GOALS.some((x) => x.deed == g));
        assert.deepEqual(weekGoals(week), goals);
    }
});

test("a goal's target grows with members, never below GOAL_LEAST_MEMBERS' worth", () => {
    const deed = GOALS[0].deed;
    assert.equal(goalTarget(deed, 0), goalTarget(deed, GOAL_LEAST_MEMBERS));
    assert.equal(goalTarget(deed, 1), goalTarget(deed, GOAL_LEAST_MEMBERS));
    assert.ok(goalTarget(deed, GOAL_LEAST_MEMBERS + 5) > goalTarget(deed, GOAL_LEAST_MEMBERS));
});

test("guild names and tags: tidied, and odd or rude ones refused", () => {
    assert.equal(cleanGuildName("  The   Wayfarers "), "The Wayfarers");
    assert.equal(guildNameProblem("The Wayfarers"), "");
    assert.notEqual(guildNameProblem("12345"), "");
    assert.notEqual(guildNameProblem("<script>"), "");
    assert.notEqual(guildNameProblem("fuck guild"), "");
    assert.equal(cleanTag(" wa y "), "WAY");
    assert.equal(tagProblem("WAY"), "");
    assert.notEqual(tagProblem("123"), "");
    assert.notEqual(tagProblem("W!"), "");
    assert.equal(cleanGuildName(42), "");
    assert.equal(cleanTag(null), "");
});

test("the guild hall: room grows with level, members take a few a day, officers what they like", () => {
    assert.equal(hallRoom(1), 20);
    assert.equal(hallRoom(10), 65);
    assert.equal(takesLeft(Rank.MEMBER, 0), TAKES_A_DAY);
    assert.equal(takesLeft(Rank.MEMBER, TAKES_A_DAY + 3), 0);
    assert.equal(takesLeft(Rank.OFFICER, 500), Infinity);
    assert.equal(takesLeft(Rank.LEADER, 500), Infinity);
});

test("the guild's crafting perk starts at level 3", () => {
    assert.equal(guildCraftMul(2), 1);
    assert.equal(guildCraftMul(3), 1.05);
    assert.equal(guildCraftMul(10), 1.15);
    assert.ok(levelPerk(3).includes("crafting"));
});
