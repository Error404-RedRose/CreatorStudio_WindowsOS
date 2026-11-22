const FORUM_CHANNEL_ID = "global:CreatorStudio:Public.Forums";
const FORUM_CHANNEL_NAME = "Public.Forums";
const FORUM_CHANNEL_DESCRIPTION =
  "Public Creator Studio forums, job board, bug reports, tutorials and feature requests";
const FORUM_CATEGORIES = new Set([
  "all",
  "jobs",
  "bugs",
  "tutorials",
  "showcase",
  "requests",
]);

function forumTags(value) {
  const list = Array.isArray(value) ? value : String(value || "").split(",");
  return [...new Set(list.map((item) => String(item || "").trim()).filter(Boolean))].slice(
    0,
    8,
  );
}

function forumObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : null;
}

function forumNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function forumThreadFromRow(row) {
  const threadId = String(row.threadId || row.tid || row.id || row.__id || "");
  if (!threadId) return null;
  const category = String(row.cat || row.category || "all").toLowerCase();
  const createdAtMs = forumNumber(row.ts || row.i || row.idx, Date.now());
  return {
    id: threadId,
    title: String(row.title || row.m || "(untitled thread)").slice(0, 180),
    body: String(row.body || row.m || ""),
    category: FORUM_CATEGORIES.has(category) ? category : "all",
    tags: forumTags(row.tags),
    author: String(row.u || row.user || "unknown"),
    authorName: String(row.name || row.u || "unknown"),
    createdAt: String(row.createdAt || new Date(createdAtMs).toISOString()),
    createdAtMs,
    votes: forumNumber(row.votes),
    views: forumNumber(row.views),
    pinned: Boolean(row.pinned),
    solved: Boolean(row.solved),
    jobMeta: forumObject(row.jobMeta),
    bugMeta: forumObject(row.bugMeta),
  };
}

function forumReplyFromRow(row) {
  const replyId = String(row.replyId || row.id || row.__id || "");
  const threadId = String(row.threadId || row.tid || "");
  if (!replyId || !threadId) return null;
  const createdAtMs = forumNumber(row.ts || row.i || row.idx, Date.now());
  return {
    id: replyId,
    threadId,
    body: String(row.body || row.m || ""),
    author: String(row.u || row.user || "unknown"),
    authorName: String(row.name || row.u || "unknown"),
    createdAt: String(row.createdAt || new Date(createdAtMs).toISOString()),
    createdAtMs,
    isSolution: Boolean(row.isSolution),
    votes: forumNumber(row.votes),
  };
}

function buildForum(rows) {
  const threads = new Map();
  const replies = new Map();
  const threadUpdates = [];
  const replyUpdates = [];
  const sorted = [...rows].sort(
    (a, b) => forumNumber(a.i || a.idx) - forumNumber(b.i || b.idx),
  );
  for (const row of sorted) {
    const kind = String(row.kind || row.t || "msg").toLowerCase();
    if (kind === "forum-thread") {
      const thread = forumThreadFromRow(row);
      if (thread) threads.set(thread.id, thread);
    } else if (kind === "forum-reply") {
      const reply = forumReplyFromRow(row);
      if (reply) replies.set(reply.id, reply);
    } else if (kind === "forum-thread-update") {
      threadUpdates.push({
        threadId: String(row.threadId || ""),
        patch: forumObject(row.patch) || {},
      });
    } else if (kind === "forum-reply-update") {
      replyUpdates.push({
        replyId: String(row.replyId || ""),
        patch: forumObject(row.patch) || {},
      });
    }
  }
  for (const update of threadUpdates) {
    const thread = threads.get(update.threadId);
    if (!thread) continue;
    const patch = update.patch;
    if ("votes" in patch) thread.votes = Math.max(0, forumNumber(patch.votes, thread.votes));
    if ("views" in patch) thread.views = Math.max(0, forumNumber(patch.views, thread.views));
    if ("solved" in patch) thread.solved = Boolean(patch.solved);
    if ("pinned" in patch) thread.pinned = Boolean(patch.pinned);
  }
  for (const update of replyUpdates) {
    const reply = replies.get(update.replyId);
    if (!reply) continue;
    const patch = update.patch;
    if ("isSolution" in patch) reply.isSolution = Boolean(patch.isSolution);
    if ("votes" in patch) reply.votes = Math.max(0, forumNumber(patch.votes, reply.votes));
  }
  const replyList = [...replies.values()].sort(
    (a, b) => a.createdAtMs - b.createdAtMs,
  );
  for (const thread of threads.values()) {
    const own = replyList.filter((reply) => reply.threadId === thread.id);
    thread.replyCount = own.length;
    thread.lastAt = Math.max(thread.createdAtMs, ...own.map((reply) => reply.createdAtMs));
  }
  const threadList = [...threads.values()].sort(
    (a, b) => Number(b.pinned) - Number(a.pinned) || b.lastAt - a.lastAt,
  );
  return { threads: threadList, replies: replyList };
}

