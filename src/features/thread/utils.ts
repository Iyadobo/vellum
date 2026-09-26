import { formatDuration } from "../../lib/format";
import type { Block, Thread } from "../../lib/types";

export async function copyText(text: string): Promise<boolean> {
  try {
    if (typeof navigator !== "undefined" && navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    void 0;
  }
  try {
    const area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.top = "-1000px";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    const copied = document.execCommand("copy");
    document.body.removeChild(area);
    return copied;
  } catch {
    return false;
  }
}

function diffStat(additions: number, deletions: number): string {
  return `+${additions} −${deletions}`;
}

export function blockToMarkdown(block: Block): string {
  switch (block.kind) {
    case "text":
      return block.markdown;
    case "reasoning":
      return [
        "> **Thought process**",
        ...block.markdown.split("\n").map((line) => `> ${line}`),
      ].join("\n");
    case "tool":
      return `- ${block.label}${block.detail ? ` (${block.detail})` : ""}`;
    case "status":
      return `- ${block.label}`;
    case "code":
      return `\`\`\`${block.language}${block.path ? ` ${block.path}` : ""}\n${block.code}\n\`\`\``;
    case "diff":
      return [
        `**${block.title}**`,
        ...block.files.map((file) => `- \`${file.path}\` ${diffStat(file.additions, file.deletions)}`),
      ].join("\n");
    case "review":
      return [
        `**${block.summary}** ${diffStat(block.additions, block.deletions)}`,
        ...block.files.map((file) => `- \`${file.path}\` ${diffStat(file.additions, file.deletions)}`),
      ].join("\n");
    case "turn":
      return [
        `**${block.streaming ? "Working for" : "Worked for"} ${formatDuration(block.durationSec)}**`,
        ...block.children.map(blockToMarkdown),
      ].join("\n\n");
  }
}

export function threadToMarkdown(thread: Thread): string {
  const parts: string[] = [`# ${thread.title || "New chat"}`];
  for (const message of thread.messages) {
    if (message.role === "user") {
      const text = message.blocks
        .map((block) => (block.kind === "text" ? block.markdown : ""))
        .join("\n")
        .trim();
      parts.push(`## You\n\n${text}`);
    } else {
      parts.push(`## Vellum\n\n${message.blocks.map(blockToMarkdown).join("\n\n")}`);
    }
  }
  return parts.join("\n\n");
}
