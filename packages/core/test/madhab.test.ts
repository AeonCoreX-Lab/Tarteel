import { test } from "node:test";
import assert from "node:assert/strict";
import { MADHABS, PREFERENCE_DEFAULTS, asrSchoolFor, madhabChoice, selectedMadhab } from "../src/index.ts";

test("four schools in the picker's order, two computed answers", () => {
  assert.deepEqual([...MADHABS], ["hanafi", "maliki", "shafii", "hanbali"]);
  assert.equal(asrSchoolFor("hanafi"), 1);
  for (const m of ["maliki", "shafii", "hanbali"] as const) assert.equal(asrSchoolFor(m), 0);
});

test("a school is only claimed while it still describes the Asr school", () => {
  assert.equal(selectedMadhab("hanafi", 1), "hanafi");
  assert.equal(selectedMadhab("shafii", 0), "shafii");
  assert.equal(selectedMadhab("hanafi", 0), null); // shadow changed by hand: the name is not claimed
  assert.equal(selectedMadhab("maliki", 1), null);
  assert.equal(selectedMadhab("maliki", null), null);
  assert.equal(selectedMadhab(null, 1), null);
  assert.equal(selectedMadhab(undefined, 0), null);
});

test("picking writes the pair; not sure clears both so the region default applies", () => {
  assert.deepEqual(madhabChoice("hanafi"), { madhab: "hanafi", asrSchool: 1 });
  assert.deepEqual(madhabChoice("hanbali"), { madhab: "hanbali", asrSchool: 0 });
  assert.deepEqual(madhabChoice(null), { madhab: null, asrSchool: null });
});

test("nobody is moved: the default is no school and no forced Asr school", () => {
  assert.equal(PREFERENCE_DEFAULTS.madhab, null);
  assert.equal(PREFERENCE_DEFAULTS.asrSchool, null);
});
