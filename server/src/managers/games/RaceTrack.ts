import {
    Game, oddsText, RACE_BET_MS, RACE_COLORS, RACE_DONE_MS, RACE_KEYS, RACE_SLIMES, RACE_WIN_MS, RaceSlime, RaceState, RacePhase, raceOdds,
    RoomInfo, SLIME_NAMES,
} from "../../../../shared/Games";
import { Player } from "../player/Player";
import { Log } from "../../utils/Log";
import { GameRoom } from "./GameRoom";
import type { GameManager } from "./GameManager";

// A slime race's track (shared/Games.ts), one for each stake, run by
// GameManager's update(). Idle till someone watches; then betting opens on a
// new race's slimes, the race runs, and the results show, again and again
// while anyone's watching (or has a bet on). A bet's stake is kept in
// `game_bet` till its race is settled (any there when the server starts go
// back to who paid them). Taking a bet back (leaving while betting's open)
// gives the stake back; once the race is on, a bet stays on it, and is paid
// out whether they're still watching or not. Each settled bet adds to its
// player's `race_stat` (races bet on, the most won, what they've won less
// what they've paid). The track says in its chat who bet on what and who won.

const gold = (n: number) => n.toLocaleString("en-US");

// a bet on a race: who, and on which slime
interface Bet { name: string; slime: number; }

export class RaceTrack extends GameRoom {

    public phase = RacePhase.IDLE;
    private timer = 0;                          // ms left in this phase
    private slimes: RaceSlime[] = [];
    private chances: number[] = [];             // (each slime's chance of winning, 0 to 1)
    private bets = new Map<number, Bet>();      // (by player id)
    private at = 0;                             // ms since the race started
    private keys: number[][] = [];
    private times: number[] = [];
    private order: number[] = [];
    private won: [string, number][] = [];

    constructor(id: number, name: string, stake: number, private games: GameManager) {
        super(Game.SLIME_RACE, id, name, stake);
    }

    public info(): RoomInfo {
        return { i: this.id, n: this.name, a: this.ante, p: this.bets.size, s: 0, w: this.watchers.size };
    }

    public state(): RaceState {
        const run = this.phase == RacePhase.RUNNING || this.phase == RacePhase.DONE;
        return {
            g: this.game, i: this.id, n: this.name, a: this.ante, w: this.watchers.size,
            r: this.phase, t: Math.max(0, Math.round(this.timer)), l: this.slimes, b: [...this.bets.values()].map((b) => [b.name, b.slime]),
            x: Math.round(this.at), k: run ? this.keys : [], f: run ? this.times : [],
            o: this.phase == RacePhase.DONE ? this.order : [], p: this.won,
        };
    }

    // every tick: the race on
    public update(deltaTime: number) {
        if (this.phase == RacePhase.IDLE) {
            if (this.watchers.size) this.open();
            return;
        }
        this.at += deltaTime;
        if ((this.timer -= deltaTime) > 0) return;
        switch (this.phase) {
            case RacePhase.BETTING: this.run(); break;
            case RacePhase.RUNNING: this.settle(); break;
            case RacePhase.DONE: this.open(); break;
        }
    }

    // `player`'s bet on `slime`: the stake paid, or their bet moved to it
    public bet(player: Player, slime: any) {
        if (!Number.isInteger(slime) || slime < 0 || slime >= this.slimes.length) return;
        if (this.phase != RacePhase.BETTING) return this.games.refuse(player, "Betting's closed");
        const had = this.bets.get(player.id);
        if (had?.slime == slime || this.games.tooQuick(player)) return;
        if (had) {
            had.slime = slime;
            return this.changed();
        }
        if (player.inventory.gold < this.ante) return this.games.refuse(player, "Not enough gold for the stake");
        this.games.pay(player, -this.ante);
        this.games.query("INSERT INTO game_bet (player_id, room_id, gold) VALUES (?, ?, ?)", [player.id, this.id, this.ante])
            .catch(Log.catch("Games: couldn't save a bet"));
        this.bets.set(player.id, { name: player.record.displayName, slime });
        this.tell(`${player.record.displayName} bets ${gold(this.ante)} on ${this.slimes[slime].n}`);
        this.changed();
    }

    // out of the track (watching it): a bet taken back while betting's open (its stake back), else left on
    public leave(player: Player) {
        this.watchers.delete(player);
        if (this.phase == RacePhase.BETTING && this.bets.delete(player.id)) {
            this.games.pay(player, this.ante);
            this.games.query("DELETE FROM game_bet WHERE player_id = ? AND room_id = ?", [player.id, this.id])
                .catch(Log.catch("Games: couldn't clear a bet"));
            this.tell(`${player.record.displayName} took their bet back`);
        }
        this.changed();
    }

