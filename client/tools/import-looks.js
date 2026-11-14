// Copies Lithalia's people into Wayfolk (npm run looks): every hairstyle and
// outfit its staff have drawn (Lithalia's lithalia_look table, each row its art
// packed as JSON) into src/people/looks.json, which the client draws people
// from (src/people/LookArt). Run it again whenever Lithalia's looks change.
// Wayfolk's own looks (src/people/ownlooks.json) aren't touched.
//
//   node tools/import-looks.js [path to Lithalia's server/.env]
//
// The database settings are read from Lithalia's server .env (default
// ../../lithalia/server/.env); mysql2 comes from Wayfolk's server.

const fs = require("fs");
const path = require("path");
const mysql = require("../../server/node_modules/mysql2/promise");

const ENV = process.argv[2] ?? path.join(__dirname, "../../../lithalia/server/.env");
const OUT = path.join(__dirname, "../src/people/looks.json");

const env = {};
for (const line of fs.readFileSync(ENV, "utf8").split(/\r?\n/)) {
    const m = /^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/.exec(line);
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}

(async () => {
    const db = await mysql.createConnection({
        host: env.DB_HOST ?? "localhost", port: +(env.DB_PORT ?? 3306),
        user: env.DB_USER, password: env.DB_PASS, database: env.DB_DATABASE ?? "game_lithalia",
    });
    const [rows] = await db.query("SELECT kind, n, data FROM lithalia_look WHERE kind IN ('hair', 'outfit') ORDER BY n");
    await db.end();

    // only the art and names (Lithalia's prices and cosmetic ids are its own)
    const looks = { hairs: [], outfits: [] };
    for (const row of rows) {
        const { sale, ...part } = JSON.parse(row.data);
        (row.kind == "hair" ? looks.hairs : looks.outfits)[row.n] = part;
    }
    for (const list of [looks.hairs, looks.outfits])
        if (list.some((p) => !p)) throw new Error("Lithalia's looks have a gap in their numbers");
    // Wayfolk's own (src/people/ownlooks.json) are numbered on from Lithalia's, so heroes
    // wearing them would change looks if Lithalia's grew or shrank
    const own = JSON.parse(fs.readFileSync(path.join(__dirname, "../src/people/ownlooks.json"), "utf8"));
    if ((own.hairs[0] && own.hairs[0].n != looks.hairs.length) || (own.outfits[0] && own.outfits[0].n != looks.outfits.length))
        throw new Error("Lithalia's count of hairstyles or outfits changed: Wayfolk's own (ownlooks.json) are numbered after them");

    fs.writeFileSync(OUT, JSON.stringify(looks));
    console.log(`${looks.hairs.length} hairstyles and ${looks.outfits.length} outfits written to ${path.relative(process.cwd(), OUT)}`);
})().catch((e) => { console.error(e.message); process.exit(1); });
