import { IBS } from "../../app";
import { C2S } from "../../constants/Routes";
import { Player } from "../player/Player";
import { Log } from "../../utils/Log";

// the admin panel's (shared/Admin.ts): editors and up (giving things, roles and purchases: AdminManager checks for admins)
export class AdminHandler {

    public onMessage(player: Player, message: any) {
        if (!player.canEdit()) return;
        const a = IBS.admin, i = message.i;
        let doing: Promise<void>;
        switch (message.r) {
            case C2S.ADMIN_FIND: doing = a.find(player, message.q); break;
            case C2S.ADMIN_PLAYER: doing = a.show(player, i); break;
            case C2S.ADMIN_MUTE: doing = a.mute(player, i, message.m); break;
            case C2S.ADMIN_GOLD: doing = a.gold(player, i, message.g); break;
            case C2S.ADMIN_ROLE: doing = a.role(player, i, message.o); break;
            case C2S.ADMIN_REPORTS: doing = a.reports(player); break;
            case C2S.ADMIN_REPORT_DONE: doing = a.reportDone(player, i); break;
            case C2S.ADMIN_SAY: a.say(player, message.t); break;
            case C2S.ADMIN_EVENT: doing = a.event(player, message.k, message.s); break;
            case C2S.ADMIN_STASH: doing = a.stash(player, i); break;
            case C2S.ADMIN_ITEM: doing = a.item(player, i, message.m, message.n); break;
            case C2S.ADMIN_MARKET: doing = a.market(player, i); break;
            case C2S.ADMIN_PURCHASES: doing = a.purchases(player, i); break;
            case C2S.ADMIN_PACK: doing = a.pack(player, i, message.k, message.v); break;
            case C2S.ADMIN_SUPPORTER: doing = a.supporter(player, i, message.d); break;
            case C2S.ADMIN_LOG: doing = a.log(player, i); break;
            case C2S.ADMIN_DEMO: IBS.heroes.tasks.demo.set(player, !!message.o); break;
            case C2S.ADMIN_BAN: doing = a.ban(player, i, message.d, message.w); break;
            case C2S.ADMIN_FEEDBACK: doing = IBS.feedback.list(player); break;
            case C2S.ADMIN_FEEDBACK_DONE: doing = IBS.feedback.done(player, i); break;
        }
        doing?.catch(Log.catch("Admin", { playerId: player.id }));
    }

}
