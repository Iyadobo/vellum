import { useMemo, useState } from "react";
import { useActions, useApp } from "../lib/store";
import { useMenu, type MenuItem } from "../features/menus/menus";
import { Icon } from "../components/Icon";
import { OrnamentRule } from "../components/Ornament";
import { formatRelative } from "../lib/format";
import type { Thread } from "../lib/types";
import "./Sidebar.css";

const COLLAPSED_COUNT = 8;

function threadMenuItems(thread: Thread, actions: ReturnType<typeof useActions>): MenuItem[] {
  return [
    {
      id: "pin",
      label: thread.pinned ? "Unpin chat" : "Pin chat",
      icon: "pin",
      shortcut: "Ctrl+Alt+P",
      onSelect: () => actions.pinThread(thread.id, !thread.pinned),
    },
    {
      id: "rename",
      label: "Rename chat",
      icon: "pencil",
      shortcut: "Ctrl+Alt+R",
      onSelect: () => actions.promptRename(thread.id),
    },
    {
      id: "read",
      label: thread.unread ? "Mark as read" : "Mark as unread",
      icon: "check",
      onSelect: () => actions.markRead(thread.id, !!thread.unread),
    },
    {
      id: "archive",
      label: "Archive chat",
      icon: "archive",
      shortcut: "Ctrl+Shift+A",
      onSelect: () => {
        actions.archiveThread(thread.id, true);
        actions.pushToast("Chat archived");
      },
    },
    { id: "sep", label: "", separatorBefore: true },
    {
      id: "delete",
      label: "Permanently delete",
      icon: "trash",
      danger: true,
      onSelect: () => actions.requestDelete(thread.id),
    },
  ];
}

function ThreadRow({ thread }: { thread: Thread }) {
  const state = useApp();
  const actions = useActions();
  const menu = useMenu();
  const selected = state.activeThreadId === thread.id;

  return (
    <div
      className="sidebar-row"
      data-selected={selected}
      data-unread={thread.unread}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          actions.selectThread(thread.id);
        }
      }}
      onClick={() => actions.selectThread(thread.id)}
    >
      <span className="sidebar-row-label">{thread.title || "Untitled chat"}</span>
      <span className="sidebar-row-meta">
        {thread.running && <Icon name="clock" size={12} />}
        {thread.unread ? <span className="sidebar-unread-dot" /> : <span className="sidebar-row-meta-time">{formatRelative(thread.updatedAt)}</span>}
      </span>
      <span className="sidebar-row-actions">
        <button
          type="button"
          className="sidebar-row-action focus-ring"
          aria-label={`Chat options for ${thread.title}`}
          onClick={(e) => {
            e.stopPropagation();
            const rect = e.currentTarget.getBoundingClientRect();
            menu.open({
              anchor: { x: rect.right, y: rect.bottom + 4, width: 220, align: "right" },
              items: threadMenuItems(thread, actions),
            });
          }}
        >
          <Icon name="kebab" size={14} />
        </button>
      </span>
    </div>
  );
}

export function Sidebar() {
  const state = useApp();
  const actions = useActions();
  const menu = useMenu();
  const [expanded, setExpanded] = useState(false);

  const visible = useMemo(() => {
    return state.threads.filter((t) => !t.archived).sort((a, b) => b.updatedAt - a.updatedAt);
  }, [state.threads]);

  const pinned = visible.filter((t) => t.pinned);
  const recent = visible.filter((t) => !t.pinned);
  const unreadCount = visible.filter((t) => t.unread).length;

  return (
    <aside className="sidebar" aria-label="Chat history">
      <div className="sidebar-header">
        <button
          type="button"
          className="sidebar-title focus-ring"
          onClick={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            menu.open({
              anchor: { x: rect.left, y: rect.bottom + 4, width: 230, align: "left" },
              items: [
                { id: "new", label: "New chat", icon: "compose", shortcut: "Ctrl+N", onSelect: () => actions.createDraft() },
                { id: "settings", label: "Settings…", icon: "gear", shortcut: "Ctrl+,", onSelect: () => actions.openSettings("general") },
                { id: "shortcuts", label: "Keyboard shortcuts", shortcut: "Ctrl+/", onSelect: () => actions.openSettings("shortcuts") },
              ],
            });
          }}
        >
          <span>Vellum</span>
          <span className="sidebar-title-chevron">
            <Icon name="chevron-down" size={14} />
          </span>
        </button>
        <div className="sidebar-header-actions">
          <button
            type="button"
            className="sidebar-icon-btn focus-ring"
            aria-label="Notifications"
            onClick={() => {
              if (unreadCount) {
                visible.filter((t) => t.unread).forEach((t) => actions.markRead(t.id, true));
                actions.pushToast("Marked all chats as read");
              } else {
                actions.pushToast("You're all caught up");
              }
            }}
          >
            <Icon name={unreadCount ? "bell-badge" : "bell"} size={16} />
          </button>
          <button
            type="button"
            className="sidebar-icon-btn focus-ring"
            aria-label="Search chats"
            onClick={() => actions.openCommandMenu()}
          >
            <Icon name="search" size={16} />
          </button>
        </div>
      </div>

      <button type="button" className="sidebar-new-chat focus-ring" onClick={() => actions.createDraft()}>
        <span className="sidebar-new-chat-icon">
          <Icon name="compose" size={16} />
        </span>
        New chat
      </button>
      <div className="sidebar-separator" />

      <div className="sidebar-scroll">
        {pinned.length > 0 && (
          <>
            <div className="sidebar-section-label">Pinned</div>
            {pinned.map((t) => (
              <ThreadRow key={t.id} thread={t} />
            ))}
          </>
        )}

        <div className="sidebar-section-label">Recents</div>
        {(expanded ? recent : recent.slice(0, COLLAPSED_COUNT)).map((t) => (
          <ThreadRow key={t.id} thread={t} />
        ))}
        {recent.length > COLLAPSED_COUNT && !expanded && (
          <button type="button" className="sidebar-show-more focus-ring" onClick={() => setExpanded(true)}>
            Show more
          </button>
        )}
        {recent.length === 0 && (
          <div className="sidebar-empty">
            <OrnamentRule width={104} />
            <span>No chats yet</span>
          </div>
        )}
      </div>

      <div className="sidebar-footer">
        <button type="button" className="sidebar-user focus-ring" onClick={() => actions.pushToast("Signed in locally")}>
          <span className="sidebar-avatar">I</span>
          <span className="truncate">Local workspace</span>
        </button>
        <button
          type="button"
          className="sidebar-icon-btn focus-ring"
          aria-label="Settings"
          onClick={() => actions.openSettings("general")}
        >
          <Icon name="gear" size={16} />
        </button>
      </div>
    </aside>
  );
}
