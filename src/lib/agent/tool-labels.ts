// Human-readable zh-TW progress text for each agent tool, shown in the
// streaming progress line of the AI dashboard sections (8a/8b) as the agent
// calls tools. Shared by both sections since they use the same four tools.

const TOOL_LABELS: Record<string, string> = {
  query_subscriptions: "查詢訂閱現況中...",
  calculate_trend: "計算花費趨勢中...",
  detect_anomalies: "偵測異常訂閱中...",
  get_service_info: "查詢服務定價資訊中...",
};

export function toolProgressLabel(toolName: string): string {
  return TOOL_LABELS[toolName] ?? "分析中...";
}
