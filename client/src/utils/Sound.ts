import { Howler } from "howler";
import { Constants } from "../constants/Constants";

// How loud the music and the effects are (the rain, the map's sounds), each 0 to 1 of
// what the game plays them at, and whether each is muted: set in Settings,
// kept in this browser (localStorage). The music goes through a gain of its
// own (bus) on Howler's master; the effects are each played at effects().

interface Levels { music: number; effects: number; musicMuted: boolean; effectsMuted: boolean; }

export class Sound {

    public static FADE = 0.05;          // seconds a change in the music's loudness eases over

    private static levels: Levels = Sound.load();
    private static musicGain: GainNode = null;

    // how loud each plays, muted or not (0 to 1)
    public static music() { return Sound.levels.musicMuted ? 0 : Sound.levels.music; }
    public static effects() { return Sound.levels.effectsMuted ? 0 : Sound.levels.effects; }

    public static get(): Readonly<Levels> { return Sound.levels; }

    public static set(change: Partial<Levels>) {
        Object.assign(Sound.levels, change);
        Sound.save();
        if (Sound.musicGain) Sound.musicGain.gain.setTargetAtTime(Sound.music(), Howler.ctx.currentTime, Sound.FADE);
    }

    // what the music plays into (null: no Web Audio)
    public static musicBus() {
        const ctx = Howler.ctx;
        if (!ctx) return null;
        if (!Sound.musicGain) {
            Sound.musicGain = ctx.createGain();
            Sound.musicGain.gain.value = Sound.music();
            Sound.musicGain.connect(Howler.masterGain);
        }
        return Sound.musicGain;
    }

    private static load(): Levels {
        const levels: Levels = { music: 1, effects: 1, musicMuted: false, effectsMuted: false };
        try {
            const saved = JSON.parse(localStorage.getItem(Constants.LS_SOUND) ?? "{}");
            for (const k of ["music", "effects"] as const) if (typeof saved[k] == "number") levels[k] = Math.max(0, Math.min(1, saved[k]));
            for (const k of ["musicMuted", "effectsMuted"] as const) if (typeof saved[k] == "boolean") levels[k] = saved[k];
        } catch { }
        return levels;
    }

    private static save() {
        try { localStorage.setItem(Constants.LS_SOUND, JSON.stringify(Sound.levels)); } catch { }
    }

}
