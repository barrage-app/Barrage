// Génère icons/icon{16,48,128}.png : le logo de Barrage, un disque rouge (#D7261E)
// barré d'un trait blanc horizontal, le même que dans l'en-tête des options.
// Encodeur PNG minimal, sans dépendance.
// crc32 est fourni par node:zlib depuis Node 22 : c'est exactement le CRC des
// chunks PNG, inutile d'en refaire la table.
import { crc32, deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

function encodePng(size, pixelAt) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0; // filtre "none"
    for (let x = 0; x < size; x++) {
      const [r, g, b, a] = pixelAt(x, y);
      raw.set([r, g, b, a], y * (size * 4 + 1) + 1 + x * 4);
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr.set([8, 6, 0, 0, 0], 8); // 8 bits, RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// Logo en coordonnées unitaires (0..1), repris de l'en-tête des options
// (viewBox 48×48) : disque plein, barre blanche aux coins arrondis.
const BAR = { left: 12 / 48, right: 36 / 48, top: 20.5 / 48, bottom: 27.5 / 48, radius: 2 / 48 };
const RED = [215, 38, 30]; // #D7261E

function onBar(u, v) {
  // Distance à un rectangle arrondi : le rectangle réduit du rayon, puis le rayon.
  const dx = Math.max(BAR.left + BAR.radius - u, 0, u - (BAR.right - BAR.radius));
  const dy = Math.max(BAR.top + BAR.radius - v, 0, v - (BAR.bottom - BAR.radius));
  return Math.hypot(dx, dy) <= BAR.radius;
}

function sample(u, v) {
  if (Math.hypot(u - 0.5, v - 0.5) > 0.5) return [0, 0, 0, 0];
  return onBar(u, v) ? [255, 255, 255, 255] : [...RED, 255];
}

function render(size) {
  const ss = 4; // sur-échantillonnage pour l'anticrénelage
  return encodePng(size, (x, y) => {
    const acc = [0, 0, 0, 0];
    for (let sy = 0; sy < ss; sy++) {
      for (let sx = 0; sx < ss; sx++) {
        const px = sample((x + (sx + 0.5) / ss) / size, (y + (sy + 0.5) / ss) / size);
        for (let i = 0; i < 4; i++) acc[i] += px[i];
      }
    }
    const alpha = acc[3] / (ss * ss);
    if (alpha === 0) return [0, 0, 0, 0];
    // couleur moyenne pondérée par l'alpha
    const weight = acc[3] / 255;
    return [acc[0] / weight, acc[1] / weight, acc[2] / weight, alpha].map(Math.round);
  });
}

mkdirSync("icons", { recursive: true });
for (const size of [16, 48, 128]) {
  writeFileSync(`icons/icon${size}.png`, render(size));
  console.log(`icons/icon${size}.png`);
}
