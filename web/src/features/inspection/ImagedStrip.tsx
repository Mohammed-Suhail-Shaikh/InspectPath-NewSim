import type { Finding, ImageMap } from "../../data/types";
import { TIER_COLOR, TIER_LABEL } from "../../data/tiers";
import { resolveImageUrl } from "../../data/activeSource";

const CLASS_LABELS: Record<string, string> = {
  crack: "crack",
  spallation: "spallation",
  exposed_bars: "exposed bars",
  efflorescence: "efflorescence",
  corrosion_stain: "corrosion stain",
};

const TIER_LETTER: Record<string, string> = {
  high: "H",
  medium: "M",
  low: "L",
  none: "",
};

// Top 1-2 scored classes as plain text (never color-alone), e.g.
// "spallation 0.98, exposed bars 0.66".
function topScores(finding: Finding, n = 2): string {
  return Object.entries(finding.scores)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([cls, s]) => `${CLASS_LABELS[cls] ?? cls} ${s.toFixed(2)}`)
    .join(", ");
}

function TierChip({ tier }: { tier: Finding["tier"] }) {
  const color = TIER_COLOR[tier];
  if (!color) return null;
  const isLow = tier === "low";
  return (
    <span
      className="imaged-tier-chip"
      style={{
        background: isLow ? "#f5e8b8" : color,
        color: isLow ? "#806500" : "#ffffff",
      }}
    >
      {/* letter + word so the chip never relies on color alone */}
      {TIER_LETTER[tier]} {TIER_LABEL[tier]}
    </span>
  );
}

// A persistent, always-visible strip of the imaged connections. Each card shows
// the capture image, the connection id + side, the tier (letter + word), the top
// scores, and whether the result is real or a mock fallback. Clicking a card
// selects that finding (same selection the pins drive), opening the full detail.
// The honesty label is shown ONCE in the header, not per card.
export default function ImagedStrip({
  findings,
  imageMap,
  structureId,
  selectedFindingId,
  onSelect,
}: {
  findings: Finding[];
  imageMap: ImageMap;
  structureId: string;
  selectedFindingId: string | null;
  onSelect: (id: string) => void;
}) {
  if (findings.length === 0) return null;
  const images = imageMap[structureId] ?? {};
  const anyReal = findings.some((f) => f.defect_source === "predict");

  return (
    <section className="imaged-strip" aria-label="Imaged connections">
      <div className="imaged-strip-head">
        <h3 className="stats-title">Imaged connections ({findings.length})</h3>
        <p className="stat-note muted">
          {anyReal
            ? "Real model scores on CODEBRIM held-out concrete images, placed at chosen connections for demonstration; not photographs of KW51 and not detections. Only these connections are imaged; the rest of the 34 are not assessed."
            : "Simulated defect results for demonstration. Only these connections are imaged; the rest of the 34 are not assessed."}
        </p>
      </div>

      <ul className="imaged-strip-track">
        {findings.map((f) => {
          const src = resolveImageUrl(images[f.image_key]);
          const selected = f.id === selectedFindingId;
          return (
            <li key={f.id}>
              <button
                className={"imaged-card" + (selected ? " selected" : "")}
                onClick={() => onSelect(f.id)}
                aria-pressed={selected}
                aria-label={`${TIER_LABEL[f.tier]} finding at connection ${f.location_id}, side ${f.side}`}
              >
                {src ? (
                  <img className="imaged-card-img" src={src} alt="" />
                ) : (
                  <div className="imaged-card-img placeholder-img">No image</div>
                )}
                <div className="imaged-card-body">
                  <div className="imaged-card-row">
                    <TierChip tier={f.tier} />
                    {f.defect_source === "mock" && (
                      <span className="imaged-mock-tag">mock</span>
                    )}
                  </div>
                  <span className="imaged-card-id">
                    {f.location_id} · side {f.side}
                  </span>
                  <span className="imaged-card-scores muted">{topScores(f)}</span>
                </div>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
