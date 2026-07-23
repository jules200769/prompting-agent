import type { ProjectContext, SessionContext } from "../../../shared/session";

export type WorkbenchHeading = {
  eyebrow: string;
  title: string;
  description: string;
};

/** Fixed BUILD tool page heading — session path lives in the titlebar only. */
export function workbenchHeading(mode: "generator" | "optimizer"): WorkbenchHeading {
  return {
    eyebrow: mode === "generator" ? "Create" : "Improve",
    title:
      mode === "generator" ? "Craft a model-ready prompt" : "Optimize your existing prompt",
    description:
      mode === "generator"
        ? "Start with an idea, choose its purpose, and build a prompt for the model you use."
        : "Paste a prompt you already use. Anvyll can ask three focused questions before rebuilding it.",
  };
}

/** Titlebar label when a session-bound optimizer window is open. */
export function sessionTitlebarLabel(
  sessionBound: boolean,
  activeProject: ProjectContext | null | undefined,
  activeSession: SessionContext | null | undefined,
): string | null {
  if (!sessionBound || !activeSession) return null;
  return `${activeProject?.title ?? "No project"} / ${activeSession.title}`;
}
