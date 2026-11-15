import fs from "node:fs/promises";
import path from "node:path";
import pngjs from "pngjs";
import jpeg from "jpeg-js";

const { PNG } = pngjs;

export const MATERIALIZE_VERSION = 1;
export const MATERIALIZE_MAPS = ["normal", "ao", "roughness", "metallic"];
const MAP_SUFFIX = {
  normal: "_normal.png",
  ao: "_ao.png",
  roughness: "_roughness.png",
  metallic: "_metallic.png",
};
const MAX_SIZE = 1024;
const NORMAL_STRENGTH = 2.1;

function clamp(value, min = 0, max = 1) {
  return value < min ? min : value > max ? max : value;
}

function decodeImage(buffer, ext) {
  const clean = String(ext || "").toLowerCase().replace(/^\./, "");
  if (clean === "png") {
    const decoded = PNG.sync.read(buffer);
    return { width: decoded.width, height: decoded.height, data: decoded.data };
  }
  if (clean === "jpg" || clean === "jpeg") {
    const decoded = jpeg.decode(buffer, { useTArray: true, formatAsRGBA: true });
    return { width: decoded.width, height: decoded.height, data: decoded.data };
  }
  return null;
}

/**
 * Box-filter downscale. Materialize runs inside the same Node process as the
 * app, so keeping every map at 1024 px and releasing the decoded buffers after
 * each texture is what keeps memory flat on 4K library textures.
 */
function resize(image) {
  const { width, height, data } = image;
  const longest = Math.max(width, height);
  if (longest <= MAX_SIZE) return image;
  const scale = MAX_SIZE / longest;
  const targetWidth = Math.max(1, Math.round(width * scale));
  const targetHeight = Math.max(1, Math.round(height * scale));
  const out = new Uint8Array(targetWidth * targetHeight * 4);
  const xStep = width / targetWidth;
  const yStep = height / targetHeight;
  for (let y = 0; y < targetHeight; y += 1) {
    const y0 = Math.floor(y * yStep);
    const y1 = Math.min(height, Math.max(y0 + 1, Math.floor((y + 1) * yStep)));
    for (let x = 0; x < targetWidth; x += 1) {
      const x0 = Math.floor(x * xStep);
      const x1 = Math.min(width, Math.max(x0 + 1, Math.floor((x + 1) * xStep)));
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      let count = 0;
      for (let sy = y0; sy < y1; sy += 1) {
        for (let sx = x0; sx < x1; sx += 1) {
          const index = (sy * width + sx) * 4;
          r += data[index];
          g += data[index + 1];
          b += data[index + 2];
          a += data[index + 3];
          count += 1;
        }
      }
      const index = (y * targetWidth + x) * 4;
      out[index] = r / count;
      out[index + 1] = g / count;
      out[index + 2] = b / count;
      out[index + 3] = a / count;
    }
  }
  return { width: targetWidth, height: targetHeight, data: out };
}

function luminanceMap(image) {
  const { width, height, data } = image;
  const luma = new Float32Array(width * height);
  const saturation = new Float32Array(width * height);
  for (let i = 0, p = 0; i < luma.length; i += 1, p += 4) {
    const r = data[p] / 255;
    const g = data[p + 1] / 255;
    const b = data[p + 2] / 255;
    luma[i] = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    saturation[i] = max <= 0.0001 ? 0 : (max - min) / max;
  }
  return { luma, saturation };
}

function blur(values, width, height, radius = 2) {
  const horizontal = new Float32Array(values.length);
  const vertical = new Float32Array(values.length);
  const diameter = radius * 2 + 1;
  for (let y = 0; y < height; y += 1) {
    let sum = 0;
    for (let x = -radius; x <= radius; x += 1) sum += values[y * width + clamp(x, 0, width - 1)];
    for (let x = 0; x < width; x += 1) {
      horizontal[y * width + x] = sum / diameter;
      const add = values[y * width + clamp(x + radius + 1, 0, width - 1)];
      const remove = values[y * width + clamp(x - radius, 0, width - 1)];
      sum += add - remove;
    }
  }
  for (let x = 0; x < width; x += 1) {
    let sum = 0;
    for (let y = -radius; y <= radius; y += 1) sum += horizontal[clamp(y, 0, height - 1) * width + x];
    for (let y = 0; y < height; y += 1) {
      vertical[y * width + x] = sum / diameter;
      const add = horizontal[clamp(y + radius + 1, 0, height - 1) * width + x];
      const remove = horizontal[clamp(y - radius, 0, height - 1) * width + x];
      sum += add - remove;
    }
  }
  return vertical;
}

function writePng(filePath, width, height, rgba, grayscale = false) {
  const image = new PNG({ width, height });
  if (grayscale) {
    const gray = new Uint8Array(width * height);
    for (let i = 0, p = 0; i < gray.length; i += 1, p += 4) gray[i] = rgba[p];
    image.data = Buffer.from(gray);
    return fs.writeFile(
      filePath,
      PNG.sync.write(image, { colorType: 0, inputColorType: 0, compressionLevel: 9 }),
    );
  }
  image.data = Buffer.from(rgba);
  return fs.writeFile(filePath, PNG.sync.write(image, { colorType: 6, inputColorType: 6, compressionLevel: 9 }));
}

