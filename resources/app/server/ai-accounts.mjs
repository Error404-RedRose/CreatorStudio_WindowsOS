/**
 * Account sign-in detection for the three Creator Studio AI backends.
 *
 * OpenCode accounts are API keys, but Claude and Hermes are usually account
 * sign-ins: Claude Code/Claude Desktop sign in with an email (Claude Pro/Max
 * OAuth) and Hermes signs in with a Nous account token. This module finds the
 * sign-ins that already exist on this PC so Settings can import them into the
 * encrypted vault and swap between accounts.
 *
 * Only local files that the user already signed in with are read. Nothing is
 * sent anywhere.
 */

import fs from "node:fs/promises";
import fssync from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

function exists(file) {
  try {
    return Boolean(file) && fssync.existsSync(file);
  } catch {
    return false;
  }
}

function readJson(file, fallback = null) {
  try {
    return JSON.parse(fssync.readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
}

function readText(file) {
  try {
    return fssync.readFileSync(file, "utf8");
  } catch {
    return "";
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

/**
 * Claude Code's public OAuth client and token endpoint. A Max plan access
 * token lasts a few hours; the refresh token (sk-ant-ort...) renews it so the
 * account keeps working without another sign-in.
 */
export const CLAUDE_OAUTH_CLIENT_ID = "9d1c250a-e61b-44d9-88ed-5944d1962f5e";
export const CLAUDE_OAUTH_TOKEN_URLS = [
  "https://console.anthropic.com/v1/oauth/token",
  "https://platform.claude.com/v1/oauth/token",
];

export async function refreshClaudeOAuthToken(refreshToken, { timeoutMs = 20000 } = {}) {
  const refresh = String(refreshToken || "").trim();
  if (!refresh) throw new Error("This Claude account has no refresh token. Sign in again.");
  let lastError = "";
  for (const url of CLAUDE_OAUTH_TOKEN_URLS) {
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({
          grant_type: "refresh_token",
          refresh_token: refresh,
          client_id: CLAUDE_OAUTH_CLIENT_ID,
        }),
        signal: AbortSignal.timeout(timeoutMs),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.access_token) {
        lastError = `HTTP ${response.status}: ${String(payload?.error_description || payload?.error || "").slice(0, 200)}`;
        continue;
      }
      return {
        access: String(payload.access_token),
        refresh: String(payload.refresh_token || refresh),
        expires: payload.expires_in ? Date.now() + Number(payload.expires_in) * 1000 : 0,
      };
    } catch (error) {
      lastError = error?.message || "request failed";
    }
  }
  throw new Error(`Could not refresh the Claude sign-in (${lastError}).`);
}

export function claudeHome() {
  return path.join(os.homedir(), ".claude");
}

export function hermesHome() {
  const candidates = [
    process.env.HERMES_HOME,
    path.join(os.homedir(), ".hermes"),
    path.join(os.homedir(), ".local", "share", "hermes"),
  ].filter(Boolean);
  return candidates.find((dir) => exists(path.join(dir, ".env")) || exists(path.join(dir, "auth.json"))) || candidates[1];
}

/** Locate the Claude Code CLI (native install, npm shim or PATH). */
export function findClaudeCodeCli() {
  const candidates = [
    process.env.CLAUDE_EXECUTABLE,
    path.join(os.homedir(), ".local", "bin", process.platform === "win32" ? "claude.exe" : "claude"),
    process.env.APPDATA ? path.join(process.env.APPDATA, "npm", "claude.cmd") : "",
    process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, "Programs", "claude", "claude.exe") : "",
    "/usr/local/bin/claude",
    "/usr/bin/claude",
  ].filter(Boolean);
  return candidates.find((file) => exists(file)) || "";
}

/** Ask Claude Code who is signed in. Returns null when it cannot answer. */
export function claudeCodeStatus() {
  const cli = findClaudeCodeCli();
  if (!cli) return { installed: false, cli: "", loggedIn: false, authMethod: "none", expiresAt: null };
  try {
    const result = spawnSync(cli, ["auth", "status"], {
      encoding: "utf8",
      windowsHide: true,
      timeout: 12000,
      env: { ...process.env, NO_COLOR: "1" },
    });
    const text = String(result.stdout || "");
    const start = text.indexOf("{");
    const data = start >= 0 ? JSON.parse(text.slice(start, text.lastIndexOf("}") + 1)) : null;
    if (!data) return { installed: true, cli, loggedIn: false, authMethod: "unknown", expiresAt: null };
    return {
      installed: true,
      cli,
      loggedIn: Boolean(data.loggedIn),
      authMethod: String(data.authMethod || "none"),
      apiProvider: String(data.apiProvider || ""),
      expiresAt: Number(new Date(data.loginExpiresAt || 0).getTime()) || null,
    };
  } catch (error) {
    return { installed: true, cli, loggedIn: false, authMethod: "unknown", error: error?.message || "" };
  }
}

export function claudeDesktopDataDir() {
  if (process.platform !== "win32") return "";
  const base = path.join(process.env.LOCALAPPDATA || "", "Claude-Data");
  return exists(base) ? base : "";
}

/**
 * Claude Code keeps its OAuth tokens in ~/.claude/.credentials.json on most
 * installs and the account profile (email, plan) in ~/.claude.json.
 */
export function detectClaudeAccount() {
  const profile = readJson(path.join(os.homedir(), ".claude.json"), {}) || {};
  const oauth = profile.oauthAccount || {};
  const credentials = readJson(path.join(claudeHome(), ".credentials.json"), {}) || {};
  const tokens = credentials.claudeAiOauth || credentials.oauth || {};
  const access = String(tokens.accessToken || tokens.access || "");
  const refresh = String(tokens.refreshToken || tokens.refresh || "");
  const expires = Number(tokens.expiresAt || tokens.expires || 0);
  const desktopDir = claudeDesktopDataDir();
  return {
    id: "claude",
    label: "Claude account",
    email: String(oauth.emailAddress || oauth.email || ""),
    plan: String(oauth.organizationType || oauth.userRateLimitTier || ""),
    organization: String(oauth.organizationName || ""),
    accountId: String(oauth.accountUuid || ""),
    subscription: String(tokens.subscriptionType || oauth.organizationType || ""),
    hasCredentials: Boolean(access || refresh),
    access,
    refresh,
    expires,
    sources: {
      profile: exists(path.join(os.homedir(), ".claude.json")),
      code: exists(path.join(claudeHome(), ".credentials.json")),
      desktop: Boolean(desktopDir),
    },
  };
}

/** Nous/Hermes account token stored by the Hermes agent. */
export function detectHermesAccount() {
  const home = hermesHome();
  const auth = readJson(path.join(home, "auth.json"), {}) || {};
  const nous = auth?.providers?.nous || {};
  const access = String(nous.access_token || nous.accessToken || nous.agent_key || "");
  const refresh = String(nous.refresh_token || nous.refreshToken || "");
  const env = parseEnv(readText(path.join(home, ".env")));
  const blitzKey = String(env.HERMES_CUSTOM_BLITZBOY_API_KEY || "").trim();
  const blitzBase = String(
    env.HERMES_CUSTOM_BLITZBOY_BASE_URL || env.BLITZBOY_BASE_URL || "https://api.abliteration.ai/v1",
  );
  return {
    id: "hermes",
    home,
    installed: exists(home),
    nous: {
      hasCredentials: Boolean(access),
      access,
      refresh,
      email: String(nous.email || nous.account || ""),
      baseUrl: String(nous.inference_base_url || "https://welcome-api.nousresearch.com/v1"),
      expires: Number(nous.expires_at || 0),
    },
    blitzboy: {
      hasCredentials: Boolean(blitzKey),
      apiKey: blitzKey,
      baseUrl: blitzBase,
    },
  };
}

/** Everything the Settings page needs to describe account sign-in options. */
export function detectAccounts() {
  const claude = detectClaudeAccount();
  const hermes = detectHermesAccount();
  const code = claudeCodeStatus();
  return {
    claudeCode: code,
    claude: {
      available: Boolean(claude.email || claude.hasCredentials),
      email: claude.email,
      plan: claude.plan,
      organization: claude.organization,
      subscription: claude.subscription,
      hasCredentials: claude.hasCredentials,
      credentialSource: claude.sources.code
        ? "Claude Code"
        : claude.sources.desktop
          ? "Claude Desktop"
          : "",
      desktopInstalled: claude.sources.desktop,
    },
    hermes: {
      installed: hermes.installed,
      nousAvailable: hermes.nous.hasCredentials,
      blitzboyAvailable: hermes.blitzboy.hasCredentials,
      home: hermes.home,
    },
  };
}
