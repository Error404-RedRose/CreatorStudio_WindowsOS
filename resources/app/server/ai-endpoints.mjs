/**
 * Local AI endpoint discovery and Hermes API bootstrap.
 *
 * Hermes Agent ships an OpenAI-compatible API server (default
 * http://127.0.0.1:8642/v1). It is disabled until API_SERVER_ENABLED=true is
 * written to the Hermes .env, so we can discover an already running server and
 * start one on request without asking the user for a URL.
 *
 * Claude Code / Claude Desktop do not expose an HTTP model endpoint. We still
 * look for a Claude-compatible proxy on the usual local ports and report what
 * we find, but the caller must explain when no proxy exists.
 */

import { exec, execFile } from "node:child_process";
import fs from "node:fs/promises";
import fssync from "node:fs";
import os from "node:os";
import path from "node:path";

const HERMES_DEFAULT_PORT = 8642;
const HERMES_DEFAULT_KEY = "creator-studio-local";
const RESERVED_PORTS = new Set([
  80, 135, 139, 445, 1042, 1043, 1236, 2869, 3213, 4096, 4317, 5037, 5040,
  5173, 6463, 9012, 9013, 9014, 13030, 13031, 13032, 13508, 18080, 27036,
]);
const DISCOVERY_CACHE_MS = 30000;
let discoveryCache = { at: 0, value: null };
let discoveryInFlight = null;

function exists(file) {
  try {
    return Boolean(file) && fssync.existsSync(file);
  } catch {
    return false;
  }
}

function readText(file) {
  try {
    return fssync.readFileSync(file, "utf8");
  } catch {
    return "";
  }
}

function readJson(file, fallback = null) {
  try {
    return JSON.parse(fssync.readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
}

function tokenExpiresSoon(token, skewSeconds = 120) {
  try {
    const payload = String(token || "").split(".")[1];
    if (!payload) return false;
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (!data?.exp) return false;
    return Number(data.exp) * 1000 <= Date.now() + skewSeconds * 1000;
  } catch {
    return false;
  }
}

function parseEnv(text) {
  const values = {};
  for (const raw of String(text || "").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!match) continue;
    let value = match[2].trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    values[match[1]] = value;
  }
  return values;
}

export function findHermesHome() {
  const candidates = [
    process.env.HERMES_HOME,
    process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, "Hermes") : "",
    process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, "hermes") : "",
    process.env.APPDATA ? path.join(process.env.APPDATA, "Hermes") : "",
    path.join(os.homedir(), ".hermes"),
    path.join(os.homedir(), ".local", "share", "hermes"),
  ].filter(Boolean);
  for (const dir of candidates) {
    if (
      exists(path.join(dir, "config.yaml")) ||
      exists(path.join(dir, ".env")) ||
      exists(path.join(dir, "hermes-agent"))
    ) {
      return dir;
    }
  }
  return "";
}

export function findClaudeCli() {
  const candidates = [
    process.env.CLAUDE_EXECUTABLE,
    process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, "Programs", "Claude", "Claude.exe") : "",
    process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, "AnthropicClaude", "Claude.exe") : "",
    path.join(os.homedir(), ".local", "bin", "claude.exe"),
    path.join(os.homedir(), ".local", "bin", "claude"),
    "/usr/local/bin/claude",
    "/usr/bin/claude",
    "/opt/claude/claude",
    "/Applications/Claude.app",
  ].filter(Boolean);
  return candidates.find((file) => exists(file)) || "";
}

function hermesApiSettings(home) {
  const env = parseEnv(readText(path.join(home, ".env")));
  const port = Number(env.API_SERVER_PORT || env.HERMES_API_SERVER_PORT || HERMES_DEFAULT_PORT);
  const host = env.API_SERVER_HOST || env.HERMES_API_SERVER_HOST || "127.0.0.1";
  const key =
    env.API_SERVER_KEY ||
    env.HERMES_API_SERVER_KEY ||
    env.API_SERVER_TOKEN ||
    "";
  const enabled =
    String(env.API_SERVER_ENABLED || env.HERMES_API_SERVER_ENABLED || "").toLowerCase() === "true";
  return { env, port: Number.isFinite(port) && port > 0 ? port : HERMES_DEFAULT_PORT, host, key, enabled };
}

function clampBase(url) {
  return String(url || "").trim().replace(/\/+$/, "");
}

