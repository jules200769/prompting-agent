// Promote session standing context into project memory via compact.

import { compactContext } from "../engine/contextCompact";
import { keyStore } from "./keyStore";
import { REWRITE_CONFIG } from "../shared/types";
import * as store from "./storage";

export async function runPromoteSessionToProject(sessionId: string): Promise<string> {
  const session = store.listSessions().find((s) => s.id === sessionId);
  if (!session?.contextText.trim()) {
    throw new Error("Session has no context to promote.");
  }
  const projectId = session.projectId ?? store.getActiveProjectId();
  if (!projectId) {
    throw new Error("Link the session to a project before promoting context.");
  }
  const project = store.listProjects().find((p) => p.id === projectId);
  const projectText = project?.contextText.trim() ?? store.getProjectContext().trim();

  const source = [
    projectText ? `EXISTING PROJECT CONTEXT:\n"""\n${projectText}\n"""` : "",
    `SESSION FACTS TO MERGE (add only lasting project facts; keep existing project decisions):\n"""\n${session.contextText.trim()}\n"""`,
  ]
    .filter(Boolean)
    .join("\n\n");

  const apiKey = await keyStore.get(REWRITE_CONFIG.provider);
  if (!apiKey) {
    throw new Error("OpenAI API key not configured. Add your key in Settings.");
  }

  const compacted = await compactContext({ scope: "project", text: source, apiKey });
  const updated = store.setProjectContextById(projectId, compacted);
  if (!updated) {
    throw new Error("Project not found.");
  }
  if (store.getActiveProjectId() === projectId) {
    store.setProjectContext(compacted);
  }
  return compacted;
}
