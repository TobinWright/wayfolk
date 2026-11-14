import { Race, Sex } from "../constants/Constants";

export class RecruitData {

    private locations: RD_Location[] = [];

    public add(json: any) {
        this.locations.push(new RD_Location(json));
    }

    public remove(locationId: number) {
        for (let i = 0; i < this.locations.length; i++) {
            if (this.locations[i].locationId == locationId) {
                this.locations.splice(i, 1);
                break;
            }
        }
    }

    public getByLocationId(locationId: number) {
        for (let i = 0; i < this.locations.length; i++)
            if (this.locations[i].locationId == locationId)
                return this.locations[i];
        return null;
    }

}

export class RD_Location {

    public locationId: number;
    public expiry: number;
    public options: RD_Option[] = [];

    constructor(json: any) {
        this.locationId = json.i;
        this.expiry = json.e;
        for (let i = 0; i < json.o.length; i++)
            this.options.push(new RD_Option(json.o[i]));
    }

    public removeByIndex(index: number) {
        this.options.splice(index, 1);
    }

    public isExpired() {
        return Date.now() >= this.expiry;
    }

}

export class RD_Option {

    public cost: number;
    public race: Race;
    public sex: Sex;
    public name: string;
    public skills: number[];

    constructor(json: any) {
        this.cost = json.c;
        this.race = json.r;
        this.sex = json.s;
        this.name = json.n;
        this.skills = json.k;
    }

}