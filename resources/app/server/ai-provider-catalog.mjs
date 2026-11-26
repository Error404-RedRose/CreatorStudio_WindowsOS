/**
 * Provider catalog for the three Creator Studio AI backends.
 *
 * Every provider entry describes how OpenCode should be configured so the
 * backend keeps the same agents, tools, MCP servers, approvals and per-applet
 * model memory. `kind` is only used by the UI to group the dropdown.
 */

const OPENCODE_GO_MODELS = [
  "claude-sonnet-4-5",
  "claude-opus-4-5",
  "claude-haiku-4-5",
  "gpt-5.2",
  "gpt-5-mini",
  "gemini-3-pro",
  "gemini-3-flash",
  "deepseek-v4.1-flash",
  "glm-5.3-flash",
  "qwen3.8-flash",
  "minimax-m3.1-flash",
];

export const ANTHROPIC_MODELS = [
  "claude-opus-4-5",
  "claude-sonnet-4-5",
  "claude-haiku-4-5",
  "claude-sonnet-4-20250514",
  "claude-3-7-sonnet-latest",
];

export const PROVIDER_CATALOG = {
  opencode: [
    {
      id: "opencode-go",
      name: "OpenCode Go",
      kind: "opencode",
      baseUrl: "https://opencode.ai/inference/go/openai/v1",
      apiStyle: "openai",
      models: OPENCODE_GO_MODELS,
      note: "OpenCode Go account. Add another Go account and press Swap to change the whole backend to it.",
    },
    {
      id: "opencode",
      name: "OpenCode Zen",
      kind: "opencode",
      baseUrl: "https://opencode.ai/inference/openai/v1",
      apiStyle: "openai",
      models: OPENCODE_GO_MODELS,
      note: "OpenCode Zen pay-as-you-go account.",
    },
    {
      id: "anthropic",
      name: "Anthropic API",
      kind: "opencode",
      baseUrl: "",
      apiStyle: "anthropic",
      models: ["claude-opus-4-5", "claude-sonnet-4-5", "claude-haiku-4-5"],
      native: true,
      note: "Anthropic API key. The key is written to OpenCode's credential file and OpenCode supplies the endpoint and model list.",
    },
    {
      id: "ollama-cloud",
      name: "Ollama Cloud",
      kind: "opencode",
      baseUrl: "https://ollama.com/v1",
      apiStyle: "openai",
      models: ["qwen3-coder:480b", "gpt-oss:120b", "deepseek-v3.1:671b"],
      note: "Ollama Cloud API key.",
    },
    {
      id: "openrouter",
      name: "OpenRouter",
      kind: "opencode",
      baseUrl: "https://openrouter.ai/api/v1",
      apiStyle: "openai",
      models: [],
      note: "One key for many models. Models are read from OpenRouter after you add the key.",
    },
    {
      id: "openai",
      name: "OpenAI",
      kind: "opencode",
      baseUrl: "https://api.openai.com/v1",
      apiStyle: "openai",
      models: ["gpt-5.2", "gpt-5-mini", "gpt-4.1"],
      note: "OpenAI API key.",
    },
    {
      id: "google",
      name: "Google AI Studio",
      kind: "opencode",
      baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai/",
      apiStyle: "openai",
      models: ["gemini-3-pro", "gemini-3-flash"],
      note: "Google AI Studio key (OpenAI-compatible endpoint).",
    },
    {
      id: "groq",
      name: "Groq",
      kind: "opencode",
      baseUrl: "https://api.groq.com/openai/v1",
      apiStyle: "openai",
      models: ["llama-3.3-70b-versatile", "qwen/qwen3-32b"],
      note: "Groq API key.",
    },
    {
      id: "deepseek",
      name: "DeepSeek",
      kind: "opencode",
      baseUrl: "https://api.deepseek.com/v1",
      apiStyle: "openai",
      models: ["deepseek-chat", "deepseek-reasoner"],
      note: "DeepSeek API key.",
    },
    {
      id: "xai",
      name: "xAI Grok",
      kind: "opencode",
      baseUrl: "https://api.x.ai/v1",
      apiStyle: "openai",
      models: ["grok-4", "grok-3-mini"],
      note: "xAI API key.",
    },
    {
      id: "mistral",
      name: "Mistral",
      kind: "opencode",
      baseUrl: "https://api.mistral.ai/v1",
      apiStyle: "openai",
      models: ["mistral-large-latest", "codestral-latest"],
      note: "Mistral API key.",
    },
    {
      id: "ollama-local",
      name: "Ollama on this PC",
      kind: "local",
      baseUrl: "http://127.0.0.1:11434/v1",
      apiStyle: "openai",
      models: [],
      needsKey: false,
      note: "Detected automatically when Ollama is running.",
    },
  ],
  claude: [
    {
      id: "anthropic-account",
      name: "Claude Pro / Max account",
      kind: "account",
      authType: "oauth",
      baseUrl: "https://api.anthropic.com/v1",
      apiStyle: "anthropic",
      models: ANTHROPIC_MODELS,
      providerId: "claude-local",
      needsKey: false,
      signIn: "claude",
      note: "Sign in with your Claude email account (Pro or Max). Credentials stay encrypted on this PC and Creator Studio proxies them through the local Claude account bridge, so tools and streaming work.",
    },
    {
      id: "anthropic",
      name: "Anthropic API",
      kind: "anthropic",
      baseUrl: "https://api.anthropic.com/v1",
      apiStyle: "anthropic",
      models: ANTHROPIC_MODELS,
      docsUrl: "https://console.anthropic.com/settings/keys",
      note: "Claude Desktop is a chat app with no model API. Use an Anthropic API key here (or a Claude-compatible proxy) so Claude can drive Creator Studio tools.",
    },
    {
      id: "openrouter",
      name: "OpenRouter (Claude models)",
      kind: "proxy",
      baseUrl: "https://openrouter.ai/api/v1",
      apiStyle: "openai",
      models: ["anthropic/claude-sonnet-4.5", "anthropic/claude-opus-4.5"],
      docsUrl: "https://openrouter.ai/keys",
      note: "Use a Claude model through an OpenRouter key.",
    },
    {
      id: "custom",
      name: "Claude-compatible proxy",
      kind: "proxy",
      baseUrl: "",
      apiStyle: "anthropic",
      models: ["claude-sonnet-4-5"],
      note: "Any local proxy that speaks the Anthropic Messages API.",
    },
  ],
  hermes: [
    {
      id: "hermes-nous-account",
      name: "Nous account (Hermes)",
      kind: "account",
      authType: "token",
      baseUrl: "https://welcome-api.nousresearch.com/v1",
      apiStyle: "openai",
      models: ["nous/welcome"],
      providerId: "hermes-nous",
      needsKey: false,
      signIn: "hermes",
      note: "Imports the Nous account token from the Hermes sign-in on this PC. Add more accounts to swap between them.",
    },
    {
      id: "hermes-nous",
      name: "Hermes - Nous free",
      kind: "hermes",
      baseUrl: "https://welcome-api.nousresearch.com/v1",
      apiStyle: "openai",
      models: ["nous/welcome"],
      note: "Read from the Hermes auth.json when Hermes is signed in.",
    },
    {
      id: "hermes-blitzboy",
      name: "Hermes - BlitzBoy",
      kind: "hermes",
      baseUrl: "https://api.abliteration.ai/v1",
      apiStyle: "openai",
      models: ["abliterated-model", "abliterated-model-large"],
      note: "Read from the Hermes .env when configured.",
    },
    {
      id: "openrouter",
      name: "OpenRouter",
      kind: "proxy",
      baseUrl: "https://openrouter.ai/api/v1",
      apiStyle: "openai",
      models: [],
      note: "Run Hermes with any OpenRouter model.",
    },
    {
      id: "ollama-local",
      name: "Ollama on this PC",
      kind: "local",
      baseUrl: "http://127.0.0.1:11434/v1",
      apiStyle: "openai",
      models: [],
      needsKey: false,
      note: "Local Hermes models through Ollama.",
    },
    {
      id: "custom",
      name: "OpenAI-compatible endpoint",
      kind: "proxy",
      baseUrl: "",
      apiStyle: "openai",
      models: [],
      note: "Any OpenAI-compatible server on this PC or your network.",
    },
  ],
};

