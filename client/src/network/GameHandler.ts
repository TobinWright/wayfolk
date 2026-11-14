import { Event } from "../constants/Events";
import { C2S, S2C } from "../constants/Routes";
import { IBC } from "../Engine";
import { BaseHandler } from "./BaseHandler";

export class GameHandler extends BaseHandler {

    public playing = 0;         // how many sit at blackjack's tables (its button)
    public racing = 0;          // how many are at slime racing's tracks (its button)

    //#region === Outgoing ===

    public rooms(game: number) {
        this.send({ r: C2S.GAME_ROOMS, g: game });
    }

    public watch(game: number, room: number) {
        this.send({ r: C2S.GAME_WATCH, g: game, i: room });
    }

    public leave() {
        this.send({ r: C2S.GAME_LEAVE });
    }

    public sit(seat: number) {
        this.send({ r: C2S.GAME_SIT, s: seat });
    }

    public stand() {
        this.send({ r: C2S.GAME_STAND });
    }

    public say(text: string) {
        this.send({ r: C2S.GAME_SAY, t: text });
    }

    // another card, on your turn
    public hit() {
        this.send({ r: C2S.GAME_HIT });
    }

    // no more cards (blackjack's "stand"), on your turn
    public hold() {
        this.send({ r: C2S.GAME_HOLD });
    }

    // the track's stake on a slime (or your bet moved to it), at the slime race you're watching
    public bet(slime: number) {
        this.send({ r: C2S.GAME_BET, s: slime });
    }

    // a player's blackjack (GAME_STATS back)
    public stats(name: string) {
        this.send({ r: C2S.GAME_STATS, n: name });
    }

    //#endregion

    //#region === Incoming ===

    public onMessage(message: any) {
        switch (message.r) {
            case S2C.GAME_ROOMS: IBC.events.emit(Event.GAME_ROOMS, { game: message.g, rooms: message.l }); break;
            case S2C.GAME_ROOM: IBC.events.emit(Event.GAME_ROOM, { room: message.o, lines: message.l }); break;
            case S2C.GAME_SAID: IBC.events.emit(Event.GAME_SAID, message.l); break;
            case S2C.GAME_REFUSED: IBC.events.emit(Event.GAME_REFUSED, message.w); break;
            case S2C.GAME_STATS: IBC.events.emit(Event.GAME_STATS, message.o); break;
            case S2C.GAME_PLAYING:
                this.playing = message.n;
                this.racing = message.s ?? 0;
                IBC.events.emit(Event.GAME_PLAYING);
                break;
            case S2C.GAME_GOLD:
                IBC.data.inventory.gold = message.g;
                IBC.events.emit(Event.INVENTORY_GOLD_UPDATED);
                break;
        }
    }

    //#endregion

}
