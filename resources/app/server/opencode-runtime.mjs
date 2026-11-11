/**
 * OpenCode runtime + endpoint discovery.
 *
 * Creator Studio talks to the OpenCode 1.x HTTP API. OpenCode 2.x changed both
 * the `serve` flags and the API surface, so the app provisions a pinned 1.x
 * runtime when the executable on PATH is not compatible.
 *
 * Ports are never assumed. OpenCode is started with `--port 0`, the URL it
 * advertises is captured from stdout/stderr, and the server is health-checked
 * on every discovered candidate until one answers with the 1.x health payload.
 */

import { spawn, execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { createWriteStream } from "node:fs";
import fs from "node:fs/promises";
import fssync from "node:fs";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";

export const PINNED_OPENCODE_VERSION = "1.19.5";
export const REQUIRED_OPENCODE_MAJOR = 1;

const START_TIMEOUT_MS = 45000;
const DOWNLOAD_TIMEOUT_MS = 180000;
const RESOLUTION_CACHE_MS = 60000;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function quoteCmd(value) {
  const text = String(value);
  return /[\s"&|<>^]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** Spawn a command, handling Windows .cmd/.bat shims without a shell prompt. */
export function spawnCommand(file, args, options = {}) {
  const isCmdShim = /\.(cmd|bat)$/i.test(file);
  if (process.platform === "win32" && isCmdShim) {
    const line = [quoteCmd(file), ...args.map(quoteCmd)].join(" ");
    return spawn(process.env.ComSpec || "cmd.exe", ["/d", "/s", "/c", line], {
      windowsHide: true,
      ...options,
    });
  }
  return spawn(file, args, { windowsHide: true, ...options });
}

function runCapture(file, args, { timeout = 15000, env } = {}) {
  return new Promise((resolve) => {
    let child;
    try {
      child = spawnCommand(file, args, {
        env: env || process.env,
        stdio: ["ignore", "pipe", "pipe"],
      });
    } catch (error) {
      return resolve({ ok: false, code: null, stdout: "", stderr: "", error });
    }
    let stdout = "";
    let stderr = "";
    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(result);
    };
    const timer = setTimeout(() => {
      try {
        child.kill();
      } catch {}
      finish({ ok: false, code: null, stdout, stderr, timedOut: true });
    }, timeout);
    child.stdout?.on("data", (data) => {
      stdout += String(data);
    });
    child.stderr?.on("data", (data) => {
      stderr += String(data);
    });
    child.on("error", (error) => finish({ ok: false, code: null, stdout, stderr, error }));
    child.on("exit", (code) => finish({ ok: code === 0, code, stdout, stderr }));
  });
}

export function parseSemver(text) {
  const match = String(text || "").match(/(\d+)\.(\d+)\.(\d+)(?:[-+][0-9A-Za-z.-]+)?/);
  if (!match) return null;
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    version: `${match[1]}.${match[2]}.${match[3]}`,
  };
}

async function detectVersion(executable) {
  const result = await runCapture(executable, ["--version"], { timeout: 15000 });
  return {
    ...result,
    version: parseSemver(`${result.stdout} ${result.stderr}`),
  };
}

async function which(name) {
  const result = await runCapture(process.platform === "win32" ? "where.exe" : "which", [name], {
    timeout: 5000,
  });
  if (!result.ok) return null;
  const lines = result.stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const existing = lines.filter((line) => fssync.existsSync(line));
  return (
    existing.find((line) => /\.exe$/i.test(line)) ||
    existing.find((line) => /\.cmd$/i.test(line)) ||
    existing[0] ||
    null
  );
}

async function resolveCandidate(value, appRoot) {
  const text = String(value || "").trim();
  if (!text) return null;
  if (path.isAbsolute(text)) return fssync.existsSync(text) ? text : null;
  if (text.includes("/") || text.includes("\\")) {
    const resolved = path.resolve(appRoot, text);
    return fssync.existsSync(resolved) ? resolved : null;
  }
  return which(text);
}

function knownV1Candidates(appRoot) {
  const exeName = process.platform === "win32" ? "opencode.exe" : "opencode";
  const roots = [
    path.join(appRoot, "node_modules"),
    process.env.APPDATA ? path.join(process.env.APPDATA, "npm", "node_modules") : null,
    process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, "opencode") : null,
    path.join(os.homedir(), ".opencode"),
  ].filter(Boolean);
  const candidates = [];
  for (const root of roots) {
    candidates.push(path.join(root, "opencode-windows-x64", "bin", exeName));
    candidates.push(path.join(root, "opencode-windows-x64-baseline", "bin", exeName));
    candidates.push(path.join(root, "opencode-ai", "bin", exeName));
    candidates.push(path.join(root, "bin", exeName));
  }
  return [...new Set(candidates)];
}

