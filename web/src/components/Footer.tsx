import { mockSource } from "../data/mockSource";

// Shown when running on real sensor data.
export const DISCLAIMER =
  "Simulation with real bridge data. Alerts and severity are estimates, not engineering ratings.";

// Shown while the data source is mock/sample data, so we never claim real data.
export const MOCK_DISCLAIMER =
  "Sample data for demonstration. Alerts and severity are estimates, not engineering ratings.";

export default function Footer() {
  const text = mockSource.isMock ? MOCK_DISCLAIMER : DISCLAIMER;
  return (
    <footer className="app-footer" role="contentinfo">
      <p>{text}</p>
    </footer>
  );
}
