/**
 * First-run Setup flow: order and progress, kept pure so a test can hold the order still.
 * Starts with the brand intro carousel ("welcome"). Differs from Mihrab's on purpose: location is OPTIONAL (Quran works without it), and there is a
 * Quran-translation step.
 */
export type SetupStepId = "welcome" | "language" | "location" | "method" | "translation" | "ready";

export interface SetupContext {
  /** A valid location has been set (GPS or manual). */
  hasLocation: boolean;
  /** At least one translation is installed. */
  hasTranslations: boolean;
}

export function setupSteps(ctx: SetupContext): SetupStepId[] {
  const steps: SetupStepId[] = ["welcome", "language", "location"];
  if (ctx.hasLocation) steps.push("method"); // choosing a method only makes sense once there is a place
  if (ctx.hasTranslations) steps.push("translation");
  steps.push("ready");
  return steps;
}

export function nextStep(current: SetupStepId, ctx: SetupContext): SetupStepId {
  const steps = setupSteps(ctx);
  const i = steps.indexOf(current);
  // If the current step has dropped out of the list (e.g. location was cleared on "method"), restart from location.
  if (i === -1) return "location";
  return steps[Math.min(i + 1, steps.length - 1)] as SetupStepId;
}

export function previousStep(current: SetupStepId, ctx: SetupContext): SetupStepId {
  const steps = setupSteps(ctx);
  const i = steps.indexOf(current);
  return steps[Math.max(i - 1, 0)] as SetupStepId;
}

/** The intro, language and final summary are not "questions"; progress counts only the steps in between. */
export function setupProgress(current: SetupStepId, ctx: SetupContext): { now: number; total: number } | null {
  const counted: SetupStepId[] = setupSteps(ctx).filter((s) => s !== "welcome" && s !== "language" && s !== "ready");
  const now = counted.indexOf(current) + 1;
  return now > 0 ? { now, total: counted.length } : null;
}
