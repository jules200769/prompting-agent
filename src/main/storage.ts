// Local JSON-file store. Zero native dependencies — no compilation needed.
// System of record for transient local state: settings, library, history,
// optimization cache. Data volumes here are tiny, so a single persisted JSON
// document is reliable and avoids the Electron native-ABI rebuild problem.

import { app } from "electron";
import { join } from "node:path";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import type {
  AppSettings,
  HistoryAddCommentRequest,
  HistoryFinalizeRequest,
  HistoryItem,
  LibraryItem,
  ModelId,
  OptLevel,
  OptimizeRequest,
  OptimizeResult,
  RunRecord,
  RunRecordInput,
  RunRecordOutput,
  RunSurface,
  SubScores,
} from "../shared/types";
import { DEFAULT_SETTINGS } from "../shared/types";
import {
  assignProjectColor,
  clampContextText,
  deriveProjectTitle,
  deriveSessionTitle,
  deriveSessionTitleFromPrompt,
  NEW_SESSION_TITLE,
  PROJECT_CONTEXT_MAX_CHARS,
  PROJECTS_MAX,
  SESSIONS_MAX,
  type ProjectContext,
  type SessionContext,
} from "../shared/session";
import { isExcludedContextFileName } from "../shared/contextSignals";
import { nearestPlacement, type DisplayRect, type OverlaySize } from "../shared/overlayPosition";
import { buildDiff } from "../engine/diff";
import { adherenceLevel } from "../engine/rubric";
import { appendRunHistoryJsonl, runHistoryJsonlPath } from "./runHistoryJsonl";

const OPT_CACHE_MAX = 100;

/** Slim cache entry — no diff array (rebuilt on read). */
interface CachedOptimizeEntry {
  optimizedPrompt: string;
  score: number;
  baselineScore: number;
  subscores: SubScores;
  baselineSubscores: SubScores;
  personaSuggestion: string;
  notes: string[];
  model: ModelId;
  level: OptLevel;
  source: "llm" | "local";
  packVersion: string;
}

/** File name seen in a code-editor window title (context-layer file memory). */
interface FileMemoryEntry {
  name: string;
  lastSeen: number;
  hits: number;
}

interface StoreShape {
  settings: AppSettings | null;
  library: LibraryItem[];
  history: RunRecord[];
  optCache: Record<string, CachedOptimizeEntry>;
  optCacheOrder: string[];
  fileMemory: FileMemoryEntry[];
  sessions: SessionContext[];
  activeSessionId: string | null;
  /** Named project library (picker + import); active standing text is projectContext. */
  projects: ProjectContext[];
  activeProjectId: string | null;
  /** Standing project context (Import-context modal, Project scope). */
  projectContext: string;
  /** @deprecated Migrated to settings.overlayPlacement; cleared on first launch after upgrade. */
  overlayPosition?: { x: number; y: number } | null;
}

const EMPTY: StoreShape = {
  settings: null,
  library: [],
  history: [],
  optCache: {},
  optCacheOrder: [],
  fileMemory: [],
  sessions: [],
  activeSessionId: null,
  projects: [],
  activeProjectId: null,
  projectContext: "",
};

let data: StoreShape | null = null;

function filePath(): string {
  return join(app.getPath("userData"), "promptforge.store.json");
}

