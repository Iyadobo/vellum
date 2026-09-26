import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type JSX,
  type KeyboardEvent,
  type MouseEvent,
} from "react";
import { Icon } from "../../components/Icon";
import { useActions, useApp } from "../../lib/store";
import { EFFORTS, type Effort, type PermissionMode, type RunMode } from "../../lib/types";
import { ModelPicker } from "./ModelPicker";
import { useMenu, type MenuAnchor, type MenuItem } from "../menus/menus";
import "./composer.css";

const MAX_VISIBLE_LINES = 8;
const FALLBACK_LINE_HEIGHT = 20;
const MENU_FLIP_OFFSET = 52;

const MODE_LABELS: Record<RunMode, string> = {
  local: "Local",
  worktree: "Worktree",
  cloud: "Cloud",
};

const PERMISSION_OPTIONS: { mode: PermissionMode; label: string; description: string }[] = [
  {
    mode: "ask",
    label: "Ask for approval",
    description: "Always ask to edit external files and use the internet",
  },
  {
    mode: "approve",
    label: "Approve for me",
    description: "Only ask for actions detected as potentially unsafe",
  },
  {
    mode: "full",
    label: "Full access",
    description: "Unrestricted access to the internet and any file on your computer",
  },
  {
    mode: "custom",
    label: "Custom",
    description: "Uses permissions defined in config.toml",
  },
];

const EFFORT_LABELS: Record<Effort, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
  "extra high": "Extra high",
};

interface ComposerSettings {
  mode: RunMode;
  permissions: PermissionMode;
  model: string;
  effort: Effort;
}

function permissionOption(mode: PermissionMode) {
  return PERMISSION_OPTIONS.find((option) => option.mode === mode) ?? PERMISSION_OPTIONS[0];
}

function anchorAbove(element: HTMLElement, align: "left" | "right", width: number): MenuAnchor {
  const rect = element.getBoundingClientRect();
  return {
    x: align === "right" ? rect.right : rect.left,
    y: rect.top + MENU_FLIP_OFFSET,
    width,
    align,
  };
}

export function Composer({ threadId }: { threadId: string }): JSX.Element {
  return <ComposerSurface key={threadId} threadId={threadId} />;
}

