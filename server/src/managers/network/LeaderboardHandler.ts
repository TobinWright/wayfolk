import { IBS } from "../../app";
import { C2S } from "../../constants/Routes";
import { Player } from "../player/Player";

export class LeaderboardHandler {

    public onMessage(player: Player, message: any) {
        switch (message.r) {
            case C2S.LEADER_BOARD: IBS.leaderboards.send(player, message.b); break;
        }
    }

}
