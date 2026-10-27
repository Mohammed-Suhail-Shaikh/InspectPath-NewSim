import { useRef, useState } from "react";
import type { Finding, ImageMap } from "../../data/types";
import { TIER_COLOR, TIER_LABEL, tierChipText } from "../../data/tiers";
import { resolveImageUrl } from "../../data/activeSource";
import ImageOverlay from "./ImageOverlay";

const CLASS_LABELS: Record<string, string> = {
  crack: "crack",
  spallation: "spallation",
  exposed_bars: "exposed bars",
  efflorescence: "efflorescence",
  corrosion_stain: "corrosion stain",
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
      {/* letter-in-parens + word so the chip never relies on color alone */}
      {tierChipText(tier)}
    </span>
  );
}

// A persistent, always-visible strip of the imaged connections. Each card shows
// the capture image, the connection id + side, the tier (letter + word), the top
// scores, and whether the result is real or a mock fallback. Clicking the card
// body selects that finding (same selection the pins drive); clicking the
// thumbnail opens the image enlarged in an overlay. The honesty label is shown
// ONCE in the header, not per card.
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
  const [zoomedId, setZoomedId] = useState<string | null>(null);
  // Ref to the thumbnail that opened the overlay, so focus returns there.
  const thumbRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  if (findings.length === 0) return null;
  const images = imageMap[structureId] ?? {};
  const anyReal = findings.some((f) => f.defect_source === "predict");

  const zoomed = findings.find((f) => f.id === zoomedId) ?? null;
  const zoomedSrc = zoomed
    ? resolveImageUrl(images[zoomed.image_key])
    : undefined;

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
          const imgAlt = `Defect image at connection ${f.location_id}, ${TIER_LABEL[f.tier]} priority`;
          return (
            <li key={f.id}>
              <div className={"imaged-card" + (selected ? " selected" : "")}>
                {src ? (
                  <button
                    type="button"
                    className="imaged-card-thumb"
                    ref={(el) => {
                      thumbRefs.current[f.id] = el;
                    }}
                    onClick={() => setZoomedId(f.id)}
                    aria-label={`Enlarge image at connection ${f.location_id}`}
                  >
                    <img className="imaged-card-img" src={src} alt={imgAlt} />
                  </button>
                ) : (
                  <div className="imaged-card-img placeholder-img">No image</div>
                )}
                <button
                  type="button"
                  className="imaged-card-body"
                  onClick={() => onSelect(f.id)}
                  aria-pressed={selected}
                  aria-label={`${TIER_LABEL[f.tier]} finding at connection ${f.location_id}, side ${f.side}`}
                >
                  <span className="imaged-card-row">
                    <TierChip tier={f.tier} />
                    {f.defect_source === "mock" && (
                      <span className="imaged-mock-tag">mock</span>
                    )}
                  </span>
                  <span className="imaged-card-id">
                    {f.location_id} · side {f.side}
                  </span>
                  <span className="imaged-card-scores muted">{topScores(f)}</span>
                </button>
              </div>
            </li>
          );
        })}
      </ul>

      {zoomed && zoomedSrc && (
        <ImageOverlay
          src={zoomedSrc}
          alt={`Defect image at connection ${zoomed.location_id}, ${TIER_LABEL[zoomed.tier]} priority`}
          onClose={() => setZoomedId(null)}
          returnFocusRef={{ current: thumbRefs.current[zoomed.id] ?? null }}
        />
      )}
    </section>
  );
}
