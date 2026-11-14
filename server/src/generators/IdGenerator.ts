export class IdGenerator {

    private currentId = 0;

    constructor() {
    }

    getNext() {
        this.currentId++;
        return this.currentId;
    }

}