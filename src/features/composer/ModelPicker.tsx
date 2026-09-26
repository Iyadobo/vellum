import { useEffect, useMemo, useRef, useState } from "react";
import { useActions, useApp } from "../../lib/store";
import { contextLabel, freeLabel, paramsLabel } from "../../lib/router";
import { harnessAvailable } from "../../lib/harness";
import type { RouterModel } from "../../lib/types";
import { Icon } from "../../components/Icon";
import "./model-picker.css";

const MAX_PER_PROVIDER = 40;

function modelChips(model: RouterModel) {
  return (
    <span className="mp-chips">
      <span className="mp-chip" data-tone={model.vision === true ? "on" : "off"} title={model.vision === null ? "Vision support unknown" : model.vision ? "Vision capable" : "Text only"}>
        <Icon name={model.vision === true ? "eye" : "eye-off"} size={11} />
        {model.vision === null ? "vision unchecked" : model.vision ? "vision" : "no vision"}
      </span>
      <span className="mp-chip" title={model.contextWindow === null ? "Context window unknown" : `${model.contextWindow.toLocaleString()} tokens`}>
        {contextLabel(model)}
      </span>
      <span className="mp-chip" title={model.paramsBillions === null ? "Parameter count unknown" : `${model.paramsBillions}B parameters`}>
        {paramsLabel(model)}
      </span>
      {model.reasoning === true ? (
        <span className="mp-chip" data-tone="on" title="Exposes a reasoning stream">
          <Icon name="sparkles" size={11} />
          reasoning
        </span>
      ) : null}
      <span className="mp-chip" data-tone={model.free === true ? "on" : undefined}>
        {freeLabel(model)}
      </span>
    </span>
  );
}

