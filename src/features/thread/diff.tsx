import { Fragment, useState } from "react";
import { Icon } from "../../components/Icon";
import { useActions } from "../../lib/store";
import type { DiffFile } from "../../lib/types";
import { copyText } from "./utils";

export function DiffStat({
  additions,
  deletions,
  size = "md",
}: {
  additions: number;
  deletions: number;
  size?: "sm" | "md";
}) {
  return (
    <span className="thread-diff-stat" data-size={size}>
      <span className="thread-stat-add">+{additions}</span>
      <span className="thread-stat-del">−{deletions}</span>
    </span>
  );
}

export function DiffFileSection({ file, defaultOpen = false }: { file: DiffFile; defaultOpen?: boolean }) {
  const actions = useActions();
  const [open, setOpen] = useState(defaultOpen);

  const copyPath = () => {
    void copyText(file.path).then((ok) => actions.pushToast(ok ? "Copied path" : "Copy failed"));
  };

  return (
    <div className="thread-diff-file">
      <div className="thread-diff-file-head">
        <button
          type="button"
          className="thread-diff-file-toggle focus-ring"
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
        >
          <span className="thread-diff-chevron" data-open={open}>
            <Icon name="chevron-right" size={12} />
          </span>
          <span className="thread-diff-file-path truncate">{file.path}</span>
          <DiffStat additions={file.additions} deletions={file.deletions} size="sm" />
        </button>
        <button
          type="button"
          className="thread-copy-btn focus-ring"
          aria-label={`Copy path ${file.path}`}
          onClick={copyPath}
        >
          <Icon name="copy" size={13} />
        </button>
      </div>
      {open ? (
        <div className="thread-diff-hunks">
          <div className="thread-hunk-scroll">
            <div className="thread-hunk-inner">
              {file.hunks.map((hunk, hunkIndex) => (
                <Fragment key={hunkIndex}>
                  <div className="thread-hunk-head">{hunk.header}</div>
                  {hunk.lines.map((line, lineIndex) => (
                    <div className="thread-diff-line" data-kind={line.type} key={lineIndex}>
                      <span className="thread-diff-marker">
                        {line.type === "add" ? "+" : line.type === "del" ? "−" : ""}
                      </span>
                      <span className="thread-diff-text">{line.text}</span>
                    </div>
                  ))}
                </Fragment>
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function DiffCard({ title, files }: { title: string; files: DiffFile[] }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="thread-diff-card">
      <button
        type="button"
        className="thread-diff-card-head focus-ring"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <span className="thread-diff-chevron" data-open={open}>
          <Icon name="chevron-right" size={12} />
        </span>
        <span className="thread-diff-card-title">{title}</span>
      </button>
      {open ? (
        <div className="thread-diff-card-body">
          {files.map((file, index) => (
            <DiffFileSection key={`${file.path}-${index}`} file={file} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function ReviewCard({
  summary,
  additions,
  deletions,
  files,
}: {
  summary: string;
  additions: number;
  deletions: number;
  files: DiffFile[];
}) {
  const actions = useActions();
  const [open, setOpen] = useState(false);
  return (
    <div className="thread-review-card">
      <div className="thread-review-head">
        <button
          type="button"
          className="thread-review-toggle focus-ring"
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
        >
          <span className="thread-review-icon">
            <Icon name="diff" size={14} />
          </span>
          <span className="thread-review-title">{summary}</span>
          <DiffStat additions={additions} deletions={deletions} />
        </button>
        <button
          type="button"
          className="thread-review-open focus-ring"
          onClick={() => actions.openPanel("review")}
        >
          <span>Review</span>
          <Icon name="chevron-right" size={12} />
        </button>
      </div>
      {open ? (
        <div className="thread-review-body">
          {files.map((file, index) => (
            <DiffFileSection key={`${file.path}-${index}`} file={file} />
          ))}
        </div>
      ) : null}
    </div>
  );
}
