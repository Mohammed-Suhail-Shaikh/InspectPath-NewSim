import type { TriggerRecord } from "../../data/types";

// Shows "node degraded" only when quality is degraded.
// Never presented as a statement about bridge safety.
export default function QualityBadge({
  quality,
}: {
  quality: TriggerRecord["quality"];
}) {
  if (quality !== "degraded") return null;
  return (
    <span className="quality-badge" title="Sensor data quality is reduced for this window">
      Node degraded
    </span>
  );
}
