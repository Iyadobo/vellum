import {
  Fragment,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type JSX,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from "react";
import { Icon } from "../../components/Icon";
import { HomeGreeting } from "./HomeGreeting";
import { formatDuration } from "../../lib/format";
import { useActions, useApp } from "../../lib/store";
import type { Block, Message } from "../../lib/types";
import { useMenu } from "../menus/menus";
import { CodeBlock } from "./CodeBlock";
import { DiffCard, ReviewCard } from "./diff";
import { Markdown } from "./markdown";
import { copyText, threadToMarkdown } from "./utils";
import "./thread.css";
import "./art-voice.css";

type ToolBlock = Extract<Block, { kind: "tool" }>;
type StatusBlock = Extract<Block, { kind: "status" }>;
type TurnBlock = Extract<Block, { kind: "turn" }>;

function useNow(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [active]);
  return now;
}

function ToolRow({ block }: { block: ToolBlock }) {
  return (
    <div className="thread-tool" data-tone={block.tone ?? "default"}>
      <span className="thread-tool-icon">
        <Icon name={block.icon} size={16} />
      </span>
      <span className="thread-tool-label">{block.label}</span>
      {block.detail ? <span className="thread-tool-detail">{block.detail}</span> : null}
    </div>
  );
}

function StatusRow({ block }: { block: StatusBlock }) {
  return (
    <div className="thread-status" data-tone={block.tone ?? "default"}>
      <span className="thread-tool-icon">
        <Icon name={block.icon} size={16} />
      </span>
      <span className="thread-status-label">{block.label}</span>
    </div>
  );
}

type ReasoningBlockType = Extract<Block, { kind: "reasoning" }>;

function ReasoningBlock({ block }: { block: ReasoningBlockType; live?: boolean }) {
  const [open, setOpen] = useState(false);

  const words = block.markdown.trim() ? block.markdown.trim().split(/\s+/).length : 0;

  return (
    <div className="thread-reasoning">
      <button
        type="button"
        className="thread-reasoning-row focus-ring"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <span className="thread-reasoning-label">Thought process</span>
        <span className="thread-reasoning-meta">{words} words</span>
        <span className="thread-turn-chevron" data-open={open}>
          <Icon name="chevron-right" size={12} />
        </span>
      </button>
      {open ? <div className="thread-reasoning-body selectable">{block.markdown}</div> : null}
    </div>
  );
}

