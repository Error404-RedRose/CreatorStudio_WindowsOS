/**
 * MCP linking for Claude Desktop, Claude Code and Hermes.
 *
 * Creator Studio itself always talks to OpenCode, so OpenCode, Hermes and
 * Claude backends all inherit the same MCP servers and tool permissions. This
 * module additionally lets the Claude Desktop / Claude Code apps and a local
 * Hermes install attach to the very same Creator Studio tool surface as
 * external MCP clients.
 *
 * The bridge token changes every time the app starts, so configs point at the
 * token file instead of copying the secret into every client config.
 */

import fs from "node:fs/promises";
import fssync from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";

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

async function writeJson(file, value) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const temp = `${file}.${process.pid}.tmp`;
  await fs.writeFile(temp, JSON.stringify(value, null, 2) + "\n", "utf8");
  await fs.rename(temp, file);
}

function findClaudeDesktopConfig() {
  const candidates = [];
  const packages = process.env.LOCALAPPDATA
    ? path.join(process.env.LOCALAPPDATA, "Packages")
    : "";
  if (packages && exists(packages)) {
    try {
      for (const name of fssync.readdirSync(packages)) {
        if (!/^Claude_/i.test(name)) continue;
        candidates.push(
          path.join(packages, name, "LocalCache", "Roaming", "Claude", "claude_desktop_config.json"),
        );
      }
    } catch {}
  }
  if (process.env.APPDATA) {
    candidates.push(path.join(process.env.APPDATA, "Claude", "claude_desktop_config.json"));
  }
  if (process.env.LOCALAPPDATA) {
    candidates.push(path.join(process.env.LOCALAPPDATA, "Claude", "claude_desktop_config.json"));
  }
  return (
    candidates.find((file) => exists(file)) ||
    candidates.find((file) => exists(path.dirname(file))) ||
    candidates[candidates.length - 1] ||
    ""
  );
}

function findClaudeCodeConfig() {
  return path.join(os.homedir(), ".claude.json");
}

function findClaudeCodeCli() {
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

function findHermesConfig() {
  const home = process.env.HERMES_HOME || path.join(os.homedir(), ".hermes");
  const candidates = [path.join(home, "config.yaml"), path.join(home, "config.yml")];
  return candidates.find((file) => exists(file)) || candidates[0];
}

function claudeRunning() {
  if (process.platform !== "win32") return false;
  try {
    const out = execFileSync("tasklist", ["/FI", "IMAGENAME eq Claude.exe", "/NH"], {
      encoding: "utf8",
      windowsHide: true,
      timeout: 4000,
    });
    return /Claude\.exe/i.test(out);
  } catch {
    return false;
  }
}

function serverEntries({ appRoot, dataDir, port, tokenFile, projectId, root }) {
  const node = process.execPath;
  const shared = {
    ELECTRON_RUN_AS_NODE: "1",
    TWIX_BRIDGE_URL: `http://127.0.0.1:${port}`,
    TWIX_BRIDGE_TOKEN_FILE: tokenFile,
    TWIX_DATA_DIR: dataDir,
  };
  return {
    "creator-studio": {
      command: node,
      args: [path.join(appRoot, "server", "coding-mcp.mjs")],
      env: {
        ...shared,
        TWIX_CODING_ROOT: root,
        TWIX_APP_ROOT: appRoot,
        TWIX_CODING_TRUSTED: "1",
      },
    },
    "creator-studio-3d": {
      command: node,
      args: [path.join(appRoot, "server", "mcp-server.mjs")],
      env: {
        ...shared,
        TWIX_PROJECT_ID: projectId || "",
      },
    },
  };
}

/** Minimal YAML block writer for ~/.hermes/config.yaml. */
function mergeHermesYaml(text, entries) {
  const lines = String(text || "").split(/\r?\n/);
  const block = ["mcp_servers:"];
  for (const [name, entry] of Object.entries(entries)) {
    block.push(`  ${name}:`);
    block.push(`    command: ${JSON.stringify(entry.command)}`);
    block.push(`    args:`);
    for (const arg of entry.args || []) block.push(`      - ${JSON.stringify(arg)}`);
    block.push(`    env:`);
    for (const [key, value] of Object.entries(entry.env || {})) {
      block.push(`      ${key}: ${JSON.stringify(String(value))}`);
    }
    block.push(`    timeout: 600`);
  }

  const start = lines.findIndex((line) => /^mcp_servers\s*:\s*$/.test(line));
  if (start < 0) {
    const trimmed = lines.join("\n").replace(/\s+$/, "");
    return `${trimmed}${trimmed ? "\n\n" : ""}${block.join("\n")}\n`;
  }
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i += 1) {
    const line = lines[i];
    if (!line.trim()) continue;
    if (/^\S/.test(line)) {
      end = i;
      break;
    }
  }
  const existing = lines.slice(start + 1, end);
  const kept = [];
  let skipping = false;
  for (let i = 0; i < existing.length; i += 1) {
    const line = existing[i];
    if (/^\s{2}[A-Za-z0-9_.-]+\s*:\s*$/.test(line)) {
      skipping = /^\s{2}creator-studio(?:-3d)?\s*:\s*$/.test(line);
      if (skipping) {
        // Skip this entry and all of its indented children.
        while (i + 1 < existing.length && /^\s{4,}/.test(existing[i + 1])) i += 1;
        continue;
      }
    }
    kept.push(line);
  }
  return [
    ...lines.slice(0, start),
    ...block,
    ...kept,
    ...lines.slice(end),
  ]
    .join("\n")
    .replace(/\n{3,}/g, "\n\n");
}

