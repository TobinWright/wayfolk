import * as PIXI from "pixi.js";
import { Sfx } from "../../../utils/Sfx";

// What makes a slime race dazzle (SlimeRace): specks flying (goo splats,
// dust, confetti, coins), a px or two each, drawn into one Graphics; and its
// sounds, chiptune beeps made on the spot with Web Audio (no files), as loud
// as the effects are set in Settings.

interface Speck { x: number; y: number; vx: number; vy: number; fall: number; life: number; ms: number; colors: number[]; size: number; }

export interface Burst {
    n: number; colors: number[];
    speed?: number;     // px a second, at most
    up?: number;        // px a second upward, added
    angle?: number;     // which way (radians; 0 right, -PI/2 up), spread round it
    spread?: number;
    fall?: number;      // px a second, each second
    ms?: number;        // how long each lasts, at most
    size?: number;
}

export class Specks {

    public view = new PIXI.Graphics();
    private specks: Speck[] = [];

    public burst(x: number, y: number, b: Burst) {
        const { speed = 40, up = 0, angle = -Math.PI / 2, spread = Math.PI * 2, fall = 120, ms = 600, size = 1 } = b;
        for (let i = 0; i < b.n; i++) {
            const a = angle + (Math.random() - 0.5) * spread, v = speed * (0.4 + Math.random() * 0.6);
            this.specks.push({
                x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - up * (0.6 + Math.random() * 0.4), fall,
                life: ms * (0.6 + Math.random() * 0.4), ms: 0, colors: b.colors, size,
            });
        }
    }

    public update(deltaTime: number) {
        const s = deltaTime / 1000;
        this.view.clear();
        this.specks = this.specks.filter((p) => {
            if ((p.ms += deltaTime) >= p.life) return false;
            p.vy += p.fall * s;
            p.x += p.vx * s;
            p.y += p.vy * s;
            // (colours in turn as it goes: a coin's glint, confetti's flutter)
            const color = p.colors[Math.floor(p.ms / 90 + p.life) % p.colors.length], fade = p.ms / p.life;
            this.view.beginFill(color, fade > 0.7 ? (1 - fade) / 0.3 : 1).drawRect(Math.round(p.x), Math.round(p.y), p.size, p.size).endFill();
            return true;
        });
    }

    public clear() {
        this.specks = [];
        this.view.clear();
    }

}

// the race's sounds
export class RaceSounds {

    // (the game's own synth: utils/Sfx)
    private static tone(freq: number, ms: number, type: OscillatorType = "square", loud = 0.08, to = freq, wait = 0) { Sfx.tone(freq, ms, type, loud, to, wait); }
    private static noise(ms: number, freq: number, loud = 0.06, wait = 0) { Sfx.noise(ms, freq, loud, wait); }

    public static countdown() { RaceSounds.tone(440, 140); }
    public static go() { RaceSounds.tone(880, 380, "square", 0.09); RaceSounds.noise(900, 1200, 0.05); }
    public static bet() { RaceSounds.tone(660, 70, "square", 0.06); RaceSounds.tone(990, 110, "square", 0.06, 990, 70); }
    public static lead() { RaceSounds.tone(520, 90, "triangle", 0.05, 700); }
    public static photo() { RaceSounds.noise(160, 4000, 0.08); RaceSounds.tone(1600, 60, "square", 0.04); }
    public static finish() { RaceSounds.noise(1600, 900, 0.08); }

    // the winner's fanfare; yours a bright run of coins after it
    public static win(mine: boolean) {
        [523, 659, 784, 1047].forEach((f, i) => RaceSounds.tone(f, i == 3 ? 420 : 130, "square", 0.07, f, i * 120));
        if (mine) for (let i = 0; i < 8; i++) RaceSounds.tone(1319 + (i % 2) * 440, 70, "square", 0.04, 1319 + (i % 2) * 440, 560 + i * 65);
    }

}
