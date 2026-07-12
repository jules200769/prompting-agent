import { useEffect, useRef, useState } from "react";
import { acceleratorFromEvent, normalizeAccelerator } from "../../shared/accelerator";
import { DEFAULT_SETTINGS, type HotkeyStatus } from "../../shared/types";
import { Keycaps } from "./Keycaps";

const MODIFIER_EVENT_KEYS = new Set(["Control", "Shift", "Alt", "Meta", "AltGraph"]);

function heldModLabels(e: React.KeyboardEvent): string[] {
  const mods: string[] = [];
  if (e.ctrlKey) mods.push("Ctrl");
  if (e.shiftKey) mods.push("Shift");
  if (e.altKey) mods.push("Alt");
  if (e.metaKey) mods.push("Win");
  return mods;
}

/**
 * Global-hotkey editor: click-to-record with live modifier preview, reset to
 * default, and an "edit as text" fallback validated via normalizeAccelerator.
 * `status` is the last known OS registration state (null = unknown/unsaved).
 */
export function HotkeyField({
  value,
  onChange,
  status,
}: {
  value: string;
  onChange: (accelerator: string) => void;
  status: HotkeyStatus | null;
}) {
  const [recording, setRecording] = useState(false);
  const [heldMods, setHeldMods] = useState<string[]>([]);
  const [hint, setHint] = useState<string | null>(null);
  const [showText, setShowText] = useState(false);
  const [draft, setDraft] = useState(value);
  const [draftError, setDraftError] = useState<string | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setDraft(value);
    setDraftError(null);
  }, [value]);

  function startRecording() {
    setRecording(true);
    setHeldMods([]);
    setHint(null);
    boxRef.current?.focus();
  }

  function stopRecording() {
    setRecording(false);
    setHeldMods([]);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (!recording) {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        startRecording();
      }
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    if (e.key === "Escape") {
      stopRecording();
      return;
    }
    setHeldMods(heldModLabels(e));
    if (MODIFIER_EVENT_KEYS.has(e.key) || e.repeat) return;
    const acc = acceleratorFromEvent(e);
    const norm = acc ? normalizeAccelerator(acc) : null;
    if (!norm) {
      setHint("Add a modifier such as Ctrl or Alt");
      return;
    }
    onChange(norm);
    stopRecording();
  }

  function onKeyUp(e: React.KeyboardEvent<HTMLDivElement>) {
    if (!recording) return;
    e.preventDefault();
    setHeldMods(heldModLabels(e));
  }

  function commitDraft() {
    const norm = normalizeAccelerator(draft);
    if (norm) {
      setDraftError(null);
      onChange(norm);
    } else {
      setDraftError("Not a valid hotkey — try e.g. Ctrl+Shift+O or Alt+F12");
    }
  }

  const boxBorder = recording ? "border-accent" : "border-line hover:border-accent/60";

  return (
    <div>
      <div className="flex items-center gap-2">
        <div
          ref={boxRef}
          role="button"
          tabIndex={0}
          aria-label={recording ? "Recording hotkey — press a key combo" : `Global hotkey: ${value}. Click to record a new one.`}
          onClick={() => !recording && startRecording()}
          onKeyDown={onKeyDown}
          onKeyUp={onKeyUp}
          onBlur={() => stopRecording()}
          className={`flex-1 flex items-center min-h-[34px] bg-bg-800 border rounded-md text-sm px-2 py-1.5 cursor-pointer select-none focus:outline-none focus:ring-1 focus:ring-accent/60 ${boxBorder}`}
        >
          {recording ? (
            heldMods.length > 0 ? (
              <Keycaps size="sm" parts={[...heldMods, "…"]} />
            ) : (
              <span className="text-muted">Press a key combo… (Esc cancels)</span>
            )
          ) : (
            <Keycaps size="sm" accelerator={value} />
          )}
        </div>
        <button
          type="button"
          onClick={() => (recording ? stopRecording() : startRecording())}
          className="text-xs px-3 py-1.5 rounded-md border border-line hover:border-accent"
        >
          {recording ? "Cancel" : "Record"}
        </button>
        <button
          type="button"
          onClick={() => {
            stopRecording();
            onChange(DEFAULT_SETTINGS.hotkey);
          }}
          className="text-xs px-3 py-1.5 rounded-md border border-line hover:border-accent text-muted"
        >
          Reset
        </button>
      </div>

      {recording && hint && <p className="text-[10px] text-warn mt-1">{hint}</p>}
      {!recording && status && (
        status.active ? (
          <p className="text-[10px] text-ok mt-1">● Active — press {status.accelerator.split("+").join(" + ")} anywhere</p>
        ) : (
          <p className="text-[10px] text-warn mt-1">● Not registered — this combo may be in use by another app</p>
        )
      )}

      <button
        type="button"
        onClick={() => setShowText((v) => !v)}
        className="text-[10px] text-muted underline underline-offset-2 mt-1 hover:text-slate-300"
      >
        {showText ? "Hide text editor" : "Edit as text"}
      </button>
      {showText && (
        <div className="mt-1">
          <input
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value);
              setDraftError(normalizeAccelerator(e.target.value) ? null : "Not a valid hotkey — try e.g. Ctrl+Shift+O or Alt+F12");
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitDraft();
            }}
            onBlur={commitDraft}
            spellCheck={false}
            aria-label="Hotkey as text"
            className={`w-full bg-bg-800 border rounded-md text-sm px-2 py-1.5 font-mono ${draftError ? "border-bad" : "border-line"}`}
          />
          {draftError && <p className="text-[10px] text-bad mt-1">{draftError}</p>}
        </div>
      )}
    </div>
  );
}