function platformPackageName() {
  const arch = process.arch === "arm64" ? "arm64" : "x64";
  if (process.platform === "win32") return `opencode-windows-${arch}`;
  if (process.platform === "darwin") return `opencode-darwin-${arch}`;
  if (process.platform === "linux") return `opencode-linux-${arch}`;
  return null;
}

async function downloadFile(url, target, expectedIntegrity, log) {
  log?.(`Downloading ${url}`);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DOWNLOAD_TIMEOUT_MS);
  try {
    const response = await fetch(url, { signal: controller.signal, redirect: "follow" });
    if (!response.ok || !response.body) {
      throw new Error(`HTTP ${response.status} while downloading ${url}`);
    }
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.rm(target, { force: true });
    await new Promise((resolve, reject) => {
      const output = createWriteStream(target);
      Readable.fromWeb(response.body).pipe(output);
      output.on("finish", resolve);
      output.on("error", reject);
      response.body.on?.("error", reject);
    });
    if (expectedIntegrity) {
      const [algorithm, expected] = String(expectedIntegrity).split("-", 2);
      if (algorithm && expected) {
        const actual = createHash(algorithm).update(await fs.readFile(target)).digest("base64");
        if (actual !== expected) {
          throw new Error(`Downloaded runtime failed its ${algorithm} integrity check.`);
        }
      }
    }
  } finally {
    clearTimeout(timer);
  }
}

function extractTar(archive, destination, member) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      "tar",
      ["-xzf", archive, "-C", destination, "--strip-components", "2", member],
      { windowsHide: true, stdio: ["ignore", "ignore", "pipe"] },
    );
    let stderr = "";
    child.stderr?.on("data", (data) => {
      stderr += String(data);
    });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`tar exited with ${code}: ${stderr.slice(0, 400)}`));
    });
  });
}

const managedRuntimePromises = new Map();

async function ensureManagedV1Once({ dataDir, log }) {
  const exeName = process.platform === "win32" ? "opencode.exe" : "opencode";
  const finalDir = path.join(dataDir, "runtime", "opencode", `v${PINNED_OPENCODE_VERSION}`);
  const executable = path.join(finalDir, exeName);
  if (fssync.existsSync(executable)) {
    const detected = await detectVersion(executable);
    if (detected.version?.major === REQUIRED_OPENCODE_MAJOR) return executable;
    await fs.rm(finalDir, { recursive: true, force: true }).catch(() => {});
  }

  const packageName = platformPackageName();
  if (!packageName) {
    throw new Error(`No pinned OpenCode runtime is available for ${process.platform}/${process.arch}.`);
  }

  const registryUrl = `https://registry.npmjs.org/${encodeURIComponent(packageName)}/${PINNED_OPENCODE_VERSION}`;
  log?.(`Preparing OpenCode ${PINNED_OPENCODE_VERSION} runtime...`);
  const details = await fetch(registryUrl, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(20000),
  });
  if (!details.ok) throw new Error(`OpenCode runtime registry lookup failed: HTTP ${details.status}`);
  const meta = await details.json();
  const tarball = meta?.dist?.tarball;
  if (!tarball) throw new Error("OpenCode runtime registry response did not include a tarball.");

  const staging = path.join(
    dataDir,
    "runtime",
    "opencode",
    `.staging-${process.pid}-${Date.now()}`,
  );
  const archive = path.join(staging, "opencode.tgz");
  try {
    await fs.mkdir(staging, { recursive: true });
    await downloadFile(tarball, archive, meta?.dist?.integrity, log);
    await extractTar(archive, staging, `package/bin/${exeName}`);
    const extracted = path.join(staging, exeName);
    if (!fssync.existsSync(extracted)) {
      throw new Error("OpenCode runtime archive did not contain the expected binary.");
    }
    await fs.mkdir(finalDir, { recursive: true });
    await fs.rm(executable, { force: true });
    try {
      await fs.rename(extracted, executable);
    } catch {
      await fs.copyFile(extracted, executable);
    }
    if (process.platform !== "win32") await fs.chmod(executable, 0o755);
    const detected = await detectVersion(executable);
    if (detected.version?.major !== REQUIRED_OPENCODE_MAJOR) {
      throw new Error(`Provisioned runtime is OpenCode ${detected.version?.version || "unknown"}, expected 1.x.`);
    }
    log?.(`OpenCode ${detected.version.version} runtime ready`);
    return executable;
  } finally {
    await fs.rm(staging, { recursive: true, force: true }).catch(() => {});
  }
}

