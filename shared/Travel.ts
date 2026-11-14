import { HeroData, Stat, traitMul } from "./Heroes";
import { wornStats } from "./Tasks";

// Getting about (DESIGN.md "The travel graph"): heroes go from node to node
// of the travel graph, by the shortest way along its edges. Both sides find
// the same ways: the server to move heroes, the client to say how far off a
// place is.

// a node of the graph as the server sends it (NodeManager.getJSON): map px;
// s how far round it heroes walk about while working there (client/src/components/map/Wander.ts)
export interface TravelNode { i: number; x: number; y: number; n: string; s?: number; te: number; e: number[]; }
export type Graph = Map<number, TravelNode>;

export function makeGraph(nodes: TravelNode[]): Graph {
    return new Map(nodes.map((n) => [n.i, n]));
}

export function legLength(a: TravelNode, b: TravelNode) {
    return Math.hypot(b.x - a.x, b.y - a.y);
}

// the nodes after `from` on the shortest way to `to` ([] there already; null no way)
export function findPath(graph: Graph, from: number, to: number): number[] {
    if (from == to) return [];
    if (!graph.has(from) || !graph.has(to)) return null;
    const dist = new Map<number, number>([[from, 0]]), prev = new Map<number, number>();
    const open = new Set<number>([from]), done = new Set<number>();
    while (open.size) {
        let at = -1, best = Infinity;
        open.forEach((id) => { if (dist.get(id) < best) { best = dist.get(id); at = id; } });
        open.delete(at);
        if (at == to) break;
        done.add(at);
        const node = graph.get(at);
        for (const next of node.e) {
            const other = graph.get(next);
            if (!other || done.has(next)) continue;
            const d = best + legLength(node, other);
            if (d < (dist.get(next) ?? Infinity)) { dist.set(next, d); prev.set(next, at); open.add(next); }
        }
    }
    if (!prev.has(to)) return null;
    const path = [to];
    while (prev.get(path[0]) != from) path.unshift(prev.get(path[0]));
    return path;
}

// how far every node is from `from` by the shortest way (map px; one with no way there isn't in it)
export function distancesFrom(graph: Graph, from: number) {
    const dist = new Map<number, number>();
    if (!graph.has(from)) return dist;
    dist.set(from, 0);
    const open = new Set<number>([from]), done = new Set<number>();
    while (open.size) {
        let at = -1, best = Infinity;
        open.forEach((id) => { if (dist.get(id) < best) { best = dist.get(id); at = id; } });
        open.delete(at);
        done.add(at);
        const node = graph.get(at);
        for (const next of node.e) {
            const other = graph.get(next);
            if (!other || done.has(next)) continue;
            const d = best + legLength(node, other);
            if (d < (dist.get(next) ?? Infinity)) { dist.set(next, d); open.add(next); }
        }
    }
    return dist;
}

// how far a way is, in map px, from `from` along `path`
export function pathLength(graph: Graph, from: number, path: number[]) {
    let length = 0, at = graph.get(from);
    for (const id of path) { const next = graph.get(id); length += legLength(at, next); at = next; }
    return length;
}

// a little over half a tile a second (8 till the user, 2026-11-01: "increase
// player movement speed slightly"), quicker or slower by their Agility (1 + 0.02 a point
// over or under 10) and their traits (Wanderer...); the time of day, the
// weather and the sea go on top as they go (shared/Conditions.ts travelPace)
export const TRAVEL_SPEED = 10;     // map px a second
export function travelSpeed(h: HeroData) {
    return TRAVEL_SPEED * (1 + 0.02 * (wornStats(h)[Stat.AGI] - 10)) * traitMul(h, "travel");
}

// a leg over the sea: either end a sea node (terrain 0, the client's TerrainType.WATER)
export const SEA_TERRAIN = 0;
export function isSeaLeg(a: TravelNode, b: TravelNode) {
    return a?.te == SEA_TERRAIN || b?.te == SEA_TERRAIN;
}
