import { NodeData } from "../../data/NodeData";

// What's wrong with the travel graph, for the node editor to step through:
// links to nodes not there or going only one way, nodes with no links or cut
// off from the rest, places on the map with no node (or one away from it),
// and nodes on top of each other.

export interface Problem {
    text: string;
    id?: number;                // the node it's about
    x: number; y: number;       // where (map px)
}

export interface MapPlace { i: number; x: number; y: number; n: string; }

const ON_TOP = 3;               // map px: nodes this near are on top of each other
const OFF_PLACE = 12;           // map px: a place's node this far from it is off it

export function findProblems(data: NodeData, places: MapPlace[], tile: number): Problem[] {
    const out: Problem[] = [];
    const nodes = data.nodes;
    const label = (id: number) => {
        const n = data.getById(id);
        return n?.name ? `#${id} ${n.name}` : `#${id}`;
    };

    for (const node of nodes) {
        const at = { id: node.id, x: node.x, y: node.y };
        if (!node.edges.length) out.push({ text: `${label(node.id)} has no links`, ...at });
        for (const e of node.edges) {
            const other = data.getById(e);
            if (e == node.id) out.push({ text: `${label(node.id)} is linked to itself`, ...at });
            else if (!other) out.push({ text: `${label(node.id)} is linked to #${e}, which isn't there`, ...at });
            else if (!other.edges.includes(node.id)) out.push({ text: `${label(node.id)} to ${label(e)} goes one way only`, ...at });
        }
    }

    // cut off: every group of nodes but the biggest
    const group = new Map<number, number>();
    const groups: number[][] = [];
    for (const node of nodes) {
        if (group.has(node.id)) continue;
        const members: number[] = [], open = [node.id];
        group.set(node.id, groups.length);
        while (open.length) {
            const id = open.pop();
            members.push(id);
            for (const e of data.getById(id)?.edges ?? []) {
                if (group.has(e) || !data.getById(e)) continue;
                group.set(e, groups.length);
                open.push(e);
            }
        }
        groups.push(members);
    }
    const biggest = groups.reduce((a, b) => (b.length > a.length ? b : a), []);
    for (const g of groups) {
        if (g == biggest || g.length < 2) continue;     // (one alone: "no links" says it)
        const first = data.getById(Math.min(...g));
        out.push({ text: `${label(first.id)} and ${g.length - 1} more are cut off from the rest`, id: first.id, x: first.x, y: first.y });
    }

    // the places: each with its node, on it
    for (const p of places) {
        const px = Math.round((p.x + 0.5) * tile), py = Math.round((p.y + 0.5) * tile);
        const node = data.getById(p.i);
        if (!node) out.push({ text: `${p.n || "A place"} (#${p.i}) has no node`, x: px, y: py });
        else if (Math.hypot(node.x - px, node.y - py) > OFF_PLACE) out.push({ text: `${label(p.i)} is ${Math.round(Math.hypot(node.x - px, node.y - py))}px off its place`, id: p.i, x: node.x, y: node.y });
    }

    // on top of each other (by a grid, not every pair)
    const cells = new Map<string, number[]>();
    const key = (x: number, y: number) => `${Math.floor(x / tile)},${Math.floor(y / tile)}`;
    for (const node of nodes) {
        const cx = Math.floor(node.x / tile), cy = Math.floor(node.y / tile);
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
            for (const id of cells.get(`${cx + dx},${cy + dy}`) ?? []) {
                const other = data.getById(id);
                if (Math.hypot(other.x - node.x, other.y - node.y) <= ON_TOP)
                    out.push({ text: `${label(node.id)} is on top of ${label(id)}`, id: node.id, x: node.x, y: node.y });
            }
        }
        const k = key(node.x, node.y);
        if (!cells.has(k)) cells.set(k, []);
        cells.get(k).push(node.id);
    }

    return out;
}