    // (an account being deleted) its bet gone, nothing saved for it
    public forget(id: number) {
        if (this.bets.delete(id)) this.games.query("DELETE FROM game_bet WHERE player_id = ? AND room_id = ?", [id, this.id]).catch(Log.catch("Games: couldn't clear a bet"));
    }

    // a new race's slimes and their odds, betting open (or idle, nobody watching)
    private open() {
        this.bets.clear();
        this.won = [];
        this.order = [];
        this.at = 0;
        if (!this.watchers.size) {
            this.phase = RacePhase.IDLE;
            this.slimes = [];
            return this.changed();
        }
        const names = pick(SLIME_NAMES, RACE_SLIMES), colors = pick([...Array(RACE_COLORS).keys()], RACE_SLIMES);
        const strengths = names.map(() => Math.exp(gauss() * 0.65)), all = strengths.reduce((a, b) => a + b, 0);
        this.chances = strengths.map((s) => s / all);
        this.slimes = names.map((n, i) => ({ n, c: colors[i], o: raceOdds(this.chances[i]) }));
        this.phase = RacePhase.BETTING;
        this.timer = RACE_BET_MS;
        this.changed();
    }

    // betting closed: how they'll finish (the winner by their chances, then each next of those left the same way),
    // the winner's time about RACE_WIN_MS and each next a little after, and how each runs there (a stretch or two
    // quicker or slower than the rest, now and then one dawdled)
    private run() {
        if (!this.watchers.size && !this.bets.size) return this.open();
        const left = this.slimes.map((_, i) => i);
        this.order = [];
        while (left.length) {
            let r = Math.random() * left.reduce((a, i) => a + this.chances[i], 0), k = 0;
            while (k < left.length - 1 && (r -= this.chances[left[k]]) > 0) k++;
            this.order.push(left.splice(k, 1)[0]);
        }
        let time = RACE_WIN_MS * (0.92 + Math.random() * 0.16);
        this.times = new Array(this.slimes.length);
        for (const s of this.order) {
            this.times[s] = Math.round(time);
            time += 150 + Math.random() * 700;
        }
        this.keys = this.slimes.map(() => {
            const legs = Array.from({ length: RACE_KEYS }, () => Math.random() < 0.08 ? 0.15 : 0.5 + Math.random());
            const all = legs.reduce((a, b) => a + b, 0);
            let sum = 0;
            return legs.map((l) => Math.round((sum += l) / all * 1000));
        });
        this.at = 0;
        this.phase = RacePhase.RUNNING;
        this.timer = Math.max(...this.times) + 1200;
        this.tell("They're off!");
        this.changed();
    }

    // the winner's backers paid the stake times its odds, each bet recorded, the stakes out of game_bet
    private settle() {
        const winner = this.order[0], slime = this.slimes[winner], pays = Math.floor(this.ante * slime.o / 10);
        this.won = [];
        const rows: number[][] = [];
        for (const [id, bet] of this.bets) {
            const won = bet.slime == winner ? pays : 0;
            if (won) { this.won.push([bet.name, won]); this.games.payId(id, won); }
            rows.push([id, 1, won, won - this.ante]);
        }
        if (rows.length) {
            this.games.query(`INSERT INTO race_stat (player_id, races, best, net) VALUES ? AS n ON DUPLICATE KEY UPDATE
                races = race_stat.races + n.races, best = GREATEST(race_stat.best, n.best), net = race_stat.net + n.net`, [rows])
                .catch(Log.catch("Games: couldn't save the race stats"));
            this.games.query("DELETE FROM game_bet WHERE room_id = ?", [this.id]).catch(Log.catch("Games: couldn't clear the bets"));
        }
        const names = this.won.map(([n]) => n);
        this.tell(`${slime.n} wins at ${oddsText(slime.o)}!` + (!names.length ? "" : names.length == 1 ? ` ${names[0]} wins ${gold(pays)}` :
            ` ${names.slice(0, -1).join(", ")} and ${names[names.length - 1]} win ${gold(pays)} each`));
        this.phase = RacePhase.DONE;
        this.timer = RACE_DONE_MS;
        this.changed();
    }

}

// n of `from` at random, none twice
function pick<T>(from: T[], n: number) {
    const left = from.slice(), got: T[] = [];
    while (got.length < n && left.length) got.push(left.splice(Math.floor(Math.random() * left.length), 1)[0]);
    return got;
}

// a number from the bell curve (mean 0, spread 1)
function gauss() {
    return Math.sqrt(-2 * Math.log(1 - Math.random())) * Math.cos(2 * Math.PI * Math.random());
}
