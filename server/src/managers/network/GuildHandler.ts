import { IBS } from "../../app";
import { C2S } from "../../constants/Routes";
import { Player } from "../player/Player";
import { Log } from "../../utils/Log";

export class GuildHandler {

    public onMessage(player: Player, message: any) {
        const g = IBS.guilds;
        let done: Promise<any>;
        switch (message.r) {
            case C2S.GUILD_FOUND: done = g.act(player, () => g.found(player, message.n, message.t)); break;
            case C2S.GUILD_BROWSE: g.browse(player, message.q); break;
            case C2S.GUILD_JOIN: done = g.act(player, () => g.join(player, message.i)); break;
            case C2S.GUILD_ANSWER: done = g.act(player, () => g.answer(player, message.i, message.y), !!message.y); break;
            case C2S.GUILD_INVITE: done = g.act(player, () => g.invite(player, message.n)); break;
            case C2S.GUILD_UNINVITE: done = g.act(player, () => g.uninvite(player, message.i), false); break;
            case C2S.GUILD_LEAVE: done = g.act(player, () => g.leave(player)); break;
            case C2S.GUILD_KICK: done = g.act(player, () => g.kick(player, message.i), false); break;
            case C2S.GUILD_RANK: done = g.act(player, () => g.rank(player, message.i, message.k), false); break;
            case C2S.GUILD_LEAD: done = g.act(player, () => g.lead(player, message.i)); break;
            case C2S.GUILD_NOTICE: done = g.act(player, () => g.notice(player, message.m)); break;
            case C2S.GUILD_OPEN: done = g.act(player, () => g.setOpen(player, message.o)); break;
            case C2S.GUILD_DISBAND: done = g.act(player, () => g.disband(player)); break;
            case C2S.GUILD_SAY: g.say(player, message.t); break;
            case C2S.GUILD_HALL: g.sendHall(player); break;
            case C2S.GUILD_PUT: done = g.act(player, () => g.put(player, message.i, message.n), false); break;
            case C2S.GUILD_TAKE: done = g.act(player, () => g.take(player, message.i, message.n), false); break;
        }
        done?.catch(Log.catch("Guilds", { playerId: player.id }));
    }

}
