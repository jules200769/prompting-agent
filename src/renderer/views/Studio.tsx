import { useEffect, useState } from "react";
import type { AppSettings, HistoryItem, LibraryItem, ModelId, OptLevel } from "../../shared/types";
import { MODELS, REWRITE_CONFIG, LEVEL_LABELS } from "../../shared/types";
import { api } from "../api";
import { ScoreRing, RubricChips, ScoreLift } from "../components/Score";
import { DiffView } from "../components/DiffView";

type Tab = "workbench" | "library" | "history" | "settings";

export function Studio() {
  const [tab, setTab] = useState<Tab>("workbench");
  const [settings, setSettings] = useState<AppSettings | null>(null);

  useEffect(() => {
    (async () => setSettings(await api.settingsGet()))();
    const off = api.onStudioRoute((route) => {
      if (route === "settings") setTab("settings");
    });
    return () => off?.();
  }, []);

  return (
    <div className="h-full flex bg-bg-950 text-slate-100">
      {/* Left rail */}
      <aside className="w-52 shrink-0 border-r border-line bg-bg-900 flex flex-col">
        <div className="px-4 py-4 flex items-center gap-2">
          <div className="w-2.5 h-2.5 rounded-full bg-accent" />
          <span className="font-semibold tracking-tight">PromptForge</span>
        </div>
        <nav className="px-2 space-y-0.5">
          {(["workbench", "library", "history", "settings"] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`w-full text-left px-3 py-2 rounded-md text-sm capitalize ${tab === t ? "bg-bg-800 text-white" : "text-muted hover:text-slate-200 hover:bg-bg-850"}`}
            >
              {t}
            </button>
          ))}
        </nav>
        <div className="mt-auto px-4 py-3 text-[10px] text-muted">
          {settings ? `Hotkey: ${settings.hotkey}` : ""}
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 min-w-0 overflow-hidden">
        {tab === "workbench" && <Workbench defaultSettings={settings} />}
        {tab === "library" && <Library />}
        {tab === "history" && <History />}
        {tab === "settings" && <Settings />}
      </main>
    </div>
  );
}

