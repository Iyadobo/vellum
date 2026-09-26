use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter};

use super::client;
use super::config::{self, RouterPersist};
use super::providers::RouterModel;

#[derive(Deserialize, Serialize, Clone)]
pub struct ChatMessage {
    pub role: String,
    pub content: String,
}

pub fn emit(app: &AppHandle, request_id: &str, value: Value) {
    let _ = app.emit(&format!("router://{}", request_id), value);
}

fn provider_reasoning_flag(provider: &str) -> Option<Value> {
    match provider {
        "openrouter" => Some(json!({ "reasoning": true })),
        "zai" => Some(json!({ "thinking": { "type": "enabled" } })),
        "groq" => Some(json!({ "reasoning_effort": "medium" })),
        _ => None,
    }
}

fn build_body(model: &str, messages: &[ChatMessage], provider: &str, reasoning: bool, stream: bool) -> Value {
    let mut body = json!({ "model": model, "messages": messages, "stream": stream });
    if reasoning {
        if let Some(flag) = provider_reasoning_flag(provider) {
            if let (Some(obj), Some(extra)) = (body.as_object_mut(), flag.as_object()) {
                for (k, v) in extra {
                    obj.insert(k.clone(), v.clone());
                }
            }
        }
    }
    body
}

fn consume_delta(app: &AppHandle, request_id: &str, value: &Value) -> bool {
    let mut saw = false;
    let delta = value
        .pointer("/choices/0/delta")
        .or_else(|| value.pointer("/choices/0/message"));
    if let Some(content) = delta.and_then(|d| d.get("content")).and_then(|c| c.as_str()) {
        if !content.is_empty() {
            emit(app, request_id, json!({ "type": "text", "delta": content }));
        }
    }
    for key in ["reasoning", "reasoning_content", "thinking"] {
        if let Some(raw) = delta.and_then(|d| d.get(key)) {
            let text = raw
                .as_str()
                .map(|s| s.to_string())
                .or_else(|| raw.get("content").and_then(|c| c.as_str()).map(|s| s.to_string()))
                .or_else(|| raw.get("text").and_then(|c| c.as_str()).map(|s| s.to_string()));
            if let Some(text) = text {
                if !text.is_empty() {
                    saw = true;
                    emit(app, request_id, json!({ "type": "reasoning", "delta": text }));
                }
            }
        }
    }
    saw
}

struct AttemptOutcome {
    aborted: bool,
    saw_reasoning: bool,
    used_buffered: bool,
}

type AttemptError = (String, u16);

