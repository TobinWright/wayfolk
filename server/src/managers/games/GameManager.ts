import { RowDataPacket } from "mysql2";
import { IBS } from "../../app";
import { S2C } from "../../constants/Routes";
import { CHAT_GAP_MS, cleanChat } from "../../../../shared/Chat";
import {
    BJ_ANTES, BJ_AWAY_TURNS, BJ_DEALER_MS, BJ_SEAT_GAP_MS, BJ_DEALER_STANDS, BJ_DONE_MS, BJ_NEXT_MS, BJ_SEATS, BJ_TURN_MS, BjPhase, BjStats,
    Game, handRank, handValue, RACE_STAKES, RACE_TRACKS, ROOM_NAMES, RoomInfo, RoomLine, RoomState,
} from "../../../../shared/Games";
import { InventoryRecord } from "../database/InventoryRecord";
import { Player } from "../player/Player";
import { Log } from "../../utils/Log";
import { GameRoom } from "./GameRoom";
import { RaceTrack } from "./RaceTrack";

// Games (shared/Games.ts): each game's rooms, in memory. A player watches
// one room at a time (and may sit in one of its seats); going into another,
// leaving or signing out takes them out of it (and up from their seat). Who
// sits, how many watch and the round go to everyone in the room whenever they
// change; the room's chat to everyone in it, its last ROOM_KEPT lines sent on
// coming in. Each ante always has a room nobody sits in (open): sitting at the
// last opens another, and a spare one nobody's in (sitting or watching) goes.
// Blackjack's rounds (shared/Games.ts) are run by update(), every tick; the
// table says in its chat who sits down and gets up and who won (or what the
// house kept). Whoever lets BJ_AWAY_TURNS turns in a row run out is stood up.
// Sitting down and getting up are BJ_SEAT_GAP_MS apart at least. The antes in
// a pot are kept in `game_ante` till the round's settled (or its room goes):
// any there when the server starts are from a round it stopped in, and go
// back to who paid them. Each settled round adds to its players' `game_stat`
// (hands played, the biggest pot won, what they've won less what they paid).
// How many sit at blackjack's tables, and how many are at the slime races
// (watching or betting), go to everyone as they change (the games' buttons by
// the menus). Slime racing's tracks (RaceTrack), one for
// each stake, are always there, and run their own races.

type Row = RowDataPacket & { [key: string]: any };
const gold = (n: number) => n.toLocaleString("en-US");

class Room extends GameRoom {

    public seats: (Player | null)[];
    public missed = new Map<Player, number>();  // (turns in a row each sitting let run out)

    // the round
    public phase = BjPhase.IDLE;
    public timer = 0;                           // ms left in this phase (or on the turn)
    public turn = -1;
    public playing: (Player | null)[];          // who was dealt in at each seat (null: nobody, or they got up)
    public hands: (number[] | null)[];
    public done: boolean[];                     // (stood or bust)
    public dealer: number[] = [];
    public pot = 0;
    public paid: number[] = [];                 // (who paid in, player ids: their antes in game_ante)
    public won: number[] = [];
    private deck: number[] = [];

    constructor(game: Game, id: number, name: string, ante: number, seats: number) {
        super(game, id, name, ante);
        this.seats = new Array(seats).fill(null);
        this.clearRound();
    }

    public sitting() {
        return this.seats.filter((s) => s).length;
    }

    // how many watch without sitting
    public spectators() {
        let n = 0;
        for (const p of this.watchers) if (!this.seats.includes(p)) n++;
        return n;
    }

    public info(): RoomInfo {
        return { i: this.id, n: this.name, a: this.ante, p: this.sitting(), s: this.seats.length, w: this.spectators() };
    }

    public state(): RoomState {
        const hidden = this.phase == BjPhase.PLAY;      // (the dealer's second card, face down till their turn)
        return {
            g: this.game, i: this.id, n: this.name, a: this.ante, s: this.seats.map((s) => s?.record.displayName ?? null), w: this.spectators(),
            r: this.phase, t: Math.max(0, Math.round(this.timer)), u: this.turn, h: this.hands, d: this.dealer.map((c, i) => hidden && i == 1 ? -1 : c),
            p: this.pot, o: this.won,
        };
    }

    public clearRound() {
        const n = this.seats.length;
        this.turn = -1;
        this.playing = new Array(n).fill(null);
        this.hands = new Array(n).fill(null);
        this.done = new Array(n).fill(false);
        this.dealer = [];
        this.pot = 0;
        this.won = [];
    }

