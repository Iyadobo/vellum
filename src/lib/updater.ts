export const TAURI_APP = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

export async function checkForUpdates(onStatus: (text: string) => void): Promise<void> {
  if (!TAURI_APP) {
    onStatus("Updates require the desktop build");
    return;
  }
  try {
    const { check } = await import("@tauri-apps/plugin-updater");
    onStatus("Checking for updates…");
    const update = await check();
    if (!update) {
      onStatus("You are on the latest version");
      return;
    }
    onStatus(`Downloading Vellum ${update.version}…`);
    await update.downloadAndInstall();
    onStatus("Update installed — restarting…");
    const { relaunch } = await import("@tauri-apps/plugin-process");
    await relaunch();
  } catch (error) {
    onStatus(`Update check failed: ${String(error instanceof Error ? error.message : error)}`);
  }
}
