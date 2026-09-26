mod catalog;
mod chat;
mod config;
mod providers;

pub use catalog::{Catalog, ProbeResult};
pub use config::{ConfigPublic, ConfigUpdate};

use std::collections::HashMap;
use std::sync::atomic::AtomicBool;
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tauri::{AppHandle, Manager, State};

#[derive(Default)]
pub struct RouterState {
    pub inflight: Mutex<HashMap<String, Arc<AtomicBool>>>,
}

static CLIENT: std::sync::OnceLock<reqwest::Client> = std::sync::OnceLock::new();

pub fn client() -> &'static reqwest::Client {
    CLIENT.get_or_init(|| {
        reqwest::Client::builder()
            .connect_timeout(Duration::from_secs(20))
            .timeout(Duration::from_secs(300))
            .user_agent("vellum/0.1 (local router)")
            .http1_only()
            .build()
            .unwrap_or_else(|_| reqwest::Client::new())
    })
}

#[tauri::command]
pub fn router_config_get(app: AppHandle) -> ConfigPublic {
    config::load(&app).public()
}

#[tauri::command]
pub fn router_config_set(app: AppHandle, update: ConfigUpdate) -> Result<ConfigPublic, String> {
    let mut cfg = config::load(&app);
    if let Some(order) = update.order {
        if !order.is_empty() {
            cfg.order = order;
        }
    }
    if let Some(id) = update.provider.clone() {
        let entry = cfg.providers.entry(id).or_default();
        if let Some(enabled) = update.enabled {
            entry.enabled = Some(enabled);
        }
        if update.clear_key.unwrap_or(false) {
            entry.api_key = None;
        } else if let Some(key) = update.api_key {
            if !key.trim().is_empty() {
                entry.api_key = Some(key.trim().to_string());
            }
        }
        if let Some(base) = update.base_url {
            entry.base_url = Some(base);
        }
    }
    config::save(&app, &cfg)?;
    let mut persist = config::load_state(&app);
    persist.catalog = None;
    let _ = config::save_state(&app, &persist);
    Ok(cfg.public())
}

#[tauri::command]
pub async fn router_catalog(app: AppHandle, refresh: bool) -> Result<Catalog, String> {
    catalog::get(&app, refresh).await
}

#[tauri::command]
pub async fn router_probe(app: AppHandle, provider: String) -> Result<ProbeResult, String> {
    catalog::probe(&app, &provider).await
}

#[tauri::command]
pub fn router_chat_start(
    app: AppHandle,
    state: State<'_, RouterState>,
    request_id: String,
    messages: Vec<chat::ChatMessage>,
    model: Option<String>,
    reasoning: Option<bool>,
) -> Result<(), String> {
    let cancel = Arc::new(AtomicBool::new(false));
    state
        .inflight
        .lock()
        .map_err(|e| e.to_string())?
        .insert(request_id.clone(), cancel.clone());
    let app2 = app.clone();
    let rid = request_id.clone();
    tauri::async_runtime::spawn(async move {
        let outcome = chat::run(app2.clone(), rid.clone(), messages, model, reasoning, cancel.clone()).await;
        if let Err(message) = outcome {
            chat::emit(&app2, &rid, serde_json::json!({ "type": "error", "message": message }));
        }
        if let Ok(mut map) = app2.state::<RouterState>().inflight.lock() {
            map.remove(&rid);
        }
    });
    Ok(())
}

#[tauri::command]
pub fn router_chat_cancel(state: State<'_, RouterState>, request_id: String) {
    if let Ok(map) = state.inflight.lock() {
        if let Some(flag) = map.get(&request_id) {
            flag.store(true, std::sync::atomic::Ordering::Relaxed);
        }
    }
}
