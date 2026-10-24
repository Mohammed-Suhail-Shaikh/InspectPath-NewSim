import type { Finding, AlertHistoryEntry, InspectionReport } from "../../data/types";
import { mockSource } from "../../data/mockSource";

export interface ReportRequest {
  findings: Finding[];
  alertHistory: AlertHistoryEntry[];
}

// System guidance enforcing the product's honesty rules.
const SYSTEM_PROMPT =
  "You write short, plain-language bridge inspection summaries for non-specialists. " +
  "Use only the findings and alert history provided. Do not invent measurements or numbers. " +
  "Never state whether the bridge is safe or unsafe; the tiers and alert levels are " +
  "demonstration estimates that help prioritize, not engineering ratings. " +
  "Prioritize high-tier findings first.";

function buildUserPrompt(req: ReportRequest): string {
  return [
    "Alert history (oldest first):",
    JSON.stringify(req.alertHistory),
    "",
    "Findings:",
    JSON.stringify(req.findings),
    "",
    "Write a prioritized, plain-language inspection summary.",
  ].join("\n");
}

// Attempts a real LLM call when a key is configured; otherwise (or on any
// failure) resolves to the mock report so the feature works without a key.
export async function generateReport(
  req: ReportRequest
): Promise<InspectionReport> {
  const apiKey = import.meta.env.VITE_LLM_API_KEY as string | undefined;

  if (!apiKey) {
    return mockSource.getDemoReport();
  }

  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: buildUserPrompt(req) },
        ],
        temperature: 0.3,
      }),
    });

    if (!res.ok) throw new Error(`LLM request failed: ${res.status}`);

    const data = await res.json();
    const text: string | undefined = data?.choices?.[0]?.message?.content;
    if (!text) throw new Error("LLM response had no content");

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
