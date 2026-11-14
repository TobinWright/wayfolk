import { isOn, SightKind, SightView } from "../../../shared/Sights";
import { IBC } from "../Engine";

// What's turned up on the map for a while (shared/Sights.ts) as the server
// sends it: merchants (with what you've bought from each), rare finds,
// roaming beasts and openings. An opening is a place while it's open: it's
// put in among the heroes' places (HeroesData.places) so the to-do list,
// distances and the place's window know it, and taken out as it goes.
export class SightsData {

    public list: SightView[] = [];
    private opened = new Set<number>();     // (the places put in for openings)

    public load(list: SightView[]) {
        this.list = list ?? [];
        const places = IBC.data.heroes.places, now = new Set<number>();
        for (const s of this.list) if (s.o) { places.set(s.o.i, s.o); now.add(s.o.i); }
        this.opened.forEach((id) => { if (!now.has(id) && places.get(id)) places.delete(id); });
        this.opened = now;
    }

    public get(id: number) {
        return this.list.find((s) => s.i == id);
    }

    // those about now (the server takes them off; till it says so, those out of time aren't counted)
    public on(kind?: SightKind) {
        const now = Date.now();
        return this.list.filter((s) => isOn(s, now) && (kind == null || s.k == kind));
    }

    // those at a place
    public at(place: number) {
        return this.on().filter((s) => s.p == place);
    }

}
