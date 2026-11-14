import fs from "node:fs/promises";
import fssync from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const BUNDLED_ROOT = path.join(here, "modding");

const MIME = {
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".otf": "font/otf",
  ".py": "text/plain; charset=utf-8",
};

function slugify(value) {
  return (
    String(value || "mod")
      .toLowerCase()
      .replace(/[^a-z0-9._-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 64) || "mod"
  );
}

async function copyFileIfDifferent(source, target, overwrite) {
  try {
    const next = await fs.readFile(source);
    if (!overwrite) {
      if (fssync.existsSync(target)) return false;
    } else {
      const previous = await fs.readFile(target).catch(() => null);
      if (previous && previous.equals(next)) return false;
    }
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, next);
    return true;
  } catch {
    return false;
  }
}

async function copyStarter(source, target) {
  await fs.mkdir(target, { recursive: true });
  const entries = await fs.readdir(source, { withFileTypes: true }).catch(() => []);
  for (const entry of entries) {
    const from = path.join(source, entry.name);
    const to = path.join(target, entry.name);
    if (entry.isDirectory()) await copyStarter(from, to);
    else await copyFileIfDifferent(from, to, false);
  }
}

async function readJson(file, fallback) {
  try {
    return JSON.parse(await fs.readFile(file, "utf8"));
  } catch {
    return fallback;
  }
}

