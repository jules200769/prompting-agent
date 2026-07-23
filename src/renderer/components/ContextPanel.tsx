import type { RefObject } from "react";
import { groupSessionsByProject, type ProjectContext, type SessionContext } from "../../shared/session";
import { shouldSuggestPromoteToProject } from "../../shared/sessionPromote";

function TrashIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M10 11v6M14 11v6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth={2} strokeLinecap="round" />
    </svg>
  );
}

export interface ContextPanelProps {
  projects: ProjectContext[];
  sessions: SessionContext[];
  activeSessionId: string | null;
  pendingDeleteProject: ProjectContext | null;
  onResumeSession(id: string): void;
  onDeleteSession(id: string): void;
  onNewSessionIn(projectId: string | null): void;
  /** null = cancel the pending delete. */
  onRequestDeleteProject(p: ProjectContext | null): void;
  onConfirmDeleteProject(): void;
  onNewProject(): void;
  onBringContext(): void;
  onEditProjectMemory(p: ProjectContext): void;
  standingProjectContext?: string;
  onPromoteSessionToProject?(sessionId: string): void;
  onClose(): void;
  panelRef?: RefObject<HTMLDivElement>;
}

export function ContextPanel({
  projects,
  sessions,
  activeSessionId,
  pendingDeleteProject,
  onResumeSession,
  onDeleteSession,
  onNewSessionIn,
  onRequestDeleteProject,
  onConfirmDeleteProject,
  onNewProject,
  onBringContext,
  onEditProjectMemory,
  standingProjectContext = "",
  onPromoteSessionToProject,
  onClose,
  panelRef,
}: ContextPanelProps) {
  const groups = groupSessionsByProject(sessions, projects);
  const everythingEmpty = projects.length === 0 && sessions.length === 0;
  const activeSession = sessions.find((s) => s.id === activeSessionId) ?? null;
  const promoteSessionId =
    activeSession &&
    activeSession.projectId &&
    onPromoteSessionToProject &&
    shouldSuggestPromoteToProject(activeSession.contextText, standingProjectContext)
      ? activeSession.id
      : null;

  if (pendingDeleteProject) {
    const linkedCount = sessions.filter((s) => s.projectId === pendingDeleteProject.id).length;
    return (
      <div
        ref={panelRef}
        className="absolute left-4 right-4 top-[52px] z-30 max-w-[340px] apple-glass-menu rounded-[18px] p-4 text-white"
        role="dialog"
        aria-label="Delete project"
      >
        <div className="flex items-center justify-between gap-3 mb-3">
          <h2 className="text-[15px] font-medium">Delete project?</h2>
          <button
            type="button"
            onClick={() => onRequestDeleteProject(null)}
            className="text-white/50 hover:text-white transition shrink-0"
            aria-label="Cancel"
          >
            <CloseIcon />
          </button>
        </div>
        <p className="text-[13px] text-white/70 mb-1 leading-relaxed">
          <span className="text-white">{pendingDeleteProject.title}</span> will be permanently removed.
        </p>
        <p className="text-[13px] text-white/55 mb-4 leading-relaxed">
          {linkedCount > 0
            ? `This also deletes ${linkedCount} linked session${linkedCount === 1 ? "" : "s"}.`
            : "No linked sessions will be affected."}
        </p>
        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={() => onRequestDeleteProject(null)}
            className="rounded-xl px-3.5 py-2 text-[13px] text-white/70 hover:bg-white/10 transition"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirmDeleteProject}
            className="rounded-xl px-3.5 py-2 text-[13px] bg-white/15 hover:bg-white/25 text-white transition"
          >
            Delete
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={panelRef}
      className="absolute left-4 right-4 top-[52px] z-30 max-w-[340px] apple-glass-menu rounded-[18px] p-3 text-white"
      role="menu"
      aria-label="Context"
    >
      <div className="text-[10px] uppercase tracking-wider text-white/50 mb-2 px-1">CONTEXT</div>
      {everythingEmpty && (
        <p className="px-1 mb-2 text-[12px] text-white/45 leading-relaxed">
          Start a session or bring context from a chat so refinements understand your work.
        </p>
      )}

      <div className="max-h-[260px] overflow-y-auto scroll-thin">
        {groups.map((group) => {
          const project = group.project;
          const key = project?.id ?? "__no_project__";
          const hasMemory = Boolean(project?.contextText.trim());
          return (
            <div key={key} className="rounded-xl border border-white/10 bg-white/[.04] p-1 mb-2">
              <div className="flex items-center gap-2 px-2 py-1.5">
                <span
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{ backgroundColor: project?.color ?? "rgba(255,255,255,.25)" }}
                  aria-hidden
                />
                <span className="min-w-0 flex-1 truncate text-[13px] font-medium" title={project?.title}>
                  {project?.title ?? "No project"}
                </span>
                {project && (
                  <>
                    <button
                      type="button"
                      onClick={() => onEditProjectMemory(project)}
                      className={`shrink-0 text-[10px] px-1.5 py-0.5 rounded-md transition ${
                        hasMemory
                          ? "text-white/45 hover:text-white/70"
                          : "text-white/40 hover:text-white/70 hover:bg-white/10"
                      }`}
                    >
                      {hasMemory ? "memory ✓" : "add memory"}
                    </button>
                    <button
                      type="button"
                      onClick={() => onRequestDeleteProject(project)}
                      className="shrink-0 p-1 rounded-md text-white/40 hover:text-white hover:bg-white/10 transition"
                      aria-label={`Delete project ${project.title}`}
                      title="Delete project"
                    >
                      <TrashIcon />
                    </button>
                  </>
                )}
              </div>

              {group.sessions.map((s) => {
                const isActive = s.id === activeSessionId;
                return (
                  <div key={s.id} className="flex items-center gap-0.5 pr-1">
                    <button
                      type="button"
                      onClick={() => {
                        onResumeSession(s.id);
                        onClose();
                      }}
                      className={`min-w-0 flex-1 flex items-center gap-2 text-left pl-6 pr-2 py-1.5 rounded-lg text-[13px] transition ${
                        isActive ? "bg-white/10 text-white" : "text-white/60 hover:bg-white/10"
                      }`}
                      title={s.title}
                    >
                      <span className="min-w-0 flex-1 truncate">{s.title}</span>
                      {isActive && (
                        <span
                          className="shrink-0 text-[10px]"
                          style={{ color: project?.color ?? "rgba(255,255,255,.6)" }}
                        >
                          active
                        </span>
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onDeleteSession(s.id);
                      }}
                      className="shrink-0 p-1.5 rounded-md text-white/40 hover:text-white hover:bg-white/10 transition"
                      aria-label="Delete session"
                      title="Delete session"
                    >
                      <TrashIcon />
                    </button>
                  </div>
                );
              })}

              <button
                type="button"
                onClick={() => {
                  onNewSessionIn(project?.id ?? null);
                  onClose();
                }}
                className="w-full text-left pl-6 pr-2 py-1.5 rounded-lg text-[13px] text-white/45 hover:text-white/75 hover:bg-white/10 transition"
              >
                + New session here
              </button>
            </div>
          );
        })}
      </div>

      {promoteSessionId && (
        <button
          type="button"
          onClick={() => {
            onPromoteSessionToProject?.(promoteSessionId);
            onClose();
          }}
          className="w-full mt-2 rounded-xl px-3 py-2 text-[12px] text-left text-white/70 hover:bg-white/10 transition border border-white/10"
        >
          Suggest: add session facts to project memory
        </button>
      )}

      <div className="flex items-center gap-2 pt-2 mt-1 border-t border-white/10">
        <button
          type="button"
          onClick={onNewProject}
          className="apple-glass-pill--accent rounded-full px-3 py-1.5 text-[12px] font-medium transition opacity-40 hover:opacity-60"
        >
          New Project
        </button>
        <button
          type="button"
          onClick={onBringContext}
          className="rounded-full px-3 py-1.5 text-[12px] font-medium bg-white/20 hover:bg-white/30 text-white transition ml-auto"
        >
          Bring context from your chat
        </button>
      </div>
    </div>
  );
}
