import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import fsSync from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const APP_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SPEECH_TOOLS = path.join(APP_ROOT, "tools", "speech");
const REQUIREMENTS_FILE = path.join(SPEECH_TOOLS, "requirements.txt");
const INSTALL_RETRY_MS = 10 * 60 * 1000;

function firstExisting(candidates) {
  for (const candidate of candidates) {
    if (!candidate) continue;
    if (!candidate.includes("/") && !candidate.includes("\\")) return candidate;
    try {
      if (fsSync.existsSync(candidate)) return candidate;
    } catch {}
  }
  return "";
}

export function createSpeechService({ dataDir, getConfig }) {
  const controlFile = path.join(dataDir, "speech-ptt.txt");
  const controlTag = "speech-ptt.txt";
  const venvDir = path.join(dataDir, "speech-venv");
  const venvPython = path.join(
    venvDir,
    process.platform === "win32" ? path.join("Scripts", "python.exe") : path.join("bin", "python"),
  );
  const venvMarker = path.join(venvDir, ".creator-studio-ready.json");
  let child = null;
  let ready = false;
  let starting = false;
  let active = false;
  let lastError = "";
  let doneAt = 0;
  let overlayChild = null;
  let finishing = false;
  let progress = 0;
  let disabled = false;
  let currentConfigKey = "";
  let currentConfig = { inputDevice: "", model: "base.en", device: "cpu", typeDelay: 0.03 };
  let logTail = [];
  let idleTimer = null;
  let installing = false;
  let installProgress = 0;
  let installError = "";
  let installLog = [];
  let installPromise = null;
  let lastInstallAttemptAt = 0;
  let installDoneAt = 0;

  function appendInstallLog(line) {
    const text = String(line || "").trim();
    if (!text) return;
    installLog.push(text.slice(0, 400));
    if (installLog.length > 120) installLog = installLog.slice(-120);
    console.log(`[speech] ${text.slice(0, 400)}`);
  }

  function requirementsFingerprint() {
    try {
      return createHash("sha256").update(fsSync.readFileSync(REQUIREMENTS_FILE)).digest("hex").slice(0, 16);
    } catch {
      return "";
    }
  }

  function venvReady() {
    if (!fsSync.existsSync(venvPython)) return false;
    try {
      const marker = JSON.parse(fsSync.readFileSync(venvMarker, "utf8"));
      return Boolean(marker?.requirements && marker.requirements === requirementsFingerprint());
    } catch {
      return false;
    }
  }

  function runtimeAvailable() {
    if (venvReady()) return true;
    const packaged = [
      process.platform === "win32"
        ? path.join(APP_ROOT, "tools", "speech", "venv", "Scripts", "python.exe")
        : path.join(APP_ROOT, "tools", "speech", "venv", "bin", "python"),
      process.platform === "win32"
        ? path.join(APP_ROOT, "tools", "speech", ".venv", "Scripts", "python.exe")
        : path.join(APP_ROOT, "tools", "speech", ".venv", "bin", "python"),
    ];
    const explicit = String(process.env.TWIX_PYTHON || "").trim();
    return packaged.some((file) => fsSync.existsSync(file)) || Boolean(explicit && fsSync.existsSync(explicit));
  }

  function systemPython() {
    return firstExisting([
      process.env.TWIX_SYSTEM_PYTHON || "",
      process.platform === "win32" ? "python" : "python3",
      process.platform === "win32" ? "py" : "python",
    ]);
  }

  function resolvePython() {
    const candidates =
      process.platform === "win32"
        ? [
            ...(venvReady() ? [venvPython] : []),
            process.env.TWIX_PYTHON || "",
            venvPython,
            // Creator Studio owns this environment. There is no BitBoy fallback.
            path.join(APP_ROOT, "tools", "speech", "venv", "Scripts", "python.exe"),
            path.join(APP_ROOT, "tools", "speech", ".venv", "Scripts", "python.exe"),
            "python",
          ]
        : [
            ...(venvReady() ? [venvPython] : []),
            process.env.TWIX_PYTHON || "",
            venvPython,
            path.join(APP_ROOT, "tools", "speech", "venv", "bin", "python"),
            path.join(APP_ROOT, "tools", "speech", ".venv", "bin", "python"),
            "python3",
            "python",
          ];
    return firstExisting(candidates);
  }

  function runStreaming(file, args, onLine, env = {}) {
    return new Promise((resolve, reject) => {
      let childProc;
      try {
        childProc = spawn(file, args, {
          cwd: SPEECH_TOOLS,
          windowsHide: true,
          env: {
            ...process.env,
            PYTHONUNBUFFERED: "1",
            PIP_DISABLE_PIP_VERSION_CHECK: "1",
            PIP_NO_INPUT: "1",
            PIP_CACHE_DIR: path.join(dataDir, "pip-cache"),
            ...env,
          },
        });
      } catch (error) {
        reject(error);
        return;
      }
      const handle = (chunk) => {
        for (const line of String(chunk || "").split(/\r?\n/)) {
          if (line.trim()) onLine(line);
        }
      };
      childProc.stdout?.on("data", handle);
      childProc.stderr?.on("data", handle);
      childProc.on("error", reject);
      childProc.on("exit", (code, signal) => {
        if (code === 0) resolve();
        else reject(new Error(`${path.basename(file)} exited with ${code ?? signal}`));
      });
    });
  }

  async function provisionRuntime() {
    if (installPromise) return installPromise;
    if (installing) return null;
    if (requirementsFingerprint() === "") {
      installError = `The speech requirements file is missing: ${REQUIREMENTS_FILE}`;
      return null;
    }
    installing = true;
    installProgress = 3;
    installError = "";
    installLog = [];
    lastInstallAttemptAt = Date.now();
    appendInstallLog(`Preparing the Creator Studio speech engine in ${venvDir}`);
    installPromise = (async () => {
      const basePython = systemPython();
      if (!basePython) {
        throw new Error(
          "Python 3 was not found. Install Python 3 (with venv/pip) from your distribution package manager, then restart Creator Studio.",
        );
      }
      appendInstallLog(`Using ${basePython} to create the speech environment`);
      const hasVenvPython = fsSync.existsSync(venvPython);
      if (!hasVenvPython) {
        installProgress = 10;
        await runStreaming(basePython, ["-m", "venv", venvDir], (line) => appendInstallLog(line));
        if (!fsSync.existsSync(venvPython)) {
          throw new Error("Python created no virtual environment. Install the venv module (for example python3-venv) and retry.");
        }
      }
      installProgress = 25;
      appendInstallLog("Installing speech packages. This runs in the background and may take several minutes...");
      installProgress = 45;
      await runStreaming(
        venvPython,
        ["-m", "pip", "install", "-r", REQUIREMENTS_FILE, "--disable-pip-version-check", "--no-input"],
        (line) => appendInstallLog(line),
      );
      installProgress = 95;
      await fs.mkdir(venvDir, { recursive: true });
      await fs.writeFile(
        venvMarker,
        JSON.stringify(
          {
            requirements: requirementsFingerprint(),
            python: venvPython,
            installedAt: new Date().toISOString(),
          },
          null,
          2,
        ),
        "utf8",
      );
      installProgress = 100;
      installDoneAt = Date.now();
      appendInstallLog("Speech engine installed. Starting the microphone engine...");
      return venvPython;
    })()
      .catch((error) => {
        installError = String(error?.message || error);
        installProgress = 0;
        appendInstallLog(`Speech installation failed: ${installError}`);
        return null;
      })
      .finally(() => {
        installing = false;
        installPromise = null;
        // Only auto-start when the environment is genuinely complete. This
        // makes first launch hands-free after the packages finish downloading.
        if (venvReady()) {
          setTimeout(() => {
            void prepare().catch(() => null);
          }, 250);
        }
      });
    return installPromise;
  }

  function resolveScript() {
    return firstExisting([
      process.env.TWIX_SPEECH_SCRIPT || "",
      path.join(APP_ROOT, "tools", "speech", "twix_speech.py"),
    ]);
  }

  function appendLog(chunk) {
    const text = String(chunk || "");
    for (const line of text.split(/\r?\n/)) {
      if (!line.trim()) continue;
      logTail.push(line.slice(0, 300));
      if (logTail.length > 120) logTail = logTail.slice(-120);
      const progressMatch = line.match(/\[PROGRESS\]\s+(\d+)/);
      if (progressMatch) progress = Math.max(0, Math.min(100, Number(progressMatch[1])));
      if (line.includes("[PTT] Recording")) {
        active = true;
        finishing = false;
        progress = 0;
      }
      if (line.includes("[PTT] Final transcript queued")) {
        active = false;
        finishing = true;
        progress = 0;
      }
      if (line.includes("[DONE]")) {
        doneAt = Date.now();
        active = false;
        finishing = false;
        progress = 100;
      }
      if (line.includes("[READY]")) {
        ready = true;
        lastError = "";
      }
      if (line.includes("[ERROR]")) lastError = line.replace(/^\[ERROR\]\s*/, "").slice(0, 240);
    }
  }

  async function writeControl(value) {
    await fs.mkdir(path.dirname(controlFile), { recursive: true });
    await fs.writeFile(controlFile, value, "utf8");
  }

  function status() {
    const python = resolvePython();
    const script = resolveScript();
    return {
      ok: true,
      running: Boolean(child),
      ready,
      starting,
      active,
      finishing,
      progress,
      doneAt,
      disabled,
      config: currentConfig,
      python,
      script,
      pythonFound: Boolean(python),
      scriptFound: Boolean(script),
      controlFile,
      venv: venvDir,
      venvPython,
      venvReady: venvReady(),
      installing,
      installProgress,
      installError,
      installDoneAt,
      installLog: installLog.slice(-30),
      error: lastError,
      log: logTail.slice(-25),
    };
  }

  function killStaleEngines() {
    if (process.platform !== "win32") return;
    try {
      // Only processes that carry this Creator Studio control file are
      // targeted; a BitBoy session using its own control path is untouched.
      const escaped = controlFile.replace(/'/g, "''");
      spawnSync(
        "powershell",
        [
          "-NoProfile",
          "-Command",
          `Get-CimInstance Win32_Process | Where-Object { $_.Name -like 'python*.exe' -and $_.CommandLine -like '*twix_speech.py*' -and $_.CommandLine -like '*${escaped}*' -and $_.ProcessId -ne ${process.pid} } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }`,
        ],
        { windowsHide: true, timeout: 6000 },
      );
    } catch {}
  }

  function shutdown() {
    try {
      overlayChild?.kill();
    } catch {}
    overlayChild = null;
    try {
      child?.kill();
    } catch {}
    try {
      fsSync.writeFileSync(controlFile, "0");
    } catch {}
    child = null;
    ready = false;
    starting = false;
    active = false;
    finishing = false;
  }

  process.on("exit", shutdown);
  process.on("SIGINT", () => {
    shutdown();
    process.exit(0);
  });
  process.on("SIGTERM", () => {
    shutdown();
    process.exit(0);
  });

  function killStaleOverlays() {
    if (process.platform !== "win32") return;
    try {
      spawnSync(
        "powershell",
        [
          "-NoProfile",
          "-Command",
          "Get-CimInstance Win32_Process | Where-Object { $_.Name -like 'python*.exe' -and $_.CommandLine -like '*mic_overlay.py*' -and $_.ProcessId -ne " +
            process.pid +
            " } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }",
        ],
        { windowsHide: true, timeout: 6000 },
      );
    } catch {}
  }

  function ensureOverlay() {
    // The bundled Tk overlay uses Win32 click-through/transparency APIs. On
    // Linux the microphone still works through the applet and the control
    // file; avoid opening a non-click-through stray window.
    if (process.platform !== "win32") return;
    if (overlayChild) return;
    const python = resolvePython();
    const script = resolveScript();
    if (!python || !script) return;
    const overlayScript = path.join(path.dirname(script), "mic_overlay.py");
    if (!fsSync.existsSync(overlayScript)) return;
    try {
      overlayChild = spawn(python, [overlayScript, "--port", String(process.env.PORT || 4317)], {
        windowsHide: true,
      });
      overlayChild.on("exit", () => {
        overlayChild = null;
      });
    } catch {
      overlayChild = null;
    }
  }

  async function prepareOnce() {
    const config = (await getConfig?.()) || {};
    const enabled = config.enabled !== false;
    const inputDevice = String(config.inputDevice || "");
    const model = String(config.model || "small.en");
    const device = String(config.device || "cpu");
    const typeDelay = Math.max(0.008, Math.min(0.25, Number(config.typeDelay ?? 0.03) || 0.03));
    const configKey = JSON.stringify({ enabled, inputDevice, model, device, typeDelay });
    if (!enabled) {
      shutdown();
      disabled = true;
      currentConfig = { inputDevice, model, device };
      currentConfigKey = configKey;
      lastError = "";
      return status();
    }
    disabled = false;
    if (!runtimeAvailable()) {
      if (installing) {
        lastError = "The Creator Studio speech engine is installing in the background. This happens once.";
        return status();
      }
      if (installError && Date.now() - lastInstallAttemptAt < INSTALL_RETRY_MS) {
        lastError = installError;
        return status();
      }
      lastError = "Preparing the Creator Studio speech engine. This happens once.";
      installProgress = 2;
      void provisionRuntime();
      return status();
    }
    if (!overlayChild) {
      killStaleOverlays();
      ensureOverlay();
    }
    if (child && configKey !== currentConfigKey) {
      // Device or model changed in Settings: restart with the new values.
      try {
        child.kill();
      } catch {}
      child = null;
      ready = false;
      active = false;
      finishing = false;
      logTail = [];
    }
    currentConfig = { inputDevice, model, device };
    currentConfigKey = configKey;
    if (child) return status();
    if (starting) return status();
    const python = resolvePython();
    const script = resolveScript();
    if (!script) {
      lastError = "Speech script not found. Expected tools/speech/twix_speech.py.";
      return status();
    }
    if (!python) {
      lastError = "The Creator Studio speech environment is missing. It is prepared automatically on first launch; you can also run tools/speech/setup.bat or setup.sh, or set TWIX_PYTHON.";
      return status();
    }
    starting = true;
    lastError = "";
    ready = false;
    active = false;
    finishing = false;
    doneAt = 0;
    logTail = [];
    killStaleEngines();
    try {
      await writeControl("0");
    } catch (error) {
      lastError = "Could not create the push-to-talk control file: " + error.message;
      starting = false;
      return status();
    }
    try {
      child = spawn(python, [script, "--control", controlFile, "--hotkey", "right ctrl", "--input-device", inputDevice, "--model", model, "--device", device, "--type-delay", String(typeDelay)], {
        cwd: path.dirname(script),
        windowsHide: true,
        env: {
          ...process.env,
          PYTHONUNBUFFERED: "1",
          PYTHONIOENCODING: "utf-8",
          TWIX_MODEL: model,
          TWIX_DEVICE: device,
        },
      });
    } catch (error) {
      lastError = "Could not start the speech engine: " + error.message;
      child = null;
      starting = false;
      return status();
    }
    child.stdout?.on("data", appendLog);
    child.stderr?.on("data", appendLog);
    child.on("error", (error) => {
      lastError = "Speech engine error: " + error.message;
      ready = false;
    });
    child.on("exit", (code, signal) => {
      child = null;
      ready = false;
      starting = false;
      active = false;
      if (code && !lastError) lastError = "Speech engine exited with code " + code + (signal ? " (" + signal + ")" : "");
    });
    // The model is loaded on its own thread of work; startup resolves once the
    // process exists. [READY] flips ready when loading finishes.
    starting = false;
    return status();
  }

  let preparePromise = null;

  async function prepare() {
    if (preparePromise) return preparePromise;
    preparePromise = prepareOnce().finally(() => {
      preparePromise = null;
    });
    return preparePromise;
  }

  async function waitForReady(timeoutMs = 15000) {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
      if (ready) return true;
      if (!child) return false;
      await new Promise((resolve) => setTimeout(resolve, 150));
    }
    return ready;
  }

  async function start() {
    if (installing) {
      return {
        ...status(),
        ok: false,
        error: `The speech engine is installing (${installProgress}%). Try again when it finishes.`,
      };
    }
    const prepared = await prepare();
    if (disabled) {
      return { ...prepared, ok: false, error: "The microphone is disabled in Settings." };
    }
    if (!prepared.running) return prepared;
    if (!ready) await waitForReady(15000);
    if (!ready) {
      return {
        ...prepared,
        ok: false,
        error: prepared.error || "Speech engine is still loading the model. Hold again in a moment.",
      };
    }
    try {
      await writeControl("1");
      active = true;
      if (idleTimer) clearTimeout(idleTimer);
      idleTimer = setTimeout(() => {
        void stop().catch(() => {});
      }, 90000);
    } catch (error) {
      lastError = "Could not open the microphone: " + error.message;
      return { ...status(), ok: false, error: lastError };
    }
    return status();
  }

  async function stop() {
    if (idleTimer) {
      clearTimeout(idleTimer);
      idleTimer = null;
    }
    if (!child) {
      active = false;
      return status();
    }
    try {
      await writeControl("0");
    } catch {}
    active = false;
    return status();
  }

  async function restart() {
    await stop().catch(() => {});
    if (child) {
      try {
        child.kill();
      } catch {}
      child = null;
    }
    ready = false;
    starting = false;
    if (installError) {
      installError = "";
      lastInstallAttemptAt = 0;
    }
    return prepare();
  }

  function listDevices() {
    if (installing) {
      return { ok: false, error: `The speech engine is installing (${installProgress}%).`, devices: [] };
    }
    if (!runtimeAvailable()) {
      return {
        ok: false,
        error: installError || "The speech engine is being prepared. Try again in a moment.",
        devices: [],
      };
    }
    const python = resolvePython();
    const script = resolveScript();
    if (!python || !script) {
      return { ok: false, error: "Speech script or Python was not found.", devices: [] };
    }
    try {
      const result = spawnSync(python, [script, "--list-devices"], {
        encoding: "utf8",
        timeout: 15000,
        windowsHide: true,
      });
      const line = String(result.stdout || "")
        .split(/\r?\n/)
        .find((entry) => entry.startsWith("DEVICES_JSON="));
      if (!line) {
        return { ok: false, error: String(result.stderr || "Could not list microphones.").slice(0, 240), devices: [] };
      }
      return { ok: true, devices: JSON.parse(line.slice("DEVICES_JSON=".length)) };
    } catch (error) {
      return { ok: false, error: error.message, devices: [] };
    }
  }

  return { prepare, start, stop, restart, status, listDevices };
}
