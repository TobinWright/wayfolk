import * as PIXI from "pixi.js";
import { tentTexture } from "../../art/CampArt";
import { Constants } from "../../constants/Constants";
import { AP } from "../../constants/Palette";
import { IBC } from "../../Engine";
import { personTexture, shadowTexture, sittingTexture } from "../../people/People";
import { Campfires, campNight } from "./Campfires";
import { MapWeather } from "./MapWeather";
import { Overheads } from "./Overheads";
import { facingOf, Glide, glideFace, heroWalk, partyIds, partyWith, stationary, tentAt, wandering, personAt } from "./Wander";

// Friends' heroes on the map (FriendsData.all: your favourites', and the
// friend last found): drawn as yours are, walking about where they work
// (with your hero's party, if they're in one), a little in front of yours
// where they stand side by side at an event, with a gold pip over them and
// their player's name over the pip (once for those of theirs together), the
// same size on the screen at any zoom. At night, resting, round their
// party's campfire (Campfires); what they're at over them (Overheads).
// In demo mode, everyone else's too, the same but for the pip and the name.

interface Marker { person: PIXI.Sprite; shadow: PIXI.Sprite; fire: PIXI.Sprite; pip: PIXI.Graphics; name: PIXI.BitmapText; glide: Glide; }

export class FriendMarkers {

    public static SCALE = 0.5;          // as Map.MARKER_SCALE
    public static FEET = 6;             // as Map.FEET
    public static SIDE = 6;             // map px apart those standing together stand
    public static FRONT = 3;            // map px in front of your heroes
    public static HEAD = 13;
    public static TENT_TOP = 7;
    public static SIT_TOP = 11;
    public static NAME_SCALE = 1.5;     // screen px a px of a name

    private markers: { [heroId: number]: Marker } = {};

    constructor(private parent: PIXI.Container, private weather: MapWeather, private camps: Campfires, private overheads: Overheads) { }

    // the one of theirs under a point on the screen, and how far in front (Wander personAt)
    public heroAt(global: PIXI.IPointData) { return personAt(this.markers, global); }

