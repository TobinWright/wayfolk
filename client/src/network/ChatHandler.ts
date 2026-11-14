import { Event } from "../constants/Events";
import { C2S, S2C } from "../constants/Routes";
import { IBC } from "../Engine";
import { BaseHandler } from "./BaseHandler";

export class ChatHandler extends BaseHandler {

    //#region === Outgoing ===

    public say(channel: number, text: string) {
        this.send({ r: C2S.CHAT_SAY, c: channel, t: text });
    }

    // a line of someone else's, for the moderators (shared/Chat.ts REPORT_REASONS): a CHAT_NOTE back
    public report(k: number, reason: number) {
        this.send({ r: C2S.CHAT_REPORT, k, w: reason });
    }

    //#endregion

    //#region === Incoming ===

    public onMessage(message: any) {
        switch (message.r) {
            case S2C.CHAT_SAID:
                IBC.data.chat.add(message.l);
                IBC.events.emit(Event.CHAT_SAID, message.l);
                break;
            case S2C.CHAT_NOTE:
                IBC.events.emit(Event.CHAT_SAID, IBC.data.chat.note(message.t, !!message.w));
                break;
        }
    }

    //#endregion

}
