import { IBS } from "../../app";
import { C2S } from "../../constants/Routes";
import { Player } from "../player/Player";

export class TradeHandler {

    public onMessage(player: Player, message: any) {
        switch (message.r) {
            case C2S.TRADE_ASK: IBS.trades.ask(player, message.i); break;
            case C2S.TRADE_ANSWER: IBS.trades.answer(player, message.y); break;
            case C2S.TRADE_CANCEL: IBS.trades.cancel(player); break;
            case C2S.TRADE_OFFER: IBS.trades.offer(player, message.g, message.i); break;
            case C2S.TRADE_READY: IBS.trades.ready(player, message.v); break;
            case C2S.TRADE_CONFIRM: IBS.trades.confirm(player); break;
        }
    }

}