export function listProviders(backend) {
  return PROVIDER_CATALOG[backend] || [];
}

export function findProvider(backend, providerId) {
  return listProviders(backend).find((provider) => provider.id === providerId) || null;
}

/**
 * The OpenCode provider id that actually serves a catalog entry. Account
 * sign-ins use the built-in provider (anthropic), every other Claude/Hermes
 * entry is served through the custom local provider block.
 */
export function opencodeProviderIdFor(backend, providerId) {
  const provider = findProvider(backend, providerId);
  if (provider?.providerId) return provider.providerId;
  if (backend === "claude") return "claude-local";
  if (backend === "hermes") return "hermes-local";
  return providerId;
}

/** Provider ids that map onto a built-in OpenCode provider instead of a custom block. */
export const OPENCODE_NATIVE_PROVIDERS = new Set([
  "opencode",
  "opencode-go",
  "ollama-cloud",
  "ollama-local",
  "openrouter",
  "openai",
  "google",
  "groq",
  "deepseek",
  "xai",
  "mistral",
  "anthropic",
]);

/** Build the safe catalog payload for Settings. */
export function buildProviderCatalog({ discovery = null, vault = null, opencodeProviders = null } = {}) {
  const detected = {
    opencode: new Set(),
    claude: new Set(),
    hermes: new Set(),
  };
  for (const provider of discovery?.opencode?.providers || []) {
    detected.opencode.add(String(provider.id || ""));
  }
  for (const endpoint of discovery?.endpoints || []) {
    detected[endpoint.backend]?.add(endpoint.providerId || endpoint.source || "");
  }
  for (const key of vault?.rawRecords?.() || []) {
    detected[key.backend]?.add(key.providerId);
  }

  const backends = {};
  for (const backend of ["opencode", "claude", "hermes"]) {
    backends[backend] = listProviders(backend).map((provider) => {
      const credentials = vault?.list?.(backend) || [];
      const matching = credentials.filter(
        (record) => record.providerId === provider.id || record.providerId === provider.providerId,
      );
      return {
        ...provider,
        needsKey: provider.needsKey !== false,
        authType: provider.authType || "key",
        detected: detected[backend].has(provider.id),
        hasKey: matching.length > 0,
        accounts: matching.length,
        activeCredentialId: matching.find((record) => record.active)?.id || "",
      };
    });
  }
  // OpenCode ships its own provider registry (models.dev). Merge every provider
  // the running runtime reports, so Settings lists the whole catalog instead of
  // only the small curated set above. Native providers keep OpenCode's own
  // endpoint and model list; their API keys go into the runtime credential file.
  const live = Array.isArray(opencodeProviders) ? opencodeProviders : [];
  const curated = backends.opencode;
  const byId = new Map(curated.map((provider) => [provider.id, provider]));
  const extra = [];
  // Providers owned by the Claude or Hermes backends must never be listed in
  // the OpenCode section; each backend has its own pill above the provider box.
  const otherBackendProvider = (id) => /^hermes(?:-|$)/i.test(id) || /^claude-local$/i.test(id);
  for (const provider of live) {
    const id = String(provider?.id || "").trim();
    if (!id) continue;
    if (otherBackendProvider(id)) continue;
    detected.opencode.add(id);
    const models = (Array.isArray(provider.models) ? provider.models : [])
      .map((model) => String(model?.id || model || "").trim())
      .filter(Boolean);
    const existing = byId.get(id);
    if (existing) {
      existing.available = provider.connected !== false;
      if (!existing.models.length && models.length) existing.models = models;
      existing.modelCount = models.length || existing.models.length;
      continue;
    }
    const credentials = vault?.list?.("opencode") || [];
    const matching = credentials.filter((record) => record.providerId === id);
    extra.push({
      id,
      name: String(provider.name || id),
      kind: "opencode",
      baseUrl: "",
      apiStyle: "openai",
      models,
      modelCount: models.length,
      native: true,
      available: provider.connected !== false,
      needsKey: true,
      authType: "key",
      detected: true,
      hasKey: matching.length > 0,
      accounts: matching.length,
      activeCredentialId: matching.find((record) => record.active)?.id || "",
      note: `${provider.name || id} is built into OpenCode, so OpenCode supplies its endpoint and model list. Save an API key here to sign this provider in.`,
    });
  }
  extra.sort((a, b) => a.name.localeCompare(b.name));
  backends.opencode = [...curated, ...extra];

  return {
    backends,
    detected: Object.fromEntries(Object.entries(detected).map(([key, set]) => [key, [...set].filter(Boolean)])),
    opencodeLive: live.length,
  };
}
