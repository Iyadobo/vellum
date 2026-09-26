import { uid } from "./format";
import type { Block, DiffFile, Thread } from "./types";
import type { IconName } from "../components/Icon";
import { ROUTER_AVAILABLE, cancelRouterChat, listenRouterChat, startRouterChat, type ChatMessage } from "./router";
import { cancelCodex, listenHarness, runCodex, type HarnessInnerEvent } from "./harness";

export type EngineEvent =
  | { type: "assistant-begin"; threadId: string; messageId: string }
  | { type: "turn-begin"; threadId: string; messageId: string; block: Block }
  | { type: "turn-step"; threadId: string; messageId: string; parentId: string; block: Block }
  | { type: "turn-end"; threadId: string; messageId: string; parentId: string; durationSec: number }
  | { type: "block-add"; threadId: string; messageId: string; block: Block }
  | { type: "text-append"; threadId: string; messageId: string; blockId: string; chunk: string }
  | { type: "steer-append"; threadId: string; messageId: string; markdown: string }
  | { type: "message-end"; threadId: string; messageId: string }
  | { type: "queue-pop"; threadId: string }
  | { type: "router-start"; threadId: string; messageId: string; provider: string; providerLabel: string; model: string }
  | { type: "router-switch"; threadId: string; messageId: string; toProvider: string; toModel: string; reason: string };

export interface EngineBridge {
  dispatchEvent(event: EngineEvent): void;
  peekQueue(threadId: string): { id: string; text: string } | null;
  runFinished(threadId: string): void;
}

export interface RunHandle {
  cancel(): void;
}

const TOOL_ICONS = {
  read: "search",
  search: "search",
  terminal: "terminal",
  git: "git-branch",
  browser: "globe",
  edit: "compose",
  test: "check",
} as const;

const readmeDiff: DiffFile[] = [
  {
    path: "README.md",
    additions: 6,
    deletions: 2,
    hunks: [
      {
        header: "@@ -8,7 +8,11 @@",
        lines: [
          { type: "ctx", text: "## Development" },
          { type: "ctx", text: "" },
          { type: "del", text: "Run `pnpm dev` and open port 3000." },
          { type: "add", text: "Run `pnpm dev` and open port 3000." },
          { type: "add", text: "" },
          { type: "add", text: "## Checks" },
          { type: "add", text: "" },
          { type: "add", text: "`pnpm test` — unit and integration tests." },
        ],
      },
    ],
  },
];

