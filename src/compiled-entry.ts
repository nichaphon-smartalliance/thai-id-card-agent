/**
 * Dedicated entry point for `bun build --compile` (see scripts/build.ts).
 *
 * The native PC/SC addon (pcsc-mini) is NOT embedded into the exe: Bun's
 * bundler can't follow pcsc-mini's dynamic require(), and statically importing
 * the .node here causes it to be dlopen'd twice (once at startup, once by
 * pcsc-mini's loader) which crashes. Instead, the patched pcsc-mini loader
 * (patches/pcsc-mini@0.1.3.patch) dlopen's the addon exactly once from
 * `<exeDir>/node_modules/@pcsc-mini/<variant>/addon.node`, which scripts/build.ts
 * stages next to the executable.
 *
 * So this entry is intentionally just the normal app. It exists as a separate
 * file to keep the compile target explicit and leave room for compile-only
 * tweaks without touching the dev entry (src/index.ts).
 */

import "./index";
