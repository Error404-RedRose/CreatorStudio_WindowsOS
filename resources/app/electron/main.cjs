const { app, BrowserWindow, ipcMain, shell, session, dialog, screen, clipboard } = require("electron");
const path = require("node:path");
const fs = require("node:fs");
const net = require("node:net");
const { spawn } = require("node:child_process");
const { registerUpdateHandlers } = require("./updates.cjs");

const isDev = process.env.TWIX_DEV === "1";
const appRoot = path.join(__dirname, "..");
const serverScript = path.join(appRoot, "server", "index.mjs");
const distDir = path.join(appRoot, "dist");

// The Linux build is an unpacked folder rather than an AppImage. Running with
// the Chromium sandbox disabled avoids requiring a root-owned setuid
// chrome-sandbox helper on every user machine, so the folder works identically
// after a clone, a ZIP extraction or an in-app update.
let softwareRendering = false;
if (process.platform === "linux") {
  app.commandLine.appendSwitch("no-sandbox");
  // Chromium's shared-memory allocator can wait forever on small containers
  // and some NixOS sandboxes. /tmp is always available for this user process.
  app.commandLine.appendSwitch("disable-dev-shm-usage");
  // NixOS puts the real GPU libraries in the Nix store and exposes the active
  // set through /run/opengl-driver. Without this path Chromium falls back to
  // SwiftShader, which makes the whole UI and 3D viewport extremely slow.
  const nixGpuLib = "/run/opengl-driver/lib";
  const nixGpuDri = "/run/opengl-driver/lib/dri";
  const nixEglVendors = "/run/opengl-driver/share/glvnd/egl_vendor.d";
  const hasNixGpu = (() => {
    try {
      return fs.existsSync(path.join(nixGpuLib, "libEGL.so.1"));
    } catch {
      return false;
    }
  })();
  if (hasNixGpu) {
    const prepend = (name, directory) => {
      try {
        if (!fs.existsSync(directory)) return;
        process.env[name] = [directory, process.env[name] || ""].filter(Boolean).join(":");
      } catch {}
    };
    prepend("LD_LIBRARY_PATH", nixGpuLib);
    if (fs.existsSync(nixGpuDri)) {
      process.env.LIBGL_DRIVERS_PATH = [nixGpuDri, process.env.LIBGL_DRIVERS_PATH || ""].filter(Boolean).join(":");
    }
    if (fs.existsSync(nixEglVendors)) process.env.__EGL_VENDOR_LIBRARY_DIRS = nixEglVendors;
    console.log(`[Creator Studio] NixOS GPU libraries found at ${nixGpuLib}; hardware rendering is available.`);
  }
  // NixOS and minimal distributions do not have an FHS libEGL.so.1. Chromium's
  // ANGLE backend otherwise dies before a window is painted. Use the bundled
  // SwiftShader software renderer only when no usable EGL library exists, or
  // when the user explicitly asks for software rendering.
  const eglCandidates = [
    path.join(nixGpuLib, "libEGL.so.1"),
    "/usr/lib/x86_64-linux-gnu/libEGL.so.1",
    "/usr/lib64/libEGL.so.1",
    "/usr/lib/libEGL.so.1",
    "/lib/x86_64-linux-gnu/libEGL.so.1",
    "/lib64/libEGL.so.1",
  ];
  const hasSystemEgl = eglCandidates.some((file) => {
    try {
      return fs.existsSync(file);
    } catch {
      return false;
    }
  });
  const disableGpu = process.env.CREATOR_STUDIO_DISABLE_GPU === "1";
  if (disableGpu) {
    app.commandLine.appendSwitch("disable-gpu");
    console.log("[Creator Studio] GPU acceleration disabled by CREATOR_STUDIO_DISABLE_GPU=1.");
  }
  // Wayland sessions without XWayland otherwise wait for an X server that is
  // not there. Let Chromium choose the active session when both are present.
  if (process.env.WAYLAND_DISPLAY && !process.env.DISPLAY) {
    app.commandLine.appendSwitch("ozone-platform", "wayland");
    console.log("[Creator Studio] Starting on the Wayland Ozone backend.");
  } else {
    app.commandLine.appendSwitch("ozone-platform-hint", "auto");
  }
  softwareRendering =
    disableGpu ||
    (process.env.CREATOR_STUDIO_GPU !== "1" &&
      (!hasSystemEgl || process.env.CREATOR_STUDIO_SOFTWARE_GL === "1"));
  process.env.TWIX_SOFTWARE_RENDERING = softwareRendering ? "1" : "0";
  if (softwareRendering && !disableGpu) {
    try {
      process.chdir(appRoot);
    } catch {}
    const vkIcd = path.join(appRoot, "vk_swiftshader_icd.json");
    if (fs.existsSync(vkIcd)) {
      // The bundled SwiftShader Vulkan ICD uses a relative library path. Give
      // the loader the absolute manifest so the GPU process can find it even
      // when launched from a desktop menu.
      process.env.VK_ICD_FILENAMES = vkIcd;
      process.env.VK_DRIVER_FILES = vkIcd;
    }
    app.commandLine.appendSwitch("use-gl", process.env.CREATOR_STUDIO_GL === "swiftshader" ? "swiftshader" : "angle");
    if (process.env.CREATOR_STUDIO_GL !== "swiftshader") {
      app.commandLine.appendSwitch("use-angle", "swiftshader");
    }
    app.commandLine.appendSwitch("enable-unsafe-swiftshader");
    app.commandLine.appendSwitch("disable-gpu-sandbox");
    app.commandLine.appendSwitch("ignore-gpu-blocklist");
    app.commandLine.appendSwitch("enable-webgl");
    console.log(
      "[Creator Studio] Starting with the bundled SwiftShader renderer because no usable system EGL library was found or software rendering was requested.",
    );
  } else if (disableGpu) {
    console.log("[Creator Studio] GPU acceleration is disabled; the interface is using the low-effects performance mode.");
  } else {
    console.log("[Creator Studio] GPU acceleration enabled with the system EGL/OpenGL driver.");
  }
}

