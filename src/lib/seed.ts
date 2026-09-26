import { DEFAULT_PANEL } from "./types";

export function createSeedState() {
  return {
    threads: [],
    activeThreadId: null as string | null,
    panel: { ...DEFAULT_PANEL },
  };
}
