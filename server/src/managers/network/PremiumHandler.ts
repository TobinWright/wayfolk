import { IBS } from "../../app";
import { C2S } from "../../constants/Routes";
import { Player } from "../player/Player";
import { Log } from "../../utils/Log";

export class PremiumHandler {

    private tries = new Map<number, number[]>();     // (player id: when they last asked Stripe for a page)

    public onMessage(player: Player, message: any) {
        switch (message.r) {
            case C2S.PREMIUM_BUY: if (this.allowed(player)) IBS.billing.buy(player); break;
            case C2S.PREMIUM_MANAGE: if (this.allowed(player)) IBS.billing.manage(player); break;
            case C2S.PREMIUM_COLOR: IBS.billing.setNameColor(player, message.k).catch(Log.catch("Couldn't set a name color", { playerId: player.id })); break;
        }
    }

    // each one asks Stripe for a page: 5 a minute at most
    private allowed(player: Player) {
        const now = Date.now(), recent = (this.tries.get(player.id) ?? []).filter((t) => t > now - 60 * 1000);
        this.tries.set(player.id, recent);
        if (recent.length >= 5) {
            IBS.billing.refuse(player, "Too many tries - wait a minute");
            return false;
        }
        recent.push(now);
        return true;
    }

}