    // a fresh deck, shuffled, for each round
    public shuffle() {
        this.deck = Array.from({ length: 52 }, (_, i) => i);
        for (let i = this.deck.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [this.deck[i], this.deck[j]] = [this.deck[j], this.deck[i]];
        }
    }

    public draw() {
        return this.deck.pop();
    }

}

export class GameManager {

    private rooms: Map<number, Room>[] = [];        // (a game's, by id)
    private tracks = new Map<number, RaceTrack>();
    private nextId = 0;
    private watching = new Map<Player, GameRoom>();
    private lastSaid = new Map<number, number>();      // (player id: when they last said something in a room)
    private lastSeat = new Map<number, number>();      // (player id: when they last sat down or got up)
    private sat = 0;                                   // (how many sit at blackjack's tables, as last told)
    private racing = 0;                                // (how many are at slime racing's tracks, as last told)

    constructor() {
        this.rooms[Game.BLACKJACK] = new Map();
        this.tidy(Game.BLACKJACK);
        RACE_STAKES.forEach((stake, i) => { const id = this.nextId++; this.tracks.set(id, new RaceTrack(id, RACE_TRACKS[i], stake, this)); });
    }

    // (before players are loaded) the antes of a round the server stopped in, back to who paid them
    public async init() {
        await this.query(`CREATE TABLE IF NOT EXISTS game_ante (
            player_id INT NOT NULL PRIMARY KEY,
            gold INT NOT NULL)`);
        const left = await this.query<Row[]>("SELECT player_id, gold FROM game_ante");
        for (const r of left) await this.query("UPDATE inventory SET gold = gold + ? WHERE player_id = ?", [r.gold, r.player_id]);
        if (left.length) Log.info(`Games: ${left.length} antes given back, from a round the server stopped in`);
        await this.query("DELETE FROM game_ante");
        await this.query(`CREATE TABLE IF NOT EXISTS game_bet (
            player_id INT NOT NULL,
            room_id INT NOT NULL,
            gold INT NOT NULL,
            PRIMARY KEY (player_id, room_id))`);
        const bets = await this.query<Row[]>("SELECT player_id, gold FROM game_bet");
        for (const r of bets) await this.query("UPDATE inventory SET gold = gold + ? WHERE player_id = ?", [r.gold, r.player_id]);
        if (bets.length) Log.info(`Games: ${bets.length} slime race bets given back, from races the server stopped in`);
        await this.query("DELETE FROM game_bet");
        await this.query(`CREATE TABLE IF NOT EXISTS race_stat (
            player_id INT NOT NULL PRIMARY KEY,
            races INT NOT NULL DEFAULT 0,
            best INT NOT NULL DEFAULT 0,
            net BIGINT NOT NULL DEFAULT 0)`);
        await this.query(`CREATE TABLE IF NOT EXISTS game_stat (
            player_id INT NOT NULL PRIMARY KEY,
            hands INT NOT NULL DEFAULT 0,
            best INT NOT NULL DEFAULT 0,
            net BIGINT NOT NULL DEFAULT 0)`);
    }

    // every tick: each room's round on, and how many sit told if it changed
    public update(deltaTime: number) {
        let racing = 0;
        for (const track of this.tracks.values()) racing += track.watchers.size;
        const sat = this.sitting(Game.BLACKJACK);
        if (sat != this.sat || racing != this.racing) { this.sat = sat; this.racing = racing; IBS.players.sendAll({ r: S2C.GAME_PLAYING, n: sat, s: racing }); }
        for (const rooms of this.rooms)
            for (const room of rooms.values()) {
                if (room.phase == BjPhase.IDLE) {
                    if (room.sitting()) this.next(room);
                    continue;
                }
                if ((room.timer -= deltaTime) > 0) continue;
                switch (room.phase) {
                    case BjPhase.NEXT: this.deal(room); break;
                    case BjPhase.PLAY: this.timedOut(room); break;
                    case BjPhase.DEALER: this.dealerDraws(room); break;
                    case BjPhase.DONE: room.clearRound(); this.next(room); break;
                }
            }
        for (const track of this.tracks.values()) track.update(deltaTime);
    }

    // how many sit at a game's tables
    private sitting(game: Game) {
        let n = 0;
        for (const room of this.rooms[game].values()) n += room.sitting();
        return n;
    }

    // (with signing in) how many sit at blackjack's tables, and how many are at the slime races
    public send(player: Player) {
        player.send({ r: S2C.GAME_PLAYING, n: this.sat, s: this.racing });
    }

