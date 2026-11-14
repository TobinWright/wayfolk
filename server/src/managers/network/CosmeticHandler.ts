import { IBS } from "../../app";
import { C2S } from "../../constants/Routes";
import { Player } from "../player/Player";
import { Log } from "../../utils/Log";

export class CosmeticHandler {

    public onMessage(player: Player, message: any) {
        if (!player.canEdit()) return;
        switch (message.r) {
            case C2S.COSMETIC_SAVE: IBS.cosmetics.save(player, message.c).catch((error) => {
                Log.error("Couldn't save a look", error, { playerId: player.id });
                IBS.cosmetics.refuse(player, "Couldn't save it");
            }); break;
        }
    }

}
