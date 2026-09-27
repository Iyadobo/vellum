import { writeFileSync } from "node:fs";

const BRANDS = [
  { key: "anthropic", candidates: ["anthropic", "claude"], hex: "#D97757" },
  { key: "openai", candidates: ["openai"], hex: "#10A37F" },
  { key: "google", candidates: ["googlegemini", "google"], hex: "#4285F4" },
  { key: "qwen", candidates: ["qwen"], hex: "#615CED" },
  { key: "deepseek", candidates: ["deepseek"], hex: "#4D6BFE" },
  { key: "moonshot", candidates: ["moonshotai", "kimi"], hex: "#7C3AED" },
  { key: "meta", candidates: ["meta"], hex: "#0866FF" },
  { key: "mistral", candidates: ["mistralai", "mistral"], hex: "#FA520F" },
  { key: "xai", candidates: ["x"], hex: "#1A1A1A" },
  { key: "nvidia", candidates: ["nvidia"], hex: "#76B900" },
  { key: "microsoft", candidates: ["microsoft"], hex: "#5E5E5E" },
  { key: "openrouter", candidates: ["openrouter"], hex: "#6467F2" },
  { key: "ollama", candidates: ["ollama"], hex: "#333333" },
  { key: "huggingface", candidates: ["huggingface"], hex: "#FFD21E" },
  { key: "perplexity", candidates: ["perplexity"], hex: "#1FB8CD" },
  { key: "baidu", candidates: ["baidu"], hex: "#2932E1" },
  { key: "tencent", candidates: ["tencentqq", "tencent"], hex: "#0052D9" },
  { key: "minimax", candidates: ["minimax"], hex: "#EE5159" },
  { key: "bytedance", candidates: ["bytedance"], hex: "#325AB4" },
  { key: "alibaba", candidates: ["alibabacloud", "alibabadotcom"], hex: "#FF6A00" },
  { key: "xiaomi", candidates: ["xiaomi"], hex: "#FF6900" },
  { key: "meituan", candidates: ["meituan"], hex: "#FFD100" },
  { key: "amazon", candidates: ["amazon", "amazonwebservices", "amazoncloudwatch"], hex: "#FF9900" },
  { key: "ibm", candidates: ["ibm"], hex: "#052FAD" },
  { key: "apple", candidates: ["apple"], hex: "#1A1A1A" },
  { key: "intel", candidates: ["intel"], hex: "#0071C5" },
  { key: "amd", candidates: ["amd"], hex: "#ED1C24" },
  { key: "qualcomm", candidates: ["qualcomm"], hex: "#3253DC" },
  { key: "samsung", candidates: ["samsung"], hex: "#1428A0" },
  { key: "huawei", candidates: ["huawei"], hex: "#CE0E2D" },
  { key: "adobe", candidates: ["adobe"], hex: "#FF0000" },
  { key: "midjourney", candidates: ["midjourney"], hex: "#1A1A1A" },
  { key: "elevenlabs", candidates: ["elevenlabs"], hex: "#1A1A1A" },
  { key: "stability", candidates: ["stabilityai", "stablediffusion"], hex: "#F43F5E" },
  { key: "runway", candidates: ["runway", "runwayml"], hex: "#111111" },
  { key: "characterai", candidates: ["characterai"], hex: "#2A2A33" },
  { key: "quora", candidates: ["quora"], hex: "#B92B27" },
  { key: "duckduckgo", candidates: ["duckduckgo"], hex: "#DE5833" },
  { key: "yandex", candidates: ["yandex"], hex: "#FFCC00" },
  { key: "kuaishou", candidates: ["kuaishou"], hex: "#FF3B00" },
  { key: "upstage", candidates: ["upstage"], hex: "#7A5AF8" },
  { key: "cerebras", candidates: ["cerebras"], hex: "#F15A29" },
  { key: "sambanova", candidates: ["sambanova"], hex: "#E4342B" },
  { key: "fireworks", candidates: ["fireworksai", "fireworks"], hex: "#E11D2E" },
  { key: "together", candidates: ["together", "togetherai"], hex: "#476DFF" },
  { key: "replicate", candidates: ["replicate"], hex: "#1A1A1A" },
  { key: "databricks", candidates: ["databricks"], hex: "#FF3621" },
  { key: "snowflake", candidates: ["snowflake"], hex: "#29B5E8" },
  { key: "salesforce", candidates: ["salesforce"], hex: "#00A1E0" },
  { key: "ai21", candidates: ["ai21labs", "ai21"], hex: "#D64541" },
  { key: "stepfun", candidates: ["stepfun"], hex: "#16A085" },
  { key: "opencode", candidates: ["opencode"], hex: "#111111" },
  { key: "github", candidates: ["github"], hex: "#181717" },
  { key: "gitlab", candidates: ["gitlab"], hex: "#FC6D26" },
  { key: "vercel", candidates: ["vercel"], hex: "#111111" },
  { key: "cloudflare", candidates: ["cloudflare"], hex: "#F38020" },
  { key: "pytorch", candidates: ["pytorch"], hex: "#EE4C2C" },
  { key: "tensorflow", candidates: ["tensorflow"], hex: "#FF6F00" },
  { key: "jupyter", candidates: ["jupyter"], hex: "#F37626" },
  { key: "anaconda", candidates: ["anaconda"], hex: "#44A833" },
  { key: "keras", candidates: ["keras"], hex: "#D00000" },
  { key: "scikitlearn", candidates: ["scikitlearn"], hex: "#F7931E" },
  { key: "onnx", candidates: ["onnx"], hex: "#005CED" },
  { key: "mlflow", candidates: ["mlflow"], hex: "#0194E2" },
  { key: "wandb", candidates: ["weightsandbiases"], hex: "#FFBE00" },
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
