import { useCallback, useEffect, useRef, type KeyboardEvent } from "react";
import { themePreviewUrl } from "../assets/themePreviews";
import { THEME_META, type ThemeId } from "../../shared/themes";

interface ThemeGalleryProps {
  value: ThemeId;
  onChange: (theme: ThemeId) => void;
}

export function ThemeGallery({ value, onChange }: ThemeGalleryProps) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  useEffect(() => {
    for (const theme of THEME_META) {
      const src = themePreviewUrl(theme.id);
      if (!src) continue;
      const img = new Image();
      img.src = src;
    }
  }, []);

  const focusAt = useCallback((index: number) => {
    const el = refs.current[index];
    el?.focus();
  }, []);

  const onKeyDown = (index: number, e: KeyboardEvent<HTMLButtonElement>) => {
    const cols = window.matchMedia("(min-width: 640px)").matches ? 4 : 2;
    let next = index;
    if (e.key === "ArrowRight") next = Math.min(index + 1, THEME_META.length - 1);
    else if (e.key === "ArrowLeft") next = Math.max(index - 1, 0);
    else if (e.key === "ArrowDown") next = Math.min(index + cols, THEME_META.length - 1);
    else if (e.key === "ArrowUp") next = Math.max(index - cols, 0);
    else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onChange(THEME_META[index].id);
      return;
    } else {
      return;
    }
    e.preventDefault();
    focusAt(next);
  };

  const activeTheme = THEME_META.find((theme) => theme.id === value) ?? THEME_META[0];
  const previewSrc = themePreviewUrl(value);

  return (
    <div className="theme-gallery-shell">
      <div className="theme-gallery" role="listbox" aria-label="Theme template">
        {THEME_META.map((theme, index) => {
          const selected = value === theme.id;
          return (
            <button
              key={theme.id}
              type="button"
              role="option"
              aria-selected={selected}
              aria-pressed={selected}
              ref={(el) => {
                refs.current[index] = el;
              }}
              className={`theme-card${selected ? " theme-card--selected" : ""}`}
              style={{ animationDelay: `${index * 40}ms` }}
              onClick={() => onChange(theme.id)}
              onKeyDown={(e) => onKeyDown(index, e)}
            >
              <div className="theme-card__swatch" style={{ background: theme.swatch }} aria-hidden />
              <div className="theme-card__body">
                <div className="theme-card__label">{theme.label}</div>
                <div className="theme-card__mood">{theme.mood}</div>
              </div>
            </button>
          );
        })}
      </div>

      {previewSrc && (
        <figure
          className="theme-gallery__preview"
          data-theme-preview={value}
          aria-label={`${activeTheme.label} overlay preview`}
        >
          <div className="theme-gallery__preview-stage">
            <img
              src={previewSrc}
              alt={`${activeTheme.label} overlay modal preview`}
              className="theme-gallery__preview-img"
              draggable={false}
            />
          </div>
          <figcaption className="theme-gallery__preview-caption">{activeTheme.label}</figcaption>
        </figure>
      )}
    </div>
  );
}
