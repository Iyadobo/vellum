import { useEffect, useRef, useState } from "react";
import type { Effort } from "../../lib/types";
import { Icon } from "../../components/Icon";
import "./effort-picker.css";

const STEPS: { value: Effort; label: string }[] = [
  { value: "off", label: "Off" },
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
  { value: "extra high", label: "Extra high" },
];

function providerOf(model: string): string {
  return model.includes("/") ? model.split("/")[0] : "";
}

export function effortDescription(model: string, effort: Effort): string {
  const provider = providerOf(model);
  if (effort === "off") {
    if (provider === "openrouter") return "Sends reasoning.enabled = false on OpenRouter.";
    if (provider === "zai") return "Sends no thinking flag to Z.AI.";
    return "Sends reasoning_effort = none (dropped automatically if the provider rejects it).";
  }
  const mapped = effort === "extra high" ? "high" : effort;
  if (provider === "openrouter") return `Sends reasoning.effort = ${mapped} on OpenRouter.`;
  if (provider === "zai") return "Sends thinking.type = enabled to Z.AI.";
  if (provider === "groq" || provider === "google" || provider === "opencode-zen") {
    return `Sends reasoning_effort = ${mapped} to ${provider}.`;
  }
  return "This provider has no reasoning parameter; the setting is kept per chat.";
}

export function EffortPicker({
  current,
  model,
  onSelect,
}: {
  current: Effort;
  model: string;
  onSelect: (effort: Effort) => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [pos, setPos] = useState({ left: 0, bottom: 0 });
  const auto = model === "vellum-5";
  const index = Math.max(0, STEPS.findIndex((step) => step.value === current));

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

  const label = auto ? "Auto" : STEPS[index].label;

  return (
    <div className="effort-picker" ref={rootRef}>
      <button
        ref={buttonRef}
        type="button"
        className="composer-chip focus-ring"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={`Reasoning effort: ${label}`}
        onClick={() => {
          const rect = buttonRef.current?.getBoundingClientRect();
          if (rect) setPos({ left: Math.max(8, Math.min(rect.left - 40, window.innerWidth - 340)), bottom: window.innerHeight - rect.top + 8 });
          setOpen((value) => !value);
        }}
      >
        <span className="composer-chip-label">{label}</span>
        <Icon name="chevron-down" size={12} className="composer-chip-chevron" />
      </button>
      {open ? (
        <div className="effort-panel" style={{ left: pos.left, bottom: pos.bottom }} role="dialog" aria-label="Reasoning effort">
          <div className="effort-title">Reasoning effort</div>
          {auto ? (
            <div className="effort-auto">
              Auto — Vellum 5 keeps reasoning on and lets each routed model decide. Pin a model to set this yourself.
            </div>
          ) : (
            <>
              <input
                className="effort-slider"
                type="range"
                min={0}
                max={STEPS.length - 1}
                step={1}
                value={index}
                aria-label="Reasoning effort"
                onChange={(event) => onSelect(STEPS[Number(event.target.value)].value)}
              />
              <div className="effort-steps">
                {STEPS.map((step, stepIndex) => (
                  <button
                    key={step.value}
                    type="button"
                    className="effort-step focus-ring"
                    data-active={stepIndex === index}
                    onClick={() => onSelect(step.value)}
                  >
                    {step.label}
                  </button>
                ))}
              </div>
              <div className="effort-note">{effortDescription(model, current)}</div>
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}
