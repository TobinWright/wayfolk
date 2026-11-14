// Writes the database's tables to schema/ (npm run schema, in server/), so a
// new database can be made from the repo (README.md, Running it live, Database):
//   schema/schema.sql - every table, empty (CREATE TABLE IF NOT EXISTS)
//   schema/seed.sql   - what the world needs to start: the travel graph and
//                       the cosmetics catalog (SEEDED), its rows replaced
// It reads the database in server/.env (or `--db <name>` for another on the
// same server). Run it again whenever a table changes: the tables the server
// makes or adds to as it starts are in it too, as they are now.

const fs = require("fs");
const path = require("path");
const mysql = require("mysql2/promise");

const SEEDED = ["node", "cosmetic_pack", "cosmetic_tier"];
const OUT = path.join(__dirname, "..", "schema");

// server/.env, read as the server reads it (utils/Env.ts)
function env() {
    const out = {};
    for (const line of fs.readFileSync(path.join(__dirname, "..", ".env"), "utf8").split(/\r?\n/)) {
        const m = /^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/.exec(line);
        if (m) out[m[1]] = m[2];
    }
    return out;
}

async function main() {
    const e = env(), at = process.argv.indexOf("--db");
    const database = at > 0 ? process.argv[at + 1] : e.DB_DATABASE;
    const conn = await mysql.createConnection({ host: e.DB_HOST, port: Number(e.DB_PORT || 3306), user: e.DB_USER, password: e.DB_PASS, database });
    try {
        const [[{ v }]] = await conn.query("SELECT VERSION() v");
        const [tables] = await conn.query("SELECT table_name t FROM information_schema.tables WHERE table_schema = ? AND table_type = 'BASE TABLE' ORDER BY table_name", [database]);
        const head = (what) => `-- Wayfolk: ${what}\n-- Made by server/tools/dump-schema.js (npm run schema) from MySQL ${v}. Don't edit by hand.\n\n`;

        let schema = head("every table, empty. Load it into a new database, then seed.sql.") + "SET NAMES utf8mb4;\n\n";
        for (const { t } of tables) {
            const [[row]] = await conn.query(`SHOW CREATE TABLE \`${t}\``);
            schema += row["Create Table"]
                .replace(/^CREATE TABLE/, "CREATE TABLE IF NOT EXISTS")
                .replace(/ AUTO_INCREMENT=\d+/, "") + ";\n\n";
        }

        let seed = head("the travel graph and the cosmetics catalog, replacing what's there.") + "SET NAMES utf8mb4;\n\n";
        for (const t of SEEDED) {
            const [rows] = await conn.query(`SELECT * FROM \`${t}\` ORDER BY 1`);
            seed += `DELETE FROM \`${t}\`;\n`;
            for (let i = 0; i < rows.length; i += 100) {
                const part = rows.slice(i, i + 100), columns = Object.keys(part[0]);
                seed += conn.format(`INSERT INTO ?? (??) VALUES ?;\n`, [t, columns, part.map((r) => columns.map((c) => r[c]))]);
            }
            seed += "\n";
        }

        fs.mkdirSync(OUT, { recursive: true });
        fs.writeFileSync(path.join(OUT, "schema.sql"), schema);
        fs.writeFileSync(path.join(OUT, "seed.sql"), seed);
        console.log(`[schema] ${tables.length} tables from ${database} to schema/schema.sql; ${SEEDED.join(", ")} to schema/seed.sql`);
    } finally {
        await conn.end();
    }
}

main().catch((error) => {
    console.error("[schema]", error.message);
    process.exit(1);
});
