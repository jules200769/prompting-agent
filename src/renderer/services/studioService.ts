import type { LibraryItem, ModelId, OptLevel } from "../../shared/types";
import {
  STUDIO_PLANS,
  type Account,
  type BillingInterval,
  type Instruction,
  type LibraryEntry,
  type PlanId,
  type PromptCategory,
  type Subscription,
  type UsageSummary,
} from "../../shared/studio";

const STORE_KEY = "anvyll.studio.product.v1";

interface StudioMetadata {
  subscription: Subscription;
  usage: UsageSummary;
  instructions: Instruction[];
  library: Record<
    string,
    {
      description: string;
      category: PromptCategory;
      pinned: boolean;
    }
  >;
}

export interface StudioLibraryInput {
  title: string;
  description: string;
  category: PromptCategory;
  originalText: string;
  optimizedText: string;
  model: ModelId;
  level: OptLevel;
  score: number;
  tags: string[];
}

export interface StudioService {
  getAccount(): Promise<Account>;
  getSubscription(): Promise<Subscription>;
  getUsage(): Promise<UsageSummary>;
  selectPlan(planId: PlanId, interval: BillingInterval): Promise<Subscription>;
  consumeCredits(amount: number): Promise<UsageSummary>;
  listInstructions(): Promise<Instruction[]>;
  saveInstruction(input: Pick<Instruction, "title" | "detail" | "enabledByDefault"> & { id?: string }): Promise<Instruction>;
  deleteInstruction(id: string): Promise<void>;
  listLibrary(): Promise<LibraryEntry[]>;
  saveLibrary(input: StudioLibraryInput): Promise<LibraryEntry>;
  replaceLibrary(id: string, input: StudioLibraryInput): Promise<LibraryEntry>;
  setLibraryPinned(id: string, pinned: boolean): Promise<void>;
  deleteLibrary(id: string): Promise<void>;
  listCommunityLibrary(): Promise<LibraryEntry[]>;
}

interface StudioServiceDeps {
  storage: Pick<Storage, "getItem" | "setItem">;
  listLibrary: () => Promise<LibraryItem[]>;
  saveLibrary: (input: Omit<LibraryItem, "id" | "createdAt" | "updatedAt">) => Promise<LibraryItem>;
  deleteLibrary: (id: string) => Promise<unknown>;
  now?: () => number;
}

function defaultMetadata(now: number): StudioMetadata {
  const month = 30 * 24 * 60 * 60 * 1_000;
  return {
    subscription: {
      planId: "pro",
      interval: "monthly",
      status: "trialing",
      renewsAt: now + month,
    },
    usage: {
      used: 184,
      limit: 3_000,
      periodStartedAt: now,
      periodEndsAt: now + month,
    },
    instructions: [],
    library: {},
  };
}

function readMetadata(storage: StudioServiceDeps["storage"], now: number): StudioMetadata {
  try {
    const raw = storage.getItem(STORE_KEY);
    if (!raw) return defaultMetadata(now);
    const parsed = JSON.parse(raw) as Partial<StudioMetadata>;
    const defaults = defaultMetadata(now);
    return {
      ...defaults,
      ...parsed,
      subscription: { ...defaults.subscription, ...parsed.subscription },
      usage: { ...defaults.usage, ...parsed.usage },
      instructions: Array.isArray(parsed.instructions) ? parsed.instructions : [],
      library: parsed.library ?? {},
    };
  } catch {
    return defaultMetadata(now);
  }
}

function inferCategory(item: LibraryItem): PromptCategory {
  const haystack = `${item.title} ${item.tags.join(" ")}`.toLowerCase();
  if (/code|typescript|debug|api/.test(haystack)) return "code";
  if (/research|analysis|source/.test(haystack)) return "research";
  if (/email|copy|write|content/.test(haystack)) return "writing";
  if (/plan|roadmap|strategy/.test(haystack)) return "planning";
  return "standard";
}

function enrichLibraryItem(item: LibraryItem, metadata?: StudioMetadata["library"][string]): LibraryEntry {
  return {
    ...item,
    description: metadata?.description || item.optimizedText.slice(0, 120),
    category: metadata?.category || inferCategory(item),
    pinned: metadata?.pinned ?? false,
    origin: "personal",
  };
}

