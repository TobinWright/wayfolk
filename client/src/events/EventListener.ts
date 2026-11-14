export class EventListener {

    public listener: CallableFunction;
    public context: any;

    constructor(listener: CallableFunction, context: any) {
        this.listener = listener;
        this.context = context;
    }

    public destroy() {
        this.context = null;
        this.listener = null;
    }

    public emit(data: any) {
        const boundCallback = this.listener.bind(this.context);
        boundCallback(data);
    }

}