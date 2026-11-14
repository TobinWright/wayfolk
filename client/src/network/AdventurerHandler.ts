import { Sex } from "../constants/Constants";
import { C2S, S2C } from "../constants/Routes";
import { BaseHandler } from "./BaseHandler";

export class AdventurerHandler extends BaseHandler {

    //#region === Outgoing ===

    public hire(sex: Sex) {
        if (this.hasTransaction(C2S.ADVENTURER_HIRE)) return;
        this.addTransaction(C2S.ADVENTURER_HIRE);

        this.send({
            r: C2S.ADVENTURER_HIRE,
            s: sex
        });
    }

    //#endregion

    //#region === Incoming ===

    public onMessage(message: any) {
        switch (message.r) {
            case S2C.ADVENTURER_HIRED: this.adventurerHired(message); break;
        }
    }

    private adventurerHired(message: any) {
        const adventurer = message.a;
        // IBC.data.adventurers.
    }

    //#endregion

}