import { test } from "node:test";
import assert from "node:assert/strict";
import { nextStep, previousStep, setupProgress, setupSteps } from "../src/index.ts";

const none = { hasLocation: false, hasTranslations: false };
const all = { hasLocation: true, hasTranslations: true };

test("step list adapts to what exists", () => {
  assert.deepEqual(setupSteps(none), ["welcome", "language", "location", "madhab", "ready"]);
  assert.deepEqual(setupSteps({ hasLocation: true, hasTranslations: false }), ["welcome", "language", "location", "method", "madhab", "ready"]);
  assert.deepEqual(setupSteps(all), ["welcome", "language", "location", "method", "madhab", "translation", "ready"]);
  assert.deepEqual(setupSteps({ hasLocation: false, hasTranslations: true }), ["welcome", "language", "location", "madhab", "translation", "ready"]);
});

test("skipping location goes straight past the method step, but the school is still asked", () => {
  assert.equal(nextStep("location", { hasLocation: false, hasTranslations: true }), "madhab");
  assert.equal(nextStep("location", none), "madhab");
  assert.equal(nextStep("madhab", none), "ready");
  assert.equal(nextStep("location", all), "method");
  assert.equal(nextStep("method", all), "madhab");
  assert.equal(nextStep("madhab", all), "translation");
});

test("navigation is clamped at both ends and recovers from a vanished step", () => {
  assert.equal(nextStep("ready", all), "ready");
  assert.equal(previousStep("welcome", all), "welcome");
  assert.equal(previousStep("language", all), "welcome");
  assert.equal(previousStep("translation", all), "madhab");
  assert.equal(previousStep("madhab", all), "method");
  assert.equal(previousStep("madhab", none), "location");
  assert.equal(previousStep("ready", none), "madhab");
  assert.equal(nextStep("method", none), "location"); // location was cleared while on "method"
});

test("progress ignores the greeting and the summary", () => {
  assert.equal(setupProgress("welcome", all), null);
  assert.equal(setupProgress("language", all), null);
  assert.equal(setupProgress("ready", all), null);
  assert.deepEqual(setupProgress("location", all), { now: 1, total: 4 });
  assert.deepEqual(setupProgress("madhab", all), { now: 3, total: 4 });
  assert.deepEqual(setupProgress("translation", all), { now: 4, total: 4 });
  assert.deepEqual(setupProgress("location", none), { now: 1, total: 2 });
});
