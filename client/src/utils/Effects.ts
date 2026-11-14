import { Constants } from "../constants/Constants";

// Reduce flashing and shaking (Settings; the user, 2026-11-05): kept in this
// browser. On, the screen isn't lit up (ScreenFx.flash), nothing shakes (a
// fight's window, a chest), and bursts of specks are a third as big.

export class Effects {

    private static on: boolean = Effects.load();

    public static reduced() { return Effects.on; }

    public static set(on: boolean) {
        Effects.on = on;
        try { localStorage.setItem(Constants.LS_EFFECTS, on ? "1" : "0"); } catch { }
    }

    private static load() {
        try { return localStorage.getItem(Constants.LS_EFFECTS) == "1"; } catch { return false; }
    }

}
