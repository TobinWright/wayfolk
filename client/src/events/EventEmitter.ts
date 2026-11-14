import { Event } from "../constants/Events";
import { EventListener } from "./EventListener";

export class EventEmitter {

    public type: Event;
    public listeners: EventListener[] = [];

    constructor(type: Event) {
        this.type = type;
    }

    public register(listener: CallableFunction, context: any) {
        this.listeners.push(new EventListener(listener, context));
    }

    public unregister(listener: CallableFunction) {
        for (let i = this.listeners.length - 1; i >= 0; i--)
            if (this.listeners[i].listener == listener)
                this.listeners.splice(i, 1);
    }

    public unregisterAll(context: any) {
        for (let i = this.listeners.length - 1; i >= 0; i--) {
            if (this.listeners[i].context == context) {
                const listener = this.listeners.splice(i, 1)[0];
                listener.destroy();
            }
        }
    }

    public emit(data?: any) {
        for (let i = 0; i < this.listeners.length; i++)
            this.listeners[i].emit(data);
    }

}