import { BRAND_ICONS, type BrandKey } from "./brand-icons";

export interface BrandSpec {
  key: string;
  title: string;
  hex: string;
  fg: string;
  path?: string;
  letter?: string;
}

const MODEL_MATCHERS: { brand: BrandKey; test: RegExp }[] = [
  { brand: "anthropic", test: /claude|anthropic|fable/ },
  { brand: "openai", test: /openai|gpt|codex|davinci|whisper|dall/ },
  { brand: "google", test: /gemini|gemma|google|palm/ },
  { brand: "qwen", test: /qwen/ },
  { brand: "deepseek", test: /deepseek/ },
  { brand: "moonshot", test: /kimi|moonshot/ },
  { brand: "meta", test: /llama|meta/ },
  { brand: "mistral", test: /mistral|mixtral|pixtral|codestral|devstral/ },
  { brand: "xai", test: /grok|xai/ },
  { brand: "nvidia", test: /nemotron|nvidia/ },
  { brand: "microsoft", test: /phi\d|phi-|microsoft/ },
  { brand: "minimax", test: /minimax/ },
  { brand: "bytedance", test: /seed|doubao|bytedance/ },
  { brand: "alibaba", test: /alibaba|tongyi|wan-/ },
  { brand: "xiaomi", test: /mimo|xiaomi/ },
  { brand: "meituan", test: /longcat|meituan/ },
  { brand: "kuaishou", test: /kling|kuaishou/ },
  { brand: "amazon", test: /nova|titan|amazon/ },
  { brand: "ibm", test: /granite|ibm/ },
  { brand: "apple", test: /apple|mlx/ },
  { brand: "intel", test: /intel/ },
  { brand: "amd", test: /(^|[/-])amd/ },
  { brand: "qualcomm", test: /qualcomm/ },
  { brand: "samsung", test: /samsung/ },
  { brand: "huawei", test: /pangu|huawei/ },
  { brand: "yandex", test: /yalm|yandex/ },
  { brand: "quora", test: /(^|[/-])poe([/-]|$)/ },
  { brand: "duckduckgo", test: /duckduckgo|ddg-/ },
  { brand: "adobe", test: /firefly|adobe/ },
  { brand: "elevenlabs", test: /elevenlabs|eleven-/ },
  { brand: "databricks", test: /dbrx|databricks/ },
  { brand: "snowflake", test: /arctic|snowflake/ },
  { brand: "salesforce", test: /xlam|salesforce/ },
  { brand: "replicate", test: /replicate/ },
];

const PROVIDER_MATCHERS: { brand: BrandKey; test: RegExp }[] = [
  { brand: "opencode", test: /opencode/ },
  { brand: "google", test: /google/ },
  { brand: "openrouter", test: /openrouter/ },
];

function specFromKey(key: BrandKey): BrandSpec {
  const icon = BRAND_ICONS[key];
  return { key, title: icon.title, hex: icon.hex, fg: icon.fg, path: icon.path };
}

export function brandForProvider(providerId: string): BrandSpec | null {
  const id = providerId.toLowerCase();
  for (const matcher of PROVIDER_MATCHERS) {
    if (matcher.test.test(id)) return specFromKey(matcher.brand);
  }
  return null;
}

export function brandForModel(modelId: string): BrandSpec | null {
  const id = modelId.toLowerCase();
  if (id.indexOf("vellum") !== -1) {
    return { key: "vellum", title: "Vellum", hex: "#161616", fg: "#f2f2f2", letter: "V" };
  }
  if (/(^|[/-])jev/.test(id)) {
    return { key: "jev", title: "Jev", hex: "#3b3b3b", fg: "#f2f2f2", letter: "J" };
  }
  const model = id.includes("/") ? id.split("/").slice(1).join("/") : id;
  for (const matcher of MODEL_MATCHERS) {
    if (matcher.test.test(model)) return specFromKey(matcher.brand);
  }
  return null;
}
