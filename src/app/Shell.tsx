import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { useActions, useApp } from "../lib/store";
import { TopBar } from "./TopBar";
import { Rail } from "./Rail";
import { Sidebar } from "./Sidebar";
import { ThreadView } from "../features/thread/ThreadView";
import { Composer } from "../features/composer/Composer";
import { CommandMenu } from "../features/command-menu/CommandMenu";
import { SettingsDialog } from "../features/settings/SettingsDialog";
import { RightPanel } from "../features/panel/RightPanel";
import "./Shell.css";

function ResizeHandle({
  side,
  onDrag,
  label,
}: {
  side: "left" | "right";
  onDrag: (clientX: number) => void;
  label: string;
}) {
  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    const move = (ev: PointerEvent) => onDrag(ev.clientX);
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };
  return (
    <div
      className="shell-resize-handle"
      data-side={side}
      onPointerDown={onPointerDown}
      role="separator"
      aria-orientation="vertical"
      aria-label={label}
    />
  );
}

function ToastItem({ id, text, onDismiss }: { id: string; text: string; onDismiss: (id: string) => void }) {
  useEffect(() => {
    const t = window.setTimeout(() => onDismiss(id), 4200);
    return () => window.clearTimeout(t);
  }, [id, onDismiss]);
  return (
    <div className="shell-toast" role="status">
      <span>{text}</span>
      <button type="button" onClick={() => onDismiss(id)} aria-label="Dismiss">
        Dismiss
      </button>
    </div>
  );
}

function Toasts() {
  const { toasts } = useApp();
  const actions = useActions();
  if (!toasts.length) return null;
  return (
    <div className="shell-toasts">
      {toasts.map((t) => (
        <ToastItem key={t.id} id={t.id} text={t.text} onDismiss={actions.dismissToast} />
      ))}
    </div>
  );
}

function DialogShell({ children, onClose }: { children: ReactNode; onClose: () => void }) {
  return (
    <div
      className="shell-dialog-scrim"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="shell-dialog" role="dialog" aria-modal="true">
        {children}
      </div>
    </div>
  );
}

function RenameDialog() {
  const { rename } = useApp();
  const actions = useActions();
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (rename) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [rename]);
  if (!rename) return null;
  return (
    <DialogShell onClose={actions.cancelRename}>
      <h2>Rename chat</h2>
      <p>Keep it short and recognizable</p>
      <input
        ref={inputRef}
        value={rename.value}
        placeholder="Add a title…"
        onChange={(e) => actions.setRenameValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") actions.commitRename();
          if (e.key === "Escape") actions.cancelRename();
        }}
      />
      <div className="shell-dialog-actions">
        <button type="button" className="shell-btn focus-ring" onClick={actions.cancelRename}>
          Cancel
        </button>
        <button type="button" className="shell-btn focus-ring" data-variant="primary" onClick={actions.commitRename}>
          Save
        </button>
      </div>
    </DialogShell>
  );
}

function DeleteDialog() {
  const { confirmDelete } = useApp();
  const actions = useActions();
  if (!confirmDelete) return null;
  return (
    <DialogShell onClose={actions.cancelDelete}>
      <h2>Delete chat?</h2>
      <p>This permanently deletes the chat and its messages. This cannot be undone.</p>
      <div className="shell-dialog-actions">
        <button type="button" className="shell-btn focus-ring" onClick={actions.cancelDelete}>
          Cancel
        </button>
        <button type="button" className="shell-btn focus-ring" data-variant="danger" onClick={actions.confirmDelete}>
          Delete
        </button>
      </div>
    </DialogShell>
  );
}

function NamePrompt() {
  const { settings } = useApp();
  const actions = useActions();
  const [value, setValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    inputRef.current?.focus();
  }, []);
  if (settings.userName !== undefined) return null;
  const save = () => actions.updateSettings({ userName: value.trim() });
  const skip = () => actions.updateSettings({ userName: "" });
  return (
    <DialogShell onClose={skip}>
      <h2>Welcome to Vellum</h2>
      <p>What should we call you? It is only used for the greeting on the home screen.</p>
      <input
        ref={inputRef}
        value={value}
        placeholder="Your name"
        aria-label="Your name"
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && value.trim()) save();
        }}
      />
      <div className="shell-dialog-actions">
        <button type="button" className="shell-btn focus-ring" onClick={skip}>
          Skip
        </button>
        <button type="button" className="shell-btn focus-ring" data-variant="primary" disabled={!value.trim()} onClick={save}>
          Continue
        </button>
      </div>
    </DialogShell>
  );
}

export function Shell() {
  const state = useApp();
  const actions = useActions();
  const surfaceRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const ctrl = e.ctrlKey || e.metaKey;
      const key = e.key.toLowerCase();
      if (ctrl && !e.shiftKey && key === "k") {
        e.preventDefault();
        actions.openCommandMenu();
        return;
      }
      if (ctrl && e.shiftKey && key === "p") {
        e.preventDefault();
        actions.openCommandMenu();
        return;
      }
      if (ctrl && !e.shiftKey && !e.altKey && key === "n") {
        e.preventDefault();
        actions.createDraft();
        return;
      }
      if (ctrl && e.key === ",") {
        e.preventDefault();
        actions.openSettings("general");
        return;
      }
      if (ctrl && e.key === "/") {
        e.preventDefault();
        actions.openSettings("shortcuts");
        return;
      }
      if (ctrl && e.altKey && key === "b") {
        e.preventDefault();
        if (actions.getPanelKind("review")) actions.togglePanel(false);
        else actions.openPanel("review");
        return;
      }
      if (ctrl && !e.shiftKey && !e.altKey && key === "b") {
        e.preventDefault();
        actions.toggleSidebar();
        return;
      }
      if (ctrl && !e.shiftKey && !e.altKey && e.key >= "1" && e.key <= "9") {
        const list = state.threads.filter((t) => !t.archived);
        const target = list[Number(e.key) - 1];
        if (target) {
          e.preventDefault();
          actions.selectThread(target.id);
        }
        return;
      }
      if (e.key === "Escape" && state.overlay.kind !== "none") {
        actions.closeOverlay();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [actions, state.threads, state.overlay]);

  const sidebarVisible = state.layout.sidebarOpen;

  return (
    <div className="shell">
      <TopBar />
      <div className="shell-body">
        <Rail />
        <div className="shell-surface" ref={surfaceRef}>
          {sidebarVisible && (
            <div className="shell-sidebar-slot" style={{ width: state.layout.sidebarWidth }}>
              <Sidebar />
              <ResizeHandle
                side="right"
                label="Resize sidebar"
                onDrag={(x) => {
                  const left = surfaceRef.current?.getBoundingClientRect().left ?? 0;
                  actions.setSidebarWidth(Math.min(520, Math.max(240, x - left)));
                }}
              />
            </div>
          )}
          <main className="shell-main">
            <ThreadView />
            {state.activeThread && (
              <div className="shell-composer-anchor">
                <Composer threadId={state.activeThread.id} />
              </div>
            )}
          </main>
          {state.panel.open && (
            <div className="shell-panel-slot" style={{ width: state.panel.width }}>
              <ResizeHandle
                side="left"
                label="Resize panel"
                onDrag={(x) => {
                  const right = surfaceRef.current?.getBoundingClientRect().right ?? 0;
                  actions.setPanelWidth(Math.min(760, Math.max(320, right - x)));
                }}
              />
              <RightPanel />
            </div>
          )}
        </div>
      </div>
      <CommandMenu />
      <SettingsDialog />
      <RenameDialog />
      <DeleteDialog />
      <NamePrompt />
      <Toasts />
    </div>
  );
}
