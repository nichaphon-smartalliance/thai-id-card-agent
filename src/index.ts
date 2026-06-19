/**
 * Thai ID Card Local Agent - entry point.
 *
 * Boots the PC/SC reader manager, then serves the Hono app with Bun.serve on
 * http://127.0.0.1:9001. Designed to run both via `bun run src/index.ts`,
 * as a compiled single exe, and as a Windows Service.
 */

import { CONFIG, SERVICE_NAME, VERSION } from "./config";
import { ReaderManager } from "./reader-manager";
import { createApp } from "./server";

const manager = new ReaderManager();
await manager.start();

const app = createApp(manager);

const server = Bun.serve({
  hostname: CONFIG.host,
  port: CONFIG.port,
  fetch: app.fetch,
});

console.log(
  `\n  ${SERVICE_NAME} v${VERSION}` +
    `\n  ➜ http://${CONFIG.host}:${server.port}` +
    `\n  ➜ GET /readers` +
    `\n  ➜ GET /data?readerName=<name>\n`,
);

if (manager.loadError) {
  console.warn("  ⚠ PC/SC unavailable - /readers will be empty.\n");
}

function shutdown(signal: string) {
  console.log(`\n[${signal}] shutting down ${SERVICE_NAME}...`);
  manager.stop();
  server.stop(true);
  process.exit(0);
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
