use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager};

use super::providers;

#[derive(Serialize, Deserialize, Clone, Default)]
#[serde(rename_all = "camelCase")]
pub struct ProviderConfig {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub enabled: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub api_key: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub base_url: Option<String>,
}

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Config {
    #[serde(default = "default_version")]
    pub version: u32,
    #[serde(default = "default_order")]
    pub order: Vec<String>,
    #[serde(default)]
    pub providers: HashMap<String, ProviderConfig>,
}

fn default_version() -> u32 {
    1
}

fn default_order() -> Vec<String> {
    providers::ORDER.iter().map(|s| s.to_string()).collect()
}

impl Default for Config {
    fn default() -> Self {
        Config {
            version: default_version(),
            order: default_order(),
            providers: HashMap::new(),
        }
    }
}

impl Config {
    pub fn entry(&self, id: &str) -> ProviderConfig {
        self.providers.get(id).cloned().unwrap_or_default()
    }

    pub fn enabled(&self, id: &str) -> bool {
        let keyless = providers::def(id).map(|d| d.kind == "keyless").unwrap_or(false);
        self.entry(id)
            .enabled
            .unwrap_or_else(|| keyless || self.key(id).is_some())
    }

    pub fn key(&self, id: &str) -> Option<String> {
        match self.entry(id).api_key {
            Some(k) if !k.trim().is_empty() => Some(k),
            _ => providers::env_key(id),
        }
    }

    pub fn base(&self, id: &str) -> String {
        self.entry(id)
            .base_url
            .filter(|b| !b.trim().is_empty())
            .unwrap_or_else(|| providers::def(id).map(|d| d.base.to_string()).unwrap_or_default())
    }

    pub fn public(&self) -> ConfigPublic {
        let order = self.order.clone();
        let providers = providers::ALL
            .iter()
            .map(|def| ProviderPublic {
                id: def.id.to_string(),
                label: def.label.to_string(),
                kind: def.kind.to_string(),
                enabled: self.enabled(def.id),
                has_key: self.key(def.id).is_some(),
                base_url: self.base(def.id),
                free_only: def.free_only,
            })
            .collect();
        ConfigPublic { order, providers }
    }
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ProviderPublic {
    pub id: String,
    pub label: String,
    pub kind: String,
    pub enabled: bool,
    pub has_key: bool,
    pub base_url: String,
    pub free_only: bool,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ConfigPublic {
    pub order: Vec<String>,
    pub providers: Vec<ProviderPublic>,
}

#[derive(Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ConfigUpdate {
    #[serde(default)]
    pub provider: Option<String>,
    #[serde(default)]
    pub api_key: Option<String>,
    #[serde(default)]
    pub enabled: Option<bool>,
    #[serde(default)]
    pub base_url: Option<String>,
    #[serde(default)]
    pub order: Option<Vec<String>>,
    #[serde(default)]
    pub clear_key: Option<bool>,
}

#[derive(Serialize, Deserialize, Clone, Default)]
#[serde(rename_all = "camelCase")]
pub struct LastGood {
    pub provider: String,
    pub model: String,
}

#[derive(Serialize, Deserialize, Clone, Default)]
#[serde(rename_all = "camelCase")]
pub struct FailureRecord {
    pub count: u32,
    pub open_until_ms: u64,
}

#[derive(Serialize, Deserialize, Clone, Default)]
#[serde(rename_all = "camelCase")]
pub struct CatalogSnapshot {
    pub fetched_at_ms: u64,
    pub models: Vec<super::providers::RouterModel>,
    #[serde(default)]
    pub providers: Vec<super::catalog::ProviderStatus>,
}

#[derive(Serialize, Deserialize, Clone, Default)]
#[serde(rename_all = "camelCase")]
pub struct RouterPersist {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub last_good: Option<LastGood>,
    #[serde(default)]
    pub observed_reasoning: HashMap<String, bool>,
    #[serde(default)]
    pub failures: HashMap<String, FailureRecord>,
    #[serde(default)]
    pub model_failures: HashMap<String, u32>,
    #[serde(default)]
    pub force_buffered: HashMap<String, bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub catalog: Option<CatalogSnapshot>,
}

pub fn config_dir(app: &AppHandle) -> PathBuf {
    app.path()
        .app_config_dir()
        .unwrap_or_else(|_| PathBuf::from("."))
}

pub fn load_at(path: &Path) -> Config {
    let mut cfg: Config = fs::read_to_string(path)
        .ok()
        .and_then(|raw| serde_json::from_str(&raw).ok())
        .unwrap_or_default();
    if cfg.order.is_empty() {
        cfg.order = default_order();
    }
    cfg
}

pub fn write_json<T: Serialize>(path: &Path, value: &T) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let raw = serde_json::to_string_pretty(value).map_err(|e| e.to_string())?;
    fs::write(path, raw).map_err(|e| e.to_string())
}

pub fn save_at(path: &Path, cfg: &Config) -> Result<(), String> {
    write_json(path, cfg)
}

pub fn load(app: &AppHandle) -> Config {
    let dir = config_dir(app);
    let path = dir.join("providers.json");
    let mut cfg = load_at(&path);
    if !path.exists() {
        if let Some(key) = providers::env_key("zai") {
            cfg.providers.entry("zai".into()).or_default().api_key = Some(key);
        }
        let _ = save_at(&path, &cfg);
    }
    cfg
}

pub fn save(app: &AppHandle, cfg: &Config) -> Result<(), String> {
    save_at(&config_dir(app).join("providers.json"), cfg)
}

pub fn load_state(app: &AppHandle) -> RouterPersist {
    fs::read_to_string(config_dir(app).join("router-state.json"))
        .ok()
        .and_then(|raw| serde_json::from_str(&raw).ok())
        .unwrap_or_default()
}

pub fn save_state(app: &AppHandle, persist: &RouterPersist) -> Result<(), String> {
    write_json(&config_dir(app).join("router-state.json"), persist)
}

pub fn now_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn config_round_trip() {
        let dir = std::env::temp_dir().join(format!("vellum-test-{}", now_ms()));
        let path = dir.join("providers.json");
        let mut cfg = Config::default();
        cfg.order = vec!["groq".into(), "pollinations".into()];
        cfg.providers.entry("groq".into()).or_default().api_key = Some("test-key".into());
        save_at(&path, &cfg).expect("save");
        let back = load_at(&path);
        assert_eq!(back.order, vec!["groq".to_string(), "pollinations".to_string()]);
        assert_eq!(back.key("groq"), Some("test-key".to_string()));
        assert!(back.enabled("pollinations"));
        let public = back.public();
        assert!(public.providers.iter().any(|p| p.id == "groq" && p.has_key));
        let raw = fs::read_to_string(&path).unwrap();
        assert!(!raw.contains("has_key"));
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn defaults_enable_keyless_only() {
        let cfg = Config::default();
        assert!(cfg.enabled("pollinations"));
        assert!(!cfg.enabled("openrouter"));
        assert!(!cfg.enabled("zai"));
    }
}
