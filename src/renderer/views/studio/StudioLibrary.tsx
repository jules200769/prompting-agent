import { useEffect, useMemo, useState } from "react";
import { MODELS, type ModelId, type WorkbenchSeed } from "../../../shared/types";
import {
  PROMPT_CATEGORIES,
  filterLibraryEntries,
  type LibraryEntry,
  type PromptCategory,
  type StudioRoute,
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

function EditPromptModal({
  entry,
  onClose,
  onSave,
}: {
  entry: LibraryEntry;
  onClose: () => void;
  onSave: (entry: LibraryEntry) => void;
}) {
  const [title, setTitle] = useState(entry.title);
  const [description, setDescription] = useState(entry.description);
  const [prompt, setPrompt] = useState(entry.optimizedText);
  const [category, setCategory] = useState(entry.category);
  return (
    <StudioModal
      title="Edit saved prompt"
      onClose={onClose}
      width="large"
      footer={
        <>
          <StudioButton variant="quiet" onClick={onClose}>Cancel</StudioButton>
          <div className="studio-modal__footer-spacer" />
          <StudioButton
            variant="primary"
            disabled={!title.trim() || !prompt.trim()}
            onClick={() => onSave({ ...entry, title: title.trim(), description: description.trim(), optimizedText: prompt, category })}
          >
            Save changes
          </StudioButton>
        </>
      }
    >
      <div className="studio-form-grid">
        <label className="studio-field">
          <span>Title</span>
          <input value={title} onChange={(event) => setTitle(event.target.value)} />
        </label>
        <label className="studio-field">
          <span>Category</span>
          <select value={category} onChange={(event) => setCategory(event.target.value as PromptCategory)}>
            {PROMPT_CATEGORIES.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
          </select>
        </label>
        <label className="studio-field studio-field--wide">
          <span>Description</span>
          <input value={description} onChange={(event) => setDescription(event.target.value)} />
        </label>
        <label className="studio-field studio-field--wide">
          <span>Prompt</span>
          <textarea className="studio-field__large" value={prompt} onChange={(event) => setPrompt(event.target.value)} />
        </label>
      </div>
    </StudioModal>
  );
}

export function StudioLibrary({
  service,
  onOpen,
}: {
  service: StudioService;
  onOpen: (route: Extract<StudioRoute, "generator" | "tester">, seed: WorkbenchSeed) => void;
}) {
  const [scope, setScope] = useState<"personal" | "community">("personal");
  const [personal, setPersonal] = useState<LibraryEntry[]>([]);
  const [community, setCommunity] = useState<LibraryEntry[]>([]);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<PromptCategory | "all">("all");
  const [model, setModel] = useState<ModelId | "all">("all");
  const [editing, setEditing] = useState<LibraryEntry | null>(null);
  const toast = useToast();

  async function refresh() {
    const [local, shared] = await Promise.all([service.listLibrary(), service.listCommunityLibrary()]);
    setPersonal(local);
    setCommunity(shared);
  }

  useEffect(() => {
    void refresh();
  }, []);

  const source = scope === "personal" ? personal : community;
  const filtered = useMemo(
    () => filterLibraryEntries(source, query, category, model),
    [source, query, category, model],
  );

  async function togglePin(entry: LibraryEntry) {
    if (entry.origin !== "personal") return;
    await service.setLibraryPinned(entry.id, !entry.pinned);
    await refresh();
  }

  async function deleteEntry(entry: LibraryEntry) {
    await service.deleteLibrary(entry.id);
    await refresh();
    toast({
      text: `Deleted “${entry.title}”`,
      actionLabel: "Undo",
      durationMs: 5_000,
      onAction: () => {
        void service.saveLibrary({
          title: entry.title,
          description: entry.description,
          category: entry.category,
          originalText: entry.originalText,
          optimizedText: entry.optimizedText,
          model: entry.model,
          level: entry.level,
          score: entry.score,
          tags: entry.tags,
        }).then(refresh);
      },
    });
  }

  async function saveEdit(entry: LibraryEntry) {
    await service.replaceLibrary(entry.id, {
      title: entry.title,
      description: entry.description,
      category: entry.category,
      originalText: entry.originalText,
      optimizedText: entry.optimizedText,
      model: entry.model,
      level: entry.level,
      score: entry.score,
      tags: entry.tags,
    });
    setEditing(null);
    await refresh();
    toast({ text: "Prompt updated." });
  }

  function openEntry(entry: LibraryEntry, route: "generator" | "tester") {
    onOpen(route, {
      originalText: entry.originalText,
      optimizedText: entry.optimizedText,
      model: entry.model,
      level: entry.level,
    });
  }

  return (
    <StudioPage
      eyebrow="Reuse"
      title="Prompt library"
      description="Find, pin, edit, and run your strongest prompts without rebuilding them."
      actions={
        <StudioSegmented<"personal" | "community">
          value={scope}
          onChange={setScope}
          label="Library scope"
          options={[
            { value: "personal", label: "My prompts" },
            { value: "community", label: "Community" },
          ]}
        />
      }
    >
      <StudioCard className="studio-library-toolbar">
        <label className="studio-search">
          <span className="studio-search__mark" aria-hidden="true" />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search title or content" />
        </label>
        <label>
          <span className="sr-only">Category</span>
          <select value={category} onChange={(event) => setCategory(event.target.value as PromptCategory | "all")}>
            <option value="all">All categories</option>
            {PROMPT_CATEGORIES.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
          </select>
        </label>
        <label>
          <span className="sr-only">Model</span>
          <select value={model} onChange={(event) => setModel(event.target.value as ModelId | "all")}>
            <option value="all">All models</option>
            {MODELS.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
          </select>
        </label>
        <span className="studio-library-toolbar__count">{filtered.length} prompt{filtered.length === 1 ? "" : "s"}</span>
      </StudioCard>

      {filtered.length === 0 ? (
        <StudioCard>
          <StudioEmpty
            label={scope === "personal" ? "Your library is ready" : "No matching community prompts"}
            detail={
              scope === "personal"
                ? "Save a generated or optimized prompt and it will appear here."
                : "Try a broader search or clear one of the filters."
            }
          />
        </StudioCard>
      ) : (
        <div className="studio-library-grid">
          {filtered.map((entry) => (
            <StudioCard key={entry.id} className="studio-library-card" interactive>
              <div className="studio-library-card__top">
                <StudioBadge tone={entry.origin === "community" ? "accent" : "neutral"}>
                  {PROMPT_CATEGORIES.find((item) => item.id === entry.category)?.label}
                </StudioBadge>
                {entry.origin === "personal" && (
                  <button
                    type="button"
                    className={`studio-pin ${entry.pinned ? "is-pinned" : ""}`}
                    onClick={() => void togglePin(entry)}
                    aria-label={entry.pinned ? "Unpin prompt" : "Pin prompt"}
                  >
                    {entry.pinned ? "Pinned" : "Pin"}
                  </button>
                )}
              </div>
              <div className="studio-library-card__copy">
                <h2>{entry.title}</h2>
                <p>{entry.description}</p>
              </div>
              <div className="studio-library-card__meta">
                <span>{MODELS.find((item) => item.id === entry.model)?.label}</span>
                {entry.score > 0 && <span>Score {entry.score}</span>}
              </div>
              <div className="studio-library-card__actions">
                <StudioButton variant="primary" onClick={() => openEntry(entry, "generator")}>
                  Open
                </StudioButton>
                <StudioButton onClick={() => openEntry(entry, "tester")}>Run</StudioButton>
                {entry.origin === "personal" && (
                  <>
                    <StudioButton variant="quiet" onClick={() => setEditing(entry)}>Edit</StudioButton>
                    <StudioButton variant="quiet" onClick={() => void deleteEntry(entry)}>Delete</StudioButton>
                  </>
                )}
              </div>
            </StudioCard>
          ))}
        </div>
      )}

      {editing && <EditPromptModal entry={editing} onClose={() => setEditing(null)} onSave={(entry) => void saveEdit(entry)} />}
    </StudioPage>
  );
}
