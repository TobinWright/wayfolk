import * as PIXI from "pixi.js";
import { NAME_COLORS } from "../../../../shared/Chat";
import { FAVOURITES_MOST, FAVOURITES_PREMIUM } from "../../../../shared/Friends";
import { BARRACKS_SLOTS, BARRACKS_SLOTS_PREMIUM, HERO_SLOTS, HERO_SLOTS_PREMIUM } from "../../../../shared/Heroes";
import { LISTINGS_MOST, LISTINGS_PREMIUM } from "../../../../shared/Market";
import { TODO_MOST, TODO_PREMIUM } from "../../../../shared/Tasks";
import { supporterCount } from "../../../../shared/Wardrobe";
import { PART_COUNTS } from "../../data/CosmeticsData";
import { Pic } from "../../art/Backdrops";
import { crownIcon, premiumIcon } from "../../art/MenuIcons";
import { Event } from "../../constants/Events";
import { AP } from "../../constants/Palette";
import { IBC } from "../../Engine";
import { picTexture } from "../../people/People";
import { Panel } from "../../shared/Panel";
import { TitleBar } from "../../shared/ui/titlebar/TitleBar";
import { legalText } from "../../shared/Legal";
import { BaseComponent, ComponentType } from "../BaseComponent";
import { Chat, NAME_TINTS, wrap } from "../chat/Chat";
import { text, textWidth } from "../games/GameUI";
import { fit } from "../heroroster/HeroRoster";
import { outlined } from "../ringmenu/RingMenu";

// What it gives (Claude's first pass, the user, 2026-10-28: "we can discuss
// perks later"): only what the server already does for a subscriber
// (PlayerRecord.isPremium) - keep it to that, so it's never promising more.
// Each listed on its own (the user, 2026-10-28: "list all perks and price";
// "what it never gives" taken off; the game tables' crown and gold name not
// listed, though they're still so). The user, 2026-10-28: more heroes, more
// favourites, a name colour to pick (the swatches under the perks: draw) and a
// Supporter's tag on the event leaderboards (the crown, in an event's window and on the Events board)
const PERKS = () => [
    "Crown chat badge",
    "Chat name colour of your choice:",
    "Supporter tag on event leaderboards",
    `${supporterCount(IBC.data.cosmetics.catalog, PART_COUNTS)} Supporter cosmetics for heroes`,
    `Heroes ${HERO_SLOTS} -> ${HERO_SLOTS_PREMIUM}`,
    `Barracks beds ${BARRACKS_SLOTS} -> ${BARRACKS_SLOTS_PREMIUM}`,
    `Favourite friends ${FAVOURITES_MOST} -> ${FAVOURITES_PREMIUM}`,
    "Heroes rest after 72h vs 24h",
    `Heroes to-do list ${TODO_MOST} -> ${TODO_PREMIUM}`,
    `Market listings ${LISTINGS_MOST} -> ${LISTINGS_PREMIUM}`,
];
const COLOR_PERK = 1;               // (the perk the swatches go under)
const BILLING = "Billed monthly through Stripe. Cancel any time: it stays on to the end of what you've paid for";
const PRICE = "$4.99/mo";           // shown till Stripe's set up and its own price read (server/.env)
const PREVIEW = __PREVIEW__;        // shows it on sale (at PRICE) before Stripe's set up: on in dev builds, off in production unless built with --env PREVIEW=1 (webpack.config.js)

// Premium, the Supporter subscription (server managers/billing), from the
// main menu: the crown and its price, whether you're one (renewing),
// what it gives, how it's billed, and along the bottom a
// line saying what came of things and Subscribe (to Stripe's checkout page)
// or Manage (Stripe's page to change your card or cancel). Guests can't
// subscribe. A window like the others (Panel and TitleBar); Escape or its
// cross closes it.

export class Premium extends BaseComponent {

    public static SCALE = 2;
    public static W = 220;              // its content, in its own px
    public static PAD = 8;
    public static LINE = 9;
    public static INSET_X = 12;         // the window round it, in screen px
    public static INSET_Y = 28;
    public static BUTTON_W = 60;
    public static BUTTON_H = 13;
    public static SWATCH = 10;          // a name colour's box