async fn attempt(
    app: &AppHandle,
    request_id: &str,
    cand: &RouterModel,
    messages: &[ChatMessage],
    reasoning: Option<bool>,
    cancel: &Arc<AtomicBool>,
    base: &str,
    key: Option<String>,
    prefer_buffered: bool,
) -> Result<AttemptOutcome, AttemptError> {
    let mut queue: Vec<u8> = if prefer_buffered { vec![2, 0] } else { vec![0, 1, 2] };
    while let Some(pass) = queue.first().copied() {
        queue.remove(0);
        let use_flag = pass == 0;
        let buffered = pass == 2;
        let body = build_body(
            &cand.model,
            messages,
            &cand.provider,
            if use_flag && !buffered { reasoning.unwrap_or(false) } else { false },
            !buffered,
        );
        let url = format!("{}/chat/completions", base.trim_end_matches('/'));
        let mut req = client().post(&url).json(&body);
        if let Some(k) = &key {
            req = req.bearer_auth(k);
        }
        let first_byte_seconds = if buffered { 180 } else { 15 };
        let sent = tokio::time::timeout(Duration::from_secs(first_byte_seconds), req.send()).await;
        let resp = match sent {
            Err(_) => {
                if buffered {
                    return Err(("timed out waiting for a response".into(), 0));
                }
                queue.clear();
                queue.push(2);
                continue;
            }
            Ok(Err(e)) => {
                if buffered {
                    return Err((e.to_string(), 0));
                }
                queue.clear();
                queue.push(2);
                continue;
            }
            Ok(Ok(r)) => r,
        };
        let status = resp.status();
        if !status.is_success() {
            let code = status.as_u16();
            let text = resp.text().await.unwrap_or_default();
            if code == 400 && use_flag && !buffered {
                continue;
            }
            if !buffered {
                queue.clear();
                queue.push(2);
                continue;
            }
            let clipped: String = text.chars().take(160).collect();
            return Err((format!("HTTP {} {}", code, clipped.trim()), code));
        }
        let is_sse = resp
            .headers()
            .get(reqwest::header::CONTENT_TYPE)
            .and_then(|v| v.to_str().ok())
            .map(|v| v.contains("event-stream"))
            .unwrap_or(false);
        let mut saw_reasoning = false;
        if is_sse {
            use futures_util::StreamExt;
            let mut stream = resp.bytes_stream();
            let mut buf = String::new();
            'outer: while let Some(chunk) = stream.next().await {
                if cancel.load(Ordering::Relaxed) {
                    return Ok(AttemptOutcome {
                        aborted: true,
                        saw_reasoning,
                        used_buffered: buffered,
                    });
                }
                let bytes = chunk.map_err(|e| (e.to_string(), 0))?;
                buf.push_str(&String::from_utf8_lossy(&bytes));
                while let Some(pos) = buf.find('\n') {
                    let line = buf[..pos].trim_end_matches('\r').to_string();
                    buf.drain(..=pos);
                    let data = match line.strip_prefix("data:") {
                        Some(d) => d.trim(),
                        None => continue,
                    };
                    if data == "[DONE]" {
                        break 'outer;
                    }
                    if data.is_empty() {
                        continue;
                    }
                    if let Ok(value) = serde_json::from_str::<Value>(data) {
                        saw_reasoning |= consume_delta(app, request_id, &value);
                    }
                }
            }
        } else {
            let text = resp.text().await.map_err(|e| (e.to_string(), 0))?;
            if let Ok(value) = serde_json::from_str::<Value>(&text) {
                saw_reasoning |= consume_delta(app, request_id, &value);
            }
        }
        return Ok(AttemptOutcome {
            aborted: false,
            saw_reasoning,
            used_buffered: buffered,
        });
    }
    Err(("no response from provider".into(), 0))
}

fn circuit_open(persist: &RouterPersist, provider: &str, now: u64) -> bool {
    persist
        .failures
        .get(provider)
        .map(|f| f.count >= 3 && now < f.open_until_ms)
        .unwrap_or(false)
}

fn note_failure(persist: &mut RouterPersist, provider: &str, now: u64) {
    let entry = persist.failures.entry(provider.to_string()).or_default();
    entry.count += 1;
    entry.open_until_ms = now + (60_000u64.saturating_mul(entry.count as u64)).min(600_000);
}

fn note_success(persist: &mut RouterPersist, provider: &str, model: &str, saw_reasoning: bool) {
    persist.failures.remove(provider);
    persist.model_failures.remove(&format!("{}/{}", provider, model));
    persist.last_good = Some(config::LastGood {
        provider: provider.to_string(),
        model: model.to_string(),
    });
    if saw_reasoning {
        persist
            .observed_reasoning
            .insert(format!("{}/{}", provider, model), true);
    }
}

const MAX_MODEL_FAILURES: u32 = 2;

fn pick_candidates(models: &[RouterModel], cfg: &config::Config, persist: &RouterPersist) -> Vec<RouterModel> {
    let now = config::now_ms();
    let mut rows: Vec<(usize, u8, RouterModel)> = Vec::new();
    for (idx, m) in models.iter().enumerate() {
        if m.free == Some(false) || !cfg.enabled(&m.provider) || circuit_open(persist, &m.provider, now) {
            continue;
        }
        if persist.model_failures.get(&m.id).copied().unwrap_or(0) >= MAX_MODEL_FAILURES {
            continue;
        }
        let mut rank = 0u8;
        if m.free == Some(true) {
            rank += 4;
        }
        if m.reasoning == Some(true) {
            rank += 2;
        }
        if m.vision == Some(true) {
            rank += 1;
        }
        rows.push((idx, rank, m.clone()));
    }
    let last = persist.last_good.clone();
    rows.sort_by(|a, b| {
        let la = last
            .as_ref()
            .map(|l| l.provider == a.2.provider && l.model == a.2.model)
            .unwrap_or(false);
        let lb = last
            .as_ref()
            .map(|l| l.provider == b.2.provider && l.model == b.2.model)
            .unwrap_or(false);
        let pa = cfg
            .order
            .iter()
            .position(|id| id == &a.2.provider)
            .unwrap_or(usize::MAX);
        let pb = cfg
            .order
            .iter()
            .position(|id| id == &b.2.provider)
            .unwrap_or(usize::MAX);
        lb.cmp(&la)
            .then(pa.cmp(&pb))
            .then(b.1.cmp(&a.1))
            .then(a.0.cmp(&b.0))
    });
    rows.into_iter().take(40).map(|(_, _, m)| m).collect()
}

