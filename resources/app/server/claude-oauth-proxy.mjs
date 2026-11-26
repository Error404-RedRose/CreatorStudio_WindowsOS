import http from "node:http";
import fsp from "node:fs/promises";
import path from "node:path";
import { Readable, Transform } from "node:stream";
import { secretKind } from "./ai-key-vault.mjs";
import { refreshClaudeOAuthToken } from "./ai-accounts.mjs";
import {
  claudeCliEnv,
  claudeCliInfo,
  claudeCliVersion,
  codingMcpConfig,
  findClaudeCli,
  latestUserTurn,
  materializeImages,
  randomUuid,
  renderTranscript,
  runClaudeProcess,
  sessionKeyFor,
  workspaceContextFromSystem,
  writeTempJson,
} from "./claude-cli.mjs";

/**
 * Local Anthropic-compatible proxy for Claude Pro/Max subscription accounts.
 *
 * Two upstream modes exist:
 *
 *  - "cli"  (default when Claude Code is installed): every request is executed
 *    by `claude.exe -p` in headless print mode. Anthropic bills that as the
 *    official Claude Code client, so the Max plan is used instead of paid API
 *    credits. Agent requests are given Creator Studio's own MCP tool surface,
 *    plain requests run with no tools and a custom system prompt.
 *
 *  - "api": the original behaviour, replaying the OAuth token against
 *    api.anthropic.com with Claude Code headers. Kept as a fallback for
 *    machines without the CLI.
 *
 * Either way the wire format stays plain Anthropic Messages, so OpenCode and
 * the rest of the app do not need to know which upstream answered.
 */

const IDENTITY = "You are Claude Code, Anthropic's official CLI for Claude.";
const CLAUDE_CODE_BETAS = ["oauth-2025-04-20", "claude-code-20250219"];
const UPSTREAM = "https://api.anthropic.com";
const MAX_BODY = 32 * 1024 * 1024;
const MAX_SESSIONS = 400;

function mergeBetas(value) {
  const betas = new Set(
    String(value || "")
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean),
  );
  for (const beta of CLAUDE_CODE_BETAS) betas.add(beta);
  return [...betas].join(",");
}

/** Prepend the Claude Code identity block that the subscription API requires. */
function withIdentity(system) {
  const block = { type: "text", text: IDENTITY };
  if (!system) return [block];
  if (typeof system === "string") return [block, { type: "text", text: system }];
  if (Array.isArray(system)) {
    const first = system[0];
    if (first && first.type === "text" && String(first.text || "").includes("You are Claude Code")) {
      return system;
    }
    return [block, ...system];
  }
  return [block];
}

function systemText(system) {
  if (!system) return "";
  if (typeof system === "string") return system;
  if (Array.isArray(system)) {
    return system
      .map((part) => (part && part.type === "text" ? String(part.text || "") : ""))
      .filter(Boolean)
      .join("\n\n");
  }
  return "";
}

