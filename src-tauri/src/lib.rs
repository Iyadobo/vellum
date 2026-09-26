#[cfg(target_os = "windows")]
use windows::Win32::Foundation::HWND;
#[cfg(target_os = "windows")]
use windows::Win32::Graphics::Dwm::{DwmSetWindowAttribute, DWMWA_BORDER_COLOR, DWMWA_COLOR_NONE};

mod harness;
mod router;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .plugin(tauri_plugin_updater::Builder::new().build())
    .plugin(tauri_plugin_process::init())
    .manage(router::RouterState::default())
    .manage(harness::HarnessState::default())
    .invoke_handler(tauri::generate_handler![
      router::router_config_get,
      router::router_config_set,
      router::router_catalog,
      router::router_probe,
      router::router_chat_start,
      router::router_chat_cancel,
      harness::codex_available,
      harness::codex_run,
      harness::codex_cancel
    ])
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }
      #[cfg(target_os = "windows")]
      {
        use tauri::Manager;
        if let Some(window) = app.get_webview_window("main") {
          if let Ok(handle) = window.hwnd() {
            let hwnd = HWND(handle.0 as *mut core::ffi::c_void);
            let color: u32 = DWMWA_COLOR_NONE;
            unsafe {
              let _ = DwmSetWindowAttribute(
                hwnd,
                DWMWA_BORDER_COLOR,
                &color as *const u32 as *const core::ffi::c_void,
                core::mem::size_of::<u32>() as u32,
              );
            }
          }
        }
      }
      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