app.setName("Creator Studio");
app.setAppUserModelId("com.twilightstudio.creatorstudio3d");
if (process.platform === "linux") {
  // Makes notifications and the window manager associate the process with the
  // installed desktop entry instead of the generic Electron app.
  try {
    app.setDesktopName("creator-studio.desktop");
  } catch {}
}

const isLinux = process.platform === "linux";

if (isLinux && !process.env.DISPLAY && !process.env.WAYLAND_DISPLAY) {
  console.error(
    "Creator Studio needs a graphical desktop session (X11 or Wayland). Launch it from your applications menu or a desktop terminal, not from SSH or a background service.",
  );
  app.exit(1);
}

let mainWindow = null;
let overlayWindow = null;
let overlayTimer = null;
let quitting = false;
let serverProc = null;
let serverPort = 4317;
let backendFailure = "";
let windowShownLogged = false;

const logDir = () => path.join(app.getPath("userData"), "data", "logs");
const logFile = () => path.join(logDir(), "electron-" + new Date().toISOString().slice(0, 10) + ".jsonl");
const mirrorLogs = process.platform !== "win32" || process.env.TWIX_LOG_STDOUT === "1";
function writeMainLog(entry) {
  try {
    fs.mkdirSync(logDir(), { recursive: true });
    const day = new Date().toISOString().slice(0, 10);
    fs.appendFileSync(path.join(logDir(), "electron-" + day + ".jsonl"), JSON.stringify(entry) + "\n", "utf8");
  } catch {}
}
function mainLog(level, source, message, data) {
  const entry = { ts: new Date().toISOString(), level, source, message, data };
  writeMainLog(entry);
  if (!mirrorLogs) return;
  const suffix = data && Object.keys(data).length ? " " + JSON.stringify(data) : "";
  const line = `[Creator Studio] ${entry.ts} ${String(level).toUpperCase()} ${source}: ${message}${suffix}`;
  if (level === "error" || level === "warning") console.error(line);
  else console.log(line);
}
process.on("uncaughtException", (error) => {
  mainLog("error", "electron", "uncaughtException", { message: error?.message, stack: error?.stack });
  console.error(error);
});
process.on("unhandledRejection", (error) => {
  mainLog("error", "electron", "unhandledRejection", { message: error?.message, stack: error?.stack });
  console.error(error);
});
ipcMain.on("app:log", (_event, entry) => writeMainLog(entry));