const COMMUNITY_LIBRARY: LibraryEntry[] = [
  {
    id: "community-landing-page",
    title: "Landing page copy",
    description: "Build a benefit-led landing page with clear calls to action.",
    originalText: "Create landing page copy.",
    optimizedText: "Create a benefit-led landing page with clear sections and calls to action.",
    model: "gpt-5",
    level: 2,
    score: 0,
    tags: ["marketing", "starter-template"],
    category: "writing",
    pinned: false,
    origin: "community",
    createdAt: 0,
    updatedAt: 0,
  },
  {
    id: "community-code-review",
    title: "Code review checklist",
    description: "Review a change for correctness, maintainability, and risk.",
    originalText: "Review this code.",
    optimizedText: "Review this change for correctness, maintainability, and risk.",
    model: "claude-opus-4.8",
    level: 3,
    score: 0,
    tags: ["coding", "starter-template"],
    category: "code",
    pinned: false,
    origin: "community",
    createdAt: 0,
    updatedAt: 0,
  },
  {
    id: "community-research-brief",
    title: "Research summary",
    description: "Summarize findings, evidence, limitations, and open questions.",
    originalText: "Summarize this research.",
    optimizedText: "Summarize the findings, evidence, limitations, and open questions.",
    model: "gemini-3",
    level: 3,
    score: 0,
    tags: ["research", "starter-template"],
    category: "research",
    pinned: false,
    origin: "community",
    createdAt: 0,
    updatedAt: 0,
  },
];

export function createStudioService(deps: StudioServiceDeps): StudioService {
  const now = deps.now ?? Date.now;
  let metadata = readMetadata(deps.storage, now());
  const persist = () => deps.storage.setItem(STORE_KEY, JSON.stringify(metadata));

  return {
    async getAccount() {
      return {
        id: "local-workspace",
        displayName: "Local workspace",
        status: "local",
      };
    },
    async getSubscription() {
      return { ...metadata.subscription };
    },
    async getUsage() {
      return { ...metadata.usage };
    },
    async selectPlan(planId, interval) {
      const plan = STUDIO_PLANS.find((candidate) => candidate.id === planId)!;
      metadata = {
        ...metadata,
        subscription: { ...metadata.subscription, planId, interval, status: "trialing" },
        usage: { ...metadata.usage, limit: plan.credits },
      };
      persist();
      return { ...metadata.subscription };
    },
    async consumeCredits(amount) {
      metadata = {
        ...metadata,
        usage: { ...metadata.usage, used: Math.max(0, metadata.usage.used + amount) },
      };
      persist();
      return { ...metadata.usage };
    },
    async listInstructions() {
      return [...metadata.instructions].sort(
        (a, b) => Number(b.enabledByDefault) - Number(a.enabledByDefault) || b.updatedAt - a.updatedAt,
      );
    },
    async saveInstruction(input) {
      const timestamp = now();
      const existing = input.id
        ? metadata.instructions.find((instruction) => instruction.id === input.id)
        : undefined;
      const instruction: Instruction = {
        id: existing?.id ?? `instruction-${timestamp}`,
        title: input.title.trim(),
        detail: input.detail.trim(),
        enabledByDefault: input.enabledByDefault,
        createdAt: existing?.createdAt ?? timestamp,
        updatedAt: timestamp,
      };
      metadata = {
        ...metadata,
        instructions: [
          instruction,
          ...metadata.instructions.filter((candidate) => candidate.id !== instruction.id),
        ],
      };
      persist();
      return instruction;
    },
    async deleteInstruction(id) {
      metadata = {
        ...metadata,
        instructions: metadata.instructions.filter((instruction) => instruction.id !== id),
      };
      persist();
    },
    async listLibrary() {
      const items = await deps.listLibrary();
      return items.map((item) => enrichLibraryItem(item, metadata.library[item.id]));
    },
    async saveLibrary(input) {
      const saved = await deps.saveLibrary({
        title: input.title,
        originalText: input.originalText,
        optimizedText: input.optimizedText,
        model: input.model,
        level: input.level,
        score: input.score,
        tags: input.tags,
      });
      metadata = {
        ...metadata,
        library: {
          ...metadata.library,
          [saved.id]: {
            description: input.description,
            category: input.category,
            pinned: false,
          },
        },
      };
      persist();
      return enrichLibraryItem(saved, metadata.library[saved.id]);
    },
    async replaceLibrary(id, input) {
      const saved = await deps.saveLibrary({
        title: input.title,
        originalText: input.originalText,
        optimizedText: input.optimizedText,
        model: input.model,
        level: input.level,
        score: input.score,
        tags: input.tags,
      });
      const previous = metadata.library[id];
      metadata = {
        ...metadata,
        library: {
          ...metadata.library,
          [saved.id]: {
            description: input.description,
            category: input.category,
            pinned: previous?.pinned ?? false,
          },
        },
      };
      await deps.deleteLibrary(id);
      const library = { ...metadata.library };
      delete library[id];
      metadata = { ...metadata, library };
      persist();
      return enrichLibraryItem(saved, metadata.library[saved.id]);
    },
    async setLibraryPinned(id, pinned) {
      metadata = {
        ...metadata,
        library: {
          ...metadata.library,
          [id]: {
            description: metadata.library[id]?.description ?? "",
            category: metadata.library[id]?.category ?? "standard",
            pinned,
          },
        },
      };
      persist();
    },
    async deleteLibrary(id) {
      await deps.deleteLibrary(id);
      const library = { ...metadata.library };
      delete library[id];
      metadata = { ...metadata, library };
      persist();
    },
    async listCommunityLibrary() {
      return COMMUNITY_LIBRARY.map((entry) => ({ ...entry }));
    },
  };
}
