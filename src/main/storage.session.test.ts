import { describe, expect, it, beforeEach, vi } from "vitest";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

// storage.ts resolves its JSON file via electron's app.getPath("userData").
const tmpDir = mkdtempSync(join(tmpdir(), "pf-session-test-"));
vi.mock("electron", () => ({ app: { getPath: () => tmpDir } }));

const store = await import("./storage");
const { SESSIONS_MAX, SESSION_CONTEXT_MAX_CHARS, PROJECTS_MAX } = await import("../shared/session");

const storeFile = () => join(tmpDir, "promptforge.store.json");

beforeEach(() => {
  // Reset persisted session/project state between tests (module keeps a singleton).
  for (const s of store.listSessions()) store.deleteSession(s.id);
  store.setActiveSession(null);
  for (const p of store.listProjects()) store.deleteProject(p.id);
  store.setActiveProject(null);
  store.setProjectContext("");
});

describe("session CRUD", () => {
  it("createSession makes an empty active session", () => {
    const s = store.createSession();
    expect(s.title).toBe("New session");
    expect(s.contextText).toBe("");
    expect(store.getActiveSession()?.id).toBe(s.id);
    expect(store.listSessions().map((x) => x.id)).toContain(s.id);
  });

  it("setSessionContext clamps, re-titles, and persists to disk", () => {
    const s = store.createSession();
    const updated = store.setSessionContext(s.id, `1. GOAL — Fix the flaky deploy.\nmore\n${"x".repeat(5000)}`);
    expect(updated?.contextText.length).toBeLessThanOrEqual(SESSION_CONTEXT_MAX_CHARS);
    expect(updated?.title).toBe("Fix the flaky deploy.");
    const onDisk = JSON.parse(readFileSync(storeFile(), "utf8"));
    expect(onDisk.sessions.find((x: { id: string }) => x.id === s.id).title).toBe("Fix the flaky deploy.");
    expect(onDisk.activeSessionId).toBe(s.id);
  });

  it("sessions are isolated — updating one leaves others untouched", () => {
    const a = store.createSession();
    store.setSessionContext(a.id, "context A");
    const b = store.createSession();
    store.setSessionContext(b.id, "context B");
    expect(store.listSessions().find((s) => s.id === a.id)?.contextText).toBe("context A");
    expect(store.getActiveSession()?.contextText).toBe("context B");
  });

  it("clearSessionContext empties context but keeps the session resumable", () => {
    const s = store.createSession();
    store.setSessionContext(s.id, "1. GOAL — Something.");
    const cleared = store.clearSessionContext(s.id);
    expect(cleared?.contextText).toBe("");
    expect(store.listSessions().some((x) => x.id === s.id)).toBe(true);
  });

  it("setActiveSession switches sessions and rejects unknown ids", () => {
    const a = store.createSession();
    store.createSession();
    expect(store.setActiveSession(a.id)?.id).toBe(a.id);
    expect(store.getActiveSession()?.id).toBe(a.id);
    expect(store.setActiveSession("nope")).toBeNull();
    expect(store.getActiveSession()?.id).toBe(a.id);
  });

  it("deleteSession removes it and heals the active pointer", () => {
    const s = store.createSession();
    store.deleteSession(s.id);
    expect(store.getActiveSession()).toBeNull();
    expect(store.listSessions().some((x) => x.id === s.id)).toBe(false);
  });

  it("getActiveSession heals a dangling activeSessionId", () => {
    const s = store.createSession();
    const raw = JSON.parse(readFileSync(storeFile(), "utf8"));
    expect(raw.activeSessionId).toBe(s.id);
    store.deleteSession(s.id);
    expect(store.getActiveSession()).toBeNull();
  });

  it("evicts oldest sessions beyond SESSIONS_MAX but never the active one", () => {
    const first = store.createSession();
    for (let i = 0; i < SESSIONS_MAX; i++) store.createSession();
    const sessions = store.listSessions();
    expect(sessions.length).toBe(SESSIONS_MAX);
    expect(sessions.some((s) => s.id === first.id)).toBe(false);
    expect(store.getActiveSession()).not.toBeNull();
  });
});

describe("project context string", () => {
  it("round-trips and clamps", () => {
    store.setProjectContext(`  React + Electron ${"y".repeat(5000)}`);
    const text = store.getProjectContext();
    expect(text.startsWith("React + Electron")).toBe(true);
    expect(text.length).toBeLessThanOrEqual(4000);
  });
});

