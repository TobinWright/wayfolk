import { RowDataPacket } from "mysql2";
import { IBS } from "../../app";
import { S2C } from "../../constants/Routes";
import { fillSkills, HeroData, heroXp, SKILL_NAMES } from "../../../../shared/Heroes";
import { Board, BOARD_TOP, BoardRow, BOARDS, BoardView, isBoard, REBUILD_MS, SKILL_BOARD } from "../../../../shared/Leaderboards";
import { ProfileRank } from "../../../../shared/Profile";
import { Player } from "../player/Player";
import { Log } from "../../utils/Log";

// The leaderboards (shared/Leaderboards.ts): every REBUILD_MS each board is
// worked out again from what's saved, those loaded taken as they are now,
// and kept, sorted, with where each player first comes on it. Asked for one,
// it's sent from what's kept.

type Row = RowDataPacket & { [key: string]: any };

interface HeroEntry { id: number; player: number; d: HeroData; total: number; xp: number; }

interface Kept {
    rows: BoardRow[];                   // all of them, sorted, ranked
    first: Map<number, BoardRow>;       // (player id: their first row)
}

export class LeaderboardManager {

    private boards = new Map<number, Kept>();
    private builtAt = 0;
    private building: Promise<void> = null;

    public async init() {
        await this.rebuild();
        setInterval(() => this.rebuild().catch(Log.catch("Couldn't rebuild the leaderboards")), REBUILD_MS);
    }

    private async query(sql: string, args: any[] = []): Promise<Row[]> {
        const conn = await IBS.db.getConnection();
        try {
            const [result] = await conn.query(sql, args);
            return result as Row[];
        } finally {
            conn.release();
        }
    }

    public send(player: Player, board: number) {
        if (!Number.isInteger(board) || !isBoard(board)) return;
        const kept = this.boards.get(board);
        const view: BoardView = {
            b: board,
            l: kept?.rows.slice(0, BOARD_TOP) ?? [],
            m: kept?.first.get(player.id) ?? null,
            c: kept?.rows.length ?? 0,
            t: this.builtAt,
        };
        player.send({ r: S2C.LEADER_BOARD, o: view });
    }

    // a player's best places in the top BOARD_TOP, best first: [board, rank, how many on it, the hero (hero boards)]
    // (on their profile: not Wealth's or Blackjack's, which are their gold)
    public placesOf(playerId: number, most: number): ProfileRank[] {
        const out: ProfileRank[] = [];
        for (const [b, kept] of this.boards) {
            if (b == Board.WEALTH || b == Board.BLACKJACK) continue;
            const row = kept.first.get(playerId);
            if (row && row.r <= BOARD_TOP) out.push(row.h ? [b, row.r, kept.rows.length, row.h] : [b, row.r, kept.rows.length]);
        }
        return out.sort((a, b) => a[1] - b[1] || BOARDS.indexOf(a[0]) - BOARDS.indexOf(b[0])).slice(0, most);
    }

    //#region working them out

    public rebuild() {
        return this.building ??= this.build().finally(() => this.building = null);
    }

