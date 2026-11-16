const { contextBridge, ipcRenderer } = require("electron");

// Catch failures that happen before the renderer logger starts. The main
// process receives the stack even when React never mounts, which is the most
// common symptom of a Linux driver or JavaScript startup failure.
let rendererBooted = false;
window.addEventListener("DOMContentLoaded", () => {
  rendererBooted = true;
}, { once: true });
const forwardEarlyLog = (entry) => {
  try {
    ipcRenderer.send("app:log", entry);
  } catch {}
};
window.addEventListener("error", (event) => {
  if (rendererBooted) return;
  forwardEarlyLog({
    ts: new Date().toISOString(),
    level: "error",
    source: "preload.window.error",
    message: event.message || "Renderer startup error",
    data: {
      filename: event.filename,
      lineno: event.lineno,
      colno: event.colno,
      stack: event.error?.stack,
    },
  });
});
window.addEventListener("unhandledrejection", (event) => {
  if (rendererBooted) return;
  const reason = event.reason;
  forwardEarlyLog({
    ts: new Date().toISOString(),
    level: "error",
    source: "preload.unhandledrejection",
    message: reason?.message || String(reason),
    data: { stack: reason?.stack },
  });
});

contextBridge.exposeInMainWorld("twixDesktop", {
  isDesktop: true,
  platform: process.platform,
  nativeFrame: process.platform === "linux",
  softwareRendering: process.env.TWIX_SOFTWARE_RENDERING === "1",
  minimize: () => ipcRenderer.send("win:minimize"),
  fill: () => ipcRenderer.send("win:fill"),
  close: () => ipcRenderer.send("win:close"),
  relaunch: () => ipcRenderer.send("app:relaunch"),
  home: () => ipcRenderer.send("win:home"),
  openPath: (target) => ipcRenderer.invoke("shell:openPath", target),
  openExternal: (url) => ipcRenderer.invoke("shell:openExternal", url),
  readClipboardText: () => ipcRenderer.invoke("clipboard:readText"),
  pasteClipboard: () => ipcRenderer.invoke("edit:paste"),
  pickDirectory: () => ipcRenderer.invoke("dialog:openDirectory"),
  pickImages: () => ipcRenderer.invoke("dialog:openImages"),
  saveTextFile: (defaultName, content, filters) => ipcRenderer.invoke("file:saveText", { defaultName, content, filters }),
  saveBinaryFile: (defaultName, data, filters) => ipcRenderer.invoke("file:saveBinary", { defaultName, data, filters }),
  openTextFile: (filters) => ipcRenderer.invoke("file:openText", { filters }),
  checkForUpdates: (force) => ipcRenderer.invoke("updates:check", Boolean(force)),
  applyUpdate: (force) => ipcRenderer.invoke("updates:apply", Boolean(force)),
  setZoomFactor: (factor) => ipcRenderer.send("app:set-zoom", Number(factor)),
  setDiscordActivity: (activity) => ipcRenderer.send("discord:activity", activity),
  log: (entry) => ipcRenderer.send("app:log", entry),
  onHome: (callback) => {
    const handler = () => callback();
    ipcRenderer.on("twix:home", handler);
    return () => ipcRenderer.removeListener("twix:home", handler);
  },
  onServerExit: (callback) => {
    const handler = (_event, code) => callback(code);
    ipcRenderer.on("twix:server-exit", handler);
    return () => ipcRenderer.removeListener("twix:server-exit", handler);
  },
});
