import { Fragment, memo, useMemo, type ReactNode } from "react";
import { CodeBlock } from "./CodeBlock";

interface MdListItem {
  depth: number;
  text: string;
}

type MdBlock =
  | { kind: "paragraph"; text: string }
  | { kind: "heading"; level: number; text: string }
  | { kind: "list"; ordered: boolean; items: MdListItem[] }
  | { kind: "code"; language: string; code: string };

const INLINE_PATTERN = /(`[^`\n]+`|\*\*[^*\n]+\*\*|\*[^*\n]+\*|\[[^\]\n]+\]\([^)\s]+\))/g;
const HEADING_PATTERN = /^(#{1,6})\s+(.*)$/;
const LIST_PATTERN = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/;
const FENCE_PATTERN = /^```(.*)$/;
const CLOSING_FENCE_PATTERN = /^```\s*$/;
const DIGIT_MARKER = /^\d/;

function sanitizeHref(raw: string): string | null {
  const value = raw.trim();
  return /^https?:\/\/[^\s]+$/i.test(value) ? value : null;
}

function renderInline(text: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  let lastIndex = 0;
  let key = 0;
  INLINE_PATTERN.lastIndex = 0;
  let match = INLINE_PATTERN.exec(text);
  while (match !== null) {
    if (match.index > lastIndex) nodes.push(text.slice(lastIndex, match.index));
    const token = match[0];
    if (token.startsWith("`")) {
      nodes.push(
        <code key={key} className="thread-md-code">
          {token.slice(1, -1)}
        </code>,
      );
    } else if (token.startsWith("**")) {
      nodes.push(<strong key={key}>{token.slice(2, -2)}</strong>);
    } else if (token.startsWith("*")) {
      nodes.push(<em key={key}>{token.slice(1, -1)}</em>);
    } else {
      const divider = token.indexOf("](");
      const label = token.slice(1, divider);
      const href = sanitizeHref(token.slice(divider + 2, -1));
      nodes.push(
        href ? (
          <a key={key} className="focus-ring" href={href} target="_blank" rel="noreferrer noopener">
            {label}
          </a>
        ) : (
          label
        ),
      );
    }
    key += 1;
    lastIndex = match.index + token.length;
    match = INLINE_PATTERN.exec(text);
  }
  if (lastIndex < text.length) nodes.push(text.slice(lastIndex));
  return nodes;
}

function parseMarkdown(markdown: string): MdBlock[] {
  const lines = markdown.replace(/\r\n?/g, "\n").split("\n");
  const blocks: MdBlock[] = [];
  let paragraph: string[] = [];
  let index = 0;

  const flush = () => {
    if (paragraph.length > 0) {
      blocks.push({ kind: "paragraph", text: paragraph.join("\n") });
      paragraph = [];
    }
  };

  while (index < lines.length) {
    const line = lines[index];
    const fence = FENCE_PATTERN.exec(line);
    if (fence) {
      flush();
      const language = fence[1].trim().split(/\s+/)[0] ?? "";
      const codeLines: string[] = [];
      index += 1;
      while (index < lines.length && !CLOSING_FENCE_PATTERN.test(lines[index])) {
        codeLines.push(lines[index]);
        index += 1;
      }
      if (index < lines.length) index += 1;
      blocks.push({ kind: "code", language, code: codeLines.join("\n") });
      continue;
    }

    const heading = HEADING_PATTERN.exec(line);
    if (heading) {
      flush();
      blocks.push({ kind: "heading", level: heading[1].length, text: heading[2] });
      index += 1;
      continue;
    }

    const listItem = LIST_PATTERN.exec(line);
    if (listItem) {
      flush();
      const ordered = DIGIT_MARKER.test(listItem[2]);
      const items: MdListItem[] = [];
      while (index < lines.length) {
        const entry = LIST_PATTERN.exec(lines[index]);
        if (!entry) break;
        const indent = entry[1].replace(/\t/g, "  ").length;
        items.push({ depth: indent >= 2 ? 1 : 0, text: entry[3] });
        index += 1;
      }
      blocks.push({ kind: "list", ordered, items });
      continue;
    }

    if (!line.trim()) {
      flush();
      index += 1;
      continue;
    }

    paragraph.push(line);
    index += 1;
  }

  flush();
  return blocks;
}

function renderParagraph(text: string, trailing?: ReactNode): ReactNode {
  const lines = text.split("\n");
  return (
    <p className="thread-md-paragraph">
      {lines.map((line, index) => (
        <Fragment key={index}>
          {index > 0 ? <br /> : null}
          {renderInline(line)}
        </Fragment>
      ))}
      {trailing}
    </p>
  );
}

function renderList(block: Extract<MdBlock, { kind: "list" }>): ReactNode {
  const groups: { text: string; children: string[] }[] = [];
  for (const item of block.items) {
    if (item.depth > 0 && groups.length > 0) groups[groups.length - 1].children.push(item.text);
    else groups.push({ text: item.text, children: [] });
  }
  const items = groups.map((group, index) => (
    <li key={index}>
      {renderInline(group.text)}
      {group.children.length > 0 ? (
        <ul className="thread-md-sublist">
          {group.children.map((child, childIndex) => (
            <li key={childIndex}>{renderInline(child)}</li>
          ))}
        </ul>
      ) : null}
    </li>
  ));
  return block.ordered ? <ol className="thread-md-list">{items}</ol> : <ul className="thread-md-list">{items}</ul>;
}

function renderBlock(block: MdBlock, trailing?: ReactNode): ReactNode {
  if (block.kind === "paragraph") return renderParagraph(block.text, trailing);
  if (block.kind === "heading") {
    return block.level <= 1 ? (
      <h1 className="thread-md-h1">
        {renderInline(block.text)}
        {trailing}
      </h1>
    ) : (
      <h2 className="thread-md-h2">
        {renderInline(block.text)}
        {trailing}
      </h2>
    );
  }
  if (block.kind === "code") return <CodeBlock language={block.language} code={block.code} />;
  return renderList(block);
}

export const Markdown = memo(function Markdown({ markdown, trailing }: { markdown: string; trailing?: ReactNode }) {
  const blocks = useMemo(() => parseMarkdown(markdown), [markdown]);
  const lastIndex = blocks.length - 1;
  return (
    <div className="thread-md">
      {blocks.map((block, index) => (
        <Fragment key={index}>{renderBlock(block, index === lastIndex ? trailing : undefined)}</Fragment>
      ))}
      {blocks.length === 0 && trailing ? <p className="thread-md-paragraph">{trailing}</p> : null}
    </div>
  );
});
