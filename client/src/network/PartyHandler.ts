import { ComponentType } from "../components/BaseComponent";
import { Event } from "../constants/Events";
import { C2S, S2C } from "../constants/Routes";
import { IBC } from "../Engine";
import { Invites } from "../../../shared/Parties";
import { Task } from "../../../shared/Tasks";
import { BaseHandler } from "./BaseHandler";

// formed parties (shared/Parties.ts): PARTY_LIST back with any change
export class PartyHandler extends BaseHandler {

    //#region === Outgoing ===

    public make(heroIds: number[], name = "") { this.send({ r: C2S.PARTY_MAKE, h: heroIds, n: name }); }
    public add(id: number, heroId: number) { this.send({ r: C2S.PARTY_ADD, i: id, h: heroId }); }
    public ask(id: number, name: string) { this.send({ r: C2S.PARTY_ASK, i: id, n: name }); }
    public unask(id: number, playerId: number) { this.send({ r: C2S.PARTY_UNASK, i: id, p: playerId }); }
    public answer(id: number, heroId: number) { this.send({ r: C2S.PARTY_ANSWER, i: id, h: heroId }); }
    public leave(heroId: number) { this.send({ r: C2S.PARTY_LEAVE, h: heroId }); }
    public kick(id: number, heroId: number) { this.send({ r: C2S.PARTY_KICK, i: id, h: heroId }); }
    public disband(id: number) { this.send({ r: C2S.PARTY_DISBAND, i: id }); }
    public todo(id: number, q: Task[], b: Task) { this.send({ r: C2S.PARTY_TODO, i: id, q, b: b ?? null }); }
    public rename(id: number, name: string) { this.send({ r: C2S.PARTY_RENAME, i: id, n: name }); }
    public invites(v: Invites) { this.send({ r: C2S.PARTY_INVITES, v }); }
    public open(id: number, on: boolean) { this.send({ r: C2S.PARTY_PUBLIC, i: id, f: on ? 1 : 0 }); }

    //#endregion

    //#region === Incoming ===

    public onMessage(message: any) {
        const data = IBC.data.parties;
        switch (message.r) {
            case S2C.PARTY_LIST: {
                data.setList(message.l, message.a, message.v);
                // (asks to you: on the screen while there are any)
                const box = IBC.comp.getFirstByType(ComponentType.PARTY_ASK);
                if (data.asks.length && !box) IBC.comp.getOrCreate(ComponentType.PARTY_ASK);
                else if (!data.asks.length && box) IBC.comp.destroy(box);
                IBC.events.emit(Event.PARTY_LIST);
                break;
            }
            case S2C.PARTY_STATE: { const p = data.setState(message.i, message.s); if (p) IBC.events.emit(Event.PARTY_STATE, p); break; }
            case S2C.PARTY_REFUSED: this.said(message.w, false); break;
            case S2C.PARTY_DONE: this.said(message.w, true); break;
        }
    }

    // said in the Parties window, or the chat with it shut (an ask can end long after it)
    private said(text: string, ok: boolean) {
        if (IBC.comp.getFirstByType(ComponentType.PARTIES)) IBC.events.emit(Event.PARTY_SAID, { text, ok });
        else IBC.events.emit(Event.CHAT_SAID, IBC.data.chat.note(text));
    }

    // (the connection's gone: so are the asks)
    public lost() {
        IBC.data.parties.asks = [];
        const box = IBC.comp.getFirstByType(ComponentType.PARTY_ASK);
        if (box) IBC.comp.destroy(box);
    }

    //#endregion

}
