import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createRequire } from "node:module";

const root = new URL("../", import.meta.url).pathname;
const require = createRequire(import.meta.url);
const ts = require("typescript");

async function loadEligibilityModule() {
  const source = readFileSync(join(root, "lib/mentor/eligibility.ts"), "utf8");
  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ES2022,
      importsNotUsedAsValues: ts.ImportsNotUsedAsValues.Remove,
    },
  }).outputText;
  return import(`data:text/javascript;base64,${Buffer.from(transpiled).toString("base64")}`);
}

const emptySnapshot = {
  observationDays: 0,
  studyMinutes: 0,
  timedSessions: 0,
  completedChapters: 0,
  revisionEvents: 0,
  tests: 0,
  distinctSubjects: 0,
  cohortSampleSize: 0,
};

test("newly onboarded students never receive personalised intelligence", async () => {
  const { DEFAULT_PERSONALIZATION_RULES, evaluatePersonalizationEligibility, chooseStudentIntelligence } = await loadEligibilityModule();
  const decision = evaluatePersonalizationEligibility(DEFAULT_PERSONALIZATION_RULES.pace_estimate, emptySnapshot);

  assert.equal(decision.state, "unavailable");
  assert.equal(decision.canExposePersonalizedData, false);
  assert.equal(chooseStudentIntelligence("preprocessed baseline", "fake personal pace", decision), "preprocessed baseline");
});

test("an early estimate remains hidden until all metric requirements are met", async () => {
  const { DEFAULT_PERSONALIZATION_RULES, evaluatePersonalizationEligibility, chooseStudentIntelligence } = await loadEligibilityModule();
  const decision = evaluatePersonalizationEligibility(DEFAULT_PERSONALIZATION_RULES.pace_estimate, {
    ...emptySnapshot,
    observationDays: 3,
    studyMinutes: 150,
    timedSessions: 4,
  });

  assert.equal(decision.state, "early_estimate");
  assert.equal(decision.canExposePersonalizedData, false);
  assert.equal(chooseStudentIntelligence(180, 145, decision), 180);
});

test("sufficient related evidence unlocks only the evaluated metric", async () => {
  const { DEFAULT_PERSONALIZATION_RULES, evaluatePersonalizationEligibility } = await loadEligibilityModule();
  const snapshot = {
    ...emptySnapshot,
    observationDays: 7,
    studyMinutes: 300,
    timedSessions: 7,
  };

  const pace = evaluatePersonalizationEligibility(DEFAULT_PERSONALIZATION_RULES.pace_estimate, snapshot);
  const weakArea = evaluatePersonalizationEligibility(DEFAULT_PERSONALIZATION_RULES.weak_area, snapshot);

  assert.equal(pace.state, "personalized");
  assert.equal(pace.canExposePersonalizedData, true);
  assert.equal(weakArea.canExposePersonalizedData, false);
  assert.notEqual(weakArea.state, "personalized");
});

test("similar-student intelligence remains locked until the future cohort sample is meaningful", async () => {
  const { DEFAULT_PERSONALIZATION_RULES, evaluatePersonalizationEligibility } = await loadEligibilityModule();
  const decision = evaluatePersonalizationEligibility(DEFAULT_PERSONALIZATION_RULES.similar_students, {
    observationDays: 30,
    studyMinutes: 2000,
    timedSessions: 40,
    completedChapters: 20,
    revisionEvents: 10,
    tests: 10,
    distinctSubjects: 6,
    cohortSampleSize: 25,
  });

  assert.equal(decision.canExposePersonalizedData, false);
  assert.match(decision.unmetRequirements.join(" "), /cohortSampleSize/);
});
