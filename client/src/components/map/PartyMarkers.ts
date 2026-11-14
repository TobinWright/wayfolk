import * as PIXI from "pixi.js";
import { PartyMember } from "../../../../shared/Parties";
import { Constants } from "../../constants/Constants";
import { AP } from "../../constants/Palette";
import { IBC } from "../../Engine";
import { personTexture, shadowTexture } from "../../people/People";
import { HeroRow } from "../../data/HeroesData";
import { Overheads } from "./Overheads";
import { facingOf, Glide, glideFace, heroWalk, stationary, wandering, personAt } from "./Wander";

// The others in your heroes' parties on the map (the user, 2026-10-30: "when
// you're grouped with other characters, regardless of who they belong to,
// you should see the whole party"): whoever's they are, walking about the
// place with yours (Wander), their player's name over them (once for those of
// theirs together), the same size on the screen at any zoom. Friends' are
// left to FriendMarkers; at an event's work, to EventScenes.

interface Marker { person: PIXI.Sprite; shadow: PIXI.Sprite; name: PIXI.BitmapText; glide: Glide; }

export class PartyMarkers {

    public static SCALE = 0.5;          // as Map.MARKER_SCALE
    public static FEET = 6;             // as Map.FEET
    public static HEAD = 13;
    public static NAME_SCALE = 1.5;     // screen px a px of a name

    private markers: { [heroId: number]: Marker } = {};

    constructor(private parent: PIXI.Container, private overheads: Overheads) { }

    // the others in your heroes' parties as they walk about, and the node they're at
    private others() {
        const heroes = IBC.data.heroes, friends = new Set(IBC.data.friends.all().map((f) => f.row.id));
        const out = new Map<number, { m: PartyMember, party: PartyMember[], node: number, still: boolean, with: HeroRow }>();
        for (const h of heroes.heroes) {
            if (!(h.party?.length > 1) || !h.party.some((m) => m[0] == h.id) || !wandering(h, heroes.resting(h))) continue;
            for (const m of h.party) if (!heroes.get(m[0]) && !friends.has(m[0]) && !out.has(m[0])) out.set(m[0], { m, party: h.party, node: h.s.p, still: stationary(h.s.w), with: h });
        }
        return out;
    }

    // the one of theirs under a point on the screen, and how far in front (Wander personAt)
    public heroAt(global: PIXI.IPointData) { return personAt(this.markers, global); }

    public update(frame: number, deltaTime: number, zoom: number) {
        const graph = IBC.data.heroes.graph, now = Date.now(), named = new Set<string>();
        const others = this.others();

        others.forEach(({ m, party, node: nodeId, still, with: yours }, id) => {
            const node = graph.get(nodeId);
            if (!node) return others.delete(id);
            const mk = this.markers[id] ?? (this.markers[id] = this.make());
            const due = heroWalk(id, party, node, now, still);
            const g = mk.glide.to(due.x, due.y, deltaTime), sliding = g.gliding && Math.hypot(g.mx, g.my) > 0.01;
            const face = glideFace(g, due);
            const x = Math.round(g.x), y = Math.round(g.y) + PartyMarkers.FEET;
            mk.person.texture = personTexture(m[2], facingOf(face), due.walking || sliding ? frame : 0);
            mk.person.position.set(x, y + 1);
            mk.shadow.position.set(x, y);
            mk.person.zIndex = mk.shadow.zIndex = y;
            // (what they're at: as yours with them is)
            const row = { ...yours, id, s: { ...yours.s, c: undefined as undefined } };
            const lift = this.overheads.mark(row, false, x, y - PartyMarkers.HEAD, y, zoom);

            // their player's name, once over theirs in the party
            const key = `${m[3]}:${party[0][0]}`;
            mk.name.visible = !!m[3] && !named.has(key);
            if (mk.name.visible) {
                named.add(key);
                mk.name.text = m[3];
                mk.name.scale.set(PartyMarkers.NAME_SCALE / zoom);
                mk.name.position.set(x, y - PartyMarkers.HEAD - 3 - lift);
                mk.name.zIndex = y + 0.5;
            }
        });

        // those no longer with yours
        for (const id of Object.keys(this.markers).map(Number)) {
            if (others.has(id)) continue;
            const mk = this.markers[id];
            for (const part of [mk.person, mk.shadow, mk.name]) part.destroy();
            delete this.markers[id];
        }
    }

    private make(): Marker {
        const person = new PIXI.Sprite(), shadow = new PIXI.Sprite(shadowTexture());
        person.anchor.set(0.5, 1);
        shadow.anchor.set(0.5, 0.5);
        person.scale.set(PartyMarkers.SCALE);
        shadow.scale.set(PartyMarkers.SCALE);
        const name = new PIXI.BitmapText("", { fontName: Constants.PIXEL_FONT, fontSize: 32, tint: AP.MIST });
        name.anchor.set(0.5, 1);
        this.parent.addChild(shadow, person, name);
        return { person, shadow, name, glide: new Glide() };
    }

}
