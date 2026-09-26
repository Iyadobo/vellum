# Vellum build contracts (frozen)

App: "Vellum" — a 1:1 recreation of the Codex desktop app frontend. Reference screenshots:
`reference/raw/*.png` (captured from the real app) and `reference/official/*` (official press shots).
Design tokens: `src/styles/tokens.css` — use these variables ONLY, never raw hex values.
Base/reset + utilities: `src/styles/base.css`.

## Directory ownership (do not edit outside your area)

- `src/app/**` — lead (Shell, TopBar, Rail, Sidebar)
- `src/features/thread/**` — Agent A
- `src/features/composer/**` — Agent B
- `src/features/command-menu/**`, `src/features/settings/**` — Agent C
- `src/features/panel/**`, `src/features/menus/**` — Agent D
- `src/lib/**`, `src/components/Icon.tsx`, `src/styles/**` — READ ONLY for all agents

## Data + state (from `src/lib/store` and `src/lib/types`)

```ts
import { useApp, useActions, type Actions, type VellumState } from "../../lib/store";
const state = useApp();      // state.threads, state.activeThread, state.settings, state.layout, state.panel, state.overlay, state.toasts, state.draft, state.rename, state.confirmDelete
const actions = useActions(); // stable identity; see Actions interface in store.tsx
```

Block kinds rendered in thread messages (`src/lib/types.ts`): `text` (markdown), `tool`, `status`, `diff`,
`code`, `review`, `turn` (durationSec, children[], streaming, liveStartedAt).

Engine: `src/lib/engine.ts` (mock agent; you never touch it, only render the state it produces).

## Frozen component interfaces

```tsx
// src/features/thread/ThreadView.tsx
export function ThreadView(): JSX.Element;            // reads active thread from useApp()

// src/features/composer/Composer.tsx
export function Composer({ threadId }: { threadId: string }): JSX.Element;

// src/features/command-menu/CommandMenu.tsx
export function CommandMenu(): JSX.Element | null;    // render only when overlay.kind === "command-menu"

// src/features/settings/SettingsDialog.tsx
export function SettingsDialog(): JSX.Element | null; // render only when overlay.kind === "settings"

// src/features/panel/RightPanel.tsx
export function RightPanel(): JSX.Element | null;     // render only when panel.open

// src/features/menus/menus.tsx
export interface MenuItem {
  id: string; label: string; shortcut?: string; icon?: IconName;
  danger?: boolean; disabled?: boolean; checked?: boolean; separatorBefore?: boolean;
  onSelect?: () => void;
}
export interface MenuAnchor { x: number; y: number; width?: number; align?: "left" | "right"; }
export interface MenuRequest { items: MenuItem[]; anchor: MenuAnchor; title?: string; }
export function MenuProvider({ children }: { children: ReactNode }): JSX.Element;
export function useMenu(): { open(request: MenuRequest): void; close(): void; isOpen: boolean };
```

## Styling rules

- Plain CSS files per feature, imported from the feature entry; prefix classes (`thread-`, `composer-`, `cm-`, `settings-`, `panel-`, `menu-`).
- Use tokens: colors `var(--color-*)`, radii `var(--radius-*)`, spacing multiples of 4px via `var(--spacing)`, type sizes `var(--text-*)`, chat text `var(--codex-chat-font-size)` (13px).
- Sidebar/toolbar rows: height 36px, radius `var(--radius-token-row)` (10px), hover `var(--color-background-primary-ghost-hover)`, selected `var(--color-background-secondary-soft-alpha)`.
- Menus/popovers: background `var(--color-surface-elevated-secondary)` (#212121 dark), radius `var(--radius-xl)`, shadow `var(--shadow-xl-spread)`, item height 36px, font 13px, item radius `var(--radius-lg)`.
- Focus: `.focus-ring` (2px `var(--color-ring)`, offset 2px). All interactive elements must be real `<button>`s.
- Every interactive control needs hover, active, focus-visible, and disabled states.
- Respect `[data-reduced-motion="true"]` (already handled globally by base.css).

## Hard rules

- No new npm dependencies. No `any` in public props. TypeScript strict must pass (`npx tsc -b --noEmit`).
- No comments in code.
- All user-visible copy must avoid the words "Codex"/"ChatGPT"/"OpenAI" (use "Vellum").
- 1:1 fidelity target: match the reference screenshots for spacing, sizes, colors, and states.
