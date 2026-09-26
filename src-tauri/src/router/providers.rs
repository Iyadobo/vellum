use serde::{Deserialize, Serialize};
use serde_json::Value;

pub struct ProviderDef {
    pub id: &'static str,
    pub label: &'static str,
    pub kind: &'static str,
    pub base: &'static str,
    pub models_path: &'static str,
    pub free_only: bool,
}

pub const ALL: &[ProviderDef] = &[
    ProviderDef {
        id: "pollinations",
        label: "Pollinations (keyless)",
        kind: "keyless",
        base: "https://text.pollinations.ai/openai",
        models_path: "/models",
        free_only: true,
    },
    ProviderDef {
        id: "opencode-zen",
        label: "OpenCode Zen",
        kind: "keyed",
        base: "https://opencode.ai/zen/v1",
        models_path: "/models",
        free_only: true,
    },
    ProviderDef {
        id: "openrouter",
        label: "OpenRouter",
        kind: "keyed",
        base: "https://openrouter.ai/api/v1",
        models_path: "/models",
        free_only: true,
    },
    ProviderDef {
        id: "groq",
        label: "Groq",
        kind: "keyed",
        base: "https://api.groq.com/openai/v1",
        models_path: "/models",
        free_only: true,
    },
    ProviderDef {
        id: "google",
        label: "Google Gemini",
        kind: "keyed",
        base: "https://generativelanguage.googleapis.com/v1beta/openai",
        models_path: "/models",
        free_only: true,
    },
    ProviderDef {
        id: "zai",
        label: "Z.AI",
        kind: "keyed",
        base: "https://api.z.ai/api/paas/v4",
        models_path: "/models",
        free_only: true,
    },
    ProviderDef {
        id: "custom",
        label: "Custom endpoint",
        kind: "custom",
        base: "",
        models_path: "/models",
        free_only: false,
    },
];

pub const ORDER: &[&str] = &[
    "pollinations",
    "opencode-zen",
    "openrouter",
    "groq",
    "google",
    "zai",
    "custom",
];

pub fn def(id: &str) -> Option<&'static ProviderDef> {
    ALL.iter().find(|d| d.id == id)
}

pub fn env_key(id: &str) -> Option<String> {
    let names: &[&str] = match id {
        "zai" => &["ZAI_API_KEY", "Z_AI_API_KEY"],
        "openrouter" => &["OPENROUTER_API_KEY"],
        "groq" => &["GROQ_API_KEY"],
        "google" => &["GEMINI_API_KEY", "GOOGLE_API_KEY"],
        "opencode-zen" => &["OPENCODE_API_KEY", "OPENCODE_ZEN_API_KEY"],
        "pollinations" => &["POLLINATIONS_API_KEY"],
        _ => &[],
    };
    if let Some(key) = names
        .iter()
        .find_map(|name| std::env::var(name).ok().filter(|v| !v.trim().is_empty()))
    {
        return Some(key);
    }
    if id == "opencode-zen" {
        return opencode_auth_key();
    }
    None
}

fn opencode_auth_key() -> Option<String> {
    let home = std::env::var("USERPROFILE").ok()?;
    let path = std::path::Path::new(&home).join(".local").join("share").join("opencode").join("auth.json");
    let raw = std::fs::read_to_string(path).ok()?;
    let value: serde_json::Value = serde_json::from_str(&raw).ok()?;
    for id in ["opencode-go", "opencode", "opencode-zen"] {
        if let Some(key) = value
            .get(id)
            .and_then(|entry| entry.get("key"))
            .and_then(|k| k.as_str())
        {
            if !key.trim().is_empty() {
                return Some(key.to_string());
            }
        }
    }
    None
}

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct RouterModel {
    pub id: String,
    pub provider: String,
    pub provider_label: String,
    pub model: String,
    pub label: String,
    pub context_window: Option<u64>,
    pub vision: Option<bool>,
    pub reasoning: Option<bool>,
    pub params_billions: Option<f64>,
    pub free: Option<bool>,
    pub source: String,
}

fn parse_params(id: &str) -> Option<f64> {
    let bytes = id.as_bytes();
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i].is_ascii_digit() {
            let start = i;
            let mut dot = false;
            while i < bytes.len() && (bytes[i].is_ascii_digit() || (bytes[i] == b'.' && !dot)) {
                if bytes[i] == b'.' {
                    dot = true;
                }
                i += 1;
            }
            if i < bytes.len() && (bytes[i] == b'b') {
                let boundary = i + 1 >= bytes.len() || !bytes[i + 1].is_ascii_alphanumeric();
                if boundary {
                    return id[start..i].parse::<f64>().ok();
                }
            }
        } else {
            i += 1;
        }
    }
    None
}

