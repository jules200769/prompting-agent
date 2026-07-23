import { useEffect, useState } from "react";
import {
  LEVEL_LABELS,
  MODELS,
  type AppSettings,
  type HotkeyStatus,
  type ModelId,
  type OptLevel,
  type RunRecord,
  type RunVerdict,
  type WorkbenchSeed,
} from "../../../shared/types";
import { applyThemeToDocument } from "../../../shared/themes";
import { api } from "../../api";
import { HotkeyField } from "../../components/HotkeyField";
import { ThemeGallery } from "../../components/ThemeGallery";
import { useToast } from "../../components/Toast";
import {
  StudioBadge,
  StudioButton,
  StudioCard,
  StudioEmpty,
  StudioPage,
  StudioSegmented,
} from "./StudioPrimitives";

const VERDICT_LABELS: Record<RunVerdict, string> = {
  good: "Good",
  mixed: "Mixed",
  bad: "Needs work",
};

export function StudioHistory({ onOpen }: { onOpen: (seed: WorkbenchSeed) => void }) {
  const [items, setItems] = useState<RunRecord[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "studio" | "overlay">("all");
  const [comment, setComment] = useState("");
  const [verdict, setVerdict] = useState<RunVerdict | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const toast = useToast();

  async function refresh() {
    setItems(await api.historyList());
  }

  useEffect(() => {
    void refresh();
  }, []);

  const filtered = items.filter((item) => filter === "all" || item.surface === filter);

  async function saveComment(id: string) {
    if (!comment.trim() && !verdict) return;
    await api.historyAddComment({
      id,
      text: comment.trim() || VERDICT_LABELS[verdict!],
      verdict: verdict ?? undefined,
    });
    setComment("");
    setVerdict(null);
    await refresh();
    toast({ text: "Run note saved." });
  }

  async function clear() {
    if (!confirmClear) {
      setConfirmClear(true);
      window.setTimeout(() => setConfirmClear(false), 3_000);
      return;
    }
    await api.historyClear();
    setItems([]);
    setConfirmClear(false);
    toast({ text: "Visible history cleared. The analysis ledger remains available." });
  }

  return (
    <StudioPage
      eyebrow="Review"
      title="History"
      description="See what Anvyll changed, reopen useful runs, and record what worked."
      actions={
        <>
          <StudioSegmented<"all" | "studio" | "overlay">
            value={filter}
            onChange={setFilter}
            label="History surface"
            options={[
              { value: "all", label: "All" },
              { value: "studio", label: "Studio" },
              { value: "overlay", label: "Overlay" },
            ]}
          />
          <StudioButton variant={confirmClear ? "danger" : "quiet"} onClick={() => void clear()}>
            {confirmClear ? "Confirm clear" : "Clear"}
          </StudioButton>
        </>
      }
    >
      {filtered.length === 0 ? (
        <StudioCard>
          <StudioEmpty label="No runs in this view" detail="Generate or optimize a prompt and its full run record will appear here." />
        </StudioCard>
      ) : (
        <div className="studio-history-list">
          {filtered.map((item) => {
            const expanded = expandedId === item.id;
            const finalPrompt = item.output.finalPrompt ?? item.output.optimizedPrompt;
            const latestVerdict = item.comments.find((entry) => entry.verdict)?.verdict;
            return (
              <StudioCard key={item.id} className={`studio-history-row ${expanded ? "is-expanded" : ""}`}>
                <button
                  type="button"
                  className="studio-history-row__summary"
                  onClick={() => {
                    setExpandedId(expanded ? null : item.id);
                    setComment("");
                    setVerdict(null);
                  }}
                >
                  <span className="studio-history-row__mark">{expanded ? "−" : "+"}</span>
                  <span className="studio-history-row__copy">
                    <strong>{item.input.prompt.trim().split(/\s+/).slice(0, 10).join(" ")}</strong>
                    <small>
                      {MODELS.find((model) => model.id === item.input.model)?.label} · {LEVEL_LABELS[item.input.level]} · {item.surface}
                    </small>
                  </span>
                  {latestVerdict && <StudioBadge tone={latestVerdict === "good" ? "success" : latestVerdict === "bad" ? "warning" : "neutral"}>{VERDICT_LABELS[latestVerdict]}</StudioBadge>}
                  <span className="studio-history-row__score">{item.output.score}</span>
                  <time>{new Date(item.createdAt).toLocaleDateString()}</time>
                </button>
                {expanded && (
                  <div className="studio-history-row__details">
                    <div className="studio-history-compare">
                      <div><span>Original</span><p>{item.input.prompt}</p></div>
                      <div><span>Final prompt</span><p>{finalPrompt}</p></div>
                    </div>
                    <div className="studio-history-actions">
                      <StudioButton
                        variant="primary"
                        onClick={() => onOpen({
                          originalText: item.input.prompt,
                          optimizedText: finalPrompt,
                          model: item.input.model,
                          level: item.input.level,
                        })}
                      >
                        Open in Optimizer
                      </StudioButton>
                    </div>
                    {item.comments.length > 0 && (
                      <div className="studio-history-comments">
                        {item.comments.map((entry) => (
                          <div key={entry.id}>
                            <span>{entry.verdict ? VERDICT_LABELS[entry.verdict] : "Note"}</span>
                            <p>{entry.text}</p>
                          </div>
                        ))}
                      </div>
                    )}
                    <div className="studio-history-note">
                      <div>
                        {(["good", "mixed", "bad"] as RunVerdict[]).map((value) => (
                          <button type="button" key={value} className={verdict === value ? "is-active" : ""} onClick={() => setVerdict(verdict === value ? null : value)}>
                            {VERDICT_LABELS[value]}
                          </button>
                        ))}
                      </div>
                      <textarea value={comment} onChange={(event) => setComment(event.target.value)} placeholder="What worked or what should change?" />
                      <StudioButton disabled={!comment.trim() && !verdict} onClick={() => void saveComment(item.id)}>Save note</StudioButton>
                    </div>
                  </div>
                )}
              </StudioCard>
            );
          })}
        </div>
      )}
    </StudioPage>
  );
}

export function StudioSettings() {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [hotkeyStatus, setHotkeyStatus] = useState<HotkeyStatus | null>(null);
  const [hasKey, setHasKey] = useState(false);
  const [secure, setSecure] = useState(true);
  const [keyInput, setKeyInput] = useState("");
  const [section, setSection] = useState<"general" | "appearance" | "account">("general");
  const toast = useToast();

  useEffect(() => {
    void Promise.all([
      api.settingsGet(),
      api.hotkeyStatus(),
      api.keysHas("openai"),
      api.keysIsSecure(),
    ]).then(([loaded, status, keyPresent, isSecure]) => {
      setSettings(loaded);
      setHotkeyStatus(status);
      setHasKey(keyPresent);
      setSecure(isSecure);
    });
  }, []);

  if (!settings) {
    return <StudioPage title="Settings"><StudioCard><StudioEmpty label="Loading settings" detail="Reading your local Anvyll configuration…" /></StudioCard></StudioPage>;
  }

  const update = (patch: Partial<AppSettings>) => setSettings({ ...settings, ...patch });

  async function save() {
    const result = await api.settingsSet(settings);
    setSettings(result.settings);
    setHotkeyStatus({ accelerator: result.settings.hotkey, active: result.hotkeyActive });
    toast({
      text: result.ok
        ? "Settings saved."
        : `Settings saved, but the hotkey stayed unchanged: ${result.hotkeyError ?? "registration failed"}`,
    });
  }

  async function saveKey() {
    if (!keyInput.trim()) return;
    await api.keysSet("openai", keyInput.trim());
    setKeyInput("");
    setHasKey(await api.keysHas("openai"));
    toast({ text: "OpenAI key saved securely." });
  }

  return (
    <StudioPage
      eyebrow="Workspace"
      title="Settings"
      description="Control Anvyll’s behavior, appearance, and current local account connection."
      actions={<StudioButton variant="primary" onClick={() => void save()}>Save settings</StudioButton>}
    >
      <div className="studio-settings-layout">
        <StudioSegmented<"general" | "appearance" | "account">
          value={section}
          onChange={setSection}
          label="Settings section"
          options={[
            { value: "general", label: "General" },
            { value: "appearance", label: "Appearance" },
            { value: "account", label: "Account" },
          ]}
        />
        {section === "general" && (
          <StudioCard className="studio-settings-card">
            <div className="studio-settings-section">
              <div>
                <h2>Global hotkey</h2>
                <p>Keep capture and Apply available from any Windows text field.</p>
              </div>
              <HotkeyField
                value={settings.hotkey}
                onChange={(hotkey) => update({ hotkey })}
                status={hotkeyStatus?.accelerator === settings.hotkey ? hotkeyStatus : null}
              />
            </div>
            <div className="studio-settings-divider" />
            <div className="studio-form-grid">
              <label className="studio-field">
                <span>Default target model</span>
                <select value={settings.defaultModel} onChange={(event) => update({ defaultModel: event.target.value as ModelId })}>
                  {MODELS.map((model) => <option key={model.id} value={model.id}>{model.label}</option>)}
                </select>
              </label>
              <label className="studio-field">
                <span>Default guide level</span>
                <select value={settings.defaultLevel} onChange={(event) => update({ defaultLevel: Number(event.target.value) as OptLevel })}>
                  {([1, 2, 3, 4] as OptLevel[]).map((level) => <option key={level} value={level}>{LEVEL_LABELS[level]}</option>)}
                </select>
              </label>
              <label className="studio-field studio-field--wide">
                <span>Default persona</span>
                <input value={settings.defaultPersona} onChange={(event) => update({ defaultPersona: event.target.value })} placeholder="Optional role or perspective" />
              </label>
              <label className="studio-field studio-field--wide">
                <span>Standing notes (all Refines)</span>
                <textarea value={settings.contextMemory} onChange={(event) => update({ contextMemory: event.target.value })} placeholder="Global sticky notes attached to every Refine (separate from session/project memory)" />
              </label>
            </div>
            <div className="studio-settings-toggles">
              <label>
                <input type="checkbox" checked={settings.screenContext} onChange={(event) => update({ screenContext: event.target.checked })} />
                <span><strong>Screen context</strong><small>Use active-app and surrounding-text signals when refining.</small></span>
              </label>
              <label>
                <input type="checkbox" checked={settings.autoSessionMemory} onChange={(event) => update({ autoSessionMemory: event.target.checked })} />
                <span><strong>Session memory</strong><small>After Apply or Copy, refresh the active session&apos;s standing context from recent activity.</small></span>
              </label>
              <label>
                <input type="checkbox" checked={settings.telemetry} onChange={(event) => update({ telemetry: event.target.checked })} />
                <span><strong>Anonymous telemetry</strong><small>Share basic reliability signals without prompt content.</small></span>
              </label>
            </div>
          </StudioCard>
        )}
        {section === "appearance" && (
          <StudioCard className="studio-settings-card">
            <div className="studio-settings-section">
              <div>
                <h2>Forge theme</h2>
                <p>The same visual identity applies to Studio and the hotkey overlay.</p>
              </div>
            </div>
            <ThemeGallery
              value={settings.theme}
              onChange={(theme) => {
                update({ theme });
                applyThemeToDocument(theme);
                api.previewTheme(theme);
              }}
            />
          </StudioCard>
        )}
        {section === "account" && (
          <div className="studio-account-grid">
            <StudioCard className="studio-settings-card">
              <StudioBadge tone="accent">Local workspace</StudioBadge>
              <h2>Account connection</h2>
              <p>Sign-in, cloud sync, and hosted subscriptions connect through the typed Studio service in the public release.</p>
              <StudioButton disabled title="Account service is not connected in this release">Sign in</StudioButton>
            </StudioCard>
            <StudioCard className="studio-settings-card">
              <StudioBadge tone={hasKey ? "success" : "warning"}>{hasKey ? "Key connected" : "Key required"}</StudioBadge>
              <h2>OpenAI API key</h2>
              <p>{secure ? "Stored with Windows Credential Manager." : "Secure OS storage is unavailable; avoid saving a key on this device."}</p>
              <label className="studio-field">
                <span>API key</span>
                <input type="password" value={keyInput} onChange={(event) => setKeyInput(event.target.value)} placeholder={hasKey ? "•••••••• stored" : "sk-…"} />
              </label>
              <div className="studio-inline-actions">
                <StudioButton variant="primary" disabled={!keyInput.trim()} onClick={() => void saveKey()}>Save key</StudioButton>
                {hasKey && <StudioButton variant="quiet" onClick={() => void api.keysDelete("openai").then(() => setHasKey(false))}>Remove</StudioButton>}
              </div>
            </StudioCard>
          </div>
        )}
      </div>
    </StudioPage>
  );
}