function ensureManagedV1({ dataDir, log }) {
  const key = `${dataDir}|${PINNED_OPENCODE_VERSION}`;
  const existing = managedRuntimePromises.get(key);
  if (existing) return existing;
  const pending = ensureManagedV1Once({ dataDir, log }).finally(() => {
    if (managedRuntimePromises.get(key) === pending) managedRuntimePromises.delete(key);
  });
  managedRuntimePromises.set(key, pending);
  return pending;
}

const resolutionCache = new Map();

/**
 * Resolve an OpenCode 1.x executable. A configured 1.x install is preferred;
 * if the configured/PATH executable is 2.x (or missing), a pinned 1.x runtime
 * is downloaded once into the app data folder.
 */
export async function resolveOpenCodeExecutable({
  configured = "opencode",
  dataDir,
  appRoot,
  log,
} = {}) {
  const cacheKey = `${dataDir}|${configured}`;
  const cached = resolutionCache.get(cacheKey);
  if (cached && Date.now() - cached.at < RESOLUTION_CACHE_MS) {
    if (cached.error) throw cached.error;
    return cached.result;
  }

  const notes = [];
  const candidates = [];
  const envExecutable = process.env.TWIX_OPENCODE_EXECUTABLE;
  if (envExecutable) candidates.push({ value: envExecutable, source: "environment" });
  if (configured) candidates.push({ value: configured, source: "settings" });
  for (const candidate of knownV1Candidates(appRoot)) {
    candidates.push({ value: candidate, source: "installed" });
  }

  let incompatible = "";
  for (const candidate of candidates) {
    const executable = await resolveCandidate(candidate.value, appRoot);
    if (!executable) continue;
    const detected = await detectVersion(executable);
    const version = detected.version;
    if (!version) {
      notes.push(`${executable} did not report a version`);
      continue;
    }
    if (version.major === REQUIRED_OPENCODE_MAJOR) {
      return { executable, version: version.version, source: candidate.source };
    }
    if (!incompatible) incompatible = `OpenCode ${version.version} at ${executable}`;
    notes.push(`skipped ${executable} (OpenCode ${version.version})`);
  }

  try {
    const executable = await ensureManagedV1({ dataDir, log });
    const detected = await detectVersion(executable);
    const result = {
      executable,
      version: detected.version?.version || PINNED_OPENCODE_VERSION,
      source: "managed",
    };
    return result;
  } catch (error) {
    const installed = incompatible || notes[0] || "No OpenCode executable was found";
    const compatibility = incompatible ? " OpenCode 2.x is not API-compatible." : "";
    const failure = new Error(
      `${installed}.${compatibility} Creator Studio requires the OpenCode 1.x API. ` +
        `Install OpenCode 1.x with "npm install -g opencode-ai@${PINNED_OPENCODE_VERSION}", ` +
        `or point Settings > OpenCode > OpenCode executable at a 1.x binary. ` +
        `Automatic runtime provisioning failed: ${error.message}`,
    );
    resolutionCache.set(cacheKey, { at: Date.now(), error: failure });
    throw failure;
  }
}

/** Extract every loopback URL advertised by an OpenCode process. */
export function listeningUrlsFromText(text) {
  const urls = new Set();
  const pattern = /https?:\/\/(?:127\.0\.0\.1|localhost|\[::1\]):(\d{2,5})\b/gi;
  let match;
  while ((match = pattern.exec(String(text || "")))) {
    const port = Number(match[1]);
    if (port > 0 && port <= 65535) urls.add(`http://127.0.0.1:${port}`);
  }
  return [...urls];
}

function basicAuth(auth) {
  return `Basic ${Buffer.from(`${auth?.username || ""}:${auth?.password || ""}`).toString("base64")}`;
}

/**
 * Probe an endpoint and only accept the OpenCode 1.x JSON health payload.
 * OpenCode 2.x serves its web UI from `/global/health`, so an HTTP 200 alone
 * is not enough to treat a port as a compatible server.
 */
