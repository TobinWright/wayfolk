import { IBS } from "../../app";
import { C2S } from "../../constants/Routes";
import { Player } from "../player/Player";
import { Log } from "../../utils/Log";

export class MailHandler {

    public onMessage(player: Player, message: any) {
        const failed = Log.catch("Mail: couldn't do that", { playerId: player.id, route: C2S[message.r] });
        switch (message.r) {
            case C2S.MAIL_LIST: IBS.mail.list(player).catch(failed); break;
            case C2S.MAIL_SEND: IBS.mail.send(player, message.n, message.t, message.g, message.i).catch(failed); break;
            case C2S.MAIL_READ: IBS.mail.read(player, message.i).catch(failed); break;
            case C2S.MAIL_TAKE: IBS.mail.take(player, message.i).catch(failed); break;
            case C2S.MAIL_RETURN: IBS.mail.sendBack(player, message.i).catch(failed); break;
            case C2S.MAIL_DELETE: IBS.mail.remove(player, message.i).catch(failed); break;
        }
    }

}
