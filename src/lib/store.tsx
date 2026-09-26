import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  type ReactNode,
} from "react";
import type {
  AppState,
  Block,
  Effort,
  LayoutState,
  Message,
  PanelState,
  PanelTabKind,
  PermissionMode,
  RunMode,
  Settings,
  Thread,
} from "./types";
import { DEFAULT_LAYOUT, DEFAULT_PANEL, DEFAULT_SETTINGS } from "./types";
import { createSeedState } from "./seed";
import { startRun, type EngineBridge, type EngineEvent, type RunHandle } from "./engine";
import { ROUTER_AVAILABLE, fetchRouterCatalog, fetchRouterConfig, saveRouterConfig } from "./router";
import type { RouterCatalog, RouterConfigPublic } from "./types";
import { uid } from "./format";

const STORAGE_KEY = "vellum:v1";
const THEME_MIGRATION_KEY = "vellum:theme-v3";

export interface VellumState extends AppState {
  draft: Thread | null;
  rename: { threadId: string; value: string } | null;
  confirmDelete: string | null;
  routerCatalog: RouterCatalog | null;
  routerConfig: RouterConfigPublic | null;
  routerLoading: boolean;
}

type EngineAction = { type: "engine"; event: EngineEvent };

type CoreAction =
  | { type: "select-thread"; id: string }
  | { type: "create-draft"; id: string }
  | { type: "user-message"; threadId: string; message: Message; finalizeDraft: boolean; title?: string }
  | { type: "queue-message"; threadId: string; text: string }
  | { type: "run-finished"; threadId: string }
  | { type: "run-stopped"; threadId: string }
  | { type: "threads-patch"; id: string; patch: Partial<Thread> }
  | { type: "threads-remove"; id: string }
  | { type: "panel-open"; kind: PanelTabKind }
  | { type: "panel-close-tab"; id: string }
  | { type: "panel-set-tab"; id: string }
  | { type: "panel-toggle"; open?: boolean }
  | { type: "panel-width"; width: number }
  | { type: "sidebar-toggle"; open?: boolean }
  | { type: "sidebar-width"; width: number }
  | { type: "open-command-menu" }
  | { type: "open-settings"; section: string }
  | { type: "close-overlay" }
  | { type: "settings"; patch: Partial<Settings> }
  | { type: "toast-add"; id: string; text: string }
  | { type: "toast-dismiss"; id: string }
  | { type: "rename-prompt"; threadId: string }
  | { type: "rename-value"; value: string }
  | { type: "rename-cancel" }
  | { type: "rename-commit" }
  | { type: "delete-prompt"; threadId: string }
  | { type: "delete-cancel" }
  | { type: "delete-confirm" }
  | { type: "router-loading"; value: boolean }
  | { type: "router-catalog"; catalog: RouterCatalog | null }
  | { type: "router-config"; config: RouterConfigPublic | null };

type Action = CoreAction | EngineAction;

interface LoadedPersisted {
  threads?: Thread[];
  settings?: Settings;
  layout?: LayoutState;
  panel?: PanelState;
  activeThreadId?: string | null;
}

