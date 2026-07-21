import { THEME_META, type ThemeId } from "../../shared/themes";
import { themePreviewUrl } from "../assets/themePreviews";

interface ThemePreviewProps {
  theme: ThemeId;
}

export function ThemePreview({ theme }: ThemePreviewProps) {
  const src = themePreviewUrl(theme);
  if (!src) return null;

  const label = THEME_META.find((t) => t.id === theme)?.label ?? theme;

  return (
    <figure className="theme-preview" aria-label={`${label} overlay preview`}>
      <img
        src={src}
        alt={`${label} overlay modal preview`}
        className="theme-preview__img"
        draggable={false}
      />
      <figcaption className="theme-preview__caption">{label}</figcaption>
    </figure>
  );
}
