// Append-only NDJSON ledger for offline model analysis.

import { app } from "electron";
import { appendFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import type { RunHistoryEventType, RunHistoryJsonlLine, RunRecord } from "../shared/types";

const FILE_NAME = "run-history.jsonl";

export function runHistoryJsonlPath(): string {
  return join(app.getPath("userData"), FILE_NAME);
}

export function appendRunHistoryJsonl(event: RunHistoryEventType, run: RunRecord): void {
  const line: RunHistoryJsonlLine = { event, at: Date.now(), run };
  const dir = app.getPath("userData");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  appendFileSync(runHistoryJsonlPath(), `${JSON.stringify(line)}\n`, "utf8");
}
