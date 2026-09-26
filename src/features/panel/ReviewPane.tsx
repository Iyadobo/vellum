import { useState, type JSX } from "react";
import { Icon } from "../../components/Icon";
import { useActions, useApp } from "../../lib/store";
import type { Block, DiffFile, Thread } from "../../lib/types";

const FALLBACK_FILES: DiffFile[] = [
  {
    path: "src/features/panel/RightPanel.tsx",
    additions: 23,
    deletions: 16,
    hunks: [
      {
        header: "@@ -12,14 +12,21 @@ export function RightPanel() {",
        lines: [
          { type: "ctx", text: "  const state = useApp();" },
          { type: "ctx", text: "  const actions = useActions();" },
          { type: "del", text: "  if (!state.panel.open) return null;" },
          { type: "del", text: '  return <section className="panel" />;' },
          { type: "add", text: "  if (!state.panel.open) return null;" },
          { type: "add", text: "  const activeTab = state.panel.tabs.find((tab) => tab.id === state.panel.activeId);" },
          { type: "add", text: "  return (" },
          { type: "add", text: '    <section className="panel">' },
          { type: "add", text: "      <PanelTabs activeId={activeTab?.id ?? null} />" },
          { type: "add", text: "      {activeTab && <PanelPane kind={activeTab.kind} />}" },
          { type: "add", text: "    </section>" },
          { type: "add", text: "  );" },
          { type: "ctx", text: "}" },
        ],
      },
    ],
  },
  {
    path: "src/features/menus/menus.css",
    additions: 4,
    deletions: 3,
    hunks: [
      {
        header: "@@ -1,9 +1,10 @@",
        lines: [
          { type: "ctx", text: ".menu-surface {" },
          { type: "ctx", text: "  position: fixed;" },
          { type: "del", text: "  padding: 4px;" },
          { type: "add", text: "  padding: 4px;" },
          { type: "add", text: "  max-height: min(70vh, 480px);" },
          { type: "add", text: "  overflow-y: auto;" },
          { type: "add", text: "  overscroll-behavior: contain;" },
          { type: "ctx", text: "}" },
        ],
      },
    ],
  },
];

function collectDiffFiles(thread: Thread | null): DiffFile[] {
  if (!thread) return FALLBACK_FILES;
  const seen = new Set<string>();
  const files: DiffFile[] = [];
  const visit = (blocks: Block[]) => {
    for (const block of blocks) {
      if (block.kind === "diff" || block.kind === "review") {
        for (const file of block.files) {
          if (seen.has(file.path)) continue;
          seen.add(file.path);
          files.push(file);
        }
      } else if (block.kind === "turn") {
        visit(block.children);
      }
    }
  };
  for (const message of thread.messages) visit(message.blocks);
  return files.length ? files : FALLBACK_FILES;
}

function DiffFileRow({
  file,
  expanded,
  onToggle,
}: {
  file: DiffFile;
  expanded: boolean;
  onToggle: () => void;
}): JSX.Element {
  return (
    <div className="panel-diff-file" data-expanded={expanded}>
      <button
        type="button"
        className="panel-diff-file-row focus-ring"
        aria-expanded={expanded}
        onClick={onToggle}
      >
        <span className="panel-diff-chevron">
          <Icon name="chevron-right" size={12} />
        </span>
        <span className="panel-diff-path truncate text-size-chat">{file.path}</span>
        <span className="panel-diff-stats">
          <span className="panel-count-add">+{file.additions}</span>
          <span className="panel-count-del">−{file.deletions}</span>
        </span>
      </button>
      {expanded && (
        <div className="panel-diff-body hide-scrollbar">
          {file.hunks.map((hunk, hunkIndex) => (
            <div key={hunkIndex}>
              <div className="panel-diff-hunk">{hunk.header}</div>
              <div className="panel-diff-lines">
                {hunk.lines.map((line, lineIndex) => (
                  <div key={lineIndex} className="panel-diff-line" data-type={line.type}>
                    {line.text || " "}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function ReviewPane(): JSX.Element {
  const { activeThread } = useApp();
  const actions = useActions();
  const files = collectDiffFiles(activeThread);
  const [segment, setSegment] = useState<"unstaged" | "staged">("unstaged");
  const [expanded, setExpanded] = useState<string | null>(files[0]?.path ?? null);

  const additions = files.reduce((total, file) => total + file.additions, 0);
  const deletions = files.reduce((total, file) => total + file.deletions, 0);
  const visible = segment === "unstaged" ? files : [];

  return (
    <div className="panel-pane panel-review">
      <header className="panel-review-header">
        <div className="panel-segmented" role="tablist" aria-label="Change group">
          <button
            type="button"
            role="tab"
            className="text-size-chat"
            aria-selected={segment === "unstaged"}
            data-active={segment === "unstaged"}
            onClick={() => setSegment("unstaged")}
          >
            Unstaged
          </button>
          <button
            type="button"
            role="tab"
            className="text-size-chat"
            aria-selected={segment === "staged"}
            data-active={segment === "staged"}
            onClick={() => setSegment("staged")}
          >
            Staged
          </button>
        </div>
        <div className="panel-review-meta">
          <span className="panel-review-counts">
            <span className="panel-count-add">+{additions}</span>
            <span className="panel-count-del">−{deletions}</span>
          </span>
          <button
            type="button"
            className="panel-btn focus-ring text-size-chat"
            data-variant="primary"
            onClick={() => actions.pushToast("Committing is not wired in this build")}
          >
            Commit
          </button>
        </div>
      </header>
      <p className="panel-review-label text-size-chat">Review changes</p>
      <div className="panel-review-body hide-scrollbar">
        {visible.length === 0 ? (
          <div className="panel-review-empty">
            <p className="panel-empty-title text-size-chat">
              {segment === "unstaged" ? "No unstaged changes" : "No staged changes"}
            </p>
            <p className="panel-empty-note text-size-chat">
              {segment === "unstaged" ? "Code changes will appear here" : "Staged changes will appear here"}
            </p>
          </div>
        ) : (
          visible.map((file) => (
            <DiffFileRow
              key={file.path}
              file={file}
              expanded={expanded === file.path}
              onToggle={() => setExpanded(expanded === file.path ? null : file.path)}
            />
          ))
        )}
      </div>
    </div>
  );
}