function initState(): VellumState {
  let forceTheme = false;
  try {
    if (!localStorage.getItem(THEME_MIGRATION_KEY)) {
      forceTheme = true;
      localStorage.setItem(THEME_MIGRATION_KEY, "1");
    }
  } catch {
    void 0;
  }
  const base: VellumState = {
    threads: [],
    activeThreadId: null,
    draftIds: [],
    settings: { ...DEFAULT_SETTINGS },
    layout: { ...DEFAULT_LAYOUT },
    panel: { ...DEFAULT_PANEL },
    overlay: { kind: "none" },
    toasts: [],
    draft: null,
    rename: null,
    confirmDelete: null,
    routerCatalog: null,
    routerConfig: null,
    routerLoading: false,
  };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const data = JSON.parse(raw) as LoadedPersisted;
      if (data && Array.isArray(data.threads) && data.threads.length > 0) {
        const threads = data.threads.map((t) => ({
          ...t,
          running: false,
          queued: t.queued ?? [],
          messages: (t.messages ?? []).map((m) => ({
            ...m,
            streaming: false,
            blocks: m.blocks.map((b) =>
              b.kind === "turn" ? { ...b, streaming: false, liveStartedAt: undefined } : b,
            ),
          })),
        }));
        const savedActive = data.activeThreadId ?? null;
        const activeThreadId =
          savedActive && threads.some((t) => t.id === savedActive && !t.archived)
            ? savedActive
            : threads.find((t) => !t.archived)?.id ?? null;
        return {
          ...base,
          threads,
          settings: { ...DEFAULT_SETTINGS, ...(data.settings ?? {}), ...(forceTheme ? { theme: "bw" as const } : {}) },
          layout: { ...DEFAULT_LAYOUT, ...(data.layout ?? {}) },
          panel: { ...DEFAULT_PANEL, ...(data.panel ?? {}), open: data.panel?.open ?? false },
          activeThreadId,
        };
      }
    }
  } catch {
    void 0;
  }
  const seed = createSeedState();
  return {
    ...base,
    threads: seed.threads,
    activeThreadId: seed.activeThreadId,
    panel: { ...seed.panel },
  };
}

function patchThread(state: VellumState, id: string, fn: (t: Thread) => Thread): VellumState {
  return { ...state, threads: state.threads.map((t) => (t.id === id ? fn(t) : t)) };
}

function patchMessage(state: VellumState, threadId: string, messageId: string, fn: (m: Message) => Message): VellumState {
  return patchThread(state, threadId, (t) => ({
    ...t,
    messages: t.messages.map((m) => (m.id === messageId ? fn(m) : m)),
  }));
}

function patchBlock(state: VellumState, threadId: string, messageId: string, blockId: string, fn: (b: Block) => Block): VellumState {
  return patchMessage(state, threadId, messageId, (m) => ({
    ...m,
    blocks: m.blocks.map((b) => (b.id === blockId ? fn(b) : b)),
  }));
}

function appendBlockToTurn(state: VellumState, threadId: string, messageId: string, parentId: string, block: Block): VellumState {
  return patchBlock(state, threadId, messageId, parentId, (b) =>
    b.kind === "turn" ? { ...b, children: [...b.children, block] } : b,
  );
}

function engineReducer(state: VellumState, event: EngineEvent): VellumState {
  switch (event.type) {
    case "assistant-begin": {
      const message: Message = { id: event.messageId, role: "assistant", blocks: [], createdAt: Date.now(), streaming: true };
      return patchThread(state, event.threadId, (t) => ({ ...t, messages: [...t.messages, message], updatedAt: Date.now() }));
    }
    case "turn-begin": {
      return patchMessage(state, event.threadId, event.messageId, (m) => ({ ...m, blocks: [...m.blocks, event.block] }));
    }
    case "turn-step": {
      return appendBlockToTurn(state, event.threadId, event.messageId, event.parentId, event.block);
    }
    case "turn-end": {
      return patchBlock(state, event.threadId, event.messageId, event.parentId, (b) =>
        b.kind === "turn" ? { ...b, durationSec: event.durationSec, streaming: false, liveStartedAt: undefined } : b,
      );
    }
    case "block-add": {
      return patchMessage(state, event.threadId, event.messageId, (m) => ({ ...m, blocks: [...m.blocks, event.block] }));
    }
    case "text-append": {
      return patchBlock(state, event.threadId, event.messageId, event.blockId, (b) =>
        b.kind === "text" || b.kind === "reasoning" ? { ...b, markdown: b.markdown + event.chunk } : b,
      );
    }
    case "steer-append": {
      const message: Message = {
        id: uid("msg"),
        role: "user",
        blocks: [{ id: uid("b"), kind: "text", markdown: event.markdown }],
        createdAt: Date.now(),
      };
      return patchThread(state, event.threadId, (t) => ({ ...t, messages: [...t.messages, message] }));
    }
    case "router-start": {
      const label = `Vellum 5 → ${event.providerLabel} · ${event.model}`;
      return patchMessage(state, event.threadId, event.messageId, (m) => ({
        ...m,
        blocks: [...m.blocks, { id: uid("b"), kind: "status", icon: "sparkles", label, tone: "default" } as Block],
      }));
    }
    case "router-switch": {
      const reason = event.reason ? ` — ${event.reason}` : "";
      const label = `Rerouted to ${event.toProvider} · ${event.toModel}${reason}`;
      return patchMessage(state, event.threadId, event.messageId, (m) => ({
        ...m,
        blocks: [...m.blocks, { id: uid("b"), kind: "status", icon: "warning", label, tone: "compact" } as Block],
      }));
    }
    case "message-end": {
      return patchMessage(state, event.threadId, event.messageId, (m) => ({ ...m, streaming: false }));
    }
    case "queue-pop": {
      return patchThread(state, event.threadId, (t) => ({ ...t, queued: t.queued.slice(1) }));
    }
    default:
      return state;
  }
}