function load(): StoreShape {
  if (data) return data;
  const p = filePath();
  if (!existsSync(p)) {
    data = structuredClone(EMPTY);
    return data;
  }
  try {
    const raw = readFileSync(p, "utf8");
    const parsed = JSON.parse(raw) as Partial<StoreShape> & { optCache?: Record<string, OptimizeResult | CachedOptimizeEntry> };
    data = {
      ...structuredClone(EMPTY),
      ...parsed,
      optCacheOrder: parsed.optCacheOrder ?? Object.keys(parsed.optCache ?? {}),
      projects: Array.isArray(parsed.projects) ? parsed.projects : [],
      activeProjectId: parsed.activeProjectId ?? null,
      sessions: Array.isArray(parsed.sessions)
        ? parsed.sessions.map((s) => ({
            ...s,
            projectId: s.projectId ?? null,
          }))
        : [],
      history: migrateHistoryArray(parsed.history),
    };
    // Backfill accent colors for projects created before color existed.
    {
      const assigned: string[] = [];
      let migrated = false;
      for (const project of data.projects) {
        if (!project.color) {
          project.color = assignProjectColor(assigned);
          migrated = true;
        }
        assigned.push(project.color);
      }
      if (migrated) {
        const dir = app.getPath("userData");
        if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
        writeFileSync(filePath(), JSON.stringify(data, null, 2), "utf8");
      }
    }
    // Migrate legacy full OptimizeResult entries to slim cache shape.
    for (const [key, entry] of Object.entries(data.optCache)) {
      if ("diff" in entry) {
        const full = entry as OptimizeResult;
        data.optCache[key] = slimCacheEntry(full);
      }
    }
    // One-time: legacy single projectContext string → library entry + active id.
    const legacyProject = (data.projectContext ?? "").trim();
    if (legacyProject && data.projects.length === 0) {
      const now = Date.now();
      const entry: ProjectContext = {
        id: uuid(),
        title: deriveProjectTitle(legacyProject, now),
        contextText: clampContextText(legacyProject, PROJECT_CONTEXT_MAX_CHARS),
        color: assignProjectColor([]),
        createdAt: now,
        updatedAt: now,
      };
      data.projects.push(entry);
      data.activeProjectId = entry.id;
      // Persist migration so the next cold load does not mint a duplicate id.
      const dir = app.getPath("userData");
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
      writeFileSync(filePath(), JSON.stringify(data, null, 2), "utf8");
    }
  } catch {
    data = structuredClone(EMPTY);
  }
  return data;
}

function persist(): void {
  const dir = app.getPath("userData");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(filePath(), JSON.stringify(load(), null, 2), "utf8");
}

export function initDb(): void {
  load();
}

function emptySubScores(): SubScores {
  return {
    clarity: 0,
    context: 0,
    structure: 0,
    format: 0,
    examples: 0,
    persona: 0,
    verifiability: 0,
  };
}

function isLegacyHistoryItem(item: unknown): item is HistoryItem {
  return (
    typeof item === "object" &&
    item !== null &&
    "originalText" in item &&
    !("schemaVersion" in item)
  );
}

function migrateLegacyHistoryItem(old: HistoryItem): RunRecord {
  return {
    id: old.id,
    schemaVersion: 1,
    createdAt: old.createdAt,
    surface: "studio",
    input: {
      prompt: old.originalText,
      model: old.model,
      level: old.level,
    },
    output: {
      optimizedPrompt: old.optimizedText,
      score: old.score,
      baselineScore: 0,
      subscores: emptySubScores(),
      baselineSubscores: emptySubScores(),
      adherenceLevel: old.level,
      notes: [],
      source: old.source,
      packVersion: "",
    },
    comments: [],
  };
}

function migrateHistoryArray(raw: unknown): RunRecord[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((item) =>
    isLegacyHistoryItem(item) ? migrateLegacyHistoryItem(item) : (item as RunRecord),
  );
}

function buildRunInput(req: OptimizeRequest): RunRecordInput {
  return {
    prompt: req.prompt,
    model: req.model,
    level: req.level,
    persona: req.persona,
    context: req.context,
    promptType: req.promptType,
    terminalContext: req.terminalContext,
    writingType: req.writingType,
    sessionContext: req.sessionContext,
    projectContext: req.projectContext,
    captureContext: req.captureContext,
  };
}

function buildRunOutput(result: OptimizeResult): RunRecordOutput {
  return {
    optimizedPrompt: result.optimizedPrompt,
    score: result.score,
    baselineScore: result.baselineScore,
    subscores: result.subscores,
    baselineSubscores: result.baselineSubscores,
    adherenceLevel: result.adherenceLevel,
    notes: result.notes,
    source: result.source,
    packVersion: result.packVersion,
  };
}

