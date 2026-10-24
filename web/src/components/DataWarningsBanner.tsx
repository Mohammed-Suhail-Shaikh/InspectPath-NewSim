import { useDataWarnings } from "../data/dataWarnings";

// Shows contract-validation and fallback warnings clearly, so the dashboard
// never silently guesses when a real data file is malformed.
export default function DataWarningsBanner() {
  const warnings = useDataWarnings();
  if (warnings.length === 0) return null;

  return (
    <div className="data-warnings" role="alert">
      <strong>Data warning</strong>
      <ul>
        {warnings.map((w, i) => (
          <li key={i}>
            <span className="data-warning-piece">{w.piece}</span>: {w.message}
          </li>
        ))}
      </ul>
    </div>
  );
}
