import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { flushSync } from "react-dom";
import { api } from "../api";
import type { CaptureMode, ModelId, OptLevel } from "../../shared/types";
import { MODELS, LEVEL_LABELS } from "../../shared/types";

type Phase = "idle" | "capturing" | "optimizing" | "done" | "error";

function MoreIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="5" r="2" fill="currentColor" />
      <circle cx="12" cy="12" r="2" fill="currentColor" />
      <circle cx="12" cy="19" r="2" fill="currentColor" />
    </svg>
  );
}

function ChevronDown() {
  return (
    <svg width="10" height="6" viewBox="0 0 10 6" fill="none" aria-hidden className="opacity-90">
      <path d="M1 1L5 5L9 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

const LEVEL_COLORS: Record<OptLevel, string> = {
  1: "#5AC8FA",
  2: "#FFD60A",
  3: "#FF9F0A",
  4: "#FF453A",
};

const SLIDER_TRACK_W = 132;
const SLIDER_EDGE = 13;

function LevelSlider({
  level,
  onChange,
  disabled,
}: {
  level: OptLevel;
  onChange: (l: OptLevel) => void;
  disabled?: boolean;
}) {
  const levels = [1, 2, 3, 4] as OptLevel[];
  const trackRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);
  const [dragPct, setDragPct] = useState((level - 1) / 3);

  const thumbPct = dragging ? dragPct : (level - 1) / 3;
  const travel = SLIDER_TRACK_W - SLIDER_EDGE * 2;
  const center = SLIDER_EDGE + travel * thumbPct;

  const updateFromX = (clientX: number) => {
    const el = trackRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const span = rect.width - SLIDER_EDGE * 2;
    let pct = span > 0 ? (clientX - rect.left - SLIDER_EDGE) / span : 0;
    pct = Math.min(1, Math.max(0, pct));
    setDragPct(pct);
    const next = (Math.round(pct * 3) + 1) as OptLevel;
    if (next !== level) onChange(next);
  };

  const onPointerDown = (e: ReactPointerEvent) => {
    if (disabled) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    setDragging(true);
    updateFromX(e.clientX);
  };
  const onPointerMove = (e: ReactPointerEvent) => {
    if (dragging) updateFromX(e.clientX);
  };
  const endDrag = (e: ReactPointerEvent) => {
    if (!dragging) return;
    setDragging(false);
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
  };
  const onKeyDown = (e: ReactKeyboardEvent) => {
    if (disabled) return;
    if (e.key === "ArrowLeft" || e.key === "ArrowDown") {
      e.preventDefault();
      onChange(Math.max(1, level - 1) as OptLevel);
    } else if (e.key === "ArrowRight" || e.key === "ArrowUp") {
      e.preventDefault();
      onChange(Math.min(4, level + 1) as OptLevel);
    }
  };

  return (
    <div
      className="level-slider flex items-center gap-2.5 shrink-0"
      role="group"
      aria-label={`Guide depth L${level} ${LEVEL_LABELS[level]}`}
    >
      <div
        ref={trackRef}
        className={`level-slider__track relative h-[26px] rounded-full touch-none ${
          disabled ? "opacity-40" : "cursor-pointer"
        }`}
        style={{ width: SLIDER_TRACK_W }}
        role="slider"
        tabIndex={disabled ? -1 : 0}
        aria-valuemin={1}
        aria-valuemax={4}
        aria-valuenow={level}
        aria-valuetext={`L${level} ${LEVEL_LABELS[level]}`}
        aria-disabled={disabled}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onKeyDown={onKeyDown}
      >
        <div className="level-slider__lane absolute left-0 right-0 top-1/2 -translate-y-1/2 h-[3px] rounded-full pointer-events-none" />
        <div className="absolute inset-0 flex items-center justify-between px-[11px] pointer-events-none">
          {levels.map((l) => (
            <span key={l} className="w-[3px] h-[3px] rounded-full bg-white/25" />
          ))}
        </div>
        <div
          className={`level-slider__fill absolute left-0 top-1/2 -translate-y-1/2 h-[3px] rounded-full pointer-events-none ${
            dragging ? "" : "level-slider__fill--rest"
          }`}
          style={{ width: center }}
        />
        <div
          className={`level-slider__thumb absolute top-1/2 w-5 h-5 rounded-full pointer-events-none ${
            dragging ? "" : "level-slider__thumb--rest"
          }`}
          style={{ left: center, transform: `translate(-50%, -50%) scale(${dragging ? 1.14 : 1})` }}
        />
      </div>
      <span
        key={level}
        className="level-slider__label text-[13px] font-semibold leading-none select-none text-left"
        style={{ color: LEVEL_COLORS[level], width: 34 }}
      >
        {LEVEL_LABELS[level]}
      </span>
    </div>
  );
}

function modelDisplayLabel(id: ModelId): string {
  const m = MODELS.find((x) => x.id === id);
  if (!m) return id;
  return m.label.replace("Claude Opus 4.8", "Opus4.8").replace("Claude ", "").replace(" Pro", "");
}

function ModelPicker({
  model,
  onChange,
  disabled,
}: {
  model: ModelId;
  onChange: (id: ModelId) => void;
  disabled?: boolean;
}) {
  const measureRef = useRef<HTMLSpanElement>(null);
  const [textWidth, setTextWidth] = useState(0);
  const displayLabel = modelDisplayLabel(model);
  const chevronGap = 7;
  const chevronWidth = 10;
  const selectWidth = textWidth + chevronGap + chevronWidth;

  useLayoutEffect(() => {
    if (!measureRef.current) return;
    setTextWidth(measureRef.current.offsetWidth);
  }, [displayLabel]);

  return (
    <div className="relative inline-block text-[15px] font-medium text-white">
      <span
        ref={measureRef}
        aria-hidden
        className="invisible absolute whitespace-nowrap font-medium text-[15px] pointer-events-none"
      >
        {displayLabel}
      </span>
      <select
        value={model}
        onChange={(e) => onChange(e.target.value as ModelId)}
        disabled={disabled}
        aria-label="Target model"
        style={{ width: selectWidth || undefined }}
        className="appearance-none bg-transparent border-0 pl-0 pr-0 py-0 text-[15px] font-medium text-white focus:outline-none cursor-pointer disabled:opacity-50"
      >
        {MODELS.map((m) => (
          <option key={m.id} value={m.id} className="bg-bg-900 text-white">
            {modelDisplayLabel(m.id)}
          </option>
        ))}
      </select>
      <span
        className="pointer-events-none absolute top-1/2 -translate-y-1/2"
        style={{ left: textWidth + chevronGap }}
      >
        <ChevronDown />
      </span>
    </div>
  );
}

function GlassPill({
  children,
  onClick,
  disabled,
  className = "",
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`apple-glass-pill px-5 py-1.5 rounded-full text-[15px] font-medium transition disabled:opacity-40 disabled:cursor-not-allowed ${className}`}
    >
      {children}
    </button>
  );
}