function modelIds(payload) {
  const list = Array.isArray(payload?.data)
    ? payload.data
    : Array.isArray(payload?.models)
      ? payload.models
      : Array.isArray(payload)
        ? payload
        : [];
  return [
    ...new Set(
      list
        .map((item) => String(item?.id || item?.model || item?.name || item || ""))
        .filter(Boolean),
    ),
  ];
}

export async function probeModelEndpoint(baseUrl, { apiKey = "", apiStyle = "openai", timeoutMs = 1500 } = {}) {
  const base = clampBase(baseUrl);
  if (!base) return { ok: false, models: [], error: "No endpoint URL." };
  const headers = { Accept: "application/json" };
  if (apiKey) {
    headers.Authorization = `Bearer ${apiKey}`;
    headers["x-api-key"] = apiKey;
  }
  if (apiStyle === "anthropic") headers["anthropic-version"] = "2023-06-01";
  for (const suffix of ["/models"]) {
    try {
      const response = await fetch(base + suffix, {
        headers,
        signal: AbortSignal.timeout(timeoutMs),
      });
      const contentType = response.headers.get("content-type") || "";
      if (!contentType.includes("json")) continue;
      const payload = await response.json().catch(() => null);
      const models = modelIds(payload);
      if (response.ok && models.length) {
        return { ok: true, models, baseUrl: base, status: response.status };
      }
      if (response.status === 401 || response.status === 403) {
        return { ok: false, models: [], baseUrl: base, status: response.status, error: "Authentication required." };
      }
    } catch (error) {
      return { ok: false, models: [], baseUrl: base, error: error?.message || "Request failed." };
    }
  }
  return { ok: false, models: [], baseUrl: base, error: "No model list returned." };
}

export async function fetchHermesModelCatalog(baseUrl, apiKey) {
  const base = clampBase(baseUrl).replace(/\/v1$/i, "");
  const empty = { models: [], defaultModel: "", defaultProvider: "" };
  if (!base) return empty;
  try {
    const response = await fetch(base + "/api/model/options", {
      headers: {
        Accept: "application/json",
        ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
      },
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) return empty;
    const payload = await response.json().catch(() => null);
    const models = [];
    if (payload?.model) models.push(String(payload.model));
    for (const provider of payload?.providers || []) {
      if (provider?.authenticated === false) continue;
      for (const model of provider?.models || []) {
        const id = String(model || "").trim();
        if (id) models.push(id);
      }
    }
    return {
      models: [...new Set(models)],
      defaultModel: String(payload?.model || ""),
      defaultProvider: String(payload?.provider || ""),
    };
  } catch {
    return empty;
  }
}

function run(command, args, timeout = 20000) {
  return new Promise((resolve) => {
    execFile(
      command,
      args,
      { windowsHide: true, timeout, maxBuffer: 4 * 1024 * 1024 },
      (error, stdout, stderr) => {
        resolve({
          ok: !error,
          code: error?.code ?? 0,
          stdout: String(stdout || ""),
          stderr: String(stderr || ""),
          error: error?.message || "",
        });
      },
    );
  });
}

async function which(name) {
  const command = process.platform === "win32" ? "where" : "command -v";
  const shell = process.platform === "win32" ? `${command} ${name}` : `${command} ${name}`;
  const result = await new Promise((resolve) => {
    exec(shell, { windowsHide: true, timeout: 5000 }, (error, stdout) => {
      resolve({ ok: !error, stdout: String(stdout || "") });
    });
  });
  if (!result.ok) return "";
  const first = result.stdout.split(/\r?\n/).map((line) => line.trim()).find(Boolean);
  return first && exists(first) ? first : "";
}

export async function findHermesCli(home) {
  const candidates = [
    process.env.HERMES_EXECUTABLE,
    home ? path.join(home, "bin", "hermes.exe") : "",
    home ? path.join(home, "bin", "hermes") : "",
    process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, "Hermes", "bin", "hermes.exe") : "",
    process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, "hermes", "bin", "hermes.exe") : "",
    path.join(os.homedir(), ".local", "bin", "hermes"),
    "/usr/local/bin/hermes",
    "/usr/bin/hermes",
  ].filter(Boolean);
  const found = candidates.find((file) => exists(file));
  if (found) return found;
  return which("hermes");
}

let directHermesCache = { at: 0, home: "", providers: null };

/**
 * Hermes is an agent, not a plain model API: its /v1 stream includes Hermes-only
 * tool events that OpenCode cannot parse. The models Hermes itself uses are
 * normal OpenAI-compatible providers, so expose those directly for OpenCode.
 */