function TurnBlockView({ block }: { block: TurnBlock }) {
  const streaming = Boolean(block.streaming);
  const [open, setOpen] = useState(streaming);
  const userToggled = useRef(false);
  const now = useNow(streaming);
  const startedAt = block.liveStartedAt;
  const elapsed = streaming && typeof startedAt === "number" ? Math.max(0, Math.floor((now - startedAt) / 1000)) : block.durationSec;
  const label = `${streaming ? "Working for" : "Worked for"} ${formatDuration(elapsed)}`;

  useEffect(() => {
    if (!streaming && !userToggled.current) setOpen(false);
  }, [streaming]);

  return (
    <div className="thread-turn">
      <button
        type="button"
        className="thread-turn-row focus-ring"
        aria-expanded={open}
        onClick={() => {
          userToggled.current = true;
          setOpen((value) => !value);
        }}
      >
        {streaming ? <span className="thread-pulse-dot" aria-hidden="true" /> : null}
        <span className="thread-turn-label">{label}</span>
        <span className="thread-turn-chevron" data-open={open}>
          <Icon name="chevron-right" size={12} />
        </span>
      </button>
      {open && block.children.length > 0 ? (
        <div className="thread-turn-children">
          {block.children.map((child) => (
            <BlockView key={child.id} block={child} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function BlockView({ block, trailing, live }: { block: Block; trailing?: ReactNode; live?: boolean }) {
  switch (block.kind) {
    case "reasoning":
      return <ReasoningBlock block={block} live={live} />;
    case "text":
      return <Markdown markdown={block.markdown} trailing={trailing} />;
    case "tool":
      return <ToolRow block={block} />;
    case "status":
      return <StatusRow block={block} />;
    case "turn":
      return <TurnBlockView block={block} />;
    case "diff":
      return <DiffCard title={block.title} files={block.files} />;
    case "review":
      return (
        <ReviewCard
          summary={block.summary}
          additions={block.additions}
          deletions={block.deletions}
          files={block.files}
        />
      );
    case "code":
      return <CodeBlock language={block.language} code={block.code} path={block.path} />;
  }
}

function UserMessage({ message }: { message: Message }) {
  const text = message.blocks
    .map((block) => (block.kind === "text" ? block.markdown : ""))
    .join("\n")
    .trim();
  return (
    <div className="thread-msg-user">
      <div className="thread-user-bubble selectable">{text}</div>
    </div>
  );
}

function AssistantMessage({ message }: { message: Message }) {
  const streaming = Boolean(message.streaming);
  const lastIndex = message.blocks.length - 1;
  const lastIsText = streaming && lastIndex >= 0 && message.blocks[lastIndex].kind === "text";
  return (
    <div className="thread-msg-assistant">
      {message.blocks.map((block, index) => (
        <BlockView
          key={block.id}
          block={block}
          live={streaming && index === lastIndex}
          trailing={lastIsText && index === lastIndex ? <span className="thread-stream-dot" aria-hidden="true" /> : undefined}
        />
      ))}
      {streaming && !lastIsText ? (
        <span className="thread-stream-dot thread-stream-dot-standalone" aria-hidden="true" />
      ) : null}
    </div>
  );
}

function EmptyState(): JSX.Element {
  return (
    <div className="thread-home">
      <HomeGreeting />
    </div>
  );
}

export function ThreadView(): JSX.Element {
  const state = useApp();
  const actions = useActions();
  const menu = useMenu();
  const thread = state.activeThread;
  const messages = thread?.messages;
  const threadId = thread?.id ?? null;
  const scrollRef = useRef<HTMLDivElement>(null);
  const pinnedRef = useRef(true);
  const lastHeightRef = useRef(0);

  useLayoutEffect(() => {
    pinnedRef.current = true;
    const element = scrollRef.current;
    if (element) {
      element.scrollTop = element.scrollHeight;
      lastHeightRef.current = element.scrollHeight;
    }
  }, [threadId]);

  useLayoutEffect(() => {
    const element = scrollRef.current;
    if (!element) return;
    const distanceBeforeUpdate = lastHeightRef.current - element.scrollTop - element.clientHeight;
    lastHeightRef.current = element.scrollHeight;
    if (distanceBeforeUpdate > 120) pinnedRef.current = false;
    if (!pinnedRef.current) return;
    element.scrollTop = element.scrollHeight;
  }, [messages]);

  if (!thread || !messages || messages.length === 0) return <EmptyState />;

  const onScroll = () => {
    const element = scrollRef.current;
    if (!element) return;
    pinnedRef.current = element.scrollHeight - element.scrollTop - element.clientHeight <= 120;
  };

  const reviewVisible = state.panel.open && actions.getPanelKind("review");

  const toggleReview = () => {
    if (reviewVisible) actions.togglePanel(false);
    else actions.openPanel("review");
  };

  const copyMarkdown = () => {
    void copyText(threadToMarkdown(thread)).then((ok) =>
      actions.pushToast(ok ? "Copied chat as Markdown" : "Copy failed"),
    );
  };

  const archiveChat = () => {
    actions.archiveThread(thread.id, true);
    if (state.activeThreadId === thread.id) {
      const next = state.threads.find((candidate) => candidate.id !== thread.id && !candidate.archived);
      if (next) actions.selectThread(next.id);
      else actions.createDraft();
    }
    actions.pushToast("Chat archived");
  };

  const openKebab = (event: ReactMouseEvent<HTMLButtonElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    menu.open({
      anchor: { x: rect.right, y: rect.bottom + 6, align: "right", width: 224 },
      items: [
        { id: "copy-markdown", label: "Copy as Markdown", icon: "copy", onSelect: copyMarkdown },
        { id: "rename", label: "Rename chat", icon: "pencil", onSelect: () => actions.promptRename(thread.id) },
        {
          id: "archive",
          label: "Archive chat",
          icon: "archive",
          separatorBefore: true,
          onSelect: archiveChat,
        },
        {
          id: "delete",
          label: "Delete",
          icon: "trash",
          danger: true,
          separatorBefore: true,
          onSelect: () => actions.requestDelete(thread.id),
        },
      ],
    });
  };

  return (
    <div className="thread-scroll" ref={scrollRef} onScroll={onScroll}>
      <header className="thread-header">
        <div className="thread-header-leading" aria-hidden="true" />
        <h2 className="thread-header-title truncate">{thread.title || "New chat"}</h2>
        <div className="thread-header-actions">
          <button type="button" className="thread-icon-btn focus-ring" aria-label="Chat options" onClick={openKebab}>
            <Icon name="kebab" size={16} />
          </button>
          <button
            type="button"
            className="thread-icon-btn focus-ring"
            aria-label={reviewVisible ? "Hide review panel" : "Show review panel"}
            aria-pressed={reviewVisible}
            onClick={toggleReview}
          >
            <Icon name="split" size={16} />
          </button>
        </div>
      </header>
      <div className="thread-body">
        {messages.map((message) => (
          <Fragment key={message.id}>
            {message.role === "user" ? <UserMessage message={message} /> : <AssistantMessage message={message} />}
          </Fragment>
        ))}
      </div>
    </div>
  );
}