let lastRunId: string | null = null;

export function getLastRunId(): string | null {
  return lastRunId;
}

export function getRunHistoryAnalysisPath(): string {
  return runHistoryJsonlPath();
}

function uuid(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function slimCacheEntry(result: OptimizeResult): CachedOptimizeEntry {
  return {
    optimizedPrompt: result.optimizedPrompt,
    score: result.score,
    baselineScore: result.baselineScore,
    subscores: result.subscores,
    baselineSubscores: result.baselineSubscores,
    personaSuggestion: result.personaSuggestion,
    notes: result.notes,
    model: result.model,
    level: result.level,
    source: result.source,
    packVersion: result.packVersion,
  };
}

function touchCacheKey(d: StoreShape, hash: string): void {
  d.optCacheOrder = d.optCacheOrder.filter((k) => k !== hash);
  d.optCacheOrder.push(hash);
}

function evictOldestCache(d: StoreShape): void {
  while (d.optCacheOrder.length > OPT_CACHE_MAX) {
    const oldest = d.optCacheOrder.shift();
    if (oldest) delete d.optCache[oldest];
  }
}

// ---------- Settings ----------
export function getSettings(): AppSettings {
  const s = load().settings;
  if (!s) return { ...DEFAULT_SETTINGS };
  return { ...DEFAULT_SETTINGS, ...s };
}

export function setSettings(s: AppSettings): void {
  load().settings = s;
  persist();
}

/** One-time migration from legacy dragged x/y to snap placement. */
export function migrateLegacyOverlayPlacement(workArea: DisplayRect, size: OverlaySize): void {
  const d = load();
  const legacy = d.overlayPosition;
  if (!legacy || !Number.isFinite(legacy.x) || !Number.isFinite(legacy.y)) {
    if (legacy != null) {
      d.overlayPosition = null;
      persist();
    }
    return;
  }
  const placement = nearestPlacement(legacy, size, workArea);
  const current = d.settings ?? {};
  if (!("overlayPlacement" in current)) {
    d.settings = { ...DEFAULT_SETTINGS, ...current, overlayPlacement: placement };
  }
  d.overlayPosition = null;
  persist();
}

// ---------- Library ----------
export function listLibrary(): LibraryItem[] {
  return [...load().library].sort((a, b) => b.updatedAt - a.updatedAt);
}

export function saveLibrary(input: {
  title: string;
  originalText: string;
  optimizedText: string;
  model: ModelId;
  level: OptLevel;
  score: number;
  tags: string[];
}): LibraryItem {
  const id = uuid();
  const now = Date.now();
  const item: LibraryItem = { id, ...input, createdAt: now, updatedAt: now };
  load().library.push(item);
  persist();
  return item;
}

export function deleteLibrary(id: string): void {
  const d = load();
  d.library = d.library.filter((i) => i.id !== id);
  persist();
}

// ---------- History / run ledger ----------
export function listHistory(limit = 100): RunRecord[] {
  return [...load().history].sort((a, b) => b.createdAt - a.createdAt).slice(0, limit);
}

function findRunRecord(d: StoreShape, id?: string): RunRecord | null {
  if (id) return d.history.find((r) => r.id === id) ?? null;
  if (lastRunId) {
    const byLast = d.history.find((r) => r.id === lastRunId);
    if (byLast) return byLast;
  }
  return d.history.length > 0
    ? [...d.history].sort((a, b) => b.createdAt - a.createdAt)[0]
    : null;
}

export function addRunRecord(
  result: OptimizeResult,
  req: OptimizeRequest,
  surface: RunSurface,
  fromCache = false,
): string {
  const d = load();
  const id = uuid();
  const record: RunRecord = {
    id,
    schemaVersion: 1,
    createdAt: Date.now(),
    surface,
    fromCache: fromCache || undefined,
    input: buildRunInput(req),
    output: buildRunOutput(result),
    comments: [],
  };
  d.history.unshift(record);
  d.history.sort((a, b) => b.createdAt - a.createdAt);
  d.history = d.history.slice(0, 500);
  lastRunId = id;
  persist();
  appendRunHistoryJsonl("created", record);
  return id;
}

/** @deprecated Use addRunRecord. Kept for callers during transition. */
export function addHistory(r: OptimizeResult, original: string): void {
  addRunRecord(r, { prompt: original, model: r.model, level: r.level }, "studio");
}

export function addRunComment(payload: HistoryAddCommentRequest): RunRecord | null {
  const text = payload.text.trim();
  if (!text && !payload.verdict) return null;
  const d = load();
  const record = d.history.find((r) => r.id === payload.id);
  if (!record) return null;
  const comment = {
    id: uuid(),
    text,
    createdAt: Date.now(),
    verdict: payload.verdict,
  };
  record.comments.unshift(comment);
  persist();
  appendRunHistoryJsonl("commented", record);
  return record;
}

export function finalizeRun(payload: HistoryFinalizeRequest): RunRecord | null {
  const d = load();
  const record = findRunRecord(d, payload.id);
  if (!record) return null;
  const finalPrompt = payload.finalPrompt.trim();
  if (!finalPrompt) return null;
  const edited = finalPrompt !== record.output.optimizedPrompt;
  record.output.finalPrompt = finalPrompt;
  record.actions = {
    ...record.actions,
    edited: edited || record.actions?.edited,
    ...(payload.action === "apply" ? { applied: true } : { copied: true }),
  };
  persist();
  appendRunHistoryJsonl("finalized", record);
  return record;
}

export function clearHistory(): void {
  load().history = [];
  persist();
}

// ---------- Sessions ----------
export function listSessions(): SessionContext[] {
  return [...load().sessions].sort((a, b) => b.updatedAt - a.updatedAt);
}

/** Active session, or null. Heals a dangling activeSessionId (deleted session). */
export function getActiveSession(): SessionContext | null {
  const d = load();
  if (!d.activeSessionId) return null;
  const session = d.sessions.find((s) => s.id === d.activeSessionId);
  if (!session) {
    d.activeSessionId = null;
    persist();
    return null;
  }
  return session;
}

/** Creates an empty session, makes it active, and evicts beyond the LRU cap. */
export function createSession(projectId: string | null = null): SessionContext {
  const d = load();
  const now = Date.now();
  const linked =
    projectId && d.projects.some((p) => p.id === projectId) ? projectId : null;
  const session: SessionContext = {
    id: uuid(),
    title: NEW_SESSION_TITLE,
    contextText: "",
    projectId: linked,
    createdAt: now,
    updatedAt: now,
  };
  d.sessions.push(session);
  d.activeSessionId = session.id;
  while (d.sessions.length > SESSIONS_MAX) {
    const evictable = d.sessions
      .filter((s) => s.id !== d.activeSessionId)
      .sort((a, b) => a.updatedAt - b.updatedAt)[0];
    if (!evictable) break;
    d.sessions = d.sessions.filter((s) => s.id !== evictable.id);
  }
  persist();
  return session;
}

/** Stores imported context on a session (clamped) and re-derives its title. */
export function setSessionContext(id: string, text: string): SessionContext | null {
  const d = load();
  const session = d.sessions.find((s) => s.id === id);
  if (!session) return null;
  session.contextText = clampContextText(text);
  session.title = deriveSessionTitle(session.contextText, session.createdAt);
  session.updatedAt = Date.now();
  persist();
  return session;
}

/** Titles a placeholder session from the first Refine draft; no-op if already named. */
export function maybeTitleSessionFromPrompt(id: string, prompt: string): SessionContext | null {
  const d = load();
  const session = d.sessions.find((s) => s.id === id);
  if (!session || session.title !== NEW_SESSION_TITLE) return session ?? null;
  const title = deriveSessionTitleFromPrompt(prompt);
  if (title === NEW_SESSION_TITLE) return session;
  session.title = title;
  session.updatedAt = Date.now();
  persist();
  return session;
}

/** Clears a session's context but keeps the session resumable (title/timeline intact). */
export function clearSessionContext(id: string): SessionContext | null {
  const d = load();
  const session = d.sessions.find((s) => s.id === id);
  if (!session) return null;
  session.contextText = "";
  session.updatedAt = Date.now();
  persist();
  return session;
}

export function deleteSession(id: string): void {
  const d = load();
  d.sessions = d.sessions.filter((s) => s.id !== id);
  if (d.activeSessionId === id) d.activeSessionId = null;
  persist();
}

export function setActiveSession(id: string | null): SessionContext | null {
  const d = load();
  if (id === null) {
    d.activeSessionId = null;
    persist();
    return null;
  }
  const session = d.sessions.find((s) => s.id === id);
  if (!session) return null;
  d.activeSessionId = id;
  session.updatedAt = Date.now();
  persist();
  return session;
}

// ---------- Project context (library + active standing string) ----------
export function getProjectContext(): string {
  return load().projectContext;
}

export function setProjectContext(text: string): void {
  load().projectContext = clampContextText(text, PROJECT_CONTEXT_MAX_CHARS);
  persist();
}

export function listProjects(): ProjectContext[] {
  return [...load().projects].sort((a, b) => b.updatedAt - a.updatedAt);
}

/** Active project id, or null. Heals a dangling activeProjectId (deleted entry). */
export function getActiveProjectId(): string | null {
  const d = load();
  if (!d.activeProjectId) return null;
  const project = d.projects.find((p) => p.id === d.activeProjectId);
  if (!project) {
    d.activeProjectId = null;
    persist();
    return null;
  }
  return d.activeProjectId;
}

/**
 * Upsert the active library entry from imported text. Creates when there is no
 * resolvable active entry; always syncs projectContext to the clamped text.
 * Evicts beyond PROJECTS_MAX oldest-by-updatedAt, never the active entry.
 */
export function upsertActiveProject(text: string): ProjectContext {
  const d = load();
  const clamped = clampContextText(text, PROJECT_CONTEXT_MAX_CHARS);
  const now = Date.now();
  let project = d.activeProjectId
    ? d.projects.find((p) => p.id === d.activeProjectId)
    : undefined;

  if (project) {
    project.contextText = clamped;
    project.title = deriveProjectTitle(project.contextText, project.createdAt);
    project.updatedAt = now;
    if (!project.color) project.color = assignProjectColor(d.projects.map((p) => p.color).filter(Boolean));
  } else {
    project = {
      id: uuid(),
      title: deriveProjectTitle(clamped, now),
      contextText: clamped,
      color: assignProjectColor(d.projects.map((p) => p.color).filter(Boolean)),
      createdAt: now,
      updatedAt: now,
    };
    d.projects.push(project);
    d.activeProjectId = project.id;
  }

  d.projectContext = clamped;
  while (d.projects.length > PROJECTS_MAX) {
    const evictable = d.projects
      .filter((p) => p.id !== d.activeProjectId)
      .sort((a, b) => a.updatedAt - b.updatedAt)[0];
    if (!evictable) break;
    d.projects = d.projects.filter((p) => p.id !== evictable.id);
    removeSessionsForProject(d, evictable.id);
  }
  persist();
  return project;
}

/**
 * Write imported text onto a specific library project by id, without touching
 * the active project pointer (used by the panel's per-project "memory" editor).
 * Clamps the text, re-derives the title only when it is still the dated default,
 * bumps updatedAt, and keeps projectContext in sync only if that id is active.
 */
export function setProjectContextById(id: string, text: string): ProjectContext | null {
  const d = load();
  const project = d.projects.find((p) => p.id === id);
  if (!project) return null;
  project.contextText = clampContextText(text, PROJECT_CONTEXT_MAX_CHARS);
  const defaultTitle = `Project ${new Date(project.createdAt).toLocaleDateString()}`;
  if (!project.title.trim() || project.title === defaultTitle) {
    project.title = deriveProjectTitle(project.contextText, project.createdAt);
  }
  project.updatedAt = Date.now();
  if (d.activeProjectId === id) {
    d.projectContext = project.contextText;
  }
  persist();
  return project;
}

/** Activate a library project (or clear). Syncs projectContext to the entry text. */
export function setActiveProject(id: string | null): ProjectContext | null {
  const d = load();
  if (id === null) {
    d.activeProjectId = null;
    d.projectContext = "";
    persist();
    return null;
  }
  const project = d.projects.find((p) => p.id === id);
  if (!project) return null;
  d.activeProjectId = id;
  project.updatedAt = Date.now();
  d.projectContext = project.contextText;
  persist();
  return project;
}

/** Drop sessions linked to a project; clear activeSessionId if it was removed. */
function removeSessionsForProject(d: StoreShape, projectId: string): void {
  const removed = new Set(
    d.sessions.filter((s) => s.projectId === projectId).map((s) => s.id),
  );
  if (removed.size === 0) return;
  d.sessions = d.sessions.filter((s) => s.projectId !== projectId);
  if (d.activeSessionId && removed.has(d.activeSessionId)) {
    d.activeSessionId = null;
  }
}

export function deleteProject(id: string): void {
  const d = load();
  d.projects = d.projects.filter((p) => p.id !== id);
  removeSessionsForProject(d, id);
  if (d.activeProjectId === id) {
    d.activeProjectId = null;
    d.projectContext = "";
  }
  persist();
}

// ---------- File memory (context layer) ----------
const FILE_MEMORY_MAX = 200;

/** Record editor file names (case-insensitive dedupe, LRU by lastSeen, cap 200). */
export function recordFileMemory(names: string[]): void {
  if (names.length === 0) return;
  const d = load();
  const now = Date.now();
  for (const name of names) {
    const trimmed = name.trim();
    if (!trimmed || isExcludedContextFileName(trimmed)) continue;
    const existing = d.fileMemory.find((e) => e.name.toLowerCase() === trimmed.toLowerCase());
    if (existing) {
      existing.lastSeen = now;
      existing.hits += 1;
      existing.name = trimmed;
    } else {
      d.fileMemory.push({ name: trimmed, lastSeen: now, hits: 1 });
    }
  }
  if (d.fileMemory.length > FILE_MEMORY_MAX) {
    d.fileMemory.sort((a, b) => b.lastSeen - a.lastSeen);
    d.fileMemory = d.fileMemory.slice(0, FILE_MEMORY_MAX);
  }
  persist();
}

/** Most recently seen file names, newest first. */
export function listFileMemory(limit = 50): string[] {
  return [...load().fileMemory]
    .sort((a, b) => b.lastSeen - a.lastSeen)
    .filter((e) => !isExcludedContextFileName(e.name))
    .slice(0, limit)
    .map((e) => e.name);
}

// ---------- Opt cache ----------
import { REWRITE_PIPELINE_VERSION } from "../engine/guideLoader";
import { buildCacheKey, type CacheKeyRequest } from "../shared/cacheKey";

export function cacheHash(req: CacheKeyRequest): string {
  return buildCacheKey(REWRITE_PIPELINE_VERSION, req);
}

export function hydrateCacheResult(cached: CachedOptimizeEntry, originalPrompt: string): OptimizeResult {
  return {
    ...cached,
    diff: buildDiff(originalPrompt, cached.optimizedPrompt),
    adherenceLevel: adherenceLevel(cached.subscores),
  };
}

export function getCache(hash: string, originalPrompt?: string): OptimizeResult | null {
  const d = load();
  const cached = d.optCache[hash];
  if (!cached) return null;
  touchCacheKey(d, hash);
  if (originalPrompt == null) {
    return { ...cached, diff: [], adherenceLevel: adherenceLevel(cached.subscores) };
  }
  return hydrateCacheResult(cached, originalPrompt);
}

export function setCache(hash: string, result: OptimizeResult): void {
  const d = load();
  d.optCache[hash] = slimCacheEntry(result);
  touchCacheKey(d, hash);
  evictOldestCache(d);
  persist();
}
