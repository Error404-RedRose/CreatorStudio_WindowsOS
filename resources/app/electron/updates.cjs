const { compareVersions } = require("./version.cjs");
const { spawnSync } = require("node:child_process");
const os = require("node:os");
const path = require("node:path");

const UPDATE_REPOS = {
  win32: "Error404-RedRose/CreatorStudio_WindowsOS",
  linux: "Error404-RedRose/CreatorStudio_LinuxOS",
};
const UPDATE_BRANCH = "main";
const UPDATE_CHANNEL = process.platform === "linux" ? "linux" : "windows";
const UPDATE_REPO = UPDATE_REPOS[process.platform] || UPDATE_REPOS.win32;
const UPDATE_REPO_URL = `https://github.com/${UPDATE_REPO}`;
const UPDATE_RELEASES_URL = `${UPDATE_REPO_URL}/releases`;
const UPDATE_PACKAGE_URL = `https://raw.githubusercontent.com/${UPDATE_REPO}/${UPDATE_BRANCH}/resources/app/package.json`;
const UPDATE_PACKAGE_API_URL = `https://api.github.com/repos/${UPDATE_REPO}/contents/resources/app/package.json?ref=${UPDATE_BRANCH}`;
const UPDATE_EXE_NAME = process.platform === "win32" ? "Creator Studio.exe" : "creator-studio";
const CACHE_MS = 60 * 1000;

function currentMode(app) {
  if (process.env.PORTABLE_EXECUTABLE_DIR) return "portable";
  if (process.env.TWIX_DEV === "1" || !app.isPackaged) return "dev";
  return "packaged";
}

