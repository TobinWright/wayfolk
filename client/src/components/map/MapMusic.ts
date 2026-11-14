import { Howler } from "howler";
import { Constants } from "../../constants/Constants";
import { isNight } from "../../../../shared/Weather";
import { Sound } from "../../utils/Sound";

// The music on the map (Karugamo BGM): one tune by day, another by night
// (shared/Weather), crossfading at dawn and dusk. Played straight through
// Howler's Web Audio (its context, into the music's own volume: Sound) so each
// loops without a gap between its loop points, after playing its opening once.
// Only the tune in use is fetched and kept (decoded, each is ~50 MB): the next
// is fetched when it's due, the old one carrying on till it's ready, and the
// old one's let go once it's faded out. bgm3 ends at its loop's end; bgm1
// is the whole tune, its loop (every 105s) found from where it repeats.
export class MapMusic {

    public static VOLUME = 0.35;
    public static FADE = 4;             // seconds one fades into the other
    // the tunes, and where each loops (in samples, at the file's own rate)
    public static TUNES = {
        day: { file: "bgm3.ogg", loop: [705600, 6350400] },
        night: { file: "bgm1.ogg", loop: [529200, 5159700] },
    };
    public static RATE = 44100;         // the files' sample rate

    private buffers: { [tune: string]: AudioBuffer } = {};
    private loading: { [tune: string]: boolean } = {};
    private playing: { tune: string, source: AudioBufferSourceNode, gain: GainNode } | null = null;

    // fetch a tune (once at a time; a failed one's tried again when next due)
    private load(tune: string) {
        const ctx = Howler.ctx;
        if (!ctx || this.loading[tune]) return;
        this.loading[tune] = true;
        const file = MapMusic.TUNES[tune as keyof typeof MapMusic.TUNES].file;
        fetch(Constants.AUDIO_PATH + file)
            .then(r => r.arrayBuffer())
            .then(data => ctx.decodeAudioData(data))
            .then(buffer => this.buffers[tune] = buffer)
            .catch(e => console.warn("Couldn't load " + file, e))
            .finally(() => this.loading[tune] = false);
    }

    // the tune for the time of day, once it's loaded
    public update() {
        const tune = isNight(Date.now()) ? "night" : "day";
        if (this.playing?.tune == tune) return;
        if (!this.buffers[tune]) return this.load(tune);
        const ctx = Howler.ctx, now = ctx.currentTime;
        if (this.playing) {
            const { tune: old, source, gain } = this.playing;
            gain.gain.setValueAtTime(gain.gain.value, now);
            gain.gain.linearRampToValueAtTime(0, now + MapMusic.FADE);
            source.stop(now + MapMusic.FADE);
            source.onended = () => { if (this.playing?.tune != old) delete this.buffers[old]; };
        }
        const [start, end] = MapMusic.TUNES[tune as keyof typeof MapMusic.TUNES].loop;
        const source = ctx.createBufferSource(), gain = ctx.createGain();
        source.buffer = this.buffers[tune];
        source.loop = true;
        source.loopStart = start / MapMusic.RATE;
        source.loopEnd = end / MapMusic.RATE;
        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(MapMusic.VOLUME, now + MapMusic.FADE);
        source.connect(gain).connect(Sound.musicBus());
        source.start(now);
        this.playing = { tune, source, gain };
    }
}
