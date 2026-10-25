import { test } from "node:test";
import assert from "node:assert/strict";
import { SOURCE_PROVIDERS, providersFor } from "../src/index.ts";
import type { PreferenceSchema } from "../src/index.ts";
import { PREFERENCE_DEFAULTS } from "../src/index.ts";

test("every source has facts in both languages and a unique id", () => {
  const ids = SOURCE_PROVIDERS.map((p) => p.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const p of SOURCE_PROVIDERS) {
    assert.ok(p.name.en && p.name.bn && p.about.en && p.about.bn && p.sends.en && p.sends.bn, p.id);
    assert.ok(p.publisher && p.licence && p.siteUrl.startsWith("https://"), p.id);
  }
});

test("a live source has a setting that is off by default; a pack has none", () => {
  for (const p of SOURCE_PROVIDERS) {
    if (p.mode === "live") {
      assert.ok(p.settingKey, p.id);
      assert.equal(PREFERENCE_DEFAULTS[p.settingKey as keyof PreferenceSchema], false, `${p.id} is off until the person turns it on`);
    } else assert.equal(p.settingKey, null, p.id);
  }
});

test("Sunnah.com stays marked as awaiting permission; the domains split as the screens expect", () => {
  assert.equal(SOURCE_PROVIDERS.find((p) => p.id === "sunnah")?.status, "pending-permission");
  assert.ok(providersFor("hadith").some((p) => p.id === "hadeethenc"));
  assert.ok(providersFor("history").some((p) => p.id === "wikipedia"));
  assert.ok(providersFor("history").some((p) => p.id === "quranenc"));
  assert.ok(providersFor("history").some((p) => p.id === "quranpedia"));
  assert.ok(!providersFor("history").some((p) => p.id === "sunnah"));
});
