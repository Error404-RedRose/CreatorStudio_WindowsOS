import fs from "node:fs/promises";
import fssync from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import os from "node:os";
import express from "express";

const IGNORE_DIRS = new Set([
  ".git",
  ".vs",
  ".idea",
  "Library",
  "Temp",
  "obj",
  "Logs",
  "Build",
  "Builds",
  "UserSettings",
  "node_modules",
  "MemoryCaptures",
  "Recordings",
]);
const IGNORE_FILES = /(\.csproj|\.sln|\.user|\.pidb|\.booproj|\.svd|\.pdb|\.mdb|\.opendb|\.VC\.db|\.DS_Store)$/i;
const COLLAB_PORT = Number(process.env.TWIX_COLLAB_PORT || 47850);

function hashBuffer(buffer) {
  return crypto.createHash("sha1").update(buffer).digest("hex");
}

function safeRelative(value) {
  const raw = String(value || "").replace(/\\/g, "/").replace(/^\/+/, "");
  const parts = [];
  for (const part of raw.split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") throw new Error("Path escapes the project.");
    parts.push(part);
  }
  return parts.join("/");
}

function ignored(relative) {
  const parts = relative.split("/");
  if (parts.some((part) => IGNORE_DIRS.has(part))) return true;
  return IGNORE_FILES.test(parts[parts.length - 1] || "");
}

async function scanProject(root, { hash = true, maxFiles = 60000 } = {}) {
  const base = path.resolve(root);
  const files = {};
  let totalBytes = 0;
  let count = 0;
  const walk = async (dir, prefix) => {
    const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      if (count >= maxFiles) return;
      const relative = prefix ? prefix + "/" + entry.name : entry.name;
      if (ignored(relative)) continue;
      const absolute = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(absolute, relative);
      } else if (entry.isFile()) {
        const stat = await fs.stat(absolute).catch(() => null);
        if (!stat) continue;
        let sha1 = "";
        if (hash && stat.size <= 64 * 1024 * 1024) {
          const buffer = await fs.readFile(absolute).catch(() => null);
          if (buffer) sha1 = hashBuffer(buffer);
        }
        files[relative] = { size: stat.size, mtime: stat.mtimeMs, sha1 };
        totalBytes += stat.size;
        count += 1;
      }
    }
  };
  await walk(base, "");
  return { root: base, generatedAt: new Date().toISOString(), files, totalBytes, count };
}

function diffManifests(local, remote) {
  const changed = [];
  const added = [];
  const deleted = [];
  const same = [];
  for (const [relative, entry] of Object.entries(remote.files || {})) {
    const mine = local.files?.[relative];
    if (!mine) added.push(relative);
    else if ((entry.sha1 && mine.sha1 && entry.sha1 !== mine.sha1) || (!entry.sha1 && entry.size !== mine.size)) changed.push(relative);
    else same.push(relative);
  }
  for (const relative of Object.keys(local.files || {})) {
    if (!remote.files?.[relative]) deleted.push(relative);
  }
  return { changed, added, deleted, same, changedCount: changed.length + added.length, different: changed.length + added.length + deleted.length };
}

