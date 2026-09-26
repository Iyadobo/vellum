# Vellum backend contract — router (`Vellum 5`)

Mechanism copied (not integrated) from OmniRoute: a pool of free providers, quota/health-aware auto-fallback, circuit
breakers, and live model catalogs. Implemented natively in Rust. No OmniRoute code, no local gateway server.

## Providers

| id | label | auth | base URL | catalog |
|---|---|---|---|---|
| `pollinations` | Pollinations (keyless) | none | `https://text.pollinations.ai/openai` | `GET /models` |
| `opencode-zen` | OpenCode Zen | Bearer | `https://opencode.ai/zen/v1` | `GET /models` |
| `openrouter` | OpenRouter | Bearer | `https://openrouter.ai/api/v1` | `GET /models` (rich) |
| `groq` | Groq | Bearer | `https://api.groq.com/openai/v1` | `GET /models` |
| `google` | Google Gemini | Bearer | `https://generativelanguage.googleapis.com/v1beta/openai` | `GET /models` |
| `zai` | Z.AI | Bearer | `https://api.z.ai/api/paas/v4` | `GET /models` |
| `custom` | Custom endpoint | optional | user-provided | `GET /models` |

Chat is always OpenAI `POST {base}/chat/completions` with `stream: true` (SSE). Keyless providers work with no key.
Verified live on this machine: pollinations keyless chat passes; opencode-zen returns 401 without a key (its `-free`
models need a free Zen key).

## Config

- Config file: `%APPDATA%\vellum\providers.json` — `{ version, order: [ids], providers: { id: { enabled, apiKey?, baseUrl? } } }`.
- State file: `%APPDATA%\vellum\router-state.json` — `{ lastGood: { provider, model }, observedReasoning: { "provider/model": true }, failures: { provider: { count, openUntilMs } } }`.
- First run: `pollinations` enabled; if env `ZAI_API_KEY` exists, seed `zai.apiKey` from it.
- Keys never leave the machine except as `Authorization` headers to that provider. Never log keys.

## RouterModel (catalog entry)

```ts
{ id, provider, providerLabel, model, label,
  contextWindow: number | null,   // null = unknown
  vision: boolean | null,         // null = unknown
  reasoning: boolean | null,      // null = unknown
  paramsBillions: number | null,  // null = unknown
  free: boolean | null, source: "api" | "family" | "observed" | "unknown" }
```

Classification order: (1) provider API metadata when present (OpenRouter `context_length`,
`architecture.input_modalities`, `supported_parameters`; Groq `context_window`; Pollinations `vision`/`reasoning` flags;
OpenRouter `pricing` → free); (2) family table parsed from the model id (regex `(\d+(?:\.\d+)?)b` → params; families:
claude/gemini/gpt/grok/deepseek/glm/kimi/qwen/llama/nemotron/minimax…); (3) runtime observation stored in state file
(reasoning deltas seen → `reasoning: true`, `source: "observed"`); otherwise `null` and the UI shows "unknown".

## Commands (Tauri `invoke`)

- `router_config_get() -> ConfigPublic` — providers with `hasKey: bool` (never the key), `enabled`, `baseUrl?`, `kind`.
- `router_config_set(update)` — `{ provider, apiKey?, enabled?, baseUrl? }` | `{ order: [ids] }`; returns `ConfigPublic`.
- `router_catalog(refresh: bool) -> Catalog` — `{ fetchedAt, models, providers: [{id,label,kind,enabled,hasKey,ok,error?,modelCount}] }`; 10-minute cache, per-provider errors non-fatal.
- `router_probe(provider: String) -> { ok, latencyMs, message }` — catalog fetch as the probe.
- `router_chat_start(requestId: String, messages: [{role, content}], model: Option<String>, reasoning: Option<bool>)`.
- `router_chat_cancel(requestId: String)`.

## Events — `router://{requestId}`

```ts
{ type: "start", provider, providerLabel, model }
{ type: "switch", toProvider, toModel, reason }        // emitted before a fallback attempt succeeds
{ type: "text", delta }
{ type: "reasoning", delta }                            // delta.reasoning | delta.reasoning_content | delta.thinking
{ type: "done", elapsedMs }
{ type: "error", message }                              // only when every candidate failed
```

Reasoning request body: `reasoning: true` (OpenRouter) / `thinking: { type: "enabled" }` (zai) / `reasoning_effort: "medium"` (groq) — send each only to providers that accept it; ignore 400s caused by these fields and retry once without them.

## Routing algorithm (auto)

1. Candidates: models from enabled providers with `free != false`; skip providers with an open circuit
   (`failures.count >= 3` → open for `min(60s * count, 10min)`).
2. Order: config `order`, then within a provider: `reasoning = true` first, then `vision = true`, then catalog order.
3. Stream attempt: 45 s to first byte, then stream until done. On network error / 401 / 402 / 403 / 429 / 5xx:
   record failure, emit `switch`, try next candidate. On first token: clear failures, persist `lastGood`.
4. Pinned model (id with `/`): only that model, still with retry-once on transient errors.
5. Cancel: `router_chat_cancel` aborts mid-stream and emits `{type: "abort"}`… (frontend treats like done).

## Rust layout

- `src-tauri/src/router/{mod.rs,config.rs,providers.rs,catalog.rs,chat.rs}`
- `lib.rs`: `manage(RouterState)`, register the six commands.
- Deps: `reqwest = { version = "0.12", features = ["json", "stream", "rustls-tls"], default-features = false }`,
  `futures-util = "0.3"`, `tokio = { version = "1", features = ["sync", "time"] }`.
- Unit tests: classification (id → chips), config round-trip. No network in tests.
