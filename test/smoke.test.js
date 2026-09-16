// Smoke tests for @vbcdx/dsh-openrouter-credit-plugin.
// Run with: npm test  (node --test, auto-discovers test/*.test.js)

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

test("host half exports the composition plugin contract", async () => {
  const mod = await import(pathToFileURL(join(root, "lib/index.js")).href);
  assert.equal(typeof mod.apply, "function", "apply must be a function");
  assert.ok(Array.isArray(mod.inject), "inject must be an array");
  for (const name of ["webServer", "credentials", "shell"]) {
    assert.ok(mod.inject.includes(name), `inject must declare ${name}`);
  }
});

test("browser half registers under the package name", () => {
  const src = readFileSync(join(root, "lib/client.js"), "utf8");
  const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
  assert.ok(
    src.includes("window.__ModuleLoader__.load"),
    "must register via the module loader"
  );
  // The dsh web shell builds its client-module manifest rows from the PACKAGE
  // NAME, then asserts that the loaded bundle registered a factory under that
  // exact id (see @deepseek-ai/dsh-client-modules: arrive() throws
  // "loaded without registering <id> via __ModuleLoader__.load"). Deriving the
  // expectation from package.json rather than hardcoding a literal keeps the
  // two in step -- a hardcoded id is what let the mismatch ship.
  assert.ok(
    src.includes(`id: "${pkg.name}"`),
    `must register under the package name "${pkg.name}"`
  );
});

test("package manifest is installable as a DSH bundle", () => {
  const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
  assert.equal(pkg.name, "@vbcdx/dsh-openrouter-credit-plugin");
  assert.equal(pkg.dsh.plugin, true, "dsh.plugin must be true");
  assert.equal(pkg.dsh.bundle.patch, "./cordis.patch.yml");
  assert.equal(pkg.publishConfig.access, "public");
  assert.ok(pkg.files.includes(".env.example"), ".env.example must be shipped");
});

test("env example ships the documented name with a placeholder only", () => {
  const env = readFileSync(join(root, ".env.example"), "utf8");
  assert.ok(env.includes("OPENROUTER_API_KEY"), "must document the fallback name");
  assert.ok(env.includes("<your-openrouter-api-key>"), "must use a placeholder");
  assert.ok(!/[A-Za-z0-9_-]{32,}/.test(env), "must not contain real-looking secrets");
});