function coreReducer(state: VellumState, action: Action): VellumState {
  if (action.type === "engine") return engineReducer(state, action.event);

  switch (action.type) {
    case "select-thread":
      return { ...state, activeThreadId: action.id };
    case "create-draft": {
      const draft: Thread = {
        id: action.id,
        title: "",
        createdAt: Date.now(),
        updatedAt: Date.now(),
        messages: [],
        queued: [],
        mode: "local",
        permissions: "ask",
        model: "vellum-5",
        effort: "high",
      };
      return { ...state, draft, activeThreadId: draft.id };
    }
    case "user-message": {
      const message = action.message;
      if (action.finalizeDraft && state.draft && state.draft.id === action.threadId) {
        const thread: Thread = {
          ...state.draft,
          title: action.title || message.blocks.map((b) => (b.kind === "text" ? b.markdown : "")).join(" ").slice(0, 60),
          updatedAt: Date.now(),
          messages: [message],
          running: true,
          runStartedAt: Date.now(),
        };
        return { ...state, draft: null, threads: [thread, ...state.threads], activeThreadId: thread.id };
      }
      return patchThread(state, action.threadId, (t) => ({
        ...t,
        messages: [...t.messages, message],
        updatedAt: Date.now(),
        running: true,
        runStartedAt: Date.now(),
      }));
    }
    case "queue-message": {
      return patchThread(state, action.threadId, (t) => ({
        ...t,
        queued: [...t.queued, { id: uid("q"), text: action.text, createdAt: Date.now() }],
      }));
    }
    case "run-finished": {
      return patchThread(state, action.threadId, (t) => ({ ...t, running: false, runStartedAt: undefined }));
    }
    case "run-stopped": {
      return patchThread(state, action.threadId, (t) => ({
        ...t,
        running: false,
        runStartedAt: undefined,
        messages: t.messages.map((m) =>
          m.streaming
            ? {
                ...m,
                streaming: false,
                blocks: m.blocks.map((b) =>
                  b.kind === "turn" && b.streaming
                    ? { ...b, streaming: false, durationSec: Math.max(1, Math.round((Date.now() - (b.liveStartedAt ?? Date.now())) / 1000)), liveStartedAt: undefined }
                    : b,
                ),
              }
            : m,
        ),
      }));
    }
    case "threads-patch":
      return patchThread(state, action.id, (t) => ({ ...t, ...action.patch }));
    case "threads-remove": {
      const threads = state.threads.filter((t) => t.id !== action.id);
      const activeThreadId = state.activeThreadId === action.id ? threads.find((t) => !t.archived)?.id ?? null : state.activeThreadId;
      return { ...state, threads, activeThreadId };
    }
    case "panel-open": {
      const existing = state.panel.tabs.find((t) => t.kind === action.kind);
      const titles: Record<PanelTabKind, string> = {
        subagents: "Subagents",
        review: "Review",
        files: "Files",
        terminal: "Terminal",
        browser: "Browser",
      };
      if (existing) return { ...state, panel: { ...state.panel, open: true, activeId: existing.id } };
      const tab = { id: uid("tab"), kind: action.kind, title: titles[action.kind] };
      return { ...state, panel: { ...state.panel, open: true, tabs: [...state.panel.tabs, tab], activeId: tab.id } };
    }
    case "panel-close-tab": {
      const tabs = state.panel.tabs.filter((t) => t.id !== action.id);
      const activeId = state.panel.activeId === action.id ? tabs[tabs.length - 1]?.id ?? null : state.panel.activeId;
      return { ...state, panel: { ...state.panel, tabs, activeId, open: tabs.length ? state.panel.open : false } };
    }
    case "panel-set-tab":
      return { ...state, panel: { ...state.panel, activeId: action.id, open: true } };
    case "panel-toggle":
      return { ...state, panel: { ...state.panel, open: action.open ?? !state.panel.open } };
    case "panel-width":
      return { ...state, panel: { ...state.panel, width: action.width } };
    case "sidebar-toggle":
      return { ...state, layout: { ...state.layout, sidebarOpen: action.open ?? !state.layout.sidebarOpen } };
    case "sidebar-width":
      return { ...state, layout: { ...state.layout, sidebarWidth: action.width } };
    case "open-command-menu":
      return { ...state, overlay: { kind: "command-menu" } };
    case "open-settings":
      return { ...state, overlay: { kind: "settings", section: action.section } };
    case "close-overlay":
      return { ...state, overlay: { kind: "none" } };
    case "settings":
      return { ...state, settings: { ...state.settings, ...action.patch } };
    case "router-loading":
      return { ...state, routerLoading: action.value };
    case "router-catalog":
      return { ...state, routerCatalog: action.catalog };
    case "router-config":
      return { ...state, routerConfig: action.config };
    case "toast-add":
      return { ...state, toasts: [...state.toasts, { id: action.id, text: action.text }] };
    case "toast-dismiss":
      return { ...state, toasts: state.toasts.filter((t) => t.id !== action.id) };
    case "rename-prompt": {
      const t = state.threads.find((x) => x.id === action.threadId);
      return { ...state, rename: { threadId: action.threadId, value: t?.title ?? "" } };
    }
    case "rename-value":
      return state.rename ? { ...state, rename: { ...state.rename, value: action.value } } : state;
    case "rename-cancel":
      return { ...state, rename: null };
    case "rename-commit": {
      if (!state.rename) return state;
      const { threadId, value } = state.rename;
      return { ...patchThread(state, threadId, (t) => ({ ...t, title: value.trim() || t.title })), rename: null };
    }
    case "delete-prompt":
      return { ...state, confirmDelete: action.threadId };
    case "delete-cancel":
      return { ...state, confirmDelete: null };
    case "delete-confirm":
      if (!state.confirmDelete) return state;
      return coreReducer({ ...state, confirmDelete: null }, { type: "threads-remove", id: state.confirmDelete });
    default:
      return state;
  }
}

