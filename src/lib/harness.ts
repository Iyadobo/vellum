import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

export interface HarnessItem {
  id?: string;
  type?: string;
  text?: string;
  command?: string;
  status?: string;
  exit_code?: number;
  aggregated_output?: string;
  message?: string;
  changes?: { path?: string; kind?: string }[];
}

export interface HarnessInnerEvent {
  type?: string;
  item?: HarnessItem;
  error?: { message?: string };
  message?: string;
  delta?: string;
  thread_id?: string;
}

export interface HarnessEvent {
  type: "started" | "event" | "raw" | "stderr" | "exit" | "error" | "abort";
  cwd?: string;
  event?: HarnessInnerEvent;
  line?: string;
  message?: string;
  code?: number;
}

let availability: Promise<boolean> | null = null;

export function harnessAvailable(): Promise<boolean> {
  if (!availability) {
    availability = invoke<boolean>("codex_available").catch(() => false);
  }
  return availability;
}

export async function runCodex(
  requestId: string,
  prompt: string,
  cwd: string | null,
  model: string | null,
): Promise<void> {
  return invoke("codex_run", { requestId, prompt, cwd, model, sandbox: "workspace-write" });
}

export async function cancelCodex(requestId: string): Promise<void> {
  return invoke("codex_cancel", { requestId });
}

export async function listenHarness(
  requestId: string,
  handler: (event: HarnessEvent) => void,
): Promise<UnlistenFn> {
  return listen<HarnessEvent>(`harness://${requestId}`, (event) => handler(event.payload));
}
