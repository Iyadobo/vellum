import type { AppState, Overlay } from "./types";
import type { Actions } from "./store";
import type { IconName } from "../components/Icon";

export interface Command {
  id: string;
  title: string;
  group: "Quick actions" | "Navigation" | "Panels" | "Chat" | "Settings" | "Appearance";
  icon?: IconName;
  shortcut?: string;
  keywords?: string;
  run: (ctx: CommandContext) => void;
}

export interface CommandContext {
  actions: Actions;
  state: AppState;
}

const isMac = typeof navigator !== "undefined" && /mac/i.test(navigator.platform);
const mod = isMac ? "⌘" : "Ctrl";
export const MOD_LABEL = mod;

export function buildCommands(): Command[] {
  return [
    {
      id: "new-chat",
      title: "New chat",
      group: "Quick actions",
      icon: "compose",
      shortcut: `${mod}+N`,
      keywords: "thread task",
      run: ({ actions }) => actions.createDraft(),
    },
    {
      id: "search-chats",
      title: "Search chats…",
      group: "Quick actions",
      icon: "search",
      shortcut: `${mod}+K`,
      keywords: "find history",
      run: ({ actions }) => actions.openCommandMenu(),
    },
    {
      id: "open-folder",
      title: "Open folder…",
      group: "Quick actions",
      icon: "folder",
      shortcut: `${mod}+O`,
      keywords: "project directory",
      run: ({ actions }) => actions.pushToast("Open folder is not wired to the OS in this build"),
    },
    {
      id: "search-files",
      title: "Search files…",
      group: "Quick actions",
      icon: "search",
      shortcut: `${mod}+P`,
      keywords: "find file",
      run: ({ actions }) => actions.pushToast("File search scopes to a project workspace"),
    },
    {
      id: "toggle-sidebar",
      title: "Toggle sidebar",
      group: "Panels",
      icon: "sidebar-toggle",
      shortcut: `${mod}+B`,
      keywords: "hide show",
      run: ({ actions }) => actions.toggleSidebar(),
    },
    {
      id: "toggle-review",
      title: "Toggle Review panel",
      group: "Panels",
      icon: "diff",
      shortcut: `${mod}+Alt+B`,
      keywords: "diff changes",
      run: ({ actions }) => {
        if (actions.getPanelKind("review")) actions.togglePanel(false);
        else actions.openPanel("review");
      },
    },
    {
      id: "toggle-files",
      title: "Toggle file tree",
      group: "Panels",
      icon: "file",
      shortcut: `${mod}+Shift+E`,
      run: ({ actions }) => {
        if (actions.getPanelKind("files")) actions.togglePanel(false);
        else actions.openPanel("files");
      },
    },
    {
      id: "toggle-terminal",
      title: "Open Terminal",
      group: "Panels",
      icon: "terminal",
      shortcut: "Ctrl+`",
      run: ({ actions }) => actions.openPanel("terminal"),
    },
    {
      id: "toggle-browser",
      title: "Open browser tab",
      group: "Panels",
      icon: "globe",
      shortcut: `${mod}+T`,
      run: ({ actions }) => actions.openPanel("browser"),
    },
    {
      id: "open-settings",
      title: "Settings…",
      group: "Navigation",
      icon: "gear",
      shortcut: `${mod}+,`,
      keywords: "preferences",
      run: ({ actions }) => actions.openSettings("general"),
    },
    {
      id: "keyboard-shortcuts",
      title: "Keyboard shortcuts",
      group: "Navigation",
      shortcut: `${mod}+/`,
      keywords: "hotkeys keys",
      run: ({ actions }) => actions.openSettings("shortcuts"),
    },
    {
      id: "archive-chat",
      title: "Archive chat",
      group: "Chat",
      icon: "archive",
      shortcut: `${mod}+Shift+A`,
      run: ({ actions, state }) => state.activeThreadId && actions.archiveThread(state.activeThreadId, true),
    },
    {
      id: "rename-chat",
      title: "Rename chat",
      group: "Chat",
      icon: "pencil",
      shortcut: `${mod}+Alt+R`,
      run: ({ actions, state }) => state.activeThreadId && actions.promptRename(state.activeThreadId),
    },
    {
      id: "pin-chat",
      title: "Pin/unpin chat",
      group: "Chat",
      icon: "pin",
      shortcut: `${mod}+Alt+P`,
      run: ({ actions, state }) => {
        const thread = state.threads.find((t) => t.id === state.activeThreadId);
        if (thread) actions.pinThread(thread.id, !thread.pinned);
      },
    },
    {
      id: "copy-path",
      title: "Copy conversation path",
      group: "Chat",
      icon: "copy",
      run: ({ actions }) => actions.pushToast("Conversation path copied"),
    },
    {
      id: "theme-bw",
      title: "Theme: Black & White (Georgia)",
      group: "Appearance",
      run: ({ actions }) => actions.updateSettings({ theme: "bw" }),
    },
    {
      id: "theme-vellum",
      title: "Theme: Vellum (black & blue)",
      group: "Appearance",
      run: ({ actions }) => actions.updateSettings({ theme: "vellum" }),
    },
    {
      id: "theme-dark",
      title: "Theme: Dark",
      group: "Appearance",
      run: ({ actions }) => actions.updateSettings({ theme: "dark" }),
    },
    {
      id: "theme-light",
      title: "Theme: Light",
      group: "Appearance",
      run: ({ actions }) => actions.updateSettings({ theme: "light" }),
    },
    {
      id: "theme-midnight",
      title: "Theme: Midnight",
      group: "Appearance",
      run: ({ actions }) => actions.updateSettings({ theme: "midnight" }),
    },
    {
      id: "theme-system",
      title: "Theme: System",
      group: "Appearance",
      run: ({ actions }) => actions.updateSettings({ theme: "system" }),
    },
  ];
}

export function shortcutMatches(e: KeyboardEvent, shortcut: string): boolean {
  const parts = shortcut.replace(/⌘/g, "Ctrl+").split("+");
  const key = parts[parts.length - 1];
  const needCtrl = parts.includes("Ctrl") || parts.includes("Mod");
  const needShift = parts.includes("Shift");
  const needAlt = parts.includes("Alt");
  const ctrl = e.ctrlKey || (isMac && e.metaKey);
  if (needCtrl !== ctrl) return false;
  if (needShift !== e.shiftKey) return false;
  if (needAlt !== e.altKey) return false;
  const eventKey = e.key.length === 1 ? e.key.toUpperCase() : e.key;
  const target = key.length === 1 ? key.toUpperCase() : key;
  return eventKey === target || e.key === key;
}

export function overlayIs(overlay: Overlay, kind: Overlay["kind"]): boolean {
  return overlay.kind === kind;
}
