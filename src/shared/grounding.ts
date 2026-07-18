// Computes which context layers grounded an optimize request, for the overlay's
// "Grounded by" chip row. Pure and unit-testable — no Electron/Node deps.

import type { CaptureContext, OptimizeGrounding } from "./types";

/** Editor kind → display label for the destination chip. */
const EDITOR_LABELS: Record<NonNullable<NonNullable<CaptureContext["app"]>["editorKind"]>, string> = {
  cursor: "Cursor",
  vscode: "VS Code",
  windsurf: "Windsurf",
};

/** Strip a trailing ".exe" and capitalize the first letter of a process name. */
function labelFromProcessName(processName: string): string {
  const base = processName.replace(/\.exe$/i, "").trim();
  if (!base) return "";
  return base.charAt(0).toUpperCase() + base.slice(1);
}

/** Basename of a path, splitting on both forward and back slashes. */
function basename(path: string): string {
  const parts = path.split(/[/\\]/);
  return parts[parts.length - 1] ?? "";
}

/** Destination app label + optional active-file detail, or undefined when no app signal. */
function computeDestination(capture?: CaptureContext): OptimizeGrounding["destination"] {
  const app = capture?.app;
  let label = "";
  if (app?.editorKind) {
    label = EDITOR_LABELS[app.editorKind];
  } else if (app?.site) {
    label = app.site;
  } else if (app?.processName) {
    label = labelFromProcessName(app.processName);
  }
  if (!label) return undefined;

  const activeFile = capture?.files?.activeFile?.trim();
  const detail = activeFile ? basename(activeFile) : undefined;
  return detail ? { app: label, detail } : { app: label };
}

/**
 * Which context layers were attached to a refine. `sessionOn`/`projectOn` mirror
 * optimizeHandler's trimmed sessionText/projectText — a session that exists with
 * empty context yields chip off.
 */
export function computeGrounding(
  sessionOn: boolean,
  projectOn: boolean,
  capture?: CaptureContext,
): OptimizeGrounding {
  return {
    session: sessionOn,
    project: projectOn,
    destination: computeDestination(capture),
  };
}
