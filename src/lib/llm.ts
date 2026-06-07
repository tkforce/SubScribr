import { google } from "@ai-sdk/google";
import type { LanguageModel } from "ai";

// Single source of truth for the LLM. To switch provider (OpenAI, Gemini Pro,
// local Ollama via @ai-sdk/openai-compatible), change only this function.
export function getModel(): LanguageModel {
  return google("gemini-2.5-flash-lite");
}
