import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { isStagingDir } from "./source.ts";

test("directories starting with . or _ are staging areas, not packs", () => {
  for (const name of ["_incoming", ".hidden", "_x"]) assert.equal(isStagingDir(name), true, name);
  for (const name of ["example-pack", "tafsir-notes", "a_b"]) assert.equal(isStagingDir(name), false, name);
});

test("build:pack passes quietly when data/knowledge/ holds only a staging directory (as CI saw with _incoming/)", () => {
  const root = mkdtempSync(join(tmpdir(), "tarteel-knowledge-"));
  try {
    mkdirSync(join(root, "_incoming", "some-source"), { recursive: true });
    writeFileSync(join(root, "_incoming", "some-source", "LICENSE.md"), "synthetic placeholder\n");
    const out = execFileSync(process.execPath, ["--no-warnings", "scripts/build-pack/cli.ts", "--root", root, "--out", join(root, "out")], { encoding: "utf8" });
    assert.match(out, /No knowledge packs/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
