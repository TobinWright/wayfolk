import { Event } from "../constants/Events";
import { C2S, S2C } from "../constants/Routes";
import { IBC } from "../Engine";
import { BaseHandler } from "./BaseHandler";
import { foughtFor } from "../components/map/Wander";

export class FriendHandler extends BaseHandler {

    //#region === Outgoing ===

    public ask(name: string) { this.send({ r: C2S.FRIEND_ASK, n: name }); }
    public answer(id: number, yes: boolean) { this.send({ r: C2S.FRIEND_ANSWER, i: id, y: yes ? 1 : 0 }); }
    public cancel(id: number) { this.send({ r: C2S.FRIEND_CANCEL, i: id }); }
    public remove(id: number) { this.send({ r: C2S.FRIEND_REMOVE, i: id }); }
    public favourite(id: number, on: boolean) { this.send({ r: C2S.FRIEND_FAVOURITE, i: id, f: on ? 1 : 0 }); }
    public block(id: number) { this.send({ r: C2S.FRIEND_BLOCK, i: id }); }
    public unblock(id: number) { this.send({ r: C2S.FRIEND_UNBLOCK, i: id }); }
    public find(id: number) { this.send({ r: C2S.FRIEND_FIND, i: id }); }
    public list() { this.send({ r: C2S.FRIEND_LIST }); }
    public whisper(id: number, text: string) { this.send({ r: C2S.WHISPER_SAY, i: id, t: text }); }
    public seen() { this.send({ r: C2S.WHISPER_SEEN }); }

    //#endregion

    //#region === Incoming ===

    public onMessage(message: any) {
        const data = IBC.data.friends;
        switch (message.r) {
            case S2C.FRIEND_LIST: data.setList(message.l); IBC.events.emit(Event.FRIEND_LIST); break;
            case S2C.FRIEND_PRESENCE: data.setPresence(message.f); IBC.events.emit(Event.FRIEND_LIST); break;
            case S2C.FRIEND_REFUSED: IBC.events.emit(Event.FRIEND_SAID, { text: message.w, ok: false }); break;
            case S2C.FRIEND_DONE: IBC.events.emit(Event.FRIEND_SAID, { text: message.w, ok: true }); break;
            case S2C.FRIEND_HEROES: data.setHeroes(message.o, message.h); IBC.events.emit(Event.FRIEND_HEROES, message.o); break;
            case S2C.FRIEND_HERO: data.setHero(message.o, message.h); break;
            // (a favourite's heroes fought: they stand still a while, a puff over them)
            case S2C.FRIEND_FOUGHT: foughtFor(message.h); break;
            case S2C.FRIEND_GONE: data.gone(message.o); break;
            case S2C.WHISPER_SAID: data.add(message.l); IBC.events.emit(Event.WHISPER_SAID, message.l); break;
        }
    }

    //#endregion

}
