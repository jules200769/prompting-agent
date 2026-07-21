import { useEffect, useRef, useState } from "react";
import type { AppSettings, HotkeyStatus, LibraryItem, ModelId, OptLevel, RunRecord, RunVerdict, WorkbenchSeed } from "../../shared/types";
import { MODELS, REWRITE_CONFIG, LEVEL_LABELS, LEVEL_COLORS } from "../../shared/types";
import { acceleratorDisplayParts } from "../../shared/accelerator";
import { api } from "../api";
import { ScoreRing, RubricChips, ScoreLift } from "../components/Score";
import { DiffView } from "../components/DiffView";
import { ToastProvider, useToast } from "../components/Toast";
import { HotkeyField } from "../components/HotkeyField";
import { ThemeGallery } from "../components/ThemeGallery";
import { ThemePreview } from "../components/ThemePreview";
import { applyThemeToDocument } from "../../shared/themes";

type Tab = "workbench" | "library" | "history" | "settings";

export function Studio() {
  return (
    <ToastProvider>
      <StudioShell />
    </ToastProvider>
  );
}

function StudioShell() {
  const [tab, setTab] = useState<Tab>("workbench");
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [seed, setSeed] = useState<WorkbenchSeed | null>(null);

  useEffect(() => {
    (async () => {
      const loaded = await api.settingsGet();
      setSettings(loaded);
      applyThemeToDocument(loaded.theme);
    })();
    const off = api.onStudioRoute((route) => {
      if (route === "settings") setTab("settings");
    });
    const offSeed = api.onStudioWorkbench((s) => {
      setSeed(s);
      setTab("workbench");
    });
    return () => {
      off?.();
      offSeed?.();
    };
  }, []);

  const openInWorkbench = (s: WorkbenchSeed) => {
    setSeed(s);
    setTab("workbench");
  };

  return (
    <div className="studio-shell h-full flex bg-bg-950 text-ink">
      {/* Left rail */}
      <aside className="studio-aside w-52 shrink-0 border-r flex flex-col">
        <div className="px-4 py-4 flex items-center gap-2">
          <div className="w-2.5 h-2.5 rounded-full bg-accent" />
          <span className="font-brand font-semibold tracking-tight">Anvyll</span>
        </div>
        <nav className="px-2 space-y-0.5">
          {(["workbench", "library", "history", "settings"] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`w-full text-left px-3 py-2 rounded-md text-sm capitalize ${tab === t ? "bg-bg-800 text-ink" : "text-muted hover:text-ink/90 hover:bg-bg-850"}`}
            >
              {t}
            </button>
          ))}
        </nav>
        <div className="mt-auto px-4 py-3 text-[10px] text-muted">
          {settings ? `Hotkey: ${acceleratorDisplayParts(settings.hotkey).join("+")}` : ""}
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 min-w-0 overflow-hidden">
        {tab === "workbench" && <Workbench defaultSettings={settings} seed={seed} />}
        {tab === "library" && <Library onOpen={openInWorkbench} />}
        {tab === "history" && <History onOpen={openInWorkbench} />}
        {tab === "settings" && <Settings />}
      </main>
    </div>
  );
}

