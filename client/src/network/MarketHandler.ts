import { ChatLine } from "../../../shared/Chat";
import { SaleRow, Sort } from "../../../shared/Market";
import { itemName } from "../../../shared/Tasks";
import { Event } from "../constants/Events";
import { C2S, S2C } from "../constants/Routes";
import { IBC } from "../Engine";
import { BaseHandler } from "./BaseHandler";

// The market (shared/Market.ts, components/market/Market.ts). Something of
// yours sold, a listing back from running out, things bought by a buy order
// of yours or one that ran out, is said in the General chat, to you only,
// from "Market".
export class MarketHandler extends BaseHandler {

    //#region === Outgoing ===

    public list(t: Sort | "", q: string) {
        this.send({ r: C2S.MARKET_LIST, t, q });
    }

    public wanted(t: Sort | "", q: string) {
        this.send({ r: C2S.MARKET_WANTED, t, q });
    }

    public mine() {
        this.send({ r: C2S.MARKET_MINE });
    }

    public sell(i: number, n: number, p: number) {
        this.send({ r: C2S.MARKET_SELL, i, n, p });
    }

    public buy(l: number, n: number, p: number) {
        this.send({ r: C2S.MARKET_BUY, l, n, p });
    }

    public cancel(l: number) {
        this.send({ r: C2S.MARKET_CANCEL, l });
    }

    public order(i: number, n: number, p: number) {
        this.send({ r: C2S.MARKET_ORDER, i, n, p });
    }

    public fill(o: number, n: number, p: number) {
        this.send({ r: C2S.MARKET_FILL, o, n, p });
    }

    public unorder(o: number) {
        this.send({ r: C2S.MARKET_UNORDER, o });
    }

    public history(i: number) {
        this.send({ r: C2S.MARKET_HISTORY, i });
    }

    //#endregion

    //#region === Incoming ===

    public onMessage(message: any) {
        const gold = (g: number) => `${g.toLocaleString("en-US")}g`;
        switch (message.r) {
            case S2C.MARKET_LIST: IBC.events.emit(Event.MARKET_LIST, { rows: message.l, n: message.n }); break;
            case S2C.MARKET_WANTED: IBC.events.emit(Event.MARKET_WANTED, { rows: message.l, n: message.n }); break;
            case S2C.MARKET_MINE:
                IBC.events.emit(Event.MARKET_MINE, { rows: message.l, sales: message.s, most: message.m, orders: message.o, ordersMost: message.om });
                break;
            case S2C.MARKET_HISTORY: IBC.events.emit(Event.MARKET_HISTORY, message.h); break;
            case S2C.MARKET_DONE: IBC.events.emit(Event.MARKET_DONE, message.w); break;
            case S2C.MARKET_REFUSED: IBC.events.emit(Event.MARKET_REFUSED, message.w); break;
            case S2C.MARKET_SOLD:
                for (const [item, n, g, buyer] of message.s as SaleRow[])
                    this.say(`${buyer} bought ${n} ${itemName(item)} of yours for ${gold(g)}`);
                IBC.events.emit(Event.MARKET_CHANGED);
                break;
            case S2C.MARKET_BACK:
                this.say(`Your listing of ${message.n} ${itemName(message.i)} ran out of time - it's back in your stash`);
                IBC.events.emit(Event.MARKET_CHANGED);
                break;
            case S2C.MARKET_GOT:
                this.say(message.s ? `${message.s} sold you ${message.n} ${itemName(message.i)} for ${gold(message.g)} (your buy order)`
                    : `Your buy order got you ${message.n} ${itemName(message.i)} for ${gold(message.g)} while you were away`);
                IBC.events.emit(Event.MARKET_CHANGED);
                break;
            case S2C.MARKET_UNFILLED:
                this.say(`Your buy order for ${message.n} more ${itemName(message.i)} ran out of time - ${gold(message.g)} back in your stash`);
                IBC.events.emit(Event.MARKET_CHANGED);
                break;
        }
    }

    private say(t: string) {
        const line: ChatLine = { c: 0, n: "Market", t, a: Date.now(), e: 1 };
        IBC.data.chat.add(line);
        IBC.events.emit(Event.CHAT_SAID, line);
    }

    //#endregion

}
