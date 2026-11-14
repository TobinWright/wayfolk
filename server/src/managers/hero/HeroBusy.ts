import { IBS } from "../../app";
import { BUSY_MS, HERE_MOST } from "../../../../shared/Places";
import { S2C } from "../../constants/Routes";
import { Player } from "../player/Player";

// How busy each place is (shared/Places busyLevel): every BUSY_MS the heroes
// loaded (signed in or working away) are counted where they are - anyone's,
// not on their way - and, if that's changed, everyone signed in is told
// (S2C.EVENT_BUSY); one signing in is told as they do. Only the counts go out
// to everyone; whose they are only to one asking about a place (the user,
// 2026-11-02: the others' heroes there, in its window - S2C.EVENT_HERE).

export class HeroBusy {

    private time = BUSY_MS;
    private rows: [number, number][] = [];
    private key = "";
    private told = new Set<number>();       // (players told the counts as they are)

    public update(deltaTime: number, players: Player[]) {
        if ((this.time += deltaTime) >= BUSY_MS) {
            this.time = 0;
            const at = new Map<number, number>();
            for (const player of players) for (const hero of player.heroes)
                if (!hero.s.r.length) at.set(hero.s.p, (at.get(hero.s.p) ?? 0) + 1);
            const rows = Array.from(at).sort((a, b) => a[0] - b[0]), key = rows.join(";");
            if (key != this.key) { this.rows = rows; this.key = key; this.told.clear(); }
        }
        for (const player of players) {
            if (!player.online || this.told.has(player.id)) continue;
            this.told.add(player.id);
            player.send({ r: S2C.EVENT_BUSY, b: this.rows });
        }
    }

    // the others' heroes at a place now, not on their way: the first HERE_MOST,
    // none of theirs, none of anyone they've blocked or who's blocked them
    public sendHere(player: Player, placeId: number) {
        if (!Number.isInteger(placeId)) return;
        const l: [number, string][] = [];
        let n = 0;
        for (const other of IBS.players.all()) {
            if (other == player || player.social?.blocks.has(other.id) || other.social?.blocks.has(player.id)) continue;
            for (const hero of other.heroes) {
                if (hero.s.r.length || hero.s.p != placeId) continue;
                if (n++ < HERE_MOST) l.push([hero.id, hero.d.n]);
            }
        }
        player.send({ r: S2C.EVENT_HERE, p: placeId, l, n });
    }

    // (signing in: told again)
    public forget(player: Player) {
        this.told.delete(player.id);
    }

}
