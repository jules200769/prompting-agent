import { describe, expect, it } from "vitest";
import { computeGrounding } from "./grounding";
import type { CaptureContext } from "./types";

describe("computeGrounding", () => {
  it("mirrors the session/project booleans", () => {
    expect(computeGrounding(true, false)).toMatchObject({ session: true, project: false });
    expect(computeGrounding(false, true)).toMatchObject({ session: false, project: true });
    expect(computeGrounding(true, true)).toMatchObject({ session: true, project: true });
    expect(computeGrounding(false, false)).toMatchObject({ session: false, project: false });
  });

  it("omits destination when there is no app info", () => {
    expect(computeGrounding(false, false)).toEqual({
      session: false,
      project: false,
      destination: undefined,
    });
    expect(computeGrounding(false, false, {}).destination).toBeUndefined();
    expect(computeGrounding(false, false, { app: {} }).destination).toBeUndefined();
  });

  it("maps editorKind to a display label (highest priority)", () => {
    const cursor: CaptureContext = { app: { editorKind: "cursor", site: "example.com", processName: "code.exe" } };
    expect(computeGrounding(true, true, cursor).destination).toEqual({ app: "Cursor" });
    expect(computeGrounding(true, true, { app: { editorKind: "vscode" } }).destination).toEqual({
      app: "VS Code",
    });
    expect(computeGrounding(true, true, { app: { editorKind: "windsurf" } }).destination).toEqual({
      app: "Windsurf",
    });
  });

  it("falls back to site when there is no editorKind", () => {
    const ctx: CaptureContext = { app: { site: "claude.ai", processName: "chrome.exe" } };
    expect(computeGrounding(false, false, ctx).destination).toEqual({ app: "claude.ai" });
  });

  it("falls back to processName (stripping .exe and capitalizing) last", () => {
    expect(computeGrounding(false, false, { app: { processName: "slack.exe" } }).destination).toEqual({
      app: "Slack",
    });
    expect(computeGrounding(false, false, { app: { processName: "notepad" } }).destination).toEqual({
      app: "Notepad",
    });
  });

  it("adds the active-file basename as detail (both slash kinds)", () => {
    const win: CaptureContext = {
      app: { editorKind: "cursor" },
      files: { activeFile: "C:\\Users\\me\\Overlay.tsx" },
    };
    expect(computeGrounding(true, false, win).destination).toEqual({
      app: "Cursor",
      detail: "Overlay.tsx",
    });
    const posix: CaptureContext = {
      app: { editorKind: "vscode" },
      files: { activeFile: "/home/me/src/main.ts" },
    };
    expect(computeGrounding(true, false, posix).destination).toEqual({
      app: "VS Code",
      detail: "main.ts",
    });
  });

  it("omits detail when there is no active file", () => {
    expect(
      computeGrounding(false, false, { app: { editorKind: "cursor" } }).destination,
    ).toEqual({ app: "Cursor" });
  });
});