registerUpdateHandlers({ app, ipcMain, path, fs, spawn, mainLog });

function freePort() {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const port = probe.address().port;
      probe.close(() => resolve(port));
    });
  });
}

function killTree(proc) {
  if (!proc || !proc.pid) return;
  if (process.platform === "win32") {
    try {
      spawn("taskkill", ["/PID", String(proc.pid), "/T", "/F"], { windowsHide: true });
    } catch {}
  } else {
    try {
      proc.kill("SIGTERM");
    } catch {}
  }
}

async function waitForServer(url, timeoutMs = 60000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (backendFailure) return false;
    try {
      const response = await fetch(`${url}/api/health`, { signal: AbortSignal.timeout(1500) });
      if (response.ok) return true;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 350));
  }
  return false;
}

async function chooseServerPort() {
  try {
    return await freePort();
  } catch (error) {
    mainLog("warning", "electron", "free port probe failed; using 4317", { message: error?.message });
    return 4317;
  }
}

function dataDir() {
  // Global user preferences + references, shared by every studio version.
  return path.join(app.getPath("documents"), "3D Creator Studio");
}

function defaultProjectDir() {
  const shared = "E:\\CREATOR STUDIO";
  try {
    if (process.platform === "win32" && fs.existsSync("E:\\")) return shared;
  } catch {}
  return path.join(app.getPath("documents"), "3D Creator Studio Projects");
}

