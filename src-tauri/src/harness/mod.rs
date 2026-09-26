use serde_json::{json, Value};
use std::collections::HashMap;
use std::path::PathBuf;
use std::process::Stdio;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter, Manager, State};
use tokio::io::{AsyncBufReadExt, BufReader};

#[derive(Default)]
pub struct HarnessState {
    pub inflight: Mutex<HashMap<String, Arc<AtomicBool>>>,
    pub pids: Mutex<HashMap<String, u32>>,
}

fn resolve_codex() -> Option<PathBuf> {
    if let Ok(appdata) = std::env::var("APPDATA") {
        let path = std::path::Path::new(&appdata).join("npm").join("codex.cmd");
        if path.exists() {
            return Some(path);
        }
    }
    if let Ok(local) = std::env::var("LOCALAPPDATA") {
        let path = std::path::Path::new(&local).join("OpenAI").join("Codex").join("bin");
        if path.exists() {
            return Some(path.join("codex.exe"));
        }
    }
    None
}

fn default_cwd() -> String {
    if let Ok(home) = std::env::var("USERPROFILE") {
        let project = std::path::Path::new(&home).join("Documents").join("Default Project");
        if project.exists() {
            return project.to_string_lossy().to_string();
        }
        return home;
    }
    ".".to_string()
}

fn emit(app: &AppHandle, request_id: &str, value: Value) {
    let _ = app.emit(&format!("harness://{}", request_id), value);
}

#[tauri::command]
pub fn codex_available() -> bool {
    resolve_codex().is_some()
}

#[tauri::command]
pub fn codex_run(
    app: AppHandle,
    state: State<'_, HarnessState>,
    request_id: String,
    prompt: String,
    cwd: Option<String>,
    model: Option<String>,
    sandbox: Option<String>,
) -> Result<(), String> {
    let codex = resolve_codex().ok_or_else(|| "Codex CLI not found (npm i -g @openai/codex)".to_string())?;
    let cancel = Arc::new(AtomicBool::new(false));
    state
        .inflight
        .lock()
        .map_err(|e| e.to_string())?
        .insert(request_id.clone(), cancel.clone());
    let app2 = app.clone();
    let rid = request_id.clone();
    tauri::async_runtime::spawn(async move {
        let outcome = run_codex(app2.clone(), rid.clone(), codex, prompt, cwd, model, sandbox, cancel.clone()).await;
        if let Err(message) = outcome {
            emit(&app2, &rid, json!({ "type": "error", "message": message }));
        }
        if let Ok(mut map) = app2.state::<HarnessState>().inflight.lock() {
            map.remove(&rid);
        }
        if let Ok(mut pids) = app2.state::<HarnessState>().pids.lock() {
            pids.remove(&rid);
        }
    });
    Ok(())
}

async fn run_codex(
    app: AppHandle,
    request_id: String,
    codex: PathBuf,
    prompt: String,
    cwd: Option<String>,
    model: Option<String>,
    sandbox: Option<String>,
    cancel: Arc<AtomicBool>,
) -> Result<(), String> {
    let dir = cwd.unwrap_or_else(default_cwd);
    let mut command = tokio::process::Command::new("cmd");
    command.arg("/c").arg(&codex);
    command.arg("exec").arg("--json").arg("--skip-git-repo-check");
    command.arg("-C").arg(&dir);
    if let Some(m) = model.filter(|m| !m.trim().is_empty()) {
        command.arg("-m").arg(m);
    }
    if let Some(s) = sandbox.filter(|s| !s.trim().is_empty()) {
        command.arg("-s").arg(s);
    }
    command.arg(&prompt);
    command.stdin(Stdio::null());
    command.stdout(Stdio::piped());
    command.stderr(Stdio::piped());
    #[cfg(windows)]
    {
        command.creation_flags(0x08000000);
    }
    let mut child = command.spawn().map_err(|e| e.to_string())?;
    if let Some(pid) = child.id() {
        if let Ok(mut pids) = app.state::<HarnessState>().pids.lock() {
            pids.insert(request_id.clone(), pid);
        }
    }
    let stdout = child.stdout.take().ok_or_else(|| "no stdout".to_string())?;
    let stderr = child.stderr.take().ok_or_else(|| "no stderr".to_string())?;
    emit(&app, &request_id, json!({ "type": "started", "cwd": dir }));

    let app_out = app.clone();
    let rid_out = request_id.clone();
    let cancel_out = cancel.clone();
    let out_task = tauri::async_runtime::spawn(async move {
        let mut lines = BufReader::new(stdout).lines();
        while let Ok(Some(line)) = lines.next_line().await {
            if cancel_out.load(Ordering::Relaxed) {
                break;
            }
            let trimmed = line.trim();
            if trimmed.is_empty() {
                continue;
            }
            match serde_json::from_str::<Value>(trimmed) {
                Ok(value) => emit(&app_out, &rid_out, json!({ "type": "event", "event": value })),
                Err(_) => emit(&app_out, &rid_out, json!({ "type": "raw", "line": trimmed })),
            }
        }
    });
    let app_err = app.clone();
    let rid_err = request_id.clone();
    let err_task = tauri::async_runtime::spawn(async move {
        let mut lines = BufReader::new(stderr).lines();
        while let Ok(Some(line)) = lines.next_line().await {
            let trimmed = line.trim();
            if !trimmed.is_empty() {
                emit(&app_err, &rid_err, json!({ "type": "stderr", "line": trimmed }));
            }
        }
    });

    let status = child.wait().await.map_err(|e| e.to_string())?;
    let _ = out_task.await;
    let _ = err_task.await;
    if cancel.load(Ordering::Relaxed) {
        emit(&app, &request_id, json!({ "type": "abort" }));
    } else {
        emit(
            &app,
            &request_id,
            json!({ "type": "exit", "code": status.code().unwrap_or(-1) }),
        );
    }
    Ok(())
}

#[tauri::command]
pub fn codex_cancel(state: State<'_, HarnessState>, request_id: String) {
    if let Ok(map) = state.inflight.lock() {
        if let Some(flag) = map.get(&request_id) {
            flag.store(true, Ordering::Relaxed);
        }
    }
    let pid = state
        .pids
        .lock()
        .ok()
        .and_then(|pids| pids.get(&request_id).copied());
    if let Some(pid) = pid {
        let mut kill = std::process::Command::new("taskkill");
        kill.args(["/PID", &pid.to_string(), "/T", "/F"]);
        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            kill.creation_flags(0x08000000);
        }
        let _ = kill.output();
    }
}
