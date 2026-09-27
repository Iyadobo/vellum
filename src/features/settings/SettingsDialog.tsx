import {
  useEffect,
  useLayoutEffect,
  useState,
  type JSX,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from "react";
import { Icon, type IconName } from "../../components/Icon";
import { BrandMark } from "../../components/BrandMark";
import { brandForProvider } from "../../lib/brand";
import { formatRelative } from "../../lib/format";
import { probeProvider } from "../../lib/router";
import { useActions, useApp } from "../../lib/store";
import type { Settings, ThemeSetting, Thread } from "../../lib/types";
import "./settings.css";

interface NavItem {
  id: string;
  label: string;
  icon?: IconName;
}

interface NavGroup {
  label: string;
  items: NavItem[];
}

const NAV_GROUPS: NavGroup[] = [
  {
    label: "Personal",
    items: [
      { id: "account", label: "Account", icon: "at-circle" },
      { id: "general", label: "General", icon: "gear" },
      { id: "appearance", label: "Appearance", icon: "sparkles" },
      { id: "notifications", label: "Notifications", icon: "bell" },
      { id: "personalization", label: "Personalization", icon: "pencil" },
      { id: "shortcuts", label: "Keyboard shortcuts", icon: "terminal" },
    ],
  },
  {
    label: "Coding",
    items: [
      { id: "configuration", label: "Configuration", icon: "cards" },
      { id: "git", label: "Git", icon: "git-branch" },
      { id: "worktrees", label: "Worktrees", icon: "split" },
      { id: "code-review", label: "Code Review", icon: "diff" },
    ],
  },
  {
    label: "Integrations",
    items: [
      { id: "providers", label: "Providers", icon: "globe" },
      { id: "mcp", label: "MCP servers", icon: "robot" },
      { id: "plugins", label: "Plugins", icon: "plus" },
      { id: "skills", label: "Skills", icon: "sparkles" },
      { id: "browser-extension", label: "Browser extension", icon: "globe" },
      { id: "computer-use", label: "Computer use", icon: "terminal" },
    ],
  },
  {
    label: "Archived",
    items: [{ id: "archived", label: "Archived chats", icon: "archive" }],
  },
];

const SECTION_LABELS = new Map<string, string>(
  NAV_GROUPS.flatMap((group) => group.items.map((item) => [item.id, item.label] as const)),
);

const THEME_OPTIONS: { value: ThemeSetting; label: string; hint?: string }[] = [
  { value: "bw", label: "Black & White", hint: "Georgia · plain" },
  { value: "vellum", label: "Vellum", hint: "Black & blue" },
  { value: "dark", label: "Dark" },
  { value: "light", label: "Light" },
  { value: "midnight", label: "Midnight", hint: "Blue-tinted" },
  { value: "system", label: "System" },
];

const THEME_SWATCHES: Record<ThemeSetting, string[]> = {
  bw: ["#000000", "#101010", "#f2f2f2"],
  vellum: ["#000000", "#0d1420", "#0285ff"],
  dark: ["#0d0d0d", "#131313", "#212121"],
  light: ["#ffffff", "#f9f9f9", "#cdcdcd"],
  midnight: ["#0a0d12", "#0d1117", "#1e2328"],
  system: ["#131313", "#f9f9f9"],
};

interface ShortcutEntry {
  action: string;
  keys: string;
  group: "App" | "Composer" | "Chat";
}

const SHORTCUT_GROUPS: ShortcutEntry["group"][] = ["App", "Composer", "Chat"];

const SHORTCUTS: ShortcutEntry[] = [
  { action: "Command menu", keys: "Ctrl+K", group: "App" },
  { action: "New chat", keys: "Ctrl+N", group: "App" },
  { action: "Search chats", keys: "Ctrl+K", group: "App" },
  { action: "Toggle sidebar", keys: "Ctrl+B", group: "App" },
  { action: "Toggle review panel", keys: "Ctrl+Alt+B", group: "App" },
  { action: "Toggle file tree", keys: "Ctrl+Shift+E", group: "App" },
  { action: "Toggle bottom panel", keys: "Ctrl+J", group: "App" },
  { action: "Settings", keys: "Ctrl+,", group: "App" },
  { action: "Keyboard shortcuts", keys: "Ctrl+/", group: "App" },
  { action: "Find in chat", keys: "Ctrl+F", group: "Chat" },
  { action: "Switch chat 1–9", keys: "Ctrl+1…9", group: "Chat" },
  { action: "Close tab", keys: "Ctrl+W", group: "Chat" },
  { action: "Send message", keys: "Enter", group: "Composer" },
  { action: "Add files", keys: "Ctrl+U", group: "Composer" },
];

function Switch({
  checked,
  label,
  onChange,
}: {
  checked: boolean;
  label: string;
  onChange: (checked: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      className="settings-switch focus-ring"
      data-checked={checked}
      onClick={() => onChange(!checked)}
    >
      <span className="settings-switch-thumb" />
    </button>
  );
}

function Segmented<T extends string>({
  value,
  options,
  label,
  onChange,
}: {
  value: T;
  options: { value: T; label: string }[];
  label: string;
  onChange: (value: T) => void;
}) {
  return (
    <div className="settings-segmented" role="radiogroup" aria-label={label}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={value === option.value}
          className="settings-segment focus-ring"
          data-active={value === option.value}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function SettingRow({
  label,
  description,
  control,
}: {
  label: string;
  description?: string;
  control: ReactNode;
}) {
  return (
    <div className="settings-row">
      <div className="settings-row-text">
        <div className="settings-row-label">{label}</div>
        {description ? <div className="settings-row-desc">{description}</div> : null}
      </div>
      <div className="settings-row-control">{control}</div>
    </div>
  );
}

function GeneralPane({ settings, onUpdate }: { settings: Settings; onUpdate: (patch: Partial<Settings>) => void }) {
  return (
    <>
      <h2 className="settings-title">General</h2>
      <p className="settings-hint">Applies to new chats across projects</p>
      <div className="settings-rows">
        <SettingRow
          label="Your name"
          description="Used to greet you when Vellum opens"
          control={
            <input
              className="settings-text-input"
              type="text"
              value={settings.userName ?? ""}
              placeholder="Your name"
              aria-label="Your name"
              onChange={(event) => onUpdate({ userName: event.target.value })}
            />
          }
        />
        <SettingRow
          label="Send shortcut"
          description="Choose which key sends a message"
          control={
            <Segmented
              label="Send shortcut"
              value={settings.sendShortcut}
              options={[
                { value: "enter", label: "Enter" },
                { value: "mod-enter", label: "Ctrl+Enter" },
              ]}
              onChange={(sendShortcut) => onUpdate({ sendShortcut })}
            />
          }
        />
        <SettingRow
          label="Follow-up behavior"
          description="What happens when you send while a response is running"
          control={
            <Segmented
              label="Follow-up behavior"
              value={settings.followUpBehavior}
              options={[
                { value: "queue", label: "Queue" },
                { value: "steer", label: "Steer" },
              ]}
              onChange={(followUpBehavior) => onUpdate({ followUpBehavior })}
            />
          }
        />
        <SettingRow
          label="Diff markers"
          description="How added and removed lines are marked"
          control={
            <Segmented
              label="Diff markers"
              value={settings.diffMarkers}
              options={[
                { value: "color", label: "Color" },
                { value: "symbols", label: "Symbols" },
              ]}
              onChange={(diffMarkers) => onUpdate({ diffMarkers })}
            />
          }
        />
        <SettingRow
          label="Reduce motion"
          description="Minimize animations across the interface"
          control={
            <Switch
              label="Reduce motion"
              checked={settings.reduceMotion}
              onChange={(reduceMotion) => onUpdate({ reduceMotion })}
            />
          }
        />
        <SettingRow
          label="Use pointer cursors"
          description="Change the cursor to a pointer over interactive elements"
          control={
            <Switch
              label="Use pointer cursors"
              checked={settings.pointerCursors}
              onChange={(pointerCursors) => onUpdate({ pointerCursors })}
            />
          }
        />
        <SettingRow
          label="Show context window usage"
          description="Display how much of the model context the current chat has used"
          control={
            <Switch
              label="Show context window usage"
              checked={settings.showContextUsage}
              onChange={(showContextUsage) => onUpdate({ showContextUsage })}
            />
          }
        />
        <SettingRow
          label="Prevent sleep while running"
          description="Keep the computer awake while a response is running"
          control={
            <Switch
              label="Prevent sleep while running"
              checked={settings.preventSleep}
              onChange={(preventSleep) => onUpdate({ preventSleep })}
            />
          }
        />
        <SettingRow
          label="Show educational tips"
          description="Surface short tips that explain how Vellum works"
          control={
            <Switch
              label="Show educational tips"
              checked={settings.showTips}
              onChange={(showTips) => onUpdate({ showTips })}
            />
          }
        />
        <SettingRow
          label="Bottom panel"
          description="Show a bottom panel for terminal and output"
          control={
            <Switch
              label="Bottom panel"
              checked={settings.bottomPanel}
              onChange={(bottomPanel) => onUpdate({ bottomPanel })}
            />
          }
        />
        <SettingRow
          label="Font smoothing"
          description="Use smoothed font rendering for interface text"
          control={
            <Switch
              label="Font smoothing"
              checked={settings.fontSmoothing}
              onChange={(fontSmoothing) => onUpdate({ fontSmoothing })}
            />
          }
        />
      </div>
    </>
  );
}

function ThemePreview({ theme }: { theme: ThemeSetting }) {
  if (theme === "system") {
    const [dark, light] = THEME_SWATCHES.system;
    return (
      <div className="settings-theme-preview">
        <span className="settings-theme-swatch" style={{ background: dark }} />
        <span className="settings-theme-swatch" style={{ background: light }} />
      </div>
    );
  }
  return (
    <div className="settings-theme-preview">
      {THEME_SWATCHES[theme].map((color) => (
        <span key={color} className="settings-theme-swatch" style={{ background: color }} />
      ))}
    </div>
  );
}

function AppearancePane({ settings, onUpdate }: { settings: Settings; onUpdate: (patch: Partial<Settings>) => void }) {
  const [radiusScale] = useState(() => {
    if (typeof document === "undefined") return "1";
    const value = getComputedStyle(document.documentElement).getPropertyValue("--corner-radius-scale").trim();
    return value || "1";
  });
  return (
    <>
      <h2 className="settings-title">Appearance</h2>
      <p className="settings-hint">The default is a plain black & white theme set in Georgia — Vellum, Dark, Light, Midnight and System are still available</p>
      <div className="settings-theme-grid">
        {THEME_OPTIONS.map((option) => {
          const active = settings.theme === option.value;
          return (
            <button
              key={option.value}
              type="button"
              className="settings-theme-card focus-ring"
              data-active={active}
              aria-pressed={active}
              onClick={() => onUpdate({ theme: option.value })}
            >
              <ThemePreview theme={option.value} />
              <span className="settings-theme-row">
                <span className="settings-theme-label">
                  {option.label}
                  {option.hint ? <span className="settings-theme-hint">{option.hint}</span> : null}
                </span>
                {active ? <Icon name="check" size={14} className="settings-theme-check" /> : null}
              </span>
            </button>
          );
        })}
      </div>
      <div className="settings-rows settings-theme-rows">
        <SettingRow
          label="Corner radius scale"
          description="Rounding preset applied across the interface"
          control={<span className="settings-readonly-value">{radiusScale}×</span>}
        />
        <SettingRow
          label="Font smoothing"
          description="Use smoothed font rendering for interface text"
          control={
            <Switch
              label="Font smoothing"
              checked={settings.fontSmoothing}
              onChange={(fontSmoothing) => onUpdate({ fontSmoothing })}
            />
          }
        />
      </div>
    </>
  );
}

function ShortcutsPane({ onReset }: { onReset: () => void }) {
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const filtered = SHORTCUTS.filter(
    (shortcut) => !q || shortcut.action.toLowerCase().includes(q) || shortcut.keys.toLowerCase().includes(q),
  );
  return (
    <>
      <h2 className="settings-title">Keyboard shortcuts</h2>
      <p className="settings-hint">Shortcuts are fixed in this build</p>
      <div className="settings-search">
        <Icon name="search" size={14} className="settings-search-icon" />
        <input
          className="settings-search-input"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search shortcuts"
          aria-label="Search shortcuts"
          spellCheck={false}
          autoComplete="off"
        />
      </div>
      {filtered.length === 0 ? (
        <div className="settings-empty">No matching shortcuts</div>
      ) : (
        SHORTCUT_GROUPS.map((group) => {
          const rows = filtered.filter((shortcut) => shortcut.group === group);
          if (rows.length === 0) return null;
          return (
            <section key={group} className="settings-shortcut-group">
              <h3 className="settings-shortcut-group-label">{group}</h3>
              <div className="settings-rows">
                {rows.map((shortcut) => (
                  <div key={`${shortcut.action}:${shortcut.keys}`} className="settings-shortcut-row">
                    <span className="settings-shortcut-action">{shortcut.action}</span>
                    <span className="settings-shortcut-keys">
                      {shortcut.keys.split("+").map((part) => (
                        <kbd key={part} className="settings-kbd">
                          {part}
                        </kbd>
                      ))}
                    </span>
                  </div>
                ))}
              </div>
            </section>
          );
        })
      )}
      <div className="settings-rows settings-shortcut-reset">
        <SettingRow
          label="Reset all to defaults"
          description="Restore every shortcut to its original binding"
          control={
            <button type="button" className="settings-btn focus-ring" onClick={onReset}>
              Reset
            </button>
          }
        />
      </div>
    </>
  );
}

function ArchivedPane({ threads, onUnarchive }: { threads: Thread[]; onUnarchive: (id: string) => void }) {
  return (
    <>
      <h2 className="settings-title">Archived chats</h2>
      <p className="settings-hint">Archived chats stay here until you restore or delete them</p>
      {threads.length === 0 ? (
        <div className="settings-empty">No archived tasks</div>
      ) : (
        <div className="settings-rows">
          {threads.map((thread) => (
            <div key={thread.id} className="settings-archived-row">
              <div className="settings-archived-text">
                <div className="settings-archived-title truncate">{thread.title || "New chat"}</div>
                <div className="settings-archived-meta truncate">
                  {[thread.project, formatRelative(thread.updatedAt)].filter(Boolean).join(" · ")}
                </div>
              </div>
              <button type="button" className="settings-btn focus-ring" onClick={() => onUnarchive(thread.id)}>
                Unarchive
              </button>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

function PlaceholderPane({ title }: { title: string }) {
  return (
    <>
      <h2 className="settings-title">{title}</h2>
      <div className="settings-info-row">
        <Icon name="info" size={16} className="settings-info-icon" />
        <span>This section is not wired in the local build yet.</span>
      </div>
    </>
  );
}

function ProvidersPane() {
  const state = useApp();
  const actions = useActions();
  const [keys, setKeys] = useState<Record<string, string>>({});
  const [probes, setProbes] = useState<Record<string, string>>({});

  useEffect(() => {
    actions.refreshRouterConfig();
    actions.refreshRouter(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const providers = state.routerConfig?.providers ?? [];
  const statuses = new Map((state.routerCatalog?.providers ?? []).map((p) => [p.id, p]));

  const runProbe = (id: string) => {
    void probeProvider(id)
      .then((result) =>
        setProbes((prev) => ({
          ...prev,
          [id]: result.ok ? `ok · ${result.latencyMs} ms · ${result.message}` : `failed · ${result.message}`,
        })),
      )
      .catch((error) => setProbes((prev) => ({ ...prev, [id]: `failed · ${String(error)}` })));
  };

  return (
    <>
      <h2 className="settings-title">Providers</h2>
      <p className="settings-hint">
        Vellum 5 routes across these providers, keyless first, and falls back automatically when one is rate-limited
        or down. Keys are stored only on this machine.
      </p>
      <div className="settings-provider-actions">
        <button
          type="button"
          className="shell-btn focus-ring"
          onClick={() => actions.refreshRouter(true)}
          disabled={state.routerLoading}
        >
          {state.routerLoading ? "Refreshing…" : "Refresh catalog"}
        </button>
        <span className="settings-provider-note">
          {state.routerCatalog
            ? `${state.routerCatalog.models.length} models · fetched ${new Date(state.routerCatalog.fetchedAt).toLocaleTimeString()}`
            : "No catalog yet"}
        </span>
      </div>
      <div className="settings-rows">
        {providers.map((provider) => {
          const status = statuses.get(provider.id);
          return (
            <div className="settings-provider" key={provider.id}>
              <div className="settings-provider-head">
                <BrandMark brand={brandForProvider(provider.id)} size={18} />
                <span className="settings-provider-label">{provider.label}</span>
                <span className="settings-provider-kind">{provider.kind === "keyless" ? "keyless" : "api key"}</span>
                <span className="settings-provider-status" data-ok={status ? status.ok : undefined}>
                  {status
                    ? status.ok
                      ? `${status.modelCount} model${status.modelCount === 1 ? "" : "s"}`
                      : status.error ?? "unavailable"
                    : provider.enabled
                      ? "not fetched"
                      : "disabled"}
                </span>
              </div>
              <div className="settings-provider-keyrow">
                {provider.kind !== "keyless" ? (
                  <input
                    className="settings-text-input"
                    type="password"
                    placeholder={provider.hasKey ? "•••••• saved — paste to replace" : "paste API key"}
                    value={keys[provider.id] ?? ""}
                    aria-label={`${provider.label} API key`}
                    onChange={(event) => setKeys((prev) => ({ ...prev, [provider.id]: event.target.value }))}
                  />
                ) : null}
                {provider.kind !== "keyless" ? (
                  <button
                    type="button"
                    className="shell-btn focus-ring"
                    disabled={!keys[provider.id]?.trim()}
                    onClick={() => {
                      const key = keys[provider.id] ?? "";
                      void actions
                        .saveProvider({ provider: provider.id, apiKey: key, enabled: true })
                        .then(() => {
                          setKeys((prev) => ({ ...prev, [provider.id]: "" }));
                          actions.refreshRouter(true);
                        })
                        .catch((error) => actions.pushToast(String(error)));
                    }}
                  >
                    Save
                  </button>
                ) : null}
                <button type="button" className="shell-btn focus-ring" onClick={() => runProbe(provider.id)}>
                  Test
                </button>
                {provider.hasKey ? (
                  <button
                    type="button"
                    className="shell-btn focus-ring"
                    onClick={() => {
                      void actions
                        .saveProvider({ provider: provider.id, clearKey: true })
                        .then(() => actions.refreshRouter(true))
                        .catch((error) => actions.pushToast(String(error)));
                    }}
                  >
                    Clear
                  </button>
                ) : null}
              </div>
              {probes[provider.id] ? <div className="settings-provider-note">{probes[provider.id]}</div> : null}
            </div>
          );
        })}
      </div>
    </>
  );
}

export function SettingsDialog(): JSX.Element | null {
  const state = useApp();
  const actions = useActions();
  const overlaySection = state.overlay.kind === "settings" ? state.overlay.section : null;
  const [section, setSection] = useState("general");

  useLayoutEffect(() => {
    if (overlaySection !== null) setSection(overlaySection);
  }, [overlaySection]);

  if (state.overlay.kind !== "settings") return null;

  const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") actions.closeOverlay();
  };

  let pane: ReactNode;
  switch (section) {
    case "general":
      pane = <GeneralPane settings={state.settings} onUpdate={actions.updateSettings} />;
      break;
    case "appearance":
      pane = <AppearancePane settings={state.settings} onUpdate={actions.updateSettings} />;
      break;
    case "shortcuts":
      pane = <ShortcutsPane onReset={() => actions.pushToast("Shortcuts are read-only in this build")} />;
      break;
    case "archived":
      pane = (
        <ArchivedPane
          threads={state.threads.filter((thread) => thread.archived)}
          onUnarchive={(id) => actions.archiveThread(id, false)}
        />
      );
      break;
    case "providers":
      pane = <ProvidersPane />;
      break;
    default:
      pane = <PlaceholderPane title={SECTION_LABELS.get(section) ?? section} />;
  }

  return (
    <div className="settings-overlay" role="dialog" aria-modal="true" aria-label="Settings" onKeyDown={onKeyDown}>
      <nav className="settings-nav" aria-label="Settings sections">
        <button type="button" className="settings-back focus-ring" onClick={actions.closeOverlay}>
          <Icon name="arrow-left" size={16} />
          <span>Back to app</span>
        </button>
        <div className="settings-nav-groups">
          {NAV_GROUPS.map((group) => (
            <div key={group.label} className="settings-nav-group">
              <div className="settings-nav-label">{group.label}</div>
              {group.items.map((item) => {
                const active = item.id === section;
                return (
                  <button
                    key={item.id}
                    type="button"
                    className="settings-nav-item focus-ring"
                    data-active={active}
                    aria-current={active ? "page" : undefined}
                    onClick={() => setSection(item.id)}
                  >
                    {item.icon ? <Icon name={item.icon} size={16} className="settings-nav-icon" /> : null}
                    <span className="truncate">{item.label}</span>
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </nav>
      <div className="settings-pane-scroll">
        <div className="settings-pane">{pane}</div>
      </div>
    </div>
  );
}
