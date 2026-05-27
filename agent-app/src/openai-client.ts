import OpenAI from "openai";

export const OPENAI_MODEL = process.env.OPENAI_MODEL ?? "gpt-4o-mini";

export function getOpenAI() {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    throw new Error(
      "OPENAI_API_KEY is not set. Add it to agent-app/.env (see .env.example)."
    );
  }

  const baseURL = process.env.OPENAI_BASE_URL;

  return new OpenAI({
    apiKey,
    baseURL: baseURL || undefined,
  });
}
