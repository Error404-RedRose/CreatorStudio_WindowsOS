#!/usr/bin/env node
/**
 * Linux / Unix in-app updater.
 *
 * The app is shipped as an unpacked Electron folder in the Linux GitHub repo,
 * exactly like the Windows build. This helper waits for Creator Studio to
 * close, downloads the repository snapshot, restores any Git LFS files,
 * verifies the version and folder layout, swaps the application folder with a
 * rollback backup, and relaunches the new build.
 *
 * It is started by electron/updates.cjs through the app's own Electron binary
 * with ELECTRON_RUN_AS_NODE=1, so no system Node.js, git or unzip is required
 * (system unzip tools are still used when available for speed).
 */
import AdmZip from "adm-zip";
import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import fssync from "node:fs";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";

const args = process.argv.slice(2);
function arg(name, fallback = "") {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
}

const installDir = path.resolve(arg("--install-dir"));
const exeName = arg("--exe-name", "creator-studio");
const repo = arg("--repo");
const branch = arg("--branch", "main");
const parentPid = Number(arg("--parent-pid", "0"));
const expectedVersion = arg("--expected-version");
const noStart = args.includes("--no-start");
const minExeBytes = 50 * 1024 * 1024;

const stateHome = process.env.XDG_STATE_HOME || path.join(os.homedir(), ".local", "state");
const logDir = path.join(stateHome, "creator-studio");
const logPath = path.join(logDir, "update.log");

function log(message) {
  const line = `[${new Date().toISOString()}] ${message}`;
  try {
    fssync.mkdirSync(logDir, { recursive: true });
    fssync.appendFileSync(logPath, line + "\n", "utf8");
  } catch {}
  console.log(line);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForParent(pid) {
  if (!pid) return;
  const deadline = Date.now() + 120000;
  while (Date.now() < deadline) {
    try {
      process.kill(pid, 0);
    } catch {
      await sleep(800);
      return;
    }
    await sleep(500);
  }
  throw new Error("Creator Studio did not close in time.");
}

async function download(url, destination, timeoutMs = 15 * 60 * 1000) {
  let lastError = null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const response = await fetch(url, {
        redirect: "follow",
        signal: AbortSignal.timeout(timeoutMs),
        headers: { "User-Agent": "Creator-Studio-Updater" },
      });
      if (!response.ok || !response.body) {
        throw new Error(`Download failed (HTTP ${response.status}): ${url}`);
      }
      await fs.mkdir(path.dirname(destination), { recursive: true });
      await fs.rm(destination, { force: true });
      await new Promise((resolve, reject) => {
        const output = fssync.createWriteStream(destination);
        Readable.fromWeb(response.body).pipe(output);
        output.on("finish", resolve);
        output.on("error", reject);
        response.body.on?.("error", reject);
      });
      return;
    } catch (error) {
      lastError = error;
      if (attempt < 3) {
        log(`Download attempt ${attempt} failed (${error.message}); retrying...`);
        await sleep(2000 * attempt);
      }
    }
  }
  throw lastError;
}

async function extractZip(archive, destination) {
  for (const [command, commandArgs] of [
    ["unzip", ["-q", archive, "-d", destination]],
    ["bsdtar", ["-xf", archive, "-C", destination]],
    ["python3", ["-m", "zipfile", "-e", archive, destination]],
  ]) {
    const result = spawnSync(command, commandArgs, { stdio: "ignore" });
    if (result.status === 0) return;
  }
  log("System ZIP tools were unavailable; using the bundled JS extractor.");
  new AdmZip(archive).extractAllTo(destination, true);
}

async function walkFiles(root) {
  const output = [];
  const visit = async (dir) => {
    for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) await visit(full);
      else if (entry.isFile()) output.push(full);
    }
  };
  await visit(root);
  return output;
}

function parseLfsPointer(buffer) {
  const text = buffer.toString("utf8");
  if (!text.startsWith("version https://git-lfs.github.com/spec/v1")) return null;
  const oid = /(?:^|\n)oid sha256:([0-9a-f]{64})(?:\n|$)/i.exec(text);
  const size = /(?:^|\n)size (\d+)(?:\n|$)/.exec(text);
  return {
    oid: oid ? oid[1].toLowerCase() : "",
    size: size ? Number(size[1]) : 0,
  };
}

