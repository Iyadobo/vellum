import type { JSX } from "react";
import { Icon } from "../../components/Icon";
import { useActions } from "../../lib/store";

const SESSION: { text: string; tone?: "prompt" | "ok" | "fail" }[] = [
  { text: "$ pnpm test", tone: "prompt" },
  { text: "> vellum@0.0.0 test" },
  { text: "> vitest run" },
  { text: " " },
  { text: "✓ src/lib/format.test.ts (12 tests) 41ms", tone: "ok" },
  { text: "✓ src/lib/store.test.tsx (18 tests) 96ms", tone: "ok" },
  { text: "✓ src/features/panel/RightPanel.test.tsx (9 tests) 74ms", tone: "ok" },
  { text: "✗ src/lib/engine.test.ts (1 failed, 7 passed) 120ms", tone: "fail" },
  { text: " " },
  { text: "Test Files  1 failed | 3 passed (4)" },
  { text: "     Tests  1 failed | 46 passed (47)" },
  { text: " " },
  { text: "$ ", tone: "prompt" },
];

export function TerminalPane(): JSX.Element {
  const actions = useActions();
  return (
    <div className="panel-pane panel-terminal">
      <header className="panel-terminal-header">
        <span className="panel-terminal-title text-size-chat">Terminal</span>
        <button
          type="button"
          className="panel-icon-btn focus-ring"
          aria-label="Restart terminal"
          onClick={() => actions.pushToast("Restarting the terminal is not wired in this build")}
        >
          <Icon name="history" size={16} />
        </button>
      </header>
      <div className="panel-terminal-body hide-scrollbar">
        {SESSION.map((line, index) => (
          <div key={index} className="panel-terminal-line" data-tone={line.tone}>
            {line.text}
          </div>
        ))}
      </div>
      <div className="panel-terminal-inputrow">
        <input
          className="panel-terminal-input"
          placeholder="Terminal is read-only in this build"
          aria-label="Terminal input"
          disabled
        />
      </div>
    </div>
  );
}
