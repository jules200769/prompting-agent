import type { OverlayPlacement } from "../../shared/types";
import { OVERLAY_PLACEMENT_LABELS } from "../../shared/types";

const ZONES: { placement: OverlayPlacement; className: string }[] = [
  { placement: "topLeft", className: "overlay-placement__zone--tl" },
  { placement: "topRight", className: "overlay-placement__zone--tr" },
  { placement: "center", className: "overlay-placement__zone--c" },
  { placement: "bottomLeft", className: "overlay-placement__zone--bl" },
  { placement: "bottomRight", className: "overlay-placement__zone--br" },
];

export function OverlayPlacementPicker({
  value,
  onChange,
}: {
  value: OverlayPlacement;
  onChange: (placement: OverlayPlacement) => void;
}) {
  return (
    <div
      className="overlay-placement"
      role="radiogroup"
      aria-label="Overlay position"
    >
      {ZONES.map(({ placement, className }) => {
        const selected = value === placement;
        return (
          <button
            key={placement}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={OVERLAY_PLACEMENT_LABELS[placement]}
            title={OVERLAY_PLACEMENT_LABELS[placement]}
            className={`overlay-placement__zone ${className}${selected ? " overlay-placement__zone--selected" : ""}`}
            onClick={() => onChange(placement)}
          />
        );
      })}
    </div>
  );
}
