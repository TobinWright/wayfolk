import { Player } from "../managers/player/Player";
import { Subscription } from "./Subscription";
import { Log } from "../utils/Log";

export class Publisher {

    private name: string;

    public subs: Subscription[] = [];

    constructor(name: string) {
        this.name = name;
    }

    public addSub(player: Player) {
        const exists = this.getSub(player);
        if (exists) return;

        const sub = new Subscription(player, this);
        this.subs.push(sub);
        player.subs.add(sub);
        this.debug();
        return sub;
    }

    public removeSub(sub: Subscription) {
        for (let i = 0; i < this.subs.length; i++) {
            if (this.subs[i] == sub) {
                this.subs.splice(i, 1);
                break;
            }
        }
        this.debug();
    }

    public emit(key: string, value: any) {
        for (let i = 0; i < this.subs.length; i++)
            this.subs[i].emit(key, value);
    }

    private getSub(player: Player) {
        for (let i = 0; i < this.subs.length; i++)
            if (this.subs[i].player == player)
                return this.subs[i];
        return null;
    }

    private debug() {
        Log.debug("Pub (" + this.name + ") # of subs: " + this.subs.length);
    }

}