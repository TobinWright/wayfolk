import { IBS } from "../../app";
import { S2C } from "../../constants/Routes";
import { ALL_STEPS, isGear, nextStep, QUICK_START, quickStart, Step, stepDone, STEPS } from "../../../../shared/Guide";
import { Skill, XP_AT, heroXp } from "../../../../shared/Heroes";
import { itemName, recipeOf, TaskKind } from "../../../../shared/Tasks";
import { Player } from "../player/Player";
import { Log } from "../../utils/Log";

// First steps (shared/Guide.ts): which a player has done, `player.guide` (a
// bit a step; NULL: their account's from before there was a guide). A step
// done is saved there and then, paid (gold and maybe an item, into the stash)
// and told them (S2C.PLAYER_GUIDE, a note in the chat). Steps are seen done
// where they happen: hiring, a to-do list or gear changed (`check`, looking
// at how things are), a craft or an adventure finished (`did`), the
// Inventory opened (`seen`, from the client). When each was done is kept
// (`guideAt`): the quick start runs from the first hire (shared/Guide.ts).

export class GuideManager {

    public async init() {
        const conn = await IBS.db.getConnection();
        try {
            for (const column of ["guide INT NULL", "guide_at JSON NULL"]) {
                try {
                    await conn.query(`ALTER TABLE player ADD COLUMN ${column}`);
                } catch (e) {
                    if ((e as any).errno != 1060) throw e;     // (already there)
                }
            }
        } finally {
            conn.release();
        }
    }

    // signing in: one from before the guide has what they've clearly done
    // already counted, unpaid; then anything done since checked
    public async signIn(player: Player) {
        if (player.record.guide == null) {
            player.record.guide = this.already(player);
            await this.save(player);
        }
        this.check(player);
    }

    // the steps a player from before the guide has clearly done
    private already(player: Player) {
        const items = Array.from(player.inventory.items.values()).filter((i) => i.amount > 0).map((i) => i.id);
        const gear = ([] as number[]).concat(...player.heroes.map((h) => h.d.g ?? [])).filter((id) => id);
        const adventured = player.heroes.some((h) => heroXp(h.d)[Skill.SCOUTING] > XP_AT[h.d.k[Skill.SCOUTING]]);
        let done = this.state(player);
        const add = (s: Step, yes: boolean) => { if (yes) done |= 1 << s; };
        add(Step.GATHER, items.length > 0);
        add(Step.LOOK, items.length > 0);
        add(Step.CRAFT, gear.length > 0 || items.some(isGear));
        add(Step.ADVENTURE, adventured);
        return done;
    }

    // the steps how things are now shows done
    private state(player: Player) {
        const heroes = player.heroes;
        let done = 0;
        const add = (s: Step, yes: boolean) => { if (yes) done |= 1 << s; };
        add(Step.HIRE, heroes.length >= 1);
        add(Step.SECOND, heroes.length >= 2);
        add(Step.GATHER, heroes.some((h) => [...h.s.q, h.s.w, h.s.b].some((t) => t?.k == TaskKind.GATHER)));
        add(Step.EQUIP, heroes.some((h) => (h.d.g ?? []).some((id) => id)));
        add(Step.BACKUP, heroes.some((h) => h.s.b && h.s.b.k != TaskKind.REST));      // (resting: what they do with none)
        return done;
    }

    // after something that may have done a step: hiring, a list or gear changed
    public check(player: Player) {
        const g = player.record.guide ?? 0;
        if (g == ALL_STEPS) return;
        const now = this.state(player);
        for (const d of STEPS) if (stepDone(now, d.s)) this.did(player, d.s);
    }

    // the client saying a step of its own is done (StepDef.seen): taken if it could be
    public seen(player: Player, s: any) {
        if (s == Step.LOOK && Array.from(player.inventory.items.values()).some((i) => i.amount > 0)) this.did(player, Step.LOOK);
    }

    // a step done (signed out too: a craft finishing while they're away)
    public did(player: Player, s: Step) {
        const g = player.record.guide ?? 0;
        if (stepDone(g, s)) return;
        const d = STEPS.find((d) => d.s == s);
        if (!d) return;
        player.record.guide = g | (1 << s);
        player.record.guideAt[s] = Date.now();
        this.save(player).catch(Log.catch("Couldn't save the guide", { playerId: player.id }));

        const inv = player.inventory;
        inv.adjustGold(d.g);
        if (d.i) inv.adjustItem(d.i[0], d.i[1]);
        player.stashDirty = true;
        if (!player.online) return;
        if (s == Step.GATHER) IBS.chests.soon(player);     // (the first loot chest, soon after: shared/Chests.ts)
        IBS.heroes.tasks.sendStash(player);
        this.send(player, s);
        const reward = `+${d.g}g${d.i ? ` and ${d.i[1]} ${itemName(d.i[0])}` : ""}`;
        const next = nextStep(player.record.guide);
        const quick = s == Step.HIRE && this.quick(player) > 1
            ? ` Quick start: gathering and crafting go ${QUICK_START}x faster till your first steps are done` : "";
        IBS.chat.note(player, next ? `First steps: ${d.name} - done (${reward}).${quick}`
            : `First steps all done (${reward}). The quick start's over: things take their usual time now. Have fun out there!`);
    }

    // how many times quicker their gathering and crafting go (shared/Guide.ts quickStart)
    public quick(player: Player) {
        return quickStart(player.record.guide ?? ALL_STEPS, player.record.guideAt[Step.HIRE] ?? 0);
    }

    // their steps as the client has them (s: the one just done; a: when each was)
    public send(player: Player, s?: Step) {
        player.send({ r: S2C.PLAYER_GUIDE, d: player.record.guide ?? 0, a: player.record.guideAt, s });
    }

    private async save(player: Player) {
        const conn = await IBS.db.getConnection();
        try {
            await conn.query("UPDATE player SET guide = ?, guide_at = ? WHERE id = ?", [player.record.guide, JSON.stringify(player.record.guideAt), player.id]);
        } finally {
            conn.release();
        }
    }

}
