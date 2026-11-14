const path = require('path');
const webpack = require('webpack');
const TerserPlugin = require("terser-webpack-plugin");
const { execSync } = require('child_process');

// What differs per deploy is given at build time, never edited in the source:
//   npm run build -- --env SERVER_IP=play.example.com [--env SERVER_PORT=443] [--env SERVER_PATH=/ws]
//                    [--env SENTRY_DSN=https://...] [--env RELEASE=<commit>] [--env PREVIEW=1]
// (or the same names as environment variables). A development build (npm run dev)
// falls back to localhost with Premium's preview on. A production build has no
// fallback for the address (it stops without one) and the preview stays off unless asked for.
// SERVER_PATH is where the proxy passes the WebSocket on (nginx's location /ws: README.md, Running it live);
// SENTRY_DSN the client's Sentry project (none: errors aren't reported); RELEASE which
// build an error came from (by default the git commit it was built from).
module.exports = (env = {}, argv = {}) => {
    const production = argv.mode === 'production';
    const pick = (name) => env[name] !== undefined ? String(env[name]) : process.env[name];

    const serverIp = pick('SERVER_IP') || (production ? '' : 'localhost');
    const serverPort = pick('SERVER_PORT') || '5301';
    const serverPath = pick('SERVER_PATH') || '/';
    const sentryDsn = pick('SENTRY_DSN') || '';
    let release = pick('RELEASE') || '';
    if (!release) try { release = execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); } catch (e) { }
    const previewSet = pick('PREVIEW');
    const preview = previewSet !== undefined ? /^(1|true|yes)$/i.test(previewSet) : !production;

    if (production && (!serverIp || /^(localhost$|127\.|0\.0\.0\.0$|::1$)/i.test(serverIp)))
        throw new Error(`A production build needs the live server's address: --env SERVER_IP=<host> (got '${serverIp}')`);
    if (!/^\d+$/.test(serverPort))
        throw new Error(`SERVER_PORT must be a number (got '${serverPort}')`);
    // (Git Bash on Windows turns a bare /ws into C:/Program Files/Git/ws: build with MSYS_NO_PATHCONV=1 there)
    if (!/^\/[\w\-\/]*$/.test(serverPath))
        throw new Error(`SERVER_PATH must be a path like /ws (got '${serverPath}')`);

    console.log(`[build] ${production ? 'production' : 'development'}: server ${serverIp}:${serverPort}${serverPath}, Sentry ${sentryDsn ? 'on' : 'off'}, release ${release || '-'}, Premium preview ${preview ? 'ON' : 'off'}`);

    return {
        mode: 'development',
        entry: './src/Engine.ts',
        devtool: production ? false : 'eval-source-map',      // (production: none, or the bundle carries the whole source)
        module: {
            rules: [
                {
                    test: /\.tsx?$/,
                    use: ['ts-loader'],
                    exclude: /node_modules/,
                },
            ],
        },
        resolve: {
            extensions: ['.tsx', '.ts', '.js'],
            alias: {
                // its "require" build is UMD in a "type: module" package, which webpack
                // reads as a module and so finds no PIXI; its module build works
                '@pixi/tilemap$': path.resolve(__dirname, 'node_modules/@pixi/tilemap/dist/pixi-tilemap.es.js'),
                // ...which imports these, which must be the same copies pixi.js requires
                // (or it registers its renderer with a Pixi the game doesn't use)
                '@pixi/core$': path.resolve(__dirname, 'node_modules/@pixi/core/lib/index.js'),
                '@pixi/display$': path.resolve(__dirname, 'node_modules/@pixi/display/lib/index.js'),
            },
        },
        output: {
            filename: 'bundle.js',
            path: path.resolve(__dirname, 'dist')
        },
        plugins: [
            // (declared for TypeScript in src/globals.d.ts)
            new webpack.DefinePlugin({
                __SERVER_IP__: JSON.stringify(serverIp),
                __SERVER_PORT__: JSON.stringify(serverPort),
                __SERVER_PATH__: JSON.stringify(serverPath),
                __SENTRY_DSN__: JSON.stringify(sentryDsn),
                __RELEASE__: JSON.stringify(release),
                __PREVIEW__: JSON.stringify(preview),
            }),
        ],
        optimization: {
            minimize: production,
            minimizer: [new TerserPlugin()],
        },
    };
};