describe("project library", () => {
  it("upsertActiveProject creates then updates the active entry", () => {
    const created = store.upsertActiveProject("1. PROJECT — First library entry");
    expect(store.listProjects()).toHaveLength(1);
    expect(store.getActiveProjectId()).toBe(created.id);
    expect(store.getProjectContext()).toBe("1. PROJECT — First library entry");
    expect(created.title).toBe("First library entry");

    const updated = store.upsertActiveProject("1. PROJECT — Updated library entry");
    expect(updated.id).toBe(created.id);
    expect(store.listProjects()).toHaveLength(1);
    expect(updated.title).toBe("Updated library entry");
    expect(store.getProjectContext()).toBe("1. PROJECT — Updated library entry");
  });

  it("setActiveProject syncs projectContext; null clears both", () => {
    const a = store.upsertActiveProject("1. PROJECT — Alpha");
    store.setActiveProject(null);
    const b = store.upsertActiveProject("1. PROJECT — Beta");
    expect(store.setActiveProject(a.id)?.id).toBe(a.id);
    expect(store.getProjectContext()).toBe(a.contextText);
    expect(store.getActiveProjectId()).toBe(a.id);
    expect(store.setActiveProject(null)).toBeNull();
    expect(store.getActiveProjectId()).toBeNull();
    expect(store.getProjectContext()).toBe("");
    expect(store.listProjects().some((p) => p.id === b.id)).toBe(true);
  });

  it("deleteProject of the active entry clears id and projectContext", () => {
    const p = store.upsertActiveProject("1. PROJECT — Delete me");
    store.deleteProject(p.id);
    expect(store.listProjects()).toHaveLength(0);
    expect(store.getActiveProjectId()).toBeNull();
    expect(store.getProjectContext()).toBe("");
  });

  it("deleteProject also removes sessions linked to that project", () => {
    const p = store.upsertActiveProject("1. PROJECT — Cascaded");
    const linked = store.createSession(p.id);
    const other = store.createSession(null);
    store.setSessionContext(linked.id, "1. GOAL — Linked work");
    store.setSessionContext(other.id, "1. GOAL — Independent work");
    store.deleteProject(p.id);
    const remaining = store.listSessions();
    expect(remaining.map((s) => s.id)).toEqual([other.id]);
    expect(store.getActiveSession()?.id).toBe(other.id);
  });

  it("createSession links a valid projectId and ignores unknown ids", () => {
    const p = store.upsertActiveProject("1. PROJECT — Linked");
    const linked = store.createSession(p.id);
    expect(linked.projectId).toBe(p.id);
    const orphan = store.createSession("missing-project-id");
    expect(orphan.projectId).toBeNull();
  });

  it("evicts oldest projects beyond PROJECTS_MAX but never the active one", () => {
    const first = store.upsertActiveProject("1. PROJECT — First");
    for (let i = 0; i < PROJECTS_MAX; i++) {
      store.setActiveProject(null);
      store.upsertActiveProject(`1. PROJECT — P${i}`);
    }
    const projects = store.listProjects();
    expect(projects.length).toBe(PROJECTS_MAX);
    expect(projects.some((p) => p.id === first.id)).toBe(false);
    expect(store.getActiveProjectId()).not.toBeNull();
  });

  it("getActiveProjectId heals a dangling activeProjectId", async () => {
    const healDir = mkdtempSync(join(tmpdir(), "pf-project-heal-"));
    writeFileSync(
      join(healDir, "promptforge.store.json"),
      JSON.stringify({
        settings: null,
        library: [],
        history: [],
        optCache: {},
        optCacheOrder: [],
        fileMemory: [],
        sessions: [],
        activeSessionId: null,
        projects: [],
        activeProjectId: "ghost-id",
        projectContext: "",
      }),
      "utf8",
    );
    vi.resetModules();
    vi.doMock("electron", () => ({ app: { getPath: () => healDir } }));
    const healStore = await import("./storage");
    expect(healStore.getActiveProjectId()).toBeNull();
    const onDisk = JSON.parse(readFileSync(join(healDir, "promptforge.store.json"), "utf8"));
    expect(onDisk.activeProjectId).toBeNull();
    vi.doUnmock("electron");
    vi.resetModules();
  });
});

describe("store migration", () => {
  it("a legacy store without session keys loads with defaults", async () => {
    const legacyDir = mkdtempSync(join(tmpdir(), "pf-session-legacy-"));
    writeFileSync(
      join(legacyDir, "promptforge.store.json"),
      JSON.stringify({ settings: null, library: [], history: [], optCache: {}, optCacheOrder: [], fileMemory: [] }),
      "utf8",
    );
    vi.resetModules();
    vi.doMock("electron", () => ({ app: { getPath: () => legacyDir } }));
    const legacyStore = await import("./storage");
    expect(legacyStore.listSessions()).toEqual([]);
    expect(legacyStore.getActiveSession()).toBeNull();
    expect(legacyStore.getProjectContext()).toBe("");
    expect(legacyStore.listProjects()).toEqual([]);
    expect(legacyStore.getActiveProjectId()).toBeNull();
    vi.doUnmock("electron");
    vi.resetModules();
  });

  it("migrates a legacy projectContext string into the library and sets it active", async () => {
    const legacyDir = mkdtempSync(join(tmpdir(), "pf-project-legacy-"));
    writeFileSync(
      join(legacyDir, "promptforge.store.json"),
      JSON.stringify({
        settings: null,
        library: [],
        history: [],
        optCache: {},
        optCacheOrder: [],
        fileMemory: [],
        sessions: [],
        activeSessionId: null,
        projectContext: "1. PROJECT — Legacy Anvyl app",
      }),
      "utf8",
    );
    vi.resetModules();
    vi.doMock("electron", () => ({ app: { getPath: () => legacyDir } }));
    const legacyStore = await import("./storage");
    const projects = legacyStore.listProjects();
    expect(projects).toHaveLength(1);
    expect(projects[0].title).toBe("Legacy Anvyl app");
    expect(legacyStore.getActiveProjectId()).toBe(projects[0].id);
    expect(legacyStore.getProjectContext()).toBe("1. PROJECT — Legacy Anvyl app");
    const onDisk = JSON.parse(readFileSync(join(legacyDir, "promptforge.store.json"), "utf8"));
    expect(onDisk.projects).toHaveLength(1);
    expect(onDisk.activeProjectId).toBe(projects[0].id);
    vi.doUnmock("electron");
    vi.resetModules();
  });
});