async function fileHash(file, algorithm) {
  const hash = createHash(algorithm);
  const data = await fs.readFile(file);
  hash.update(data);
  return hash.digest("hex");
}

async function restoreLfsFiles(root) {
  const files = await walkFiles(root);
  let restored = 0;
  for (const file of files) {
    let handle;
    try {
      handle = await fs.open(file, "r");
      const buffer = Buffer.alloc(512);
      const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
      const pointer = parseLfsPointer(buffer.subarray(0, bytesRead));
      if (!pointer) continue;
      const relative = path.relative(root, file).split(path.sep).join("/");
      const encoded = relative
        .split("/")
        .map((segment) => encodeURIComponent(segment))
        .join("/");
      const url = `https://media.githubusercontent.com/media/${repo}/${branch}/${encoded}`;
      log(`Restoring Git LFS file ${relative} (${(pointer.size / (1024 * 1024)).toFixed(1)} MB)...`);
      const temporary = file + ".lfs-download";
      await download(url, temporary);
      const stat = await fs.stat(temporary);
      if (pointer.size && stat.size !== pointer.size) {
        throw new Error(`${relative} is ${stat.size} bytes; expected ${pointer.size}.`);
      }
      if (pointer.oid) {
        const actual = await fileHash(temporary, "sha256");
        if (actual !== pointer.oid) {
          throw new Error(`${relative} failed its SHA-256 verification.`);
        }
      }
      await fs.rm(file, { force: true });
      await fs.rename(temporary, file);
      restored += 1;
    } catch (error) {
      throw new Error(`Could not restore ${file}: ${error.message}`);
    } finally {
      await handle?.close().catch(() => {});
    }
  }
  if (restored) log(`Restored ${restored} Git LFS file(s).`);
}

function chmodExecutables(root, executableName) {
  const names = new Set([executableName, "creator-studio-launcher", "chrome-sandbox", "chrome_crashpad_handler", "install.sh"]);
  const candidates = [path.join(root, executableName), path.join(root, "creator-studio-launcher"), path.join(root, "chrome-sandbox"), path.join(root, "chrome_crashpad_handler")];
  for (const candidate of candidates) {
    try {
      if (fssync.existsSync(candidate)) fssync.chmodSync(candidate, 0o755);
    } catch {}
  }
  for (const file of fssync.existsSync(root) ? fssync.readdirSync(root) : []) {
    if (names.has(file) || file.endsWith(".sh")) {
      try {
        fssync.chmodSync(path.join(root, file), 0o755);
      } catch {}
    }
  }
}

async function findExecutable(root) {
  const preferred = path.join(root, exeName);
  if (fssync.existsSync(preferred) && (await fs.stat(preferred)).size >= minExeBytes) return preferred;
  const files = await walkFiles(root);
  const candidates = [];
  for (const file of files) {
    if (path.dirname(file) !== root) continue;
    const stat = await fs.stat(file);
    if (stat.size >= minExeBytes) candidates.push({ file, size: stat.size });
  }
  candidates.sort((a, b) => b.size - a.size);
  return candidates[0]?.file || "";
}

async function startApp(executable, workingDirectory) {
  try {
    fssync.chmodSync(executable, 0o755);
  } catch {}
  const child = spawn(executable, [], {
    cwd: workingDirectory,
    detached: true,
    stdio: "ignore",
    env: { ...process.env, TWIX_UPDATED: "1" },
  });
  child.on("error", (error) => log(`Could not start ${executable}: ${error.message}`));
  child.unref();
}

