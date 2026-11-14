import { IBS } from "../../app";
import { C2S, S2C } from "../../constants/Routes";
import { Player } from "../player/Player";
import { Log } from "../../utils/Log";

export class MarketHandler {

    public onMessage(player: Player, message: any) {
        const failed = (error: any) => {
            Log.error("Market", error, { playerId: player.id });
            player.send({ r: S2C.MARKET_REFUSED, w: "Something went wrong - try again" });
        };
        switch (message.r) {
            case C2S.MARKET_LIST: IBS.market.list(player, message.t, message.q); break;
            case C2S.MARKET_MINE: IBS.market.mine(player).catch(failed); break;
            case C2S.MARKET_SELL: IBS.market.sell(player, message.i, message.n, message.p).catch(failed); break;
            case C2S.MARKET_BUY: IBS.market.buy(player, message.l, message.n, message.p).catch(failed); break;
            case C2S.MARKET_CANCEL: IBS.market.cancel(player, message.l).catch(failed); break;
            case C2S.MARKET_WANTED: IBS.market.wanted(player, message.t, message.q); break;
            case C2S.MARKET_ORDER: IBS.market.order(player, message.i, message.n, message.p).catch(failed); break;
            case C2S.MARKET_FILL: IBS.market.fillOrder(player, message.o, message.n, message.p).catch(failed); break;
            case C2S.MARKET_UNORDER: IBS.market.unorder(player, message.o).catch(failed); break;
            case C2S.MARKET_HISTORY: IBS.market.history(player, message.i).catch(failed); break;
        }
    }

}
