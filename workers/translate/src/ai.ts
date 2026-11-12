import type { Env } from "./env.ts";
import { buildMessages, DEFAULT_MODEL } from "./prompt.ts";
import type { TargetLang } from "./validate.ts";

export class AiError extends Error {
  /** `busy`: the daily free allocation is used up or the service is overloaded. `failed`: anything else. */
  readonly kind: "busy" | "failed";
  constructor(kind: "busy" | "failed", message: string) {
    super(message);
    this.name = "AiError";
    this.kind = kind;
  }
}

export const modelOf = (env: Env): string => env.TRANSLATE_MODEL?.trim() || DEFAULT_MODEL;

/** The text of a Workers AI answer. Chat models answer `{ response }`; newer ones use the OpenAI shape `{ choices: [{ message: { content } }] }`. */
export function extractText(result: unknown): string | null {
  if (typeof result === "string") return result;
  if (typeof result !== "object" || result === null) return null;
  const r = result as Record<string, unknown>;
  if (typeof r["response"] === "string") return r["response"];
  const choices = r["choices"];
  if (Array.isArray(choices)) {
    const message = (choices[0] as { message?: { content?: unknown } } | undefined)?.message;
    const content = message?.content;
    if (typeof content === "string") return content;
    if (Array.isArray(content)) {
      const parts = content.map((p) => (typeof p === "string" ? p : typeof (p as { text?: unknown } | null)?.text === "string" ? (p as { text: string }).text : ""));
      const joined = parts.join("");
      return joined === "" ? null : joined;
    }
  }
  return null;
}

const BUSY = /allocation|neurons|quota|rate.?limit|capacity|overload|too many|3040|4006/i;

/** Asks the model for one translation. Temperature 0, so the same sentence gives the same answer. */
export async function translateWithAi(env: Env, text: string, to: TargetLang): Promise<string> {
  let result: unknown;
  try {
    result = await env.AI.run(modelOf(env), { messages: buildMessages(text, to), max_tokens: 1024, temperature: 0 });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    throw new AiError(BUSY.test(message) ? "busy" : "failed", message);
  }
  const out = extractText(result);
  if (out === null) throw new AiError("failed", "no text in the answer");
  return out;
}
