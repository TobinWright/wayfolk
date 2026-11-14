import { IBS } from "../../app";
import { ItemId } from "../../constants/Items";
import { C2S } from "../../constants/Routes";
import { Player } from "../player/Player";
import { Log } from "../../utils/Log";

export class AdventurerHandler {

    public onMessage(player: Player, message: any) {
        switch (message.r) {
            case C2S.ADVENTURER_HIRE: this.hireAdventurer(player, message); break;
        }
    }

    private async hireAdventurer(player: Player, message: any) {
        const sex = message.s;

        // make sure we have item
        if (!player.inventory.hasItem(ItemId.ADVENTURER_REQ_FORM)) return;

        // generate adventurer
        const adventurer = await IBS.adventurers.generateNew(player.id, sex);
        Log.debug("Adventurer made", { playerId: player.id });
        // add adventurer to solo party?


    }

}