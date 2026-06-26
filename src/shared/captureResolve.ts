// Pure capture result resolution — testable without Electron/OS deps.

import type { CaptureMode } from "./types";

export interface CaptureResolveInput {
  snapshotText: string;
  afterCopy: string;
  afterSelectAllCopy: string;
}

export interface CaptureResolveResult {
  text: string;
  mode: CaptureMode;
}

/** Decide captured text and mode from clipboard reads at each capture step. */
export function resolveCaptureResult(input: CaptureResolveInput): CaptureResolveResult {
  const { snapshotText, afterCopy, afterSelectAllCopy } = input;

  if (afterCopy && afterCopy !== snapshotText) {
    return { text: afterCopy, mode: "field" };
  }
  if (afterSelectAllCopy && afterSelectAllCopy !== snapshotText) {
    return { text: afterSelectAllCopy, mode: "field" };
  }
  return { text: "", mode: "empty" };
}