// ---------------- Workbench ----------------
function Workbench({
  defaultSettings,
  seed,
}: {
  defaultSettings: AppSettings | null;
  seed: WorkbenchSeed | null;
}) {
  const [prompt, setPrompt] = useState("");
  const [model, setModel] = useState<ModelId>(defaultSettings?.defaultModel ?? "claude-opus-4.8");
  const [level, setLevel] = useState<OptLevel>(defaultSettings?.defaultLevel ?? 2);
  const [persona, setPersona] = useState(defaultSettings?.defaultPersona ?? "");
  const [context, setContext] = useState(defaultSettings?.contextMemory ?? "");
  const [busy, setBusy] = useState(false);
  const [streamed, setStreamed] = useState("");
  const [result, setResult] = useState<any>(null);
  const [lastRunId, setLastRunId] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<{ score: number; subscores: any; weaknesses: string[] } | null>(null);
  const [view, setView] = useState<"diff" | "clean">("diff");
  const toast = useToast();

  useEffect(() => {
    if (defaultSettings) {
      setModel(defaultSettings.defaultModel);
      setLevel(defaultSettings.defaultLevel);
      setPersona(defaultSettings.defaultPersona);
      setContext(defaultSettings.contextMemory);
    }
  }, [defaultSettings]);

  useEffect(() => {
    if (!seed) return;
    setPrompt(seed.originalText);
    setModel(seed.model);
    setLevel(seed.level);
    setResult(null);
    setAnalysis(null);
    setStreamed(seed.optimizedText ?? "");
  }, [seed]);

  async function runAnalyze() {
    if (!prompt.trim()) return;
    const a = await api.analyze(prompt);
    setAnalysis(a as any);
  }

  async function runOptimize() {
    if (!prompt.trim()) return;
    setBusy(true);
    setStreamed("");
    setResult(null);
    setLastRunId(null);
    try {
      const res = await api.optimize({ prompt, model, level, persona, context }, (c) => setStreamed((s) => s + c));
      setResult(res);
      setLastRunId(res.runId);
      setStreamed(res.optimizedPrompt);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setStreamed(`Error: ${msg}`);
    } finally {
      setBusy(false);
    }
  }

  async function saveToLibrary() {
    if (!result) return;
    await api.librarySave({
      title: prompt.slice(0, 50),
      originalText: prompt,
      optimizedText: result.optimizedPrompt,
      model, level, score: result.score, tags: [model, `L${level}`],
    });
    toast({ text: "Saved to library." });
  }

  async function copyOptimized() {
    if (!result) return;
    const text = result.optimizedPrompt;
    await navigator.clipboard?.writeText(text);
    void api.historyFinalize({ id: lastRunId ?? undefined, finalPrompt: text, action: "copy" });
    toast({ text: "Copied to clipboard." });
  }

  return (
    <div className="h-full flex flex-col">
      {/* Top bar */}
      <div className="flex items-center gap-3 px-5 py-3 border-b border-line bg-bg-900">
        <select value={model} onChange={(e) => setModel(e.target.value as ModelId)} className="bg-bg-800 border border-line rounded-md text-xs px-2 py-1" title="Target model">
          {MODELS.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
        </select>
        <div className="flex items-center bg-bg-800 border border-line rounded-md p-0.5">
          {([1, 2, 3, 4] as OptLevel[]).map((l) => (
            <button
              key={l}
              onClick={() => setLevel(l)}
              title={`L${l} ${LEVEL_LABELS[l]} · guide structure`}
              className={`px-2 py-0.5 text-xs rounded font-medium ${level === l ? "" : "text-muted"}`}
              style={level === l ? { background: LEVEL_COLORS[l] + "26", color: LEVEL_COLORS[l] } : undefined}
            >
              {l} {LEVEL_LABELS[l]}
            </button>
          ))}
        </div>
        <span className="text-[10px] text-muted">L{level} {LEVEL_LABELS[level]} target</span>
        <div className="ml-auto flex gap-2">
          <button onClick={runAnalyze} className="text-xs px-3 py-1 rounded-md border border-line">Analyze</button>
          <button onClick={runOptimize} disabled={busy} className="text-xs px-3 py-1 rounded-md btn-accent disabled:opacity-40">{busy ? "Optimizing…" : "Optimize"}</button>
        </div>
      </div>

      {/* Center: original | optimized */}
      <div className="flex-1 grid grid-cols-2 gap-px bg-line overflow-hidden">
        <div className="bg-bg-950 flex flex-col">
          <div className="px-4 py-2 text-[10px] uppercase tracking-wider text-muted border-b border-line">Original</div>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Write or paste a rough prompt here…"
            className="flex-1 bg-transparent p-4 text-sm font-mono resize-none focus:outline-none scroll-thin"
          />
          {analysis && (
            <div className="px-4 py-2 border-t border-line text-[11px] text-muted">
              Baseline score: <span className="text-slate-200 font-semibold">{analysis.score}</span>
              {analysis.weaknesses.length > 0 && (
                <ul className="mt-1 list-disc list-inside space-y-0.5">
                  {analysis.weaknesses.slice(0, 4).map((w, i) => <li key={i}>{w}</li>)}
                </ul>
              )}
            </div>
          )}
        </div>
        <div className="bg-bg-950 flex flex-col">
          <div className="px-4 py-2 text-[10px] uppercase tracking-wider text-muted border-b border-line flex items-center gap-2">
            Optimized
            {result &&
              (result.adherenceLevel < result.level ? (
                <span className="normal-case px-1.5 py-0.5 rounded bg-warn/10 text-warn font-medium">
                  Requested {LEVEL_LABELS[result.level as OptLevel]} · Measured{" "}
                  {LEVEL_LABELS[result.adherenceLevel as OptLevel]}
                </span>
              ) : (
                <span className="normal-case px-1.5 py-0.5 rounded bg-bg-800 text-accent font-medium">
                  Structure: {LEVEL_LABELS[result.adherenceLevel as OptLevel]}
                </span>
              ))}
            {result && <ScoreLift before={result.baselineScore} after={result.score} />}
            {result && (
              <div className="ml-auto flex items-center bg-bg-800 border border-line rounded p-0.5 normal-case">
                {(["diff", "clean"] as const).map((v) => (
                  <button
                    key={v}
                    onClick={() => setView(v)}
                    className={`px-2 py-0.5 rounded text-[10px] capitalize ${view === v ? "bg-bg-700 text-slate-100" : "text-muted"}`}
                  >
                    {v}
                  </button>
                ))}
              </div>
            )}
          </div>
          {result ? (
            view === "diff" ? (
              <div className="flex-1 overflow-auto scroll-thin p-4">
                <DiffView diff={result.diff} />
              </div>
            ) : (
              <pre className="flex-1 p-4 text-sm font-mono whitespace-pre-wrap break-words text-slate-200 overflow-auto scroll-thin select-text">
                {result.optimizedPrompt}
              </pre>
            )
          ) : (
            <pre className="flex-1 p-4 text-sm font-mono whitespace-pre-wrap break-words text-slate-300 overflow-auto scroll-thin">
              {streamed || (busy ? "…" : "Optimized prompt appears here.")}
              {busy && <span className="animate-pulse">▋</span>}
            </pre>
          )}
        </div>
      </div>

      {/* Right/bottom: analysis + persona */}
      {result && (
        <div className="border-t border-line bg-bg-900 px-5 py-3 flex items-start gap-6">
          <ScoreRing score={result.score} size={72} />
          <div className="flex-1 space-y-2">
            <RubricChips subscores={result.subscores} />
            <div className="flex gap-4 text-[11px]">
              <div className="flex-1">
                <span className="text-muted">Persona: </span>
                <span className="text-slate-200">{result.personaSuggestion}</span>
              </div>
            </div>
            {result.notes.length > 0 && (
              <ul className="text-[10px] text-muted space-y-0.5 list-disc list-inside">
                {result.notes.map((n: string, i: number) => <li key={i}>{n}</li>)}
              </ul>
            )}
          </div>
          <div className="flex flex-col gap-2">
            <button onClick={() => void copyOptimized()} className="text-xs px-3 py-1 rounded-md border border-line">Copy</button>
            <button onClick={saveToLibrary} className="text-xs px-3 py-1 rounded-md btn-accent">Save to library</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------- Library ----------------
function Library({ onOpen }: { onOpen: (seed: WorkbenchSeed) => void }) {
  const [items, setItems] = useState<LibraryItem[]>([]);
  const [q, setQ] = useState("");
  const toast = useToast();
  const deleteTimers = useRef(new Map<string, number>());
  useEffect(() => {
    void api.libraryList().then(setItems);
    const timers = deleteTimers.current;
    return () => {
      // Unmount flushes pending deletes immediately (undo window closes with the view).
      for (const id of timers.keys()) void api.libraryDelete(id);
      timers.forEach((t) => window.clearTimeout(t));
      timers.clear();
    };
  }, []);

  function deleteWithUndo(it: LibraryItem) {
    setItems((list) => list.filter((x) => x.id !== it.id));
    const timer = window.setTimeout(() => {
      deleteTimers.current.delete(it.id);
      void api.libraryDelete(it.id);
    }, 5000);
    deleteTimers.current.set(it.id, timer);
    toast({
      text: `Deleted "${it.title}"`,
      actionLabel: "Undo",
      durationMs: 5000,
      onAction: () => {
        const t = deleteTimers.current.get(it.id);
        if (t) window.clearTimeout(t);
        deleteTimers.current.delete(it.id);
        setItems((list) => [it, ...list]);
      },
    });
  }

  const filtered = items.filter((i) => (i.title + i.originalText + i.tags.join(" ")).toLowerCase().includes(q.toLowerCase()));
  return (
    <div className="h-full flex flex-col">
      <div className="px-5 py-3 border-b border-line flex items-center gap-3">
        <h2 className="font-semibold">Library</h2>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search…" className="ml-auto bg-bg-800 border border-line rounded-md text-xs px-2 py-1 w-56 focus:outline-none focus:border-accent" />
      </div>
      <div className="flex-1 overflow-auto scroll-thin p-4 space-y-2">
        {filtered.length === 0 && <div className="text-muted text-sm p-8 text-center">No saved prompts yet.</div>}
        {filtered.map((it) => (
          <div
            key={it.id}
            className="bg-bg-900 border border-line rounded-md p-3 cursor-pointer hover:border-accent/50 transition-colors"
            onClick={() =>
              onOpen({ originalText: it.originalText, optimizedText: it.optimizedText, model: it.model, level: it.level })
            }
          >
            <div className="flex items-center gap-2">
              <span className="font-medium text-sm truncate flex-1">{it.title}</span>
              <span className="text-[10px] text-muted">{it.model} · L{it.level} · score {it.score}</span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  deleteWithUndo(it);
                }}
                className="text-[10px] text-bad hover:underline"
              >
                delete
              </button>
            </div>
            <div className="text-xs text-slate-400 mt-1 line-clamp-2">{it.optimizedText}</div>
            <div className="flex gap-1 mt-2">{it.tags.map((t) => <span key={t} className="text-[10px] px-1.5 py-0.5 rounded bg-bg-800 text-muted">{t}</span>)}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------- History ----------------
const VERDICT_LABELS: Record<RunVerdict, string> = {
  good: "Good",
  bad: "Bad",
  mixed: "Mixed",
};

function latestVerdict(record: RunRecord): RunVerdict | undefined {
  return record.comments.find((c) => c.verdict)?.verdict;
}

function History({ onOpen }: { onOpen: (seed: WorkbenchSeed) => void }) {
  const [items, setItems] = useState<RunRecord[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [analysisPath, setAnalysisPath] = useState("");
  const [commentDraft, setCommentDraft] = useState("");
  const [commentVerdict, setCommentVerdict] = useState<RunVerdict | null>(null);
  const [confirmingClear, setConfirmingClear] = useState(false);
  const toast = useToast();

  async function refresh() {
    setItems(await api.historyList());
  }

  useEffect(() => {
    void refresh();
    void api.historyAnalysisPath().then(setAnalysisPath);
  }, []);

  useEffect(() => {
    if (!confirmingClear) return;
    const t = window.setTimeout(() => setConfirmingClear(false), 3000);
    return () => window.clearTimeout(t);
  }, [confirmingClear]);

  async function onClear() {
    if (!confirmingClear) {
      setConfirmingClear(true);
      return;
    }
    setConfirmingClear(false);
    await api.historyClear();
    setItems([]);
    setExpandedId(null);
    toast({ text: "History cleared (analysis file kept)." });
  }

  async function copyAnalysisPath() {
    if (!analysisPath) return;
    await navigator.clipboard?.writeText(analysisPath);
    toast({ text: "Analysis file path copied." });
  }

  async function saveComment(runId: string) {
    const text = commentDraft.trim();
    if (!text && !commentVerdict) return;
    const updated = await api.historyAddComment({
      id: runId,
      text: text || VERDICT_LABELS[commentVerdict!],
      verdict: commentVerdict ?? undefined,
    });
    if (!updated) {
      toast({ text: "Could not save comment." });
      return;
    }
    setCommentDraft("");
    setCommentVerdict(null);
    await refresh();
    toast({ text: "Comment saved." });
  }

  function toggleExpand(id: string) {
    setExpandedId((prev) => (prev === id ? null : id));
    setCommentDraft("");
    setCommentVerdict(null);
  }

  return (
    <div className="h-full flex flex-col">
      <div className="px-5 py-3 border-b border-line flex items-center gap-3">
        <h2 className="font-semibold">History</h2>
        {analysisPath && (
          <button
            onClick={() => void copyAnalysisPath()}
            className="text-[10px] text-muted hover:text-slate-200 truncate max-w-[280px]"
            title={analysisPath}
          >
            Copy analysis path
          </button>
        )}
        <button
          onClick={() => void onClear()}
          className={`ml-auto text-xs shrink-0 ${confirmingClear ? "text-bad font-semibold" : "text-muted hover:text-bad"}`}
        >
          {confirmingClear ? "Confirm clear?" : "clear"}
        </button>
      </div>
      <div className="flex-1 overflow-auto scroll-thin p-4 space-y-2">
        {items.length === 0 && <div className="text-muted text-sm p-8 text-center">No optimizations yet.</div>}
        {items.map((h) => {
          const verdict = latestVerdict(h);
          const expanded = expandedId === h.id;
          const outText = h.output.finalPrompt ?? h.output.optimizedPrompt;
          return (
            <div key={h.id} className="bg-bg-900 border border-line rounded-md p-3 text-xs">
              <div className="flex items-center gap-2 text-muted flex-wrap">
                <button
                  onClick={() => toggleExpand(h.id)}
                  className="text-slate-200 hover:text-white font-medium"
                >
                  {expanded ? "▾" : "▸"}
                </button>
                <span>
                  {h.input.model} · L{h.input.level} · score {h.output.score} · {h.output.source}
                  {h.fromCache ? " · cache" : ""} · {h.surface}
                </span>
                {verdict && (
                  <span className="px-1.5 py-0.5 rounded bg-bg-800 text-slate-200">{VERDICT_LABELS[verdict]}</span>
                )}
                {h.comments.length > 0 && (
                  <span className="text-muted">{h.comments.length} comment{h.comments.length === 1 ? "" : "s"}</span>
                )}
                <span className="ml-auto">{new Date(h.createdAt).toLocaleString()}</span>
                <button
                  onClick={() => onOpen({ originalText: h.input.prompt, model: h.input.model, level: h.input.level, optimizedText: outText })}
                  className="text-accent-soft hover:underline"
                >
                  Re-run
                </button>
                <button
                  onClick={async () => {
                    await navigator.clipboard?.writeText(outText);
                    void api.historyFinalize({ id: h.id, finalPrompt: outText, action: "copy" });
                    toast({ text: "Copied to clipboard." });
                  }}
                  className="text-accent-soft hover:underline"
                >
                  Copy out
                </button>
              </div>
              <div className="mt-1 text-slate-400 line-clamp-1"><span className="text-muted">in:</span> {h.input.prompt}</div>
              <div className="text-slate-200 line-clamp-2"><span className="text-muted">out:</span> {outText}</div>

              {expanded && (
                <div className="mt-3 pt-3 border-t border-line space-y-3">
                  <div className="flex flex-wrap gap-1.5">
                    {h.input.promptType && h.input.promptType !== "auto" && (
                      <span className="px-1.5 py-0.5 rounded bg-bg-800 text-muted">type:{h.input.promptType}</span>
                    )}
                    {h.input.terminalContext && (
                      <span className="px-1.5 py-0.5 rounded bg-bg-800 text-muted">terminal</span>
                    )}
                    {h.input.writingType && (
                      <span className="px-1.5 py-0.5 rounded bg-bg-800 text-muted">writing:{h.input.writingType}</span>
                    )}
                    {h.actions?.applied && (
                      <span className="px-1.5 py-0.5 rounded bg-bg-800 text-muted">applied</span>
                    )}
                    {h.actions?.copied && (
                      <span className="px-1.5 py-0.5 rounded bg-bg-800 text-muted">copied</span>
                    )}
                    {h.actions?.edited && (
                      <span className="px-1.5 py-0.5 rounded bg-bg-800 text-muted">edited</span>
                    )}
                  </div>

                  <div>
                    <div className="text-[10px] uppercase tracking-wider text-muted mb-1">Original</div>
                    <pre className="whitespace-pre-wrap break-words text-slate-300 font-mono text-[11px] max-h-40 overflow-auto scroll-thin">{h.input.prompt}</pre>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase tracking-wider text-muted mb-1">
                      {h.output.finalPrompt ? "Final output" : "Optimized"}
                    </div>
                    <pre className="whitespace-pre-wrap break-words text-slate-200 font-mono text-[11px] max-h-48 overflow-auto scroll-thin">{outText}</pre>
                    {h.output.finalPrompt && h.output.finalPrompt !== h.output.optimizedPrompt && (
                      <details className="mt-2">
                        <summary className="text-muted cursor-pointer">Model output</summary>
                        <pre className="mt-1 whitespace-pre-wrap break-words text-slate-400 font-mono text-[11px] max-h-32 overflow-auto scroll-thin">
                          {h.output.optimizedPrompt}
                        </pre>
                      </details>
                    )}
                  </div>

                  {h.output.notes.length > 0 && (
                    <ul className="text-[10px] text-muted list-disc list-inside space-y-0.5">
                      {h.output.notes.map((n, i) => <li key={i}>{n}</li>)}
                    </ul>
                  )}

                  {h.comments.length > 0 && (
                    <div className="space-y-2">
                      <div className="text-[10px] uppercase tracking-wider text-muted">Comments</div>
                      {h.comments.map((c) => (
                        <div key={c.id} className="border border-line rounded px-2 py-1.5">
                          <div className="flex items-center gap-2 text-muted mb-0.5">
                            {c.verdict && <span className="text-slate-200">{VERDICT_LABELS[c.verdict]}</span>}
                            <span className="ml-auto">{new Date(c.createdAt).toLocaleString()}</span>
                          </div>
                          {c.text && <div className="text-slate-300 whitespace-pre-wrap">{c.text}</div>}
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="space-y-2">
                    <div className="text-[10px] uppercase tracking-wider text-muted">Add comment</div>
                    <div className="flex gap-1.5">
                      {(["good", "bad", "mixed"] as RunVerdict[]).map((v) => (
                        <button
                          key={v}
                          onClick={() => setCommentVerdict((prev) => (prev === v ? null : v))}
                          className={`px-2 py-0.5 rounded text-[10px] border ${
                            commentVerdict === v
                              ? "border-accent text-accent-soft bg-accent/10"
                              : "border-line text-muted hover:text-slate-200"
                          }`}
                        >
                          {VERDICT_LABELS[v]}
                        </button>
                      ))}
                    </div>
                    <textarea
                      value={commentDraft}
                      onChange={(e) => setCommentDraft(e.target.value)}
                      placeholder="What worked or what went wrong?"
                      className="w-full h-16 bg-bg-950 border border-line rounded px-2 py-1.5 text-[11px] resize-none focus:outline-none scroll-thin"
                    />
                    <button
                      onClick={() => void saveComment(h.id)}
                      disabled={!commentDraft.trim() && !commentVerdict}
                      className="text-xs px-3 py-1 rounded-md btn-accent disabled:opacity-40"
                    >
                      Save comment
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------------- Settings ----------------
function Settings() {
  const [s, setS] = useState<AppSettings | null>(null);
  const [hasOpenAiKey, setHasOpenAiKey] = useState(false);
  const [isSecure, setIsSecure] = useState(true);
  const [keyInput, setKeyInput] = useState("");
  const [hotkeyStatus, setHotkeyStatus] = useState<HotkeyStatus | null>(null);
  const toast = useToast();

  useEffect(() => {
    void api.settingsGet().then((loaded) => {
      setS(loaded);
      applyThemeToDocument(loaded.theme);
    }).catch((e) => { console.error("settingsGet failed", e); });
    void api.hotkeyStatus().then(setHotkeyStatus).catch((e) => console.error("hotkeyStatus failed", e));
    void api.keysHas("openai").then(setHasOpenAiKey).catch((e) => console.error("keysHas failed", e));
    void api.keysIsSecure().then(setIsSecure).catch((e) => console.error("keysIsSecure failed", e));
  }, []);

  useEffect(() => {
    if (s) applyThemeToDocument(s.theme);
  }, [s?.theme]);

  if (!s) return <div className="p-8 text-muted">Loading…</div>;

  const update = (patch: Partial<AppSettings>) => setS({ ...s, ...patch });

  async function save() {
    if (!s) return;
    try {
      const res = await api.settingsSet(s);
      // Resync — the hotkey may have been normalized or reverted by the main process.
      setS(res.settings);
      setHotkeyStatus({ accelerator: res.settings.hotkey, active: res.hotkeyActive });
      if (res.ok) {
        toast({ text: "Settings saved." });
      } else {
        toast({ text: `Settings saved, but the hotkey was not changed: ${res.hotkeyError ?? "registration failed"}` });
      }
    } catch (e) {
      console.error("settingsSet failed", e);
      toast({ text: "Failed to save settings." });
    }
  }

  async function saveKey() {
    if (!keyInput) return;
    await api.keysSet("openai", keyInput);
    setKeyInput("");
    setHasOpenAiKey(await api.keysHas("openai"));
  }
  async function deleteKey() {
    await api.keysDelete("openai");
    setHasOpenAiKey(false);
  }

  return (
    <div className="h-full overflow-auto scroll-thin">
      <div className="max-w-2xl mx-auto p-8 space-y-8">
        <section>
          <h2 className="font-semibold text-lg mb-1">Settings</h2>
          <p className="text-muted text-xs mb-4">Tune the global hotkey, defaults, and your OpenAI API key.</p>
          {!isSecure && (
            <div className="mb-4 text-xs text-warn border border-warn/40 bg-warn/10 rounded-md p-2">
              OS credential encryption is unavailable on this system — keys will be stored with base64 fallback only.
            </div>
          )}
          <div className="space-y-4">
            <Field label="Global hotkey">
              <HotkeyField
                value={s.hotkey}
                onChange={(hotkey) => update({ hotkey })}
                status={hotkeyStatus?.accelerator === s.hotkey ? hotkeyStatus : null}
              />
              <p className="text-[10px] text-muted mt-1">Combine Ctrl, Alt, Shift, or Win with a letter, digit, or F1–F24. Save to apply.</p>
            </Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Default target model">
                <select value={s.defaultModel} onChange={(e) => update({ defaultModel: e.target.value as ModelId })} className="w-full bg-bg-800 border border-line rounded-md text-sm px-2 py-1.5">
                  {MODELS.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
                </select>
                <p className="text-[10px] text-muted mt-1">The AI model your prompt is optimized for (methodology only, not the rewrite model).</p>
              </Field>
              <Field label="Default adherence level">
                <select value={s.defaultLevel} onChange={(e) => update({ defaultLevel: Number(e.target.value) as OptLevel })} className="w-full bg-bg-800 border border-line rounded-md text-sm px-2 py-1.5">
                  {([1, 2, 3, 4] as OptLevel[]).map((l) => (
                    <option key={l} value={l}>L{l} {LEVEL_LABELS[l]}</option>
                  ))}
                </select>
              </Field>
            </div>
            <Field label="Default persona (applied automatically)">
              <input value={s.defaultPersona} onChange={(e) => update({ defaultPersona: e.target.value })} placeholder="e.g. a senior SaaS growth marketer" className="w-full bg-bg-800 border border-line rounded-md text-sm px-2 py-1.5" />
            </Field>
            <Field label="Context memory (audience, job, tone — applied to every optimization)">
              <textarea value={s.contextMemory} onChange={(e) => update({ contextMemory: e.target.value })} className="w-full bg-bg-800 border border-line rounded-md text-sm px-2 py-1.5 h-20 resize-none" />
            </Field>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={s.screenContext} onChange={(e) => update({ screenContext: e.target.checked })} />
              Screen context — let the hotkey read the active app's title, site, and surrounding text to tailor rewrites (off = prompt text only)
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={s.telemetry} onChange={(e) => update({ telemetry: e.target.checked })} />
              Allow anonymous telemetry
            </label>
            <Field label="Theme">
              <ThemeGallery
                value={s.theme}
                onChange={(theme) => {
                  update({ theme });
                  applyThemeToDocument(theme);
                  api.previewTheme(theme);
                }}
              />
              <p className="text-[10px] text-muted mt-2">Applies instantly. Save settings to keep your choice.</p>
            </Field>
            <div className="flex flex-wrap items-center gap-4">
              <button onClick={save} className="px-4 py-2 rounded-md btn-accent text-sm font-medium shrink-0">
                Save settings
              </button>
              <ThemePreview theme={s.theme} />
            </div>
          </div>
        </section>

        <section>
          <h3 className="font-semibold mb-1">OpenAI API key</h3>
          <p className="text-muted text-xs mb-4">
            Anvyll uses {REWRITE_CONFIG.label} to generate all optimizations. The chosen target-model pack supplies the prompt-engineering expertise. Keys are encrypted with the OS Credential Manager and never leave this machine. Without a key, optimization is unavailable — Anvyll never substitutes generic output.
          </p>
          <div className="flex items-center gap-2">
            <div className="w-40">
              <div className="text-sm font-medium">OpenAI</div>
              <div className="text-[10px] text-muted">{REWRITE_CONFIG.modelId} — sk-…</div>
            </div>
            <input
              type="password"
              value={keyInput}
              onChange={(e) => setKeyInput(e.target.value)}
              placeholder={hasOpenAiKey ? "•••• stored ••••" : "paste key…"}
              className="flex-1 bg-bg-800 border border-line rounded-md text-sm px-2 py-1.5"
            />
            <button onClick={() => saveKey()} className="text-xs px-3 py-1.5 rounded-md btn-accent">Save</button>
            {hasOpenAiKey && <button onClick={() => deleteKey()} className="text-xs px-2 py-1.5 rounded-md text-bad">remove</button>}
          </div>
        </section>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-[11px] uppercase tracking-wider text-muted font-display">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}
