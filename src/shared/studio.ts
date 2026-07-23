import type { LibraryItem, ModelId, OptLevel } from "./types";

export type StudioRoute =
  | "generator"
  | "optimizer"
  | "tester"
  | "library"
  | "instructions"
  | "history"
  | "plans"
  | "settings";

export const STUDIO_ROUTES: StudioRoute[] = [
  "generator",
  "optimizer",
  "tester",
  "library",
  "instructions",
  "history",
  "plans",
  "settings",
];

export type PromptCategory =
  | "standard"
  | "research"
  | "writing"
  | "planning"
  | "agent"
  | "image"
  | "video"
  | "code"
  | "automation";

export type BillingInterval = "monthly" | "yearly";
export type PlanId = "starter" | "pro" | "unlimited";

export interface Account {
  id: string;
  displayName: string;
  email?: string;
  status: "local" | "signed-in";
}

export interface Subscription {
  planId: PlanId;
  interval: BillingInterval;
  status: "active" | "trialing" | "past-due" | "canceled";
  renewsAt?: number;
}

export interface UsageSummary {
  used: number;
  limit: number | null;
  periodStartedAt: number;
  periodEndsAt: number;
}

export interface PromptDraft {
  id: string;
  title: string;
  text: string;
  category: PromptCategory;
  model: ModelId;
  level: OptLevel;
  createdAt: number;
  updatedAt: number;
}

export interface PromptVersion {
  id: string;
  label: string;
  prompt: string;
  source: "generated" | "optimized" | "clarified" | "restored";
  createdAt: number;
}

export interface Instruction {
  id: string;
  title: string;
  detail: string;
  enabledByDefault: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface LibraryEntry extends LibraryItem {
  description: string;
  category: PromptCategory;
  pinned: boolean;
  origin: "personal" | "community";
}

export interface ClarificationQuestion {
  id: string;
  prompt: string;
  helper: string;
  options: string[];
  answer?: string;
}

export interface FollowUpSuggestion {
  id: string;
  kind: "try-next" | "wild-card";
  title: string;
  description: string;
  seed: string;
}

export interface PlanDefinition {
  id: PlanId;
  name: string;
  monthlyPrice: number;
  credits: number | null;
  description: string;
  popular?: boolean;
  prioritySupport?: boolean;
}

export const STUDIO_PLANS: PlanDefinition[] = [
  {
    id: "starter",
    name: "Starter",
    monthlyPrice: 9,
    credits: 1_000,
    description: "For casual prompt work",
  },
  {
    id: "pro",
    name: "Pro",
    monthlyPrice: 19,
    credits: 3_000,
    description: "For a focused daily workflow",
    popular: true,
  },
  {
    id: "unlimited",
    name: "Unlimited",
    monthlyPrice: 49,
    credits: null,
    description: "For power users and teams",
    prioritySupport: true,
  },
];

export const PROMPT_CATEGORIES: Array<{
  id: PromptCategory;
  label: string;
  detail: string;
}> = [
  { id: "standard", label: "Standard", detail: "Good for everyday asks" },
  { id: "research", label: "Research", detail: "Dig into a topic" },
  { id: "writing", label: "Writing", detail: "Posts, emails, and copy" },
  { id: "planning", label: "Planning", detail: "Think through a project" },
  { id: "agent", label: "Agent", detail: "Assistants and personas" },
  { id: "image", label: "Image", detail: "Describe a still" },
  { id: "video", label: "Video", detail: "Describe a scene" },
  { id: "code", label: "Code", detail: "Write or fix code" },
  { id: "automation", label: "Automation", detail: "Design repeatable flows" },
];

export function usagePercent(summary: UsageSummary): number {
  if (summary.limit === null || summary.limit <= 0) return 0;
  return Math.min(100, Math.max(0, Math.round((summary.used / summary.limit) * 100)));
}

export function yearlyMonthlyEquivalent(plan: PlanDefinition): number {
  return Math.round(plan.monthlyPrice * 0.8 * 100) / 100;
}

export function filterLibraryEntries(
  entries: LibraryEntry[],
  query: string,
  category: PromptCategory | "all",
  model: ModelId | "all",
): LibraryEntry[] {
  const needle = query.trim().toLowerCase();
  return [...entries]
    .filter((entry) => category === "all" || entry.category === category)
    .filter((entry) => model === "all" || entry.model === model)
    .filter((entry) => {
      if (!needle) return true;
      return [
        entry.title,
        entry.description,
        entry.originalText,
        entry.optimizedText,
        entry.tags.join(" "),
      ]
        .join(" ")
        .toLowerCase()
        .includes(needle);
    })
    .sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.updatedAt - a.updatedAt);
}

export function restorePromptVersion(
  versions: PromptVersion[],
  versionId: string,
  now = Date.now(),
): PromptVersion[] {
  const selected = versions.find((version) => version.id === versionId);
  if (!selected) return versions;
  return [
    ...versions,
    {
      id: `restored-${now}`,
      label: `Restored: ${selected.label}`,
      prompt: selected.prompt,
      source: "restored",
      createdAt: now,
    },
  ];
}

export function clarificationContext(questions: ClarificationQuestion[]): string {
  return questions
    .filter((question) => question.answer?.trim())
    .map((question) => `${question.prompt}\n${question.answer!.trim()}`)
    .join("\n\n");
}
