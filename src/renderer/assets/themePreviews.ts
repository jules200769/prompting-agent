import type { ThemeId } from "../../shared/themes";
import ashPaper from "./theme-previews/ash-paper.png";
import coolTemper from "./theme-previews/cool-temper.png";
import crimsonShop from "./theme-previews/crimson-shop.png";
import emberForge from "./theme-previews/ember-forge.png";
import forgedSteel from "./theme-previews/forged-steel.png";
import midnightAnvil from "./theme-previews/midnight-anvil.png";
import temperedGreen from "./theme-previews/tempered-green.png";
import whiteHot from "./theme-previews/white-hot.png";

/** Overlay modal screenshots keyed by forge theme (transparent cutouts). */
export const THEME_PREVIEW_URLS: Partial<Record<ThemeId, string>> = {
  "ash-paper": ashPaper,
  "cool-temper": coolTemper,
  "crimson-shop": crimsonShop,
  "ember-forge": emberForge,
  "forged-steel": forgedSteel,
  "midnight-anvil": midnightAnvil,
  "tempered-green": temperedGreen,
  "white-hot": whiteHot,
};

export function themePreviewUrl(theme: ThemeId): string | undefined {
  return THEME_PREVIEW_URLS[theme];
}