// ---------------- Workbench ----------------
function Workbench({ defaultSettings }: { defaultSettings: AppSettings | null }) {
  const [prompt, setPrompt] = useState("");
  const [model, setModel] = useState<ModelId>(defaultSettings?.defaultModel ?? "claude-opus-4.8");
  const [level, setLevel] = useState<OptLevel>(defaultSettings?.defaultLevel ?? 2);
  const [persona, setPersona] = useState(defaultSettings?.defaultPersona ?? "");
  const [context, setContext] = useState(defaultSettings?.contextMemory ?? "");
  const [busy, setBusy] = useState(false);
  const [streamed, setStreamed] = useState("");
  const [result, setResult] = useState<any>(null);
  const [analysis, setAnalysis] = useState<{ score: number; subscores: any; weaknesses: string[] } | null>(null);

  useEffect(() => {
    if (defaultSettings) {
      setModel(defaultSettings.defaultModel);
      setLevel(defaultSettings.defaultLevel);
      setPersona(defaultSettings.defaultPersona);
      setContext(defaultSettings.contextMemory);
    }
  }, [defaultSettings]);

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
    try {
      const res = await api.optimize({ prompt, model, level, persona, context }, (c) => setStreamed((s) => s + c));
      setResult(res);
      setStreamed(res.optimizedPrompt);
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
    alert("Saved to library.");
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
              title={`L${l} ${LEVEL_LABELS[l]} · guide-structuur`}
              className={`px-2 py-0.5 text-xs rounded ${level === l ? "bg-accent text-white" : "text-muted"}`}
            >
              {l} {LEVEL_LABELS[l]}
            </button>
          ))}
        </div>
        <span className="text-[10px] text-muted">L{level} {LEVEL_LABELS[level]} target</span>
        <div className="ml-auto flex gap-2">
          <button onClick={runAnalyze} className="text-xs px-3 py-1 rounded-md border border-line">Analyze</button>
          <button onClick={runOptimize} disabled={busy} className="text-xs px-3 py-1 rounded-md bg-accent text-white disabled:opacity-40">{busy ? "Optimizing…" : "Optimize"}</button>
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
            {result && (
              <span className="normal-case px-1.5 py-0.5 rounded bg-bg-800 text-accent font-medium">
                Structuur: {LEVEL_LABELS[result.adherenceLevel]}
              </span>
            )}
            {result && <ScoreLift before={result.baselineScore} after={result.score} />}
          </div>
          {result ? (
            <div className="flex-1 overflow-auto scroll-thin p-4">
              <DiffView diff={result.diff} />
            </div>
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
            <button onClick={() => navigator.clipboard?.writeText(result.optimizedPrompt)} className="text-xs px-3 py-1 rounded-md border border-line">Copy</button>
            <button onClick={saveToLibrary} className="text-xs px-3 py-1 rounded-md bg-accent text-white">Save to library</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------- Library ----------------
function Library() {
  const [items, setItems] = useState<LibraryItem[]>([]);
  const [q, setQ] = useState("");
  useEffect(() => { void api.libraryList().then(setItems); }, []);
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
          <div key={it.id} className="bg-bg-900 border border-line rounded-md p-3">
            <div className="flex items-center gap-2">
              <span className="font-medium text-sm truncate flex-1">{it.title}</span>
              <span className="text-[10px] text-muted">{it.model} · L{it.level} · score {it.score}</span>
              <button onClick={async () => { await api.libraryDelete(it.id); setItems(await api.libraryList()); }} className="text-[10px] text-bad hover:underline">delete</button>
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
function History() {
  const [items, setItems] = useState<HistoryItem[]>([]);
  useEffect(() => { void api.historyList().then(setItems); }, []);
  return (
    <div className="h-full flex flex-col">
      <div className="px-5 py-3 border-b border-line flex items-center">
        <h2 className="font-semibold">History</h2>
        <button onClick={async () => { await api.historyClear(); setItems([]); }} className="ml-auto text-xs text-muted hover:text-bad">clear</button>
      </div>
      <div className="flex-1 overflow-auto scroll-thin p-4 space-y-2">
        {items.length === 0 && <div className="text-muted text-sm p-8 text-center">No optimizations yet.</div>}
        {items.map((h) => (
          <div key={h.id} className="bg-bg-900 border border-line rounded-md p-3 text-xs">
            <div className="flex items-center gap-2 text-muted">
              <span>{h.model} · L{h.level} · score {h.score} · {h.source}</span>
              <span className="ml-auto">{new Date(h.createdAt).toLocaleString()}</span>
            </div>
            <div className="mt-1 text-slate-400 line-clamp-1"><span className="text-muted">in:</span> {h.originalText}</div>
            <div className="text-slate-200 line-clamp-2"><span className="text-muted">out:</span> {h.optimizedText}</div>
          </div>
        ))}
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

  useEffect(() => {
    void api.settingsGet().then(setS).catch((e) => { console.error("settingsGet failed", e); });
    void api.keysHas("openai").then(setHasOpenAiKey).catch((e) => console.error("keysHas failed", e));
    void api.keysIsSecure().then(setIsSecure).catch((e) => console.error("keysIsSecure failed", e));
  }, []);

  if (!s) return <div className="p-8 text-muted">Loading…</div>;

  const update = (patch: Partial<AppSettings>) => setS({ ...s, ...patch });

  async function save() {
    if (!s) return;
    await api.settingsSet(s);
    alert("Settings saved.");
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
              <input value={s.hotkey} onChange={(e) => update({ hotkey: e.target.value })} className="w-full bg-bg-800 border border-line rounded-md text-sm px-2 py-1.5" />
              <p className="text-[10px] text-muted mt-1">Modifiers: CommandOrControl, Shift, Alt, Super. e.g. CommandOrControl+Shift+O</p>
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
              <input type="checkbox" checked={s.telemetry} onChange={(e) => update({ telemetry: e.target.checked })} />
              Allow anonymous telemetry
            </label>
            <button onClick={save} className="px-4 py-2 rounded-md bg-accent text-white text-sm font-medium">Save settings</button>
          </div>
        </section>

        <section>
          <h3 className="font-semibold mb-1">OpenAI API key</h3>
          <p className="text-muted text-xs mb-4">
            PromptForge uses {REWRITE_CONFIG.label} to generate all optimizations. The chosen target-model pack supplies the prompt-engineering expertise. Keys are encrypted with the OS Credential Manager and never leave this machine. Without a key, PromptForge uses the local fallback optimizer.
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
            <button onClick={() => saveKey()} className="text-xs px-3 py-1.5 rounded-md bg-accent text-white">Save</button>
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
      <span className="text-[11px] uppercase tracking-wider text-muted">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}