export async function readHermesDirectProviders(home = findHermesHome()) {
  if (!home) return [];
  if (
    directHermesCache.providers &&
    directHermesCache.home === home &&
    Date.now() - directHermesCache.at < 30000
  ) {
    return directHermesCache.providers;
  }
  const providers = [];
  const auth = readJson(path.join(home, "auth.json"), {});
  const nous = auth?.providers?.nous;
  const nousToken = [nous?.agent_key, nous?.access_token]
    .map((value) => String(value || "").trim())
    .find((value) => value && !tokenExpiresSoon(value));
  const nousBase = String(nous?.inference_base_url || "https://welcome-api.nousresearch.com/v1").replace(/\/+$/, "");
  if (nousToken && nousBase) {
    const probe = await probeModelEndpoint(nousBase, { apiKey: nousToken, timeoutMs: 4000 });
    providers.push({
      providerId: "hermes-nous",
      name: "Hermes - Nous free",
      backend: "hermes",
      baseUrl: nousBase,
      apiKey: nousToken,
      apiStyle: "openai",
      models: probe.ok && probe.models.length ? probe.models : ["nous/welcome"],
      source: "hermes-auth",
    });
  }

  const env = parseEnv(readText(path.join(home, ".env")));
  const blitzKey = String(env.HERMES_CUSTOM_BLITZBOY_API_KEY || "").trim();
  if (blitzKey) {
    const blitzBase = String(
      env.HERMES_CUSTOM_BLITZBOY_BASE_URL || env.BLITZBOY_BASE_URL || "https://api.abliteration.ai/v1",
    ).replace(/\/+$/, "");
    const probe = await probeModelEndpoint(blitzBase, { apiKey: blitzKey, timeoutMs: 4000 });
    const fallback = [
      "abliterated-model",
      "abliterated-model-large",
      "abliterated-model-large-v2",
      "abliterated-model-large-flash",
    ];
    providers.push({
      providerId: "hermes-blitzboy",
      name: "Hermes - BlitzBoy",
      backend: "hermes",
      baseUrl: blitzBase,
      apiKey: blitzKey,
      apiStyle: "openai",
      models: probe.ok && probe.models.length ? probe.models : fallback,
      source: "hermes-config",
    });
  }
  directHermesCache = { at: Date.now(), home, providers };
  return providers;
}

async function listeningPorts() {
  const ports = new Set();
  if (process.platform === "win32") {
    const result = await new Promise((resolve) => {
      exec("netstat -ano -p tcp", { windowsHide: true, timeout: 8000 }, (error, stdout) => {
        resolve(String(stdout || ""));
      });
    });
    for (const line of result.split(/\r?\n/)) {
      if (!/LISTENING/i.test(line)) continue;
      const match = line.match(/^\s*TCP\s+\S+:(\d+)\s+/i);
      if (match) ports.add(Number(match[1]));
    }
  } else {
    for (const command of ["ss -ltn", "netstat -ltn"]) {
      const result = await new Promise((resolve) => {
        exec(command, { windowsHide: true, timeout: 8000 }, (error, stdout) => {
          resolve(String(stdout || ""));
        });
      });
      if (!result.trim()) continue;
      for (const line of result.split(/\r?\n/)) {
        const match = line.match(/:(\d+)\s/);
        if (match) ports.add(Number(match[1]));
      }
      if (ports.size) break;
    }
  }
  return [...ports].filter((port) => port >= 1024 && port <= 65000);
}

