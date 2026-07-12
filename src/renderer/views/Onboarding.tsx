import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "../api";
import { useTypewriterReveal } from "../hooks/useTypewriterReveal";
import { DEFAULT_SETTINGS, MODELS, type AppSettings } from "../../shared/types";
import { Keycaps } from "../components/Keycaps";

type Step = "key" | "hotkey" | "thesis" | "try";

const SAMPLE_PROMPT =
  "write a function that fetches users from an api and shows them in a list";

const KEY_URL = "https://platform.openai.com/api-keys";

function Pill({
  children,
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="apple-glass-pill px-5 py-1.5 rounded-full text-[15px] font-medium transition disabled:opacity-40 disabled:cursor-not-allowed"
    >
      {children}
    </button>
  );
}

export function Onboarding() {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [steps, setSteps] = useState<Step[]>(["hotkey", "thesis", "try"]);
  const [stepIndex, setStepIndex] = useState(0);
  const [keyInput, setKeyInput] = useState("");
  const [keySaved, setKeySaved] = useState(false);
  const [telemetry, setTelemetry] = useState(false);

  // Try-it-now state
  const [tryPrompt, setTryPrompt] = useState(SAMPLE_PROMPT);
  const [tryBusy, setTryBusy] = useState(false);
  const [tryOutput, setTryOutput] = useState("");
  const [tryError, setTryError] = useState<string | null>(null);
  const [demoField, setDemoField] = useState("");
  const [applied, setApplied] = useState(false);
  const { displayed, isRevealing, reset, appendTarget, setTarget, flush, waitUntilRevealed } =
    useTypewriterReveal();

  const step = steps[stepIndex];
  const isLast = stepIndex === steps.length - 1;

  useEffect(() => {
    (async () => {
      const s = await api.settingsGet();
      setSettings(s);
      setTelemetry(s.telemetry);
      const hasKey = await api.keysHas("openai");
      if (!hasKey) setSteps(["key", "hotkey", "thesis", "try"]);
    })();
  }, []);

  async function finish() {
    if (settings) {
      await api.settingsSet({ ...settings, telemetry });
    }
    api.finishOnboarding();
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") void finish();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [settings, telemetry]);

  async function saveKey() {
    if (!keyInput.trim()) return;
    await api.keysSet("openai", keyInput.trim());
    setKeyInput("");
    setKeySaved(true);
  }

  async function runTry() {
    if (!tryPrompt.trim() || tryBusy) return;
    setTryBusy(true);
    setTryError(null);
    setTryOutput("");
    setApplied(false);
    reset();
    try {
      const res = await api.optimize(
        {
          prompt: tryPrompt,
          model: settings?.defaultModel ?? "claude-opus-4.8",
          level: settings?.defaultLevel ?? 2,
        },
        appendTarget,
      );
      setTarget(res.optimizedPrompt);
      await waitUntilRevealed();
      setTryOutput(res.optimizedPrompt);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setTryError(msg);
      flush();
    } finally {
      setTryBusy(false);
    }
  }

  const busyReveal = tryBusy || isRevealing;
  const modelLabels = useMemo(() => MODELS.map((m) => m.label), []);
  const hotkey = settings?.hotkey ?? DEFAULT_SETTINGS.hotkey;
  const demoRef = useRef<HTMLTextAreaElement>(null);

  return (
    <div className="overlay-font w-full h-full flex items-center justify-center px-12">
      <div className="apple-glass relative rounded-[34px] w-full max-w-[578px] p-6 text-white">
        {step === "key" && (
          <div className="flex flex-col gap-4">
            <h1 className="text-[19px] font-semibold">Connect your OpenAI key</h1>
            <p className="text-[14px] leading-relaxed text-white/70">
              PromptForge uses one OpenAI model to rewrite prompts. Your key is
              encrypted with the Windows Credential Manager and never leaves this
              machine — only prompt text goes to the API.
            </p>
            <div className="apple-glass-panel rounded-[26px] p-3 flex items-center gap-2">
              <input
                type="password"
                value={keyInput}
                onChange={(e) => setKeyInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void saveKey();
                }}
                placeholder={keySaved ? "•••• stored ••••" : "sk-…"}
                aria-label="OpenAI API key"
                className="flex-1 bg-transparent border-0 px-2 py-1 text-[15px] text-white placeholder:text-white/50 focus:outline-none"
              />
              <Pill onClick={() => void saveKey()} disabled={!keyInput.trim()}>
                {keySaved ? "Saved" : "Save"}
              </Pill>
            </div>
            <button
              type="button"
              onClick={() => void api.openExternal(KEY_URL)}
              className="self-start text-[13px] text-white/60 hover:text-white/85 underline underline-offset-2 transition"
            >
              Get a key at platform.openai.com →
            </button>
          </div>
        )}

        {step === "hotkey" && (
          <div className="flex flex-col gap-4">
            <h1 className="text-[19px] font-semibold">One hotkey, anywhere</h1>
            <p className="text-[14px] leading-relaxed text-white/70">
              Put your cursor in any text field — Cursor, Chrome, a terminal — and press
            </p>
            <div className="py-3 text-center">
              <Keycaps accelerator={hotkey} />
            </div>
            <p className="text-[14px] leading-relaxed text-white/70">
              Your draft prompt is captured into the overlay. After refining, Apply
              puts it straight back where you were typing.
            </p>
          </div>
        )}

        {step === "thesis" && (
          <div className="flex flex-col gap-4">
            <h1 className="text-[19px] font-semibold">Rewritten for the model you send it to</h1>
            <p className="text-[14px] leading-relaxed text-white/70">
              Every AI has its own published prompting methodology. Pick your target
              and PromptForge restructures your prompt to that model&apos;s own guide —
              from a light clean-up (Cool) to full structure (Max).
            </p>
            <div className="flex flex-wrap gap-1.5">
              {modelLabels.map((label) => (
                <span
                  key={label}
                  className="px-2.5 py-1 rounded-full border border-white/20 bg-white/10 text-[12px] font-medium text-white/85"
                >
                  {label}
                </span>
              ))}
            </div>
          </div>
        )}

        {step === "try" && (
          <div className="flex flex-col gap-3">
            <h1 className="text-[19px] font-semibold">Try it now</h1>
            <div className="apple-glass-panel rounded-[26px] h-[64px] overflow-hidden">
              <textarea
                value={tryPrompt}
                onChange={(e) => setTryPrompt(e.target.value)}
                readOnly={busyReveal}
                aria-label="Sample prompt"
                className="w-full h-full bg-transparent border-0 px-3.5 py-2.5 text-[14px] leading-relaxed text-white placeholder:text-white/50 resize-none focus:outline-none scroll-thin"
              />
            </div>
            <div className="flex items-center gap-3">
              <Pill onClick={() => void runTry()} disabled={busyReveal || !tryPrompt.trim()}>
                {busyReveal ? "Refining…" : "Refine"}
              </Pill>
              {tryError && (
                <span className="text-[13px] text-warn truncate" role="status">
                  {tryError}
                </span>
              )}
            </div>
            <div
              className={`apple-glass-panel relative rounded-[26px] h-[110px] overflow-hidden ${
                busyReveal ? "ring-1 ring-white/20" : ""
              }`}
            >
              <textarea
                value={busyReveal ? displayed : tryOutput}
                readOnly
                aria-label="Refined prompt"
                placeholder={busyReveal ? "Refining…" : "Refined prompt appears here"}
                className="w-full h-full bg-transparent border-0 px-3.5 py-2.5 text-[14px] leading-relaxed text-white placeholder:text-white/50 resize-none focus:outline-none scroll-thin"
              />
              {busyReveal && displayed.length > 0 && (
                <span
                  className="pointer-events-none absolute bottom-2 right-3 text-[14px] text-white/70 animate-pulse"
                  aria-hidden
                >
                  ▋
                </span>
              )}
            </div>
            <div className="flex items-center gap-3">
              <Pill
                onClick={() => {
                  setDemoField(tryOutput);
                  setApplied(true);
                  demoRef.current?.focus();
                }}
                disabled={!tryOutput.trim() || busyReveal}
              >
                Apply
              </Pill>
              <span className="text-[12px] text-white/50">
                {applied ? "In the real flow this lands in the field you came from." : "…into the demo field below"}
              </span>
            </div>
            <div className="apple-glass-panel rounded-[26px] h-[56px] overflow-hidden">
              <textarea
                ref={demoRef}
                value={demoField}
                onChange={(e) => setDemoField(e.target.value)}
                aria-label="Demo text field"
                placeholder="Demo text field"
                className="w-full h-full bg-transparent border-0 px-3.5 py-2.5 text-[13px] leading-relaxed text-white/85 placeholder:text-white/40 resize-none focus:outline-none scroll-thin"
              />
            </div>
            <label className="flex items-center gap-2 text-[13px] text-white/70 select-none">
              <input
                type="checkbox"
                checked={telemetry}
                onChange={(e) => setTelemetry(e.target.checked)}
              />
              Allow anonymous usage metrics (helps improve capture and rewrite quality)
            </label>
          </div>
        )}

        <div className="mt-6 flex items-center gap-3">
          <div className="flex items-center gap-1.5" aria-hidden>
            {steps.map((s, i) => (
              <span
                key={s}
                className={`w-1.5 h-1.5 rounded-full ${i === stepIndex ? "bg-white/90" : "bg-white/30"}`}
              />
            ))}
          </div>
          <span className="sr-only">{`Step ${stepIndex + 1} of ${steps.length}`}</span>
          <div className="ml-auto flex items-center gap-2">
            <button
              type="button"
              onClick={() => void finish()}
              className="text-[15px] text-white/45 hover:text-white/65 transition"
            >
              Skip
            </button>
            <Pill
              onClick={() => {
                if (isLast) void finish();
                else setStepIndex((i) => i + 1);
              }}
            >
              {isLast ? "Finish" : "Continue"}
            </Pill>
          </div>
        </div>
      </div>
    </div>
  );
}
