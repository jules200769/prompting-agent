import { describe, expect, it, vi } from "vitest";

vi.mock("electron", () => ({
  app: {
    isPackaged: false,
    getAppPath: () => "C:\\fake\\app",
  },
}));

import { parseBridgeLine } from "./psBridge";

describe("parseBridgeLine", () => {
  it("parses ready event", () => {
    expect(parseBridgeLine('{"event":"ready"}')).toEqual({ event: "ready" });
  });

  it("parses success response with stdout and code", () => {
    const line = '{"id":"3","ok":true,"cmd":"snapshot","stdout":"{\\"hwnd\\":1}","code":0}';
    expect(parseBridgeLine(line)).toMatchObject({
      id: "3",
      ok: true,
      cmd: "snapshot",
      code: 0,
    });
    expect(parseBridgeLine(line)?.stdout).toContain("hwnd");
  });

  it("parses error response", () => {
    expect(parseBridgeLine('{"id":"1","ok":false,"error":"unknown_cmd"}')).toMatchObject({
      id: "1",
      ok: false,
      error: "unknown_cmd",
    });
  });

  it("returns null for empty or non-JSON noise", () => {
    expect(parseBridgeLine("")).toBeNull();
    expect(parseBridgeLine("   ")).toBeNull();
    expect(parseBridgeLine("not-json")).toBeNull();
    expect(parseBridgeLine("PF_INJECT_OK=paste")).toBeNull();
  });

  it("trims surrounding whitespace", () => {
    expect(parseBridgeLine('  {"event":"ready"}  ')).toEqual({ event: "ready" });
  });
});
