import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { fileURLToPath } from "node:url";
import path from "node:path";

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  ".."
);

const readRepositoryFile = (relativePath) =>
  readFile(path.join(repositoryRoot, relativePath), "utf8");

test("SharedUI remains a compatibility barrel", async () => {
  const source = await readRepositoryFile("components/ui/SharedUI.tsx");

  assert.match(source, /export \* from ["']\.\/index["'];/);
  assert.ok(source.split(/\r?\n/).length <= 10);
});

test("focused UI barrels export every legacy component", async () => {
  const expectedExports = new Map([
    ["components/ui/primitives/index.ts", [
      "Badge",
      "Button",
      "Card",
      "Select",
      "StyledInput",
      "TextArea",
    ]],
    ["components/ui/feedback/index.ts", ["Dialog", "EmptyState"]],
    ["components/ui/dashboard/index.ts", [
      "AvatarBadge",
      "DashboardGrid",
      "DashboardPanel",
      "DashboardShell",
      "SectionHeader",
      "StatCard",
    ]],
    ["components/ui/content/index.ts", ["LinkifiedText"]],
  ]);

  for (const [relativePath, names] of expectedExports) {
    const source = await readRepositoryFile(relativePath);
    for (const name of names) {
      assert.match(
        source,
        new RegExp(`export \\* from ["']\\./${name}["'];`),
        `${relativePath} must export ${name}`
      );
    }
  }
});

test("the canonical UI barrel exports each focused domain", async () => {
  const source = await readRepositoryFile("components/ui/index.ts");

  for (const domain of ["content", "dashboard", "feedback", "primitives"]) {
    assert.match(source, new RegExp(`export \\* from ["']\\./${domain}["'];`));
  }
});
