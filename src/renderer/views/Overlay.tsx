import { useEffect, useRef, useState } from "react";
import { api } from "../api";
import type { CaptureMode, ModelId, OptLevel, OptimizeResult } from "../../shared/types";
import { MODELS, REWRITE_CONFIG, LEVEL_LABELS, LEVEL_TEMPERATURE } from "../../shared/types";
import { ScoreLift } from "../components/Score";
import { DiffView } from "../components/DiffView";

type Phase = "idle" | "capturing" | "optimizing" | "done" | "error";

export function Overlay() {
  const [mode, setMode] = useState<CaptureMode>("field");
  const [model, setModel] = useState<ModelId>("claude-opus-4.8");
  const [level, setLevel] = useState<OptLevel>(2);
  const [prompt, setPrompt] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [streamed, setStreamed] = useState("");
  const [result, setResult] = useState<OptimizeResult | null>(null);
  const [showDiff, setShowDiff] = useState(false);
  const captureRef = useRef<{ text: string; mode: CaptureMode; snapshot: { text: string; hasText: boolean } } | null>(null);
  const keyStateRef = useRef({ mode, phase, captureFailed: false });
  const actionsRef = useRef<{ runOptimize: () => void; onApply: () => void }>({
    runOptimize: () => {},
    onApply: () => {},
  });

  keyStateRef.current = { mode, phase, captureFailed: mode === "empty" };

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
      captureRef.current = {
        text: detail.text,
        mode: detail.mode,
        snapshot: detail.snapshot ?? { text: "", hasText: false },
      };
      setMode(detail.mode);
      setPrompt(detail.text);
      setPhase("idle");
      setStreamed("");
      setResult(null);
      setShowDiff(false);
    };

    const onCapturePending = () => {
      captureRef.current = null;
      setMode("field");
      setPrompt("");
      setPhase("capturing");
      setStreamed("");
      setResult(null);
      setShowDiff(false);
    };

    const offPending = api.onOverlayCapturePending(onCapturePending);
    const offShow = api.onOverlayShow(applyCapture);
    return () => {
      offPending?.();
      offShow?.();
    };
  }, []);

  async function runOptimize() {
    if (!prompt.trim()) return;
    setPhase("optimizing");
    setStreamed("");
    setResult(null);
    try {
      const res = await api.optimize({ prompt, model, level }, (chunk) => {
        setStreamed((s) => s + chunk);
      });
      setResult(res);
      setStreamed(res.optimizedPrompt);
      setPhase("done");
    } catch (e: any) {
      setPhase("error");
      setStreamed(`Error: ${e?.message ?? e}`);
    }
  }

  async function onApply() {
    if (!result) return;
    await api.captureInject(result.optimizedPrompt, captureRef.current?.snapshot ?? { text: "", hasText: false });
  }
  async function onCopy() {
    if (!result) return;
    await api.captureCopy(result.optimizedPrompt);
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
  const showResult = phase === "done" || phase === "error";
  const refinedText = result?.optimizedPrompt ?? streamed;

  return (
    <div className="w-full h-full flex items-start justify-center pt-1 px-4">
      <div className="glass rounded-2xl border border-line shadow-lg shadow-black/20 w-full max-w-3xl overflow-hidden">
        <div className="flex items-center gap-3 px-4 py-3 border-b border-line">
          <div className="flex items-center gap-2">
            <div className="w-2.5 h-2.5 rounded-full bg-accent" />
            <span className="font-semibold text-sm tracking-tight">PromptForge</span>
          </div>
          <div className="h-4 w-px bg-line" />
          <span className="text-[10px] text-muted uppercase tracking-wider">Target</span>
          <select
            value={model}
            onChange={(e) => setModel(e.target.value as ModelId)}
            disabled={captureFailed || capturing}
            className="bg-bg-800 border border-line rounded-md text-xs px-2 py-1 focus:outline-none focus:border-accent disabled:opacity-40"
          >
            {MODELS.map((m) => (
              <option key={m.id} value={m.id}>{m.label}</option>
            ))}
          </select>
          <div className="flex items-center bg-bg-800 border border-line rounded-md p-0.5">
            {([1, 2, 3, 4] as OptLevel[]).map((l) => (
              <button
                key={l}
                onClick={() => setLevel(l)}
                disabled={captureFailed || capturing}
                title={`L${l} ${LEVEL_LABELS[l]} · temp ${LEVEL_TEMPERATURE[l]}`}
                className={`px-2 py-0.5 text-xs rounded disabled:opacity-40 ${level === l ? "bg-accent text-white" : "text-muted hover:text-slate-200"}`}
              >
                {l} {LEVEL_LABELS[l]}
              </button>
            ))}
          </div>
          <span className="text-[10px] text-muted ml-auto">
            {showResult ? "Enter apply · Esc dismiss" : `Refine · temp ${LEVEL_TEMPERATURE[level]} · Esc`}
          </span>
        </div>

        <div className="px-4 py-3 space-y-3 max-h-[60vh] overflow-auto scroll-thin">
          {captureFailed ? (
            <div className="text-sm text-warn border border-warn/40 bg-warn/10 rounded-md p-3">
              Kon geen tekst ophalen. Zorg dat de cursor in een tekstveld staat.
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-muted mb-1.5">Original</div>
                  <textarea
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    readOnly={busy || capturing}
                    aria-label="Original prompt"
                    placeholder={capturing ? "Bezig met capture…" : "(empty)"}
                    className="w-full text-[13px] leading-relaxed whitespace-pre-wrap break-words bg-bg-900/60 border border-line/60 rounded-lg p-3 max-h-[180px] min-h-[80px] overflow-auto scroll-thin text-slate-300 resize-none focus:outline-none focus:border-accent/50 disabled:opacity-60"
                  />
                  {capturing && (
                    <p className="text-[11px] text-muted mt-1.5 animate-pulse">Tekst ophalen uit actief veld…</p>
                  )}
                </div>

                {(showResult || busy) && (
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-[10px] uppercase tracking-wider text-muted">
                        {phase === "error" ? "Error" : busy ? "Refining…" : "Refined"}
                      </span>
                      {result && phase === "done" && (
                        <div className="flex items-center gap-2">
                          <ScoreLift before={result.baselineScore} after={result.score} />
                          {result.diff.length > 0 && (
                            <button
                              onClick={() => setShowDiff((v) => !v)}
                              className="text-[10px] text-accent hover:underline"
                            >
                              {showDiff ? "hide changes" : "show changes"}
                            </button>
                          )}
                        </div>
                      )}
                    </div>

                    {showDiff && result ? (
                      <div className="bg-bg-900 border border-line rounded-lg p-2 max-h-[180px] overflow-auto scroll-thin">
                        <DiffView diff={result.diff} />
                      </div>
                    ) : (
                      <div className={`text-[13px] leading-relaxed whitespace-pre-wrap break-words rounded-lg p-3 min-h-[80px] max-h-[180px] overflow-auto scroll-thin ${
                        phase === "error"
                          ? "border border-warn/40 bg-warn/10 text-warn"
                          : busy
                            ? "border border-accent/30 bg-accent/5 text-slate-300"
                            : "border border-accent/20 bg-bg-900 text-slate-100"
                      }`}>
                        {refinedText || (busy ? "Bezig met opschonen…" : "")}
                        {busy && <span className="inline-block w-0.5 h-3.5 ml-0.5 bg-accent animate-pulse align-middle" />}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {capturing && (
                <div className="flex items-center gap-2 rounded-md border border-dashed border-line/80 bg-bg-900/50 px-3 py-4">
                  <span className="inline-block w-2 h-2 rounded-full bg-accent animate-pulse" />
                  <p className="text-sm text-muted">Bezig met capture…</p>
                </div>
              )}

              {phase === "idle" && !captureFailed && (
                <div className="flex items-center gap-3 rounded-md border border-dashed border-line/80 bg-bg-900/50 px-3 py-4">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-slate-200 font-medium">Klaar om te verfijnen</p>
                    <p className="text-[11px] text-muted mt-0.5">
                      Herschrijft volgens de {MODELS.find((m) => m.id === model)?.label ?? "model"} guide · L{level} {LEVEL_LABELS[level]} (temp {LEVEL_TEMPERATURE[level]}).
                    </p>
                  </div>
                  <button
                    onClick={() => void runOptimize()}
                    disabled={!canRefine}
                    className="shrink-0 px-4 py-2 text-sm rounded-lg bg-accent text-white font-semibold shadow-lg shadow-accent/25 hover:brightness-110 active:scale-[0.98] transition disabled:opacity-40 disabled:shadow-none disabled:active:scale-100"
                  >
                    Refine
                  </button>
                </div>
              )}

              {result && phase === "done" && (
                <p className="text-[10px] text-muted">
                  {result.source === "llm"
                    ? `Via ${REWRITE_CONFIG.label} (API)`
                    : "Lokaal — geen API key. Voeg OpenAI key toe in Studio → Settings."}
                  {result.notes[0] ? ` · ${result.notes[0]}` : ""}
                </p>
              )}
            </>
          )}
        </div>

        <div className="flex items-center gap-2 px-4 py-3 border-t border-line">
          {!captureFailed && !capturing && (
            <>
              {(phase === "idle" || phase === "error") && (
                <button
                  onClick={() => void runOptimize()}
                  disabled={!canRefine}
                  className="px-4 py-1.5 text-xs rounded-md bg-accent text-white font-semibold shadow-md shadow-accent/20 hover:brightness-110 active:scale-[0.98] transition disabled:opacity-40 disabled:shadow-none"
                >
                  Refine
                </button>
              )}
              {busy && (
                <span className="px-4 py-1.5 text-xs rounded-md bg-accent/20 text-accent font-medium animate-pulse">
                  Refining…
                </span>
              )}
              {phase === "done" && (
                <>
                  <button
                    onClick={() => void runOptimize()}
                    className="px-3 py-1.5 text-xs rounded-md border border-line text-slate-200 hover:border-accent/50"
                  >
                    Refine again
                  </button>
                  <button
                    onClick={onApply}
                    disabled={!result}
                    className="px-3 py-1.5 text-xs rounded-md bg-accent text-white font-medium disabled:opacity-40"
                  >
                    Apply
                  </button>
                  <button
                    onClick={onCopy}
                    disabled={!result}
                    className="px-3 py-1.5 text-xs rounded-md border border-line text-slate-200 disabled:opacity-40"
                  >
                    Copy
                  </button>
                </>
              )}
              <button
                onClick={() => api.openSettings()}
                className="px-3 py-1.5 text-xs rounded-md border border-line text-slate-200"
              >
                Settings
              </button>
            </>
          )}
          <button
            onClick={() => api.hideOverlay()}
            className={`${captureFailed ? "" : "ml-auto "} px-3 py-1.5 text-xs rounded-md text-muted hover:text-slate-200`}
          >
            Dismiss
          </button>
        </div>
      </div>
    </div>
  );
}
