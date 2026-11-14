import { IBS } from "../../app";
import { C2S } from "../../constants/Routes";
import { Player } from "../player/Player";
import { Log } from "../../utils/Log";

export class EventHandler {

    public onMessage(player: Player, message: any) {
        switch (message.r) {
            case C2S.EVENT_PAST: IBS.events.sendPast(player).catch(Log.catch("Couldn't send the events' log", { playerId: player.id })); break;
            case C2S.EVENT_BUY: IBS.sights.buy(player, message); break;
            case C2S.EVENT_HERE: IBS.heroes.tasks.busy.sendHere(player, message.p); break;
        }
    }

}
