import { test } from "node:test";
import assert from "node:assert/strict";
import { appendFileSync, existsSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import type { UpstreamConfig } from "./lib.ts";
import { DetachedError, LicenseChangedError, detach, diffAgainstUpstream, readLock, resolveClosure, status, sync, verify } from "./lib.ts";

function write(root: string, rel: string, text: string) {
  mkdirSync(dirname(join(root, rel)), { recursive: true });
  writeFileSync(join(root, rel), text);
}
function fakeUpstream() {
  const r = mkdtempSync(join(tmpdir(), "up-"));
  write(r, "package.json", JSON.stringify({ version: "9.9.9", dependencies: { adhan: "^4.4.3" } }));
  write(r, "LICENSE", "AGPL text");
  write(r, "NOTICE", "notice v1");
  write(r, "src/a.ts", "import { b } from './lib/b';\nimport type { T } from './types';\nimport { calc } from 'adhan';\nexport const a = b + calc;\n");
  write(r, "src/lib/b.ts", "import data from '../data.json';\nexport const b = data.x;\n");
  write(r, "src/data.json", '{"x":1}');
  write(r, "src/types.ts", "export interface T { x: number }\n");
  write(r, "src/unrelated.ts", "export const nope = 1;\n");
  return r;
}
const cfg = (dest: string): UpstreamConfig => ({
  repo: "https://example.org/up", branch: "main", license: "AGPL-3.0-or-later",
  licenseFiles: ["LICENSE", "NOTICE"], destination: dest, entries: ["src/a.ts"],
});
const dest = () => join(mkdtempSync(join(tmpdir(), "dest-")), "mihrab");

test("closure follows runtime, type-only and json imports, and ignores unrelated files", () => {
  const { files, external } = resolveClosure(fakeUpstream(), ["src/a.ts"]);
  assert.deepEqual(files, ["src/a.ts", "src/data.json", "src/lib/b.ts", "src/types.ts"]);
  assert.deepEqual(Object.keys(external), ["adhan"]);
});

test("unresolvable relative imports fail loudly", () => {
  const r = fakeUpstream();
  write(r, "src/bad.ts", "import x from './missing';\n");
  assert.throws(() => resolveClosure(r, ["src/bad.ts"]), /Unresolved/);
});

test("sync vendors the closure with hashes, licence files and external versions", () => {
  const up = fakeUpstream();
  const d = dest();
  const lock = sync({ name: "t", cfg: cfg(d), srcRoot: up, destRoot: d, sha: "abc", source: "test", now: () => "2026-01-01T00:00:00Z" });
  assert.equal(lock.sha, "abc");
  assert.equal(Object.keys(lock.files).length, 4);
  assert.deepEqual(lock.externalDependencies, { adhan: "^4.4.3" });
  assert.equal(lock.upstreamPackageVersion, "9.9.9");
  assert.deepEqual(verify(d), []);
  assert.deepEqual(readLock(d)?.files, lock.files);
});

test("verify catches edits, deletions and stray files", () => {
  const up = fakeUpstream();
  const d = dest();
  sync({ name: "t", cfg: cfg(d), srcRoot: up, destRoot: d, sha: null, source: "s" });
  appendFileSync(join(d, "src/lib/b.ts"), "// local tweak\n");
  write(d, "src/extra.ts", "x");
  write(d, "UPSTREAM-LICENSES/LICENSE", "tampered");
  const problems = verify(d).join("\n");
  assert.match(problems, /modified: src\/lib\/b\.ts/);
  assert.match(problems, /unexpected file: src\/extra\.ts/);
  assert.match(problems, /modified licence file: LICENSE/);
});

test("a changed upstream licence blocks sync unless explicitly accepted", () => {
  const up = fakeUpstream();
  const d = dest();
  sync({ name: "t", cfg: cfg(d), srcRoot: up, destRoot: d, sha: "1", source: "s" });
  write(up, "LICENSE", "SOME OTHER LICENSE");
  assert.throws(() => sync({ name: "t", cfg: cfg(d), srcRoot: up, destRoot: d, sha: "2", source: "s" }), LicenseChangedError);
  assert.equal(readLock(d)?.sha, "1"); // nothing was overwritten
  sync({ name: "t", cfg: cfg(d), srcRoot: up, destRoot: d, sha: "2", source: "s", acceptLicenseChange: true });
  assert.equal(readLock(d)?.sha, "2");
});

test("diff reports changed, added and removed files plus dependency bumps, without writing", () => {
  const up = fakeUpstream();
  const d = dest();
  sync({ name: "t", cfg: cfg(d), srcRoot: up, destRoot: d, sha: "1", source: "s" });
  write(up, "src/types.ts", "export interface T { x: number; y: string }\n");
  write(up, "src/lib/c.ts", "export const c = 1;\n");
  write(up, "src/lib/b.ts", "import data from '../data.json';\nimport { c } from './c';\nexport const b = data.x + c;\n");
  write(up, "package.json", JSON.stringify({ version: "10.0.0", dependencies: { adhan: "^5.0.0" } }));
  const diff = diffAgainstUpstream(cfg(d), up, d);
  assert.deepEqual(diff.added, ["src/lib/c.ts"]);
  assert.deepEqual(diff.changed.map((c) => c.file).sort(), ["src/lib/b.ts", "src/types.ts"]);
  assert.deepEqual(diff.externalChanged, { adhan: { from: "^4.4.3", to: "^5.0.0" } });
  assert.deepEqual(verify(d), []); // destination untouched
});

// ---------------------------------------------------------------- files mode (Kotlin, XML, ...)
function fakeAndroidUpstream() {
  const r = mkdtempSync(join(tmpdir(), "upk-"));
  write(r, "LICENSE", "AGPL text");
  write(r, "android/app/src/main/java/com/x/Alarm.kt", "package com.x\nclass Alarm\n");
  write(r, "android/app/src/main/java/com/x/Svc.kt", "package com.x\nclass Svc\n");
  write(r, "android/app/src/main/java/com/x/Unrelated.kt", "package com.x\nclass Unrelated\n");
  return r;
}
const filesCfg = (dest: string): UpstreamConfig => ({
  repo: "https://example.org/up", branch: "main", license: "AGPL-3.0-or-later", licenseFiles: ["LICENSE"], destination: dest,
  mode: "files",
  entries: ["android/app/src/main/java/com/x/Alarm.kt", "android/app/src/main/java/com/x/Svc.kt"],
});

test("files mode vendors exactly the listed files, verbatim, with their path preserved", () => {
  const up = fakeAndroidUpstream();
  const d = dest();
  const lock = sync({ name: "k", cfg: filesCfg(d), srcRoot: up, destRoot: d, sha: "s1", source: "t" });
  assert.equal(lock.mode, "files");
  assert.deepEqual(Object.keys(lock.files).sort(), ["android/app/src/main/java/com/x/Alarm.kt", "android/app/src/main/java/com/x/Svc.kt"]);
  assert.deepEqual(lock.externalDependencies, {});
  assert.ok(existsSync(join(d, "files/android/app/src/main/java/com/x/Alarm.kt")));
  assert.ok(!existsSync(join(d, "files/android/app/src/main/java/com/x/Unrelated.kt")));
  assert.deepEqual(verify(d), []);
});

test("files mode: verify catches edits and stray files; diff reports changes; missing entries fail loudly", () => {
  const up = fakeAndroidUpstream();
  const d = dest();
  sync({ name: "k", cfg: filesCfg(d), srcRoot: up, destRoot: d, sha: "s1", source: "t" });
  write(up, "android/app/src/main/java/com/x/Svc.kt", "package com.x\nclass Svc2\n");
  const diff = diffAgainstUpstream(filesCfg(d), up, d);
  assert.deepEqual(diff.changed.map((c) => c.file), ["android/app/src/main/java/com/x/Svc.kt"]);
  assert.deepEqual(verify(d), []);
  appendFileSync(join(d, "files/android/app/src/main/java/com/x/Alarm.kt"), "// local edit\n");
  write(d, "files/extra.kt", "x");
  const problems = verify(d).join("\n");
  assert.match(problems, /modified: android\/app\/src\/main\/java\/com\/x\/Alarm\.kt/);
  assert.match(problems, /unexpected file: files\/extra\.kt/);
  assert.throws(() => sync({ name: "k", cfg: { ...filesCfg(d), entries: ["nope.kt"] }, srcRoot: up, destRoot: d, sha: null, source: "t" }), /not found/);
});

test("a closure file outside src/ keeps its place, so relative imports keep resolving", () => {
  const up = fakeUpstream();
  write(up, "src/hijri/cal.ts", "import o from '../../data/hijri/v1/overrides.json';\nexport const c = o.v;\n");
  write(up, "data/hijri/v1/overrides.json", '{"v":1}');
  const d = dest();
  const c = { ...cfg(d), entries: ["src/a.ts", "src/hijri/cal.ts"] };
  const lock = sync({ name: "t", cfg: c, srcRoot: up, destRoot: d, sha: "1", source: "s" });
  assert.ok(existsSync(join(d, "src/hijri/cal.ts")));
  assert.ok(existsSync(join(d, "data/hijri/v1/overrides.json")), "next to src/, exactly where '../../data/...' points");
  assert.ok(!existsSync(join(d, "src/data/hijri/v1/overrides.json")), "not folded into src/");
  assert.ok("data/hijri/v1/overrides.json" in lock.files);
  assert.deepEqual(verify(d), []);
  // verify sees edits and strays in that folder too
  appendFileSync(join(d, "data/hijri/v1/overrides.json"), " ");
  write(d, "data/stray.json", "{}");
  const problems = verify(d).join("\n");
  assert.match(problems, /modified: data\/hijri\/v1\/overrides\.json/);
  assert.match(problems, /unexpected file: data\/stray\.json/);
});

test("a re-sync removes a data folder upstream no longer needs", () => {
  const up = fakeUpstream();
  write(up, "src/hijri/cal.ts", "import o from '../../data/x.json';\nexport const c = o;\n");
  write(up, "data/x.json", "{}");
  const d = dest();
  sync({ name: "t", cfg: { ...cfg(d), entries: ["src/a.ts", "src/hijri/cal.ts"] }, srcRoot: up, destRoot: d, sha: "1", source: "s" });
  assert.ok(existsSync(join(d, "data/x.json")));
  sync({ name: "t", cfg: cfg(d), srcRoot: up, destRoot: d, sha: "2", source: "s" });
  assert.ok(!existsSync(join(d, "data")), "stale data/ folder is gone");
  assert.deepEqual(verify(d), []);
});

test("closure files that would land on the destination root or a tool-owned folder are refused", () => {
  const up = fakeUpstream();
  write(up, "src/c.ts", "import p from '../package.json';\nexport const c = p;\n");
  const d = dest();
  assert.throws(() => sync({ name: "t", cfg: { ...cfg(d), entries: ["src/c.ts"] }, srcRoot: up, destRoot: d, sha: null, source: "s" }), /Cannot vendor "package\.json"/);
});

test("detach: the code may be edited freely, a sync is refused, and status lists what Tarteel changed", () => {
  const up = fakeUpstream();
  const d = dest();
  sync({ name: "t", cfg: cfg(d), srcRoot: up, destRoot: d, sha: "abc123", source: "s" });
  const lock = detach(d, { reason: "ours now", now: () => "2026-10-20T00:00:00.000Z" });
  assert.deepEqual(lock.detached, { at: "2026-10-20T00:00:00.000Z", baselineSha: "abc123", reason: "ours now" });
  assert.deepEqual(status(d), { modified: [], deleted: [], added: [] });

  appendFileSync(join(d, "src/lib/b.ts"), "// our fix\n");
  write(d, "src/extra.ts", "export const mine = 1;\n");
  write(d, "CHANGES.md", "# Changes\n");
  assert.deepEqual(verify(d), [], "edits, new files and CHANGES.md are fine");
  assert.deepEqual(status(d), { modified: ["src/lib/b.ts"], deleted: [], added: ["src/extra.ts"] });

  assert.throws(() => sync({ name: "t", cfg: cfg(d), srcRoot: up, destRoot: d, sha: null, source: "s" }), DetachedError);
  assert.throws(() => sync({ name: "t", cfg: { ...cfg(join(d, "..", "other")), detached: true }, srcRoot: up, destRoot: join(d, "..", "other"), sha: null, source: "s" }), DetachedError, "the config flag alone also blocks a sync");
  assert.equal(readLock(d)?.detached?.baselineSha, "abc123", "a refused sync changed nothing");
  assert.equal(detach(d, { reason: "again" }).detached?.reason, "ours now", "detaching twice keeps the first record");
});

test("detach: the upstream licence files and CHANGES.md must stay", () => {
  const up = fakeUpstream();
  const d = dest();
  sync({ name: "t", cfg: cfg(d), srcRoot: up, destRoot: d, sha: null, source: "s" });
  detach(d, { reason: "r" });
  assert.match(verify(d).join("\n"), /CHANGES\.md missing/);
  write(d, "CHANGES.md", "x");
  write(d, "UPSTREAM-LICENSES/LICENSE", "tampered");
  assert.match(verify(d).join("\n"), /modified licence file: LICENSE/);
  const mid = dest();
  sync({ name: "t", cfg: cfg(mid), srcRoot: up, destRoot: mid, sha: null, source: "s" });
  detach(mid, { reason: "r" });
  write(mid, "CHANGES.md", "x");
  appendFileSync(join(mid, "src/a.ts"), "// ours\n");
  assert.deepEqual(verify(mid), []);
});

test("diff on a detached folder shows what upstream changed since the baseline, not Tarteel's own edits", () => {
  const up = fakeUpstream();
  const d = dest();
  sync({ name: "t", cfg: cfg(d), srcRoot: up, destRoot: d, sha: null, source: "s" });
  detach(d, { reason: "r" });
  appendFileSync(join(d, "src/types.ts"), "// our own edit\n");
  assert.deepEqual(diffAgainstUpstream({ ...cfg(d), detached: true }, up, d).changed, [], "our edit is not an upstream change");
  appendFileSync(join(up, "src/lib/b.ts"), "// upstream moved on\n");
  const diff = diffAgainstUpstream({ ...cfg(d), detached: true }, up, d);
  assert.deepEqual(diff.changed.map((c) => c.file), ["src/lib/b.ts"]);
});
