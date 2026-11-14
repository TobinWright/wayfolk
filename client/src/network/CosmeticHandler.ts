import { Catalog } from "../../../shared/Wardrobe";
import { Event } from "../constants/Events";
import { C2S, S2C } from "../constants/Routes";
import { IBC } from "../Engine";
import { BaseHandler } from "./BaseHandler";

export class CosmeticHandler extends BaseHandler {

    //#region === Outgoing ===

    // an editor's sorting of the cosmetics, the whole catalog (COSMETIC_CATALOG back, to everyone)
    public save(c: Catalog) {
        this.send({ r: C2S.COSMETIC_SAVE, c });
    }

    //#endregion

    //#region === Incoming ===

    public onMessage(message: any) {
        switch (message.r) {
            case S2C.COSMETIC_CATALOG:
                IBC.data.cosmetics.load(message);
                IBC.events.emit(Event.COSMETIC_CATALOG);
                break;
            case S2C.COSMETIC_REFUSED: IBC.events.emit(Event.COSMETIC_REFUSED, message.w); break;
        }
    }

    //#endregion

}
