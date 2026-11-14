import { Engine } from "../Engine";
import { Event } from "../constants/Events";
import { EventEmitter } from "./EventEmitter";

export class EventManager {

    private engine: Engine;

    private emitters: EventEmitter[] = [];

    constructor(engine: Engine) {
        this.engine = engine;

        for (let key in Event) {
            const v = Number.parseInt(key);
            if (!isNaN(v))
                this.emitters.push(new EventEmitter(v));
        }
    }

    public register(type: Event, listener: CallableFunction, context: any) {
        const emitter = this.getEmitter(type);
        emitter.register(listener, context);
    }

    public unregister(type: Event, listener: CallableFunction) {
        const emitter = this.getEmitter(type);
        emitter.unregister(listener);
    }

    public unregisterAll(context: any) {
        for (let i = 0; i < this.emitters.length; i++)
            this.emitters[i].unregisterAll(context);
    }

    public emit(type: Event, data?: any) {
        const emitter = this.getEmitter(type);
        emitter.emit(data);
    }

    private getEmitter(type: Event) {
        for (let i = 0; i < this.emitters.length; i++)
            if (this.emitters[i].type == type)
                return this.emitters[i];
        return null;
    }

}