/**
 * Installs the agent as a Windows Service named "ThaiIDCardAgent" (auto-start).
 *
 * Uses node-windows, which bundles WinSW under the hood and therefore handles
 * the Windows Service Control Manager protocol correctly. (A plain console exe
 * registered with `sc create` would be killed by the SCM - error 1053. And the
 * `bun build --compile` single exe currently segfaults loading the PC/SC native
 * addon, so we run the agent on the Bun runtime - see README → Troubleshooting.)
 *
 * The service runs `bun.exe <entry>`, where <entry> is auto-detected:
 *   - ./agent.js       (a built bundle - what the installer ships), else
 *   - ./src/index.ts   (running from the source repo)
 *
 * The target machine therefore needs Bun installed (or BUN_PATH set).
 *
 * Run from an **Administrator** terminal:
 *     bun run install-service.ts        (or: bun run install-service)
 */

import { resolve } from "node:path";
import { existsSync } from "node:fs";

// node-windows is CommonJS; import the default export then destructure.
import nodeWindows from "node-windows";
const { Service } = nodeWindows as unknown as typeof import("node-windows");

// Keep these in sync with src/config.ts (this script must stand alone in a
// distributed folder that may not contain the TypeScript sources).
const SERVICE_NAME = "ThaiIDCardAgent";
const PORT = process.env.THAI_ID_AGENT_PORT ?? "9001";

const here = import.meta.dir;

// Prefer a built bundle next to this script; fall back to the source entry.
const bundled = resolve(here, "agent.js");
const source = resolve(here, "src", "index.ts");
const script = existsSync(bundled) ? bundled : source;

// When launched via `bun run`, process.execPath is the full path to bun.exe.
const bunPath = process.env.BUN_PATH ?? process.execPath;

if (!existsSync(script)) {
  console.error(`❌ ไม่พบไฟล์ entry (agent.js หรือ src/index.ts) ใน ${here}`);
  process.exit(1);
}
if (!/bun(\.exe)?$/i.test(bunPath)) {
  console.warn(
    `⚠ execPath ไม่ใช่ bun (${bunPath}). ` +
      `ให้รันด้วย \`bun run install-service.ts\` หรือกำหนด env BUN_PATH ชี้ไปที่ bun.exe`,
  );
}

const svc = new Service({
  name: SERVICE_NAME,
  description:
    "Thai ID Card Local Agent - HTTP server for reading Thai national ID smart cards (http://localhost:" +
    PORT +
    ").",
  script,
  execPath: bunPath, // run with Bun instead of Node
  workingDirectory: here,
  env: [{ name: "THAI_ID_AGENT_PORT", value: String(PORT) }],
  wait: 2,
  grow: 0.5,
  maxRestarts: 10,
});

svc.on("install", () => {
  console.log(`✅ ติดตั้ง Windows Service "${SERVICE_NAME}" สำเร็จ - กำลังเริ่มทำงาน...`);
  svc.start();
});

svc.on("alreadyinstalled", () => {
  console.log(
    `ℹ️ Service "${SERVICE_NAME}" ถูกติดตั้งอยู่แล้ว ` +
      `(ถ้าต้องการติดตั้งใหม่ ให้รัน uninstall-service ก่อน)`,
  );
});

svc.on("start", () => {
  console.log(
    `✅ "${SERVICE_NAME}" กำลังทำงานที่ http://127.0.0.1:${PORT}\n` +
      `   ตรวจสอบได้ที่ services.msc หรือ \`sc query ${SERVICE_NAME}\``,
  );
});

svc.on("error", (err: unknown) => {
  console.error("❌ เกิดข้อผิดพลาดในการติดตั้ง service:", err);
});

console.log(`กำลังติดตั้ง Windows Service: ${SERVICE_NAME}`);
console.log(`  runtime : ${bunPath}`);
console.log(`  entry   : ${script}`);
console.log(`  (ต้องรันด้วยสิทธิ์ Administrator)\n`);

svc.install();
