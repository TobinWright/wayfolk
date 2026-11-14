import { IBS } from "../../app";
import { S2C } from "../../constants/Routes";
import { Bounty, BOUNTY_EVERY_MS, BOUNTY_LEAST, BOUNTY_MS, BOUNTY_SHARE, ChestTier } from "../../../../shared/Chests";
import { gatherMs, TaskKind } from "../../../../shared/Tasks";
import { Player } from "../player/Player";

// Bounties (shared/Chests.ts): for each player signed in, when the next might
// come (BOUNTY_EVERY_MS), and the one up now: a material one of their heroes
// is gathering there now, how many (what they'd gather in BOUNTY_MS, by the
// pace of all gathering it), how many since (HeroTasks: gathered()) and till
// when. Done: a silver chest (ChestManager.give). Kept only in memory.

interface Up { m: number; n: number; d: number; until: number; }
interface Bounties { next: number; up: Up; }

export class BountyManager {

    public static CHECK_MS = 1000;

    private of = new Map<number, Bounties>();       // (player id)
    private since = 0;

    public update(deltaTime: number) {
        if ((this.since += deltaTime) < BountyManager.CHECK_MS) return;
        this.since = 0;
        const now = Date.now(), online = new Set<number>();
        for (const player of IBS.players.online()) {
            online.add(player.id);
            if (!player.heroes.length) continue;
            let b = this.of.get(player.id);
            if (!b) this.of.set(player.id, b = { next: now + this.between(), up: null });
            if (b.up && now >= b.up.until) {
                IBS.analytics.track.used(player, "BOUNTY_MISSED");
                b.up = null;
                b.next = now + this.between();
                player.send({ r: S2C.PLAYER_BOUNTY, b: null });
            }
            if (!b.up && now >= b.next) this.offer(player, b, now);
        }
        for (const id of this.of.keys()) if (!online.has(id)) this.of.delete(id);
    }

    // signed in (again): the one up now, if there's one
    public signIn(player: Player) {
        const up = this.of.get(player.id)?.up;
        if (up) player.send({ r: S2C.PLAYER_BOUNTY, b: this.view(up) });
    }

    // a material gathered into their stash (HeroTasks)
    public gathered(player: Player, m: number, n: number) {
        const b = this.of.get(player.id), up = b?.up;
        if (!up || up.m != m || !player.online) return;
        up.d = Math.min(up.n, up.d + n);
        if (up.d < up.n) {
            player.send({ r: S2C.PLAYER_BOUNTY, b: this.view(up) });
            return;
        }
        player.send({ r: S2C.PLAYER_BOUNTY, b: { ...this.view(up), w: 1 } });
        IBS.analytics.track.used(player, "BOUNTY_DONE");
        b.up = null;
        b.next = Date.now() + this.between();
        IBS.chests.give(player, ChestTier.SILVER);
    }

    // (none of their heroes gathering at the spot now: tried again in a minute)
    private offer(player: Player, b: Bounties, now: number) {
        const at = player.heroes.filter((h) => h.s.w?.k == TaskKind.GATHER && h.s.w.m != null && !h.s.r?.length);
        if (!at.length) {
            b.next = now + 60000;
            return;
        }
        const m = at[Math.floor(Math.random() * at.length)].s.w.m;
        const quick = IBS.guide.quick(player);
        const pace = at.filter((h) => h.s.w.m == m).reduce((sum, h) => sum + quick / gatherMs(h.d, m), 0);     // (a ms, all of them)
        const n = Math.max(BOUNTY_LEAST, Math.round(pace * BOUNTY_MS * BOUNTY_SHARE));
        b.up = { m, n, d: 0, until: now + BOUNTY_MS };
        IBS.analytics.track.used(player, "BOUNTY_UP");
        player.send({ r: S2C.PLAYER_BOUNTY, b: this.view(b.up) });
    }

    private view(up: Up): Bounty {
        return { m: up.m, n: up.n, d: up.d, e: Math.max(0, up.until - Date.now()) };
    }

    private between() {
        const [least, most] = BOUNTY_EVERY_MS;
        return least + Math.random() * (most - least);
    }

}