async function discoverHermes() {
  const home = findHermesHome();
  const cli = home ? await findHermesCli(home) : "";
  if (!home) {
    return { installed: false, home: "", cli: "", canStart: false, endpoint: null, settings: null, notes: [] };
  }
  const settings = hermesApiSettings(home);
  const notes = [];
  const key = settings.key || HERMES_DEFAULT_KEY;
  const direct = await readHermesDirectProviders(home);
  if (direct.length) {
    const primary = direct.find((provider) => provider.providerId === "hermes-nous") || direct[0];
    notes.push(
      `Using the ${primary.name} model provider directly so OpenCode can run Creator Studio tools.`,
    );
    return {
      installed: true,
      home,
      cli,
      canStart: Boolean(cli),
      endpoint: {
        backend: "hermes",
        baseUrl: primary.baseUrl,
        models: primary.models,
        apiKey: primary.apiKey,
        apiStyle: "openai",
        source: primary.source,
      },
      direct,
      settings: { enabled: settings.enabled, host: settings.host, port: settings.port, key },
      notes,
    };
  }
  const probeHost =
    !settings.host || settings.host === "0.0.0.0" || settings.host === "::" ? "127.0.0.1" : settings.host;
  const candidates = new Set();
  candidates.add(`http://${probeHost}:${settings.port}/v1`);
  candidates.add(`http://127.0.0.1:${HERMES_DEFAULT_PORT}/v1`);
  for (const baseUrl of candidates) {
    const probe = await probeModelEndpoint(baseUrl, { apiKey: key });
    if (probe.ok) {
      const catalog = await fetchHermesModelCatalog(baseUrl, key);
      const models = [...new Set(["hermes-agent", ...catalog.models, ...probe.models])];
      return {
        installed: true,
        home,
        cli,
        canStart: Boolean(cli),
        endpoint: {
          backend: "hermes",
          baseUrl,
          models,
          apiKey: key,
          apiStyle: "openai",
          source: "hermes-api",
        },
        settings: { enabled: settings.enabled, host: settings.host, port: settings.port, key },
        notes,
      };
    }
  }
  notes.push(
    settings.enabled
      ? "Hermes has API_SERVER_ENABLED=true, but the API server is not answering yet."
      : "Hermes is installed. Its OpenAI-compatible API server is not enabled yet.",
  );
  return {
    installed: true,
    home,
    cli,
    canStart: Boolean(cli),
    endpoint: null,
    settings: { enabled: settings.enabled, host: settings.host, port: settings.port, key },
    notes,
  };
}

async function discoverClaude() {
  const cli = findClaudeCli();
  const notes = [];
  const endpoints = [];
  const envBase = process.env.ANTHROPIC_BASE_URL || process.env.CLAUDE_BASE_URL || "";
  const envKey = process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN || "";
  const candidates = [];
  if (envBase) candidates.push({ baseUrl: envBase, apiKey: envKey, source: "environment" });
  if (process.env.ANTHROPIC_API_KEY) {
    candidates.push({
      baseUrl: "https://api.anthropic.com/v1",
      apiKey: process.env.ANTHROPIC_API_KEY,
      source: "anthropic-api",
    });
  }
  for (const candidate of candidates) {
    const probe = await probeModelEndpoint(candidate.baseUrl, {
      apiKey: candidate.apiKey,
      apiStyle: "anthropic",
      timeoutMs: 2500,
    });
    if (!probe.ok) continue;
    const claudeModels = probe.models.filter((model) => /claude|anthropic/i.test(model));
    if (!claudeModels.length) continue;
    endpoints.push({
      backend: "claude",
      baseUrl: probe.baseUrl,
      models: claudeModels.length ? claudeModels : probe.models,
      apiKey: candidate.apiKey,
      apiStyle: /anthropic\.com|claude\.ai/i.test(probe.baseUrl) ? "anthropic" : "openai",
      source: candidate.source,
    });
  }
  return { installed: Boolean(cli), cli, endpoint: endpoints[0] || null, endpoints, notes };
}

async function discoverGeneric(ports, hermesHome) {
  const endpoints = [];
  const hermesPort = hermesHome ? hermesApiSettings(hermesHome).port : 0;
  const queue = ports.filter((port) => port !== hermesPort && !RESERVED_PORTS.has(port));
  const workers = Array.from({ length: 10 }, async () => {
    while (queue.length) {
      const port = queue.shift();
      if (!port) break;
      for (const pathName of ["/v1", ""]) {
        const baseUrl = `http://127.0.0.1:${port}${pathName}`;
        const probe = await probeModelEndpoint(baseUrl, { timeoutMs: 350 });
        if (!probe.ok) continue;
        const models = probe.models;
        const hermesModels = models.filter((model) => /hermes/i.test(model));
        if (hermesModels.length) {
          endpoints.push({
            backend: "hermes",
            baseUrl: probe.baseUrl,
            models: hermesModels,
            apiKey: "",
            apiStyle: "openai",
            source: "local-port",
          });
          break;
        }
        const claudeModels = models.filter((model) => /claude|anthropic/i.test(model));
        if (claudeModels.length) {
          endpoints.push({
            backend: "claude",
            baseUrl: probe.baseUrl,
            models: claudeModels,
            apiKey: "",
            apiStyle: /anthropic\.com|claude\.ai/i.test(probe.baseUrl) ? "anthropic" : "openai",
            source: "local-port",
          });
          break;
        }
      }
    }
  });
  await Promise.all(workers);
  return endpoints;
}

