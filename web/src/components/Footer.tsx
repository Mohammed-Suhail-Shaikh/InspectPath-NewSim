export const DISCLAIMER =
  "Simulation with real bridge data. Alerts and severity are estimates, not engineering ratings.";

export default function Footer() {
  return (
    <footer className="app-footer" role="contentinfo">
      <p>{DISCLAIMER}</p>
    </footer>
  );
}