export function createModService({ dataDir, appRoot, version, license, isPackaged, log }) {
  const modsDir = path.join(dataDir, "mods");
  const statePath = path.join(dataDir, "mods-state.json");
  let licenseCache = { at: 0, status: null };

  async function licenseStatus(force = false) {
    if (!force && licenseCache.status && Date.now() - licenseCache.at < 15000) return licenseCache.status;
    const status = await license();
    licenseCache = { at: Date.now(), status };
    return status;
  }

  async function ensure() {
    await fs.mkdir(modsDir, { recursive: true });
    await copyFileIfDifferent(path.join(BUNDLED_ROOT, "MODDING.md"), path.join(modsDir, "MODDING.md"), true);
    await copyFileIfDifferent(
      path.join(BUNDLED_ROOT, "AI_MODDING_PROMPT.txt"),
      path.join(modsDir, "AI_MODDING_PROMPT.txt"),
      true,
    );
    const starterDir = path.join(modsDir, "example-theme");
    if (!fssync.existsSync(starterDir)) {
      await copyStarter(path.join(BUNDLED_ROOT, "starter"), starterDir);
    }
  }

  async function readState() {
    const state = await readJson(statePath, {});
    return {
      enabled: state && typeof state.enabled === "object" && state.enabled ? state.enabled : {},
    };
  }

  async function writeState(state) {
    await fs.writeFile(statePath, JSON.stringify(state, null, 2), "utf8");
  }

  async function list() {
    await ensure();
    const state = await readState();
    const entries = await fs.readdir(modsDir, { withFileTypes: true }).catch(() => []);
    const mods = [];
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const folder = path.join(modsDir, entry.name);
      const manifest = await readJson(path.join(folder, "mod.json"), null);
      if (!manifest || typeof manifest !== "object") continue;
      const id = String(manifest.id || entry.name);
      mods.push({
        id,
        folder: entry.name,
        name: String(manifest.name || id),
        version: String(manifest.version || "1.0.0"),
        description: String(manifest.description || ""),
        author: String(manifest.author || ""),
        main: String(manifest.main || "main.js"),
        styles: Array.isArray(manifest.styles) ? manifest.styles.map(String) : [],
        enabled: state.enabled[id] !== false,
        manifest,
      });
    }
    mods.sort((a, b) => a.name.localeCompare(b.name));
    const status = await licenseStatus();
    return {
      ok: true,
      licensed: Boolean(status?.licensed),
      licenseStatus: status?.status || "inactive",
      root: modsDir,
      docs: path.join(modsDir, "MODDING.md"),
      aiPrompt: path.join(modsDir, "AI_MODDING_PROMPT.txt"),
      version,
      packaged: Boolean(isPackaged),
      mods,
    };
  }

  async function requireLicense() {
    const status = await licenseStatus();
    return {
      ok: Boolean(status?.licensed),
      status,
      message: status?.licensed
        ? ""
        : "Creator Studio mods require an active product license. Activate this PC first.",
    };
  }

  async function toggle(id, enabled) {
    const gate = await requireLicense();
    if (!gate.ok) return { ok: false, error: gate.message };
    const state = await readState();
    state.enabled[String(id)] = Boolean(enabled);
    await writeState(state);
    log("info", "mods", enabled ? "enabled" : "disabled", { id });
    return { ok: true, id: String(id), enabled: Boolean(enabled) };
  }

  async function create(name) {
    const gate = await requireLicense();
    if (!gate.ok) return { ok: false, error: gate.message };
    await ensure();
    const base = slugify(name);
    let id = base;
    let n = 2;
    while (fssync.existsSync(path.join(modsDir, id))) id = `${base}-${n++}`;
    const folder = path.join(modsDir, id);
    await copyStarter(path.join(BUNDLED_ROOT, "starter"), folder);
    const manifestPath = path.join(folder, "mod.json");
    const manifest = await readJson(manifestPath, {});
    manifest.id = id;
    manifest.name = String(name || id);
    await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2), "utf8");
    log("info", "mods", "created", { id });
    return { ok: true, id, folder };
  }

  async function findFolder(id) {
    const wanted = String(id || "");
    if (!wanted) return "";
    const direct = path.join(modsDir, slugify(wanted));
    if (fssync.existsSync(path.join(direct, "mod.json"))) return direct;
    const entries = await fs.readdir(modsDir, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const manifest = await readJson(path.join(modsDir, entry.name, "mod.json"), null);
      if (manifest && String(manifest.id || entry.name) === wanted) return path.join(modsDir, entry.name);
    }
    return direct;
  }

  async function resolveFile(id, relative) {
    await ensure();
    const folder = await findFolder(id);
    const base = path.resolve(folder);
    const target = path.resolve(base, String(relative || ""));
    if (target !== base && !target.startsWith(base + path.sep)) return null;
    const stat = await fs.stat(target).catch(() => null);
    if (!stat?.isFile()) return null;
    return { absolute: target, ext: path.extname(target).toLowerCase(), bytes: stat.size };
  }

  async function file(id, relative) {
    const gate = await requireLicense();
    if (!gate.ok) return { ok: false, error: gate.message, status: 403 };
    const resolved = await resolveFile(id, relative);
    if (!resolved) return { ok: false, error: "Mod file not found.", status: 404 };
    return {
      ok: true,
      absolute: resolved.absolute,
      bytes: resolved.bytes,
      mime: MIME[resolved.ext] || "application/octet-stream",
    };
  }

  async function docs() {
    await ensure();
    return fs.readFile(path.join(modsDir, "MODDING.md"), "utf8");
  }

  async function prompt() {
    await ensure();
    return fs.readFile(path.join(modsDir, "AI_MODDING_PROMPT.txt"), "utf8");
  }

  async function readEntry(id, relative) {
    const resolved = await resolveFile(id, relative);
    if (!resolved) throw new Error("Mod file not found.");
    if (resolved.bytes > 8 * 1024 * 1024) throw new Error("Mod file is larger than 8 MB.");
    return fs.readFile(resolved.absolute, "utf8");
  }

  async function writeEntry(id, relative, content) {
    await ensure();
    const folder = await findFolder(id);
    const base = path.resolve(folder);
    const target = path.resolve(base, String(relative || ""));
    if (target !== base && !target.startsWith(base + path.sep)) throw new Error("Path outside mod folder.");
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, String(content ?? ""), "utf8");
    return { ok: true, path: path.relative(base, target).replace(/\\/g, "/") };
  }

  return {
    modsDir,
    ensure,
    list,
    toggle,
    create,
    file,
    docs,
    prompt,
    readEntry,
    writeEntry,
    requireLicense,
    licenseStatus,
    appRoot,
  };
}