export async function discoverLocalAiEndpoints({ force = false } = {}) {
  if (!force && discoveryCache.value && Date.now() - discoveryCache.at < DISCOVERY_CACHE_MS) {
    return discoveryCache.value;
  }
  if (discoveryInFlight) return discoveryInFlight;
  discoveryInFlight = (async () => {
    const hermes = await discoverHermes();
    const ports = await listeningPorts();
    const claude = await discoverClaude();
    const generic = await discoverGeneric(ports, hermes.home);
    const claudeLocal = generic.filter((endpoint) => endpoint.backend === "claude");
    if (claudeLocal.length) {
      claude.endpoints = [...claudeLocal, ...claude.endpoints];
      claude.endpoint = claude.endpoint || claudeLocal[0];
    }
    if (!claude.endpoint) {
      claude.notes.push(
        claude.installed
          ? "Claude Desktop/Claude Code are agents, not local HTTP model APIs. The Sonnet/Haiku models in the Claude app require a Claude-compatible proxy or a paid Anthropic API key. Start a proxy or configure its URL."
          : "No local Claude-compatible endpoint was found.",
      );
    }
    const endpoints = [];
    if (hermes.endpoint) endpoints.push(hermes.endpoint);
    if (claude.endpoint) endpoints.push(claude.endpoint);
    for (const endpoint of generic) {
      if (!endpoints.some((item) => item.backend === endpoint.backend && item.baseUrl === endpoint.baseUrl)) {
        endpoints.push(endpoint);
      }
    }
    const value = {
      endpoints,
      hermes,
      claude,
      scannedPorts: ports.length,
      scannedAt: new Date().toISOString(),
      notes: [...hermes.notes, ...claude.notes],
    };
    discoveryCache = { at: Date.now(), value };
    return value;
  })().finally(() => {
    discoveryInFlight = null;
  });
  return discoveryInFlight;
}

function setEnvValue(lines, key, value) {
  const pattern = new RegExp(`^\\s*${key}\\s*=`);
  const index = lines.findIndex((line) => pattern.test(line));
  const next = `${key}=${value}`;
  if (index >= 0) lines[index] = next;
  else lines.push(next);
}

export async function ensureHermesApiServer() {
  const home = findHermesHome();
  if (!home) {
    throw new Error(
      "Hermes was not found. Install Hermes from https://hermes-agent.nousresearch.com/ and try again.",
    );
  }
  const cli = await findHermesCli(home);
  if (!cli) {
    throw new Error(
      "The Hermes command was not found. Open Hermes once so it finishes installing, then try again.",
    );
  }
  const settings = hermesApiSettings(home);
  const key = settings.key || HERMES_DEFAULT_KEY;
  const envPath = path.join(home, ".env");
  const lines = readText(envPath).split(/\r?\n/);
  while (lines.length && !lines[lines.length - 1].trim()) lines.pop();
  const marker = "# Creator Studio local OpenAI-compatible backend";
  if (!lines.some((line) => line.trim() === marker)) {
    if (lines.length) lines.push("");
    lines.push(marker);
  }
  setEnvValue(lines, "API_SERVER_ENABLED", "true");
  setEnvValue(lines, "API_SERVER_KEY", key);
  setEnvValue(lines, "API_SERVER_HOST", "127.0.0.1");
  setEnvValue(lines, "API_SERVER_PORT", String(settings.port));
  await fs.mkdir(home, { recursive: true });
  await fs.writeFile(envPath, lines.join("\n") + "\n", "utf8");

  const restart = await run(cli, ["gateway", "restart"], 60000);
  const log = [restart.stdout, restart.stderr].filter(Boolean).join("\n").trim();
  const baseUrl = `http://127.0.0.1:${settings.port}/v1`;
  const deadline = Date.now() + 30000;
  let lastError = "";
  while (Date.now() < deadline) {
    const probe = await probeModelEndpoint(baseUrl, { apiKey: key, timeoutMs: 1500 });
    if (probe.ok) {
      discoveryCache = { at: 0, value: null };
      const catalog = await fetchHermesModelCatalog(baseUrl, key);
      return {
        ok: true,
        baseUrl,
        apiKey: key,
        models: [...new Set(["hermes-agent", ...catalog.models, ...probe.models])],
        log,
        home,
      };
    }
    lastError = probe.error || lastError;
    await new Promise((resolve) => setTimeout(resolve, 700));
  }
  throw new Error(
    `Hermes API server did not start on ${baseUrl}. ${lastError || ""}`.trim(),
  );
}
