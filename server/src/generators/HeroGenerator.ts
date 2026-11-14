import { readFileSync } from "fs";
import { join } from "path";
import { BoardDef, HeroData, JOBS, Race, RACES, rollSpecialties, rollTraits, Sex, SKILL_NAMES, START_TOWNS } from "../../../shared/Heroes";
import { freeChoices, lookCounts } from "../../../shared/Wardrobe";
import { IBS } from "../app";
import { NameGenerator } from "./NameGenerator";
import { Utils } from "../utils/Utils";

// The premade heroes on the hiring board (DESIGN.md "Heroes"): stats rolled
// round 10 (6-14 on a level 1 board, higher on higher ones), 2-3 core skills
// over level 1 (the first one of their job's), no extended skills (those are
// learned), 1-2 specialties (any skill: rollSpecialties), 1-2 traits (humans one more), looks in Lithalia's people and one of the
// START_TOWNS to start from.

// how many hairstyles and outfits there are (the client's copy of Lithalia's, npm run looks, then Wayfolk's own)
const readLooks = (file: string) => JSON.parse(readFileSync(join(process.cwd(), "../client/src/people", file), "utf8"));
const LOOKS = readLooks("looks.json"), OWN_LOOKS = readLooks("ownlooks.json");
const HAIRS = LOOKS.hairs.length + OWN_LOOKS.hairs.length, OUTFITS = LOOKS.outfits.length + OWN_LOOKS.outfits.length;
export const LOOK_COUNTS = lookCounts(HAIRS, OUTFITS);     // (a hero's cosmetics changed: shared/Wardrobe)

export class HeroGenerator {

    public static make(board: BoardDef): HeroData {
        const level = board.level;
        const sex = Utils.randomBool() ? Sex.MALE : Sex.FEMALE;
        const race = Race.HUMAN;
        const job = Utils.randomIndex(JOBS.length);

        // two dice of 0-4 over 6 (more on higher boards): mostly 9-11
        const stats = Array.from({ length: 5 }, () => 6 + (level - 1) * 2 + Utils.randomInt(0, 4) + Utils.randomInt(0, 4));

        const skills = SKILL_NAMES.map(() => 1);
        const trained = Utils.randomInt(2, 3) + (level - 1);
        const favoured = JOBS[job].skills;
        const order = SKILL_NAMES.map((_, i) => i).filter((i) => i != favoured[0]);
        Utils.shuffleArray(order);
        order.unshift(favoured[Utils.randomIndex(favoured.length)]);
        for (const s of order.slice(0, trained)) skills[s] = Utils.randomInt(2, 5 * level);

        const specialties = rollSpecialties();

        const traits = rollTraits(Utils.randomInt(1, 2) + RACES[race].traits, level);

        // (from everyone's: a hero hired isn't wearing something theirs to pick only with a pack)
        const looks = LOOK_COUNTS.map((n, look) => {
            const free = freeChoices(IBS.cosmetics.catalog, look, n);
            return free[Utils.randomIndex(free.length)];
        });

        const start = Utils.randomIndex(START_TOWNS.length);

        return { n: NameGenerator.getCharacterName(sex), x: sex, r: race, j: job, s: stats, k: skills, e: [], p: specialties, t: traits, l: looks, o: start };
    }

}
