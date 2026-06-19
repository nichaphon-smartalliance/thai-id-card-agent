/**
 * Hono application: defines the HTTP API surface of the agent.
 *
 *   GET /          -> health / metadata
 *   GET /readers   -> string[] of connected reader names
 *   GET /data      -> Thai ID card data for ?readerName=...
 *
 * Express is intentionally NOT used (per project requirements); Hono runs
 * natively on Bun via `app.fetch`.
 */

import { Hono } from "hono";
import { cors } from "hono/cors";

import { CONFIG, SERVICE_NAME, VERSION } from "./config";
import { AgentError } from "./errors";
import type { ReaderManager } from "./reader-manager";

export function createApp(manager: ReaderManager): Hono {
  const app = new Hono();

  // A local agent is called cross-origin from web apps in the browser.
  app.use(
    "*",
    cors({
      origin: CONFIG.corsOrigin === "*" ? "*" : CONFIG.corsOrigin.split(","),
      allowMethods: ["GET", "OPTIONS"],
    }),
  );

  app.get("/", (c) =>
    c.json({
      service: SERVICE_NAME,
      version: VERSION,
      status: manager.loadError ? "degraded" : "ok",
      pcsc: manager.loadError ?? "ready",
      endpoints: ["GET /readers", "GET /data?readerName=<name>"],
    }),
  );

  // GET /readers -> ["Alcorlink USB Smart Card Reader 0", "ACS ACR39U 1"]
  app.get("/readers", (c) => c.json(manager.listReaders()));

  // GET /data?readerName=... -> Thai ID card JSON
  app.get("/data", async (c) => {
    let readerName = c.req.query("readerName");

    // Convenience: if there's exactly one reader, readerName is optional.
    if (!readerName) {
      const readers = manager.listReaders();
      if (readers.length === 1) {
        readerName = readers[0];
      } else {
        return c.json(
          {
            success: false,
            error:
              "กรุณาระบุพารามิเตอร์ readerName เช่น /data?readerName=ACS%20ACR39U%201",
            readers,
          },
          400,
        );
      }
    }

    try {
      const data = await manager.readData(readerName);
      return c.json({ success: true, readerName, ...data });
    } catch (err) {
      if (err instanceof AgentError) {
        return c.json({ success: false, error: err.message }, err.status as 400);
      }
      console.error("[/data] unexpected error:", err);
      return c.json({ success: false, error: String(err) }, 500);
    }
  });

  return app;
}
