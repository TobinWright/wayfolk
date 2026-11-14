import { Player } from "../managers/player/Player";
import { Publisher } from "./Publisher";

export class Subscription {

    public player: Player;
    public publisher: Publisher;

    constructor(player: Player, publisher: Publisher) {
        this.player = player;
        this.publisher = publisher;
    }

    public emit(key: string, value: any) {
        this.player.subs.addToPackage(key, value);
    }

    public unsubscribe() {
        this.publisher.removeSub(this);
        this.player.subs.remove(this);
    }

}