    // a game's rooms, by ante (then the oldest first)
    public list(player: Player, game: any) {
        const rooms = game === Game.SLIME_RACE ? this.tracks : Number.isInteger(game) ? this.rooms[game] : null;
        if (rooms) player.send({ r: S2C.GAME_ROOMS, g: game, l: [...rooms.values()].sort((a, b) => a.ante - b.ante || a.id - b.id).map((r) => r.info()) });
    }

    public watch(player: Player, game: any, id: any) {
        const room = !Number.isInteger(id) ? null : game === Game.SLIME_RACE ? this.tracks.get(id) : Number.isInteger(game) ? this.rooms[game]?.get(id) : null;
        if (!room) return this.refuse(player, "There's no such room");
        if (this.watching.get(player) == room) return player.send({ r: S2C.GAME_ROOM, o: room.state(), l: room.lines });
        this.leave(player);
        this.watching.set(player, room);
        room.watchers.add(player);
        player.send({ r: S2C.GAME_ROOM, o: room.state(), l: room.lines });
        room.changed();
    }

    // out of the room they're in (and its seat), if any - leaving, or signing out
    public leave(player: Player) {
        const room = this.watching.get(player);
        if (!room) return;
        this.watching.delete(player);
        if (room instanceof RaceTrack) return room.leave(player);
        if (!(room instanceof Room)) return;
        room.watchers.delete(player);
        const seat = room.seats.indexOf(player);
        if (seat >= 0) this.unseat(room, player, `${player.record.displayName} got up`);
        room.changed();
        this.tidy(room.game);
    }

    // An account being deleted (AccountManager): out of its room, and out of
    // a round it was dealt into, so nothing's saved for it when the round
    // ends (getting up threw its hand in; its ante stays in the pot). Its
    // rows go with the rest of the account.
    public forget(player: Player) {
        this.leave(player);
        for (const rooms of this.rooms) for (const room of rooms.values()) room.paid = room.paid.filter((id) => id != player.id);
        for (const track of this.tracks.values()) track.forget(player.id);
        this.lastSaid.delete(player.id);
        this.lastSeat.delete(player.id);
    }

    public sit(player: Player, seat: any) {
        const room = this.table(player);
        if (!room || !Number.isInteger(seat) || seat < 0 || seat >= room.seats.length) return;
        if (room.seats[seat]) return this.refuse(player, "Someone's sitting there");
        if (room.playing.includes(player)) return this.refuse(player, "Not while you're playing");
        if (player.inventory.gold < room.ante) return this.refuse(player, "Not enough gold for the ante");
        if (this.tooQuick(player)) return;
        const was = room.seats.indexOf(player);
        if (was >= 0) room.seats[was] = null;
        else room.tell(`${player.record.displayName} sat down`);
        room.seats[seat] = player;
        room.changed();
        this.tidy(room.game);
    }

    // up from their seat (their hand, if they're playing one, thrown in)
    public stand(player: Player) {
        const room = this.table(player), seat = room?.seats.indexOf(player) ?? -1;
        if (seat < 0 || this.tooQuick(player)) return;
        this.unseat(room, player, `${player.record.displayName} got up`);
        room.changed();
        this.tidy(room.game);
    }

    // a player's blackjack, by their name (nothing if there's no such player)
    public async stats(player: Player, name: any) {
        if (typeof name != "string" || !name || name.length > 64) return;
        const [r] = await this.query<Row[]>(
            "SELECT p.display_name, s.hands, s.best, s.net FROM player p LEFT JOIN game_stat s ON s.player_id = p.id WHERE p.display_name = ?", [name],
        ).catch((e) => { Log.error("Games: database error", e); return [] as Row[]; });
        if (!r) return;
        const o: BjStats = { n: r.display_name, h: r.hands ?? 0, b: r.best ?? 0, w: Number(r.net ?? 0) };
        player.send({ r: S2C.GAME_STATS, o });
    }

    public say(player: Player, text: any) {
        const room = this.watching.get(player), t = cleanChat(text);
        if (!room || !t) return;
        const now = Date.now();
        if (now - (this.lastSaid.get(player.id) ?? 0) < CHAT_GAP_MS) return;
        const why = IBS.chat.refusal(player, t, true);
        if (why) return player.send({ r: S2C.GAME_REFUSED, w: why });
        this.lastSaid.set(player.id, now);

        const line: RoomLine = { n: player.record.displayName, t, a: now };
        const mark = player.record.chatMark();
        if (mark) line.p = mark;
        room.add(line);
    }

    // the stake on a slime, at the track they're watching
    public bet(player: Player, slime: any) {
        const track = this.watching.get(player);
        if (track instanceof RaceTrack) track.bet(player, slime);
    }

