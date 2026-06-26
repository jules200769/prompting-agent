import type { ModelId, Provider } from "./types";
import { REWRITE_CONFIG } from "./types";

/** Rewrite API provider — decoupled from the target model the prompt is optimized for. */
export function rewriteProviderForTarget(_target: ModelId): Provider {
  return REWRITE_CONFIG.provider;
}
