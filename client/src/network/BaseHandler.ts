import { C2S } from "../constants/Routes";
import { IBC } from "../Engine";

export class BaseHandler {

    protected addTransaction(type: C2S) {
        IBC.net.addTransaction(type);
    }

    protected removeTransaction(type: C2S) {
        IBC.net.removeTransaction(type);
    }

    protected hasTransaction(type: C2S) {
        return IBC.net.hasTransaction(type);
    }

    protected isBusy() {
        return IBC.net.isBusy();
    }

    protected send(data: any) {
        IBC.net.send(data);
    }

}