    // the blackjack table they're watching, if they are
    private table(player: Player) {
        const room = this.watching.get(player);
        return room instanceof Room ? room : null;
    }

    //#region the round

    // another card, on their turn: bust or 21 ends it
    public hit(player: Player) {
        const room = this.table(player);
        if (!room || room.phase != BjPhase.PLAY || room.playing[room.turn] != player) return;
        room.missed.delete(player);
        const hand = room.hands[room.turn];
        hand.push(room.draw());
        if (handValue(hand) >= 21) return this.hold(player);
        room.changed();
    }

    // no more cards, on their turn (or their time ran out)
    public hold(player: Player, timedOut = false) {
        const room = this.table(player);
        if (!room || room.phase != BjPhase.PLAY || room.playing[room.turn] != player) return;
        if (!timedOut) room.missed.delete(player);
        room.done[room.turn] = true;
        this.nextTurn(room);
    }

    // their turn run out: they stand, and BJ_AWAY_TURNS in a row stands them up (their hand still in the round)
    private timedOut(room: Room) {
        const player = room.playing[room.turn], missed = (room.missed.get(player) ?? 0) + 1;
        room.missed.set(player, missed);
        this.hold(player, true);
        if (missed < BJ_AWAY_TURNS || !room.seats.includes(player)) return;
        room.seats[room.seats.indexOf(player)] = null;
        room.missed.delete(player);
        room.tell(`${player.record.displayName} was stood up, away`);
        this.refuse(player, "Stood up: away too long");
        room.changed();
        this.tidy(room.game);
    }

    // the next round soon, if anyone's sitting
    private next(room: Room) {
        room.phase = room.sitting() ? BjPhase.NEXT : BjPhase.IDLE;
        room.timer = BJ_NEXT_MS;
        room.changed();
    }

    // each sitting pays the ante and is dealt in (those short of it are stood up), the dealer too
    private deal(room: Room) {
        room.clearRound();
        room.seats.forEach((p, i) => {
            if (!p) return;
            if (p.inventory.gold < room.ante) {
                room.seats[i] = null;
                room.missed.delete(p);
                room.tell(`${p.record.displayName} got up, short of the ante`);
                return this.refuse(p, "Not enough gold for the ante");
            }
            this.pay(p, -room.ante);
            room.pot += room.ante;
            room.playing[i] = p;
            room.hands[i] = [];
        });
        if (!room.pot) { this.next(room); this.tidy(room.game); return; }
        room.paid = room.playing.filter((p) => p).map((p) => p.id);
        this.query("INSERT INTO game_ante (player_id, gold) VALUES ? AS n ON DUPLICATE KEY UPDATE gold = game_ante.gold + n.gold",
            [room.paid.map((id) => [id, room.ante])]).catch(Log.catch("Games: couldn't save the antes"));
        room.shuffle();
        for (let n = 0; n < 2; n++) {
            room.hands.forEach((h) => h?.push(room.draw()));
            room.dealer.push(room.draw());
        }
        room.hands.forEach((h, i) => { if (h && handValue(h) == 21) room.done[i] = true; });
        room.phase = BjPhase.PLAY;
        this.nextTurn(room);
        this.tidy(room.game);
    }

    // the next seat still to play, or the dealer
    private nextTurn(room: Room) {
        do room.turn++;
        while (room.turn < room.seats.length && (!room.playing[room.turn] || room.done[room.turn]));
        if (room.turn < room.seats.length) room.timer = BJ_TURN_MS;
        else { room.turn = -1; room.phase = BjPhase.DEALER; room.timer = BJ_DEALER_MS; }
        room.changed();
    }

    // the dealer's card up, then one at a time to 17 (none if everyone's bust or gone)
    private dealerDraws(room: Room) {
        const live = room.hands.some((h, i) => room.playing[i] && handRank(h) >= 0);
        if (live && handValue(room.dealer) < BJ_DEALER_STANDS) {
            room.dealer.push(room.draw());
            room.timer = BJ_DEALER_MS;
            room.changed();
            return;
        }
        this.settle(room);
    }

