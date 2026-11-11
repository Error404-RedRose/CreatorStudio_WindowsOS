import fs from "node:fs/promises";
import fssync from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import zlib from "node:zlib";
import { promisify } from "node:util";

const gzip = promisify(zlib.gzip);
const gunzip = promisify(zlib.gunzip);

export const ART_PROJECT_MARKER = "project.twix.json";
export const ART_SCHEMA = 1;
export const ART_HISTORY_MAX_ENTRIES = 50;
export const ART_HISTORY_MAX_BYTES = 768 * 1024 * 1024;
export const ART_PHOTO_STATE_MAX_BYTES = 320 * 1024 * 1024;
export const ART_TREE_MAX_ENTRIES = 6000;

const IMAGE_EXT = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif", ".bmp", ".tga", ".tif", ".tiff", ".avif", ".ico"]);
const MODEL_EXT = new Set([".fbx", ".glb", ".gltf", ".obj", ".stl", ".dae", ".blend", ".max", ".ma", ".mb", ".usd", ".usdz"]);
const VIDEO_EXT = new Set([".mp4", ".mov", ".mkv", ".webm", ".avi", ".m4v", ".wmv", ".mts"]);
const AUDIO_EXT = new Set([".wav", ".mp3", ".ogg", ".flac", ".aac", ".m4a"]);

export function artKindForExt(ext) {
  const value = String(ext || "").toLowerCase();
  if (IMAGE_EXT.has(value)) return "image";
  if (MODEL_EXT.has(value)) return "model";
  if (VIDEO_EXT.has(value)) return "video";
  if (AUDIO_EXT.has(value)) return "audio";
  return "file";
}

