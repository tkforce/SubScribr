// Human-readable progress text for each agent tool, shown in the streaming
// progress line of the analysis section as the agent calls tools.

const TOOL_LABELS: Record<string, string> = {
  query_subscriptions: "Reading your subscriptions…",
  calculate_trend: "Calculating spend trend…",
  detect_anomalies: "Scanning for anomalies…",
  get_service_info: "Looking up service pricing…",
};

export function toolProgressLabel(toolName: string): string {
  return TOOL_LABELS[toolName] ?? "Analyzing…";
}