export function createCollabService({ dataDir, appRoot, log = () => null }) {
  const collabDir = path.join(dataDir, "collab");
  const roomsFile = path.join(collabDir, "rooms.json");
  const snapshotsDir = path.join(collabDir, "checkpoints");
  let cache = null;

  const ensure = async () => {
    await fs.mkdir(collabDir, { recursive: true });
    await fs.mkdir(snapshotsDir, { recursive: true });
  };

  const load = async () => {
    if (cache) return cache;
    await ensure();
    try {
      const parsed = JSON.parse(await fs.readFile(roomsFile, "utf8"));
      cache = { rooms: Array.isArray(parsed.rooms) ? parsed.rooms : [] };
    } catch {
      cache = { rooms: [] };
    }
    return cache;
  };

  const save = async () => {
    if (!cache) return;
    await ensure();
    const tmp = roomsFile + ".tmp";
    await fs.writeFile(roomsFile + ".tmp", JSON.stringify(cache, null, 2), "utf8");
    await fs.rename(tmp, roomsFile);
  };

  const publicRoom = (room) => ({
    id: room.id,
    name: room.name,
    host: room.host,
    hostUrl: room.hostUrl || "",
    openHouse: !!room.openHouse,
    token: room.token,
    root: room.root,
    version: room.version,
    createdAt: room.createdAt,
    updatedAt: room.updatedAt,
    members: room.members || [],
    checkpoints: (room.checkpoints || []).map((cp) => ({ id: cp.id, label: cp.label, at: cp.at, username: cp.username, files: cp.files, bytes: cp.bytes })),
    events: (room.events || []).slice(-40),
    manifest: {
      generatedAt: room.manifest?.generatedAt,
      count: room.manifest?.count || 0,
      totalBytes: room.manifest?.totalBytes || 0,
    },
  });

  const getRoom = async (id) => {
    const store = await load();
    return store.rooms.find((room) => room.id === id) || null;
  };

  const requireRoom = async (id, token) => {
    const room = await getRoom(id);
    if (!room) throw new Error("Collaboration room not found.");
    if (token && room.token !== token) throw new Error("The invite code is not valid for this room.");
    return room;
  };

  const addEvent = (room, text, severity = "info") => {
    room.events = [...(room.events || []), { at: new Date().toISOString(), text, severity }].slice(-80);
  };

  async function attachBridge(root, room) {
    const source = path.join(appRoot, "unity", "com.twilightstudio.creatorstudio");
    if (fssync.existsSync(source)) {
      const target = path.join(root, "Packages", "com.twilightstudio.creatorstudio");
      if (!fssync.existsSync(target)) {
        await fs.cp(source, target, { recursive: true }).catch(() => null);
      }
      const manifestPath = path.join(root, "Packages", "manifest.json");
      let manifest = {};
      try {
        manifest = JSON.parse(await fs.readFile(manifestPath, "utf8"));
      } catch {
        manifest = {};
      }
      manifest.dependencies = manifest.dependencies || {};
      manifest.dependencies["com.twilightstudio.creatorstudio"] = "file:com.twilightstudio.creatorstudio";
      await fs.mkdir(path.dirname(manifestPath), { recursive: true });
      await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2), "utf8");
    }
    await fs.writeFile(
      path.join(root, "CreatorStudioCollab.json"),
      JSON.stringify(
        {
          schema: 1,
          app: "Creator Studio",
          roomId: room.id,
          roomName: room.name,
          host: room.host,
          bridgePackage: "com.twilightstudio.creatorstudio",
          bridgeVersion: "0.2.2",
          note: "Open Unity once so the bridge package registers. The host shares project files over the LAN collaboration port.",
          createdAt: new Date().toISOString(),
        },
        null,
        2,
      ),
      "utf8",
    );
  }

  async function createRoom({ root, name, host, hostUrl, openHouse = false }) {
    if (!root) throw new Error("A Unity project folder is required.");
    const now = new Date().toISOString();
    const room = {
      id: "room_" + Date.now().toString(36) + "_" + crypto.randomBytes(3).toString("hex"),
      token: crypto.randomBytes(9).toString("base64url"),
      name: String(name || path.basename(root) || "Unity project").slice(0, 80),
      host: String(host || "Host"),
      hostUrl: String(hostUrl || ""),
      openHouse: !!openHouse,
      root: path.resolve(root),
      createdAt: now,
      updatedAt: now,
      version: 1,
      manifest: null,
      members: [{ username: String(host || "Host"), role: "host", status: "ready", progress: 100, projectName: path.basename(root), lastSeen: now }],
      checkpoints: [],
      events: [{ at: now, text: "Room created for " + path.basename(root), severity: "success" }],
    };
    await attachBridge(room.root, room);
    room.manifest = await scanProject(room.root);
    const store = await load();
    store.rooms.unshift(room);
    await save();
    log("info", "collab", "room created", { id: room.id, root: room.root, files: room.manifest.count });
    return room;
  }

  async function refreshRoom(id, token) {
    const room = await requireRoom(id, token);
    const scan = await scanProject(room.root);
    const previous = room.manifest;
    const diff = previous ? diffManifests(scan, previous) : { different: 0 };
    room.manifest = scan;
    room.updatedAt = new Date().toISOString();
    if (diff.different) {
      room.version += 1;
      addEvent(room, "Host refreshed: " + diff.different + " file(s) changed.", "info");
    }
    await save();
    return { room: publicRoom(room), diff };
  }

  async function joinRoom({ id, token, username, projectName = "" }) {
    const room = await requireRoom(id, token);
    const name = String(username || "Member").slice(0, 40);
    const member = (room.members || []).find((item) => item.username === name);
    if (member) {
      member.lastSeen = new Date().toISOString();
      if (projectName) member.projectName = String(projectName).slice(0, 120);
    } else {
      room.members = [...(room.members || []), { username: name, role: "streamer", status: "downloading", progress: 0, projectName: String(projectName || "").slice(0, 120), lastSeen: new Date().toISOString() }];
      addEvent(room, name + " joined the room.", "success");
    }
    await save();
    return { room: publicRoom(room), manifest: room.manifest };
  }

  async function setMember({ id, token, username, status, progress, projectName, camera }) {
    const room = await requireRoom(id, token);
    const name = String(username || "Member");
    const member = (room.members || []).find((item) => item.username === name);
    if (!member) throw new Error("Member is not in this room.");
    if (status) member.status = String(status);
    if (progress !== undefined) member.progress = Math.max(0, Math.min(100, Number(progress) || 0));
    if (projectName !== undefined) member.projectName = String(projectName).slice(0, 120);
    if (camera && typeof camera === "object") {
      member.camera = {
        x: Number(camera.x) || 0,
        y: Number(camera.y) || 0,
        z: Number(camera.z) || 0,
      };
    }
    member.lastSeen = new Date().toISOString();
    room.updatedAt = new Date().toISOString();
    await save();
    return publicRoom(room);
  }

  async function createCheckpoint({ id, token, label, username }) {
    const room = await requireRoom(id, token);
    const scan = room.manifest || (await scanProject(room.root));
    const cpId = "cp_" + Date.now().toString(36) + "_" + crypto.randomBytes(2).toString("hex");
    const target = path.join(snapshotsDir, room.id, cpId);
    await fs.mkdir(target, { recursive: true });
    let copied = 0;
    for (const relative of Object.keys(scan.files || {})) {
      const source = path.join(room.root, relative.split("/").join(path.sep));
      const dest = path.join(target, relative.split("/").join(path.sep));
      await fs.mkdir(path.dirname(dest), { recursive: true });
      await fs.copyFile(source, dest).catch(() => null);
      copied += 1;
    }
    const checkpoint = {
      id: cpId,
      label: String(label || "Checkpoint").slice(0, 80),
      at: new Date().toISOString(),
      username: String(username || room.host),
      manifest: scan,
      path: target,
      files: copied,
      bytes: scan.totalBytes,
    };
    room.checkpoints = [checkpoint, ...(room.checkpoints || [])].slice(0, 40);
    addEvent(room, "Checkpoint created: " + checkpoint.label, "success");
    await save();
    return { room: publicRoom(room), checkpoint };
  }

  async function rollbackRoom({ id, token, checkpointId, username }) {
    const room = await requireRoom(id, token);
    const checkpoint = (room.checkpoints || []).find((item) => item.id === checkpointId);
    if (!checkpoint) throw new Error("Checkpoint not found.");
    const current = room.manifest || (await scanProject(room.root));
    for (const relative of Object.keys(checkpoint.manifest.files || {})) {
      const source = path.join(checkpoint.path, relative.split("/").join(path.sep));
      const dest = path.join(room.root, relative.split("/").join(path.sep));
      await fs.mkdir(path.dirname(dest), { recursive: true });
      await fs.copyFile(source, dest).catch(() => null);
    }
    for (const relative of Object.keys(current.files || {})) {
      if (!checkpoint.manifest.files?.[relative]) {
        await fs.rm(path.join(room.root, relative.split("/").join(path.sep)), { force: true }).catch(() => null);
      }
    }
    room.manifest = await scanProject(room.root);
    room.version += 1;
    room.updatedAt = new Date().toISOString();
    addEvent(room, "Rolled back to " + checkpoint.label + " by " + String(username || room.host), "warning");
    await save();
    return publicRoom(room);
  }

  async function transferHost({ id, token, newHost }) {
    const room = await requireRoom(id, token);
    const name = String(newHost || "").trim();
    if (!name) throw new Error("Choose a member to host.");
    const previous = room.host;
    room.host = name;
    room.members = (room.members || []).map((member) =>
      member.username === name ? { ...member, role: "host", status: "ready", progress: 100 } : { ...member, role: "streamer" },
    );
    addEvent(room, "Host moved from " + previous + " to " + name + ".", "warning");
    room.updatedAt = new Date().toISOString();
    await save();
    return publicRoom(room);
  }

  async function removeMember({ id, token, username }) {
    const room = await requireRoom(id, token);
    room.members = (room.members || []).filter((member) => member.username !== username);
    addEvent(room, String(username) + " left the room.", "info");
    await save();
    return publicRoom(room);
  }

  async function removeRoom({ id, token }) {
    const room = await requireRoom(id, token);
    const store = await load();
    store.rooms = store.rooms.filter((item) => item.id !== id);
    await fs.rm(path.join(snapshotsDir, id), { recursive: true, force: true }).catch(() => null);
    await save();
    log("info", "collab", "room deleted", { id });
    return { ok: true };
  }

  async function localDiff({ root, manifest }) {
    const local = await scanProject(root);
    return { manifest: local, diff: diffManifests(local, manifest || { files: {} }) };
  }

  async function pullFromRemote({ remoteUrl, roomId, token, root, onProgress = () => null }) {
    const base = String(remoteUrl || "").replace(/\/+$/, "");
    if (!base) throw new Error("The host address is required.");
    const stateResponse = await fetch(base + "/state?roomId=" + encodeURIComponent(roomId) + "&token=" + encodeURIComponent(token), {
      signal: AbortSignal.timeout(15000),
    });
    if (!stateResponse.ok) throw new Error("Could not reach the host room (HTTP " + stateResponse.status + ").");
    const state = await stateResponse.json();
    const manifest = state.room?.manifestFull || state.manifest;
    const local = await scanProject(root);
    const diff = diffManifests(local, manifest);
    const targets = [...diff.changed, ...diff.added];
    let done = 0;
    for (const relative of targets) {
      const response = await fetch(
        base + "/file?roomId=" + encodeURIComponent(roomId) + "&token=" + encodeURIComponent(token) + "&path=" + encodeURIComponent(relative),
        { signal: AbortSignal.timeout(60000) },
      );
      if (!response.ok) throw new Error("Could not download " + relative + " (HTTP " + response.status + ").");
      const buffer = Buffer.from(await response.arrayBuffer());
      const target = path.join(path.resolve(root), relative.split("/").join(path.sep));
      await fs.mkdir(path.dirname(target), { recursive: true });
      await fs.writeFile(target, buffer);
      done += 1;
      onProgress(Math.round((done / Math.max(1, targets.length)) * 100));
    }
    return { downloaded: done, total: targets.length, diff };
  }

  async function pushToRemote({ remoteUrl, roomId, token, root }) {
    const base = String(remoteUrl || "").replace(/\/+$/, "");
    if (!base) throw new Error("The host address is required.");
    const stateResponse = await fetch(base + "/state?roomId=" + encodeURIComponent(roomId) + "&token=" + encodeURIComponent(token), {
      signal: AbortSignal.timeout(15000),
    });
    if (!stateResponse.ok) throw new Error("Could not reach the host room (HTTP " + stateResponse.status + ").");
    const state = await stateResponse.json();
    const manifest = state.room?.manifestFull || state.manifest;
    const local = await scanProject(root);
    const diff = diffManifests(local, manifest);
    const targets = [...diff.changed, ...diff.added];
    let done = 0;
    for (const relative of targets) {
      const buffer = await fs.readFile(path.join(path.resolve(root), relative.split("/").join(path.sep)));
      const response = await fetch(base + "/file", {
        method: "POST",
        headers: {
          "Content-Type": "application/octet-stream",
          "x-room-id": roomId,
          "x-collab-token": token,
          "x-project-path": encodeURIComponent(relative),
        },
        body: buffer,
        signal: AbortSignal.timeout(60000),
      });
      if (!response.ok) throw new Error("Could not upload " + relative + " (HTTP " + response.status + ").");
      done += 1;
    }
    return { uploaded: done, total: targets.length, diff };
  }

  /* Remote-facing router: this is the only router exposed on the LAN port. */
  const remoteRouter = express.Router();

  const tokenOf = (req) => String(req.query.token || req.headers["x-collab-token"] || req.body?.token || "");

  remoteRouter.get("/ping", (req, res) => res.json({ ok: true, app: "Creator Studio Collab", port: COLLAB_PORT }));

  remoteRouter.get("/state", async (req, res) => {
    try {
      const room = await requireRoom(String(req.query.roomId || ""), tokenOf(req));
      res.json({ ok: true, room: { ...publicRoom(room), manifestFull: room.manifest } });
    } catch (error) {
      res.status(404).json({ error: error.message });
    }
  });

  remoteRouter.get("/file", async (req, res) => {
    try {
      const room = await requireRoom(String(req.query.roomId || ""), tokenOf(req));
      const relative = safeRelative(String(req.query.path || ""));
      const target = path.join(room.root, relative.split("/").join(path.sep));
      if (!fssync.existsSync(target)) return res.status(404).json({ error: "File not found" });
      res.sendFile(target, { dotfiles: "allow" });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  remoteRouter.post("/file", express.raw({ type: "*/*", limit: "900mb" }), async (req, res) => {
    try {
      const room = await requireRoom(String(req.headers["x-room-id"] || req.query.roomId || ""), String(req.headers["x-collab-token"] || req.query.token || ""));
      const relative = safeRelative(decodeURIComponent(String(req.headers["x-project-path"] || req.query.path || "")));
      if (!req.body?.length) throw new Error("The uploaded file is empty.");
      const target = path.join(room.root, relative.split("/").join(path.sep));
      await fs.mkdir(path.dirname(target), { recursive: true });
      await fs.writeFile(target, req.body);
      const scan = await scanProject(room.root);
      room.manifest = scan;
      room.version += 1;
      room.updatedAt = new Date().toISOString();
      const member = (room.members || []).find((item) => item.role !== "host");
      addEvent(room, (member?.username || "A streamer") + " pushed " + relative + ".", "info");
      await save();
      res.json({ ok: true, version: room.version, bytes: req.body.length });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  remoteRouter.post("/join", async (req, res) => {
    try {
      const body = req.body || {};
      const result = await joinRoom({
        id: String(body.roomId || ""),
        token: String(body.token || ""),
        username: body.username,
        projectName: body.projectName,
      });
      res.json({ ok: true, ...result });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  remoteRouter.post("/member", async (req, res) => {
    try {
      const body = req.body || {};
      const room = await setMember({
        id: String(body.roomId || ""),
        token: String(body.token || ""),
        username: body.username,
        status: body.status,
        progress: body.progress,
        projectName: body.projectName,
        camera: body.camera,
      });
      res.json({ ok: true, room });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  remoteRouter.post("/checkpoint", async (req, res) => {
    try {
      const body = req.body || {};
      const result = await createCheckpoint({
        id: String(body.roomId || ""),
        token: String(body.token || ""),
        label: body.label,
        username: body.username,
      });
      res.json({ ok: true, ...result });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  remoteRouter.post("/rollback", async (req, res) => {
    try {
      const body = req.body || {};
      const room = await rollbackRoom({
        id: String(body.roomId || ""),
        token: String(body.token || ""),
        checkpointId: String(body.checkpointId || ""),
        username: body.username,
      });
      res.json({ ok: true, room });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  remoteRouter.post("/host", async (req, res) => {
    try {
      const body = req.body || {};
      const room = await transferHost({ id: String(body.roomId || ""), token: String(body.token || ""), newHost: body.newHost });
      res.json({ ok: true, room });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  remoteRouter.delete("/room", async (req, res) => {
    try {
      const result = await removeRoom({ id: String(req.query.roomId || req.body?.roomId || ""), token: tokenOf(req) });
      res.json(result);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  /* The local app gets every route plus the local-only helpers. */
  const router = express.Router();
  router.use(remoteRouter);

  router.get("/rooms", async (req, res) => {
    try {
      const store = await load();
      res.json({ ok: true, rooms: store.rooms.map(publicRoom), port: COLLAB_PORT, addresses: localAddresses() });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  router.post("/rooms", async (req, res) => {
    try {
      const body = req.body || {};
      const room = await createRoom({
        root: String(body.root || ""),
        name: body.name,
        host: body.host,
        hostUrl: body.hostUrl,
        openHouse: body.openHouse,
      });
      res.json({ ok: true, room: publicRoom(room), port: COLLAB_PORT });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  router.post("/refresh", async (req, res) => {
    try {
      const body = req.body || {};
      const result = await refreshRoom(String(body.roomId || ""), String(body.token || ""));
      res.json({ ok: true, ...result });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  router.post("/diff", async (req, res) => {
    try {
      const body = req.body || {};
      const result = await localDiff({ root: String(body.root || ""), manifest: body.manifest });
      res.json({ ok: true, ...result });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  router.post("/join-remote", async (req, res) => {
    try {
      const body = req.body || {};
      const base = String(body.remoteUrl || "").replace(/\/+$/, "");
      const response = await fetch(base + "/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roomId: body.roomId, token: body.token, username: body.username, projectName: body.projectName }),
        signal: AbortSignal.timeout(15000),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "The host refused the join request.");
      const local = body.root ? await scanProject(String(body.root)) : { files: {} };
      const diff = diffManifests(local, data.manifest);
      res.json({ ok: true, room: data.room, manifest: data.manifest, diff });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  router.post("/pull", async (req, res) => {
    try {
      const body = req.body || {};
      const result = await pullFromRemote({
        remoteUrl: body.remoteUrl,
        roomId: String(body.roomId || ""),
        token: String(body.token || ""),
        root: String(body.root || ""),
        onProgress: () => null,
      });
      res.json({ ok: true, ...result });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  router.post("/push", async (req, res) => {
    try {
      const body = req.body || {};
      const result = await pushToRemote({
        remoteUrl: body.remoteUrl,
        roomId: String(body.roomId || ""),
        token: String(body.token || ""),
        root: String(body.root || ""),
      });
      res.json({ ok: true, ...result });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  function localAddresses() {
    const interfaces = os.networkInterfaces();
    const out = [];
    for (const list of Object.values(interfaces)) {
      for (const item of list || []) {
        if (item.family === "IPv4" && !item.internal) out.push(item.address);
      }
    }
    return out;
  }

  return {
    router,
    remoteRouter,
    createRoom,
    refreshRoom,
    joinRoom,
    setMember,
    createCheckpoint,
    rollbackRoom,
    transferHost,
    removeMember,
    removeRoom,
    localDiff,
    pullFromRemote,
    pushToRemote,
    scanProject,
    COLLAB_PORT,
  };
}

export { scanProject, diffManifests, COLLAB_PORT };
