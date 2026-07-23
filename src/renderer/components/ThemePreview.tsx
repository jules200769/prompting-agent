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
      <div className="theme-gallery__preview" data-theme-preview={theme}>
        <div className="theme-gallery__preview-stage">
          <img
            src={src}
            alt={`${label} overlay modal preview`}
            className="theme-gallery__preview-img"
            draggable={false}
          />
        </div>
      </div>
      <figcaption className="theme-preview__caption">{label}</figcaption>
    </figure>
  );
}
