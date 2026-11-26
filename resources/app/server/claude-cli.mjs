/**
 * Claude Code CLI bridge.
 *
 * Anthropic now bills third-party apps that replay a Claude Pro/Max OAuth token
 * against api.anthropic.com from "extra usage" instead of the plan. The only
 * sanctioned way to spend plan limits is the official Claude Code binary, so the
 * Claude backend runs `claude.exe` in headless print mode and streams its
 * `--output-format stream-json` events back to OpenCode as Anthropic messages.
 *
 * Two shapes are supported:
 *  - plain  : text/vision completion. Custom system prompt, no tools, no session.
 *  - agent  : Creator Studio tools are exposed through our own MCP server, so
 *             the CLI can inspect files, run builds and drive the 3D applet with
 *             the same tool surface the OpenCode agent normally uses.
 */

import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";

function exists(file) {
  try {
    return Boolean(file) && fs.existsSync(file);
  } catch {
    return false;
  }
}

let cachedCli = null;
export function findClaudeCli() {
  if (cachedCli !== null) return cachedCli;
  const exe = process.platform === "win32" ? "claude.exe" : "claude";
  const candidates = [
    process.env.CLAUDE_EXECUTABLE,
    path.join(os.homedir(), ".local", "bin", exe),
    process.env.APPDATA ? path.join(process.env.APPDATA, "npm", process.platform === "win32" ? "claude.cmd" : "claude") : "",
    process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, "Programs", "claude", exe) : "",
    "/usr/local/bin/claude",
    "/usr/bin/claude",
  ].filter(Boolean);
  // A native .exe is preferred: .cmd shims need a shell and behave worse when
  // spawned with piped stdio.
  const exes = candidates.filter((file) => exists(file));
  cachedCli = exes.find((file) => /\.exe$/i.test(file)) || exes[0] || "";
  return cachedCli;
}

let cachedVersion = "";
export function claudeCliVersion() {
  if (cachedVersion) return cachedVersion;
  const cli = findClaudeCli();
  if (!cli) return "";
  try {
    const result = spawnSync(cli, ["--version"], {
      encoding: "utf8",
      windowsHide: true,
      timeout: 15000,
      env: { ...process.env, NO_COLOR: "1" },
    });
    cachedVersion = String(result.stdout || result.stderr || "")
      .trim()
      .split(/\r?\n/)[0]
      .slice(0, 80);
  } catch {
    cachedVersion = "";
  }
  return cachedVersion;
}

function flattenText(content) {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .map((part) => (part && part.type === "text" ? String(part.text || "") : ""))
    .filter(Boolean)
    .join("\n");
}

/**
 * The coding system prompt names the active workspace, so the CLI can be
 * scoped to the same folder without a second round trip to the renderer.
 */
