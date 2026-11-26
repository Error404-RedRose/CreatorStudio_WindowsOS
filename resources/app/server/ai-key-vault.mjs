/**
 * Encrypted, machine-bound credential vault for Creator Studio AI backends.
 *
 * Two credential kinds live side by side:
 *   - "apiKey"  a provider API key (OpenCode Go, Anthropic API, OpenRouter…)
 *   - "account" an account sign-in (Claude Pro/Max OAuth, a Nous/Hermes
 *               account token). Accounts are swapped exactly like API keys.
 *
 * Credentials are stored in <dataDir>/secrets/ai-keys.dat using AES-256-GCM.
 * The encryption key is derived with scrypt from this PC's Windows MachineGuid,
 * the OS user and an app secret, so copying the file to another machine does
 * not reveal anything. Plaintext secrets never reach settings.json and only
 * leave this module when the user explicitly reveals one in Settings.
 *
 * Shape:
 * {
 *   version: 1,
 *   active: { opencode: { "<providerId>": "<credentialId>" }, claude: {}, hermes: {} },
 *   credentials: [{
 *     id, kind, backend, providerId, providerName, label, email, subscription,
 *     apiKey, access, refresh, expires, baseUrl, apiStyle, models: [],
 *     createdAt, lastUsedAt
 *   }]
 * }
 */

import fs from "node:fs/promises";
import fssync from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFile, execFileSync } from "node:child_process";
import {
  randomUUID,
  randomBytes,
  createHash,
  createCipheriv,
  createDecipheriv,
  scryptSync,
} from "node:crypto";

const APP_SECRET = "TwilightStudio.CreatorStudio.AiKeyVault.v1";
const MAGIC = Buffer.from("TWIXKEY1");
const FILE_NAME = "studio-credentials.dat";

function hardwareFingerprint() {
  let machineGuid = "";
  if (process.platform === "win32") {
    try {
      const out = execFileSync(
        "reg",
        ["query", "HKLM\\SOFTWARE\\Microsoft\\Cryptography", "/v", "MachineGuid"],
        { encoding: "utf8", windowsHide: true },
      );
      const match = out.match(/MachineGuid\s+REG_SZ\s+([0-9a-fA-F-]+)/);
      if (match) machineGuid = match[1];
    } catch {}
  }
  let username = "";
  try {
    username = os.userInfo().username;
  } catch {}
  const raw = [machineGuid || os.hostname(), username, process.platform].join("|");
  return createHash("sha256").update(raw).digest("hex");
}

function deriveKey(salt) {
  return scryptSync(`${hardwareFingerprint()}|${APP_SECRET}`, salt, 32);
}

function setHidden(file) {
  if (process.platform !== "win32") return;
  try {
    execFile("attrib", ["+h", file], () => {});
  } catch {}
}

export function maskSecret(value) {
  const key = String(value || "");
  if (!key) return "";
  if (key.length <= 8) return `${key.slice(0, 1)}${"*".repeat(Math.max(2, key.length - 2))}${key.slice(-1)}`;
  return `${key.slice(0, 4)}${"*".repeat(Math.max(4, Math.min(16, key.length - 8)))}${key.slice(-4)}`;
}

/**
 * What kind of secret a value is. Claude plan usage only works with OAuth
 * tokens (sk-ant-oat...). API and usage keys (sk-ant-api..., sk-ant-usr...)
 * are billed against paid credits, never the Max plan allowance.
 */
export function secretKind(value) {
  const secret = String(value || "").trim();
  if (!secret) return "";
  if (/^sk-ant-oat/i.test(secret)) return "oauth";
  if (/^sk-ant-usr/i.test(secret)) return "usageKey";
  if (/^sk-ant-api/i.test(secret)) return "apiKey";
  if (/^sk-ant-/i.test(secret)) return "key";
  return "token";
}

export function isPlanOAuthSecret(value) {
  return secretKind(value) === "oauth";
}

function emptyVault() {
  return { version: 1, active: { opencode: {}, claude: {}, hermes: {} }, credentials: [] };
}

