const net = require("node:net");
const path = require("node:path");
const os = require("node:os");

/**
 * Minimal Discord Rich Presence IPC client.
 *
 * It speaks the local Discord RPC protocol directly, so Creator Studio does
 * not need to ship a deprecated dependency. The client id is the Twilight
 * Studio Discord application. Override it with TWIX_DISCORD_CLIENT_ID when a
 * dedicated Creator Studio application exists.
 */
const CLIENT_ID = String(process.env.TWIX_DISCORD_CLIENT_ID || "1451804007613075558").trim();
const APP_ICON =
  "https://raw.githubusercontent.com/Error404-RedRose/CreatorStudio_WindowsOS/main/resources/app/build/icon.png";
const RECONNECT_MS = 15000;

let socket = null;
let connected = false;
let lastActivity = null;
let reconnectTimer = null;
let readBuffer = Buffer.alloc(0);
let lastSentAt = 0;
const sessionStartedAt = Date.now();

function ipcCandidates() {
  const candidates = [];
  if (process.platform === "win32") {
    for (let index = 0; index < 10; index += 1) {
      candidates.push(`\\\\?\\pipe\\discord-ipc-${index}`);
      candidates.push(`\\\\.\\pipe\\discord-ipc-${index}`);
    }
  } else {
    const bases = [process.env.XDG_RUNTIME_DIR, process.env.TMPDIR, os.tmpdir(), "/tmp"].filter(Boolean);
    for (const base of bases) {
      for (let index = 0; index < 10; index += 1) {
        candidates.push(path.join(base, `discord-ipc-${index}`));
      }
    }
  }
  return [...new Set(candidates)];
}

function encodeFrame(opcode, payload) {
  const json = Buffer.from(JSON.stringify(payload), "utf8");
  const frame = Buffer.alloc(8 + json.length);
  frame.writeInt32LE(opcode, 0);
  frame.writeInt32LE(json.length, 4);
  json.copy(frame, 8);
  return frame;
}

function send(opcode, payload) {
  if (!socket || !connected) return false;
  try {
    socket.write(encodeFrame(opcode, payload));
    return true;
  } catch {
    return false;
  }
}

function normaliseActivity(activity) {
  const details = String(activity?.details || "Creator Studio").slice(0, 128);
  const state = String(activity?.state || "In Creator Studio").slice(0, 128);
  const largeImage = String(activity?.largeImage || APP_ICON).slice(0, 256);
  const largeText = String(activity?.largeText || "Creator Studio").slice(0, 128);
  return {
    details,
    state,
    timestamps: { start: Number(activity?.start) || sessionStartedAt },
    assets: { large_image: largeImage, large_text: largeText },
    instance: false,
  };
}

function flushActivity(force = false) {
  if (!lastActivity || !connected) return;
  const now = Date.now();
  if (!force && now - lastSentAt < 1200) return;
  lastSentAt = now;
  send(1, {
    cmd: "SET_ACTIVITY",
    args: { pid: process.pid, activity: lastActivity },
    nonce: `${now}-${Math.random().toString(36).slice(2)}`,
  });
}

function scheduleReconnect() {
  if (reconnectTimer) return;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connect();
  }, RECONNECT_MS);
}

function handleFrame(opcode, payload) {
  if (opcode === 0) {
    // READY / handshake response.
    connected = true;
    flushActivity(true);
    return;
  }
  if (opcode === 1 && payload?.cmd === "DISPATCH" && payload?.evt === "READY") {
    connected = true;
    flushActivity(true);
    return;
  }
  if (opcode === 2) {
    // PING from Discord.
    send(3, payload);
    return;
  }
  if (opcode === 3) {
    connected = true;
    flushActivity(true);
  }
}

function handleData(chunk) {
  readBuffer = Buffer.concat([readBuffer, chunk]);
  while (readBuffer.length >= 8) {
    const opcode = readBuffer.readInt32LE(0);
    const length = readBuffer.readInt32LE(4);
    if (length < 0 || length > 4 * 1024 * 1024) {
      readBuffer = Buffer.alloc(0);
      return;
    }
    if (readBuffer.length < 8 + length) return;
    const body = readBuffer.subarray(8, 8 + length).toString("utf8");
    readBuffer = readBuffer.subarray(8 + length);
    try {
      handleFrame(opcode, body ? JSON.parse(body) : null);
    } catch {
      // A malformed frame should not kill the connection loop.
    }
  }
}

function connect() {
  if (!CLIENT_ID || socket || connected) return;
  const candidates = ipcCandidates();
  let index = 0;

  const tryNext = () => {
    if (index >= candidates.length) {
      scheduleReconnect();
      return;
    }
    const pipe = candidates[index];
    index += 1;
    const candidate = net.connect(pipe);
    candidate.once("connect", () => {
      socket = candidate;
      connected = false;
      readBuffer = Buffer.alloc(0);
      candidate.on("data", handleData);
      candidate.on("error", () => {});
      candidate.on("close", () => {
        if (socket === candidate) {
          socket = null;
          connected = false;
          readBuffer = Buffer.alloc(0);
          scheduleReconnect();
        }
      });
      candidate.write(encodeFrame(0, { v: 1, client_id: CLIENT_ID }));
    });
    candidate.once("error", () => {
      candidate.destroy();
      tryNext();
    });
  };

  tryNext();
}

function startDiscordPresence() {
  connect();
}

function setDiscordActivity(activity) {
  lastActivity = normaliseActivity(activity);
  flushActivity(true);
}

function stopDiscordPresence() {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  if (socket) {
    try {
      send(1, {
        cmd: "SET_ACTIVITY",
        args: { pid: process.pid, activity: null },
        nonce: `clear-${Date.now()}`,
      });
      socket.end();
    } catch {}
  }
  socket = null;
  connected = false;
  lastActivity = null;
  readBuffer = Buffer.alloc(0);
}

module.exports = {
  startDiscordPresence,
  setDiscordActivity,
  stopDiscordPresence,
};