    public background: Panel;
    public titleBar: TitleBar;
    private content: PIXI.Container;
    private dynamic: PIXI.Container;    // (the price, your subscription and the button: drawn again as they change)
    private info: PIXI.BitmapText;
    private textures: PIXI.Texture[] = [];
    private h = 0;                      // its content's height (own px)
    private swatchY = 0;                // the name colours' row (own px)

    private keys = (e: KeyboardEvent) => { if (e.key == "Escape" && !Chat.takes(e)) IBC.comp.destroy(this); };

    constructor() {
        super(ComponentType.PREMIUM);
        this.create();
    }

    // the window (one open at a time)
    public static open() {
        const view = IBC.comp.getOrCreate(ComponentType.PREMIUM) as Premium;
        view.bringToTop();
        return view;
    }

    public create() {
        super.create();
        const { W, PAD, LINE, SCALE, INSET_X, INSET_Y } = Premium;

        this.content = new PIXI.Container();
        this.content.scale.set(SCALE);
        this.content.position.set(INSET_X, INSET_Y);

        // the crown, big, by the name (the price goes under it: draw)
        const crown = this.texture(outlined(premiumIcon()));
        const sprite = new PIXI.Sprite(crown);
        sprite.scale.set(2);
        sprite.position.set(PAD, 4);
        this.content.addChild(sprite);
        text("Supporter", PAD + crown.width * 2 + 8, 14, AP.STRAW, this.content);

        // what it gives and how it's billed
        let y = 54;
        const width = W - PAD * 2;
        y = this.heading("What you get", y);
        const bullet = this.texture(crownIcon());
        PERKS().forEach((perk, k) => {
            const b = new PIXI.Sprite(bullet);
            b.position.set(PAD, y);
            this.content.addChild(b);
            y = this.para(perk, PAD + 11, y, width - 11, AP.WHITE);
            if (k == COLOR_PERK) { this.swatchY = y + 1; y += Premium.SWATCH + 4; }
        });
        y = this.para(BILLING, PAD, y + 6, width, AP.STONE);
        legalText(this.content, PAD, y + 2, ["terms", "refunds"], "You agree to our");
        y += Premium.LINE + 2;
        this.h = y + 8 + Premium.BUTTON_H + 6;

        const WIDTH = INSET_X * 2 + W * SCALE, HEIGHT = INSET_Y + this.h * SCALE + INSET_X;
        this.container.eventMode = "static";
        this.container.hitArea = new PIXI.Rectangle(0, 0, WIDTH, HEIGHT);
        this.container.on("pointerdown", (e: PIXI.FederatedPointerEvent) => e.stopPropagation());
        this.background = new Panel(this.container);
        this.background.setSize(WIDTH, HEIGHT);
        this.titleBar = new TitleBar(this);
        this.titleBar.setPosition(4, 4);
        this.titleBar.setSize(WIDTH - 8, 20);
        this.titleBar.setTitle("Premium");
        this.container.addChild(this.content);

        this.dynamic = new PIXI.Container();
        this.content.addChild(this.dynamic);
        this.info = text("", PAD, this.h - Premium.BUTTON_H - 3, AP.ASH, this.content);
        this.draw();

        window.addEventListener("keydown", this.keys);
        IBC.events.register(Event.PREMIUM_STORE, () => this.draw(), this);
        IBC.events.register(Event.PREMIUM_REFUSED, (why: string) => this.say(why, false, AP.FLAME), this);
        this.setPosition(Math.round((window.innerWidth - WIDTH) / 2), Math.round((window.innerHeight - HEIGHT) / 2));
    }

    public destroy() {
        super.destroy();
        window.removeEventListener("keydown", this.keys);
        this.titleBar.destroy();
        this.background.destroy();
        this.container.destroy({ children: true });
        this.textures.forEach((t) => t.destroy(true));
    }

    // along the bottom: what came of something (lime if it went well)
    public say(line: string, good = false, tint = good ? AP.LIME : AP.ASH) {
        this.info.text = line;
        this.info.tint = tint;
        fit(this.info, Premium.W - Premium.PAD * 2 - Premium.BUTTON_W - 4);
    }

