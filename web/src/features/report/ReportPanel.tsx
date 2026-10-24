import { useEffect, useState } from "react";
import { mockSource } from "../../data/mockSource";
import type { Finding, InspectionReport, Plan, Structure } from "../../data/types";
import { useViewState } from "../../app/viewState";
import { buildRuleBasedReport } from "./ruleBasedReport";
import { isBackendReachable } from "./llmClient";
import { useReport } from "./useReport";

const STRUCTURE_ID = "bridge-a";

// Builds the inspection report. The default path is a deterministic,
// rule-based summary built entirely from the data (no LLM, no network).
// An optional "AI summary" appears only when the backend is reachable.
export default function ReportPanel() {
  const { alertHistory, selectedPlan } = useViewState();
  const [structure, setStructure] = useState<Structure | null>(null);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [findings, setFindings] = useState<Finding[]>([]);

  const [report, setReport] = useState<InspectionReport | null>(null);
  const [copied, setCopied] = useState(false);
  const [aiAvailable, setAiAvailable] = useState(false);

  // AI path (optional) reuses the existing backend client + mock fallback.
  const { report: aiReport, status: aiStatus, notice: aiNotice, run: runAi } =
    useReport();

  useEffect(() => {
    let active = true;
    mockSource.getStructure(STRUCTURE_ID).then((s) => {
      if (active) setStructure(s);
    });
    mockSource.getFindings(STRUCTURE_ID).then((f) => {
      if (active) setFindings(f);
    });
    isBackendReachable().then((ok) => {
      if (active) setAiAvailable(ok);
    });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    mockSource.getPlan(selectedPlan).then((p) => {
      if (active) setPlan(p);
    });
    return () => {
      active = false;
    };
  }, [selectedPlan]);

  // When the AI path produces a report, surface it as the active report.
  useEffect(() => {
    if (aiReport) setReport(aiReport);
  }, [aiReport]);

  function generateRuleBased() {
    if (!structure || !plan) return;
    const r = buildRuleBasedReport({
      structure,
      stats: plan.stats,
      findings,
      alertHistory,
    });
    setReport(r);
  }

  async function copyReport() {
    if (!report) return;
    try {
      await navigator.clipboard.writeText(report.text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  function downloadReport() {
    if (!report) return;
    const blob = new Blob([report.text], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "inspection-report.txt";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  const sourceLabel =
    report?.source === "rule-based"
      ? "Rule-based report"
      : report?.source === "llm"
      ? "AI summary"
      : report?.source === "mock"
      ? "Sample AI summary"
      : "";

  return (
    <section className="report-panel">
      <div className="report-head">
        <div>
          <h2 className="view-title">Inspection report</h2>
          <p className="muted">
            A plain-language summary built directly from the findings, plan
            stats, and alert history.
          </p>
        </div>
        <div className="report-buttons">
          <button
            className="dispatch-btn report-generate"
            onClick={generateRuleBased}
            disabled={!structure || !plan}
          >
            Generate report
          </button>
          {aiAvailable && (
            <button
              className="replay-btn"
              onClick={() => runAi(findings, alertHistory)}
              disabled={aiStatus === "loading"}
            >
              {aiStatus === "loading" ? "Generating…" : "AI summary"}
            </button>
          )}
        </div>
      </div>

      {aiNotice && <p className="report-notice">{aiNotice}</p>}

      {report && (
        <div className="report-body">
          {sourceLabel && <p className="report-source muted">{sourceLabel}</p>}
          <pre className="report-text">{report.text}</pre>
          <div className="report-actions">
            <button className="replay-btn" onClick={copyReport}>
              {copied ? "Copied" : "Copy"}
            </button>
            <button className="replay-btn" onClick={downloadReport}>
              Download
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
