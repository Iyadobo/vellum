import type { JSX } from "react";
import { Icon, type IconName } from "../../components/Icon";
import { useActions, useApp } from "../../lib/store";
import type { PanelTabKind } from "../../lib/types";
import { useMenu } from "../menus/menus";
import { BrowserPane } from "./BrowserPane";
import { FilesPane } from "./FilesPane";
import { ReviewPane } from "./ReviewPane";
import { SubagentsPane } from "./SubagentsPane";
import { TerminalPane } from "./TerminalPane";
import "./panel.css";

const KIND_ORDER: PanelTabKind[] = ["subagents", "review", "files", "terminal", "browser"];

const KIND_ICON: Record<PanelTabKind, IconName> = {
  subagents: "robot",
  review: "diff",
  files: "file",
  terminal: "terminal",
  browser: "globe",
};

const KIND_LABEL: Record<PanelTabKind, string> = {
  subagents: "Subagents",
  review: "Review",
  files: "Files",
  terminal: "Terminal",
  browser: "Browser",
};

function PanelEmptyState(): JSX.Element {
  const actions = useActions();
  return (
    <div className="panel-pane panel-empty">
      <p className="panel-empty-title text-size-chat">Open a panel</p>
      <div className="panel-empty-actions">
        <button
          type="button"
          className="panel-btn focus-ring text-size-chat"
          data-variant="primary"
          onClick={() => actions.openPanel("review")}
        >
          Review changes
        </button>
        <button type="button" className="panel-btn focus-ring text-size-chat" onClick={() => actions.openPanel("subagents")}>
          Subagents
        </button>
      </div>
    </div>
  );
}

export function RightPanel(): JSX.Element | null {
  const state = useApp();
  const actions = useActions();
  const menu = useMenu();

  if (!state.panel.open) return null;

  const activeTab = state.panel.tabs.find((tab) => tab.id === state.panel.activeId) ?? null;

  return (
    <section className="panel" aria-label="Thread panel">
      <div className="panel-tabstrip hide-scrollbar">
        {state.panel.tabs.map((tab) => {
          const active = state.panel.activeId === tab.id;
          return (
            <div key={tab.id} className="panel-tab" data-active={active}>
              <button
                type="button"
                className="panel-tab-main focus-ring"
                aria-pressed={active}
                onClick={() => actions.setPanelTab(tab.id)}
              >
                <span className="panel-tab-icon">
                  <Icon name={KIND_ICON[tab.kind]} size={16} />
                </span>
                <span className="panel-tab-label truncate text-size-chat">{tab.title}</span>
              </button>
              <button
                type="button"
                className="panel-tab-close focus-ring"
                aria-label={`Close ${tab.title} tab`}
                onClick={() => actions.closePanelTab(tab.id)}
              >
                <Icon name="x" size={12} />
              </button>
            </div>
          );
        })}
        <button
          type="button"
          className="panel-add focus-ring"
          aria-label="Open a panel"
          aria-haspopup="menu"
          onClick={(event) => {
            const rect = event.currentTarget.getBoundingClientRect();
            menu.open({
              anchor: { x: rect.right, y: rect.bottom + 6, width: 216, align: "right" },
              items: KIND_ORDER.map((kind) => ({
                id: kind,
                label: KIND_LABEL[kind],
                icon: KIND_ICON[kind],
                onSelect: () => actions.openPanel(kind),
              })),
            });
          }}
        >
          <Icon name="plus" size={16} />
        </button>
      </div>
      {activeTab ? (
        <>
          {activeTab.kind === "subagents" && <SubagentsPane />}
          {activeTab.kind === "review" && <ReviewPane />}
          {activeTab.kind === "files" && <FilesPane />}
          {activeTab.kind === "terminal" && <TerminalPane />}
          {activeTab.kind === "browser" && <BrowserPane />}
        </>
      ) : (
        <PanelEmptyState />
      )}
    </section>
  );
}
