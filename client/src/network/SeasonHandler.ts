import { Event } from "../constants/Events";
import { C2S, S2C } from "../constants/Routes";
import { IBC } from "../Engine";
import { BaseHandler } from "./BaseHandler";

export class SeasonHandler extends BaseHandler {

    //#region === Outgoing ===

    // a title of yours to show by your name, by its place in SeasonState.t (-1: none)
    public pickTitle(t: number) { this.send({ r: C2S.SEASON_TITLE, t }); }

    //#endregion

    //#region === Incoming ===

    public onMessage(message: any) {
        switch (message.r) {
            case S2C.SEASON: IBC.data.season.load(message.s); IBC.events.emit(Event.SEASON); break;
        }
    }

    //#endregion

}
