import { deviceOf } from "./AnalyticsHandler";
import { VERSION } from "../components/title/Title";
import { Event } from "../constants/Events";
import { C2S, S2C } from "../constants/Routes";
import { IBC } from "../Engine";
import { BaseHandler } from "./BaseHandler";

export class FeedbackHandler extends BaseHandler {

    //#region === Outgoing ===

    // what a player wrote (shared/Feedback.ts; FEEDBACK_SENT or FEEDBACK_REFUSED back), with the client's version and device
    public submit(k: number, t: string) {
        this.send({ r: C2S.FEEDBACK_SEND, k, t, v: VERSION, d: deviceOf() });
    }

    //#endregion

    //#region === Incoming ===

    public onMessage(message: any) {
        switch (message.r) {
            case S2C.FEEDBACK_SENT: IBC.events.emit(Event.FEEDBACK_SENT); break;
            case S2C.FEEDBACK_REFUSED: IBC.events.emit(Event.FEEDBACK_REFUSED, message.w); break;
        }
    }

    //#endregion

}