export function createAiKeyVault({ dataDir }) {
  const vaultDir = path.join(dataDir, "secrets");
  const vaultPath = path.join(vaultDir, FILE_NAME);
  let cache = null;

  function decrypt(raw) {
    try {
      if (raw.length < MAGIC.length + 16 + 12 + 16) return null;
      if (!raw.subarray(0, MAGIC.length).equals(MAGIC)) return null;
      let offset = MAGIC.length;
      const salt = raw.subarray(offset, offset + 16);
      offset += 16;
      const iv = raw.subarray(offset, offset + 12);
      offset += 12;
      const tag = raw.subarray(offset, offset + 16);
      offset += 16;
      const ciphertext = raw.subarray(offset);
      const decipher = createDecipheriv("aes-256-gcm", deriveKey(salt), iv);
      decipher.setAuthTag(tag);
      const plain = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
      const data = JSON.parse(plain.toString("utf8"));
      if (!data || typeof data !== "object") return null;
      const list = Array.isArray(data.credentials)
        ? data.credentials
        : Array.isArray(data.keys)
          ? data.keys.map((record) => ({ ...record, kind: record.kind || "apiKey" }))
          : [];
      return {
        version: 1,
        active: {
          opencode: { ...(data.active?.opencode || {}) },
          claude: { ...(data.active?.claude || {}) },
          hermes: { ...(data.active?.hermes || {}) },
        },
        credentials: list,
      };
    } catch {
      return null;
    }
  }

  function encrypt(data) {
    const salt = randomBytes(16);
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", deriveKey(salt), iv);
    const ciphertext = Buffer.concat([
      cipher.update(JSON.stringify(data), "utf8"),
      cipher.final(),
    ]);
    return Buffer.concat([MAGIC, salt, iv, cipher.getAuthTag(), ciphertext]);
  }

  async function persist(data) {
    await fs.mkdir(vaultDir, { recursive: true });
    const temp = `${vaultPath}.${process.pid}.tmp`;
    await fs.writeFile(temp, encrypt(data), { mode: 0o600 });
    try {
      await fs.unlink(vaultPath);
    } catch {}
    await fs.rename(temp, vaultPath);
    setHidden(vaultPath);
    cache = data;
  }

  function load() {
    if (cache) return cache;
    try {
      const raw = fssync.readFileSync(vaultPath);
      const data = decrypt(raw);
      if (data) {
        cache = data;
        return cache;
      }
    } catch {}
    cache = emptyVault();
    return cache;
  }

  function publicRecord(record, data) {
    const activeId = data.active?.[record.backend]?.[record.providerId] || "";
    const secret = record.kind === "account" ? record.access : record.apiKey;
    return {
      id: record.id,
      kind: record.kind || "apiKey",
      backend: record.backend,
      providerId: record.providerId,
      catalogId: record.catalogId || "",
      providerName: record.providerName || record.providerId,
      label: record.label || "",
      email: record.email || "",
      subscription: record.subscription || "",
      masked: maskSecret(secret),
      last4: String(secret || "").slice(-4),
      baseUrl: record.baseUrl || "",
      apiStyle: record.apiStyle || "openai",
      models: Array.isArray(record.models) ? record.models : [],
      expires: record.expires || 0,
      tokenType: record.kind === "account" ? secretKind(secret) : "key",
      plan: record.kind === "account" && secretKind(secret) === "oauth",
      createdAt: record.createdAt || "",
      lastUsedAt: record.lastUsedAt || "",
      active: Boolean(activeId && activeId === record.id),
    };
  }

  /** Public list for the Settings UI. Never includes a plaintext secret. */
  function list(backend = "", providerId = "") {
    const data = load();
    return data.credentials
      .filter((record) => !backend || record.backend === backend)
      .filter((record) => !providerId || record.providerId === providerId)
      .map((record) => publicRecord(record, data));
  }

  /** Records for the config builder. Includes plaintext to the server only. */
  function rawRecords(backend = "") {
    const data = load();
    return data.credentials.filter((record) => !backend || record.backend === backend);
  }

  function find(id) {
    return load().credentials.find((record) => record.id === id) || null;
  }

  function activeFor(backend, providerId) {
    const data = load();
    const id = data.active?.[backend]?.[providerId] || "";
    if (!id) return null;
    return data.credentials.find((record) => record.id === id) || null;
  }

  /** The active credential for a backend. If no provider is given, use the last-used one. */
  function activeRecord(backend, providerId = "") {
    if (providerId) return activeFor(backend, providerId);
    const data = load();
    const map = data.active?.[backend] || {};
    const ids = Object.values(map);
    if (!ids.length) return null;
    const last = data.credentials
      .filter((record) => record.backend === backend && ids.includes(record.id))
      .sort((a, b) =>
        String(b.lastUsedAt || b.createdAt || "").localeCompare(
          String(a.lastUsedAt || a.createdAt || ""),
        ),
      )[0];
    return last || null;
  }

  async function add(input) {
    const backend = ["opencode", "claude", "hermes"].includes(input?.backend)
      ? input.backend
      : "opencode";
    const kind = input?.kind === "account" ? "account" : "apiKey";
    const providerId = String(input?.providerId || "").trim();
    if (!providerId) throw new Error("Choose a provider for this credential.");
    if (kind === "apiKey" && !String(input?.apiKey || "").trim()) {
      throw new Error("Paste an API key first.");
    }
    if (kind === "account" && !String(input?.access || input?.refresh || "").trim()) {
      throw new Error("Sign in to the account first.");
    }
    const data = load();
    const record = {
      id: randomUUID(),
      kind,
      backend,
      providerId,
      providerName: String(input?.providerName || providerId),
      catalogId: String(input?.catalogId || ""),
      label: String(input?.label || "").trim(),
      email: String(input?.email || "").trim(),
      subscription: String(input?.subscription || "").trim(),
      apiKey: kind === "apiKey" ? String(input?.apiKey || "").trim() : "",
      access: kind === "account" ? String(input?.access || "").trim() : "",
      refresh: kind === "account" ? String(input?.refresh || "").trim() : "",
      expires: Number(input?.expires || 0),
      baseUrl: String(input?.baseUrl || "").trim(),
      apiStyle: input?.apiStyle === "anthropic" ? "anthropic" : "openai",
      models: Array.isArray(input?.models) ? input.models.map(String) : [],
      createdAt: new Date().toISOString(),
      lastUsedAt: "",
    };
    data.credentials.push(record);
    // A newly added credential becomes usable immediately for that provider/backend.
    data.active[backend] = { ...(data.active[backend] || {}), [providerId]: record.id };
    await persist(data);
    return publicRecord(record, data);
  }

  async function update(id, patch = {}) {
    const data = load();
    const record = data.credentials.find((item) => item.id === id);
    if (!record) throw new Error("That credential no longer exists.");
    if (patch.label !== undefined) record.label = String(patch.label);
    if (patch.model) record.models = [...new Set([...record.models, String(patch.model)])];
    if (Array.isArray(patch.models)) record.models = [...new Set(patch.models.map(String))];
    if (patch.lastUsedAt) record.lastUsedAt = patch.lastUsedAt;
    if (patch.access) record.access = String(patch.access);
    if (patch.refresh) record.refresh = String(patch.refresh);
    if (patch.expires) record.expires = Number(patch.expires);
    await persist(data);
    return publicRecord(record, data);
  }

  async function remove(id) {
    const data = load();
    const record = data.credentials.find((item) => item.id === id);
    if (!record) return { ok: false, error: "That credential no longer exists." };
    data.credentials = data.credentials.filter((item) => item.id !== id);
    for (const backend of Object.keys(data.active || {})) {
      for (const [providerId, activeId] of Object.entries(data.active[backend] || {})) {
        if (activeId !== id) continue;
        const replacement = data.credentials
          .filter(
            (item) =>
              item.backend === backend &&
              item.providerId === record.providerId &&
              item.kind === record.kind,
          )
          .sort((a, b) =>
            String(b.lastUsedAt || b.createdAt || "").localeCompare(
              String(a.lastUsedAt || a.createdAt || ""),
            ),
          )[0];
        if (replacement) data.active[backend][providerId] = replacement.id;
        else delete data.active[backend][providerId];
      }
    }
    await persist(data);
    return { ok: true, removed: id };
  }

  async function activate(id) {
    const data = load();
    const record = data.credentials.find((item) => item.id === id);
    if (!record) throw new Error("That credential no longer exists.");
    data.active[record.backend] = {
      ...(data.active[record.backend] || {}),
      [record.providerId]: record.id,
    };
    record.lastUsedAt = new Date().toISOString();
    await persist(data);
    return publicRecord(record, data);
  }

  /** Reveal one credential after an explicit in-app click. */
  function reveal(id) {
    const record = find(id);
    if (!record) throw new Error("That credential no longer exists.");
    if (record.kind === "account") {
      return {
        id: record.id,
        kind: "account",
        apiKey: record.access || "",
        access: record.access || "",
        refresh: record.refresh || "",
        email: record.email || "",
      };
    }
    return { id: record.id, kind: "apiKey", apiKey: record.apiKey || "" };
  }

  function clear() {
    cache = emptyVault();
    try {
      fssync.unlinkSync(vaultPath);
    } catch {}
  }

  return {
    path: vaultPath,
    list,
    rawRecords,
    find,
    activeFor,
    activeRecord,
    add,
    update,
    remove,
    activate,
    reveal,
    clear,
  };
}