function startServer() {
  fs.mkdirSync(dataDir(), { recursive: true });
  backendFailure = "";
  mainLog("info", "electron", "starting backend", { serverScript, port: serverPort, dataDir: dataDir() });
  try {
    serverProc = spawn(process.execPath, [serverScript, "--serve-dist"], {
      cwd: appRoot,
      env: {
        ...process.env,
        ELECTRON_RUN_AS_NODE: "1",
        PORT: String(serverPort),
        TWIX_DATA_DIR: dataDir(),
        TWIX_DEFAULT_PROJECT_DIR: defaultProjectDir(),
        TWIX_DESKTOP: "1",
        TWIX_PACKAGED: isDev ? "0" : "1",
        TWIX_MODS_DIR: isDev
          ? path.join(appRoot, "mods")
          : process.env.PORTABLE_EXECUTABLE_FILE
            ? path.join(app.getPath("documents"), "3D Creator Studio", "mods")
            : path.join(path.dirname(process.execPath), "mods"),
        TWIX_UNINSTALL_ROOT:
          isDev || process.env.PORTABLE_EXECUTABLE_FILE ? "" : path.dirname(process.execPath),
        TWIX_UNINSTALL_EXE:
          isDev ? "" : process.env.PORTABLE_EXECUTABLE_FILE || process.execPath,
      },
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (error) {
    backendFailure = `The backend process could not be started: ${error?.message || error}`;
    mainLog("error", "electron", "backend spawn failed", { message: error?.message, stack: error?.stack });
    return;
  }
  mainLog("info", "electron", "backend spawned", { pid: serverProc.pid });
  serverProc.stdout?.on("data", (chunk) => {
    process.stdout.write(`[server] ${chunk}`);
    writeMainLog({ ts: new Date().toISOString(), level: "info", source: "backend.stdout", message: String(chunk).trim() });
  });
  serverProc.stderr?.on("data", (chunk) => {
    process.stderr.write(`[server] ${chunk}`);
    writeMainLog({ ts: new Date().toISOString(), level: "warning", source: "backend.stderr", message: String(chunk).trim() });
  });
  serverProc.on("error", (error) => {
    backendFailure = `The backend process failed: ${error?.message || error}`;
    mainLog("error", "electron", "backend process error", { message: error?.message, stack: error?.stack });
  });
  serverProc.on("exit", (code, signal) => {
    mainLog("warning", "electron", "backend exited", { code, signal });
    if (code && code !== 0 && !quitting) {
      backendFailure = `The local backend stopped with exit code ${code}${signal ? ` (${signal})` : ""}.`;
    } else if (!code && !quitting && !backendFailure) {
      backendFailure = "The local backend closed unexpectedly before the window finished loading.";
    }
    if (code && code !== 0 && mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("twix:server-exit", code);
    }
  });
}

async function createOverlayWindow() {
  // The Python overlay in tools/speech is the single overlay. Keep this
  // Electron variant behind an opt-in flag so two windows never stack.
  if (process.env.TWIX_ELECTRON_OVERLAY !== "1") return;
  if (overlayWindow && !overlayWindow.isDestroyed()) return;
  overlayWindow = new BrowserWindow({
    width: 430,
    height: 92,
    show: false,
    frame: false,
    transparent: true,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    focusable: false,
    hasShadow: false,
    alwaysOnTop: true,
    backgroundColor: "#00000000",
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: false },
  });
  overlayWindow.setAlwaysOnTop(true, "screen-saver");
  overlayWindow.setIgnoreMouseEvents(true, { forward: true });
  try {
    overlayWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  } catch {}
  try {
    await overlayWindow.loadFile(path.join(__dirname, "mic-overlay.html"), { query: { port: String(serverPort) } });
  } catch (error) {
    mainLog("warning", "electron", "mic overlay load failed", { message: error?.message });
    return;
  }
  overlayTimer = setInterval(async () => {
    if (!overlayWindow || overlayWindow.isDestroyed()) return;
    try {
      const response = await fetch("http://127.0.0.1:" + serverPort + "/api/speech/status", {
        signal: AbortSignal.timeout(1200),
      });
      const status = await response.json();
      const visible = Boolean(status.active || status.finishing);
      if (visible) {
        const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
        const area = display.workArea;
        overlayWindow.setBounds(
          { x: Math.round(area.x + (area.width - 430) / 2), y: Math.round(area.y + area.height - 92 - 26), width: 430, height: 92 },
          false,
        );
        if (!overlayWindow.isVisible()) overlayWindow.showInactive();
        overlayWindow.setAlwaysOnTop(true, "screen-saver");
      } else if (overlayWindow.isVisible()) {
        overlayWindow.hide();
      }
    } catch {}
  }, 300);
}

function showMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  try {
    if (mainWindow.isMinimized()) mainWindow.restore();
    if (isLinux) {
      // Some Linux window managers ignore or unmap a frameless window that is
      // maximized before it has been mapped. Show it first at a normal size;
      // the user can maximize it with the app's own title bar.
      const area = screen.getPrimaryDisplay().workArea;
      const width = Math.min(1400, Math.max(1024, Math.round((area.width || 1440) * 0.9)));
      const height = Math.min(900, Math.max(640, Math.round((area.height || 900) * 0.9)));
      mainWindow.setSize(width, height);
      mainWindow.center();
      mainWindow.show();
      mainWindow.focus();
      logWindowShown();
      return;
    }
    mainWindow.setResizable(false);
    const bounds = mainWindow.getBounds();
    const display = screen.getDisplayMatching(bounds);
    const area = display.workArea;
    mainWindow.setBounds({ x: area.x, y: area.y, width: area.width + 1, height: area.height + 1 }, false);
    mainWindow.show();
    mainWindow.focus();
    logWindowShown();
  } catch (error) {
    mainLog("warning", "electron", "show window failed", { message: error?.message });
  }
}

function logWindowShown() {
  if (windowShownLogged) return;
  windowShownLogged = true;
  mainLog("info", "electron", "window shown", { port: serverPort, backendFailure: backendFailure || null });
}

async function createWindow() {
  const display = screen.getPrimaryDisplay();
  const workArea = display.workArea;
  // Linux keeps the same two-header design as Windows, but the window is
  // resizable and maximizable so it behaves like a normal desktop application.
  // The branded title bar is rendered by the app, so it is always present even
  // on tiling window managers that draw no native decorations.
  const chromeOptions = isLinux
    ? {
        frame: false,
        thickFrame: false,
        hasShadow: false,
        resizable: true,
        maximizable: true,
        fullscreenable: true,
        autoHideMenuBar: true,
      }
    : {
        frame: false,
        thickFrame: false,
        hasShadow: false,
        titleBarStyle: "hidden",
        resizable: false,
        maximizable: false,
        fullscreenable: false,
      };
  mainWindow = new BrowserWindow({
    x: workArea.x,
    y: workArea.y,
    width: Math.max(1024, workArea.width),
    height: Math.max(640, workArea.height),
    minWidth: 1024,
    minHeight: 640,
    show: false,
    icon: path.join(appRoot, "build", process.platform === "win32" ? "icon.ico" : "icon.png"),
    backgroundColor: "#0b0a12",
    ...chromeOptions,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      spellcheck: false,
    },
  });

  mainWindow.setMenuBarVisibility(false);
  mainWindow.setTitle("Creator Studio");
  mainLog("info", "electron", "window created", { dev: isDev, platform: process.platform, target: isDev ? "http://localhost:5173" : `http://127.0.0.1:${serverPort}` });
  mainWindow.once("ready-to-show", showMainWindow);
  mainWindow.webContents.on("did-finish-load", () => {
    const loadedUrl = mainWindow?.webContents.getURL() || "";
    mainLog("info", "electron", "page finished loading", { url: loadedUrl.startsWith("data:") ? "data: startup page" : loadedUrl });
    showMainWindow();
  });
  mainWindow.webContents.on("did-fail-load", (_event, code, description, url) => {
    mainLog("warning", "electron", "page load failed", { code, description, url });
    showMainWindow();
  });
  // Never leave a running process with no visible window if ready-to-show is
  // missed by a Linux compositor or GPU driver.
  const showFallback = setTimeout(showMainWindow, 1800);
  mainWindow.on("closed", () => clearTimeout(showFallback));

  mainWindow.webContents.on("render-process-gone", (_event, details) => mainLog("error", "electron", "render-process-gone", details));
  mainWindow.webContents.on("unresponsive", () => mainLog("warning", "electron", "window unresponsive"));
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) shell.openExternal(url);
    return { action: "deny" };
  });

  // Show a local loading page immediately. The backend can take a while to
  // start (or fail), and an invisible window during that wait looks like a
  // background process that did nothing.
  const logPathHtml = logFile().replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  try {
    await mainWindow.loadURL(
      `data:text/html;charset=utf-8,${encodeURIComponent(
        `<body style="margin:0;background:#0b0a12;color:#ece8fa;font-family:Segoe UI,sans-serif;display:grid;place-items:center;height:100vh"><div style="max-width:620px;text-align:center"><h1 style="font-weight:600">Creator Studio</h1><p id="boot-status" style="color:#9b95b2;line-height:1.6">Starting Creator Studio…</p><p style="color:#6f6a82;line-height:1.6;font-size:12px;word-break:break-all">Logs: <code>${logPathHtml}</code></p></div><script>setTimeout(function(){var el=document.getElementById("boot-status");if(el)el.textContent="Still starting. The first launch can take a little longer while the local backend starts.";},12000);</script></body>`,
      )}`,
    );
  } catch {}
  showMainWindow();

  const target = isDev ? "http://localhost:5173" : `http://127.0.0.1:${serverPort}`;
  const waitStarted = Date.now();
  mainLog("info", "electron", "waiting for backend", { target, timeoutMs: isDev ? 30000 : 45000 });
  const ready = await waitForServer(target, isDev ? 30000 : 45000);
  mainLog("info", "electron", "backend wait finished", {
    ready,
    elapsedMs: Date.now() - waitStarted,
    failure: backendFailure || null,
  });
  if (ready) {
    mainLog("info", "electron", "loading application shell", { target });
    await mainWindow.loadURL(target);
  } else {
    const message = isDev
      ? "The development server did not start. Run start.bat again or check the terminal for errors."
      : "The local Creator Studio backend did not become ready. The window is visible so you can read this message; start the app from a terminal to see the live log, then use Try again.";
    const detail = backendFailure ? `<p style="color:#fca5a5;line-height:1.6">${backendFailure.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")}</p>` : "";
    await mainWindow.loadURL(
      `data:text/html;charset=utf-8,${encodeURIComponent(
        `<body style="margin:0;background:#0b0a12;color:#ece8fa;font-family:Segoe UI,sans-serif;display:grid;place-items:center;height:100vh"><div style="max-width:660px;text-align:center"><h1 style="font-weight:600">Creator Studio</h1><p style="color:#9b95b2;line-height:1.6">${message}</p>${detail}<p style="color:#6f6a82;line-height:1.6;font-size:12px;word-break:break-all">Log: <code>${logPathHtml}</code></p><p><a href="${target}" style="display:inline-block;padding:10px 18px;border-radius:8px;background:#8b6cf6;color:#fff;text-decoration:none;font-weight:600">Try again</a></p><p style="color:#6f6a82;font-size:12px">On Linux, run <code>creator-studio</code> in a terminal to see startup messages live.</p></div></body>`,
      )}`,
    );
  }
  showMainWindow();

  mainWindow.on("closed", () => {
    if (overlayTimer) clearInterval(overlayTimer);
    overlayTimer = null;
    if (overlayWindow && !overlayWindow.isDestroyed()) overlayWindow.destroy();
    overlayWindow = null;
    mainWindow = null;
  });
}

function fillWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  if (isLinux) {
    if (mainWindow.isMaximized()) mainWindow.unmaximize();
    else mainWindow.maximize();
    mainWindow.show();
    mainWindow.focus();
    return;
  }
  const bounds = mainWindow.getBounds();
  const display = screen.getDisplayMatching(bounds);
  const area = display.workArea;
  mainWindow.setResizable(false);
  mainWindow.setBounds({ x: area.x, y: area.y, width: area.width + 1, height: area.height + 1 }, false);
  mainWindow.show();
  mainWindow.focus();
}

ipcMain.on("win:minimize", () => mainWindow?.minimize());
ipcMain.on("app:relaunch", () => {
  quitting = true;
  killTree(serverProc);
  serverProc = null;
  app.relaunch();
  app.exit(0);
});
ipcMain.on("win:fill", fillWindow);
ipcMain.on("win:close", () => app.quit());
ipcMain.on("win:home", () => mainWindow?.webContents.send("twix:home"));
ipcMain.on("app:set-zoom", (event, factor) => {
  const value = Number(factor);
  const scale = Number.isFinite(value) ? Math.min(1.5, Math.max(0.8, value)) : 1;
  const win = BrowserWindow.fromWebContents(event.sender);
  try {
    win?.webContents.setZoomFactor(scale);
  } catch (error) {
    mainLog("warning", "appearance", "could not apply interface scale", {
      scale,
      message: error?.message || String(error),
    });
  }
});
ipcMain.handle("dialog:openDirectory", async () => {
  if (!mainWindow) return null;
  const result = await dialog.showOpenDialog(mainWindow, {
    title: "Select a coding workspace",
    defaultPath: app.getPath("documents"),
    properties: ["openDirectory", "createDirectory"],
  });
  return result.canceled || !result.filePaths.length ? null : result.filePaths[0];
});
ipcMain.handle("shell:openPath", async (_event, target) => {
  if (typeof target !== "string" || !target) return false;
  await shell.openPath(target);
  return true;
});
ipcMain.handle("clipboard:readText", async () => clipboard.readText());

