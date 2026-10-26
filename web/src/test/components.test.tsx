import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import QualityBadge from "../features/monitor/QualityBadge";
import AlertBadge from "../features/monitor/AlertBadge";
import { alertStyle } from "../data/alertLevels";
import { TIER_COLOR } from "../data/tiers";
import FindingDetail from "../features/inspection/FindingDetail";
import type { Finding, ImageMap } from "../data/types";
import { generateReport } from "../features/report/llmClient";

describe("QualityBadge", () => {
  it("shows 'Node degraded' only when quality is degraded", () => {
    const { rerender, container } = render(<QualityBadge quality="ok" />);
    expect(container.textContent).toBe("");
    rerender(<QualityBadge quality="degraded" />);
    expect(screen.getByText(/node degraded/i)).toBeInTheDocument();
  });
});

describe("AlertBadge", () => {
  it("renders a distinct color per alert level", () => {
    const levels = ["normal", "watch", "warning", "alarm"] as const;
    const colors = levels.map((l) => alertStyle(l).bg);
    expect(new Set(colors).size).toBe(4); // all distinct
    render(<AlertBadge level="alarm" />);
    expect(screen.getByLabelText(/alert level: alarm/i)).toBeInTheDocument();
  });
});

describe("tier colors", () => {
  it("maps high/medium/low to red/amber/yellow and none to null", () => {
    expect(TIER_COLOR.high).toBe("#c62828");
    expect(TIER_COLOR.medium).toBe("#9e5200");
    expect(TIER_COLOR.low).toBe("#806500");
    expect(TIER_COLOR.none).toBeNull();
  });
});

describe("FindingDetail", () => {
  // Metric findings: keyed to real KW51 connection ids and a side (not grid
  // waypoint_id/x/y). Reason: the Finding shape moved to metric with the map.
  const imageMap: ImageMap = {
    kw51: {
      "A-deck-105020": "images/kw51/A-deck-105020.jpg",
      "A-deck-105020_closeup": "images/kw51/A-deck-105020_closeup.jpg",
      "C-deck-106020": "images/kw51/C-deck-106020.jpg",
    },
  };

  const highWithCloseup: Finding = {
    id: "f1",
    location_id: "A-deck-105020",
    side: "A",
    tier: "high",
    scores: {
      crack: 0.74,
      spallation: 0.81,
      exposed_bars: 0.66,
      efflorescence: 0.22,
      corrosion_stain: 0.4,
    },
    detected: ["crack", "spallation", "exposed_bars"],
    image_key: "A-deck-105020",
    has_closeup: true,
  };

  const lowNoCloseup: Finding = {
    ...highWithCloseup,
    id: "f3",
    location_id: "C-deck-106020",
    side: "C",
    tier: "low",
    image_key: "C-deck-106020",
    has_closeup: false,
  };

  it("shows the full image and a close-up when one exists", () => {
    render(
      <FindingDetail
        finding={highWithCloseup}
        imageMap={imageMap}
        structureId="kw51"
        onClose={() => {}}
      />
    );
    expect(screen.getByText("Capture")).toBeInTheDocument();
    expect(screen.getByText("Close-up")).toBeInTheDocument();
    expect(screen.getByText(/high priority/i)).toBeInTheDocument();
    // all five class scores shown
    expect(screen.getByText("Exposed bars")).toBeInTheDocument();
  });

  it("shows only the full image when no close-up exists", () => {
    render(
      <FindingDetail
        finding={lowNoCloseup}
        imageMap={imageMap}
        structureId="kw51"
        onClose={() => {}}
      />
    );
    expect(screen.getByText("Capture")).toBeInTheDocument();
    expect(screen.queryByText("Close-up")).not.toBeInTheDocument();
  });

  it("shows the real-scores CODEBRIM note when defect_source is predict", () => {
    render(
      <FindingDetail
        finding={{ ...highWithCloseup, defect_source: "predict" }}
        imageMap={imageMap}
        structureId="kw51"
        onClose={() => {}}
      />
    );
    expect(
      screen.getByText(/CODEBRIM held-out test set; not photographs of KW51/i)
    ).toBeInTheDocument();
    expect(screen.queryByText(/is a mock/i)).not.toBeInTheDocument();
  });

  it("shows the mock note (not the real note) when defect_source is mock", () => {
    render(
      <FindingDetail
        finding={{ ...lowNoCloseup, defect_source: "mock" }}
        imageMap={imageMap}
        structureId="kw51"
        onClose={() => {}}
      />
    );
    expect(screen.getByText(/is a mock/i)).toBeInTheDocument();
    expect(
      screen.queryByText(/CODEBRIM held-out test set/i)
    ).not.toBeInTheDocument();
  });

  it("calls onClose when the close button is clicked", () => {
    const onClose = vi.fn();
    render(
      <FindingDetail
        finding={lowNoCloseup}
        imageMap={imageMap}
        structureId="kw51"
        onClose={onClose}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: /close finding detail/i }));
    expect(onClose).toHaveBeenCalledOnce();
  });
});

describe("report generation", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("falls back to the mock report when the API endpoint is unavailable", async () => {
    // Simulate the backend being down / unreachable.
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("network down"));
    const report = await generateReport({ findings: [], alertHistory: [] });
    expect(report.source).toBe("mock");
    expect(report.text.length).toBeGreaterThan(0);
  });

  it("falls back to the mock report when the API returns an error status", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("", { status: 503 })
    );
    const report = await generateReport({ findings: [], alertHistory: [] });
    expect(report.source).toBe("mock");
    expect(report.text.length).toBeGreaterThan(0);
  });
});