export function ModelPicker({ current, onSelect }: { current: string; onSelect: (id: string) => void }) {
  const state = useApp();
  const actions = useActions();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [codexReady, setCodexReady] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [pos, setPos] = useState({ left: 0, bottom: 0 });

  useEffect(() => {
    harnessAvailable().then(setCodexReady).catch(() => void 0);
  }, []);

  useEffect(() => {
    if (!open) return;
    actions.refreshRouter(false);
    actions.refreshRouterConfig();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("mousedown", onDown, true);
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("mousedown", onDown, true);
      window.removeEventListener("keydown", onKey, true);
    };
  }, [open]);

  const groups = useMemo(() => {
    const catalog = state.routerCatalog;
    if (!catalog) return [];
    const order = state.routerConfig?.order ?? catalog.providers.map((p) => p.id);
    const q = query.trim().toLowerCase();
    const byProvider = new Map<string, RouterModel[]>();
    for (const model of catalog.models) {
      if (q && !model.model.toLowerCase().includes(q) && !model.providerLabel.toLowerCase().includes(q)) continue;
      const list = byProvider.get(model.provider) ?? [];
      if (list.length < MAX_PER_PROVIDER) list.push(model);
      byProvider.set(model.provider, list);
    }
    const statuses = new Map(catalog.providers.map((p) => [p.id, p]));
    return order
      .filter((id) => byProvider.has(id) || statuses.has(id))
      .map((id) => ({
        id,
        label: statuses.get(id)?.label ?? catalog.models.find((m) => m.provider === id)?.providerLabel ?? id,
        status: statuses.get(id),
        models: byProvider.get(id) ?? [],
      }));
  }, [state.routerCatalog, state.routerConfig, query]);

  const displayName =
    current === "vellum-5"
      ? "Vellum 5"
      : current === "codex-local"
        ? "Codex CLI"
        : current.includes("/")
          ? current.split("/").slice(1).join("/")
          : current;
  const totalModels = state.routerCatalog?.models.length ?? 0;

  return (
    <div className="model-picker" ref={rootRef}>
      <button
        ref={buttonRef}
        type="button"
        className="composer-chip focus-ring"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={`Model: ${displayName}`}
        onClick={() => {
          const rect = buttonRef.current?.getBoundingClientRect();
          if (rect) {
            setPos({
              left: Math.max(8, Math.min(rect.right - 440, window.innerWidth - 452)),
              bottom: window.innerHeight - rect.top + 8,
            });
          }
          setOpen((value) => !value);
        }}
      >
        <span className="composer-chip-label">{displayName}</span>
        <Icon name="chevron-down" size={12} className="composer-chip-chevron" />
      </button>
      {open ? (
        <div className="mp-panel" style={{ left: pos.left, bottom: pos.bottom }} role="dialog" aria-label="Select model">
          <input
            className="mp-search"
            placeholder="Search models"
            value={query}
            aria-label="Search models"
            autoFocus
            onChange={(event) => setQuery(event.target.value)}
          />
          <div className="mp-scroll">
            {!query ? (
              <button
                type="button"
                className="mp-row mp-hero"
                data-active={current === "vellum-5"}
                onClick={() => {
                  onSelect("vellum-5");
                  setOpen(false);
                }}
              >
                <span className="mp-name">Vellum 5</span>
                <span className="mp-chips">
                  <span className="mp-chip" data-tone="on">
                    <Icon name="sparkles" size={11} />
                    auto
                  </span>
                  <span className="mp-chip">routes to free models</span>
                  <span className="mp-chip">falls back on 429</span>
                </span>
              </button>
            ) : null}
            {!query && codexReady ? (
              <button
                type="button"
                className="mp-row mp-hero"
                data-active={current === "codex-local"}
                onClick={() => {
                  onSelect("codex-local");
                  setOpen(false);
                }}
              >
                <span className="mp-name">Codex · local CLI</span>
                <span className="mp-chips">
                  <span className="mp-chip" data-tone="on">
                    <Icon name="terminal" size={11} />
                    native harness
                  </span>
                  <span className="mp-chip">files + terminal</span>
                  <span className="mp-chip">your Codex login</span>
                </span>
              </button>
            ) : null}
            {groups.map((group) => (
              <div key={group.id} className="mp-group">
                <div className="mp-group-head">
                  <span className="mp-group-label">{group.label}</span>
                  <span className="mp-group-status" data-ok={group.status ? group.status.ok : undefined}>
                    {group.status
                      ? group.status.ok
                        ? `${group.status.modelCount} model${group.status.modelCount === 1 ? "" : "s"}`
                        : group.status.error ?? "unavailable"
                      : "not fetched"}
                  </span>
                  {group.status && !group.status.ok && !group.status.hasKey && group.status.kind !== "keyless" ? (
                    <button
                      type="button"
                      className="mp-addkey focus-ring"
                      onClick={() => {
                        setOpen(false);
                        actions.openSettings("providers");
                      }}
                    >
                      add key
                    </button>
                  ) : null}
                </div>
                {group.models.map((model) => (
                  <button
                    key={model.id}
                    type="button"
                    className="mp-row"
                    data-active={current === model.id}
                    title={model.id}
                    onClick={() => {
                      onSelect(model.id);
                      setOpen(false);
                    }}
                  >
                    <span className="mp-name">{model.model}</span>
                    {modelChips(model)}
                  </button>
                ))}
              </div>
            ))}
            {groups.length === 0 ? (
              <div className="mp-empty">
                {state.routerLoading
                  ? "Loading catalog…"
                  : totalModels === 0
                    ? "No catalog yet. Connect a provider and refresh in Settings → Providers."
                    : "No models match."}
              </div>
            ) : null}
          </div>
          <div className="mp-foot">
            {state.routerLoading ? "Refreshing…" : `${totalModels} models across ${groups.length} providers`}
            <button
              type="button"
              className="mp-foot-link focus-ring"
              onClick={() => {
                setOpen(false);
                actions.openSettings("providers");
              }}
            >
              Providers
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
