import { useEffect, useLayoutEffect, useMemo, useRef, useState, type JSX, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { Icon, type IconName } from "../../components/Icon";
import { buildCommands, type Command } from "../../lib/commands";
import { useActions, useApp } from "../../lib/store";
import type { Thread } from "../../lib/types";
import "./command-menu.css";

interface MenuRow {
  id: string;
  title: string;
  icon?: IconName;
  meta?: string;
  shortcut?: string;
  onSelect: () => void;
}

interface MenuSection {
  id: string;
  label: string;
  hint?: string;
  rows: MenuRow[];
}

const RECENT_CHAT_COUNT = 6;
const QUICK_ACTION_COUNT = 3;
const PANEL_WIDTH = 640;

function groupCommands(commands: Command[]): { label: string; commands: Command[] }[] {
  const order: string[] = [];
  const buckets = new Map<string, Command[]>();
  for (const command of commands) {
    const bucket = buckets.get(command.group);
    if (bucket) {
      bucket.push(command);
    } else {
      buckets.set(command.group, [command]);
      order.push(command.group);
    }
  }
  return order.map((label) => ({ label, commands: buckets.get(label) ?? [] }));
}

export function CommandMenu(): JSX.Element | null {
  const state = useApp();
  const actions = useActions();
  const overlay = state.overlay;
  const isOpen = overlay.kind === "command-menu";
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(0);
  const [panelLeft, setPanelLeft] = useState<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const rowRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const stateRef = useRef(state);
  const commands = useMemo(() => buildCommands(), []);

  useEffect(() => {
    stateRef.current = state;
  });

  useEffect(() => {
    if (overlay.kind !== "command-menu") return;
    setQuery(overlay.query ?? "");
    setSelected(0);
    inputRef.current?.focus();
  }, [overlay]);

  useLayoutEffect(() => {
    if (!isOpen) return;
    const measure = () => {
      const main = document.querySelector<HTMLElement>(".shell-main");
      const rect = main?.getBoundingClientRect();
      const center = rect ? rect.left + rect.width / 2 : window.innerWidth / 2;
      const width = Math.min(PANEL_WIDTH, window.innerWidth - 24);
      setPanelLeft(Math.max(12, Math.min(center - width / 2, window.innerWidth - width - 12)));
    };
    measure();
    window.addEventListener("resize", measure);
    const main = document.querySelector<HTMLElement>(".shell-main");
    const observer = typeof ResizeObserver !== "undefined" && main ? new ResizeObserver(measure) : null;
    observer?.observe(main as HTMLElement);
    return () => {
      window.removeEventListener("resize", measure);
      observer?.disconnect();
    };
  }, [isOpen, state.layout.sidebarOpen, state.layout.sidebarWidth, state.panel.open, state.panel.width]);

  const sections = useMemo<MenuSection[]>(() => {
    const commandRow = (command: Command): MenuRow => ({
      id: `command:${command.id}`,
      title: command.title,
      icon: command.icon,
      shortcut: command.shortcut,
      onSelect: () => {
        actions.closeOverlay();
        command.run({ actions, state: stateRef.current });
      },
    });
    const threadRow = (thread: Thread): MenuRow => ({
      id: `thread:${thread.id}`,
      title: thread.title || "New chat",
      meta: thread.project,
      onSelect: () => {
        actions.selectThread(thread.id);
        actions.closeOverlay();
      },
    });

    const result: MenuSection[] = [];
    const q = query.trim().toLowerCase();

    if (!q) {
      const recent = state.threads
        .filter((thread) => !thread.archived)
        .slice()
        .sort((a, b) => b.updatedAt - a.updatedAt)
        .slice(0, RECENT_CHAT_COUNT);
      if (recent.length > 0) {
        result.push({ id: "recent", label: "Recent chats", hint: "Ctrl+Tab", rows: recent.map(threadRow) });
      }
      result.push({
        id: "quick-actions",
        label: "Quick actions",
        rows: commands.slice(0, QUICK_ACTION_COUNT).map(commandRow),
      });
      const remaining = commands.slice(QUICK_ACTION_COUNT).filter((command) => command.group !== "Quick actions");
      for (const group of groupCommands(remaining)) {
        result.push({ id: `group:${group.label}`, label: group.label, rows: group.commands.map(commandRow) });
      }
      return result;
    }

    const threads = state.threads
      .filter((thread) => !thread.archived && thread.title.toLowerCase().includes(q))
      .slice()
      .sort((a, b) => b.updatedAt - a.updatedAt);
    if (threads.length > 0) {
      result.push({ id: "recent", label: "Recent chats", rows: threads.map(threadRow) });
    }
    const matched = commands.filter(
      (command) => command.title.toLowerCase().includes(q) || (command.keywords ?? "").toLowerCase().includes(q),
    );
    for (const group of groupCommands(matched)) {
      result.push({ id: `group:${group.label}`, label: group.label, rows: group.commands.map(commandRow) });
    }
    return result;
  }, [query, commands, state.threads, actions]);

  const flatRows = useMemo(() => sections.flatMap((section) => section.rows), [sections]);
  const rowIndexById = useMemo(() => {
    const map = new Map<string, number>();
    flatRows.forEach((row, index) => map.set(row.id, index));
    return map;
  }, [flatRows]);

  useEffect(() => {
    setSelected((current) => Math.min(current, Math.max(0, flatRows.length - 1)));
  }, [flatRows.length]);

  useEffect(() => {
    const node = rowRefs.current[selected];
    if (node && node.isConnected) node.scrollIntoView({ block: "nearest" });
  }, [selected, flatRows]);

  if (!isOpen) return null;

  const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setSelected((current) => Math.min(current + 1, flatRows.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setSelected((current) => Math.max(current - 1, 0));
    } else if (event.key === "Enter") {
      event.preventDefault();
      flatRows[selected]?.onSelect();
    } else if (event.key === "Escape") {
      event.preventDefault();
      actions.closeOverlay();
    }
  };

  return (
    <>
      <div className="cm-catcher" onMouseDown={actions.closeOverlay} aria-hidden="true" />
      <div
        className="cm-panel"
        role="dialog"
        aria-modal="true"
        aria-label="Search chats or run a command"
        style={panelLeft !== null ? { left: panelLeft } : undefined}
        onKeyDown={onKeyDown}
      >
        <div className="cm-search">
          <input
            ref={inputRef}
            className="cm-input"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search chats or run a command"
            aria-label="Search chats or run a command"
            spellCheck={false}
            autoComplete="off"
          />
        </div>
        {flatRows.length === 0 ? (
          <div className="cm-empty">No matches</div>
        ) : (
          <div className="cm-results" role="listbox" aria-label="Results">
            {sections.map((section) => (
              <div className="cm-group" key={section.id}>
                <div className="cm-group-label">
                  <span>{section.label}</span>
                  {section.hint ? <span className="cm-group-hint">{section.hint}</span> : null}
                </div>
                {section.rows.map((row) => {
                  const index = rowIndexById.get(row.id) ?? -1;
                  const rowSelected = index === selected;
                  return (
                    <button
                      key={row.id}
                      type="button"
                      role="option"
                      aria-selected={rowSelected}
                      id={`cm-row-${index}`}
                      ref={(element) => {
                        if (index >= 0) rowRefs.current[index] = element;
                      }}
                      className="cm-row focus-ring-inset"
                      data-selected={rowSelected}
                      onMouseMove={() => setSelected(index)}
                      onClick={row.onSelect}
                    >
                      {row.icon ? <Icon name={row.icon} size={16} className="cm-row-icon" /> : null}
                      <span className="cm-row-title truncate">{row.title}</span>
                      {row.meta ? <span className="cm-row-meta truncate">{row.meta}</span> : null}
                      {row.shortcut ? <span className="cm-row-shortcut">{row.shortcut}</span> : null}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
