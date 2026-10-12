import { test } from "node:test";
import assert from "node:assert/strict";
import { nextStep, previousStep, setupProgress, setupSteps } from "../src/index.ts";

const none = { hasLocation: false, hasTranslations: false };
const all = { hasLocation: true, hasTranslations: true };

test("step list adapts to what exists", () => {
  assert.deepEqual(setupSteps(none), ["welcome", "language", "location", "ready"]);
  assert.deepEqual(setupSteps({ hasLocation: true, hasTranslations: false }), ["welcome", "language", "location", "method", "ready"]);
  assert.deepEqual(setupSteps(all), ["welcome", "language", "location", "method", "translation", "ready"]);
  assert.deepEqual(setupSteps({ hasLocation: false, hasTranslations: true }), ["welcome", "language", "location", "translation", "ready"]);
});

test("skipping location goes straight past the method step", () => {
  assert.equal(nextStep("location", { hasLocation: false, hasTranslations: true }), "translation");
  assert.equal(nextStep("location", none), "ready");
  assert.equal(nextStep("location", all), "method");
});

test("navigation is clamped at both ends and recovers from a vanished step", () => {
  assert.equal(nextStep("ready", all), "ready");
  assert.equal(previousStep("welcome", all), "welcome");
  assert.equal(previousStep("language", all), "welcome");
  assert.equal(previousStep("translation", all), "method");
  assert.equal(previousStep("ready", none), "location");
  assert.equal(nextStep("method", none), "location"); // location was cleared while on "method"
});

test("progress ignores the greeting and the summary", () => {
  assert.equal(setupProgress("welcome", all), null);
  assert.equal(setupProgress("language", all), null);
  assert.equal(setupProgress("ready", all), null);
  assert.deepEqual(setupProgress("location", all), { now: 1, total: 3 });
  assert.deepEqual(setupProgress("translation", all), { now: 3, total: 3 });
  assert.deepEqual(setupProgress("location", none), { now: 1, total: 1 });
});
