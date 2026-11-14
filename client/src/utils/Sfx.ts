import { Howler } from "howler";
import { Sound } from "./Sound";

// The game's little sounds (the user, 2026-11-05: "the game needs to be more
// flashy"): chiptune beeps made on the spot with Web Audio, no files, as loud
// as the effects are set in Settings. tone() and noise() are the slime race's
// too (RaceSounds). The ones that can come often (a thing into the stash, gold)
// are kept to one each GAP ms, so a pile arriving at once is one sound.

export class Sfx {

    private static last = new Map<string, number>();

    // a note: `freq` Hz sliding to `to`, `ms` long, starting `wait` ms from now
    public static tone(freq: number, ms: number, type: OscillatorType = "square", loud = 0.08, to = freq, wait = 0) {
        const ctx = Howler.ctx, volume = loud * Sound.effects();
        if (!ctx || !volume || ctx.state != "running") return;
        const at = ctx.currentTime + wait / 1000, end = at + ms / 1000;
        const osc = ctx.createOscillator(), gain = ctx.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(freq, at);
        if (to != freq) osc.frequency.exponentialRampToValueAtTime(to, end);
        gain.gain.setValueAtTime(volume, at);
        gain.gain.exponentialRampToValueAtTime(0.0001, end);
        osc.connect(gain).connect(Howler.masterGain);
        osc.start(at);
        osc.stop(end + 0.02);
    }

    // a hiss, `ms` long, through a band round `freq` Hz (a crowd's roar, a splash, a lid's thump)
    public static noise(ms: number, freq: number, loud = 0.06, wait = 0) {
        const ctx = Howler.ctx, volume = loud * Sound.effects();
        if (!ctx || !volume || ctx.state != "running") return;
        const at = ctx.currentTime + wait / 1000, length = Math.ceil(ctx.sampleRate * ms / 1000);
        const buffer = ctx.createBuffer(1, length, ctx.sampleRate), data = buffer.getChannelData(0);
        for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * Math.sin(Math.PI * i / length);
        const source = ctx.createBufferSource(), filter = ctx.createBiquadFilter(), gain = ctx.createGain();
        source.buffer = buffer;
        filter.type = "bandpass";
        filter.frequency.value = freq;
        filter.Q.value = 0.8;
        gain.gain.value = volume;
        source.connect(filter).connect(gain).connect(Howler.masterGain);
        source.start(at);
    }

    // (false: one of these played less than `gap` ms ago)
    private static ready(name: string, gap: number) {
        const now = performance.now(), last = Sfx.last.get(name) ?? -1e9;
        if (now - last < gap) return false;
        Sfx.last.set(name, now);
        return true;
    }

    // a thing into the stash: a soft rising blip, a semitone higher each in a streak (to two octaves)
    public static pickup(streak = 0) {
        if (!Sfx.ready("pickup", streak ? 70 : 250)) return;
        const k = Math.pow(2, Math.min(24, streak) / 12);
        Sfx.tone(880 * k, 60, "triangle", 0.05, 1320 * k);
        Sfx.tone(1320 * k, 70, "triangle", 0.035, 1320 * k, 55);
    }

    // gold in: two bright coin pings
    public static coin() {
        if (!Sfx.ready("coin", 300)) return;
        Sfx.tone(1568, 60, "square", 0.035);
        Sfx.tone(2093, 140, "square", 0.035, 2093, 60);
    }

    // a first step done: a little three-note chime
    public static chime() {
        [784, 988, 1319].forEach((f, i) => Sfx.tone(f, i == 2 ? 260 : 90, "triangle", 0.07, f, i * 85));
    }

    // a skill's level up: a quick rising run and a held note
    public static levelUp() {
        if (!Sfx.ready("level", 600)) return;
        [523, 659, 784, 1047].forEach((f, i) => Sfx.tone(f, i == 3 ? 380 : 80, "square", 0.05, f, i * 70));
        Sfx.tone(1568, 300, "triangle", 0.04, 1568, 280);
    }

    // all the first steps done: the race's fanfare
    public static fanfare() {
        [523, 659, 784, 1047].forEach((f, i) => Sfx.tone(f, i == 3 ? 520 : 130, "square", 0.07, f, i * 120));
        for (let i = 0; i < 6; i++) Sfx.tone(1319 + (i % 2) * 440, 70, "square", 0.035, 1319 + (i % 2) * 440, 600 + i * 65);
    }

    // a chest turning up: a sparkly shimmer down and up
    public static chestAppear() {
        for (let i = 0; i < 5; i++) Sfx.tone(2093 - i * 180, 55, "triangle", 0.04, 2093 - i * 180, i * 45);
        Sfx.tone(1047, 200, "triangle", 0.05, 1568, 230);
    }

