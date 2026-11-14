import { IBS } from "../../app";
import { C2S } from "../../constants/Routes";
import { Player } from "../player/Player";
import { Log } from "../../utils/Log";

export class FeedbackHandler {

    public onMessage(player: Player, message: any) {
        switch (message.r) {
            case C2S.FEEDBACK_SEND: IBS.feedback.send(player, message.k, message.t, message.v, message.d).catch(Log.catch("Feedback", { playerId: player.id })); break;
        }
    }

}
