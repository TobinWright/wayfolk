import { Premium } from "../components/premium/Premium";
import { Event } from "../constants/Events";
import { C2S, S2C } from "../constants/Routes";
import { IBC } from "../Engine";
import { BaseHandler } from "./BaseHandler";

// back from Stripe's page (?billing=done or cancel): said once signed in,
// and taken off the address so a reload doesn't say it again
const PARAM = "billing";
let back = new URLSearchParams(location.search).get(PARAM);

export class PremiumHandler extends BaseHandler {

    //#region === Outgoing ===

    // subscribe: the server answers with Stripe's checkout page, which the browser goes to
    public buy() {
        this.send({ r: C2S.PREMIUM_BUY });
    }

    // Stripe's page to change your card or cancel
    public manage() {
        this.send({ r: C2S.PREMIUM_MANAGE });
    }

    // a Supporter's name colour (its place in NAME_COLORS)
    public nameColor(k: number) {
        this.send({ r: C2S.PREMIUM_COLOR, k });
    }

    //#endregion

    //#region === Incoming ===

    public onMessage(message: any) {
        switch (message.r) {
            case S2C.PREMIUM_STORE: this.store(message); break;
            case S2C.PREMIUM_CHECKOUT: location.href = message.u; break;
            case S2C.PREMIUM_REFUSED: IBC.events.emit(Event.PREMIUM_REFUSED, message.w); break;
        }
    }

    private store(message: any) {
        IBC.data.premium.load(message);
        IBC.data.player.premiumUntil = IBC.data.premium.until;
        IBC.events.emit(Event.PREMIUM_STORE);
        if (!back) return;
        const done = back == "done";
        back = null;
        const url = new URL(location.href);
        url.searchParams.delete(PARAM);
        history.replaceState(null, "", url.toString());
        Premium.open().say(done ? "Thank you! It'll be on in a moment" : "Checkout cancelled - nothing was charged", done);
    }

    //#endregion

}