function ComposerSurface({ threadId }: { threadId: string }): JSX.Element {
  const state = useApp();
  const actions = useActions();
  const menu = useMenu();
  const [value, setValue] = useState("");
  const [draftSettings, setDraftSettings] = useState<ComposerSettings | null>(null);
  const pendingDraftSettings = useRef<ComposerSettings | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const thread = state.threads.find((item) => item.id === threadId) ?? (state.draft?.id === threadId ? state.draft : null);
  const isDraft = state.draft?.id === threadId;
  const running = !!thread?.running;

  useEffect(() => {
    const pending = pendingDraftSettings.current;
    if (isDraft || !pending) return;
    pendingDraftSettings.current = null;
    actions.setThreadModel(threadId, pending.model, pending.effort);
    actions.setThreadMode(threadId, pending.mode);
    actions.setThreadPermissions(threadId, pending.permissions);
  }, [isDraft, threadId, actions]);

  useEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    const lineHeight = Number.parseFloat(window.getComputedStyle(input).lineHeight) || FALLBACK_LINE_HEIGHT;
    input.style.height = "auto";
    input.style.height = `${Math.min(input.scrollHeight, lineHeight * MAX_VISIBLE_LINES)}px`;
  }, [value]);

  if (!thread) return <></>;

  const settings: ComposerSettings =
    isDraft && draftSettings
      ? draftSettings
      : {
          mode: thread.mode,
          permissions: thread.permissions,
          model: thread.model,
          effort: thread.effort,
        };

  const rememberDraftSettings = (next: ComposerSettings) => {
    if (!isDraft) return;
    setDraftSettings(next);
    pendingDraftSettings.current = next;
  };

  const submit = () => {
    const text = value.trim();
    if (!text) return;
    actions.sendMessage(threadId, text);
    setValue("");
    inputRef.current?.focus();
  };

  const onInputKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== "Enter" || event.nativeEvent.isComposing) return;
    const modifier = event.metaKey || event.ctrlKey;
    if (state.settings.sendShortcut === "enter") {
      if (event.shiftKey) return;
    } else if (!modifier) {
      return;
    }
    event.preventDefault();
    submit();
  };

  const onChange = (event: ChangeEvent<HTMLTextAreaElement>) => {
    setValue(event.target.value);
  };

  const openAttachMenu = (event: MouseEvent<HTMLButtonElement>) => {
    const items: MenuItem[] = [
      {
        id: "attach-files",
        label: "Attach files and folders",
        onSelect: () => actions.pushToast("Attaching files and folders isn't available in this build"),
      },
      {
        id: "attach-photos",
        label: "Add photos",
        onSelect: () => actions.pushToast("Adding photos isn't available in this build"),
      },
    ];
    menu.open({ title: "Attach", items, anchor: anchorAbove(event.currentTarget, "left", 280) });
  };

  const openModeMenu = (event: MouseEvent<HTMLButtonElement>) => {
    const chooseMode = (mode: RunMode) => {
      actions.setThreadMode(threadId, mode);
      rememberDraftSettings({ ...settings, mode });
      if (mode === "cloud") actions.pushToast("Cloud environments are not available in this build");
    };
    const items: MenuItem[] = [
      {
        id: "mode-local",
        label: "Local",
        checked: settings.mode === "local",
        onSelect: () => chooseMode("local"),
      },
      {
        id: "mode-worktree",
        label: "Worktree",
        disabled: !thread.worktree,
        shortcut: thread.worktree ?? "No worktree set",
        checked: settings.mode === "worktree",
        onSelect: () => chooseMode("worktree"),
      },
      {
        id: "mode-cloud",
        label: "Cloud",
        checked: settings.mode === "cloud",
        onSelect: () => chooseMode("cloud"),
      },
    ];
    menu.open({ title: "Run mode", items, anchor: anchorAbove(event.currentTarget, "left", 280) });
  };

  const openPermissionsMenu = (event: MouseEvent<HTMLButtonElement>) => {
    const items: MenuItem[] = PERMISSION_OPTIONS.map((option) => ({
      id: `permissions-${option.mode}`,
      label: option.label,
      shortcut: option.description,
      checked: settings.permissions === option.mode,
      onSelect: () => {
        actions.setThreadPermissions(threadId, option.mode);
        rememberDraftSettings({ ...settings, permissions: option.mode });
      },
    }));
    menu.open({ title: "Permissions", items, anchor: anchorAbove(event.currentTarget, "left", 580) });
  };

  const openEffortMenu = (event: MouseEvent<HTMLButtonElement>) => {
    const items: MenuItem[] = [
      { id: "effort-title", label: "Reasoning effort", disabled: true },
      ...EFFORTS.map(
        (effort): MenuItem => ({
          id: `effort-${effort}`,
          label: EFFORT_LABELS[effort],
          checked: settings.effort === effort,
          onSelect: () => {
            actions.setThreadModel(threadId, settings.model, effort);
            rememberDraftSettings({ ...settings, effort });
          },
        }),
      ),
    ];
    menu.open({ title: "Reasoning effort", items, anchor: anchorAbove(event.currentTarget, "right", 220) });
  };

  return (
    <div className="composer">
      {thread.queued.length > 0 && (
        <div className="composer-queue" aria-label="Queued messages">
          {thread.queued.map((queued) => (
            <div className="composer-queue-chip" key={queued.id}>
              <Icon name="clock" size={12} className="composer-queue-icon" />
              <span className="composer-queue-text">{queued.text}</span>
            </div>
          ))}
        </div>
      )}
      <textarea
        ref={inputRef}
        className="composer-input"
        aria-label="Message Vellum"
        rows={1}
        placeholder={running ? "Working…" : "Ask Vellum to do anything"}
        value={value}
        onChange={onChange}
        onKeyDown={onInputKeyDown}
      />
      {running && value.trim().length > 0 && (
        <div className="composer-hint">Enter to steer — this message joins the current run</div>
      )}
      <div className="composer-footer">
        <div className="composer-footer-left">
          <button
            type="button"
            className="composer-icon-button focus-ring"
            aria-label="Attach files and folders"
            aria-haspopup="menu"
            onClick={openAttachMenu}
          >
            <Icon name="paperclip" size={16} />
          </button>
          <button
            type="button"
            className="composer-chip focus-ring"
            aria-haspopup="menu"
            aria-label={`Run mode: ${MODE_LABELS[settings.mode]}`}
            onClick={openModeMenu}
          >
            <span className="composer-chip-label">{MODE_LABELS[settings.mode]}</span>
            <Icon name="chevron-down" size={12} className="composer-chip-chevron" />
          </button>
          <button
            type="button"
            className="composer-chip focus-ring"
            aria-haspopup="menu"
            aria-label={`Permissions: ${permissionOption(settings.permissions).label}`}
            onClick={openPermissionsMenu}
          >
            <Icon name="shield" size={14} className="composer-chip-icon" />
            <span className="composer-chip-label">{permissionOption(settings.permissions).label}</span>
            <Icon name="chevron-down" size={12} className="composer-chip-chevron" />
          </button>
        </div>
        <div className="composer-footer-right">
          <ModelPicker
            current={settings.model}
            onSelect={(id) => {
              actions.setThreadModel(threadId, id, settings.effort);
              rememberDraftSettings({ ...settings, model: id });
            }}
          />
          <button
            type="button"
            className="composer-chip focus-ring"
            aria-haspopup="menu"
            aria-label={`Reasoning effort: ${EFFORT_LABELS[settings.effort]}`}
            onClick={openEffortMenu}
          >
            <span className="composer-chip-label">{EFFORT_LABELS[settings.effort]}</span>
            <Icon name="chevron-down" size={12} className="composer-chip-chevron" />
          </button>
          {running ? (
            <button
              type="button"
              className="composer-primary focus-ring"
              aria-label="Stop run"
              onClick={() => actions.stopRun(threadId)}
            >
              <Icon name="stop-square" size={14} />
            </button>
          ) : (
            <button
              type="button"
              className="composer-primary focus-ring"
              aria-label="Send message"
              disabled={value.trim().length === 0}
              onClick={submit}
            >
              <Icon name="arrow-up" size={16} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
