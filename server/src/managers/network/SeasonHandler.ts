import { IBS } from "../../app";
import { C2S } from "../../constants/Routes";
import { Player } from "../player/Player";
import { Log } from "../../utils/Log";

export class SeasonHandler {

    public onMessage(player: Player, message: any) {
        switch (message.r) {
            case C2S.SEASON_TITLE: IBS.seasons.pickTitle(player, message.t).catch(Log.catch("Couldn't pick a title", { playerId: player.id })); break;
        }
    }

}