function registerUpdateHandlers({ app, ipcMain, path, fs, spawn, mainLog }) {
  let cache = null;
  let cacheAt = 0;

  const linuxStateDir =
    process.env.XDG_STATE_HOME || path.join(os.homedir(), ".local", "state");
  const linuxUpdateStatusFile = path.join(linuxStateDir, "creator-studio", "update-status.json");

  function readLinuxUpdateStatus() {
    if (process.platform !== "linux") return null;
    try {
      const status = JSON.parse(fs.readFileSync(linuxUpdateStatusFile, "utf8"));
      return status && typeof status === "object" ? status : null;
    } catch {
      return null;
    }
  }

  function lastUpdateError() {
    const status = readLinuxUpdateStatus();
    if (!status || status.status !== "failed") return null;
    return {
      message: String(status.message || "The last update attempt failed.").slice(0, 800),
      at: String(status.at || ""),
      logPath: String(status.logPath || ""),
    };
  }

  function linuxUpdateLaunchFiles() {
    return {
      logFile: path.join(app.getPath("userData"), "data", "logs", "linux-update-launch.log"),
      statusFile: linuxUpdateStatusFile,
    };
  }

  function linuxSystemdRun() {
    const candidates = [
      "systemd-run",
      "/usr/bin/systemd-run",
      "/run/current-system/sw/bin/systemd-run",
      "/usr/local/bin/systemd-run",
    ];
    for (const candidate of candidates) {
      try {
        const result = spawnSync(candidate, ["--version"], {
          encoding: "utf8",
          timeout: 4000,
          windowsHide: true,
        });
        if (result.status === 0) return candidate;
      } catch {}
    }
    return "";
  }

  function linuxServiceEnvironment() {
    const keys = [
      "HOME",
      "USER",
      "LOGNAME",
      "PATH",
      "DISPLAY",
      "WAYLAND_DISPLAY",
      "XAUTHORITY",
      "XDG_RUNTIME_DIR",
      "DBUS_SESSION_BUS_ADDRESS",
      "XDG_SESSION_TYPE",
      "XDG_CURRENT_DESKTOP",
      "XDG_STATE_HOME",
      "XDG_CONFIG_HOME",
      "XDG_DATA_HOME",
      "XDG_CACHE_HOME",
      "TMPDIR",
      "LANG",
      "LC_ALL",
    ];
    const args = [];
    for (const key of keys) {
      const value = process.env[key];
      if (value) args.push(`--setenv=${key}=${value}`);
    }
    args.push("--setenv=ELECTRON_RUN_AS_NODE=1");
    return args;
  }

  function linuxGuiEnvironment() {
    const keys = [
      "HOME",
      "USER",
      "LOGNAME",
      "PATH",
      "DISPLAY",
      "WAYLAND_DISPLAY",
      "XAUTHORITY",
      "XDG_RUNTIME_DIR",
      "DBUS_SESSION_BUS_ADDRESS",
      "XDG_SESSION_TYPE",
      "XDG_CURRENT_DESKTOP",
      "XDG_STATE_HOME",
      "XDG_CONFIG_HOME",
      "XDG_DATA_HOME",
      "XDG_CACHE_HOME",
      "TMPDIR",
      "LANG",
      "LC_ALL",
    ];
    const args = [];
    for (const key of keys) {
      const value = process.env[key];
      if (value) args.push(`--setenv=${key}=${value}`);
    }
    return args;
  }

  function resolveLinuxCommand(command) {
    try {
      const result = spawnSync("sh", ["-lc", `command -v ${command}`], {
        encoding: "utf8",
        timeout: 4000,
        windowsHide: true,
      });
      if (result.status === 0) {
        const path = String(result.stdout || "").trim().split(/\r?\n/)[0];
        if (path) return path;
      }
    } catch {}
    return "";
  }

  function linuxTerminalCandidates() {
    return [
      { command: "xdg-terminal-exec", args: [] },
      { command: "x-terminal-emulator", args: ["-e"] },
      { command: "sensible-terminal", args: ["-e"] },
      { command: "ptyxis", args: ["--"] },
      { command: "kgx", args: ["--"] },
      { command: "gnome-terminal", args: ["--"] },
      { command: "konsole", args: ["-e"] },
      { command: "xfce4-terminal", args: ["--disable-server", "-x"] },
      { command: "mate-terminal", args: ["--"] },
      { command: "tilix", args: ["-e"] },
      { command: "terminator", args: ["-x"] },
      { command: "qterminal", args: ["-e"] },
      { command: "lxterminal", args: ["-e"] },
      { command: "sakura", args: ["-x"] },
      { command: "terminology", args: ["-e"] },
      { command: "kitty", args: [] },
      { command: "alacritty", args: ["-e"] },
      { command: "wezterm", args: ["start", "--"] },
      { command: "ghostty", args: ["-e"] },
      { command: "foot", args: [] },
      { command: "st", args: ["-e"] },
      { command: "cosmic-term", args: ["-e"] },
      { command: "rio", args: ["-e"] },
      { command: "xterm", args: ["-e"] },
      { command: "urxvt", args: ["-e"] },
    ];
  }

  /**
   * Open a visible terminal for the update. The script inside the terminal
   * waits for this app to exit, runs the official one-shot curl installer,
   * verifies the new .run package, and relaunches Creator Studio.
   *
   * systemd-run keeps the terminal outside Creator Studio's transient desktop
   * scope, so the update window survives the app closing. If systemd-run is
   * unavailable, a detached terminal is used.
   */
  function launchLinuxUpdateTerminal(scriptPath, scriptArgs) {
    const files = linuxUpdateLaunchFiles();
    const systemdRun = linuxSystemdRun();
    for (const candidate of linuxTerminalCandidates()) {
      const command = resolveLinuxCommand(candidate.command);
      if (!command) continue;
      const terminalArgs = [...candidate.args, "bash", scriptPath, ...scriptArgs, "--log-file", files.logFile];
      if (systemdRun) {
        const unit = `creator-studio-update-${process.pid}-${Date.now()}`;
        const args = [
          "--user",
          "--no-block",
          "--collect",
          `--unit=${unit}`,
          "--description=Creator Studio update",
          ...linuxGuiEnvironment(),
          command,
          ...terminalArgs,
        ];
        const result = spawnSync(systemdRun, args, {
          encoding: "utf8",
          timeout: 15000,
          windowsHide: true,
        });
        if (result.status === 0) {
          return {
            launched: true,
            method: `terminal:${candidate.command}`,
            unit,
            detail: String(result.stdout || "").trim(),
            ...files,
          };
        }
        mainLog("warning", "updates", "terminal systemd launch failed; trying a detached terminal", {
          terminal: candidate.command,
          status: result.status,
          error: result.error?.message || "",
          stderr: String(result.stderr || "").slice(-1200),
        });
      }

      const child = spawn(command, terminalArgs, {
        cwd: app.getPath("temp"),
        env: { ...process.env },
        detached: true,
        stdio: "ignore",
      });
      child.unref();
      if (child.pid) {
        return {
          launched: true,
          method: `terminal:${candidate.command}:detached`,
          pid: child.pid,
          ...files,
        };
      }
    }
    return {
      launched: false,
      method: "none",
      error: "No graphical terminal emulator was found (tried gnome-terminal, kgx, ptyxis, konsole, xfce4-terminal, kitty, alacritty, foot, xterm and others).",
      ...files,
    };
  }

  /**
   * Run the Linux updater outside this application's systemd cgroup. Desktop
   * launchers on Arch and NixOS commonly put Creator Studio in a transient
   * scope, and a normal detached child is killed when that scope stops. A
   * transient user service survives the app exit and can finish the download
   * and folder swap.
   */
  function launchLinuxUpdateHelper(helperSource, helperArgs) {
    const files = linuxUpdateLaunchFiles();
    const systemdRun = linuxSystemdRun();
    if (systemdRun) {
      const unit = `creator-studio-update-${process.pid}-${Date.now()}`;
      const args = [
        "--user",
        "--no-block",
        "--collect",
        `--unit=${unit}`,
        "--description=Creator Studio update",
        ...linuxServiceEnvironment(),
        process.execPath,
        ...helperArgs,
      ];
      const result = spawnSync(systemdRun, args, {
        encoding: "utf8",
        timeout: 15000,
        windowsHide: true,
      });
      if (result.status === 0) {
        return {
          launched: true,
          method: "systemd-run",
          unit,
          detail: String(result.stdout || "").trim(),
          ...files,
        };
      }
      mainLog("warning", "updates", "systemd update launcher failed; using detached fallback", {
        status: result.status,
        error: result.error?.message || "",
        stderr: String(result.stderr || "").slice(-1200),
        stdout: String(result.stdout || "").slice(-400),
      });
    }

    let logFd = null;
    try {
      fs.mkdirSync(path.dirname(files.logFile), { recursive: true });
      logFd = fs.openSync(files.logFile, "a");
    } catch {}
    const child = spawn(process.execPath, helperArgs, {
      cwd: app.getPath("temp"),
      env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" },
      detached: true,
      stdio: logFd ? ["ignore", logFd, logFd] : "ignore",
    });
    child.unref();
    if (logFd) {
      try {
        fs.closeSync(logFd);
      } catch {}
    }
    return {
      launched: Boolean(child.pid),
      method: "detached",
      pid: child.pid || null,
      ...files,
    };
  }

  function parseRemoteVersion(payload) {
    const version = String(payload?.version || "").trim();
    if (!/^\d+\.\d+\.\d+/.test(version)) {
      throw new Error("The published version file is not valid.");
    }
    return version;
  }

  async function fetchRemoteVersion() {
    let lastError = null;

    // Read package.json through the GitHub Contents API first. Unlike
    // raw.githubusercontent.com, this is tied to the current commit and does
    // not serve a cached copy of the previous release after a push.
    try {
      const response = await fetch(`${UPDATE_PACKAGE_API_URL}&t=${Date.now()}`, {
        cache: "no-store",
        signal: AbortSignal.timeout(12000),
        headers: {
          Accept: "application/vnd.github.raw+json",
          "User-Agent": "Creator-Studio-Updater",
          "X-GitHub-Api-Version": "2022-11-28",
        },
      });
      if (response.ok) {
        return parseRemoteVersion(JSON.parse(await response.text()));
      }
      lastError = new Error(`GitHub returned HTTP ${response.status}.`);
    } catch (error) {
      lastError = error;
    }

    // Fallback for API rate limits or a temporary Contents API outage.
    try {
      const response = await fetch(`${UPDATE_PACKAGE_URL}?t=${Date.now()}`, {
        cache: "no-store",
        signal: AbortSignal.timeout(12000),
        headers: {
          Accept: "application/json",
          "User-Agent": "Creator-Studio-Updater",
        },
      });
      if (!response.ok) {
        throw new Error(`GitHub returned HTTP ${response.status}.`);
      }
      return parseRemoteVersion(await response.json());
    } catch (error) {
      throw lastError || error;
    }
  }

  async function checkForUpdates(force = false) {
    const currentVersion = app.getVersion();
    const mode = currentMode(app);

    if (mode !== "packaged") {
      return {
        mode,
        platform: process.platform,
        channel: UPDATE_CHANNEL,
        currentVersion,
        updateAvailable: false,
        updateDisabled: true,
        repoUrl: UPDATE_REPO_URL,
        releasesUrl: UPDATE_RELEASES_URL,
        reason:
          mode === "dev"
            ? "Updates are disabled when running the development build."
            : "The portable build cannot update itself. Use the unpacked build.",
      };
    }

    if (!force && cache && Date.now() - cacheAt < CACHE_MS) {
      return cache;
    }

    try {
      const remoteVersion = await fetchRemoteVersion();
      const result = {
        mode,
        platform: process.platform,
        channel: UPDATE_CHANNEL,
        currentVersion,
        remoteVersion,
        updateAvailable: compareVersions(remoteVersion, currentVersion) > 0,
        repoUrl: UPDATE_REPO_URL,
        releasesUrl: UPDATE_RELEASES_URL,
        checkedAt: new Date().toISOString(),
        lastUpdateError: lastUpdateError(),
      };
      cache = result;
      cacheAt = Date.now();
      mainLog("info", "updates", "update check complete", {
        currentVersion,
        remoteVersion,
        updateAvailable: result.updateAvailable,
        channel: UPDATE_CHANNEL,
        repo: UPDATE_REPO,
      });
      return result;
    } catch (error) {
      const message = String(error?.message || error);
      mainLog("warning", "updates", "update check failed", { message });
      return {
        mode,
        platform: process.platform,
        channel: UPDATE_CHANNEL,
        currentVersion,
        updateAvailable: false,
        repoUrl: UPDATE_REPO_URL,
        releasesUrl: UPDATE_RELEASES_URL,
        error: message,
        checkedAt: new Date().toISOString(),
        lastUpdateError: lastUpdateError(),
      };
    }
  }

  async function beginUpdate() {
    const mode = currentMode(app);
    if (mode !== "packaged") {
      return {
        ok: false,
        error:
          mode === "dev"
            ? "Updates are disabled when running the development build."
            : "The portable build cannot update itself. Use the unpacked build.",
      };
    }

    try {
      const status = await checkForUpdates(true);
      if (status.error) {
        return { ok: false, error: status.error };
      }
      if (!status.updateAvailable) {
        return { ok: false, error: "Creator Studio is already up to date." };
      }

      let exePath = app.getPath("exe");
      try {
        exePath = fs.realpathSync(exePath);
      } catch {}
      let installDir = path.dirname(exePath);
      if (process.platform === "linux") {
        // If the app was launched through a system Electron or a NixOS wrapper,
        // app.getPath("exe") can point outside the Creator Studio folder. The
        // packaged resources/app layout always identifies the real install
        // folder, so prefer it when it contains the Creator Studio binary.
        try {
          const packagedAppDir = path.dirname(__dirname); // <install>/resources/app
          const packagedInstallDir = path.dirname(path.dirname(packagedAppDir)); // <install>
          const packagedExe = path.join(packagedInstallDir, UPDATE_EXE_NAME);
          if (
            fs.existsSync(packagedExe) &&
            fs.existsSync(path.join(packagedAppDir, "package.json"))
          ) {
            installDir = packagedInstallDir;
            exePath = packagedExe;
          }
        } catch {}
      }
      if (!fs.existsSync(installDir)) {
        return { ok: false, error: "The application folder could not be found." };
      }
      if (!fs.existsSync(exePath)) {
        return { ok: false, error: "The running executable could not be found." };
      }
      try {
        fs.accessSync(installDir, fs.constants.W_OK);
      } catch {
        const hint =
          process.platform === "linux"
            ? " Creator Studio is running from a read-only location (common on NixOS or a system folder). Move the whole Creator Studio folder into your home directory, then use Update again."
            : " Move Creator Studio into a folder you can write to, then try again.";
        return { ok: false, error: `The application folder is not writable.${hint}` };
      }

      const helperSource =
        process.platform === "win32"
          ? path.join(__dirname, "update-helper.ps1")
          : path.join(__dirname, "update-helper.mjs");
      if (!fs.existsSync(helperSource)) {
        return { ok: false, error: "The update helper is missing from this build." };
      }

      let helper = helperSource;
      let launch = null;
      if (process.platform === "win32") {
        const tempRoot = fs.mkdtempSync(path.join(app.getPath("temp"), "creator-studio-update-"));
        helper = path.join(tempRoot, "update-helper.ps1");
        fs.copyFileSync(helperSource, helper);

        const launcher = path.join(tempRoot, "run-update.cmd");
        const lines = [
          "@echo off",
          "title Creator Studio Update",
          `cd /d "%TEMP%"`,
          `powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0update-helper.ps1" -InstallDir "${installDir}" -ExeName "${UPDATE_EXE_NAME}" -Repo "${UPDATE_REPO}" -Branch "${UPDATE_BRANCH}" -ParentPid ${process.pid} -ExpectedVersion "${status.remoteVersion}"`,
          "exit /b %ERRORLEVEL%",
          "",
        ];
        fs.writeFileSync(launcher, lines.join("\r\n"), "utf8");

        const child = spawn("cmd.exe", ["/c", "start", "", launcher], {
          cwd: app.getPath("temp"),
          detached: true,
          stdio: "ignore",
          windowsHide: false,
        });
        child.unref();
        if (!child.pid) {
          return { ok: false, error: "The update process could not be started." };
        }
        launch = { launched: true, method: "powershell", pid: child.pid };
      } else {
        const updateArgs = [
          "--install-dir",
          installDir,
          "--exe-name",
          UPDATE_EXE_NAME,
          "--repo",
          UPDATE_REPO,
          "--branch",
          UPDATE_BRANCH,
          "--parent-pid",
          String(process.pid),
          "--expected-version",
          String(status.remoteVersion || ""),
        ];
        // Prefer a visible terminal so the user can watch the official one-shot
        // curl installer. It survives this app closing through systemd-run.
        const terminalScript = path.join(__dirname, "linux-update-terminal.sh");
        if (fs.existsSync(terminalScript)) {
          launch = launchLinuxUpdateTerminal(terminalScript, updateArgs);
          if (!launch.launched) {
            mainLog("warning", "updates", "no visible terminal could be opened; using headless updater", {
              reason: launch.error || "",
            });
          }
        }
        if (!launch?.launched) {
          try {
            require.resolve("adm-zip");
          } catch {
            return { ok: false, error: "The Linux update dependency (adm-zip) is missing from this build." };
          }
          // Headless fallback for systems with no terminal emulator. On
          // systemd desktops it runs as a transient user service so the
          // desktop's application scope cannot kill it when Creator Studio exits.
          launch = launchLinuxUpdateHelper(helperSource, [helperSource, ...updateArgs]);
        }
        if (!launch.launched) {
          return {
            ok: false,
            error: `The Linux update process could not be started. Open ${launch.logFile || "~/.local/state/creator-studio/update.log"} for details.`,
          };
        }
      }

      mainLog("info", "updates", "update started", {
        platform: process.platform,
        currentVersion: status.currentVersion,
        remoteVersion: status.remoteVersion,
        installDir,
        helper,
        launch,
      });

      setTimeout(() => {
        try {
          app.quit();
        } catch {}
      }, 1500);

      return {
        ok: true,
        remoteVersion: status.remoteVersion,
        message:
          process.platform === "linux" && String(launch.method || "").startsWith("terminal:")
            ? `A terminal window is finishing the update to ${status.remoteVersion}. Creator Studio will reopen when it completes.`
            : `Updating Creator Studio to ${status.remoteVersion}...`,
      };
    } catch (error) {
      const message = String(error?.message || error);
      mainLog("error", "updates", "update failed to start", { message });
      return { ok: false, error: message };
    }
  }

  ipcMain.handle("updates:check", (_event, force) => checkForUpdates(Boolean(force)));
  ipcMain.handle("updates:apply", () => beginUpdate());

  mainLog("info", "updates", "update handlers ready", {
    repo: UPDATE_REPO,
    branch: UPDATE_BRANCH,
    mode: currentMode(app),
  });
}

module.exports = {
  registerUpdateHandlers,
  compareVersions,
  UPDATE_REPOS,
  UPDATE_REPO,
  UPDATE_CHANNEL,
  UPDATE_REPO_URL,
  UPDATE_RELEASES_URL,
  UPDATE_PACKAGE_URL,
  UPDATE_PACKAGE_API_URL,
  UPDATE_BRANCH,
  UPDATE_EXE_NAME,
};
