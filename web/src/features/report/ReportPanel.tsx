import { useEffect, useState } from "react";
import { mockSource } from "../../data/mockSource";
import type { Finding } from "../../data/types";
import { useViewState } from "../../app/viewState";
import { useReport } from "./useReport";

const STRUCTURE_ID = "bridge-a";

// Generates a plain-language inspection report from findings + alert history.
// Works in a mock/demo mode when no LLM key is configured.
export default function ReportPanel() {
  const { alertHistory } = useViewState();
  const [findings, setFindings] = useState<Finding[]>([]);
  const { report, status, notice, run } = useReport();

  useEffect(() => {
    let active = true;
    mockSource.getFindings(STRUCTURE_ID).then((f) => {
      if (active) setFindings(f);
    });
    return () => {
      active = false;
    };
  }, []);

  return (
    <section className="report-panel">
      <div className="report-head">
        <div>
          <h2 className="view-title">Inspection report</h2>
          <p className="muted">
            Generates a plain-language summary from the findings and alert history.
          </p>
        </div>
        <button
          className="dispatch-btn report-generate"
          onClick={() => run(findings, alertHistory)}
          disabled={status === "loading"}
        >
          {status === "loading" ? "Generating…" : "Generate report"}
        </button>
      </div>

      {notice && <p className="report-notice">{notice}</p>}

      {report && (
        <div className="report-body">
          <pre className="report-text">{report.text}</pre>
        </div>
      )}
    </section>
  );
}
