// Dev-only HTTP bridge so the browser overlay preview (#/overlay-preview) can
// call the same optimize/settings path as Electron IPC (no capture/inject).

import { createServer, type IncomingMessage } from "node:http";
import type { OptimizeRequest, OptimizeResult } from "../shared/types";
import { runOptimize } from "./optimizeHandler";
import * as store from "./storage";

const DEV_BRIDGE_PORT = Number(process.env.PROMPTFORGE_DEV_BRIDGE_PORT ?? 5174);

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function sendJson(res: import("node:http").ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

function writeNdjson(
  res: import("node:http").ServerResponse,
  line: { type: "chunk"; data: string } | { type: "done"; data: OptimizeResult },
): void {
  res.write(`${JSON.stringify(line)}\n`);
}

export function startDevBridge(): void {
  const server = createServer(async (req, res) => {
    const url = req.url ?? "/";
    const method = req.method ?? "GET";

    if (method === "OPTIONS") {
      res.writeHead(204, {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      });
      res.end();
      return;
    }

    try {
      if (method === "GET" && url === "/api/settings") {
        sendJson(res, 200, store.getSettings());
        return;
      }

      if (method === "POST" && url === "/api/optimize") {
        let body: OptimizeRequest;
        try {
          body = JSON.parse(await readBody(req)) as OptimizeRequest;
        } catch {
          sendJson(res, 400, { error: "Invalid JSON body" });
          return;
        }

        res.writeHead(200, {
          "Content-Type": "application/x-ndjson",
          "Cache-Control": "no-cache",
          "Access-Control-Allow-Origin": "*",
        });

        const result = await runOptimize(body, (chunk) => {
          writeNdjson(res, { type: "chunk", data: chunk });
        });
        writeNdjson(res, { type: "done", data: result });
        res.end();
        return;
      }

      sendJson(res, 404, { error: "Not found" });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (!res.headersSent) {
        sendJson(res, 500, { error: msg });
      } else {
        res.end();
      }
    }
  });

  server.listen(DEV_BRIDGE_PORT, "127.0.0.1", () => {
    console.log(`[PromptForge] Dev bridge http://127.0.0.1:${DEV_BRIDGE_PORT}`);
  });
}
