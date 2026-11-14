export class IdGenerator {

    private nextId = 0;

    public getNext() {
        return this.nextId++;
    }

}