export interface Actions {
  selectThread(id: string): void;
  createDraft(): string;
  sendMessage(threadId: string, text: string): void;
  stopRun(threadId: string): void;
  archiveThread(id: string, archived?: boolean): void;
  deleteThread(id: string): void;
  pinThread(id: string, pinned?: boolean): void;
  renameThread(id: string, title: string): void;
  promptRename(id: string): void;
  setRenameValue(value: string): void;
  commitRename(): void;
  cancelRename(): void;
  requestDelete(id: string): void;
  cancelDelete(): void;
  confirmDelete(): void;
  markRead(id: string, read?: boolean): void;
  setThreadMode(id: string, mode: RunMode): void;
  setThreadPermissions(id: string, permissions: PermissionMode): void;
  setThreadModel(id: string, model: string, effort: Effort): void;
  openPanel(kind: PanelTabKind): void;
  closePanelTab(id: string): void;
  setPanelTab(id: string): void;
  togglePanel(open?: boolean): void;
  setPanelWidth(px: number): void;
  getPanelKind(kind: PanelTabKind): boolean;
  toggleSidebar(open?: boolean): void;
  setSidebarWidth(px: number): void;
  openCommandMenu(): void;
  openSettings(section?: string): void;
  closeOverlay(): void;
  updateSettings(patch: Partial<Settings>): void;
  pushToast(text: string): void;
  dismissToast(id: string): void;
  refreshRouter(force?: boolean): void;
  refreshRouterConfig(): void;
  saveProvider(update: {
    provider?: string;
    apiKey?: string;
    enabled?: boolean;
    baseUrl?: string;
    order?: string[];
    clearKey?: boolean;
  }): Promise<void>;
}

