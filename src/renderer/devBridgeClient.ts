// Browser preview client for the Electron dev bridge (Vite proxies /api → 5174).

import type { AppSettings, OptimizeRequest, OptimizeResult } from "../shared/types";

type NdjsonLine =
  | { type: "chunk"; data: string }
  | { type: "done"; data: OptimizeResult };

async function readNdjsonStream(
  body: ReadableStream<Uint8Array>,
  onChunk: (chunk: string) => void,
): Promise<OptimizeResult> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let result: OptimizeResult | null = null;

  const consumeLine = (line: string) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    const msg = JSON.parse(trimmed) as NdjsonLine;
    if (msg.type === "chunk") onChunk(msg.data);
    if (msg.type === "done") result = msg.data;
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) consumeLine(line);
  }
  buffer += decoder.decode();
  if (buffer.trim()) consumeLine(buffer);

  if (!result) throw new Error("Optimize stream ended without a result");
  return result;
}

export async function devBridgeOptimize(
  req: OptimizeRequest,
  onText: (chunk: string) => void,
): Promise<OptimizeResult> {
  const res = await fetch("/api/optimize", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req),
  });
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const err = (await res.json()) as { error?: string };
      if (err.error) detail = err.error;
    } catch {
      /* ignore */
    }
    throw new Error(detail || `Optimize failed (${res.status})`);
  }
  if (!res.body) throw new Error("Optimize response had no body");
  return readNdjsonStream(res.body, onText);
}

export async function devBridgeSettingsGet(): Promise<AppSettings> {
  const res = await fetch("/api/settings");
  if (!res.ok) {
    throw new Error(`Settings fetch failed (${res.status})`);
  }
  return res.json() as Promise<AppSettings>;
}
