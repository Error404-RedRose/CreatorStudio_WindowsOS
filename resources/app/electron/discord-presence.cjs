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
let lastScanLoggedAt = 0;
let logger = () => {};
const sessionStartedAt = Date.now();

function setDiscordLogger(next) {
  logger = typeof next === "function" ? next : () => {};
}

function ipcCandidates() {
  const candidates = [];
  if (process.platform === "win32") {
    for (let index = 0; index < 10; index += 1) {
      candidates.push(`\\\\?\\pipe\\discord-ipc-${index}`);
      candidates.push(`\\\\.\\pipe\\discord-ipc-${index}`);
    }
    return [...new Set(candidates)];
  }

  const bases = [
    process.env.XDG_RUNTIME_DIR,
    process.env.TMPDIR,
    process.env.TMP,
    process.env.TEMP,
    os.tmpdir(),
    typeof process.getuid === "function" ? `/run/user/${process.getuid()}` : "",
    "/tmp",
  ].filter(Boolean);

  // Discord normally creates its socket directly in XDG_RUNTIME_DIR or /tmp.
  // Flatpak and Snap installs keep it inside their sandbox runtime folder, and
  // Discord forks such as WebCord use their own application folder. Scanning
  // all of them keeps presence working for every Linux packaging style.
  const sandboxFolders = [
    "",
    "app/com.discordapp.Discord",
    "app/io.github.spacedrive.discord",
    "app/de.shorsh.discord-screenaudio",
    "snap.discord",
    "snap.discord-canary",
    "Discord",
    "discord",
  ];

  for (const base of bases) {
    for (const folder of sandboxFolders) {
      const directory = folder ? path.join(base, folder) : base;
      for (let index = 0; index < 10; index += 1) {
        candidates.push(path.join(directory, `discord-ipc-${index}`));
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
  // Discord's voice-channel roster uses the activity artwork when a
  // small_image is present, falling back to the Developer Portal application
  // icon otherwise. Supply the Creator Studio artwork explicitly so the voice
  // row does not inherit an unrelated application icon.
  const smallImage = String(activity?.smallImage || APP_ICON).slice(0, 256);
  const smallText = String(activity?.smallText || "Creator Studio").slice(0, 128);
  return {
    details,
    state,
    timestamps: { start: Number(activity?.start) || sessionStartedAt },
    assets: {
      large_image: largeImage,
      large_text: largeText,
      small_image: smallImage,
      small_text: smallText,
    },
    instance: false,
  };
}

function flushActivity(force = false) {
  if (!lastActivity || !connected) return;
  const now = Date.now();
  if (!force && now - lastSentAt < 1200) return;
  lastSentAt = now;
  const sent = send(1, {
    cmd: "SET_ACTIVITY",
    args: { pid: process.pid, activity: lastActivity },
    nonce: `${now}-${Math.random().toString(36).slice(2)}`,
  });
  if (sent) logger("debug", "discord", "activity sent", { state: lastActivity.state });
  else logger("warning", "discord", "activity write failed");
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
    logger("info", "discord", "rich presence connected");
    flushActivity(true);
    return;
  }
  if (opcode === 1 && payload?.cmd === "DISPATCH" && payload?.evt === "READY") {
    connected = true;
    logger("info", "discord", "rich presence ready", {
      user: payload?.data?.user?.username || "",
      app: payload?.data?.application?.name || "",
    });
    flushActivity(true);
    return;
  }
  if (opcode === 1 && payload?.evt === "ERROR") {
    logger("warning", "discord", "rich presence command failed", {
      command: payload?.cmd,
      code: payload?.data?.code,
      message: payload?.data?.message,
    });
    return;
  }
  if (opcode === 1 && payload?.cmd === "SET_ACTIVITY" && !payload?.evt) {
    logger("debug", "discord", "activity acknowledged", {
      name: payload?.data?.name || "",
      details: payload?.data?.details || "",
      state: payload?.data?.state || "",
    });
    return;
  }
  if (opcode === 2) {
    // Discord closed the connection. The socket close handler reconnects.
    logger("warning", "discord", "Discord closed the presence connection");
    try {
      socket?.end();
    } catch {}
    return;
  }
  if (opcode === 3) {
    // Discord RPC: 3 is PING, 4 is PONG, 2 is CLOSE. Send the matching PONG
    // directly so keep-alives work even during the handshake.
    if (socket) {
      try {
        socket.write(encodeFrame(4, payload));
      } catch {}
    }
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
  if (!CLIENT_ID) {
    logger("warning", "discord", "rich presence disabled: no Discord client id");
    return;
  }
  if (socket || connected) return;
  const candidates = ipcCandidates();
  const now = Date.now();
  if (now - lastScanLoggedAt > 60000) {
    lastScanLoggedAt = now;
    logger("debug", "discord", "looking for Discord IPC", {
      candidates: candidates.length,
      platform: process.platform,
      xdgRuntimeDir: process.env.XDG_RUNTIME_DIR || "",
    });
  }
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
      logger("info", "discord", "connected to Discord IPC", { pipe });
      candidate.on("data", handleData);
      candidate.on("error", (error) => {
        logger("warning", "discord", "IPC socket error", { message: error?.message });
      });
      candidate.on("close", () => {
        if (socket === candidate) {
          socket = null;
          connected = false;
          readBuffer = Buffer.alloc(0);
          logger("warning", "discord", "Discord IPC closed");
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
  setDiscordLogger,
  startDiscordPresence,
  setDiscordActivity,
  stopDiscordPresence,
};
