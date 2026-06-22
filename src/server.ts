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
import { getReaderDetails } from "./reader-info";
import type { ReaderManager } from "./reader-manager";

export function createApp(manager: ReaderManager): Hono {
  const app = new Hono();

  // A local agent is called cross-origin from web apps in the browser.
  //
  // We REFLECT the caller's Origin (echo it back) instead of sending "*", and
  // enable credentials. This is required because browsers reject a credentialed
  // request (fetch with credentials/cookies) when the response says
  // `Access-Control-Allow-Origin: *` - it must name the specific origin and
  // include `Access-Control-Allow-Credentials: true`. Reflecting works for both
  // credentialed and non-credentialed requests from ANY origin.
  const allowList =
    CONFIG.corsOrigin === "*"
      ? null
      : CONFIG.corsOrigin.split(",").map((o) => o.trim());

  app.use(
    "*",
    cors({
      origin: (origin) => {
        if (!origin) return "*"; // non-CORS / same-origin / curl
        if (!allowList) return origin; // allow all - echo it back
        return allowList.includes(origin) ? origin : allowList[0];
      },
      credentials: true,
      allowMethods: ["GET", "OPTIONS"],
      // allowHeaders is left unset so Hono reflects the requested headers.
      maxAge: 600,
    }),
  );

  app.get("/", (c) =>
    c.json({
      service: SERVICE_NAME,
      version: VERSION,
      status: manager.loadError ? "degraded" : "ok",
      pcsc: manager.loadError ?? "ready",
      endpoints: [
        "GET /readers",
        "GET /readers/details",
        "GET /data?readerName=<name>",
      ],
    }),
  );

  // GET /readers -> ["Alcorlink USB Smart Card Reader 0", "ACS ACR39U 1"]
  app.get("/readers", (c) => c.json(manager.listReaders()));

  // GET /readers/details -> same readers enriched with USB vendor/VID/PID so a
  // UI can tell apart readers that share the generic PC/SC name. Pass `name`
  // (not `label`) as ?readerName= to /data.
  app.get("/readers/details", async (c) => {
    const names = manager.listReaders();
    try {
      return c.json(await getReaderDetails(names));
    } catch (err) {
      console.error("[/readers/details] error:", err);
      // Degrade gracefully to plain names if USB enrichment fails.
      return c.json(
        names.map((name) => ({
          name,
          vendor: null,
          vid: null,
          pid: null,
          usb: null,
          label: name,
        })),
      );
    }
  });

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