const WELCOME_BODY = [
  "# Welcome to the Creator Studio Public Forums",
  "",
  "This is the shared **public hub** for every Creator Studio member. Ask for help, post a job, report a bug, or share a tutorial. Everything here is public, searchable and replyable by the community.",
  "",
  "## Where to post",
  "- **Job Board** - paid gigs, rev-share teams and hiring posts",
  "- **Bug Reports** - reproducible Creator Studio issues with a version and severity",
  "- **Tutorials & Guides** - workflows, shader breakdowns and optimization notes",
  "- **Showcase & Releases** - worlds, prefabs and open-source kits",
  "- **Feature Requests** - vote on editor tools and workflow upgrades",
  "",
  "## Forum rules",
  "- Search before posting a new thread.",
  "- Use clear tags so the right people can find your post.",
  "- Keep bug reports reproducible and include the Creator Studio version.",
  "- Be respectful. Public help is how the whole community levels up.",
  "",
  "> Discord formatting is supported: **bold**, *italic*, __underline__, inline code, headings, quotes and lists. Use the AI Beautify button to structure a rough draft.",
].join("\n");

export function registerForumRoutes(app, deps) {
  const { chatServerFetch, chatRecordEntries, log } = deps;
  let forumChannelCache = { at: 0, channel: null };
  let forumDataCache = { at: 0, data: null };

  async function ensureForumChannel() {
    if (forumChannelCache.channel && Date.now() - forumChannelCache.at < 10 * 60_000) {
      return forumChannelCache.channel;
    }
    const data = await chatServerFetch("/api/bitboy_chat_channels", { timeoutMs: 15000 });
    const rows = chatRecordEntries(data);
    let row =
      rows.find((entry) => String(entry.id) === FORUM_CHANNEL_ID) ||
      rows.find(
        (entry) =>
          String(entry.n || entry.name || "").toLowerCase() ===
          FORUM_CHANNEL_NAME.toLowerCase(),
      );
    if (!row) {
      const created = await chatServerFetch("/api/bitboy_chat_channels", {
        method: "POST",
        timeoutMs: 15000,
        body: {
          id: FORUM_CHANNEL_ID,
          n: FORUM_CHANNEL_NAME,
          t: "forum",
          sv: "CreatorStudio",
          d: FORUM_CHANNEL_DESCRIPTION,
          pos: 0,
        },
      });
      row = { ...created, id: created.__id || created.id || FORUM_CHANNEL_ID };
    }
    const channel = {
      id: String(row.id || row.__id || FORUM_CHANNEL_ID),
      name: String(row.n || row.name || FORUM_CHANNEL_NAME),
      description: String(row.d || row.desc || FORUM_CHANNEL_DESCRIPTION),
    };
    forumChannelCache = { at: Date.now(), channel };
    return channel;
  }

  async function fetchForumRows(channel) {
    const data = await chatServerFetch(
      "/api/channels/" +
        encodeURIComponent(channel.id) +
        "/messages?newest=1&limit=500",
      { timeoutMs: 20000 },
    );
    return Array.isArray(data?.messages) ? data.messages : [];
  }

  async function postForumRow(payload) {
    return chatServerFetch("/api/bitboy_chat_messages", {
      method: "POST",
      timeoutMs: 20000,
      body: payload,
    });
  }

  async function createForumThreadRecord(channel, options) {
    const threadId =
      "f_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 7);
    const payload = {
      ch: channel.id,
      i: Date.now(),
      u: options.username,
      name: options.name || options.username,
      t: "forum-thread",
      kind: "forum-thread",
      m: options.title,
      threadId,
      title: options.title,
      body: options.body,
      cat: options.category,
      category: options.category,
      tags: forumTags(options.tags),
      createdAt: new Date().toISOString(),
      votes: 0,
      views: 0,
      pinned: Boolean(options.pinned),
      solved: Boolean(options.solved),
    };
    if (options.jobMeta) payload.jobMeta = options.jobMeta;
    if (options.bugMeta) payload.bugMeta = options.bugMeta;
    await postForumRow(payload);
    return threadId;
  }

  async function seedForumWelcome(channel) {
    try {
      await createForumThreadRecord(channel, {
        username: "TwilightStudio.Dev",
        name: "KittyFangs.exe",
        title: "Welcome to the Creator Studio Public Forums",
        category: "all",
        tags: ["Official", "Need Help", "Tutorial"],
        pinned: true,
        body: WELCOME_BODY,
      });
      forumDataCache.at = 0;
    } catch (error) {
      log("warning", "forum", "welcome seed failed", { message: error.message });
    }
  }

  app.get("/api/hub/forum", async (req, res) => {
    try {
      if (forumDataCache.data && Date.now() - forumDataCache.at < 8_000) {
        return res.json(forumDataCache.data);
      }
      const channel = await ensureForumChannel();
      let rows = await fetchForumRows(channel);
      let built = buildForum(rows);
      if (!built.threads.length) {
        await seedForumWelcome(channel);
        rows = await fetchForumRows(channel);
        built = buildForum(rows);
      }
      const payload = {
        ok: true,
        channel,
        threads: built.threads,
        replies: built.replies,
        stats: {
          threads: built.threads.length,
          replies: built.replies.length,
          solved: built.threads.filter((thread) => thread.solved).length,
          open: built.threads.filter((thread) => !thread.solved).length,
        },
      };
      forumDataCache = { at: Date.now(), data: payload };
      res.json(payload);
    } catch (error) {
      if (forumDataCache.data) {
        return res.json({
          ...forumDataCache.data,
          cached: true,
          warning: error.message,
        });
      }
      res.status(502).json({ error: error.message });
    }
  });

  app.post("/api/hub/forum/thread", async (req, res) => {
    try {
      const body = req.body || {};
      const username = String(body.username || "").trim();
      const title = String(body.title || "").trim().slice(0, 180);
      const content = String(body.body || "").trim();
      const category = String(body.category || "all").toLowerCase();
      if (!username) return res.status(400).json({ error: "username is required" });
      if (title.length < 4) {
        return res.status(400).json({ error: "Give the thread a clear title." });
      }
      if (content.length < 8) {
        return res.status(400).json({ error: "Write some post content first." });
      }
      if (!FORUM_CATEGORIES.has(category)) {
        return res.status(400).json({ error: "Unknown forum section." });
      }
      const channel = await ensureForumChannel();
      const threadId = await createForumThreadRecord(channel, {
        username,
        name: String(body.name || username).slice(0, 40),
        title,
        body: content,
        category,
        tags: body.tags,
        jobMeta: forumObject(body.jobMeta),
        bugMeta: forumObject(body.bugMeta),
      });
      forumDataCache.at = 0;
      log("info", "forum", "thread created", { threadId, username, category });
      res.json({ ok: true, threadId });
    } catch (error) {
      res.status(502).json({ error: error.message });
    }
  });

  app.post("/api/hub/forum/reply", async (req, res) => {
    try {
      const body = req.body || {};
      const username = String(body.username || "").trim();
      const threadId = String(body.threadId || "").trim();
      const content = String(body.body || "").trim();
      if (!username) return res.status(400).json({ error: "username is required" });
      if (!threadId) return res.status(400).json({ error: "threadId is required" });
      if (content.length < 2) {
        return res.status(400).json({ error: "Write a reply first." });
      }
      const channel = await ensureForumChannel();
      const replyId =
        "r_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 7);
      await postForumRow({
        ch: channel.id,
        i: Date.now(),
        u: username,
        name: String(body.name || username).slice(0, 40),
        t: "forum-reply",
        kind: "forum-reply",
        m: content,
        threadId,
        replyId,
        body: content,
        createdAt: new Date().toISOString(),
        isSolution: false,
        votes: 0,
      });
      forumDataCache.at = 0;
      res.json({ ok: true, replyId });
    } catch (error) {
      res.status(502).json({ error: error.message });
    }
  });

  app.post("/api/hub/forum/thread-update", async (req, res) => {
    try {
      const body = req.body || {};
      const threadId = String(body.threadId || "").trim();
      const patch = forumObject(body.patch) || {};
      if (!threadId) return res.status(400).json({ error: "threadId is required" });
      const safe = {};
      for (const key of ["votes", "views", "solved", "pinned"]) {
        if (key in patch) safe[key] = patch[key];
      }
      if (!Object.keys(safe).length) {
        return res.status(400).json({ error: "No supported thread fields to update." });
      }
      const channel = await ensureForumChannel();
      await postForumRow({
        ch: channel.id,
        i: Date.now(),
        u: String(body.username || "system"),
        t: "forum-thread-update",
        kind: "forum-thread-update",
        m: "",
        threadId,
        patch: safe,
      });
      forumDataCache.at = 0;
      res.json({ ok: true });
    } catch (error) {
      res.status(502).json({ error: error.message });
    }
  });

  app.post("/api/hub/forum/delete", async (req, res) => {
    try {
      const body = req.body || {};
      const username = String(body.username || "").trim();
      const threadId = String(body.threadId || "").trim();
      const replyId = String(body.replyId || "").trim();
      if (!username) return res.status(400).json({ error: "username is required" });
      if (!threadId && !replyId) {
        return res.status(400).json({ error: "threadId or replyId is required" });
      }
      const isAdmin = username.toLowerCase() === "twilightstudio.dev";
      const channel = await ensureForumChannel();
      const rows = await fetchForumRows(channel);
      const targets = rows.filter((row) => {
        const kind = String(row.kind || row.t || "").toLowerCase();
        if (replyId) {
          if (String(row.replyId || "") !== replyId) return false;
        } else if (String(row.threadId || "") !== threadId) {
          return false;
        }
        if (isAdmin) return true;
        return String(row.u || row.user || "").toLowerCase() === username.toLowerCase();
      });
      let deleted = 0;
      for (const row of targets) {
        const id = String(row.id || row.__id || "");
        if (!id) continue;
        try {
          await chatServerFetch("/api/bitboy_chat_messages/" + encodeURIComponent(id), {
            method: "DELETE",
            timeoutMs: 12000,
          });
          deleted += 1;
        } catch {}
      }
      forumDataCache.at = 0;
      res.json({ ok: true, deleted });
    } catch (error) {
      res.status(502).json({ error: error.message });
    }
  });

  app.post("/api/hub/forum/reply-update", async (req, res) => {
    try {
      const body = req.body || {};
      const replyId = String(body.replyId || "").trim();
      const patch = forumObject(body.patch) || {};
      if (!replyId) return res.status(400).json({ error: "replyId is required" });
      const safe = {};
      for (const key of ["isSolution", "votes"]) {
        if (key in patch) safe[key] = patch[key];
      }
      if (!Object.keys(safe).length) {
        return res.status(400).json({ error: "No supported reply fields to update." });
      }
      const channel = await ensureForumChannel();
      await postForumRow({
        ch: channel.id,
        i: Date.now(),
        u: String(body.username || "system"),
        t: "forum-reply-update",
        kind: "forum-reply-update",
        m: "",
        replyId,
        patch: safe,
      });
      forumDataCache.at = 0;
      res.json({ ok: true });
    } catch (error) {
      res.status(502).json({ error: error.message });
    }
  });
}
