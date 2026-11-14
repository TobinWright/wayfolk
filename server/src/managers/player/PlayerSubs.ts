import { S2C } from "../../constants/Routes";
import { Subscription } from "../../pubsub/Subscription";
import { Player } from "./Player";

export class PlayerSubs {

    public static MS_BETWEEN_UPDATES = 2000;

    private player: Player;

    public subs: Subscription[] = [];
    public package: any = {};
    public updateAt: number = 0;
    public isDirty: boolean = false;

    constructor(player: Player) {
        this.player = player;
    }

    public update() {
        const now = Date.now();
        if (now >= this.updateAt) {
            this.updateAt = now + PlayerSubs.MS_BETWEEN_UPDATES;

            if (!this.isDirty) return;
            this.isDirty = false;

            this.sendPackage();
        }
    }

    //#region === Subscriptions ===

    public add(sub: Subscription) {
        this.subs.push(sub);
    }

    public remove(sub: Subscription) {
        for (let i = 0; i < this.subs.length; i++) {
            if (this.subs[i] == sub) {
                this.subs.splice(i, 1);
                break;
            }
        }
    }

    public removeAll() {
        for (let i = 0; i < this.subs.length; i++)
            this.subs[i].unsubscribe();
    }

    //#endregion

    //#region === Package ===

    public addToPackage(key: string, data: any) {
        this.package[key] = data;
        this.isDirty = true;
    }

    private sendPackage() {
        this.player.send({
            r: S2C.NETWORK_UPDATED,
            u: this.package
        });

        this.package = {};
        this.isDirty = false;
    }

    //#endregion

}