    // a chest opened: the lid's thump, then a run up by how good it was (0 wooden, 1 silver, 2 golden)
    public static chestOpen(tier: number) {
        Sfx.noise(120, 300, 0.09);
        Sfx.tone(196, 90, "square", 0.05, 147);
        const notes = [[659, 784, 1047], [659, 784, 1047, 1319], [523, 659, 784, 1047, 1319, 1568]][tier] ?? [659, 784, 1047];
        notes.forEach((f, i) => Sfx.tone(f, i == notes.length - 1 ? 340 : 75, "square", 0.055, f, 140 + i * 70));
        if (tier >= 1) for (let i = 0; i < 4 + tier * 3; i++) Sfx.tone(1760 + (i % 3) * 330, 50, "triangle", 0.03, 1760 + (i % 3) * 330, 160 + notes.length * 70 + i * 55);
    }

    // a made thing's quality shown (1 Fine, 2 Superior, 3 Masterwork): a shimmer, more and higher the better
    public static quality(q: number) {
        const runs = [[1047, 1319], [1047, 1319, 1568, 2093], [784, 988, 1175, 1568, 1976, 2349, 3136]][q - 1] ?? [];
        runs.forEach((f, i) => Sfx.tone(f, i == runs.length - 1 ? 380 : 70, "triangle", 0.06, f, i * 65));
        if (q >= 3) { Sfx.noise(900, 3000, 0.05, 80); Sfx.tone(392, 600, "square", 0.04, 784, 0); }
    }

    // an achievement: a bright two-part jingle
    public static achievement() {
        [659, 880, 1109, 1319].forEach((f, i) => Sfx.tone(f, 90, "square", 0.05, f, i * 75));
        [1319, 1760].forEach((f, i) => Sfx.tone(f, 260, "triangle", 0.05, f, 320 + i * 140));
    }

    // a lucky gather: a sparkly up-run
    public static lucky() {
        for (let i = 0; i < 6; i++) Sfx.tone(1047 * Math.pow(2, i / 5), 55, "triangle", 0.05, 1047 * Math.pow(2, i / 5), i * 40);
    }

    // a streak's milestone (x5, x10...): a quick double, higher each time
    public static streak(n: number) {
        const f = 1319 * Math.pow(2, Math.min(12, Math.floor(n / 5)) / 12);
        Sfx.tone(f, 60, "square", 0.04);
        Sfx.tone(f * 1.5, 120, "square", 0.04, f * 1.5, 60);
    }

    // in a fight: a blow landing (a crit sharper), the last foe down (a thump and a sting)
    public static hit(crit: boolean) {
        if (!Sfx.ready("hit", 60)) return;
        Sfx.noise(crit ? 90 : 50, crit ? 2200 : 900, crit ? 0.06 : 0.03);
        if (crit) Sfx.tone(1760, 80, "square", 0.035, 880);
    }
    public static kill() {
        if (!Sfx.ready("kill", 300)) return;
        Sfx.noise(260, 180, 0.09);
        Sfx.tone(110, 240, "square", 0.05, 55);
        Sfx.tone(1319, 220, "triangle", 0.04, 1319, 180);
    }

    // a mimic: its snarl as it bites, a hit on it, getting away
    public static mimic() { Sfx.noise(400, 250, 0.1); Sfx.tone(220, 300, "sawtooth", 0.05, 90); Sfx.tone(160, 260, "sawtooth", 0.04, 70, 120); }
    public static mimicHit(k: number) { Sfx.noise(60, 700, 0.06); Sfx.tone(300 + k * 60, 60, "square", 0.04, 200 + k * 40); }
    public static mimicGone() { Sfx.tone(440, 400, "triangle", 0.05, 110); }

    // a bounty up, and done
    public static bounty() { Sfx.tone(523, 90, "square", 0.05); Sfx.tone(784, 90, "square", 0.05, 784, 90); Sfx.tone(659, 200, "triangle", 0.05, 659, 180); }
    public static bountyDone() { [523, 659, 784, 1047, 1319].forEach((f, i) => Sfx.tone(f, i == 4 ? 320 : 70, "square", 0.05, f, i * 60)); }

    // fireworks: a whistle up and a crackle (`wait` ms from now)
    public static firework(wait = 0) {
        Sfx.tone(600, 380, "sine", 0.03, 1800, wait);
        Sfx.noise(500, 1800, 0.07, wait + 380);
    }

    // numbers rolling up (the away summary): a soft tick
    public static roll() {
        if (!Sfx.ready("roll", 45)) return;
        Sfx.tone(1568, 20, "square", 0.018);
    }

    // a button: the faintest tick
    public static tick() {
        if (!Sfx.ready("tick", 40)) return;
        Sfx.tone(1200, 25, "square", 0.02, 900);
    }

}