fn family(id: &str) -> (Option<u64>, Option<bool>, Option<bool>) {
    let ctx_128 = Some(131_072);
    if id.starts_with("claude") {
        return (Some(200_000), Some(true), Some(true));
    }
    if id.starts_with("gemini") {
        return (Some(1_000_000), Some(true), Some(true));
    }
    if id.starts_with("gpt-5") || id.starts_with("gpt6") || id.starts_with("gpt-6") {
        return (Some(400_000), Some(true), Some(true));
    }
    if id.starts_with("gpt-4") {
        return (Some(131_072), Some(true), Some(true));
    }
    if id.starts_with("grok") {
        let vision = id.contains("4") || id.contains("5");
        return (Some(256_000), Some(vision), Some(true));
    }
    if id.starts_with("deepseek") {
        let vision = id.contains("vision");
        let reasoning = id.contains("r1") || id.contains("reasoning") || id.contains("pro");
        return (ctx_128, Some(vision), Some(reasoning));
    }
    if id.starts_with("glm") {
        let vision = id.contains("v-") || id.contains("4.5v") || id.contains("4.6v") || id.contains("5v") || id.contains("vision");
        let reasoning = id.contains("glm-4.5") || id.contains("glm-4.6") || id.contains("glm-5");
        return (ctx_128, Some(vision), Some(reasoning));
    }
    if id.starts_with("kimi") || id.starts_with("moonshot") {
        let vision = id.contains("vl") || id.contains("vision");
        let reasoning = id.contains("k2.5") || id.contains("k2.6") || id.contains("k2.7") || id.contains("k3") || id.contains("thinking");
        return (Some(256_000), Some(vision), Some(reasoning));
    }
    if id.starts_with("qwen") {
        let vision = id.contains("vl") || id.contains("vision") || id.contains("omni");
        let reasoning = id.contains("thinking");
        return (ctx_128, Some(vision), Some(reasoning));
    }
    if id.starts_with("llama-4") || id.starts_with("llama4") {
        return (Some(1_000_000), Some(true), Some(false));
    }
    if id.starts_with("llama-3") || id.starts_with("llama3") {
        return (ctx_128, Some(false), Some(false));
    }
    if id.starts_with("nemotron") {
        return (ctx_128, Some(false), Some(true));
    }
    if id.starts_with("mistral") || id.starts_with("mixtral") {
        let vision = id.contains("pixtral") || id.contains("vision");
        return (ctx_128, Some(vision), Some(false));
    }
    (None, None, None)
}

fn free_for(provider: &str, id: &str, json: &Value) -> Option<bool> {
    match provider {
        "openrouter" => {
            let priced_free = json
                .pointer("/pricing/prompt")
                .and_then(|v| v.as_str())
                .map(|p| p == "0")
                .unwrap_or(false)
                && json
                    .pointer("/pricing/completion")
                    .and_then(|v| v.as_str())
                    .map(|p| p == "0")
                    .unwrap_or(false);
            Some(id.ends_with(":free") || priced_free)
        }
        "opencode-zen" => {
            if id.contains("-free") {
                Some(true)
            } else {
                None
            }
        }
        _ => Some(true),
    }
}

