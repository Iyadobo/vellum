import { useEffect, useState, type JSX } from "react";
import { Icon, type IconName } from "../../components/Icon";

interface DemoRow {
  icon: IconName;
  text: string;
}

interface DemoParagraph {
  kind: "paragraph";
  text: string;
}

interface DemoWork {
  kind: "work";
  durationSec: number;
  state: "running" | "done";
  rows: DemoRow[];
}

type DemoEntry = DemoParagraph | DemoWork;

const RUN: DemoEntry[] = [
  {
    kind: "paragraph",
    text: "I patched the stale bounds read in the scene and re-equipped the rifle to confirm the fix holds through a full equip cycle.",
  },
  {
    kind: "work",
    durationSec: 22,
    state: "running",
    rows: [
      { icon: "file", text: "Read src/character/avatar.ts" },
      { icon: "search", text: "Searched for heldPose offsets" },
      { icon: "terminal", text: "Ran pnpm test -- avatar" },
    ],
  },
  {
    kind: "paragraph",
    text: "Move the held pose lower-right so the sights stay visible above the handguard, and bring the glove in so the grip reads as a single mass.",
  },
  {
    kind: "work",
    durationSec: 35,
    state: "done",
    rows: [
      { icon: "file", text: "Read src/character/weapon-rig.ts" },
      { icon: "terminal", text: "Ran pnpm capture -- bodycam" },
      { icon: "check", text: "Compared frame 214 against the reference" },
    ],
  },
  {
    kind: "paragraph",
    text: "ScreenCapture_20 shows all game UI, but no grain. That points to a rendered-frame overlay rather than a post-process pass.",
  },
  {
    kind: "paragraph",
    text: "Safest next check: compare a screenshot that includes grain, then inspect the overlay for transparency and z-order before touching the shader settings.",
  },
];

export function SubagentsPane(): JSX.Element {
  const [expanded, setExpanded] = useState<number | null>(null);
  const [startedAt] = useState(() => Date.now());
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, []);

  const live = Math.max(0, Math.floor((now - startedAt) / 1000));

  return (
    <div className="panel-pane panel-subagents">
      <header className="panel-subagents-header">
        <button type="button" className="panel-icon-btn focus-ring" aria-label="Back to the subagent list" disabled>
          <Icon name="arrow-left" size={16} />
        </button>
        <span className="panel-avatar-dot" aria-hidden="true" />
        <span className="panel-subagents-title text-size-chat">Subagents</span>
      </header>
      <div className="panel-subagents-body hide-scrollbar">
        <div className="panel-subagents-thread">
          {RUN.map((entry, index) =>
            entry.kind === "paragraph" ? (
              <p key={index} className="panel-subagents-paragraph text-size-chat">
                {entry.text}
              </p>
            ) : (
              <div key={index} className="panel-work">
                <button
                  type="button"
                  className="panel-work-toggle focus-ring text-size-chat"
                  data-expanded={expanded === index}
                  aria-expanded={expanded === index}
                  onClick={() => setExpanded(expanded === index ? null : index)}
                >
                  {entry.state === "running" && <span className="panel-run-dot" aria-hidden="true" />}
                  <span className="panel-work-label">
                    {entry.state === "running" ? `Worked for ${entry.durationSec + live}s` : `Worked for ${entry.durationSec}s`}
                  </span>
                  <span className="panel-work-chevron">
                    <Icon name="chevron-right" size={12} />
                  </span>
                </button>
                {expanded === index && (
                  <div className="panel-work-rows">
                    {entry.rows.map((row, rowIndex) => (
                      <div key={rowIndex} className="panel-work-row">
                        <Icon name={row.icon} size={12} />
                        <span className="truncate">{row.text}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ),
          )}
        </div>
      </div>
    </div>
  );
}
