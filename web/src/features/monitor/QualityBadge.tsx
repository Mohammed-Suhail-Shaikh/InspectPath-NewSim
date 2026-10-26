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
      <svg
        className="quality-badge-icon"
        viewBox="0 0 16 16"
        width="14"
        height="14"
        aria-hidden="true"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {/* plug / sensor glyph */}
        <path d="M5 2v3M11 2v3" />
        <rect x="4" y="5" width="8" height="5" rx="1" />
        <path d="M8 10v4" />
      </svg>
      Node degraded
    </span>
  );
}
