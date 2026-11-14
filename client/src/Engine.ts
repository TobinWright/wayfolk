import { Fatina } from "fatina";
import { Log } from "fatina/dist/core/enum/log";
import * as PIXI from "pixi.js";
import { ComponentType } from "./components/BaseComponent";
import { ComponentManager } from "./components/ComponentManager";
import { Assets } from "./constants/Assets";
import { Event } from "./constants/Events";
import { DataManager } from "./data/DataManager";
import { EventManager } from "./events/EventManager";
import { NetworkManager } from "./network/NetworkManager";
import { ErrorReporting } from "./utils/ErrorReporting";
import { frameHtmlPanels } from "./art/PanelArt";

export class Engine {

    public pixi: PIXI.Application<HTMLCanvasElement>;
    public comp: ComponentManager;
    public data: DataManager;
    public events: EventManager;
    public net: NetworkManager;

    public static NO_FRAME_MS = 100;    // (no screen frame for this long: the worker's ticks move the game on)

    constructor() {
        // (no WebGL - an old machine, a locked-down browser, it turned off: Pixi can't draw at all)
        if (!PIXI.utils.isWebGLSupported()) {
            Engine.bootSays("Wayfolk needs WebGL, which this browser has turned off or doesn't have. Try another browser, or turn on hardware acceleration in this one's settings.");
            return;
        }
        PIXI.BaseTexture.defaultOptions.scaleMode = PIXI.SCALE_MODES.NEAREST;
        PIXI.BaseTexture.defaultOptions.anisotropicLevel = 4;
        PIXI.Assets.init({ manifest: Assets.MANIFEST }).then(() => PIXI.Assets.loadBundle("boot")).then(() => {
            this.initPIXI();
            this.initFatina();
            this.initManagers();
            this.initListeners();
            this.initTimer();
            this.resize();
            frameHtmlPanels();

            this.comp.create(ComponentType.MAP);
            document.getElementById("boot")?.remove();

            this.events.register(Event.NETWORK_CONNECTED, this.onNetworkConnected, this);
            this.net.connectToServer();
        }).catch((error) => {
            ErrorReporting.report(error, { where: "loading the game" });
            Engine.bootSays("The game couldn't load. Check your internet connection and refresh the page.");
        });
    }

    // the page's text before the game's drawn (index.html's #boot), for why it can't start
    private static bootSays(text: string) {
        const boot = document.getElementById("boot");
        if (boot) boot.textContent = text;
    }

    private initPIXI() {
        this.pixi = new PIXI.Application({
            // backgroundColor: 0x1D1C1A // pastel black
            backgroundColor: 0x172038 // the deep sea (Apollo navy)
        });
        this.pixi.stage.sortableChildren = true;
        this.pixi.ticker.autoStart = false;
        this.pixi.ticker.stop();
        this.pixi.view.style.display = "block";
        document.body.appendChild(this.pixi.view);
    }

    private initFatina() {
        Fatina.init(true);
        Fatina.setLog(Log.None);
    }

    private initManagers() {
        this.comp = new ComponentManager(this);
        this.data = new DataManager();
        this.events = new EventManager(this);
        this.net = new NetworkManager(this);
    }

    private initListeners() {
        window.onresize = this.resize.bind(this);
        window.addEventListener("pointermove", (e: PointerEvent) => this.events.emit(Event.GLOBAL_POINTER_MOVE, e));
        window.addEventListener("pointerup", (e: PointerEvent) => this.events.emit(Event.GLOBAL_POINTER_UP, e));
    }

    // The game's time moved on once a screen frame, by the time since the
    // last, then drawn: everything moves evenly (it was moved on by the
    // worker's 10 ms ticks, one or two a frame - uneven steps, the walking and
    // the map's drift juddering). With no frames (a hidden tab, where the
    // page's own timers are slowed) the worker's ticks keep it going, undrawn
    private initTimer() {
        let last = performance.now();
        const tick = (now: number) => {
            const deltaTime = Math.max(0, now - last);
            last = Math.max(last, now);
            this.comp.update(deltaTime);
            Fatina.update(deltaTime);
        };
        const timer = new Worker("WWTimer.js");
        timer.onmessage = () => {
            const now = performance.now();
            if (now - last >= Engine.NO_FRAME_MS) tick(now);
        };
        // (the next asked for first: anything throwing costs a frame, not every one after it)
        const draw = (now: number) => {
            requestAnimationFrame(draw);
            tick(now);
            this.pixi.renderer.render(this.pixi.stage);
        };
        requestAnimationFrame(draw);
    }

    private resize() {
        this.pixi.renderer.resize(window.innerWidth, window.innerHeight);
        this.comp.resize();
    }

    private onNetworkConnected() {
        this.comp.create(ComponentType.TITLE);
    }

}

// workaround for shared nodejs files
const module = {}; // node type module
ErrorReporting.init();      // (first: so an error while loading is caught too)
export const IBC = new Engine();