import * as PIXI from "pixi.js";
import { lightTint } from "../../art/WeatherArt";
import { Constants } from "../../constants/Constants";
import { AP } from "../../constants/Palette";
import { IBC } from "../../Engine";
import { personTexture, shadowTexture } from "../../people/People";
import { facingOf, Glide, glideFace, heroWalk, partyWith, stationary, personAt } from "./Wander";

// Featured parties on the map (server HeroFeatured; the user, 2026-11-01:
// "you dont see their character window, just the party on the map with a
// feature party marker over their head"): walking about at their work as a
// party does (Wander). Over each party, at any zoom, its heroes' names one
// over another in a plum box with a point down to them, as your own party's
// window shows zoomed right out (HeroWindow setCompact; the user,
// 2026-11-01), "Featured Party" over it while pointed at; nothing of what
// they're at over their heads. One with any of yours, a friend's or those
// with yours in it is left to them (Map, FriendMarkers, PartyMarkers);
// those of a player you've blocked aren't shown. Over the events' bubbles,
// heroes and all (the user, 2026-11-01: "they should be on top"), shaded by
// the time of day themselves, as they're over the weather's shade.

interface Marker { person: PIXI.Sprite; shadow: PIXI.Sprite; glide: Glide; }
interface Label { box: PIXI.Container; names: string; }

export class FeaturedMarkers {

    public static SCALE = 0.5;          // as Map.MARKER_SCALE
    public static FEET = 6;             // as Map.FEET
    public static HEAD = 13;
    public static LABEL_SCALE = 2;      // screen px a px of a label (as HeroWindow.SCALE)
    public static NAME_LINE = 5;        // px a name, stacked (as HeroWindow.NAME_LINE)

    public figures = new PIXI.Container();  // (over the events' bubbles)
    public labels = new PIXI.Container();   // (over the map's markers, so they can be pointed at)
    private markers: { [heroId: number]: Marker } = {};
    private boxes: { [leaderId: number]: Label } = {};

    constructor() {
        this.figures.eventMode = "none";
        this.figures.sortableChildren = true;
        this.labels.eventMode = "passive";
    }

    // the one of theirs under a point on the screen, and how far in front (Wander personAt)
    public heroAt(global: PIXI.IPointData) { return personAt(this.markers, global); }

    public update(frame: number, deltaTime: number, zoom: number) {
        const heroes = IBC.data.heroes, friends = IBC.data.friends, now = Date.now(), seen = new Set<number>(), labelled = new Set<number>();
        const theirs = new Set(friends.all().map((f) => f.row.id));
        const shade = lightTint(now);

        // (in demo mode everyone's on the map: FriendMarkers)
        for (const { party, rows } of heroes.demo ? [] : heroes.featured) {
            if (rows.some((r) => heroes.get(r.id) || theirs.has(r.id) || partyWith(r.id))) continue;
            const node = heroes.graph.get(rows[0]?.s.p);
            if (!node) continue;
            const names: string[] = [];
            let sumX = 0, top = Infinity;
            for (const row of rows) {
                const member = party.find((m) => m[0] == row.id);
                if (friends.isBlocked(member?.[3] ?? "")) continue;
                seen.add(row.id);
                const mk = this.markers[row.id] ?? (this.markers[row.id] = this.make());
                const due = heroWalk(row.id, party, node, now, stationary(row.s.w));
                const g = mk.glide.to(due.x, due.y, deltaTime), sliding = g.gliding && Math.hypot(g.mx, g.my) > 0.01;
                const face = glideFace(g, due);
                const x = Math.round(g.x), y = Math.round(g.y) + FeaturedMarkers.FEET;
                mk.person.texture = personTexture(row.d.l, facingOf(face), due.walking || sliding ? frame : 0);
                mk.person.tint = mk.shadow.tint = shade;
                mk.person.position.set(x, y + 1);
                mk.shadow.position.set(x, y);
                mk.person.zIndex = mk.shadow.zIndex = y;
                names.push(member?.[1] ?? row.d.n);
                sumX += x;
                top = Math.min(top, y - FeaturedMarkers.HEAD);
            }
            if (!names.length) continue;

            // their names over them, the point at the middle of the party
            const leader = party[0][0];
            labelled.add(leader);
            const label = this.label(leader, names);
            label.box.scale.set(FeaturedMarkers.LABEL_SCALE / zoom);
            // (on whole screen px: zoomed right out a map px is half of one, and a
            // part of one garbles the text; the user, 2026-11-03)
            label.box.position.set(Math.round(Math.round(sumX / names.length) * zoom) / zoom, Math.round((top - 1) * zoom) / zoom);
        }

        // those no longer featured
        for (const id of Object.keys(this.markers).map(Number)) {
            if (seen.has(id)) continue;
            const mk = this.markers[id];
            for (const part of [mk.person, mk.shadow]) part.destroy();
            delete this.markers[id];
        }
        for (const id of Object.keys(this.boxes).map(Number)) {
            if (labelled.has(id)) continue;
            this.boxes[id].box.destroy({ children: true });
            delete this.boxes[id];
        }
    }

