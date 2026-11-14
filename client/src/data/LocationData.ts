import * as PIXI from "pixi.js";
import { ActionId } from "../constants/Actions";

export class LocationData {

    public locations: LD_Location[] = [];

    constructor() {
        const json = PIXI.Assets.get("json-locations");
        for (let i = 0; i < json.length; i++)
            this.locations.push(new LD_Location(json[i]));
    }

    public getById(id: number) {
        for (let i = 0; i < this.locations.length; i++)
            if (this.locations[i].id == id)
                return this.locations[i];
        return null;
    }

}

export class LD_Location {

    public id: number;
    public name: string;
    public actions: LD_Action[] = [];

    constructor(json: any) {
        this.id = json.id;
        this.name = json.name;
        if (json.actions)
            for (let i = 0; i < json.actions.length; i++)
                this.actions.push(new LD_Action(json.actions[i]));
    }

}

export class LD_Action {

    public id: ActionId;
    public data: string;

    constructor(json: any) {
        this.id = json.id;
        this.data = json.data;
    }

}