function sendJson(res, status, payload) {
  const text = JSON.stringify(payload);
  res.writeHead(status, {
    "content-type": "application/json",
    "content-length": Buffer.byteLength(text),
  });
  res.end(text);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY) {
        reject(new Error("Request body is too large for the Claude proxy."));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

export function claudeAccountBaseUrl(port) {
  return `http://127.0.0.1:${port}/v1`;
}

function anthropicMessage({ id, model, text, stopReason = "end_turn", usage = {} }) {
  return {
    id: id || `msg_bridge_${randomUuid().replace(/-/g, "").slice(0, 24)}`,
    type: "message",
    role: "assistant",
    model,
    content: text ? [{ type: "text", text }] : [{ type: "text", text: " " }],
    stop_reason: stopReason,
    stop_sequence: null,
    usage: {
      input_tokens: Number(usage.input_tokens || 0),
      output_tokens: Number(usage.output_tokens || 0),
      cache_read_input_tokens: Number(usage.cache_read_input_tokens || 0),
      cache_creation_input_tokens: Number(usage.cache_creation_input_tokens || 0),
    },
  };
}

function friendlyCliError(stderr, isError, resultText) {
  const raw = `${resultText || ""}\n${stderr || ""}`.trim();
  // Anthropic now bills third-party orchestration of a Pro/Max sign-in against
  // extra usage. Say that plainly instead of hiding it in a generic failure.
  if (/third[- ]party/i.test(raw) && /extra usage/i.test(raw)) {
    return (
      "Anthropic answered that this Claude Code run is being treated as a third-party app, " +
      "so it draws from extra usage rather than the plan. Creator Studio already runs the real " +
      "claude.exe bridge; there is no client-side switch that changes how Anthropic attributes " +
      "the account. Either add usage credit at claude.ai/settings/usage, or put an Anthropic API " +
      "key on the Claude backend in Settings > AI backends."
    );
  }
  if (/credit balance|extra usage|purchase credits/i.test(raw)) {
    return "Anthropic rejected the Claude Code plan request. Open claude.ai/settings/usage, check the plan is active, then retry.";
  }
  if (/not logged in|invalid api key|authentication|oauth token/i.test(raw)) {
    return "Claude Code could not authenticate. Run `claude setup-token` (or sign in to Claude Code), then save the new token in Settings > AI backends.";
  }
  if (isError && resultText) return String(resultText).slice(0, 600);
  const tail = raw.split(/\r?\n/).filter(Boolean).slice(-6).join(" ");
  return tail ? tail.slice(0, 600) : "The Claude Code CLI ended without returning a response.";
}

export async function startClaudeOAuthProxy({
  vault,
  log = () => {},
  models = [],
  resolveAccount = null,
  preferCli = true,
  appRoot = "",
  dataDir = "",
  port = 0,
  bridgeToken = "",
  bridgeTokenFile = "",
  cliTimeoutMs = 30 * 60 * 1000,
  preferredPort = 0,
}) {
  if (!vault) throw new Error("The Claude proxy needs the credential vault.");

  const cliPath = findClaudeCli();
  const useCli = Boolean(preferCli && cliPath && appRoot);
  const mode = useCli ? "cli" : "api";
  const sessions = new Map();

  if (useCli) {
    log("info", "claude-proxy", `Claude Code CLI bridge enabled (${claudeCliVersion() || cliPath})`);
  } else if (!cliPath) {
    log("warning", "claude-proxy", "Claude Code CLI not found, falling back to direct API replay");
  }

  const rememberSession = (key, id) => {
    sessions.set(key, { id, at: Date.now() });
    if (sessions.size > MAX_SESSIONS) {
      const oldest = [...sessions.entries()].sort((a, b) => a[1].at - b[1].at)[0];
      if (oldest) sessions.delete(oldest[0]);
    }
  };

  async function handleCli({ req, res, payload, record, renew }) {
    const model = String(payload.model || models[0] || "claude-sonnet-4-5");
    const system = systemText(payload.system);
    const workspace = workspaceContextFromSystem(payload.system);
    const hasTools = Array.isArray(payload.tools) && payload.tools.length > 0;
    const agentMode = Boolean(
      hasTools &&
        workspace.root &&
        /The selected workspace is:|Active workspace \(the only project to edit\):/i.test(system),
    );
    const stream = payload.stream === true;

    const turn = latestUserTurn(payload.messages);
    const transcript = renderTranscript(payload.messages);
    const tempDir = dataDir ? path.join(dataDir, "claude-cli") : undefined;
    let imageFiles = [];
    if (turn.images.length) {
      imageFiles = await materializeImages(turn.images, tempDir || undefined);
    }

    let prompt = agentMode ? turn.text || transcript : transcript;
    if (!prompt) prompt = "Continue.";
    if (imageFiles.length) {
      prompt += `\n\n[Attached image file${imageFiles.length > 1 ? "s" : ""}]\n${imageFiles.join("\n")}\nRead the image file${imageFiles.length > 1 ? "s" : ""} before answering.`;
    }

    const args = ["-p", prompt, "--output-format", "stream-json", "--verbose", "--include-partial-messages", "--model", model];
    args.push("--permission-mode", "dontAsk", "--permission-prompts", "none");
    let mcpFile = "";
    let sessionUsed = "";
    let sessionKey = "";

    if (agentMode) {
      const trusted = workspace.trusted;
      const config = codingMcpConfig({
        appRoot,
        dataDir,
        port,
        token: bridgeToken,
        tokenFile: bridgeTokenFile,
        root: workspace.root,
        trusted,
      });
      mcpFile = await writeTempJson(tempDir, "mcp", config);
      args.push("--mcp-config", mcpFile, "--strict-mcp-config");
      args.push("--allowedTools", "mcp__coding", "Read", "Glob", "Grep");
      args.push("--disallowedTools", "Bash", "Edit", "Write", "NotebookEdit", "WebFetch", "Task");
      if (system) args.push("--append-system-prompt", system.slice(0, 60000));
      const firstUser = (payload.messages || []).find((message) => message && message.role === "user");
      sessionKey = sessionKeyFor([workspace.root, model, system.slice(0, 400), renderTranscript(firstUser ? [firstUser] : [])]);
      const known = sessions.get(sessionKey);
      if (known) {
        sessionUsed = known.id;
        known.at = Date.now();
        args.push("--resume", known.id);
      } else {
        const id = randomUuid();
        sessionUsed = id;
        rememberSession(sessionKey, id);
        args.push("--session-id", id);
      }
    } else {
      const baseSystem =
        system ||
        "You are a helpful assistant embedded in Creator Studio. Answer directly and concisely.";
      args.push("--system-prompt", baseSystem.slice(0, 60000));
      args.push("--no-session-persistence", "--disable-slash-commands", "--strict-mcp-config");
      if (imageFiles.length) {
        args.push("--tools", "Read", "--allowedTools", "Read");
      } else {
        args.push("--tools", "");
      }
      args.push("--disallowedTools", "Bash", "Edit", "Write", "NotebookEdit", "WebFetch", "Task");
    }

    const started = Date.now();
    let text = "";
    let usage = {};
    let resultText = "";
    let isError = false;
    let stopReason = "end_turn";
    let blockOpen = false;
    let closed = false;
    let ping = null;
    let proc = null;

    if (stream) {
      res.writeHead(200, {
        "content-type": "text/event-stream",
        "cache-control": "no-cache, no-transform",
        connection: "keep-alive",
        "x-accel-buffering": "no",
        "request-id": `req_bridge_${randomUuid().replace(/-/g, "").slice(0, 24)}`,
      });
      res.write(
        `event: message_start\ndata: ${JSON.stringify({
          type: "message_start",
          message: {
            id: `msg_bridge_${randomUuid().replace(/-/g, "").slice(0, 24)}`,
            type: "message",
            role: "assistant",
            model,
            content: [],
            stop_reason: null,
            stop_sequence: null,
            usage: { input_tokens: 0, output_tokens: 1 },
          },
        })}\n\n`,
      );
      ping = setInterval(() => {
        if (!closed) res.write(`event: ping\ndata: ${JSON.stringify({ type: "ping" })}\n\n`);
      }, 15000);
      ping.unref?.();
    }

    const writeEvent = (event, data) => {
      if (closed || !stream) return;
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    const openBlock = () => {
      if (blockOpen) return;
      blockOpen = true;
      writeEvent("content_block_start", { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } });
    };

    const finishStream = (error) => {
      if (closed) return;
      if (stream) {
        if (error) {
          writeEvent("error", { type: "error", error: { type: "api_error", message: error } });
        } else {
          openBlock();
          writeEvent("content_block_stop", { type: "content_block_stop", index: 0 });
          writeEvent("message_delta", {
            type: "message_delta",
            delta: { stop_reason: stopReason, stop_sequence: null },
            usage: {
              input_tokens: Number(usage.input_tokens || 0),
              output_tokens: Number(usage.output_tokens || 0),
              cache_read_input_tokens: Number(usage.cache_read_input_tokens || 0),
              cache_creation_input_tokens: Number(usage.cache_creation_input_tokens || 0),
            },
          });
          writeEvent("message_stop", { type: "message_stop" });
        }
        res.end();
      }
      closed = true;
      if (ping) clearInterval(ping);
      if (mcpFile) fsp.unlink(mcpFile).catch(() => {});
    };

    const runOnce = async () => {
      proc = runClaudeProcess({
        cli: cliPath,
        args,
        env: claudeCliEnv(record.access),
        cwd: agentMode ? workspace.root : dataDir || undefined,
        timeoutMs: cliTimeoutMs,
        onStderr: (err) => {
          // Keep the tail for error reporting only.
          if (err && /error/i.test(err)) log("debug", "claude-proxy", "claude stderr", { tail: err.slice(-240) });
        },
        onEvent: (event) => {
          if (!event || typeof event !== "object") return;
          if (event.type === "stream_event" && event.event) {
            const inner = event.event;
            if (inner.type === "content_block_delta" && inner.delta && inner.delta.type === "text_delta") {
              const piece = String(inner.delta.text || "");
              if (piece) {
                openBlock();
                text += piece;
                writeEvent("content_block_delta", {
                  type: "content_block_delta",
                  index: 0,
                  delta: { type: "text_delta", text: piece },
                });
              }
            }
            if (inner.type === "message_delta" && inner.usage) usage = { ...usage, ...inner.usage };
            return;
          }
          if (event.type === "result") {
            isError = Boolean(event.is_error);
            resultText = String(event.result || resultText || "");
            if (event.usage) usage = { ...event.usage, ...usage };
            if (event.stop_reason) stopReason = event.stop_reason;
            if (isError && event.subtype && /limit|error/i.test(event.subtype) && resultText) {
              stopReason = "end_turn";
            }
          }
        },
      });
      const outcome = await proc.done;
      return outcome;
    };

    // Only a genuinely aborted response should kill the CLI turn. Listen on
    // the response: a request "close" also fires when the body is consumed.
    res.on("close", () => {
      if (!closed && !res.writableEnded) {
        closed = true;
        if (ping) clearInterval(ping);
        if (mcpFile) fsp.unlink(mcpFile).catch(() => {});
        try {
          proc?.kill();
        } catch {}
      }
    });

    let outcome = await runOnce();
    // A persisted CLI session can disappear (purge, new profile). Retry once
    // with a brand new session and the full transcript instead of failing.
    if (agentMode && sessionUsed && (isError || outcome.code !== 0) && sessions.has(sessionKey)) {
      sessions.delete(sessionKey);
      const retryId = randomUuid();
      rememberSession(sessionKey, retryId);
      const retryArgs = args
        .filter((value, index) => {
          const prev = args[index - 1];
          return prev !== "--resume" && prev !== "--session-id" && value !== sessionUsed;
        })
        .concat(["--session-id", retryId]);
      text = "";
      isError = false;
      resultText = "";
      proc = runClaudeProcess({
        cli: cliPath,
        args: retryArgs,
        env: claudeCliEnv(record.access),
        cwd: workspace.root,
        timeoutMs: cliTimeoutMs,
        onEvent: (event) => {
          if (event && event.type === "stream_event" && event.event) {
            const inner = event.event;
            if (inner.type === "content_block_delta" && inner.delta && inner.delta.type === "text_delta") {
              const piece = String(inner.delta.text || "");
              if (piece) {
                text += piece;
                if (!closed && stream) {
                  // Continue the already open text block.
                  res.write(
                    `event: content_block_delta\ndata: ${JSON.stringify({
                      type: "content_block_delta",
                      index: 0,
                      delta: { type: "text_delta", text: piece },
                    })}\n\n`,
                  );
                }
              }
            }
            if (inner.type === "message_delta" && inner.usage) usage = { ...usage, ...inner.usage };
            return;
          }
          if (event && event.type === "result") {
            isError = Boolean(event.is_error);
            resultText = String(event.result || resultText || "");
            if (event.usage) usage = { ...event.usage, ...usage };
          }
        },
      });
      outcome = await proc.done;
    }

    log(isError || outcome.code !== 0 ? "warning" : "info", "claude-proxy", "Claude Code CLI turn", {
      mode: agentMode ? "agent" : "plain",
      model,
      ms: Date.now() - started,
      code: outcome.code,
      textChars: text.length,
      workspace: agentMode ? workspace.root : undefined,
    });

    if (!stream) {
      if (isError || outcome.code !== 0) {
        // Token can expire mid-flight; refresh once and retry before failing.
        if (!(await renew())) {
          sendJson(res, 400, {
            type: "error",
            error: { type: "api_error", message: friendlyCliError(outcome.stderr, isError, resultText) },
          });
          if (mcpFile) fsp.unlink(mcpFile).catch(() => {});
          return;
        }
        proc = runClaudeProcess({
          cli: cliPath,
          args,
          env: claudeCliEnv(record.access),
          cwd: agentMode ? workspace.root : dataDir || undefined,
          timeoutMs: cliTimeoutMs,
          onEvent: (event) => {
            if (event && event.type === "result") {
              isError = Boolean(event.is_error);
              resultText = String(event.result || resultText || "");
              text = text || resultText;
              if (event.usage) usage = event.usage;
            }
          },
        });
        outcome = await proc.done;
      }
      if (mcpFile) fsp.unlink(mcpFile).catch(() => {});
      if (isError || outcome.code !== 0 || !text.trim()) {
        sendJson(res, 400, {
          type: "error",
          error: { type: "api_error", message: friendlyCliError(outcome.stderr, isError, resultText) },
        });
        return;
      }
      sendJson(res, 200, anthropicMessage({ model, text: text.trim(), stopReason, usage }));
      return;
    }

    if (isError || (outcome.code !== 0 && !text.trim())) {
      finishStream(friendlyCliError(outcome.stderr, isError, resultText));
      return;
    }
    if (!text.trim() && resultText.trim()) {
      openBlock();
      text = resultText;
      writeEvent("content_block_delta", { type: "content_block_delta", index: 0, delta: { type: "text_delta", text } });
    }
    finishStream(null);
  }

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url || "/", "http://127.0.0.1");
    const pathname = url.pathname.replace(/\/+$/, "");

    if (pathname === "/v1/models" && req.method === "GET") {
      sendJson(res, 200, {
        data: models.map((id) => ({
          id,
          type: "model",
          display_name: id,
          created_at: "2025-01-01T00:00:00Z",
        })),
        has_more: false,
      });
      return;
    }

    if (pathname === "/health") {
      sendJson(res, 200, { ok: true, mode, cli: claudeCliInfo() });
      return;
    }

    if (!pathname.startsWith("/v1/messages")) {
      sendJson(res, 404, { type: "error", error: { type: "not_found_error", message: "Unknown proxy path." } });
      return;
    }

    let record = (typeof resolveAccount === "function" && resolveAccount()) || null;
    if (!record) record = vault.activeFor("claude", "anthropic");
    if (!record || record.kind !== "account" || !record.access) {
      sendJson(res, 409, {
        type: "error",
        error: {
          type: "authentication_error",
          message: "No Claude account is selected. Open Settings > AI backends and choose a Claude account.",
        },
      });
      return;
    }
    // Only an OAuth token (sk-ant-oat...) is billed against the Claude Max plan.
    // API and usage keys always draw from paid credits, so say that plainly
    // instead of forwarding a request Anthropic will reject.
    if (secretKind(record.access) !== "oauth") {
      sendJson(res, 409, {
        type: "error",
        error: {
          type: "authentication_error",
          message:
            "The selected Claude credential is an API/usage key, so it bills paid credits. Choose the Claude Max plan account (OAuth) in Settings > AI backends, or paste a token that starts with sk-ant-oat.",
        },
      });
      return;
    }

    /** Renew the OAuth access token and persist it in the encrypted vault. */
    const renew = async () => {
      if (!record.refresh) return false;
      try {
        const tokens = await refreshClaudeOAuthToken(record.refresh);
        await vault.update(record.id, {
          access: tokens.access,
          refresh: tokens.refresh,
          expires: tokens.expires,
        });
        record = vault.find(record.id) || record;
        log("info", "claude-proxy", "Claude Max sign-in refreshed");
        return true;
      } catch (error) {
        log("warning", "claude-proxy", `Claude sign-in refresh failed: ${error.message}`);
        return false;
      }
    };

    const expires = Number(record.expires || 0);
    if (expires && expires < Date.now() + 60_000 && !(await renew())) {
      sendJson(res, 401, {
        type: "error",
        error: {
          type: "authentication_error",
          message: "The Claude sign-in has expired. Press Sign in to Claude Code, then use the account again.",
        },
      });
      return;
    }

    let body;
    try {
      body = await readBody(req);
    } catch (error) {
      sendJson(res, 413, { type: "error", error: { type: "invalid_request_error", message: error.message } });
      return;
    }

    let payload = null;
    if (body.length) {
      try {
        payload = JSON.parse(body.toString("utf8"));
      } catch {
        sendJson(res, 400, {
          type: "error",
          error: { type: "invalid_request_error", message: "The proxy received invalid JSON." },
        });
        return;
      }
    }

    if (useCli && payload && typeof payload === "object") {
      try {
        await handleCli({ req, res, payload, record, renew });
      } catch (error) {
        log("error", "claude-proxy", `Claude CLI bridge failed: ${error?.message || error}`);
        if (!res.headersSent) {
          sendJson(res, 502, {
            type: "error",
            error: { type: "api_error", message: `Claude CLI bridge failed: ${error?.message || "unknown error"}` },
          });
        } else {
          res.destroy();
        }
      }
      return;
    }

    if (payload && typeof payload === "object" && pathname === "/v1/messages") {
      payload.system = withIdentity(payload.system);
    }

    const controller = new AbortController();
    const onClose = () => {
      if (!res.writableEnded) controller.abort();
    };
    res.on("close", onClose);

    const headers = {
      "content-type": "application/json",
      accept: req.headers.accept || "application/json",
      authorization: `Bearer ${record.access}`,
      "anthropic-version": String(req.headers["anthropic-version"] || "2023-06-01"),
      "anthropic-beta": mergeBetas(req.headers["anthropic-beta"]),
      "user-agent": "claude-cli/2.0.30 (external, cli)",
      "x-app": "cli",
    };

    try {
      let upstream = await fetch(UPSTREAM + pathname, {
        method: req.method || "POST",
        headers,
        body: payload ? JSON.stringify(payload) : undefined,
        signal: controller.signal,
      });
      // A token can expire between the check above and the upstream call.
      if (upstream.status === 401 && (await renew())) {
        headers.authorization = `Bearer ${record.access}`;
        upstream = await fetch(UPSTREAM + pathname, {
          method: req.method || "POST",
          headers,
          body: payload ? JSON.stringify(payload) : undefined,
          signal: controller.signal,
        });
      }

      const outHeaders = {
        "content-type": upstream.headers.get("content-type") || "application/json",
        "cache-control": "no-cache",
        connection: "keep-alive",
      };
      const requestId = upstream.headers.get("request-id") || upstream.headers.get("anthropic-request-id");
      if (requestId) outHeaders["request-id"] = requestId;
      res.writeHead(upstream.status, outHeaders);

      if (upstream.status >= 400) {
        const text = await upstream.text().catch(() => "");
        log("warning", "claude-proxy", `Anthropic answered HTTP ${upstream.status}`, {
          status: upstream.status,
          body: text.slice(0, 400),
        });
        res.end(text);
        return;
      }

      if (!upstream.body) {
        res.end();
        return;
      }
      const stream = Readable.fromWeb(upstream.body).pipe(
        new Transform({
          transform(chunk, _encoding, callback) {
            callback(null, chunk);
          },
        }),
      );
      stream.on("error", () => res.destroy());
      stream.pipe(res);
    } catch (error) {
      if (controller.signal.aborted) return;
      log("error", "claude-proxy", `Proxy request failed: ${error?.message || error}`);
      if (!res.headersSent) {
        sendJson(res, 502, {
          type: "error",
          error: { type: "api_error", message: `Claude proxy failed: ${error?.message || "unknown error"}` },
        });
      } else {
        res.destroy();
      }
    } finally {
      res.off("close", onClose);
    }
  });

  // Node closes an idle keep-alive socket after 5s by default. OpenCode pools
  // connections to this proxy, so a recycled socket shows up in the chat as
  // "Cannot connect to API: ECONNRESET". Claude CLI turns also stream for
  // longer than the default 5 minute request timeout.
  server.keepAliveTimeout = 120_000;
  server.headersTimeout = 130_000;
  server.requestTimeout = 0;
  server.timeout = 0;

  // Answer a malformed or half-closed client with a clean response instead of
  // letting the kernel reset the connection.
  server.on("clientError", (error, socket) => {
    if (!socket || socket.destroyed) return;
    if (!socket.writable) {
      socket.destroy();
      return;
    }
    try {
      socket.end("HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n");
    } catch {
      socket.destroy();
    }
  });

  // A stable port matters: OpenCode bakes baseURL into provider configs when
  // its runtime starts, so an ephemeral port would break every live session the
  // moment the backend restarts (surfacing as ECONNRESET in the chat).
  const listen = (candidate) =>
    new Promise((resolve, reject) => {
      const onError = (error) => {
        server.off("listening", onListening);
        reject(error);
      };
      const onListening = () => {
        server.off("error", onError);
        resolve();
      };
      server.once("error", onError);
      server.once("listening", onListening);
      server.listen(candidate, "127.0.0.1");
    });

  let bound = false;
  const basePort = Math.max(0, Math.min(65535, Number(preferredPort) || 0));
  if (basePort) {
    for (let offset = 0; offset < 10 && !bound; offset += 1) {
      const candidate = basePort + offset;
      if (candidate > 65535) break;
      try {
        await listen(candidate);
        bound = true;
      } catch (error) {
        if (error && error.code === "EADDRINUSE") continue;
        throw error;
      }
    }
  }
  if (!bound) await listen(0);
  const address = server.address();
  const listeningPort = typeof address === "object" && address ? address.port : 0;
  log(
    "info",
    "claude-proxy",
    `Claude account proxy listening on http://127.0.0.1:${listeningPort} (${mode})`,
  );

  return {
    port: listeningPort,
    baseUrl: claudeAccountBaseUrl(listeningPort),
    mode,
    cli: claudeCliInfo(),
    close: () => new Promise((resolve) => server.close(() => resolve())),
  };
}
