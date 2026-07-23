import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  groupSessionsByProject,
  type ProjectContext,
  type SessionContext,
} from "../../shared/session";
import { spring, useReducedMotionSafe } from "../motion";

const NO_PROJECT_KEY = "__no_project__";

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      className={`studio-tree__chevron ${open ? "is-open" : ""}`}
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <path d="M9 6l6 6-6 6" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M4 7h16M9 7V5h6v2M18 7l-1 13H7L6 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/**
 * The Studio rail's "Recent" tree: a collapsible Recent header that folds out to
 * the projects you've made, each of which folds out to its sessions. Backed by
 * the same main-process project/session store the hotkey overlay uses, so the two
 * surfaces stay in sync. Opening a session is delegated to the parent (which
 * activates it and routes to the Optimizer).
 */
export function ProjectRail({
  projects,
  sessions,
  activeSessionId,
  onOpenSession,
  onNewProject,
  onNewSession,
  onDeleteSession,
}: {
  projects: ProjectContext[];
  sessions: SessionContext[];
  activeSessionId: string | null;
  onOpenSession: (session: SessionContext) => void;
  onNewProject: (name: string) => void;
  onNewSession: (projectId: string | null) => void;
  onDeleteSession: (id: string) => void;
}) {
  const [recentOpen, setRecentOpen] = useState(true);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [adding, setAdding] = useState(false);
  const [draftName, setDraftName] = useState("");
  const { variants, reduce } = useReducedMotionSafe();

  const groups = groupSessionsByProject(sessions, projects);
  const foldTransition = reduce ? { duration: 0 } : spring.soft;

  function toggle(key: string) {
    setExpanded((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  function commitNewProject() {
    const name = draftName.trim();
    if (name) onNewProject(name);
    setDraftName("");
    setAdding(false);
  }

  return (
    <section className="studio-tree" aria-label="Recent projects and sessions">
      <button
        type="button"
        className="studio-tree__header"
        aria-expanded={recentOpen}
        onClick={() => setRecentOpen((value) => !value)}
      >
        <Chevron open={recentOpen} />
        <span>Recent</span>
        <i className="studio-tree__count">{sessions.length}</i>
      </button>

      <AnimatePresence initial={false}>
        {recentOpen && (
          <motion.div
            className="studio-tree__body"
            initial="hidden"
            animate="show"
            exit="hidden"
            variants={variants({
              hidden: { height: 0, opacity: 0 },
              show: { height: "auto", opacity: 1 },
            })}
            transition={foldTransition}
            style={{ overflow: "hidden" }}
          >
            {groups.every((group) => group.sessions.length === 0) && projects.length === 0 && (
              <p className="studio-tree__empty">
                No projects yet. Create one to group your sessions.
              </p>
            )}

            {groups.map((group) => {
              const project = group.project;
              const key = project?.id ?? NO_PROJECT_KEY;
              // The "No project" bucket only appears once it actually holds sessions.
              if (!project && group.sessions.length === 0) return null;
              const isOpen = expanded[key] ?? false;
              return (
                <div key={key} className="studio-tree__project-group">
                  <div className="studio-tree__project">
                    <button
                      type="button"
                      className="studio-tree__project-toggle"
                      aria-expanded={isOpen}
                      onClick={() => toggle(key)}
                    >
                      <Chevron open={isOpen} />
                      <span
                        className="studio-tree__dot"
                        style={{ backgroundColor: project?.color ?? "var(--muted)" }}
                        aria-hidden="true"
                      />
                      <strong title={project?.title ?? "No project"}>
                        {project?.title ?? "No project"}
                      </strong>
                      <i className="studio-tree__count">{group.sessions.length}</i>
                    </button>
                  </div>

                  <AnimatePresence initial={false}>
                    {isOpen && (
                      <motion.div
                        className="studio-tree__sessions"
                        initial="hidden"
                        animate="show"
                        exit="hidden"
                        variants={variants({
                          hidden: { height: 0, opacity: 0 },
                          show: { height: "auto", opacity: 1 },
                        })}
                        transition={foldTransition}
                        style={{ overflow: "hidden" }}
                      >
                        {group.sessions.map((session) => {
                          const isActive = session.id === activeSessionId;
                          return (
                            <div
                              key={session.id}
                              className={`studio-tree__session ${isActive ? "is-active" : ""}`}
                            >
                              <button
                                type="button"
                                className="studio-tree__session-open"
                                title={session.title}
                                onClick={() => onOpenSession(session)}
                              >
                                <span>{session.title}</span>
                                {isActive && <em>active</em>}
                              </button>
                              <button
                                type="button"
                                className="studio-tree__session-delete"
                                aria-label={`Delete session ${session.title}`}
                                title="Delete session"
                                onClick={() => onDeleteSession(session.id)}
                              >
                                <TrashIcon />
                              </button>
                            </div>
                          );
                        })}
                        <button
                          type="button"
                          className="studio-tree__add"
                          onClick={() => onNewSession(project?.id ?? null)}
                        >
                          + New session
                        </button>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              );
            })}

            {adding ? (
              <div className="studio-tree__new">
                <input
                  autoFocus
                  value={draftName}
                  placeholder="Project name…"
                  onChange={(event) => setDraftName(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") commitNewProject();
                    else if (event.key === "Escape") {
                      setDraftName("");
                      setAdding(false);
                    }
                  }}
                  onBlur={commitNewProject}
                  aria-label="New project name"
                />
              </div>
            ) : (
              <button type="button" className="studio-tree__new-project" onClick={() => setAdding(true)}>
                + New project
              </button>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}
