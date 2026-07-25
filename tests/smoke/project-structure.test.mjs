import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

const requiredPaths = [
  "app/api",
  "components",
  "lib",
  "models",
  "package.json",
  "package-lock.json",
  "tsconfig.json",
];

test("required production project paths exist", async () => {
  await Promise.all(requiredPaths.map((path) => access(path)));
});

test("quality scripts remain installed", async () => {
  const packageJson = JSON.parse(await readFile("package.json", "utf8"));

  assert.equal(packageJson.scripts.typecheck, "tsc --noEmit");
  assert.equal(packageJson.scripts.check, "npm run lint && npm run typecheck");
  assert.equal(packageJson.scripts.test, "node --test");
  assert.equal(packageJson.scripts["build:verify"], "next build");
});