interface StoreValue {
  state: VellumState;
  actions: Actions;
}

const StoreContext = createContext<StoreValue | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(coreReducer, undefined, initState);
  const stateRef = useRef(state);
  stateRef.current = state;
  const runsRef = useRef(new Map<string, RunHandle>());

  const actions = useMemo<Actions>(() => {
    const bridge: EngineBridge = {
      dispatchEvent: (event) => dispatch({ type: "engine", event }),
      peekQueue: (threadId) => stateRef.current.threads.find((t) => t.id === threadId)?.queued[0] ?? null,
      runFinished: (threadId) => {
        runsRef.current.delete(threadId);
        dispatch({ type: "run-finished", threadId });
      },
    };

    return {
      selectThread: (id) => dispatch({ type: "select-thread", id }),
      createDraft: () => {
        const id = uid("draft");
        dispatch({ type: "create-draft", id });
        return id;
      },
      sendMessage: (threadId, text) => {
        const trimmed = text.trim();
        if (!trimmed) return;
        const s = stateRef.current;
        const thread = s.threads.find((t) => t.id === threadId) ?? (s.draft?.id === threadId ? s.draft : null);
        if (!thread) return;
        if (thread.running) {
          dispatch({ type: "queue-message", threadId, text: trimmed });
          return;
        }
        const isDraft = s.draft?.id === threadId;
        const message: Message = {
          id: uid("msg"),
          role: "user",
          blocks: [{ id: uid("b"), kind: "text", markdown: trimmed }],
          createdAt: Date.now(),
        };
        dispatch({
          type: "user-message",
          threadId,
          message,
          finalizeDraft: isDraft,
          title: trimmed.split("\n")[0].slice(0, 60),
        });
        const runThread: Thread = isDraft
          ? { ...thread, title: trimmed.split("\n")[0].slice(0, 60), messages: [message] }
          : thread;
        const handle = startRun(bridge, runThread, trimmed);
        runsRef.current.set(threadId, handle);
      },
      stopRun: (threadId) => {
        runsRef.current.get(threadId)?.cancel();
        runsRef.current.delete(threadId);
        dispatch({ type: "run-stopped", threadId });
      },
      archiveThread: (id, archived = true) =>
        dispatch({ type: "threads-patch", id, patch: { archived, updatedAt: Date.now() } }),
      deleteThread: (id) => dispatch({ type: "threads-remove", id }),
      pinThread: (id, pinned) => {
        const thread = stateRef.current.threads.find((t) => t.id === id);
        dispatch({ type: "threads-patch", id, patch: { pinned: pinned ?? !thread?.pinned } });
      },
      renameThread: (id, title) => dispatch({ type: "threads-patch", id, patch: { title } }),
      promptRename: (id) => dispatch({ type: "rename-prompt", threadId: id }),
      setRenameValue: (value) => dispatch({ type: "rename-value", value }),
      commitRename: () => dispatch({ type: "rename-commit" }),
      cancelRename: () => dispatch({ type: "rename-cancel" }),
      requestDelete: (id) => dispatch({ type: "delete-prompt", threadId: id }),
      cancelDelete: () => dispatch({ type: "delete-cancel" }),
      confirmDelete: () => dispatch({ type: "delete-confirm" }),
      markRead: (id, read = true) => dispatch({ type: "threads-patch", id, patch: { unread: !read } }),
      setThreadMode: (id, mode) => dispatch({ type: "threads-patch", id, patch: { mode } }),
      setThreadPermissions: (id, permissions) => dispatch({ type: "threads-patch", id, patch: { permissions } }),
      setThreadModel: (id, model, effort) => dispatch({ type: "threads-patch", id, patch: { model, effort } }),
      openPanel: (kind) => dispatch({ type: "panel-open", kind }),
      closePanelTab: (id) => dispatch({ type: "panel-close-tab", id }),
      setPanelTab: (id) => dispatch({ type: "panel-set-tab", id }),
      togglePanel: (open) => dispatch({ type: "panel-toggle", open }),
      setPanelWidth: (width) => dispatch({ type: "panel-width", width }),
      getPanelKind: (kind) => stateRef.current.panel.tabs.some((t) => t.kind === kind),
      toggleSidebar: (open) => dispatch({ type: "sidebar-toggle", open }),
      setSidebarWidth: (width) => dispatch({ type: "sidebar-width", width }),
      openCommandMenu: () => dispatch({ type: "open-command-menu" }),
      openSettings: (section = "general") => dispatch({ type: "open-settings", section }),
      closeOverlay: () => dispatch({ type: "close-overlay" }),
      updateSettings: (patch) => dispatch({ type: "settings", patch }),
      pushToast: (text) => dispatch({ type: "toast-add", id: uid("toast"), text }),
      dismissToast: (id) => dispatch({ type: "toast-dismiss", id }),
      refreshRouter: (force = false) => {
        if (!ROUTER_AVAILABLE) return;
        dispatch({ type: "router-loading", value: true });
        fetchRouterCatalog(force)
          .then((catalog) => dispatch({ type: "router-catalog", catalog }))
          .catch(() => dispatch({ type: "router-catalog", catalog: null }))
          .finally(() => dispatch({ type: "router-loading", value: false }));
      },
      refreshRouterConfig: () => {
        if (!ROUTER_AVAILABLE) return;
        fetchRouterConfig()
          .then((config) => dispatch({ type: "router-config", config }))
          .catch(() => void 0);
      },
      saveProvider: async (update) => {
        if (!ROUTER_AVAILABLE) return;
        const config = await saveRouterConfig(update);
        dispatch({ type: "router-config", config });
        dispatch({ type: "router-catalog", catalog: null });
      },
    };
  }, []);

  useEffect(() => {
    const payload = {
      threads: state.threads,
      settings: state.settings,
      layout: state.layout,
      panel: state.panel,
      activeThreadId: state.activeThreadId,
    };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch {
      void 0;
    }
  }, [state.threads, state.settings, state.layout, state.panel, state.activeThreadId]);

  useEffect(() => {
    const root = document.documentElement;
    const apply = () => {
      const theme = state.settings.theme;
      const resolved =
        theme === "system" ? (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light") : theme;
      root.dataset.theme = resolved;
      root.dataset.reducedMotion = String(state.settings.reduceMotion);
      root.dataset.pointerCursors = String(state.settings.pointerCursors);
      root.dataset.fontSmoothing = String(state.settings.fontSmoothing);
    };
    apply();
    const mql = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => {
      if (state.settings.theme === "system") apply();
    };
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, [state.settings]);

  useEffect(() => {
    if (!state.activeThreadId && !state.draft) {
      actions.createDraft();
    }
  }, [state.activeThreadId, state.draft, actions]);

  const value = useMemo<StoreValue>(() => ({ state, actions }), [state, actions]);

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

function useStore(): StoreValue {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("useStore must be used inside AppProvider");
  return ctx;
}

export function useApp(): VellumState & { activeThread: Thread | null } {
  const { state } = useStore();
  const activeThread = useMemo(() => {
    const found = state.threads.find((t) => t.id === state.activeThreadId);
    if (found) return found;
    if (state.draft && state.draft.id === state.activeThreadId) return state.draft;
    return null;
  }, [state.threads, state.draft, state.activeThreadId]);
  return { ...state, activeThread };
}

export function useActions(): Actions {
  return useStore().actions;
}

export function isDraftId(state: VellumState, id: string | null): boolean {
  return !!id && state.draft?.id === id;
}
