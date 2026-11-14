import { seasonAt, SeasonState } from "../../../shared/Seasons";

// Seasons (shared/Seasons.ts): the season, your points and where you stand,
// the titles and backdrops you've earned, as the server last sent them (S2C.SEASON).
export class SeasonData {

    public state: SeasonState = { n: seasonAt(Date.now()).n, p: 0, r: 0, t: [], h: -1, b: [] };

    public load(state: SeasonState) {
        if (state) this.state = state;
    }

    // the title shown by your name (null: none)
    public get title() {
        return this.state.h >= 0 ? this.state.t[this.state.h] ?? null : null;
    }

}
