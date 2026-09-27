import { writeFileSync } from "node:fs";

const BRANDS = [
  { key: "anthropic", candidates: ["anthropic", "claude"], hex: "#D97757" },
  { key: "openai", candidates: ["openai"], hex: "#10A37F" },
  { key: "google", candidates: ["googlegemini", "google"], hex: "#4285F4" },
  { key: "qwen", candidates: ["qwen"], hex: "#615CED" },
  { key: "deepseek", candidates: ["deepseek"], hex: "#4D6BFE" },
  { key: "zhipu", candidates: ["zhipu", "chatglm"], hex: "#3859FF" },
  { key: "moonshot", candidates: ["moonshotai", "kimi"], hex: "#7C3AED" },
  { key: "meta", candidates: ["meta"], hex: "#0866FF" },
  { key: "mistral", candidates: ["mistralai", "mistral"], hex: "#FA520F" },
  { key: "xai", candidates: ["x"], hex: "#1A1A1A" },
  { key: "nvidia", candidates: ["nvidia"], hex: "#76B900" },
  { key: "microsoft", candidates: ["microsoft"], hex: "#5E5E5E" },
  { key: "cohere", candidates: ["cohere"], hex: "#39594D" },
  { key: "openrouter", candidates: ["openrouter"], hex: "#6467F2" },
  { key: "groq", candidates: ["groq"], hex: "#F55036" },
  { key: "ollama", candidates: ["ollama"], hex: "#333333" },
  { key: "huggingface", candidates: ["huggingface"], hex: "#FFD21E" },
  { key: "perplexity", candidates: ["perplexity"], hex: "#1FB8CD" },
  { key: "baidu", candidates: ["baidu"], hex: "#2932E1" },
  { key: "tencent", candidates: ["tencentqq", "tencent"], hex: "#0052D9" },
  { key: "minimax", candidates: ["minimax"], hex: "#EE5159" },
  { key: "bytedance", candidates: ["bytedance"], hex: "#325AB4" },
  { key: "alibaba", candidates: ["alibabacloud", "alibabadotcom"], hex: "#FF6A00" },
];

function luminance(hex) {
  const value = hex.replace("#", "");
  const r = parseInt(value.slice(0, 2), 16) / 255;
  const g = parseInt(value.slice(2, 4), 16) / 255;
  const b = parseInt(value.slice(4, 6), 16) / 255;
  const lin = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

const entries = [];
for (const brand of BRANDS) {
  let path = null;
  let title = null;
  for (const slug of brand.candidates) {
    try {
      const res = await fetch(`https://cdn.jsdelivr.net/npm/simple-icons/icons/${slug}.svg`);
      if (!res.ok) continue;
      const svg = await res.text();
      const pathMatch = svg.match(/<path[^>]*d="([^"]+)"/);
      const titleMatch = svg.match(/<title>([^<]+)<\/title>/);
      if (pathMatch) {
        path = pathMatch[1];
        title = titleMatch ? titleMatch[1] : slug;
        break;
      }
    } catch {
      continue;
    }
  }
  if (!path) {
    console.log(`MISSING ${brand.key}`);
    continue;
  }
  const fg = luminance(brand.hex) > 0.5 ? "#111111" : "#ffffff";
  entries.push({ key: brand.key, title, hex: brand.hex, fg, path });
  console.log(`ok ${brand.key} (${title})`);
}

const lines = entries
  .map(
    (entry) =>
      `  ${entry.key}: {\n    title: ${JSON.stringify(entry.title)},\n    hex: ${JSON.stringify(entry.hex)},\n    fg: ${JSON.stringify(entry.fg)},\n    path: ${JSON.stringify(entry.path)},\n  },`,
  )
  .join("\n");

const file = `export interface BrandIcon {
  title: string;
  hex: string;
  fg: string;
  path: string;
}

export const BRAND_ICONS = {
${lines}
} as const;

export type BrandKey = keyof typeof BRAND_ICONS;
`;

writeFileSync("src/lib/brand-icons.ts", file);
console.log(`wrote src/lib/brand-icons.ts with ${entries.length} brands`);
