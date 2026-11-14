// The game's bitmap PixelFont (dist/assets/fonts/PixelFont.xml + .png) as a
// real font, for the HTML forms (the title screen's sign-in, Settings' Save
// account): every lit pixel of each glyph a square. One font pixel is 100
// units of 1000, so at font-size 20px it's 2 screen px, like the game's
// windows (scale 2). Run: node tools/build-webfont.js
const fs = require("fs");
const path = require("path");
const { PNG } = require("pngjs");
const opentype = require("opentype.js");

const dir = path.join(__dirname, "../dist/assets/fonts");
const xml = fs.readFileSync(path.join(dir, "PixelFont.xml"), "utf8");
const png = PNG.sync.read(fs.readFileSync(path.join(dir, "PixelFont.png")));
const PX = 100, BASE = 7;           // (glyphs are top-aligned; the baseline is 7 px down)

const lit = (x, y) => png.data[(y * png.width + x) * 4 + 3] > 127;
const num = (tag, key) => Number(new RegExp(" " + key + '="(-?[0-9]+)"').exec(tag)[1]);

const glyphs = [new opentype.Glyph({ name: ".notdef", unicode: 0, advanceWidth: 4 * PX, path: new opentype.Path() })];
for (const tag of xml.match(/<char [^>]*>/g)) {
    const id = num(tag, "id"), x0 = num(tag, "x"), y0 = num(tag, "y"), w = num(tag, "width"), h = num(tag, "height");
    const ox = num(tag, "xoffset"), oy = num(tag, "yoffset"), advance = num(tag, "xadvance");
    const p = new opentype.Path();
    if (id != 32) for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        if (!lit(x0 + x, y0 + y)) continue;
        // a square, clockwise in font space (y up)
        const left = (ox + x) * PX, top = (BASE - oy - y) * PX;
        p.moveTo(left, top); p.lineTo(left + PX, top); p.lineTo(left + PX, top - PX); p.lineTo(left, top - PX); p.close();
    }
    glyphs.push(new opentype.Glyph({ name: "c" + id, unicode: id, advanceWidth: advance * PX, path: p }));
}

const font = new opentype.Font({ familyName: "PixelFont", styleName: "Regular", unitsPerEm: 1000, ascender: 800, descender: -300, glyphs });
fs.writeFileSync(path.join(dir, "PixelFont.otf"), Buffer.from(font.toArrayBuffer()));
console.log(`PixelFont.otf: ${glyphs.length - 1} glyphs`);
