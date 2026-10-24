import type { Finding, AlertHistoryEntry, InspectionReport } from "../../data/types";
import { mockSource } from "../../data/mockSource";

export interface ReportRequest {
  findings: Finding[];
  alertHistory: AlertHistoryEntry[];
}

// API base URL (not a secret — just where our backend lives).
const API_BASE_URL =
  (import.meta.env.VITE_API_BASE_URL as string | undefined) ??
  "http://localhost:8000";

// Returns true if the report backend is reachable and reports healthy.
// Used to decide whether to offer the optional "AI summary" toggle.
export async function isBackendReachable(): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE_URL}/health`, { method: "GET" });
    return res.ok;
  } catch {
    return false;
  }
}

// Calls our backend /report endpoint, which holds the LLM credential
// server-side. On any failure (endpoint unavailable, no credential, error),
// falls back to the mock report so the feature works without a backend.
export async function generateReport(
  req: ReportRequest
): Promise<InspectionReport> {
  try {
    const res = await fetch(`${API_BASE_URL}/report`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req),
    });

    if (!res.ok) throw new Error(`Report request failed: ${res.status}`);

    const data = await res.json();
    const text: string | undefined = data?.text;
    if (!text) throw new Error("Report response had no content");

    return {
      text,
      generatedAt: new Date().toISOString(),
      source: "llm",
    };
  } catch {
    // Fall back to the mock report rather than crashing.
    return mockSource.getDemoReport();
  }
}
