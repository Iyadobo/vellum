import { useActions, useApp, type VellumState } from "../lib/store";
import { useMenu, type MenuItem } from "../features/menus/menus";
import { Icon } from "../components/Icon";
import { WindowControls } from "./WindowControls";
import { checkForUpdates } from "../lib/updater";
import { APP_VERSION } from "../lib/version";
import "./TopBar.css";

export function buildFileMenu(state: VellumState, actions: ReturnType<typeof useActions>): MenuItem[] {
  void state;
  return [
    { id: "new-chat", label: "New chat", shortcut: "Ctrl+N", onSelect: () => actions.createDraft() },
    { id: "new-window", label: "New window", onSelect: () => actions.pushToast("Only one window in this build") },
    { id: "open-folder", label: "Open folder…", shortcut: "Ctrl+O", onSelect: () => actions.pushToast("Projects are seeded in this build") },
    { id: "open-terminal", label: "Open terminal", shortcut: "Ctrl+`", onSelect: () => actions.openPanel("terminal") },
    { id: "sep1", label: "", separatorBefore: true },
    { id: "settings", label: "Settings…", shortcut: "Ctrl+,", onSelect: () => actions.openSettings("general") },
    { id: "sep2", label: "", separatorBefore: true },
    { id: "close-tab", label: "Close tab", shortcut: "Ctrl+W", onSelect: () => actions.togglePanel(false) },
  ];
}

export function buildEditMenu(state: VellumState, actions: ReturnType<typeof useActions>): MenuItem[] {
  void state;
  const copy = () => {
    const sel = window.getSelection()?.toString();
    if (sel) void navigator.clipboard?.writeText(sel).catch(() => actions.pushToast("Clipboard unavailable"));
    else actions.pushToast("Nothing selected");
  };
  const paste = () => actions.pushToast("Use the composer to paste text");
  return [
    { id: "undo", label: "Undo", shortcut: "Ctrl+Z", onSelect: () => actions.pushToast("Nothing to undo") },
    { id: "redo", label: "Redo", shortcut: "Ctrl+Shift+Z", disabled: true },
    { id: "sep1", label: "", separatorBefore: true },
    { id: "cut", label: "Cut", shortcut: "Ctrl+X", onSelect: () => actions.pushToast("Use the composer to cut text") },
    { id: "copy", label: "Copy", shortcut: "Ctrl+C", onSelect: copy },
    { id: "paste", label: "Paste", shortcut: "Ctrl+V", onSelect: paste },
    { id: "select-all", label: "Select all", shortcut: "Ctrl+A", onSelect: () => document.execCommand("selectAll") },
    { id: "sep2", label: "", separatorBefore: true },
    { id: "find", label: "Find in chat", shortcut: "Ctrl+F", onSelect: () => actions.pushToast("Find bar is planned for a later pass") },
  ];
}

export function buildViewMenu(state: VellumState, actions: ReturnType<typeof useActions>): MenuItem[] {
  void state;
  return [
    { id: "toggle-sidebar", label: "Toggle sidebar", shortcut: "Ctrl+B", checked: state.layout.sidebarOpen, onSelect: () => actions.toggleSidebar() },
    {
      id: "toggle-review",
      label: "Toggle review panel",
      shortcut: "Ctrl+Alt+B",
      checked: state.panel.open,
      onSelect: () => {
        if (actions.getPanelKind("review")) actions.togglePanel(false);
        else actions.openPanel("review");
      },
    },
    {
      id: "toggle-files",
      label: "Toggle file tree",
      shortcut: "Ctrl+Shift+E",
      onSelect: () => {
        if (actions.getPanelKind("files")) actions.togglePanel(false);
        else actions.openPanel("files");
      },
    },
    { id: "sep1", label: "", separatorBefore: true },
    { id: "reload", label: "Reload window", shortcut: "Ctrl+R", onSelect: () => window.location.reload() },
    {
      id: "fullscreen",
      label: "Toggle full screen",
      onSelect: () => {
        if (document.fullscreenElement) void document.exitFullscreen();
        else void document.documentElement.requestFullscreen().catch(() => actions.pushToast("Full screen unavailable"));
      },
    },
  ];
}

export function buildHelpMenu(state: VellumState, actions: ReturnType<typeof useActions>): MenuItem[] {
  void state;
  return [
    { id: "docs", label: "Documentation", onSelect: () => actions.pushToast("Vellum is a local frontend build") },
    { id: "status", label: "System status", onSelect: () => actions.pushToast("All systems nominal") },
    { id: "sep1", label: "", separatorBefore: true },
    {
      id: "updates",
      label: "Check for updates…",
      onSelect: () => {
        void checkForUpdates((text) => actions.pushToast(text));
      },
    },
    { id: "shortcuts", label: "Keyboard shortcuts", shortcut: "Ctrl+/", onSelect: () => actions.openSettings("shortcuts") },
    { id: "whats-new", label: "What's new", onSelect: () => actions.pushToast(`You are on build ${APP_VERSION}`) },
  ];
}

export function TopBar() {
  const state = useApp();
  const actions = useActions();
  const menu = useMenu();

  const openMenu = (items: MenuItem[], e: React.MouseEvent<HTMLButtonElement>, id: string) => {
    const rect = e.currentTarget.getBoundingClientRect();
    menu.open({ items, anchor: { x: rect.left, y: rect.bottom + 6, width: 240, align: "left" }, title: id });
  };

  return (
    <header className="topbar" data-tauri-drag-region>
      <div className="topbar-nav" data-tauri-drag-region>
        <button type="button" className="topbar-icon-btn focus-ring" aria-label="Back" onClick={() => actions.pushToast("Nothing in the history")}>
          <Icon name="arrow-left" size={16} />
        </button>
        <button type="button" className="topbar-icon-btn focus-ring" aria-label="Forward" disabled>
          <Icon name="arrow-right" size={16} />
        </button>
        <button
          type="button"
          className="topbar-icon-btn focus-ring"
          aria-label="Toggle sidebar"
          onClick={() => actions.toggleSidebar()}
        >
          <Icon name="sidebar-toggle" size={16} />
        </button>
      </div>
      <nav className="topbar-menu" aria-label="Application menu" data-tauri-drag-region>
        <button type="button" className="topbar-menu-btn focus-ring" onClick={(e) => openMenu(buildFileMenu(state, actions), e, "file")}>
          File
        </button>
        <button type="button" className="topbar-menu-btn focus-ring" onClick={(e) => openMenu(buildEditMenu(state, actions), e, "edit")}>
          Edit
        </button>
        <button type="button" className="topbar-menu-btn focus-ring" onClick={(e) => openMenu(buildViewMenu(state, actions), e, "view")}>
          View
        </button>
        <button type="button" className="topbar-menu-btn focus-ring" onClick={(e) => openMenu(buildHelpMenu(state, actions), e, "help")}>
          Help
        </button>
      </nav>
      <div className="topbar-safezone" data-tauri-drag-region>
        <WindowControls />
      </div>
    </header>
  );
}
