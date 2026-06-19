/**
 * Build distributable artifacts into dist/.
 *
 * Produces TWO things:
 *
 *  1. dist/agent.js  (RECOMMENDED, works)
 *     A single bundled JS file that runs on the installed Bun runtime:
 *         bun dist/agent.js
 *     The PC/SC native addon is resolved at runtime from dist/node_modules,
 *     which we stage next to it.
 *
 *  2. dist/thai-id-card-agent.exe  (EXPERIMENTAL, currently crashes)
 *     A `bun build --compile` single executable. As of Bun 1.3.x this exe
 *     SEGFAULTS while loading the pcsc-mini native addon - a Bun standalone /
 *     N-API bug, not ours (a 1-line program that only dlopen()s the addon
 *     crashes identically). It is emitted so the pipeline is ready the moment
 *     Bun fixes standalone N-API; do not ship it to users yet. Pass --no-exe
 *     to skip it.
 *
 * Either way the agent is meant to run on the Bun runtime as a Windows Service
 * (see install-service.ts). Usage:  bun run build   [--no-exe]
 */

import { $ } from "bun";
import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dir, "..");
const dist = resolve(root, "dist");
const skipExe = process.argv.includes("--no-exe");

if (!existsSync(resolve(root, "node_modules", "@pcsc-mini"))) {
  console.error("❌ ไม่พบ node_modules/@pcsc-mini - รัน `bun install` ก่อน build");
  process.exit(1);
}

rmSync(dist, { recursive: true, force: true });
mkdirSync(dist, { recursive: true });

// 1. Bundled JS for the Bun runtime (the artifact that actually works).
console.log("→ Bundling dist/agent.js (runs on the Bun runtime)...");
await $`bun build --target=bun ${resolve(root, "src", "index.ts")} --outfile ${resolve(dist, "agent.js")}`;

// 2. Stage the PC/SC native addon next to the artifacts so the runtime
//    require()/dlopen resolves it (pcsc-mini's loader can't be bundled).
console.log("→ Staging pcsc-mini native addon (dist/node_modules/@pcsc-mini)...");
mkdirSync(resolve(dist, "node_modules"), { recursive: true });
cpSync(
  resolve(root, "node_modules", "@pcsc-mini"),
  resolve(dist, "node_modules", "@pcsc-mini"),
  { recursive: true },
);

// Convenience launcher.
writeFileSync(
  resolve(dist, "start.cmd"),
  "@echo off\r\nsetlocal\r\ncd /d \"%~dp0\"\r\nbun agent.js %*\r\n",
);

// 3. Experimental single exe (currently crashes on the native addon).
if (!skipExe) {
  console.log("→ Compiling dist/thai-id-card-agent.exe (EXPERIMENTAL)...");
  await $`bun build --compile --target=bun-windows-x64 ${resolve(root, "src", "compiled-entry.ts")} --outfile ${resolve(dist, "thai-id-card-agent.exe")}`;
}

console.log("\n✅ Build complete → dist/");
console.log("   • agent.js + node_modules + start.cmd   (run:  bun agent.js)");
if (!skipExe) {
  console.log(
    "   • thai-id-card-agent.exe  ⚠ EXPERIMENTAL - crashes loading the PC/SC\n" +
      "     native addon on Bun 1.3.x (upstream Bun bug). Use the Bun runtime\n" +
      "     / Windows Service for production. See README → Troubleshooting.",
  );
}
