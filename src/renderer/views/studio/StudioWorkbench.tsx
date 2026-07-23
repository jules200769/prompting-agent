import { useEffect, useMemo, useState } from "react";
import {
  LEVEL_COLORS,
  LEVEL_LABELS,
  MODELS,
  type AppSettings,
  type ModelId,
  type OptimizeWithRunId,
  type OptLevel,
  type WorkbenchSeed,
} from "../../../shared/types";
import {
  PROMPT_CATEGORIES,
  clarificationContext,
  restorePromptVersion,
  type ClarificationQuestion,
  type FollowUpSuggestion,
  type Instruction,
  type PromptCategory,
  type PromptVersion,
} from "../../../shared/studio";
import type { ProjectContext, SessionContext } from "../../../shared/session";
import { api } from "../../api";
import type { StudioService } from "../../services/studioService";
import { useToast } from "../../components/Toast";
import { SkeletonLines } from "../../components/Skeleton";
import {
  StudioBadge,
  StudioButton,
  StudioCard,
  StudioEmpty,
  StudioModal,
  StudioPage,
  StudioSegmented,
} from "./StudioPrimitives";

type ResultTab = "inputs" | "context" | "versions" | "settings";

const STARTERS: Array<{
  title: string;
  detail: string;
  category: PromptCategory;
  seed: string;
}> = [
  {
    title: "Turn rough notes into a brief",
    detail: "Organize an idea into a clear, actionable document.",
    category: "writing",
    seed: "Turn these rough notes into a clear, actionable brief:",
  },
  {
    title: "Review a code change",
    detail: "Surface correctness, maintainability, and delivery risk.",
    category: "code",
    seed: "Review this code change for correctness, maintainability, and delivery risk:",
  },
  {
    title: "Plan a product launch",
    detail: "Build a phased plan with owners and measurable outcomes.",
    category: "planning",
    seed: "Create a phased product launch plan with owners and measurable outcomes:",
  },
  {
    title: "Create a research brief",
    detail: "Frame evidence, limits, and the open questions.",
    category: "research",
    seed: "Create a research brief that separates evidence, limitations, and open questions:",
  },
];

const FOLLOW_UPS: FollowUpSuggestion[] = [
  {
    id: "f1",
    kind: "try-next",
    title: "Create a shorter working version",
    description: "Keep the intent while making the prompt faster to reuse.",
    seed: "Create a shorter reusable version of this prompt while preserving its intent:\n\n",
  },
  {
    id: "f2",
    kind: "try-next",
    title: "Adapt it for a specialist",
    description: "Raise the expected expertise and precision.",
    seed: "Adapt this prompt for a specialist audience and raise its precision:\n\n",
  },
  {
    id: "f3",
    kind: "wild-card",
    title: "Turn it into a review loop",
    description: "Ask the model to draft, critique, and improve its result.",
    seed: "Turn this prompt into a draft, critique, and improve workflow:\n\n",
  },
];

function createClarifications(prompt: string): ClarificationQuestion[] {
  const subject = prompt.trim().split(/\s+/).slice(0, 8).join(" ");
  return [
    {
      id: "outcome",
      prompt: "What matters most in the finished result?",
      helper: `Choose the priority for “${subject || "this request"}”.`,
      options: ["Clarity and speed", "Depth and completeness", "A persuasive final result"],
    },
    {
      id: "audience",
      prompt: "Who should the result be designed for?",
      helper: "A clear audience helps the model choose the right language and depth.",
      options: ["A general audience", "A domain specialist", "A decision-maker"],
    },
    {
      id: "format",
      prompt: "How should the answer be delivered?",
      helper: "Select a useful output shape or add your own.",
      options: ["A concise structured answer", "A step-by-step plan", "A detailed working document"],
    },
  ];
}

