import { useRef, useState } from "react";
import type { Finding, ImageMap } from "../../data/types";
import { TIER_COLOR, TIER_LABEL, tierChipText } from "../../data/tiers";
import { resolveImageUrl } from "../../data/activeSource";
import ImageOverlay from "./ImageOverlay";

const CLASS_LABELS: Record<string, string> = {
  crack: "Crack",
  spallation: "Spallation",
  exposed_bars: "Exposed bars",
  efflorescence: "Efflorescence",
  corrosion_stain: "Corrosion stain",
};

// A thumbnail that enlarges in an overlay on click. Falls back to a placeholder
// when the image is missing or fails to load. Focus returns to this button when
// the overlay closes.
function ZoomableImage({ src, alt }: { src?: string; alt: string }) {
  const [open, setOpen] = useState(false);
  const [failed, setFailed] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);

  if (!src || failed) {
    return <div className="finding-img placeholder-img">Image unavailable</div>;
  }
  return (
    <>
      <button
        type="button"
        ref={btnRef}
        className="finding-img-btn"
        onClick={() => setOpen(true)}
        aria-label={`Enlarge: ${alt}`}
      >
        <img
          className="finding-img"
          src={src}
          alt={alt}
          onError={() => setFailed(true)}
        />
      </button>
      {open && (
        <ImageOverlay
          src={src}
          alt={alt}
          onClose={() => setOpen(false)}
          returnFocusRef={btnRef}
        />
      )}
    </>
  );
}

// Shows the full image, per-class defect scores, tier, and the close-up when one exists.
export default function FindingDetail({
  finding,
  imageMap,
  structureId,
  onClose,
}: {
  finding: Finding;
  imageMap: ImageMap;
  structureId: string;
  onClose: () => void;
}) {
  const images = imageMap[structureId] ?? {};
  const fullSrc = resolveImageUrl(images[finding.image_key]);
  const closeupSrc = finding.has_closeup
    ? resolveImageUrl(images[`${finding.image_key}_closeup`])
    : undefined;

  const tierColor = TIER_COLOR[finding.tier] ?? "var(--muted)";

  const scoreRows = Object.entries(finding.scores).sort((a, b) => b[1] - a[1]);

  return (
    <section className="finding-detail">
      <div className="finding-detail-head">
        <h3 className="stats-title">Finding detail</h3>
        <button className="replay-btn" onClick={onClose} aria-label="Close finding detail">
          Close
        </button>
      </div>

      <div
        className={`finding-tier finding-tier-${finding.tier}`}
        style={{ color: tierColor }}
      >
        {tierChipText(finding.tier)} priority
      </div>

      {finding.defect_source === "mock" && (
        <p className="finding-mock-note">
          Defect result is a mock (the defect model was unavailable for this
          capture).
        </p>
      )}

      {finding.defect_source === "predict" && (
        <p className="finding-real-note">
          Real model scores on representative concrete images from the CODEBRIM
          held-out test set; not photographs of KW51. Defect images are placed at
          chosen connections for demonstration; their locations are not
          detections.
        </p>
      )}

      <div className="finding-images">
        <figure>
          <ZoomableImage
            src={fullSrc}
            alt={`Capture at connection ${finding.location_id}, ${TIER_LABEL[finding.tier]} priority`}
          />
          <figcaption className="muted">Capture</figcaption>
        </figure>
        {finding.has_closeup && (
          <figure>
            <ZoomableImage
              src={closeupSrc}
              alt={`Close-up at connection ${finding.location_id}, ${TIER_LABEL[finding.tier]} priority`}
            />
            <figcaption className="muted">Close-up</figcaption>
          </figure>
        )}
      </div>

      <div className="finding-scores">
        <span className="muted score-head">Defect scores</span>
        {scoreRows.map(([cls, score]) => (
          <div className="score-row" key={cls}>
            <span className="score-label">{CLASS_LABELS[cls] ?? cls}</span>
            <div className="score-bar">
              <div
                className="score-fill"
                style={{ width: `${Math.round(score * 100)}%` }}
              />
            </div>
            <span className="score-num">{score.toFixed(2)}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