export function workspaceContextFromSystem(system) {
  const text = flattenText(system);
  let root = "";
  const fenced = text.match(/The selected workspace is:\s*```+\s*([^\r\n`]+?)\s*```+/i);
  if (fenced) root = fenced[1];
  if (!root) {
    const active = text.match(/Active workspace \(the only project to edit\):\s*([^\r\n`]+)/i);
    if (active) root = active[1];
  }
  if (!root) {
    const win = text.match(/[A-Za-z]:\\[^\r\n`"]+/);
    if (win) root = win[0];
  }
  root = String(root || "").trim().replace(/[.,;]+$/, "");
  const trusted = /Trusted workspace:\s*\*\*ON/i.test(text);
  return { root, trusted };
}

/** Pick the newest user turn out of an Anthropic request. */
export function latestUserTurn(messages) {
  if (!Array.isArray(messages)) return { text: "", images: [] };
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const message = messages[i];
    if (!message || message.role !== "user") continue;
    const blocks = Array.isArray(message.content)
      ? message.content
      : [{ type: "text", text: String(message.content || "") }];
    const images = [];
    const texts = [];
    for (const block of blocks) {
      if (!block) continue;
      if (block.type === "text") texts.push(String(block.text || ""));
      else if (block.type === "tool_result") {
        const inner = flattenText(block.content);
        if (inner) texts.push(`[tool result]\n${inner.slice(0, 4000)}`);
      } else if (block.type === "image" && block.source && block.source.type === "base64") {
        images.push({
          media: block.source.media_type || "image/png",
          data: String(block.source.data || ""),
        });
      }
    }
    return { text: texts.join("\n").trim(), images };
  }
  return { text: "", images: [] };
}

/** Flatten a whole conversation into one prompt for stateless completions. */
export function renderTranscript(messages) {
  if (!Array.isArray(messages)) return "";
  const lines = [];
  for (const message of messages) {
    if (!message) continue;
    const role = message.role === "assistant" ? "Assistant" : "User";
    const blocks = Array.isArray(message.content)
      ? message.content
      : [{ type: "text", text: String(message.content || "") }];
    const texts = [];
    for (const block of blocks) {
      if (!block) continue;
      if (block.type === "text") texts.push(String(block.text || ""));
      else if (block.type === "tool_use") {
        texts.push(`[used tool ${block.name || ""}]`);
      } else if (block.type === "tool_result") {
        const inner = flattenText(block.content);
        if (inner) texts.push(`[tool result]\n${inner.slice(0, 8000)}`);
      }
    }
    const body = texts.join("\n").trim();
    if (body) lines.push(`${role}: ${body}`);
  }
  return lines.join("\n\n");
}

/** Save inline images next to the temp dir so the CLI can Read them. */
export async function materializeImages(images, dir) {
  const saved = [];
  if (!Array.isArray(images) || !images.length) return saved;
  await fsp.mkdir(dir, { recursive: true });
  for (const [index, image] of images.entries()) {
    if (!image || !image.data) continue;
    const ext = /jpeg|jpg/i.test(image.media) ? "jpg" : /webp/i.test(image.media) ? "webp" : "png";
    const file = path.join(dir, `image-${Date.now()}-${index}.${ext}`);
    try {
      await fsp.writeFile(file, Buffer.from(image.data, "base64"));
      saved.push(file);
    } catch {}
  }
  return saved;
}

export function sessionKeyFor(parts) {
  return createHash("sha1").update(parts.filter(Boolean).join("\u0000")).digest("hex").slice(0, 24);
}

export function randomUuid() {
  return randomUUID();
}

/**
 * Spawn a headless CLI turn and feed parsed NDJSON events to `onEvent`.
 * Returns a handle with kill() plus a promise that settles on exit.
 */
export function runClaudeProcess({ cli, args, env, cwd, timeoutMs = 30 * 60 * 1000, onEvent, onStderr }) {
  const useShell = /\.cmd$/i.test(cli);
  const child = spawn(useShell ? "cmd.exe" : cli, useShell ? ["/d", "/s", "/c", cli, ...args] : args, {
    cwd: cwd && exists(cwd) ? cwd : undefined,
    env,
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
  });

  let buffer = "";
  let stderr = "";
  let settled = false;

  const timer = setTimeout(() => {
    try {
      child.kill();
    } catch {}
  }, timeoutMs);
  timer.unref?.();

  const done = new Promise((resolve) => {
    child.stdout.on("data", (chunk) => {
      buffer += chunk.toString("utf8");
      let index = buffer.indexOf("\n");
      while (index >= 0) {
        const line = buffer.slice(0, index).trim();
        buffer = buffer.slice(index + 1);
        index = buffer.indexOf("\n");
        if (!line) continue;
        try {
          onEvent(JSON.parse(line));
        } catch {}
      }
    });
    child.stderr.on("data", (chunk) => {
      stderr = (stderr + chunk.toString("utf8")).slice(-6000);
      if (typeof onStderr === "function") onStderr(stderr);
    });
    child.on("error", (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ code: -1, stderr: `${stderr}\n${error.message}` });
    });
    child.on("exit", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ code: typeof code === "number" ? code : -1, stderr });
    });
  });

  return {
    pid: child.pid,
    kill: () => {
      try {
        child.kill("SIGKILL");
      } catch {}
    },
    done,
  };
}

/**
 * Build the `--mcp-config` payload that gives claude.exe the Creator Studio
 * coding tool surface (coding_*, creator_*, github_*, reference_*).
 */
export function codingMcpConfig({ appRoot, dataDir, port, token, tokenFile, root, trusted, unityPort }) {
  const entry = {
    command: process.execPath,
    args: [path.join(appRoot, "server", "coding-mcp.mjs")],
    env: {
      ELECTRON_RUN_AS_NODE: "1",
      TWIX_CODING_ROOT: root,
      TWIX_APP_ROOT: appRoot,
      TWIX_CODING_TRUSTED: trusted ? "1" : "0",
      TWIX_BRIDGE_URL: `http://127.0.0.1:${port}`,
      ...(token ? { TWIX_BRIDGE_TOKEN: token } : tokenFile ? { TWIX_BRIDGE_TOKEN_FILE: tokenFile } : {}),
      TWIX_DATA_DIR: dataDir,
      ...(unityPort ? { TWIX_UNITY_BRIDGE_PORT: String(unityPort) } : {}),
    },
  };
  return { mcpServers: { coding: entry } };
}

export const CLAUDE_CLI_ENV_KEYS = ["ANTHROPIC_API_KEY", "ANTHROPIC_AUTH_TOKEN", "ANTHROPIC_BASE_URL", "ANTHROPIC_MODEL"];

export function claudeCliEnv(oauthToken) {
  const env = { ...process.env };
  for (const key of CLAUDE_CLI_ENV_KEYS) delete env[key];
  env.CLAUDE_CODE_OAUTH_TOKEN = oauthToken;
  env.CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC = "1";
  env.DISABLE_AUTOUPDATER = "1";
  env.NO_COLOR = "1";
  return env;
}

export async function writeTempJson(dir, name, value) {
  await fsp.mkdir(dir, { recursive: true });
  const file = path.join(dir, `${name}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.json`);
  await fsp.writeFile(file, JSON.stringify(value), "utf8");
  return file;
}

export function claudeCliInfo() {
  const cli = findClaudeCli();
  return {
    installed: Boolean(cli),
    path: cli,
    version: cli ? claudeCliVersion() : "",
    platform: process.platform,
  };
}
