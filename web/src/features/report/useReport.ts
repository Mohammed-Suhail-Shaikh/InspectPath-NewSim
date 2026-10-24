import { useState } from "react";
import { generateReport } from "./llmClient";
import type { Finding, AlertHistoryEntry, InspectionReport } from "../../data/types";

type Status = "idle" | "loading" | "done" | "error";

export function useReport() {
  const [report, setReport] = useState<InspectionReport | null>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [notice, setNotice] = useState<string | null>(null);

  async function run(findings: Finding[], alertHistory: AlertHistoryEntry[]) {
    setStatus("loading");
    setNotice(null);
    try {
      const result = await generateReport({ findings, alertHistory });
      setReport(result);
      setStatus("done");
      if (result.source === "mock") {
        setNotice(
          "Showing a sample report. Connect an LLM key (VITE_LLM_API_KEY) for a live summary."
        );
      }
    } catch {
      setStatus("error");
      setNotice("Could not generate a report. Please try again.");
    }
  }

  return { report, status, notice, run };
}