export function mcpLinkStatus({ appRoot, dataDir, port, tokenFile, projectId }) {
  const claudeDesktopConfig = findClaudeDesktopConfig();
  const claudeCodeConfig = findClaudeCodeConfig();
  const hermesConfig = findHermesConfig();
  const desktopJson = readJson(claudeDesktopConfig, {}) || {};
  const codeJson = readJson(claudeCodeConfig, {}) || {};
  let hermesLinked = false;
  try {
    const text = fssync.readFileSync(hermesConfig, "utf8");
    hermesLinked = /creator-studio/.test(text) && /mcp_servers/.test(text);
  } catch {}
  return {
    bridge: { url: `http://127.0.0.1:${port}`, tokenFile },
    servers: Object.keys(serverEntries({ appRoot, dataDir, port, tokenFile, projectId, root: "" })),
    claudeDesktop: {
      configPath: claudeDesktopConfig,
      linked: Boolean(desktopJson?.mcpServers?.["creator-studio"]),
      running: claudeRunning(),
      installed: Boolean(claudeDesktopConfig),
    },
    claudeCode: {
      configPath: claudeCodeConfig,
      linked: Boolean(codeJson?.mcpServers?.["creator-studio"]),
      installed: exists(claudeCodeConfig),
    },
    hermes: {
      configPath: hermesConfig,
      linked: hermesLinked,
      installed: exists(hermesConfig) || exists(path.dirname(hermesConfig)),
    },
    backends: {
      opencode: { mcp: true, sameToolSurface: true },
      claude: { mcp: true, sameToolSurface: true, externalClient: true },
      hermes: { mcp: true, sameToolSurface: true, externalClient: true },
    },
  };
}

export async function linkMcpTarget(target, options) {
  const entries = serverEntries(options);
  if (target === "claude-desktop") {
    const config = findClaudeDesktopConfig();
    if (!config) throw new Error("Claude Desktop config folder was not found. Open Claude Desktop once, then retry.");
    const current = readJson(config, {}) || {};
    current.mcpServers = { ...(current.mcpServers || {}), ...entries };
    await writeJson(config, current);
    return { ok: true, target, configPath: config, servers: Object.keys(entries) };
  }
  if (target === "claude-code") {
    const config = findClaudeCodeConfig();
    const cli = findClaudeCodeCli();
    if (cli) {
      // Prefer the official command so Claude Code records the server in its
      // own user scope and health-checks it on the next start.
      let added = 0;
      for (const [name, entry] of Object.entries(entries)) {
        const result = spawnSync(
          cli,
          ["mcp", "add-json", name, JSON.stringify(entry), "-s", "user"],
          { encoding: "utf8", windowsHide: true, timeout: 20000, env: { ...process.env, NO_COLOR: "1" } },
        );
        if (result.status === 0) added += 1;
      }
      if (added) {
        return { ok: true, target, configPath: config, servers: Object.keys(entries), via: "claude mcp" };
      }
    }
    const current = readJson(config, {}) || {};
    current.mcpServers = { ...(current.mcpServers || {}), ...entries };
    await writeJson(config, current);
    return { ok: true, target, configPath: config, servers: Object.keys(entries) };
  }
  if (target === "hermes") {
    const config = findHermesConfig();
    let text = "";
    try {
      text = await fs.readFile(config, "utf8");
    } catch {}
    const next = mergeHermesYaml(text, entries);
    await fs.mkdir(path.dirname(config), { recursive: true });
    await fs.writeFile(config, next, "utf8");
    return { ok: true, target, configPath: config, servers: Object.keys(entries), restartRequired: true };
  }
  throw new Error("Unknown MCP target. Use claude-desktop, claude-code or hermes.");
}

export async function unlinkMcpTarget(target) {
  if (target === "claude-desktop" || target === "claude-code") {
    const config = target === "claude-desktop" ? findClaudeDesktopConfig() : findClaudeCodeConfig();
    const current = readJson(config, null);
    if (!current || !current.mcpServers) return { ok: true, target, configPath: config, removed: 0 };
    let removed = 0;
    for (const name of ["creator-studio", "creator-studio-3d"]) {
      if (current.mcpServers[name]) {
        delete current.mcpServers[name];
        removed += 1;
      }
    }
    await writeJson(config, current);
    return { ok: true, target, configPath: config, removed };
  }
  if (target === "hermes") {
    const config = findHermesConfig();
    let text = "";
    try {
      text = await fs.readFile(config, "utf8");
    } catch {
      return { ok: true, target, configPath: config, removed: 0 };
    }
    const next = text
      .split(/\r?\n/)
      .filter((line) => !/creator-studio(?:-3d)?/.test(line))
      .join("\n");
    await fs.writeFile(config, next, "utf8");
    return { ok: true, target, configPath: config, removed: 1 };
  }
  throw new Error("Unknown MCP target.");
}