pub fn classify(provider_id: &str, json: &Value) -> Option<RouterModel> {
    let model_id = json
        .get("id")
        .or_else(|| json.get("name"))
        .and_then(|v| v.as_str())?
        .to_string();
    let label = json
        .get("name")
        .and_then(|v| v.as_str())
        .unwrap_or(&model_id)
        .to_string();
    let lower = model_id.to_lowercase();
    let (mut ctx, mut vision, mut reasoning) = family(&lower);
    let mut source = if ctx.is_none() && vision.is_none() && reasoning.is_none() {
        "unknown".to_string()
    } else {
        "family".to_string()
    };

    let mut api = false;
    if let Some(v) = json.get("context_length").and_then(|v| v.as_u64()) {
        ctx = Some(v);
        api = true;
    }
    if let Some(v) = json.get("context_window").and_then(|v| v.as_u64()) {
        ctx = Some(v);
        api = true;
    }
    if let Some(v) = json.get("vision").and_then(|v| v.as_bool()) {
        vision = Some(v);
        api = true;
    }
    if let Some(v) = json.get("reasoning").and_then(|v| v.as_bool()) {
        reasoning = Some(v);
        api = true;
    }
    if let Some(arr) = json
        .pointer("/architecture/input_modalities")
        .and_then(|v| v.as_array())
    {
        vision = Some(
            arr.iter()
                .filter_map(|m| m.as_str())
                .any(|m| m == "image" || m == "video"),
        );
        api = true;
    }
    if let Some(arr) = json.get("supported_parameters").and_then(|v| v.as_array()) {
        if arr
            .iter()
            .filter_map(|v| v.as_str())
            .any(|n| n.contains("reasoning"))
        {
            reasoning = Some(true);
            api = true;
        }
    }
    if api {
        source = "api".to_string();
    }

    let def = def(provider_id);
    Some(RouterModel {
        id: format!("{}/{}", provider_id, model_id),
        provider: provider_id.to_string(),
        provider_label: def.map(|d| d.label.to_string()).unwrap_or_else(|| provider_id.to_string()),
        model: model_id.clone(),
        label,
        context_window: ctx,
        vision,
        reasoning,
        params_billions: parse_params(&lower),
        free: free_for(provider_id, &model_id, json),
        source,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn chip(provider: &str, id: &str) -> RouterModel {
        classify(provider, &json!({"id": id})).expect("classified")
    }

    #[test]
    fn params_parsing() {
        assert_eq!(parse_params("llama-3.3-70b-versatile"), Some(70.0));
        assert_eq!(parse_params("qwen3-8b"), Some(8.0));
        assert_eq!(parse_params("deepseek-v4.1-flash"), None);
        assert_eq!(parse_params("gpt-5.3-codex"), None);
        assert_eq!(parse_params("muse-spark-1.3"), None);
    }

    #[test]
    fn family_classification() {
        let claude = chip("opencode-zen", "claude-sonnet-4-6");
        assert_eq!(claude.context_window, Some(200_000));
        assert_eq!(claude.vision, Some(true));
        assert_eq!(claude.reasoning, Some(true));

        let gpt = chip("opencode-zen", "gpt-5.3-codex");
        assert_eq!(gpt.context_window, Some(400_000));
        assert_eq!(gpt.vision, Some(true));

        let glm = chip("zai", "glm-5.3-flash");
        assert_eq!(glm.context_window, Some(131_072));
        assert_eq!(glm.vision, Some(false));
        assert_eq!(glm.reasoning, Some(true));

        let unknown = chip("opencode-zen", "muse-spark-1.3");
        assert_eq!(unknown.context_window, None);
        assert_eq!(unknown.vision, None);
        assert_eq!(unknown.reasoning, None);
        assert_eq!(unknown.source, "unknown");

        let llama = chip("groq", "llama-3.3-70b-versatile");
        assert_eq!(llama.params_billions, Some(70.0));
        assert_eq!(llama.vision, Some(false));

        let r1 = chip("opencode-zen", "deepseek-r1-distill");
        assert_eq!(r1.reasoning, Some(true));
    }

    #[test]
    fn api_metadata_overrides_family() {
        let m = classify(
            "openrouter",
            &json!({
                "id": "some/model:free",
                "context_length": 32768,
                "architecture": {"input_modalities": ["text", "image"]},
                "supported_parameters": ["temperature", "reasoning"],
                "pricing": {"prompt": "0", "completion": "0"}
            }),
        )
        .expect("classified");
        assert_eq!(m.context_window, Some(32_768));
        assert_eq!(m.vision, Some(true));
        assert_eq!(m.reasoning, Some(true));
        assert_eq!(m.free, Some(true));
        assert_eq!(m.source, "api");
    }

    #[test]
    fn zen_free_detection() {
        assert_eq!(chip("opencode-zen", "deepseek-v4-flash-free").free, Some(true));
        assert_eq!(chip("opencode-zen", "claude-opus-5").free, Some(false));
    }
}

#[cfg(test)]
mod env_tests {
    use super::*;

    #[test]
    fn opencode_store_key_found() {
        let key = opencode_auth_key();
        println!("USERPROFILE={:?}", std::env::var("USERPROFILE"));
        println!("key found: {}", key.is_some());
        if let Some(k) = &key {
            println!("key length: {}", k.len());
        }
    }
}
