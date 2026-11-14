import { ChatLine } from "../../../shared/Chat";
import { itemName } from "../../../shared/Tasks";
import { Event } from "../constants/Events";
import { C2S, S2C } from "../constants/Routes";
import { IBC } from "../Engine";
import { BaseHandler } from "./BaseHandler";

// Dynamic events (shared/Events.ts): the list, and what you got for one won
// (said in the General chat, to you only), and the events window's log of
// those over.
export class EventHandler extends BaseHandler {

    // the last events over (EVENT_PAST back)
    public past() {
        this.send({ r: C2S.EVENT_PAST });
    }

    // the others' heroes at a place now (EVENT_HERE back)
    public here(place: number) {
        this.send({ r: C2S.EVENT_HERE, p: place });
    }

    // from a wandering merchant (shared/Sights.ts): EVENT_BOUGHT or EVENT_REFUSED back
    public buy(sight: number, lot: number, n: number) {
        this.send({ r: C2S.EVENT_BUY, i: sight, k: lot, n });
    }

    public onMessage(message: any) {
        switch (message.r) {
            case S2C.EVENT_SIGHTS:
                IBC.data.sights.load(message.l);
                IBC.events.emit(Event.SIGHTS_CHANGED);
                break;
            case S2C.EVENT_BOUGHT: IBC.events.emit(Event.SIGHT_SAID, { text: message.w, ok: true }); break;
            case S2C.EVENT_REFUSED: IBC.events.emit(Event.SIGHT_SAID, { text: message.w, ok: false }); break;
            case S2C.TOWNS:
                IBC.data.events.loadTowns(message.l);
                IBC.events.emit(Event.EVENTS_CHANGED);
                break;
            case S2C.EVENT_LIST:
                IBC.data.events.load(message.l);
                IBC.events.emit(Event.EVENTS_CHANGED);
                break;
            case S2C.EVENT_PAST: IBC.events.emit(Event.EVENT_PAST, message.l); break;
            case S2C.EVENT_HERE: IBC.events.emit(Event.EVENT_HERE, message); break;
            case S2C.EVENT_BUSY: IBC.data.events.busy = new Map(message.b ?? []); break;
            case S2C.EVENT_REWARD: {
                const got = `${message.g}g${message.i ? ` and a ${itemName(message.i)} (a top giver's find)` : ""}`;
                const won = IBC.data.events.list.find((e) => e.w == 1 && e.n == message.n);     // (gone by now, perhaps, if it's paid as you sign in)
                const line: ChatLine = { c: 0, n: "Event", t: `You got ${got} for ${message.n}`, a: Date.now(), e: 1, v: won?.i, r: 1 };
                IBC.data.chat.add(line);
                IBC.events.emit(Event.CHAT_SAID, line);
                IBC.events.emit(Event.EVENT_PAID, message);
                break;
            }
        }
    }

}