export async function probeOpenCodeHealth(baseUrl, auth, timeoutMs = 1500) {
  const url = String(baseUrl || "").replace(/\/+$/, "");
  if (!/^http:\/\/(?:127\.0\.0\.1|localhost|\[::1\]):\d+$/i.test(url)) {
    return { ok: false, reason: "not a loopback URL" };
  }
  try {
    const response = await fetch(`${url}/global/health`, {
      headers: { Accept: "application/json", Authorization: basicAuth(auth) },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok) return { ok: false, reason: `HTTP ${response.status}` };
    const contentType = response.headers.get("content-type") || "";
    if (!contentType.includes("application/json")) {
      return { ok: false, reason: `HTTP ${response.status} but not the OpenCode 1.x API` };
    }
    const body = await response.json().catch(() => null);
    if (!body || (body.healthy !== true && !body.version)) {
      return { ok: false, reason: "unexpected health payload" };
    }
    return { ok: true, health: body };
  } catch (error) {
    return {
      ok: false,
      reason: error?.name === "TimeoutError" ? "timeout" : error?.message || "request failed",
    };
  }
}

/** Ports owned by a process that are listening on Windows (fallback discovery). */
export function listListeningPorts(pid) {
  return new Promise((resolve) => {
    if (process.platform !== "win32" || !pid) return resolve([]);
    execFile("netstat.exe", ["-ano", "-p", "tcp"], { windowsHide: true, timeout: 6000 }, (error, stdout) => {
      if (error) return resolve([]);
      const ports = new Set();
      for (const line of String(stdout || "").split(/\r?\n/)) {
        if (!/\bLISTENING\b/i.test(line)) continue;
        const parts = line.trim().split(/\s+/);
        if (parts.length < 5) continue;
        const local = parts[1];
        const owner = Number(parts[parts.length - 1]);
        if (owner !== Number(pid)) continue;
        const match = local.match(/:(\d+)$/);
        if (match) ports.add(Number(match[1]));
      }
      resolve([...ports]);
    });
  });
}

/**
 * Wait for a spawned OpenCode server to become healthy. Candidate URLs come
 * from its own output, the caller's registry, a short netstat fallback and the
 * conventional 4096 default.
 */
export async function waitForOpenCodeHealth({
  candidates = async () => [],
  auth,
  proc = null,
  timeoutMs = START_TIMEOUT_MS,
  log,
} = {}) {
  const startedAt = Date.now();
  let lastReason = "no listening port advertised yet";
  let lastNetstatAt = 0;
  const probed = new Map();

  while (Date.now() - startedAt < timeoutMs) {
    if (proc && (proc.exitCode !== null || proc.signalCode !== null)) {
      throw new Error(
        `OpenCode exited before it reported a usable port (code ${proc.exitCode ?? proc.signalCode}).`,
      );
    }

    const urls = new Set();
    for (const url of (await candidates()) || []) {
      if (url) urls.add(String(url).replace(/\/+$/, ""));
    }
    urls.add("http://127.0.0.1:4096");

    if (proc?.pid && Date.now() - lastNetstatAt > 2000) {
      lastNetstatAt = Date.now();
      for (const port of await listListeningPorts(proc.pid)) {
        urls.add(`http://127.0.0.1:${port}`);
      }
    }

    for (const url of urls) {
      const checkedAt = probed.get(url) || 0;
      // A refused connection can be retried every loop; successful-ish probes
      // are cheap, so only dedupe within a single cycle.
      if (Date.now() - checkedAt < 250) continue;
      probed.set(url, Date.now());
      const result = await probeOpenCodeHealth(url, auth);
      if (result.ok) {
        log?.(`OpenCode answered on ${url}`);
        return { baseUrl: url, health: result.health };
      }
      lastReason = `${url}: ${result.reason}`;
    }
    await sleep(350);
  }

  throw new Error(
    `OpenCode did not become healthy within ${Math.round(timeoutMs / 1000)}s (${lastReason}).`,
  );
}

/** Read OpenCode's own service registry (2.x writes this for its desktop app). */
export function discoverOpenCodeServices() {
  const files = new Set();
  if (process.env.OPENCODE_STATE_FILE) files.add(process.env.OPENCODE_STATE_FILE);
  const stateHome = process.env.XDG_STATE_HOME || path.join(os.homedir(), ".local", "state");
  files.add(path.join(stateHome, "opencode", "service.json"));
  if (process.env.APPDATA) files.add(path.join(process.env.APPDATA, "opencode", "service.json"));
  if (process.env.LOCALAPPDATA) files.add(path.join(process.env.LOCALAPPDATA, "opencode", "service.json"));
  const services = [];
  for (const file of files) {
    try {
      const data = JSON.parse(fssync.readFileSync(file, "utf8"));
      if (!data?.url) continue;
      services.push({ ...data, source: file });
    } catch {}
  }
  return services;
}

export function isLoopbackUrl(value) {
  return /^http:\/\/(?:127\.0\.0\.1|localhost|\[::1\]):\d+\/?$/i.test(String(value || "").trim());
}

/** Locate an OpenCode 1.x auth.json so we do not override an existing login. */
export function findV1AuthFile() {
  const candidates = [];
  if (process.env.XDG_DATA_HOME) {
    candidates.push(path.join(process.env.XDG_DATA_HOME, "opencode", "auth.json"));
  }
  candidates.push(path.join(os.homedir(), ".local", "share", "opencode", "auth.json"));
  candidates.push(path.join(os.homedir(), ".opencode", "auth.json"));
  return candidates.find((file) => fssync.existsSync(file)) || null;
}

/** Map OpenCode 2.x credential exports to the OpenCode 1.x auth.json shape. */
export function entriesToV1Auth(entries) {
  const auth = {};
  if (!Array.isArray(entries)) return auth;
  const mapped = [];
  for (const entry of entries) {
    const id = String(entry?.integrationID || entry?.providerID || entry?.id || "").trim();
    if (!id) continue;
    const value = entry?.value || entry;
    let record = null;
    if ((value?.type === "key" || value?.type === "api") && value.key) {
      record = { type: "api", key: String(value.key) };
    } else if (value?.type === "oauth") {
      record = {
        type: "oauth",
        refresh: String(value.refresh || value.refreshToken || ""),
        access: String(value.access || value.accessToken || ""),
        expires: Number(value.expires || value.expiresAt || 0),
      };
      if (value.accountId) record.accountId = String(value.accountId);
      if (value.enterpriseUrl) record.enterpriseUrl = String(value.enterpriseUrl);
    } else if (value?.type === "wellknown" && value.key) {
      record = { type: "wellknown", key: String(value.key), token: String(value.token || "") };
    }
    if (record) mapped.push({ id, record, active: entry.active !== false });
  }
  for (const item of mapped) {
    if (item.active) auth[item.id] = item.record;
  }
  for (const item of mapped) {
    if (!auth[item.id]) auth[item.id] = item.record;
  }
  return auth;
}

let credentialCache = { at: 0, value: null };
let credentialInFlight = null;

/**
 * Read provider credentials stored by OpenCode 2.x and convert them for the
 * pinned 1.x runtime. Prefers the running 2.x service, then `auth export`.
 * Secrets never leave this process except as the child's environment.
 */
export async function readOpenCodeCredentials({ cliExecutable } = {}) {
  if (credentialCache.value && Date.now() - credentialCache.at < 60000) {
    return credentialCache.value;
  }
  if (credentialInFlight) return credentialInFlight;
  credentialInFlight = (async () => {
    let entries = null;
    for (const service of discoverOpenCodeServices()) {
      const version = parseSemver(service.version);
      if (!version || version.major < 2 || !service.url || !service.password) continue;
      try {
        const response = await fetch(`${String(service.url).replace(/\/+$/, "")}/api/credential`, {
          headers: {
            Accept: "application/json",
            Authorization: `Basic ${Buffer.from(`opencode:${service.password}`).toString("base64")}`,
          },
          signal: AbortSignal.timeout(4000),
        });
        if (!response.ok) continue;
        const body = await response.json();
        if (Array.isArray(body?.data)) {
          entries = body.data;
          break;
        }
      } catch {}
    }

    if (!entries && cliExecutable) {
      const result = await runCapture(cliExecutable, ["auth", "export"], { timeout: 20000 });
      const stdout = String(result.stdout || "").trim();
      if (result.ok && stdout) {
        const start = stdout.indexOf("[");
        if (start >= 0) {
          try {
            const parsed = JSON.parse(stdout.slice(start));
            if (Array.isArray(parsed)) entries = parsed;
          } catch {}
        }
      }
    }

    const value = entriesToV1Auth(entries);
    credentialCache = { at: Date.now(), value };
    return value;
  })().finally(() => {
    credentialInFlight = null;
  });
  return credentialInFlight;
}
