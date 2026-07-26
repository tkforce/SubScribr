// Token usage for a two-phase agent flow (phase 1 generateText + tools,
// phase 2 generateObject). Lightweight precursor to the Week 8 AgentTrace,
// which will persist totalTokens/cost per run — for now the flows return this
// and the CLI runners print it so we can measure token cost per AI section.

export type StepBreakdown = {
  toolNames: string[];
  tokens: number;
};

export type FlowUsage = {
  phase1Tokens: number;
  phase2Tokens: number;
  totalTokens: number;
  steps: number; // phase 1 agent steps (model round-trips)
  stepBreakdown: StepBreakdown[]; // which tools ran at each step, and its cost
};

// AI SDK types usage.totalTokens as number | undefined (a provider may omit
// it). Treat missing as 0 so summing never yields NaN.
export function tokensOf(usage: { totalTokens?: number } | undefined): number {
  return usage?.totalTokens ?? 0;
}

// Minimal shape of an AI SDK StepResult we care about — avoids depending on
// the full (large, generic) SDK type just to read tool names and usage.
type StepLike = {
  toolCalls: { toolName: string }[];
  usage: { totalTokens?: number };
};

// Per-step attribution: which tools ran, and what that step cost. This is
// what makes "phase1 = 7500 tokens over 3 steps" answerable as "why" — a step
// that repeats a tool already called, or a step with an outsized token jump,
// is visible here instead of buried in a single aggregate number.
export function buildStepBreakdown(steps: StepLike[]): StepBreakdown[] {
  return steps.map((s) => ({
    toolNames: s.toolCalls.map((c) => c.toolName),
    tokens: tokensOf(s.usage),
  }));
}

export function buildFlowUsage(
  phase1Tokens: number,
  phase2Tokens: number,
  stepBreakdown: StepBreakdown[],
): FlowUsage {
  return {
    phase1Tokens,
    phase2Tokens,
    totalTokens: phase1Tokens + phase2Tokens,
    steps: stepBreakdown.length,
    stepBreakdown,
  };
}
