import { Event } from "../constants/Events";
import { fought } from "../components/map/Wander";
import { C2S, S2C } from "../constants/Routes";
import { IBC } from "../Engine";
import { BaseHandler } from "./BaseHandler";

// the admin panel's (shared/Admin.ts; components/adminpanel)
export class AdminHandler extends BaseHandler {

    //#region === Outgoing ===

    // players by name (any part of it) or "#id"; "": those signed in
    public find(q: string) { this.send({ r: C2S.ADMIN_FIND, q }); }
    public player(i: number) { this.send({ r: C2S.ADMIN_PLAYER, i }); }
    // muted for `m` minutes (0: unmuted)
    public mute(i: number, m: number) { this.send({ r: C2S.ADMIN_MUTE, i, m }); }
    // admins: gold given (less than 0: taken)
    public gold(i: number, g: number) { this.send({ r: C2S.ADMIN_GOLD, i, g }); }
    // admins: someone else's role
    public role(i: number, o: number) { this.send({ r: C2S.ADMIN_ROLE, i, o }); }
    public reports() { this.send({ r: C2S.ADMIN_REPORTS }); }
    public reportDone(i: number) { this.send({ r: C2S.ADMIN_REPORT_DONE, i }); }
    public feedback() { this.send({ r: C2S.ADMIN_FEEDBACK }); }
    public feedbackDone(i: number) { this.send({ r: C2S.ADMIN_FEEDBACK_DONE, i }); }
    // a line in General to everyone, from "Announcement"
    public say(t: string) { this.send({ r: C2S.ADMIN_SAY, t }); }
    // an event started (-1: any kind)
    public event(k: number) { this.send({ r: C2S.ADMIN_EVENT, k }); }
    public sight(k: number) { this.send({ r: C2S.ADMIN_EVENT, k, s: 1 }); }
    public stash(i: number) { this.send({ r: C2S.ADMIN_STASH, i }); }
    // admins: some of a thing given (less than 0: taken)
    public item(i: number, m: number, n: number) { this.send({ r: C2S.ADMIN_ITEM, i, m, n }); }
    public market(i: number) { this.send({ r: C2S.ADMIN_MARKET, i }); }
    // admins: Supporter, subscription and packs
    public purchases(i: number) { this.send({ r: C2S.ADMIN_PURCHASES, i }); }
    // admins: a cosmetic pack given (v 1) or taken (v 0)
    public pack(i: number, k: number, v: number) { this.send({ r: C2S.ADMIN_PACK, i, k, v }); }
    // admins: days of Supporter given
    public supporter(i: number, d: number) { this.send({ r: C2S.ADMIN_SUPPORTER, i, d }); }
    // what staff have done to them
    public log(i: number) { this.send({ r: C2S.ADMIN_LOG, i }); }
    public demo(on: boolean) { this.send({ r: C2S.ADMIN_DEMO, o: on ? 1 : 0 }); }
    // banned for `d` days (0: for good; -1: unbanned), with why
    public ban(i: number, d: number, w: string) { this.send({ r: C2S.ADMIN_BAN, i, d, w }); }

    //#endregion

    //#region === Incoming ===

    public onMessage(message: any) {
        switch (message.r) {
            case S2C.ADMIN_FOUND: IBC.events.emit(Event.ADMIN_FOUND, message); break;
            case S2C.ADMIN_PLAYER: IBC.events.emit(Event.ADMIN_PLAYER, message.p); break;
            case S2C.ADMIN_REPORTS: IBC.events.emit(Event.ADMIN_REPORTS, message); break;
            case S2C.ADMIN_FEEDBACK: IBC.events.emit(Event.ADMIN_FEEDBACK, message); break;
            case S2C.ADMIN_DONE: IBC.events.emit(Event.ADMIN_DONE, message.w); break;
            case S2C.ADMIN_REFUSED: IBC.events.emit(Event.ADMIN_REFUSED, message.w); break;
            case S2C.ADMIN_STASH: IBC.events.emit(Event.ADMIN_STASH, message.s); break;
            case S2C.ADMIN_MARKET: IBC.events.emit(Event.ADMIN_MARKET, message); break;
            case S2C.ADMIN_PURCHASES: IBC.events.emit(Event.ADMIN_PURCHASES, message.p); break;
            case S2C.ADMIN_LOG: IBC.events.emit(Event.ADMIN_LOG, message); break;
            case S2C.ADMIN_DEMO_PARTIES: if (IBC.data.heroes.demo && Array.isArray(message.u) && Array.isArray(message.g)) IBC.data.heroes.updateDemo(message.u, message.g); break;
            case S2C.ADMIN_DEMO_FIGHT: if (message.f) { fought(message.f); IBC.events.emit(Event.DEMO_FIGHT, message); } break;
        }
    }

    //#endregion

}
