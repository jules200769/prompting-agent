import type { ModelId } from "../../shared/types";
import claudeLogo from "./model-logos/claude.png";
import gptLogo from "./model-logos/gpt.jpg";
import geminiLogo from "./model-logos/gemini.png";
import deepseekLogo from "./model-logos/deepseek.png";
import grokLogo from "./model-logos/grok.png";
import composerLogo from "./model-logos/composer.jpg";

export const MODEL_LOGO_URLS: Record<ModelId, string> = {
  "claude-opus-4.8": claudeLogo,
  "gpt-5": gptLogo,
  "gemini-3": geminiLogo,
  "deepseek-v3": deepseekLogo,
  "grok-4": grokLogo,
  "composer-2.5": composerLogo,
};
