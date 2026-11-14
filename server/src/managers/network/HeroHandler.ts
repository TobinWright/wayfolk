import { IBS } from "../../app";
import { C2S, S2C } from "../../constants/Routes";
import { Player } from "../player/Player";
import { Log } from "../../utils/Log";

export class HeroHandler {

    public onMessage(player: Player, message: any) {
        switch (message.r) {
            case C2S.HERO_BOARD: IBS.heroes.sendBoard(player).catch(Log.catch("Hero board", { playerId: player.id })); break;
            case C2S.HERO_HIRE: IBS.heroes.hire(player, message.i).catch(Log.catch("Hero hire", { playerId: player.id })); break;
            case C2S.HERO_REROLL: IBS.heroes.reroll(player).catch(Log.catch("Hero reroll", { playerId: player.id })); break;
            case C2S.HERO_TODO: IBS.heroes.tasks.setTodo(player, message.h, message.q, message.b); break;
            case C2S.HERO_EQUIP: IBS.heroes.equip(player, message.h, message.s, message.i); break;
            case C2S.HERO_DISMISS: IBS.heroes.dismiss(player, message.h).catch(Log.catch("Hero dismiss", { playerId: player.id })); break;
            case C2S.HERO_LOOKS: IBS.heroes.setLooks(player, message.h, message.l); break;
            case C2S.HERO_SWAP: IBS.heroes.swap(player, message.o, message.i).catch(Log.catch("Hero swap", { playerId: player.id })); break;
            case C2S.HERO_SCENE: IBS.heroes.setScene(player, message.h, message.s); break;
            case C2S.HERO_JOURNAL: IBS.heroes.sendJournal(player, message.h); break;
            case C2S.HERO_CHOICE: IBS.heroes.tasks.answer(player, message.h, message.o); break;
            case C2S.HERO_VIEW: {
                const h = IBS.heroes.tasks.parties.view(player, message.h);
                if (h) player.send({ r: S2C.HERO_VIEW, h });
                break;
            }
        }
    }

}
