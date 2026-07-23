import { useEffect, useMemo, useState } from "react";
import { MODELS, type ModelId, type WorkbenchSeed } from "../../../shared/types";
import {
  STUDIO_PLANS,
  usagePercent,
  yearlyMonthlyEquivalent,
  type BillingInterval,
  type Instruction,
  type Subscription,
  type UsageSummary,
} from "../../../shared/studio";
import type { StudioService } from "../../services/studioService";
import { useToast } from "../../components/Toast";
import {
  StudioBadge,
  StudioButton,
  StudioCard,
  StudioEmpty,
  StudioModal,
  StudioPage,
  StudioSegmented,
} from "./StudioPrimitives";

const INSTRUCTION_SUGGESTIONS = [
  "Answer first",
  "Ask before assuming",
  "Show your reasoning",
  "Verify important claims",
  "Use bullets over paragraphs",
  "Skip the flattery",
  "Keep a clear executive tone",
  "Use my company context",
];

function InstructionModal({
  instruction,
  onClose,
  onSave,
}: {
  instruction?: Instruction;
  onClose: () => void;
  onSave: (value: Pick<Instruction, "title" | "detail" | "enabledByDefault"> & { id?: string }) => void;
}) {
  const [title, setTitle] = useState(instruction?.title ?? "");
  const [detail, setDetail] = useState(instruction?.detail ?? "");
  const [enabled, setEnabled] = useState(instruction?.enabledByDefault ?? true);
  const appendSuggestion = (suggestion: string) => {
    setDetail((value) => value ? `${value.trim()}\n${suggestion}.` : `${suggestion}.`);
  };
  return (
    <StudioModal
      title={instruction ? "Edit instruction" : "New instruction"}
      onClose={onClose}
      width="medium"
      footer={
        <>
          <StudioButton variant="quiet" onClick={onClose}>Cancel</StudioButton>
          <div className="studio-modal__footer-spacer" />
          <StudioButton
            variant="primary"
            disabled={!title.trim() || !detail.trim()}
            onClick={() => onSave({ id: instruction?.id, title, detail, enabledByDefault: enabled })}
          >
            {instruction ? "Save changes" : "Add instruction"}
          </StudioButton>
        </>
      }
    >
      <div className="studio-form-stack">
        <label className="studio-field">
          <span>Title</span>
          <input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Instruction title" />
        </label>
        <label className="studio-field">
          <span>Detail</span>
          <textarea
            className="studio-field__large"
            value={detail}
            onChange={(event) => setDetail(event.target.value)}
            placeholder="What should the model always keep in mind?"
          />
        </label>
        <div>
          <span className="studio-field-label">Quick suggestions</span>
          <div className="studio-chip-cloud">
            {INSTRUCTION_SUGGESTIONS.map((suggestion) => (
              <button type="button" key={suggestion} onClick={() => appendSuggestion(suggestion)}>
                {suggestion}
              </button>
            ))}
          </div>
        </div>
        <label className="studio-switch-row">
          <button
            type="button"
            className={`studio-switch ${enabled ? "is-on" : ""}`}
            role="switch"
            aria-checked={enabled}
            onClick={() => setEnabled((value) => !value)}
          >
            <span />
          </button>
          <span>
            <strong>Enabled by default</strong>
            <small>Apply this instruction to new Generator and Optimizer runs.</small>
          </span>
        </label>
      </div>
    </StudioModal>
  );
}

export function StudioInstructions({
  service,
  instructions,
  onChange,
}: {
  service: StudioService;
  instructions: Instruction[];
  onChange: (instructions: Instruction[]) => void;
}) {
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<Instruction | null | "new">(null);
  const toast = useToast();
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return instructions.filter((instruction) =>
      !needle || `${instruction.title} ${instruction.detail}`.toLowerCase().includes(needle),
    );
  }, [instructions, query]);

  async function refresh() {
    onChange(await service.listInstructions());
  }

  async function save(input: Pick<Instruction, "title" | "detail" | "enabledByDefault"> & { id?: string }) {
    await service.saveInstruction(input);
    setEditing(null);
    await refresh();
    toast({ text: input.id ? "Instruction updated." : "Instruction added." });
  }

  async function toggle(instruction: Instruction) {
    await service.saveInstruction({ ...instruction, enabledByDefault: !instruction.enabledByDefault });
    await refresh();
  }

  async function remove(instruction: Instruction) {
    await service.deleteInstruction(instruction.id);
    await refresh();
    toast({ text: `Deleted “${instruction.title}”.` });
  }

  return (
    <StudioPage
      eyebrow="Standing directives"
      title="Instructions"
      description="Save voice, context, and constraints once, then apply them whenever you create a prompt."
      actions={<StudioButton variant="primary" onClick={() => setEditing("new")}>New instruction</StudioButton>}
    >
      <StudioCard className="studio-instruction-search">
        <label className="studio-search">
          <span className="studio-search__mark" aria-hidden="true" />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search instructions" />
        </label>
        <span>{instructions.filter((instruction) => instruction.enabledByDefault).length} active by default</span>
      </StudioCard>
      <div className="studio-instruction-list">
        {filtered.length === 0 ? (
          <StudioCard>
            <StudioEmpty
              label={instructions.length ? "No matching instructions" : "Create your first instruction"}
              detail="Keep recurring requirements out of every prompt by saving them here."
              action={!instructions.length ? <StudioButton variant="primary" onClick={() => setEditing("new")}>New instruction</StudioButton> : undefined}
            />
          </StudioCard>
        ) : filtered.map((instruction) => (
          <StudioCard key={instruction.id} className="studio-instruction-row">
            <button
              type="button"
              className={`studio-switch ${instruction.enabledByDefault ? "is-on" : ""}`}
              role="switch"
              aria-checked={instruction.enabledByDefault}
              onClick={() => void toggle(instruction)}
            >
              <span />
            </button>
            <div className="studio-instruction-row__copy">
              <h2>{instruction.title}</h2>
              <p>{instruction.detail}</p>
            </div>
            <div className="studio-instruction-row__actions">
              <StudioButton variant="quiet" onClick={() => setEditing(instruction)}>Edit</StudioButton>
              <StudioButton variant="quiet" onClick={() => void remove(instruction)}>Delete</StudioButton>
            </div>
          </StudioCard>
        ))}
      </div>
      {editing && (
        <InstructionModal
          instruction={editing === "new" ? undefined : editing}
          onClose={() => setEditing(null)}
          onSave={(input) => void save(input)}
        />
      )}
    </StudioPage>
  );
}

