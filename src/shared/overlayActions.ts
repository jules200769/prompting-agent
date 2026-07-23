export type OverlayOutputAction = "apply" | "copy";

/** Cursor is the only terminal host where the overlay deliberately disables injection. */
export function isCursorProcessName(processName?: string): boolean {
  return processName?.trim().replace(/\.exe$/i, "").toLowerCase() === "cursor";
}

/** Actions displayed in the overlay footer after a successful refinement. */
export function overlayFooterActions(
  isCursorTerminalSession: boolean,
  canInject: boolean,
): readonly OverlayOutputAction[] {
  return isCursorTerminalSession || !canInject ? ["copy"] : ["apply", "copy"];
}

/** Enter follows the only safe completion action for the current capture target. */
export function overlayCompletionAction(
  isCursorTerminalSession: boolean,
  canInject: boolean,
): OverlayOutputAction {
  return isCursorTerminalSession || !canInject ? "copy" : "apply";
}
