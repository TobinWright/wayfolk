import { Offer, TradeAsk, TradeView } from "../../../shared/Trade";
import { ComponentType } from "../components/BaseComponent";
import { Event } from "../constants/Events";
import { C2S, S2C } from "../constants/Routes";
import { IBC } from "../Engine";
import { BaseHandler } from "./BaseHandler";

// Trading (shared/Trade.ts): the ask (components/trade/TradeAsk.ts, top of
// the screen) and the trade (components/trade/Trade.ts, beside the
// Inventory), each opened as it comes and closed as it ends. Why one ended,
// and anything refused, is said in the chat, to you only.
export class TradeHandler extends BaseHandler {

    public ask: TradeAsk = null;        // (the ask you're in, yours or to you)
    public view: TradeView = null;      // (the trade you're in)

    //#region === Outgoing ===

    public request(i: number) {
        this.send({ r: C2S.TRADE_ASK, i });
    }

    public answer(yes: boolean) {
        this.send({ r: C2S.TRADE_ANSWER, y: yes ? 1 : 0 });
    }

    public cancel() {
        this.send({ r: C2S.TRADE_CANCEL });
    }

    public offer(o: Offer) {
        this.send({ r: C2S.TRADE_OFFER, g: o.g, i: o.i });
    }

    public ready(on: boolean) {
        this.send({ r: C2S.TRADE_READY, v: on ? 1 : 0 });
    }

    public confirm() {
        this.send({ r: C2S.TRADE_CONFIRM });
    }

    // (the connection's gone: so is anything going on)
    public lost() {
        this.ask = null;
        this.view = null;
        for (const type of [ComponentType.TRADE_ASK, ComponentType.TRADE]) {
            const c = IBC.comp.getFirstByType(type);
            if (c) IBC.comp.destroy(c);
        }
    }

    //#endregion

    //#region === Incoming ===

    public onMessage(message: any) {
        switch (message.r) {
            case S2C.TRADE_ASKED:
                this.ask = message.a;
                IBC.comp.getOrCreate(ComponentType.TRADE_ASK);
                IBC.events.emit(Event.TRADE_ASK);
                break;
            case S2C.TRADE_ASK_END: {
                this.ask = null;
                const c = IBC.comp.getFirstByType(ComponentType.TRADE_ASK);
                if (c) IBC.comp.destroy(c);
                if (message.w) this.say(message.w, false);
                break;
            }
            case S2C.TRADE: {
                const first = !this.view;
                this.view = message.t;
                if (first) {
                    IBC.comp.getOrCreate(ComponentType.INVENTORY);
                    IBC.comp.getOrCreate(ComponentType.TRADE);
                }
                IBC.events.emit(Event.TRADE);
                break;
            }
            case S2C.TRADE_END: {
                const who = this.view?.n;
                this.view = null;
                const c = IBC.comp.getFirstByType(ComponentType.TRADE);
                if (c) IBC.comp.destroy(c);
                if (message.d) this.say(`Trade with ${who ?? "them"} done!`, false);
                else if (message.w) this.say(message.w, false);
                break;
            }
            case S2C.TRADE_REFUSED:
                this.say(message.w, true);
                IBC.events.emit(Event.TRADE_REFUSED, message.w);
                break;
        }
    }

    private say(text: string, warn: boolean) {
        IBC.events.emit(Event.CHAT_SAID, IBC.data.chat.note(text, warn));
    }

    //#endregion

}