interface TesterMessage {
  id: string;
  role: "prompt" | "status";
  text: string;
}

export function StudioTester({ seed }: { seed: WorkbenchSeed | null }) {
  const [prompt, setPrompt] = useState(seed?.optimizedText ?? seed?.originalText ?? "");
  const [targetModel, setTargetModel] = useState<ModelId>(seed?.model ?? "claude-opus-4.8");
  const [assistantModel, setAssistantModel] = useState<ModelId>("gpt-5");
  const [messages, setMessages] = useState<TesterMessage[]>([]);
  const [showIntegration, setShowIntegration] = useState(false);

  useEffect(() => {
    if (!seed) return;
    setPrompt(seed.optimizedText ?? seed.originalText);
    setTargetModel(seed.model);
  }, [seed]);

  function run() {
    if (!prompt.trim()) return;
    const timestamp = Date.now();
    setMessages((current) => [
      ...current,
      { id: `prompt-${timestamp}`, role: "prompt", text: prompt },
      {
        id: `status-${timestamp}`,
        role: "status",
        text: "Hosted assistant testing is ready for the account service connection. Your prompt is preserved locally.",
      },
    ]);
    setShowIntegration(true);
  }

  return (
    <StudioPage
      eyebrow="Test"
      title="Prompt Tester"
      description="Keep prompt structure and execution separate: target one model, then test with another."
      actions={<StudioBadge tone="warning">Hosted connection pending</StudioBadge>}
    >
      <div className="studio-tester-layout">
        <StudioCard className="studio-tester-composer">
          <div className="studio-form-grid">
            <label className="studio-field">
              <span>Target model</span>
              <select value={targetModel} onChange={(event) => setTargetModel(event.target.value as ModelId)}>
                {MODELS.map((model) => <option key={model.id} value={model.id}>{model.label}</option>)}
              </select>
              <small>The methodology used to structure the prompt.</small>
            </label>
            <label className="studio-field">
              <span>Assistant model</span>
              <select value={assistantModel} onChange={(event) => setAssistantModel(event.target.value as ModelId)}>
                {MODELS.map((model) => <option key={model.id} value={model.id}>{model.label}</option>)}
              </select>
              <small>The model that will execute it after hosted accounts connect.</small>
            </label>
            <label className="studio-field studio-field--wide">
              <span>Prompt</span>
              <textarea className="studio-field__xl" value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder="Open a prompt from the Library or paste one here…" />
            </label>
          </div>
          <div className="studio-tester-composer__footer">
            <span>{MODELS.find((model) => model.id === targetModel)?.label} → {MODELS.find((model) => model.id === assistantModel)?.label}</span>
            <StudioButton variant="primary" disabled={!prompt.trim()} onClick={run}>Run prompt</StudioButton>
          </div>
        </StudioCard>
        <StudioCard className="studio-tester-thread">
          <div className="studio-tester-thread__header">
            <div>
              <span className="studio-eyebrow">Test conversation</span>
              <h2>Current run</h2>
            </div>
            {messages.length > 0 && <StudioButton variant="quiet" onClick={() => setMessages([])}>Clear</StudioButton>}
          </div>
          {messages.length === 0 ? (
            <StudioEmpty label="No test run yet" detail="The prompt and its assistant response will stay together here." />
          ) : (
            <div className="studio-tester-messages">
              {messages.map((message) => (
                <div key={message.id} className={`studio-tester-message studio-tester-message--${message.role}`}>
                  <span>{message.role === "prompt" ? "Prompt" : "Integration status"}</span>
                  <p>{message.text}</p>
                </div>
              ))}
            </div>
          )}
        </StudioCard>
      </div>
      {showIntegration && (
        <StudioModal
          title="Hosted testing is integration-ready"
          onClose={() => setShowIntegration(false)}
          width="small"
          footer={<><div className="studio-modal__footer-spacer" /><StudioButton variant="primary" onClick={() => setShowIntegration(false)}>Done</StudioButton></>}
        >
          <p className="studio-modal-copy">
            This Studio release preserves the test prompt and conversation locally. Actual assistant execution connects when the account and hosted-credit service ships.
          </p>
        </StudioModal>
      )}
    </StudioPage>
  );
}

