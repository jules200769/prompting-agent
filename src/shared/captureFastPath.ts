/** Whether pre-hide UIA snapshot is enough to skip win-capture.ps1. */
export function shouldUseEarlyCaptureFastPath(
  earlyText: string | null | undefined,
  hasUiaMeta: boolean,
): boolean {
  return Boolean(earlyText?.trim() && hasUiaMeta);
}