ipcMain.handle("edit:paste", async (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  try {
    win?.webContents.paste();
    return true;
  } catch (error) {
    try {
      const text = clipboard.readText();
      if (text) win?.webContents.insertText(text);
      return Boolean(text);
    } catch {
      mainLog("warning", "electron", "paste failed", { message: error?.message });
      return false;
    }
  }
});

ipcMain.handle("shell:openExternal", async (_event, target) => {
  if (typeof target !== "string" || !/^https?:\/\//i.test(target)) return false;
  await shell.openExternal(target);
  return true;
});
ipcMain.handle("file:saveText", async (_event, payload = {}) => {
  if (!mainWindow) return null;
  const { defaultName = "export.json", content = "", filters } = payload || {};
  const exportDir = path.join(app.getPath("documents"), "3D Creator Studio");
  fs.mkdirSync(exportDir, { recursive: true });
  const defaultPath = path.isAbsolute(defaultName) ? defaultName : path.join(exportDir, defaultName);
  const result = await dialog.showSaveDialog(mainWindow, {
    defaultPath,
    filters: Array.isArray(filters) && filters.length ? filters : [{ name: "JSON", extensions: ["json"] }],
  });
  if (result.canceled || !result.filePath) return null;
  fs.writeFileSync(result.filePath, String(content ?? ""), "utf8");
  return result.filePath;
});
ipcMain.handle("file:openText", async (_event, payload = {}) => {
  if (!mainWindow) return null;
  const { filters } = payload || {};
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ["openFile"],
    filters: Array.isArray(filters) && filters.length ? filters : [{ name: "JSON", extensions: ["json"] }],
  });
  if (result.canceled || !result.filePaths.length) return null;
  const filePath = result.filePaths[0];
  const stat = fs.statSync(filePath);
  if (stat.size > 100 * 1024 * 1024) throw new Error("File is larger than 100 MB.");
  return { path: filePath, name: path.basename(filePath), content: fs.readFileSync(filePath, "utf8") };
});

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      if (!mainWindow.isVisible()) mainWindow.show();
      mainWindow.focus();
      showMainWindow();
      return;
    }
    if (app.isReady()) void createWindow();
  });

  const sessionType = process.env.XDG_SESSION_TYPE || (process.env.WAYLAND_DISPLAY ? "wayland" : process.env.DISPLAY ? "x11" : "unknown");
  mainLog("info", "electron", "app ready", {
    version: app.getVersion(),
    electron: process.versions.electron,
    platform: process.platform,
    arch: process.arch,
    sessionType,
    display: process.env.DISPLAY || "",
    wayland: process.env.WAYLAND_DISPLAY || "",
    userData: app.getPath("userData"),
    logFile: logFile(),
    executable: process.execPath,
  });
  app.on("render-process-gone", (_event, webContents, details) => mainLog("error", "electron", "render-process-gone", details));
  app.on("child-process-gone", (_event, details) => mainLog("error", "electron", "child-process-gone", details));
  app.whenReady().then(async () => {
    try {
      console.log(`[Creator Studio] v${app.getVersion()} starting on ${process.platform}/${process.arch} (${sessionType}).`);
      console.log(`[Creator Studio] Logs: ${logFile()}`);
      mainLog("info", "electron", "whenReady", { sessionType });
      const allowedPermissions = new Set(["clipboard-read", "clipboard-sanitized-write", "pointerLock"]);
      session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
        callback(allowedPermissions.has(permission));
      });
      session.defaultSession.setPermissionCheckHandler((_webContents, permission) => allowedPermissions.has(permission));

      if (!isDev) {
        serverPort = await chooseServerPort();
        mainLog("info", "electron", "backend port selected", { port: serverPort });
        startServer();
      }
      await createWindow();
      mainLog("info", "electron", "startup complete", { port: serverPort });

      app.on("activate", () => {
        if (BrowserWindow.getAllWindows().length === 0) {
          void createWindow().catch((error) => mainLog("error", "electron", "activate createWindow failed", { message: error?.message }));
        }
      });
    } catch (error) {
      mainLog("error", "electron", "startup failed", { message: error?.message, stack: error?.stack });
      console.error("[Creator Studio] Startup failed:", error);
      try {
        dialog.showErrorBox(
          "Creator Studio could not start",
          `${error?.message || error}\n\nLogs: ${logFile()}\n\nRun Creator Studio from a terminal to see the live startup log.`,
        );
      } catch {}
      app.quit();
    }
  });

  app.on("before-quit", (event) => {
    if (overlayTimer) clearInterval(overlayTimer);
    overlayTimer = null;
    if (overlayWindow && !overlayWindow.isDestroyed()) overlayWindow.destroy();
    overlayWindow = null;
    mainLog("info", "electron", "before-quit");
    if (quitting) return;
    quitting = true;
    event.preventDefault();
    const proc = serverProc;
    const finish = () => {
      killTree(proc);
      serverProc = null;
      app.quit();
    };
    fetch(`http://127.0.0.1:${serverPort}/api/projects/cleanup-temp`, {
      method: "POST",
      signal: AbortSignal.timeout(2500),
    }).catch(() => {}).finally(finish);
  });

  app.on("window-all-closed", () => {
    app.quit();
  });
}