    private async build() {
        const names = new Map<number, string>(), supporters = new Set<number>(), now = new Date();
        for (const r of await this.query("SELECT id, display_name, premium_until FROM player")) {
            names.set(r.id, r.display_name);
            if (new Date(r.premium_until) > now) supporters.add(r.id);
        }

        // heroes: the saved, then the loaded as they are now
        const heroes = new Map<number, HeroEntry>();
        const addHero = (id: number, player: number, d: HeroData) => {
            const xp = heroXp(d);
            heroes.set(id, { id, player, d, total: d.k.reduce((a, l) => a + l, 0), xp: xp.reduce((a, v) => a + v, 0) });
        };
        for (const r of await this.query("SELECT id, player_id, data FROM hero")) {
            try { addHero(r.id, r.player_id, fillSkills(JSON.parse(r.data))); } catch { }
        }
        const gold = new Map<number, number>();
        for (const r of await this.query("SELECT player_id, gold FROM inventory")) gold.set(r.player_id, Number(r.gold));
        for (const p of IBS.players.all()) {
            names.set(p.id, p.record.displayName);
            if (p.record.isPremium()) supporters.add(p.id); else supporters.delete(p.id);
            for (const h of p.heroes) addHero(h.id, p.id, h.d);
            if (p.inventory) gold.set(p.id, p.inventory.gold);
        }

        // each player's best hero (by total XP), to show them by
        const best = new Map<number, HeroEntry>();
        for (const h of heroes.values()) {
            const b = best.get(h.player);
            if (!b || h.xp > b.xp || (h.xp == b.xp && h.id < b.id)) best.set(h.player, h);
        }

        const heroRow = (h: HeroEntry, v: number, x: number): BoardRow =>
            ({ r: 0, i: h.player, n: names.get(h.player) ?? "", h: h.d.n, j: h.d.j, l: h.d.l, v, x });
        const playerRow = (id: number, v: number, x: number): BoardRow => {
            const row: BoardRow = { r: 0, i: id, n: names.get(id) ?? "", v, x };
            const h = best.get(id);
            if (h) row.l = h.d.l;
            return row;
        };

        const all = [...heroes.values()];
        const built = new Map<number, Kept>();
        // (ties: the earlier hired or signed up first)
        // (heroes by total level, then by XP)
        built.set(Board.LEVEL, this.ranked(all.slice().sort((a, b) => b.total - a.total || b.xp - a.xp || a.id - b.id).map((h) => heroRow(h, h.xp, h.total)),
            (a, b) => a.x == b.x && a.v == b.v));
        SKILL_NAMES.forEach((_, k) => {
            const sorted = all.filter((h) => heroXp(h.d)[k] > 0).sort((a, b) => heroXp(b.d)[k] - heroXp(a.d)[k] || a.id - b.id);
            built.set(SKILL_BOARD + k, this.ranked(sorted.map((h) => heroRow(h, heroXp(h.d)[k], h.d.k[k]))));
        });

        const players = (rows: [number, number, number][]) =>
            this.ranked(rows.filter(([id]) => names.has(id)).sort((a, b) => b[1] - a[1] || a[0] - b[0]).map(([id, v, x]) => playerRow(id, v, x)));
        built.set(Board.WEALTH, players([...gold].filter(([, g]) => g > 0).map(([id, g]) => [id, g, 0])));
        const events = await this.query("SELECT player_id, SUM(points) pts, COUNT(*) n FROM event_share WHERE points > 0 GROUP BY player_id");
        const eventRows = players(events.map((r) => [r.player_id, Math.round(Number(r.pts)), Number(r.n)]));
        for (const row of eventRows.rows) if (supporters.has(row.i)) row.s = 1;      // (their Supporter tag)
        built.set(Board.EVENTS, eventRows);
        const games = await this.query("SELECT player_id, hands, net FROM game_stat WHERE hands > 0");
        built.set(Board.BLACKJACK, players(games.map((r) => [r.player_id, Number(r.net), Number(r.hands)])));
        // (this season's points, shared/Seasons.ts: in memory, as they are now)
        built.set(Board.SEASON, players(IBS.seasons.scores().map(([id, v]) => [id, Math.floor(v), 0])));

        for (const b of BOARDS) if (!built.has(b)) built.set(b, { rows: [], first: new Map() });
        this.boards = built;
        this.builtAt = Date.now();
    }

    // ranks given down sorted rows (level ones share one: 1, 2, 2, 4)
    private ranked(rows: BoardRow[], same = (a: BoardRow, b: BoardRow) => a.v == b.v): Kept {
        const first = new Map<number, BoardRow>();
        rows.forEach((row, k) => {
            row.r = k > 0 && same(rows[k - 1], row) ? rows[k - 1].r : k + 1;
            if (!first.has(row.i)) first.set(row.i, row);
        });
        return { rows, first };
    }

    //#endregion

}
