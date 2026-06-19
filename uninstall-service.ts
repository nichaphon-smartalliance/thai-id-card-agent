/**
 * Stops and removes the "ThaiIDCardAgent" Windows Service.
 *
 * Run from an **Administrator** terminal:
 *     bun run uninstall-service.ts      (or: bun run uninstall-service)
 */

import { resolve } from "node:path";
import { existsSync } from "node:fs";

import nodeWindows from "node-windows";
const { Service } = nodeWindows as unknown as typeof import("node-windows");

const SERVICE_NAME = "ThaiIDCardAgent";
const here = import.meta.dir;

// node-windows identifies the service by name + script; point at whichever
// entry exists so it matches what install-service.ts registered.
const bundled = resolve(here, "agent.js");
const script = existsSync(bundled) ? bundled : resolve(here, "src", "index.ts");

const svc = new Service({ name: SERVICE_NAME, script });

svc.on("uninstall", () => {
  console.log(`✅ ถอนการติดตั้ง Windows Service "${SERVICE_NAME}" เรียบร้อยแล้ว`);
});

svc.on("alreadyuninstalled", () => {
  console.log(`ℹ️ ไม่พบ Service "${SERVICE_NAME}" (อาจถูกถอนไปแล้ว)`);
});

svc.on("error", (err: unknown) => {
  console.error("❌ เกิดข้อผิดพลาดในการถอนการติดตั้ง:", err);
});

console.log(`กำลังถอนการติดตั้ง Windows Service: ${SERVICE_NAME} ...`);
svc.uninstall();
