// Build step: write dist/package.json with only the fields the server needs at runtime.
//
// Dockerfile and lambda.Dockerfile copy ./dist and run `npm install --omit=dev`. `--omit=dev`
// skips installing devDependencies but npm still resolves them, so a peer conflict between
// devDependencies (for example vue-router wanting a newer vite than the project pins) fails the
// image build with ERESOLVE. The image never needs devDependencies, so leave them out.
//
// At runtime the server reads only `version` from this file (src/index.ts).

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, resolve } from "node:path";

const KEEP = ["name", "version", "main", "license", "dependencies"];

export function makeRuntimePackage(pkg) {
  const out = {};
  for (const k of KEEP) {
    if (pkg[k] !== undefined) out[k] = pkg[k];
  }
  return out;
}

// Write only when run directly, so tests can import the function without side effects.
const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMain) {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const pkg = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"));
  const distDir = resolve(root, "dist");
  mkdirSync(distDir, { recursive: true });
  writeFileSync(resolve(distDir, "package.json"), JSON.stringify(makeRuntimePackage(pkg), null, 2) + "\n", "utf8");
}