export function Overlay() {
  const [mode, setMode] = useState<CaptureMode>("field");
  const [model, setModel] = useState<ModelId>("claude-opus-4.8");
  const [level, setLevel] = useState<OptLevel>(2);
  const [prompt, setPrompt] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [streamed, setStreamed] = useState("");
  const [outputText, setOutputText] = useState("");
  const [hasGenerated, setHasGenerated] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [shellVisible, setShellVisible] = useState(false);
  const [applyNotice, setApplyNotice] = useState<string | null>(null);
  const captureRef = useRef<{ text: string; mode: CaptureMode; snapshot: { text: string; hasText: boolean } } | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const keyStateRef = useRef({ mode, phase, captureFailed: false });
  const actionsRef = useRef<{ runOptimize: () => void; onApply: () => void }>({
    runOptimize: () => {},
    onApply: () => {},
  });

  keyStateRef.current = { mode, phase, captureFailed: mode === "empty" };

  function ackOverlayPrepared(): void {
    void document.body.offsetHeight;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        api.overlayPrepared();
      });
    });
  }

  function resetOverlaySession(): void {
    flushSync(() => {
      captureRef.current = null;
      setMode("field");
      setPrompt("");
      setPhase("idle");
      setStreamed("");
      setOutputText("");
      setHasGenerated(false);
      setMenuOpen(false);
      setApplyNotice(null);
      setShellVisible(false);
    });
    ackOverlayPrepared();
  }

  useEffect(() => {
    (async () => {
      const s = await api.settingsGet();
      setModel(s.defaultModel);
      setLevel(s.defaultLevel);
    })();

    const applyCapture = (detail: {
      text: string;
      mode: CaptureMode;
      snapshot: { text: string; hasText: boolean };
    }) => {
      flushSync(() => {
        captureRef.current = {
          text: detail.text,
          mode: detail.mode,
          snapshot: detail.snapshot ?? { text: "", hasText: false },
        };
        setMode(detail.mode);
        setPrompt(detail.text);
        setPhase("idle");
        setStreamed("");
        setOutputText("");
        setHasGenerated(false);
        setMenuOpen(false);
        setApplyNotice(null);
        setShellVisible(true);
      });
      ackOverlayPrepared();
    };

    const onCapturePending = () => {
      captureRef.current = null;
      setMode("field");
      setPrompt("");
      setPhase("capturing");
      setStreamed("");
      setOutputText("");
      setHasGenerated(false);
      setMenuOpen(false);
      setApplyNotice(null);
      ackOverlayPrepared();
    };

    const offPending = api.onOverlayCapturePending(onCapturePending);
    const offShow = api.onOverlayShow(applyCapture);
    const offClear = api.onOverlayClear(resetOverlaySession);
    return () => {
      offPending?.();
      offShow?.();
      offClear?.();
    };
  }, []);

  useEffect(() => {
    if (!menuOpen) return;
    const onPointerDown = (e: PointerEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    window.addEventListener("pointerdown", onPointerDown);
    return () => window.removeEventListener("pointerdown", onPointerDown);
  }, [menuOpen]);

  async function runOptimize() {
    if (!prompt.trim()) return;
    setApplyNotice(null);
    setPhase("optimizing");
    setStreamed("");
    setOutputText("");
    try {
      const res = await api.optimize({ prompt, model, level }, (chunk) => {
        setStreamed((s) => s + chunk);
      });
      setStreamed(res.optimizedPrompt);
      setOutputText(res.optimizedPrompt);
      setHasGenerated(true);
      setPhase("done");
    } catch (e: any) {
      setPhase("error");
      const msg = `Error: ${e?.message ?? e}`;
      setStreamed(msg);
      setOutputText(msg);
      setHasGenerated(true);
    }
  }

  async function onApply() {
    if (!outputText.trim() || phase !== "done") return;
    setApplyNotice(null);
    const res = await api.captureInject(outputText, captureRef.current?.snapshot ?? { text: "", hasText: false });
    if (res === "copied") {
      setApplyNotice("Couldn't insert — copied to clipboard");
    }
  }

  async function onCopy() {
    if (!outputText.trim()) return;
    await api.captureCopy(outputText);
  }

  actionsRef.current = { runOptimize: () => void runOptimize(), onApply: () => void onApply() };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const { mode: m, phase: p, captureFailed: failed } = keyStateRef.current;
      if (e.key === "Escape") api.hideOverlay();
      if (m === "field" && ["1", "2", "3", "4"].includes(e.key) && !e.metaKey && !e.ctrlKey) {
        setLevel(Number(e.key) as OptLevel);
      }
      if (e.key === "Enter" && !e.shiftKey && !failed && p !== "capturing") {
        const tag = (e.target as HTMLElement).tagName;
        if (tag === "TEXTAREA" || tag === "INPUT" || tag === "SELECT") return;
        e.preventDefault();
        if (p === "idle" || p === "error") actionsRef.current.runOptimize();
        else if (p === "done") actionsRef.current.onApply();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const busy = phase === "optimizing";
  const capturing = phase === "capturing";
  const captureFailed = mode === "empty";
  const canRefine = !captureFailed && !capturing && !!prompt.trim() && !busy;
  const showOutput = busy || phase === "done" || phase === "error";
  const outputValue = busy ? streamed : outputText;
  const canApplyOrCopy = !!outputText.trim() && phase === "done";
  const modelLabel = MODELS.find((m) => m.id === model)?.label ?? model;
  const controlsDisabled = captureFailed || capturing || busy;

  const outputPlaceholder = capturing
    ? "Capturing…"
    : busy
      ? "Refining…"
      : "Output will appear here";

  return (
    <div className="overlay-font w-full h-full flex items-center justify-center px-12">
      <div className={`relative w-full max-w-[578px] ${shellVisible ? "" : "invisible"}`}>
        <div ref={menuRef} className="absolute top-10 -right-10 z-10">
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            className="p-1.5 rounded-full text-white/80 hover:text-white hover:bg-white/20 transition"
            aria-label="More options"
            aria-expanded={menuOpen}
          >
            <MoreIcon />
          </button>
          {menuOpen && (
            <div className="apple-glass-menu absolute right-0 mt-1 min-w-[140px] rounded-xl py-1 text-white">
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false);
                  api.openSettings();
                }}
                className="w-full text-left px-3 py-2 text-sm hover:bg-white/10"
              >
                Settings
              </button>
              <button
                type="button"
                onClick={() => api.hideOverlay()}
                className="w-full text-left px-3 py-2 text-sm text-white/70 hover:bg-white/10"
              >
                Dismiss
              </button>
            </div>
          )}
        </div>

        <div className="apple-glass relative rounded-[34px] w-full p-4 text-white">
        {captureFailed ? (
          <div className="apple-glass-panel rounded-[26px] p-4 text-sm text-warn">
            Could not capture text. Make sure the cursor is in a text field.
          </div>
        ) : (
          <>
            <div className="flex gap-4 mb-4 items-start">
              <div className="flex-1 flex flex-col gap-3">
                <div className="apple-glass-panel rounded-[26px] h-[88px] overflow-hidden">
                  <textarea
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    readOnly={busy || capturing}
                    aria-label="Original prompt"
                    placeholder={capturing ? "Capturing…" : "Prompt input…"}
                    className="w-full h-full bg-transparent border-0 px-3.5 py-3 text-[15px] leading-relaxed text-white placeholder:text-white/50 resize-none focus:outline-none scroll-thin"
                  />
                </div>
                <div className="pl-1 mt-1 flex items-center gap-3">
                  <GlassPill onClick={() => void runOptimize()} disabled={!canRefine}>
                    {busy ? "Refining…" : hasGenerated ? "Regenerate" : "Generate"}
                  </GlassPill>
                  <LevelSlider level={level} onChange={setLevel} disabled={controlsDisabled} />
                </div>
              </div>

              <div
                className={`flex-1 apple-glass-panel relative rounded-[26px] h-[150px] overflow-hidden ${
                  phase === "error" ? "ring-1 ring-warn/50" : busy ? "ring-1 ring-white/20" : ""
                }`}
              >
                <textarea
                  value={showOutput ? outputValue : ""}
                  onChange={(e) => setOutputText(e.target.value)}
                  readOnly={busy || capturing || phase === "error"}
                  aria-label="Refined prompt output"
                  placeholder={outputPlaceholder}
                  className="w-full h-full bg-transparent border-0 px-3.5 py-3 pr-2 text-[15px] leading-relaxed text-white placeholder:text-white/50 resize-none focus:outline-none scroll-thin"
                />
              </div>
            </div>

            <div className="flex items-center gap-3 px-1 min-h-[36px]">
              <div className="flex items-center gap-3 min-w-0">
                <ModelPicker model={model} onChange={setModel} disabled={controlsDisabled} />
                <span className="sr-only">{modelLabel}</span>
                {applyNotice && (
                  <span className="text-[13px] text-warn truncate" role="status">
                    {applyNotice}
                  </span>
                )}
              </div>

              <div className="flex items-center gap-2 ml-auto shrink-0">
                <button
                  type="button"
                  onClick={() => api.hideOverlay()}
                  className="text-[15px] text-white/45 hover:text-white/65 transition shrink-0 -ml-1.5"
                >
                  Discard
                </button>
                <GlassPill onClick={onApply} disabled={!canApplyOrCopy}>
                  Apply
                </GlassPill>
                <GlassPill onClick={() => void onCopy()} disabled={!canApplyOrCopy}>
                  Copy
                </GlassPill>
              </div>
            </div>
          </>
        )}
        </div>
      </div>
    </div>
  );
}