pub async fn run(
    app: AppHandle,
    request_id: String,
    messages: Vec<ChatMessage>,
    pinned: Option<String>,
    reasoning: Option<bool>,
    cancel: Arc<AtomicBool>,
) -> Result<(), String> {
    let started = Instant::now();
    let cfg = config::load(&app);
    let mut persist = config::load_state(&app);

    let routes: Vec<(RouterModel, String, Option<String>)> = if let Some(pin) = pinned {
        let (provider, model) = pin
            .split_once('/')
            .ok_or_else(|| "invalid model id".to_string())?;
        let known = persist
            .catalog
            .as_ref()
            .and_then(|c| {
                c.models
                    .iter()
                    .find(|m| m.provider == provider && m.model == model)
                    .cloned()
            })
            .unwrap_or_else(|| RouterModel {
                id: pin.clone(),
                provider: provider.to_string(),
                provider_label: provider.to_string(),
                model: model.to_string(),
                label: model.to_string(),
                context_window: None,
                vision: None,
                reasoning: None,
                params_billions: None,
                free: None,
                source: "unknown".into(),
            });
        vec![(known, cfg.base(provider), cfg.key(provider))]
    } else {
        let models = match super::catalog::get(&app, false).await {
            Ok(catalog) if !catalog.models.is_empty() => catalog.models,
            Ok(_) => Vec::new(),
            Err(err) => return Err(err),
        };
        pick_candidates(&models, &cfg, &persist)
            .into_iter()
            .map(|m| {
                let base = cfg.base(&m.provider);
                let key = cfg.key(&m.provider);
                (m, base, key)
            })
            .collect()
    };

    if routes.is_empty() {
        return Err("No free models are reachable. Connect a provider in Settings → Providers.".into());
    }

    let mut last_error = String::new();
    for (idx, (cand, base, key)) in routes.iter().enumerate() {
        if cancel.load(Ordering::Relaxed) {
            emit(&app, &request_id, json!({ "type": "abort" }));
            return Ok(());
        }
        if idx == 0 {
            emit(
                &app,
                &request_id,
                json!({ "type": "start", "provider": cand.provider, "providerLabel": cand.provider_label, "model": cand.model }),
            );
        } else {
            emit(
                &app,
                &request_id,
                json!({ "type": "switch", "toProvider": cand.provider, "toModel": cand.model, "reason": last_error }),
            );
        }
        let recent_failure = persist
            .failures
            .get(&cand.provider)
            .map(|f| f.count >= 1)
            .unwrap_or(false);
        match attempt(
            &app,
            &request_id,
            cand,
            &messages,
            reasoning,
            &cancel,
            base,
            key.clone(),
            persist.force_buffered.get(&cand.provider).copied().unwrap_or(false) || recent_failure,
        )
        .await
        {
            Ok(outcome) => {
                if outcome.aborted {
                    emit(&app, &request_id, json!({ "type": "abort" }));
                    return Ok(());
                }
                if outcome.used_buffered {
                    persist.force_buffered.insert(cand.provider.clone(), true);
                }
                note_success(&mut persist, &cand.provider, &cand.model, outcome.saw_reasoning);
                let _ = config::save_state(&app, &persist);
                emit(
                    &app,
                    &request_id,
                    json!({ "type": "done", "elapsedMs": started.elapsed().as_millis() as u64 }),
                );
                return Ok(());
            }
            Err((err, code)) => {
                last_error = if code == 401 {
                    format!("{} needs an API key", cand.provider)
                } else if code > 0 {
                    format!("HTTP {code}")
                } else {
                    err
                };
                let model_specific = code >= 400 && code < 500 && code != 429;
                if model_specific {
                    let counter = persist.model_failures.entry(cand.id.clone()).or_insert(0);
                    *counter += 1;
                } else {
                    note_failure(&mut persist, &cand.provider, config::now_ms());
                }
            }
        }
    }
    let _ = config::save_state(&app, &persist);
    Err(format!("All routes failed — last error: {last_error}"))
}
