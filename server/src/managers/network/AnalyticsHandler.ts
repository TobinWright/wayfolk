import { IBS } from "../../app";
import { C2S } from "../../constants/Routes";
import { Player } from "../player/Player";

export class AnalyticsHandler {

    public onMessage(player: Player, message: any) {
        switch (message.r) {
            case C2S.ANALYTICS_GET: if (player.canEdit()) IBS.analytics.send(player, !!message.s); break;
            case C2S.ANALYTICS_HELLO: IBS.analytics.track.hello(player, message.d, message.s); break;
            case C2S.ANALYTICS_PRESENCE: IBS.analytics.track.presence(player, !!message.a); break;
            case C2S.ANALYTICS_OPENED: IBS.analytics.track.opened(player, message.w); break;
        }
    }

}
