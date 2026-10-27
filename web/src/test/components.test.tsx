import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import QualityBadge from "../features/monitor/QualityBadge";
import AlertBadge from "../features/monitor/AlertBadge";
import { alertStyle } from "../data/alertLevels";
import { TIER_COLOR } from "../data/tiers";
import FindingDetail from "../features/inspection/FindingDetail";
import StatsPanel from "../features/inspection/StatsPanel";
import ImagedStrip from "../features/inspection/ImagedStrip";
import type { Finding, ImageMap, MetricPlanStats } from "../data/types";
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

describe("StatsPanel", () => {
  const stats: MetricPlanStats = {
    locations_total: 34,
    locations_visited: 34,
    coverage_pct: 1.0,
    route_length_m: 399.8,
    route_length_note: "straight-line 3D estimate",
    energy_per_meter: 1.0,
    battery_used: 399.8,
    battery_budget: 600.0,
    battery_budget_note: "demo",
    within_budget: true,
  };
  const findings = [
    { tier: "high" },
    { tier: "medium" },
    { tier: "low" },
    { tier: "low" },
  ] as Finding[];

  it("shows connections visited, a findings tier summary, and route length", () => {
    render(<StatsPanel stats={stats} findings={findings} />);
    expect(screen.getByText("Connections visited")).toBeInTheDocument();
    expect(screen.getByText("Findings")).toBeInTheDocument();
    expect(
      screen.getByText("1 high, 1 medium, 2 low (4 imaged for demonstration)")
    ).toBeInTheDocument();
    expect(screen.getByText("399.8 m")).toBeInTheDocument();
  });

  it("does not show any battery figure", () => {
    const { container } = render(<StatsPanel stats={stats} findings={findings} />);
    expect(container.textContent).not.toMatch(/battery/i);
    expect(container.querySelector(".battery-bar")).toBeNull();
  });
});

describe("ImagedStrip", () => {
  const imageMap: ImageMap = {
    kw51: { "A-deck-105020": "images/test/defects/x.png" },
  };
  const findings = [
    {
      id: "f1",
      location_id: "A-deck-105020",
      side: "A",
      tier: "high",
      scores: {
        crack: 0.2,
        spallation: 0.98,
        exposed_bars: 0.66,
        efflorescence: 0.1,
        corrosion_stain: 0.3,
      },
      detected: ["spallation", "exposed_bars"],
      image_key: "A-deck-105020",
      has_closeup: true,
      defect_source: "predict",
    },
  ] as Finding[];

  it("shows the honesty label once and a card per imaged finding", () => {
    render(
      <ImagedStrip
        findings={findings}
        imageMap={imageMap}
        structureId="kw51"
        selectedFindingId={null}
        onSelect={() => {}}
      />
    );
    expect(screen.getByText("Imaged connections (1)")).toBeInTheDocument();
    expect(
      screen.getByText(/not photographs of KW51 and not detections/i)
    ).toBeInTheDocument();
    // tier + top score shown as text (never color-alone)
    expect(screen.getByText(/A-deck-105020 · side A/)).toBeInTheDocument();
    expect(screen.getByText(/spallation 0\.98/)).toBeInTheDocument();
    // tier chip is "(H) High" (letter-in-parens + word, never color-alone)
    expect(screen.getByText("(H) High")).toBeInTheDocument();
  });

  it("selects the finding when its card is clicked", () => {
    const onSelect = vi.fn();
    render(
      <ImagedStrip
        findings={findings}
        imageMap={imageMap}
        structureId="kw51"
        selectedFindingId={null}
        onSelect={onSelect}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: /finding at connection A-deck-105020/i }));
    expect(onSelect).toHaveBeenCalledWith("f1");
  });
});

describe("ImageOverlay", () => {
  it("renders the image with alt text and a labelled dialog", async () => {
    const { default: ImageOverlay } = await import(
      "../features/inspection/ImageOverlay"
    );
    render(
      <ImageOverlay src="/x.png" alt="Defect image at A-deck-105020, High priority" onClose={() => {}} />
    );
    expect(
      screen.getByRole("dialog", { name: /A-deck-105020, High priority/i })
    ).toBeInTheDocument();
    expect(
      screen.getByAltText("Defect image at A-deck-105020, High priority")
    ).toBeInTheDocument();
  });

  it("closes on Escape, on the close button, and on a backdrop click", async () => {
    const { default: ImageOverlay } = await import(
      "../features/inspection/ImageOverlay"
    );

    // Escape
    let onClose = vi.fn();
    const { unmount } = render(
      <ImageOverlay src="/x.png" alt="img" onClose={onClose} />
    );
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
    unmount();

    // Close button
    onClose = vi.fn();
    const r2 = render(<ImageOverlay src="/x.png" alt="img" onClose={onClose} />);
    fireEvent.click(screen.getByRole("button", { name: /close enlarged image/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
    r2.unmount();

    // Backdrop click (the dialog element itself)
    onClose = vi.fn();
    render(<ImageOverlay src="/x.png" alt="img" onClose={onClose} />);
    fireEvent.click(screen.getByRole("dialog"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe("ViewErrorBoundary", () => {
  it("shows a recoverable message instead of blanking when a child throws", async () => {
    const { default: ViewErrorBoundary } = await import(
      "../components/ViewErrorBoundary"
    );
    function Boom(): JSX.Element {
      throw new Error("kaboom");
    }
    // Silence the expected React error log for this render.
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    render(
      <ViewErrorBoundary onRestart={() => {}}>
        <Boom />
      </ViewErrorBoundary>
    );
    expect(screen.getByText(/this section hit an error/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /restart/i })).toBeInTheDocument();
    spy.mockRestore();
  });

  it("calls onRestart when the restart button is clicked", async () => {
    const { default: ViewErrorBoundary } = await import(
      "../components/ViewErrorBoundary"
    );
    function Boom(): JSX.Element {
      throw new Error("kaboom");
    }
    const onRestart = vi.fn();
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    render(
      <ViewErrorBoundary onRestart={onRestart}>
        <Boom />
      </ViewErrorBoundary>
    );
    fireEvent.click(screen.getByRole("button", { name: /restart/i }));
    expect(onRestart).toHaveBeenCalledTimes(1);
    spy.mockRestore();
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
