import { IBS } from "../../app";
import { C2S } from "../../constants/Routes";
import { Player } from "../player/Player";
import { Log } from "../../utils/Log";

export class ChatHandler {

    public onMessage(player: Player, message: any) {
        switch (message.r) {
            case C2S.CHAT_SAY: IBS.chat.say(player, message.c, message.t); break;
            case C2S.CHAT_REPORT: IBS.chat.report(player, message.k, message.w).catch(Log.catch("Chat report", { playerId: player.id })); break;
        }
    }

}