function hashString(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type TurnStep = {
  kind: "tool" | "status";
  icon: IconName;
  label: string;
  tone?: "default" | "muted" | "compact" | "accent";
  detail?: string;
};
type PlanSegment =
  | { kind: "turn"; steps: TurnStep[]; text?: string }
  | { kind: "text"; markdown: string }
  | { kind: "diff"; files: DiffFile[]; title: string }
  | { kind: "review"; files: DiffFile[]; additions: number; deletions: number; summary: string }
  | { kind: "code"; language: string; code: string; path?: string }
  | { kind: "block"; block: Block };

function planFor(prompt: string, thread: Thread): PlanSegment[] {
  const p = prompt.toLowerCase();
  const rand = mulberry32(hashString(thread.id + prompt));
  const pick = <T,>(items: T[]): T => items[Math.floor(rand() * items.length)];

  const readSteps: TurnStep[] = [
    { kind: "tool", icon: "search", label: pick(["Read src/index.ts", "Read src/api/client.ts", "Read package.json", "Read src/lib/util.ts"]) },
  ];
  const thinkStep: TurnStep = { kind: "status", icon: "copy", label: "Context automatically compacted", tone: "compact" };

  if (/test|flaky|failing/.test(p)) {
    return [
      { kind: "turn", steps: [...readSteps, { kind: "status", icon: "copy", label: "Context automatically compacted", tone: "compact" }, { kind: "tool", icon: TOOL_ICONS.terminal, label: "Ran the test suite", detail: "repeat 10x" }] },
      { kind: "text", markdown: "The failure is a race: the assertion runs before the async state settles. I reproduced it locally with `--repeat 10`." },
      { kind: "code", language: "ts", path: "src/__tests__/checkout.test.ts", code: "await waitFor(() => {\n  expect(screen.getByTestId(\"total\")).toHaveTextContent(\"$42.00\");\n});" },
      { kind: "text", markdown: "I wait for the settled value instead of the initial render. The suite is green over ten repeats." },
    ];
  }

  if (/dark mode|theme|token/.test(p)) {
    return [
      { kind: "turn", steps: [...readSteps, { kind: "tool", icon: TOOL_ICONS.search, label: "Found 214 hardcoded colors" }, thinkStep] },
      { kind: "text", markdown: "I moved every literal onto the token layer and added dark variants. Light mode output is byte-identical." },
      { kind: "diff", title: "2 files changed", files: readmeDiff },
      { kind: "review", summary: "Changed 8 files", additions: 23, deletions: 16, files: readmeDiff },
    ];
  }

  if (/page|hero|design|site|pricing|ui/.test(p)) {
    return [
      { kind: "turn", steps: [{ kind: "tool", icon: TOOL_ICONS.browser, label: "Opened preview at localhost:5173" }, { kind: "tool", icon: TOOL_ICONS.edit, label: "Wrote src/pages/hero.tsx" }] },
      { kind: "text", markdown: "First pass is up — you can see it in the preview pane. Type scale follows the 4px rhythm, single accent on the primary action." },
      { kind: "block", block: { id: uid("b"), kind: "tool", icon: "globe", label: "Captured a screenshot of the rendered page" } },
      { kind: "text", markdown: "Tell me where the hierarchy feels off and I'll iterate." },
    ];
  }

  if (/fix|bug|error|crash|broken/.test(p)) {
    return [
      { kind: "turn", steps: [...readSteps, { kind: "tool", icon: TOOL_ICONS.terminal, label: "Reproduced the crash", detail: "stack captured" }] },
      { kind: "text", markdown: "Root cause found: the handler reads a value that is cleared before the callback runs. I moved the read and added a guard." },
      { kind: "diff", title: "1 file changed", files: readmeDiff },
    ];
  }

  if (/add|implement|build|create|write|edit/.test(p)) {
    return [
      { kind: "turn", steps: [...readSteps, { kind: "tool", icon: TOOL_ICONS.edit, label: "Edited the relevant files" }, { kind: "tool", icon: TOOL_ICONS.terminal, label: "Ran the build", detail: "ok" }] },
      { kind: "text", markdown: "Done. I kept the change minimal and left the public surface untouched. Here is the diff:" },
      { kind: "diff", title: "1 file changed", files: readmeDiff },
    ];
  }

  return [
    { kind: "turn", steps: [...readSteps, { kind: "tool", icon: TOOL_ICONS.search, label: "Searched the workspace" }] },
    {
      kind: "text",
      markdown:
        "Here is what I found. The codebase is small and tidy, so the change you described fits in one place — I would start with the entry point and keep the rest untouched.",
    },
    { kind: "text", markdown: "Want me to make the change, or sketch the approach first?" },
  ];
}

export function startRun(bridge: EngineBridge, thread: Thread, prompt: string): RunHandle {
  if (thread.model === CODEX_MODEL && ROUTER_AVAILABLE) {
    return startCodexRun(bridge, thread, prompt);
  }
  if (ROUTER_AVAILABLE && isLiveModel(thread.model)) {
    return startLiveRun(bridge, thread, prompt);
  }
  return startMockRun(bridge, thread, prompt);
}

export const CODEX_MODEL = "codex-local";

export function isLiveModel(model: string): boolean {
  return model === "vellum-5" || model.includes("/");
}

function buildHistory(thread: Thread, prompt: string): ChatMessage[] {
  const history: ChatMessage[] = [];
  for (const message of thread.messages.slice(-12)) {
    const content = message.blocks
      .filter((b) => b.kind === "text")
      .map((b) => (b.kind === "text" ? b.markdown : ""))
      .join("\n\n")
      .trim();
    if (content) history.push({ role: message.role === "user" ? "user" : "assistant", content });
  }
  history.push({ role: "user", content: prompt });
  return history;
}

function startLiveRun(bridge: EngineBridge, thread: Thread, prompt: string): RunHandle {
  const requestId = uid("req");
  const messageId = uid("msg");
  let cancelled = false;
  let finished = false;
  let textBlockId: string | null = null;
  let reasoningBlockId: string | null = null;

  const finish = () => {
    if (finished) return;
    finished = true;
    bridge.dispatchEvent({ type: "message-end", threadId: thread.id, messageId });
    if (unlisten) unlisten();
    bridge.runFinished(thread.id);
  };

  let unlisten: (() => void) | null = null;

  bridge.dispatchEvent({ type: "assistant-begin", threadId: thread.id, messageId });

  listenRouterChat(requestId, (event) => {
    if (cancelled) return;
    if (event.type === "start") {
      bridge.dispatchEvent({
        type: "router-start",
        threadId: thread.id,
        messageId,
        provider: event.provider ?? "unknown",
        providerLabel: event.providerLabel ?? event.provider ?? "unknown",
        model: event.model ?? "",
      });
      return;
    }
    if (event.type === "switch") {
      bridge.dispatchEvent({
        type: "router-switch",
        threadId: thread.id,
        messageId,
        toProvider: event.toProvider ?? "unknown",
        toModel: event.toModel ?? "",
        reason: event.reason ?? "",
      });
      return;
    }
    if (event.type === "text") {
      if (!textBlockId) {
        textBlockId = uid("b");
        bridge.dispatchEvent({
          type: "block-add",
          threadId: thread.id,
          messageId,
          block: { id: textBlockId, kind: "text", markdown: "" },
        });
      }
      bridge.dispatchEvent({
        type: "text-append",
        threadId: thread.id,
        messageId,
        blockId: textBlockId,
        chunk: event.delta ?? "",
      });
      return;
    }
    if (event.type === "reasoning") {
      if (!reasoningBlockId) {
        reasoningBlockId = uid("b");
        bridge.dispatchEvent({
          type: "block-add",
          threadId: thread.id,
          messageId,
          block: { id: reasoningBlockId, kind: "reasoning", markdown: "" },
        });
      }
      bridge.dispatchEvent({
        type: "text-append",
        threadId: thread.id,
        messageId,
        blockId: reasoningBlockId,
        chunk: event.delta ?? "",
      });
      return;
    }
    if (event.type === "error") {
      bridge.dispatchEvent({
        type: "block-add",
        threadId: thread.id,
        messageId,
        block: {
          id: uid("b"),
          kind: "status",
          icon: "warning",
          label: event.message ?? "Router error",
          tone: "compact",
        },
      });
      finish();
      return;
    }
    finish();
  })
    .then((fn) => {
      unlisten = fn;
      if (cancelled || finished) fn();
    })
    .catch(() => void 0);

  const init = async () => {
    try {
      const history = buildHistory(thread, prompt);
      const pinned = thread.model === "vellum-5" ? null : thread.model;
      await startRouterChat(requestId, history, pinned, true);
    } catch (error) {
      if (cancelled) return;
      bridge.dispatchEvent({
        type: "block-add",
        threadId: thread.id,
        messageId,
        block: {
          id: uid("b"),
          kind: "status",
          icon: "warning",
          label: String(error instanceof Error ? error.message : error),
          tone: "compact",
        },
      });
      finish();
    }
  };
  void init();

  return {
    cancel() {
      cancelled = true;
      void cancelRouterChat(requestId).catch(() => void 0);
    },
  };
}

function startCodexRun(bridge: EngineBridge, thread: Thread, prompt: string): RunHandle {
  const requestId = uid("codex");
  const messageId = uid("msg");
  let cancelled = false;
  let finished = false;
  let textBlockId: string | null = null;
  let reasoningBlockId: string | null = null;
  const itemText: Record<string, number> = {};

  const finish = () => {
    if (finished) return;
    finished = true;
    bridge.dispatchEvent({ type: "message-end", threadId: thread.id, messageId });
    if (unlisten) unlisten();
    bridge.runFinished(thread.id);
  };

  let unlisten: (() => void) | null = null;

  const statusRow = (label: string, icon: IconName = "terminal") => {
    bridge.dispatchEvent({
      type: "block-add",
      threadId: thread.id,
      messageId,
      block: { id: uid("b"), kind: "status", icon, label, tone: "compact" },
    });
  };

  const appendText = (text: string) => {
    if (!text) return;
    if (!textBlockId) {
      textBlockId = uid("b");
      bridge.dispatchEvent({
        type: "block-add",
        threadId: thread.id,
        messageId,
        block: { id: textBlockId, kind: "text", markdown: "" },
      });
    }
    bridge.dispatchEvent({
      type: "text-append",
      threadId: thread.id,
      messageId,
      blockId: textBlockId,
      chunk: text,
    });
  };

  const appendReasoning = (text: string) => {
    if (!text) return;
    if (!reasoningBlockId) {
      reasoningBlockId = uid("b");
      bridge.dispatchEvent({
        type: "block-add",
        threadId: thread.id,
        messageId,
        block: { id: reasoningBlockId, kind: "reasoning", markdown: "" },
      });
    }
    bridge.dispatchEvent({
      type: "text-append",
      threadId: thread.id,
      messageId,
      blockId: reasoningBlockId,
      chunk: text,
    });
  };

  const handleItem = (inner: HarnessInnerEvent) => {
    const item = inner.item;
    if (!item) return;
    const itemId = item.id ?? "item";
    if (inner.type === "item.completed" || inner.type === "item.started" || inner.type === "item.updated") {
      if (item.type === "agent_message") {
        const full = item.text ?? "";
        const seen = itemText[itemId] ?? 0;
        if (full.length > seen) {
          appendText(full.slice(seen));
          itemText[itemId] = full.length;
        }
        return;
      }
      if (item.type === "reasoning") {
        const full = item.text ?? "";
        const seen = itemText[itemId] ?? 0;
        if (full.length > seen) {
          appendReasoning(full.slice(seen));
          itemText[itemId] = full.length;
        }
        return;
      }
      if (inner.type === "item.completed" && item.type === "command_execution") {
        const command = (item.command ?? "").trim();
        const detail =
          typeof item.exit_code === "number" ? `exit ${item.exit_code}` : item.status ?? undefined;
        bridge.dispatchEvent({
          type: "block-add",
          threadId: thread.id,
          messageId,
          block: {
            id: uid("b"),
            kind: "tool",
            icon: "terminal",
            label: command ? `Ran ${command}` : "Ran a command",
            detail,
          },
        });
        return;
      }
      if (inner.type === "item.completed" && item.type === "file_change") {
        const paths = (item.changes ?? [])
          .map((change) => change.path ?? "")
          .filter(Boolean)
          .slice(0, 4);
        bridge.dispatchEvent({
          type: "block-add",
          threadId: thread.id,
          messageId,
          block: {
            id: uid("b"),
            kind: "tool",
            icon: "file",
            label: paths.length ? `Edited ${paths.join(", ")}` : "Edited files",
          },
        });
        return;
      }
      if (inner.type === "item.completed" && item.type === "error" && item.message) {
        statusRow(item.message, "warning");
        return;
      }
    }
    if (inner.type === "agent_message_delta" && inner.delta) {
      appendText(inner.delta);
      return;
    }
    if (inner.type === "reasoning_delta" && inner.delta) {
      appendReasoning(inner.delta);
    }
  };

  bridge.dispatchEvent({ type: "assistant-begin", threadId: thread.id, messageId });

  listenHarness(requestId, (event) => {
    if (cancelled) return;
    if (event.type === "started") {
      statusRow(`Codex harness · ${event.cwd ?? ""}`.trim(), "sparkles");
      return;
    }
    if (event.type === "event" && event.event) {
      const inner = event.event;
      if (inner.type === "error" && inner.message) {
        statusRow(inner.message, "warning");
        return;
      }
      if (inner.type === "turn.failed") {
        statusRow(inner.error?.message ?? "Turn failed", "warning");
        finish();
        return;
      }
      if (inner.type === "turn.completed") {
        finish();
        return;
      }
      if (inner.type === "stderr" && inner.message) {
        statusRow(inner.message, "warning");
        return;
      }
      handleItem(inner);
      return;
    }
    if (event.type === "stderr" && event.line) {
      if (!/^node\.exe\s*:/.test(event.line) && !/CategoryInfo|FullyQualifiedErrorId|char:/.test(event.line)) {
        statusRow(event.line, "warning");
      }
      return;
    }
    if (event.type === "exit") {
      if ((event.code ?? 0) !== 0) {
        statusRow(`Codex exited with code ${event.code}`, "warning");
      }
      finish();
      return;
    }
    if (event.type === "error") {
      statusRow(event.message ?? "Harness error", "warning");
      finish();
      return;
    }
    if (event.type === "abort") {
      finish();
    }
  })
    .then((fn) => {
      unlisten = fn;
      if (cancelled || finished) fn();
    })
    .catch(() => void 0);

  runCodex(requestId, prompt, null, null).catch((error) => {
    if (cancelled) return;
    statusRow(String(error instanceof Error ? error.message : error), "warning");
    finish();
  });

  return {
    cancel() {
      cancelled = true;
      void cancelCodex(requestId).catch(() => void 0);
    },
  };
}

function startMockRun(bridge: EngineBridge, thread: Thread, prompt: string): RunHandle {
  let cancelled = false;
  const timers: number[] = [];
  const messageId = uid("msg");
  const plan = planFor(prompt, thread);

  const later = (ms: number) => new Promise<void>((resolve) => {
    const t = window.setTimeout(() => resolve(), ms);
    timers.push(t);
  });

  const cancelledNow = () => cancelled;

  async function streamText(messageId: string, blockId: string, markdown: string) {
    const words = markdown.split(/(\s+)/);
    for (const word of words) {
      if (cancelledNow()) return;
      bridge.dispatchEvent({ type: "text-append", threadId: thread.id, messageId, blockId, chunk: word });
      if (word.trim()) await later(14 + Math.random() * 26);
    }
  }

  async function run() {
    await later(600);
    if (cancelledNow()) return;
    bridge.dispatchEvent({ type: "assistant-begin", threadId: thread.id, messageId });

    for (let i = 0; i < plan.length; i++) {
      if (cancelledNow()) break;
      const seg = plan[i];
      if (seg.kind === "turn") {
        const turnId = uid("turn");
        bridge.dispatchEvent({
          type: "turn-begin",
          threadId: thread.id,
          messageId,
          block: { id: turnId, kind: "turn", durationSec: 0, children: [], streaming: true, liveStartedAt: Date.now() },
        });
        const startedAt = Date.now();
        for (const step of seg.steps) {
          if (cancelledNow()) break;
          await later(550 + Math.random() * 900);
          if (cancelledNow()) break;
          const block: Block =
            step.kind === "tool"
              ? { id: uid("b"), kind: "tool", icon: step.icon, label: step.label, detail: step.detail }
              : { id: uid("b"), kind: "status", icon: step.icon, label: step.label, tone: step.tone as any };
          bridge.dispatchEvent({ type: "turn-step", threadId: thread.id, messageId, parentId: turnId, block });
        }
        const queued = bridge.peekQueue(thread.id);
        await later(350);
        bridge.dispatchEvent({
          type: "turn-end",
          threadId: thread.id,
          messageId,
          parentId: turnId,
          durationSec: Math.max(1, Math.round((Date.now() - startedAt) / 1000)),
        });
        if (queued && !cancelledNow()) {
          bridge.dispatchEvent({ type: "queue-pop", threadId: thread.id });
          bridge.dispatchEvent({ type: "steer-append", threadId: thread.id, messageId, markdown: queued.text });
          await later(500);
          const ackBlockId = uid("b");
          bridge.dispatchEvent({
            type: "block-add",
            threadId: thread.id,
            messageId,
            block: { id: ackBlockId, kind: "text", markdown: "" },
          });
          await streamText(messageId, ackBlockId, "Got it — adjusting course. I'll fold that into the current run.");
        }
      } else if (seg.kind === "text") {
        const blockId = uid("b");
        bridge.dispatchEvent({ type: "block-add", threadId: thread.id, messageId, block: { id: blockId, kind: "text", markdown: "" } });
        await streamText(messageId, blockId, seg.markdown);
        await later(200);
      } else if (seg.kind === "diff") {
        bridge.dispatchEvent({ type: "block-add", threadId: thread.id, messageId, block: { id: uid("b"), kind: "diff", title: seg.title, files: seg.files } });
        await later(500);
      } else if (seg.kind === "review") {
        bridge.dispatchEvent({ type: "block-add", threadId: thread.id, messageId, block: { id: uid("b"), kind: "review", summary: seg.summary, additions: seg.additions, deletions: seg.deletions, files: seg.files } });
        await later(450);
      } else if (seg.kind === "code") {
        bridge.dispatchEvent({ type: "block-add", threadId: thread.id, messageId, block: { id: uid("b"), kind: "code", language: seg.language, code: seg.code, path: seg.path } });
        await later(450);
      } else if (seg.kind === "block") {
        bridge.dispatchEvent({ type: "block-add", threadId: thread.id, messageId, block: seg.block });
        await later(400);
      }
    }

    if (!cancelledNow()) {
      await later(400);
      bridge.dispatchEvent({ type: "message-end", threadId: thread.id, messageId });
    }
    bridge.runFinished(thread.id);
  }

  void run();

  return {
    cancel() {
      cancelled = true;
      for (const t of timers) window.clearTimeout(t);
    },
  };
}