    public update(frame: number, stepTime: number, deltaTime: number, zoom: number) {
        const heroes = IBC.data.heroes, seen = new Set<number>(), now = Date.now(), night = campNight(now);
        const friends = IBC.data.friends.all(), theirs = new Set(friends.map((f) => f.row.id));
        // (owner -1: not a friend's, in demo mode; yours and those with yours are drawn already)
        const all = [...friends, ...heroes.demoRows.filter((row) => !theirs.has(row.id) && !heroes.get(row.id) && !partyWith(row.id)).map((row) => ({ owner: -1, row }))];
        // those at an event's work at each place, to stand side by side
        const standing: { [node: number]: number[] } = {};
        for (const { row } of all) if (!row.s.r.length && !heroes.resting(row) && !wandering(row, false)) (standing[row.s.p] ??= []).push(row.id);
        const named = new Set<string>();

        for (const { owner, row } of all) {
            seen.add(row.id);
            const m = this.markers[row.id] ?? (this.markers[row.id] = this.make());
            const resting = heroes.resting(row), node = heroes.graph.get(row.s.p);
            // with one of your heroes, their party's as you have it (Wander: they walk with it)
            const party = partyWith(row.id) ?? row.party;
            let at: { x: number, y: number, face: number, fy?: number, walking: boolean, z?: number }, together = [row.id], sitting = false;
            const camped = node && resting && (!row.s.r.length || !!row.s.o);
            if (camped && night) {
                const seat = this.camps.seat(row.id, partyIds(row.id), node);
                m.glide.set(seat.x, seat.y);
                at = { ...seat, walking: false };
                sitting = true;
            } else if (camped) {
                const tent = tentAt(row.id, node);
                m.glide.set(tent.x, tent.y);
                at = { ...tent, face: 0, walking: false };
            } else {
                let due: { x: number, y: number, face: number, fy?: number, walking: boolean };
                if (node && wandering(row, resting)) due = heroWalk(row.id, party, node, now, stationary(row.s.w));
                else {
                    const p = heroes.position(row);
                    if (!p.moving && !row.s.r.length) {     // (not one held up on their way)
                        together = standing[row.s.p] ?? [row.id];
                        p.x += (together.indexOf(row.id) - (together.length - 1) / 2) * FriendMarkers.SIDE;
                    }
                    due = { x: p.x, y: p.y, face: p.dx, fy: p.dy, walking: p.moving };
                }
                const g = m.glide.to(due.x, due.y, deltaTime), sliding = g.gliding && Math.hypot(g.mx, g.my) > 0.01;
                at = { x: g.x, y: g.y, ...glideFace(g, due), walking: due.walking || sliding };
            }
            // (a little in front of yours where they stand side by side; walking about, where their walk has them)
            const x = Math.round(at.x), y = Math.round(at.y) + FriendMarkers.FEET + (together.length > 1 ? FriendMarkers.FRONT : 0);
            const tent = resting && !sitting;
            m.person.texture = tent ? tentTexture() : sitting ? sittingTexture(row.d.l, facingOf(at)) : personTexture(row.d.l, facingOf(at), at.walking ? frame : 0);
            m.person.position.set(x, y + 1);
            m.shadow.position.set(x, y);
            m.shadow.visible = !tent;
            m.fire.visible = tent;
            m.fire.alpha = MapWeather.fireAlpha();
            m.fire.scale.set(FriendMarkers.SCALE * (1 + 0.05 * Math.sin(stepTime / 90)));
            m.fire.position.set(x + 2.5, y - 2);
            const head = y - (tent ? FriendMarkers.TENT_TOP : sitting ? FriendMarkers.SIT_TOP : FriendMarkers.HEAD), top = head - 2;
            m.pip.position.set(x, top);
            m.pip.visible = owner >= 0;
            const lift = this.overheads.mark(row, resting, x, top - 2, y, zoom);
            m.person.zIndex = m.shadow.zIndex = m.pip.zIndex = at.z ?? y;

            // their name once over those of theirs standing together (over the
            // middle one), or walking about in the same party; else over each
            const key = together.length > 1 ? `${owner}:at${row.s.p}` : `${owner}:${party?.[0][0] ?? row.id}`;
            const mine = owner < 0 ? [] : together.filter((id) => all.find((f) => f.row.id == id)?.owner == owner);
            const middle = mine[Math.floor((mine.length - 1) / 2)] ?? row.id;
            m.name.visible = owner >= 0 && !named.has(key) && (together.length < 2 || middle == row.id);
            if (m.name.visible) {
                named.add(key);
                m.name.text = IBC.data.friends.friend(owner)?.n ?? "";
                m.name.scale.set(FriendMarkers.NAME_SCALE / zoom);
                m.name.position.set(x, top - 3 - lift);
                m.name.zIndex = y + 0.5;
            }
        }

        // those no longer shown
        for (const id of Object.keys(this.markers).map(Number)) {
            if (seen.has(id)) continue;
            const m = this.markers[id];
            for (const part of [m.person, m.shadow, m.fire, m.pip, m.name]) part.destroy();
            delete this.markers[id];
        }
    }

    private make(): Marker {
        const person = new PIXI.Sprite(), shadow = new PIXI.Sprite(shadowTexture());
        person.anchor.set(0.5, 1);
        shadow.anchor.set(0.5, 0.5);
        person.scale.set(FriendMarkers.SCALE);
        shadow.scale.set(FriendMarkers.SCALE);
        // a gold diamond, edged dark
        const pip = new PIXI.Graphics()
            .beginFill(AP.BLACK).drawPolygon([0, -2.5, 2.5, 0, 0, 2.5, -2.5, 0]).endFill()
            .beginFill(AP.STRAW).drawPolygon([0, -1.5, 1.5, 0, 0, 1.5, -1.5, 0]).endFill();
        const name = new PIXI.BitmapText("", { fontName: Constants.PIXEL_FONT, fontSize: 32, tint: AP.STRAW });
        name.anchor.set(0.5, 1);
        this.parent.addChild(shadow, person, pip, name);
        return { person, shadow, pip, name, fire: this.weather.glow(AP.AMBER), glide: new Glide() };
    }

}