export function safeRelPath(value) {
  const raw = String(value || "").replace(/\\/g, "/").replace(/^\/+/, "");
  const parts = [];
  for (const part of raw.split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") throw new Error("Path escapes the art project.");
    parts.push(part.replace(/[<>:"|?*\u0000-\u001f]/g, "-"));
  }
  if (!parts.length) throw new Error("A file path is required.");
  return parts.join("/");
}

export function safeName(value, fallback = "untitled") {
  const cleaned = String(value || "")
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
  return cleaned || fallback;
}

export function resolveInside(root, rel) {
  const base = path.resolve(root);
  const target = path.resolve(base, safeRelPath(rel).split("/").join(path.sep));
  const check = path.relative(base, target);
  if (check.startsWith("..") || path.isAbsolute(check)) throw new Error("Path escapes the art project.");
  return target;
}

function markerPath(root) {
  return path.join(root, ART_PROJECT_MARKER);
}

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

async function readJson(file, fallback = null) {
  try {
    return JSON.parse(await fs.readFile(file, "utf8"));
  } catch {
    return fallback;
  }
}

async function writeJsonAtomic(file, data) {
  await ensureDir(path.dirname(file));
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(data, null, 2), "utf8");
  await fs.rename(tmp, file);
}

async function writeBufferAtomic(file, buffer) {
  await ensureDir(path.dirname(file));
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(tmp, buffer);
  await fs.rename(tmp, file);
}

function sha1(value) {
  return crypto.createHash("sha1").update(value).digest("hex");
}

function assetIdFor(rel) {
  return sha1(String(rel || "")).slice(0, 20);
}

export function projectFolders(kind = "mixed") {
  const images = ["Images", "Images/Inbox", "Images/Icons", "Images/Textures", "Images/Backgrounds", "Images/Characters", "Images/UI", "Images/Illustrations", "Images/Overlays", "Images/References", "Images/_Unsorted"];
  const models = ["Models", "Models/Inbox", "Models/Characters", "Models/Props", "Models/Environments", "Models/Rigs", "Models/Animations", "Models/Textures", "Models/_Unsorted"];
  const video = ["Video", "Video/Footage", "Video/Audio", "Video/Exports"];
  const shared = ["Notes", "Exports", ".twix", ".twix/checkpoints", ".twix/file-history", ".twix/file-history/blobs", ".twix/photo", ".twix/previews", ".twix/sessions"];
  if (kind === "photo") return [...images, ...shared];
  if (kind === "3d") return [...models, ...shared];
  if (kind === "video") return [...video, ...shared];
  return [...images, ...models, ...video, ...shared];
}

export async function readArtProject(root) {
  const marker = await readJson(markerPath(root), null);
  // Creator Studio project folders already use project.twix.json for their
  // own meta file. Only a document with our schema counts as an art project.
  if (!marker || typeof marker !== "object") return null;
  if (Number(marker.schema) < 1 || !marker.id || !marker.kind) return null;
  return marker;
}

export async function detectArtProject(dir, maxParents = 8) {
  let current = path.resolve(String(dir || ""));
  for (let i = 0; i <= maxParents; i += 1) {
    if (fssync.existsSync(markerPath(current))) {
      const project = await readArtProject(current);
      if (project) return { root: current, project };
    }
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return null;
}

export function isArtProjectDir(dir) {
  return fssync.existsSync(markerPath(dir));
}

export async function createArtProject({ dir, kind = "mixed", name = "", createdBy = {} }) {
  const root = path.resolve(String(dir || ""));
  if (!root) throw new Error("A folder is required.");
  await ensureDir(root);
  const existing = await readArtProject(root);
  if (existing) return { created: false, root, project: existing };
  if (fssync.existsSync(markerPath(root))) {
    throw new Error("This folder already has a project.twix.json for a Creator Studio project. Choose another folder.");
  }

  for (const folder of projectFolders(kind)) await ensureDir(path.join(root, folder.split("/").join(path.sep)));

  const now = new Date().toISOString();
  const project = {
    schema: ART_SCHEMA,
    id: "art_" + Date.now().toString(36) + "_" + crypto.randomBytes(3).toString("hex"),
    name: safeName(name || path.basename(root), "Untitled Art Project"),
    kind: ["photo", "3d", "video", "mixed"].includes(kind) ? kind : "mixed",
    createdAt: now,
    updatedAt: now,
    createdBy: { username: String(createdBy.username || ""), app: "Creator Studio" },
    settings: {
      autoName: true,
      autoSort: true,
      historyLimit: 40,
      historyMaxMb: 512,
    },
    folders: { images: "Images", models: "Models", video: "Video" },
  };
  await writeJsonAtomic(markerPath(root), project);
  return { created: true, root, project };
}

export async function touchArtProject(root) {
  const project = await readArtProject(root);
  if (!project) return null;
  project.updatedAt = new Date().toISOString();
  await writeJsonAtomic(markerPath(root), project);
  return project;
}

export async function listArtTree(root, { depth = 4, maxEntries = ART_TREE_MAX_ENTRIES } = {}) {
  const base = path.resolve(root);
  let count = 0;
  const walk = async (dir, rel, level, isRoot) => {
    const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
    const nodes = [];
    for (const entry of entries) {
      if (count >= maxEntries) break;
      if (entry.name.startsWith(".")) continue;
      if (isRoot && ["node_modules"].includes(entry.name)) continue;
      const childRel = rel ? `${rel}/${entry.name}` : entry.name;
      const absolute = path.join(dir, entry.name);
      const stat = await fs.stat(absolute).catch(() => null);
      if (!stat) continue;
      count += 1;
      if (entry.isDirectory()) {
        const node = {
          name: entry.name,
          path: childRel,
          type: "dir",
          modified: stat.mtime.toISOString(),
          isCreatorStudio: fssync.existsSync(path.join(absolute, ART_PROJECT_MARKER)),
        };
        if (level < depth) node.children = await walk(absolute, childRel, level + 1, false);
        else node.children = [];
        nodes.push(node);
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        nodes.push({
          name: entry.name,
          path: childRel,
          type: "file",
          size: stat.size,
          modified: stat.mtime.toISOString(),
          ext,
          kind: artKindForExt(ext),
        });
      }
    }
    nodes.sort((a, b) => {
      if (a.type !== b.type) return a.type === "dir" ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    return nodes;
  };
  const tree = await walk(base, "", 0, true);
  return { root: base, tree, truncated: count >= maxEntries, entries: count };
}

export async function readArtAsset(root, rel) {
  const target = resolveInside(root, rel);
  return fs.readFile(target);
}

export async function writeArtAsset(root, rel, buffer) {
  const target = resolveInside(root, rel);
  await writeBufferAtomic(target, buffer);
  await touchArtProject(root);
  return target;
}

export async function moveArtAsset(root, from, to) {
  const source = resolveInside(root, from);
  const target = resolveInside(root, to);
  if (fssync.existsSync(target)) throw new Error("A file with that name already exists.");
  await ensureDir(path.dirname(target));
  await fs.rename(source, target);
  await touchArtProject(root);
  return { from: safeRelPath(from), to: safeRelPath(to) };
}

function bucketForFile(name) {
  const kind = artKindForExt(path.extname(name));
  if (kind === "image") return "Images/Inbox";
  if (kind === "model") return "Models/Inbox";
  if (kind === "video") return "Video/Footage";
  if (kind === "audio") return "Video/Audio";
  return "Notes";
}

export async function importArtFiles(root, files = []) {
  const imported = [];
  for (const file of files) {
    if (!file?.data?.length) continue;
    const original = safeName(file.name, "import.bin");
    const folder = file.folder ? safeRelPath(file.folder) : bucketForFile(original);
    const dir = path.join(path.resolve(root), folder.split("/").join(path.sep));
    await ensureDir(dir);
    const ext = path.extname(original);
    const stem = path.basename(original, ext);
    let name = original;
    let n = 2;
    while (fssync.existsSync(path.join(dir, name))) name = `${stem} ${n++}${ext}`;
    const target = path.join(dir, name);
    await writeBufferAtomic(target, file.data);
    imported.push({ name, path: `${folder}/${name}`, bytes: file.data.length });
  }
  if (imported.length) await touchArtProject(root);
  return imported;
}

/* ------------------------------------------------------------------ */
/* File history: content-addressed snapshots, undo/redo per asset      */
/* ------------------------------------------------------------------ */

function historyDir(root) {
  return path.join(path.resolve(root), ".twix", "file-history");
}

function historyManifestPath(root, rel) {
  return path.join(historyDir(root), `${assetIdFor(rel)}.json`);
}

async function storeBlob(root, buffer) {
  const hash = sha1(buffer);
  const target = path.join(historyDir(root), "blobs", hash.slice(0, 2), hash.slice(2));
  if (!fssync.existsSync(target)) await writeBufferAtomic(target, buffer);
  return { hash, path: target, bytes: buffer.length };
}

async function readBlob(root, hash) {
  const target = path.join(historyDir(root), "blobs", hash.slice(0, 2), hash.slice(2));
  return fs.readFile(target);
}

async function pruneHistory(root, manifest) {
  let total = manifest.entries.reduce((sum, entry) => sum + (entry.bytes || 0), 0) + (manifest.base?.bytes || 0);
  while (
    manifest.entries.length > ART_HISTORY_MAX_ENTRIES ||
    total > ART_HISTORY_MAX_BYTES
  ) {
    const removed = manifest.entries.shift();
    if (!removed) break;
    total -= removed.bytes || 0;
    if (manifest.cursor >= 0) manifest.cursor -= 1;
    if (removed.blob) await fs.rm(path.join(historyDir(root), "blobs", removed.blob.slice(0, 2), removed.blob.slice(2)), { force: true }).catch(() => null);
  }
  return manifest;
}

export async function readFileHistory(root, rel) {
  const manifest = await readJson(historyManifestPath(root, rel), null);
  return manifest || { path: safeRelPath(rel), entries: [], cursor: -1, base: null };
}

export async function commitFile(root, rel, buffer, label = "Edit") {
  const safePath = safeRelPath(rel);
  const target = resolveInside(root, safePath);
  const manifest = await readFileHistory(root, safePath);

  if (!manifest.base && fssync.existsSync(target)) {
    const current = await fs.readFile(target);
    const blob = await storeBlob(root, current);
    manifest.base = { blob: blob.hash, bytes: blob.bytes, at: new Date().toISOString() };
  }

  await writeBufferAtomic(target, buffer);
  const blob = await storeBlob(root, buffer);
  manifest.path = safePath;
  manifest.entries.push({
    id: "h_" + Date.now().toString(36) + "_" + crypto.randomBytes(2).toString("hex"),
    at: new Date().toISOString(),
    label: String(label || "Edit").slice(0, 120),
    bytes: blob.bytes,
    blob: blob.hash,
  });
  manifest.cursor = manifest.entries.length - 1;
  await pruneHistory(root, manifest);
  await writeJsonAtomic(historyManifestPath(root, safePath), manifest);
  await touchArtProject(root);
  return { path: safePath, cursor: manifest.cursor, entries: manifest.entries.length, bytes: blob.bytes };
}

export async function undoFile(root, rel) {
  const safePath = safeRelPath(rel);
  const manifest = await readFileHistory(root, safePath);
  if (manifest.cursor < 0) return { ok: false, reason: "Nothing to undo." };
  const target = resolveInside(root, safePath);
  const source = manifest.cursor === 0 ? manifest.base?.blob : manifest.entries[manifest.cursor - 1]?.blob;
  if (!source) return { ok: false, reason: "History is incomplete." };
  await writeBufferAtomic(target, await readBlob(root, source));
  manifest.cursor -= 1;
  await writeJsonAtomic(historyManifestPath(root, safePath), manifest);
  await touchArtProject(root);
  return { ok: true, path: safePath, cursor: manifest.cursor, entries: manifest.entries.length };
}

export async function redoFile(root, rel) {
  const safePath = safeRelPath(rel);
  const manifest = await readFileHistory(root, safePath);
  const next = manifest.entries[manifest.cursor + 1];
  if (!next) return { ok: false, reason: "Nothing to redo." };
  await writeBufferAtomic(resolveInside(root, safePath), await readBlob(root, next.blob));
  manifest.cursor += 1;
  await writeJsonAtomic(historyManifestPath(root, safePath), manifest);
  await touchArtProject(root);
  return { ok: true, path: safePath, cursor: manifest.cursor, entries: manifest.entries.length };
}

/* ------------------------------------------------------------------ */
/* Photo editor session state (current doc + undo/redo stacks)         */
/* ------------------------------------------------------------------ */

function photoStatePath(root, assetPath) {
  const key = assetPath ? sha1(safeRelPath(assetPath)) : "standalone";
  return path.join(path.resolve(root), ".twix", "photo", `${key}.json.gz`);
}

export async function writePhotoState(root, assetPath, state) {
  const file = photoStatePath(root, assetPath);
  const json = JSON.stringify({ ...state, assetPath: assetPath ? safeRelPath(assetPath) : "", savedAt: new Date().toISOString() });
  const raw = Buffer.from(json, "utf8");
  const packed = await gzip(raw, { level: 6 });
  if (packed.length > ART_PHOTO_STATE_MAX_BYTES) {
    throw new Error("Photo session is too large to persist. Lower the undo depth for this document.");
  }
  await writeBufferAtomic(file, packed);
  await touchArtProject(root);
  return { bytes: packed.length, rawBytes: raw.length, path: file };
}

export async function writePhotoStatePacked(root, assetPath, packed) {
  const raw = await gunzip(packed);
  JSON.parse(raw.toString("utf8"));
  if (packed.length > ART_PHOTO_STATE_MAX_BYTES) {
    throw new Error("Photo session is too large to persist.");
  }
  const file = photoStatePath(root, assetPath);
  await writeBufferAtomic(file, packed);
  await touchArtProject(root);
  return { bytes: packed.length, rawBytes: raw.length, path: file };
}

export async function readPhotoStatePacked(root, assetPath) {
  const file = photoStatePath(root, assetPath);
  if (!fssync.existsSync(file)) return null;
  return fs.readFile(file);
}

export async function readPhotoState(root, assetPath) {
  const file = photoStatePath(root, assetPath);
  if (!fssync.existsSync(file)) return null;
  try {
    const packed = await fs.readFile(file);
    const raw = await gunzip(packed);
    return JSON.parse(raw.toString("utf8"));
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ */
/* AI catalog and UI session                                           */
/* ------------------------------------------------------------------ */

export async function readCatalog(root) {
  return readJson(path.join(path.resolve(root), ".twix", "catalog.json"), { assets: {}, updatedAt: null });
}

export async function writeCatalog(root, catalog) {
  const data = { assets: catalog?.assets || {}, updatedAt: new Date().toISOString() };
  await writeJsonAtomic(path.join(path.resolve(root), ".twix", "catalog.json"), data);
  return data;
}

export async function upsertCatalog(root, entries = {}) {
  const catalog = await readCatalog(root);
  for (const [rel, value] of Object.entries(entries)) {
    catalog.assets[safeRelPath(rel)] = { ...(catalog.assets[safeRelPath(rel)] || {}), ...value, updatedAt: new Date().toISOString() };
  }
  return writeCatalog(root, catalog);
}

export async function readUiSession(root) {
  return readJson(path.join(path.resolve(root), ".twix", "session.json"), null);
}

export async function writeUiSession(root, state) {
  const data = { ...state, updatedAt: new Date().toISOString() };
  await writeJsonAtomic(path.join(path.resolve(root), ".twix", "session.json"), data);
  return data;
}