async function main() {
  log("Creator Studio Linux update started.");
  log(`Install folder: ${installDir}`);
  log(`Repository: ${repo} (${branch})`);
  if (!repo) throw new Error("No update repository was supplied.");
  if (!installDir || installDir === path.parse(installDir).root) {
    throw new Error("Refusing to update a filesystem root.");
  }
  const appPackage = path.join(installDir, "resources", "app", "package.json");
  const appMain = path.join(installDir, "resources", "app", "electron", "main.cjs");
  if (!fssync.existsSync(appPackage) || !fssync.existsSync(appMain)) {
    throw new Error(
      `This folder does not look like a Creator Studio installation: ${installDir}. Nothing was changed.`,
    );
  }

  await waitForParent(parentPid);
  try {
    await fs.access(installDir, fssync.constants.W_OK);
    await fs.access(path.dirname(installDir), fssync.constants.W_OK);
  } catch {
    throw new Error(
      `The application folder is not writable: ${installDir}. Move the whole Creator Studio folder into your home directory and use Update again.`,
    );
  }
  const parent = path.dirname(installDir);
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const work = path.join(parent, `.creator-studio-update-${stamp}`);
  const archive = path.join(work, "repo.zip");
  const extractDir = path.join(work, "extract");
  let backup = "";
  try {
    await fs.mkdir(extractDir, { recursive: true });
    const zipUrl = `https://codeload.github.com/${repo}/zip/refs/heads/${branch}`;
    log(`Downloading ${zipUrl}`);
    await download(zipUrl, archive);
    log(`Downloaded ${(fssync.statSync(archive).size / (1024 * 1024)).toFixed(1)} MB.`);
    await extractZip(archive, extractDir);
    const roots = (await fs.readdir(extractDir, { withFileTypes: true })).filter((entry) => entry.isDirectory());
    if (!roots.length) throw new Error("The update package was empty.");
    const newRoot = path.join(extractDir, roots[0].name);
    await restoreLfsFiles(newRoot);

    const packagePath = path.join(newRoot, "resources", "app", "package.json");
    if (!fssync.existsSync(packagePath)) throw new Error("The update package is missing resources/app/package.json.");
    const pkg = JSON.parse(await fs.readFile(packagePath, "utf8"));
    if (expectedVersion && String(pkg.version) !== expectedVersion) {
      throw new Error(`Downloaded version ${pkg.version} does not match expected ${expectedVersion}.`);
    }
    if (!fssync.existsSync(path.join(newRoot, "resources", "app", "dist", "index.html"))) {
      throw new Error("The update package is missing the renderer build.");
    }
    if (!fssync.existsSync(path.join(newRoot, "resources", "app", "electron", "main.cjs"))) {
      throw new Error("The update package is missing the Electron entry point.");
    }
    const executable = await findExecutable(newRoot);
    if (!executable) throw new Error("The update package does not contain a valid application executable.");
    log(`Update package version ${pkg.version}; executable ${path.basename(executable)}.`);

    chmodExecutables(newRoot, path.basename(executable));
    backup = path.join(parent, `Creator Studio backup ${stamp}`);
    if (fssync.existsSync(backup)) throw new Error(`Backup folder already exists: ${backup}`);
    log(`Renaming ${installDir} -> ${backup}`);
    await fs.rename(installDir, backup);
    try {
      log(`Installing ${newRoot} -> ${installDir}`);
      await fs.rename(newRoot, installDir);
    } catch (error) {
      log("Install failed, restoring the previous build.");
      await fs.rename(backup, installDir).catch(() => {});
      throw error;
    }
    const newExecutable = path.join(installDir, path.basename(executable));
    chmodExecutables(installDir, path.basename(executable));
    log(`Installed the new build at ${installDir}`);
    if (noStart) {
      log("Skipping launch because --no-start was supplied.");
    } else {
      log(`Starting ${newExecutable}`);
      await startApp(newExecutable, installDir);
    }
    log("Update complete. Previous build kept at " + backup);
    await fs.rm(work, { recursive: true, force: true }).catch(() => {});
    process.exit(0);
  } catch (error) {
    log(`UPDATE FAILED: ${error.message}`);
    try {
      if (backup && fssync.existsSync(backup) && !fssync.existsSync(installDir)) {
        await fs.rename(backup, installDir);
        log("Restored the previous build.");
      }
      if (!noStart) {
        const oldExecutable = path.join(installDir, exeName);
        if (fssync.existsSync(oldExecutable)) await startApp(oldExecutable, installDir);
      }
    } catch (restoreError) {
      log(`Could not restore the previous build: ${restoreError.message}`);
    }
    await fs.rm(work, { recursive: true, force: true }).catch(() => {});
    process.exit(1);
  }
}

main().catch((error) => {
  log(`UPDATE FAILED: ${error.message}`);
  process.exit(1);
});
