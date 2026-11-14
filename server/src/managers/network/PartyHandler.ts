import { IBS } from "../../app";
import { C2S } from "../../constants/Routes";
import { Player } from "../player/Player";
import { Log } from "../../utils/Log";

// formed parties (shared/Parties.ts; FormedParties)
export class PartyHandler {

    public onMessage(player: Player, message: any) {
        const f = IBS.heroes.tasks.formed;
        let done: Promise<any>;
        switch (message.r) {
            case C2S.PARTY_MAKE: done = f.make(player, message.h, message.n); break;
            case C2S.PARTY_ADD: done = f.add(player, message.i, message.h); break;
            case C2S.PARTY_ASK: done = f.ask(player, message.i, message.n); break;
            case C2S.PARTY_UNASK: done = f.unask(player, message.i, message.p); break;
            case C2S.PARTY_ANSWER: done = f.answer(player, message.i, message.h); break;
            case C2S.PARTY_LEAVE: done = f.leave(player, message.h); break;
            case C2S.PARTY_KICK: done = f.kick(player, message.i, message.h); break;
            case C2S.PARTY_DISBAND: done = f.disband(player, message.i); break;
            case C2S.PARTY_TODO: done = f.todo(player, message.i, message.q, message.b); break;
            case C2S.PARTY_RENAME: done = f.rename(player, message.i, message.n); break;
            case C2S.PARTY_INVITES: done = f.setInvites(player, message.v); break;
            case C2S.PARTY_PUBLIC: done = f.setOpen(player, message.i, message.f); break;
        }
        done?.catch(Log.catch("Parties", { playerId: player.id }));
    }

}
