import type { IconName } from "../components/Icon";

export type PermissionMode = "ask" | "approve" | "full" | "custom";
export type RunMode = "local" | "worktree" | "cloud";
export type Effort = "low" | "medium" | "high" | "extra high";
export type ThemeSetting = "dark" | "light" | "vellum" | "bw" | "midnight" | "system";

export interface DiffLine {
  type: "add" | "del" | "ctx";
  text: string;
}

export interface DiffHunk {
  header: string;
  lines: DiffLine[];
}

export interface DiffFile {
  path: string;
  additions: number;
  deletions: number;
  hunks: DiffHunk[];
}

export type Block =
  | { id: string; kind: "text"; markdown: string }
  | { id: string; kind: "reasoning"; markdown: string }
  | { id: string; kind: "tool"; icon: IconName; label: string; detail?: string; tone?: "default" | "muted" }
  | { id: string; kind: "status"; icon: IconName; label: string; tone?: "default" | "compact" | "accent" }
  | { id: string; kind: "diff"; title: string; files: DiffFile[] }
  | { id: string; kind: "code"; language: string; code: string; path?: string }
  | { id: string; kind: "review"; summary: string; additions: number; deletions: number; files: DiffFile[] }
  | {
      id: string;
      kind: "turn";
      durationSec: number;
      children: Block[];
      streaming?: boolean;
      liveStartedAt?: number;
    };

export interface Message {
  id: string;
  role: "user" | "assistant";
  blocks: Block[];
  createdAt: number;
  streaming?: boolean;
}

export interface QueuedMessage {
  id: string;
  text: string;
  createdAt: number;
}

export interface Thread {
  id: string;
  title: string;
  project?: string;
  createdAt: number;
  updatedAt: number;
  pinned?: boolean;
  archived?: boolean;
  unread?: boolean;
  running?: boolean;
  runStartedAt?: number;
  messages: Message[];
  queued: QueuedMessage[];
  mode: RunMode;
  worktree?: string;
  branch?: string;
  permissions: PermissionMode;
  model: string;
  effort: Effort;
}

export type PanelTabKind = "subagents" | "review" | "files" | "terminal" | "browser";

export interface PanelTab {
  id: string;
  kind: PanelTabKind;
  title: string;
}

export interface PanelState {
  open: boolean;
  tabs: PanelTab[];
  activeId: string | null;
  width: number;
}

export interface SubagentEntry {
  id: string;
  title: string;
  state: "running" | "done";
  summary: string;
}

export interface Settings {
  theme: ThemeSetting;
  userName?: string;
  reduceMotion: boolean;
  pointerCursors: boolean;
  diffMarkers: "color" | "symbols";
  sendShortcut: "enter" | "mod-enter";
  followUpBehavior: "queue" | "steer";
  showContextUsage: boolean;
  bottomPanel: boolean;
  fontSmoothing: boolean;
  showTips: boolean;
  preventSleep: boolean;
}

export interface LayoutState {
  sidebarOpen: boolean;
  sidebarWidth: number;
  railOpen: boolean;
}

export interface Toast {
  id: string;
  text: string;
}

export type Overlay =
  | { kind: "command-menu"; query?: string }
  | { kind: "settings"; section: string }
  | { kind: "none" };

export interface AppState {
  threads: Thread[];
  activeThreadId: string | null;
  draftIds: string[];
  settings: Settings;
  layout: LayoutState;
  panel: PanelState;
  overlay: Overlay;
  toasts: Toast[];
}

export const DEFAULT_SETTINGS: Settings = {
  theme: "bw",
  reduceMotion: false,
  pointerCursors: true,
  diffMarkers: "color",
  sendShortcut: "enter",
  followUpBehavior: "queue",
  showContextUsage: false,
  bottomPanel: false,
  fontSmoothing: true,
  showTips: true,
  preventSleep: true,
};

export const DEFAULT_LAYOUT: LayoutState = {
  sidebarOpen: true,
  sidebarWidth: 340,
  railOpen: true,
};

export const DEFAULT_PANEL: PanelState = {
  open: false,
  tabs: [],
  activeId: null,
  width: 600,
};

export const MODELS = [
  { id: "vellum-5", label: "Vellum 5", description: "Routes to free models automatically" },
  { id: "codex-local", label: "Codex (local CLI)", description: "Native harness · files + terminal" },
  { id: "vellum-1", label: "vellum-1 (demo)", description: "Offline simulation" },
] as const;

export interface RouterModel {
  id: string;
  provider: string;
  providerLabel: string;
  model: string;
  label: string;
  contextWindow: number | null;
  vision: boolean | null;
  reasoning: boolean | null;
  paramsBillions: number | null;
  free: boolean | null;
  source: "api" | "family" | "observed" | "unknown";
}

export interface ProviderStatus {
  id: string;
  label: string;
  kind: string;
  enabled: boolean;
  hasKey: boolean;
  ok: boolean;
  error: string | null;
  modelCount: number;
}

export interface RouterCatalog {
  fetchedAt: number;
  models: RouterModel[];
  providers: ProviderStatus[];
}

export interface ProviderPublic {
  id: string;
  label: string;
  kind: string;
  enabled: boolean;
  hasKey: boolean;
  baseUrl: string;
  freeOnly: boolean;
}

export interface RouterConfigPublic {
  order: string[];
  providers: ProviderPublic[];
}

export interface RouterProbeResult {
  ok: boolean;
  latencyMs: number;
  message: string;
  modelCount: number;
}

export const EFFORTS: Effort[] = ["low", "medium", "high", "extra high"];
