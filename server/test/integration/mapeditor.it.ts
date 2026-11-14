import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, rmSync, writeFileSync } from "fs";
import path from "path";
import { C2S, S2C } from "../../../shared/Routes";
import { until, World } from "./harness";

// The map editor (shared/MapEdit.ts): the map as the server has it, a tile
// painted told to everyone online and saved, bad paint refused; a place put
// on the map, changed and taken off. (The test server is the real one, on
// the repo's world.json: the tile's painted back as it was, the place taken
// off again, and world.json and world-layout.ts checked to be just as they
// were.)

const CLIENT = path.join(__dirname, "..", "..", "..", "..", "..", "client");     // (build-test/server/test/integration -> client/)
const WORLD_FILE = path.join(CLIENT, "dist", "assets", "json", "world.json");
const PAINT_FILE = path.join(CLIENT, "tools", "world-paint.json");
const LAYOUT_FILE = path.join(CLIENT, "tools", "world-layout.ts");

let world: World;
const worldWas = readFileSync(WORLD_FILE, "utf8");
const layoutWas = readFileSync(LAYOUT_FILE, "utf8");
const paintWas = existsSync(PAINT_FILE) ? readFileSync(PAINT_FILE, "utf8") : null;
before(async () => { world = await World.start(); });
after(async () => {
    await world?.stop();
    // (as they were, whatever happened)
    writeFileSync(WORLD_FILE, worldWas);
    writeFileSync(LAYOUT_FILE, layoutWas);
    if (paintWas == null) rmSync(PAINT_FILE, { force: true });
    else writeFileSync(PAINT_FILE, paintWas);
});

test("the map editor: opened, a tile painted (and told to everyone), painted back; bad paint refused", async () => {
    const admin = await world.admin();
    const watcher = await world.guest();

    const opened = await admin.ask(C2S.MAPED_OPEN, {}, S2C.MAPED_WORLD);
    const json = JSON.parse(worldWas);
    assert.deepEqual(opened.l.map((l: any) => l.n), json.layers.map((l: any) => l.n), "every layer, in order");
    const sea = opened.l.findIndex((l: any) => l.n == "sea");
    assert.equal(opened.e.filter((_: number, i: number) => i % 2).reduce((a: number, n: number) => a + n, 0), json.w * json.h, "the terrain, every tile");
    const first = opened.l[sea].d[0];

    // a tile of the sea, another of its waves, then back as it was
    const other = first == -1 ? 0 : -1;
    const painted = await admin.ask(C2S.MAPED_PAINT, { t: 1, c: [sea, 0, other], e: [], p: [] }, S2C.MAPED_PAINTED, S2C.MAPED_REFUSED);
    assert.equal(painted.r, S2C.MAPED_PAINTED, painted.w);
    assert.equal(painted.t, 1);
    const told = await watcher.next(S2C.MAPED_TILES);
    assert.deepEqual(told.c, [sea, 0, other], "everyone online sees it");
    const back = await admin.ask(C2S.MAPED_PAINT, { t: 2, c: [sea, 0, first], e: [], p: [] }, S2C.MAPED_PAINTED, S2C.MAPED_REFUSED);
    assert.equal(back.r, S2C.MAPED_PAINTED);

    const bads: { c: number[], e: number[], p: number[] }[] = [
        { c: [99, 0, 1], e: [], p: [] },                // no such layer
        { c: [sea, json.w * json.h, 1], e: [], p: [] }, // off the map
        { c: [sea, 0], e: [], p: [] },                  // not whole
        { c: [], e: [0, 99], p: [] },                   // no such terrain
        { c: [], e: [], p: [3, 0, 9] },                 // no such cover
    ];
    for (const bad of bads) {
        const refused = await admin.ask(C2S.MAPED_PAINT, { t: 3, ...bad }, S2C.MAPED_PAINTED, S2C.MAPED_REFUSED);
        assert.equal(refused.r, S2C.MAPED_REFUSED, JSON.stringify(bad));
        assert.equal(refused.t, 3);
    }

    // (not an editor: nothing)
    watcher.send(C2S.MAPED_OPEN);
    await assert.rejects(watcher.next(S2C.MAPED_WORLD, () => true, 1500));

    // saved as it stops: just as it was
    await world.stopServer();
    assert.equal(readFileSync(WORLD_FILE, "utf8"), worldWas, "world.json as it was");
    assert.ok(existsSync(PAINT_FILE), "what was painted kept");
    const paint = JSON.parse(readFileSync(PAINT_FILE, "utf8"));
    assert.equal(paint.w, json.w);
});

test("places: one moved and renamed (its node with it), refused another's sprite or tile, taken off and put back; world-layout.ts as it was", async () => {
    await world.startServer();
    const admin = await world.admin();
    const watcher = await world.guest();
    const json = JSON.parse(worldWas);
    // (the last: taken off and put back, it's last again)
    const last = json.places[json.places.length - 1], id = last.i;
    const as = { k: last.k, s: last.s, x: last.x, y: last.y, n: last.n };
    const ask = (t: number, i: number, a: object) => admin.ask(C2S.MAPED_PLACE, { t, i, a }, S2C.MAPED_PLACED, S2C.MAPED_REFUSED);

    const moved = await ask(1, id, { ...as, x: last.x + 1, n: "Testholm" });
    assert.equal(moved.r, S2C.MAPED_PLACED, moved.w);
    assert.equal(moved.i, id);
    const told = await watcher.next(S2C.MAPED_PLACES, (m) => m.l.some((p: any) => p.i == id && p.n == "Testholm"));
    assert.equal(told.l.find((p: any) => p.i == id).x, last.x + 1, "everyone online sees it");
    // (its node saved as it goes, not waited for)
    const nodeName = async () => JSON.parse((await world.query<any[]>("SELECT data FROM node WHERE id = ?", [id]))[0].data).name;
    await until(async () => await nodeName() == "Testholm", "its node with it");

    assert.equal((await ask(2, id, { ...as, s: json.places[0].s })).r, S2C.MAPED_REFUSED, "another place's sprite");
    assert.equal((await ask(3, id, { ...as, x: json.places[0].x, y: json.places[0].y })).r, S2C.MAPED_REFUSED, "on another place");
    assert.equal((await ask(4, id, { ...as, k: 999 })).r, S2C.MAPED_REFUSED, "no such kind");

    const off = await ask(5, id, null);
    assert.equal(off.r, S2C.MAPED_PLACED, off.w);
    await watcher.next(S2C.MAPED_PLACES, (m) => !m.l.some((p: any) => p.i == id));
    const back = await ask(6, id, as);
    assert.equal(back.r, S2C.MAPED_PLACED, back.w);
    assert.equal(back.i, id, "back with its own id");

    await world.stopServer();
    assert.equal(readFileSync(WORLD_FILE, "utf8"), worldWas, "world.json as it was");
    assert.equal(readFileSync(LAYOUT_FILE, "utf8"), layoutWas, "world-layout.ts as it was, written again");
});
