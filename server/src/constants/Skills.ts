import { Utils } from "../utils/Utils";

export class Skills {

    public static getRandom(amount: number) {
        const numOfSkills = Object.keys(Skill).length / 2;
        const indices = [];
        for (let i = 1; i < numOfSkills; i++)
            indices.push(i);

        const skills = [];
        while (skills.length < amount) {
            const level = Utils.randomInt(1, 6);
            const index = Utils.randomIndex(indices.length);
            skills.push([indices.splice(index, 1)[0], level]);
        }

        return skills;
    }

}

export enum Skill {
    NONE,

    ACROBATICS,
    ALCHEMY,
    ANATOMY,
    ANTHROPOLOGY,
    APPRAISING,
    ASTROLOGY,
    ARTISTRY,

    BALANCING,
    BARTERING,
    BLACKMAIL,
    BLUFFING,
    BOXING,
    BREWING,

    CALIGRAPHY,
    CAMPING,
    CAMOUFLAGE,
    CARPENTRY,
    CARTOGRAPHY,
    COBBLING,
    COOKING,
    CRYPTOGRAPHY,

    DANCING,
    DEMOLITION,
    DETECTION,
    DISARM_TRAP,
    DIPLOMACY,
    DISARM,
    DISGUISE,

    ENCHANTING,
    ENGINEERING,
    ESCAPE,

    FARMING,
    FENCING,
    FIRST_AID,
    FISHING,
    FLIRTING,
    FOLKLORE,
    FORTUNE_TELLING,

    GAMBLING,

    HEALING_MAGIC,
    HERBALISM,
    HUNTING,
    HYNOTISM,

    IMPERSONATION,
    INVESTIGATION,

    JUGGLING,
    JUMPING,

    LANGUAGE,
    LEATHER_WORKING,
    LIP_READING,

    MINING,

    NAVIGATION,

    PICKPOCKETING,

    RESEARCH,
    RIDING,

    SCRIBING,
    SCULPTING,
    SEAMANSHIP,
    SEDUCTION,
    SEWING,
    SLIGHT_OF_HAND,
    STEALTH,
    STONEMASONRY,
    STORYTELLING,
    SURVIVAL,
    SWIMMING,

    TAILORING,
    TAMING,
    TEACHING,
    TRACKING,
    TRAPPING,

    WEAVING
}