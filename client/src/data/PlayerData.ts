import { quickStart, Step } from "../../../shared/Guide";

export class PlayerData {

    public id: number;
    public type: string;
    public role: number;
    public name: string;
    public premiumUntil: number;
    public guide = 0;           // the first steps done (a bit a Step, shared/Guide.ts)
    public guideAt: number[] = [];  // (and when each was, ms by Step)
    public chest: { i: number; t: number; until: number; d?: number } = null;
    public daily = { s: 0, t: 0 };     // the daily streak going (s), and whether today's chest is opened (t: 1)
    public achievements = new Map<string, number>();   // those done, and when (shared/Achievements.ts)
    public bounty: { m: number; n: number; d: number; until: number; w?: number } = null;  // the bounty up (until: performance.now(); shared/Chests.ts)  // the loot chest up now (until: performance.now() it's gone at; shared/Chests.ts)
    public email: string = null;    // an email or Google account's address (a guest: none)
    public confirmed = false;       // (proven theirs)

    public maxMembers: number;
    public maxParties: number;

    public load(json: any) {
        this.id = json.id;
        this.type = json.type;
        this.role = json.role;
        this.name = json.name;
        this.premiumUntil = new Date(json.premium).getTime() || 0;
        this.email = json.email ?? null;
        this.confirmed = !!json.confirmed;
    }

    // how many times quicker their gathering and crafting go (shared/Guide.ts quickStart)
    public quick() {
        return quickStart(this.guide, this.guideAt[Step.HIRE] ?? 0);
    }

}