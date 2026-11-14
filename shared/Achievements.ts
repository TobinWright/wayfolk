// Achievements (the user, 2026-11-05: "Dopamine the shit out of this thing";
// the list is Claude's, open to change): things done, each told once with a
// banner as it's done and kept on the player (player.achievements). Only for
// show: nothing's paid for them. The client sees them done (it's what it sees
// happen: an item coming in, a level, a chest) and says so
// (C2S.PLAYER_ACHIEVE); the server keeps them. Add new ones at the end: their
// ids are what's saved.

export interface AchievementDef { id: string; name: string; text: string; }

export const ACHIEVEMENTS: AchievementDef[] = [
    { id: "hire", name: "Hired Help", text: "Hire your first hero" },
    { id: "heroes3", name: "A Little Band", text: "Have 3 heroes" },
    { id: "steps", name: "Off and Running", text: "Finish your first steps" },
    { id: "chest", name: "Treasure!", text: "Open a loot chest" },
    { id: "golden", name: "Gold Rush", text: "Open a golden chest" },
    { id: "mimic", name: "Biter Bitten", text: "Beat a mimic" },
    { id: "lucky", name: "Lucky Find", text: "Get a lucky gather" },
    { id: "streak10", name: "On a Roll", text: "Get a x10 delivery streak" },
    { id: "fine", name: "Fine Work", text: "Make a Fine item" },
    { id: "superior", name: "A Cut Above", text: "Make a Superior item" },
    { id: "masterwork", name: "Masterpiece", text: "Make a Masterwork item" },
    { id: "level10", name: "Skilled", text: "Reach level 10 in a skill" },
    { id: "level25", name: "Expert", text: "Reach level 25 in a skill" },
    { id: "level50", name: "Master", text: "Reach level 50 in a skill" },
    { id: "fight", name: "First Blood", text: "Win a fight" },
    { id: "event", name: "Lending a Hand", text: "Be paid for an event" },
    { id: "eventtop", name: "Podium", text: "Finish in an event's top 3" },
    { id: "bounty", name: "Bounty Hunter", text: "Finish a bounty" },
    { id: "daily3", name: "Coming Back", text: "Keep a 3-day streak" },
    { id: "daily7", name: "Regular", text: "Keep a 7-day streak" },
    { id: "gold100", name: "Pocket Money", text: "Have 100 gold" },
    { id: "gold1k", name: "Well Off", text: "Have 1,000 gold" },
    { id: "gold10k", name: "Rolling in It", text: "Have 10,000 gold" },
    { id: "pile100", name: "Stockpile", text: "Have 100 of one thing" },
    { id: "pile1k", name: "Hoarder", text: "Have 1,000 of one thing" },
];

export function achievementOf(id: string) {
    return ACHIEVEMENTS.find((a) => a.id == id);
}
