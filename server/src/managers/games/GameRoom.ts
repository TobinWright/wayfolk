import { S2C } from "../../constants/Routes";
import { Game, ROOM_KEPT, RoomInfo, RoomLine } from "../../../../shared/Games";
import { Player } from "../player/Player";

// What every game's room has (GameManager's blackjack tables, RaceTrack's
// tracks): who's in it watching, and its chat, the last ROOM_KEPT lines kept.

export abstract class GameRoom {

    public watchers = new Set<Player>();
    public lines: RoomLine[] = [];

    constructor(readonly game: Game, readonly id: number, readonly name: string, readonly ante: number) { }

    public abstract info(): RoomInfo;

    // the room as its watchers see it (GAME_ROOM)
    public abstract state(): any;

    public sendAll(data: any) {
        for (const p of this.watchers) p.send(data);
    }

    // a line in the room's chat, to everyone in it (the last ROOM_KEPT kept)
    public add(line: RoomLine) {
        this.lines.push(line);
        if (this.lines.length > ROOM_KEPT) this.lines.shift();
        this.sendAll({ r: S2C.GAME_SAID, l: line });
    }

    // the room's own line
    public tell(t: string) {
        this.add({ n: "", t, a: Date.now(), s: 1 });
    }

    public changed() {
        this.sendAll({ r: S2C.GAME_ROOM, o: this.state() });
    }

}
