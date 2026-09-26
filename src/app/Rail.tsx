import { useActions, useApp } from "../lib/store";
import { useMenu } from "../features/menus/menus";
import { Icon, type IconName } from "../components/Icon";
import "./Rail.css";

interface RailItem {
  id: string;
  icon: IconName;
  label: string;
  onClick: () => void;
  badge?: boolean;
}

export function Rail() {
  const state = useApp();
  const actions = useActions();
  const menu = useMenu();

  const items: RailItem[] = [
    {
      id: "home",
      icon: "home-active",
      label: "Home",
      onClick: () => actions.createDraft(),
    },
    {
      id: "history",
      icon: "history",
      label: "History",
      onClick: () => actions.openCommandMenu(),
    },
    {
      id: "plugins",
      icon: "columns",
      label: "Plugins",
      onClick: () => actions.openSettings("plugins"),
    },
    {
      id: "library",
      icon: "cards",
      label: "Library",
      onClick: () => actions.openSettings("skills"),
    },
    {
      id: "agents",
      icon: "at-circle",
      label: "Agents",
      onClick: () => actions.openPanel("subagents"),
    },
  ];

  return (
    <nav className="rail" aria-label="Primary">
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          className="rail-btn focus-ring"
          data-active={item.id === "home"}
          aria-label={item.label}
          title={item.label}
          onClick={item.onClick}
        >
          <Icon name={item.icon} size={20} />
          {item.badge && <span className="rail-badge" />}
        </button>
      ))}
      <div className="rail-spacer" />
      <button
        type="button"
        className="rail-btn focus-ring"
        aria-label="More"
        title="More"
        onClick={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          menu.open({
            anchor: { x: rect.right + 8, y: rect.top, width: 220, align: "left" },
            items: [
              { id: "settings", label: "Settings…", shortcut: "Ctrl+,", icon: "gear", onSelect: () => actions.openSettings("general") },
              { id: "shortcuts", label: "Keyboard shortcuts", shortcut: "Ctrl+/", onSelect: () => actions.openSettings("shortcuts") },
              { id: "sep1", label: "", separatorBefore: true },
              { id: "theme", label: "Toggle light / dark", onSelect: () => actions.updateSettings({ theme: state.settings.theme === "dark" ? "vellum" : "dark" }) },
              { id: "about", label: "About Vellum", onSelect: () => actions.pushToast("Vellum 1.0.0 — a local frontend build") },
            ],
          });
        }}
      >
        <Icon name="ellipsis" size={20} />
      </button>
    </nav>
  );
}
