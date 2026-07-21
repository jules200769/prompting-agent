/** Forge-named visual theme templates (Studio + Overlay skins). */
export const THEME_IDS = [
  "ember-forge",
  "forged-steel",
  "white-hot",
  "ash-paper",
  "cool-temper",
  "midnight-anvil",
  "crimson-shop",
  "tempered-green",
] as const;

export type ThemeId = (typeof THEME_IDS)[number];

export interface ThemeMeta {
  id: ThemeId;
  label: string;
  mood: string;
  /** Primary display typeface for headings and labels */
  fontDisplay: string;
  /** Primary body typeface for UI copy */
  fontSans: string;
  /** CSS value for gallery swatch background */
  swatch: string;
}

export const THEME_META: ThemeMeta[] = [
  {
    id: "ember-forge",
    label: "Ember Forge",
    mood: "Brand heat on warm charcoal",
    fontDisplay: "Bahnschrift",
    fontSans: "IBM Plex Sans",
    swatch: "linear-gradient(135deg, #1a0d06 0%, #c73915 45%, #ff5a1f 75%, #ff8a50 100%)",
  },
  {
    id: "forged-steel",
    label: "Forged Steel",
    mood: "Industrial metal, cool silver polish",
    fontDisplay: "Barlow Condensed",
    fontSans: "IBM Plex Sans",
    swatch: "linear-gradient(160deg, #141110 0%, #1F1C2C 40%, #6b6e75 70%, #B6BBBE 100%)",
  },
  {
    id: "white-hot",
    label: "White-hot Ingot",
    mood: "Molten core, radial heat bloom",
    fontDisplay: "Oswald",
    fontSans: "IBM Plex Sans",
    swatch: "radial-gradient(circle at 40% 35%, #fff8e7 0%, #ffeb3b 25%, #ff9800 55%, #c73c03 100%)",
  },
  {
    id: "ash-paper",
    label: "Ash Paper",
    mood: "Unfired light studio, warm paper",
    fontDisplay: "Instrument Serif",
    fontSans: "DM Sans",
    swatch: "linear-gradient(180deg, #f8f5f0 0%, #e5d7cc 50%, #c2a9a0 100%)",
  },
  {
    id: "cool-temper",
    label: "Cool Temper",
    mood: "Quenched steel, blue slate",
    fontDisplay: "Space Grotesk",
    fontSans: "IBM Plex Sans",
    swatch: "linear-gradient(135deg, #1a1c24 0%, #535A61 45%, #7a8fa3 75%, #a8c4d8 100%)",
  },
  {
    id: "midnight-anvil",
    label: "Midnight Anvil",
    mood: "Deepest shop, bone on void",
    fontDisplay: "Bahnschrift",
    fontSans: "IBM Plex Sans",
    swatch: "linear-gradient(180deg, #0a0908 0%, #141110 40%, #232526 75%, #414345 100%)",
  },
  {
    id: "crimson-shop",
    label: "Crimson Shop",
    mood: "Wine-dark shop, sport crimson",
    fontDisplay: "Oswald",
    fontSans: "IBM Plex Sans",
    swatch: "linear-gradient(135deg, #1a0808 0%, #73201F 35%, #C9000B 65%, #E5484D 100%)",
  },
  {
    id: "tempered-green",
    label: "Tempered Green",
    mood: "Cooled success on green steel",
    fontDisplay: "Outfit",
    fontSans: "Outfit",
    swatch: "linear-gradient(135deg, #0f1a14 0%, #1e3d2f 40%, #3FB07F 70%, #8fd4b0 100%)",
  },
];

const LEGACY_THEME_MAP: Record<string, ThemeId> = {
  dark: "ember-forge",
  light: "ash-paper",
};

export function isThemeId(value: unknown): value is ThemeId {
  return typeof value === "string" && (THEME_IDS as readonly string[]).includes(value);
}

/** Migrate legacy dark/light settings to forge template ids. */
export function normalizeTheme(value: unknown): ThemeId {
  if (isThemeId(value)) return value;
  if (typeof value === "string" && value in LEGACY_THEME_MAP) {
    return LEGACY_THEME_MAP[value];
  }
  return "ember-forge";
}

/** Overlay uses the same forge skin as Studio (Ash Paper = light parchment glass). */
export function resolveOverlayTheme(theme: ThemeId): ThemeId {
  return theme;
}

export function applyThemeToDocument(theme: ThemeId, opts?: { overlay?: boolean }): void {
  const resolved = opts?.overlay ? resolveOverlayTheme(theme) : theme;
  document.documentElement.dataset.theme = resolved;
}
