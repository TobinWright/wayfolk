import { Event } from "../constants/Events";
import { C2S, S2C } from "../constants/Routes";
import { IBC } from "../Engine";
import { BaseHandler } from "./BaseHandler";

export class GuildHandler extends BaseHandler {

    //#region === Outgoing ===

    public found(name: string, tag: string) { this.send({ r: C2S.GUILD_FOUND, n: name, t: tag }); }
    public browse(q: string) { this.send({ r: C2S.GUILD_BROWSE, q }); }
    public join(id: number) { this.send({ r: C2S.GUILD_JOIN, i: id }); }
    public answer(id: number, yes: boolean) { this.send({ r: C2S.GUILD_ANSWER, i: id, y: yes ? 1 : 0 }); }
    public invite(name: string) { this.send({ r: C2S.GUILD_INVITE, n: name }); }
    public uninvite(id: number) { this.send({ r: C2S.GUILD_UNINVITE, i: id }); }
    public leave() { this.send({ r: C2S.GUILD_LEAVE }); }
    public kick(id: number) { this.send({ r: C2S.GUILD_KICK, i: id }); }
    public rank(id: number, k: number) { this.send({ r: C2S.GUILD_RANK, i: id, k }); }
    public lead(id: number) { this.send({ r: C2S.GUILD_LEAD, i: id }); }
    public notice(text: string) { this.send({ r: C2S.GUILD_NOTICE, m: text }); }
    public setOpen(open: boolean) { this.send({ r: C2S.GUILD_OPEN, o: open ? 1 : 0 }); }
    public disband() { this.send({ r: C2S.GUILD_DISBAND }); }
    public say(text: string) { this.send({ r: C2S.GUILD_SAY, t: text }); }
    public hall() { this.send({ r: C2S.GUILD_HALL }); }
    public put(item: number, n: number) { this.send({ r: C2S.GUILD_PUT, i: item, n }); }
    public take(item: number, n: number) { this.send({ r: C2S.GUILD_TAKE, i: item, n }); }

    //#endregion

    //#region === Incoming ===

    public onMessage(message: any) {
        const data = IBC.data.guilds;
        switch (message.r) {
            case S2C.GUILD: {
                const had = data.guild?.i;
                data.load(message.s);
                if (had && had != data.guild?.i) IBC.data.chat.dropGuild();     // (out of it: its chat goes)
                IBC.events.emit(Event.GUILD);
                break;
            }
            case S2C.GUILD_MEMBER: data.setMember(message.m); IBC.events.emit(Event.GUILD); break;
            case S2C.GUILD_WEEK: data.setWeek(message.w, message.x); IBC.events.emit(Event.GUILD_WEEK); break;
            case S2C.GUILD_HALL: data.hall = message.h; IBC.events.emit(Event.GUILD_WEEK); break;
            case S2C.GUILD_LIST: data.found = message.l ?? []; IBC.events.emit(Event.GUILD_LIST); break;
            case S2C.GUILD_DONE: IBC.events.emit(Event.GUILD_RESULT, { text: message.w, ok: true }); break;
            case S2C.GUILD_REFUSED: IBC.events.emit(Event.GUILD_RESULT, { text: message.w, ok: false }); break;
            case S2C.GUILD_SAID:
                IBC.data.chat.add(message.l);
                IBC.events.emit(Event.CHAT_SAID, message.l);
                break;
        }
    }

    //#endregion

}
