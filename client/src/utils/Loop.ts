import { Howl, Howler } from "howler";
import { Constants } from "../constants/Constants";

// A sound played over and over (the rain: MapWeather, the map's sounds:
// MapSounds), each frame fading to how loud it's wanted and moving to where
// it's wanted heard from, loaded the first time it's wanted and not playing
// at nothing. Asked to play once, its one sound: before the page's sound is
// let on (a click) it isn't playing(), and asking again each frame made a new
// sound each time, hundreds, all panned every frame (and all played at the
// click). Waiting for that, nothing more asked of it (Howler keeps each to do
// then).
export class Loop {

    private howl: Howl;
    private heardPan = 0;               // where it's heard from (kept here: stereo() isn't a number till it's loaded)
    private id: number;                 // (its one sound, played again after a pause)
    private on = false;                 // (asked to play: not playing() till the page's sound is let on)

    // `fade`: volume a second it fades by; `panRate`: pan a second it moves by
    constructor(file: string, private fade = 0.4, private panRate = 1.5) {
        this.howl = new Howl({ src: [Constants.AUDIO_PATH + file], loop: true, volume: 0, preload: false });
    }

    // `want`: how loud, 0 to 1; `pan`: from where, -1 (left) to 1 (right)
    public update(want: number, pan: number, deltaTime: number) {
        if (this.howl.state() != "loaded") {
            if (want > 0 && this.howl.state() == "unloaded") this.howl.load();
            return;
        }
        if (this.on && Howler.usingWebAudio && Howler.ctx?.state != "running") return;
        const was = this.howl.volume(), step = this.fade * deltaTime / 1000;
        const volume = want > was ? Math.min(want, was + step) : Math.max(want, was - step);
        const panWas = this.heardPan, panStep = this.panRate * deltaTime / 1000;
        this.heardPan = pan > panWas ? Math.min(pan, panWas + panStep) : Math.max(pan, panWas - panStep);
        if (this.heardPan != panWas) this.howl.stereo(this.heardPan);
        if (volume == was) return;
        this.howl.volume(volume);
        if (volume > 0 && !this.on) {
            this.on = true;
            this.id = this.howl.play(this.id);
        } else if (volume == 0 && this.on) {
            this.on = false;
            this.howl.pause();
        }
    }

}