function ModelAndLevel({
  model,
  level,
  onModel,
  onLevel,
}: {
  model: ModelId;
  level: OptLevel;
  onModel: (model: ModelId) => void;
  onLevel: (level: OptLevel) => void;
}) {
  return (
    <div className="studio-composer__controls">
      <label className="studio-select-control">
        <span>Target model</span>
        <select value={model} onChange={(event) => onModel(event.target.value as ModelId)}>
          {MODELS.map((candidate) => (
            <option key={candidate.id} value={candidate.id}>
              {candidate.label}
            </option>
          ))}
        </select>
      </label>
      <div className="studio-level-control">
        <span>Guide level</span>
        <div className="studio-levels">
          {([1, 2, 3, 4] as OptLevel[]).map((candidate) => (
            <button
              type="button"
              key={candidate}
              onClick={() => onLevel(candidate)}
              aria-pressed={candidate === level}
              className={candidate === level ? "is-active" : ""}
              style={candidate === level ? { "--level-color": LEVEL_COLORS[candidate] } as React.CSSProperties : undefined}
            >
              {LEVEL_LABELS[candidate]}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function ClarificationFlow({
  questions,
  onCancel,
  onComplete,
}: {
  questions: ClarificationQuestion[];
  onCancel: () => void;
  onComplete: (questions: ClarificationQuestion[]) => void;
}) {
  const [items, setItems] = useState(questions);
  const [step, setStep] = useState(0);
  const current = items[step];

  const answer = (value: string) => {
    setItems((list) =>
      list.map((question) => (question.id === current.id ? { ...question, answer: value } : question)),
    );
  };

  return (
    <StudioModal
      title="Improve your prompt"
      onClose={onCancel}
      width="large"
      footer={
        <>
          <StudioButton variant="quiet" onClick={onCancel}>
            Skip questions
          </StudioButton>
          <div className="studio-modal__footer-spacer" />
          {step > 0 && (
            <StudioButton onClick={() => setStep((value) => value - 1)}>
              Back
            </StudioButton>
          )}
          <StudioButton
            variant="primary"
            disabled={!current.answer?.trim()}
            onClick={() => {
              if (step === items.length - 1) onComplete(items);
              else setStep((value) => value + 1);
            }}
          >
            {step === items.length - 1 ? "Refine prompt" : "Next"}
          </StudioButton>
        </>
      }
    >
      <div className="studio-progress" aria-label={`Question ${step + 1} of ${items.length}`}>
        {items.map((question, index) => (
          <span key={question.id} className={index <= step ? "is-active" : ""} />
        ))}
      </div>
      <div className="studio-question">
        <div className="studio-eyebrow">Step {step + 1} of {items.length}</div>
        <h3>{current.prompt}</h3>
        <p>{current.helper}</p>
        <div className="studio-question__options">
          {current.options.map((option) => (
            <button
              type="button"
              key={option}
              className={current.answer === option ? "is-selected" : ""}
              onClick={() => answer(option)}
            >
              <span className="studio-radio-dot" aria-hidden="true" />
              {option}
            </button>
          ))}
        </div>
        <label className="studio-field">
          <span>Or add your own answer</span>
          <textarea
            value={current.answer && !current.options.includes(current.answer) ? current.answer : ""}
            onChange={(event) => answer(event.target.value)}
            placeholder="Type a custom answer…"
          />
        </label>
      </div>
    </StudioModal>
  );
}

export function StudioWorkbench({
  mode,
  defaultSettings,
  seed,
  service,
  instructions,
  activeProject,
  activeSession,
  onRunComplete,
}: {
  mode: "generator" | "optimizer";
  defaultSettings: AppSettings | null;
  seed: WorkbenchSeed | null;
  service: StudioService;
  instructions: Instruction[];
  activeProject?: ProjectContext | null;
  activeSession?: SessionContext | null;
  onRunComplete?: (prompt: string) => void;
}) {
  const [prompt, setPrompt] = useState("");
  const [model, setModel] = useState<ModelId>(defaultSettings?.defaultModel ?? "claude-opus-4.8");
  const [level, setLevel] = useState<OptLevel>(defaultSettings?.defaultLevel ?? 2);
  const [category, setCategory] = useState<PromptCategory>("standard");
  const [busy, setBusy] = useState(false);
  const [streamed, setStreamed] = useState("");
  const [result, setResult] = useState<OptimizeWithRunId | null>(null);
  const [error, setError] = useState("");
  const [resultTab, setResultTab] = useState<ResultTab>("inputs");
  const [versions, setVersions] = useState<PromptVersion[]>([]);
  const [clarifications, setClarifications] = useState<ClarificationQuestion[]>([]);
  const [clarificationOpen, setClarificationOpen] = useState(false);
  const toast = useToast();

  useEffect(() => {
    if (!defaultSettings) return;
    setModel(defaultSettings.defaultModel);
    setLevel(defaultSettings.defaultLevel);
  }, [defaultSettings]);

  useEffect(() => {
    if (!seed) return;
    setPrompt(seed.originalText);
    setModel(seed.model);
    setLevel(seed.level);
    setResult(null);
    setStreamed(seed.optimizedText ?? "");
    setVersions(
      seed.optimizedText
        ? [{
            id: `seed-${Date.now()}`,
            label: "Opened from saved prompt",
            prompt: seed.optimizedText,
            source: "restored",
            createdAt: Date.now(),
          }]
        : [],
    );
  }, [seed]);

  const enabledInstructions = useMemo(
    () => instructions.filter((instruction) => instruction.enabledByDefault),
    [instructions],
  );

  async function run(answers: ClarificationQuestion[] = []) {
    if (!prompt.trim()) return;
    setBusy(true);
    setError("");
    setResult(null);
    setStreamed("");
    setClarifications(answers);
    await api.sessionEnsureActive(null);
    const instructionContext = enabledInstructions
      .map((instruction) => `${instruction.title}: ${instruction.detail}`)
      .join("\n");
    const answersContext = clarificationContext(answers);
    const context = [instructionContext, answersContext].filter(Boolean).join("\n\n") || undefined;
    try {
      const optimized = await api.optimize(
        {
          prompt,
          model,
          level,
          context,
          skipCache: mode === "generator",
        },
        (chunk) => setStreamed((text) => text + chunk),
      );
      setResult(optimized);
      setStreamed(optimized.optimizedPrompt);
      setVersions((current) => [
        ...current,
        {
          id: `version-${optimized.runId}`,
          label: answers.length ? "Applied clarification" : mode === "generator" ? "Generated" : "Optimized",
          prompt: optimized.optimizedPrompt,
          source: answers.length ? "clarified" : mode === "generator" ? "generated" : "optimized",
          createdAt: Date.now(),
        },
      ]);
      void service.consumeCredits(1);
      onRunComplete?.(prompt);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusy(false);
    }
  }

  function start() {
    if (mode === "optimizer" && clarifications.length === 0) {
      setClarificationOpen(true);
      return;
    }
    void run(clarifications);
  }

  async function saveResult() {
    if (!result) return;
    await service.saveLibrary({
      title: prompt.trim().split(/\s+/).slice(0, 8).join(" "),
      description: result.optimizedPrompt.slice(0, 120),
      category,
      originalText: prompt,
      optimizedText: result.optimizedPrompt,
      model,
      level,
      score: result.score,
      tags: [category, model, `L${level}`],
    });
    toast({ text: "Saved to your library." });
  }

  async function copyResult() {
    if (!result) return;
    await navigator.clipboard?.writeText(result.optimizedPrompt);
    void api.historyFinalize({
      id: result.runId,
      finalPrompt: result.optimizedPrompt,
      action: "copy",
    });
    toast({ text: "Copied to clipboard." });
  }

  function restore(versionId: string) {
    const next = restorePromptVersion(versions, versionId);
    const latest = next[next.length - 1];
    setVersions(next);
    setStreamed(latest.prompt);
    setResult((current) => current ? { ...current, optimizedPrompt: latest.prompt } : current);
  }

  const resultText = result?.optimizedPrompt || streamed;
  const modelLabel = MODELS.find((candidate) => candidate.id === model)?.label ?? model;

  const sessionPath = activeSession
    ? `${activeProject?.title ?? "No project"} / ${activeSession.title}`
    : null;
  const heading = sessionPath
    ? { eyebrow: activeProject ? "Session" : "No project", title: sessionPath }
    : {
        eyebrow: mode === "generator" ? "Create" : "Improve",
        title: mode === "generator" ? "Craft a model-ready prompt" : "Optimize your existing prompt",
      };
  const description = sessionPath
    ? "Refinements in this session are grounded in its saved context."
    : mode === "generator"
      ? "Start with an idea, choose its purpose, and build a prompt for the model you use."
      : "Paste a prompt you already use. Anvyll can ask three focused questions before rebuilding it.";

  return (
    <StudioPage
      eyebrow={heading.eyebrow}
      title={heading.title}
      description={description}
      compact={Boolean(resultText)}
    >
      <div className={resultText ? "studio-workbench studio-workbench--result" : "studio-workbench"}>
        <StudioCard className="studio-composer">
          <div className="studio-composer__top">
            <label className="studio-category">
              <span>Prompt type</span>
              <select value={category} onChange={(event) => setCategory(event.target.value as PromptCategory)}>
                {PROMPT_CATEGORIES.map((item) => (
                  <option value={item.id} key={item.id}>
                    {item.label} — {item.detail}
                  </option>
                ))}
              </select>
            </label>
            <StudioBadge tone={enabledInstructions.length ? "accent" : "neutral"}>
              {enabledInstructions.length} instruction{enabledInstructions.length === 1 ? "" : "s"}
            </StudioBadge>
          </div>
          <textarea
            className="studio-composer__input"
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            placeholder={
              mode === "generator"
                ? "Describe what you want to create…"
                : "Paste the prompt you want to optimize…"
            }
            readOnly={busy}
          />
          <ModelAndLevel model={model} level={level} onModel={setModel} onLevel={setLevel} />
          <div className="studio-composer__footer">
            <button type="button" className="studio-text-action" disabled title="Attachments connect with hosted accounts">
              Attach
            </button>
            <span className="studio-composer__status">
              {busy ? `Rewriting for ${modelLabel}…` : `${modelLabel} · ${LEVEL_LABELS[level]}`}
            </span>
            <StudioButton variant="primary" disabled={busy || !prompt.trim()} onClick={start}>
              {busy ? "Working…" : mode === "generator" ? "Generate prompt" : "Optimize prompt"}
            </StudioButton>
          </div>
        </StudioCard>

        {!resultText && mode === "generator" && (
          <section className="studio-starters">
            <div className="studio-section-heading">
              <div>
                <span className="studio-eyebrow">Start with a direction</span>
                <h2>Popular workflows</h2>
              </div>
              <span>Choose a card, then make it yours.</span>
            </div>
            <div className="studio-starter-grid">
              {STARTERS.map((starter) => (
                <button
                  type="button"
                  key={starter.title}
                  className="studio-starter"
                  onClick={() => {
                    setPrompt(starter.seed);
                    setCategory(starter.category);
                  }}
                >
                  <StudioBadge>{PROMPT_CATEGORIES.find((item) => item.id === starter.category)?.label}</StudioBadge>
                  <strong>{starter.title}</strong>
                  <p>{starter.detail}</p>
                  <span className="studio-starter__arrow">Open</span>
                </button>
              ))}
            </div>
          </section>
        )}

        {!resultText && mode === "optimizer" && (
          <StudioCard className="studio-optimizer-note">
            <div className="studio-optimizer-note__index">01</div>
            <div>
              <strong>Three questions, only when they help</strong>
              <p>
                The clarification flow makes audience, outcome, and output shape explicit. You can skip it and optimize immediately.
              </p>
            </div>
            <div className="studio-optimizer-note__index">03</div>
          </StudioCard>
        )}

        {(busy || resultText || error) && (
          <section className="studio-result">
            <div className="studio-result__rail">
              <StudioSegmented<ResultTab>
                value={resultTab}
                onChange={setResultTab}
                label="Result details"
                options={[
                  { value: "inputs", label: "Inputs" },
                  { value: "context", label: "Context" },
                  { value: "versions", label: "Versions" },
                  { value: "settings", label: "Settings" },
                ]}
              />
              <StudioCard className="studio-result__details">
                {resultTab === "inputs" && (
                  <div className="studio-detail-stack">
                    <div>
                      <span>Original prompt</span>
                      <p>{prompt}</p>
                    </div>
                    <div>
                      <span>Category</span>
                      <strong>{PROMPT_CATEGORIES.find((item) => item.id === category)?.label}</strong>
                    </div>
                  </div>
                )}
                {resultTab === "context" && (
                  <div className="studio-detail-stack">
                    {clarifications.length === 0 && enabledInstructions.length === 0 ? (
                      <StudioEmpty
                        label="No additional context"
                        detail="This version uses only your prompt and the selected model guide."
                      />
                    ) : (
                      <>
                        {clarifications.filter((question) => question.answer).map((question) => (
                          <div key={question.id}>
                            <span>{question.prompt}</span>
                            <p>{question.answer}</p>
                          </div>
                        ))}
                        {enabledInstructions.map((instruction) => (
                          <div key={instruction.id}>
                            <span>{instruction.title}</span>
                            <p>{instruction.detail}</p>
                          </div>
                        ))}
                      </>
                    )}
                  </div>
                )}
                {resultTab === "versions" && (
                  <div className="studio-version-list">
                    {versions.map((version, index) => (
                      <button type="button" key={version.id} onClick={() => restore(version.id)}>
                        <span className={`studio-version-dot ${index === versions.length - 1 ? "is-current" : ""}`} />
                        <span>
                          <strong>{version.label}</strong>
                          <small>{index === versions.length - 1 ? "Current" : "Restore this version"}</small>
                        </span>
                      </button>
                    ))}
                  </div>
                )}
                {resultTab === "settings" && (
                  <div className="studio-detail-stack">
                    <div><span>Target model</span><strong>{modelLabel}</strong></div>
                    <div><span>Guide level</span><strong>{LEVEL_LABELS[level]}</strong></div>
                    <div><span>Rewrite model</span><strong>GPT-4.1</strong></div>
                    <div><span>Prompt type</span><strong>{category}</strong></div>
                  </div>
                )}
              </StudioCard>
            </div>
            <StudioCard className="studio-result__prompt">
              <div className="studio-result__header">
                <div>
                  <span className="studio-eyebrow">{busy ? "Building" : "Finished prompt"}</span>
                  <h2>{prompt.trim().split(/\s+/).slice(0, 7).join(" ") || "Untitled prompt"}</h2>
                </div>
                {result && (
                  <div className="studio-result__actions">
                    <StudioBadge tone="success">Score {result.score}</StudioBadge>
                    <StudioButton onClick={() => void copyResult()}>Copy</StudioButton>
                    <StudioButton variant="primary" onClick={() => void saveResult()}>Save</StudioButton>
                  </div>
                )}
              </div>
              {error ? (
                <div className="studio-error" role="alert">
                  <strong>Could not finish this prompt</strong>
                  <p>{error}</p>
                  <StudioButton onClick={() => void run(clarifications)}>Try again</StudioButton>
                </div>
              ) : busy && !resultText ? (
                <div className="studio-result__text is-loading">
                  <SkeletonLines lines={6} />
                </div>
              ) : (
                <div className={`studio-result__text ${busy ? "is-loading" : ""}`}>
                  {resultText}
                  {busy && <span className="studio-stream-caret" aria-hidden="true" />}
                </div>
              )}
              {result && result.notes.length > 0 && (
                <div className="studio-change-summary">
                  <strong>What changed</strong>
                  <p>{result.notes.slice(0, 2).join(" ")}</p>
                </div>
              )}
            </StudioCard>
          </section>
        )}

        {result && (
          <section className="studio-followups">
            <div className="studio-section-heading">
              <div>
                <span className="studio-eyebrow">Keep going</span>
                <h2>What’s next?</h2>
              </div>
            </div>
            <div className="studio-followup-grid">
              {FOLLOW_UPS.map((suggestion) => (
                <button
                  type="button"
                  key={suggestion.id}
                  onClick={() => {
                    setPrompt(`${suggestion.seed}${result.optimizedPrompt}`);
                    setResult(null);
                    setStreamed("");
                    setClarifications([]);
                  }}
                >
                  <StudioBadge tone={suggestion.kind === "wild-card" ? "accent" : "neutral"}>
                    {suggestion.kind === "wild-card" ? "Wild card" : "Try next"}
                  </StudioBadge>
                  <strong>{suggestion.title}</strong>
                  <p>{suggestion.description}</p>
                </button>
              ))}
            </div>
          </section>
        )}
      </div>

      {clarificationOpen && (
        <ClarificationFlow
          questions={createClarifications(prompt)}
          onCancel={() => {
            setClarificationOpen(false);
            void run();
          }}
          onComplete={(answers) => {
            setClarificationOpen(false);
            void run(answers);
          }}
        />
      )}
    </StudioPage>
  );
}