function buildMaps(image) {
  const { width, height } = image;
  const { luma, saturation } = luminanceMap(image);
  const base = blur(luma, width, height, 2);
  const detail = blur(luma, width, height, 5);
  const normal = new Uint8Array(width * height * 4);
  const ao = new Uint8Array(width * height * 4);
  const roughness = new Uint8Array(width * height * 4);
  const metallic = new Uint8Array(width * height * 4);
  const sample = (values, x, y) => values[clamp(y, 0, height - 1) * width + clamp(x, 0, width - 1)];

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = y * width + x;
      const p = i * 4;
      const dx =
        sample(base, x + 1, y + 1) + 2 * sample(base, x + 1, y) + sample(base, x + 1, y - 1) -
        sample(base, x - 1, y + 1) - 2 * sample(base, x - 1, y) - sample(base, x - 1, y - 1);
      const dy =
        sample(base, x + 1, y + 1) + 2 * sample(base, x, y + 1) + sample(base, x - 1, y + 1) -
        sample(base, x + 1, y - 1) - 2 * sample(base, x, y - 1) - sample(base, x - 1, y - 1);
      let nx = -dx * NORMAL_STRENGTH;
      let ny = dy * NORMAL_STRENGTH;
      let nz = 1;
      const length = Math.hypot(nx, ny, nz) || 1;
      nx /= length;
      ny /= length;
      nz /= length;
      normal[p] = Math.round((nx * 0.5 + 0.5) * 255);
      normal[p + 1] = Math.round((ny * 0.5 + 0.5) * 255);
      normal[p + 2] = Math.round((nz * 0.5 + 0.5) * 255);
      normal[p + 3] = 255;

      const cavity = luma[i] - base[i];
      const broad = detail[i] - 0.5;
      const occlusion = clamp(0.86 + cavity * 1.7 + broad * 0.16, 0.36, 1);
      const aoValue = Math.round(occlusion * 255);
      ao[p] = aoValue;
      ao[p + 1] = aoValue;
      ao[p + 2] = aoValue;
      ao[p + 3] = 255;

      const rough = clamp(0.86 - base[i] * 0.42 + Math.abs(cavity) * 0.55, 0.18, 0.99);
      const roughValue = Math.round(rough * 255);
      roughness[p] = roughValue;
      roughness[p + 1] = roughValue;
      roughness[p + 2] = roughValue;
      roughness[p + 3] = 255;

      const metal = clamp((saturation[i] - 0.45) * 0.32 + Math.abs(cavity) * 0.45 + (0.42 - base[i]) * 0.2, 0, 0.72);
      const metalValue = Math.round(metal * 255);
      metallic[p] = metalValue;
      metallic[p + 1] = metalValue;
      metallic[p + 2] = metalValue;
      metallic[p + 3] = 255;
    }
  }
  return { normal, ao, roughness, metallic };
}

export function materialMapPaths(basePath) {
  const ext = path.extname(basePath);
  const stem = basePath.slice(0, -ext.length);
  return Object.fromEntries(
    Object.entries(MAP_SUFFIX).map(([kind, suffix]) => [kind, stem + suffix]),
  );
}

export async function materializeTextureFile(basePath, options = {}) {
  const ext = path.extname(basePath).slice(1).toLowerCase();
  const original = await fs.readFile(basePath);
  const decoded = decodeImage(original, ext);
  if (!decoded) {
    throw new Error(`Materialize supports PNG and JPG base-colour textures. ${path.basename(basePath)} is ${ext.toUpperCase() || "unknown"}.`);
  }
  const image = resize(decoded);
  const maps = buildMaps(image);
  const paths = materialMapPaths(basePath);
  const force = Boolean(options.force);
  const results = {};
  for (const kind of MATERIALIZE_MAPS) {
    const target = paths[kind];
    if (!force) {
      const stat = await fs.stat(target).catch(() => null);
      if (stat?.isFile() && stat.size > 256) {
        results[kind] = { path: target, bytes: stat.size, reused: true };
        continue;
      }
    }
    await writePng(target, image.width, image.height, maps[kind], kind !== "normal");
    const stat = await fs.stat(target);
    results[kind] = { path: target, bytes: stat.size, reused: false };
  }
  const sidecar = basePath.slice(0, -path.extname(basePath).length) + ".twix-material.json";
  const manifest = {
    version: MATERIALIZE_VERSION,
    shader: "creator-pbr",
    source: path.basename(basePath),
    baseColor: path.basename(basePath),
    maps: Object.fromEntries(MATERIALIZE_MAPS.map((kind) => [kind, path.basename(paths[kind])])),
    width: image.width,
    height: image.height,
    generatedAt: new Date().toISOString(),
  };
  await fs.writeFile(sidecar, JSON.stringify(manifest, null, 2), "utf8");
  return {
    base: basePath,
    sourceBytes: original.length,
    width: image.width,
    height: image.height,
    maps: results,
    sidecar,
    manifest,
  };
}