export function StudioPlans({ service }: { service: StudioService }) {
  const [interval, setInterval] = useState<BillingInterval>("monthly");
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [usage, setUsage] = useState<UsageSummary | null>(null);
  const toast = useToast();

  async function refresh() {
    const [nextSubscription, nextUsage] = await Promise.all([service.getSubscription(), service.getUsage()]);
    setSubscription(nextSubscription);
    setUsage(nextUsage);
    setInterval(nextSubscription.interval);
  }

  useEffect(() => {
    void refresh();
  }, []);

  async function selectPlan(planId: Subscription["planId"]) {
    await service.selectPlan(planId, interval);
    await refresh();
    toast({ text: "Plan preview updated locally. Billing connection is not active yet." });
  }

  return (
    <StudioPage
      eyebrow="Account"
      title="Plans and usage"
      description="Preview the public pricing states now; connect checkout and hosted credits later."
      actions={
        <StudioSegmented<BillingInterval>
          value={interval}
          onChange={setInterval}
          label="Billing interval"
          options={[
            { value: "monthly", label: "Monthly" },
            { value: "yearly", label: "Yearly · save 20%" },
          ]}
        />
      }
    >
      {usage && subscription && (
        <StudioCard className="studio-usage-overview">
          <div>
            <StudioBadge tone="accent">{subscription.status === "trialing" ? "Local preview" : subscription.status}</StudioBadge>
            <h2>{STUDIO_PLANS.find((plan) => plan.id === subscription.planId)?.name} usage</h2>
            <p>{usage.limit === null ? `${usage.used.toLocaleString()} prompts used · no limit` : `${usage.used.toLocaleString()} of ${usage.limit.toLocaleString()} credits used`}</p>
          </div>
          <div className="studio-usage-overview__meter">
            <span><strong>{usage.limit === null ? "Unlimited" : `${usagePercent(usage)}%`}</strong> this period</span>
            <div><i style={{ width: usage.limit === null ? "18%" : `${usagePercent(usage)}%` }} /></div>
          </div>
        </StudioCard>
      )}
      <div className="studio-plan-grid">
        {STUDIO_PLANS.map((plan) => {
          const selected = subscription?.planId === plan.id;
          const price = interval === "yearly" ? yearlyMonthlyEquivalent(plan) : plan.monthlyPrice;
          return (
            <StudioCard key={plan.id} className={`studio-plan-card ${plan.popular ? "studio-plan-card--popular" : ""}`}>
              <div className="studio-plan-card__top">
                <div>
                  <h2>{plan.name}</h2>
                  <p>{plan.description}</p>
                </div>
                {plan.popular && <StudioBadge tone="accent">Most popular</StudioBadge>}
              </div>
              <div className="studio-plan-price">
                <strong>${Number.isInteger(price) ? price : price.toFixed(2)}</strong>
                <span>/month{interval === "yearly" ? ", billed yearly" : ""}</span>
              </div>
              <ul>
                <li>{plan.credits === null ? "Unlimited credits" : `${plan.credits.toLocaleString()} credits/month`}</li>
                <li>Generator and Optimizer</li>
                <li>Prompt Tester</li>
                <li>Library and Instructions</li>
                <li>{plan.prioritySupport ? "Priority support" : "Email support"}</li>
              </ul>
              <StudioButton
                variant={plan.popular ? "primary" : "secondary"}
                disabled={selected && subscription?.interval === interval}
                onClick={() => void selectPlan(plan.id)}
                className="studio-plan-card__button"
              >
                {selected && subscription?.interval === interval ? "Current preview" : `Choose ${plan.name}`}
              </StudioButton>
            </StudioCard>
          );
        })}
      </div>
      <StudioCard className="studio-public-links">
        <div>
          <span className="studio-eyebrow">Public distribution</span>
          <h2>Support and legal surfaces</h2>
          <p>These integration-ready actions are visible before their final public URLs are connected.</p>
        </div>
        <div>
          {["Documentation", "Support", "Privacy", "Terms"].map((label) => (
            <StudioButton key={label} variant="quiet" onClick={() => toast({ text: `${label} URL is ready to connect for release.` })}>
              {label}
            </StudioButton>
          ))}
        </div>
      </StudioCard>
    </StudioPage>
  );
}
