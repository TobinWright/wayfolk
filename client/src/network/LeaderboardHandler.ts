import { Event } from "../constants/Events";
import { C2S, S2C } from "../constants/Routes";
import { IBC } from "../Engine";
import { BaseHandler } from "./BaseHandler";

export class LeaderboardHandler extends BaseHandler {

    //#region === Outgoing ===

    // a board's top rows and where you stand on it (shared/Leaderboards.ts; LEADER_BOARD back)
    public board(board: number) {
        this.send({ r: C2S.LEADER_BOARD, b: board });
    }

    //#endregion

    //#region === Incoming ===

    public onMessage(message: any) {
        switch (message.r) {
            case S2C.LEADER_BOARD: IBC.events.emit(Event.LEADER_BOARD, message.o); break;
        }
    }

    //#endregion

}