    private make(): Marker {
        const person = new PIXI.Sprite(), shadow = new PIXI.Sprite(shadowTexture());
        person.anchor.set(0.5, 1);
        shadow.anchor.set(0.5, 0.5);
        person.scale.set(FeaturedMarkers.SCALE);
        shadow.scale.set(FeaturedMarkers.SCALE);
        this.figures.addChild(shadow, person);
        return { person, shadow, glide: new Glide() };
    }

    // a party's names, one over another, in a box (drawn again only as they
    // change), its point's tip at 0, 0; "Featured Party" over it pointed at
    private label(leader: number, names: string[]) {
        const key = names.join("\n");
        const had = this.boxes[leader];
        if (had?.names == key) return had;
        had?.box.destroy({ children: true });

        const L = FeaturedMarkers.NAME_LINE;
        const texts = names.map((name, i) => {
            const t = new PIXI.BitmapText(name, { fontName: Constants.PIXEL_FONT, fontSize: 16, tint: AP.WHITE });
            t.position.set(2, 1 + i * L);
            return t;
        });
        const w = Math.ceil(Math.max(0, ...texts.map((t) => t.textWidth))) + 4, h = names.length * L + 2;
        const frame = new PIXI.Graphics()
            .beginFill(AP.BLACK).drawRect(0, 0, w, h).endFill()
            .beginFill(AP.PLUM).drawRect(1, 1, w - 2, h - 2).endFill()
            .beginFill(AP.BLACK).drawPolygon([w / 2 - 2, h, w / 2 + 2, h, w / 2, h + 2]).endFill();

        const tip = new PIXI.Container(), tipText = new PIXI.BitmapText("Featured Party", { fontName: Constants.PIXEL_FONT, fontSize: 16, tint: AP.PINK });
        const tipW = Math.ceil(tipText.textWidth) + 4;
        tipText.position.set(2, 1);
        tip.addChild(new PIXI.Graphics()
            .beginFill(AP.BLACK).drawRect(0, 0, tipW, 7).endFill()
            .beginFill(AP.SHADOW).drawRect(1, 1, tipW - 2, 5).endFill(), tipText);
        tip.position.set(Math.round((w - tipW) / 2), -8);
        tip.visible = false;

        const box = new PIXI.Container();
        box.addChild(frame, ...texts, tip);
        box.pivot.set(w / 2, h + 2);
        box.eventMode = "static";
        box.hitArea = new PIXI.Rectangle(0, 0, w, h + 2);
        box.on("pointerover", () => tip.visible = true);
        box.on("pointerout", () => tip.visible = false);
        this.labels.addChild(box);
        return this.boxes[leader] = { box, names: key };
    }

}
