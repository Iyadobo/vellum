use futures_util::future::join_all;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::time::{Duration, Instant};
use tauri::AppHandle;

use super::client;
use super::config::{self, CatalogSnapshot, Config};
use super::providers::{self, RouterModel};

const CACHE_TTL_MS: u64 = 600_000;

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ProviderStatus {
    pub id: String,
    pub label: String,
    pub kind: String,
    pub enabled: bool,
    pub has_key: bool,
    pub ok: bool,
    pub error: Option<String>,
    pub model_count: usize,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Catalog {
    pub fetched_at: u64,
    pub models: Vec<RouterModel>,
    pub providers: Vec<ProviderStatus>,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ProbeResult {
    pub ok: bool,
    pub latency_ms: u64,
    pub message: String,
    pub model_count: usize,
}

fn extract_items(value: &Value) -> Vec<Value> {
    if let Some(arr) = value.as_array() {
        return arr.clone();
    }
    for key in ["data", "models"] {
        if let Some(arr) = value.get(key).and_then(|v| v.as_array()) {
            return arr.clone();
        }
    }
    Vec::new()
}

pub async fn fetch_provider(cfg: &Config, id: &str) -> Result<Vec<RouterModel>, String> {
    let def = providers::def(id).ok_or_else(|| format!("unknown provider {id}"))?;
    let base = cfg.base(id);
    if base.trim().is_empty() {
        return Err("no base URL configured".into());
    }
    let url = format!("{}{}", base.trim_end_matches('/'), def.models_path);
    let mut req = client().get(&url).timeout(Duration::from_secs(20));
    if let Some(key) = cfg.key(id) {
        req = req.bearer_auth(key);
    }
    let resp = req.send().await.map_err(|e| e.to_string())?;
    let status = resp.status();
    if !status.is_success() {
        return Err(format!("HTTP {}", status.as_u16()));
    }
    let value: Value = resp.json().await.map_err(|e| e.to_string())?;
    let models: Vec<RouterModel> = extract_items(&value)
        .iter()
        .filter_map(|item| providers::classify(id, item))
        .collect();
    if models.is_empty() {
        return Err("empty catalog".into());
    }
    Ok(models)
}

fn build_catalog(cfg: &Config, snapshot: CatalogSnapshot, fetched_at: u64, persist: &config::RouterPersist) -> Catalog {
    let mut models = snapshot.models;
    for m in &mut models {
        if persist.observed_reasoning.get(&m.id).copied().unwrap_or(false) && m.reasoning != Some(true) {
            m.reasoning = Some(true);
            m.source = "observed".into();
        }
    }
    let providers = if snapshot.providers.is_empty() {
        cfg.order
            .iter()
            .filter(|id| providers::def(id).is_some())
            .map(|id| {
                let def = providers::def(id).unwrap();
                ProviderStatus {
                    id: id.clone(),
                    label: def.label.into(),
                    kind: def.kind.into(),
                    enabled: cfg.enabled(id),
                    has_key: cfg.key(id).is_some(),
                    ok: true,
                    error: None,
                    model_count: 0,
                }
            })
            .collect()
    } else {
        snapshot.providers
    };
    Catalog {
        fetched_at,
        models,
        providers,
    }
}

pub async fn get(app: &AppHandle, refresh: bool) -> Result<Catalog, String> {
    let cfg = config::load(app);
    let mut persist = config::load_state(app);
    let now = config::now_ms();
    let enabled: Vec<String> = cfg
        .order
        .iter()
        .cloned()
        .filter(|id| cfg.enabled(id) && providers::def(id).is_some() && !cfg.base(id).trim().is_empty())
        .collect();
    let cache_matches = persist
        .catalog
        .as_ref()
        .map(|snap| snap.providers.iter().map(|p| p.id.clone()).collect::<Vec<String>>() == enabled)
        .unwrap_or(false);
    if !refresh && cache_matches {
        if let Some(snap) = persist.catalog.clone() {
            if now.saturating_sub(snap.fetched_at_ms) < CACHE_TTL_MS {
                return Ok(build_catalog(&cfg, snap, now, &persist));
            }
        }
    }
    let results = join_all(enabled.iter().map(|id| fetch_provider(&cfg, id))).await;
    let mut models = Vec::new();
    let mut statuses = Vec::new();
    for (id, result) in enabled.iter().zip(results) {
        let def = providers::def(id).unwrap();
        let has_key = cfg.key(id).is_some();
        match result {
            Ok(list) => {
                models.extend(list.clone());
                statuses.push(ProviderStatus {
                    id: id.clone(),
                    label: def.label.into(),
                    kind: def.kind.into(),
                    enabled: true,
                    has_key,
                    ok: true,
                    error: None,
                    model_count: list.len(),
                });
            }
            Err(err) => statuses.push(ProviderStatus {
                id: id.clone(),
                label: def.label.into(),
                kind: def.kind.into(),
                enabled: true,
                has_key,
                ok: false,
                error: Some(err),
                model_count: 0,
            }),
        }
    }
    for m in &mut models {
        if persist.observed_reasoning.get(&m.id).copied().unwrap_or(false) && m.reasoning != Some(true) {
            m.reasoning = Some(true);
            m.source = "observed".into();
        }
    }
    persist.catalog = Some(CatalogSnapshot {
        fetched_at_ms: now,
        models: models.clone(),
        providers: statuses.clone(),
    });
    let _ = config::save_state(app, &persist);
    Ok(Catalog {
        fetched_at: now,
        models,
        providers: statuses,
    })
}

pub async fn probe(app: &AppHandle, provider: &str) -> Result<ProbeResult, String> {
    let cfg = config::load(app);
    let started = Instant::now();
    match fetch_provider(&cfg, provider).await {
        Ok(models) => Ok(ProbeResult {
            ok: true,
            latency_ms: started.elapsed().as_millis() as u64,
            message: format!("{} models", models.len()),
            model_count: models.len(),
        }),
        Err(err) => Ok(ProbeResult {
            ok: false,
            latency_ms: started.elapsed().as_millis() as u64,
            message: err,
            model_count: 0,
        }),
    }
}
