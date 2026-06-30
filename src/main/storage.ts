// Local JSON-file store. Zero native dependencies — no compilation needed.
// System of record for transient local state: settings, library, history,
// optimization cache. Data volumes here are tiny, so a single persisted JSON
// document is reliable and avoids the Electron native-ABI rebuild problem.

import { app } from "electron";
import { join } from "node:path";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import type {
  AppSettings,
  HistoryItem,
  LibraryItem,
  ModelId,
  OptLevel,
  OptimizeResult,
  SubScores,
} from "../shared/types";
import { DEFAULT_SETTINGS } from "../shared/types";
import { buildDiff } from "../engine/diff";
import { adherenceLevel } from "../engine/rubric";

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

interface StoreShape {
  settings: AppSettings | null;
  library: LibraryItem[];
  history: HistoryItem[];
  optCache: Record<string, CachedOptimizeEntry>;
  optCacheOrder: string[];
}

const EMPTY: StoreShape = { settings: null, library: [], history: [], optCache: {}, optCacheOrder: [] };

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
    };
    // Migrate legacy full OptimizeResult entries to slim cache shape.
    for (const [key, entry] of Object.entries(data.optCache)) {
      if ("diff" in entry) {
        const full = entry as OptimizeResult;
        data.optCache[key] = slimCacheEntry(full);
      }
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

// ---------- History ----------
export function listHistory(limit = 100): HistoryItem[] {
  return [...load().history].sort((a, b) => b.createdAt - a.createdAt).slice(0, limit);
}

export function addHistory(r: OptimizeResult, original: string): void {
  const d = load();
  d.history.push({
    id: uuid(),
    originalText: original,
    optimizedText: r.optimizedPrompt,
    model: r.model,
    level: r.level,
    score: r.score,
    source: r.source,
    createdAt: Date.now(),
  });
  d.history.sort((a, b) => b.createdAt - a.createdAt);
  d.history = d.history.slice(0, 500);
  persist();
}

export function clearHistory(): void {
  load().history = [];
  persist();
}

// ---------- Opt cache ----------
import { REWRITE_PIPELINE_VERSION } from "../engine/guideLoader";

export function cacheHash(req: { prompt: string; model: string; level: number; persona?: string }): string {
  return `v${REWRITE_PIPELINE_VERSION}|${req.model}|${req.level}|${req.persona ?? ""}|${req.prompt.trim().toLowerCase()}`;
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
