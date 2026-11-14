import { Boon, boonAt, EventView, eventTitle, isLive } from "../../../shared/Events";
import { TownRow, townRate } from "../../../shared/Towns";

// The dynamic events (shared/Events.ts) as the server sends them: those on,
// and those won whose boon is still in effect, each with your points and the
// top givers. The whole list comes with signing in and whenever it changes.
export class EventsData {

    public list: EventView[] = [];
    public towns = new Map<number, TownRow>();
    public busy = new Map<number, number>();    // heroes (anyone's) at each place with any (S2C.EVENT_BUSY)

    public load(list: EventView[]) {
        this.list = list ?? [];
    }

    public get(id: number) {
        return this.list.find((e) => e.i == id);
    }

    // one by its id with its short name ("The Docks Rebuild"), as doingText shows it (none: undefined)
    public named(id: number) {
        const e = this.get(id);
        return e && { n: eventTitle(e), d: e.d, g: e.g };
    }

    // those on now (the server ends them; till it says so, those out of time aren't counted)
    public live() {
        const now = Date.now();
        return this.list.filter((e) => isLive(e, now));
    }

    // the one on at a place (none: null)
    public liveAt(place: number) {
        return this.live().find((e) => e.p == place) ?? null;
    }

    // the won one whose boon is in effect at a place (none: null)
    public boonAt(place: number) {
        const now = Date.now();
        return this.list.find((e) => e.p == place && e.w == 1 && (e.u ?? 0) > now) ?? null;
    }

    // a marching boss that reached its town: its bane there while it lasts (none: null)
    public baneAt(place: number) {
        const now = Date.now();
        return this.list.find((e) => e.p == place && e.w == 3 && (e.u ?? 0) > now) ?? null;
    }

    public rate(place: number, boon: Boon) {
        return boonAt(this.list, place, boon, Date.now()) * (boon == "craft" || boon == "xp" ? townRate(this.town(place)[1]) : 1);
    }

    public loadTowns(rows: TownRow[]) {
        this.towns = new Map((rows ?? []).map((t) => [t[0], t]));
    }

    // how a place has grown (shared/Towns.ts)
    public town(place: number): TownRow {
        return this.towns.get(place) ?? [place, 0, []];
    }

}

// "2h 5m", "14m", "40s"
export function timeLeft(ms: number) {
    const s = Math.max(0, Math.round(ms / 1000));
    if (s < 60) return `${s}s`;
    const m = Math.floor(s / 60);
    return m < 60 ? `${m}m` : `${Math.floor(m / 60)}h ${m % 60}m`;
}
