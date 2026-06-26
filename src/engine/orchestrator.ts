// Optimization orchestrator: picks LLM (BYOK) vs local fallback, loads model
// guides, streams plain refined prompt, scores locally via rubric.

import type { ModelId, OptLevel, OptimizeRequest, OptimizeResult } from "../shared/types";
import { LEVEL_LABELS, LEVEL_TEMPERATURE } from "../shared/types";
import { rewriteProviderForTarget } from "../shared/rewrite";
import { getPack } from "./packs";
import { analyze, emptySubscores } from "./rubric";
import { buildDiff } from "./diff";
import { optimizeLocal } from "./localOptimizer";
import { stripResponseArtifacts } from "./cleanRewrite";
import { optimizeStream } from "./providers";
import { keyStore } from "../main/keyStore";

export interface OptimizeContext {
  request: OptimizeRequest;
  onText: (chunk: string) => void;
}

export async function optimize(ctx: OptimizeContext): Promise<OptimizeResult> {
  const { request } = ctx;
  const baseline = analyze(request.prompt);
  const pack = getPack(request.model);
  const levelLabel = LEVEL_LABELS[request.level];
  const temperature = LEVEL_TEMPERATURE[request.level];

  const apiKey = await keyStore.get(rewriteProviderForTarget(request.model));

  if (!apiKey) {
    const local = optimizeLocal({
      prompt: request.prompt,
      model: request.model,
      level: request.level,
      persona: request.persona,
    });
    ctx.onText(local.optimizedPrompt);
    return local;
  }

  let raw = "";
  try {
    const res = await optimizeStream(
      {
        prompt: request.prompt,
        model: request.model,
        level: request.level,
        persona: request.persona,
        context: request.context,
        apiKey,
      },
      { onText: (c) => { raw += c; } },
    );
    raw = res.text;
  } catch (err: unknown) {
    const local = optimizeLocal({
      prompt: request.prompt,
      model: request.model,
      level: request.level,
      persona: request.persona,
    });
    const msg = err instanceof Error ? err.message : String(err);
    ctx.onText(local.optimizedPrompt);
    return { ...local, notes: [`Provider error: ${msg}`, ...local.notes] };
  }

  const optimizedPrompt = stripResponseArtifacts(raw);
  const post = analyze(optimizedPrompt);
  const diff = buildDiff(request.prompt, optimizedPrompt);

  ctx.onText(optimizedPrompt);

  const notes = [
    `Applied ${pack.label} prompting guide (L${request.level} ${levelLabel}, temp ${temperature}).`,
    "Local rubric score — refined prompt follows model-specific guide.",
  ];

  return {
    optimizedPrompt,
    score: post.score,
    baselineScore: baseline.score,
    subscores: post.subscores,
    baselineSubscores: baseline.subscores,
    diff,
    personaSuggestion: "",
    notes,
    model: request.model,
    level: request.level,
    source: "llm",
    packVersion: pack.version,
  };
}

export { analyze, emptySubscores };
export type { ModelId, OptLevel };
