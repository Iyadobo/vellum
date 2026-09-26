import { useState, type JSX } from "react";
import { Icon } from "../../components/Icon";
import { useActions } from "../../lib/store";

interface FileNode {
  name: string;
  children?: FileNode[];
}

const TREE: FileNode[] = [
  {
    name: "src",
    children: [
      {
        name: "app",
        children: [
          { name: "Shell.tsx" },
          { name: "Sidebar.tsx" },
          { name: "TopBar.tsx" },
          { name: "Rail.tsx" },
        ],
      },
      {
        name: "features",
        children: [
          {
            name: "panel",
            children: [
              { name: "RightPanel.tsx" },
              { name: "ReviewPane.tsx" },
              { name: "SubagentsPane.tsx" },
              { name: "panel.css" },
            ],
          },
          {
            name: "thread",
            children: [{ name: "ThreadView.tsx" }, { name: "thread.css" }],
          },
          {
            name: "menus",
            children: [{ name: "menus.tsx" }, { name: "menus.css" }],
          },
        ],
      },
      {
        name: "lib",
        children: [
          { name: "store.tsx" },
          { name: "engine.ts" },
          { name: "format.ts" },
          { name: "types.ts" },
          { name: "seed.ts" },
        ],
      },
      {
        name: "styles",
        children: [{ name: "tokens.css" }, { name: "base.css" }],
      },
      { name: "main.tsx" },
      { name: "App.tsx" },
    ],
  },
  { name: "package.json" },
  { name: "tsconfig.json" },
  { name: "vite.config.ts" },
  { name: "AGENT_CONTRACTS.md" },
];

function flatten(nodes: FileNode[], prefix: string, out: string[]): void {
  for (const node of nodes) {
    const path = prefix ? `${prefix}/${node.name}` : node.name;
    if (node.children) flatten(node.children, path, out);
    else out.push(path);
  }
}

const ALL_FILES: string[] = (() => {
  const out: string[] = [];
  flatten(TREE, "", out);
  return out;
})();

const DEFAULT_EXPANDED = ["src", "src/features", "src/features/panel", "src/lib", "src/styles"];

function TreeBranch({
  node,
  path,
  depth,
  expanded,
  onToggle,
  onOpen,
}: {
  node: FileNode;
  path: string;
  depth: number;
  expanded: Set<string>;
  onToggle: (path: string) => void;
  onOpen: (path: string) => void;
}): JSX.Element {
  if (node.children) {
    const open = expanded.has(path);
    return (
      <>
        <button
          type="button"
          className="panel-file-row focus-ring"
          style={{ paddingLeft: 8 + depth * 16 }}
          aria-expanded={open}
          onClick={() => onToggle(path)}
        >
          <span className="panel-file-chevron">
            <Icon name="chevron-right" size={12} />
          </span>
          <Icon name="folder" size={16} className="panel-file-icon" />
          <span className="panel-file-name truncate text-size-chat">{node.name}</span>
        </button>
        {open &&
          node.children.map((child) => (
            <TreeBranch
              key={child.name}
              node={child}
              path={`${path}/${child.name}`}
              depth={depth + 1}
              expanded={expanded}
              onToggle={onToggle}
              onOpen={onOpen}
            />
          ))}
      </>
    );
  }
  return (
    <button
      type="button"
      className="panel-file-row focus-ring"
      style={{ paddingLeft: 8 + depth * 16 + 18 }}
      onClick={() => onOpen(path)}
    >
      <Icon name="file" size={16} className="panel-file-icon" />
      <span className="panel-file-name truncate text-size-chat">{node.name}</span>
    </button>
  );
}

export function FilesPane(): JSX.Element {
  const actions = useActions();
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(DEFAULT_EXPANDED));

  const trimmed = query.trim().toLowerCase();
  const matches = trimmed ? ALL_FILES.filter((path) => path.toLowerCase().includes(trimmed)) : [];

  const toggle = (path: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  const open = (_path: string) => actions.pushToast("Opening files is not wired in this build");

  return (
    <div className="panel-pane panel-files">
      <div className="panel-files-header">
        <Icon name="search" size={14} />
        <input
          className="panel-files-filter text-size-chat"
          value={query}
          placeholder="Filter files…"
          aria-label="Filter files"
          spellCheck={false}
          onChange={(event) => setQuery(event.target.value)}
        />
        {query && (
          <button
            type="button"
            className="panel-icon-btn panel-files-clear focus-ring"
            aria-label="Clear filter"
            onClick={() => setQuery("")}
          >
            <Icon name="x" size={12} />
          </button>
        )}
      </div>
      <div className="panel-files-body hide-scrollbar">
        {trimmed ? (
          matches.length ? (
            matches.map((path) => (
              <button key={path} type="button" className="panel-file-row focus-ring" onClick={() => open(path)}>
                <Icon name="file" size={16} className="panel-file-icon" />
                <span className="panel-file-name truncate text-size-chat">{path}</span>
              </button>
            ))
          ) : (
            <p className="panel-files-empty text-size-chat">No files match “{query.trim()}”</p>
          )
        ) : (
          TREE.map((node) => (
            <TreeBranch
              key={node.name}
              node={node}
              path={node.name}
              depth={0}
              expanded={expanded}
              onToggle={toggle}
              onOpen={open}
            />
          ))
        )}
      </div>
    </div>
  );
}
