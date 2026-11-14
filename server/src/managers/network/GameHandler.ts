import { IBS } from "../../app";
import { C2S } from "../../constants/Routes";
import { Player } from "../player/Player";

export class GameHandler {

    public onMessage(player: Player, message: any) {
        switch (message.r) {
            case C2S.GAME_ROOMS: IBS.games.list(player, message.g); break;
            case C2S.GAME_WATCH: IBS.games.watch(player, message.g, message.i); break;
            case C2S.GAME_LEAVE: IBS.games.leave(player); break;
            case C2S.GAME_SIT: IBS.games.sit(player, message.s); break;
            case C2S.GAME_STAND: IBS.games.stand(player); break;
            case C2S.GAME_SAY: IBS.games.say(player, message.t); break;
            case C2S.GAME_HIT: IBS.games.hit(player); break;
            case C2S.GAME_HOLD: IBS.games.hold(player); break;
            case C2S.GAME_STATS: IBS.games.stats(player, message.n); break;
            case C2S.GAME_BET: IBS.games.bet(player, message.s); break;
        }
    }

}
