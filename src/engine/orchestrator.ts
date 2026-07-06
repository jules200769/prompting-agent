// Optimization orchestrator: BYOK rewrite via OpenAI, model guides, local rubric scoring.

import type { ModelId, OptLevel, OptimizeRequest, OptimizeResult } from "../shared/types";
import { LEVEL_LABELS } from "../shared/types";
import { rewriteProviderForTarget } from "../shared/rewrite";
import { getPack } from "./packs";
import { analyze, adherenceLevel, emptySubscores } from "./rubric";
import { buildDiff } from "./diff";
import { stripResponseArtifacts } from "./cleanRewrite";
import { toTerminalSingleLine, stripTerminalStreamChunk } from "../shared/terminalOutput";
import { optimizeStream } from "./providers";
import { keyStore } from "../main/keyStore";

function rewriteError(err: unknown): Error {
  if (err instanceof Error) return err;
  return new Error(String(err));
}

export interface OptimizeContext {
  request: OptimizeRequest;
  onText: (chunk: string) => void;
}

export async function optimize(ctx: OptimizeContext): Promise<OptimizeResult> {
  const { request } = ctx;
  const baseline = analyze(request.prompt);
  const pack = getPack(request.model);
  const levelLabel = LEVEL_LABELS[request.level];

  const apiKey = await keyStore.get(rewriteProviderForTarget(request.model));

  if (!apiKey) {
    throw new Error("OpenAI API key not configured. Add your key in Settings.");
  }

  let raw = "";
  const terminal = Boolean(request.terminalContext);
  try {
    const res = await optimizeStream(
      {
        prompt: request.prompt,
        model: request.model,
        level: request.level,
        persona: request.persona,
        context: request.context,
        terminalContext: request.terminalContext,
        apiKey,
      },
      {
        onText: (chunk) => {
          raw += chunk;
          ctx.onText(terminal ? stripTerminalStreamChunk(chunk) : chunk);
        },
      },
    );
    raw = res.text;
  } catch (err: unknown) {
    throw rewriteError(err);
  }

  let optimizedPrompt = stripResponseArtifacts(raw);
  if (terminal) {
    optimizedPrompt = toTerminalSingleLine(optimizedPrompt);
  }
  if (!optimizedPrompt.trim()) {
    throw new Error("Rewrite API returned empty output.");
  }
  const post = analyze(optimizedPrompt);
  const measuredAdherence = adherenceLevel(post.subscores);
  const adherenceLabel = LEVEL_LABELS[measuredAdherence];
  const diff = buildDiff(request.prompt, optimizedPrompt);

  const notes = [
    `Applied ${pack.label} prompting guide (L${request.level} ${levelLabel} target).`,
    `Guide-structuur: ${adherenceLabel} (L${measuredAdherence}).`,
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
    adherenceLevel: measuredAdherence,
    source: "llm",
    packVersion: pack.version,
  };
}

export { analyze, emptySubscores };
export type { ModelId, OptLevel };
