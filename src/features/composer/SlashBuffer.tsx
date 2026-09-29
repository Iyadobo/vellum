import { useEffect, useRef, useState, type JSX } from "react";
import { Icon } from "../../components/Icon";
import { buildCommands, type Command } from "../../lib/commands";
import "./slash-buffer.css";

const SLASH_COMMANDS = buildCommands();

export function slashToken(value: string): string | null {
  if (!value.startsWith("/")) return null;
  const rest = value.slice(1);
  if (rest.includes("\n") || rest.includes(" ")) return null;
  return rest.toLowerCase();
}

export function matchSlashCommands(query: string): Command[] {
  if (!query) return SLASH_COMMANDS;
  return SLASH_COMMANDS.filter(
    (command) =>
      command.title.toLowerCase().includes(query) ||
      (command.keywords ?? "").toLowerCase().includes(query) ||
      command.id.includes(query),
  );
}

const PANEL_WIDTH = 400;

export function SlashBuffer({
  anchor,
  matches,
  selected,
  onSelected,
  onExecute,
}: {
  anchor: HTMLTextAreaElement | null;
  matches: Command[];
  selected: number;
  onSelected: (index: number) => void;
  onExecute: (command: Command) => void;
}): JSX.Element | null {
  const [pos, setPos] = useState({ left: 0, bottom: 0 });
  const rowRefs = useRef<(HTMLButtonElement | null)[]>([]);

  useEffect(() => {
    const measure = () => {
      const rect = anchor?.getBoundingClientRect();
      if (!rect) return;
      const width = Math.min(PANEL_WIDTH, window.innerWidth - 16);
      setPos({
        left: Math.max(8, Math.min(rect.left, window.innerWidth - width - 8)),
        bottom: window.innerHeight - rect.top + 10,
      });
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [anchor]);

  useEffect(() => {
    const node = rowRefs.current[selected];
    if (node && node.isConnected) node.scrollIntoView({ block: "nearest" });
  }, [selected, matches]);

  if (matches.length === 0) {
    return (
      <div className="slash-panel" style={{ left: pos.left, bottom: pos.bottom }} id="slash-panel">
        <div className="slash-empty">No matching command — Enter sends this as a message</div>
      </div>
    );
  }

  return (
    <div
      className="slash-panel"
      style={{ left: pos.left, bottom: pos.bottom }}
      id="slash-panel"
      role="listbox"
      aria-label="Slash commands"
    >
      <div className="slash-head">
        <span>Commands</span>
        <span className="slash-hint">↑↓ move · ↵ run · Tab complete · Esc dismiss</span>
      </div>
      <div className="slash-rows">
        {matches.map((command, index) => (
          <button
            key={command.id}
            ref={(element) => {
              rowRefs.current[index] = element;
            }}
            type="button"
            role="option"
            aria-selected={index === selected}
            id={`slash-row-${index}`}
            className="slash-row focus-ring-inset"
            data-selected={index === selected}
            onMouseMove={() => onSelected(index)}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => onExecute(command)}
          >
            {command.icon ? <Icon name={command.icon} size={16} className="slash-row-icon" /> : null}
            <span className="slash-row-title truncate">{command.title}</span>
            {command.shortcut ? <span className="slash-row-shortcut">{command.shortcut}</span> : null}
          </button>
        ))}
      </div>
    </div>
  );
}
