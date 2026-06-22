/**
 * Build a FULLY SELF-CONTAINED installer payload in dist-bundle/.
 *
 * The customer's machine needs NOTHING pre-installed: we ship the Bun runtime
 * (bun.exe) alongside the bundled app and the dependencies required to register
 * the Windows Service. Inno Setup (installer.iss) packs this whole folder.
 *
 * dist-bundle/
 *   ├─ bun.exe                      # Bun runtime (so customers don't install Bun)
 *   ├─ agent.js                     # bundled app (Hono inlined)
 *   ├─ install-service.ts           # registers the Windows Service
 *   ├─ uninstall-service.ts
 *   ├─ package.json
 *   ├─ patches/pcsc-mini@0.1.3.patch
 *   └─ node_modules/                # @pcsc-mini (native) + node-windows (+deps)
 *
 * Usage:  bun run package
 */

import { $ } from "bun";
import {
  copyFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  rmSync,
} from "node:fs";
import { resolve, sep } from "node:path";

const root = resolve(import.meta.dir, "..");
const out = resolve(root, "dist-bundle");
const nm = resolve(root, "node_modules");

if (!existsSync(nm)) {
  console.error("❌ ไม่พบ node_modules - รัน `bun install` ก่อน");
  process.exit(1);
}

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

// 1. Bundle the app for the Bun runtime (Hono gets inlined into agent.js).
console.log("→ Bundling agent.js...");
await $`bun build --target=bun ${resolve(root, "src", "index.ts")} --outfile ${resolve(out, "agent.js")}`;

// 2. Ship the Bun runtime itself (the bun.exe currently running this script).
console.log("→ Copying Bun runtime (bun.exe)...");
copyFileSync(process.execPath, resolve(out, "bun.exe"));

// 3. Copy only the node_modules needed at runtime / install time.
//    - @pcsc-mini : native PC/SC addon (loaded by agent.js at runtime)
//    - node-windows (+ its deps): used by install-service.ts
//    Skip dev-only / already-bundled packages to keep the payload small.
//    (Bun runs .ts natively, so the `typescript` package is not needed.)
console.log("→ Copying runtime node_modules (skipping dev/bundled packages)...");
const skipTop = new Set([
  "typescript",
  "bun-types",
  "@types",
  "hono", // inlined into agent.js
  ".bin",
  ".cache",
]);
cpSync(nm, resolve(out, "node_modules"), {
  recursive: true,
  filter: (src) => {
    if (src === nm) return true;
    const rel = src.slice(nm.length + 1);
    const top = rel.split(sep)[0];
    return !skipTop.has(top);
  },
});

// 4. Service scripts, manifest and the pcsc-mini patch.
for (const f of ["install-service.ts", "uninstall-service.ts", "package.json"]) {
  copyFileSync(resolve(root, f), resolve(out, f));
}
mkdirSync(resolve(out, "patches"), { recursive: true });
copyFileSync(
  resolve(root, "patches", "pcsc-mini@0.1.3.patch"),
  resolve(out, "patches", "pcsc-mini@0.1.3.patch"),
);

// 5. End-user manual (HTML) - shipped so the installer can add a Start Menu
//    "คู่มือการใช้งาน" shortcut to it.
console.log("→ Copying user guide (user-guide.html)...");
copyFileSync(
  resolve(root, "docs", "user-guide.html"),
  resolve(out, "user-guide.html"),
);

console.log("\n✅ dist-bundle/ พร้อมแล้ว - คอมไพล์ installer ต่อด้วย:");
console.log('   & "C:\\Program Files (x86)\\Inno Setup 6\\ISCC.exe" installer.iss');