    // the best hand takes the pot, ties split it, and the dealer's as good keeps it for the house
    private settle(room: Room) {
        const ranks = room.hands.map((h, i) => room.playing[i] ? handRank(h) : -1);
        const best = Math.max(-1, ...ranks);
        room.won = new Array(room.seats.length).fill(0);
        if (best >= 0 && handRank(room.dealer) < best) {
            const winners = ranks.map((r, i) => r == best ? i : -1).filter((i) => i >= 0);
            const share = Math.floor(room.pot / winners.length);
            for (const i of winners) {
                room.won[i] = share;
                this.pay(room.playing[i], share);
            }
            const names = winners.map((i) => room.playing[i].record.displayName);
            room.tell(names.length == 1 ? `${names[0]} wins ${gold(share)}` : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]} split ${gold(room.pot)}`);
        }
        else room.tell(`The house keeps ${gold(room.pot)}`);
        this.record(room);
        this.release(room);
        room.phase = BjPhase.DONE;
        room.timer = BJ_DONE_MS;
        room.changed();
    }

    // up from their seat, the table saying so, their hand thrown in
    private unseat(room: Room, player: Player, why: string) {
        room.seats[room.seats.indexOf(player)] = null;
        room.missed.delete(player);
        room.tell(why);
        this.fold(room, player);
    }

    // their hand thrown in, if they're playing one (their ante stays in the pot)
    private fold(room: Room, player: Player) {
        const i = room.playing.indexOf(player);
        if (i < 0 || room.phase == BjPhase.DONE) return;
        room.playing[i] = null;
        room.hands[i] = null;
        if (room.phase == BjPhase.PLAY && room.turn == i) this.nextTurn(room);
    }

    // gold to them (or from them), saved and sent
    public pay(player: Player, amount: number) {
        player.inventory.adjustGold(amount);
        InventoryRecord.UpdateGold(player.id, player.inventory.gold).catch(Log.catch("Games: couldn't save gold", { playerId: player.id }));
        player.send({ r: S2C.GAME_GOLD, g: player.inventory.gold });
    }

    // gold to a player by id: theirs if they're loaded, else (once any save of theirs is done) their saved gold
    public payId(id: number, amount: number) {
        const player = IBS.players.getById(id);
        if (player) return this.pay(player, amount);
        IBS.players.settled(id).then(() => this.query("UPDATE inventory SET gold = gold + ? WHERE player_id = ?", [amount, id]))
            .catch(Log.catch("Games: couldn't pay out", { playerId: id }));
    }

    //#endregion

    // each ante with one open room (nobody sitting); a spare one goes once nobody's watching it
    private tidy(game: Game) {
        const rooms = this.rooms[game];
        for (const ante of BJ_ANTES) {
            const open = [...rooms.values()].filter((r) => r.ante == ante && !r.sitting());
            let spare = open.length - 1;
            for (const r of open.reverse()) if (spare > 0 && !r.watchers.size) { this.release(r); rooms.delete(r.id); spare--; }
            if (open.length) continue;
            const id = this.nextId++, taken = new Set([...rooms.values()].map((r) => r.name));
            const free = ROOM_NAMES.filter((n) => !taken.has(n));
            rooms.set(id, new Room(game, id, free.length ? free[Math.floor(Math.random() * free.length)] : `Table ${id + 1}`, ante, BJ_SEATS));
        }
    }

    // each who paid in: a hand more, the pot if it's their biggest, and what they won less their ante
    private record(room: Room) {
        if (!room.paid.length) return;
        const rows = room.paid.map((id) => {
            const seat = room.playing.findIndex((p) => p?.id == id), won = seat >= 0 ? room.won[seat] : 0;
            return [id, 1, won, won - room.ante];
        });
        this.query(`INSERT INTO game_stat (player_id, hands, best, net) VALUES ? AS n ON DUPLICATE KEY UPDATE
            hands = game_stat.hands + n.hands, best = GREATEST(game_stat.best, n.best), net = game_stat.net + n.net`, [rows]).catch(Log.catch("Games: couldn't save the stats"));
    }

    // the round's antes settled (or gone with its room): out of game_ante
    private release(room: Room) {
        if (!room.paid.length) return;
        this.query("DELETE FROM game_ante WHERE player_id IN (?)", [room.paid]).catch(Log.catch("Games: couldn't clear the antes"));
        room.paid = [];
    }

    // sitting down or getting up again before BJ_SEAT_GAP_MS (refused)
    public tooQuick(player: Player) {
        const now = Date.now();
        if (now - (this.lastSeat.get(player.id) ?? 0) < BJ_SEAT_GAP_MS) { this.refuse(player, "Too quick"); return true; }
        this.lastSeat.set(player.id, now);
        return false;
    }

    public async query<T = Row[]>(sql: string, args: any[] = []): Promise<T> {
        const conn = await IBS.db.getConnection();
        try {
            const [result] = await conn.query(sql, args);
            return result as any;
        } finally {
            conn.release();
        }
    }

    public refuse(player: Player, why: string) {
        player.send({ r: S2C.GAME_REFUSED, w: why });
    }

}