    // the price, your subscription and the button
    private draw() {
        const { W, PAD, BUTTON_W, BUTTON_H } = Premium, store = IBC.data.premium;
        const premium = { on: store.on || PREVIEW, price: store.price || PRICE, until: store.until, renews: store.renews, active: store.active };
        this.dynamic.removeChildren().forEach((c) => c.destroy({ children: true }));
        const x = PAD + 40;
        text(premium.on ? `${premium.price}, cancel any time` : `${PRICE} (not on sale just yet)`, x, 25, premium.on ? AP.WHITE : AP.STONE, this.dynamic);

        // (one that won't renew - or one given by hand, till 2100 - says nothing here)
        const until = new Date(premium.until).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
        if (premium.active && premium.renews) text(`You're a Supporter - thank you! Renews ${until}`, PAD, 42, AP.LIME, this.dynamic);

        this.drawSwatches();

        // Manage once there's a subscription to manage, else Subscribe
        const guest = IBC.data.player.type == "guest";
        const manage = premium.renews || premium.active;
        const can = premium.on && (manage || !guest);
        const label = manage ? "Manage" : "Subscribe";
        const why = !premium.on ? "Premium isn't for sale just yet" : guest && !manage ? "Save your account first (Settings) - guests can't subscribe"
            : manage ? "Change your card or cancel, on Stripe" : `Subscribe for ${premium.price}, on Stripe`;

        const button = new PIXI.Container();
        button.position.set(W - PAD - BUTTON_W, this.h - BUTTON_H - 6);
        const box = new PIXI.Graphics();
        const paint = (lit: boolean) => box.clear()
            .beginFill(AP.BLACK).drawRect(0, 0, BUTTON_W, BUTTON_H).endFill()
            .beginFill(!can ? AP.IRON : lit ? AP.GRASS : AP.LEAF).drawRect(1, 1, BUTTON_W - 2, BUTTON_H - 2).endFill();
        paint(false);
        button.addChild(box);
        text(label, Math.round((BUTTON_W - textWidth(label)) / 2), 3, can ? AP.WHITE : AP.STONE, button);
        button.eventMode = "static";
        button.cursor = can ? "pointer" : "default";
        button.on("pointerover", () => { paint(can); this.say(why); });
        button.on("pointerout", () => { paint(false); this.say(""); });
        button.on("pointertap", () => {
            if (!can) return;
            this.say("Off to Stripe...");
            if (manage) IBC.net.premium.manage();
            else IBC.net.premium.buy();
        });
        this.dynamic.addChild(button);
    }

    // the name colours, yours outlined: a Supporter's to pick (anyone else's to look at)
    private drawSwatches() {
        const { PAD, SWATCH } = Premium, premium = IBC.data.premium;
        NAME_COLORS.forEach((name, k) => {
            const on = k == premium.color, x = PAD + 11 + k * (SWATCH + 3);
            const swatch = new PIXI.Graphics();
            const paint = (lit: boolean) => swatch.clear()
                .beginFill(on && premium.active ? AP.WHITE : lit && premium.active ? AP.ASH : AP.BLACK).drawRect(0, 0, SWATCH, SWATCH).endFill()
                .beginFill(NAME_TINTS[k]).drawRect(1, 1, SWATCH - 2, SWATCH - 2).endFill();
            paint(false);
            swatch.position.set(x, this.swatchY);
            swatch.alpha = premium.active ? 1 : 0.5;
            swatch.eventMode = "static";
            swatch.cursor = premium.active && !on ? "pointer" : "default";
            swatch.on("pointerover", () => { paint(true); this.say(premium.active ? `${name}${on ? ": your name's colour now" : ""}` : `${name}: Supporters pick one`, false, NAME_TINTS[k]); });
            swatch.on("pointerout", () => { paint(false); this.say(""); });
            swatch.on("pointertap", () => { if (premium.active && !on) IBC.net.premium.nameColor(k); });
            this.dynamic.addChild(swatch);
        });
    }

    private heading(line: string, y: number) {
        text(line.toUpperCase(), Premium.PAD, y, AP.STONE, this.content);
        return y + Premium.LINE + 2;
    }

    // `line` wrapped to `width` at (x, y); the y under it
    private para(line: string, x: number, y: number, width: number, tint: number) {
        for (const row of wrap(line, width, width, (s) => textWidth(s))) {
            text(row, x, y, tint, this.content);
            y += Premium.LINE;
        }
        return y;
    }

    private texture(pic: Pic) {
        const t = picTexture(pic);
        this.textures.push(t);
        return t;
    }

}
