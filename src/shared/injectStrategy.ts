import { isTerminalCaptureContext } from "./terminalDetect";
import type { TerminalBounds } from "./terminalCapture";

/** Host classification for Apply/inject strategy routing. */
export type HostKind = "native" | "chromium" | "richEditor" | "terminal";

const CHROMIUM_TOP_CLASS_RE = /Chrome_WidgetWin/i;
const RICH_EDITOR_CLASS_RE =
  /aislash|monaco|ProseMirror|contenteditable|CodeMirror|ace_editor|inputarea/i;

export function isRichEditorElement(className: string, controlType: string): boolean {
  if (RICH_EDITOR_CLASS_RE.test(className)) return true;
  return controlType === "ControlType.Document";
}

export function classifyHostKind(opts: {
  topClassName?: string | null;
  elementClassName?: string | null;
  controlType?: string | null;
}): HostKind {
  const top = opts.topClassName ?? "";
  const elClass = opts.elementClassName ?? "";
  const controlType = opts.controlType ?? "";

  if (isRichEditorElement(elClass, controlType)) return "richEditor";
  if (CHROMIUM_TOP_CLASS_RE.test(top)) return "chromium";
  return "native";
}

/** Resolve inject host kind from capture snapshot (terminal vs field controls). */
export function classifyInjectHostKind(opts: {
  topClassName?: string | null;
  processName?: string | null;
  focusedIsTerminalPane?: boolean;
  elementClassName?: string | null;
  controlType?: string | null;
}): HostKind {
  if (
    isTerminalCaptureContext(
      opts.topClassName ?? undefined,
      opts.processName ?? undefined,
      opts.focusedIsTerminalPane,
    )
  ) {
    return "terminal";
  }
  return classifyHostKind({
    topClassName: opts.topClassName,
    elementClassName: opts.elementClassName,
    controlType: opts.controlType,
  });
}

/** Whether conhost uses Ctrl+C (not Ctrl+Shift+C) for copy — same flag for inject line-select. */
export function terminalUsesConhostCopy(className: string | undefined): boolean {
  return (className ?? "").trim() === "ConsoleWindowClass";
}

/** Inject target fields needed to build the win-inject.ps1 meta payload. */
export interface InjectMetaSource {
  uia?: object | null;
  hostKind: HostKind;
  topClassName?: string;
  processName?: string;
  terminalUseConhostCopy?: boolean;
  terminalBounds?: TerminalBounds;
}

/** Meta JSON handed to win-inject.ps1 (terminal targets carry frozen bounds as UIA-less bounds). */
export function buildInjectMetaPayload(target: InjectMetaSource): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    ...(target.uia ?? {}),
    hostKind: target.hostKind,
    topClassName: target.topClassName ?? "",
    processName: target.processName ?? "",
    terminalUseConhostCopy: Boolean(target.terminalUseConhostCopy),
  };
  if (target.terminalBounds) {
    payload.terminalBounds = target.terminalBounds;
    payload.bounds = target.terminalBounds;
  }
  return payload;
}
