// Renderer-side typed accessor for the preload bridge.
import type { PromptForgeAPI } from "../preload";

declare global {
  interface Window {
    promptforge: PromptForgeAPI;
  }
}

export const api: PromptForgeAPI = (window as any).promptforge;
