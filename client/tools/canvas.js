// What the art tools share: loading the game's TypeScript art files straight
// from src, and reading and writing PNGs (pngjs).

const fs = require("fs");
const path = require("path");
const ts = require("typescript");
const { PNG } = require("pngjs");

// require() TypeScript files, transpiled on the fly
require.extensions[".ts"] = (module, file) => {
    const source = fs.readFileSync(file, "utf8");
    const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019 } });
    module._compile(outputText, file);
};

// a picture of 0xRRGGBB colours, -1 see-through
class Canvas {
    constructor(w, h, back = -1) {
        this.w = w; this.h = h;
        this.px = new Int32Array(w * h).fill(back);
    }
    set(x, y, c) {
        if (c >= 0 && x >= 0 && y >= 0 && x < this.w && y < this.h) this.px[y * this.w + x] = c;
    }
    // a w-wide picture (an array of colours, -1 see-through) at (ox, oy)
    draw(pic, w, ox, oy) {
        for (let i = 0; i < pic.length; i++) this.set(ox + (i % w), oy + Math.floor(i / w), pic[i]);
    }
    // a part of another canvas
    blit(from, sx, sy, w, h, ox, oy) {
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) this.set(ox + x, oy + y, from.px[(sy + y) * from.w + sx + x]);
    }
    save(file, scale = 1) {
        const w = this.w * scale, h = this.h * scale, png = new PNG({ width: w, height: h });
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
            const c = this.px[Math.floor(y / scale) * this.w + Math.floor(x / scale)], o = (y * w + x) * 4;
            png.data[o] = (c >> 16) & 255; png.data[o + 1] = (c >> 8) & 255; png.data[o + 2] = c & 255; png.data[o + 3] = c < 0 ? 0 : 255;
        }
        fs.writeFileSync(file, PNG.sync.write(png));
        console.log("wrote " + path.resolve(file) + " (" + w + "x" + h + ")");
    }
}

function readPng(file) {
    return PNG.sync.read(fs.readFileSync(file));
}

module.exports = { Canvas, readPng };
