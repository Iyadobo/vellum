import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type { ProviderStatus, RouterCatalog, RouterConfigPublic, RouterModel, RouterProbeResult } from "./types";

export const ROUTER_AVAILABLE = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

export interface RouterEvent {
  type: "start" | "switch" | "text" | "reasoning" | "done" | "error" | "abort";
  provider?: string;
  providerLabel?: string;
  model?: string;
  toProvider?: string;
  toModel?: string;
  reason?: string;
  delta?: string;
  message?: string;
  elapsedMs?: number;
}

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export async function fetchRouterConfig(): Promise<RouterConfigPublic> {
  return invoke<RouterConfigPublic>("router_config_get");
}

export async function saveRouterConfig(update: {
  provider?: string;
  apiKey?: string;
  enabled?: boolean;
  baseUrl?: string;
  order?: string[];
  clearKey?: boolean;
}): Promise<RouterConfigPublic> {
  return invoke<RouterConfigPublic>("router_config_set", { update });
}

export async function fetchRouterCatalog(refresh: boolean): Promise<RouterCatalog> {
  return invoke<RouterCatalog>("router_catalog", { refresh });
}

export async function probeProvider(provider: string): Promise<RouterProbeResult> {
  return invoke<RouterProbeResult>("router_probe", { provider });
}

export async function startRouterChat(
  requestId: string,
  messages: ChatMessage[],
  model: string | null,
  reasoning: boolean,
): Promise<void> {
  return invoke("router_chat_start", { requestId, messages, model, reasoning });
}

export async function cancelRouterChat(requestId: string): Promise<void> {
  return invoke("router_chat_cancel", { requestId });
}

export async function listenRouterChat(
  requestId: string,
  handler: (event: RouterEvent) => void,
): Promise<UnlistenFn> {
  return listen<RouterEvent>(`router://${requestId}`, (event) => handler(event.payload));
}

export function freeLabel(model: RouterModel): string {
  if (model.free === true) return "free";
  if (model.free === false) return "paid";
  return "free tier";
}

export function contextLabel(model: RouterModel): string {
  if (model.contextWindow === null) return "unknown context";
  const k = model.contextWindow;
  if (k >= 1_000_000) return `${Math.round(k / 100_000) / 10}M ctx`;
  return `${Math.round(k / 1000)}K ctx`;
}

export function paramsLabel(model: RouterModel): string {
  if (model.paramsBillions === null) return "params unknown";
  const n = model.paramsBillions;
  return `${Number.isInteger(n) ? n : n.toFixed(1)}B`;
}

export function providerStatusMap(providers: ProviderStatus[]): Map<string, ProviderStatus> {
  return new Map(providers.map((p) => [p.id, p]));
}
