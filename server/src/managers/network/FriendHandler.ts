import { IBS } from "../../app";
import { C2S, S2C } from "../../constants/Routes";
import { Player } from "../player/Player";
import { Log } from "../../utils/Log";

export class FriendHandler {

    public onMessage(player: Player, message: any) {
        const f = IBS.friends;
        let done: Promise<any>;
        switch (message.r) {
            case C2S.FRIEND_LIST: done = f.list(player).then((l) => player.send({ r: S2C.FRIEND_LIST, l })); break;
            case C2S.FRIEND_ASK: done = f.ask(player, message.n); break;
            case C2S.FRIEND_ANSWER: done = f.answer(player, message.i, message.y); break;
            case C2S.FRIEND_CANCEL: done = f.cancel(player, message.i); break;
            case C2S.FRIEND_REMOVE: done = f.remove(player, message.i); break;
            case C2S.FRIEND_FAVOURITE: done = f.favourite(player, message.i, message.f); break;
            case C2S.FRIEND_BLOCK: done = f.block(player, message.i); break;
            case C2S.FRIEND_UNBLOCK: done = f.unblock(player, message.i); break;
            case C2S.FRIEND_FIND: done = f.find(player, message.i); break;
            case C2S.WHISPER_SAY: done = f.whisper(player, message.i, message.t); break;
            case C2S.WHISPER_SEEN: done = f.seenWhispers(player); break;
        }
        done?.catch(Log.catch("Friends", { playerId: player.id }));
    }

}
