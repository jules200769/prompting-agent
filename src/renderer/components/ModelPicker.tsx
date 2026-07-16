import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { ModelId } from "../../shared/types";
import { MODELS } from "../../shared/types";
import { MODEL_LOGO_URLS } from "../assets/modelLogos";

function modelDisplayLabel(id: ModelId): string {
  const m = MODELS.find((x) => x.id === id);
  if (!m) return id;
  return m.label.replace("Claude Opus 4.8", "Opus4.8").replace("Claude ", "").replace(" Pro", "");
}

/** Widest allowed trigger label — longer names truncate instead of widening the pill. */
const PICKER_MAX_LABEL = modelDisplayLabel("gemini-3");

const PICKER_PAD_X = 20; // px-2.5 × 2
const PICKER_LOGO_W = 16;
const PICKER_CHEVRON_W = 10;
const PICKER_GAP = 6; // gap-1.5

function ChevronDown() {
  return (
    <svg width="10" height="6" viewBox="0 0 10 6" fill="none" aria-hidden className="opacity-90 shrink-0">
      <path d="M1 1L5 5L9 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Source artwork padding makes these logos read smaller at the same box size. */
const MODEL_LOGO_SCALE: Partial<Record<ModelId, number>> = {
  "gemini-3": 2.25,
  "deepseek-v3": 2.25,
  "grok-4": 3,
};

function ModelLogo({ id }: { id: ModelId }) {
  const scale = MODEL_LOGO_SCALE[id] ?? 1;
  return (
    <span className="inline-flex items-center justify-center w-4 h-4 shrink-0 overflow-hidden rounded-md">
      <img
        src={MODEL_LOGO_URLS[id]}
        alt=""
        aria-hidden
        className="block w-full h-full object-contain"
        style={scale !== 1 ? { transform: `scale(${scale})` } : undefined}
        draggable={false}
      />
    </span>
  );
}

export function ModelPicker({
  model,
  onChange,
  disabled,
}: {
  model: ModelId;
  onChange: (id: ModelId) => void;
  disabled?: boolean;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const maxMeasureRef = useRef<HTMLSpanElement>(null);
  const currentMeasureRef = useRef<HTMLSpanElement>(null);
  const [open, setOpen] = useState(false);
  const [maxLabelWidth, setMaxLabelWidth] = useState(0);
  const [currentLabelWidth, setCurrentLabelWidth] = useState(0);

  const displayLabel = modelDisplayLabel(model);
  const labelOverflows = maxLabelWidth > 0 && currentLabelWidth > maxLabelWidth;

  useLayoutEffect(() => {
    const maxW = Math.ceil(maxMeasureRef.current?.getBoundingClientRect().width ?? 0);
    const currentW = Math.ceil(currentMeasureRef.current?.getBoundingClientRect().width ?? 0);
    setMaxLabelWidth(maxW);
    setCurrentLabelWidth(currentW);
  }, [displayLabel]);

  const labelSlotWidth = labelOverflows ? maxLabelWidth : currentLabelWidth;
  const buttonWidth =
    labelSlotWidth > 0
      ? PICKER_PAD_X + PICKER_LOGO_W + PICKER_GAP + labelSlotWidth + PICKER_GAP + PICKER_CHEVRON_W
      : undefined;

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  function select(id: ModelId) {
    onChange(id);
    setOpen(false);
  }

  return (
    <div ref={rootRef} className="relative inline-block shrink-0">
      <span
        ref={maxMeasureRef}
        aria-hidden
        className="invisible absolute whitespace-nowrap font-medium text-[13px] pointer-events-none"
      >
        {PICKER_MAX_LABEL}
      </span>
      <span
        ref={currentMeasureRef}
        aria-hidden
        className="invisible absolute whitespace-nowrap font-medium text-[13px] pointer-events-none"
      >
        {displayLabel}
      </span>
      <button
        type="button"
        disabled={disabled}
        aria-label="Target model"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => {
          if (!disabled) setOpen((v) => !v);
        }}
        style={{ width: buttonWidth }}
        className="inline-flex items-center gap-1.5 rounded-full bg-white/10 border border-white/15 px-2.5 py-1 text-[13px] font-medium text-white transition hover:bg-white/15 disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-white/30 focus-visible:outline-offset-2"
      >
        <ModelLogo id={model} />
        <span
          className={`whitespace-nowrap shrink-0${labelOverflows ? " overflow-hidden text-ellipsis min-w-0" : ""}`}
          style={labelOverflows ? { width: maxLabelWidth } : undefined}
          title={labelOverflows ? displayLabel : undefined}
        >
          {displayLabel}
        </span>
        <ChevronDown />
      </button>

      {open && (
        <div
          role="listbox"
          aria-label="Target model"
          className="apple-glass-menu absolute left-0 bottom-full mb-1.5 w-[184px] max-h-[125px] overflow-y-auto scroll-thin rounded-xl p-1 text-white z-30"
        >
          {MODELS.map((m) => {
            const selected = m.id === model;
            return (
              <button
                key={m.id}
                type="button"
                role="option"
                aria-selected={selected}
                onClick={() => select(m.id)}
                className={`w-full flex items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[13px] transition ${
                  selected ? "bg-white/15" : "hover:bg-white/10"
                }`}
              >
                <ModelLogo id={m.id} />
                <span className="font-medium truncate">{m.label}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}