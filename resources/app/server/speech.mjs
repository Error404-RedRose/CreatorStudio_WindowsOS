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
  let lastWarning = "";
  let lastTranscript = "";
  let lastAudio = null;
  let doneAt = 0;
  let overlayChild = null;
  let overlayRestartTimer = null;
  let overlayFailures = 0;
  let overlayLastStartAt = 0;
  let overlayError = "";
  let shuttingDown = false;
  let finishing = false;
  let progress = 0;
  let disabled = false;
  let requested = false;
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
  let engineRestarts = 0;
  let engineLastStartAt = 0;
  let engineRetryTimer = null;
  let lastReadyAt = 0;
  let watchdogTimer = null;
  let configLoaded = false;
  let hardwareBlocked = false;
  let waitingForMic = false;
  let startupPrepareTimer = null;

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
            // Prefer the packaged, known-good environment over a partially
            // provisioned data venv that has not written its ready marker.
            path.join(APP_ROOT, "tools", "speech", "venv", "Scripts", "python.exe"),
            path.join(APP_ROOT, "tools", "speech", ".venv", "Scripts", "python.exe"),
            venvPython,
            "python",
          ]
        : [
            ...(venvReady() ? [venvPython] : []),
            process.env.TWIX_PYTHON || "",
            path.join(APP_ROOT, "tools", "speech", "venv", "bin", "python"),
            path.join(APP_ROOT, "tools", "speech", ".venv", "bin", "python"),
            venvPython,
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

  function appendLogLine(line, source = "engine") {
    const text = String(line || "");
    if (!text.trim()) return;
    logTail.push((source === "overlay" ? "[Overlay] " : "") + text.slice(0, 300));
    if (logTail.length > 160) logTail = logTail.slice(-160);
    if (source === "overlay") return;
    const progressMatch = text.match(/\[PROGRESS\]\s+(\d+)/);
    if (progressMatch) progress = Math.max(0, Math.min(100, Number(progressMatch[1])));
    if (text.includes("[PTT] Recording")) {
      active = true;
      finishing = false;
      requested = false;
      progress = 0;
      lastWarning = "";
    }
    if (text.includes("[PTT] Final transcript queued")) {
      active = false;
      finishing = true;
      progress = 0;
    }
    if (text.includes("[DONE]")) {
      doneAt = Date.now();
      active = false;
      finishing = false;
      progress = 100;
    }
    if (text.includes("[MIC] Waiting") || text.includes("[MIC] Still waiting")) {
      waitingForMic = true;
    }
    if (text.includes("[READY]")) {
      ready = true;
      starting = false;
      waitingForMic = false;
      lastError = "";
      lastWarning = "";
      lastReadyAt = Date.now();
      engineRestarts = 0;
      hardwareBlocked = false;
    }
    if (text.includes("[AUDIO]")) {
      const hold = text.match(/hold=(\d+)ms/);
      const captured = text.match(/captured=(\d+)ms/);
      const peak = text.match(/peak=(\d+)/);
      lastAudio = {
        holdMs: hold ? Number(hold[1]) : 0,
        capturedMs: captured ? Number(captured[1]) : 0,
        peak: peak ? Number(peak[1]) : 0,
        at: Date.now(),
      };
    }
    if (text.includes("[ASR]")) {
      lastTranscript = text.replace(/^\[ASR\]\s*/, "").slice(0, 500);
      if (/no speech detected/i.test(lastTranscript)) {
        // A quick tap is not an error. Only warn when the user actually held
        // the key long enough for speech to be expected.
        const audible =
          lastAudio && lastAudio.capturedMs >= 700 && lastAudio.holdMs >= 700;
        lastWarning = audible
          ? "No speech was detected in that clip. Check the selected microphone and speak a little closer."
          : "";
      }
    }
    if (text.includes("[WARN]")) {
      const warning = text.replace(/^\[WARN\]\s*/, "").slice(0, 240);
      if (
        /microphone|no audio|silence|speech/i.test(warning) &&
        !/Input settings check failed/i.test(warning)
      ) {
        lastWarning = warning;
      }
    }
    if (text.includes("[ERROR]")) lastError = text.replace(/^\[ERROR\]\s*/, "").slice(0, 240);
  }

  function makeLineReader(source = "engine") {
    let buffer = "";
    return (chunk) => {
      buffer += String(chunk || "");
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() ?? "";
      for (const line of lines) appendLogLine(line, source);
      if (buffer.length > 8000) {
        appendLogLine(buffer, source);
        buffer = "";
      }
    };
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
      starting: Boolean(starting || (child && !ready)),
      waitingForMic,
      requested,
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
      overlayRunning: Boolean(overlayChild),
      overlayPid: overlayChild?.pid || 0,
      overlayRestarts: overlayFailures,
      overlayError,
      engineRestarts,
      engineStartingForMs: child && !ready && engineLastStartAt ? Date.now() - engineLastStartAt : 0,
      lastReadyAt,
      lastAudio,
      lastTranscript,
      error: lastError,
      warning: lastWarning,
      log: logTail.slice(-30),
    };
  }

  function killTree(proc) {
    if (!proc || !proc.pid) return;
    try {
      if (process.platform === "win32") {
        // Windows venv python.exe is a launcher: killing only the launcher
        // leaves the real interpreter (and the microphone) running. Kill the
        // whole tree so single-instance mutexes are released immediately.
        spawnSync("taskkill", ["/PID", String(proc.pid), "/T", "/F"], {
          windowsHide: true,
          timeout: 8000,
        });
      } else {
        proc.kill("SIGTERM");
      }
    } catch {}
  }

  function stopEngine() {
    if (idleTimer) {
      clearTimeout(idleTimer);
      idleTimer = null;
    }
    if (engineRetryTimer) {
      clearTimeout(engineRetryTimer);
      engineRetryTimer = null;
    }
    killTree(child);
    child = null;
    ready = false;
    starting = false;
    active = false;
    finishing = false;
    requested = false;
    waitingForMic = false;
    try {
      fsSync.writeFileSync(controlFile, "0");
    } catch {}
  }

  function stopAll() {
    stopEngine();
    killTree(overlayChild);
    overlayChild = null;
    overlayError = "";
    if (overlayRestartTimer) {
      clearTimeout(overlayRestartTimer);
      overlayRestartTimer = null;
    }
    killStaleOverlays();
  }

  function shutdown() {
    shuttingDown = true;
    if (watchdogTimer) {
      clearInterval(watchdogTimer);
      watchdogTimer = null;
    }
    if (startupPrepareTimer) {
      clearTimeout(startupPrepareTimer);
      startupPrepareTimer = null;
    }
    stopAll();
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
          `$needle = '${escaped}'; Get-CimInstance Win32_Process | Where-Object { $_.Name -like 'python*.exe' -and $_.CommandLine -and $_.CommandLine.IndexOf($needle, [StringComparison]::OrdinalIgnoreCase) -ge 0 } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }`,
        ],
        { windowsHide: true, timeout: 8000 },
      );
    } catch {}
  }

  function killStaleOverlays() {
    if (process.platform !== "win32") return;
    const script = resolveScript();
    if (!script) return;
    const overlayScript = path.join(path.dirname(script), "mic_overlay.py");
    try {
      const escaped = overlayScript.replace(/'/g, "''");
      spawnSync(
        "powershell",
        [
          "-NoProfile",
          "-Command",
          `$needle = '${escaped}'; Get-CimInstance Win32_Process | Where-Object { $_.Name -like 'python*.exe' -and $_.CommandLine -and $_.CommandLine.IndexOf($needle, [StringComparison]::OrdinalIgnoreCase) -ge 0 } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }`,
        ],
        { windowsHide: true, timeout: 8000 },
      );
    } catch {}
  }

  function scheduleOverlayRestart(reason, delay = 2000, force = false) {
    if (shuttingDown || disabled || process.platform !== "win32") return;
    if (overlayRestartTimer) {
      if (!force) return;
      clearTimeout(overlayRestartTimer);
      overlayRestartTimer = null;
    }
    overlayFailures += 1;
    const wait = Math.min(30000, delay * Math.pow(2, Math.min(4, Math.max(0, overlayFailures - 1))));
    overlayRestartTimer = setTimeout(() => {
      overlayRestartTimer = null;
      if (!shuttingDown && !disabled && !overlayChild) ensureOverlay();
    }, wait);
  }

  function ensureOverlay() {
    // The bundled Tk overlay uses Win32 click-through/transparency APIs. On
    // Linux the microphone still works through the applet and the control
    // file; avoid opening a non-click-through stray window.
    if (process.platform !== "win32") return;
    if (overlayChild || shuttingDown) return;
    const python = resolvePython();
    const script = resolveScript();
    if (!python || !script) return;
    const overlayScript = path.join(path.dirname(script), "mic_overlay.py");
    if (!fsSync.existsSync(overlayScript)) return;
    if (Date.now() - overlayLastStartAt < 250) return;
    overlayLastStartAt = Date.now();
    try {
      const proc = spawn(python, [overlayScript, "--port", String(process.env.PORT || 4317)], {
        cwd: path.dirname(overlayScript),
        windowsHide: true,
        env: {
          ...process.env,
          PYTHONUNBUFFERED: "1",
          PYTHONIOENCODING: "utf-8",
        },
        stdio: ["ignore", "pipe", "pipe"],
      });
      overlayChild = proc;
      const readOut = makeLineReader("overlay");
      const readErr = makeLineReader("overlay");
      proc.stdout?.on("data", readOut);
      proc.stderr?.on("data", readErr);
      proc.on("error", (error) => {
        overlayError = "Microphone overlay error: " + error.message;
        appendLogLine(overlayError, "overlay");
      });
      proc.on("exit", (code, signal) => {
        if (overlayChild === proc) overlayChild = null;
        if (shuttingDown || disabled) return;
        const mutexCollision = logTail.some((line) =>
          line.includes("Another Creator Studio speech process"),
        );
        if (mutexCollision) {
          // A stale overlay from a previous backend owns the mutex. Kill the
          // orphan and retry promptly. This is the only premeditated kill: a
          // healthy overlay is never killed just before spawning a new one.
          killStaleOverlays();
          overlayError = "Replaced an old microphone overlay.";
          scheduleOverlayRestart(overlayError, 400, true);
          return;
        }
        if (code !== 0) {
          overlayError = `Microphone overlay exited with ${code ?? signal}`;
          appendLogLine(overlayError, "overlay");
        } else {
          overlayError = "Microphone overlay closed.";
        }
        scheduleOverlayRestart(overlayError);
      });
      overlayError = "";
      appendLogLine(`started pid=${proc.pid}`, "overlay");
    } catch (error) {
      overlayChild = null;
      overlayError = "Could not start the microphone overlay: " + error.message;
      appendLogLine(overlayError, "overlay");
      scheduleOverlayRestart(overlayError);
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
    configLoaded = true;
    if (!enabled) {
      stopAll();
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
    ensureOverlay();
    if (hardwareBlocked) {
      lastError =
        lastError ||
        "No usable microphone found. Connect or enable a microphone in Windows Sound settings; the engine will start automatically when a device appears.";
      return status();
    }
    if (child && configKey !== currentConfigKey) {
      // Device or model changed in Settings: restart with the new values.
      stopEngine();
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
    lastWarning = "";
    lastTranscript = "";
    lastAudio = null;
    ready = false;
    active = false;
    finishing = false;
    requested = false;
    waitingForMic = false;
    doneAt = 0;
    logTail = [];
    killStaleEngines();
    // Give Windows a moment to release the single-instance mutex after a
    // killed interpreter. Without this, the new engine can exit silently
    // while the old one is still shutting down.
    await new Promise((resolve) => setTimeout(resolve, 250));
    try {
      await writeControl("0");
    } catch (error) {
      lastError = "Could not create the push-to-talk control file: " + error.message;
      starting = false;
      return status();
    }
    try {
      const proc = spawn(python, [script, "--control", controlFile, "--hotkey", "right ctrl", "--input-device", inputDevice, "--model", model, "--device", device, "--type-delay", String(typeDelay)], {
        cwd: path.dirname(script),
        windowsHide: true,
        env: {
          ...process.env,
          PYTHONUNBUFFERED: "1",
          PYTHONIOENCODING: "utf-8",
          TWIX_MODEL: model,
          TWIX_DEVICE: device,
        },
        stdio: ["ignore", "pipe", "pipe"],
      });
      child = proc;
      const readOut = makeLineReader();
      const readErr = makeLineReader();
      proc.stdout?.on("data", readOut);
      proc.stderr?.on("data", readErr);
      proc.on("error", (error) => {
        lastError = "Speech engine error: " + error.message;
        ready = false;
      });
      proc.on("exit", (code, signal) => {
        if (child === proc) child = null;
        ready = false;
        starting = false;
        active = false;
        finishing = false;
        requested = false;
        waitingForMic = false;
        if (shuttingDown) return;
        const micFailure = logTail.some((line) =>
          /Could not open (the|any) microphone/i.test(line),
        );
        if (micFailure) {
          const micLine = [...logTail].reverse().find((line) => /Could not open (the|any) microphone/i.test(line));
          lastError = (micLine || "No usable microphone was found.").replace(/^\[ERROR\]\s*/, "");
          hardwareBlocked = true;
          appendLogLine("Engine paused until a microphone is connected and Apply & restart is pressed.", "overlay");
          return;
        }
        const mutexCollision = logTail.some((line) =>
          line.includes("Another Creator Studio speech process"),
        );
        if (mutexCollision) {
          killStaleEngines();
          lastError = "Speech engine restarted after an old instance released the microphone.";
          scheduleEngineRestart(lastError, 600, true);
        } else if (code) {
          if (!lastError) {
            lastError = "Speech engine exited with code " + code + (signal ? " (" + signal + ")" : "");
          }
          scheduleEngineRestart(lastError, 2000);
        } else if (!disabled) {
          scheduleEngineRestart("speech engine exited", 1500);
        }
      });
      engineLastStartAt = Date.now();
    } catch (error) {
      lastError = "Could not start the speech engine: " + error.message;
      child = null;
      starting = false;
      return status();
    }
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

  function scheduleEngineRestart(reason, delay = 1500, force = false) {
    if (shuttingDown || disabled) return;
    if (engineRetryTimer) {
      if (!force) return;
      clearTimeout(engineRetryTimer);
      engineRetryTimer = null;
    }
    engineRestarts += 1;
    if (engineRestarts > 12) {
      lastError = "The speech engine keeps stopping. " + reason;
      return;
    }
    const wait = Math.min(60000, Math.max(250, delay * Math.pow(2, Math.min(5, engineRestarts - 1))));
    engineRetryTimer = setTimeout(() => {
      engineRetryTimer = null;
      if (!shuttingDown && !disabled && !child) {
        void prepare().catch(() => null);
      }
    }, wait);
  }

  function startWatchdog() {
    if (watchdogTimer) return;
    watchdogTimer = setInterval(() => {
      if (shuttingDown || disabled || installing || !configLoaded || hardwareBlocked) return;
      if (child && !ready && !waitingForMic && engineLastStartAt && Date.now() - engineLastStartAt > 60000) {
        lastError = "The speech engine did not become ready. Restarting it.";
        appendLogLine(lastError);
        stopEngine();
        scheduleEngineRestart(lastError, 1000, true);
        return;
      }
      if (!child && runtimeAvailable() && !starting && !engineRetryTimer) {
        void prepare().catch(() => null);
      }
      if (!overlayChild && !overlayRestartTimer && runtimeAvailable()) {
        ensureOverlay();
      }
    }, 15000);
    watchdogTimer.unref?.();
  }
  startWatchdog();

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
    requested = true;
    // A user-initiated start is also a retry. If the engine was paused because
    // no microphone was connected at boot, allow the newly connected device to
    // be picked up without forcing the user through Settings.
    if (hardwareBlocked) {
      hardwareBlocked = false;
      lastError = "";
    }
    if (installing) {
      requested = false;
      return {
        ...status(),
        ok: false,
        error: `The speech engine is installing (${installProgress}%). Try again when it finishes.`,
      };
    }
    const prepared = await prepare();
    if (disabled) {
      requested = false;
      return { ...prepared, ok: false, error: "The microphone is disabled in Settings." };
    }
    if (!prepared.running) {
      requested = false;
      return {
        ...prepared,
        ok: false,
        error: prepared.error || "The speech engine is not running. Check Settings > Microphone.",
      };
    }
    if (!ready) await waitForReady(15000);
    if (!ready) {
      requested = false;
      const engineError = waitingForMic
        ? lastWarning || "Waiting for a microphone. Connect or enable one in Windows Sound settings, then try again."
        : prepared.error ||
          lastError ||
          [...logTail].reverse().find((line) => line.includes("[ERROR]"))?.replace(/^\[ERROR\]\s*/, "") ||
          "Speech engine is still loading the model. Hold again in a moment.";
      return {
        ...prepared,
        ok: false,
        error: engineError,
      };
    }
    try {
      await writeControl("1");
      active = true;
      requested = false;
      if (idleTimer) clearTimeout(idleTimer);
      idleTimer = setTimeout(() => {
        void stop().catch(() => {});
      }, 90000);
    } catch (error) {
      requested = false;
      lastError = "Could not open the microphone: " + error.message;
      return { ...status(), ok: false, error: lastError };
    }
    return status();
  }

  async function stop() {
    requested = false;
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
    requested = false;
    hardwareBlocked = false;
    await stop().catch(() => {});
    stopEngine();
    killStaleEngines();
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
        timeout: 30000,
        windowsHide: true,
        env: {
          ...process.env,
          PYTHONUNBUFFERED: "1",
          PYTHONIOENCODING: "utf-8",
        },
      });
      const output = String(result.stdout || "") + "\n" + String(result.stderr || "");
      const line = output
        .split(/\r?\n/)
        .find((entry) => entry.startsWith("DEVICES_JSON="));
      if (!line) {
        return {
          ok: false,
          error: String(result.stderr || result.stdout || "Could not list microphones.").slice(0, 400),
          devices: [],
        };
      }
      const devices = JSON.parse(line.slice("DEVICES_JSON=".length));
      if (!Array.isArray(devices) || !devices.length) {
        return {
          ok: false,
          error: "No microphone was found. Connect or enable an input device in Windows Sound settings.",
          devices: [],
        };
      }
      return { ok: true, devices };
    } catch (error) {
      return { ok: false, error: error.message, devices: [] };
    }
  }

  // A backend restart must not leave dictation dead until the user opens
  // Settings. Read the saved config and warm the engine/overlay automatically.
  startupPrepareTimer = setTimeout(() => {
    startupPrepareTimer = null;
    if (!shuttingDown) void prepare().catch(() => null);
  }, 2500);
  startupPrepareTimer.unref?.();

  return { prepare, start, stop, restart, status, listDevices };
}
