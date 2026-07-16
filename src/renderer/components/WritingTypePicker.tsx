import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { OptLevel, WritingType } from "../../shared/types";
import { WRITING_LEVEL_LABELS } from "../../shared/types";

export type { WritingType };
export { WRITING_LEVEL_LABELS };

export function writingLevelLabels(type: WritingType): Record<OptLevel, string> {
  return WRITING_LEVEL_LABELS[type];
}

const WRITING_TYPE_OPTIONS: { value: WritingType; label: string }[] = [
  { value: "question", label: "question" },
  { value: "email", label: "email" },
  { value: "message", label: "message" },
  { value: "explain", label: "explain" },
];

const PICKER_MAX_LABEL = "question";
const PICKER_PAD_X = 20;
const PICKER_CHEVRON_W = 10;
const PICKER_GAP = 6;

function ChevronDown() {
  return (
    <svg width="10" height="6" viewBox="0 0 10 6" fill="none" aria-hidden className="opacity-90 shrink-0">
      <path d="M1 1L5 5L9 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function WritingTypePicker({
  value,
  onChange,
  disabled,
}: {
  value: WritingType;
  onChange: (t: WritingType) => void;
  disabled?: boolean;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const maxMeasureRef = useRef<HTMLSpanElement>(null);
  const currentMeasureRef = useRef<HTMLSpanElement>(null);
  const [open, setOpen] = useState(false);
  const [maxLabelWidth, setMaxLabelWidth] = useState(0);
  const [currentLabelWidth, setCurrentLabelWidth] = useState(0);

  const displayLabel = WRITING_TYPE_OPTIONS.find((o) => o.value === value)?.label ?? value;
  const labelOverflows = maxLabelWidth > 0 && currentLabelWidth > maxLabelWidth;

  useLayoutEffect(() => {
    const maxW = Math.ceil(maxMeasureRef.current?.getBoundingClientRect().width ?? 0);
    const currentW = Math.ceil(currentMeasureRef.current?.getBoundingClientRect().width ?? 0);
    setMaxLabelWidth(maxW);
    setCurrentLabelWidth(currentW);
  }, [displayLabel]);

  const labelSlotWidth = labelOverflows ? maxLabelWidth : currentLabelWidth;
  const buttonWidth =
    labelSlotWidth > 0 ? PICKER_PAD_X + labelSlotWidth + PICKER_GAP + PICKER_CHEVRON_W : undefined;

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

  function select(next: WritingType) {
    onChange(next);
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
        aria-label="Writing type"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => {
          if (!disabled) setOpen((v) => !v);
        }}
        style={{ width: buttonWidth }}
        className="inline-flex items-center gap-1.5 rounded-full bg-white/10 border border-white/15 px-2.5 py-1 text-[13px] font-medium text-white transition hover:bg-white/15 disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-white/30 focus-visible:outline-offset-2"
      >
        <span
          className={`inline-block -translate-y-0.5 whitespace-nowrap shrink-0${labelOverflows ? " overflow-hidden text-ellipsis min-w-0" : ""}`}
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
          aria-label="Writing type"
          className="apple-glass-menu absolute left-0 bottom-full mb-1.5 w-[152px] max-h-[160px] overflow-y-auto scroll-thin rounded-xl p-1 text-white z-30"
        >
          {WRITING_TYPE_OPTIONS.map((o) => {
            const selected = o.value === value;
            return (
              <button
                key={o.value}
                type="button"
                role="option"
                aria-selected={selected}
                onClick={() => select(o.value)}
                className={`w-full flex items-center rounded-lg px-2 py-1.5 text-left text-[13px] transition ${
                  selected ? "bg-white/15" : "hover:bg-white/10"
                }`}
              >
                <span className="font-medium truncate">{o.label}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
